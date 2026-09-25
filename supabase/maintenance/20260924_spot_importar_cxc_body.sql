\ir ../migrations/20260924070000_spot_importar_cxc.sql

do $$
declare v_wrapper oid; v_base oid;
begin
  select p.oid into v_wrapper from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='importar_cxc_masiva_fila' and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  select p.oid into v_base from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='importar_cxc_masiva_fila_base' and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
  if v_wrapper is null or v_base is null then raise exception 'VALIDACION_ESTRUCTURAL|funciones_importacion=ausentes'; end if;
  if not (select prosecdef from pg_proc where oid=v_wrapper) or not (select prosecdef from pg_proc where oid=v_base) then raise exception 'VALIDACION_ESTRUCTURAL|security_definer=false'; end if;
  if position('usuario_alcance_sociedades' in pg_get_functiondef(v_base))=0 then raise exception 'VALIDACION_ESTRUCTURAL|alcance_societario_ausente'; end if;
  if position('movimientos_tesoreria' in pg_get_functiondef(v_wrapper))>0 then raise exception 'VALIDACION_ESTRUCTURAL|importacion_crea_movimientos'; end if;
  if position('detraccion_id' in pg_get_functiondef(v_wrapper))=0 then raise exception 'VALIDACION_ESTRUCTURAL|vinculo_detraccion_ausente'; end if;
  if not has_function_privilege('authenticated',v_wrapper,'EXECUTE') or has_function_privilege('anon',v_wrapper,'EXECUTE') then raise exception 'VALIDACION_ESTRUCTURAL|grants_wrapper_invalidos'; end if;
  if has_function_privilege('authenticated','public.importar_cxc_masiva_fila_base_impl(jsonb)'::regprocedure,'EXECUTE')
     or has_function_privilege('anon','public.importar_cxc_masiva_fila_base_impl(jsonb)'::regprocedure,'EXECUTE')
     or exists (
       select 1
       from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid='public.importar_cxc_masiva_fila_base_impl(jsonb)'::regprocedure
         and a.grantee=0 and a.privilege_type='EXECUTE'
     ) then
    raise exception 'VALIDACION_ESTRUCTURAL|base_impl_tiene_execute_externo';
  end if;
  raise notice 'CADENA|ALTER=importar_cxc_masiva_fila_base(jsonb)->importar_cxc_masiva_fila_base_impl(jsonb)|wrapper->base_guard->base_impl';
  raise notice 'VALIDACION_ESTRUCTURAL|wrapper=importar_cxc_masiva_fila|base=alcance_societario|movimientos=0|base_impl=interno|grants=preservados';
end;
$$;
