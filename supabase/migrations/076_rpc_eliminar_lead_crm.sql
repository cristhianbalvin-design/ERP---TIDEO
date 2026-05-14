-- Eliminacion persistente de leads desde UI.
-- Complementa la policy DELETE con un RPC security definer para evitar deletes silenciosos por RLS.
-- Valida pertenencia al tenant y permiso de editar/anular Leads antes de borrar.

create or replace function public.eliminar_lead_crm(p_lead_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
begin
  select empresa_id into v_empresa_id
  from public.leads
  where id = p_lead_id;

  if v_empresa_id is null then
    return false;
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso a la empresa del lead.';
  end if;

  if not (
    public.usuario_puede(v_empresa_id, 'leads', 'editar')
    or public.usuario_puede(v_empresa_id, 'leads', 'anular')
  ) then
    raise exception 'No tienes permiso para eliminar leads.';
  end if;

  -- Mantener trazabilidad en documentos derivados sin bloquear el borrado.
  update public.oportunidades
  set lead_id = null
  where lead_id = p_lead_id;

  update public.actividades_comerciales
  set lead_id = null
  where lead_id = p_lead_id;

  update public.actividades_comerciales
  set vinculo_id = null
  where vinculo_tipo = 'lead'
    and vinculo_id = p_lead_id;

  update public.agenda_comercial
  set lead_id = null
  where lead_id = p_lead_id;

  delete from public.leads
  where id = p_lead_id;

  return found;
end;
$$;

grant execute on function public.eliminar_lead_crm(text) to authenticated;
