-- 495 · La vigencia de borrador del documento sólo se exige al vincularlo
-- por primera vez. Su identidad/alcance se revalida en cada escritura.

create or replace function public.derivar_contexto_cotizacion_especial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo public.tipos_documento_electronico%rowtype;
  v_cuenta_empresa_id text;
  v_oportunidad_empresa_id text;
  v_hoja record;
  v_plantilla record;
  v_documento record;
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

  if not found
     or v_plantilla.empresa_id is distinct from new.empresa_id
     or v_plantilla.sociedad_id is distinct from new.sociedad_id
     or v_plantilla.tipo_documento_id is distinct from new.tipo_documento_id
     or v_plantilla.estado is distinct from 'publicada' then
    raise exception 'La plantilla debe estar publicada y pertenecer al mismo tipo, empresa y sociedad.';
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

select pg_notify('pgrst', 'reload schema');
