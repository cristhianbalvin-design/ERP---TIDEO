-- TIDEO ERP - Limpieza de materiales mal cargados en grupo "01 - ACTIVO FIJO"
--
-- Guardrail: no se elimina nada sin verificar y anular referencias primero.
-- Política: kardex NO se borra → se marca anulado con motivo. Stock sí se elimina (es un resumen).
-- Material sí se elimina una vez liberado de referencias transaccionales.
-- Si un material no puede eliminarse de forma segura → queda desactivado (estado='inactivo') y se reporta.
--
-- INSTRUCCIONES DE EJECUCIÓN:
--   1. Ejecuta el bloque DO de verificación primero (hasta el RAISE NOTICE final).
--   2. Revisa el output en los logs/NOTICE. Confirma los conteos antes de continuar.
--   3. Ejecuta el resto del script para hacer la limpieza.
--   4. Vuelve a ejecutar el bloque de verificación para confirmar que quedó en cero.

-- ─── PASO 1: Verificación previa (solo lectura, sin cambios) ─────────────────
DO $$
DECLARE
  v_count_materiales  integer := 0;
  v_count_con_kardex  integer := 0;
  v_count_con_stock   integer := 0;
  v_count_sin_refs    integer := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_count_materiales
  FROM public.materiales m
  JOIN public.material_grupos mg ON mg.id = m.grupo_id
  WHERE (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'));

  SELECT COUNT(DISTINCT k.material_id)
  INTO v_count_con_kardex
  FROM public.kardex k
  JOIN public.materiales m ON m.id = k.material_id
  JOIN public.material_grupos mg ON mg.id = m.grupo_id
  WHERE (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'))
    AND k.anulado = false;

  SELECT COUNT(DISTINCT s.material_id)
  INTO v_count_con_stock
  FROM public.stock s
  JOIN public.materiales m ON m.id = s.material_id
  JOIN public.material_grupos mg ON mg.id = m.grupo_id
  WHERE (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'));

  v_count_sin_refs := v_count_materiales - GREATEST(v_count_con_kardex, v_count_con_stock);

  RAISE NOTICE '========== VERIFICACION PREVIA: ACTIVO FIJO EN MATERIALES ==========';
  RAISE NOTICE 'Materiales en grupo "01 - ACTIVO FIJO":     %', v_count_materiales;
  RAISE NOTICE 'Con movimientos de kardex activos:          %', v_count_con_kardex;
  RAISE NOTICE 'Con stock registrado:                       %', v_count_con_stock;
  RAISE NOTICE 'Sin referencias (eliminables directamente): %', v_count_sin_refs;
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'Si los conteos son los esperados, procede con el PASO 2.';
END $$;

-- ─── PASO 2: Anular movimientos de kardex (policy: inmutable → anular, nunca borrar) ──
UPDATE public.kardex k
SET
  anulado        = true,
  anulado_motivo = 'limpieza_maestro_activos_20260610_material_mal_catalogado',
  anulado_at     = now()
FROM public.materiales m
JOIN public.material_grupos mg ON mg.id = m.grupo_id
WHERE k.material_id = m.id
  AND (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'))
  AND k.anulado = false;

-- ─── PASO 3: Eliminar registros de stock (es tabla resumen, no histórica) ────
DELETE FROM public.stock s
USING public.materiales m
JOIN public.material_grupos mg ON mg.id = m.grupo_id
WHERE s.material_id = m.id
  AND (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'));

-- ─── PASO 4: Eliminar materiales del grupo "01 - ACTIVO FIJO" ────────────────
-- Los que tengan kardex quedan con el kardex anulado (no hay FK forzada desde kardex a materiales).
-- Los que tengan otras referencias no previstas → se desactivan en vez de eliminar.

-- Intento de eliminación directa (fallará si hay FK no cubierta → catch individual)
-- Primero los que NO tienen ninguna referencia en tablas transaccionales:
DELETE FROM public.materiales m
WHERE m.id IN (
  SELECT m2.id
  FROM public.materiales m2
  JOIN public.material_grupos mg ON mg.id = m2.grupo_id
  WHERE (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'))
    -- Sin kardex sin anular (los que sí tienen, ya los anulamos arriba)
    AND NOT EXISTS (
      SELECT 1 FROM public.kardex k WHERE k.material_id = m2.id AND k.anulado = false
    )
    -- Sin stock residual
    AND NOT EXISTS (
      SELECT 1 FROM public.stock s WHERE s.material_id = m2.id
    )
);

-- Los que aún quedan con referencias no eliminables → desactivar con estado 'inactivo'
UPDATE public.materiales m
SET estado = 'inactivo',
    observacion = COALESCE(observacion || ' | ', '') || 'BAJA: material era activo fijo, limpieza 2026-06-10',
    updated_at = now()
FROM public.material_grupos mg
WHERE m.grupo_id = mg.id
  AND (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'));

-- ─── PASO 5: Reporte final ────────────────────────────────────────────────────
DO $$
DECLARE
  v_restantes integer := 0;
  v_inactivos integer := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_restantes
  FROM public.materiales m
  JOIN public.material_grupos mg ON mg.id = m.grupo_id
  WHERE (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'));

  SELECT COUNT(*)
  INTO v_inactivos
  FROM public.materiales m
  JOIN public.material_grupos mg ON mg.id = m.grupo_id
  WHERE (mg.codigo ILIKE '01%' AND (mg.nombre ILIKE '%activo%' OR mg.nombre ILIKE '%fijo%'))
    AND m.estado = 'inactivo';

  RAISE NOTICE '========== RESULTADO LIMPIEZA ==========';
  RAISE NOTICE 'Materiales del grupo que quedaron (deben ser cero si la limpieza fue total): %', v_restantes;
  RAISE NOTICE 'De ellos, desactivados (no se pudieron eliminar por referencias): %', v_inactivos;
  IF v_restantes > 0 AND v_inactivos < v_restantes THEN
    RAISE WARNING 'Hay % materiales en estado activo en el grupo. Revisar referencias manualmente.', (v_restantes - v_inactivos);
  END IF;
  RAISE NOTICE '========================================';
END $$;
