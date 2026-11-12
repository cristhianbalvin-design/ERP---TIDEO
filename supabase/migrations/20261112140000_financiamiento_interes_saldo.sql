-- TIDEO ERP - Financiamiento y Deuda (PR 1 del rediseño).
--
-- Agrega la modalidad "Interés sobre saldo, sin plazo" (tipo_cuota = 'interes_saldo'):
--   cada mes, en el día de corte, se cobra tasa_mensual x saldo de capital a esa fecha;
--   el capital se amortiza en cualquier momento y por cualquier monto. No hay plazo.
--   El cronograma es rodante: existen los períodos vencidos más el siguiente por vencer.
--   Un interés impago queda como período vencido aparte (no se capitaliza).
--
-- Cambios (todos aditivos):
--   financiamientos.tasa_mensual  tasa efectiva mensual (fracción) calculada por trigger:
--                                 TEA -> (1+t)^(1/12)-1, TNA -> t/12, TEM -> t.
--                                 En la modalidad nueva, tasa_anual guarda la tasa tal como
--                                 se pactó (p. ej. 10) y tipo_tasa = 'TEM'.
--   financiamientos.cuenta_bancaria_id  cuenta real de Tesorería del préstamo.
--   tabla_amortizacion.tipo ('cuota' | 'interes') y saldo_base (saldo al corte).
--   pagos_financiamiento.cuenta_bancaria_id.
--   fin_sincronizar_periodos(id)            interno: genera/recalcula los períodos de interés.
--   sincronizar_periodos_financiamiento(e)  público: lo llama la pantalla al cargar.
--   crear_financiamiento_v2(e, datos, cuotas)  alta con cuenta real e ingreso opcional del desembolso.
--   registrar_pago_interes_saldo(e, id, datos) pago de interés, capital o ambos, calculado en el servidor.
--   registrar_pago_financiamiento / editar_financiamiento: misma firma; ahora guardan la cuenta real
--   (cuenta_bancaria_id, tc_aplicado, monto_en_moneda_cuenta) y respetan la modalidad nueva.

-- 1. Columnas ---------------------------------------------------------------
alter table public.financiamientos add column if not exists tasa_mensual numeric;
alter table public.financiamientos add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id) on delete set null;
alter table public.tabla_amortizacion add column if not exists tipo text not null default 'cuota';
alter table public.tabla_amortizacion add column if not exists saldo_base numeric;
alter table public.pagos_financiamiento add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tabla_amortizacion_tipo_check') then
    alter table public.tabla_amortizacion add constraint tabla_amortizacion_tipo_check check (tipo in ('cuota','interes'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'financiamientos_tipo_cuota_check') then
    alter table public.financiamientos add constraint financiamientos_tipo_cuota_check
      check (tipo_cuota in ('frances','aleman','bullet','interes_saldo')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'financiamientos_tipo_tasa_check') then
    alter table public.financiamientos add constraint financiamientos_tipo_tasa_check
      check (tipo_tasa in ('TEA','TNA','TEM')) not valid;
  end if;
end $$;

create index if not exists financiamientos_cuenta_bancaria_idx on public.financiamientos(cuenta_bancaria_id);
create index if not exists pagos_financiamiento_cuenta_bancaria_idx on public.pagos_financiamiento(cuenta_bancaria_id);

-- 2. Tasa mensual efectiva ------------------------------------------------
create or replace function public.fin_tasa_mensual(p_tasa numeric, p_tipo_tasa text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case upper(coalesce(p_tipo_tasa, 'TEA'))
    when 'TEM' then coalesce(p_tasa, 0) / 100
    when 'TNA' then coalesce(p_tasa, 0) / 100 / 12
    else power(1 + coalesce(p_tasa, 0) / 100, 1.0 / 12) - 1
  end;
$$;

create or replace function public.fin_trg_tasa_mensual()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tasa_mensual := round(public.fin_tasa_mensual(new.tasa_anual, new.tipo_tasa), 10);
  return new;
end;
$$;

drop trigger if exists fin_tasa_mensual_biu on public.financiamientos;
create trigger fin_tasa_mensual_biu
  before insert or update of tasa_anual, tipo_tasa on public.financiamientos
  for each row execute function public.fin_trg_tasa_mensual();

update public.financiamientos
set tasa_mensual = round(public.fin_tasa_mensual(tasa_anual, tipo_tasa), 10)
where tasa_mensual is null;

-- 3. Fecha de corte del período n (día de corte ajustado al último día del mes) ----
create or replace function public.fin_fecha_periodo(p_desembolso date, p_dia integer, p_n integer)
returns date
language sql
immutable
set search_path = public
as $$
  select (b + (least(coalesce(p_dia, extract(day from p_desembolso)::int),
                     extract(day from (b + interval '1 month' - interval '1 day'))::int) - 1))::date
  from (select (date_trunc('month', p_desembolso) + make_interval(months => p_n))::date as b) x;
$$;

-- 4. Períodos de la modalidad interés sobre saldo (interno) -----------------
create or replace function public.fin_sincronizar_periodos(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin public.financiamientos%rowtype;
  v_n integer;
  v_fecha date;
  v_saldo_corte numeric;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_primera_pendiente integer;
  v_impagos integer;
begin
  select * into v_fin from public.financiamientos where id = p_id for update;
  if not found or v_fin.tipo_cuota <> 'interes_saldo' or v_fin.fecha_desembolso is null then
    return;
  end if;

  -- Generar períodos faltantes hasta el primero que vence después de hoy (mientras haya saldo).
  select coalesce(max(numero), 0) into v_n from public.tabla_amortizacion where financiamiento_id = p_id;
  loop
    exit when v_n > 0 and public.fin_fecha_periodo(v_fin.fecha_desembolso, v_fin.dia_pago, v_n) > v_hoy;
    exit when v_n >= 600;
    v_n := v_n + 1;
    v_fecha := public.fin_fecha_periodo(v_fin.fecha_desembolso, v_fin.dia_pago, v_n);
    select v_fin.monto_original - coalesce(sum(p.capital), 0) into v_saldo_corte
    from public.pagos_financiamiento p where p.financiamiento_id = p_id and p.fecha_pago < v_fecha;
    exit when v_saldo_corte <= 0;
    insert into public.tabla_amortizacion (empresa_id, financiamiento_id, numero, fecha, tipo, capital, interes, total, saldo, saldo_base, estado)
    values (v_fin.empresa_id, p_id, v_n, v_fecha, 'interes', 0, 0, 0, 0, 0, 'futura')
    on conflict (financiamiento_id, numero) do nothing;
  end loop;

  -- Recalcular los períodos no pagados con el saldo de capital al corte.
  update public.tabla_amortizacion t
  set saldo_base = round(x.saldo_corte, 2),
      interes = round(x.saldo_corte * coalesce(v_fin.tasa_mensual, 0), 2),
      total = round(x.saldo_corte * coalesce(v_fin.tasa_mensual, 0), 2),
      capital = 0,
      saldo = round(x.saldo_corte, 2),
      estado = case when x.saldo_corte <= 0 then 'cancelada' else t.estado end,
      updated_at = now()
  from (
    select t2.id, v_fin.monto_original - coalesce((
      select sum(p.capital) from public.pagos_financiamiento p
      where p.financiamiento_id = p_id and p.fecha_pago < t2.fecha), 0) as saldo_corte
    from public.tabla_amortizacion t2
    where t2.financiamiento_id = p_id and t2.estado not in ('pagada', 'cancelada')
  ) x
  where t.id = x.id;

  -- La primera impaga queda 'pendiente'; las siguientes 'futura'.
  select min(numero) into v_primera_pendiente from public.tabla_amortizacion
  where financiamiento_id = p_id and estado not in ('pagada', 'cancelada');
  update public.tabla_amortizacion
  set estado = case when numero = v_primera_pendiente then 'pendiente' else 'futura' end
  where financiamiento_id = p_id and estado not in ('pagada', 'cancelada');

  select count(*) into v_impagos from public.tabla_amortizacion
  where financiamiento_id = p_id and estado not in ('pagada', 'cancelada') and fecha <= v_hoy;

  update public.financiamientos f
  set saldo_pendiente = round(f.monto_original - coalesce((select sum(capital) from public.pagos_financiamiento where financiamiento_id = p_id), 0), 2),
      cuota_mensual = coalesce((select interes from public.tabla_amortizacion where financiamiento_id = p_id and numero = v_primera_pendiente), 0),
      fecha_primer_pago = coalesce(f.fecha_primer_pago, public.fin_fecha_periodo(f.fecha_desembolso, f.dia_pago, 1)),
      fecha_ultimo_pago = null,
      plazo_meses = null,
      updated_at = now()
  where f.id = p_id;

  update public.financiamientos
  set estado = case when saldo_pendiente <= 0 and v_impagos = 0 then 'cancelado' else 'vigente' end
  where id = p_id and estado in ('vigente', 'cancelado', 'atrasado', 'en_gracia');
end;
$$;

revoke execute on function public.fin_sincronizar_periodos(text) from public, anon, authenticated;
grant execute on function public.fin_sincronizar_periodos(text) to service_role;

create or replace function public.sincronizar_periodos_financiamiento(p_empresa_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_n integer := 0;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  for v_id in
    select id from public.financiamientos
    where empresa_id = p_empresa_id and tipo_cuota = 'interes_saldo' and estado <> 'cancelado'
  loop
    perform public.fin_sincronizar_periodos(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.sincronizar_periodos_financiamiento(text) from public, anon;
grant execute on function public.sincronizar_periodos_financiamiento(text) to authenticated, service_role;

-- 5. Validación de cuenta de Tesorería (interno) ----------------------------
create or replace function public.fin_cuenta_valida(p_empresa_id text, p_cuenta_id text)
returns public.cuentas_bancarias
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas_bancarias%rowtype;
begin
  select * into v_cuenta from public.cuentas_bancarias
  where id = p_cuenta_id and empresa_id = p_empresa_id and coalesce(estado, 'activo') = 'activo';
  if not found then
    raise exception 'La cuenta de Tesorería indicada no existe, está inactiva o no pertenece al tenant.';
  end if;
  return v_cuenta;
end;
$$;

revoke execute on function public.fin_cuenta_valida(text, text) from public, anon, authenticated;
grant execute on function public.fin_cuenta_valida(text, text) to service_role;

-- 6. Alta v2 -----------------------------------------------------------------
create or replace function public.crear_financiamiento_v2(p_empresa_id text, p_datos jsonb, p_cuotas jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.financiamientos%rowtype;
  v_multi boolean;
  v_sociedad uuid;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_id text := coalesce(nullif(p_datos ->> 'id', ''), 'fin_' || replace(gen_random_uuid()::text, '-', ''));
  v_codigo text;
  v_tipo_cuota text := coalesce(nullif(p_datos ->> 'tipo_cuota', ''), 'frances');
  v_moneda text := coalesce(nullif(p_datos ->> 'moneda', ''), 'PEN');
  v_monto numeric := (p_datos ->> 'monto_original')::numeric;
  v_tc numeric;
  v_cuotas jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'crear') then
    raise exception 'No tienes permiso para crear financiamientos en este tenant.';
  end if;
  if coalesce(trim(p_datos ->> 'entidad'), '') = '' then
    raise exception 'El acreedor es obligatorio.';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto recibido debe ser mayor a cero.';
  end if;
  if v_tipo_cuota not in ('frances','aleman','bullet','interes_saldo') then
    raise exception 'Modalidad de pago no válida: %.', v_tipo_cuota;
  end if;
  if v_tipo_cuota = 'interes_saldo' and nullif(p_datos ->> 'fecha_desembolso', '') is null then
    raise exception 'La fecha de desembolso es obligatoria.';
  end if;

  select coalesce(e.multisociedad_habilitado, false) into v_multi from public.empresas e where e.id = p_empresa_id;
  if v_multi then
    v_sociedad := nullif(p_datos ->> 'sociedad_id', '')::uuid;
    if v_sociedad is null then
      raise exception 'La sociedad es obligatoria para crear un financiamiento en un tenant con multisociedad.';
    end if;
    perform 1 from public.sociedades s where s.id = v_sociedad and s.empresa_id = p_empresa_id and s.activa = true;
    if not found then
      raise exception 'La sociedad indicada no existe, está inactiva o no pertenece al tenant.';
    end if;
  end if;

  if nullif(p_datos ->> 'cuenta_bancaria_id', '') is not null then
    v_cuenta := public.fin_cuenta_valida(p_empresa_id, p_datos ->> 'cuenta_bancaria_id');
  end if;

  v_codigo := nullif(p_datos ->> 'codigo', '');
  if v_codigo is null then
    select 'FIN-' || lpad((coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::integer), 0) + 1)::text, 3, '0')
    into v_codigo from public.financiamientos where empresa_id = p_empresa_id;
  end if;

  insert into public.financiamientos (
    id, empresa_id, sociedad_id, codigo, tipo, entidad, tipo_entidad,
    contacto_nombre, contacto_telefono, contacto_email,
    monto_original, moneda, tasa_anual, tipo_tasa,
    plazo_meses, meses_gracia, dia_pago, tipo_cuota, cuota_mensual,
    fecha_desembolso, fecha_primer_pago, fecha_ultimo_pago,
    saldo_pendiente, cuotas_pagadas, intereses_pagados_total,
    proposito, centro_costo, cuenta_bancaria_destino, cuenta_bancaria_id, notas, estado
  ) values (
    v_id, p_empresa_id, v_sociedad, v_codigo,
    coalesce(nullif(p_datos ->> 'tipo', ''), 'bancario'), trim(p_datos ->> 'entidad'), nullif(p_datos ->> 'tipo_entidad', ''),
    nullif(p_datos ->> 'contacto_nombre', ''), nullif(p_datos ->> 'contacto_telefono', ''), nullif(p_datos ->> 'contacto_email', ''),
    v_monto, v_moneda, coalesce((p_datos ->> 'tasa_anual')::numeric, 0),
    case when v_tipo_cuota = 'interes_saldo' then 'TEM' else coalesce(nullif(p_datos ->> 'tipo_tasa', ''), 'TEA') end,
    case when v_tipo_cuota = 'interes_saldo' then null else nullif(p_datos ->> 'plazo_meses', '')::integer end,
    case when v_tipo_cuota = 'interes_saldo' then 0 else coalesce((p_datos ->> 'meses_gracia')::integer, 0) end,
    coalesce(nullif(p_datos ->> 'dia_pago', '')::integer, extract(day from nullif(p_datos ->> 'fecha_desembolso', '')::date)::integer),
    v_tipo_cuota, coalesce((p_datos ->> 'cuota_mensual')::numeric, 0),
    nullif(p_datos ->> 'fecha_desembolso', '')::date, nullif(p_datos ->> 'fecha_primer_pago', '')::date,
    case when v_tipo_cuota = 'interes_saldo' then null else nullif(p_datos ->> 'fecha_ultimo_pago', '')::date end,
    v_monto, 0, 0,
    nullif(p_datos ->> 'proposito', ''), nullif(p_datos ->> 'centro_costo', ''),
    coalesce(v_cuenta.nombre, nullif(p_datos ->> 'cuenta_bancaria_destino', '')), v_cuenta.id,
    nullif(p_datos ->> 'notas', ''), 'vigente'
  ) returning * into v_row;

  if v_tipo_cuota = 'interes_saldo' then
    perform public.fin_sincronizar_periodos(v_id);
  else
    insert into public.tabla_amortizacion (empresa_id, financiamiento_id, numero, fecha, tipo, capital, interes, total, saldo, estado)
    select p_empresa_id, v_id, (c ->> 'numero')::integer, (c ->> 'fecha')::date, 'cuota',
      coalesce((c ->> 'capital')::numeric, 0), coalesce((c ->> 'interes')::numeric, 0),
      coalesce((c ->> 'total')::numeric, 0), coalesce((c ->> 'saldo')::numeric, 0), coalesce(c ->> 'estado', 'futura')
    from jsonb_array_elements(coalesce(p_cuotas, '[]'::jsonb)) c;
  end if;

  -- Ingreso del desembolso en Tesorería (opcional).
  if coalesce((p_datos ->> 'registrar_ingreso')::boolean, false) then
    if v_cuenta.id is null then
      raise exception 'Para registrar el ingreso del desembolso elige la cuenta de Tesorería.';
    end if;
    v_tc := nullif(p_datos ->> 'tc_aplicado', '')::numeric;
    if v_cuenta.moneda is distinct from v_moneda and (v_tc is null or v_tc <= 0) then
      raise exception 'La cuenta está en % y el préstamo en %: indica el tipo de cambio.', v_cuenta.moneda, v_moneda;
    end if;
    insert into public.movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha,
      cuenta_bancaria, cuenta_bancaria_id, referencia, vinculo_tipo, vinculo_id, estado, categoria, tc_aplicado, monto_en_moneda_cuenta)
    values ('ing_fin_' || v_id, p_empresa_id, 'ingreso', 'Desembolso ' || v_codigo || ' · ' || v_row.entidad, v_monto, v_moneda,
      coalesce(v_row.fecha_desembolso, (now() at time zone 'America/Lima')::date), v_cuenta.nombre, v_cuenta.id,
      nullif(p_datos ->> 'referencia', ''), 'financiamiento', v_id, 'registrado', 'Financiamiento recibido',
      case when v_cuenta.moneda is distinct from v_moneda then v_tc end,
      case when v_cuenta.moneda is distinct from v_moneda then round(v_monto * v_tc, 2) end);
  end if;

  select * into v_row from public.financiamientos where id = v_id;
  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb) into v_cuotas from public.tabla_amortizacion t where t.financiamiento_id = v_id;
  return to_jsonb(v_row) || jsonb_build_object('tabla_amortizacion', v_cuotas, 'pagos_realizados', '[]'::jsonb);
end;
$$;

revoke execute on function public.crear_financiamiento_v2(text, jsonb, jsonb) from public, anon;
grant execute on function public.crear_financiamiento_v2(text, jsonb, jsonb) to authenticated, service_role;

-- 7. Pago de la modalidad interés sobre saldo -------------------------------
create or replace function public.registrar_pago_interes_saldo(p_empresa_id text, p_id text, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin public.financiamientos%rowtype;
  v_per public.tabla_amortizacion%rowtype;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_alcance uuid[];
  v_fecha date := coalesce(nullif(p_datos ->> 'fecha', '')::date, (now() at time zone 'America/Lima')::date);
  v_capital numeric := round(coalesce(nullif(p_datos ->> 'capital', '')::numeric, 0), 2);
  v_periodo integer := nullif(p_datos ->> 'periodo_numero', '')::integer;
  v_interes numeric := 0;
  v_total numeric;
  v_tc numeric := nullif(p_datos ->> 'tc_aplicado', '')::numeric;
  v_saldo numeric;
  v_pago_id text;
  v_grupo text := replace(gen_random_uuid()::text, '-', '');
  v_cuotas jsonb;
  v_pagos jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'editar') then
    raise exception 'No tienes permiso para registrar pagos de financiamientos en este tenant.';
  end if;

  select * into v_fin from public.financiamientos where id = p_id and empresa_id = p_empresa_id for update;
  if not found then
    raise exception 'Financiamiento % no encontrado en el tenant %.', p_id, p_empresa_id;
  end if;
  if v_fin.tipo_cuota <> 'interes_saldo' then
    raise exception 'Este préstamo no es de interés sobre saldo; usa el registro de cuotas.';
  end if;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  if v_alcance is not null and not (v_fin.sociedad_id = any (v_alcance)) then
    raise exception 'El financiamiento esta fuera de tu alcance de sociedades.';
  end if;

  perform public.fin_sincronizar_periodos(p_id);
  select * into v_fin from public.financiamientos where id = p_id;
  v_saldo := v_fin.saldo_pendiente;

  if v_periodo is null and v_capital <= 0 then
    raise exception 'Indica el interés del período, el capital a amortizar o ambos.';
  end if;
  if v_capital < 0 or v_capital > v_saldo then
    raise exception 'El capital a amortizar debe estar entre 0 y el saldo (% %).', v_fin.moneda, v_saldo;
  end if;

  -- Regla: el interés del período se fija antes del capital de la misma operación;
  -- un abono a capital sin interés, hecho antes del corte, sí reduce el interés de ese período.
  if v_periodo is not null then
    select * into v_per from public.tabla_amortizacion
    where financiamiento_id = p_id and numero = v_periodo for update;
    if not found or v_per.estado in ('pagada', 'cancelada') then
      raise exception 'El período % no existe o ya está pagado.', v_periodo;
    end if;
    v_interes := v_per.interes;
  end if;
  v_total := v_interes + v_capital;

  v_cuenta := public.fin_cuenta_valida(p_empresa_id, p_datos ->> 'cuenta_bancaria_id');
  if v_cuenta.moneda is distinct from v_fin.moneda and (v_tc is null or v_tc <= 0) then
    raise exception 'La cuenta está en % y el préstamo en %: indica el tipo de cambio.', v_cuenta.moneda, v_fin.moneda;
  end if;

  if v_periodo is not null then
    update public.tabla_amortizacion
    set estado = 'pagada', fecha_pago_real = v_fecha, referencia = nullif(p_datos ->> 'referencia', ''),
        comprobante = nullif(p_datos ->> 'comprobante', ''), updated_at = now()
    where financiamiento_id = p_id and numero = v_periodo;
  end if;

  if v_interes > 0 then
    v_pago_id := 'pag_' || v_grupo || '_i';
    insert into public.pagos_financiamiento (id, empresa_id, financiamiento_id, fecha_pago, tipo, cuota_numero,
      capital, interes, total, saldo_despues, moneda, cuenta_bancaria, cuenta_bancaria_id, referencia, comprobante, registrado_por)
    values (v_pago_id, p_empresa_id, p_id, v_fecha, 'cuota', v_periodo, 0, v_interes, v_interes, v_saldo, v_fin.moneda,
      v_cuenta.nombre, v_cuenta.id, nullif(p_datos ->> 'referencia', ''), nullif(p_datos ->> 'comprobante', ''), auth.uid());
    insert into public.compras_gastos (id, empresa_id, sociedad_id, tipo, descripcion, categoria, subcategoria, monto, moneda, fecha,
      financiamiento_id, cuota_numero, estado)
    values ('gasto_int_' || p_id || '_' || v_periodo, p_empresa_id, v_fin.sociedad_id, 'gasto',
      'Intereses ' || v_fin.entidad || ' · ' || v_fin.codigo || ' · período ' || to_char(v_per.fecha, 'MM/YYYY'),
      'Gastos financieros', 'Intereses de prestamos', v_interes, v_fin.moneda, v_fecha, p_id, v_periodo, 'registrado')
    on conflict (id) do update set monto = excluded.monto, fecha = excluded.fecha, estado = excluded.estado, updated_at = now();
  end if;

  if v_capital > 0 then
    v_saldo := round(v_saldo - v_capital, 2);
    insert into public.pagos_financiamiento (id, empresa_id, financiamiento_id, fecha_pago, tipo, cuota_numero,
      capital, interes, total, saldo_despues, moneda, cuenta_bancaria, cuenta_bancaria_id, referencia, comprobante, registrado_por)
    values ('pag_' || v_grupo || '_c', p_empresa_id, p_id, v_fecha,
      case when v_saldo <= 0 then 'capital_total' else 'capital_parcial' end, null,
      v_capital, 0, v_capital, v_saldo, v_fin.moneda, v_cuenta.nombre, v_cuenta.id,
      nullif(p_datos ->> 'referencia', ''), nullif(p_datos ->> 'comprobante', ''), auth.uid());
  end if;

  insert into public.movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha,
    cuenta_bancaria, cuenta_bancaria_id, referencia, vinculo_tipo, vinculo_id, estado, categoria, tc_aplicado, monto_en_moneda_cuenta)
  values ('egr_fin_' || p_id || '_' || v_grupo, p_empresa_id, 'egreso',
    case when v_interes > 0 and v_capital > 0 then 'Interés y amortización '
         when v_interes > 0 then 'Interés ' else 'Amortización ' end || v_fin.codigo || ' · ' || v_fin.entidad,
    v_total, v_fin.moneda, v_fecha, v_cuenta.nombre, v_cuenta.id, nullif(p_datos ->> 'referencia', ''),
    'financiamiento', p_id, 'registrado', 'Pago de financiamiento',
    case when v_cuenta.moneda is distinct from v_fin.moneda then v_tc end,
    case when v_cuenta.moneda is distinct from v_fin.moneda then round(v_total * v_tc, 2) end);

  update public.financiamientos
  set intereses_pagados_total = coalesce(intereses_pagados_total, 0) + v_interes,
      cuotas_pagadas = coalesce(cuotas_pagadas, 0) + case when v_interes > 0 then 1 else 0 end,
      updated_at = now()
  where id = p_id;

  perform public.fin_sincronizar_periodos(p_id);

  select * into v_fin from public.financiamientos where id = p_id;
  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb) into v_cuotas from public.tabla_amortizacion t where t.financiamiento_id = p_id;
  select coalesce(jsonb_agg(p order by p.fecha_pago, p.created_at), '[]'::jsonb) into v_pagos from public.pagos_financiamiento p where p.financiamiento_id = p_id;
  return to_jsonb(v_fin) || jsonb_build_object('tabla_amortizacion', v_cuotas, 'pagos_realizados', v_pagos);
end;
$$;

revoke execute on function public.registrar_pago_interes_saldo(text, text, jsonb) from public, anon;
grant execute on function public.registrar_pago_interes_saldo(text, text, jsonb) to authenticated, service_role;

-- 8. Pago de cuotas (francés, alemán, bullet): misma firma, ahora con cuenta real -------
create or replace function public.registrar_pago_financiamiento(p_empresa_id text, p_financiamiento_id text, p_saldo_pendiente numeric, p_estado text, p_cuotas_pagadas integer, p_intereses_pagados_total numeric, p_cuotas jsonb, p_pago jsonb, p_movimiento_tesoreria jsonb, p_gasto_interes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_financiamiento public.financiamientos%rowtype;
  v_cuotas jsonb;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_tc numeric := nullif(p_movimiento_tesoreria ->> 'tc_aplicado', '')::numeric;
  v_moneda text := coalesce(p_movimiento_tesoreria ->> 'moneda', 'PEN');
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'editar') then
    raise exception 'No tienes permiso para registrar pagos de financiamientos en este tenant.';
  end if;

  if nullif(p_movimiento_tesoreria ->> 'cuenta_bancaria_id', '') is not null then
    v_cuenta := public.fin_cuenta_valida(p_empresa_id, p_movimiento_tesoreria ->> 'cuenta_bancaria_id');
    if v_cuenta.moneda is distinct from v_moneda and (v_tc is null or v_tc <= 0) then
      raise exception 'La cuenta está en % y el préstamo en %: indica el tipo de cambio.', v_cuenta.moneda, v_moneda;
    end if;
  end if;

  update public.financiamientos
  set saldo_pendiente = p_saldo_pendiente,
      estado = p_estado,
      cuotas_pagadas = p_cuotas_pagadas,
      intereses_pagados_total = p_intereses_pagados_total,
      updated_at = now()
  where id = p_financiamiento_id and empresa_id = p_empresa_id
  returning * into v_financiamiento;

  if not found then
    raise exception 'Financiamiento % no encontrado en el tenant %.', p_financiamiento_id, p_empresa_id;
  end if;

  if v_financiamiento.tipo_cuota = 'interes_saldo' then
    raise exception 'Este préstamo es de interés sobre saldo; usa registrar_pago_interes_saldo.';
  end if;

  update public.tabla_amortizacion t
  set capital = c.capital,
      interes = c.interes,
      total = c.total,
      saldo = c.saldo,
      estado = c.estado,
      fecha_pago_real = c.fecha_pago_real,
      referencia = c.referencia,
      comprobante = c.comprobante,
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_cuotas, '[]'::jsonb)) as c(
    numero integer, capital numeric, interes numeric, total numeric, saldo numeric,
    estado text, fecha_pago_real date, referencia text, comprobante text
  )
  where t.financiamiento_id = p_financiamiento_id and t.numero = c.numero;

  insert into public.pagos_financiamiento (
    id, empresa_id, financiamiento_id, fecha_pago, tipo, cuota_numero,
    capital, interes, total, saldo_despues, moneda, cuenta_bancaria, cuenta_bancaria_id, referencia, comprobante, registrado_por
  )
  values (
    p_pago ->> 'id', p_empresa_id, p_financiamiento_id,
    (p_pago ->> 'fecha_pago')::date, p_pago ->> 'tipo',
    nullif(p_pago ->> 'cuota_numero', '')::integer,
    coalesce((p_pago ->> 'capital')::numeric, 0),
    coalesce((p_pago ->> 'interes')::numeric, 0),
    coalesce((p_pago ->> 'total')::numeric, 0),
    coalesce((p_pago ->> 'saldo_despues')::numeric, 0),
    coalesce(p_pago ->> 'moneda', 'PEN'),
    coalesce(v_cuenta.nombre, p_pago ->> 'cuenta_bancaria'),
    v_cuenta.id,
    p_pago ->> 'referencia',
    p_pago ->> 'comprobante',
    auth.uid()
  );

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha,
    cuenta_bancaria, cuenta_bancaria_id, referencia, vinculo_tipo, vinculo_id, estado, categoria, tc_aplicado, monto_en_moneda_cuenta
  )
  values (
    p_movimiento_tesoreria ->> 'id', p_empresa_id,
    coalesce(p_movimiento_tesoreria ->> 'tipo', 'egreso'),
    p_movimiento_tesoreria ->> 'descripcion',
    coalesce((p_movimiento_tesoreria ->> 'monto')::numeric, 0),
    v_moneda,
    (p_movimiento_tesoreria ->> 'fecha')::date,
    coalesce(v_cuenta.nombre, p_movimiento_tesoreria ->> 'cuenta_bancaria'),
    v_cuenta.id,
    p_movimiento_tesoreria ->> 'referencia',
    p_movimiento_tesoreria ->> 'vinculo_tipo',
    p_movimiento_tesoreria ->> 'vinculo_id',
    coalesce(p_movimiento_tesoreria ->> 'estado', 'registrado'),
    case when v_cuenta.id is not null then 'Pago de financiamiento' end,
    case when v_cuenta.moneda is distinct from v_moneda and v_cuenta.id is not null then v_tc end,
    case when v_cuenta.moneda is distinct from v_moneda and v_cuenta.id is not null
      then round(coalesce((p_movimiento_tesoreria ->> 'monto')::numeric, 0) * v_tc, 2) end
  );

  if p_gasto_interes is not null then
    insert into public.compras_gastos (
      id, empresa_id, sociedad_id, tipo, descripcion, categoria, subcategoria, monto, moneda, fecha,
      financiamiento_id, cuota_numero, estado
    )
    values (
      p_gasto_interes ->> 'id', p_empresa_id, v_financiamiento.sociedad_id,
      coalesce(p_gasto_interes ->> 'tipo', 'gasto'),
      p_gasto_interes ->> 'descripcion',
      p_gasto_interes ->> 'categoria',
      p_gasto_interes ->> 'subcategoria',
      coalesce((p_gasto_interes ->> 'monto')::numeric, 0),
      coalesce(p_gasto_interes ->> 'moneda', 'PEN'),
      (p_gasto_interes ->> 'fecha')::date,
      p_gasto_interes ->> 'financiamiento_id',
      nullif(p_gasto_interes ->> 'cuota_numero', '')::integer,
      coalesce(p_gasto_interes ->> 'estado', 'registrado')
    )
    on conflict (id) do update set
      sociedad_id = excluded.sociedad_id,
      monto = excluded.monto,
      descripcion = excluded.descripcion,
      estado = excluded.estado,
      updated_at = now();
  end if;

  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb)
  into v_cuotas
  from public.tabla_amortizacion t
  where t.financiamiento_id = p_financiamiento_id;

  return to_jsonb(v_financiamiento) || jsonb_build_object('tabla_amortizacion', v_cuotas);
end;
$function$;

-- 9. Edición: misma firma; cuenta real, tipo de tasa y modalidad interés sobre saldo -------
create or replace function public.editar_financiamiento(p_empresa_id text, p_id text, p_datos jsonb, p_cuotas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actual public.financiamientos%rowtype;
  v_row public.financiamientos%rowtype;
  v_alcance uuid[];
  v_nueva_sociedad uuid;
  v_pagos integer;
  v_max_pagada integer;
  v_cuotas jsonb;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_nueva_modalidad text;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'editar') then
    raise exception 'No tienes permiso para editar financiamientos en este tenant.';
  end if;

  select * into v_actual from public.financiamientos
  where id = p_id and empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Financiamiento % no encontrado en el tenant %.', p_id, p_empresa_id;
  end if;

  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  v_nueva_sociedad := case when p_datos ? 'sociedad_id'
    then nullif(p_datos ->> 'sociedad_id', '')::uuid else v_actual.sociedad_id end;
  if v_alcance is not null and (
       not (v_actual.sociedad_id = any (v_alcance))
    or not (v_nueva_sociedad = any (v_alcance))
  ) then
    raise exception 'El financiamiento o la sociedad elegida esta fuera de tu alcance de sociedades.';
  end if;

  select count(*) into v_pagos from public.pagos_financiamiento where financiamiento_id = p_id;
  if v_pagos > 0 and coalesce(p_datos ->> 'moneda', v_actual.moneda) is distinct from v_actual.moneda then
    raise exception 'No se puede cambiar la moneda: el financiamiento ya tiene % pago(s) registrados en %.', v_pagos, v_actual.moneda;
  end if;

  v_nueva_modalidad := coalesce(nullif(p_datos ->> 'tipo_cuota', ''), v_actual.tipo_cuota);
  if v_pagos > 0 and (v_nueva_modalidad = 'interes_saldo') <> (v_actual.tipo_cuota = 'interes_saldo') then
    raise exception 'No se puede cambiar entre interés sobre saldo y cuotas: el préstamo ya tiene pagos.';
  end if;

  if p_datos ? 'cuenta_bancaria_id' and nullif(p_datos ->> 'cuenta_bancaria_id', '') is not null then
    v_cuenta := public.fin_cuenta_valida(p_empresa_id, p_datos ->> 'cuenta_bancaria_id');
  end if;

  select max(numero) into v_max_pagada from public.tabla_amortizacion
  where financiamiento_id = p_id and estado = 'pagada';
  if v_nueva_modalidad <> 'interes_saldo' and v_max_pagada is not null
     and coalesce((p_datos ->> 'plazo_meses')::integer, v_actual.plazo_meses) < v_max_pagada then
    raise exception 'El plazo no puede ser menor a % meses: la cuota % ya esta pagada.', v_max_pagada, v_max_pagada;
  end if;

  update public.financiamientos set
    tipo = coalesce(p_datos ->> 'tipo', tipo),
    entidad = coalesce(nullif(p_datos ->> 'entidad', ''), entidad),
    tipo_entidad = case when p_datos ? 'tipo_entidad' then nullif(p_datos ->> 'tipo_entidad', '') else tipo_entidad end,
    contacto_nombre = case when p_datos ? 'contacto_nombre' then p_datos ->> 'contacto_nombre' else contacto_nombre end,
    contacto_telefono = case when p_datos ? 'contacto_telefono' then p_datos ->> 'contacto_telefono' else contacto_telefono end,
    contacto_email = case when p_datos ? 'contacto_email' then p_datos ->> 'contacto_email' else contacto_email end,
    cuenta_bancaria_id = case when p_datos ? 'cuenta_bancaria_id' then v_cuenta.id else cuenta_bancaria_id end,
    cuenta_bancaria_destino = case when p_datos ? 'cuenta_bancaria_id' and v_cuenta.id is not null then v_cuenta.nombre
                                   when p_datos ? 'cuenta_bancaria_destino' then p_datos ->> 'cuenta_bancaria_destino'
                                   else cuenta_bancaria_destino end,
    proposito = case when p_datos ? 'proposito' then p_datos ->> 'proposito' else proposito end,
    notas = case when p_datos ? 'notas' then p_datos ->> 'notas' else notas end,
    moneda = coalesce(p_datos ->> 'moneda', moneda),
    sociedad_id = v_nueva_sociedad,
    monto_original = coalesce((p_datos ->> 'monto_original')::numeric, monto_original),
    tasa_anual = coalesce((p_datos ->> 'tasa_anual')::numeric, tasa_anual),
    tipo_tasa = case when v_nueva_modalidad = 'interes_saldo' then 'TEM' else coalesce(nullif(p_datos ->> 'tipo_tasa', ''), tipo_tasa) end,
    plazo_meses = case when v_nueva_modalidad = 'interes_saldo' then null else coalesce((p_datos ->> 'plazo_meses')::integer, plazo_meses) end,
    meses_gracia = case when v_nueva_modalidad = 'interes_saldo' then 0 else coalesce((p_datos ->> 'meses_gracia')::integer, meses_gracia) end,
    dia_pago = coalesce((p_datos ->> 'dia_pago')::integer, dia_pago),
    tipo_cuota = v_nueva_modalidad,
    fecha_desembolso = coalesce((p_datos ->> 'fecha_desembolso')::date, fecha_desembolso),
    cuota_mensual = coalesce((p_datos ->> 'cuota_mensual')::numeric, cuota_mensual),
    fecha_primer_pago = coalesce((p_datos ->> 'fecha_primer_pago')::date, fecha_primer_pago),
    fecha_ultimo_pago = coalesce((p_datos ->> 'fecha_ultimo_pago')::date, fecha_ultimo_pago),
    saldo_pendiente = coalesce((p_datos ->> 'saldo_pendiente')::numeric, saldo_pendiente),
    estado = coalesce(p_datos ->> 'estado', estado),
    updated_at = now()
  where id = p_id and empresa_id = p_empresa_id
  returning * into v_row;

  if v_row.saldo_pendiente < 0 then
    raise exception 'El monto no puede ser menor al capital ya pagado.';
  end if;

  if v_nueva_sociedad is distinct from v_actual.sociedad_id then
    update public.compras_gastos set sociedad_id = v_nueva_sociedad, updated_at = now()
    where empresa_id = p_empresa_id and financiamiento_id = p_id;
  end if;

  delete from public.tabla_amortizacion
  where financiamiento_id = p_id and estado <> 'pagada';

  if v_nueva_modalidad = 'interes_saldo' then
    perform public.fin_sincronizar_periodos(p_id);
    select * into v_row from public.financiamientos where id = p_id;
  else
    insert into public.tabla_amortizacion (
      empresa_id, financiamiento_id, numero, fecha, tipo, capital, interes, total, saldo, estado
    )
    select
      p_empresa_id, p_id,
      (c ->> 'numero')::integer,
      (c ->> 'fecha')::date,
      'cuota',
      coalesce((c ->> 'capital')::numeric, 0),
      coalesce((c ->> 'interes')::numeric, 0),
      coalesce((c ->> 'total')::numeric, 0),
      coalesce((c ->> 'saldo')::numeric, 0),
      coalesce(c ->> 'estado', 'futura')
    from jsonb_array_elements(coalesce(p_cuotas, '[]'::jsonb)) as c
    where coalesce(c ->> 'estado', '') <> 'pagada'
      and not exists (
        select 1 from public.tabla_amortizacion t
        where t.financiamiento_id = p_id and t.numero = (c ->> 'numero')::integer
      );
  end if;

  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb)
  into v_cuotas
  from public.tabla_amortizacion t
  where t.financiamiento_id = p_id;

  return to_jsonb(v_row) || jsonb_build_object('tabla_amortizacion', v_cuotas);
end;
$function$;

-- 10. Comprobación ------------------------------------------------------------
do $$
declare v_r numeric;
begin
  v_r := round(public.fin_tasa_mensual(13.4, 'TEA'), 6);
  if v_r <> 0.010534 then raise exception 'fin_tasa_mensual TEA 13.4 = %, se esperaba 0.010534', v_r; end if;
  if public.fin_tasa_mensual(10, 'TEM') <> 0.1 then raise exception 'fin_tasa_mensual TEM falla'; end if;
  if public.fin_fecha_periodo('2026-01-31', 31, 1) <> date '2026-02-28' then raise exception 'fin_fecha_periodo fin de mes falla'; end if;
  if public.fin_fecha_periodo('2026-09-18', 18, 2) <> date '2026-11-18' then raise exception 'fin_fecha_periodo falla'; end if;
  if exists (select 1 from public.financiamientos where tasa_mensual is null) then raise exception 'Quedan financiamientos sin tasa_mensual'; end if;
end $$;
