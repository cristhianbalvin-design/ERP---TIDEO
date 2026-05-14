-- Permite que el boton Eliminar lead persista en BD.
-- RLS no tenia politica DELETE para public.leads; sin esta policy Supabase no borra filas.
-- Usamos permiso editar/anular de Leads, y admins siguen cubiertos por usuario_puede().

drop policy if exists crm_leads_delete on public.leads;

create policy crm_leads_delete on public.leads
for delete
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'leads', 'editar')
    or public.usuario_puede(empresa_id, 'leads', 'anular')
  )
);
