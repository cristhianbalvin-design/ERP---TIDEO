-- TIDEO ERP - Fase 3: abrir lectura de unidades_organizacionales y posiciones a todo
-- el tenant (igual que usuarios_asignaciones), para que el frontend pueda calcular
-- jerarquia va posiciones sin depender del permiso 'maestros'.
--
-- No cambia insert/update/delete: siguen exigiendo usuario_puede(empresa_id,'maestros',...),
-- igual que antes. posiciones_usuarios ya era de lectura abierta al tenant desde la Fase 1
-- (no requiere cambios).

drop policy if exists mst_unidades_organizacionales_select on public.unidades_organizacionales;
create policy mst_unidades_organizacionales_select on public.unidades_organizacionales
  for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists mst_posiciones_select on public.posiciones;
create policy mst_posiciones_select on public.posiciones
  for select using (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
