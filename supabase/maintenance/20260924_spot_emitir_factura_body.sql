\ir ../migrations/20260924040000_spot_emitir_factura.sql

do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'emitir_factura_cxc_atomico'
    and pg_get_function_arguments(p.oid) = 'p_payload jsonb';
  if v_oid is null then raise exception 'VALIDACION_ESTRUCTURAL|firma_emision=ausente'; end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then raise exception 'VALIDACION_ESTRUCTURAL|security_definer=false'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|execute_authenticated=false'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='facturas' and column_name='aplica_detraccion') then raise exception 'VALIDACION_ESTRUCTURAL|espejo_aplica_ausente'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='facturas' and column_name='porcentaje_detraccion') then raise exception 'VALIDACION_ESTRUCTURAL|espejo_porcentaje_ausente'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='facturas' and column_name='monto_detraccion') then raise exception 'VALIDACION_ESTRUCTURAL|espejo_monto_ausente'; end if;
  raise notice 'VALIDACION_ESTRUCTURAL|firma=emitir_factura_cxc_atomico(jsonb)|security_definer=true|execute_authenticated=true|espejos=3';
end;
$$;

