-- Prueba transaccional de herencia de hilo para una respuesta TIDEO.

BEGIN;

DO $$
DECLARE
  v_tenant_id CONSTANT TEXT := 'emp_20541435833';
  v_configuracion_id UUID;
  v_tideo_id TEXT;
  v_cliente_id TEXT;
  v_padre_cliente UUID;
  v_respuesta UUID;
  v_audiencia TEXT;
  v_solo_interno BOOLEAN;
  v_autor_es_tideo BOOLEAN;
BEGIN
  SELECT c.id
  INTO v_configuracion_id
  FROM public.tideo_salud_configuracion c
  WHERE c.activa = true
  ORDER BY c.orden, c.pantalla
  LIMIT 1;

  SELECT u.id
  INTO v_tideo_id
  FROM public.usuarios u
  JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
  JOIN public.roles r ON r.id = ue.rol_id
  WHERE ue.empresa_id = v_tenant_id
    AND ue.estado = 'activo'
    AND lower(u.estado) = 'activo'
    AND lower(btrim(u.email)) LIKE '%@tideo.tech'
    AND r.es_admin_empresa = true
  LIMIT 1;

  SELECT u.id
  INTO v_cliente_id
  FROM public.usuarios u
  JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
  JOIN public.roles r ON r.id = ue.rol_id
  WHERE ue.empresa_id = v_tenant_id
    AND ue.estado = 'activo'
    AND lower(u.estado) = 'activo'
    AND lower(btrim(u.email)) NOT LIKE '%@tideo.tech'
    AND r.es_admin_empresa = true
  LIMIT 1;

  IF v_configuracion_id IS NULL OR v_tideo_id IS NULL OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos reales para la prueba 380';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_cliente_id, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto
  )
  VALUES (
    v_configuracion_id,
    v_tenant_id,
    'cliente',
    'Padre Cliente de prueba'
  )
  RETURNING id INTO v_padre_cliente;

  PERFORM set_config('request.jwt.claim.sub', v_tideo_id, true);

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto,
    solo_interno,
    respuesta_a_comentario_id
  )
  VALUES (
    v_configuracion_id,
    v_tenant_id,
    'tideo',
    'Respuesta TIDEO que debe heredar Cliente',
    true,
    v_padre_cliente
  )
  RETURNING id, audiencia, solo_interno, autor_es_tideo
  INTO v_respuesta, v_audiencia, v_solo_interno, v_autor_es_tideo;

  IF v_audiencia <> 'cliente'
     OR v_solo_interno
     OR NOT v_autor_es_tideo THEN
    RAISE EXCEPTION
      'La respuesta no heredo el hilo Cliente o no identifico al autor TIDEO';
  END IF;
END;
$$;

ROLLBACK;
