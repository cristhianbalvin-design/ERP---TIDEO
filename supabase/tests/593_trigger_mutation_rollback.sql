-- Mutación de comportamiento 593: sin trigger, la aserción de 32 filas falla.
BEGIN;
CREATE TEMP TABLE _593_trigger_mutation (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);
DROP TRIGGER trg_z_seed_diagnostico_catalogos_empresa_nueva ON public.empresas;
DO $mutation$
DECLARE v_id text := 't593m_' || substr(md5(clock_timestamp()::text || random()::text), 1, 14); v_count bigint;
BEGIN
  INSERT INTO public.empresas (id, razon_social, nombre_comercial, pais, moneda_base, zona_horaria, estado)
  VALUES (v_id, 'Mutación 593', 'Mutación 593', 'PE', 'PEN', 'America/Lima', 'suspendida');
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id=v_id;
  INSERT INTO _593_trigger_mutation VALUES ('mutacion_sin_trigger_detecta_falta', v_count <> 32, format('filas=%s (esperadas 32)', v_count));
  DELETE FROM public.empresas WHERE id=v_id;
END
$mutation$;
SELECT * FROM _593_trigger_mutation;
ROLLBACK;
