-- 328 — Fix: notif_insert_auth no dejaba insertar notificaciones a superadmins de
-- plataforma navegando un tenant ajeno.
--
-- La policy (migracion 123) validaba el empresa_id con una subconsulta literal
-- contra usuarios_empresas, sin el bypass de superadmin que ya tiene el helper
-- estandar usuario_tiene_empresa() (usado por el resto de RLS del proyecto).
-- Un superadmin de plataforma normalmente solo tiene membresia activa en
-- emp_tideo, no en cada tenant que administra, asi que cualquier insert de
-- notificacion mientras navega otro tenant devolvia 403.

drop policy if exists notif_insert_auth on public.notificaciones_sistema;
create policy notif_insert_auth on public.notificaciones_sistema
  for insert to authenticated
  with check (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
