-- TIDEO ERP - turnos_select (migracion 054) exigia el permiso administrativo
-- usuario_puede(empresa_id, 'turnos', 'ver') incluso para lectura. Los roles
-- de campo (tecnico/operativo) nunca tienen ese permiso (es de la pantalla
-- admin "Turnos y Horarios"), asi que la app movil de asistencia no podia
-- leer NINGUN turno: turnos_cargados=0 en su sesion, por lo que
-- turnoIdPersistible siempre resultaba null aunque la ficha tuviera un
-- turno_id real y valido. El boton de marcar fallaba en silencio para
-- cualquier trabajador de campo, no solo uno en particular.
--
-- El catalogo de turnos (nombre, horario, dias) no es informacion sensible
-- por trabajador: cualquier miembro activo del tenant puede necesitar leerlo
-- para validar su propio turno asignado. Crear/editar/eliminar turnos siguen
-- exigiendo el permiso granular 'turnos'/crear|editar (sin cambios, sin
-- regresion de seguridad).

drop policy if exists turnos_select on public.turnos;
create policy turnos_select on public.turnos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );

select pg_notify('pgrst', 'reload schema');
