-- 596: Fotografías de hallazgos del Diagnóstico Técnico.
-- Propósito: guardar metadatos de hasta tres fotos JPEG por hallazgo y proteger
-- su acceso al bucket privado por empresa y permisos de diagnóstico.
-- Decisiones: FK compuesta (empresa_id,hallazgo_id), ruta con empresa/diagnóstico/
-- hallazgo/UUID.jpg, límite serializado con FOR UPDATE del hallazgo y sin
-- política Storage UPDATE; el cliente debe subir objetos con nombres nuevos.
-- Supuesto: diagnostico_informes enlaza recepcion_id y diagnostico_id; se bloquea
-- ante cualquier informe emitido de la recepción del diagnóstico.
-- Excepción explícita: con un informe todavía borrador se permite cambiar
-- leyenda, orden y exclusión aunque el diagnóstico ya esté emitido; el contenido
-- y la ruta del objeto siguen inmutables. Sin informe borrador rige el estado del
-- diagnóstico. El CHECK valida el prefijo de empresa; el trigger valida ruta.
-- Aplicada en producción por el usuario (revisada con ROLLBACK y luego COMMIT).

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_fotos') IS NULL,
    'PRECONDITION_FAILED: ya existe diagnostico_tecnico_hallazgo_fotos';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_hallazgos';
  ASSERT to_regclass('public.diagnosticos_tecnicos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnosticos_tecnicos';
  ASSERT to_regclass('public.diagnostico_informes') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_informes';
  ASSERT to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL,
    'PRECONDITION_FAILED: falta esquema Storage';
  ASSERT to_regprocedure('public.audit_backend_minimo()') IS NOT NULL,
    'PRECONDITION_FAILED: falta audit_backend_minimo()';
  ASSERT to_regprocedure('public.usuario_tiene_empresa(text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta usuario_tiene_empresa(text)';
  ASSERT to_regprocedure('public.usuario_puede(text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta usuario_puede(text,text,text)';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.diagnostico_tecnico_hallazgos'::regclass
      AND contype='u' AND pg_get_constraintdef(oid) LIKE 'UNIQUE (empresa_id, id)%'),
    'PRECONDITION_FAILED: falta UNIQUE (empresa_id,id) en hallazgos';
  ASSERT (SELECT count(*)=4 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnosticos_tecnicos'
      AND column_name IN ('id','empresa_id','estado','recepcion_id')),
    'PRECONDITION_FAILED: diagnosticos_tecnicos debe exponer id, empresa_id, estado y recepcion_id';
  ASSERT (SELECT count(*)=3 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnostico_informes'
      AND column_name IN ('empresa_id','recepcion_id','estado')),
    'PRECONDITION_FAILED: diagnostico_informes debe exponer empresa_id, recepcion_id y estado';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('storage_diag_fotos_select','storage_diag_fotos_insert','storage_diag_fotos_delete')),
    'PRECONDITION_FAILED: ya existe una política storage_diag_fotos_*';
END
$pre$;

CREATE TABLE public.diagnostico_tecnico_hallazgo_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  hallazgo_id uuid NOT NULL,
  ruta_storage text NOT NULL UNIQUE,
  nombre_original text,
  mime_type text CHECK (mime_type IN ('image/jpeg')),
  tamano_bytes integer CHECK (tamano_bytes > 0 AND tamano_bytes <= 1572864),
  ancho integer,
  alto integer,
  leyenda text CHECK (leyenda IS NULL OR char_length(leyenda) <= 200),
  orden smallint NOT NULL DEFAULT 1,
  excluir_del_informe boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnostico_hallazgo_fotos_hallazgo_fk
    FOREIGN KEY (empresa_id,hallazgo_id)
    REFERENCES public.diagnostico_tecnico_hallazgos(empresa_id,id) ON DELETE CASCADE,
  CONSTRAINT diagnostico_hallazgo_fotos_ruta_empresa_ck
    CHECK (left(ruta_storage,char_length(empresa_id)+1)=empresa_id || '/'),
  CONSTRAINT diagnostico_hallazgo_fotos_ruta_formato_ck
    CHECK (array_length(string_to_array(ruta_storage,'/'),1)=4
      AND split_part(ruta_storage,'/',4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'),
  CONSTRAINT diagnostico_hallazgo_fotos_dimensiones_ck
    CHECK ((ancho IS NULL OR ancho > 0) AND (alto IS NULL OR alto > 0))
);

CREATE INDEX diagnostico_hallazgo_fotos_empresa_hallazgo_idx
  ON public.diagnostico_tecnico_hallazgo_fotos (empresa_id,hallazgo_id,orden,id);

CREATE FUNCTION public.limitar_fotos_por_hallazgo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_empresa text; v_diagnostico text; v_total integer;
BEGIN
  SELECT h.empresa_id,h.diagnostico_id INTO v_empresa,v_diagnostico
  FROM public.diagnostico_tecnico_hallazgos h
  WHERE h.empresa_id=NEW.empresa_id AND h.id=NEW.hallazgo_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El hallazgo indicado no existe en esta empresa.' USING ERRCODE='23503';
  END IF;
  IF NEW.ruta_storage <> NEW.empresa_id || '/' || v_diagnostico || '/' ||
       NEW.hallazgo_id::text || '/' || split_part(NEW.ruta_storage,'/',4) THEN
    RAISE EXCEPTION 'La ruta de la foto debe seguir empresa/diagnóstico/hallazgo/UUID.jpg.' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_total FROM public.diagnostico_tecnico_hallazgo_fotos f
  WHERE f.empresa_id=NEW.empresa_id AND f.hallazgo_id=NEW.hallazgo_id;
  IF v_total >= 3 THEN
    RAISE EXCEPTION 'Un hallazgo admite como máximo tres fotos.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION public.bloquear_foto_hallazgo_emitido()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_foto public.diagnostico_tecnico_hallazgo_fotos%ROWTYPE;
  v_diagnostico text; v_recepcion text; v_estado text; v_informe_borrador boolean;
BEGIN
  IF TG_OP='DELETE' THEN v_foto := OLD; ELSE v_foto := NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.hallazgo_id IS DISTINCT FROM OLD.hallazgo_id
       OR NEW.ruta_storage IS DISTINCT FROM OLD.ruta_storage
       OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.tamano_bytes IS DISTINCT FROM OLD.tamano_bytes
       OR NEW.ancho IS DISTINCT FROM OLD.ancho OR NEW.alto IS DISTINCT FROM OLD.alto
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Solo se pueden modificar la leyenda, el orden y la exclusión del informe.' USING ERRCODE='23514';
    END IF;
    IF NEW.leyenda IS NOT DISTINCT FROM OLD.leyenda
       AND NEW.orden IS NOT DISTINCT FROM OLD.orden
       AND NEW.excluir_del_informe IS NOT DISTINCT FROM OLD.excluir_del_informe THEN
      RAISE EXCEPTION 'El cambio debe modificar leyenda, orden o exclusión del informe.' USING ERRCODE='23514';
    END IF;
    NEW.updated_at := now();
    v_foto := NEW;
  END IF;
  SELECT d.id,d.recepcion_id,d.estado INTO v_diagnostico,v_recepcion,v_estado
  FROM public.diagnostico_tecnico_hallazgos h
  JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
  WHERE h.id=v_foto.hallazgo_id AND h.empresa_id=v_foto.empresa_id
  FOR SHARE OF h,d;
  IF NOT FOUND THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'El diagnóstico del hallazgo no existe.' USING ERRCODE='23503';
  END IF;
  IF EXISTS (SELECT 1 FROM public.diagnostico_informes i
      WHERE i.empresa_id=v_foto.empresa_id AND i.recepcion_id=v_recepcion
        AND i.estado='emitido') THEN
    RAISE EXCEPTION 'No se pueden modificar fotos: ya existe un informe emitido para esta recepción.' USING ERRCODE='42501';
  END IF;
  IF v_estado IS DISTINCT FROM 'borrador' THEN
    SELECT EXISTS (SELECT 1 FROM public.diagnostico_informes i
      WHERE i.empresa_id=v_foto.empresa_id AND i.recepcion_id=v_recepcion
        AND i.estado='borrador') INTO v_informe_borrador;
    IF NOT (TG_OP='UPDATE' AND v_informe_borrador) THEN
      RAISE EXCEPTION 'Solo se pueden modificar fotos de un diagnóstico en borrador.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$fn$;

CREATE FUNCTION public.foto_diagnostico_bloqueada(p_ruta text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.diagnostico_tecnico_hallazgo_fotos f
    JOIN public.diagnostico_tecnico_hallazgos h
      ON h.id=f.hallazgo_id AND h.empresa_id=f.empresa_id
    JOIN public.diagnosticos_tecnicos d
      ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    WHERE f.ruta_storage=p_ruta
      AND (d.estado IS DISTINCT FROM 'borrador'
        OR EXISTS (SELECT 1 FROM public.diagnostico_informes i
          WHERE i.empresa_id=d.empresa_id AND i.recepcion_id=d.recepcion_id
            AND i.estado='emitido'))
  )
$fn$;
REVOKE ALL ON FUNCTION public.foto_diagnostico_bloqueada(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foto_diagnostico_bloqueada(text) TO authenticated;
REVOKE ALL ON FUNCTION public.limitar_fotos_por_hallazgo(), public.bloquear_foto_hallazgo_emitido()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER a_limitar_fotos_por_hallazgo
  BEFORE INSERT ON public.diagnostico_tecnico_hallazgo_fotos
  FOR EACH ROW EXECUTE FUNCTION public.limitar_fotos_por_hallazgo();
CREATE TRIGGER b_bloquear_foto_hallazgo_emitido
  BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_hallazgo_fotos
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_foto_hallazgo_emitido();
CREATE TRIGGER audit_diagnostico_tecnico_hallazgo_fotos
  AFTER INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgo_fotos
  FOR EACH ROW EXECUTE FUNCTION public.audit_backend_minimo();

ALTER TABLE public.diagnostico_tecnico_hallazgo_fotos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagnostico_tecnico_hallazgo_fotos FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.diagnostico_tecnico_hallazgo_fotos TO authenticated;

CREATE POLICY diagnostico_hallazgo_fotos_select
ON public.diagnostico_tecnico_hallazgo_fotos FOR SELECT TO authenticated
USING (public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id,'diagnostico_tecnico','ver')
  AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h
    JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    WHERE h.id=diagnostico_tecnico_hallazgo_fotos.hallazgo_id
      AND h.empresa_id=diagnostico_tecnico_hallazgo_fotos.empresa_id
      AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
CREATE POLICY diagnostico_hallazgo_fotos_insert
ON public.diagnostico_tecnico_hallazgo_fotos FOR INSERT TO authenticated
WITH CHECK (public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id,'diagnostico_tecnico','crear')
  AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h
    JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    WHERE h.id=diagnostico_tecnico_hallazgo_fotos.hallazgo_id
      AND h.empresa_id=diagnostico_tecnico_hallazgo_fotos.empresa_id AND d.estado='borrador'));
CREATE POLICY diagnostico_hallazgo_fotos_update
ON public.diagnostico_tecnico_hallazgo_fotos FOR UPDATE TO authenticated
USING (public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id,'diagnostico_tecnico','editar')
  AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h
    JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    WHERE h.id=diagnostico_tecnico_hallazgo_fotos.hallazgo_id
      AND h.empresa_id=diagnostico_tecnico_hallazgo_fotos.empresa_id
      AND (d.estado='borrador' OR EXISTS (SELECT 1 FROM public.diagnostico_informes i
        WHERE i.empresa_id=d.empresa_id AND i.recepcion_id=d.recepcion_id AND i.estado='borrador'))))
WITH CHECK (public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id,'diagnostico_tecnico','editar')
  AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h
    JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    WHERE h.id=diagnostico_tecnico_hallazgo_fotos.hallazgo_id
      AND h.empresa_id=diagnostico_tecnico_hallazgo_fotos.empresa_id
      AND (d.estado='borrador' OR EXISTS (SELECT 1 FROM public.diagnostico_informes i
        WHERE i.empresa_id=d.empresa_id AND i.recepcion_id=d.recepcion_id AND i.estado='borrador'))));
CREATE POLICY diagnostico_hallazgo_fotos_delete
ON public.diagnostico_tecnico_hallazgo_fotos FOR DELETE TO authenticated
USING (public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id,'diagnostico_tecnico','editar')
  AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h
    JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    WHERE h.id=diagnostico_tecnico_hallazgo_fotos.hallazgo_id
      AND h.empresa_id=diagnostico_tecnico_hallazgo_fotos.empresa_id
      AND d.estado='borrador'));

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('diagnostico-fotos','diagnostico-fotos',false,1572864,ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public=EXCLUDED.public,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY storage_diag_fotos_select ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id='diagnostico-fotos'
  AND public.usuario_tiene_empresa(split_part(name,'/',1))
  AND public.usuario_puede(split_part(name,'/',1),'diagnostico_tecnico','ver'));
CREATE POLICY storage_diag_fotos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id='diagnostico-fotos'
  AND public.usuario_tiene_empresa(split_part(name,'/',1))
  AND public.usuario_puede(split_part(name,'/',1),'diagnostico_tecnico','crear'));
CREATE POLICY storage_diag_fotos_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id='diagnostico-fotos'
  AND public.usuario_tiene_empresa(split_part(name,'/',1))
  AND public.usuario_puede(split_part(name,'/',1),'diagnostico_tecnico','editar')
  AND NOT public.foto_diagnostico_bloqueada(name));

DO $verify$
BEGIN
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_fotos') IS NOT NULL,
    'VERIFY_FAILED: falta tabla de fotos';
  ASSERT (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.diagnostico_tecnico_hallazgo_fotos'::regclass),
    'VERIFY_FAILED: RLS no está habilitado';
  ASSERT (SELECT count(*)=4 FROM pg_policies
    WHERE schemaname='public' AND tablename='diagnostico_tecnico_hallazgo_fotos'),
    'VERIFY_FAILED: deben existir cuatro políticas de tabla';
  ASSERT EXISTS (SELECT 1 FROM storage.buckets
    WHERE id='diagnostico-fotos' AND public=false AND file_size_limit=1572864
      AND allowed_mime_types=ARRAY['image/jpeg']),
    'VERIFY_FAILED: bucket privado o configuración incorrecta';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND cmd='UPDATE'
      AND policyname LIKE 'storage_diag_fotos_%'),
    'VERIFY_FAILED: no debe existir política UPDATE de Storage para fotos';
  ASSERT (SELECT count(*)=3 FROM pg_trigger
    WHERE tgrelid='public.diagnostico_tecnico_hallazgo_fotos'::regclass AND NOT tgisinternal
      AND tgname IN ('a_limitar_fotos_por_hallazgo','b_bloquear_foto_hallazgo_emitido',
        'audit_diagnostico_tecnico_hallazgo_fotos')),
    'VERIFY_FAILED: faltan triggers de límite, bloqueo o auditoría';
  ASSERT to_regprocedure('public.foto_diagnostico_bloqueada(text)') IS NOT NULL,
    'VERIFY_FAILED: falta función de bloqueo Storage';
END
$verify$;

COMMIT;
