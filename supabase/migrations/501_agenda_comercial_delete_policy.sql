-- Permite eliminar eventos comerciales a usuarios autorizados para anularlos.
drop policy if exists agenda_comercial_delete on public.agenda_comercial;

create policy agenda_comercial_delete on public.agenda_comercial
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'agenda_comercial', 'anular')
  );
