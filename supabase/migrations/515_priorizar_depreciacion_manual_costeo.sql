-- El valor manual es la fuente efectiva cuando existe; el cálculo queda como referencia.
CREATE OR REPLACE VIEW public.vw_depreciacion_mensual_activo AS
SELECT
  a.id AS activo_id,
  a.empresa_id,
  a.nombre,
  a.estado,
  a.moneda,
  a.horas_disponibles_mes,
  CASE
    WHEN a.valor_adquisicion > 0::numeric AND a.vida_util_anos > 0
      THEN a.valor_adquisicion / (a.vida_util_anos * 12)::numeric
        * obtener_tipo_cambio_vigente(CURRENT_DATE, a.moneda)
    ELSE NULL::numeric
  END AS depreciacion_mensual_usd_calculada,
  c.depreciacion_manual,
  CASE
    WHEN a.horas_disponibles_mes > 0::numeric THEN COALESCE(
      c.depreciacion_manual,
      CASE
        WHEN a.valor_adquisicion > 0::numeric AND a.vida_util_anos > 0
          THEN a.valor_adquisicion / (a.vida_util_anos * 12)::numeric
            * obtener_tipo_cambio_vigente(CURRENT_DATE, a.moneda)
        ELSE NULL::numeric
      END
    ) / a.horas_disponibles_mes
    ELSE NULL::numeric
  END AS costo_hora_activo_usd
FROM public.activos a
LEFT JOIN public.activo_depreciacion_config c ON c.activo_id = a.id
WHERE a.estado <> 'dado_baja';
