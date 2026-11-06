-- PR A · Flota & Alquileres: tarifa congelada por versiones, alta de equipos, pasaporte y permisos por pantalla.
-- Solo cambios aditivos. No se modifican politicas RLS de tablas existentes.

-- 0. Helper de alcance de sociedades (mismo criterio que las politicas de contratos_alquiler)
create or replace function public.flota_sociedad_en_alcance(p_empresa_id text, p_sociedad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from (select public.usuario_alcance_sociedades(p_empresa_id) as alcance) a
    where a.alcance is null or p_sociedad_id = any(a.alcance)
  );
$$;

-- 1. Versiones de tarifa congelada por equipo y contrato (solo se agregan filas, nunca se editan)
create table if not exists public.contratos_alquiler_equipo_tarifas (
  id uuid primary key default gen_random_uuid(),
  contrato_equipo_id uuid not null references public.contratos_alquiler_equipos(id) on delete cascade,
  version integer not null check (version >= 1),
  tarifa_hora numeric not null check (tarifa_hora >= 0),
  moneda text not null check (char_length(moneda) = 3),
  vigente_desde date not null default current_date,
  motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint contratos_alquiler_equipo_tarifas_version_key unique (contrato_equipo_id, version)
);

create index if not exists contratos_alquiler_equipo_tarifas_equipo_idx
  on public.contratos_alquiler_equipo_tarifas (contrato_equipo_id, version desc);

alter table public.contratos_alquiler_equipo_tarifas enable row level security;

drop policy if exists contratos_alquiler_equipo_tarifas_select on public.contratos_alquiler_equipo_tarifas;
create policy contratos_alquiler_equipo_tarifas_select
  on public.contratos_alquiler_equipo_tarifas
  for select to authenticated
  using (
    exists (
      select 1
      from public.contratos_alquiler_equipos cae
      join public.contratos_alquiler ca on ca.id = cae.contrato_alquiler_id
      where cae.id = contratos_alquiler_equipo_tarifas.contrato_equipo_id
        and public.usuario_tiene_empresa(ca.empresa_id)
        and public.usuario_puede(ca.empresa_id, 'contratos_alquiler', 'ver')
        and public.flota_sociedad_en_alcance(ca.empresa_id, ca.sociedad_id)
    )
  );

comment on table public.contratos_alquiler_equipo_tarifas is
  'Versiones de la tarifa por hora congelada de cada equipo dentro de un contrato de alquiler. Solo se escribe via RPC.';

-- Backfill: version 1 para los equipos de contratos existentes cuya tarifa se puede resolver
insert into public.contratos_alquiler_equipo_tarifas (contrato_equipo_id, version, tarifa_hora, moneda, vigente_desde, motivo)
select cae.id, 1,
       coalesce(cae.tarifa_hora_override, te.tarifa_hora),
       ca.moneda,
       ca.fecha_inicio,
       'Migracion: tarifa vigente al implementar versiones'
from public.contratos_alquiler_equipos cae
join public.contratos_alquiler ca on ca.id = cae.contrato_alquiler_id
left join public.tarifas_estandar_equipos te
  on te.activo_id = cae.equipo_id and te.moneda = ca.moneda
where coalesce(cae.tarifa_hora_override, te.tarifa_hora) is not null
  and not exists (
    select 1 from public.contratos_alquiler_equipo_tarifas v where v.contrato_equipo_id = cae.id
  );

-- 2. Documentos del equipo (pasaporte)
create table if not exists public.activo_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  activo_id text not null references public.activos(id) on delete cascade,
  tipo text not null check (tipo in ('ficha_tecnica','manual','seguro','soat','tarjeta_propiedad','certificado','foto','otro')),
  nombre text not null check (btrim(nombre) <> ''),
  storage_path text,
  fecha_emision date,
  fecha_vencimiento date,
  notas text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint activo_documentos_fechas_chk check (
    fecha_vencimiento is null or fecha_emision is null or fecha_vencimiento >= fecha_emision
  )
);

create index if not exists activo_documentos_empresa_activo_idx
  on public.activo_documentos (empresa_id, activo_id);

create or replace function public.validar_activo_documento_empresa()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.activos a
    where a.id = new.activo_id and a.empresa_id = new.empresa_id
  ) then
    raise exception 'El equipo del documento debe pertenecer a la empresa informada.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activo_documentos_validar_empresa on public.activo_documentos;
create trigger trg_activo_documentos_validar_empresa
  before insert or update on public.activo_documentos
  for each row execute function public.validar_activo_documento_empresa();

alter table public.activo_documentos enable row level security;

drop policy if exists activo_documentos_select on public.activo_documentos;
create policy activo_documentos_select on public.activo_documentos
  for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pasaporte_equipos', 'ver'));

drop policy if exists activo_documentos_insert on public.activo_documentos;
create policy activo_documentos_insert on public.activo_documentos
  for insert to authenticated
  with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pasaporte_equipos', 'crear'));

drop policy if exists activo_documentos_update on public.activo_documentos;
create policy activo_documentos_update on public.activo_documentos
  for update to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pasaporte_equipos', 'editar'))
  with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pasaporte_equipos', 'editar'));

drop policy if exists activo_documentos_delete on public.activo_documentos;
create policy activo_documentos_delete on public.activo_documentos
  for delete to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pasaporte_equipos', 'eliminar'));

comment on table public.activo_documentos is
  'Documentos adjuntos de un equipo para su pasaporte: fichas, seguros, SOAT, tarjeta de propiedad, fotos.';

-- 3. Permisos por pantalla: mismos roles que hoy tienen contratos_alquiler (ver y editar)
insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select pr.rol_id, s.pantalla, true, true, true, false, false, false, false, false, '{}'::jsonb
from public.permisos_roles pr
cross join (values ('flota_panel'), ('pasaporte_equipos')) as s(pantalla)
where pr.pantalla = 'contratos_alquiler'
  and pr.puede_ver and pr.puede_editar
  and not exists (
    select 1 from public.permisos_roles x where x.rol_id = pr.rol_id and x.pantalla = s.pantalla
  );

-- Quien hoy edita contratos ya podia crearlos de hecho (la politica de insert solo exige pertenecer a la empresa)
update public.permisos_roles
set puede_crear = true, updated_at = now()
where pantalla = 'contratos_alquiler' and puede_editar and not puede_crear;

-- 4. RPC: crear contrato con sus equipos en una sola operacion atomica
create or replace function public.crear_contrato_alquiler_con_equipos(
  p_empresa_id text,
  p_contrato jsonb,
  p_equipos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id text := gen_random_uuid()::text;
  v_sociedad uuid;
  v_numero text;
  v_moneda text;
  v_inicio date;
  v_fin date;
  v_estado text;
  v_item jsonb;
  v_equipo_id text;
  v_equipo_codigo text;
  v_tarifa numeric;
  v_std_tarifa numeric;
  v_std_moneda text;
  v_cae_id uuid;
  v_n integer := 0;
begin
  if p_empresa_id is null or btrim(p_empresa_id) = '' then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;
  if not public.usuario_puede(p_empresa_id, 'contratos_alquiler', 'crear') then
    raise exception 'No tiene permiso para crear contratos de alquiler.' using errcode = '42501';
  end if;
  if p_contrato is null or jsonb_typeof(p_contrato) <> 'object' then
    raise exception 'Los datos del contrato son obligatorios.' using errcode = '22023';
  end if;
  if p_equipos is null or jsonb_typeof(p_equipos) <> 'array' or jsonb_array_length(p_equipos) = 0 then
    raise exception 'El contrato debe incluir al menos un equipo.' using errcode = '22023';
  end if;

  v_sociedad := nullif(p_contrato->>'sociedad_id', '')::uuid;
  v_numero := nullif(btrim(p_contrato->>'numero'), '');
  v_moneda := upper(coalesce(nullif(btrim(p_contrato->>'moneda'), ''), ''));
  v_inicio := nullif(p_contrato->>'fecha_inicio', '')::date;
  v_fin := nullif(p_contrato->>'fecha_fin', '')::date;
  v_estado := coalesce(nullif(p_contrato->>'estado', ''), 'borrador');

  if v_sociedad is null then raise exception 'La sociedad del contrato es obligatoria.' using errcode = '22023'; end if;
  if v_numero is null then raise exception 'El numero del contrato es obligatorio.' using errcode = '22023'; end if;
  if nullif(p_contrato->>'cuenta_id', '') is null then raise exception 'El cliente del contrato es obligatorio.' using errcode = '22023'; end if;
  if char_length(v_moneda) <> 3 then raise exception 'La moneda del contrato debe tener 3 letras.' using errcode = '22023'; end if;
  if v_inicio is null or v_fin is null then raise exception 'Las fechas de vigencia son obligatorias.' using errcode = '22023'; end if;
  if v_fin < v_inicio then raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023'; end if;
  if nullif(p_contrato->>'meta_dmr', '') is null then raise exception 'La meta de disponibilidad (DMR) es obligatoria.' using errcode = '22023'; end if;
  if nullif(p_contrato->>'unidad_minimo_facturable', '') is null or nullif(p_contrato->>'periodicidad_minimo_facturable', '') is null then
    raise exception 'La unidad y la periodicidad del minimo facturable son obligatorias.' using errcode = '22023';
  end if;
  if v_estado not in ('borrador', 'vigente') then
    raise exception 'Un contrato nuevo solo puede crearse en borrador o vigente.' using errcode = '22023';
  end if;
  if not public.flota_sociedad_en_alcance(p_empresa_id, v_sociedad) then
    raise exception 'No tiene alcance sobre la sociedad indicada.' using errcode = '42501';
  end if;

  begin
    insert into public.contratos_alquiler (
      id, empresa_id, sociedad_id, numero, cuenta_id, unidad_minera, objeto,
      fecha_inicio, fecha_fin, minimo_facturable, unidad_minimo_facturable,
      periodicidad_minimo_facturable, meta_dmr, moneda, estado,
      centro_costo_id, centro_beneficio_id, representante_cliente, representante_empresa, proyecto_id
    ) values (
      v_id, p_empresa_id, v_sociedad, v_numero, p_contrato->>'cuenta_id',
      nullif(p_contrato->>'unidad_minera', ''), nullif(p_contrato->>'objeto', ''),
      v_inicio, v_fin, nullif(p_contrato->>'minimo_facturable', '')::numeric,
      p_contrato->>'unidad_minimo_facturable', p_contrato->>'periodicidad_minimo_facturable',
      (p_contrato->>'meta_dmr')::numeric, v_moneda, v_estado,
      nullif(p_contrato->>'centro_costo_id', ''), nullif(p_contrato->>'centro_beneficio_id', ''),
      nullif(p_contrato->>'representante_cliente', ''), nullif(p_contrato->>'representante_empresa', ''),
      nullif(p_contrato->>'proyecto_id', '')
    );
  exception when unique_violation then
    raise exception 'Ya existe un contrato con el numero %.', v_numero using errcode = '23505';
  end;

  for v_item in select * from jsonb_array_elements(p_equipos) loop
    v_equipo_id := nullif(v_item->>'equipo_id', '');
    if v_equipo_id is null then
      raise exception 'Cada equipo del contrato debe indicar su identificador.' using errcode = '22023';
    end if;

    select a.codigo into v_equipo_codigo
    from public.activos a
    where a.id = v_equipo_id
      and a.empresa_id = p_empresa_id
      and a.propietario_tipo = 'propio'
      and a.estado is distinct from 'dado_baja';
    if not found then
      raise exception 'El equipo % no existe, no es propio o esta dado de baja.', v_equipo_id using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.contratos_alquiler_equipos cae2
      join public.contratos_alquiler ca2 on ca2.id = cae2.contrato_alquiler_id
      where cae2.equipo_id = v_equipo_id
        and ca2.empresa_id = p_empresa_id
        and ca2.id <> v_id
        and ca2.estado in ('vigente', 'suspendido')
        and daterange(ca2.fecha_inicio, ca2.fecha_fin, '[]') && daterange(v_inicio, v_fin, '[]')
    ) then
      raise exception 'El equipo % ya esta en otro contrato vigente que se cruza con estas fechas.', v_equipo_codigo using errcode = '23P01';
    end if;

    v_tarifa := nullif(v_item->>'tarifa_hora', '')::numeric;
    if v_tarifa is null then
      select te.tarifa_hora, te.moneda into v_std_tarifa, v_std_moneda
      from public.tarifas_estandar_equipos te
      where te.activo_id = v_equipo_id;
      if found and v_std_moneda = v_moneda then
        v_tarifa := v_std_tarifa;
      end if;
    end if;
    if v_tarifa is null or v_tarifa < 0 then
      raise exception 'El equipo % no tiene tarifa pactada ni tarifa estandar en %.', v_equipo_codigo, v_moneda using errcode = '22023';
    end if;

    begin
      insert into public.contratos_alquiler_equipos (contrato_alquiler_id, equipo_id, tarifa_hora_override)
      values (v_id, v_equipo_id, v_tarifa)
      returning id into v_cae_id;
    exception when unique_violation then
      raise exception 'El equipo % esta repetido en el contrato.', v_equipo_codigo using errcode = '23505';
    end;

    insert into public.contratos_alquiler_equipo_tarifas (contrato_equipo_id, version, tarifa_hora, moneda, vigente_desde, motivo)
    values (v_cae_id, 1, v_tarifa, v_moneda, v_inicio, 'Tarifa inicial del contrato');

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('contrato_id', v_id, 'numero', v_numero, 'equipos', v_n);
end;
$$;

-- 5. RPC: cambiar la tarifa congelada de un equipo del contrato (agrega una version)
create or replace function public.actualizar_tarifa_equipo_contrato(
  p_contrato_equipo_id uuid,
  p_tarifa_hora numeric,
  p_motivo text,
  p_vigente_desde date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_empresa text;
  v_sociedad uuid;
  v_estado text;
  v_moneda text;
  v_version integer;
begin
  select ca.empresa_id, ca.sociedad_id, ca.estado, ca.moneda
    into v_empresa, v_sociedad, v_estado, v_moneda
  from public.contratos_alquiler_equipos cae
  join public.contratos_alquiler ca on ca.id = cae.contrato_alquiler_id
  where cae.id = p_contrato_equipo_id
  for update of cae;

  if not found then
    raise exception 'El equipo del contrato no existe.' using errcode = '22023';
  end if;
  if not public.usuario_tiene_empresa(v_empresa) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;
  if not public.usuario_puede(v_empresa, 'contratos_alquiler', 'editar') then
    raise exception 'No tiene permiso para editar contratos de alquiler.' using errcode = '42501';
  end if;
  if not public.flota_sociedad_en_alcance(v_empresa, v_sociedad) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  if v_estado in ('cerrado', 'cancelado', 'vencido') then
    raise exception 'No se puede cambiar la tarifa de un contrato %.', v_estado using errcode = '22023';
  end if;
  if p_tarifa_hora is null or p_tarifa_hora < 0 then
    raise exception 'La tarifa por hora debe ser un numero no negativo.' using errcode = '22023';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'El motivo del cambio de tarifa es obligatorio.' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.contratos_alquiler_equipo_tarifas
  where contrato_equipo_id = p_contrato_equipo_id;

  insert into public.contratos_alquiler_equipo_tarifas (contrato_equipo_id, version, tarifa_hora, moneda, vigente_desde, motivo)
  values (p_contrato_equipo_id, v_version, p_tarifa_hora, v_moneda, coalesce(p_vigente_desde, current_date), btrim(p_motivo));

  update public.contratos_alquiler_equipos
  set tarifa_hora_override = p_tarifa_hora
  where id = p_contrato_equipo_id;

  return jsonb_build_object('contrato_equipo_id', p_contrato_equipo_id, 'version', v_version, 'tarifa_hora', p_tarifa_hora, 'moneda', v_moneda);
end;
$$;

-- 6. RPC: registrar un equipo propio de la flota (codigo autogenerado si se deja en blanco)
create or replace function public.registrar_equipo_flota(
  p_empresa_id text,
  p_equipo jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id text := 'act_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  v_codigo text;
  v_nombre text;
  v_anio_fab integer;
  v_anio_over integer;
  v_horometro numeric;
  v_next integer;
  v_anio_max integer := extract(year from current_date)::integer + 1;
begin
  if p_empresa_id is null or btrim(p_empresa_id) = '' then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;
  if not public.usuario_puede(p_empresa_id, 'flota_panel', 'crear') then
    raise exception 'No tiene permiso para registrar equipos de la flota.' using errcode = '42501';
  end if;
  if p_equipo is null or jsonb_typeof(p_equipo) <> 'object' then
    raise exception 'Los datos del equipo son obligatorios.' using errcode = '22023';
  end if;

  v_nombre := nullif(btrim(p_equipo->>'nombre'), '');
  if v_nombre is null then
    raise exception 'El nombre del equipo es obligatorio.' using errcode = '22023';
  end if;

  v_anio_fab := nullif(p_equipo->>'anio_fabricacion', '')::integer;
  v_anio_over := nullif(p_equipo->>'anio_overhaul', '')::integer;
  v_horometro := nullif(p_equipo->>'horometro', '')::numeric;

  if v_anio_fab is not null and (v_anio_fab < 1950 or v_anio_fab > v_anio_max) then
    raise exception 'El ano de fabricacion debe estar entre 1950 y %.', v_anio_max using errcode = '22023';
  end if;
  if v_anio_over is not null and (v_anio_over < 1950 or v_anio_over > v_anio_max) then
    raise exception 'El ano de overhaul debe estar entre 1950 y %.', v_anio_max using errcode = '22023';
  end if;
  if v_anio_fab is not null and v_anio_over is not null and v_anio_over < v_anio_fab then
    raise exception 'El ano de overhaul no puede ser anterior al de fabricacion.' using errcode = '22023';
  end if;
  if v_horometro is not null and v_horometro < 0 then
    raise exception 'El horometro inicial no puede ser negativo.' using errcode = '22023';
  end if;

  v_codigo := nullif(btrim(p_equipo->>'codigo'), '');
  if v_codigo is null then
    perform pg_advisory_xact_lock(hashtext('activo_codigo:' || p_empresa_id));
    select coalesce(max(substring(a.codigo from '^ACT-(\d+)$')::integer), 0) + 1
      into v_next
    from public.activos a
    where a.empresa_id = p_empresa_id;
    v_codigo := 'ACT-' || lpad(v_next::text, 5, '0');
  end if;

  begin
    insert into public.activos (
      id, empresa_id, codigo, nombre, tipo_categoria, marca, modelo, placa_serie, ubicacion,
      estado, fecha_alta, propietario_tipo, tipo_activo, horometro_actual,
      "año_fabricacion", "año_overhaul", created_by, created_at, updated_at
    ) values (
      v_id, p_empresa_id, v_codigo, v_nombre,
      coalesce(nullif(btrim(p_equipo->>'tipo_categoria'), ''), 'maquinaria'),
      nullif(btrim(p_equipo->>'marca'), ''), nullif(btrim(p_equipo->>'modelo'), ''),
      nullif(btrim(p_equipo->>'placa_serie'), ''), nullif(btrim(p_equipo->>'ubicacion'), ''),
      'operativo', current_date, 'propio', 'maquinaria_completa', v_horometro,
      v_anio_fab, v_anio_over, auth.uid(), now(), now()
    );
  exception when unique_violation then
    raise exception 'Ya existe un equipo con el codigo %.', v_codigo using errcode = '23505';
  end;

  if v_horometro is not null and v_horometro > 0 then
    insert into public.historial_lecturas_activo (empresa_id, activo_id, valor, unidad, origen, registrado_por)
    values (p_empresa_id, v_id, v_horometro, 'horas', 'manual', auth.uid());
  end if;

  return jsonb_build_object('activo_id', v_id, 'codigo', v_codigo, 'nombre', v_nombre);
end;
$$;

-- 7. Permisos de ejecucion: solo usuarios autenticados
revoke all on function public.flota_sociedad_en_alcance(text, uuid) from public;
revoke all on function public.crear_contrato_alquiler_con_equipos(text, jsonb, jsonb) from public;
revoke all on function public.actualizar_tarifa_equipo_contrato(uuid, numeric, text, date) from public;
revoke all on function public.registrar_equipo_flota(text, jsonb) from public;
grant execute on function public.flota_sociedad_en_alcance(text, uuid) to authenticated;
grant execute on function public.crear_contrato_alquiler_con_equipos(text, jsonb, jsonb) to authenticated;
grant execute on function public.actualizar_tarifa_equipo_contrato(uuid, numeric, text, date) to authenticated;
grant execute on function public.registrar_equipo_flota(text, jsonb) to authenticated;

-- 8. Comprobacion: si algo no quedo como se espera, la migracion se revierte sola
do $$
declare
  v_roles integer;
  v_flota integer;
  v_pasaporte integer;
  v_crear_sin integer;
  v_cae integer;
  v_versiones integer;
begin
  if to_regclass('public.contratos_alquiler_equipo_tarifas') is null then
    raise exception 'Falta la tabla contratos_alquiler_equipo_tarifas.';
  end if;
  if to_regclass('public.activo_documentos') is null then
    raise exception 'Falta la tabla activo_documentos.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.contratos_alquiler_equipo_tarifas'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.activo_documentos'::regclass) then
    raise exception 'RLS no esta activa en las tablas nuevas.';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('flota_sociedad_en_alcance','crear_contrato_alquiler_con_equipos','actualizar_tarifa_equipo_contrato','registrar_equipo_flota')) <> 4 then
    raise exception 'Faltan funciones RPC de flota.';
  end if;

  select count(distinct rol_id) into v_roles from public.permisos_roles where pantalla = 'contratos_alquiler' and puede_ver and puede_editar;
  select count(*) into v_flota from public.permisos_roles where pantalla = 'flota_panel';
  select count(*) into v_pasaporte from public.permisos_roles where pantalla = 'pasaporte_equipos';
  if v_flota <> v_roles or v_pasaporte <> v_roles then
    raise exception 'Permisos sembrados incorrectos: roles=%, flota_panel=%, pasaporte_equipos=%', v_roles, v_flota, v_pasaporte;
  end if;

  select count(*) into v_crear_sin from public.permisos_roles where pantalla = 'contratos_alquiler' and puede_editar and not puede_crear;
  if v_crear_sin <> 0 then
    raise exception 'Quedan roles con editar y sin crear en contratos_alquiler: %', v_crear_sin;
  end if;

  select count(*) into v_cae from public.contratos_alquiler_equipos;
  select count(distinct contrato_equipo_id) into v_versiones from public.contratos_alquiler_equipo_tarifas;
  if v_versiones > v_cae then
    raise exception 'Versiones de tarifa inconsistentes: % versiones para % equipos de contrato', v_versiones, v_cae;
  end if;
end;
$$;
