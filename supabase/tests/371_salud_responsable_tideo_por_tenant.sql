-- Valida que Responsable TIDEO sea un subconjunto @tideo.tech del tenant visto.
-- La prueba de escritura termina en ROLLBACK y no deja datos.

BEGIN;

WITH tenants_operativos AS (
  SELECT e.id
  FROM public.empresas e
  WHERE e.es_plataforma = false
    AND e.estado = 'activa'
    AND e.id <> 'emp_2000000000'
),
directo AS (
  SELECT
    t.id AS tenant_id,
    count(DISTINCT u.id) AS conteo
  FROM tenants_operativos t
  LEFT JOIN public.usuarios u
    ON public.tideo_salud_usuario_es_responsable_tideo(u.id, t.id)
  GROUP BY t.id
)
SELECT
  d.tenant_id,
  d.conteo AS conteo_directo,
  (
    SELECT count(*)
    FROM public.usuarios u
    WHERE public.tideo_salud_usuario_es_responsable_tideo(u.id, d.tenant_id)
  ) AS conteo_helper
FROM directo d
ORDER BY d.tenant_id;

DO $$
DECLARE
  v_configuracion_id UUID;
  v_usuario_cliente TEXT;
  v_rechazado BOOLEAN := false;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.empresas e
      ON e.es_plataforma = false
     AND e.estado = 'activa'
     AND e.id <> 'emp_2000000000'
    WHERE public.tideo_salud_usuario_es_responsable_tideo(u.id, e.id)
      AND (
        lower(btrim(u.email)) NOT LIKE '%@tideo.tech'
        OR NOT public.tideo_salud_usuario_pertenece_tenant(u.id, e.id)
      )
  ) THEN
    RAISE EXCEPTION
      'El helper acepto un responsable sin dominio o pertenencia al tenant';
  END IF;

  SELECT c.id INTO v_configuracion_id
  FROM public.tideo_salud_configuracion c
  WHERE c.activa
  ORDER BY c.created_at
  LIMIT 1;

  SELECT u.id INTO v_usuario_cliente
  FROM public.usuarios u
  WHERE public.tideo_salud_usuario_pertenece_tenant(
      u.id,
      'emp_20541435833'
    )
    AND lower(btrim(u.email)) NOT LIKE '%@tideo.tech'
  LIMIT 1;

  IF v_usuario_cliente IS NULL THEN
    RAISE EXCEPTION
      'No existe un usuario cliente ZAHORY para probar el rechazo del trigger';
  END IF;

  BEGIN
    INSERT INTO public.tideo_salud_anotaciones (
      configuracion_id,
      empresa_id,
      responsable_tideo,
      solo_interno
    )
    VALUES (
      v_configuracion_id,
      'emp_20541435833',
      v_usuario_cliente,
      false
    )
    ON CONFLICT (configuracion_id, empresa_id)
    DO UPDATE SET responsable_tideo = EXCLUDED.responsable_tideo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Responsable TIDEO invalido:%' THEN
      v_rechazado := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT v_rechazado THEN
    RAISE EXCEPTION
      'El trigger acepto como Responsable TIDEO un correo que no es @tideo.tech';
  END IF;
END;
$$;

ROLLBACK;

SELECT
  count(*) AS usuarios_tideo_tech_zahory
FROM public.usuarios u
WHERE public.tideo_salud_usuario_es_responsable_tideo(
  u.id,
  'emp_20541435833'
);
