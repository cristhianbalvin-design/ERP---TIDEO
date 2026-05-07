-- TIDEO ERP - Categoria de rol para filtrado funcional
-- Permite que el sistema sepa si un rol es de tipo comercial, admin, etc.
-- sin depender del nombre exacto del rol (que el tenant puede personalizar).

alter table public.roles
  add column if not exists categoria text default 'otro';

-- Actualizar roles predefinidos de emp_tideo con su categoria
update public.roles set categoria = 'admin'        where id = 'rol_emp_tideo_admin';
update public.roles set categoria = 'comercial'    where id = 'rol_emp_tideo_comercial_jefe';
update public.roles set categoria = 'comercial'    where id = 'rol_emp_tideo_comercial_asesor';
update public.roles set categoria = 'operaciones'  where id = 'rol_emp_tideo_ops_jefe';
update public.roles set categoria = 'operaciones'  where id = 'rol_emp_tideo_ops_tecnico';
update public.roles set categoria = 'finanzas'     where id = 'rol_emp_tideo_finanzas';

-- Roles genericos predefinidos de otros tenants (migration 045)
update public.roles set categoria = 'admin'       where id like '%_admin%'       and categoria = 'otro';
update public.roles set categoria = 'comercial'   where id like '%_comercial%'   and categoria = 'otro';
update public.roles set categoria = 'operaciones' where id like '%_ops%'         and categoria = 'otro';
update public.roles set categoria = 'operaciones' where id like '%_tecnico%'     and categoria = 'otro';
update public.roles set categoria = 'finanzas'    where id like '%_finanzas%'    and categoria = 'otro';

select pg_notify('pgrst', 'reload schema');
notify pgrst, 'reload schema';
