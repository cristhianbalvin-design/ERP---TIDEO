-- Lectura minima de personas con firma para el selector de emision de informes.
-- No abre lectura general de RR.HH.: exige tenant y permiso de aprobacion del informe.
BEGIN;

CREATE OR REPLACE FUNCTION public.listar_personal_emisor_firma_informe(p_empresa_id text)
RETURNS TABLE (
  id text,
  nombre text,
  cargo text,
  personal_tipo text,
  auth_user_id uuid,
  firma_adjunto_id uuid,
  firma_bucket text,
  firma_storage_path text,
  firma_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id, 'informe_diagnostico', 'aprobar') THEN
    RAISE EXCEPTION 'No autorizado para consultar firmantes del informe.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH personas AS (
    SELECT pa.id::text AS id, pa.nombre::text AS nombre, pa.cargo::text AS cargo,
      'administrativo'::text AS personal_tipo, pa.auth_user_id
    FROM public.personal_administrativo pa
    WHERE pa.empresa_id = p_empresa_id AND lower(coalesce(pa.estado, '')) = 'activo'
    UNION ALL
    SELECT po.id::text, po.nombre::text, po.cargo::text,
      'operativo'::text, po.auth_user_id
    FROM public.personal_operativo po
    WHERE po.empresa_id = p_empresa_id AND lower(coalesce(po.estado, '')) = 'activo'
  ), firmas AS (
    SELECT DISTINCT ON (a.entidad_tipo, a.entidad_id)
      a.entidad_tipo, a.entidad_id, a.id AS adjunto_id, a.bucket, a.storage_path, a.url
    FROM public.adjuntos a
    WHERE a.empresa_id = p_empresa_id
      AND a.categoria = 'firma_rubrica'
      AND a.entidad_tipo IN ('personal_administrativo', 'personal_operativo')
    ORDER BY a.entidad_tipo, a.entidad_id, a.subido_en DESC, a.id DESC
  )
  SELECT p.id, p.nombre, p.cargo, p.personal_tipo, p.auth_user_id,
    f.adjunto_id, f.bucket, f.storage_path, f.url
  FROM personas p
  JOIN firmas f ON f.entidad_id = p.id
    AND f.entidad_tipo = CASE p.personal_tipo
      WHEN 'administrativo' THEN 'personal_administrativo'
      ELSE 'personal_operativo'
    END
  WHERE nullif(btrim(coalesce(p.nombre, '')), '') IS NOT NULL
  ORDER BY p.nombre;
END
$fn$;

REVOKE ALL ON FUNCTION public.listar_personal_emisor_firma_informe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_personal_emisor_firma_informe(text) TO authenticated;

COMMIT;
