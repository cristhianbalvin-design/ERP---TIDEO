-- Migración ya aplicada en producción; registro histórico.

-- Bootstrap del permiso operativo de Recepción de Activos de Cliente.
-- El conjunto operativo replica exactamente los permisos actuales de inventario.
-- Los roles que solo tienen os_cliente reciben únicamente lectura para conservar
-- la consulta del flujo comercial sin conservar la escritura administrativa.

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
  puede_ver_finanzas,
  permisos_extra
)
select
  pr.rol_id,
  'recepcion_activos_cliente',
  pr.puede_ver,
  pr.puede_crear,
  pr.puede_editar,
  pr.puede_anular,
  pr.puede_aprobar,
  pr.puede_exportar,
  pr.puede_ver_costos,
  pr.puede_ver_finanzas,
  pr.permisos_extra
from public.permisos_roles pr
where pr.pantalla = 'inventario'
  and (pr.puede_ver = true or pr.puede_crear = true or pr.puede_editar = true);

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
  puede_ver_finanzas,
  permisos_extra
)
values
  ('rol_emp_2000000000_comercial_jefe', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb),
  ('rol_emp_20513453711_ra82d', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb),
  ('rol_emp_20600026446_comercial_jefe', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb),
  ('rol_emp_20601829101_comercial_jefe', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb),
  ('rol_emp_20606120487_comercial_jefe', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb),
  ('rol_emp_20609996464_comercial_jefe', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb),
  ('rol_emp_tideo_comercial_jefe', 'recepcion_activos_cliente', true, false, false, false, false, false, false, false, '{}'::jsonb);

drop policy if exists ops_recepciones_activos_cliente_select on public.recepciones_activos_cliente;
drop policy if exists ops_recepciones_activos_cliente_insert on public.recepciones_activos_cliente;
drop policy if exists ops_recepciones_activos_cliente_update on public.recepciones_activos_cliente;

create policy ops_recepciones_activos_cliente_select
  on public.recepciones_activos_cliente
  for select
  to public
  using (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'recepcion_activos_cliente', 'ver')
  );

create policy ops_recepciones_activos_cliente_insert
  on public.recepciones_activos_cliente
  for insert
  to public
  with check (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'recepcion_activos_cliente', 'crear')
  );

create policy ops_recepciones_activos_cliente_update
  on public.recepciones_activos_cliente
  for update
  to public
  using (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'recepcion_activos_cliente', 'editar')
  );
