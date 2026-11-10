-- Revisión de las sincronizaciones del catálogo de pantallas y del manual de Aria.
-- Evita que una rama atrasada devuelva la base a un contenido viejo al aplicar su _sincronizar.sql:
-- 1. aria_sincronizacion_revision guarda la última revisión aplicada por objeto ('catalogo' y 'manual').
-- 2. aria_sincronizacion_autorizar(objeto, revisión, huella) la valida al inicio de cada _sincronizar.sql:
--    rechaza una revisión menor, o la misma revisión con otro contenido, y autoriza la transacción.
-- 3. Las tablas sincronizadas solo aceptan escrituras dentro de una transacción autorizada.
-- Aditiva: no modifica datos existentes.

CREATE TABLE IF NOT EXISTS public.aria_sincronizacion_revision (
  objeto text PRIMARY KEY CHECK (objeto IN ('catalogo', 'manual')),
  revision integer NOT NULL CHECK (revision > 0),
  huella text NOT NULL CHECK (huella ~ '^[0-9a-f]{16}$'),
  aplicado_en timestamptz NOT NULL DEFAULT now(),
  aplicado_por text NOT NULL DEFAULT current_user
);

ALTER TABLE public.aria_sincronizacion_revision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_sincronizacion_revision_lectura ON public.aria_sincronizacion_revision;
CREATE POLICY aria_sincronizacion_revision_lectura ON public.aria_sincronizacion_revision
  FOR SELECT TO authenticated USING (public.usuario_es_superadmin_plataforma());
REVOKE ALL ON public.aria_sincronizacion_revision FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.aria_sincronizacion_revision FROM authenticated;

CREATE OR REPLACE FUNCTION public.aria_sincronizacion_autorizar(p_objeto text, p_revision integer, p_huella text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actual public.aria_sincronizacion_revision%ROWTYPE;
BEGIN
  IF p_objeto NOT IN ('catalogo', 'manual') THEN
    RAISE EXCEPTION 'Sincronización: objeto desconocido %', p_objeto;
  END IF;
  SELECT * INTO v_actual FROM public.aria_sincronizacion_revision WHERE objeto = p_objeto FOR UPDATE;
  IF FOUND THEN
    IF p_revision < v_actual.revision THEN
      RAISE EXCEPTION 'Sincronización de % rechazada: el archivo es la revisión % y la base ya tiene la % (aplicada el %). Trae origin/main, regenera y vuelve a aplicar.',
        p_objeto, p_revision, v_actual.revision, v_actual.aplicado_en;
    ELSIF p_revision = v_actual.revision AND p_huella <> v_actual.huella THEN
      RAISE EXCEPTION 'Sincronización de % rechazada: la revisión % ya se aplicó con otro contenido (% frente a %). Sube la revisión en catalogo/sincronizacion.json desde una rama al día con origin/main.',
        p_objeto, p_revision, v_actual.huella, p_huella;
    END IF;
  END IF;
  INSERT INTO public.aria_sincronizacion_revision (objeto, revision, huella, aplicado_en, aplicado_por)
  VALUES (p_objeto, p_revision, p_huella, now(), current_user)
  ON CONFLICT (objeto) DO UPDATE
    SET revision = EXCLUDED.revision, huella = EXCLUDED.huella, aplicado_en = EXCLUDED.aplicado_en, aplicado_por = EXCLUDED.aplicado_por;
  -- Autoriza solo esta transacción a escribir en las tablas del objeto.
  PERFORM set_config('aria.sincronizacion', p_objeto, true);
  RETURN format('Sincronización de %s autorizada: revisión %s (%s)', p_objeto, p_revision, p_huella);
END;
$$;
REVOKE ALL ON FUNCTION public.aria_sincronizacion_autorizar(text, integer, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aria_sincronizacion_exigir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('aria.sincronizacion', true), '') <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'Escritura en % bloqueada: estas tablas solo se modifican con el _sincronizar.sql vigente de main (%), que llama primero a aria_sincronizacion_autorizar.',
      TG_TABLE_NAME, CASE TG_ARGV[0] WHEN 'catalogo' THEN 'catalogo/_sincronizar.sql' ELSE 'docs/manual-pantallas/_sincronizar.sql' END;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.aria_sincronizacion_exigir() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aria_sincronizacion_exigir ON public.aria_catalogo_pantallas;
CREATE TRIGGER aria_sincronizacion_exigir BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.aria_catalogo_pantallas
  FOR EACH STATEMENT EXECUTE FUNCTION public.aria_sincronizacion_exigir('catalogo');
DROP TRIGGER IF EXISTS aria_sincronizacion_exigir ON public.aria_permisos_equivalencias;
CREATE TRIGGER aria_sincronizacion_exigir BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.aria_permisos_equivalencias
  FOR EACH STATEMENT EXECUTE FUNCTION public.aria_sincronizacion_exigir('catalogo');
DROP TRIGGER IF EXISTS aria_sincronizacion_exigir ON public.aria_cobertura;
CREATE TRIGGER aria_sincronizacion_exigir BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.aria_cobertura
  FOR EACH STATEMENT EXECUTE FUNCTION public.aria_sincronizacion_exigir('catalogo');
DROP TRIGGER IF EXISTS aria_sincronizacion_exigir ON public.asistente_manual_fichas;
CREATE TRIGGER aria_sincronizacion_exigir BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.asistente_manual_fichas
  FOR EACH STATEMENT EXECUTE FUNCTION public.aria_sincronizacion_exigir('manual');
DROP TRIGGER IF EXISTS aria_sincronizacion_exigir ON public.asistente_manual_pasos;
CREATE TRIGGER aria_sincronizacion_exigir BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.asistente_manual_pasos
  FOR EACH STATEMENT EXECUTE FUNCTION public.aria_sincronizacion_exigir('manual');

-- Comprobación: una escritura directa queda bloqueada (la sentencia no toca filas: WHERE false).
DO $comprobacion$
DECLARE v_bloqueada boolean := false;
BEGIN
  BEGIN
    UPDATE public.aria_cobertura SET nivel = nivel WHERE false;
  EXCEPTION WHEN raise_exception THEN v_bloqueada := true;
  END;
  IF NOT v_bloqueada THEN RAISE EXCEPTION 'Comprobación: la escritura directa en aria_cobertura no quedó bloqueada'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'aria_sincronizacion_exigir' AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'Comprobación: se esperaban 5 disparadores aria_sincronizacion_exigir';
  END IF;
END $comprobacion$;
