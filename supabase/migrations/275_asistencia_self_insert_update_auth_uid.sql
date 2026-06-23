-- TIDEO ERP - asistencia_self_insert/update (registros_asistencia) solo
-- emparejaban por email (personal_operativo.email/personal_administrativo.email
-- contra auth.jwt()->>'email'), a diferencia de registros_asistencia_self_select
-- que ya usa es_mi_personal_rrhh() (auth_user_id primero, email como respaldo).
--
-- Trabajadores de campo sin email registrado (ej. Vilca Bocanegra: email = ''
-- pero auth_user_id si vinculado) no podian marcar entrada ni salida: el INSERT
-- (y el UPDATE al marcar salida) fallaban contra RLS sin lanzar error visible
-- en la app, y el unico respaldo (rrhh_asistencia_insert/update) exige el
-- permiso admin 'asistencia'/crear|editar que un tecnico de campo no tiene.
-- El boton avanzaba de "Entrada" a "Salida" igual (ese cambio de modo es
-- incondicional) sin que el registro llegara a existir en la base.
--
-- Se alinea insert/update con el mismo es_mi_personal_rrhh() que ya usa
-- select, consistente con 272_personal_operativo_self_read_email.sql.

drop policy if exists asistencia_self_insert on public.registros_asistencia;
create policy asistencia_self_insert on public.registros_asistencia
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.es_mi_personal_rrhh(empresa_id, trabajador_id)
  );

drop policy if exists asistencia_self_update on public.registros_asistencia;
create policy asistencia_self_update on public.registros_asistencia
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.es_mi_personal_rrhh(empresa_id, trabajador_id)
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.es_mi_personal_rrhh(empresa_id, trabajador_id)
  );

select pg_notify('pgrst', 'reload schema');
