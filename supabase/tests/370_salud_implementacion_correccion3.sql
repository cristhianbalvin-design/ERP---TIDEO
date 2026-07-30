-- Pruebas transaccionales de la migracion 370.
-- No dejan datos: todo se ejecuta dentro de una transaccion que termina en ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_config public.tideo_salud_configuracion;
  v_rpc BIGINT;
  v_manual BIGINT;
BEGIN
  IF (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa AND pestana = 'plantillas_masivas' AND tipo = 'Plantilla Masiva'
  ) <> 9 THEN
    RAISE EXCEPTION 'Se esperaban 9 plantillas masivas';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa AND pestana = 'plantillas_masivas' AND tipo = 'Maestro Individual'
  ) <> 14 THEN
    RAISE EXCEPTION 'Se esperaban 14 maestros individuales';
  END IF;

  SELECT * INTO v_config
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'plantillas_masivas' AND pantalla = 'CECO/CEBE';

  v_rpc := public.tideo_salud_contar_configuracion(
    v_config.tabla_principal,
    v_config.tabla_secundaria,
    v_config.filtro_columna,
    v_config.filtro_operador,
    v_config.filtro_valor,
    'emp_20541435833'
  );
  SELECT
    (SELECT count(*) FROM public.centros_costo WHERE empresa_id = 'emp_20541435833')
    + (SELECT count(*) FROM public.centros_beneficio WHERE empresa_id = 'emp_20541435833')
  INTO v_manual;
  IF v_rpc <> v_manual THEN
    RAISE EXCEPTION 'Conteo CECO/CEBE no coincide: RPC %, manual %', v_rpc, v_manual;
  END IF;

  SELECT * INTO v_config
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'plantillas_masivas' AND pantalla = 'CxP';

  v_rpc := public.tideo_salud_contar_configuracion(
    v_config.tabla_principal,
    v_config.tabla_secundaria,
    v_config.filtro_columna,
    v_config.filtro_operador,
    v_config.filtro_valor,
    'emp_20541435833'
  );
  SELECT count(*) INTO v_manual
  FROM public.cxp
  WHERE empresa_id = 'emp_20541435833'
    AND tipo_comprobante IS DISTINCT FROM 'RHE';
  IF v_rpc <> v_manual THEN
    RAISE EXCEPTION 'Conteo CxP no coincide: RPC %, manual %', v_rpc, v_manual;
  END IF;

  SELECT * INTO v_config
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'plantillas_masivas' AND pantalla = 'RHE';

  v_rpc := public.tideo_salud_contar_configuracion(
    v_config.tabla_principal,
    v_config.tabla_secundaria,
    v_config.filtro_columna,
    v_config.filtro_operador,
    v_config.filtro_valor,
    'emp_20541435833'
  );
  SELECT count(*) INTO v_manual
  FROM public.cxp
  WHERE empresa_id = 'emp_20541435833'
    AND tipo_comprobante = 'RHE';
  IF v_rpc <> v_manual THEN
    RAISE EXCEPTION 'Conteo RHE no coincide: RPC %, manual %', v_rpc, v_manual;
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  (
    SELECT ue.user_id::text
    FROM public.usuarios_empresas ue
    JOIN public.roles r ON r.id = ue.rol_id
    JOIN public.empresas e ON e.id = ue.empresa_id
    WHERE ue.estado = 'activo'
      AND r.es_superadmin = true
      AND e.es_plataforma = true
    LIMIT 1
  ),
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tideo_rpc BIGINT;
  v_tideo_directo BIGINT;
  v_cliente_rpc BIGINT;
  v_cliente_directo BIGINT;
BEGIN
  IF (
    SELECT count(*)
    FROM public.get_salud_implementacion_conteos(ARRAY['emp_20541435833'])
  ) <> (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa AND NULLIF(btrim(tabla_principal), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La RPC superadmin no devolvio una fila por configuracion';
  END IF;

  SELECT count(*) INTO v_tideo_rpc
  FROM public.get_salud_implementacion_usuarios('emp_20541435833')
  WHERE tipo_usuario = 'tideo';

  SELECT count(*) INTO v_tideo_directo
  FROM public.usuarios u
  WHERE public.tideo_salud_usuario_pertenece_tenant(
      u.id,
      'emp_20541435833'
    )
    AND lower(btrim(u.email)) LIKE '%@tideo.tech';

  IF v_tideo_rpc <> v_tideo_directo THEN
    RAISE EXCEPTION
      'Usuarios TIDEO no coinciden con tenant+dominio: RPC %, directo %',
      v_tideo_rpc,
      v_tideo_directo;
  END IF;

  SELECT count(*) INTO v_cliente_rpc
  FROM public.get_salud_implementacion_usuarios('emp_20541435833')
  WHERE tipo_usuario = 'cliente';

  SELECT count(*) INTO v_cliente_directo
  FROM public.usuarios u
  WHERE public.tideo_salud_usuario_pertenece_tenant(
    u.id,
    'emp_20541435833'
  );

  IF v_cliente_rpc <> v_cliente_directo THEN
    RAISE EXCEPTION
      'Usuarios Cliente no coinciden con membresias activas: RPC %, directo %',
      v_cliente_rpc,
      v_cliente_directo;
  END IF;
END;
$$;

DO $$
DECLARE
  v_configuracion_id UUID;
BEGIN
  SELECT id INTO v_configuracion_id
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'plantillas_masivas' AND pantalla = 'Personal Operativo';

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto
  )
  VALUES
    (v_configuracion_id, 'emp_20541435833', 'tideo', 'prueba privada 370'),
    (v_configuracion_id, 'emp_20541435833', 'cliente', 'prueba compartida 370');
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (
    SELECT ue.user_id::text
    FROM public.usuarios_empresas ue
    JOIN public.roles r ON r.id = ue.rol_id
    WHERE ue.empresa_id = 'emp_20541435833'
      AND ue.estado = 'activo'
      AND r.es_admin_empresa = true
      AND NOT r.es_superadmin
    LIMIT 1
  ),
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_configuracion_id UUID;
  v_responsable_tideo TEXT;
  v_responsable_cliente TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM public.get_salud_implementacion_conteos_local('emp_20541435833')
  ) <> (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE activa AND NULLIF(btrim(tabla_principal), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La RPC tenant no devolvio una fila por configuracion';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tideo_salud_comentarios
    WHERE empresa_id = 'emp_20541435833' AND audiencia = 'tideo'
  ) <> 0 THEN
    RAISE EXCEPTION 'Fuga: el tenant puede leer comentarios TIDEO';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tideo_salud_comentarios
    WHERE empresa_id = 'emp_20541435833' AND audiencia = 'cliente'
  ) <> 1 THEN
    RAISE EXCEPTION 'El tenant no puede leer el comentario compartido';
  END IF;

  SELECT id INTO v_configuracion_id
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'plantillas_masivas' AND pantalla = 'Personal Operativo';

  INSERT INTO public.tideo_salud_comentarios (
    configuracion_id,
    empresa_id,
    audiencia,
    texto
  )
  VALUES (
    v_configuracion_id,
    'emp_20541435833',
    'cliente',
    'prueba cliente tenant 370'
  );

  BEGIN
    INSERT INTO public.tideo_salud_comentarios (
      configuracion_id,
      empresa_id,
      audiencia,
      texto
    )
    VALUES (
      v_configuracion_id,
      'emp_20541435833',
      'tideo',
      'esta insercion debe fallar'
    );
    RAISE EXCEPTION 'Fuga: el tenant pudo insertar un comentario TIDEO';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  SELECT user_id INTO v_responsable_tideo
  FROM public.get_salud_implementacion_usuarios('emp_20541435833')
  WHERE tipo_usuario = 'tideo'
  LIMIT 1;

  SELECT user_id INTO v_responsable_cliente
  FROM public.get_salud_implementacion_usuarios('emp_20541435833')
  WHERE tipo_usuario = 'cliente'
  LIMIT 1;

  PERFORM public.guardar_salud_implementacion_responsables(
    v_configuracion_id,
    'emp_20541435833',
    v_responsable_tideo,
    v_responsable_cliente
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.tideo_salud_anotaciones
    WHERE configuracion_id = v_configuracion_id
      AND empresa_id = 'emp_20541435833'
      AND responsable_tideo IS NOT DISTINCT FROM v_responsable_tideo
      AND responsable_cliente = v_responsable_cliente
  ) THEN
    RAISE EXCEPTION 'Los responsables no persistieron';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'OK: migracion 370, conteos, usuarios, RLS y guardado validados' AS resultado;
