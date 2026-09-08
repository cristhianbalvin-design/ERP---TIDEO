-- El parámetro de salida `id` de RETURNS TABLE comparte nombre con la columna
-- de plantillas; se califica la columna para evitar SQLSTATE 42702.
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

  select plantilla.empresa_id,
         plantilla.sociedad_id,
         plantilla.tipo_documento_id,
         plantilla.estado
    into v_plantilla
  from public.plantillas_documento_bloques plantilla
  where plantilla.id = p_plantilla_documento_id;

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
