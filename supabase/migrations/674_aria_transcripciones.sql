-- 674: Contador de transcripciones de voz de Aria (Edge aria-transcribir).
-- Límite propio de 60 transcripciones al día por usuario y empresa (hora de Lima); la pregunta
-- que luego se envía a Aria sigue contando en la cuota de 30 de asistente_verificar_cuota.
-- Aditiva: tabla nueva + función nueva. Los usuarios solo leen sus propias filas; se escribe
-- únicamente a través de la función (SECURITY DEFINER), que valida sesión y empresa.

CREATE TABLE IF NOT EXISTS public.aria_transcripciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  empresa_id text NOT NULL,
  bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aria_transcripciones_user_empresa_fecha_idx
  ON public.aria_transcripciones (user_id, empresa_id, created_at DESC);

ALTER TABLE public.aria_transcripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aria_transcripciones_select_propias ON public.aria_transcripciones;
CREATE POLICY aria_transcripciones_select_propias ON public.aria_transcripciones
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.aria_transcripciones FROM anon;
GRANT SELECT ON public.aria_transcripciones TO authenticated;

CREATE OR REPLACE FUNCTION public.aria_registrar_transcripcion(p_empresa_id text, p_bytes integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limite CONSTANT integer := 60;
  v_inicio timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
  v_conteo integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'El usuario no pertenece a la empresa'; END IF;
  -- Serializa por usuario y empresa para que dos grabaciones simultáneas no superen el límite.
  PERFORM pg_advisory_xact_lock(hashtextextended('aria_transcripcion:' || v_uid::text || ':' || p_empresa_id, 0));
  SELECT count(*)::integer INTO v_conteo FROM public.aria_transcripciones t
   WHERE t.user_id = v_uid AND t.empresa_id = p_empresa_id AND t.created_at >= v_inicio;
  IF v_conteo >= v_limite THEN
    RETURN jsonb_build_object('puede_continuar', false, 'limite', v_limite, 'restante', 0);
  END IF;
  INSERT INTO public.aria_transcripciones (user_id, empresa_id, bytes) VALUES (v_uid, p_empresa_id, p_bytes);
  RETURN jsonb_build_object('puede_continuar', true, 'limite', v_limite, 'restante', v_limite - v_conteo - 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.aria_registrar_transcripcion(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_registrar_transcripcion(text, integer) TO authenticated;

-- Comprobación: si algo no quedó como se espera, se revierte toda la migración.
DO $$
BEGIN
  IF to_regclass('public.aria_transcripciones') IS NULL THEN RAISE EXCEPTION '674: falta la tabla aria_transcripciones'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_transcripciones'::regclass) THEN RAISE EXCEPTION '674: RLS no está activo'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'aria_transcripciones') <> 1 THEN RAISE EXCEPTION '674: políticas inesperadas'; END IF;
  IF to_regprocedure('public.aria_registrar_transcripcion(text,integer)') IS NULL THEN RAISE EXCEPTION '674: falta la función'; END IF;
  IF has_function_privilege('anon', 'public.aria_registrar_transcripcion(text,integer)', 'EXECUTE') THEN RAISE EXCEPTION '674: anon no debe ejecutar la función'; END IF;
END $$;
