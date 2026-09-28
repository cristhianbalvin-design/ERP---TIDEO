-- 555 · Permisos de rol para el tarifario comercial.
-- No existe un catálogo formal de pantallas: usuario_puede compara
-- permisos_roles.pantalla contra el identificador textual recibido.
-- La pantalla es independiente de hoja_costeo y no toca contratos.

begin;
-- Los roles comerciales de dirección, jefatura y supervisor reciben por
-- defecto lectura y edición. Los roles admin ya tienen bypass en
-- usuario_puede y no necesitan una fila adicional para acceder.
insert into public.permisos_roles (
  rol_id,
  pantalla,
  puede_ver,
  puede_crear,
  puede_editar,
  puede_anular,
  puede_aprobar,
  puede_exportar,
  puede_ver_costos,
  puede_ver_finanzas
)
select
  r.id,
  'tarifario_comercial',
  true,
  false,
  true,
  false,
  false,
  false,
  false,
  false
from public.roles r
where r.activo = true
  and lower(coalesce(r.categoria, '')) = 'comercial'
  and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura', 'supervisor')
on conflict (rol_id, pantalla) do update
set puede_ver = true,
    puede_editar = true,
    updated_at = now();
-- Proyectos: se conserva el aislamiento por tenant y se agrega el permiso
-- centralizado por pantalla/acción.
drop policy if exists proyectos_select on public.proyectos;
drop policy if exists proyectos_insert on public.proyectos;
drop policy if exists proyectos_update on public.proyectos;
drop policy if exists proyectos_delete on public.proyectos;
create policy proyectos_select
on public.proyectos
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'ver')
);
create policy proyectos_insert
on public.proyectos
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
);
create policy proyectos_update
on public.proyectos
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
);
create policy proyectos_delete
on public.proyectos
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
);
-- Tarifas de equipos: el tenant se obtiene desde el activo referenciado.
drop policy if exists tarifas_estandar_equipos_select on public.tarifas_estandar_equipos;
drop policy if exists tarifas_estandar_equipos_insert on public.tarifas_estandar_equipos;
drop policy if exists tarifas_estandar_equipos_update on public.tarifas_estandar_equipos;
drop policy if exists tarifas_estandar_equipos_delete on public.tarifas_estandar_equipos;
create policy tarifas_estandar_equipos_select
on public.tarifas_estandar_equipos
for select to authenticated
using (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
      and public.usuario_puede(a.empresa_id, 'tarifario_comercial', 'ver')
  )
);
create policy tarifas_estandar_equipos_insert
on public.tarifas_estandar_equipos
for insert to authenticated
with check (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
      and public.usuario_puede(a.empresa_id, 'tarifario_comercial', 'editar')
  )
);
create policy tarifas_estandar_equipos_update
on public.tarifas_estandar_equipos
for update to authenticated
using (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
      and public.usuario_puede(a.empresa_id, 'tarifario_comercial', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
      and public.usuario_puede(a.empresa_id, 'tarifario_comercial', 'editar')
  )
);
create policy tarifas_estandar_equipos_delete
on public.tarifas_estandar_equipos
for delete to authenticated
using (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
      and public.usuario_puede(a.empresa_id, 'tarifario_comercial', 'editar')
  )
);
-- Tarifas de mano de obra: se reemplaza la política tenant-only por las
-- cuatro operaciones para distinguir ver de editar.
drop policy if exists tarifas_mo_comercial_tenant on public.tarifas_mano_obra_comercial;
create policy tarifas_mo_comercial_select
on public.tarifas_mano_obra_comercial
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'ver')
);
create policy tarifas_mo_comercial_insert
on public.tarifas_mano_obra_comercial
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
);
create policy tarifas_mo_comercial_update
on public.tarifas_mano_obra_comercial
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
);
create policy tarifas_mo_comercial_delete
on public.tarifas_mano_obra_comercial
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'tarifario_comercial', 'editar')
);
select pg_notify('pgrst', 'reload schema');
commit;
