-- Pruebas transaccionales de estados y respuestas con identidades reales.

BEGIN;

DO $$
DECLARE
  v_tenant_id CONSTANT TEXT := 'emp_20541435833';
  v_configuracion_id UUID;
  v_tideo_id TEXT;
  v_cliente_id TEXT;
  v_estado public.tideo_salud_anotaciones;
  v_comentario_tideo UUID;
  v_respuesta_cliente UUID;
  v_respuesta_tideo UUID;
  v_interno UUID;
  v_cliente_modifico BOOLEAN := true;
  v_cliente_respondio_interno BOOLEAN := true;
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
  WHERE public.tideo_salud_usuario_es_responsable_tideo(u.id, v_tenant_id)
  LIMIT 1;

  SELECT u.id
  INTO v_cliente_id
  FROM public.usuarios u
  JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
  JOIN public.roles r ON r.id = ue.rol_id
  WHERE ue.empresa_id = v_tenant_id
    AND ue.estado = 'activo'
    AND lower(u.estado) = 'activo'
    AND r.es_admin_empresa = true
    AND lower(btrim(u.email)) NOT LIKE '%@tideo.tech'
  LIMIT 1;

  IF v_configuracion_id IS NULL OR v_tideo_id IS NULL OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos reales para la prueba 379';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_tideo_id, true);
  SET LOCAL ROLE authenticated;

  SELECT *
  INTO v_estado
  FROM public.guardar_salud_implementacion_estado(
    v_configuracion_id,
    v_tenant_id,
    'capacitado',
    true
  );

  IF NOT v_estado.capacitado
     OR v_estado.capacitado_por <> v_tideo_id
     OR v_estado.capacitado_at IS NULL THEN
    RAISE EXCEPTION 'Capacitado no guardo estado, autor o fecha';
  END IF;

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto,
    solo_interno
  )
  VALUES (
    v_configuracion_id,
    v_tenant_id,
    'tideo',
    'Comentario TIDEO publico de prueba',
    false
  )
  RETURNING id INTO v_comentario_tideo;

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto,
    solo_interno
  )
  VALUES (
    v_configuracion_id,
    v_tenant_id,
    'tideo',
    'Comentario TIDEO interno de prueba',
    true
  )
  RETURNING id INTO v_interno;

  PERFORM set_config('request.jwt.claim.sub', v_cliente_id, true);

  BEGIN
    UPDATE public.tideo_salud_anotaciones
    SET capacitado = false
    WHERE id = v_estado.id;
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      v_cliente_modifico := false;
  END;

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto,
    respuesta_a_comentario_id
  )
  VALUES (
    v_configuracion_id,
    v_tenant_id,
    'cliente',
    'Respuesta Cliente a TIDEO',
    v_comentario_tideo
  )
  RETURNING id INTO v_respuesta_cliente;

  BEGIN
    INSERT INTO public.tideo_salud_comentarios (
      configuracion_id,
      empresa_id,
      audiencia,
      texto,
      respuesta_a_comentario_id
    )
    VALUES (
      v_configuracion_id,
      v_tenant_id,
      'cliente',
      'Respuesta indebida a nota interna',
      v_interno
    );
  EXCEPTION
    WHEN raise_exception THEN
      v_cliente_respondio_interno := false;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_tideo_id, true);

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto,
    respuesta_a_comentario_id
  )
  VALUES (
    v_configuracion_id,
    v_tenant_id,
    'tideo',
    'Respuesta TIDEO a Cliente',
    v_respuesta_cliente
  )
  RETURNING id INTO v_respuesta_tideo;

  IF v_cliente_modifico THEN
    RAISE EXCEPTION 'El cliente modifico Capacitado';
  END IF;
  IF v_cliente_respondio_interno THEN
    RAISE EXCEPTION 'El cliente respondio una nota interna';
  END IF;
  IF v_respuesta_cliente IS NULL OR v_respuesta_tideo IS NULL THEN
    RAISE EXCEPTION 'No se guardaron las respuestas cruzadas';
  END IF;
END;
$$;

ROLLBACK;
