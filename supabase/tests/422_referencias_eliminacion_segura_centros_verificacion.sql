-- Ejecutar después de aplicar la 422. Los registros de prueba se revierten al final.

SET ROLE postgres;
BEGIN;

CREATE TEMP TABLE resultado_422 (caso text PRIMARY KEY, resultado text NOT NULL) ON COMMIT DROP;

DO $casos$
DECLARE
  v_usuario uuid;
  v_empresa text;
  v_sociedad uuid;
  v_alcance uuid[];
  v_resultado jsonb;
BEGIN
  FOR v_usuario, v_empresa, v_sociedad IN
    SELECT ue.user_id, cb.empresa_id, cb.sociedad_id
    FROM public.usuarios_empresas ue
    JOIN public.centros_beneficio cb ON cb.empresa_id = ue.empresa_id
    WHERE ue.estado = 'activo' AND cb.sociedad_id IS NOT NULL
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_usuario::text, true);
    v_alcance := public.usuario_alcance_sociedades(v_empresa);
    EXIT WHEN v_alcance IS NULL OR v_sociedad = ANY(v_alcance);
  END LOOP;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'No hay usuario/sociedad de prueba dentro de alcance.'; END IF;

  INSERT INTO public.centros_beneficio (id, empresa_id, sociedad_id, codigo, nombre, tipo, cargo_financiero_dbs, estado)
  VALUES ('verificacion_422_libre', v_empresa, v_sociedad, 'V422-LIBRE', 'Verificacion 422 libre', 'linea_servicio', 'Cliente_Contrato', 'activo');
  v_resultado := public.contar_referencias_centro('centro_beneficio', 'verificacion_422_libre');
  INSERT INTO resultado_422 VALUES ('CEBE sin referencias: conteo', CASE WHEN (v_resultado->>'total_referencias')::int = 0 AND (v_resultado->>'cecos_hijos')::int = 0 THEN 'ACEPTADO' ELSE 'FALLO: ' || v_resultado::text END);
  DELETE FROM public.centros_beneficio WHERE id = 'verificacion_422_libre';
  INSERT INTO resultado_422 VALUES ('CEBE sin referencias: DELETE directo', CASE WHEN NOT EXISTS (SELECT 1 FROM public.centros_beneficio WHERE id = 'verificacion_422_libre') THEN 'ACEPTADO' ELSE 'FALLO' END);

  INSERT INTO public.centros_beneficio (id, empresa_id, sociedad_id, codigo, nombre, tipo, cargo_financiero_dbs, estado)
  VALUES ('verificacion_422_padre', v_empresa, v_sociedad, 'V422-PADRE', 'Verificacion 422 padre', 'linea_servicio', 'Cliente_Contrato', 'activo');
  INSERT INTO public.centros_costo (id, empresa_id, sociedad_id, codigo, nombre, tipo, cebe_id, estado)
  VALUES ('verificacion_422_hijo', v_empresa, v_sociedad, 'V422-HIJO', 'Verificacion 422 hijo', 'area_funcional', 'verificacion_422_padre', 'activo');
  v_resultado := public.contar_referencias_centro('centro_beneficio', 'verificacion_422_padre');
  INSERT INTO resultado_422 VALUES ('CEBE con hijos: conteo separado', CASE WHEN (v_resultado->>'cecos_hijos')::int = 1 AND (v_resultado->>'total_referencias')::int = 0 THEN 'ACEPTADO' ELSE 'FALLO: ' || v_resultado::text END);
  BEGIN
    DELETE FROM public.centros_beneficio WHERE id = 'verificacion_422_padre';
    INSERT INTO resultado_422 VALUES ('CEBE con hijos: DELETE bloqueado', 'FALLO: DELETE permitido');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO resultado_422 VALUES ('CEBE con hijos: DELETE bloqueado', 'ACEPTADO');
  END;
END
$casos$;

SELECT caso, resultado FROM resultado_422 ORDER BY caso;

ROLLBACK;
