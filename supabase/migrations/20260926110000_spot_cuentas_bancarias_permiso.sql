-- Bloque 1 / R2: alcance funcional para cuentas bancarias y flag de detracciones.
-- Las expresiones de las politicas se leen de pg_policy en el momento de aplicar
-- la migracion para conservar tenant y alcance societario de la version remota.

do $body$
declare
  v_relid oid;
  v_using text;
  v_check text;
  v_generated text;
begin
  select c.oid
    into v_relid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'cuentas_bancarias';

  if v_relid is null then
    raise exception 'R2|cuentas_bancarias no existe';
  end if;

  select pg_get_expr(pp.polwithcheck, pp.polrelid)
    into v_check
  from pg_policy pp
  where pp.polrelid = v_relid
    and pp.polname = 'cb_insert';
  if v_check is null then
    raise exception 'R2|cb_insert no tiene WITH CHECK remoto';
  end if;
  v_generated := format('(%s) AND (public.usuario_puede(empresa_id, ''parametros'', ''crear'') OR public.usuario_puede(empresa_id, ''tesoreria'', ''crear''))', v_check);
  raise notice 'R2_DIFF|cb_insert|remote_with_check=%|generated_with_check=%', v_check, v_generated;
  execute format('alter policy cb_insert on public.cuentas_bancarias with check (%s)', v_generated);

  select pg_get_expr(pp.polqual, pp.polrelid), pg_get_expr(pp.polwithcheck, pp.polrelid)
    into v_using, v_check
  from pg_policy pp
  where pp.polrelid = v_relid
    and pp.polname = 'cb_update';
  if v_using is null or v_check is null then
    raise exception 'R2|cb_update no tiene USING y WITH CHECK remotos';
  end if;
  raise notice 'R2_DIFF|cb_update|remote_using=%|generated_using=%|remote_with_check=%|generated_with_check=%',
    v_using,
    format('(%s) AND (public.usuario_puede(empresa_id, ''parametros'', ''editar'') OR public.usuario_puede(empresa_id, ''tesoreria'', ''editar''))', v_using),
    v_check,
    format('(%s) AND (public.usuario_puede(empresa_id, ''parametros'', ''editar'') OR public.usuario_puede(empresa_id, ''tesoreria'', ''editar''))', v_check);
  execute format('alter policy cb_update on public.cuentas_bancarias using ((%s) AND (public.usuario_puede(empresa_id, ''parametros'', ''editar'') OR public.usuario_puede(empresa_id, ''tesoreria'', ''editar''))) with check ((%s) AND (public.usuario_puede(empresa_id, ''parametros'', ''editar'') OR public.usuario_puede(empresa_id, ''tesoreria'', ''editar'')))', v_using, v_check);

  select pg_get_expr(pp.polqual, pp.polrelid)
    into v_using
  from pg_policy pp
  where pp.polrelid = v_relid
    and pp.polname = 'cb_delete';
  if v_using is null then
    raise exception 'R2|cb_delete no tiene USING remoto';
  end if;
  v_generated := format('(%s) AND (public.usuario_puede(empresa_id, ''parametros'', ''anular'') OR public.usuario_puede(empresa_id, ''tesoreria'', ''anular''))', v_using);
  raise notice 'R2_DIFF|cb_delete|remote_using=%|generated_using=%', v_using, v_generated;
  execute format('alter policy cb_delete on public.cuentas_bancarias using (%s)', v_generated);
end;
$body$;

do $guard$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validar_cuenta_detracciones_permiso'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception 'R2|la funcion validar_cuenta_detracciones_permiso ya existe; no se reemplaza sin pg_get_functiondef remoto';
  end if;
end;
$guard$;

create function public.validar_cuenta_detracciones_permiso()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_cambia_flag boolean := false;
begin
  if tg_op = 'INSERT' then
    v_cambia_flag := coalesce(new.es_cuenta_detracciones, false);
  elsif tg_op = 'UPDATE' then
    v_cambia_flag := new.es_cuenta_detracciones is distinct from old.es_cuenta_detracciones;
  end if;

  -- Sigue el patron de 370_salud_implementacion_correccion3.sql:582-603:
  -- auth.uid() no disponible identifica cargas/migraciones internas.
  if v_cambia_flag
     and auth.uid() is not null
     and not public.usuario_puede(new.empresa_id, 'parametros', 'editar') then
    raise exception 'Solo un usuario con permiso de edición en Parámetros puede cambiar Cuenta de detracciones.';
  end if;

  return new;
end;
$function$;

revoke all on function public.validar_cuenta_detracciones_permiso() from public, anon, authenticated;

drop trigger if exists cb_detracciones_permiso_trg on public.cuentas_bancarias;
create trigger cb_detracciones_permiso_trg
before insert or update on public.cuentas_bancarias
for each row execute function public.validar_cuenta_detracciones_permiso();

do $validate$
declare
  v_relid oid;
  v_using text;
  v_check text;
  v_trigger_def text;
  v_fn oid;
begin
  select c.oid into v_relid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'cuentas_bancarias';

  if not exists (
    select 1 from pg_policy pp
    where pp.polrelid = v_relid and pp.polname = 'cb_insert'
      and pg_get_expr(pp.polwithcheck, pp.polrelid) like '%usuario_puede%parametros%crear%'
      and pg_get_expr(pp.polwithcheck, pp.polrelid) like '%usuario_puede%tesoreria%crear%'
  ) then raise exception 'R2_VALIDACION|cb_insert permiso ausente'; end if;

  select pg_get_expr(pp.polqual, pp.polrelid), pg_get_expr(pp.polwithcheck, pp.polrelid)
    into v_using, v_check
  from pg_policy pp
  where pp.polrelid = v_relid and pp.polname = 'cb_update';
  if v_using is null or v_check is null
     or v_using not like '%usuario_puede%parametros%editar%'
     or v_using not like '%usuario_puede%tesoreria%editar%'
     or v_check not like '%usuario_puede%parametros%editar%'
     or v_check not like '%usuario_puede%tesoreria%editar%' then
    raise exception 'R2_VALIDACION|cb_update permiso ausente';
  end if;

  if not exists (
    select 1 from pg_policy pp
    where pp.polrelid = v_relid and pp.polname = 'cb_delete'
      and pg_get_expr(pp.polqual, pp.polrelid) like '%usuario_puede%parametros%anular%'
      and pg_get_expr(pp.polqual, pp.polrelid) like '%usuario_puede%tesoreria%anular%'
  ) then raise exception 'R2_VALIDACION|cb_delete permiso ausente'; end if;

  select p.oid into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'validar_cuenta_detracciones_permiso'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_fn is null or not (select p2.prosecdef from pg_proc p2 where p2.oid = v_fn)
     or pg_get_functiondef(v_fn) not like '%auth.uid()%'
     or pg_get_functiondef(v_fn) not like '%usuario_puede%parametros%editar%'
     or pg_get_functiondef(v_fn) not like '%Solo un usuario con permiso de edición en Parámetros puede cambiar Cuenta de detracciones.%' then
    raise exception 'R2_VALIDACION|trigger function incorrecta';
  end if;

  select pg_get_triggerdef(pt.oid) into v_trigger_def
  from pg_trigger pt
  where pt.tgrelid = v_relid and pt.tgname = 'cb_detracciones_permiso_trg' and not pt.tgisinternal;
  if v_trigger_def is null or v_trigger_def not like '%BEFORE INSERT OR UPDATE%' then
    raise exception 'R2_VALIDACION|trigger ausente o eventos incorrectos';
  end if;

  if (select count(*) from pg_policy pp where pp.polrelid = v_relid) <> 4 then
    raise exception 'R2_VALIDACION|se crearon politicas adicionales';
  end if;

  raise notice 'R2_VALIDACION|politicas=cb_insert,cb_update,cb_delete|trigger=columna_es_cuenta_detracciones|sesion_sin_auth_uid=permitida';
end;
$validate$;
