-- Dry run del Paso 3. Nunca confirma cambios en la base de datos.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir ../migrations/20260924020000_spot_detracciones.sql

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'detracciones' and column_name = 'id' and data_type = 'uuid')
      or (table_name = 'detracciones' and column_name = 'empresa_id' and data_type = 'text')
      or (table_name = 'detracciones' and column_name = 'sociedad_id' and data_type = 'uuid')
      or (table_name = 'detracciones' and column_name in ('factura_id','cxc_id','cxp_id','documento_ajuste_id') and data_type = 'text')
      or (table_name = 'cobros_cxc' and column_name = 'detraccion_id' and data_type = 'uuid')
      or (table_name = 'movimientos_tesoreria' and column_name = 'detraccion_id' and data_type = 'uuid')
    );
  if v_count <> 9 then
    raise exception 'VALIDACION_TIPOS_FALLO|esperadas=9|obtenidas=%', v_count;
  end if;
  raise notice 'VALIDACION_TIPOS|detracciones_id_uuid|referencias_documento_text|vinculos_uuid';
end
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_constraint
  where contype = 'f'
    and connamespace = 'public'::regnamespace
    and conname in (
      'detracciones_empresa_id_fkey',
      'detracciones_sociedad_id_fkey',
      'detracciones_factura_id_fkey',
      'detracciones_cxc_id_fkey',
      'detracciones_cxp_id_fkey',
      'detracciones_documento_ajuste_id_fkey',
      'detracciones_spot_catalogo_id_fkey',
      'cobros_cxc_detraccion_id_fkey',
      'movimientos_tesoreria_detraccion_id_fkey'
    )
    and confdeltype = 'a';
  if v_count <> 9 then
    raise exception 'VALIDACION_FK_NO_ACTION_FALLO|esperadas=9|obtenidas=%', v_count;
  end if;
  raise notice 'VALIDACION_FK_NO_ACTION|9';
end
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_constraint
  where conrelid = 'public.detracciones'::regclass
    and conname in ('detracciones_direccion_documento_ck','detracciones_origen_catalogo_ck','detracciones_tipo_cambio_ck');
  if v_count <> 3 then
    raise exception 'VALIDACION_CHECKS_FALLO|esperadas=3|obtenidas=%', v_count;
  end if;
  raise notice 'VALIDACION_CHECKS|documento|origen_catalogo|tipo_cambio';
end
$$;

do $$
declare
  v_count integer;
  v_predicate text;
begin
  select count(*), max(pg_get_expr(i.indpred, i.indrelid))
    into v_count, v_predicate
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  where i.indrelid = 'public.detracciones'::regclass
    and c.relname = 'detracciones_venta_factura_unq'
    and i.indisunique;
  if v_count <> 1
     or v_predicate not like '%direccion = ''venta''%'
     or v_predicate not like '%documento_ajuste_id IS NULL%'
     or v_predicate not like '%estado <> ''anulada''%' then
    raise exception 'VALIDACION_UNICIDAD_VENTA_FALLO|indice=%|predicado=%', v_count, v_predicate;
  end if;
  raise notice 'VALIDACION_UNICIDAD_VENTA|factura_id|ajustes_fuera|anulada_fuera';
end
$$;

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from information_schema.columns
  where (table_schema = 'public' and table_name in ('facturas','cxc') and column_name = 'detraccion_id')
     or (table_schema = 'public' and table_name = 'detracciones' and column_name in ('cobro_cxc_id','movimiento_tesoreria_id','cxp_pago_id'));
  if v_bad <> 0 then
    raise exception 'VALIDACION_D3_COLUMNAS_DUPLICADAS_FALLO|obtenidas=%', v_bad;
  end if;
  raise notice 'VALIDACION_D3_COLUMNAS|0';
end
$$;

do $$
begin
  begin
    insert into public.detracciones (
      id, direccion, factura_id, cxc_id, empresa_id, sociedad_id,
      origen, moneda_origen, base_soles, monto_detraccion_soles, monto_detraccion_origen
    ) values (
      '00000000-0000-0000-0000-000000000303', 'venta', 'fac_sc1_prb', 'cxc_sc1_prb',
      'emp_20513453711', '6deed52c-845c-42bb-a61f-6666dea723f3',
      'importacion', 'PEN', 100, 10, 10
    );
    raise exception 'VALIDACION_DERIVACION_FALLO|se acepto_empresa_incorrecta';
  exception when others then
    if sqlerrm not like 'DETRACCION_CONTEXTO_EMPRESA_RECHAZADO:%' then
      raise;
    end if;
    raise notice 'VALIDACION_DERIVACION|empresa_cliente_incorrecta=rechazada';
  end;
  begin
    insert into public.detracciones (
      id, direccion, factura_id, cxc_id, empresa_id, sociedad_id,
      origen, moneda_origen, base_soles, monto_detraccion_soles, monto_detraccion_origen
    ) values (
      '00000000-0000-0000-0000-000000000304', 'venta', 'fac_sc1_prb', 'cxc_sc1_prb',
      'emp_2000000000', '6deed52c-845c-42bb-a61f-6666dea723f3',
      'importacion', 'PEN', 100, 10, 10
    );
    raise exception 'VALIDACION_DERIVACION_FALLO|se_acepto_sociedad_incorrecta';
  exception when others then
    if sqlerrm not like 'DETRACCION_CONTEXTO_SOCIEDAD_RECHAZADO:%' then
      raise;
    end if;
    raise notice 'VALIDACION_DERIVACION|sociedad_cliente_incorrecta=rechazada';
  end;
end
$$;

insert into public.detracciones (
  id, direccion, factura_id, cxc_id, origen, moneda_origen,
  base_soles, monto_detraccion_soles, monto_detraccion_origen
) values (
  '00000000-0000-0000-0000-000000000301', 'venta', 'fac_sc1_prb', 'cxc_sc1_prb',
  'importacion', 'PEN', 100, 10, 10
), (
  '00000000-0000-0000-0000-000000000302', 'venta', 'fac_imp_04ece8a3755348438263', 'cxc_imp_eb1c81d84b80449e8261',
  'importacion', 'PEN', 100, 10, 10
);

select set_config('request.jwt.claim.sub', '94c60fcb-8818-42e4-b395-31a8ff8635b1', true);
select set_config('request.jwt.claims', '{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_own integer;
  v_other integer;
begin
  select count(*) into v_own from public.detracciones where empresa_id = 'emp_2000000000';
  select count(*) into v_other from public.detracciones where empresa_id = 'emp_20513453711';
  if v_own <> 1 or v_other <> 0 then
    raise exception 'VALIDACION_RLS_FALLO|propias=%|otra_empresa=%', v_own, v_other;
  end if;
  raise notice 'VALIDACION_RLS|usuario_prueba=emp_2000000000|propias=1|otra_empresa=0';
end
$$;

reset role;
rollback;
\echo STEP3_DRY_RUN_ROLLBACK_COMPLETED
