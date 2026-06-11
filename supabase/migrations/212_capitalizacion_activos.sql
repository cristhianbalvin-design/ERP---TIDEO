-- ============================================================================
-- 212 · Capitalización de activos fijos — categorías ER + wizard Compras/Gastos
-- ============================================================================
-- Problema: no existía forma de registrar la compra de un activo fijo sin
-- que el monto apareciera como gasto en el Estado de Resultados del período.
--
-- Solución:
--   1. Agregar es_capitalizacion (boolean) a er_categorias.
--   2. Crear la categoría "Inversiones / Activos" con es_capitalizacion = true.
--   3. Crear el tipo de gasto "Activo Fijo" vinculado a esa categoría.
--   4. Agregar numero_serie a compras_gastos (campo capturado en el wizard).
--   5. Agregar compras_gasto_id a activos (trazabilidad al egreso de origen).
--   6. Actualizar crear_categorias_base para incluir la nueva categoría base.
-- ============================================================================

-- ── 1. Columna es_capitalizacion + ampliar constraint tipo_sistema ───────────

ALTER TABLE public.er_categorias
  ADD COLUMN IF NOT EXISTS es_capitalizacion boolean NOT NULL DEFAULT false;

-- El constraint original (migr. 183) no incluye 'inversiones'. Se amplía.
ALTER TABLE public.er_categorias
  DROP CONSTRAINT IF EXISTS er_categorias_tipo_sistema_chk,
  ADD CONSTRAINT er_categorias_tipo_sistema_chk
    CHECK (
      tipo_sistema IS NULL
      OR tipo_sistema IN (
        'mano_obra',
        'materiales',
        'servicios_terceros',
        'logistica',
        'administrativos',
        'comerciales',
        'gastos_financieros',
        'planilla',
        'cargas_sociales',
        'intereses_financiamiento',
        'inversiones'
      )
    );

-- ── 2. Seed: "Inversiones / Activos" por tenant ya existente ─────────────────

INSERT INTO public.er_categorias
  (empresa_id, nombre, seccion, regla_ot, tipo_sistema, es_base, es_capitalizacion, activo, orden)
SELECT
  e.id,
  'Inversiones / Activos',
  'gastos_operativos',
  'siempre',
  'inversiones',
  true,
  true,
  true,
  10
FROM public.empresas e
ON CONFLICT (empresa_id, nombre) DO UPDATE
  SET es_capitalizacion = true,
      tipo_sistema      = 'inversiones';

-- ── 3. Seed: tipo de gasto "Activo Fijo" por tenant ─────────────────────────

INSERT INTO public.tipos_gasto_empresa
  (empresa_id, nombre, categoria_er, icono, activo, orden)
SELECT
  e.id,
  'Activo Fijo',
  'Inversiones / Activos',
  'package',
  true,
  100
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.tipos_gasto_empresa tg
  WHERE tg.empresa_id = e.id AND tg.nombre = 'Activo Fijo'
);

-- ── 4. numero_serie en compras_gastos ────────────────────────────────────────

ALTER TABLE public.compras_gastos
  ADD COLUMN IF NOT EXISTS numero_serie text;

-- ── 5. compras_gasto_id en activos (trazabilidad) ────────────────────────────

ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS compras_gasto_id text
    REFERENCES public.compras_gastos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activos_compras_gasto_id
  ON public.activos (compras_gasto_id)
  WHERE compras_gasto_id IS NOT NULL;

-- ── 6. Actualizar crear_categorias_base para nuevos tenants ─────────────────

CREATE OR REPLACE FUNCTION public.crear_categorias_base(p_empresa_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.er_categorias
    (empresa_id, nombre, seccion, regla_ot, tipo_sistema, es_base, es_capitalizacion, orden)
  VALUES
    (p_empresa_id, 'Mano de obra',          'costo_ventas',       'con_ot',  'mano_obra',          true, false, 0),
    (p_empresa_id, 'Materiales',            'costo_ventas',       'con_ot',  'materiales',         true, false, 1),
    (p_empresa_id, 'Servicios terceros',    'costo_ventas',       'con_ot',  'servicios_terceros', true, false, 2),
    (p_empresa_id, 'Logistica',             'costo_ventas',       'con_ot',  'logistica',          true, false, 3),
    (p_empresa_id, 'Administrativos',       'gastos_operativos',  'siempre', 'administrativos',    true, false, 4),
    (p_empresa_id, 'Comerciales',           'gastos_operativos',  'siempre', 'comerciales',        true, false, 5),
    (p_empresa_id, 'Gastos financieros',    'gastos_financieros', 'siempre', 'gastos_financieros', true, false, 6),
    (p_empresa_id, 'Inversiones / Activos', 'gastos_operativos',  'siempre', 'inversiones',        true, true,  10)
  ON CONFLICT (empresa_id, nombre) DO UPDATE
    SET tipo_sistema      = excluded.tipo_sistema,
        es_capitalizacion = excluded.es_capitalizacion
    WHERE public.er_categorias.tipo_sistema IS NULL
       OR public.er_categorias.es_capitalizacion IS DISTINCT FROM excluded.es_capitalizacion;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
