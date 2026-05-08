-- Modulos moviles multiples por usuario dentro de un tenant.
-- Reemplaza el concepto de un unico perfil_campo para la UI movil, manteniendo
-- perfil_campo como compatibilidad con datos y funciones anteriores.

ALTER TABLE public.usuarios_empresas
  ADD COLUMN IF NOT EXISTS campo_modulos text[] DEFAULT '{}'::text[];

UPDATE public.usuarios_empresas
SET campo_modulos = CASE
  WHEN acceso_campo IS NOT TRUE THEN '{}'::text[]
  WHEN campo_modulos IS NOT NULL AND array_length(campo_modulos, 1) IS NOT NULL THEN campo_modulos
  WHEN lower(coalesce(perfil_campo, '')) LIKE '%vendedor%' THEN ARRAY['vendedor']::text[]
  WHEN lower(coalesce(perfil_campo, '')) LIKE '%compra%' THEN ARRAY['compras']::text[]
  WHEN lower(coalesce(perfil_campo, '')) LIKE '%supervisor%' THEN ARRAY['supervisor']::text[]
  WHEN lower(coalesce(perfil_campo, '')) LIKE '%gerencia%' THEN ARRAY['gerencia']::text[]
  WHEN lower(coalesce(perfil_campo, '')) LIKE '%logistica%' THEN ARRAY['logistica']::text[]
  WHEN lower(coalesce(perfil_campo, '')) LIKE '%asistencia%' THEN ARRAY['asistencia']::text[]
  ELSE ARRAY['tecnico']::text[]
END;

DROP FUNCTION IF EXISTS public.get_mis_membresias();
DROP FUNCTION IF EXISTS public.get_mis_membresias(uuid);

CREATE FUNCTION public.get_mis_membresias()
RETURNS TABLE(
  empresa_id text,
  rol_id text,
  acceso_campo boolean,
  perfil_campo text,
  campo_modulos text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH superadmin_role AS (
    SELECT ue.rol_id
    FROM public.usuarios_empresas ue
    JOIN public.roles r ON r.id = ue.rol_id
    WHERE ue.user_id = auth.uid()
      AND ue.estado = 'activo'
      AND r.es_superadmin = true
    LIMIT 1
  )
  SELECT e.id AS empresa_id, s.rol_id, true AS acceso_campo, 'plataforma'::text AS perfil_campo,
         ARRAY['gerencia']::text[] AS campo_modulos
  FROM public.empresas e
  CROSS JOIN superadmin_role s
  WHERE e.estado IN ('activa', 'activo', 'demo')

  UNION

  SELECT ue.empresa_id, ue.rol_id, ue.acceso_campo, ue.perfil_campo, COALESCE(ue.campo_modulos, '{}'::text[])
  FROM public.usuarios_empresas ue
  WHERE ue.user_id = auth.uid()
    AND ue.estado = 'activo'
    AND NOT EXISTS (SELECT 1 FROM superadmin_role);
$$;

CREATE FUNCTION public.get_mis_membresias(p_user_id uuid)
RETURNS TABLE(
  empresa_id text,
  rol_id text,
  acceso_campo boolean,
  perfil_campo text,
  campo_modulos text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.get_mis_membresias();
$$;

SELECT pg_notify('pgrst', 'reload schema');
