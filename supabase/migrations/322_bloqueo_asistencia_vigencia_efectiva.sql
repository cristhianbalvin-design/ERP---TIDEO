-- 322 — Fase 3: bloqueo de asistencia basado en vigencia_efectiva
-- Corrige el bug de estado_validacion rígido: el job procesar_sin_contrato_digital
-- exigía estado_validacion = 'aprobado' para considerar contrato vigente, por lo
-- que un contrato con fechas que cubren hoy pero pendiente de validación
-- equivalía a "no tiene contrato" y bloqueaba asistencia.
--
-- Decisiones de negocio (confirmadas antes de implementar):
--   1. vigente por fechas + estado pendiente/pendiente_firma -> NO bloquear.
--      La validación administrativa es flujo interno de RRHH, no castiga al
--      trabajador. El estado queda como dato informativo (Fase 4 lo mostrará).
--   2. vigente por fechas + estado 'rechazado' -> SÍ bloquear, con motivo
--      distinguible 'Contrato rechazado' (un documento rechazado no es válido).
--   3. El job sigue como cron diario actualizando asistencia_bloqueada; el
--      contrato del flag no cambia (Fase 4 decidirá tiempo real donde aplique).
--   4. vigencia_efectiva (Fase 2, migración 319) se reorganiza en un core
--      interno sin guard de tenant (para jobs/triggers de sistema, sin GRANT a
--      authenticated) + wrapper público con firma, guard y contrato idénticos.
--      Es el único retoque a Fase 2 y no cambia su comportamiento observable.
--
-- Motivos de bloqueo gestionados por el job (nuevos legibles + legado):
--   'Sin contrato digital registrado' | 'Contrato vencido' | 'Contrato rechazado'
--   'job_diario_sin_contrato' (legado, solo se conserva para poder desbloquear).

-- ── 1. Core interno: misma lógica que 319, sin guard de tenant ───────────────
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
    ORDER  BY d.personal_id, d.fecha_emision DESC NULLS LAST, d.creado_en DESC
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

COMMENT ON FUNCTION public.vigencia_efectiva_core(text, date, text, text) IS
'Núcleo de vigencia_efectiva SIN guard de tenant. Solo para funciones de
sistema (jobs pg_cron, triggers SECURITY DEFINER). No exponer a authenticated:
el punto de entrada para usuarios es public.vigencia_efectiva. La semántica de
los campos está documentada en el COMMENT de vigencia_efectiva (migración 319).';

REVOKE ALL ON FUNCTION public.vigencia_efectiva_core(text, date, text, text) FROM public;

-- ── 2. vigencia_efectiva pasa a ser wrapper (mismo contrato que 319) ─────────
CREATE OR REPLACE FUNCTION public.vigencia_efectiva(
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
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  RETURN QUERY
  SELECT * FROM public.vigencia_efectiva_core(p_empresa_id, p_fecha, p_personal_id, p_personal_tipo);
END;
$$;

REVOKE ALL ON FUNCTION public.vigencia_efectiva(text, date, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.vigencia_efectiva(text, date, text, text) TO authenticated;

-- ── 3. Job diario: decide por vigencia_efectiva, no por estado_validacion ────
create or replace function public.procesar_sin_contrato_digital(
  p_empresa_id text default null,
  p_is_mock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r               record;
  v_debe_bloquear boolean;
  v_motivo        text;
  v_motivos_job   constant text[] := array[
    'Sin contrato digital registrado', 'job_diario_sin_contrato',
    'Contrato vencido', 'Contrato rechazado'
  ];
  v_afectados     integer := 0;
  v_desbloqueados integer := 0;
  v_detalle       jsonb := '[]'::jsonb;
begin
  for r in
    select p.id, p.empresa_id, p.nombre, p.tipo,
           p.asistencia_bloqueada, p.asistencia_bloqueada_motivo,
           v.vigente, v.estado_validacion, v.contrato_documento_id
    from (
      select id, empresa_id, nombre, asistencia_bloqueada, asistencia_bloqueada_motivo,
             'operativo'::text as tipo
      from public.personal_operativo
      where coalesce(estado, 'activo') = 'activo'
        and coalesce(cargo_confianza, false) = false
        and (p_empresa_id is null or empresa_id = p_empresa_id)

      union all

      select id, empresa_id, nombre, asistencia_bloqueada, asistencia_bloqueada_motivo,
             'administrativo'::text
      from public.personal_administrativo
      where coalesce(estado, 'activo') = 'activo'
        and coalesce(cargo_confianza, false) = false
        and (p_empresa_id is null or empresa_id = p_empresa_id)
    ) p
    cross join lateral public.vigencia_efectiva_core(p.empresa_id, current_date, p.id, p.tipo) v
  loop
    -- La vigencia por fechas la decide vigencia_efectiva; estado_validacion
    -- solo bloquea cuando el documento fue rechazado explícitamente.
    v_debe_bloquear := (not coalesce(r.vigente, false))
                       or r.estado_validacion = 'rechazado';

    v_motivo := case
      when r.contrato_documento_id is null then 'Sin contrato digital registrado'
      when not coalesce(r.vigente, false)  then 'Contrato vencido'
      else 'Contrato rechazado'
    end;

    if v_debe_bloquear then
      if coalesce(r.asistencia_bloqueada, false) = false or r.asistencia_bloqueada_motivo is null then
        v_afectados := v_afectados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'accion', 'bloquear',
          'motivo', v_motivo, 'tipo', r.tipo
        );

        if not p_is_mock then
          if r.tipo = 'operativo' then
            update public.personal_operativo
               set asistencia_bloqueada        = true,
                   asistencia_bloqueada_motivo = v_motivo,
                   asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
             where id = r.id and empresa_id = r.empresa_id;
          else
            update public.personal_administrativo
               set asistencia_bloqueada        = true,
                   asistencia_bloqueada_motivo = v_motivo,
                   asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
             where id = r.id and empresa_id = r.empresa_id;
          end if;
        end if;
      end if;
    else
      -- Solo desbloquea bloqueos puestos por este mecanismo; los manuales no se tocan.
      if coalesce(r.asistencia_bloqueada, false) = true
         and r.asistencia_bloqueada_motivo = any (v_motivos_job) then
        v_desbloqueados := v_desbloqueados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'accion', 'desbloquear', 'tipo', r.tipo
        );

        if not p_is_mock then
          if r.tipo = 'operativo' then
            update public.personal_operativo
               set asistencia_bloqueada        = false,
                   asistencia_bloqueada_motivo = null,
                   asistencia_bloqueada_en     = null
             where id = r.id and empresa_id = r.empresa_id;
          else
            update public.personal_administrativo
               set asistencia_bloqueada        = false,
                   asistencia_bloqueada_motivo = null,
                   asistencia_bloqueada_en     = null
             where id = r.id and empresa_id = r.empresa_id;
          end if;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'is_mock', p_is_mock,
    'bloqueos_nuevos', v_afectados,
    'desbloqueos', v_desbloqueados,
    'detalle', v_detalle
  );
end;
$$;

revoke all on function public.procesar_sin_contrato_digital(text, boolean) from public;
grant execute on function public.procesar_sin_contrato_digital(text, boolean) to authenticated;

-- ── 4. Trigger de desbloqueo inmediato: mismo criterio que el job ────────────
-- Antes exigía estado_validacion in ('aprobado','validado') e ignoraba adendas.
-- Ahora evalúa vigencia_efectiva_core: desbloquea si la persona queda vigente
-- por fechas y su documento determinante no está rechazado.
create or replace function public.desbloquear_asistencia_por_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relevante boolean := false;
  v_vig       record;
begin
  -- Pre-filtro barato: solo documentos que pueden afectar la vigencia
  -- (contrato principal por catálogo o texto legado, o adenda vinculada).
  if new.contrato_referencia_id is not null then
    v_relevante := true;
  elsif new.tipo_documento_id is not null then
    select coalesce(t.captura_snapshot_laboral and t.documento_padre_tipo_id is null, false)
      into v_relevante
      from public.tipos_documento_empresa t
     where t.id = new.tipo_documento_id;
  end if;
  if not v_relevante then
    v_relevante :=
      lower(coalesce(new.tipo_doc, '')) like '%contrato%'
      or lower(coalesce(new.tipo_doc, '')) like '%adenda%';
  end if;

  if not v_relevante then
    return new;
  end if;

  select v.vigente, v.estado_validacion
    into v_vig
    from public.vigencia_efectiva_core(new.empresa_id, current_date, new.personal_id, new.personal_tipo) v;

  if coalesce(v_vig.vigente, false) and coalesce(v_vig.estado_validacion, '') <> 'rechazado' then
    if new.personal_tipo = 'operativo' then
      update public.personal_operativo
         set asistencia_bloqueada        = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en     = null
       where id          = new.personal_id
         and empresa_id  = new.empresa_id
         and asistencia_bloqueada = true
         and asistencia_bloqueada_motivo in (
               'Contrato vencido',
               'Sin contrato digital registrado',
               'job_diario_sin_contrato',
               'Contrato rechazado'
             );
    else
      update public.personal_administrativo
         set asistencia_bloqueada        = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en     = null
       where id          = new.personal_id
         and empresa_id  = new.empresa_id
         and asistencia_bloqueada = true
         and asistencia_bloqueada_motivo in (
               'Contrato vencido',
               'Sin contrato digital registrado',
               'job_diario_sin_contrato',
               'Contrato rechazado'
             );
    end if;
  end if;
  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');
