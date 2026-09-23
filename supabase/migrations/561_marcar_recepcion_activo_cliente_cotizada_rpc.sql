-- 561 · Permite completar la transición comercial de una recepción desde la
-- creación de cotizaciones sin otorgar editar genérico sobre la recepción.

create or replace function public.marcar_recepcion_activo_cliente_cotizada(
  p_empresa_id text,
  p_recepcion_id text
)
returns table(id text, estado text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  if not public.usuario_puede(p_empresa_id, 'cotizaciones', 'crear') then
    raise exception 'No tiene permiso para crear cotizaciones en esta empresa.' using errcode = '42501';
  end if;

  return query
  update public.recepciones_activos_cliente r
     set estado = 'cotizado'
   where r.empresa_id = p_empresa_id
     and r.id = p_recepcion_id
     and r.estado = 'pendiente_cotizar'
  returning r.id, r.estado;

  if not found then
    raise exception 'La recepción ya no está pendiente de cotizar; no se creó la cotización vinculada.';
  end if;
end;
$$;

revoke all on function public.marcar_recepcion_activo_cliente_cotizada(text, text)
  from public, anon;
grant execute on function public.marcar_recepcion_activo_cliente_cotizada(text, text)
  to authenticated, service_role;
