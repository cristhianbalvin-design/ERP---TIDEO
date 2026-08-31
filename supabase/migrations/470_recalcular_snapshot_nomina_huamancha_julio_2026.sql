-- Completa la corrección 469: limpia columnas heredadas que también alimentan
-- reportes y reconstruye los conceptos de nómina que dependen de tardanzas/HE.
DO $$
DECLARE
  filas_asistencia integer;
  filas_nomina integer;
BEGIN
  UPDATE public.registros_asistencia
  SET
    tardanza_minutos = 0,
    horas_extra = 0,
    he_autorizada = false,
    updated_at = now()
  WHERE empresa_id = 'emp_20601829101'
    AND trabajador_id = 'pop_1781014695900'
    AND fecha BETWEEN DATE '2026-07-02' AND DATE '2026-07-31'
    AND origen_registro = 'biometrico_importacion'
    AND estado = 'completo'
    AND tardanza_min = 0
    AND horas_extra_min = 0
    AND (tardanza_minutos <> 0 OR horas_extra <> 0 OR he_autorizada IS TRUE);

  GET DIAGNOSTICS filas_asistencia = ROW_COUNT;
  IF filas_asistencia <> 26 THEN
    RAISE EXCEPTION
      'Recálculo cancelado: se esperaban 26 asistencias derivadas y se encontraron %',
      filas_asistencia;
  END IF;

  -- El período conserva sus parámetros históricos (régimen general y AFP
  -- Integra). Los importes se recalculan a partir de S/ 3,499.00 sin tardanzas
  -- ni horas extra, igual que lo hace el motor para ese snapshot mensual.
  UPDATE public.nomina_detalle
  SET
    horas_extra_tramo1_min = 0,
    horas_extra_tramo2_min = 0,
    add_horas_extra = 0,
    desc_tardanzas = 0,
    remuneracion_bruta = 3499.00,
    aporte_afp = 349.90,
    prima_seguro_afp = 47.94,
    fcjmms_trabajador = 17.50,
    retencion_ir = 74.11,
    total_descuentos = 489.45,
    neto = 3009.55,
    essalud = 314.91,
    total_cargas = 1240.20,
    costo_real_empresa = 4739.20
  WHERE id = '34094ac9-7a6d-46ca-8204-79ca72c5de5e'
    AND periodo_id = 'pnm_1786643937226_gxufkg'
    AND empresa_id = 'emp_20601829101'
    AND trabajador_id = 'pop_1781014695900';

  GET DIAGNOSTICS filas_nomina = ROW_COUNT;
  IF filas_nomina <> 1 THEN
    RAISE EXCEPTION
      'Recálculo cancelado: no se encontró el snapshot de nómina esperado';
  END IF;
END $$;
