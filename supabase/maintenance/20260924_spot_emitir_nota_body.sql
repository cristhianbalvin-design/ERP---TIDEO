\ir ../migrations/20260924060000_spot_emitir_nota.sql

do $$
declare v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='emitir_nota_cxc_atomica'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  if v_oid is null then raise exception 'VALIDACION_ESTRUCTURAL|firma_nota=ausente'; end if;
  if not (select prosecdef from pg_proc where oid=v_oid) then raise exception 'VALIDACION_ESTRUCTURAL|security_definer=false'; end if;
  if not has_function_privilege('authenticated',v_oid,'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|execute_authenticated=false'; end if;
  if not has_function_privilege('postgres',v_oid,'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|execute_postgres=false'; end if;
  if not has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|execute_service_role=false'; end if;
  if has_function_privilege('anon',v_oid,'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|execute_anon=true'; end if;
  if position('usuario_tiene_empresa' in pg_get_functiondef(v_oid)) = 0 then raise exception 'VALIDACION_ESTRUCTURAL|tenant_control_ausente'; end if;
  raise notice 'VALIDACION_ESTRUCTURAL|firma=emitir_nota_cxc_atomica|security_definer=true|tenant_control=true|grants=preservados';
end;
$$;
