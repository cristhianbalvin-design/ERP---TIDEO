-- Fase 1.4, version de verificacion. Revierte todos los cambios.
-- Cubre la relacion con padre y las operaciones permitidas sin padre.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo, public.centros_beneficio IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.centros_costo cc
    JOIN public.centros_beneficio cb ON cb.id = cc.cebe_id
    WHERE cc.cebe_id IS NOT NULL
      AND (cc.empresa_id IS DISTINCT FROM cb.empresa_id OR cc.sociedad_id IS DISTINCT FROM cb.sociedad_id)
  ) THEN
    RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: relaciones historicas incoherentes.';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.validar_coherencia_societaria_ceco_cebe()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $funcion$
DECLARE
  v_empresa_cebe text;
  v_sociedad_cebe uuid;
BEGIN
  IF TG_TABLE_NAME = 'centros_costo' THEN
    IF NEW.cebe_id IS NULL THEN RETURN NEW; END IF;
    SELECT empresa_id, sociedad_id INTO v_empresa_cebe, v_sociedad_cebe
    FROM public.centros_beneficio WHERE id = NEW.cebe_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: CEBE padre inexistente.' USING ERRCODE = '23503';
    END IF;
    IF NEW.empresa_id IS DISTINCT FROM v_empresa_cebe OR NEW.sociedad_id IS DISTINCT FROM v_sociedad_cebe THEN
      RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: CECO y CEBE padre deben coincidir.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'centros_beneficio' THEN
    IF EXISTS (SELECT 1 FROM public.centros_costo cc WHERE cc.cebe_id = NEW.id AND (cc.empresa_id IS DISTINCT FROM NEW.empresa_id OR cc.sociedad_id IS DISTINCT FROM NEW.sociedad_id)) THEN
      RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: el cambio deja hijos incoherentes.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: tabla no soportada.';
END
$funcion$;

DROP TRIGGER IF EXISTS aa_centros_costo_validar_cebe_sociedad ON public.centros_costo;
CREATE TRIGGER aa_centros_costo_validar_cebe_sociedad
BEFORE INSERT OR UPDATE OF cebe_id, empresa_id, sociedad_id
ON public.centros_costo FOR EACH ROW EXECUTE FUNCTION public.validar_coherencia_societaria_ceco_cebe();
DROP TRIGGER IF EXISTS aa_centros_beneficio_validar_hijos_sociedad ON public.centros_beneficio;
CREATE TRIGGER aa_centros_beneficio_validar_hijos_sociedad
BEFORE UPDATE OF empresa_id, sociedad_id
ON public.centros_beneficio FOR EACH ROW EXECUTE FUNCTION public.validar_coherencia_societaria_ceco_cebe();

CREATE TEMP TABLE resultado_421 (
  caso text PRIMARY KEY,
  resultado text NOT NULL
) ON COMMIT DROP;

DO $casos$
DECLARE
  v_cebe_id text;
  v_empresa_id text;
  v_sociedad_cebe uuid;
  v_otra_sociedad uuid;
  v_tipo_ceco text;
  v_ceco_prueba_id text;
  v_codigo_prueba text;
BEGIN
  SELECT cb.id, cb.empresa_id, cb.sociedad_id, cc.tipo
  INTO v_cebe_id, v_empresa_id, v_sociedad_cebe, v_tipo_ceco
  FROM public.centros_costo cc
  JOIN public.centros_beneficio cb ON cb.id = cc.cebe_id
  WHERE cc.sociedad_id IS NOT NULL
    AND cb.sociedad_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sociedades s
      WHERE s.empresa_id = cb.empresa_id
        AND s.id IS DISTINCT FROM cb.sociedad_id
    )
  LIMIT 1;

  IF v_cebe_id IS NULL THEN
    RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: no hay datos de prueba con dos sociedades y un hijo.';
  END IF;

  SELECT s.id
  INTO v_otra_sociedad
  FROM public.sociedades s
  WHERE s.empresa_id = v_empresa_id
    AND s.id IS DISTINCT FROM v_sociedad_cebe
  LIMIT 1;

  v_ceco_prueba_id := 'verificacion-421-' || substr(md5(clock_timestamp()::text || random()::text), 1, 24);
  v_codigo_prueba := 'V421-' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);

  -- INSERT sin padre: la salida temprana NEW.cebe_id IS NULL debe aceptarlo.
  INSERT INTO public.centros_costo (
    id, empresa_id, codigo, nombre, tipo, cebe_id, presupuesto_mensual, estado, sociedad_id
  ) VALUES (
    v_ceco_prueba_id, v_empresa_id, v_codigo_prueba,
    'Centro de prueba transaccional 421', v_tipo_ceco, NULL, 0, 'activo', v_sociedad_cebe
  );
  INSERT INTO resultado_421 VALUES ('insert_ceco_sin_padre', 'passed');

  -- Campo ajeno: el trigger no esta suscrito a descripcion.
  UPDATE public.centros_costo
  SET descripcion = 'Prueba transaccional sin padre'
  WHERE id = v_ceco_prueba_id;
  INSERT INTO resultado_421 VALUES ('update_campo_ajeno_sin_padre', 'passed');

  -- Aun cambiando sociedad, sin padre la salida temprana debe aceptarlo.
  UPDATE public.centros_costo
  SET sociedad_id = v_otra_sociedad
  WHERE id = v_ceco_prueba_id;
  INSERT INTO resultado_421 VALUES ('update_sociedad_sin_padre', 'passed');

  -- Se vuelve a la sociedad original sin padre antes de asignar su CEBE.
  UPDATE public.centros_costo
  SET sociedad_id = v_sociedad_cebe
  WHERE id = v_ceco_prueba_id;

  -- NULL a padre de la misma sociedad: aceptado.
  UPDATE public.centros_costo
  SET cebe_id = v_cebe_id
  WHERE id = v_ceco_prueba_id;
  INSERT INTO resultado_421 VALUES ('asignar_padre_misma_sociedad', 'passed');

  -- Se libera el padre para probar NULL a padre de otra sociedad.
  UPDATE public.centros_costo
  SET cebe_id = NULL
  WHERE id = v_ceco_prueba_id;

  -- El mismo CEBE pasa a ser de otra sociedad al cambiar primero el CECO sin padre.
  UPDATE public.centros_costo
  SET sociedad_id = v_otra_sociedad
  WHERE id = v_ceco_prueba_id;

  BEGIN
    UPDATE public.centros_costo
    SET cebe_id = v_cebe_id
    WHERE id = v_ceco_prueba_id;
    RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: se acepto un padre de otra sociedad.';
  EXCEPTION WHEN check_violation THEN
    INSERT INTO resultado_421 VALUES ('rechazar_padre_otra_sociedad', 'passed');
  END;

  BEGIN
    UPDATE public.centros_beneficio
    SET sociedad_id = v_otra_sociedad
    WHERE id = v_cebe_id;
    RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: se acepto mover CEBE con hijos.';
  EXCEPTION WHEN check_violation THEN
    INSERT INTO resultado_421 VALUES ('rechazar_cambio_sociedad_cebe_con_hijos', 'passed');
  END;
END
$casos$;

SELECT jsonb_object_agg(caso, resultado ORDER BY caso) || jsonb_build_object('transaction', 'ROLLBACK') AS resultado_421
FROM resultado_421;

ROLLBACK;
