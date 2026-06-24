-- Cargos, Especialidades, Sedes, Areas y Tipos de Servicio son catalogos de
-- referencia que cualquier miembro de la empresa necesita leer para completar
-- formularios de Personal Operativo/Administrativo (Cargo, Especialidad,
-- Sede base, Area). Antes el SELECT exigia el permiso de pantalla
-- 'maestros'.ver, lo que dejaba esos dropdowns vacios para roles sin acceso
-- explicito a Maestros Base (ej. asistentes de RRHH con todos los permisos de
-- RRHH pero sin el modulo Configuracion > Maestros Base).
-- Mismo criterio ya aplicado al catalogo de industrias en la migracion 199.
-- Los permisos de creacion/edicion/eliminacion del catalogo siguen exigiendo
-- 'maestros'.crear / 'maestros'.editar — solo se relaja la lectura.

drop policy if exists mst_cargos_select on public.cargos_empresa;
create policy mst_cargos_select on public.cargos_empresa
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );

drop policy if exists mst_especialidades_select on public.especialidades_tecnicas;
create policy mst_especialidades_select on public.especialidades_tecnicas
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );

drop policy if exists mst_sedes_select on public.sedes;
create policy mst_sedes_select on public.sedes
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );

drop policy if exists mst_areas_select on public.areas_empresa;
create policy mst_areas_select on public.areas_empresa
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );

drop policy if exists mst_tipos_servicio_select on public.tipos_servicio_interno;
create policy mst_tipos_servicio_select on public.tipos_servicio_interno
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );

select pg_notify('pgrst', 'reload schema');
