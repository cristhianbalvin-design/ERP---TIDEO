-- Verificacion de la migracion 373.
-- Compara tres fuentes nuevas contra COUNT(*) manual en dos tenants.

BEGIN;

DO $$
DECLARE
  v_faltantes TEXT[] := ARRAY[
    'Dashboard General',
    'BI Comercial',
    'BI Operativo',
    'BI Financiero',
    'Backlog',
    'Mi portal',
    'Estado de Resultados',
    'Onboarding',
    'Planes de Exito',
    'Health Score',
    'Renovaciones',
    'Fidelizacion y NPS',
    'BI Customer Success',
    'IA Comercial',
    'IA Operativa',
    'IA Financiera',
    'Vistas de Campo',
    'Organigrama'
  ];
  v_tenant_id TEXT;
  v_config public.tideo_salud_configuracion;
  v_rpc BIGINT;
  v_manual BIGINT;
BEGIN
  IF (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa AND pestana = 'pantallas'
  ) <> 84 THEN
    RAISE EXCEPTION 'Se esperaban 84 filas activas en Pantallas';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa
      AND pestana = 'pantallas'
      AND pantalla = ANY(v_faltantes)
  ) <> 18 THEN
    RAISE EXCEPTION 'No estan presentes exactamente las 18 pantallas del gap';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa
      AND pestana = 'pantallas'
      AND pantalla = ANY(v_faltantes)
      AND tabla_principal IS NOT NULL
  ) <> 7 THEN
    RAISE EXCEPTION 'Se esperaban 7 fuentes reales y 11 pendientes de definicion manual';
  END IF;

  FOREACH v_tenant_id IN ARRAY ARRAY['emp_20541435833', 'emp_20601829101']
  LOOP
    FOR v_config IN
      SELECT *
      FROM public.tideo_salud_configuracion
      WHERE activa
        AND pestana = 'pantallas'
        AND pantalla IN ('Backlog', 'Onboarding', 'Organigrama')
      ORDER BY pantalla
    LOOP
      v_rpc := public.tideo_salud_contar_configuracion(
        v_config.tabla_principal,
        v_config.tabla_secundaria,
        v_config.filtro_columna,
        v_config.filtro_operador,
        v_config.filtro_valor,
        v_tenant_id
      );

      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE empresa_id = %L',
        v_config.tabla_principal,
        v_tenant_id
      ) INTO v_manual;

      IF v_rpc <> v_manual THEN
        RAISE EXCEPTION
          'Conteo no coincide para %, tenant %: helper %, manual %',
          v_config.pantalla,
          v_tenant_id,
          v_rpc,
          v_manual;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

ROLLBACK;
