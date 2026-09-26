\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Bloque 1 / R1: diagnostico del diff remoto ---'
begin;

do $diagnostico$
declare
  v_oid oid;
  v_remota text;
  v_generada text;
  v_anchor text := E'  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then\n    raise exception ''No tienes acceso al tenant indicado.'';\n  end if;';
  v_insert text := E'  if not public.usuario_puede(v_empresa_id, ''facturacion'', ''crear'') then\n    raise exception ''No tienes permiso para crear facturas en este tenant.'';\n  end if;';
  v_anchor_count integer;
  v_lineas_remotas text[];
  v_lineas_generadas text[];
  v_max_linea integer;
  v_linea integer;
  v_remota_linea text;
  v_generada_linea text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_remota
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'emitir_factura_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_oid is null or v_remota is null then
    raise exception 'R1_DIAGNOSTICO|funcion_ausente';
  end if;

  v_anchor_count := (length(v_remota) - length(replace(v_remota, v_anchor, ''))) / length(v_anchor);
  v_generada := replace(v_remota, v_anchor, v_anchor || E'\n' || v_insert);

  raise notice 'R1_DIAGNOSTICO|longitud_remota=%|longitud_generada=%', length(v_remota), length(v_generada);
  raise notice 'R1_DIAGNOSTICO|cantidad_CR_remota=%|cantidad_CR_generada=%',
    length(v_remota) - length(replace(v_remota, E'\r', '')),
    length(v_generada) - length(replace(v_generada, E'\r', ''));
  raise notice 'R1_DIAGNOSTICO|anclaje_encontrado=%|anclaje_una_sola_vez=%',
    v_anchor_count > 0,
    v_anchor_count = 1;

  v_lineas_remotas := string_to_array(v_remota, E'\n');
  v_lineas_generadas := string_to_array(v_generada, E'\n');
  v_max_linea := greatest(coalesce(array_length(v_lineas_remotas, 1), 0), coalesce(array_length(v_lineas_generadas, 1), 0));

  for v_linea in 1..v_max_linea loop
    v_remota_linea := case when v_linea <= coalesce(array_length(v_lineas_remotas, 1), 0) then v_lineas_remotas[v_linea] end;
    v_generada_linea := case when v_linea <= coalesce(array_length(v_lineas_generadas, 1), 0) then v_lineas_generadas[v_linea] end;
    if v_remota_linea is distinct from v_generada_linea then
      raise notice 'R1_DIFF|linea=%|remota=%|generada=%',
        v_linea,
        replace(replace(replace(coalesce(v_remota_linea, '[LINEA_AUSENTE]'), E'\r', '<CR>'), E'\t', '<TAB>'), ' ', '·'),
        replace(replace(replace(coalesce(v_generada_linea, '[LINEA_AUSENTE]'), E'\r', '<CR>'), E'\t', '<TAB>'), ' ', '·');
    end if;
  end loop;
end;
$diagnostico$;

rollback;
\echo 'R1_DIAGNOSTICO_ROLLBACK_COMPLETED'
