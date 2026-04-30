-- TIDEO ERP - Acceso frontend inicial con Supabase Auth.
-- Ejecutar despues de supabase/generated/tideo_erp_setup.sql.

alter table public.empresas enable row level security;
alter table public.planes enable row level security;
alter table public.monedas enable row level security;
alter table public.paises enable row level security;

drop policy if exists platform_empresas_select on public.empresas;
create policy platform_empresas_select on public.empresas
  for select using (public.usuario_tiene_empresa(id));

drop policy if exists platform_planes_select on public.planes;
create policy platform_planes_select on public.planes
  for select using (
    exists (
      select 1
      from public.empresas e
      where e.plan_id = planes.id
        and public.usuario_tiene_empresa(e.id)
    )
  );

drop policy if exists platform_monedas_select on public.monedas;
create policy platform_monedas_select on public.monedas
  for select using (auth.uid() is not null);

drop policy if exists platform_paises_select on public.paises;
create policy platform_paises_select on public.paises
  for select using (auth.uid() is not null);

-- Ejecuta este bloque reemplazando el email por el usuario creado en Auth.
-- Esto asigna el usuario real al tenant demo emp_001 como administrador.
/*
insert into public.usuarios_empresas (user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado)
select id, 'emp_001', 'rol_emp001_admin', true, 'gerencia', 'activo'
from auth.users
where email = 'cristhianbalvin@gmail.com'
on conflict (user_id, empresa_id) do update set
  rol_id = excluded.rol_id,
  acceso_campo = excluded.acceso_campo,
  perfil_campo = excluded.perfil_campo,
  estado = excluded.estado;
*/
