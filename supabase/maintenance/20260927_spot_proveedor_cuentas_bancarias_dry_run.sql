\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT / Bloque 3a: dry run ---'
begin;
\ir 20260927_spot_proveedor_cuentas_bancarias_body.sql

do $fixture$
declare
  v_tenant text := 'emp_2000000000';
  v_other_tenant text;
begin
  select e.id
    into v_other_tenant
  from public.empresas e
  where e.id <> v_tenant
  order by e.id
  limit 1;
  if v_other_tenant is null then
    raise exception 'B3A_FIXTURE|se necesita una segunda empresa para probar aislamiento de tenant';
  end if;

  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa, activo)
  values
    ('spot_b3a_full', v_tenant, 'B3A PRUEBA PROVEEDORES CRUD', 'Fixture temporal del dry run B3a', 'otro', 'operativo', false, false, true),
    ('spot_b3a_edit', v_tenant, 'B3A PRUEBA PROVEEDORES EDITAR', 'Fixture temporal del dry run B3a', 'otro', 'operativo', false, false, true),
    ('spot_b3a_create', v_tenant, 'B3A PRUEBA PROVEEDORES CREAR', 'Fixture temporal del dry run B3a', 'otro', 'operativo', false, false, true),
    ('spot_b3a_none', v_tenant, 'B3A PRUEBA SIN PROVEEDORES', 'Fixture temporal del dry run B3a', 'otro', 'operativo', false, false, true);

  insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular)
  values
    ('spot_b3a_full', 'proveedores', true, true, true, true),
    ('spot_b3a_edit', 'proveedores', true, false, true, false),
    ('spot_b3a_create', 'proveedores', true, true, false, false),
    ('spot_b3a_none', 'proveedores', false, false, false, false);

  update public.usuarios_empresas set rol_id = 'spot_b3a_full'
  where user_id = '67b0e438-8712-40c0-ae60-006fbdd3c577' and empresa_id = v_tenant;
  if not found then raise exception 'B3A_FIXTURE|usuario full no encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_b3a_edit'
  where user_id = '5a3ce730-df30-4e7a-a8ce-55802549e012' and empresa_id = v_tenant;
  if not found then raise exception 'B3A_FIXTURE|usuario edit no encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_b3a_create'
  where user_id = '65b066ad-a2c1-441a-ad37-5ce198882c6c' and empresa_id = v_tenant;
  if not found then raise exception 'B3A_FIXTURE|usuario create no encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_b3a_none'
  where user_id = 'b312121e-1fd1-4163-88ef-2e50ada7ca96' and empresa_id = v_tenant;
  if not found then raise exception 'B3A_FIXTURE|usuario sin acceso no encontrado'; end if;

  insert into public.proveedores (id, empresa_id, razon_social, nombre_comercial, ruc, codigo, tipo, estado, created_at, updated_at)
  values
    ('prv_spot_b3a_main', v_tenant, 'B3A Proveedor principal', 'B3A Principal', '20999999001', 'B3A-PRINCIPAL', 'empresa', 'potencial', now(), now()),
    ('prv_spot_b3a_other', v_other_tenant, 'B3A Proveedor otra empresa', 'B3A Otra Empresa', '20999999002', 'B3A-OTRA', 'empresa', 'potencial', now(), now());

  insert into public.proveedor_cuentas_bancarias
    (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_cuenta_banco_nacion, estado)
  values
    ('pcb_spot_b3a_bn_old', v_tenant, 'prv_spot_b3a_main', 'BN anterior', 'Banco de la Nacion', 'corriente', '001-000001', '018001000000000001', 'PEN', true, 'activo'),
    ('pcb_spot_b3a_normal', v_tenant, 'prv_spot_b3a_main', 'Cuenta normal', 'Banco de Credito', 'corriente', '002-000002', '018002000000000002', 'PEN', false, 'activo');
end;
$fixture$;

set local role authenticated;

do $test$
declare
  v_error text;
  v_rows integer;
begin
  -- 1) Dos cuentas identicas (con diferencias solo de mayusculas/espacios) fallan por el indice normalizado.
  perform set_config('request.jwt.claims', '{"sub":"67b0e438-8712-40c0-ae60-006fbdd3c577","role":"authenticated"}', true);
  v_error := null;
  begin
    insert into public.proveedor_cuentas_bancarias
      (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda)
    values
      ('pcb_spot_b3a_duplicate', 'emp_2000000000', 'prv_spot_b3a_main', 'Duplicada', ' banco de la nacion ', 'corriente', ' 001-000001 ', '018001000000000001', 'PEN');
    raise exception 'B3A_CASO_1|duplicado_no_rechazado';
  exception when unique_violation then
    v_error := sqlerrm;
  end;
  if v_error is null then raise exception 'B3A_CASO_1|no_hubo_unique_violation'; end if;
  raise notice 'B3A_CASO_1|unicidad_normalizada=rechazado';

  -- 2) Flujo aprobado para cambiar la cuenta BN: primero se inactiva la anterior.
  update public.proveedor_cuentas_bancarias
  set estado = 'inactivo'
  where id = 'pcb_spot_b3a_bn_old';
  insert into public.proveedor_cuentas_bancarias
    (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_cuenta_banco_nacion, estado)
  values
    ('pcb_spot_b3a_bn_new', 'emp_2000000000', 'prv_spot_b3a_main', 'BN nueva', 'Banco de la Nacion', 'corriente', '001-000003', '018001000000000003', 'PEN', true, 'activo');
  if exists (select 1 from public.proveedor_cuentas_bancarias where id = 'pcb_spot_b3a_bn_old' and estado <> 'inactivo')
     or not exists (select 1 from public.proveedor_cuentas_bancarias where id = 'pcb_spot_b3a_bn_new' and es_cuenta_banco_nacion and estado = 'activo') then
    raise exception 'B3A_CASO_2|cambio_bn_no_conserva_una_activa';
  end if;
  raise notice 'B3A_CASO_2|cambio_bn|anterior=inactiva|nueva=activa';

  -- 3) Intento directo de dos cuentas BN activas: lo rechaza el indice parcial.
  v_error := null;
  begin
    insert into public.proveedor_cuentas_bancarias
      (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_cuenta_banco_nacion, estado)
    values
      ('pcb_spot_b3a_bn_conflict', 'emp_2000000000', 'prv_spot_b3a_main', 'BN conflicto', 'Banco de la Nacion', 'corriente', '001-000004', '018001000000000004', 'PEN', true, 'activo');
    raise exception 'B3A_CASO_3|dos_bn_activas_no_rechazadas';
  exception when unique_violation then
    v_error := sqlerrm;
  end;
  if v_error is null then raise exception 'B3A_CASO_3|no_hubo_unique_violation'; end if;
  raise notice 'B3A_CASO_3|dos_bn_activas=rechazado';

  -- 4) Un usuario con crear pero sin editar puede registrar una cuenta normal,
  -- pero no puede editarla. La proteccion del flag BN se prueba por INSERT:
  -- pcb_insert permite crear, por lo que el trigger debe rechazar el flag.
  perform set_config('request.jwt.claims', '{"sub":"65b066ad-a2c1-441a-ad37-5ce198882c6c","role":"authenticated"}', true);
  if public.usuario_puede('emp_2000000000', 'proveedores', 'editar') then
    raise exception 'B3A_CASO_4|fixture_tiene_proveedores_editar';
  end if;
  insert into public.proveedor_cuentas_bancarias
    (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda)
  values
    ('pcb_spot_b3a_create_only', 'emp_2000000000', 'prv_spot_b3a_main', 'Solo crear', 'Banco de la Nacion', 'corriente', '001-000005', '018001000000000005', 'PEN');
  v_rows := 0;
  update public.proveedor_cuentas_bancarias set es_cuenta_banco_nacion = true where id = 'pcb_spot_b3a_create_only';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 or exists (select 1 from public.proveedor_cuentas_bancarias where id = 'pcb_spot_b3a_create_only' and es_cuenta_banco_nacion) then
    raise exception 'B3A_CASO_4|update_bn_sin_editar_cambio_fila';
  end if;
  v_error := null;
  begin
    insert into public.proveedor_cuentas_bancarias
      (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_cuenta_banco_nacion)
    values
      ('pcb_spot_b3a_create_only_bn', 'emp_2000000000', 'prv_spot_b3a_main', 'Solo crear BN', 'Banco de la Nacion', 'corriente', '001-000008', '018001000000000008', 'PEN', true);
    raise exception 'B3A_CASO_4|insert_bn_sin_editar_no_rechazado';
  exception when others then v_error := sqlerrm; end;
  if v_error not like '%proveedores.editar%' then raise exception 'B3A_CASO_4|mensaje=%', v_error; end if;
  raise notice 'B3A_CASO_4|fixture_sin_editar=confirmado|update=RLS_sin_cambio|insert_bn=trigger_rechazado';

  -- 5) Sin proveedores.ver/crear/editar/anular no puede insertar, actualizar ni eliminar.
  perform set_config('request.jwt.claims', '{"sub":"b312121e-1fd1-4163-88ef-2e50ada7ca96","role":"authenticated"}', true);
  v_error := null;
  begin
    insert into public.proveedor_cuentas_bancarias
      (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda)
    values
      ('pcb_spot_b3a_no_access', 'emp_2000000000', 'prv_spot_b3a_main', 'Sin acceso', 'Banco de Credito', 'corriente', '002-000006', '018002000000000006', 'PEN');
    raise exception 'B3A_CASO_5|insert_no_bloqueado';
  exception when others then v_error := sqlerrm; end;
  if v_error not like '%row-level security%' then raise exception 'B3A_CASO_5|insert=%', v_error; end if;
  v_rows := 0;
  begin
    update public.proveedor_cuentas_bancarias set alias = 'No debe editar' where id = 'pcb_spot_b3a_normal';
    get diagnostics v_rows = row_count;
  exception when others then v_error := sqlerrm; end;
  if coalesce(v_rows, 0) <> 0 then raise exception 'B3A_CASO_5|update_no_bloqueado'; end if;
  raise notice 'B3A_CASO_5|sin_permisos=RLS';

  -- 6) Aunque el proveedor exista, una cuenta con empresa distinta no pasa el tenant.
  perform set_config('request.jwt.claims', '{"sub":"67b0e438-8712-40c0-ae60-006fbdd3c577","role":"authenticated"}', true);
  v_error := null;
  begin
    insert into public.proveedor_cuentas_bancarias
      (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, cci, moneda)
    values
      ('pcb_spot_b3a_cross_tenant', 'emp_2000000000', 'prv_spot_b3a_other', 'Tenant cruzado', 'Banco de Credito', 'corriente', '002-000007', '018002000000000007', 'PEN');
    raise exception 'B3A_CASO_6|tenant_cruzado_no_rechazado';
  exception when others then v_error := sqlerrm; end;
  if v_error not like '%row-level security%' and v_error not like '%misma empresa%' then raise exception 'B3A_CASO_6|mensaje=%', v_error; end if;
  raise notice 'B3A_CASO_6|proveedor_otra_empresa=rechazado';

  -- 7) El permiso anular permite eliminar una cuenta no usada.
  perform set_config('request.jwt.claims', '{"sub":"67b0e438-8712-40c0-ae60-006fbdd3c577","role":"authenticated"}', true);
  delete from public.proveedor_cuentas_bancarias where id = 'pcb_spot_b3a_normal';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'B3A_CASO_7|anular_no_permitido'; end if;
  raise notice 'B3A_CASO_7|proveedores.anular=ok';
end;
$test$;

rollback;
\echo 'B3A_DRY_RUN_ROLLBACK_COMPLETED'
