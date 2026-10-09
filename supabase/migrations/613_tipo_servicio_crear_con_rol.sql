-- 613: Asignar el rol actividad o tarea al crear tipos de servicio interno.
-- La firma de tres argumentos conserva las llamadas de dos argumentos mediante DEFAULT NULL.
-- Los permisos, validación de tenant y búsqueda existentes se mantienen.
-- Numeración: 611 y 612 pertenecen a la línea del asistente; esta migración se registró primero como 611 y se renumeró a 613.
-- Aplicada en producción el 2026-10-09 tras ensayo con ROLLBACK y revisión.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.tipos_servicio_interno') IS NOT NULL,
    'PRECONDITION_FAILED: falta tipos_servicio_interno';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tipos_servicio_interno'
      AND column_name='rol'
  ), 'PRECONDITION_FAILED: falta tipos_servicio_interno.rol';
  ASSERT to_regprocedure('public.buscar_o_crear_tipo_servicio_interno(text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta la firma vigente (text,text)';
END
$pre$;

-- PostgreSQL no permite mantener una función de dos argumentos junto a otra con
-- un tercer argumento DEFAULT NULL: la llamada de dos argumentos sería ambigua.
-- Se elimina la firma anterior y se le reasignan sus permisos a la nueva firma.
DROP FUNCTION public.buscar_o_crear_tipo_servicio_interno(text,text);

CREATE FUNCTION public.buscar_o_crear_tipo_servicio_interno(
  p_empresa_id text,
  p_nombre text,
  p_rol text DEFAULT NULL
)
RETURNS public.tipos_servicio_interno
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  n text := btrim(regexp_replace(coalesce(p_nombre,''),'\s+',' ','g'));
  k text := lower(n);
  r public.tipos_servicio_interno%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='28000';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id,'diagnostico_tecnico','crear') THEN
    RAISE EXCEPTION 'No autorizado.' USING ERRCODE='42501';
  END IF;
  IF n='' THEN
    RAISE EXCEPTION 'El nombre es obligatorio.';
  END IF;
  IF p_rol IS NOT NULL AND p_rol NOT IN ('actividad','tarea') THEN
    RAISE EXCEPTION 'El rol debe ser actividad o tarea.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tsi:'||p_empresa_id||':'||k,0));
  SELECT * INTO r
  FROM public.tipos_servicio_interno
  WHERE empresa_id=p_empresa_id
    AND lower(btrim(regexp_replace(nombre,'\s+',' ','g')))=k
  ORDER BY id LIMIT 1;

  IF FOUND THEN
    IF p_rol IS NOT NULL AND r.rol IS NULL THEN
      UPDATE public.tipos_servicio_interno SET rol=p_rol
      WHERE id=r.id AND empresa_id=p_empresa_id
      RETURNING * INTO r;
    ELSIF p_rol IS NOT NULL AND r.rol IS DISTINCT FROM p_rol THEN
      RAISE EXCEPTION 'Ya existe como %. No se puede usar como %.',
        CASE r.rol WHEN 'actividad' THEN 'actividad' WHEN 'tarea' THEN 'tarea' ELSE 'sin rol' END,
        p_rol;
    END IF;
    RETURN r;
  END IF;

  LOOP
    r.id := 'tsi_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    r.codigo := 'TSI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.tipos_servicio_interno
      WHERE id=r.id OR (empresa_id=p_empresa_id AND codigo=r.codigo)
    );
  END LOOP;
  INSERT INTO public.tipos_servicio_interno(id,empresa_id,codigo,nombre,clasificacion,rol)
  VALUES (r.id,p_empresa_id,r.codigo,n,'General',p_rol)
  RETURNING * INTO r;
  RETURN r;
END
$fn$;

REVOKE ALL ON FUNCTION public.buscar_o_crear_tipo_servicio_interno(text,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.buscar_o_crear_tipo_servicio_interno(text,text,text)
  TO authenticated;

-- Verificación de la firma, el valor predeterminado y los permisos conservados:
-- SELECT p.oid::regprocedure AS firma, pg_get_function_arguments(p.oid) AS argumentos,
--        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_ejecuta,
--        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_ejecuta,
--        has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_ejecuta
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname='buscar_o_crear_tipo_servicio_interno';
-- SELECT rol,count(*) FROM public.tipos_servicio_interno GROUP BY rol ORDER BY rol;

COMMIT;
