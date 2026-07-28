-- Salud debe usar la misma fuente de pertenencia que la pantalla Usuarios:
-- usuarios_empresas activa. Una posicion organizacional es informacion laboral
-- e historica; no determina si la cuenta pertenece actualmente al tenant.

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
    JOIN public.usuarios_empresas ue
      ON ue.user_id::text = u.id
    WHERE u.id = p_usuario_id
      AND lower(u.estado) = 'activo'
      AND ue.empresa_id = p_tenant_id
      AND ue.estado = 'activo'
  );
$$;

REVOKE ALL
ON FUNCTION public.tideo_salud_usuario_pertenece_tenant(TEXT, TEXT)
FROM PUBLIC;

COMMENT ON FUNCTION public.tideo_salud_usuario_pertenece_tenant(TEXT, TEXT) IS
  'Pertenencia de Salud basada en cuenta y membresia activas de usuarios_empresas; no exige posicion laboral vigente.';

