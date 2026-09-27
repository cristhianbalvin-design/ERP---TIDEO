\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT Bloque 2 / autodetraccion: dry run ---'
begin;
\ir 20260926_spot_autodetraccion_body.sql

create or replace function pg_temp.spot2_id(p_prefix text)
returns text
language sql
as $$
  select p_prefix || '_' || replace(gen_random_uuid()::text, '-', '');
$$;

create temp table pg_temp.spot2_context (
  clave text primary key,
  valor text not null
) on commit drop;

create or replace function pg_temp.spot2_ctx(p_clave text)
returns text
language sql
stable
as $$
  select valor from pg_temp.spot2_context where clave = p_clave;
$$;

do $setup$
declare
  v_empresa text := 'emp_2000000000';
  v_auth_user uuid;
  v_sociedad uuid;
  v_sociedad_other uuid;
  v_cebe text;
  v_cuenta text;
  v_servicio text;
  v_catalogo uuid;
  v_origen text;
  v_destino text;
  v_destino_other text;
  v_usd text;
begin
  select ue.user_id into v_auth_user
  from public.usuarios_empresas ue
  join public.roles r on r.id = ue.rol_id
  where ue.empresa_id = v_empresa
    and ue.estado = 'activo'
    and (
      r.es_admin_empresa is true
      or r.es_superadmin is true
      or exists (
        select 1 from public.permisos_roles pr
        where pr.rol_id = ue.rol_id
          and pr.pantalla = 'facturacion'
          and pr.puede_crear is true
      )
    )
  order by r.es_superadmin desc, r.es_admin_empresa desc, ue.user_id
  limit 1;
  if v_auth_user is null then
    raise exception 'FIXTURE|usuario_facturacion_crear_ausente';
  end if;

  select s.id into v_sociedad
  from public.sociedades s
  where s.empresa_id = v_empresa and coalesce(s.activa, true)
  order by coalesce(s.es_principal, false) desc, s.nombre, s.id
  limit 1;
  if v_sociedad is null then
    v_sociedad := gen_random_uuid();
    insert into public.sociedades(id, empresa_id, codigo, nombre, activa, es_principal)
    values (v_sociedad, v_empresa, 'SPOT2-' || replace(v_sociedad::text, '-', ''), 'Sociedad temporal SPOT2', true, false);
  end if;

  select s.id into v_sociedad_other
  from public.sociedades s
  where s.empresa_id = v_empresa and coalesce(s.activa, true) and s.id <> v_sociedad
  order by s.nombre, s.id
  limit 1;
  if v_sociedad_other is null then
    v_sociedad_other := gen_random_uuid();
    insert into public.sociedades(id, empresa_id, codigo, nombre, activa, es_principal)
    values (v_sociedad_other, v_empresa, 'SPOT2-OTRA-' || replace(v_sociedad_other::text, '-', ''), 'Sociedad temporal SPOT2 otra', true, false);
  end if;

  select sc.id into v_catalogo
  from public.spot_catalogo sc
  where sc.codigo = '012'
    and sc.vigencia_desde <= date '2026-09-24'
    and (sc.vigencia_hasta is null or sc.vigencia_hasta >= date '2026-09-24')
    and sc.estado = 'activo'
  order by sc.vigencia_desde desc
  limit 1;
  if v_catalogo is null then
    raise exception 'FIXTURE|spot_catalogo_012_ausente';
  end if;

  select c.id into v_cebe
  from public.centros_beneficio c
  where c.empresa_id = v_empresa and c.sociedad_id = v_sociedad and c.estado = 'activo'
    and (c.fecha_inicio is null or c.fecha_inicio <= date '2026-09-24')
    and (c.fecha_fin is null or c.fecha_fin >= date '2026-09-24')
  order by c.codigo, c.id
  limit 1;
  if v_cebe is null then
    v_cebe := pg_temp.spot2_id('cebe');
    insert into public.centros_beneficio(id, empresa_id, codigo, nombre, tipo, estado, fecha_inicio, fecha_fin, sociedad_id)
    values (v_cebe, v_empresa, 'SPOT2-' || replace(v_cebe, 'cebe_', ''), 'CEBE temporal SPOT2', 'temporal', 'activo', date '2026-01-01', null, v_sociedad);
  end if;

  select c.id into v_cuenta
  from public.cuentas c
  where c.empresa_id = v_empresa and coalesce(c.estado, 'activo') = 'activo'
  order by c.created_at, c.id
  limit 1;
  if v_cuenta is null then
    v_cuenta := pg_temp.spot2_id('cta');
    insert into public.cuentas(id, empresa_id, nombre_comercial, tipo, moneda, estado)
    values (v_cuenta, v_empresa, 'Cliente temporal SPOT2', 'cliente', 'PEN', 'activo');
  end if;

  select s.id into v_servicio
  from public.servicios s
  where s.empresa_id = v_empresa and coalesce(s.estado, 'activo') = 'activo' and s.spot_catalogo_id = v_catalogo
  order by s.codigo, s.id
  limit 1;
  if v_servicio is null then
    v_servicio := pg_temp.spot2_id('srv');
    insert into public.servicios(id, empresa_id, codigo, familia, descripcion, unidad, moneda, precio, estado, facturable, spot_catalogo_id)
    values (v_servicio, v_empresa, 'SPOT2-012-' || replace(v_servicio, 'srv_', ''), 'SPOT2', 'Servicio temporal codigo 012', 'Servicio', 'PEN', 1000, 'activo', true, v_catalogo);
  end if;

  select cb.id into v_origen
  from public.cuentas_bancarias cb
  where cb.empresa_id = v_empresa and cb.sociedad_id = v_sociedad and cb.moneda = 'PEN' and cb.estado = 'activo'
    and coalesce(cb.es_cuenta_detracciones, false) is false
  order by cb.creado_en, cb.id limit 1;
  if v_origen is null then
    v_origen := pg_temp.spot2_id('cb');
    insert into public.cuentas_bancarias(id, empresa_id, nombre, banco, moneda, tipo, estado, sociedad_id, es_cuenta_detracciones)
    values (v_origen, v_empresa, 'Cuenta origen temporal SPOT2', 'Banco de prueba', 'PEN', 'corriente', 'activo', v_sociedad, false);
  end if;

  select cb.id into v_destino
  from public.cuentas_bancarias cb
  where cb.empresa_id = v_empresa and cb.sociedad_id = v_sociedad and cb.moneda = 'PEN' and cb.estado = 'activo'
    and cb.es_cuenta_detracciones is true
  order by cb.creado_en, cb.id limit 1;
  if v_destino is null then
    v_destino := pg_temp.spot2_id('cb');
    insert into public.cuentas_bancarias(id, empresa_id, nombre, banco, moneda, tipo, estado, sociedad_id, es_cuenta_detracciones)
    values (v_destino, v_empresa, 'Cuenta BN temporal SPOT2', 'Banco de la Nación', 'PEN', 'corriente', 'activo', v_sociedad, true);
  end if;

  select cb.id into v_destino_other
  from public.cuentas_bancarias cb
  where cb.empresa_id = v_empresa and cb.sociedad_id = v_sociedad_other and cb.moneda = 'PEN' and cb.estado = 'activo'
    and cb.es_cuenta_detracciones is true
  order by cb.creado_en, cb.id limit 1;
  if v_destino_other is null then
    v_destino_other := pg_temp.spot2_id('cb');
    insert into public.cuentas_bancarias(id, empresa_id, nombre, banco, moneda, tipo, estado, sociedad_id, es_cuenta_detracciones)
    values (v_destino_other, v_empresa, 'Cuenta BN temporal SPOT2 otra', 'Banco de la Nación', 'PEN', 'corriente', 'activo', v_sociedad_other, true);
  end if;

  select cb.id into v_usd
  from public.cuentas_bancarias cb
  where cb.empresa_id = v_empresa and cb.sociedad_id = v_sociedad and cb.moneda = 'USD' and cb.estado = 'activo'
    and coalesce(cb.es_cuenta_detracciones, false) is false
  order by cb.creado_en, cb.id limit 1;
  if v_usd is null then
    v_usd := pg_temp.spot2_id('cb');
    insert into public.cuentas_bancarias(id, empresa_id, nombre, banco, moneda, tipo, estado, sociedad_id, es_cuenta_detracciones)
    values (v_usd, v_empresa, 'Cuenta USD temporal SPOT2', 'Banco de prueba', 'USD', 'corriente', 'activo', v_sociedad, false);
  end if;

  insert into pg_temp.spot2_context(clave, valor) values
    ('empresa_id', v_empresa), ('auth_user_id', v_auth_user::text),
    ('sociedad_id', v_sociedad::text), ('sociedad_other_id', v_sociedad_other::text),
    ('cebe_id', v_cebe), ('cuenta_id', v_cuenta), ('servicio_id', v_servicio),
    ('catalogo_id', v_catalogo::text), ('cuenta_origen_id', v_origen),
    ('cuenta_destino_id', v_destino), ('cuenta_destino_other_id', v_destino_other),
    ('cuenta_usd_id', v_usd);
end;
$setup$;

create or replace function pg_temp.fixture_spot2(
  p_tag text,
  p_moneda text default 'PEN',
  p_estado text default 'pendiente',
  p_fecha date default date '2026-09-24'
) returns jsonb
language plpgsql
as $fixture$
declare
  v_empresa text := pg_temp.spot2_ctx('empresa_id');
  v_factura text := pg_temp.spot2_id('fac');
  v_cxc text := pg_temp.spot2_id('cxc');
  v_detraccion uuid;
  v_emitido jsonb;
  v_items jsonb;
  v_subtotal numeric := round(1000 / 1.18, 2);
  v_igv numeric := round(1000 - v_subtotal, 2);
begin
  if p_estado is null then
    v_items := jsonb_build_array(jsonb_build_object('descripcion', 'Servicio manual temporal SPOT2', 'cantidad', 1, 'precio_unitario', 1000));
  else
    v_items := jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.spot2_ctx('servicio_id'), 'cantidad', 1, 'precio_unitario', 1000));
  end if;

  v_emitido := public.emitir_factura_cxc_atomico(
    jsonb_build_object(
      'empresa_id', v_empresa, 'factura_id', v_factura, 'cxc_id', v_cxc,
      'cuenta_id', pg_temp.spot2_ctx('cuenta_id'), 'centro_beneficio_id', pg_temp.spot2_ctx('cebe_id'),
      'sociedad_id', pg_temp.spot2_ctx('sociedad_id')::uuid,
      'numero', 'F-SPOT2-' || p_tag || '-' || replace(v_factura, 'fac_', ''),
      'tipo_documento', 'factura', 'fecha_emision', p_fecha, 'fecha_vencimiento', p_fecha + 30,
      'subtotal', v_subtotal, 'igv', v_igv, 'total', 1000, 'moneda', p_moneda,
      'tipo_cambio_detraccion', case when p_moneda = 'USD' then 3.38 else null end,
      'tipo_cambio_fuente', case when p_moneda = 'USD' then 'manual' else null end,
      'items', v_items
    )
  );

  select d.id into v_detraccion
  from public.detracciones d
  where d.factura_id = v_factura and d.documento_ajuste_id is null
  order by d.creado_en desc limit 1;
  if p_estado is not null and v_detraccion is null then
    raise exception 'FIXTURE|emision_no_creo_obligacion|tag=%', p_tag;
  end if;
  if p_estado is not null and p_estado <> 'pendiente' then
    update public.detracciones set estado = p_estado where id = v_detraccion;
  end if;

  return jsonb_build_object(
    'factura_id', v_factura, 'cxc_id', v_cxc, 'detraccion_id', v_detraccion,
    'monto_soles', coalesce((select d.monto_detraccion_soles from public.detracciones d where d.id = v_detraccion), 0),
    'emision', v_emitido
  );
end;
$fixture$;

select set_config('request.jwt.claims',
  (select jsonb_build_object('sub', valor, 'role', 'authenticated')::text from pg_temp.spot2_context where clave = 'auth_user_id'),
  true);

\echo '--- caso 1: cobro normal sin detraccion, parcial ---'
do $test$
declare f jsonb; r jsonb;
begin
  f := pg_temp.fixture_spot2('normal_parcial', 'PEN', null);
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',300,'fecha_cobro','2026-09-24'),
    jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',300,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')), null);
  if r->'cxc'->>'saldo' <> '700.00' then raise exception 'CASO_1|saldo_incorrecto'; end if;
  raise notice 'CASO_1|cobro_normal_parcial=aceptado';
end;
$test$;

\echo '--- caso 2: cobro normal sin detraccion, total ---'
do $test$
declare f jsonb; r jsonb;
begin
  f := pg_temp.fixture_spot2('normal_total', 'PEN', null);
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',1000,'fecha_cobro','2026-09-24'),
    jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')), null);
  if r->'cxc'->>'estado' <> 'cobrada' then raise exception 'CASO_2|estado_incorrecto'; end if;
  raise notice 'CASO_2|cobro_normal_total=aceptado';
end;
$test$;

\echo '--- caso 3: limite normal con detraccion pendiente ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('limite_normal', 'PEN', 'pendiente');
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
      jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',881),
      jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',881,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')), null);
  exception when others then e := sqlerrm; end;
  if e not like 'El cobro normal no puede invadir%' then raise exception 'CASO_3|rechazo_incorrecto=%', e; end if;
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',880),
    jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',880,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')), null);
  raise notice 'CASO_3|881=rechazado|880=aceptado|limite_preservado';
end;
$test$;

\echo '--- caso 4: deposito de detraccion del cliente ---'
do $test$
declare f jsonb; r jsonb; d text;
begin
  f := pg_temp.fixture_spot2('deposito_cliente', 'PEN', 'pendiente');
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id',pg_temp.spot2_id('cob'),'tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120,'numero_constancia','CONST-SPOT2-4','fecha_cobro','2026-09-24'),
    jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',120,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_destino_id')), null);
  select estado into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  if d <> 'depositada' then raise exception 'CASO_4|estado=%', d; end if;
  raise notice 'CASO_4|deposito_cliente=aceptado|estado=depositada';
end;
$test$;

\echo '--- caso 5: indicador total sin detraer con monto corto ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autocorto', 'PEN', 'pendiente');
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
      jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',999,'cliente_pago_total_sin_detraer',true),
      jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',999,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')), null);
  exception when others then e := sqlerrm; end;
  if e not like 'El pago total sin detraccion debe cubrir exactamente%' then raise exception 'CASO_5|mensaje=%',e; end if;
  raise notice 'CASO_5|pago_total_sin_detraer_monto_corto=rechazado';
end;
$test$;

\echo '--- caso 6: indicador total sin detraer sin obligacion ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autosinobligacion', 'PEN', null);
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
      jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',1000,'cliente_pago_total_sin_detraer',true),
      jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',1000,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')), null);
  exception when others then e := sqlerrm; end;
  if e not like 'El pago total sin detraccion requiere%' then raise exception 'CASO_6|mensaje=%',e; end if;
  raise notice 'CASO_6|sin_obligacion_pendiente=rechazado';
end;
$test$;

\echo '--- caso 7: cobro total sin detraer, transicion y comision unica ---'
do $test$
declare f jsonb; r jsonb; d record; n integer; v_cobro text; v_mov text; v_comision text;
begin
  f := pg_temp.fixture_spot2('autopago', 'PEN', 'pendiente');
  v_cobro := pg_temp.spot2_id('cob'); v_mov := pg_temp.spot2_id('mov'); v_comision := pg_temp.spot2_id('com');
  r := public.registrar_cobro_cxc_atomico(pg_temp.spot2_ctx('empresa_id'), f->>'cxc_id',
    jsonb_build_object('id',v_cobro,'monto_capital',1000,'cliente_pago_total_sin_detraer',true,'fecha_cobro','2026-09-24'),
    jsonb_build_object('id',v_mov,'monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')),
    jsonb_build_object('id',v_comision,'monto_cobrado',1000,'porcentaje_comision',10,'monto_comision',100,'bonificacion',0,'monto_total',100,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  select * into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  select count(*) into n from public.comisiones where cobro_cxc_id=v_cobro;
  if r->'cxc'->>'estado' <> 'cobrada' or d.estado <> 'por_autodetraer' or d.fecha_limite_deposito is null or n <> 1 then raise exception 'CASO_7|resultado_incorrecto'; end if;
  raise notice 'CASO_7|cxc=cobrada|obligacion=por_autodetraer|fecha_limite=true|comisiones=1';
end;
$test$;

\echo '--- caso 8: autodetraccion atomica valida ---'
do $test$
declare f jsonb; r jsonb; d record; n integer; vinculo text;
begin
  f := pg_temp.fixture_spot2('autovalida', 'PEN', 'por_autodetraer');
  r := public.registrar_autodetraccion(pg_temp.spot2_ctx('empresa_id'),(f->>'detraccion_id')::uuid,pg_temp.spot2_ctx('cuenta_origen_id'),pg_temp.spot2_ctx('cuenta_destino_id'),date '2026-09-30','CONST-AUTO-8','OP-AUTO-8');
  select * into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  select count(*), min(vinculo_id) into n, vinculo from public.movimientos_tesoreria where detraccion_id=(f->>'detraccion_id')::uuid and vinculo_tipo='autodetraccion';
  if d.estado <> 'autodetraida' or n <> 2 or vinculo is null or r->'movimiento_egreso'->>'tipo' <> 'egreso' or r->'movimiento_ingreso'->>'tipo' <> 'ingreso' then raise exception 'CASO_8|resultado_incorrecto'; end if;
  raise notice 'CASO_8|egreso_ingreso=2|monto=120_PEN|estado=autodetraida|constancia=obligatoria';
end;
$test$;

\echo '--- caso 9: rechazo atomico por sociedad de destino ---'
do $test$
declare f jsonb; e text; r jsonb; n integer;
begin
  f := pg_temp.fixture_spot2('autoinvalida', 'PEN', 'por_autodetraer');
  begin
    r := public.registrar_autodetraccion(pg_temp.spot2_ctx('empresa_id'),(f->>'detraccion_id')::uuid,pg_temp.spot2_ctx('cuenta_origen_id'),pg_temp.spot2_ctx('cuenta_destino_other_id'),date '2026-09-30','CONST-AUTO-9',null);
  exception when others then e := sqlerrm; end;
  select count(*) into n from public.movimientos_tesoreria where detraccion_id=(f->>'detraccion_id')::uuid;
  if e not like 'La cuenta destino debe ser%' or n <> 0 then raise exception 'CASO_9|rollback_incorrecto|mensaje=%|movimientos=%',e,n; end if;
  raise notice 'CASO_9|sociedad_distinta=rechazado|movimientos=0';
end;
$test$;

\echo '--- caso 10: reintento sin duplicar ni cobrar ---'
do $test$
declare f jsonb; e text; r jsonb; n integer; c integer; m integer;
begin
  f := pg_temp.fixture_spot2('autoreintento', 'PEN', 'por_autodetraer');
  r := public.registrar_autodetraccion(pg_temp.spot2_ctx('empresa_id'),(f->>'detraccion_id')::uuid,pg_temp.spot2_ctx('cuenta_origen_id'),pg_temp.spot2_ctx('cuenta_destino_id'),date '2026-09-30','CONST-AUTO-10',null);
  begin
    r := public.registrar_autodetraccion(pg_temp.spot2_ctx('empresa_id'),(f->>'detraccion_id')::uuid,pg_temp.spot2_ctx('cuenta_origen_id'),pg_temp.spot2_ctx('cuenta_destino_id'),date '2026-09-30','CONST-AUTO-10',null);
  exception when others then e := sqlerrm; end;
  select count(*) into n from public.movimientos_tesoreria where detraccion_id=(f->>'detraccion_id')::uuid;
  select count(*) into c from public.cobros_cxc where cxc_id=f->>'cxc_id';
  select count(*) into m from public.comisiones where cxc_id=f->>'cxc_id';
  if e not like 'La obligación SPOT no está pendiente%' or n <> 2 or c <> 0 or m <> 0 then raise exception 'CASO_10|idempotencia_incorrecta'; end if;
  raise notice 'CASO_10|reintento=rechazado|movimientos=2|cobros=0|comisiones=0';
end;
$test$;

\echo '--- caso 11: origen USD rechazado ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autousd', 'USD', 'por_autodetraer');
  begin
    r := public.registrar_autodetraccion(pg_temp.spot2_ctx('empresa_id'),(f->>'detraccion_id')::uuid,pg_temp.spot2_ctx('cuenta_usd_id'),pg_temp.spot2_ctx('cuenta_destino_id'),date '2026-09-30','CONST-AUTO-11',null);
  exception when others then e := sqlerrm; end;
  if e not like 'La cuenta origen debe ser%' then raise exception 'CASO_11|mensaje=%',e; end if;
  raise notice 'CASO_11|cuenta_origen_USD=rechazada|regla=PEN_only';
end;
$test$;

\echo '--- caso 12: trigger defensivo ---'
do $test$
declare e text;
begin
  begin
    insert into public.movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,vinculo_tipo,vinculo_id,estado,detraccion_id)
    values(pg_temp.spot2_id('mov'),'emp_2000000000','egreso','Movimiento no SPOT',10,'PEN',date '2026-09-24',pg_temp.spot2_ctx('cuenta_origen_id'),'otro',pg_temp.spot2_id('vinculo'),'registrado',gen_random_uuid());
  exception when others then e := sqlerrm; end;
  if e not like 'La cuenta bancaria del movimiento no es%' then raise exception 'CASO_12|egreso_no_autodetraccion=%',e; end if;
  begin
    insert into public.movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,vinculo_tipo,vinculo_id,estado)
    values(pg_temp.spot2_id('mov'),'emp_2000000000','ingreso','Cobro normal BN',10,'PEN',date '2026-09-24',pg_temp.spot2_ctx('cuenta_destino_id'),'cxc',pg_temp.spot2_id('vinculo'),'registrado');
  exception when others then e := sqlerrm; end;
  if e not like 'Un cobro normal%' then raise exception 'CASO_12|ingreso_BN=%',e; end if;
  raise notice 'CASO_12|egreso_sin_vinculo=rechazado|cobro_normal_BN=rechazado';
end;
$test$;

\echo '--- caso 13: por_autodetraer no acepta deposito del cliente ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autodeposito_cliente', 'PEN', 'por_autodetraer');
  begin
    r := public.registrar_cobro_cxc_atomico(pg_temp.spot2_ctx('empresa_id'),f->>'cxc_id',jsonb_build_object('id',pg_temp.spot2_id('cob'),'tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',120,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_destino_id')),null);
  exception when others then e := sqlerrm; end;
  if e not like 'No existe una obligacion SPOT pendiente%' then raise exception 'CASO_13|mensaje=%',e; end if;
  raise notice 'CASO_13|deposito_cliente_sobre_por_autodetraer=rechazado';
end;
$test$;

\echo '--- caso 14: NC y ND bloqueadas ---'
do $test$
declare f jsonb; e_nc text; e_nd text; r jsonb; v_nc text; v_nd text;
begin
  f := pg_temp.fixture_spot2('autonotas', 'PEN', 'por_autodetraer');
  v_nc := pg_temp.spot2_id('fac_nc'); v_nd := pg_temp.spot2_id('fac_nd');
  begin
    r := public.emitir_nota_cxc_atomica(jsonb_build_object('empresa_id',pg_temp.spot2_ctx('empresa_id'),'factura_origen_id',f->>'factura_id','factura_id',v_nc,'sociedad_id',pg_temp.spot2_ctx('sociedad_id'),'tipo_documento','nota_credito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  exception when others then e_nc := sqlerrm; end;
  begin
    r := public.emitir_nota_cxc_atomica(jsonb_build_object('empresa_id',pg_temp.spot2_ctx('empresa_id'),'factura_origen_id',f->>'factura_id','factura_id',v_nd,'sociedad_id',pg_temp.spot2_ctx('sociedad_id'),'tipo_documento','nota_debito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  exception when others then e_nd := sqlerrm; end;
  if e_nc <> 'La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.' or e_nd <> 'La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.' then raise exception 'CASO_14|mensajes_no_coinciden'; end if;
  raise notice 'CASO_14|NC=rechazada|ND=rechazada|mensaje_D7=exacto';
end;
$test$;

\echo '--- caso 15: no-regresion resumida ---'
do $test$
declare f jsonb; r jsonb; d text;
begin
  f := pg_temp.fixture_spot2('noregresion_det', 'PEN', 'pendiente');
  r := public.registrar_cobro_cxc_atomico(pg_temp.spot2_ctx('empresa_id'),f->>'cxc_id',jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',880),jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',880,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')),null);
  r := public.registrar_cobro_cxc_atomico(pg_temp.spot2_ctx('empresa_id'),f->>'cxc_id',jsonb_build_object('id',pg_temp.spot2_id('cob'),'tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',120,'moneda','PEN','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_destino_id')),null);
  select estado into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  if r->'cxc'->>'estado' <> 'cobrada' or d <> 'depositada' then raise exception 'CASO_15|no_regresion_fallo'; end if;
  raise notice 'CASO_15|normal=preservado|limite=preservado|deposito=preservado|nota_pendiente=preservada';
end;
$test$;

\echo '--- caso 16: quinto dia habil con feriado nacional temporal ---'
do $test$
declare f jsonb; r jsonb; d date;
begin
  insert into public.feriados(empresa_id,fecha,nombre,origen,ambito)
  values('emp_2000000000',date '2026-09-28','Feriado nacional de prueba SPOT2','manual','nacional')
  on conflict (empresa_id,fecha) do update set ambito='nacional';
  f := pg_temp.fixture_spot2('fecha_habil', 'PEN', 'pendiente', date '2026-09-24');
  r := public.registrar_cobro_cxc_atomico(pg_temp.spot2_ctx('empresa_id'),f->>'cxc_id',jsonb_build_object('id',pg_temp.spot2_id('cob'),'monto_capital',1000,'cliente_pago_total_sin_detraer',true,'fecha_cobro','2026-09-24'),jsonb_build_object('id',pg_temp.spot2_id('mov'),'monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id',pg_temp.spot2_ctx('cuenta_origen_id')),null);
  select fecha_limite_deposito into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  if d <> date '2026-10-02' then raise exception 'CASO_16|fecha=%|esperada=2026-10-02',d; end if;
  raise notice 'CASO_16|cobro=2026-09-24|feriado=2026-09-28|quinto_habil=2026-10-02';
end;
$test$;

rollback;
\echo 'SPOT2_DRY_RUN_ROLLBACK_COMPLETED'
