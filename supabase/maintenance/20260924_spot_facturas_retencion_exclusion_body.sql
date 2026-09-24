-- Cuerpo común del Paso 4: validación previa, migración y validación estructural.
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.facturas
  where aplica_retencion is true and aplica_detraccion is true;
  if v_count <> 0 then
    raise exception 'VALIDACION_PREVIA_RETENCION_DETRACCION_FALLO|violaciones=%', v_count;
  end if;
  raise notice 'VALIDACION_PREVIA_RETENCION_DETRACCION|violaciones=0';
end $$;

\ir ../migrations/20260924030000_spot_facturas_retencion_exclusion.sql

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from pg_constraint
  where conrelid = 'public.facturas'::regclass
    and conname = 'facturas_retencion_detraccion_exclusion_ck'
    and contype = 'c';
  if v_count <> 1 then
    raise exception 'VALIDACION_CHECK_RETENCION_DETRACCION_FALLO|obtenidos=%', v_count;
  end if;
  raise notice 'VALIDACION_CHECK_RETENCION_DETRACCION|creado=1';
end $$;
