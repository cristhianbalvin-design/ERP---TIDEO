-- 633: La cotización generada desde una Hoja de Costeo queda internamente consistente.
-- Antes la cabecera copiaba el precio de la hoja (subtotal/total) y dejaba subtotal_impl/igv_impl/total_impl en 0,
-- por lo que la pantalla sumaba partidas (1,040.23) y el listado mostraba la cabecera (1,040.13).
-- Ahora subtotal, base imponible, IGV y total (y sus *_impl) salen de la suma de partidas redondeadas.
-- Solo afecta a la cotización creada en la misma transacción (created_at = now()).

CREATE OR REPLACE FUNCTION public.hc_ajustar_cotizacion_desde_hoja(p_empresa_id text, p_hoja_costeo_id text, p_cotizacion_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_items jsonb;
  v_subtotal numeric;
  v_igv_pct numeric;
  v_igv numeric;
BEGIN
  SELECT coalesce(c.igv_pct, 18) INTO v_igv_pct
    FROM public.cotizaciones c
   WHERE c.id = p_cotizacion_id AND c.empresa_id = p_empresa_id
     AND c.hoja_costeo_id = p_hoja_costeo_id AND c.created_at = now();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_items := public.hc_items_cotizacion(p_hoja_costeo_id);
  SELECT round(coalesce(sum((i->>'subtotal')::numeric), 0), 2) INTO v_subtotal
    FROM jsonb_array_elements(v_items) i;
  v_igv := round(v_subtotal * v_igv_pct / 100, 2);

  UPDATE public.cotizaciones c
     SET items = v_items,
         subtotal = v_subtotal,
         base_imponible = v_subtotal,
         igv = v_igv,
         total = v_subtotal + v_igv,
         subtotal_impl = v_subtotal,
         igv_impl = v_igv,
         total_impl = v_subtotal + v_igv
   WHERE c.id = p_cotizacion_id
     AND c.empresa_id = p_empresa_id
     AND c.hoja_costeo_id = p_hoja_costeo_id
     AND c.created_at = now();
END
$fn$;
REVOKE ALL ON FUNCTION public.hc_ajustar_cotizacion_desde_hoja(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
