-- 323 — Fase 3 (cierre): contrato base ya iniciado + activación de pg_cron
--
-- 1. Fix a vigencia_efectiva_core detectado en la validación de la 322 con
--    datos reales: cuando una persona tiene un contrato vigente hoy Y su
--    renovación ya precargada (fecha_emision futura), el criterio "más
--    reciente por fecha_emision" elegía la renovación que aún no inicia y
--    concluía vigente = false (falso bloqueo). Casos reales: Andrea Molina
--    (contrato hasta 31/07 + renovación de agosto) y Karyme Arellano.
--    Ahora el contrato base es el más reciente YA INICIADO en la fecha
--    consultada (o sin fecha_emision, que siempre se trató como iniciado);
--    solo si no existe ninguno se considera el futuro (vigente = false igual,
--    pero con fechas informativas del próximo ciclo).
--
-- 2. pg_cron no estaba instalado en el proyecto: el registro del schedule en
--    la migración 249 era condicional a que existiera el esquema cron y falló
--    en silencio, por lo que la rutina diaria de contratos nunca corrió.
--    Se instala la extensión y se registra el job (07:00 PE = 12:00 UTC).

-- ── 1. vigencia_efectiva_core: preferir contratos ya iniciados ───────────────
CREATE OR REPLACE FUNCTION public.vigencia_efectiva_core(
  p_empresa_id     text,
  p_fecha          date DEFAULT current_date,
  p_personal_id    text DEFAULT NULL,
  p_personal_tipo  text DEFAULT NULL
)
RETURNS TABLE (
  empresa_id            text,
  personal_id           text,
  personal_tipo         text,
  vigente               boolean,
  fecha_desde           date,
  fecha_hasta           date,
  es_indefinido         boolean,
  estado_validacion     text,
  contrato_documento_id text,
  contrato_periodo_id   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH personas AS (
    SELECT po.id AS personal_id, 'operativo'::text AS personal_tipo
    FROM   public.personal_operativo po
    WHERE  po.empresa_id = p_empresa_id
      AND  (p_personal_id IS NULL OR po.id = p_personal_id)
      AND  (p_personal_tipo IS NULL OR p_personal_tipo = 'operativo')

    UNION ALL

    SELECT pa.id, 'administrativo'::text
    FROM   public.personal_administrativo pa
    WHERE  pa.empresa_id = p_empresa_id
      AND  (p_personal_id IS NULL OR pa.id = p_personal_id)
      AND  (p_personal_tipo IS NULL OR p_personal_tipo = 'administrativo')
  ),

  contrato_base AS (
    SELECT DISTINCT ON (d.personal_id)
      d.id                  AS contrato_id,
      d.personal_id,
      d.contrato_periodo_id,
      d.fecha_emision,
      d.fecha_vencimiento,
      COALESCE(d.es_indefinido, false) AS es_indefinido,
      d.estado_validacion
    FROM   public.personal_documentos d
    LEFT   JOIN public.tipos_documento_empresa t ON t.id = d.tipo_documento_id
    WHERE  d.empresa_id = p_empresa_id
      AND  d.activo = true
      AND  (
        (t.captura_snapshot_laboral = true AND t.documento_padre_tipo_id IS NULL)
        OR (
          lower(COALESCE(d.tipo_doc, '')) LIKE '%contrato%'
          AND lower(COALESCE(d.tipo_doc, '')) NOT LIKE '%adenda%'
        )
      )
    -- Contratos ya iniciados (o sin fecha_emision) antes que renovaciones
    -- futuras; dentro de cada grupo, el más reciente.
    ORDER  BY d.personal_id,
              CASE WHEN d.fecha_emision IS NULL OR d.fecha_emision <= p_fecha THEN 0 ELSE 1 END,
              d.fecha_emision DESC NULLS LAST,
              d.creado_en DESC
  ),

  adenda_vigente AS (
    SELECT DISTINCT ON (a.contrato_referencia_id)
      a.contrato_referencia_id AS contrato_id,
      a.fecha_vencimiento      AS fecha_vencimiento,
      a.estado_validacion      AS estado_validacion
    FROM   public.personal_documentos a
    WHERE  a.empresa_id = p_empresa_id
      AND  a.contrato_referencia_id IS NOT NULL
      AND  a.fecha_vencimiento IS NOT NULL
    ORDER  BY a.contrato_referencia_id,
              COALESCE(a.fecha_vigencia_cambio, a.fecha_emision) DESC NULLS LAST,
              a.creado_en DESC
  )

  SELECT
    p_empresa_id,
    p.personal_id,
    p.personal_tipo,
    CASE
      WHEN cb.contrato_id IS NULL                              THEN false
      WHEN p_fecha < cb.fecha_emision                          THEN false
      WHEN cb.es_indefinido                                    THEN true
      WHEN COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento) IS NULL THEN true
      ELSE p_fecha <= COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento)
    END AS vigente,
    cb.fecha_emision AS fecha_desde,
    CASE WHEN cb.es_indefinido THEN NULL
         ELSE COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento)
    END AS fecha_hasta,
    cb.es_indefinido,
    CASE WHEN av.fecha_vencimiento IS NOT NULL THEN av.estado_validacion
         ELSE cb.estado_validacion
    END AS estado_validacion,
    cb.contrato_id AS contrato_documento_id,
    cb.contrato_periodo_id
  FROM personas p
  LEFT JOIN contrato_base   cb ON cb.personal_id = p.personal_id
  LEFT JOIN adenda_vigente  av ON av.contrato_id  = cb.contrato_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vigencia_efectiva_core(text, date, text, text) FROM public;

-- ── 2. Instalar pg_cron y registrar la rutina diaria de contratos ────────────
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (select 1 from cron.job where jobname = 'rutina-diaria-contratos') then
      perform cron.schedule(
        'rutina-diaria-contratos',
        '0 12 * * *',
        'select public.procesar_rutina_diaria_contratos();'
      );
    end if;
  else
    raise notice 'pg_cron no disponible: registrar rutina-diaria-contratos manualmente';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
