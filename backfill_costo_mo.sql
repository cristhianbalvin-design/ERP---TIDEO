-- ============================================================
-- BACKFILL: costo_real de mano de obra en ordenes_trabajo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── PASO 1: Schema de partes_diarios ─────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'partes_diarios'
ORDER BY ordinal_position;

-- ── PASO 2: OTs afectadas con detalle ────────────────────
-- Ejecutar esto primero para ver qué se va a modificar
SELECT
  ot.numero,
  ot.costo_real                                        AS costo_real_actual,
  COUNT(pd.id)                                         AS num_partes,
  SUM(pd.horas_normales)                               AS horas_total,
  ROUND(SUM(pd.horas_normales *
    COALESCE(po.costo_hora_real, po.costo, 0)
  )::numeric, 2)                                       AS mo_recalculado,
  CASE
    WHEN ot.costo_real = 0 THEN 'AFECTADO (bug: MO era 0)'
    ELSE 'tenía valor'
  END                                                  AS estado_bug
FROM ordenes_trabajo ot
JOIN partes_diarios pd
  ON pd.orden_trabajo_id = ot.id AND pd.estado = 'aprobado'
LEFT JOIN personal_operativo po ON po.id = pd.tecnico_id
GROUP BY ot.id, ot.numero, ot.costo_real
ORDER BY ot.numero;

-- ── PASO 3: Vista previa del recálculo completo (MO + materiales) ──
SELECT
  ot.numero,
  ot.costo_real                                        AS antes,
  ROUND((
    -- Mano de obra
    SELECT COALESCE(SUM(
      pd2.horas_normales * COALESCE(po2.costo_hora_real, po2.costo, 0)
    ), 0)
    FROM partes_diarios pd2
    LEFT JOIN personal_operativo po2 ON po2.id = pd2.tecnico_id
    WHERE pd2.orden_trabajo_id = ot.id AND pd2.estado = 'aprobado'
  ) + (
    -- Materiales (JSONB)
    SELECT COALESCE(SUM(
      (m->>'cantidad')::numeric *
      COALESCE(
        (SELECT inv.costo_promedio FROM inventario inv WHERE inv.sku = m->>'sku'),
        (m->>'costo_unitario')::numeric,
        0
      )
    ), 0)
    FROM partes_diarios pd3
    CROSS JOIN jsonb_array_elements(COALESCE(pd3.materiales, '[]'::jsonb)) AS m
    WHERE pd3.orden_trabajo_id = ot.id AND pd3.estado = 'aprobado'
  ), 2)                                                AS despues,
  ROUND(ot.costo_estimado::numeric, 2)                 AS estimado
FROM ordenes_trabajo ot
WHERE EXISTS (
  SELECT 1 FROM partes_diarios pd
  WHERE pd.orden_trabajo_id = ot.id AND pd.estado = 'aprobado'
)
ORDER BY ot.numero;

-- ── PASO 4: EJECUTAR EL RECÁLCULO ────────────────────────
-- ⚠ REVISAR EL PASO 3 ANTES DE EJECUTAR ESTO
UPDATE ordenes_trabajo ot
SET costo_real = ROUND((
  -- Mano de obra: horas × costo_hora_real (con fallbacks)
  SELECT COALESCE(SUM(
    pd.horas_normales * COALESCE(po.costo_hora_real, po.costo, 0)
  ), 0)
  FROM partes_diarios pd
  LEFT JOIN personal_operativo po ON po.id = pd.tecnico_id
  WHERE pd.orden_trabajo_id = ot.id AND pd.estado = 'aprobado'
) + (
  -- Materiales: cantidad × costo_promedio del inventario
  SELECT COALESCE(SUM(
    (m->>'cantidad')::numeric *
    COALESCE(
      (SELECT inv.costo_promedio FROM inventario inv WHERE inv.sku = m->>'sku'),
      (m->>'costo_unitario')::numeric,
      0
    )
  ), 0)
  FROM partes_diarios pd2
  CROSS JOIN jsonb_array_elements(COALESCE(pd2.materiales, '[]'::jsonb)) AS m
  WHERE pd2.orden_trabajo_id = ot.id AND pd2.estado = 'aprobado'
), 2)
WHERE EXISTS (
  SELECT 1 FROM partes_diarios pd
  WHERE pd.orden_trabajo_id = ot.id AND pd.estado = 'aprobado'
)
RETURNING
  numero,
  costo_real                                           AS nuevo_costo_real;
