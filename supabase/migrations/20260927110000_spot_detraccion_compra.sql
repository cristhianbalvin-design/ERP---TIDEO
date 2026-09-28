-- SPOT / Bloque 3b-1: registrar la obligacion de detraccion de compra.
-- La obligacion se crea despues de la CxP y antes del pago atomico 3b-2.

do $guard$
begin
  if to_regclass('public.detracciones') is null
     or to_regclass('public.cxp') is null
     or to_regclass('public.spot_catalogo') is null then
    raise exception 'B3B1_GUARD|faltan tablas base de detracciones, cxp o spot_catalogo';
  end if;

  if to_regprocedure('public.registrar_detraccion_compra(text,jsonb)') is not null
     or to_regprocedure('public.corregir_detraccion_compra(uuid,jsonb)') is not null
     or to_regprocedure('public.anular_detraccion_compra(uuid)') is not null
     or to_regprocedure('public.calcular_detraccion_compra(text,jsonb)') is not null then
    raise exception 'B3B1_GUARD|una funcion del bloque ya existe; no se reemplaza';
  end if;
end;
$guard$;

alter table public.detracciones
  drop constraint if exists detracciones_origen_catalogo_ck;

alter table public.detracciones
  add constraint detracciones_origen_catalogo_ck check (
    origen = 'importacion'
    or (origen in ('emision', 'registro_compra') and spot_catalogo_id is not null)
  );

alter table public.detracciones
  drop constraint if exists detracciones_origen_ck;

alter table public.detracciones
  add constraint detracciones_origen_ck check (
    origen in ('emision', 'importacion', 'registro_compra')
  );

create unique index detracciones_compra_cxp_activa_unq
  on public.detracciones (cxp_id)
  where direccion = 'compra'
    and cxp_id is not null
    and estado <> 'anulada';

-- Resuelve y calcula una obligacion usando la misma vigencia, umbral y
-- redondeo observados en emitir_factura_cxc_atomico(pg_get_functiondef remoto).
-- No se concede EXECUTE al usuario: solo la invocan las funciones publicas
-- de alta y correccion, que hacen la autorizacion y los bloqueos.
create function public.calcular_detraccion_compra(
  p_cxp_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_cxp public.cxp%rowtype;
  v_spot public.spot_catalogo%rowtype;
  v_fecha date;
  v_moneda text;
  v_codigo text := nullif(btrim(coalesce(p_payload ->> 'codigo_spot', '')), '');
  v_spot_id uuid := nullif(btrim(coalesce(p_payload ->> 'spot_catalogo_id', '')), '')::uuid;
  v_porcentaje_payload numeric := nullif(btrim(coalesce(p_payload ->> 'porcentaje', '')), '')::numeric;
  v_tipo_cambio numeric := nullif(btrim(coalesce(p_payload ->> 'tipo_cambio_detraccion', '')), '')::numeric;
  v_tipo_cambio_fuente text := nullif(lower(btrim(coalesce(p_payload ->> 'tipo_cambio_fuente', ''))), '');
  v_total numeric;
  v_base_soles numeric;
  v_monto_origen numeric;
  v_monto_soles numeric;
begin
  select * into v_cxp
  from public.cxp
  where id = p_cxp_id;

  if not found then
    raise exception 'La CxP % no existe.', p_cxp_id;
  end if;

  v_fecha := v_cxp.fecha_emision;
  if v_fecha is null then
    raise exception 'La CxP % no tiene fecha de emision.', p_cxp_id;
  end if;

  v_moneda := upper(coalesce(v_cxp.moneda, 'PEN'));
  if v_moneda not in ('PEN', 'USD') then
    raise exception 'La moneda % de la CxP no es compatible con SPOT.', v_moneda;
  end if;

  if v_spot_id is null and v_codigo is null then
    raise exception 'Debes informar codigo_spot o spot_catalogo_id.';
  end if;

  -- La funcion de Ventas resuelve la version vigente por codigo y fecha,
  -- ordenando por la vigencia mas reciente. Un id explicito tambien debe
  -- corresponder a una version activa y vigente en la fecha del documento.
  if v_spot_id is not null then
    select c.* into v_spot
    from public.spot_catalogo c
    where c.id = v_spot_id
      and c.estado = 'activo'
      and c.vigencia_desde <= v_fecha
      and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha);
    if not found then
      raise exception 'El spot_catalogo_id no esta vigente para la fecha de la CxP.';
    end if;
    if v_codigo is not null and v_codigo <> v_spot.codigo then
      raise exception 'El codigo SPOT no coincide con spot_catalogo_id.';
    end if;
  else
    select c.* into v_spot
    from public.spot_catalogo c
    where c.codigo = v_codigo
      and c.estado = 'activo'
      and c.vigencia_desde <= v_fecha
      and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha)
    order by c.vigencia_desde desc
    limit 1;
    if not found then
      raise exception 'El codigo SPOT % no tiene una version vigente para la fecha de emision.', v_codigo;
    end if;
  end if;

  if v_porcentaje_payload is not null
     and abs(v_porcentaje_payload - v_spot.porcentaje) > 0.0001 then
    raise exception 'El porcentaje informado no coincide con el porcentaje vigente del catalogo.';
  end if;

  v_total := round(coalesce(v_cxp.monto_total, 0), 2);
  if v_total <= 0 then
    raise exception 'La CxP debe tener un monto_total mayor que cero.';
  end if;

  if v_moneda = 'USD' then
    if v_tipo_cambio is null or v_tipo_cambio <= 0 then
      raise exception 'Para una CxP USD con detraccion debes informar tipo_cambio_detraccion en soles por dolar.';
    end if;
    if v_tipo_cambio_fuente not in ('manual', 'referencial') then
      raise exception 'Para una CxP USD con detraccion debes informar tipo_cambio_fuente como manual o referencial.';
    end if;
    v_base_soles := round(v_total * v_tipo_cambio, 2);
    v_monto_origen := round(v_total * v_spot.porcentaje / 100, 2);
    v_monto_soles := round(v_base_soles * v_spot.porcentaje / 100, 0);
  else
    v_tipo_cambio := null;
    v_tipo_cambio_fuente := null;
    v_base_soles := round(v_total, 2);
    v_monto_soles := round(v_base_soles * v_spot.porcentaje / 100, 0);
    -- Correccion aprobada para PEN: el importe de origen es el importe
    -- efectivamente depositado, ya redondeado a soles enteros.
    v_monto_origen := v_monto_soles;
  end if;

  if not (
    (v_spot.umbral_operador = '>' and v_base_soles > v_spot.monto_minimo)
    or (v_spot.umbral_operador = '>=' and v_base_soles >= v_spot.monto_minimo)
  ) then
    raise exception 'La base SPOT de S/ % no supera el minimo de S/ % para el codigo %.',
      to_char(v_base_soles, 'FM999999999990.00'),
      to_char(v_spot.monto_minimo, 'FM999999999990.00'),
      v_spot.codigo;
  end if;

  return jsonb_build_object(
    'spot_catalogo_id', v_spot.id,
    'codigo_spot', v_spot.codigo,
    'porcentaje', v_spot.porcentaje,
    'base_soles', v_base_soles,
    'monto_detraccion_soles', v_monto_soles,
    'monto_detraccion_origen', v_monto_origen,
    'moneda_origen', v_moneda,
    'tipo_cambio', v_tipo_cambio,
    'tipo_cambio_fuente', v_tipo_cambio_fuente
  );
end;
$function$;

create function public.registrar_detraccion_compra(
  p_cxp_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_empresa_id text;
  v_ver_finanzas boolean;
  v_cxp public.cxp%rowtype;
  v_detraccion public.detracciones%rowtype;
  v_calculo jsonb;
begin
  select c.empresa_id into v_empresa_id
  from public.cxp c
  where c.id = p_cxp_id;
  if not found then raise exception 'La CxP % no existe.', p_cxp_id; end if;

  v_ver_finanzas := public.usuario_es_admin_empresa(v_empresa_id)
    or exists (
      select 1
      from public.usuarios_empresas ue
      join public.permisos_roles pr on pr.rol_id = ue.rol_id
      where ue.user_id = auth.uid()
        and ue.empresa_id = v_empresa_id
        and ue.estado = 'activo'
        and pr.puede_ver_finanzas = true
    );
  if not public.usuario_tiene_empresa(v_empresa_id)
     or not (public.usuario_puede(v_empresa_id, 'cxp', 'editar') or v_ver_finanzas) then
    raise exception 'No tienes permiso para registrar una detraccion de compra.';
  end if;

  select * into v_cxp
  from public.cxp
  where id = p_cxp_id
  for update;

  if lower(coalesce(v_cxp.estado, '')) in ('anulada', 'pagada') then
    raise exception 'No se puede registrar SPOT sobre una CxP anulada o pagada.';
  end if;
  if coalesce(v_cxp.saldo, coalesce(v_cxp.monto_total, 0) - coalesce(v_cxp.monto_pagado, 0)) <= 0 then
    raise exception 'No se puede registrar SPOT sobre una CxP sin saldo.';
  end if;
  if coalesce(v_cxp.monto_pagado, 0) > 0
     or exists (select 1 from public.cxp_pagos p where p.cxp_id = v_cxp.id) then
    raise exception 'No se puede registrar SPOT sobre una CxP con pagos previos.';
  end if;
  if v_cxp.proveedor_id is null then
    raise exception 'La CxP debe tener proveedor para registrar una detraccion de compra.';
  end if;
  if v_cxp.sociedad_id is null then
    raise exception 'La CxP debe tener sociedad para registrar una detraccion de compra.';
  end if;
  if exists (
    select 1 from public.detracciones d
    where d.cxp_id = v_cxp.id
      and d.direccion = 'compra'
      and d.estado <> 'anulada'
  ) then
    raise exception 'La CxP ya tiene una detraccion de compra activa.';
  end if;

  v_calculo := public.calcular_detraccion_compra(v_cxp.id, coalesce(p_payload, '{}'::jsonb));

  insert into public.detracciones (
    direccion, cxp_id, empresa_id, sociedad_id, spot_catalogo_id, codigo_spot,
    porcentaje, base_soles, monto_detraccion_soles, monto_detraccion_origen,
    moneda_origen, tipo_cambio, tipo_cambio_fuente, origen, estado
  ) values (
    'compra', v_cxp.id, v_cxp.empresa_id, v_cxp.sociedad_id,
    (v_calculo ->> 'spot_catalogo_id')::uuid,
    v_calculo ->> 'codigo_spot',
    (v_calculo ->> 'porcentaje')::numeric,
    (v_calculo ->> 'base_soles')::numeric,
    (v_calculo ->> 'monto_detraccion_soles')::numeric,
    (v_calculo ->> 'monto_detraccion_origen')::numeric,
    v_calculo ->> 'moneda_origen',
    nullif(v_calculo ->> 'tipo_cambio', '')::numeric,
    nullif(v_calculo ->> 'tipo_cambio_fuente', ''),
    'registro_compra', 'pendiente'
  ) returning * into v_detraccion;

  return jsonb_build_object('cxp', to_jsonb(v_cxp), 'detraccion', to_jsonb(v_detraccion));
end;
$function$;

create function public.corregir_detraccion_compra(
  p_detraccion_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_detraccion public.detracciones%rowtype;
  v_cxp public.cxp%rowtype;
  v_cxp_id text;
  v_empresa_id text;
  v_ver_finanzas boolean;
  v_calculo jsonb;
begin
  select d.cxp_id, d.empresa_id into v_cxp_id, v_empresa_id
  from public.detracciones d
  where d.id = p_detraccion_id;
  if not found then raise exception 'La detraccion % no existe.', p_detraccion_id; end if;

  v_ver_finanzas := public.usuario_es_admin_empresa(v_empresa_id)
    or exists (
      select 1 from public.usuarios_empresas ue
      join public.permisos_roles pr on pr.rol_id = ue.rol_id
      where ue.user_id = auth.uid() and ue.empresa_id = v_empresa_id
        and ue.estado = 'activo' and pr.puede_ver_finanzas = true
    );
  if not public.usuario_tiene_empresa(v_empresa_id)
     or not (public.usuario_puede(v_empresa_id, 'cxp', 'editar') or v_ver_finanzas) then
    raise exception 'No tienes permiso para corregir una detraccion de compra.';
  end if;

  -- Mantener el orden CxP -> detraccion, igual que el futuro pago atomico 3b-2.
  select * into v_cxp from public.cxp where id = v_cxp_id for update;
  if not found then raise exception 'La CxP de la detraccion no existe.'; end if;

  select * into v_detraccion
  from public.detracciones
  where id = p_detraccion_id
  for update;
  if v_detraccion.direccion <> 'compra' then raise exception 'La detraccion no es de compra.'; end if;
  if v_detraccion.estado <> 'pendiente' then raise exception 'Solo se puede corregir una detraccion pendiente.'; end if;
  if exists (select 1 from public.movimientos_tesoreria m where m.detraccion_id = v_detraccion.id) then
    raise exception 'No se puede corregir una detraccion con movimientos vinculados.';
  end if;

  if lower(coalesce(v_cxp.estado, '')) in ('anulada', 'pagada')
     or coalesce(v_cxp.monto_pagado, 0) > 0
     or exists (select 1 from public.cxp_pagos p where p.cxp_id = v_cxp.id) then
    raise exception 'No se puede corregir una detraccion de una CxP ya pagada o anulada.';
  end if;

  v_calculo := public.calcular_detraccion_compra(v_cxp.id, coalesce(p_payload, '{}'::jsonb));

  update public.detracciones
  set spot_catalogo_id = (v_calculo ->> 'spot_catalogo_id')::uuid,
      codigo_spot = v_calculo ->> 'codigo_spot',
      porcentaje = (v_calculo ->> 'porcentaje')::numeric,
      base_soles = (v_calculo ->> 'base_soles')::numeric,
      monto_detraccion_soles = (v_calculo ->> 'monto_detraccion_soles')::numeric,
      monto_detraccion_origen = (v_calculo ->> 'monto_detraccion_origen')::numeric,
      moneda_origen = v_calculo ->> 'moneda_origen',
      tipo_cambio = nullif(v_calculo ->> 'tipo_cambio', '')::numeric,
      tipo_cambio_fuente = nullif(v_calculo ->> 'tipo_cambio_fuente', ''),
      actualizado_en = now()
  where id = v_detraccion.id
  returning * into v_detraccion;

  return jsonb_build_object('cxp', to_jsonb(v_cxp), 'detraccion', to_jsonb(v_detraccion));
end;
$function$;

create function public.anular_detraccion_compra(
  p_detraccion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_detraccion public.detracciones%rowtype;
  v_cxp public.cxp%rowtype;
  v_cxp_id text;
  v_empresa_id text;
  v_ver_empresa boolean;
begin
  select d.cxp_id, d.empresa_id into v_cxp_id, v_empresa_id
  from public.detracciones d
  where id = p_detraccion_id;
  if not found then raise exception 'La detraccion % no existe.', p_detraccion_id; end if;

  v_ver_empresa := public.usuario_tiene_empresa(v_empresa_id);
  if not v_ver_empresa or not public.usuario_puede(v_empresa_id, 'cxp', 'anular') then
    raise exception 'No tienes permiso para anular una detraccion de compra.';
  end if;

  -- Mantener el orden CxP -> detraccion, igual que el futuro pago atomico 3b-2.
  select * into v_cxp from public.cxp where id = v_cxp_id for update;
  if not found then raise exception 'La CxP de la detraccion no existe.'; end if;

  select * into v_detraccion
  from public.detracciones
  where id = p_detraccion_id
  for update;
  if v_detraccion.direccion <> 'compra' then raise exception 'La detraccion no es de compra.'; end if;
  if v_detraccion.estado <> 'pendiente' then
    raise exception 'Solo se puede anular una detraccion pendiente.';
  end if;
  if exists (select 1 from public.movimientos_tesoreria m where m.detraccion_id = v_detraccion.id) then
    raise exception 'No se puede anular una detraccion con movimientos vinculados.';
  end if;

  update public.detracciones
  set estado = 'anulada', actualizado_en = now()
  where id = v_detraccion.id
  returning * into v_detraccion;

  return jsonb_build_object('ok', true, 'detraccion', to_jsonb(v_detraccion));
end;
$function$;

revoke all on function public.calcular_detraccion_compra(text,jsonb) from public, anon, authenticated;
revoke all on function public.registrar_detraccion_compra(text,jsonb) from public, anon, authenticated;
revoke all on function public.corregir_detraccion_compra(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.anular_detraccion_compra(uuid) from public, anon, authenticated;
grant execute on function public.registrar_detraccion_compra(text,jsonb) to authenticated;
grant execute on function public.corregir_detraccion_compra(uuid,jsonb) to authenticated;
grant execute on function public.anular_detraccion_compra(uuid) to authenticated;

do $validate$
declare
  v_def text;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'detracciones'
      and indexname = 'detracciones_compra_cxp_activa_unq'
  ) then raise exception 'B3B1_VALIDACION|indice_unico_compra_ausente'; end if;

  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.detracciones'::regclass
    and conname = 'detracciones_origen_ck';
  if v_def is null or v_def not like '%registro_compra%' then
    raise exception 'B3B1_VALIDACION|origen_registro_compra_no_permitido';
  end if;

  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.detracciones'::regclass
    and conname = 'detracciones_origen_catalogo_ck';
  if v_def is null or v_def not like '%registro_compra%' then
    raise exception 'B3B1_VALIDACION|origen_catalogo_no_actualizado';
  end if;

  if not has_function_privilege('authenticated', 'public.registrar_detraccion_compra(text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.corregir_detraccion_compra(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.anular_detraccion_compra(uuid)', 'EXECUTE') then
    raise exception 'B3B1_VALIDACION|grant_authenticated_ausente';
  end if;
  if has_function_privilege('anon', 'public.registrar_detraccion_compra(text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.corregir_detraccion_compra(uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.anular_detraccion_compra(uuid)', 'EXECUTE') then
    raise exception 'B3B1_VALIDACION|anon_tiene_execute';
  end if;

  raise notice 'B3B1_VALIDACION|origen=registro_compra|indice_unico=ok|funciones=ok|grants=ok';
end;
$validate$;
