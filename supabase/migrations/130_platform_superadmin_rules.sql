-- TIDEO ERP - Regla canonica de Superadmin TIDEO.
--
-- Solo cristhianbalvin@gmail.com, con membresia activa en el tenant de
-- plataforma, puede ejercer el bypass global de plataforma. Los administradores
-- de tenant conservan control total solo dentro de su propia empresa.

alter table public.empresas
  add column if not exists es_plataforma boolean not null default false;

update public.empresas
set es_plataforma = false,
    updated_at = now()
where id <> 'emp_tideo'
  and es_plataforma = true;

insert into public.empresas (
  id, razon_social, nombre_comercial, ruc, pais, moneda_base, zona_horaria,
  plan_id, estado, es_plataforma
)
values (
  'emp_tideo',
  'TIDEO TECH & STRATEGY',
  'TIDEO',
  null,
  'PE',
  'PEN',
  'America/Lima',
  null,
  'activa',
  true
)
on conflict (id) do update set
  es_plataforma = true,
  updated_at = now();

insert into public.roles (
  id, empresa_id, nombre, descripcion, categoria, nivel_jerarquico,
  es_superadmin, es_admin_empresa, activo
)
values (
  'rol_tideo_super',
  'emp_tideo',
  'Super Administrador TIDEO',
  'Acceso global de plataforma reservado para TIDEO.',
  'admin',
  'direccion',
  true,
  false,
  true
)
on conflict (id) do update set
  empresa_id = 'emp_tideo',
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  categoria = excluded.categoria,
  nivel_jerarquico = excluded.nivel_jerarquico,
  es_superadmin = true,
  es_admin_empresa = false,
  activo = true,
  updated_at = now();

-- Normalizar roles legados: ningun tenant cliente debe conservar un rol
-- es_superadmin. Si existia, pasa a ser Administrador del tenant.
update public.roles r
set es_superadmin = false,
    es_admin_empresa = true,
    categoria = 'admin',
    nivel_jerarquico = 'direccion',
    updated_at = now()
from public.empresas e
where r.empresa_id = e.id
  and e.es_plataforma = false
  and r.es_superadmin = true;

update public.roles
set es_superadmin = false,
    updated_at = now()
where empresa_id = 'emp_tideo'
  and id <> 'rol_tideo_super'
  and es_superadmin = true;

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = 'cristhianbalvin@gmail.com'
  limit 1;

  if v_user_id is null then
    raise notice 'No existe auth.users para cristhianbalvin@gmail.com; se crearon reglas y rol, pero no se vinculo membresia.';
    return;
  end if;

  insert into public.usuarios_empresas (
    user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado
  )
  values (
    v_user_id, 'emp_tideo', 'rol_tideo_super', true, 'gerencia', 'activo'
  )
  on conflict (user_id, empresa_id) do update set
    rol_id = excluded.rol_id,
    acceso_campo = excluded.acceso_campo,
    perfil_campo = excluded.perfil_campo,
    estado = 'activo',
    updated_at = now();

  insert into public.usuarios (
    id, empresa_id, nombre, email, rol, campo, campo_perfil, estado,
    must_change_password
  )
  values (
    v_user_id::text,
    'emp_tideo',
    'Cristhian Balvin',
    'cristhianbalvin@gmail.com',
    'rol_tideo_super',
    true,
    'gerencia',
    'Activo',
    false
  )
  on conflict (id) do update set
    empresa_id = 'emp_tideo',
    nombre = excluded.nombre,
    email = excluded.email,
    rol = excluded.rol,
    campo = excluded.campo,
    campo_perfil = excluded.campo_perfil,
    estado = excluded.estado,
    must_change_password = false,
    updated_at = now();

  insert into public.usuarios_asignaciones (
    empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
    alcance_tipo, alcance_id, principal, activo, fecha_fin
  )
  select
    'emp_tideo', v_user_id, 'rol_tideo_super', 'admin', 'direccion', null,
    'tenant', null, true, true, null
  where not exists (
    select 1
    from public.usuarios_asignaciones ua
    where ua.empresa_id = 'emp_tideo'
      and ua.user_id = v_user_id
      and ua.principal = true
      and ua.activo = true
  );

  update public.usuarios_asignaciones
  set rol_id = 'rol_tideo_super',
      categoria = 'admin',
      nivel_jerarquico = 'direccion',
      jefe_user_id = null,
      alcance_tipo = 'tenant',
      alcance_id = null,
      updated_at = now()
  where empresa_id = 'emp_tideo'
    and user_id = v_user_id
    and principal = true
    and activo = true;

  -- El superadmin opera tenants cliente por bypass auditado, no como miembro
  -- activo de cada tenant. Dejamos historial inactivo para trazabilidad.
  update public.usuarios_empresas ue
  set estado = 'inactivo',
      updated_at = now()
  from public.empresas e
  where ue.empresa_id = e.id
    and e.es_plataforma = false
    and ue.user_id = v_user_id
    and ue.estado = 'activo';

  update public.usuarios_asignaciones ua
  set activo = false,
      fecha_fin = current_date,
      updated_at = now()
  from public.empresas e
  where ua.empresa_id = e.id
    and e.es_plataforma = false
    and ua.user_id = v_user_id
    and ua.activo = true;

  delete from public.usuarios
  where lower(email) = 'cristhianbalvin@gmail.com'
    and id <> v_user_id::text;
end;
$$;

create or replace function public.usuario_es_superadmin_plataforma()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    join auth.users au on au.id = ue.user_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
      and e.es_plataforma = true
      and lower(au.email) = 'cristhianbalvin@gmail.com'
  );
$$;

create or replace function public.usuario_tiene_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  or public.usuario_es_superadmin_plataforma();
$$;

create or replace function public.usuario_es_admin_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.es_admin_empresa = true
  )
  or public.usuario_es_superadmin_plataforma();
$$;

create or replace function public.usuario_puede(
  target_empresa_id text,
  target_pantalla text,
  target_accion text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.usuario_es_superadmin_plataforma()
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.es_admin_empresa = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

drop function if exists public.get_mis_membresias();
create function public.get_mis_membresias()
returns table(empresa_id text, rol_id text, acceso_campo boolean, perfil_campo text)
language sql
security definer
stable
set search_path = public
as $$
  with superadmin_role as (
    select ue.rol_id
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    join auth.users au on au.id = ue.user_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
      and e.es_plataforma = true
      and lower(au.email) = 'cristhianbalvin@gmail.com'
    limit 1
  )
  select e.id as empresa_id, s.rol_id, true as acceso_campo, 'plataforma'::text as perfil_campo
  from public.empresas e
  cross join superadmin_role s
  where e.estado in ('activa', 'activo', 'demo')

  union

  select ue.empresa_id, ue.rol_id, ue.acceso_campo, ue.perfil_campo
  from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.estado = 'activo'
    and not exists (select 1 from superadmin_role);
$$;

drop function if exists public.get_mis_membresias(uuid);
create function public.get_mis_membresias(p_user_id uuid)
returns table(empresa_id text, rol_id text, acceso_campo boolean, perfil_campo text)
language sql
security definer
stable
set search_path = public
as $$
  select *
  from public.get_mis_membresias();
$$;

select pg_notify('pgrst', 'reload schema');
