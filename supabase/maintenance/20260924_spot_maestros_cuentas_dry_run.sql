-- Dry run del Paso 2. Nunca confirma cambios en la base de datos.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir ../migrations/20260924010000_spot_maestros_cuentas.sql

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'familia_servicio' and column_name = 'spot_catalogo_id' and data_type = 'uuid' and is_nullable = 'YES' and column_default is null)
      or (table_name = 'servicios' and column_name = 'spot_catalogo_id' and data_type = 'uuid' and is_nullable = 'YES' and column_default is null)
      or (table_name = 'materiales' and column_name = 'spot_catalogo_id' and data_type = 'uuid' and is_nullable = 'YES' and column_default is null)
      or (table_name = 'cuentas_bancarias' and column_name = 'es_cuenta_detracciones' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false')
    );
  if v_count <> 4 then
    raise exception 'VALIDACION_COLUMNAS_FALLO|esperadas=4|obtenidas=%', v_count;
  end if;
  raise notice 'VALIDACION_COLUMNAS|4';
end
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_constraint c
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and c.confrelid = 'public.spot_catalogo'::regclass
    and c.conname in (
      'familia_servicio_spot_catalogo_id_fkey',
      'servicios_spot_catalogo_id_fkey',
      'materiales_spot_catalogo_id_fkey'
    )
    and pg_get_constraintdef(c.oid) like 'FOREIGN KEY (spot_catalogo_id) REFERENCES spot_catalogo(id)%';
  if v_count <> 3 then
    raise exception 'VALIDACION_FK_SPOT_FALLO|esperadas=3|obtenidas=%', v_count;
  end if;
  raise notice 'VALIDACION_FK_SPOT|3|tipo=uuid';
end
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_constraint c
  where c.conname = 'cuentas_bancarias_detracciones_config_ck'
    and c.contype = 'c'
    and c.conrelid = 'public.cuentas_bancarias'::regclass
    and pg_get_constraintdef(c.oid) like '%es_cuenta_detracciones%'
    and pg_get_constraintdef(c.oid) like '%moneda%PEN%'
    and pg_get_constraintdef(c.oid) like '%estado%activo%'
    and pg_get_constraintdef(c.oid) like '%sociedad_id%';
  if v_count <> 1 then
    raise exception 'VALIDACION_CHECK_CUENTA_FALLO|obtenidas=%', v_count;
  end if;
  raise notice 'VALIDACION_CHECK_CUENTA|PEN|activo|sociedad_id_no_nulo';
end
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.cuentas_bancarias
  where es_cuenta_detracciones = true
    and not (moneda = 'PEN' and estado = 'activo' and sociedad_id is not null);
  if v_count <> 0 then
    raise exception 'VALIDACION_DATOS_CUENTA_FALLO|violaciones=%', v_count;
  end if;
  raise notice 'VALIDACION_DATOS_CUENTA|violaciones=0';
end
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'cuentas_bancarias';
  if v_count = 0 then
    raise exception 'VALIDACION_RLS_CUENTA_FALLO|politicas=0';
  end if;
  raise notice 'VALIDACION_RLS_CUENTA|politicas=%|regla_principal=tesoreria', v_count;
end
$$;

rollback;
\echo STEP2_DRY_RUN_ROLLBACK_COMPLETED
