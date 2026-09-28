\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT / Bloque 3c: dry run ---'
begin;
\ir 20260927_spot_notas_proveedor_body.sql

create temp table b3c_context (clave text primary key, valor text) on commit drop;
create or replace function pg_temp.b3c_ctx(p_clave text) returns text
language sql stable as $$ select valor from b3c_context where clave = p_clave $$;
create or replace function pg_temp.b3c_cxp(p_tag text, p_monto numeric, p_moneda text default 'PEN', p_estado text default 'por_pagar', p_oc text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $fixture$
declare
  v_id text := 'cxp_b3c_' || p_tag || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
begin
  insert into public.cxp (id, empresa_id, proveedor_id, sociedad_id, orden_compra_id, factura_numero,
    fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado,
    tipo_beneficiario, tipo_comprobante, origen, created_at, updated_at)
  values (v_id, pg_temp.b3c_ctx('empresa_id'), pg_temp.b3c_ctx('proveedor_id'), pg_temp.b3c_ctx('sociedad_id')::uuid,
    p_oc, 'F-B3C-' || p_tag, date '2026-09-24', date '2026-10-24', p_monto,
    case when p_estado = 'pagada' then p_monto else 0 end,
    case when p_estado = 'pagada' then 0 else p_monto end, p_moneda, p_estado,
    'proveedor', 'Factura', 'manual', now(), now());
  return v_id;
end;
$fixture$;
create or replace function pg_temp.b3c_saldo_oc(p_oc text)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select greatest(0, coalesce((select total from public.ordenes_compra where id = p_oc), 0)
    - coalesce((select sum(c.monto_total) from public.cxp c where c.orden_compra_id = p_oc and c.estado <> 'anulada'), 0))
$$;
create or replace function pg_temp.b3c_marcar_depositada(p_d uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.detracciones set estado = 'depositada' where id = p_d;
end;
$$;
grant execute on function pg_temp.b3c_ctx(text), pg_temp.b3c_cxp(text,numeric,text,text,text), pg_temp.b3c_saldo_oc(text), pg_temp.b3c_marcar_depositada(uuid) to public;

do $fixture$
declare
  v_empresa text;
  v_sociedad uuid;
  v_proveedor text;
  v_user uuid;
  v_role text := 'role_b3c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  v_oc text;
  v_oc_total numeric;
  v_catalogo text;
begin
  select e.id into v_empresa from public.empresas e order by e.id limit 1;
  if v_empresa is null then raise exception 'B3C_FIXTURE|empresa_no_encontrada'; end if;
  select s.id into v_sociedad from public.sociedades s where s.empresa_id = v_empresa order by s.id limit 1;
  if v_sociedad is null then raise exception 'B3C_FIXTURE|sociedad_no_encontrada'; end if;
  select ue.user_id into v_user from public.usuarios_empresas ue where ue.empresa_id = v_empresa and ue.estado = 'activo' limit 1;
  if v_user is null then raise exception 'B3C_FIXTURE|usuario_no_encontrado'; end if;
  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa, activo)
  values (v_role, v_empresa, 'B3C Notas proveedor', 'Fixture temporal B3C', 'finanzas', 'operativo', false, false, true);
  insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_ver_finanzas)
  values (v_role, 'cxp', true, true, true, true, true), (v_role, 'recepciones', true, true, true, true, false);
  update public.usuarios_empresas set rol_id = v_role where user_id = v_user and empresa_id = v_empresa;
  if not found then raise exception 'B3C_FIXTURE|membresia_no_actualizada'; end if;
  select c.codigo into v_catalogo from public.spot_catalogo c
   where c.estado = 'activo' and c.vigencia_desde <= date '2026-09-24'
     and (c.vigencia_hasta is null or c.vigencia_hasta >= date '2026-09-24') order by c.codigo limit 1;
  if v_catalogo is null then raise exception 'B3C_FIXTURE|catalogo_no_encontrado'; end if;
  select oc.id, oc.total, oc.proveedor_id into v_oc, v_oc_total, v_proveedor
    from public.ordenes_compra oc
   where oc.empresa_id = v_empresa and oc.sociedad_id = v_sociedad and oc.total >= 100 and oc.proveedor_id is not null
     and not exists (select 1 from public.cxp c where c.orden_compra_id = oc.id and c.estado <> 'anulada')
   order by oc.id limit 1;
  if v_oc is null or v_proveedor is null then raise exception 'B3C_FIXTURE|oc_libre_no_encontrada'; end if;
  insert into b3c_context values
    ('empresa_id', v_empresa), ('sociedad_id', v_sociedad::text), ('proveedor_id', v_proveedor),
    ('user_id', v_user::text), ('catalogo', v_catalogo), ('oc_id', v_oc), ('oc_total', v_oc_total::text);
end;
$fixture$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.b3c_ctx('user_id'), 'role', 'authenticated')::text, true);

do $test$
declare
  v_cxp text; v_cxp2 text; v_nd text; v_d uuid; v_r jsonb; v_error text; v_estado text; v_saldo numeric; v_antes numeric; v_despues numeric; v_oc_saldo numeric; v_count integer; v_min numeric; v_total_umbral numeric; v_nc_umbral numeric;
begin
  -- 1. NC parcial: la CxP queda positiva y la relacion conserva sus valores.
  v_cxp := pg_temp.b3c_cxp('nc_parcial', 100);
  v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-001','fecha_nota','2026-09-24','monto',20,'moneda','PEN','motivo','Devolucion parcial','archivo_url','https://example.invalid/b3c-nc-001.pdf'));
  select saldo into v_saldo from public.cxp where id = v_cxp;
  select count(*) into v_count from public.cxp_notas_proveedor where cxp_origen_id = v_cxp;
  raise notice 'B3C_CASO_1|cxp=%|monto_total=%|saldo=%|monto_pagado=%|monto_nc=%|relaciones=%|estado=%', v_cxp, v_r->'cxp'->>'monto_total', v_saldo, v_r->'cxp'->>'monto_pagado', v_r->'relacion'->>'monto_aplicado', v_count, v_r->'cxp'->>'estado';

  -- 2. NC total: anulada con prefijo, usuario y fecha.
  v_cxp := pg_temp.b3c_cxp('nc_total', 80);
  v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-002','fecha_nota','2026-09-24','monto',80,'moneda','PEN','motivo','Devolucion total'));
  select estado, saldo into v_estado, v_saldo from public.cxp where id = v_cxp;
  raise notice 'B3C_CASO_2|cxp=%|estado=%|saldo=%|motivo=%|anulado_por=%|anulado_en=%', v_cxp, v_estado, v_saldo, (select motivo_anulacion from public.cxp where id=v_cxp), (select anulado_por from public.cxp where id=v_cxp), (select anulado_en from public.cxp where id=v_cxp);

  -- 3. Monto cero rechazado.
  v_cxp := pg_temp.b3c_cxp('monto_cero', 100); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-003','monto',0,'motivo','Invalida')); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3C_CASO_3|no_rechazada'; end if;
  raise notice 'B3C_CASO_3|cxp=%|monto=0|saldo=%|filas_relacion=%|rechazado=%', v_cxp, (select saldo from public.cxp where id=v_cxp), (select count(*) from public.cxp_notas_proveedor where cxp_origen_id=v_cxp), v_error;

  -- 4. NC mayor al saldo rechazada sin saldo negativo.
  v_cxp := pg_temp.b3c_cxp('excede_saldo', 100); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-004','monto',100.01,'motivo','Exceso')); exception when others then v_error := sqlerrm; end;
  select saldo into v_saldo from public.cxp where id=v_cxp;
  if v_error is null or v_saldo < 0 then raise exception 'B3C_CASO_4|estado_invalido'; end if;
  raise notice 'B3C_CASO_4|monto_excede_saldo|saldo=%|rechazado=%', v_saldo, v_error;

  -- 5. CxP pagada rechazada.
  v_cxp := pg_temp.b3c_cxp('pagada', 100, 'PEN', 'pagada'); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-005','monto',10,'motivo','Pagada')); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3C_CASO_5|pagada_aceptada'; end if;
  raise notice 'B3C_CASO_5|cxp=%|estado=%|monto=%|saldo=%|rechazada=%', v_cxp, (select estado from public.cxp where id=v_cxp), (select monto_total from public.cxp where id=v_cxp), (select saldo from public.cxp where id=v_cxp), v_error;

  -- 6. CxP con pago parcial rechazado.
  v_cxp := pg_temp.b3c_cxp('parcial', 100, 'PEN', 'pago_parcial'); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-006','monto',10,'motivo','Tiene pago')); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3C_CASO_6|parcial_aceptada'; end if;
  raise notice 'B3C_CASO_6|cxp=%|estado=%|monto_pagado=%|saldo=%|rechazada=%', v_cxp, (select estado from public.cxp where id=v_cxp), (select monto_pagado from public.cxp where id=v_cxp), (select saldo from public.cxp where id=v_cxp), v_error;

  -- 7. CxP con deposito SPOT rechazado.
  v_cxp := pg_temp.b3c_cxp('depositada', 1000); v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot',pg_temp.b3c_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid; perform pg_temp.b3c_marcar_depositada(v_d); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-007','monto',10,'motivo','Depositada')); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3C_CASO_7|depositada_aceptada'; end if;
  raise notice 'B3C_CASO_7|depositada=rechazada|detraccion_estado=%|error=%', (select estado from public.detracciones where id=v_d), v_error;

  -- 8. Idempotencia por numero/tipo/origen.
  v_cxp := pg_temp.b3c_cxp('duplicada', 100); perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-008','monto',10,'motivo','Primera')); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-008','monto',10,'motivo','Reintento')); exception when others then v_error := sqlerrm; end;
  raise notice 'B3C_CASO_8|duplicada=rechazada|relaciones=%|error=%', (select count(*) from public.cxp_notas_proveedor where cxp_origen_id=v_cxp), v_error;

  -- 9. Tipo de nota invalido.
  v_cxp := pg_temp.b3c_cxp('tipo_invalido', 100); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_otra','numero_nota','X','monto',10,'motivo','Invalida')); exception when others then v_error := sqlerrm; end;
  raise notice 'B3C_CASO_9|cxp=%|tipo=nota_otra|monto=10|filas_relacion=%|rechazado=%', v_cxp, (select count(*) from public.cxp_notas_proveedor where cxp_origen_id=v_cxp), v_error;

  -- 10. Datos obligatorios.
  v_cxp := pg_temp.b3c_cxp('datos', 100); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','monto',10,'motivo','')); exception when others then v_error := sqlerrm; end;
  raise notice 'B3C_CASO_10|cxp=%|monto=10|estado=%|filas_relacion=%|rechazado=%', v_cxp, (select estado from public.cxp where id=v_cxp), (select count(*) from public.cxp_notas_proveedor where cxp_origen_id=v_cxp), v_error;

  -- 11. ND positiva sin CxP negativa.
  v_cxp := pg_temp.b3c_cxp('nd', 100); v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_debito','numero_nota','ND-B3C-011','monto',25,'moneda','PEN','motivo','Aumento de valor'));
  v_nd := v_r->'cxp_nota'->>'id';
  raise notice 'B3C_CASO_11|cxp_original=%|cxp_nd=%|monto_nd=%|saldo_nd=%|estado_nd=%|relacion_tipo=%', v_cxp, v_nd, (select monto_total from public.cxp where id=v_nd), (select saldo from public.cxp where id=v_nd), (select estado from public.cxp where id=v_nd), (select tipo_nota from public.cxp_notas_proveedor where cxp_nota_id=v_nd);

  -- 12. ND con obligacion SPOT propia.
  v_cxp := pg_temp.b3c_cxp('nd_spot', 100); v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_debito','numero_nota','ND-B3C-012','monto',100,'moneda','PEN','motivo','ND con SPOT','codigo_spot',pg_temp.b3c_ctx('catalogo')));
  v_nd := v_r->'cxp_nota'->>'id';
  raise notice 'B3C_CASO_12|cxp_nd=%|obligaciones=%|monto_nd=%|detraccion_estado=%', v_nd, (select count(*) from public.detracciones where cxp_id=v_nd and direccion='compra'), (select monto_total from public.cxp where id=v_nd), (select estado from public.detracciones where cxp_id=v_nd and direccion='compra');

  -- 13. USD: conserva tipo de cambio guardado y recalcula NC pendiente.
  v_cxp := pg_temp.b3c_cxp('usd', 1000, 'USD'); v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot',pg_temp.b3c_ctx('catalogo'),'tipo_cambio_detraccion',3.45,'tipo_cambio_fuente','manual')); v_d := (v_r->'detraccion'->>'id')::uuid;
  v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-013','monto',100,'moneda','USD','motivo','Ajuste USD'));
  raise notice 'B3C_CASO_13|cxp=%|tc_guardado=%|base_soles=%|monto_origen=%|monto_soles=%|estado=%', v_cxp, (select tipo_cambio from public.detracciones where id=v_d), (select base_soles from public.detracciones where id=v_d), (select monto_detraccion_origen from public.detracciones where id=v_d), (select monto_detraccion_soles from public.detracciones where id=v_d), (select estado from public.detracciones where id=v_d);

  -- 14. NC bajo umbral anula obligacion sin saldo negativo.
  select c.monto_minimo into v_min from public.spot_catalogo c where c.codigo=pg_temp.b3c_ctx('catalogo') and c.estado='activo' order by c.vigencia_desde desc limit 1;
  v_total_umbral := greatest(1000, coalesce(v_min, 0) + 100);
  v_nc_umbral := v_total_umbral - greatest(0, coalesce(v_min, 0) - 1);
  v_cxp := pg_temp.b3c_cxp('umbral', v_total_umbral); v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot',pg_temp.b3c_ctx('catalogo'))); v_d := (v_r->'detraccion'->>'id')::uuid;
  v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-014','monto',v_nc_umbral,'motivo','Bajo umbral'));
  raise notice 'B3C_CASO_14|cxp_saldo=%|detraccion_estado=%|base_soles=%|monto_soles=%', (select saldo from public.cxp where id=v_cxp), (select estado from public.detracciones where id=v_d), (select base_soles from public.detracciones where id=v_d), (select monto_detraccion_soles from public.detracciones where id=v_d);

  -- 15. Fallo a mitad: ND SPOT invalida no deja CxP ni relacion huerfana; luego NC valida conserva archivo.
  v_cxp := pg_temp.b3c_cxp('atomicidad', 100); v_error := null;
  begin perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_debito','numero_nota','ND-B3C-015-FAIL','monto',10,'motivo','Fallo atomico','codigo_spot','B3C-NO-EXISTE')); exception when others then v_error := sqlerrm; end;
  v_cxp2 := pg_temp.b3c_cxp('relacion', 100); v_r := public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp2,'tipo_nota','nota_credito','numero_nota','NC-B3C-015','monto',10,'motivo','Archivo','archivo_url','https://example.invalid/nc.pdf')); raise notice 'B3C_CASO_15|error_atomico=%|cxp_hija_huerfana=%|cxp_nota_id=%|numero=%|monto_aplicado=%|archivo=%|filas=%', v_error, (select count(*) from public.cxp where factura_numero='ND-B3C-015-FAIL' and proveedor_id=pg_temp.b3c_ctx('proveedor_id')), v_r->'relacion'->>'cxp_nota_id', v_r->'relacion'->>'numero_nota', v_r->'relacion'->>'monto_aplicado', v_r->'relacion'->>'archivo_url', (select count(*) from public.cxp_notas_proveedor where cxp_origen_id=v_cxp2);

  -- 16. Ficha: consulta de relacion devuelve CxP original anulada.
  select r.cxp_origen_id into v_cxp from public.cxp_notas_proveedor r where r.numero_nota='NC-B3C-002';
  raise notice 'B3C_CASO_16|consulta_relacion_cxp=%|estado=%|motivo=%|usuario=%|fecha=%', v_cxp, (select estado from public.cxp where id=v_cxp), (select motivo_anulacion from public.cxp where id=v_cxp), (select anulado_por from public.cxp where id=v_cxp), (select anulado_en from public.cxp where id=v_cxp);

  -- 17. OC: saldo neto despues de NC parcial y total.
  v_oc_saldo := pg_temp.b3c_saldo_oc(pg_temp.b3c_ctx('oc_id')); v_cxp := pg_temp.b3c_cxp('oc', 100, 'PEN', 'por_pagar', pg_temp.b3c_ctx('oc_id')); v_antes := pg_temp.b3c_saldo_oc(pg_temp.b3c_ctx('oc_id'));
  perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-017A','monto',20,'motivo','NC parcial OC'));
  v_despues := pg_temp.b3c_saldo_oc(pg_temp.b3c_ctx('oc_id'));
  raise notice 'B3C_CASO_17A|oc=%|saldo_antes_cxp=%|saldo_despues_nc_parcial=%|cxp_saldo=%|cxp_total=%', pg_temp.b3c_ctx('oc_id'), v_antes, v_despues, (select saldo from public.cxp where id=v_cxp), (select monto_total from public.cxp where id=v_cxp);
  perform public.registrar_nota_proveedor_spot(jsonb_build_object('cxp_origen_id',v_cxp,'tipo_nota','nota_credito','numero_nota','NC-B3C-017B','monto',80,'motivo','NC total OC'));
  raise notice 'B3C_CASO_17B|oc=%|saldo_despues_nc_total=%|cxp_estado=%|cxp_saldo=%|cxp_total=%', pg_temp.b3c_ctx('oc_id'), pg_temp.b3c_saldo_oc(pg_temp.b3c_ctx('oc_id')), (select estado from public.cxp where id=v_cxp), (select saldo from public.cxp where id=v_cxp), (select monto_total from public.cxp where id=v_cxp);

  -- 18. Verificacion de no sobrefacturacion de OC.
  v_oc_saldo := pg_temp.b3c_saldo_oc(pg_temp.b3c_ctx('oc_id')); v_error := null;
  begin perform public.generar_cxp_centralizado(jsonb_build_object('id','cxp_b3c_exceso','empresa_id',pg_temp.b3c_ctx('empresa_id'),'sociedad_id',pg_temp.b3c_ctx('sociedad_id'),'proveedor_id',pg_temp.b3c_ctx('proveedor_id'),'orden_compra_id',pg_temp.b3c_ctx('oc_id'),'fecha_emision','2026-09-24','fecha_vencimiento','2026-10-24','monto_total',v_oc_saldo+0.01,'saldo',v_oc_saldo+0.01,'monto_pagado',0,'tipo_beneficiario','proveedor','tipo_comprobante','Factura'), 'cxp_manual', 'crear'); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3C_CASO_18|sobrefacturacion_aceptada'; end if;
  raise notice 'B3C_CASO_18|oc_saldo_disponible=%|sobrefacturacion_rechazada=%', v_oc_saldo, v_error;
end;
$test$;

rollback;
\echo 'B3C_DRY_RUN_ROLLBACK_COMPLETED'
