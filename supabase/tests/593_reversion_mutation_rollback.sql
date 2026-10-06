-- Mutación del revert 593: omitir DROP TRIGGER debe detectarse por dependencia.
BEGIN;
CREATE TEMP TABLE _593_mutation (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);
DO $mutation$
DECLARE v_detected boolean := false; v_message text := 'NO_EXCEPTION';
BEGIN
  BEGIN
    -- MUTACIÓN INTENCIONAL: falta DROP TRIGGER; la función sigue referenciada.
    DROP FUNCTION public.sembrar_catalogos_diagnostico_empresa_nueva();
  EXCEPTION WHEN OTHERS THEN
    v_detected := SQLSTATE = '2BP01';
    v_message := format('%s / %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO _593_mutation VALUES ('revert_sin_drop_trigger_detecta_dependencia', v_detected, v_message);
END
$mutation$;
SELECT * FROM _593_mutation;
ROLLBACK;
