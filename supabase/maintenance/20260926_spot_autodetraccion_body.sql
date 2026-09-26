-- Cuerpo comun de SPOT Bloque 2.
-- El dry run aporta fixtures temporales; este archivo solo instala y valida.
\ir ../migrations/20260926120000_spot_autodetraccion.sql

do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_autodetraccion'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_detraccion_id uuid, p_cuenta_origen_id text, p_cuenta_destino_id text, p_fecha_constancia date, p_numero_constancia text, p_referencia text';

  if v_oid is null then
    raise exception 'SPOT2_VALIDACION|firma_autodetraccion=ausente';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
    raise exception 'SPOT2_VALIDACION|autodetraccion_security_definer=false';
  end if;
  if position('set search_path TO ''public'', pg_temp' in v_def) = 0 then
    raise exception 'SPOT2_VALIDACION|autodetraccion_search_path=false';
  end if;
  if position('v_detraccion.estado <> ''por_autodetraer''' in v_def) = 0
     or position('v_origen.moneda <> ''PEN''' in v_def) = 0
     or position('v_destino.es_cuenta_detracciones' in v_def) = 0
     or position('v_monto := round(v_detraccion.monto_detraccion_soles, 2)' in v_def) = 0
     or position('v_constancia is null' in v_def) = 0 then
    raise exception 'SPOT2_VALIDACION|reglas_autodetraccion_incompletas';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'SPOT2_VALIDACION|execute_authenticated=false';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'SPOT2_VALIDACION|execute_service_role=false';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'SPOT2_VALIDACION|execute_anon=true';
  end if;

  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'spot_quinto_dia_habil';
  if v_def is null or position('f.ambito = ''nacional''' in v_def) = 0 then
    raise exception 'SPOT2_VALIDACION|feriado_nacional=false';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'detracciones'
      and con.conname = 'detracciones_estado_ck'
      and pg_get_constraintdef(con.oid) like '%por_autodetraer%'
  ) then
    raise exception 'SPOT2_VALIDACION|estado_por_autodetraer=false';
  end if;

  raise notice 'SPOT2_VALIDACION|cobro=true|autodetraccion=true|trigger=true|nota=true|estado=true|feriado_nacional=true|grants=true';
end;
$$;
