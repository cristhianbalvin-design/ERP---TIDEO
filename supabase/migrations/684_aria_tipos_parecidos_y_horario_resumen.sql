-- 684: Dos mejoras menores de Aria.
-- 1) Egreso de caja chica: los "tipos parecidos" que se ofrecen como botones ya no coinciden por palabras genéricas
--    (compra, pago, para…) ni por trozos dentro de otra palabra, y salen primero los de la palabra más específica
--    (para "compra de guantes para taller", primero "Guantes dieléctricos y de seguridad").
--    Parte de pg_get_functiondef de la versión vigente y cambia solo esa búsqueda.
-- 2) El resumen diario de preguntas sin respuesta pasa de las 12:47 a las 12:44 UTC (7:44 a. m. de Lima),
--    para que el correo salga con el despacho de las 7:45 y no espere al de las 8:00.

-- Palabras útiles de un texto para buscar tipos de gasto: sin tildes, de 4 letras o más y sin palabras genéricas.
CREATE OR REPLACE FUNCTION public.asistente_palabras_clave(p_texto text)
 RETURNS SETOF text LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT DISTINCT w FROM regexp_split_to_table(public.asistente_norm(coalesce(p_texto, '')), '[^a-z0-9]+') w
  WHERE length(w) >= 4
    AND w <> ALL (ARRAY['compra','compras','pago','pagos','gasto','gastos','para','egreso','egresos','registrar','registro','caja','chica',
                        'soles','dolares','como','desde','sobre','entre','varios','otros','personal','servicio','servicios']);
$function$;
REVOKE ALL ON FUNCTION public.asistente_palabras_clave(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_palabras_clave(text) TO authenticated;

DO $$
DECLARE
  c_firma constant text := 'public.asistente_preparar_egreso_caja_chica(text,text,numeric,text,text,text,text,text,date,text,text,text,uuid)';
  v_def text := pg_get_functiondef(c_firma::regprocedure);
  c_palabras constant text := $v$regexp_split_to_table(public.asistente_norm(coalesce(p_tipo_gasto, '') || ' ' || v_concepto), '[^a-z0-9]+') w$v$;
  c_palabras_n constant text := $v$public.asistente_palabras_clave(coalesce(p_tipo_gasto, '') || ' ' || v_concepto) w$v$;
  c_cond constant text := $v$where length(w) >= 4 and public.asistente_norm(t.nombre) like '%' || w || '%')$v$;
  c_cond_n constant text := $v$where public.asistente_norm(t.nombre) ~ ('(^|[^a-z0-9])' || w))$v$;
  c_orden constant text := $v$order by t.orden nulls last, t.nombre limit 15) x), '[]'::jsonb),$v$;
  -- Primero los tipos que coinciden con la palabra más específica (la que aparece en menos tipos de gasto).
  c_orden_n constant text := $v$order by (select min(f.n) from public.asistente_palabras_clave(coalesce(p_tipo_gasto, '') || ' ' || v_concepto) w cross join lateral (select count(*) as n from public.tipos_gasto_empresa t2 where t2.empresa_id = p_empresa_id and coalesce(t2.activo, true) and coalesce(t2.aplica_caja_chica, true) and public.asistente_norm(t2.nombre) ~ ('(^|[^a-z0-9])' || w)) f where public.asistente_norm(t.nombre) ~ ('(^|[^a-z0-9])' || w)), t.orden nulls last, t.nombre limit 15) x), '[]'::jsonb),$v$;
  veces integer;
BEGIN
  IF position(c_orden_n IN v_def) = 0 THEN
    FOR veces IN SELECT (length(v_def) - length(replace(v_def, f, ''))) / length(f) FROM unnest(ARRAY[c_palabras, c_cond, c_orden]) f LOOP
      IF veces <> 1 THEN RAISE EXCEPTION '684: la versión vigente no tiene los fragmentos esperados de tipos parecidos'; END IF;
    END LOOP;
    EXECUTE replace(replace(replace(v_def, c_palabras, c_palabras_n), c_cond, c_cond_n), c_orden, c_orden_n);
  END IF;
  v_def := pg_get_functiondef(c_firma::regprocedure);
  IF position(c_palabras_n IN v_def) = 0 OR position(c_cond_n IN v_def) = 0 OR position(c_orden_n IN v_def) = 0 THEN
    RAISE EXCEPTION '684: la función no quedó con la nueva búsqueda de tipos parecidos';
  END IF;
  IF has_function_privilege('anon', c_firma, 'EXECUTE') OR has_function_privilege('anon', 'public.asistente_palabras_clave(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '684: anon no debe ejecutar estas funciones';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aria-manual-sin-respuesta-diario') THEN PERFORM cron.unschedule('aria-manual-sin-respuesta-diario'); END IF;
  PERFORM cron.schedule('aria-manual-sin-respuesta-diario', '44 12 * * *', $job$select public.aria_enviar_resumen_sin_respuesta();$job$);
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'aria-manual-sin-respuesta-diario' AND schedule = '44 12 * * *' AND active) <> 1 THEN
    RAISE EXCEPTION '684: la tarea diaria no quedó a las 12:44 UTC';
  END IF;
END $$;
