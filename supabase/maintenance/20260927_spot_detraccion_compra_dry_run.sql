\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT / Bloque 3b-1: dry run ---'
begin;
\ir 20260927_spot_detraccion_compra_body.sql

create temp table b3b_context (clave text primary key, valor text) on commit drop;
create or replace function pg_temp.b3b_ctx(p_clave text)
returns text language sql stable as $$ select valor from b3b_context where clave = p_clave $$;
create or replace function pg_temp.b3b_cxp(
  p_tag text,
  p_moneda text default 'PEN',
  p_estado text default 'por_pagar',
  p_con_proveedor boolean default true
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fixture$
declare
  v_id text := 'cxp_b3b1_' || p_tag || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_monto numeric := case when p_moneda = 'USD' then 1000 else 1000 end;
  v_proveedor text := case when p_con_proveedor then pg_temp.b3b_ctx('proveedor_id') else null end;
begin
  insert into public.cxp (
    id, empresa_id, proveedor_id, factura_numero, fecha_emision, fecha_vencimiento,
    monto_total, monto_pagado, saldo, moneda, estado, tipo_beneficiario, tipo_comprobante, origen,
    sociedad_id, created_at, updated_at
  ) values (
    v_id, pg_temp.b3b_ctx('empresa_id'), v_proveedor, 'F-B3B1-' || p_tag,
    date '2026-09-24', date '2026-10-24', v_monto,
    case when p_estado = 'pagada' then v_monto else 0 end,
    case when p_estado = 'pagada' then 0 else v_monto end,
    p_moneda, p_estado, 'proveedor', 'Factura', 'manual', pg_temp.b3b_ctx('sociedad_id')::uuid,
    now(), now()
  );
  return v_id;
end;
$fixture$;

do $fixture$
declare
  v_empresa text := 'emp_2000000000';
  v_sociedad uuid;
  v_catalogo text;
  v_catalogo_alt text;
  v_other_tenant text;
  v_proveedor text := 'prv_spot_b3b1_fixture';
  v_user_full uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
  v_user_none uuid := 'b312121e-1fd1-4163-88ef-2e50ada7ca96';
begin
  select s.id into v_sociedad from public.sociedades s where s.empresa_id = v_empresa order by s.id limit 1;
  if v_sociedad is null then raise exception 'B3B1_FIXTURE|sociedad_no_encontrada'; end if;
  select c.codigo into v_catalogo
  from public.spot_catalogo c
  where c.estado = 'activo' and c.vigencia_desde <= date '2026-09-24'
    and (c.vigencia_hasta is null or c.vigencia_hasta >= date '2026-09-24')
  order by c.codigo limit 1;
  select c.codigo into v_catalogo_alt
  from public.spot_catalogo c
  where c.estado = 'activo' and c.codigo <> v_catalogo
    and c.vigencia_desde <= date '2026-09-24'
    and (c.vigencia_hasta is null or c.vigencia_hasta >= date '2026-09-24')
  order by c.codigo limit 1;
  if v_catalogo is null or v_catalogo_alt is null then raise exception 'B3B1_FIXTURE|catalogo_insuficiente'; end if;
  select e.id into v_other_tenant from public.empresas e where e.id <> v_empresa order by e.id limit 1;
  if v_other_tenant is null then raise exception 'B3B1_FIXTURE|empresa_secundaria_ausente'; end if;

  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa, activo)
  values
    ('spot_b3b1_full', v_empresa, 'B3B1 PRUEBA CXP SPOT', 'Fixture temporal B3B1', 'otro', 'operativo', false, false, true),
    ('spot_b3b1_none', v_empresa, 'B3B1 SIN PERMISO CXP', 'Fixture temporal B3B1', 'otro', 'operativo', false, false, true);
  insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_ver_finanzas)
  values
    ('spot_b3b1_full', 'cxp', true, true, true, true, true),
    ('spot_b3b1_none', 'cxp', true, false, false, false, false);
  update public.usuarios_empresas set rol_id = 'spot_b3b1_full' where user_id = v_user_full and empresa_id = v_empresa;
  if not found then raise exception 'B3B1_FIXTURE|usuario_full_no_encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_b3b1_none' where user_id = v_user_none and empresa_id = v_empresa;
  if not found then raise exception 'B3B1_FIXTURE|usuario_none_no_encontrado'; end if;

  insert into public.proveedores (id, empresa_id, razon_social, nombre_comercial, ruc, codigo, tipo, estado, created_at, updated_at)
  values (v_proveedor, v_empresa, 'B3B1 Proveedor SPOT', 'B3B1 Proveedor SPOT', '20999999111', 'B3B1-PRV', 'empresa', 'potencial', now(), now());

  insert into b3b_context values
    ('empresa_id', v_empresa), ('sociedad_id', v_sociedad::text), ('proveedor_id', v_proveedor),
    ('catalogo', v_catalogo), ('catalogo_alt', v_catalogo_alt), ('user_full', v_user_full::text),
    ('user_none', v_user_none::text), ('other_tenant', v_other_tenant);
end;
$fixture$;

grant select on b3b_context to public;

grant execute on function pg_temp.b3b_ctx(text) to public;
grant execute on function pg_temp.b3b_cxp(text,text,text,boolean) to public;

-- Helper SECURITY DEFINER para dejar preparado el caso futuro con movimiento.
create or replace function pg_temp.b3b_insert_movement(p_empresa text, p_detraccion uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $fixture$
begin
  insert into public.movimientos_tesoreria
    (id, empresa_id, tipo, descripcion, monto, moneda, fecha, vinculo_tipo, vinculo_id, estado, detraccion_id)
  values
    ('mov_b3b1_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), p_empresa,
     'egreso', 'Movimiento temporal B3B1', 10, 'PEN', date '2026-09-24',
     'pago_spot_compra', p_detraccion::text, 'registrado', p_detraccion);
end;
$fixture$;

grant execute on function pg_temp.b3b_insert_movement(text,uuid) to public;

set local role authenticated;

do $test$
declare
  v_cxp text;
  v_d uuid;
  v_r jsonb;
  v_error text;
  v_state text;
  v_codigo text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.b3b_ctx('user_full'), 'role', 'authenticated')::text, true);

  -- 1) Alta PEN: el importe de origen debe ser igual al deposito redondeado.
  v_cxp := pg_temp.b3b_cxp('pen', 'PEN');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  if (v_r->'detraccion'->>'estado') <> 'pendiente'
     or (v_r->'detraccion'->>'moneda_origen') <> 'PEN'
     or (v_r->'detraccion'->>'monto_detraccion_origen') <> (v_r->'detraccion'->>'monto_detraccion_soles') then
    raise exception 'B3B1_CASO_1|PEN_incorrecto';
  end if;
  raise notice 'B3B1_CASO_1|alta_PEN=ok|origen=soles_redondeados';

  -- 2) Alta USD con tipo de cambio y fuente obligatorios.
  v_cxp := pg_temp.b3b_cxp('usd', 'USD');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object(
    'codigo_spot', pg_temp.b3b_ctx('catalogo'),
    'tipo_cambio_detraccion', 3.45,
    'tipo_cambio_fuente', 'manual'
  ));
  if (v_r->'detraccion'->>'moneda_origen') <> 'USD'
     or (v_r->'detraccion'->>'tipo_cambio') <> '3.450000' then
    raise exception 'B3B1_CASO_2|USD_incorrecto';
  end if;
  raise notice 'B3B1_CASO_2|alta_USD=ok|tipo_cambio=3.45';

  -- 3) CxP pagada, anulada y sin proveedor.
  foreach v_state in array array['pagada','anulada'] loop
    v_cxp := pg_temp.b3b_cxp('rechazo_' || v_state, 'PEN', v_state);
    v_error := null;
    begin
      perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
    exception when others then v_error := sqlerrm; end;
    if v_error is null then raise exception 'B3B1_CASO_3|%_no_rechazada', v_state; end if;
  end loop;
  v_cxp := pg_temp.b3b_cxp('rechazo_sin_proveedor', 'PEN', 'por_pagar', false);
  v_error := null;
  begin
    perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
  exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B1_CASO_3|sin_proveedor_no_rechazada'; end if;
  raise notice 'B3B1_CASO_3|pagada=anulada=sin_proveedor=rechazados';

  -- 4) Segunda obligacion activa para la misma CxP.
  v_error := null;
  begin
    perform public.registrar_detraccion_compra((select cxp_id from public.detracciones where id = v_d), jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
  exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B1_CASO_4|segunda_obligacion_aceptada'; end if;
  raise notice 'B3B1_CASO_4|segunda_obligacion_activa=rechazada';

  -- 5) Codigo inexistente/no vigente para la fecha de la CxP.
  v_cxp := pg_temp.b3b_cxp('sin_vigencia', 'PEN');
  v_error := null;
  begin
    perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', 'B3B1-NO-VIGENTE'));
  exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B1_CASO_5|codigo_sin_vigencia_aceptado'; end if;
  raise notice 'B3B1_CASO_5|codigo_sin_vigencia=rechazado';

  -- 6) Correccion de una obligacion pendiente.
  v_cxp := pg_temp.b3b_cxp('corregible', 'PEN');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  v_r := public.corregir_detraccion_compra(v_d, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo_alt')));
  select codigo_spot into v_codigo from public.detracciones where id = v_d;
  if v_codigo <> pg_temp.b3b_ctx('catalogo_alt') then raise exception 'B3B1_CASO_6|correccion_no_aplicada'; end if;
  raise notice 'B3B1_CASO_6|correccion_pendiente=ok';

  -- 7) Anulacion de una obligacion pendiente.
  v_cxp := pg_temp.b3b_cxp('anulable', 'PEN');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  v_r := public.anular_detraccion_compra(v_d);
  select estado into v_state from public.detracciones where id = v_d;
  if v_state <> 'anulada' then raise exception 'B3B1_CASO_7|anulacion_no_aplicada'; end if;
  raise notice 'B3B1_CASO_7|anulacion_pendiente=ok';

  -- 8) Correccion/anulacion con movimiento: preparado para 3b-2.
  v_cxp := pg_temp.b3b_cxp('con_movimiento', 'PEN');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  perform pg_temp.b3b_insert_movement(pg_temp.b3b_ctx('empresa_id'), v_d);
  v_error := null;
  begin perform public.corregir_detraccion_compra(v_d, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo_alt'))); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B1_CASO_8|correccion_con_movimiento_aceptada'; end if;
  v_error := null;
  begin perform public.anular_detraccion_compra(v_d); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B1_CASO_8|anulacion_con_movimiento_aceptada'; end if;
  raise notice 'B3B1_CASO_8|correccion_anulacion_con_movimiento=rechazadas';

  -- 9) Usuario sin cxp.editar ni ver_finanzas.
  v_cxp := pg_temp.b3b_cxp('sin_permiso', 'PEN');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.b3b_ctx('user_none'), 'role', 'authenticated')::text, true);
  if public.usuario_puede(pg_temp.b3b_ctx('empresa_id'), 'cxp', 'editar') then raise exception 'B3B1_CASO_9|fixture_tiene_cxp_editar'; end if;
  v_error := null;
  begin perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b_ctx('catalogo'))); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B1_CASO_9|sin_permiso_aceptado'; end if;
  raise notice 'B3B1_CASO_9|sin_cxp_editar_sin_ver_finanzas=rechazado';

  -- 10) No-regresion: una CxP sin SPOT permanece sin obligacion.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.b3b_ctx('user_full'), 'role', 'authenticated')::text, true);
  v_cxp := pg_temp.b3b_cxp('sin_spot', 'PEN');
  if exists (select 1 from public.detracciones where cxp_id = v_cxp and direccion = 'compra') then
    raise exception 'B3B1_CASO_10|cxp_sin_spot_con_obligacion';
  end if;
  raise notice 'B3B1_CASO_10|cxp_sin_spot=preservada';
end;
$test$;

rollback;
\echo 'B3B1_DRY_RUN_ROLLBACK_COMPLETED'
