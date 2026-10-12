-- WMS Fase 2b-A: la comparación de estado de materiales/almacenes en
-- wms_registrar_movimiento_manual no debe distinguir mayúsculas
-- (existen materiales con estado 'Activo'). Parte de la definición remota vigente.
-- Ya aplicada en producción (ERP - Tideo) con este mismo bloque.
DO $fix$
DECLARE
  v_oid oid := to_regprocedure('public.wms_registrar_movimiento_manual(text,text,text,text,text,text,uuid,numeric,numeric,text,text,text,date,text,text)')::oid;
  v_def text;
  v_new text;
BEGIN
  IF v_oid IS NULL THEN RAISE EXCEPTION 'No existe wms_registrar_movimiento_manual'; END IF;
  v_def := pg_get_functiondef(v_oid);
  v_new := replace(v_def, 'coalesce(m.estado,''activo'')=''activo''', 'lower(coalesce(m.estado,''activo''))=''activo''');
  v_new := replace(v_new, 'coalesce(a.estado,''activo'')=''activo''', 'lower(coalesce(a.estado,''activo''))=''activo''');
  IF v_new = v_def THEN
    IF position('lower(coalesce(m.estado' in v_def) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'No se encontró la comparación de estado a corregir';
  END IF;
  EXECUTE v_new;
  IF position('lower(coalesce(m.estado' in pg_get_functiondef(v_oid)) = 0 OR position('lower(coalesce(a.estado' in pg_get_functiondef(v_oid)) = 0 THEN
    RAISE EXCEPTION 'La corrección no quedó aplicada';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') OR has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Permisos inesperados tras la corrección';
  END IF;
END
$fix$;
