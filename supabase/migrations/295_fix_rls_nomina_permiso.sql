-- TIDEO ERP - Fix RLS: periodos_nomina y nomina_detalle exponian sueldos de todos los
-- trabajadores a cualquier usuario del tenant, sin chequear el permiso 'nomina'.
--
-- Causa: la migracion 150 (nomina_hardening) creo policies nuevas de solo aislamiento
-- por tenant (periodos_nomina_select/insert/update, nomina_detalle_select/insert) sin
-- eliminar las policies de la migracion 024 (rrhh_nomina_select/insert/update, que si
-- exigian usuario_puede(empresa_id,'nomina',...)). Al ser policies PERMISSIVE, Postgres
-- las combina con OR: el resultado neto quedaba en tenant-only. nomina_detalle nunca
-- tuvo chequeo de permiso desde que se creo en 150 (no es un duplicado, es un gap).

drop policy if exists periodos_nomina_select on public.periodos_nomina;
drop policy if exists periodos_nomina_insert on public.periodos_nomina;
drop policy if exists periodos_nomina_update on public.periodos_nomina;

drop policy if exists rrhh_nomina_select on public.periodos_nomina;
create policy rrhh_nomina_select on public.periodos_nomina
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'nomina', 'ver')
  );

drop policy if exists rrhh_nomina_insert on public.periodos_nomina;
create policy rrhh_nomina_insert on public.periodos_nomina
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'nomina', 'crear')
  );

drop policy if exists rrhh_nomina_update on public.periodos_nomina;
create policy rrhh_nomina_update on public.periodos_nomina
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'nomina', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'nomina', 'editar')
  );

drop policy if exists nomina_detalle_select on public.nomina_detalle;
create policy nomina_detalle_select on public.nomina_detalle
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'nomina', 'ver')
  );

drop policy if exists nomina_detalle_insert on public.nomina_detalle;
create policy nomina_detalle_insert on public.nomina_detalle
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'nomina', 'crear')
  );

select pg_notify('pgrst', 'reload schema');
