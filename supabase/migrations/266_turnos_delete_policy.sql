-- TIDEO ERP - La tabla turnos no tenia politica RLS de DELETE.
-- aplicar_rls_pantalla() (migracion 024) solo crea select/insert/update,
-- y 054_turnos_crud_policy.sql no agrego delete. Resultado: el DELETE
-- afectaba 0 filas sin lanzar error, asi que la eliminacion no persistia
-- en BD aunque la UI la quitara de la lista localmente.

drop policy if exists turnos_delete on public.turnos;
create policy turnos_delete on public.turnos
  for delete
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'turnos', 'editar')
  );

select pg_notify('pgrst', 'reload schema');
