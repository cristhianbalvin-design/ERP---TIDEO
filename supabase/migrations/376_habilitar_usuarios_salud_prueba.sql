-- Habilita los selectores de usuarios de Salud para el tenant PRUEBA.
--
-- PRUEBA se excluye correctamente del inventario global de tenants operativos,
-- pero esa regla no debe aplicarse a la RPC local que llena los responsables
-- cuando un administrador trabaja dentro de ese tenant.

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
    )
  ORDER BY q.tipo_usuario, q.nombre, q.email;
$$;

REVOKE ALL ON FUNCTION public.get_salud_implementacion_usuarios(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_salud_implementacion_usuarios(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_salud_implementacion_usuarios(TEXT) IS
  'Usuarios de Salud del tenant consultado, incluido PRUEBA cuando es el tenant activo. Cliente exige membresia activa; TIDEO agrega dominio @tideo.tech.';

