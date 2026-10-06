-- Pruebas de comportamiento 593. Ejecutar después de 593; no persiste cambios.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _593_results (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);

DO $behavior$
DECLARE
  v_id text := 't593_' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);
  v_count bigint;
  v_retry integer;
BEGIN
  INSERT INTO public.empresas (id, razon_social, nombre_comercial, pais, moneda_base, zona_horaria, estado)
  VALUES (v_id, 'Prueba 593', 'Prueba 593', 'PE', 'PEN', 'America/Lima', 'suspendida');
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = v_id;
  INSERT INTO _593_results VALUES ('empresa_nueva_32_catalogos', v_count = 32, format('filas=%s', v_count));
  v_retry := public.inicializar_catalogos_diagnostico(v_id);
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = v_id;
  INSERT INTO _593_results VALUES ('reintento_idempotente', v_retry = 0 AND v_count = 32, format('insertadas_reintento=%s filas=%s', v_retry, v_count));
  DELETE FROM public.empresas WHERE id = v_id;
END
$behavior$;

INSERT INTO _593_results
SELECT 'funcion_trigger_no_ejecutable_por_roles_api',
       NOT has_function_privilege('anon', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE'),
       format('anon=%s authenticated=%s',
         has_function_privilege('anon', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE'));

DO $tenant_path$
DECLARE
  v_result jsonb;
  v_id text;
  v_count bigint;
  v_code text := 'grp_prueba_' || substr(md5(clock_timestamp()::text || random()::text), 1, 6);
BEGIN
  IF NOT public.usuario_es_superadmin_plataforma() THEN
    INSERT INTO _593_results VALUES ('crear_tenant_con_admin', false, 'SKIPPED: ejecutar como superadmin para satisfacer la guarda histórica del RPC');
    RETURN;
  END IF;
  v_result := public.crear_tenant_con_admin(
    'Prueba 593', v_code, 'Prueba 593', 'PE', 'PEN', 'America/Lima', 'suspendida', NULL, 'Admin prueba 593'
  );
  v_id := v_result ->> 'empresa_id';
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = v_id;
  INSERT INTO _593_results VALUES ('crear_tenant_con_admin', v_count = 32, format('empresa_id=%s filas=%s', v_id, v_count));
END
$tenant_path$;

SELECT * FROM _593_results ORDER BY prueba;
ROLLBACK;
