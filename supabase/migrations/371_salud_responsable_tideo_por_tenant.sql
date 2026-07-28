-- Responsable TIDEO se selecciona dentro del tenant observado.
-- Debe cumplir el mismo criterio de pertenencia activa que Responsable Cliente
-- y, adicionalmente, usar una cuenta con dominio @tideo.tech.

CREATE OR REPLACE FUNCTION public.tideo_salud_usuario_es_responsable_tideo(
  p_usuario_id TEXT,
  p_tenant_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tideo_salud_usuario_pertenece_tenant(p_usuario_id, p_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = p_usuario_id
        AND lower(btrim(u.email)) LIKE '%@tideo.tech'
    );
$$;

REVOKE ALL
ON FUNCTION public.tideo_salud_usuario_es_responsable_tideo(TEXT, TEXT)
FROM PUBLIC;

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
    WHERE public.tideo_salud_usuario_es_responsable_tideo(u.id, p_tenant_id)

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

-- Conservar el valor libre anterior como evidencia antes de limpiar una
-- asignacion que ya no cumpla el criterio correcto.
UPDATE public.tideo_salud_anotaciones a
SET
  responsable_tideo_legacy = COALESCE(a.responsable_tideo_legacy, a.responsable_tideo),
  responsable_tideo = NULL,
  updated_at = now()
WHERE a.responsable_tideo IS NOT NULL
  AND NOT public.tideo_salud_usuario_es_responsable_tideo(
    a.responsable_tideo,
    a.empresa_id
  );

CREATE OR REPLACE FUNCTION public.validar_tideo_salud_responsables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsable_tideo IS NOT NULL
     AND NOT public.tideo_salud_usuario_es_responsable_tideo(
       NEW.responsable_tideo,
       NEW.empresa_id
     ) THEN
    RAISE EXCEPTION
      'Responsable TIDEO invalido: debe tener posicion activa en el tenant y correo @tideo.tech';
  END IF;

  IF NEW.responsable_cliente IS NOT NULL
     AND NOT public.tideo_salud_usuario_pertenece_tenant(
       NEW.responsable_cliente,
       NEW.empresa_id
     ) THEN
    RAISE EXCEPTION
      'Responsable Cliente invalido: debe tener posicion activa en el tenant';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.get_salud_implementacion_usuarios(TEXT) IS
  'Usuarios de Salud: Cliente pertenece al tenant activo; TIDEO es el subconjunto del mismo tenant con email @tideo.tech.';
