-- 654 · Flota & Alquileres PR C: partes diarios de equipo y liquidación mensual con DMR.
-- Solo cambios aditivos: tablas nuevas, funciones nuevas, una carpeta nueva en el bucket flota-rental y el permiso de pantalla nuevo.
-- Reglas aprobadas (03-nov-2026):
--   DMR = (horas programadas − paradas atribuibles al proveedor) ÷ horas programadas.
--   Horas facturables = mayor entre horas operadas y mínimo del contrato prorrateado por los días del mes en contrato.
--   Penalidad = importe × (meta − DMR) / 100, solo si DMR < meta. Se calcula por equipo.
--   No se envía a revisión con partes faltantes ni antes de que termine el periodo; aprobada bloquea los partes del mes.
--   Tarifa: la versión vigente de cada día (contratos_alquiler_equipo_tarifas → override → tarifa estándar).

-- =====================================================================
-- 1. Tablas
-- =====================================================================
create table if not exists public.flota_partes_equipo (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  sociedad_id uuid not null references public.sociedades(id) on delete restrict,
  contrato_alquiler_id text not null references public.contratos_alquiler(id) on delete restrict,
  contrato_equipo_id uuid not null references public.contratos_alquiler_equipos(id) on delete restrict,
  activo_id text not null references public.activos(id) on delete restrict,
  fecha date not null,
  turno text not null default 'dia' check (turno in ('dia','noche','dia_noche')),
  sin_operacion boolean not null default false,
  horas_programadas numeric(5,2) not null check (horas_programadas >= 0 and horas_programadas <= 24),
  horometro_inicio numeric(12,1) check (horometro_inicio is null or horometro_inicio >= 0),
  horometro_fin numeric(12,1) check (horometro_fin is null or horometro_fin >= 0),
  horas_operadas numeric(6,2) not null default 0 check (horas_operadas >= 0),
  paradas jsonb not null default '[]'::jsonb check (jsonb_typeof(paradas) = 'array'),
  horas_parada_proveedor numeric(6,2) not null default 0,
  horas_parada_cliente numeric(6,2) not null default 0,
  horas_parada_neutral numeric(6,2) not null default 0,
  vb_cliente text,
  evidencia_path text,
  observaciones text,
  estado text not null default 'registrado' check (estado in ('registrado','anulado')),
  anulado_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint flota_partes_equipo_horometro_chk check (
    sin_operacion or (horometro_inicio is not null and horometro_fin is not null and horometro_fin >= horometro_inicio))
);
create unique index if not exists flota_partes_equipo_dia_key
  on public.flota_partes_equipo (contrato_equipo_id, fecha) where estado = 'registrado';
create index if not exists flota_partes_equipo_empresa_idx on public.flota_partes_equipo (empresa_id, contrato_alquiler_id, fecha);

create table if not exists public.flota_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  sociedad_id uuid not null references public.sociedades(id) on delete restrict,
  numero text not null,
  contrato_alquiler_id text not null references public.contratos_alquiler(id) on delete restrict,
  periodo date not null check (extract(day from periodo) = 1),
  estado text not null default 'borrador' check (estado in ('borrador','en_revision','aprobada','anulada')),
  moneda text not null,
  meta_dmr numeric(5,2),
  horas_programadas numeric(10,2) not null default 0,
  horas_operadas numeric(10,2) not null default 0,
  horas_parada_proveedor numeric(10,2) not null default 0,
  horas_parada_cliente numeric(10,2) not null default 0,
  horas_facturables numeric(10,2) not null default 0,
  dmr numeric(6,2),
  importe_base numeric(14,2) not null default 0,
  penalidad numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  dias_faltantes integer not null default 0,
  calculado_at timestamptz,
  enviada_at timestamptz,
  enviada_por uuid,
  aprobada_at timestamptz,
  aprobada_por uuid,
  devuelta_motivo text,
  anulada_at timestamptz,
  anulada_por uuid,
  anulado_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flota_liquidaciones_numero_key unique (empresa_id, numero)
);
create unique index if not exists flota_liquidaciones_periodo_key
  on public.flota_liquidaciones (contrato_alquiler_id, periodo) where estado <> 'anulada';
create index if not exists flota_liquidaciones_empresa_idx on public.flota_liquidaciones (empresa_id, periodo desc, estado);

create table if not exists public.flota_liquidacion_lineas (
  id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.flota_liquidaciones(id) on delete cascade,
  empresa_id text not null,
  contrato_equipo_id uuid not null references public.contratos_alquiler_equipos(id) on delete restrict,
  activo_id text not null references public.activos(id) on delete restrict,
  dias_mes integer not null,
  dias_en_contrato integer not null,
  partes integer not null default 0,
  dias_faltantes date[] not null default '{}',
  horas_programadas numeric(10,2) not null default 0,
  horas_operadas numeric(10,2) not null default 0,
  horas_parada_proveedor numeric(10,2) not null default 0,
  horas_parada_cliente numeric(10,2) not null default 0,
  horas_parada_neutral numeric(10,2) not null default 0,
  dmr numeric(6,2),
  minimo_prorrateado numeric(10,2) not null default 0,
  horas_facturables numeric(10,2) not null default 0,
  tarifa_hora numeric(12,2),
  importe_operado numeric(14,2) not null default 0,
  importe_minimo numeric(14,2) not null default 0,
  importe_base numeric(14,2) not null default 0,
  penalidad numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  constraint flota_liquidacion_lineas_equipo_key unique (liquidacion_id, contrato_equipo_id)
);

alter table public.flota_partes_equipo enable row level security;
alter table public.flota_liquidaciones enable row level security;
alter table public.flota_liquidacion_lineas enable row level security;

comment on table public.flota_partes_equipo is 'Parte diario por equipo en contrato: horómetro, horas programadas y paradas atribuidas. Se escribe solo por flota_guardar_parte / flota_anular_parte.';
comment on table public.flota_liquidaciones is 'Liquidación mensual por contrato de alquiler con DMR y penalidad. Se escribe solo por RPC flota_*_liquidacion.';

-- =====================================================================
-- 2. RLS: solo lectura; las escrituras van por RPC
-- =====================================================================
drop policy if exists flota_partes_equipo_select on public.flota_partes_equipo;
create policy flota_partes_equipo_select on public.flota_partes_equipo for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'liquidacion_flota', 'ver')
         and public.flota_sociedad_en_alcance(empresa_id, sociedad_id));

drop policy if exists flota_liquidaciones_select on public.flota_liquidaciones;
create policy flota_liquidaciones_select on public.flota_liquidaciones for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'liquidacion_flota', 'ver')
         and public.flota_sociedad_en_alcance(empresa_id, sociedad_id));

drop policy if exists flota_liquidacion_lineas_select on public.flota_liquidacion_lineas;
create policy flota_liquidacion_lineas_select on public.flota_liquidacion_lineas for select to authenticated
  using (exists (select 1 from public.flota_liquidaciones l
                 where l.id = liquidacion_id
                   and public.usuario_tiene_empresa(l.empresa_id) and public.usuario_puede(l.empresa_id, 'liquidacion_flota', 'ver')
                   and public.flota_sociedad_en_alcance(l.empresa_id, l.sociedad_id)));

-- =====================================================================
-- 3. Funciones internas
-- =====================================================================
create or replace function public.flota__atribucion_parada(p_causa text)
returns text
language sql
immutable
as $$
  select case p_causa
    when 'falla_mecanica' then 'proveedor'
    when 'mant_correctivo' then 'proveedor'
    when 'falta_operador_proveedor' then 'proveedor'
    when 'mant_preventivo' then 'neutral'
    when 'clima' then 'neutral'
    when 'sin_frente' then 'cliente'
    when 'sin_operador_cliente' then 'cliente'
    when 'orden_cliente' then 'cliente'
  end;
$$;

-- Tarifa por hora vigente para un equipo de contrato en una fecha.
create or replace function public.flota__tarifa_dia(p_contrato_equipo_id uuid, p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select t.tarifa_hora from public.contratos_alquiler_equipo_tarifas t
      where t.contrato_equipo_id = p_contrato_equipo_id and t.vigente_desde <= p_fecha
      order by t.vigente_desde desc, t.version desc limit 1),
    (select cae.tarifa_hora_override from public.contratos_alquiler_equipos cae where cae.id = p_contrato_equipo_id),
    (select te.tarifa_hora from public.contratos_alquiler_equipos cae
       join public.tarifas_estandar_equipos te on te.activo_id = cae.equipo_id
      where cae.id = p_contrato_equipo_id)
  );
$$;

-- Recalcula líneas y totales de una liquidación. No valida permisos (lo hace quien la llama).
create or replace function public.flota__calcular_liquidacion(p_liquidacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
  v_c public.contratos_alquiler;
  v_fin_mes date;
  v_desde date;
  v_hasta date;
  v_hasta_req date;
  v_dias_mes integer;
  v_dias integer;
  v_cae record;
  v_agg record;
  v_falt date[];
  v_min numeric;
  v_hfact numeric;
  v_tarifa_fin numeric;
  v_imp_op numeric;
  v_imp_min numeric;
  v_base numeric;
  v_dmr numeric;
  v_pen numeric;
begin
  select * into v_l from public.flota_liquidaciones where id = p_liquidacion_id for update;
  select * into v_c from public.contratos_alquiler where id = v_l.contrato_alquiler_id;
  v_fin_mes := (v_l.periodo + interval '1 month' - interval '1 day')::date;
  v_desde := greatest(v_l.periodo, v_c.fecha_inicio);
  v_hasta := least(v_fin_mes, coalesce(v_c.fecha_fin, v_fin_mes));
  v_hasta_req := least(v_hasta, current_date - 1);
  v_dias_mes := extract(day from v_fin_mes)::integer;
  v_dias := greatest(0, v_hasta - v_desde + 1);

  delete from public.flota_liquidacion_lineas where liquidacion_id = v_l.id;

  for v_cae in
    select cae.id, cae.equipo_id, a.codigo from public.contratos_alquiler_equipos cae
    join public.activos a on a.id = cae.equipo_id
    where cae.contrato_alquiler_id = v_c.id order by a.codigo
  loop
    select count(*) as partes,
           coalesce(sum(p.horas_programadas), 0) as hprog,
           coalesce(sum(p.horas_operadas), 0) as hop,
           coalesce(sum(p.horas_parada_proveedor), 0) as hpp,
           coalesce(sum(p.horas_parada_cliente), 0) as hpc,
           coalesce(sum(p.horas_parada_neutral), 0) as hpn,
           coalesce(sum(p.horas_operadas * coalesce(public.flota__tarifa_dia(v_cae.id, p.fecha), 0)), 0) as imp_op,
           bool_or(public.flota__tarifa_dia(v_cae.id, p.fecha) is null and p.horas_operadas > 0) as sin_tarifa
      into v_agg
    from public.flota_partes_equipo p
    where p.contrato_equipo_id = v_cae.id and p.estado = 'registrado' and p.fecha between v_desde and v_hasta;

    if v_agg.sin_tarifa then
      raise exception 'El equipo % no tiene tarifa vigente para algunos días del periodo.', v_cae.codigo using errcode = '22023';
    end if;

    select coalesce(array_agg(d::date order by d), '{}') into v_falt
    from generate_series(v_desde, v_hasta_req, interval '1 day') d
    where v_hasta_req >= v_desde
      and not exists (select 1 from public.flota_partes_equipo p
                      where p.contrato_equipo_id = v_cae.id and p.estado = 'registrado' and p.fecha = d::date);

    v_min := case
      when coalesce(v_c.minimo_facturable, 0) = 0 then 0
      when coalesce(v_c.unidad_minimo_facturable, 'hora') <> 'hora' then null
      when v_c.periodicidad_minimo_facturable = 'dia' then v_c.minimo_facturable * v_dias
      when v_c.periodicidad_minimo_facturable = 'semana' then v_c.minimo_facturable * v_dias / 7.0
      when coalesce(v_c.periodicidad_minimo_facturable, 'mes') = 'mes' then v_c.minimo_facturable * v_dias / v_dias_mes
    end;
    if v_min is null then
      raise exception 'El mínimo facturable del contrato % (%/%) no se puede liquidar por horas.',
        v_c.numero, v_c.unidad_minimo_facturable, v_c.periodicidad_minimo_facturable using errcode = '22023';
    end if;
    v_min := round(v_min, 2);
    v_hfact := greatest(v_agg.hop, v_min);
    v_tarifa_fin := public.flota__tarifa_dia(v_cae.id, v_hasta);
    if v_hfact > v_agg.hop and v_tarifa_fin is null then
      raise exception 'El equipo % no tiene tarifa vigente para aplicar el mínimo.', v_cae.codigo using errcode = '22023';
    end if;
    v_imp_op := round(v_agg.imp_op, 2);
    v_imp_min := round((v_hfact - v_agg.hop) * coalesce(v_tarifa_fin, 0), 2);
    v_base := v_imp_op + v_imp_min;
    v_dmr := case when v_agg.hprog > 0 then round((v_agg.hprog - v_agg.hpp) / v_agg.hprog * 100, 2) end;
    v_pen := case when v_dmr is not null and v_c.meta_dmr is not null and v_dmr < v_c.meta_dmr
                  then round(v_base * (v_c.meta_dmr - v_dmr) / 100, 2) else 0 end;

    insert into public.flota_liquidacion_lineas (liquidacion_id, empresa_id, contrato_equipo_id, activo_id, dias_mes, dias_en_contrato, partes,
      dias_faltantes, horas_programadas, horas_operadas, horas_parada_proveedor, horas_parada_cliente, horas_parada_neutral, dmr,
      minimo_prorrateado, horas_facturables, tarifa_hora, importe_operado, importe_minimo, importe_base, penalidad, total)
    values (v_l.id, v_l.empresa_id, v_cae.id, v_cae.equipo_id, v_dias_mes, v_dias, v_agg.partes,
      v_falt, v_agg.hprog, v_agg.hop, v_agg.hpp, v_agg.hpc, v_agg.hpn, v_dmr,
      v_min, v_hfact, v_tarifa_fin, v_imp_op, v_imp_min, v_base, v_pen, v_base - v_pen);
  end loop;

  update public.flota_liquidaciones l set
    horas_programadas = s.hprog, horas_operadas = s.hop, horas_parada_proveedor = s.hpp, horas_parada_cliente = s.hpc,
    horas_facturables = s.hfact,
    dmr = case when s.hprog > 0 then round((s.hprog - s.hpp) / s.hprog * 100, 2) end,
    importe_base = s.base, penalidad = s.pen, total = s.tot, dias_faltantes = s.falt,
    meta_dmr = v_c.meta_dmr, moneda = v_c.moneda, calculado_at = now(), updated_at = now()
  from (select coalesce(sum(horas_programadas),0) hprog, coalesce(sum(horas_operadas),0) hop, coalesce(sum(horas_parada_proveedor),0) hpp,
               coalesce(sum(horas_parada_cliente),0) hpc, coalesce(sum(horas_facturables),0) hfact, coalesce(sum(importe_base),0) base,
               coalesce(sum(penalidad),0) pen, coalesce(sum(total),0) tot, coalesce(sum(cardinality(dias_faltantes)),0)::integer falt
        from public.flota_liquidacion_lineas where liquidacion_id = v_l.id) s
  where l.id = v_l.id;
end;
$$;

-- Carga una liquidación validando empresa, permiso y alcance de sociedad.
create or replace function public.flota__liquidacion_para(p_id uuid, p_accion text, p_mensaje text)
returns public.flota_liquidaciones
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
begin
  select * into v_l from public.flota_liquidaciones where id = p_id for update;
  if not found then
    raise exception 'La liquidación no existe.' using errcode = '22023';
  end if;
  perform public.flota__exigir(v_l.empresa_id, 'liquidacion_flota', p_accion, p_mensaje);
  if not public.flota_sociedad_en_alcance(v_l.empresa_id, v_l.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  return v_l;
end;
$$;

-- =====================================================================
-- 4. RPC de partes diarios
-- =====================================================================
create or replace function public.flota_guardar_parte(p_empresa_id text, p_parte jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid := nullif(p_parte->>'id', '')::uuid;
  v_old public.flota_partes_equipo;
  v_cae record;
  v_fecha date;
  v_sin boolean := coalesce((p_parte->>'sin_operacion')::boolean, false);
  v_turno text := coalesce(nullif(p_parte->>'turno', ''), 'dia');
  v_hprog numeric := nullif(p_parte->>'horas_programadas', '')::numeric;
  v_hi numeric := nullif(p_parte->>'horometro_inicio', '')::numeric;
  v_hf numeric := nullif(p_parte->>'horometro_fin', '')::numeric;
  v_vb text := nullif(btrim(p_parte->>'vb_cliente'), '');
  v_path text := nullif(p_parte->>'evidencia_path', '');
  v_paradas jsonb := '[]'::jsonb;
  v_item jsonb;
  v_h numeric;
  v_causa text;
  v_atr text;
  v_hpp numeric := 0;
  v_hpc numeric := 0;
  v_hpn numeric := 0;
  v_op numeric;
  v_prev numeric;
  v_next numeric;
  v_row public.flota_partes_equipo;
begin
  if v_id is null then
    perform public.flota__exigir(p_empresa_id, 'liquidacion_flota', 'crear', 'No tiene permiso para registrar partes.');
  else
    perform public.flota__exigir(p_empresa_id, 'liquidacion_flota', 'editar', 'No tiene permiso para editar partes.');
    select * into v_old from public.flota_partes_equipo where id = v_id and empresa_id = p_empresa_id for update;
    if not found or v_old.estado <> 'registrado' then
      raise exception 'El parte no existe o está anulado.' using errcode = '22023';
    end if;
  end if;

  select cae.id, cae.equipo_id, ca.id as contrato_id, ca.sociedad_id, ca.estado, ca.fecha_inicio, ca.fecha_fin, ca.numero
    into v_cae
  from public.contratos_alquiler_equipos cae
  join public.contratos_alquiler ca on ca.id = cae.contrato_alquiler_id
  where cae.id = coalesce(v_old.contrato_equipo_id, nullif(p_parte->>'contrato_equipo_id', '')::uuid) and ca.empresa_id = p_empresa_id;
  if not found then
    raise exception 'Seleccione un contrato y un equipo válidos.' using errcode = '22023';
  end if;
  if not public.flota_sociedad_en_alcance(p_empresa_id, v_cae.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;

  v_fecha := coalesce(v_old.fecha, nullif(p_parte->>'fecha', '')::date);
  if v_fecha is null then
    raise exception 'La fecha es obligatoria.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se registran partes de días futuros.' using errcode = '22023';
  end if;
  if v_fecha < v_cae.fecha_inicio or (v_cae.fecha_fin is not null and v_fecha > v_cae.fecha_fin) then
    raise exception 'La fecha está fuera de la vigencia del contrato %.', v_cae.numero using errcode = '22023';
  end if;
  if exists (select 1 from public.flota_liquidaciones l
             where l.contrato_alquiler_id = v_cae.contrato_id and l.periodo = date_trunc('month', v_fecha)::date
               and l.estado in ('en_revision','aprobada')) then
    raise exception 'El mes ya está en revisión o aprobado: no se pueden cambiar sus partes.' using errcode = '22023';
  end if;
  if v_turno not in ('dia','noche','dia_noche') then
    raise exception 'Turno no válido.' using errcode = '22023';
  end if;
  if not public.flota__ruta_valida(p_empresa_id, 'partes', v_path) then
    raise exception 'La ruta del archivo no es válida.' using errcode = '22023';
  end if;

  if v_sin then
    v_hprog := 0; v_op := 0;
  else
    if v_hprog is null or v_hprog <= 0 or v_hprog > 24 then
      raise exception 'Las horas programadas deben estar entre 0,5 y 24.' using errcode = '22023';
    end if;
    if v_hi is null or v_hf is null then
      raise exception 'Indique el horómetro inicial y final.' using errcode = '22023';
    end if;
    if v_hf < v_hi then
      raise exception 'El horómetro final no puede ser menor que el inicial.' using errcode = '22023';
    end if;
    v_op := v_hf - v_hi;
    if v_op > v_hprog then
      raise exception 'Las horas operadas (%) superan las horas programadas (%).', v_op, v_hprog using errcode = '22023';
    end if;
    if v_vb is null then
      raise exception 'Indique quién dio el visto bueno del cliente.' using errcode = '22023';
    end if;
    select p.horometro_fin into v_prev from public.flota_partes_equipo p
     where p.activo_id = v_cae.equipo_id and p.estado = 'registrado' and not p.sin_operacion and p.fecha < v_fecha
       and p.id is distinct from v_id order by p.fecha desc limit 1;
    if v_prev is not null and v_hi < v_prev then
      raise exception 'El horómetro inicial (%) es menor que el final del parte anterior (%).', v_hi, v_prev using errcode = '22023';
    end if;
    select p.horometro_inicio into v_next from public.flota_partes_equipo p
     where p.activo_id = v_cae.equipo_id and p.estado = 'registrado' and not p.sin_operacion and p.fecha > v_fecha
       and p.id is distinct from v_id order by p.fecha asc limit 1;
    if v_next is not null and v_hf > v_next then
      raise exception 'El horómetro final (%) supera el inicial del parte siguiente (%).', v_hf, v_next using errcode = '22023';
    end if;
    for v_item in select * from jsonb_array_elements(coalesce(p_parte->'paradas', '[]'::jsonb)) loop
      v_h := nullif(v_item->>'horas', '')::numeric;
      v_causa := v_item->>'causa';
      v_atr := public.flota__atribucion_parada(v_causa);
      if v_h is null or v_h <= 0 or v_atr is null then
        raise exception 'Cada parada necesita horas mayores a cero y una causa válida.' using errcode = '22023';
      end if;
      if v_atr = 'proveedor' then v_hpp := v_hpp + v_h; elsif v_atr = 'cliente' then v_hpc := v_hpc + v_h; else v_hpn := v_hpn + v_h; end if;
      v_paradas := v_paradas || jsonb_build_object('horas', v_h, 'causa', v_causa, 'atribucion', v_atr,
                                                   'descripcion', nullif(btrim(v_item->>'descripcion'), ''));
    end loop;
    if v_hpp + v_hpc + v_hpn > v_hprog then
      raise exception 'Las paradas suman más que las horas programadas.' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    if exists (select 1 from public.flota_partes_equipo where contrato_equipo_id = v_cae.id and fecha = v_fecha and estado = 'registrado') then
      raise exception 'Ya existe un parte para ese equipo en esa fecha.' using errcode = '23505';
    end if;
    insert into public.flota_partes_equipo (empresa_id, sociedad_id, contrato_alquiler_id, contrato_equipo_id, activo_id, fecha, turno,
      sin_operacion, horas_programadas, horometro_inicio, horometro_fin, horas_operadas, paradas, horas_parada_proveedor,
      horas_parada_cliente, horas_parada_neutral, vb_cliente, evidencia_path, observaciones)
    values (p_empresa_id, v_cae.sociedad_id, v_cae.contrato_id, v_cae.id, v_cae.equipo_id, v_fecha, v_turno,
      v_sin, v_hprog, case when v_sin then null else v_hi end, case when v_sin then null else v_hf end, v_op, v_paradas, v_hpp,
      v_hpc, v_hpn, v_vb, v_path, nullif(btrim(p_parte->>'observaciones'), ''))
    returning * into v_row;
    perform public.flota__evento(p_empresa_id, 'parte_equipo', v_row.id::text, 'creado', jsonb_build_object('fecha', v_fecha, 'horas_operadas', v_op));
  else
    update public.flota_partes_equipo set
      turno = v_turno, sin_operacion = v_sin, horas_programadas = v_hprog,
      horometro_inicio = case when v_sin then null else v_hi end, horometro_fin = case when v_sin then null else v_hf end,
      horas_operadas = v_op, paradas = v_paradas, horas_parada_proveedor = v_hpp, horas_parada_cliente = v_hpc,
      horas_parada_neutral = v_hpn, vb_cliente = v_vb, evidencia_path = v_path,
      observaciones = nullif(btrim(p_parte->>'observaciones'), ''), updated_by = auth.uid(), updated_at = now()
    where id = v_id
    returning * into v_row;
    perform public.flota__evento(p_empresa_id, 'parte_equipo', v_row.id::text, 'actualizado',
      jsonb_build_object('antes', jsonb_build_object('horas_operadas', v_old.horas_operadas, 'paradas', v_old.paradas),
                         'despues', jsonb_build_object('horas_operadas', v_op, 'paradas', v_paradas)));
  end if;

  if not v_sin then
    update public.activos set horometro_actual = v_hf
    where id = v_cae.equipo_id and (horometro_actual is null or horometro_actual < v_hf);
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_anular_parte(p_parte_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_p public.flota_partes_equipo;
begin
  select * into v_p from public.flota_partes_equipo where id = p_parte_id for update;
  if not found or v_p.estado <> 'registrado' then
    raise exception 'El parte no existe o ya está anulado.' using errcode = '22023';
  end if;
  perform public.flota__exigir(v_p.empresa_id, 'liquidacion_flota', 'editar', 'No tiene permiso para anular partes.');
  if not public.flota_sociedad_en_alcance(v_p.empresa_id, v_p.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indique el motivo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.flota_liquidaciones l
             where l.contrato_alquiler_id = v_p.contrato_alquiler_id and l.periodo = date_trunc('month', v_p.fecha)::date
               and l.estado in ('en_revision','aprobada')) then
    raise exception 'El mes ya está en revisión o aprobado: no se pueden cambiar sus partes.' using errcode = '22023';
  end if;
  update public.flota_partes_equipo set estado = 'anulado', anulado_motivo = btrim(p_motivo), updated_by = auth.uid(), updated_at = now()
  where id = p_parte_id returning * into v_p;
  perform public.flota__evento(v_p.empresa_id, 'parte_equipo', v_p.id::text, 'anulado', jsonb_build_object('motivo', btrim(p_motivo)));
  return to_jsonb(v_p);
end;
$$;

-- =====================================================================
-- 5. RPC de liquidaciones
-- =====================================================================
create or replace function public.flota_crear_liquidacion(p_empresa_id text, p_contrato_id text, p_periodo date)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_c public.contratos_alquiler;
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_next integer;
  v_numero text;
  v_l public.flota_liquidaciones;
begin
  perform public.flota__exigir(p_empresa_id, 'liquidacion_flota', 'crear', 'No tiene permiso para crear liquidaciones.');
  select * into v_c from public.contratos_alquiler where id = p_contrato_id and empresa_id = p_empresa_id;
  if not found then
    raise exception 'Seleccione un contrato válido.' using errcode = '22023';
  end if;
  if not public.flota_sociedad_en_alcance(p_empresa_id, v_c.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  if v_periodo is null or v_periodo > date_trunc('month', current_date)::date then
    raise exception 'El periodo no puede ser futuro.' using errcode = '22023';
  end if;
  if (v_periodo + interval '1 month' - interval '1 day')::date < v_c.fecha_inicio
     or (v_c.fecha_fin is not null and v_periodo > v_c.fecha_fin) then
    raise exception 'El contrato % no está vigente en ese periodo.', v_c.numero using errcode = '22023';
  end if;
  if exists (select 1 from public.flota_liquidaciones where contrato_alquiler_id = v_c.id and periodo = v_periodo and estado <> 'anulada') then
    raise exception 'Ya existe una liquidación de ese contrato para ese mes.' using errcode = '23505';
  end if;
  perform pg_advisory_xact_lock(hashtext('flota_liquidacion:' || p_empresa_id));
  select coalesce(max(substring(numero from '-(\d+)$')::integer), 0) + 1 into v_next
  from public.flota_liquidaciones where empresa_id = p_empresa_id and numero like 'LIQ-' || to_char(current_date, 'YY') || '-%';
  v_numero := 'LIQ-' || to_char(current_date, 'YY') || '-' || lpad(v_next::text, 4, '0');
  insert into public.flota_liquidaciones (empresa_id, sociedad_id, numero, contrato_alquiler_id, periodo, moneda, meta_dmr)
  values (p_empresa_id, v_c.sociedad_id, v_numero, v_c.id, v_periodo, v_c.moneda, v_c.meta_dmr)
  returning * into v_l;
  perform public.flota__calcular_liquidacion(v_l.id);
  perform public.flota__evento(p_empresa_id, 'liquidacion', v_l.id::text, 'creada', jsonb_build_object('numero', v_numero, 'periodo', v_periodo));
  select * into v_l from public.flota_liquidaciones where id = v_l.id;
  return to_jsonb(v_l);
end;
$$;

create or replace function public.flota_recalcular_liquidacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
begin
  v_l := public.flota__liquidacion_para(p_id, 'editar', 'No tiene permiso para recalcular liquidaciones.');
  if v_l.estado <> 'borrador' then
    raise exception 'Solo se recalcula una liquidación en borrador.' using errcode = '22023';
  end if;
  perform public.flota__calcular_liquidacion(v_l.id);
  select * into v_l from public.flota_liquidaciones where id = p_id;
  return to_jsonb(v_l);
end;
$$;

create or replace function public.flota_enviar_liquidacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
  v_c public.contratos_alquiler;
  v_hasta date;
begin
  v_l := public.flota__liquidacion_para(p_id, 'editar', 'No tiene permiso para enviar liquidaciones.');
  if v_l.estado <> 'borrador' then
    raise exception 'Solo se envía a revisión una liquidación en borrador.' using errcode = '22023';
  end if;
  select * into v_c from public.contratos_alquiler where id = v_l.contrato_alquiler_id;
  v_hasta := least((v_l.periodo + interval '1 month' - interval '1 day')::date, coalesce(v_c.fecha_fin, 'infinity'::date));
  if v_hasta >= current_date then
    raise exception 'El periodo aún no termina (cierra el %).', to_char(v_hasta, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  perform public.flota__calcular_liquidacion(v_l.id);
  select * into v_l from public.flota_liquidaciones where id = p_id;
  if v_l.dias_faltantes > 0 then
    raise exception 'Faltan % partes diarios del periodo.', v_l.dias_faltantes using errcode = '22023';
  end if;
  update public.flota_liquidaciones set estado = 'en_revision', enviada_at = now(), enviada_por = auth.uid(), devuelta_motivo = null, updated_at = now()
  where id = p_id returning * into v_l;
  perform public.flota__evento(v_l.empresa_id, 'liquidacion', v_l.id::text, 'enviada', jsonb_build_object('total', v_l.total, 'dmr', v_l.dmr));
  return to_jsonb(v_l);
end;
$$;

create or replace function public.flota_devolver_liquidacion(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
begin
  v_l := public.flota__liquidacion_para(p_id, 'aprobar', 'No tiene permiso para devolver liquidaciones.');
  if v_l.estado <> 'en_revision' then
    raise exception 'Solo se devuelve una liquidación en revisión.' using errcode = '22023';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indique el motivo.' using errcode = '22023';
  end if;
  update public.flota_liquidaciones set estado = 'borrador', devuelta_motivo = btrim(p_motivo), updated_at = now()
  where id = p_id returning * into v_l;
  perform public.flota__evento(v_l.empresa_id, 'liquidacion', v_l.id::text, 'devuelta', jsonb_build_object('motivo', btrim(p_motivo)));
  return to_jsonb(v_l);
end;
$$;

create or replace function public.flota_aprobar_liquidacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
begin
  v_l := public.flota__liquidacion_para(p_id, 'aprobar', 'No tiene permiso para aprobar liquidaciones.');
  if v_l.estado <> 'en_revision' then
    raise exception 'Solo se aprueba una liquidación en revisión.' using errcode = '22023';
  end if;
  update public.flota_liquidaciones set estado = 'aprobada', aprobada_at = now(), aprobada_por = auth.uid(), updated_at = now()
  where id = p_id returning * into v_l;
  perform public.flota__evento(v_l.empresa_id, 'liquidacion', v_l.id::text, 'aprobada', jsonb_build_object('total', v_l.total, 'dmr', v_l.dmr));
  return to_jsonb(v_l);
end;
$$;

create or replace function public.flota_anular_liquidacion(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_l public.flota_liquidaciones;
begin
  v_l := public.flota__liquidacion_para(p_id, 'anular', 'No tiene permiso para anular liquidaciones.');
  if v_l.estado not in ('borrador','en_revision') then
    raise exception 'Solo se anula una liquidación en borrador o en revisión.' using errcode = '22023';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indique el motivo.' using errcode = '22023';
  end if;
  update public.flota_liquidaciones set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), anulado_motivo = btrim(p_motivo), updated_at = now()
  where id = p_id returning * into v_l;
  perform public.flota__evento(v_l.empresa_id, 'liquidacion', v_l.id::text, 'anulada', jsonb_build_object('motivo', btrim(p_motivo)));
  return to_jsonb(v_l);
end;
$$;

-- =====================================================================
-- 6. Storage: carpeta partes/ del bucket flota-rental (basadas en la versión remota vigente)
-- =====================================================================
create or replace function public.flota__pantalla_storage(p_name text)
returns text
language sql
immutable
as $$
  select case split_part(p_name, '/', 2)
    when 'actas' then 'actas_despachos'
    when 'certificaciones' then 'certificaciones_activo'
    when 'garantias' then 'garantias_flota'
    when 'partes' then 'liquidacion_flota'
  end;
$$;

create or replace function public.flota__objeto_registrado(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.acta_rental_evidencias e join public.actas_rental a on a.id = e.acta_id where e.storage_path = p_name and a.estado <> 'borrador')
      or exists (select 1 from public.acta_rental_firmas f join public.actas_rental a on a.id = f.acta_id where f.storage_path = p_name and a.estado <> 'borrador')
      or exists (select 1 from public.activo_certificaciones c where c.storage_path = p_name)
      or exists (select 1 from public.garantias_flota g where g.storage_path = p_name)
      or exists (select 1 from public.flota_partes_equipo p where p.evidencia_path = p_name and p.estado = 'registrado');
$$;

-- =====================================================================
-- 7. Permisos de ejecución
-- =====================================================================
revoke all on function public.flota__atribucion_parada(text) from public, anon;
grant execute on function public.flota__atribucion_parada(text) to authenticated;
revoke all on function public.flota__tarifa_dia(uuid, date) from public, anon, authenticated;
revoke all on function public.flota__calcular_liquidacion(uuid) from public, anon, authenticated;
revoke all on function public.flota__liquidacion_para(uuid, text, text) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.flota_guardar_parte(text, jsonb)',
    'public.flota_anular_parte(uuid, text)',
    'public.flota_crear_liquidacion(text, text, date)',
    'public.flota_recalcular_liquidacion(uuid)',
    'public.flota_enviar_liquidacion(uuid)',
    'public.flota_devolver_liquidacion(uuid, text)',
    'public.flota_aprobar_liquidacion(uuid)',
    'public.flota_anular_liquidacion(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- =====================================================================
-- 8. Permiso de pantalla liquidacion_flota (mismo criterio que PR B)
--    a) Roles que editan contratos: ver, crear y editar (aprobar y anular quedan para administradores de empresa).
--    b) Resto de roles no administradores: solo lectura.
-- =====================================================================
insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select pr.rol_id, 'liquidacion_flota', true, true, true, false, false, false, false, false, '{}'::jsonb
from public.permisos_roles pr
where pr.pantalla = 'contratos_alquiler' and pr.puede_ver and pr.puede_editar
  and not exists (select 1 from public.permisos_roles x where x.rol_id = pr.rol_id and x.pantalla = 'liquidacion_flota');

insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select r.id, 'liquidacion_flota', true, false, false, false, false, false, false, false, '{}'::jsonb
from public.roles r
where r.empresa_id is not null and r.es_superadmin is not true and r.es_admin_empresa is not true
  and not exists (select 1 from public.permisos_roles x where x.rol_id = r.id and x.pantalla = 'liquidacion_flota');

-- =====================================================================
-- 9. Comprobación: si algo no quedó como se espera, la migración se revierte sola
-- =====================================================================
do $$
declare
  t text;
  v_faltan integer;
  v_editores integer;
  v_sembrados integer;
begin
  foreach t in array array['flota_partes_equipo','flota_liquidaciones','flota_liquidacion_lineas'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Falta la tabla %.', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS no está activa en %.', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'La tabla % tiene políticas de escritura; las escrituras deben ir por RPC.', t;
    end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('flota_guardar_parte','flota_anular_parte','flota_crear_liquidacion','flota_recalcular_liquidacion',
                      'flota_enviar_liquidacion','flota_devolver_liquidacion','flota_aprobar_liquidacion','flota_anular_liquidacion')) <> 8 then
    raise exception 'Faltan funciones RPC de PR C.';
  end if;
  if has_function_privilege('authenticated', 'public.flota__calcular_liquidacion(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.flota__tarifa_dia(uuid, date)', 'execute')
     or has_function_privilege('anon', 'public.flota_guardar_parte(text, jsonb)', 'execute') then
    raise exception 'Privilegios de ejecución demasiado amplios.';
  end if;
  if public.flota__pantalla_storage('emp_x/partes/a.jpg') is distinct from 'liquidacion_flota'
     or public.flota__pantalla_storage('emp_x/actas/a.jpg') is distinct from 'actas_despachos' then
    raise exception 'flota__pantalla_storage no mapea partes/ o perdió actas/.';
  end if;
  if public.flota__atribucion_parada('falla_mecanica') <> 'proveedor' or public.flota__atribucion_parada('sin_frente') <> 'cliente'
     or public.flota__atribucion_parada('clima') <> 'neutral' or public.flota__atribucion_parada('x') is not null then
    raise exception 'Atribución de paradas incorrecta.';
  end if;
  select count(*) into v_faltan from public.roles r
  where r.empresa_id is not null and r.es_superadmin is not true and r.es_admin_empresa is not true
    and not exists (select 1 from public.permisos_roles x where x.rol_id = r.id and x.pantalla = 'liquidacion_flota' and x.puede_ver);
  if v_faltan <> 0 then
    raise exception 'Quedan % roles sin lectura de liquidacion_flota.', v_faltan;
  end if;
  select count(distinct rol_id) into v_editores from public.permisos_roles where pantalla = 'contratos_alquiler' and puede_ver and puede_editar;
  select count(*) into v_sembrados from public.permisos_roles pr
  where pr.pantalla = 'liquidacion_flota' and pr.puede_crear
    and exists (select 1 from public.permisos_roles c where c.rol_id = pr.rol_id and c.pantalla = 'contratos_alquiler' and c.puede_ver and c.puede_editar);
  if v_sembrados <> v_editores then
    raise exception 'Permisos de edición sembrados incorrectos: editores=%, sembrados=%.', v_editores, v_sembrados;
  end if;
end;
$$;
