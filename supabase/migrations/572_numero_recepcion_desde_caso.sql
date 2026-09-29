-- Construye el numero visible RAC a partir del numero_caso reservado.
-- Las recepciones historicas no se renumeran.

create or replace function public.crear_activo_cliente_y_recepcion(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_cliente_propietario_id text,
  p_nombre text,
  p_tipo_activo text,
  p_codigo_origen text default null,
  p_marca text default null,
  p_modelo text default null,
  p_placa_serie text default null,
  p_anio_fabricacion integer default null,
  p_anio_overhaul integer default null,
  p_fecha_ingreso date default current_date,
  p_hora_ingreso time default null,
  p_guia_ingreso text default null,
  p_almacen_id text default null,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_numero_caso integer;
  v_codigo text;
  v_numero text;
  v_activo_id text;
  v_activo public.activos%rowtype;
  v_recepcion public.recepciones_activos_cliente%rowtype;
begin
  if p_empresa_id is null or btrim(p_empresa_id) = '' then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  if not public.usuario_puede(p_empresa_id, 'recepcion_activos_cliente', 'crear') then
    raise exception 'No tiene permiso para registrar activos y recepciones.' using errcode = '42501';
  end if;

  if p_sociedad_id is null or not exists (
    select 1 from public.sociedades
    where id = p_sociedad_id and empresa_id = p_empresa_id
  ) then
    raise exception 'La sociedad no existe o no pertenece a la empresa indicada.' using errcode = '22023';
  end if;

  if p_cliente_propietario_id is null or not exists (
    select 1 from public.cuentas
    where id = p_cliente_propietario_id and empresa_id = p_empresa_id
  ) then
    raise exception 'El cliente propietario no existe o no pertenece a la empresa indicada.' using errcode = '22023';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del activo es obligatorio.' using errcode = '22023';
  end if;

  if p_tipo_activo is null or p_tipo_activo not in ('componente', 'maquinaria_completa') then
    raise exception 'El tipo de activo es obligatorio y no es válido.' using errcode = '22023';
  end if;

  if p_tipo_activo = 'maquinaria_completa'
     and (p_marca is null or btrim(p_marca) = '') then
    raise exception 'La marca es obligatoria para una maquinaria completa.' using errcode = '22023';
  end if;

  if p_tipo_activo = 'maquinaria_completa'
     and (p_modelo is null or btrim(p_modelo) = '') then
    raise exception 'El modelo es obligatorio para una maquinaria completa.' using errcode = '22023';
  end if;

  if p_anio_fabricacion is not null
     and (p_anio_fabricacion < 1800 or p_anio_fabricacion > extract(year from current_date)::integer + 1) then
    raise exception 'El año de fabricación no está en un rango válido.' using errcode = '22023';
  end if;

  if p_anio_overhaul is not null
     and (p_anio_overhaul < 1800 or p_anio_overhaul > extract(year from current_date)::integer + 1) then
    raise exception 'El año de overhaul no está en un rango válido.' using errcode = '22023';
  end if;

  if p_almacen_id is null or not exists (
    select 1 from public.almacenes
    where id = p_almacen_id and empresa_id = p_empresa_id
  ) then
    raise exception 'El almacén no existe o no pertenece a la empresa indicada.' using errcode = '22023';
  end if;

  v_numero_caso := public.abrir_o_heredar_numero_caso(
    p_empresa_id,
    null,
    null,
    p_cliente_propietario_id
  );

  if v_numero_caso is null then
    raise exception 'No se pudo abrir el número de caso.' using errcode = '22023';
  end if;

  v_codigo := 'ACT-' || lpad(v_numero_caso::text, 5, '0');
  v_numero := 'RAC-' || to_char(current_date, 'YYYY') || '-' || lpad(v_numero_caso::text, 5, '0');

  if exists (
    select 1 from public.activos
    where empresa_id = p_empresa_id and codigo = v_codigo
  ) then
    raise exception 'El código de activo % ya existe en la empresa.', v_codigo
      using errcode = '23505';
  end if;

  v_activo_id := 'act_' || replace(gen_random_uuid()::text, '-', '')::text;
  v_activo_id := left(v_activo_id, 22);

  insert into public.activos (
    id,
    empresa_id,
    codigo,
    codigo_origen,
    nombre,
    tipo_categoria,
    marca,
    modelo,
    placa_serie,
    año_fabricacion,
    año_overhaul,
    estado,
    observacion,
    propietario_tipo,
    cliente_propietario_id,
    tipo_activo,
    created_by
  ) values (
    v_activo_id,
    p_empresa_id,
    v_codigo,
    nullif(btrim(p_codigo_origen), ''),
    btrim(p_nombre),
    'equipo',
    nullif(btrim(p_marca), ''),
    nullif(btrim(p_modelo), ''),
    nullif(btrim(p_placa_serie), ''),
    p_anio_fabricacion,
    p_anio_overhaul,
    'operativo',
    nullif(btrim(p_observaciones), ''),
    'cliente',
    p_cliente_propietario_id,
    p_tipo_activo,
    auth.uid()
  )
  returning * into v_activo;

  insert into public.recepciones_activos_cliente (
    empresa_id,
    numero,
    numero_caso,
    activo_id,
    sociedad_id,
    fecha_ingreso,
    hora_ingreso,
    guia_ingreso,
    estado,
    almacen_id,
    observaciones
  ) values (
    p_empresa_id,
    v_numero,
    v_numero_caso,
    v_activo_id,
    p_sociedad_id,
    coalesce(p_fecha_ingreso, current_date),
    p_hora_ingreso,
    nullif(btrim(p_guia_ingreso), ''),
    'pendiente_cotizar',
    p_almacen_id,
    nullif(btrim(p_observaciones), '')
  )
  returning * into v_recepcion;

  return jsonb_build_object(
    'activo', to_jsonb(v_activo),
    'recepcion', to_jsonb(v_recepcion),
    'numero_caso', v_numero_caso,
    'codigo', v_codigo
  );
end;
$$;

revoke all on function public.crear_activo_cliente_y_recepcion(
  text, uuid, text, text, text, text, text, text, text, integer, integer,
  date, time, text, text, text
) from public, anon;
grant execute on function public.crear_activo_cliente_y_recepcion(
  text, uuid, text, text, text, text, text, text, text, integer, integer,
  date, time, text, text, text
) to authenticated, service_role;
