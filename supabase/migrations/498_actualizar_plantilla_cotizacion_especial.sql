-- Un borrador conserva la plantilla con la que fue creado aunque una versión
-- posterior archive esa fila. Solo se exige una plantilla publicada al crear
-- la cotización o al sustituir explícitamente la plantilla vinculada.
create or replace function public.derivar_contexto_cotizacion_especial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo public.tipos_documento_electronico%rowtype;
  v_cuenta_empresa_id text;
  v_contacto record;
  v_oportunidad_empresa_id text;
  v_hoja record;
  v_plantilla record;
  v_documento record;
  v_cambio_plantilla boolean;
  v_vinculacion_inicial boolean;
begin
  select * into v_tipo
  from public.tipos_documento_electronico
  where id = new.tipo_documento_id;

  if not found then
    raise exception 'El tipo de documento % no existe.', new.tipo_documento_id;
  end if;

  if v_tipo.categoria_base <> 'cotizacion' or not v_tipo.activo then
    raise exception 'El tipo de documento debe estar activo y ser de categoría cotizacion.';
  end if;

  new.empresa_id := v_tipo.empresa_id;
  new.sociedad_id := v_tipo.sociedad_id;

  select empresa_id into v_cuenta_empresa_id
  from public.cuentas
  where id = new.cuenta_id;

  if not found or v_cuenta_empresa_id is distinct from new.empresa_id then
    raise exception 'La cuenta debe pertenecer a la misma empresa que el tipo de documento.';
  end if;

  if new.contacto_id is not null then
    select empresa_id, cuenta_id into v_contacto
    from public.contactos
    where id = new.contacto_id;

    if not found
       or v_contacto.empresa_id is distinct from new.empresa_id
       or v_contacto.cuenta_id is distinct from new.cuenta_id then
      raise exception 'El contacto debe pertenecer a la misma empresa y cuenta de la Cotización Especial.';
    end if;
  end if;

  if new.oportunidad_id is not null then
    select empresa_id into v_oportunidad_empresa_id
    from public.oportunidades
    where id = new.oportunidad_id;

    if not found or v_oportunidad_empresa_id is distinct from new.empresa_id then
      raise exception 'La oportunidad debe pertenecer a la misma empresa que el tipo de documento.';
    end if;
  end if;

  if new.origen_items = 'hoja_costeo' then
    select empresa_id, sociedad_id, estado into v_hoja
    from public.hojas_costeo
    where id = new.hoja_costeo_id;

    if not found
       or v_hoja.empresa_id is distinct from new.empresa_id
       or v_hoja.sociedad_id is distinct from new.sociedad_id
       or v_hoja.estado is distinct from 'aprobada' then
      raise exception 'La Hoja de Costeo debe estar aprobada y pertenecer a la misma empresa y sociedad.';
    end if;
  end if;

  select empresa_id, sociedad_id, tipo_documento_id, estado into v_plantilla
  from public.plantillas_documento_bloques
  where id = new.plantilla_documento_id;

  v_cambio_plantilla := tg_op = 'INSERT'
    or old.plantilla_documento_id is distinct from new.plantilla_documento_id;

  if not found
     or v_plantilla.empresa_id is distinct from new.empresa_id
     or v_plantilla.sociedad_id is distinct from new.sociedad_id
     or v_plantilla.tipo_documento_id is distinct from new.tipo_documento_id
     or (v_cambio_plantilla and v_plantilla.estado is distinct from 'publicada') then
    raise exception 'La plantilla debe estar publicada al crear o cambiar la plantilla, y pertenecer al mismo tipo, empresa y sociedad.';
  end if;

  v_vinculacion_inicial := new.documento_generado_id is not null
    and (tg_op = 'INSERT' or old.documento_generado_id is null);

  if new.documento_generado_id is not null then
    select empresa_id, sociedad_id, tipo_documento_id, entidad_tipo, entidad_id, estado into v_documento
    from public.documentos_generados
    where id = new.documento_generado_id;

    if not found
       or v_documento.empresa_id is distinct from new.empresa_id
       or v_documento.sociedad_id is distinct from new.sociedad_id
       or v_documento.tipo_documento_id is distinct from new.tipo_documento_id
       or v_documento.entidad_tipo is distinct from 'cotizacion_especial'
       or v_documento.entidad_id is distinct from new.id::text
       or (v_vinculacion_inicial and v_documento.estado is distinct from 'borrador') then
      raise exception 'El documento generado debe pertenecer a esta Cotización Especial, tipo, empresa y sociedad; al vincularlo debe estar en borrador.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.derivar_contexto_cotizacion_especial()
  from public, anon, authenticated, service_role;

create or replace function public.actualizar_plantilla_cotizacion_especial(
  p_id uuid,
  p_plantilla_documento_id uuid
)
returns table(id uuid, plantilla_documento_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cotizacion public.cotizaciones_especiales%rowtype;
  v_plantilla record;
  v_alcance uuid[];
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para editar una Cotización Especial.' using errcode = '42501';
  end if;

  select cotizacion.* into v_cotizacion
  from public.cotizaciones_especiales cotizacion
  where cotizacion.id = p_id
  for update;

  if not found then
    raise exception 'La Cotización Especial no existe.' using errcode = 'P0002';
  end if;

  if v_cotizacion.estado <> 'borrador' then
    raise exception 'Sólo se puede cambiar la plantilla de una cotización en borrador.' using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(v_cotizacion.empresa_id)
     or not public.usuario_puede(v_cotizacion.empresa_id, 'cotizaciones', 'editar') then
    raise exception 'No tiene permiso para editar cotizaciones en esta empresa.' using errcode = '42501';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_cotizacion.empresa_id);
  if v_alcance is not null
     and not coalesce(v_cotizacion.sociedad_id = any(v_alcance), false) then
    raise exception 'No tiene alcance sobre la sociedad de esta cotización.' using errcode = '42501';
  end if;

  select empresa_id, sociedad_id, tipo_documento_id, estado into v_plantilla
  from public.plantillas_documento_bloques
  where id = p_plantilla_documento_id;

  if not found
     or v_plantilla.estado is distinct from 'publicada'
     or v_plantilla.empresa_id is distinct from v_cotizacion.empresa_id
     or v_plantilla.sociedad_id is distinct from v_cotizacion.sociedad_id
     or v_plantilla.tipo_documento_id is distinct from v_cotizacion.tipo_documento_id then
    raise exception 'La nueva plantilla debe estar publicada y pertenecer al mismo tipo, empresa y sociedad.' using errcode = '22023';
  end if;

  update public.cotizaciones_especiales cotizacion
  set plantilla_documento_id = p_plantilla_documento_id,
      updated_at = now()
  where cotizacion.id = p_id
  returning cotizacion.id, cotizacion.plantilla_documento_id
  into id, plantilla_documento_id;

  return next;
end;
$$;

revoke all on function public.actualizar_plantilla_cotizacion_especial(uuid, uuid)
  from public, anon, service_role;

grant execute on function public.actualizar_plantilla_cotizacion_especial(uuid, uuid)
  to authenticated;

select pg_notify('pgrst', 'reload schema');
