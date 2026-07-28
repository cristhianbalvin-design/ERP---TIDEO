-- Observaciones TIDEO como canal dirigido al cliente.
-- Lectura: publica dentro del tenant, salvo notas marcadas solo_interno.
-- Escritura: exclusivamente personal activo con correo @tideo.tech.

ALTER TABLE public.tideo_salud_comentarios
  ADD COLUMN IF NOT EXISTS solo_interno BOOLEAN NOT NULL DEFAULT false;

-- Conserva la clasificacion explicita del esquema anterior para comentarios
-- migrados desde anotaciones. Los demas comentarios TIDEO pasan a ser publicos.
UPDATE public.tideo_salud_comentarios c
SET solo_interno = true
FROM public.tideo_salud_anotaciones a
WHERE c.migrado_desde_anotacion_id = a.id
  AND c.audiencia = 'tideo'
  AND a.solo_interno = true;

CREATE OR REPLACE FUNCTION public.tideo_salud_usuario_actual_es_personal_tideo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()::text
      AND lower(u.estado) = 'activo'
      AND lower(btrim(u.email)) LIKE '%@tideo.tech'
  );
$$;

REVOKE ALL
ON FUNCTION public.tideo_salud_usuario_actual_es_personal_tideo()
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.tideo_salud_usuario_actual_es_personal_tideo()
TO authenticated;

CREATE OR REPLACE FUNCTION public.tideo_salud_personal_tideo_tiene_acceso(
  p_tenant_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tideo_salud_usuario_actual_es_personal_tideo()
    AND (
      public.usuario_es_superadmin_plataforma()
      OR public.tideo_salud_usuario_pertenece_tenant(
        auth.uid()::text,
        p_tenant_id
      )
    );
$$;

REVOKE ALL
ON FUNCTION public.tideo_salud_personal_tideo_tiene_acceso(TEXT)
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.tideo_salud_personal_tideo_tiene_acceso(TEXT)
TO authenticated;

-- La politica anterior entregaba toda la audiencia TIDEO unicamente a
-- superadmins. Se reemplaza; las politicas de audiencia cliente no cambian.
DROP POLICY IF EXISTS "Superadmin read salud comentarios"
ON public.tideo_salud_comentarios;

DROP POLICY IF EXISTS "Tenant read salud comentarios tideo"
ON public.tideo_salud_comentarios;
CREATE POLICY "Tenant read salud comentarios tideo"
ON public.tideo_salud_comentarios
FOR SELECT
USING (
  audiencia = 'tideo'
  AND (
    public.usuario_es_admin_empresa(empresa_id)
    OR public.tideo_salud_personal_tideo_tiene_acceso(empresa_id)
  )
  AND (
    solo_interno = false
    OR public.tideo_salud_personal_tideo_tiene_acceso(empresa_id)
  )
);

-- La politica previa permitia insertar a cualquier superadmin. La nueva regla
-- exige identidad @tideo.tech y acceso legitimo al tenant.
DROP POLICY IF EXISTS "Superadmin insert salud comentarios"
ON public.tideo_salud_comentarios;

DROP POLICY IF EXISTS "Personal TIDEO insert salud comentarios tideo"
ON public.tideo_salud_comentarios;
CREATE POLICY "Personal TIDEO insert salud comentarios tideo"
ON public.tideo_salud_comentarios
FOR INSERT
WITH CHECK (
  audiencia = 'tideo'
  AND autor_id = auth.uid()::text
  AND public.tideo_salud_personal_tideo_tiene_acceso(empresa_id)
);

COMMENT ON COLUMN public.tideo_salud_comentarios.solo_interno IS
  'Si es true, una observacion TIDEO solo es visible para personal @tideo.tech con acceso al tenant.';

COMMENT ON FUNCTION public.tideo_salud_usuario_actual_es_personal_tideo() IS
  'Identifica al usuario autenticado como personal TIDEO mediante public.usuarios activo y correo terminado en @tideo.tech.';
