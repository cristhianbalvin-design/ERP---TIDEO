-- Fix: eliminar un registro de asistencia desde Control de Asistencia (Vista Diaria)
-- no funcionaba en ningun caso. Causa: aplicar_rls_pantalla('public.registros_asistencia',
-- 'rrhh_asistencia', 'asistencia') (migracion 024) solo crea policies para
-- select/insert/update y ademas elimina cualquier policy previa en la tabla
-- (incluida tenant_asistencia_isolation 'for all' de la migracion 011). Con RLS
-- habilitado y sin ninguna policy aplicable a delete, Postgres deniega el DELETE
-- para todos los usuarios sin excepcion.
--
-- Se agrega una policy de delete restringida a administradores del tenant,
-- mismo patron ya usado para tablas sensibles (compras_gastos, financiamientos,
-- movimientos_tesoreria, etc. en la migracion 065).

drop policy if exists registros_asistencia_delete on public.registros_asistencia;
create policy registros_asistencia_delete on public.registros_asistencia
  for delete using (public.usuario_es_admin_empresa(empresa_id));
