-- La jornada se asigna exclusivamente desde la ficha del colaborador.
-- Ninguna alta ni aprobación de documento debe crear un tramo implícito.

DROP TRIGGER IF EXISTS trg_crear_jornada_alta_operativo ON public.personal_operativo;
DROP TRIGGER IF EXISTS trg_crear_jornada_alta_admin ON public.personal_administrativo;
DROP TRIGGER IF EXISTS trg_documento_aprobado_crear_jornada ON public.personal_documentos;

DROP FUNCTION IF EXISTS public.trg_crear_jornada_alta_personal();
DROP FUNCTION IF EXISTS public.trg_documento_aprobado_crear_jornada();

SELECT pg_notify('pgrst', 'reload schema');
