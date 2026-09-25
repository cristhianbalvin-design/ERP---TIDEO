-- Dry run del Paso 4. Nunca confirma cambios en la base de datos.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir 20260924_spot_facturas_retencion_exclusion_body.sql

do $$
begin
  begin
    insert into public.facturas (
      id, empresa_id, sociedad_id, numero, fecha_emision,
      subtotal, igv, total, aplica_retencion, aplica_detraccion
    ) values (
      'fac_step4_both_prb', 'emp_2000000000', '609a2f33-d057-411f-a001-4e3e83f700d0',
      'STEP4-BOTH', date '2026-09-24', 100, 18, 118, true, true
    );
    raise exception 'VALIDACION_PRUEBA_EXCLUSION_FALLO|ambas_aceptadas';
  exception when check_violation then
    raise notice 'VALIDACION_PRUEBA_EXCLUSION|ambas=true=rechazadas_por_check';
  end;
end $$;

do $$
begin
  insert into public.facturas (
    id, empresa_id, sociedad_id, numero, fecha_emision,
    subtotal, igv, total, aplica_retencion, aplica_detraccion
  ) values (
    'fac_step4_ret_prb', 'emp_2000000000', '609a2f33-d057-411f-a001-4e3e83f700d0',
    'STEP4-RET', date '2026-09-24', 100, 18, 118, true, false
  );
  insert into public.facturas (
    id, empresa_id, sociedad_id, numero, fecha_emision,
    subtotal, igv, total, aplica_retencion, aplica_detraccion
  ) values (
    'fac_step4_det_prb', 'emp_2000000000', '609a2f33-d057-411f-a001-4e3e83f700d0',
    'STEP4-DET', date '2026-09-24', 100, 18, 118, false, true
  );
  raise notice 'VALIDACION_PRUEBA_EXCLUSION|solo_retencion=aceptada|solo_detraccion=aceptada';
end $$;

rollback;
\echo STEP4_DRY_RUN_ROLLBACK_COMPLETED
