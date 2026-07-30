-- Salud de Implementacion - Correccion #3
-- Pestañas, fuentes de conteo compuestas/filtradas, responsables reales y bitacora.

-- ---------------------------------------------------------------------------
-- 1. Configuracion de las dos pestañas
-- ---------------------------------------------------------------------------

ALTER TABLE public.tideo_salud_configuracion
  ADD COLUMN IF NOT EXISTS pestana TEXT NOT NULL DEFAULT 'pantallas',
  ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tabla_secundaria TEXT,
  ADD COLUMN IF NOT EXISTS filtro_columna TEXT,
  ADD COLUMN IF NOT EXISTS filtro_operador TEXT,
  ADD COLUMN IF NOT EXISTS filtro_valor TEXT;

ALTER TABLE public.tideo_salud_configuracion
  DROP CONSTRAINT IF EXISTS tideo_salud_configuracion_pestana_check,
  ADD CONSTRAINT tideo_salud_configuracion_pestana_check
    CHECK (pestana IN ('pantallas', 'plantillas_masivas'));

ALTER TABLE public.tideo_salud_configuracion
  DROP CONSTRAINT IF EXISTS tideo_salud_configuracion_filtro_operador_check,
  ADD CONSTRAINT tideo_salud_configuracion_filtro_operador_check
    CHECK (filtro_operador IS NULL OR filtro_operador IN ('igual', 'distinto'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_tideo_salud_configuracion_fila
  ON public.tideo_salud_configuracion (pestana, seccion, pantalla, tipo);

INSERT INTO public.tideo_salud_configuracion (
  pestana,
  seccion,
  pantalla,
  tipo,
  tabla_principal,
  tabla_secundaria,
  filtro_columna,
  filtro_operador,
  filtro_valor,
  evidencia,
  orden
)
VALUES
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'Personal Operativo', 'Plantilla Masiva', 'personal_operativo', NULL, NULL, NULL, NULL, 'rrhhService.js', 1),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'Personal Administrativo', 'Plantilla Masiva', 'personal_administrativo', NULL, NULL, NULL, NULL, 'rrhhService.js', 2),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'CECO/CEBE', 'Plantilla Masiva', 'centros_costo', 'centros_beneficio', NULL, NULL, NULL, 'maestrosService.js: centros_costo + centros_beneficio', 3),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'Materiales', 'Plantilla Masiva', 'materiales', NULL, NULL, NULL, NULL, 'inventarioService.js', 4),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'Proveedores', 'Plantilla Masiva', 'proveedores', NULL, NULL, NULL, NULL, 'comprasService.js', 5),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'CxC', 'Plantilla Masiva', 'facturas', NULL, NULL, NULL, NULL, 'cxcMassiveImportService.js / importar_cxc_masiva_fila', 6),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'CxP', 'Plantilla Masiva', 'cxp', NULL, 'tipo_comprobante', 'distinto', 'RHE', 'cxpMassiveImportService.js / importar_cxp_masiva_fila', 7),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'RHE', 'Plantilla Masiva', 'cxp', NULL, 'tipo_comprobante', 'igual', 'RHE', 'cxpMassiveImportService.js / importar_cxp_masiva_fila', 8),
  ('plantillas_masivas', 'Plantillas de Carga Masiva', 'Postulación Pública', 'Plantilla Masiva', 'rrhh_candidaturas', NULL, NULL, NULL, NULL, 'registrar_postulacion_publica / migracion 363', 9),
  ('plantillas_masivas', 'Maestros Base', 'Industrias', 'Maestro Individual', 'industrias', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 101),
  ('plantillas_masivas', 'Maestros Base', 'Sedes y Ubicaciones GPS', 'Maestro Individual', 'sedes', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 102),
  ('plantillas_masivas', 'Maestros Base', 'Centros de Costo y Beneficio', 'Maestro Individual', 'centros_costo', 'centros_beneficio', NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 103),
  ('plantillas_masivas', 'Maestros Base', 'Unidades Organizacionales', 'Maestro Individual', 'unidades_organizacionales', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 104),
  ('plantillas_masivas', 'Maestros Base', 'Cargos de la Empresa', 'Maestro Individual', 'cargos_empresa', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 105),
  ('plantillas_masivas', 'Maestros Base', 'Tipos de Documento', 'Maestro Individual', 'tipos_documento_empresa', NULL, NULL, NULL, NULL, 'pages_admin.jsx / migracion 206', 106),
  ('plantillas_masivas', 'Maestros Base', 'Requisitos por Cargo', 'Maestro Individual', 'cargo_documento_requisito', NULL, NULL, NULL, NULL, 'pages_admin.jsx / migracion 206', 107),
  ('plantillas_masivas', 'Maestros Base', 'Especialidades Técnicas', 'Maestro Individual', 'especialidades_tecnicas', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 108),
  ('plantillas_masivas', 'Maestros Base', 'Niveles Jerárquicos', 'Maestro Individual', 'niveles_jerarquicos', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 109),
  ('plantillas_masivas', 'Maestros Base', 'Materiales e Insumos', 'Maestro Individual', 'materiales', NULL, NULL, NULL, NULL, 'pages_admin.jsx / inventarioService.js', 110),
  ('plantillas_masivas', 'Maestros Base', 'Monedas/Impuestos/Unidades', 'Maestro Individual', 'monedas_impuestos_unidades', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 111),
  ('plantillas_masivas', 'Maestros Base', 'Tipos de Servicio Interno', 'Maestro Individual', 'tipos_servicio_interno', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 112),
  ('plantillas_masivas', 'Maestros Base', 'Almacenes y Depósitos', 'Maestro Individual', 'almacenes', NULL, NULL, NULL, NULL, 'pages_admin.jsx / inventarioService.js', 113),
  ('plantillas_masivas', 'Maestros Base', 'Tipos de Contrato', 'Maestro Individual', 'tipos_contrato', NULL, NULL, NULL, NULL, 'pages_admin.jsx / maestrosService.js', 114)
ON CONFLICT (pestana, seccion, pantalla, tipo)
DO UPDATE SET
  tabla_principal = EXCLUDED.tabla_principal,
  tabla_secundaria = EXCLUDED.tabla_secundaria,
  filtro_columna = EXCLUDED.filtro_columna,
  filtro_operador = EXCLUDED.filtro_operador,
  filtro_valor = EXCLUDED.filtro_valor,
  evidencia = EXCLUDED.evidencia,
  orden = EXCLUDED.orden,
  activa = true;

-- ---------------------------------------------------------------------------
-- 2. Conteo seguro de una fuente simple, compuesta o filtrada
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tideo_salud_contar_configuracion(
  p_tabla_principal TEXT,
  p_tabla_secundaria TEXT,
  p_filtro_columna TEXT,
  p_filtro_operador TEXT,
  p_filtro_valor TEXT,
  p_tenant_id TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT := 0;
  v_parcial BIGINT := 0;
  v_sql TEXT;
BEGIN
  IF p_filtro_columna IS NULL OR p_filtro_operador IS NULL THEN
    v_sql := format(
      'SELECT count(*) FROM public.%I WHERE empresa_id = %L',
      p_tabla_principal,
      p_tenant_id
    );
  ELSIF p_filtro_operador = 'igual' THEN
    v_sql := format(
      'SELECT count(*) FROM public.%I WHERE empresa_id = %L AND %I = %L',
      p_tabla_principal,
      p_tenant_id,
      p_filtro_columna,
      p_filtro_valor
    );
  ELSIF p_filtro_operador = 'distinto' THEN
    v_sql := format(
      'SELECT count(*) FROM public.%I WHERE empresa_id = %L AND %I IS DISTINCT FROM %L',
      p_tabla_principal,
      p_tenant_id,
      p_filtro_columna,
      p_filtro_valor
    );
  ELSE
    RAISE EXCEPTION 'Operador de conteo no soportado: %', p_filtro_operador;
  END IF;

  EXECUTE v_sql INTO v_total;

  IF NULLIF(btrim(p_tabla_secundaria), '') IS NOT NULL THEN
    v_sql := format(
      'SELECT count(*) FROM public.%I WHERE empresa_id = %L',
      p_tabla_secundaria,
      p_tenant_id
    );
    EXECUTE v_sql INTO v_parcial;
    v_total := v_total + v_parcial;
  END IF;

  RETURN COALESCE(v_total, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.tideo_salud_contar_configuracion(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos()
RETURNS TABLE (
  configuracion_id UUID,
  tenant_id TEXT,
  conteo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_tenant RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.usuarios u ON u.rol = r.id
    WHERE u.id = auth.uid()::text
      AND r.es_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmin TIDEO puede consultar la matriz general';
  END IF;

  FOR v_tenant IN (
    SELECT e.id
    FROM public.empresas e
    WHERE e.es_plataforma = false
      AND e.estado = 'activa'
      AND e.id <> 'emp_2000000000'
  )
  LOOP
    FOR v_config IN (
      SELECT id, tabla_principal, tabla_secundaria, filtro_columna, filtro_operador, filtro_valor
      FROM public.tideo_salud_configuracion
      WHERE activa = true
        AND NULLIF(btrim(tabla_principal), '') IS NOT NULL
    )
    LOOP
      BEGIN
        configuracion_id := v_config.id;
        tenant_id := v_tenant.id;
        conteo := public.tideo_salud_contar_configuracion(
          v_config.tabla_principal,
          v_config.tabla_secundaria,
          v_config.filtro_columna,
          v_config.filtro_operador,
          v_config.filtro_valor,
          v_tenant.id
        );
        RETURN NEXT;
      EXCEPTION WHEN OTHERS THEN
        configuracion_id := v_config.id;
        tenant_id := v_tenant.id;
        conteo := 0;
        RETURN NEXT;
      END;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos(p_tenant_ids TEXT[])
RETURNS TABLE (
  configuracion_id UUID,
  tenant_id TEXT,
  conteo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_tenant_id TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.usuarios u ON u.rol = r.id
    WHERE u.id = auth.uid()::text
      AND r.es_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmin TIDEO puede consultar la salud de implementacion';
  END IF;

  FOR v_config IN (
    SELECT id, tabla_principal, tabla_secundaria, filtro_columna, filtro_operador, filtro_valor
    FROM public.tideo_salud_configuracion
    WHERE activa = true
      AND NULLIF(btrim(tabla_principal), '') IS NOT NULL
  )
  LOOP
    FOREACH v_tenant_id IN ARRAY p_tenant_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.empresas e
        WHERE e.id = v_tenant_id
          AND e.es_plataforma = false
          AND e.estado = 'activa'
          AND e.id <> 'emp_2000000000'
      ) THEN
        CONTINUE;
      END IF;

      BEGIN
        configuracion_id := v_config.id;
        tenant_id := v_tenant_id;
        conteo := public.tideo_salud_contar_configuracion(
          v_config.tabla_principal,
          v_config.tabla_secundaria,
          v_config.filtro_columna,
          v_config.filtro_operador,
          v_config.filtro_valor,
          v_tenant_id
        );
        RETURN NEXT;
      EXCEPTION WHEN OTHERS THEN
        configuracion_id := v_config.id;
        tenant_id := v_tenant_id;
        conteo := 0;
        RETURN NEXT;
      END;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos_local(p_tenant_id TEXT)
RETURNS TABLE (
  configuracion_id UUID,
  tenant_id TEXT,
  conteo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
BEGIN
  IF NOT public.usuario_es_admin_empresa(p_tenant_id) THEN
    RAISE EXCEPTION 'Acceso denegado: solo admin de la empresa puede consultar sus metricas';
  END IF;

  FOR v_config IN (
    SELECT id, tabla_principal, tabla_secundaria, filtro_columna, filtro_operador, filtro_valor
    FROM public.tideo_salud_configuracion
    WHERE activa = true
      AND NULLIF(btrim(tabla_principal), '') IS NOT NULL
  )
  LOOP
    BEGIN
      configuracion_id := v_config.id;
      tenant_id := p_tenant_id;
      conteo := public.tideo_salud_contar_configuracion(
        v_config.tabla_principal,
        v_config.tabla_secundaria,
        v_config.filtro_columna,
        v_config.filtro_operador,
        v_config.filtro_valor,
        p_tenant_id
      );
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      configuracion_id := v_config.id;
      tenant_id := p_tenant_id;
      conteo := 0;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Usuarios elegibles y responsables referenciados
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tideo_salud_usuario_pertenece_tenant(
  p_usuario_id TEXT,
  p_tenant_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.posiciones_usuarios pu ON pu.user_id::text = u.id
    JOIN public.posiciones p ON p.id = pu.posicion_id
    JOIN public.usuarios_empresas ue
      ON ue.user_id = pu.user_id
     AND ue.empresa_id = p_tenant_id
     AND ue.estado = 'activo'
    WHERE u.id = p_usuario_id
      AND lower(u.estado) = 'activo'
      AND p.empresa_id = p_tenant_id
      AND p.activa = true
      AND (pu.fecha_fin IS NULL OR pu.fecha_fin >= current_date)
  );
$$;

REVOKE ALL ON FUNCTION public.tideo_salud_usuario_pertenece_tenant(TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_salud_implementacion_usuarios(p_tenant_id TEXT)
RETURNS TABLE (
  user_id TEXT,
  nombre TEXT,
  email TEXT,
  tipo_usuario TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.user_id, q.nombre, q.email, q.tipo_usuario
  FROM (
    SELECT DISTINCT
      u.id AS user_id,
      COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id) AS nombre,
      u.email,
      'tideo'::TEXT AS tipo_usuario
    FROM public.usuarios u
    WHERE public.tideo_salud_usuario_pertenece_tenant(u.id, 'emp_20609996464')

    UNION ALL

    SELECT DISTINCT
      u.id AS user_id,
      COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id) AS nombre,
      u.email,
      'cliente'::TEXT AS tipo_usuario
    FROM public.usuarios u
    WHERE public.tideo_salud_usuario_pertenece_tenant(u.id, p_tenant_id)
  ) q
  WHERE public.usuario_es_admin_empresa(p_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_tenant_id
        AND e.es_plataforma = false
        AND e.estado = 'activa'
        AND e.id <> 'emp_2000000000'
    )
  ORDER BY q.tipo_usuario, q.nombre, q.email;
$$;

REVOKE ALL ON FUNCTION public.get_salud_implementacion_usuarios(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_salud_implementacion_usuarios(TEXT) TO authenticated;

ALTER TABLE public.tideo_salud_anotaciones
  ADD COLUMN IF NOT EXISTS responsable_tideo_legacy TEXT,
  ADD COLUMN IF NOT EXISTS responsable_cliente_legacy TEXT;

UPDATE public.tideo_salud_anotaciones
SET
  responsable_tideo_legacy = COALESCE(responsable_tideo_legacy, responsable_tideo),
  responsable_cliente_legacy = COALESCE(responsable_cliente_legacy, responsable_cliente)
WHERE responsable_tideo IS NOT NULL
   OR responsable_cliente IS NOT NULL;

UPDATE public.tideo_salud_anotaciones
SET
  responsable_tideo = NULLIF(btrim(responsable_tideo), ''),
  responsable_cliente = NULLIF(btrim(responsable_cliente), '');

UPDATE public.tideo_salud_anotaciones a
SET responsable_tideo = (
  SELECT u.id
  FROM public.usuarios u
  WHERE (
      u.id = a.responsable_tideo
      OR lower(u.email) = lower(a.responsable_tideo)
      OR lower(u.nombre) = lower(a.responsable_tideo)
    )
    AND public.tideo_salud_usuario_pertenece_tenant(u.id, 'emp_20609996464')
  ORDER BY CASE
    WHEN u.id = a.responsable_tideo THEN 0
    WHEN lower(u.email) = lower(a.responsable_tideo) THEN 1
    ELSE 2
  END
  LIMIT 1
)
WHERE NULLIF(btrim(a.responsable_tideo), '') IS NOT NULL;

UPDATE public.tideo_salud_anotaciones a
SET responsable_cliente = (
  SELECT u.id
  FROM public.usuarios u
  WHERE (
      u.id = a.responsable_cliente
      OR lower(u.email) = lower(a.responsable_cliente)
      OR lower(u.nombre) = lower(a.responsable_cliente)
    )
    AND public.tideo_salud_usuario_pertenece_tenant(u.id, a.empresa_id)
  ORDER BY CASE
    WHEN u.id = a.responsable_cliente THEN 0
    WHEN lower(u.email) = lower(a.responsable_cliente) THEN 1
    ELSE 2
  END
  LIMIT 1
)
WHERE NULLIF(btrim(a.responsable_cliente), '') IS NOT NULL;

ALTER TABLE public.tideo_salud_anotaciones
  DROP CONSTRAINT IF EXISTS tideo_salud_anotaciones_responsable_tideo_fkey,
  ADD CONSTRAINT tideo_salud_anotaciones_responsable_tideo_fkey
    FOREIGN KEY (responsable_tideo) REFERENCES public.usuarios(id) ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS tideo_salud_anotaciones_responsable_cliente_fkey,
  ADD CONSTRAINT tideo_salud_anotaciones_responsable_cliente_fkey
    FOREIGN KEY (responsable_cliente) REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validar_tideo_salud_responsables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsable_tideo IS NOT NULL
     AND NOT public.tideo_salud_usuario_pertenece_tenant(NEW.responsable_tideo, 'emp_20609996464') THEN
    RAISE EXCEPTION 'Responsable TIDEO invalido: debe tener posicion activa en TIDEO SAC';
  END IF;

  IF NEW.responsable_cliente IS NOT NULL
     AND NOT public.tideo_salud_usuario_pertenece_tenant(NEW.responsable_cliente, NEW.empresa_id) THEN
    RAISE EXCEPTION 'Responsable Cliente invalido: debe tener posicion activa en el tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tideo_salud_responsables ON public.tideo_salud_anotaciones;
CREATE TRIGGER trg_validar_tideo_salud_responsables
BEFORE INSERT OR UPDATE OF responsable_tideo, responsable_cliente, empresa_id
ON public.tideo_salud_anotaciones
FOR EACH ROW
EXECUTE FUNCTION public.validar_tideo_salud_responsables();

CREATE OR REPLACE FUNCTION public.guardar_salud_implementacion_responsables(
  p_configuracion_id UUID,
  p_empresa_id TEXT,
  p_responsable_tideo TEXT,
  p_responsable_cliente TEXT
)
RETURNS public.tideo_salud_anotaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anotacion public.tideo_salud_anotaciones;
BEGIN
  IF NOT public.usuario_es_admin_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado para guardar responsables de este tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.es_plataforma = false
      AND e.estado = 'activa'
      AND e.id <> 'emp_2000000000'
  ) THEN
    RAISE EXCEPTION 'Tenant no operativo';
  END IF;

  INSERT INTO public.tideo_salud_anotaciones (
    configuracion_id,
    empresa_id,
    responsable_tideo,
    responsable_cliente,
    solo_interno,
    updated_at,
    updated_by
  )
  VALUES (
    p_configuracion_id,
    p_empresa_id,
    NULLIF(p_responsable_tideo, ''),
    NULLIF(p_responsable_cliente, ''),
    false,
    now(),
    auth.uid()
  )
  ON CONFLICT (configuracion_id, empresa_id)
  DO UPDATE SET
    responsable_tideo = EXCLUDED.responsable_tideo,
    responsable_cliente = EXCLUDED.responsable_cliente,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_anotacion;

  RETURN v_anotacion;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_salud_implementacion_responsables(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_salud_implementacion_responsables(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bitacora append-only con aislamiento de audiencia en RLS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tideo_salud_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  configuracion_id UUID NOT NULL
    REFERENCES public.tideo_salud_configuracion(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL
    REFERENCES public.empresas(id) ON DELETE CASCADE,
  audiencia TEXT NOT NULL
    CHECK (audiencia IN ('tideo', 'cliente')),
  autor_id TEXT
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autor_nombre TEXT NOT NULL DEFAULT 'Registro migrado',
  texto TEXT NOT NULL
    CHECK (NULLIF(btrim(texto), '') IS NOT NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  migrado_desde_anotacion_id UUID UNIQUE
    REFERENCES public.tideo_salud_anotaciones(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tideo_salud_comentarios_fila
  ON public.tideo_salud_comentarios (empresa_id, configuracion_id, audiencia, created_at DESC);

CREATE OR REPLACE FUNCTION public.preparar_tideo_salud_comentario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id TEXT := auth.uid()::text;
BEGIN
  NEW.texto := btrim(NEW.texto);

  IF v_auth_id IS NOT NULL THEN
    NEW.autor_id := v_auth_id;
    SELECT COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id)
    INTO NEW.autor_nombre
    FROM public.usuarios u
    WHERE u.id = v_auth_id;

    IF NEW.autor_nombre IS NULL THEN
      RAISE EXCEPTION 'El usuario autenticado no tiene un perfil valido';
    END IF;
  ELSIF NEW.autor_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id)
    INTO NEW.autor_nombre
    FROM public.usuarios u
    WHERE u.id = NEW.autor_id;
    NEW.autor_nombre := COALESCE(NEW.autor_nombre, 'Registro migrado');
  ELSE
    NEW.autor_nombre := COALESCE(NULLIF(btrim(NEW.autor_nombre), ''), 'Registro migrado');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preparar_tideo_salud_comentario ON public.tideo_salud_comentarios;
CREATE TRIGGER trg_preparar_tideo_salud_comentario
BEFORE INSERT ON public.tideo_salud_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.preparar_tideo_salud_comentario();

INSERT INTO public.tideo_salud_comentarios (
  configuracion_id,
  empresa_id,
  audiencia,
  autor_id,
  autor_nombre,
  texto,
  created_at,
  migrado_desde_anotacion_id
)
SELECT
  a.configuracion_id,
  a.empresa_id,
  CASE WHEN a.solo_interno THEN 'tideo' ELSE 'cliente' END,
  u.id,
  COALESCE(NULLIF(btrim(u.nombre), ''), u.email, 'Registro migrado'),
  btrim(a.observacion),
  COALESCE(a.updated_at, now()),
  a.id
FROM public.tideo_salud_anotaciones a
LEFT JOIN public.usuarios u ON u.id = a.updated_by::text
WHERE NULLIF(btrim(a.observacion), '') IS NOT NULL
ON CONFLICT (migrado_desde_anotacion_id) DO NOTHING;

ALTER TABLE public.tideo_salud_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin read salud comentarios" ON public.tideo_salud_comentarios;
CREATE POLICY "Superadmin read salud comentarios"
ON public.tideo_salud_comentarios
FOR SELECT
USING (public.usuario_es_superadmin_plataforma());

DROP POLICY IF EXISTS "Admin tenant read salud comentarios cliente" ON public.tideo_salud_comentarios;
CREATE POLICY "Admin tenant read salud comentarios cliente"
ON public.tideo_salud_comentarios
FOR SELECT
USING (
  audiencia = 'cliente'
  AND public.usuario_es_admin_empresa(empresa_id)
);

DROP POLICY IF EXISTS "Superadmin insert salud comentarios" ON public.tideo_salud_comentarios;
CREATE POLICY "Superadmin insert salud comentarios"
ON public.tideo_salud_comentarios
FOR INSERT
WITH CHECK (
  public.usuario_es_superadmin_plataforma()
  AND autor_id = auth.uid()::text
);

DROP POLICY IF EXISTS "Admin tenant insert salud comentarios cliente" ON public.tideo_salud_comentarios;
CREATE POLICY "Admin tenant insert salud comentarios cliente"
ON public.tideo_salud_comentarios
FOR INSERT
WITH CHECK (
  audiencia = 'cliente'
  AND public.usuario_es_admin_empresa(empresa_id)
  AND autor_id = auth.uid()::text
);

REVOKE ALL ON TABLE public.tideo_salud_comentarios FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.tideo_salud_comentarios FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.tideo_salud_comentarios TO authenticated;

COMMENT ON TABLE public.tideo_salud_comentarios IS
  'Bitacora append-only de Salud de Implementacion. RLS impide entregar comentarios TIDEO a tenants.';
