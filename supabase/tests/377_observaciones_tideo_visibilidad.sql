-- Prueba transaccional de lectura publica, nota interna y escritura restringida.

BEGIN;

DO $$
DECLARE
  v_configuracion_id UUID;
  v_tideo_id TEXT;
  v_cliente_id TEXT;
  v_publico_id UUID;
  v_interno_id UUID;
  v_cliente_ve_publico BIGINT;
  v_cliente_ve_interno BIGINT;
  v_tideo_ve_total BIGINT;
  v_cliente_pudo_insertar BOOLEAN := true;
BEGIN
  SELECT id INTO v_configuracion_id
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'pantallas'
    AND activa = true
  ORDER BY orden, pantalla
  LIMIT 1;

  SELECT u.id INTO v_tideo_id
  FROM public.usuarios u
  JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
  WHERE ue.empresa_id = 'emp_20541435833'
    AND ue.estado = 'activo'
    AND lower(u.estado) = 'activo'
    AND lower(btrim(u.email)) LIKE '%@tideo.tech'
  LIMIT 1;

  SELECT u.id INTO v_cliente_id
  FROM public.usuarios u
  JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
  JOIN public.roles r ON r.id = ue.rol_id
  WHERE ue.empresa_id = 'emp_20541435833'
    AND ue.estado = 'activo'
    AND r.es_admin_empresa = true
    AND lower(u.estado) = 'activo'
    AND lower(btrim(u.email)) NOT LIKE '%@tideo.tech'
  LIMIT 1;

  IF v_configuracion_id IS NULL OR v_tideo_id IS NULL OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos reales para ejecutar la prueba de observaciones TIDEO';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_tideo_id, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id, empresa_id, audiencia, texto, solo_interno
  )
  VALUES (
    v_configuracion_id, 'emp_20541435833', 'tideo',
    'Prueba publica transaccional', false
  )
  RETURNING id INTO v_publico_id;

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id, empresa_id, audiencia, texto, solo_interno
  )
  VALUES (
    v_configuracion_id, 'emp_20541435833', 'tideo',
    'Prueba interna transaccional', true
  )
  RETURNING id INTO v_interno_id;

  PERFORM set_config('request.jwt.claim.sub', v_cliente_id, true);

  SELECT count(*) INTO v_cliente_ve_publico
  FROM public.tideo_salud_comentarios
  WHERE id = v_publico_id;

  SELECT count(*) INTO v_cliente_ve_interno
  FROM public.tideo_salud_comentarios
  WHERE id = v_interno_id;

  BEGIN
    INSERT INTO public.tideo_salud_comentarios (
      configuracion_id, empresa_id, audiencia, texto, solo_interno
    )
    VALUES (
      v_configuracion_id, 'emp_20541435833', 'tideo',
      'Este insert debe ser rechazado', false
    );
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      v_cliente_pudo_insertar := false;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_tideo_id, true);

  SELECT count(*) INTO v_tideo_ve_total
  FROM public.tideo_salud_comentarios
  WHERE id IN (v_publico_id, v_interno_id);

  IF v_cliente_ve_publico <> 1 THEN
    RAISE EXCEPTION 'El cliente no puede leer la observacion TIDEO publica';
  END IF;
  IF v_cliente_ve_interno <> 0 THEN
    RAISE EXCEPTION 'El cliente puede leer una nota TIDEO interna';
  END IF;
  IF v_cliente_pudo_insertar THEN
    RAISE EXCEPTION 'El cliente pudo insertar una observacion TIDEO';
  END IF;
  IF v_tideo_ve_total <> 2 THEN
    RAISE EXCEPTION 'El personal TIDEO no puede leer ambas observaciones';
  END IF;
END;
$$;

ROLLBACK;
