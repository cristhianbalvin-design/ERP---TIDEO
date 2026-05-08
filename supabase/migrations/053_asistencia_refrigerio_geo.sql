-- Añadir columnas usadas por el reloj móvil y el backoffice de asistencia.
ALTER TABLE public.registros_asistencia
ADD COLUMN IF NOT EXISTS latitud text,
ADD COLUMN IF NOT EXISTS longitud text,
ADD COLUMN IF NOT EXISTS latitud_salida text,
ADD COLUMN IF NOT EXISTS longitud_salida text,
ADD COLUMN IF NOT EXISTS refrigerio_tomado_minutos numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS horas_trabajadas_min integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tardanza_min integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS horas_extra_min integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS es_falta boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS justificada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_falta text,
ADD COLUMN IF NOT EXISTS notas text;

ALTER TABLE public.registros_asistencia
ALTER COLUMN id SET DEFAULT ('asis_' || replace(gen_random_uuid()::text, '-', ''));

UPDATE public.registros_asistencia
SET tardanza_min = COALESCE(NULLIF(tardanza_min, 0), tardanza_minutos, 0),
    horas_extra_min = COALESCE(NULLIF(horas_extra_min, 0), round(COALESCE(horas_extra, 0) * 60)::integer, 0),
    es_falta = COALESCE(es_falta, false) OR estado IN ('falta', 'falta_justificada'),
    justificada = COALESCE(justificada, false) OR estado = 'falta_justificada',
    motivo_falta = COALESCE(motivo_falta, justificacion);

DROP POLICY IF EXISTS asistencia_self_select ON public.registros_asistencia;
CREATE POLICY asistencia_self_select ON public.registros_asistencia
  FOR SELECT USING (
    public.usuario_tiene_empresa(empresa_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.personal_operativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      OR EXISTS (
        SELECT 1
        FROM public.personal_administrativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

DROP POLICY IF EXISTS asistencia_self_insert ON public.registros_asistencia;
CREATE POLICY asistencia_self_insert ON public.registros_asistencia
  FOR INSERT WITH CHECK (
    public.usuario_tiene_empresa(empresa_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.personal_operativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      OR EXISTS (
        SELECT 1
        FROM public.personal_administrativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

DROP POLICY IF EXISTS asistencia_self_update ON public.registros_asistencia;
CREATE POLICY asistencia_self_update ON public.registros_asistencia
  FOR UPDATE USING (
    public.usuario_tiene_empresa(empresa_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.personal_operativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      OR EXISTS (
        SELECT 1
        FROM public.personal_administrativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  )
  WITH CHECK (
    public.usuario_tiene_empresa(empresa_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.personal_operativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      OR EXISTS (
        SELECT 1
        FROM public.personal_administrativo p
        WHERE p.empresa_id = registros_asistencia.empresa_id
          AND p.id = registros_asistencia.trabajador_id
          AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );
