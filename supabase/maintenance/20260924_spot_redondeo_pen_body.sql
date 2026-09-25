-- Cuerpo común: migración y validaciones estructurales. Sin control de
-- transacción; las envolturas dry_run/execute lo proporcionan.
\ir ../migrations/20260924170000_spot_redondeo_pen.sql

do $validation$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'emitir_factura_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';
  if position($marker$round(v_total * v_spot.porcentaje / 100, 0)$marker$ in v_def) = 0
     or position($marker$round(v_total * v_spot.porcentaje / 100, 2)$marker$ in v_def) = 0 then
    raise exception 'VALIDACION_REDONDEO|emision PEN/USD incompleta';
  end if;
  raise notice 'VALIDACION_REDONDEO|emision PEN redondea a 0; USD conserva 2 decimales';
end;
$validation$;

do $validation$
declare
  v_def text;
  v_n integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'emitir_nota_cxc_atomica'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';
  v_n := length(v_def) - length(replace(v_def, 'v_monto_origen := round(v_total_operacion * v_porcentaje / 100, 0)', ''));
  if v_n < 1 then
    raise exception 'VALIDACION_REDONDEO|notas PEN no redondean a 0';
  end if;
  raise notice 'VALIDACION_REDONDEO|notas PEN recalculan origen redondeado; ajustes usan el nuevo depósito';
end;
$validation$;
