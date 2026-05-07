-- TIDEO ERP - Politicas DELETE para Maestros Base
-- Permite eliminar registros desde la UI cuando el usuario tiene permiso de editar Maestros.

drop policy if exists mst_cargos_delete on public.cargos_empresa;
create policy mst_cargos_delete on public.cargos_empresa
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_especialidades_delete on public.especialidades_tecnicas;
create policy mst_especialidades_delete on public.especialidades_tecnicas
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_tipos_servicio_delete on public.tipos_servicio_interno;
create policy mst_tipos_servicio_delete on public.tipos_servicio_interno
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_sedes_delete on public.sedes;
create policy mst_sedes_delete on public.sedes
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_almacenes_delete on public.almacenes;
create policy mst_almacenes_delete on public.almacenes
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'maestros', 'editar')
      or public.usuario_puede(empresa_id, 'inventario', 'editar')
    )
  );

drop policy if exists mst_industrias_delete on public.industrias;
create policy mst_industrias_delete on public.industrias
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

select pg_notify('pgrst', 'reload schema');
