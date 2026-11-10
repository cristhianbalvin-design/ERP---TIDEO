-- 671: Corrige el nombre de la categoría del Estado de Resultados "Logistica" -> "Logística" (autorizado por Cristhian el 2026-11-09).
-- Afecta a las 6 empresas que la tenían sin tilde. El nombre se guarda también como texto en otras tablas,
-- así que se actualiza en todas a la vez para que los reportes sigan coincidiendo. Además, la semilla de
-- categorías base (crear_categorias_base) crea la categoría con tilde para empresas nuevas.
DO $migracion$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.er_categorias SET nombre = 'Logística' WHERE nombre = 'Logistica';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 6 THEN RAISE EXCEPTION '671: se esperaban 6 categorías "Logistica", se encontraron %', v_n; END IF;

  UPDATE public.tipos_gasto_empresa SET categoria_er = 'Logística' WHERE categoria_er = 'Logistica';
  UPDATE public.cxp SET categoria_er = 'Logística' WHERE categoria_er = 'Logistica';
  UPDATE public.compras_gastos SET categoria = 'Logística' WHERE categoria = 'Logistica';
  UPDATE public.caja_chica SET categoria = 'Logística' WHERE categoria = 'Logistica';
  UPDATE public.caja_chica_reclasificacion_er SET categoria_anterior = 'Logística' WHERE categoria_anterior = 'Logistica';
  UPDATE public.caja_chica_reclasificacion_er SET categoria_nueva = 'Logística' WHERE categoria_nueva = 'Logistica';

  IF EXISTS (SELECT 1 FROM public.er_categorias WHERE nombre = 'Logistica')
     OR EXISTS (SELECT 1 FROM public.tipos_gasto_empresa WHERE categoria_er = 'Logistica')
     OR EXISTS (SELECT 1 FROM public.cxp WHERE categoria_er = 'Logistica')
     OR EXISTS (SELECT 1 FROM public.compras_gastos WHERE categoria = 'Logistica')
     OR EXISTS (SELECT 1 FROM public.caja_chica WHERE categoria = 'Logistica')
     OR EXISTS (SELECT 1 FROM public.caja_chica_reclasificacion_er WHERE categoria_anterior = 'Logistica' OR categoria_nueva = 'Logistica') THEN
    RAISE EXCEPTION '671: quedan registros con "Logistica" sin tilde';
  END IF;
END
$migracion$;

CREATE OR REPLACE FUNCTION public.crear_categorias_base(p_empresa_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.er_categorias
    (empresa_id, nombre, seccion, regla_ot, tipo_sistema, es_base, es_capitalizacion, orden)
  VALUES
    (p_empresa_id, 'Mano de obra',          'costo_ventas',       'con_ot',  'mano_obra',          true, false, 0),
    (p_empresa_id, 'Materiales',            'costo_ventas',       'con_ot',  'materiales',         true, false, 1),
    (p_empresa_id, 'Servicios terceros',    'costo_ventas',       'con_ot',  'servicios_terceros', true, false, 2),
    (p_empresa_id, 'Logística',             'costo_ventas',       'con_ot',  'logistica',          true, false, 3),
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
$function$;

DO $verificacion$
BEGIN
  IF position('''Logística''' IN pg_get_functiondef('public.crear_categorias_base'::regproc)) = 0 THEN
    RAISE EXCEPTION '671: la semilla de categorías base no quedó con "Logística"';
  END IF;
END
$verificacion$;
