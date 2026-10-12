-- 627: Aria separa los estados de OS de clientes: 'en_ejecucion' deja de ser equivalente a 'activa'/'activo'.
-- 'activa' y 'activo' siguen siendo alias entre sí. Parte de la definición remota vigente de cada función
-- (pg_get_functiondef) y solo reemplaza la lista de estados equivalentes. No cambia firmas, permisos ni search_path.
DO $m$
DECLARE
  v_old constant text := '''activa'',''activo'',''en_ejecucion''';
  v_new constant text := '''activa'',''activo''';
  v_fn record;
  v_def text; v_nuevo text; v_antes int; v_despues int;
  v_cfg_antes text[]; v_sec_antes boolean; v_cfg_despues text[]; v_sec_despues boolean;
BEGIN
  FOR v_fn IN
    SELECT * FROM (VALUES
      ('public.asistente_buscar_os_clientes(text,uuid,text,text,text,date,date,integer)'::regprocedure, 3),
      ('public.asistente_resumen_os_clientes(text,uuid,text)'::regprocedure, 1),
      ('public.asistente_contar_registros(text,text,uuid,text,date,date,text)'::regprocedure, 4)
    ) t(fn, esperado)
  LOOP
    v_def := pg_get_functiondef(v_fn.fn);
    v_antes := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    IF v_antes <> v_fn.esperado THEN
      RAISE EXCEPTION 'Definición remota inesperada en %: % apariciones (esperadas %)', v_fn.fn, v_antes, v_fn.esperado;
    END IF;
    SELECT p.proconfig, p.prosecdef INTO v_cfg_antes, v_sec_antes FROM pg_proc p WHERE p.oid = v_fn.fn;
    v_nuevo := replace(v_def, v_old, v_new);
    EXECUTE v_nuevo;
    v_def := pg_get_functiondef(v_fn.fn);
    v_despues := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    IF v_despues <> 0 THEN RAISE EXCEPTION 'No se reemplazó la regla en %', v_fn.fn; END IF;
    IF (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new) < v_fn.esperado THEN
      RAISE EXCEPTION 'Faltan apariciones de la regla nueva en %', v_fn.fn;
    END IF;
    SELECT p.proconfig, p.prosecdef INTO v_cfg_despues, v_sec_despues FROM pg_proc p WHERE p.oid = v_fn.fn;
    IF v_cfg_despues IS DISTINCT FROM v_cfg_antes OR v_sec_despues IS DISTINCT FROM v_sec_antes THEN
      RAISE EXCEPTION 'Cambió search_path o SECURITY de %', v_fn.fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.asistente_buscar_os_clientes(text,uuid,text,text,text,date,date,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.asistente_resumen_os_clientes(text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.asistente_contar_registros(text,text,uuid,text,date,date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no debe poder ejecutar las funciones del asistente';
  END IF;
END $m$;
