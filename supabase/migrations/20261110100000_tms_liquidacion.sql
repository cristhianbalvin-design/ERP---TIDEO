-- TMS · Liquidación de transporte y rendición de gastos del conductor.
-- Liquidación por cliente y período: flete + recargos (espera fuera de franquicia, peajes, manuales)
-- menos descuentos; costo por viaje (gastos del conductor no observados + flete del tercero + otros);
-- flujo borrador → en_revision → [con_cliente] → aprobada → en_ventas (crea la venta con venta_guardar).
-- Rendición por viaje: fondo entregado (manual), revisión de cada gasto y saldo.

-- 1. Tarifa: franquicia y precio de espera, peajes incluidos ---------------------------------
alter table public.transporte_tarifas
  add column if not exists franquicia_espera_horas numeric(6,2),
  add column if not exists tarifa_espera_hora numeric(12,2),
  add column if not exists incluye_peajes boolean not null default false;
do $$ begin
  alter table public.transporte_tarifas add constraint transporte_tarifas_espera_chk
    check (coalesce(franquicia_espera_horas, 0) >= 0 and coalesce(tarifa_espera_hora, 0) >= 0);
exception when duplicate_object then null; end $$;

-- 2. Gastos: revisión ----------------------------------------------------------------------
alter table public.transporte_viaje_gastos
  add column if not exists estado text not null default 'pendiente',
  add column if not exists observacion text,
  add column if not exists revisado_por uuid,
  add column if not exists revisado_at timestamptz;
do $$ begin
  alter table public.transporte_viaje_gastos add constraint transporte_viaje_gastos_estado_chk
    check (estado in ('pendiente','aprobado','observado'));
exception when duplicate_object then null; end $$;

-- 3. Tablas ---------------------------------------------------------------------------------
create table if not exists public.transporte_liquidaciones (
  id text primary key default ('tlq_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_id uuid,
  numero text not null,
  cuenta_id text not null references public.cuentas(id),
  periodo_desde date not null,
  periodo_hasta date not null,
  moneda text not null default 'PEN',
  estado text not null default 'borrador'
    check (estado in ('borrador','en_revision','con_cliente','aprobada','en_ventas','anulada')),
  subtotal numeric(14,2) not null default 0,
  igv numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  margen numeric(14,2) not null default 0,
  observacion text,
  conformidad jsonb,
  venta_id text,
  enviada_revision_at timestamptz, enviada_cliente_at timestamptz,
  aprobada_at timestamptz, aprobada_por uuid,
  en_ventas_at timestamptz, en_ventas_por uuid,
  anulada_at timestamptz, anulada_por uuid, anulado_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (periodo_hasta >= periodo_desde)
);
create unique index if not exists transporte_liquidaciones_numero_uq on public.transporte_liquidaciones (empresa_id, numero);
create index if not exists transporte_liquidaciones_empresa_idx on public.transporte_liquidaciones (empresa_id, estado);

create table if not exists public.transporte_liquidacion_viajes (
  id text primary key default ('tlv_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete cascade,
  liquidacion_id text not null references public.transporte_liquidaciones(id) on delete cascade,
  viaje_id text not null references public.transporte_viajes(id),
  activo boolean not null default true,
  flete numeric(14,2) not null default 0,
  espera_carga_min integer, espera_descarga_min integer,
  espera_franquicia_horas numeric(6,2),
  espera_minutos_cobrables integer not null default 0,
  espera_precio_hora numeric(12,2) not null default 0,
  espera_monto numeric(14,2) not null default 0,
  espera_ajustada boolean not null default false,
  espera_motivo text,
  peajes numeric(14,2) not null default 0,
  peajes_incluidos boolean not null default false,
  recargos numeric(14,2) not null default 0,
  descuentos numeric(14,2) not null default 0,
  ingreso numeric(14,2) not null default 0,
  igv numeric(14,2) not null default 0,
  costo_gastos numeric(14,2) not null default 0,
  gastos_pendientes integer not null default 0,
  costo_tercero numeric(14,2) not null default 0,
  costo_otros numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  margen numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transporte_liquidacion_viajes_activo_uq on public.transporte_liquidacion_viajes (viaje_id) where activo;
create index if not exists transporte_liquidacion_viajes_liq_idx on public.transporte_liquidacion_viajes (liquidacion_id);

create table if not exists public.transporte_liquidacion_cargos (
  id text primary key default ('tlc_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete cascade,
  liquidacion_viaje_id text not null references public.transporte_liquidacion_viajes(id) on delete cascade,
  tipo text not null check (tipo in ('recargo','descuento','costo')),
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists transporte_liquidacion_cargos_lv_idx on public.transporte_liquidacion_cargos (liquidacion_viaje_id);

create table if not exists public.transporte_rendiciones (
  id text primary key default ('trn_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete cascade,
  numero text not null,
  viaje_id text not null unique references public.transporte_viajes(id) on delete cascade,
  conductor_id text,
  moneda text not null default 'PEN',
  fondo_entregado numeric(14,2) not null default 0 check (fondo_entregado >= 0),
  fondo_referencia text,
  estado text not null default 'abierta' check (estado in ('abierta','aprobada')),
  total_gastado numeric(14,2) not null default 0,
  total_aprobado numeric(14,2) not null default 0,
  saldo numeric(14,2) not null default 0,
  aprobada_at timestamptz, aprobada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transporte_rendiciones_numero_uq on public.transporte_rendiciones (empresa_id, numero);

alter table public.transporte_liquidaciones enable row level security;
alter table public.transporte_liquidacion_viajes enable row level security;
alter table public.transporte_liquidacion_cargos enable row level security;
alter table public.transporte_rendiciones enable row level security;

drop policy if exists transporte_liquidaciones_select on public.transporte_liquidaciones;
create policy transporte_liquidaciones_select on public.transporte_liquidaciones for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'ver'));
drop policy if exists transporte_liquidacion_viajes_select on public.transporte_liquidacion_viajes;
create policy transporte_liquidacion_viajes_select on public.transporte_liquidacion_viajes for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'ver'));
drop policy if exists transporte_liquidacion_cargos_select on public.transporte_liquidacion_cargos;
create policy transporte_liquidacion_cargos_select on public.transporte_liquidacion_cargos for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'ver'));
drop policy if exists transporte_rendiciones_select on public.transporte_rendiciones;
create policy transporte_rendiciones_select on public.transporte_rendiciones for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.transporte_puede_ver_viaje(viaje_id));

grant select on public.transporte_liquidaciones, public.transporte_liquidacion_viajes,
  public.transporte_liquidacion_cargos, public.transporte_rendiciones to authenticated;

-- 4. Funciones internas ---------------------------------------------------------------------
create or replace function public.transporte__siguiente_numero(p_empresa_id text, p_prefijo text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v_anio text := to_char(now() at time zone 'America/Lima', 'YYYY'); v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('tms_num:' || p_empresa_id || ':' || p_prefijo));
  if p_prefijo = 'LT' then
    select coalesce(max(nullif(split_part(numero, '-', 3), '')::integer), 0) + 1 into v_n
      from public.transporte_liquidaciones where empresa_id = p_empresa_id and numero like 'LT-' || v_anio || '-%';
  else
    select coalesce(max(nullif(split_part(numero, '-', 3), '')::integer), 0) + 1 into v_n
      from public.transporte_rendiciones where empresa_id = p_empresa_id and numero like 'REN-' || v_anio || '-%';
  end if;
  return p_prefijo || '-' || v_anio || '-' || lpad(v_n::text, 4, '0');
end $function$;

-- Asegura la rendición de un viaje (se crea al registrar el primer gasto o el fondo).
create or replace function public.transporte__rendicion_asegurar(p_viaje_id text)
returns public.transporte_rendiciones language plpgsql security definer set search_path to 'public' as $function$
declare v public.transporte_viajes%rowtype; r public.transporte_rendiciones%rowtype;
begin
  select * into r from public.transporte_rendiciones where viaje_id = p_viaje_id;
  if found then return r; end if;
  select * into v from public.transporte_viajes where id = p_viaje_id;
  if not found then raise exception 'El viaje no existe.'; end if;
  insert into public.transporte_rendiciones (empresa_id, numero, viaje_id, conductor_id, moneda)
  values (v.empresa_id, public.transporte__siguiente_numero(v.empresa_id, 'REN'), v.id, v.conductor_id, coalesce(v.moneda, 'PEN'))
  on conflict (viaje_id) do nothing;
  select * into r from public.transporte_rendiciones where viaje_id = p_viaje_id;
  return r;
end $function$;

create or replace function public.transporte__rendicion_totales(p_viaje_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.transporte_rendiciones r set
    total_gastado = coalesce((select sum(g.monto) from public.transporte_viaje_gastos g where g.viaje_id = r.viaje_id and g.moneda = r.moneda and g.estado <> 'observado'), 0),
    total_aprobado = coalesce((select sum(g.monto) from public.transporte_viaje_gastos g where g.viaje_id = r.viaje_id and g.moneda = r.moneda and g.estado = 'aprobado'), 0),
    updated_at = now()
  where r.viaje_id = p_viaje_id;
  update public.transporte_rendiciones set saldo = total_gastado - fondo_entregado where viaje_id = p_viaje_id;
end $function$;

create or replace function public.transporte__gasto_rendicion_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.transporte__rendicion_asegurar(new.viaje_id);
  perform public.transporte__rendicion_totales(new.viaje_id);
  return new;
end $function$;
drop trigger if exists transporte_viaje_gastos_rendicion on public.transporte_viaje_gastos;
create trigger transporte_viaje_gastos_rendicion after insert on public.transporte_viaje_gastos
  for each row execute function public.transporte__gasto_rendicion_trg();

-- Minutos entre dos hitos del viaje (null si falta alguno).
create or replace function public.transporte__minutos_hitos(p_viaje_id text, p_desde text, p_hasta text)
returns integer language sql stable security definer set search_path to 'public' as $function$
  select case when a.ocurrido_at is null or b.ocurrido_at is null or b.ocurrido_at < a.ocurrido_at then null
    else (extract(epoch from (b.ocurrido_at - a.ocurrido_at)) / 60)::integer end
  from (select max(ocurrido_at) ocurrido_at from public.transporte_viaje_hitos where viaje_id = p_viaje_id and hito = p_desde) a,
       (select max(ocurrido_at) ocurrido_at from public.transporte_viaje_hitos where viaje_id = p_viaje_id and hito = p_hasta) b
$function$;

-- Recalcula una línea (viaje) de la liquidación. Respeta el ajuste manual de la espera.
create or replace function public.transporte__liq_calcular_viaje(p_lv_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare lv public.transporte_liquidacion_viajes%rowtype; v public.transporte_viajes%rowtype; t public.transporte_tarifas%rowtype;
  v_fr numeric; v_min integer; v_precio numeric; v_espera numeric; v_peajes numeric; v_rec numeric; v_desc numeric;
  v_ing numeric; v_gastos numeric; v_pend integer; v_otros numeric; v_costo numeric; v_carga integer; v_descarga integer;
begin
  select * into lv from public.transporte_liquidacion_viajes where id = p_lv_id for update;
  select * into v from public.transporte_viajes where id = lv.viaje_id;
  select * into t from public.transporte_tarifas where id = v.tarifa_id;
  v_carga := public.transporte__minutos_hitos(v.id, 'llegada_carga', 'fin_carga');
  v_descarga := public.transporte__minutos_hitos(v.id, 'llegada_destino', 'fin_descarga');
  v_fr := t.franquicia_espera_horas;
  if lv.espera_ajustada then
    v_min := lv.espera_minutos_cobrables; v_precio := lv.espera_precio_hora;
  else
    v_precio := coalesce(t.tarifa_espera_hora, 0);
    v_min := case when v_fr is null or v_precio = 0 then 0 else
      greatest(coalesce(v_carga, 0) - (v_fr * 60)::integer, 0) + greatest(coalesce(v_descarga, 0) - (v_fr * 60)::integer, 0) end;
  end if;
  v_espera := round(v_min / 60.0 * v_precio, 2);
  v_peajes := case when coalesce(t.incluye_peajes, false) then 0 else coalesce((select sum(monto) from public.transporte_viaje_gastos
    where viaje_id = v.id and tipo = 'peaje' and moneda = v.moneda and estado <> 'observado'), 0) end;
  select coalesce(sum(monto) filter (where tipo = 'recargo'), 0), coalesce(sum(monto) filter (where tipo = 'descuento'), 0),
         coalesce(sum(monto) filter (where tipo = 'costo'), 0)
    into v_rec, v_desc, v_otros from public.transporte_liquidacion_cargos where liquidacion_viaje_id = lv.id;
  v_ing := round(coalesce(v.ingreso_estimado, 0) + v_espera + v_peajes + v_rec - v_desc, 2);
  select coalesce(sum(monto), 0), count(*) filter (where estado = 'pendiente') into v_gastos, v_pend
    from public.transporte_viaje_gastos where viaje_id = v.id and moneda = v.moneda and estado <> 'observado';
  v_costo := round(v_gastos + lv.costo_tercero + v_otros, 2);
  update public.transporte_liquidacion_viajes set
    flete = round(coalesce(v.ingreso_estimado, 0), 2), espera_carga_min = v_carga, espera_descarga_min = v_descarga,
    espera_franquicia_horas = v_fr, espera_minutos_cobrables = v_min, espera_precio_hora = v_precio, espera_monto = v_espera,
    peajes = v_peajes, peajes_incluidos = coalesce(t.incluye_peajes, false), recargos = v_rec, descuentos = v_desc,
    ingreso = v_ing, igv = round(v_ing * 0.18, 2), costo_gastos = v_gastos, gastos_pendientes = v_pend,
    costo_otros = v_otros, costo_total = v_costo, margen = round(v_ing - v_costo, 2), updated_at = now()
  where id = lv.id;
end $function$;

create or replace function public.transporte__liq_totales(p_liq_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.transporte_liquidaciones l set
    subtotal = coalesce(x.ing, 0), igv = coalesce(x.igv, 0), total = coalesce(x.ing, 0) + coalesce(x.igv, 0),
    costo_total = coalesce(x.costo, 0), margen = coalesce(x.ing, 0) - coalesce(x.costo, 0), updated_at = now()
  from (select sum(ingreso) ing, sum(igv) igv, sum(costo_total) costo from public.transporte_liquidacion_viajes
        where liquidacion_id = p_liq_id and activo) x
  where l.id = p_liq_id;
end $function$;

create or replace function public.transporte__liq_recalcular(p_liq_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r record;
begin
  for r in select id from public.transporte_liquidacion_viajes where liquidacion_id = p_liq_id and activo loop
    perform public.transporte__liq_calcular_viaje(r.id);
  end loop;
  perform public.transporte__liq_totales(p_liq_id);
end $function$;

-- Liquidación editable por el usuario actual (bloquea la fila).
create or replace function public.transporte__liq_para(p_liq_id text, p_accion text, p_estados text[])
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare l public.transporte_liquidaciones%rowtype;
begin
  select * into l from public.transporte_liquidaciones where id = p_liq_id for update;
  if not found then raise exception 'La liquidación no existe.'; end if;
  if not (public.usuario_tiene_empresa(l.empresa_id) and public.usuario_puede(l.empresa_id, 'transporte_comercial', p_accion)) then
    raise exception 'No tienes permiso para esta acción en la liquidación.' using errcode = '42501';
  end if;
  if p_estados is not null and not (l.estado = any (p_estados)) then
    raise exception 'La liquidación está «%» y no admite este cambio.', replace(l.estado, '_', ' ');
  end if;
  return l;
end $function$;

create or replace function public.transporte__liq_agregar(p_liq public.transporte_liquidaciones, p_viaje_ids text[])
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v public.transporte_viajes%rowtype; v_lv text; v_id text;
begin
  if p_viaje_ids is null or cardinality(p_viaje_ids) = 0 then raise exception 'Elige al menos un viaje.'; end if;
  foreach v_id in array p_viaje_ids loop
    select * into v from public.transporte_viajes where id = v_id and empresa_id = p_liq.empresa_id for update;
    if not found then raise exception 'Uno de los viajes no existe.'; end if;
    if v.tipo_viaje <> 'comercial' then raise exception 'El viaje % es de logística propia: no se liquida.', v.codigo; end if;
    if v.estado <> 'entregado' then raise exception 'El viaje % no está entregado.', v.codigo; end if;
    if v.cuenta_id is distinct from p_liq.cuenta_id then raise exception 'El viaje % es de otro cliente.', v.codigo; end if;
    if coalesce(v.moneda, 'PEN') <> p_liq.moneda then raise exception 'El viaje % está en otra moneda.', v.codigo; end if;
    if exists (select 1 from public.transporte_liquidacion_viajes where viaje_id = v.id and activo) then
      raise exception 'El viaje % ya está en otra liquidación.', v.codigo;
    end if;
    insert into public.transporte_liquidacion_viajes (empresa_id, liquidacion_id, viaje_id)
    values (p_liq.empresa_id, p_liq.id, v.id) returning id into v_lv;
    perform public.transporte_viaje_cambiar_estado(v.id, 'en_liquidacion', 'Incluido en la liquidación ' || p_liq.numero);
    perform public.transporte__liq_calcular_viaje(v_lv);
  end loop;
  perform public.transporte__liq_totales(p_liq.id);
end $function$;

-- Devuelve los viajes de una liquidación a «Entregado» (al quitarlos o anular).
create or replace function public.transporte__liq_soltar(p_lv_id text, p_nota text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare lv public.transporte_liquidacion_viajes%rowtype;
begin
  update public.transporte_liquidacion_viajes set activo = false, updated_at = now() where id = p_lv_id returning * into lv;
  if exists (select 1 from public.transporte_viajes where id = lv.viaje_id and estado = 'en_liquidacion') then
    perform public.transporte_viaje_cambiar_estado(lv.viaje_id, 'entregado', p_nota);
  end if;
end $function$;

-- 5. RPC de liquidación ---------------------------------------------------------------------
create or replace function public.transporte_liquidacion_crear(
  p_empresa_id text, p_cuenta_id text, p_desde date, p_hasta date, p_viaje_ids text[])
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare l public.transporte_liquidaciones%rowtype; v_moneda text; v_soc uuid;
begin
  if not (public.usuario_tiene_empresa(p_empresa_id) and public.usuario_puede(p_empresa_id, 'transporte_comercial', 'crear')) then
    raise exception 'No tienes permiso para crear liquidaciones.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Revisa el período de la liquidación.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = p_empresa_id) then
    raise exception 'El cliente no pertenece a la empresa.';
  end if;
  select coalesce(moneda, 'PEN'), sociedad_id into v_moneda, v_soc from public.transporte_viajes
    where empresa_id = p_empresa_id and id = any (coalesce(p_viaje_ids, '{}')) order by fecha_programada limit 1;
  if v_moneda is null then raise exception 'Elige al menos un viaje.'; end if;
  insert into public.transporte_liquidaciones (empresa_id, sociedad_id, numero, cuenta_id, periodo_desde, periodo_hasta, moneda)
  values (p_empresa_id, v_soc, public.transporte__siguiente_numero(p_empresa_id, 'LT'), p_cuenta_id, p_desde, p_hasta, v_moneda)
  returning * into l;
  perform public.transporte__liq_agregar(l, p_viaje_ids);
  select * into l from public.transporte_liquidaciones where id = l.id;
  return l;
end $function$;

create or replace function public.transporte_liquidacion_agregar_viajes(p_liq_id text, p_viaje_ids text[])
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare l public.transporte_liquidaciones%rowtype;
begin
  l := public.transporte__liq_para(p_liq_id, 'editar', array['borrador']);
  perform public.transporte__liq_agregar(l, p_viaje_ids);
  select * into l from public.transporte_liquidaciones where id = p_liq_id;
  return l;
end $function$;

create or replace function public.transporte_liquidacion_quitar_viaje(p_liq_id text, p_viaje_id text)
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare l public.transporte_liquidaciones%rowtype; v_lv text;
begin
  l := public.transporte__liq_para(p_liq_id, 'editar', array['borrador']);
  select id into v_lv from public.transporte_liquidacion_viajes where liquidacion_id = l.id and viaje_id = p_viaje_id and activo;
  if v_lv is null then raise exception 'El viaje no está en esta liquidación.'; end if;
  if (select count(*) from public.transporte_liquidacion_viajes where liquidacion_id = l.id and activo) = 1 then
    raise exception 'Es el único viaje: anula la liquidación en lugar de quitarlo.';
  end if;
  perform public.transporte__liq_soltar(v_lv, 'Quitado de la liquidación ' || l.numero);
  perform public.transporte__liq_totales(l.id);
  select * into l from public.transporte_liquidaciones where id = p_liq_id;
  return l;
end $function$;

create or replace function public.transporte_liquidacion_cargo_guardar(
  p_lv_id text, p_cargo_id text, p_tipo text, p_descripcion text, p_monto numeric)
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare lv public.transporte_liquidacion_viajes%rowtype; l public.transporte_liquidaciones%rowtype;
begin
  select * into lv from public.transporte_liquidacion_viajes where id = p_lv_id and activo;
  if not found then raise exception 'El viaje no está en la liquidación.'; end if;
  l := public.transporte__liq_para(lv.liquidacion_id, 'editar', array['borrador']);
  if p_tipo not in ('recargo','descuento','costo') then raise exception 'Tipo de cargo no válido.'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'Escribe el concepto.'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if nullif(p_cargo_id, '') is null then
    insert into public.transporte_liquidacion_cargos (empresa_id, liquidacion_viaje_id, tipo, descripcion, monto)
    values (lv.empresa_id, lv.id, p_tipo, trim(p_descripcion), round(p_monto, 2));
  else
    update public.transporte_liquidacion_cargos set tipo = p_tipo, descripcion = trim(p_descripcion), monto = round(p_monto, 2)
      where id = p_cargo_id and liquidacion_viaje_id = lv.id;
    if not found then raise exception 'El cargo no existe.'; end if;
  end if;
  perform public.transporte__liq_calcular_viaje(lv.id);
  perform public.transporte__liq_totales(l.id);
  select * into l from public.transporte_liquidaciones where id = l.id;
  return l;
end $function$;

create or replace function public.transporte_liquidacion_cargo_eliminar(p_cargo_id text)
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare c public.transporte_liquidacion_cargos%rowtype; lv public.transporte_liquidacion_viajes%rowtype; l public.transporte_liquidaciones%rowtype;
begin
  select * into c from public.transporte_liquidacion_cargos where id = p_cargo_id;
  if not found then raise exception 'El cargo no existe.'; end if;
  select * into lv from public.transporte_liquidacion_viajes where id = c.liquidacion_viaje_id;
  l := public.transporte__liq_para(lv.liquidacion_id, 'editar', array['borrador']);
  delete from public.transporte_liquidacion_cargos where id = c.id;
  perform public.transporte__liq_calcular_viaje(lv.id);
  perform public.transporte__liq_totales(l.id);
  select * into l from public.transporte_liquidaciones where id = l.id;
  return l;
end $function$;

-- Ajuste manual de la espera (minutos cobrables y precio); p_minutos null vuelve al cálculo automático.
create or replace function public.transporte_liquidacion_espera_ajustar(
  p_lv_id text, p_minutos integer, p_precio_hora numeric, p_motivo text)
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare lv public.transporte_liquidacion_viajes%rowtype; l public.transporte_liquidaciones%rowtype;
begin
  select * into lv from public.transporte_liquidacion_viajes where id = p_lv_id and activo;
  if not found then raise exception 'El viaje no está en la liquidación.'; end if;
  l := public.transporte__liq_para(lv.liquidacion_id, 'editar', array['borrador']);
  if p_minutos is null then
    update public.transporte_liquidacion_viajes set espera_ajustada = false, espera_motivo = null where id = lv.id;
  else
    if p_minutos < 0 or coalesce(p_precio_hora, -1) < 0 then raise exception 'Revisa los minutos y el precio por hora.'; end if;
    if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo del ajuste.'; end if;
    update public.transporte_liquidacion_viajes set espera_ajustada = true, espera_minutos_cobrables = p_minutos,
      espera_precio_hora = round(p_precio_hora, 2), espera_motivo = trim(p_motivo) where id = lv.id;
  end if;
  perform public.transporte__liq_calcular_viaje(lv.id);
  perform public.transporte__liq_totales(l.id);
  select * into l from public.transporte_liquidaciones where id = l.id;
  return l;
end $function$;

create or replace function public.transporte_liquidacion_costo_tercero(p_lv_id text, p_monto numeric)
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare lv public.transporte_liquidacion_viajes%rowtype; l public.transporte_liquidaciones%rowtype;
begin
  select * into lv from public.transporte_liquidacion_viajes where id = p_lv_id and activo;
  if not found then raise exception 'El viaje no está en la liquidación.'; end if;
  l := public.transporte__liq_para(lv.liquidacion_id, 'editar', array['borrador']);
  if coalesce(p_monto, -1) < 0 then raise exception 'El flete del transportista no puede ser negativo.'; end if;
  update public.transporte_liquidacion_viajes set costo_tercero = round(p_monto, 2) where id = lv.id;
  perform public.transporte__liq_calcular_viaje(lv.id);
  perform public.transporte__liq_totales(l.id);
  select * into l from public.transporte_liquidaciones where id = l.id;
  return l;
end $function$;

-- Acciones del flujo: recalcular, enviar_revision, devolver, aprobar, enviar_cliente, conformidad, enviar_ventas, anular.
create or replace function public.transporte_liquidacion_accion(p_liq_id text, p_accion text, p_datos jsonb default '{}'::jsonb)
returns public.transporte_liquidaciones language plpgsql security definer set search_path to 'public' as $function$
declare l public.transporte_liquidaciones%rowtype; r record; v_items jsonb := '[]'::jsonb; v_venta jsonb; v_cliente text;
  v_motivo text := nullif(trim(coalesce(p_datos->>'motivo', '')), ''); v_res text; v_venta_id text; v_total numeric;
begin
  p_datos := coalesce(p_datos, '{}'::jsonb);
  if p_accion = 'recalcular' then
    l := public.transporte__liq_para(p_liq_id, 'editar', array['borrador']);
    perform public.transporte__liq_recalcular(l.id);
  elsif p_accion = 'enviar_revision' then
    l := public.transporte__liq_para(p_liq_id, 'editar', array['borrador']);
    perform public.transporte__liq_recalcular(l.id);
    if exists (select 1 from public.transporte_liquidacion_viajes where liquidacion_id = l.id and activo and ingreso <= 0) then
      raise exception 'Cada viaje debe tener un ingreso mayor a cero.';
    end if;
    update public.transporte_liquidaciones set estado = 'en_revision', enviada_revision_at = now(), observacion = null where id = l.id;
  elsif p_accion = 'devolver' then
    l := public.transporte__liq_para(p_liq_id, 'editar', array['en_revision','con_cliente','aprobada']);
    if v_motivo is null then raise exception 'Escribe el motivo para devolverla a borrador.'; end if;
    update public.transporte_liquidaciones set estado = 'borrador', observacion = v_motivo, aprobada_at = null, aprobada_por = null where id = l.id;
  elsif p_accion = 'enviar_cliente' then
    l := public.transporte__liq_para(p_liq_id, 'editar', array['en_revision']);
    update public.transporte_liquidaciones set estado = 'con_cliente', enviada_cliente_at = now() where id = l.id;
  elsif p_accion = 'conformidad' then
    l := public.transporte__liq_para(p_liq_id, 'aprobar', array['con_cliente']);
    v_res := p_datos->>'resultado';
    if v_res not in ('conforme','observada') then raise exception 'Indica si el cliente dio conformidad u observó.'; end if;
    if nullif(trim(coalesce(p_datos->>'nombre', '')), '') is null then raise exception 'Escribe el nombre de quien responde.'; end if;
    if nullif(p_datos->>'fecha', '') is null then raise exception 'Indica la fecha.'; end if;
    if v_res = 'observada' and nullif(trim(coalesce(p_datos->>'comentario', '')), '') is null then
      raise exception 'Escribe la observación del cliente.';
    end if;
    update public.transporte_liquidaciones set conformidad = p_datos || jsonb_build_object('registrada_por', auth.uid(), 'registrada_at', now()),
      estado = case when v_res = 'conforme' then 'aprobada' else 'borrador' end,
      observacion = case when v_res = 'observada' then 'Observada por el cliente: ' || trim(p_datos->>'comentario') else observacion end,
      aprobada_at = case when v_res = 'conforme' then now() end, aprobada_por = case when v_res = 'conforme' then auth.uid() end
    where id = l.id;
  elsif p_accion = 'aprobar' then
    l := public.transporte__liq_para(p_liq_id, 'aprobar', array['en_revision']);
    update public.transporte_liquidaciones set estado = 'aprobada', aprobada_at = now(), aprobada_por = auth.uid() where id = l.id;
  elsif p_accion = 'enviar_ventas' then
    l := public.transporte__liq_para(p_liq_id, 'aprobar', array['aprobada']);
    select razon_social into v_cliente from public.cuentas where id = l.cuenta_id;
    for r in select lv.ingreso, v.codigo, v.origen_nombre, v.destino_nombre, v.fecha_programada, v.id viaje_id
               from public.transporte_liquidacion_viajes lv join public.transporte_viajes v on v.id = lv.viaje_id
              where lv.liquidacion_id = l.id and lv.activo order by v.fecha_programada, v.codigo loop
      v_items := v_items || jsonb_build_object('descripcion', 'Transporte ' || r.codigo || ' · '
        || to_char(r.fecha_programada at time zone 'America/Lima', 'DD/MM/YYYY') || ' · '
        || coalesce(r.origen_nombre, '') || ' → ' || coalesce(r.destino_nombre, ''),
        'cantidad', 1, 'precio_unitario', r.ingreso, 'afecto_igv', true);
    end loop;
    v_venta := public.venta_guardar(l.empresa_id, jsonb_build_object('tipo_venta', 'con_comprobante', 'moneda', l.moneda,
      'condicion_pago', 'contado', 'sociedad_id', l.sociedad_id, 'cuenta_id', l.cuenta_id, 'cliente_nombre_snapshot', v_cliente,
      'tipo_comprobante_previsto', 'factura', 'concepto', 'Servicio de transporte ' || l.numero || ' del '
        || to_char(l.periodo_desde, 'DD/MM/YYYY') || ' al ' || to_char(l.periodo_hasta, 'DD/MM/YYYY')), v_items);
    v_venta_id := coalesce(v_venta->>'id', v_venta->'venta'->>'id');
    select monto_total into v_total from public.ventas where id = v_venta_id;
    if v_total is distinct from l.total then
      raise exception 'El total de la venta (%) no coincide con el de la liquidación (%).', v_total, l.total;
    end if;
    for r in select viaje_id from public.transporte_liquidacion_viajes where liquidacion_id = l.id and activo loop
      perform public.transporte_viaje_cambiar_estado(r.viaje_id, 'cerrado', 'Liquidado en ' || l.numero);
    end loop;
    update public.transporte_liquidaciones set estado = 'en_ventas', venta_id = v_venta_id, en_ventas_at = now(), en_ventas_por = auth.uid()
      where id = l.id;
  elsif p_accion = 'anular' then
    l := public.transporte__liq_para(p_liq_id, 'anular', array['borrador','en_revision','con_cliente','aprobada']);
    if v_motivo is null then raise exception 'Escribe el motivo de la anulación.'; end if;
    for r in select id from public.transporte_liquidacion_viajes where liquidacion_id = l.id and activo loop
      perform public.transporte__liq_soltar(r.id, 'Liquidación ' || l.numero || ' anulada');
    end loop;
    update public.transporte_liquidaciones set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), anulado_motivo = v_motivo
      where id = l.id;
  else
    raise exception 'Acción no válida: %.', p_accion;
  end if;
  select * into l from public.transporte_liquidaciones where id = p_liq_id;
  return l;
end $function$;

-- 6. RPC de rendición -----------------------------------------------------------------------
create or replace function public.transporte__rendicion_para(p_viaje_id text, p_accion text)
returns public.transporte_rendiciones language plpgsql security definer set search_path to 'public' as $function$
declare v public.transporte_viajes%rowtype; r public.transporte_rendiciones%rowtype;
begin
  select * into v from public.transporte_viajes where id = p_viaje_id;
  if not found then raise exception 'El viaje no existe.'; end if;
  if not (public.usuario_tiene_empresa(v.empresa_id) and public.transporte_puede_logistica(v.empresa_id, p_accion)) then
    raise exception 'No tienes permiso para revisar rendiciones.' using errcode = '42501';
  end if;
  r := public.transporte__rendicion_asegurar(p_viaje_id);
  select * into r from public.transporte_rendiciones where id = r.id for update;
  return r;
end $function$;

create or replace function public.transporte_rendicion_fondo(p_viaje_id text, p_monto numeric, p_referencia text)
returns public.transporte_rendiciones language plpgsql security definer set search_path to 'public' as $function$
declare r public.transporte_rendiciones%rowtype;
begin
  r := public.transporte__rendicion_para(p_viaje_id, 'editar');
  if r.estado = 'aprobada' then raise exception 'La rendición ya está aprobada.'; end if;
  if coalesce(p_monto, -1) < 0 then raise exception 'El fondo no puede ser negativo.'; end if;
  update public.transporte_rendiciones set fondo_entregado = round(p_monto, 2), fondo_referencia = nullif(trim(p_referencia), '')
    where id = r.id;
  perform public.transporte__rendicion_totales(p_viaje_id);
  select * into r from public.transporte_rendiciones where id = r.id;
  return r;
end $function$;

create or replace function public.transporte_gasto_revisar(p_gasto_id text, p_aprobar boolean, p_motivo text default null)
returns public.transporte_viaje_gastos language plpgsql security definer set search_path to 'public' as $function$
declare g public.transporte_viaje_gastos%rowtype; r public.transporte_rendiciones%rowtype;
begin
  select * into g from public.transporte_viaje_gastos where id = p_gasto_id for update;
  if not found then raise exception 'El gasto no existe.'; end if;
  r := public.transporte__rendicion_para(g.viaje_id, 'aprobar');
  if r.estado = 'aprobada' then raise exception 'La rendición ya está aprobada.'; end if;
  if not p_aprobar and nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué observas el gasto.'; end if;
  update public.transporte_viaje_gastos set estado = case when p_aprobar then 'aprobado' else 'observado' end,
    observacion = case when p_aprobar then null else trim(p_motivo) end, revisado_por = auth.uid(), revisado_at = now()
  where id = g.id returning * into g;
  perform public.transporte__rendicion_totales(g.viaje_id);
  perform public.transporte__liq_calcular_viaje(lv.id) from public.transporte_liquidacion_viajes lv
    join public.transporte_liquidaciones l on l.id = lv.liquidacion_id where lv.viaje_id = g.viaje_id and lv.activo and l.estado = 'borrador';
  perform public.transporte__liq_totales(lv.liquidacion_id) from public.transporte_liquidacion_viajes lv
    join public.transporte_liquidaciones l on l.id = lv.liquidacion_id where lv.viaje_id = g.viaje_id and lv.activo and l.estado = 'borrador';
  return g;
end $function$;

create or replace function public.transporte_rendicion_accion(p_viaje_id text, p_accion text)
returns public.transporte_rendiciones language plpgsql security definer set search_path to 'public' as $function$
declare r public.transporte_rendiciones%rowtype; v_estado text;
begin
  r := public.transporte__rendicion_para(p_viaje_id, 'aprobar');
  if p_accion = 'aprobar' then
    if r.estado = 'aprobada' then raise exception 'La rendición ya está aprobada.'; end if;
    select estado into v_estado from public.transporte_viajes where id = p_viaje_id;
    if v_estado not in ('entregado','en_liquidacion','cerrado') then raise exception 'El viaje aún no termina: la rendición se aprueba al final.'; end if;
    if exists (select 1 from public.transporte_viaje_gastos where viaje_id = p_viaje_id and estado = 'pendiente') then
      raise exception 'Revisa todos los gastos (aprobar u observar) antes de aprobar la rendición.';
    end if;
    perform public.transporte__rendicion_totales(p_viaje_id);
    update public.transporte_rendiciones set estado = 'aprobada', aprobada_at = now(), aprobada_por = auth.uid() where id = r.id;
  elsif p_accion = 'reabrir' then
    if r.estado <> 'aprobada' then raise exception 'La rendición no está aprobada.'; end if;
    update public.transporte_rendiciones set estado = 'abierta', aprobada_at = null, aprobada_por = null where id = r.id;
  else
    raise exception 'Acción no válida: %.', p_accion;
  end if;
  select * into r from public.transporte_rendiciones where id = r.id;
  return r;
end $function$;

-- 6b. Registrar gasto: no se admite si la rendición ya está aprobada (parte de la versión vigente, 20261110090000).
create or replace function public.transporte_viaje_gasto_registrar(p_viaje_id text, p_datos jsonb)
returns public.transporte_viaje_gastos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_row public.transporte_viaje_gastos%rowtype;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.estado not in ('despachado','en_ruta','con_incidente','entregado') then raise exception 'El viaje no admite gastos en este estado.'; end if;
  if exists (select 1 from public.transporte_rendiciones where viaje_id = v.id and estado = 'aprobada') then
    raise exception 'La rendición de este viaje ya fue aprobada: pide que la reabran para agregar gastos.';
  end if;
  if coalesce(nullif(p_datos->>'monto', '')::numeric, 0) <= 0 then raise exception 'Ingresa el monto.'; end if;
  if nullif(p_datos->>'foto_url', '') is null then raise exception 'Toma la foto del comprobante.'; end if;
  insert into public.transporte_viaje_gastos (empresa_id, viaje_id, tipo, monto, moneda, lugar, foto_url)
  values (v.empresa_id, v.id, coalesce(p_datos->>'tipo', 'otro'), round((p_datos->>'monto')::numeric, 2),
    coalesce(nullif(p_datos->>'moneda', ''), 'PEN'), nullif(trim(p_datos->>'lugar'), ''), p_datos->>'foto_url')
  returning * into v_row;
  return v_row;
end;
$function$;

-- 7. Permisos de ejecución ------------------------------------------------------------------
revoke all on function public.transporte__siguiente_numero(text, text), public.transporte__rendicion_asegurar(text),
  public.transporte__rendicion_totales(text), public.transporte__gasto_rendicion_trg(), public.transporte__minutos_hitos(text, text, text),
  public.transporte__liq_calcular_viaje(text), public.transporte__liq_totales(text), public.transporte__liq_recalcular(text),
  public.transporte__liq_para(text, text, text[]), public.transporte__liq_agregar(public.transporte_liquidaciones, text[]),
  public.transporte__liq_soltar(text, text), public.transporte__rendicion_para(text, text) from public, anon, authenticated;
revoke all on function public.transporte_liquidacion_crear(text, text, date, date, text[]),
  public.transporte_liquidacion_agregar_viajes(text, text[]), public.transporte_liquidacion_quitar_viaje(text, text),
  public.transporte_liquidacion_cargo_guardar(text, text, text, text, numeric), public.transporte_liquidacion_cargo_eliminar(text),
  public.transporte_liquidacion_espera_ajustar(text, integer, numeric, text), public.transporte_liquidacion_costo_tercero(text, numeric),
  public.transporte_liquidacion_accion(text, text, jsonb), public.transporte_rendicion_fondo(text, numeric, text),
  public.transporte_gasto_revisar(text, boolean, text), public.transporte_rendicion_accion(text, text) from public, anon;
grant execute on function public.transporte_liquidacion_crear(text, text, date, date, text[]),
  public.transporte_liquidacion_agregar_viajes(text, text[]), public.transporte_liquidacion_quitar_viaje(text, text),
  public.transporte_liquidacion_cargo_guardar(text, text, text, text, numeric), public.transporte_liquidacion_cargo_eliminar(text),
  public.transporte_liquidacion_espera_ajustar(text, integer, numeric, text), public.transporte_liquidacion_costo_tercero(text, numeric),
  public.transporte_liquidacion_accion(text, text, jsonb), public.transporte_rendicion_fondo(text, numeric, text),
  public.transporte_gasto_revisar(text, boolean, text), public.transporte_rendicion_accion(text, text) to authenticated;

-- 8. Comprobación ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from information_schema.tables where table_schema = 'public' and table_name in
      ('transporte_liquidaciones','transporte_liquidacion_viajes','transporte_liquidacion_cargos','transporte_rendiciones')) <> 4 then
    raise exception 'Faltan tablas de liquidación.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
      ('transporte_liquidacion_crear','transporte_liquidacion_accion','transporte_rendicion_accion','transporte_gasto_revisar')) <> 4 then
    raise exception 'Faltan funciones de liquidación.';
  end if;
  if exists (select 1 from pg_class c where c.relname in ('transporte_liquidaciones','transporte_rendiciones') and not c.relrowsecurity) then
    raise exception 'RLS no activa.';
  end if;
end $$;
