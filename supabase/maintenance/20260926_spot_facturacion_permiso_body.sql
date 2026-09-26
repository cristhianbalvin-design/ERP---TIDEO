-- Cuerpo comun de R1: migracion y validacion estructural.
-- Las fixtures de datos y el SET ROLE viven unicamente en el dry run.
\ir ../migrations/20260926100000_spot_facturacion_permiso.sql

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
    and p.proname = 'emitir_factura_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_oid is null then
    raise exception 'R1|firma_ausente';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'R1|security_definer_false';
  end if;
  if position('public.usuario_tiene_empresa(v_empresa_id)' in v_def) = 0 then
    raise exception 'R1|tenant_control_ausente';
  end if;
  if position('public.usuario_puede(v_empresa_id, ''facturacion'', ''crear'')' in v_def) = 0 then
    raise exception 'R1|facturacion_crear_control_ausente';
  end if;
  raise notice 'R1_ESTRUCTURAL|tenant=true|facturacion_crear=true|security_definer=true';
end;
$$;
