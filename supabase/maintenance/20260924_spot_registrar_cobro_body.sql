\ir ../migrations/20260924050000_spot_registrar_cobro.sql

do $$
declare v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='registrar_cobro_cxc_atomico'
    and pg_get_function_arguments(p.oid) like 'p_empresa_id text, p_cxc_id text, p_cobro jsonb%';
  if v_oid is null then raise exception 'VALIDACION_ESTRUCTURAL|firma_cobro=ausente'; end if;
  if not (select prosecdef from pg_proc where oid=v_oid) then raise exception 'VALIDACION_ESTRUCTURAL|security_definer=false'; end if;
  if not has_function_privilege('authenticated',v_oid,'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|execute_authenticated=false'; end if;
  if not exists (select 1 from pg_trigger where tgname='movimientos_cxc_cuenta_detraccion_trg') then raise exception 'VALIDACION_ESTRUCTURAL|trigger_cuenta=ausente'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='cobros_cxc' and column_name='detraccion_id' and data_type='uuid') then raise exception 'VALIDACION_ESTRUCTURAL|cobro_detraccion_id=ausente'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='movimientos_tesoreria' and column_name='detraccion_id' and data_type='uuid') then raise exception 'VALIDACION_ESTRUCTURAL|movimiento_detraccion_id=ausente'; end if;
  raise notice 'VALIDACION_ESTRUCTURAL|firma=registrar_cobro_cxc_atomico|security_definer=true|execute_authenticated=true|trigger=true|vinculos_uuid=true';
end;
$$;

