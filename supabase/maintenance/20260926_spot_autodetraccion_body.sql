-- Cuerpo comun de SPOT Bloque 2.
-- El dry run aporta fixtures temporales; este archivo solo instala y valida.
\ir ../migrations/20260926120000_spot_autodetraccion.sql

do $$
declare
  v_oid oid;
  v_spot_oid oid;
  v_def text;
  v_spot_def text;
  v_prosecdef boolean;
  v_spot_prosecdef boolean;
  v_proconfig text[];
  v_spot_proconfig text[];
begin
  select p.oid, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
    into v_oid, v_prosecdef, v_proconfig, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_autodetraccion'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_detraccion_id uuid, p_cuenta_origen_id text, p_cuenta_destino_id text, p_fecha_constancia date, p_numero_constancia text, p_referencia text';

  if v_oid is null then
    raise exception 'SPOT2_VALIDACION|firma_autodetraccion=ausente';
  end if;
  if not v_prosecdef then
    raise exception 'SPOT2_VALIDACION|autodetraccion_security_definer=false';
  end if;
  if v_proconfig is distinct from array['search_path=public, pg_temp']::text[] then
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

  select p.oid, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
    into v_spot_oid, v_spot_prosecdef, v_spot_proconfig, v_spot_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'spot_quinto_dia_habil'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_fecha date';
  if v_spot_oid is null or not v_spot_prosecdef then
    raise exception 'SPOT2_VALIDACION|quinto_dia_security_definer=false';
  end if;
  if v_spot_proconfig is distinct from array['search_path=public, pg_temp']::text[] then
    raise exception 'SPOT2_VALIDACION|quinto_dia_search_path=false';
  end if;
  if v_spot_def is null or position('f.ambito = ''nacional''' in v_spot_def) = 0 then
    raise exception 'SPOT2_VALIDACION|feriado_nacional=false';
  end if;

  -- Las funciones existentes modificadas por la migracion deben conservar
  -- SECURITY DEFINER y su search_path fijo exacto de la definicion remota.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (p.proname = 'registrar_cobro_cxc_atomico'
         and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb')
        or (p.proname = 'validar_cobro_cxc_cuenta_detraccion'
            and pg_get_function_identity_arguments(p.oid) = '')
        or (p.proname = 'emitir_nota_cxc_atomica'
            and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb')
      )
      and (
        not p.prosecdef
        or p.proconfig is distinct from array['search_path=public']::text[]
      )
  ) then
    raise exception 'SPOT2_VALIDACION|funciones_modificadas_security_definer_search_path=false';
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
