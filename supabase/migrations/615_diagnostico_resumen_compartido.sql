-- 615: resumen editable del diagnóstico técnico y texto compartido con el informe.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.diagnosticos_tecnicos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnosticos_tecnicos';
  ASSERT to_regprocedure('public.emitir_informe_diagnostico(uuid,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta emitir_informe_diagnostico(uuid,text,text)';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnosticos_tecnicos'
      AND column_name IN ('resumen_diagnostico','resumen_origen')
  ), 'PRECONDITION_FAILED: ya existen columnas del resumen de diagnóstico';
END
$pre$;

ALTER TABLE public.diagnosticos_tecnicos
  ADD COLUMN resumen_diagnostico text,
  ADD COLUMN resumen_origen text NOT NULL DEFAULT 'auto'
    CHECK (resumen_origen IN ('auto','editado'));

-- Amplía el snapshot existente sin reemplazar su lógica de permisos, versión,
-- fotos, mediciones ni tareas. El informe conserva el texto al momento de emitir.
DO $patch$
DECLARE
  v_def text;
  v_marker text := '''resumen'',v_resumen,';
  v_conclusion text := '''conclusion'',nullif(btrim(coalesce(v_op->>''conclusion'','''')),''''),';
  v_origen text := '''conclusion_origen'',v_op->>''conclusion_origen'',';
  v_old_check text := $check$IF nullif(btrim(coalesce(v_op->>'conclusion','')),'') IS NOT NULL$check$;
  v_new_check text := $check$IF (CASE WHEN v_d.tipo='mantenimiento' THEN nullif(btrim(coalesce(v_d.resumen_diagnostico,'')),'') ELSE nullif(btrim(coalesce(v_op->>'conclusion','')),'') END) IS NOT NULL$check$;
BEGIN
  SELECT pg_get_functiondef('public.emitir_informe_diagnostico(uuid,text,text)'::regprocedure)
    INTO v_def;
  ASSERT position(v_marker IN v_def) > 0,
    'PRECONDITION_FAILED: no se encontró el punto de inserción de resumen en el snapshot';
  v_def := replace(v_def, v_marker,
    v_marker || '''diagnostico_origen'',v_d.resumen_origen,');
  ASSERT position(v_conclusion IN v_def) > 0,
    'PRECONDITION_FAILED: no conclusion expression found';
  v_def := replace(v_def, v_conclusion,
    '''conclusion'',CASE WHEN v_d.tipo=''mantenimiento'' THEN nullif(btrim(coalesce(v_d.resumen_diagnostico,'''')),'''') ELSE nullif(btrim(coalesce(v_op->>''conclusion'','''')) ,'''') END,');
  ASSERT position(v_origen IN v_def) > 0,
    'PRECONDITION_FAILED: no conclusion origin expression found';
  v_def := replace(v_def, v_origen,
    '''conclusion_origen'',CASE WHEN v_d.tipo=''mantenimiento'' THEN v_d.resumen_origen ELSE v_op->>''conclusion_origen'' END,');
  ASSERT position(v_old_check IN v_def) > 0,
    'PRECONDITION_FAILED: no emission confirmation check found';
  v_def := replace(v_def, v_old_check, v_new_check);
  EXECUTE v_def;
END
$patch$;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.emitir_informe_diagnostico(uuid,text,text)'::regprocedure)
    INTO v_def;
  ASSERT position('v_d.resumen_diagnostico' IN v_def) > 0
    AND position('v_d.resumen_origen' IN v_def) > 0
    AND position('CASE WHEN v_d.tipo=''mantenimiento''' IN v_def) > 0
    AND position('v_d.resumen_origen ELSE v_op' IN v_def) > 0
    AND position('diagnostico_origen' IN v_def) > 0,
    'VERIFY_FAILED: emisión no incluye el resumen compartido';
END
$verify$;

COMMIT;
