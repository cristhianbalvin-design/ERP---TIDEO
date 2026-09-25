-- Cuerpo común del Paso 3: migración y validaciones estructurales.
-- Las pruebas con datos temporales y SET ROLE viven solo en el dry run.
\ir ../migrations/20260924020000_spot_detracciones.sql

do $$
declare v_count integer;
begin
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and (
    (table_name = 'detracciones' and column_name = 'id' and data_type = 'uuid')
    or (table_name = 'detracciones' and column_name = 'empresa_id' and data_type = 'text')
    or (table_name = 'detracciones' and column_name = 'sociedad_id' and data_type = 'uuid')
    or (table_name = 'detracciones' and column_name in ('factura_id','cxc_id','cxp_id','documento_ajuste_id') and data_type = 'text')
    or (table_name = 'cobros_cxc' and column_name = 'detraccion_id' and data_type = 'uuid')
    or (table_name = 'movimientos_tesoreria' and column_name = 'detraccion_id' and data_type = 'uuid')
  );
  if v_count <> 9 then raise exception 'VALIDACION_TIPOS_FALLO|esperadas=9|obtenidas=%', v_count; end if;
  raise notice 'VALIDACION_TIPOS|detracciones_id_uuid|referencias_documento_text|vinculos_uuid';
end $$;

do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_constraint
  where contype = 'f' and connamespace = 'public'::regnamespace
    and conname in ('detracciones_empresa_id_fkey','detracciones_sociedad_id_fkey','detracciones_factura_id_fkey','detracciones_cxc_id_fkey','detracciones_cxp_id_fkey','detracciones_documento_ajuste_id_fkey','detracciones_spot_catalogo_id_fkey','cobros_cxc_detraccion_id_fkey','movimientos_tesoreria_detraccion_id_fkey')
    and confdeltype = 'a';
  if v_count <> 9 then raise exception 'VALIDACION_FK_NO_ACTION_FALLO|esperadas=9|obtenidas=%', v_count; end if;
  raise notice 'VALIDACION_FK_NO_ACTION|9';
end $$;

do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_constraint
  where conrelid = 'public.detracciones'::regclass
    and conname in ('detracciones_direccion_documento_ck','detracciones_origen_catalogo_ck','detracciones_tipo_cambio_ck');
  if v_count <> 3 then raise exception 'VALIDACION_CHECKS_FALLO|esperadas=3|obtenidas=%', v_count; end if;
  raise notice 'VALIDACION_CHECKS|documento|origen_catalogo|tipo_cambio';
end $$;

do $$
declare v_count integer; v_predicate text;
begin
  select count(*), max(pg_get_expr(i.indpred, i.indrelid)) into v_count, v_predicate
  from pg_index i join pg_class c on c.oid = i.indexrelid
  where i.indrelid = 'public.detracciones'::regclass and c.relname = 'detracciones_venta_factura_unq' and i.indisunique;
  if v_count <> 1 or v_predicate not like '%direccion = ''venta''%' or v_predicate not like '%documento_ajuste_id IS NULL%' or v_predicate not like '%estado <> ''anulada''%' then
    raise exception 'VALIDACION_UNICIDAD_VENTA_FALLO|indice=%|predicado=%', v_count, v_predicate;
  end if;
  raise notice 'VALIDACION_UNICIDAD_VENTA|factura_id|ajustes_fuera|anulada_fuera';
end $$;

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from information_schema.columns
  where (table_schema = 'public' and table_name in ('facturas','cxc') and column_name = 'detraccion_id')
     or (table_schema = 'public' and table_name = 'detracciones' and column_name in ('cobro_cxc_id','movimiento_tesoreria_id','cxp_pago_id'));
  if v_bad <> 0 then raise exception 'VALIDACION_D3_COLUMNAS_DUPLICADAS_FALLO|obtenidas=%', v_bad; end if;
  raise notice 'VALIDACION_D3_COLUMNAS|0';
end $$;

do $$
declare v_policy_count integer; v_select boolean; v_insert boolean; v_update boolean; v_delete boolean;
begin
  select count(*) into v_policy_count from pg_policies where schemaname = 'public' and tablename = 'detracciones';
  select has_table_privilege('authenticated','public.detracciones','SELECT'), has_table_privilege('authenticated','public.detracciones','INSERT'), has_table_privilege('authenticated','public.detracciones','UPDATE'), has_table_privilege('authenticated','public.detracciones','DELETE') into v_select, v_insert, v_update, v_delete;
  if v_policy_count <> 1 or not v_select or v_insert or v_update or v_delete
     or has_table_privilege('anon','public.detracciones','SELECT') or has_table_privilege('anon','public.detracciones','INSERT')
     or has_table_privilege('anon','public.detracciones','UPDATE') or has_table_privilege('anon','public.detracciones','DELETE') then
    raise exception 'VALIDACION_SEGURIDAD_FALLO|politicas=%|auth=s/t/f/f/f|anon=f/f/f/f', v_policy_count;
  end if;
  raise notice 'VALIDACION_SEGURIDAD|policy_select=1|auth=t/f/f/f|anon=f/f/f/f';
end $$;
