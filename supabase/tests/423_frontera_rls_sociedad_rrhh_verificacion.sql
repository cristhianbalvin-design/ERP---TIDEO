-- Ejecutar contra produccion sin aplicar la 423: replica sus ALTER POLICY
-- dentro de una unica transaccion y revierte fixtures, alcances y politicas.
SET ROLE postgres;
BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE
  public.amonestaciones_personal,
  public.portal_constancias_trabajo,
  public.solicitudes_rrhh,
  public.usuarios_asignaciones
IN SHARE ROW EXCLUSIVE MODE;

-- Preflight identico al de la migracion 423.
DO $preflight$
DECLARE
  v_tabla text;
  v_esperadas integer;
  v_encontradas integer;
BEGIN
  FOR v_tabla, v_esperadas IN
    SELECT tabla, esperadas
    FROM (VALUES
      ('amonestaciones_personal', 2),
      ('portal_constancias_trabajo', 3),
      ('solicitudes_rrhh', 5)
    ) AS esperadas_politicas(tabla, esperadas)
  LOOP
    SELECT count(*) INTO v_encontradas
    FROM pg_policy p
    WHERE p.polrelid = format('public.%I', v_tabla)::regclass;
    IF v_encontradas <> v_esperadas THEN
      RAISE EXCEPTION '423_TEST_PREFLIGHT: public.% debe tener % politicas y tiene %.', v_tabla, v_esperadas, v_encontradas;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('amonestaciones_personal', 'portal_constancias_trabajo', 'solicitudes_rrhh')
      AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '423_TEST_PREFLIGHT: RLS debe estar habilitado en las tres tablas.';
  END IF;
END
$preflight$;

CREATE TEMP TABLE conteo_inicial_423 (
  fuente text PRIMARY KEY,
  filas bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO conteo_inicial_423 (fuente, filas)
SELECT 'amonestaciones', count(*) FROM public.amonestaciones_personal
UNION ALL SELECT 'constancias', count(*) FROM public.portal_constancias_trabajo
UNION ALL SELECT 'solicitudes', count(*) FROM public.solicitudes_rrhh;

-- Misma frontera administrativa de 423. Las ramas de autoservicio se
-- conservan literalmente para constancias y las dos politicas self ajenas
-- a estos ALTER POLICY no se tocan.
ALTER POLICY amonestaciones_personal_isolation
ON public.amonestaciones_personal
USING (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
)
WITH CHECK (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
);

ALTER POLICY portal_constancias_select
ON public.portal_constancias_trabajo
USING (
  es_mi_personal_rrhh(empresa_id, personal_id)
  OR (
    usuario_tiene_empresa(empresa_id)
    AND EXISTS (
      SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
      WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
    )
  )
);

ALTER POLICY portal_constancias_insert
ON public.portal_constancias_trabajo
WITH CHECK (
  es_mi_personal_rrhh(empresa_id, personal_id)
  OR (
    usuario_tiene_empresa(empresa_id)
    AND EXISTS (
      SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
      WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
    )
  )
);

ALTER POLICY portal_constancias_update
ON public.portal_constancias_trabajo
USING (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
)
WITH CHECK (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
);

ALTER POLICY sol_rrhh_insert
ON public.solicitudes_rrhh
WITH CHECK (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
);

ALTER POLICY sol_rrhh_select
ON public.solicitudes_rrhh
USING (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
);

ALTER POLICY sol_rrhh_update
ON public.solicitudes_rrhh
USING (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
)
WITH CHECK (
  usuario_tiene_empresa(empresa_id)
  AND EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(empresa_id) AS alcance) alcance_usuario
    WHERE alcance_usuario.alcance IS NULL OR sociedad_id = ANY(alcance_usuario.alcance)
  )
);

-- Verificacion identica a la de la migracion: no quedan politicas que
-- concedan administracion sin el predicado societario.
DO $verificar$
DECLARE
  v_total integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM pg_policy p
  WHERE p.polrelid IN (
    'public.amonestaciones_personal'::regclass,
    'public.portal_constancias_trabajo'::regclass,
    'public.solicitudes_rrhh'::regclass
  )
    AND p.polname NOT IN (
      'amonestaciones_personal_self_select',
      'solicitudes_rrhh_self_select',
      'sol_rrhh_delete'
    )
    AND (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%usuario_alcance_sociedades%'
      AND coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') NOT LIKE '%usuario_alcance_sociedades%'
    );
  IF v_total <> 0 THEN
    RAISE EXCEPTION '423_TEST_VERIFICACION: quedaron % politicas administrativas sin frontera societaria.', v_total;
  END IF;
END
$verificar$;

CREATE TEMP TABLE resultado_423 (
  caso text PRIMARY KEY,
  resultado text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE contexto_423 (
  empresa_id text NOT NULL,
  sociedad_propia uuid NOT NULL,
  sociedad_ajena uuid NOT NULL,
  usuario_admin uuid NOT NULL,
  usuario_autoservicio uuid NOT NULL,
  personal_id text NOT NULL,
  personal_tipo text NOT NULL,
  rol_id text NOT NULL,
  asignacion_admin uuid NOT NULL,
  asignacion_autoservicio uuid NOT NULL,
  historicos_amonestaciones integer NOT NULL,
  historicos_constancias integer NOT NULL,
  historicos_solicitudes integer NOT NULL,
  historicos_autoservicio_constancias integer NOT NULL,
  historicos_autoservicio_solicitudes integer NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON resultado_423, contexto_423 TO authenticated;

INSERT INTO resultado_423
SELECT 'conteo_sin_dml_' || ci.fuente,
       CASE WHEN ci.filas = actual.filas
            THEN format('ACEPTADO: antes=%s, despues=%s', ci.filas, actual.filas)
            ELSE format('FALLO: antes=%s, despues=%s', ci.filas, actual.filas)
       END
FROM conteo_inicial_423 ci
JOIN LATERAL (
  SELECT CASE ci.fuente
    WHEN 'amonestaciones' THEN (SELECT count(*) FROM public.amonestaciones_personal)
    WHEN 'constancias' THEN (SELECT count(*) FROM public.portal_constancias_trabajo)
    WHEN 'solicitudes' THEN (SELECT count(*) FROM public.solicitudes_rrhh)
  END AS filas
) actual ON true;

DO $fixtures$
DECLARE
  v_empresa text;
  v_sociedad_propia uuid;
  v_sociedad_ajena uuid;
  v_usuario_admin uuid;
  v_usuario_autoservicio uuid;
  v_personal_id text;
  v_personal_tipo text;
  v_rol_id text;
  v_asignacion_admin uuid;
  v_asignacion_autoservicio uuid;
  v_historicos_amonestaciones integer;
  v_historicos_constancias integer;
  v_historicos_solicitudes integer;
  v_historicos_autoservicio_constancias integer;
  v_historicos_autoservicio_solicitudes integer;
BEGIN
  SELECT e.id, s1.id, s2.id, ue.user_id, p.auth_user_id, p.id, p.tipo, ue.rol_id,
         (SELECT count(*) FROM public.amonestaciones_personal a WHERE a.empresa_id = e.id AND a.sociedad_id IS NULL),
         (SELECT count(*) FROM public.portal_constancias_trabajo ct WHERE ct.empresa_id = e.id AND ct.sociedad_id IS NULL),
         (SELECT count(*) FROM public.solicitudes_rrhh sr WHERE sr.empresa_id = e.id AND sr.sociedad_id IS NULL),
         (SELECT count(*) FROM public.portal_constancias_trabajo ct WHERE ct.empresa_id = e.id AND ct.personal_id = p.id AND ct.sociedad_id IS NULL),
         (SELECT count(*) FROM public.solicitudes_rrhh sr WHERE sr.empresa_id = e.id AND sr.personal_id = p.id AND sr.sociedad_id IS NULL)
    INTO v_empresa, v_sociedad_propia, v_sociedad_ajena, v_usuario_admin,
         v_usuario_autoservicio, v_personal_id, v_personal_tipo, v_rol_id,
         v_historicos_amonestaciones, v_historicos_constancias, v_historicos_solicitudes,
         v_historicos_autoservicio_constancias, v_historicos_autoservicio_solicitudes
  FROM public.empresas e
  JOIN LATERAL (
    SELECT s.id FROM public.sociedades s
    WHERE s.empresa_id = e.id
    ORDER BY s.id LIMIT 1
  ) s1 ON true
  JOIN LATERAL (
    SELECT s.id FROM public.sociedades s
    WHERE s.empresa_id = e.id AND s.id <> s1.id
    ORDER BY s.id LIMIT 1
  ) s2 ON true
  JOIN public.usuarios_empresas ue ON ue.empresa_id = e.id AND ue.estado = 'activo'
  JOIN LATERAL (
    SELECT po.auth_user_id, po.id, 'operativo'::text AS tipo
    FROM public.personal_operativo po
    WHERE po.empresa_id = e.id
      AND po.auth_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.portal_constancias_trabajo ct
        WHERE ct.empresa_id = po.empresa_id AND ct.personal_id = po.id AND ct.sociedad_id IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM public.solicitudes_rrhh sr
        WHERE sr.empresa_id = po.empresa_id AND sr.personal_id = po.id AND sr.sociedad_id IS NULL
      )
    UNION ALL
    SELECT pa.auth_user_id, pa.id, 'administrativo'::text AS tipo
    FROM public.personal_administrativo pa
    WHERE pa.empresa_id = e.id
      AND pa.auth_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.portal_constancias_trabajo ct
        WHERE ct.empresa_id = pa.empresa_id AND ct.personal_id = pa.id AND ct.sociedad_id IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM public.solicitudes_rrhh sr
        WHERE sr.empresa_id = pa.empresa_id AND sr.personal_id = pa.id AND sr.sociedad_id IS NULL
      )
    LIMIT 1
  ) p ON p.auth_user_id <> ue.user_id
  WHERE e.multisociedad_habilitado
    AND EXISTS (SELECT 1 FROM public.portal_constancias_trabajo ct WHERE ct.empresa_id = e.id AND ct.sociedad_id IS NULL)
    AND EXISTS (SELECT 1 FROM public.solicitudes_rrhh sr WHERE sr.empresa_id = e.id AND sr.sociedad_id IS NULL)
  LIMIT 1;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '423_TEST: faltan fixtures reales anonimizables (tenant multissociedad, dos sociedades, administrador y trabajador con auth).';
  END IF;

  -- Se neutralizan solo dentro de la transaccion los alcances existentes para
  -- que cada caso pruebe exactamente el alcance declarado.
  UPDATE public.usuarios_asignaciones
     SET activo = false
   WHERE empresa_id = v_empresa
     AND user_id IN (v_usuario_admin, v_usuario_autoservicio);

  INSERT INTO public.usuarios_asignaciones (
    empresa_id, user_id, rol_id, alcance_tipo, alcance_id, sociedades_ids, activo
  ) VALUES (
    v_empresa, v_usuario_admin, v_rol_id, 'sociedad', 'V423TEST', ARRAY[v_sociedad_propia], true
  ) RETURNING id INTO v_asignacion_admin;

  INSERT INTO public.usuarios_asignaciones (
    empresa_id, user_id, rol_id, alcance_tipo, alcance_id, sociedades_ids, activo
  ) VALUES (
    v_empresa, v_usuario_autoservicio, v_rol_id, 'sociedad', 'V423TEST', ARRAY[v_sociedad_propia], true
  ) RETURNING id INTO v_asignacion_autoservicio;

  INSERT INTO contexto_423 VALUES (
    v_empresa, v_sociedad_propia, v_sociedad_ajena, v_usuario_admin,
    v_usuario_autoservicio, v_personal_id, v_personal_tipo, v_rol_id,
    v_asignacion_admin, v_asignacion_autoservicio,
    v_historicos_amonestaciones, v_historicos_constancias, v_historicos_solicitudes,
    v_historicos_autoservicio_constancias, v_historicos_autoservicio_solicitudes
  );

  INSERT INTO public.amonestaciones_personal (
    id, empresa_id, sociedad_id, personal_id, personal_tipo, personal_nombre,
    tipo, motivo, fecha, registrado_por
  ) VALUES
    ('V423TEST-AMON-PROPIA', v_empresa, v_sociedad_propia, v_personal_id, v_personal_tipo, 'Verificacion 423', 'verbal', 'V423TEST-PROPIA', current_date, 'Verificacion 423'),
    ('V423TEST-AMON-AJENA',  v_empresa, v_sociedad_ajena,  v_personal_id, v_personal_tipo, 'Verificacion 423', 'verbal', 'V423TEST-AJENA', current_date, 'Verificacion 423');

  INSERT INTO public.portal_constancias_trabajo (
    id, empresa_id, sociedad_id, personal_id, personal_tipo, proposito
  ) VALUES
    ('V423TEST-CONST-PROPIA', v_empresa, v_sociedad_propia, v_personal_id, v_personal_tipo, 'V423TEST-PROPIA'),
    ('V423TEST-CONST-AJENA',  v_empresa, v_sociedad_ajena,  v_personal_id, v_personal_tipo, 'V423TEST-AJENA');

  INSERT INTO public.solicitudes_rrhh (
    empresa_id, sociedad_id, personal_id, personal_nombre, personal_tipo,
    tipo, fecha_inicio, fecha_fin, motivo
  ) VALUES
    (v_empresa, v_sociedad_propia, v_personal_id, 'Verificacion 423', v_personal_tipo, 'permiso_con_goce', current_date, current_date, 'V423TEST-PROPIA'),
    (v_empresa, v_sociedad_ajena,  v_personal_id, 'Verificacion 423', v_personal_tipo, 'permiso_con_goce', current_date, current_date, 'V423TEST-AJENA');

END
$fixtures$;

-- Administrativo con una sola sociedad: ve solo su sociedad y ni la ajena
-- ni el historico sin sociedad en las tres tablas.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', usuario_admin::text, true) FROM contexto_423;
INSERT INTO resultado_423
SELECT 'administrativo_restringido_' || fuente,
       CASE WHEN propia = 1 AND ajena = 0 AND historico = 0 THEN 'ACEPTADO: propia=1, ajena=0, historico=0'
            ELSE format('FALLO: propia=%s, ajena=%s, historico=%s', propia, ajena, historico) END
FROM (
  SELECT 'amonestaciones' AS fuente,
    count(*) FILTER (WHERE motivo = 'V423TEST-PROPIA') AS propia,
    count(*) FILTER (WHERE motivo = 'V423TEST-AJENA') AS ajena,
    count(*) FILTER (WHERE sociedad_id IS NULL) AS historico
  FROM public.amonestaciones_personal a CROSS JOIN contexto_423 c
  WHERE a.empresa_id = c.empresa_id
  UNION ALL
  SELECT 'constancias',
    count(*) FILTER (WHERE proposito = 'V423TEST-PROPIA'),
    count(*) FILTER (WHERE proposito = 'V423TEST-AJENA'),
    count(*) FILTER (WHERE sociedad_id IS NULL)
  FROM public.portal_constancias_trabajo ct CROSS JOIN contexto_423 c
  WHERE ct.empresa_id = c.empresa_id
  UNION ALL
  SELECT 'solicitudes',
    count(*) FILTER (WHERE motivo = 'V423TEST-PROPIA'),
    count(*) FILTER (WHERE motivo = 'V423TEST-AJENA'),
    count(*) FILTER (WHERE sociedad_id IS NULL)
  FROM public.solicitudes_rrhh sr CROSS JOIN contexto_423 c
  WHERE sr.empresa_id = c.empresa_id
) conteos;
RESET ROLE;

-- Autoservicio: aun con alcance reducido, mantiene sus tres registros,
-- incluido el historico sin sociedad, por su pertenencia personal.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', usuario_autoservicio::text, true) FROM contexto_423;
INSERT INTO resultado_423
SELECT 'autoservicio_' || fuente,
       CASE WHEN pruebas = 2 AND historico = esperados_historicos THEN format('ACEPTADO: pruebas=%s, historico=%s', pruebas, historico)
            ELSE format('FALLO: pruebas=%s, historico=%s', pruebas, historico) END
FROM (
  SELECT 'amonestaciones' AS fuente,
         count(*) FILTER (WHERE motivo LIKE 'V423TEST-%') AS pruebas,
         count(*) FILTER (WHERE a.sociedad_id IS NULL AND a.personal_id = c.personal_id) AS historico,
         2 AS esperados, 0 AS esperados_historicos
  FROM public.amonestaciones_personal a CROSS JOIN contexto_423 c
  WHERE a.empresa_id = c.empresa_id
  GROUP BY c.personal_id
  UNION ALL
  SELECT 'constancias',
         count(*) FILTER (WHERE proposito LIKE 'V423TEST-%'),
         count(*) FILTER (WHERE ct.sociedad_id IS NULL AND ct.personal_id = c.personal_id),
         2 + c.historicos_autoservicio_constancias, c.historicos_autoservicio_constancias
  FROM public.portal_constancias_trabajo ct CROSS JOIN contexto_423 c
  WHERE ct.empresa_id = c.empresa_id
  GROUP BY c.personal_id, c.historicos_autoservicio_constancias
  UNION ALL
  SELECT 'solicitudes',
         count(*) FILTER (WHERE motivo LIKE 'V423TEST-%'),
         count(*) FILTER (WHERE sr.sociedad_id IS NULL AND sr.personal_id = c.personal_id),
         2 + c.historicos_autoservicio_solicitudes, c.historicos_autoservicio_solicitudes
  FROM public.solicitudes_rrhh sr CROSS JOIN contexto_423 c
  WHERE sr.empresa_id = c.empresa_id
  GROUP BY c.personal_id, c.historicos_autoservicio_solicitudes
) conteos;
RESET ROLE;

-- El mismo administrador pasa a alcance global dentro de la transaccion:
-- debe ver las tres filas por fuente, incluida la historica sin sociedad.
UPDATE public.usuarios_asignaciones ua
SET alcance_tipo = 'grupo', sociedades_ids = NULL
FROM contexto_423 c
WHERE ua.id = c.asignacion_admin;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', usuario_admin::text, true) FROM contexto_423;
INSERT INTO resultado_423
SELECT 'administrativo_global_' || fuente,
       CASE WHEN total = 2 AND historico = esperados_historicos THEN format('ACEPTADO: total=%s, historico=%s', total, historico)
            ELSE format('FALLO: total=%s, historico=%s', total, historico) END
FROM (
  SELECT 'amonestaciones' AS fuente, count(*) FILTER (WHERE motivo LIKE 'V423TEST-%') AS total,
         count(*) FILTER (WHERE sociedad_id IS NULL) AS historico, c.historicos_amonestaciones AS esperados_historicos
  FROM public.amonestaciones_personal a CROSS JOIN contexto_423 c WHERE a.empresa_id = c.empresa_id GROUP BY c.historicos_amonestaciones
  UNION ALL
  SELECT 'constancias', count(*) FILTER (WHERE proposito LIKE 'V423TEST-%'), count(*) FILTER (WHERE sociedad_id IS NULL), c.historicos_constancias
  FROM public.portal_constancias_trabajo ct CROSS JOIN contexto_423 c WHERE ct.empresa_id = c.empresa_id GROUP BY c.historicos_constancias
  UNION ALL
  SELECT 'solicitudes', count(*) FILTER (WHERE motivo LIKE 'V423TEST-%'), count(*) FILTER (WHERE sociedad_id IS NULL), c.historicos_solicitudes
  FROM public.solicitudes_rrhh sr CROSS JOIN contexto_423 c WHERE sr.empresa_id = c.empresa_id GROUP BY c.historicos_solicitudes
) conteos;
RESET ROLE;

-- Regresa a una sola sociedad para comprobar INSERT y UPDATE administrativos.
UPDATE public.usuarios_asignaciones ua
SET alcance_tipo = 'sociedad', sociedades_ids = ARRAY[c.sociedad_propia]
FROM contexto_423 c
WHERE ua.id = c.asignacion_admin;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', usuario_admin::text, true) FROM contexto_423;

DO $escrituras$
DECLARE
  c contexto_423%ROWTYPE;
  v_filas integer;
BEGIN
  SELECT * INTO c FROM contexto_423;

  BEGIN
    INSERT INTO public.amonestaciones_personal (id, empresa_id, sociedad_id, personal_id, personal_tipo, personal_nombre, tipo, motivo, fecha, registrado_por)
    VALUES ('V423TEST-RECHAZO-AMON', c.empresa_id, c.sociedad_ajena, c.personal_id, c.personal_tipo, 'Verificacion 423', 'verbal', 'V423TEST-RECHAZO', current_date, 'Verificacion 423');
    INSERT INTO resultado_423 VALUES ('escritura_insert_amonestaciones_ajena', 'FALLO: INSERT permitido');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO resultado_423 VALUES ('escritura_insert_amonestaciones_ajena', 'ACEPTADO: INSERT rechazado por RLS');
  END;

  BEGIN
    INSERT INTO public.portal_constancias_trabajo (id, empresa_id, sociedad_id, personal_id, personal_tipo, proposito)
    VALUES ('V423TEST-RECHAZO-CONST', c.empresa_id, c.sociedad_ajena, c.personal_id, c.personal_tipo, 'V423TEST-RECHAZO');
    INSERT INTO resultado_423 VALUES ('escritura_insert_constancias_ajena', 'FALLO: INSERT permitido');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO resultado_423 VALUES ('escritura_insert_constancias_ajena', 'ACEPTADO: INSERT rechazado por RLS');
  END;

  BEGIN
    INSERT INTO public.solicitudes_rrhh (empresa_id, sociedad_id, personal_id, personal_nombre, personal_tipo, tipo, fecha_inicio, fecha_fin, motivo)
    VALUES (c.empresa_id, c.sociedad_ajena, c.personal_id, 'Verificacion 423', c.personal_tipo, 'permiso_con_goce', current_date, current_date, 'V423TEST-RECHAZO');
    INSERT INTO resultado_423 VALUES ('escritura_insert_solicitudes_ajena', 'FALLO: INSERT permitido');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO resultado_423 VALUES ('escritura_insert_solicitudes_ajena', 'ACEPTADO: INSERT rechazado por RLS');
  END;

  UPDATE public.amonestaciones_personal SET descripcion = 'V423TEST-UPDATE' WHERE id = 'V423TEST-AMON-AJENA';
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  INSERT INTO resultado_423 VALUES ('escritura_update_amonestaciones_ajena', CASE WHEN v_filas = 0 THEN 'ACEPTADO: UPDATE afecto 0 filas por RLS' ELSE 'FALLO: UPDATE afecto ' || v_filas || ' fila(s)' END);

  UPDATE public.portal_constancias_trabajo SET proposito = 'V423TEST-UPDATE' WHERE id = 'V423TEST-CONST-AJENA';
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  INSERT INTO resultado_423 VALUES ('escritura_update_constancias_ajena', CASE WHEN v_filas = 0 THEN 'ACEPTADO: UPDATE afecto 0 filas por RLS' ELSE 'FALLO: UPDATE afecto ' || v_filas || ' fila(s)' END);

  UPDATE public.solicitudes_rrhh SET motivo = 'V423TEST-UPDATE' WHERE motivo = 'V423TEST-AJENA';
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  INSERT INTO resultado_423 VALUES ('escritura_update_solicitudes_ajena', CASE WHEN v_filas = 0 THEN 'ACEPTADO: UPDATE afecto 0 filas por RLS' ELSE 'FALLO: UPDATE afecto ' || v_filas || ' fila(s)' END);
END
$escrituras$;
RESET ROLE;

SELECT jsonb_object_agg(caso, resultado ORDER BY caso)
       || jsonb_build_object('transaccion', 'ROLLBACK ejecutado al finalizar este script') AS resultado_423
FROM resultado_423;

ROLLBACK;
