-- Comprueba que los selectores de Salud reflejen la lista de cuentas activas
-- del tenant aunque su posicion laboral sea historica o haya quedado vacante.

DO $$
DECLARE
  v_membresias BIGINT;
  v_helper BIGINT;
  v_tideo BIGINT;
BEGIN
  SELECT count(DISTINCT u.id) INTO v_membresias
  FROM public.usuarios u
  JOIN public.usuarios_empresas ue
    ON ue.user_id::text = u.id
  WHERE ue.empresa_id = 'emp_20541435833'
    AND ue.estado = 'activo'
    AND lower(u.estado) = 'activo';

  SELECT count(*) INTO v_helper
  FROM public.usuarios u
  WHERE public.tideo_salud_usuario_pertenece_tenant(
    u.id,
    'emp_20541435833'
  );

  IF v_helper <> v_membresias THEN
    RAISE EXCEPTION
      'Helper de tenant no coincide con membresias activas: helper %, membresias %',
      v_helper,
      v_membresias;
  END IF;

  SELECT count(*) INTO v_tideo
  FROM public.usuarios u
  WHERE public.tideo_salud_usuario_es_responsable_tideo(
    u.id,
    'emp_20541435833'
  );

  IF v_tideo < 1 THEN
    RAISE EXCEPTION
      'ZAHORY tiene cuentas @tideo.tech activas pero el helper no devuelve ninguna';
  END IF;
END;
$$;

SELECT
  u.nombre,
  u.email,
  ue.empresa_id
FROM public.usuarios u
JOIN public.usuarios_empresas ue
  ON ue.user_id::text = u.id
WHERE ue.empresa_id = 'emp_20541435833'
  AND ue.estado = 'activo'
  AND lower(u.estado) = 'activo'
  AND lower(btrim(u.email)) LIKE '%@tideo.tech'
ORDER BY u.email;

