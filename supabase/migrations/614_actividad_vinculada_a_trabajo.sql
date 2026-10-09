-- 614: Vincular cada actividad del catálogo con su trabajo (familia_trabajo).
-- El paso 2 del modal "Agregar al diagnóstico" muestra solo las actividades del trabajo elegido.
-- tipos_servicio_interno.familia_id apunta a otro catálogo (Mecánico, Eléctrico...), por eso se agrega una columna propia.
-- Una actividad sin trabajo (NULL) sigue apareciendo en todos los trabajos.
-- Carga inicial por nombre dentro de cada empresa; lo que no coincide queda en NULL.
-- Ensayo: dejar ROLLBACK al final, revisar los SELECT de verificación y luego cambiar a COMMIT.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.tipos_servicio_interno') IS NOT NULL, 'PRECONDITION_FAILED: falta tipos_servicio_interno';
  ASSERT to_regclass('public.familia_trabajo') IS NOT NULL, 'PRECONDITION_FAILED: falta familia_trabajo';
  ASSERT to_regprocedure('public.buscar_o_crear_tipo_servicio_interno(text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta la firma (text,text,text) de la migración 613';
END
$pre$;

ALTER TABLE public.tipos_servicio_interno
  ADD COLUMN IF NOT EXISTS familia_trabajo_id uuid REFERENCES public.familia_trabajo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tsi_familia_trabajo
  ON public.tipos_servicio_interno (empresa_id, familia_trabajo_id)
  WHERE familia_trabajo_id IS NOT NULL;

-- Carga inicial: actividad -> trabajo, por nombre y dentro de la misma empresa.
WITH mapa(actividad, trabajo) AS (VALUES
  ('Fabricación de buje o casquillo',                 'Fabricación de bujes y casquillos'),
  ('Fabricación de camisa',                           'Fabricación de camisas'),
  ('Fabricación de pistón o émbolo',                  'Fabricación de pistones y émbolos'),
  ('Fabricación de tapa de cilindro',                 'Fabricación de tapas de cilindro'),
  ('Fabricación de vástago',                          'Fabricación de vástagos'),
  ('Reemplazo de horquilla de camisa',                'Fabricación de horquillas'),
  ('Reparación de bomba hidráulica',                  'Reparación de bombas hidráulicas'),
  ('Armado y prueba de bomba',                        'Reparación de bombas hidráulicas'),
  ('Reparación de motor hidráulico',                  'Reparación de motores hidráulicos'),
  ('Reparación de reductor',                          'Reparación de reductores y cajas de transmisión'),
  ('Recuperación de eje o muñón',                     'Recuperación de ejes y muñones'),
  ('Mantenimiento preventivo de equipo hidráulico',   'Mantenimiento preventivo de equipos hidráulicos'),
  ('Bruñido de camisa',                               'Reparación de cilindros hidráulicos'),
  ('Cambio de rosca o de camisa',                     'Reparación de cilindros hidráulicos'),
  ('Cambio de sellos de cilindro',                    'Reparación de cilindros hidráulicos'),
  ('Reparación de pistón',                            'Reparación de cilindros hidráulicos'),
  ('Reparación de vástago',                           'Reparación de cilindros hidráulicos'),
  ('Evaluación dimensional de cilindro',              'Evaluación y diagnóstico'),
  ('Recepción y desarmado de cilindro',               'Evaluación y diagnóstico'),
  ('Armado y prueba de cilindro',                     'Armado, pruebas y entrega')
)
UPDATE public.tipos_servicio_interno t
SET familia_trabajo_id = f.id
FROM mapa m
JOIN public.familia_trabajo f ON f.nombre = m.trabajo
WHERE t.rol = 'actividad'
  AND t.nombre = m.actividad
  AND f.empresa_id = t.empresa_id
  AND t.familia_trabajo_id IS NULL;

-- Crear actividad desde el modal: puede quedar vinculada al trabajo elegido.
DROP FUNCTION public.buscar_o_crear_tipo_servicio_interno(text,text,text);

CREATE FUNCTION public.buscar_o_crear_tipo_servicio_interno(
  p_empresa_id text,
  p_nombre text,
  p_rol text DEFAULT NULL,
  p_familia_trabajo_id uuid DEFAULT NULL
)
RETURNS public.tipos_servicio_interno
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  n text := btrim(regexp_replace(coalesce(p_nombre,''),'\s+',' ','g'));
  k text := lower(n);
  r public.tipos_servicio_interno%rowtype;
  fam uuid := NULL;
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
  IF p_familia_trabajo_id IS NOT NULL THEN
    SELECT id INTO fam FROM public.familia_trabajo
    WHERE id=p_familia_trabajo_id AND empresa_id=p_empresa_id;
    IF fam IS NULL THEN
      RAISE EXCEPTION 'El trabajo no pertenece a la empresa.' USING ERRCODE='22023';
    END IF;
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
    IF fam IS NOT NULL AND r.rol='actividad' AND r.familia_trabajo_id IS NULL THEN
      UPDATE public.tipos_servicio_interno SET familia_trabajo_id=fam
      WHERE id=r.id AND empresa_id=p_empresa_id
      RETURNING * INTO r;
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
  INSERT INTO public.tipos_servicio_interno(id,empresa_id,codigo,nombre,clasificacion,rol,familia_trabajo_id)
  VALUES (r.id,p_empresa_id,r.codigo,n,'General',p_rol,
          CASE WHEN p_rol='actividad' THEN fam ELSE NULL END)
  RETURNING * INTO r;
  RETURN r;
END
$fn$;

REVOKE ALL ON FUNCTION public.buscar_o_crear_tipo_servicio_interno(text,text,text,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.buscar_o_crear_tipo_servicio_interno(text,text,text,uuid)
  TO authenticated;

-- Verificación (ejecutar antes del COMMIT, dentro de la misma transacción):
SELECT t.empresa_id, count(*) AS actividades, count(t.familia_trabajo_id) AS vinculadas
FROM public.tipos_servicio_interno t WHERE t.rol='actividad' GROUP BY t.empresa_id ORDER BY 1;
SELECT t.nombre AS actividad, f.nombre AS trabajo
FROM public.tipos_servicio_interno t LEFT JOIN public.familia_trabajo f ON f.id=t.familia_trabajo_id
WHERE t.rol='actividad' AND t.empresa_id='emp_2000000000' ORDER BY f.nombre NULLS FIRST, t.nombre;
SELECT p.oid::regprocedure AS firma, has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_ejecuta,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_ejecuta
FROM pg_proc p WHERE p.proname='buscar_o_crear_tipo_servicio_interno' AND p.pronamespace='public'::regnamespace;

ROLLBACK;
