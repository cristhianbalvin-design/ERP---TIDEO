-- 636: calcular_habilitaciones_personal elige el contrato que cubre HOY.
-- Al crear una renovacion futura, _nuevo_contrato_periodo_impl_414 archiva el periodo anterior
-- aunque siga cubriendo hoy. El periodo archivado sigue contando mientras su sucesor no haya
-- empezado (relevo por fecha); una renovacion futura no desplaza al contrato actual; pendientes
-- superados por un aprobado activo posterior no se muestran como "en revision"; un contrato con
-- renovacion aprobada contigua no se marca "por vencer".
-- Parte de pg_get_functiondef remoto vigente. Verificado antes con
-- _calcular_habilitaciones_personal_v2_prueba: en todos los tenants solo cambian 2 filas de PRUEBA.
create or replace function public.calcular_habilitaciones_personal(p_empresa_id text)
 RETURNS TABLE(personal_id text, personal_tipo text, tiene_cargo boolean, cargo_id text, tipo_documento_id text, tipo_doc_nombre text, tipo_doc_codigo text, tipo_doc_ambito text, categoria text, es_habilitante boolean, requiere_validacion boolean, exige_vencimiento boolean, dias_alerta integer, obligatorio boolean, estado text, fecha_vencimiento date, dias_restantes integer, tipo_sucesor_id text, documento_padre_tipo_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH personal AS (
    SELECT id, 'operativo'::text AS personal_tipo, cargo_id
    FROM   public.personal_operativo
    WHERE  empresa_id = p_empresa_id
      AND  estado     <> 'inactivo'
    UNION ALL
    SELECT id, 'administrativo'::text AS personal_tipo, cargo_id
    FROM   public.personal_administrativo
    WHERE  empresa_id = p_empresa_id
  ),
  doc_activo AS (
    SELECT DISTINCT ON (d.personal_id, d.tipo_documento_id)
      d.personal_id,
      d.tipo_documento_id,
      d.estado_validacion,
      d.fecha_vencimiento,
      d.es_indefinido
    FROM   public.personal_documentos d
    WHERE  d.empresa_id        = p_empresa_id
      AND  d.tipo_documento_id IS NOT NULL
      AND  (
            d.activo = true
            OR (d.estado_validacion = 'pendiente'
                AND NOT EXISTS (
                  SELECT 1 FROM public.personal_documentos n
                  WHERE n.empresa_id = d.empresa_id AND n.personal_id = d.personal_id
                    AND n.tipo_documento_id = d.tipo_documento_id
                    AND n.activo = true AND n.estado_validacion = 'aprobado'
                    AND n.creado_en > d.creado_en))
            OR (d.estado_validacion = 'aprobado'
                AND d.contrato_periodo_id IS NOT NULL
                AND d.contrato_referencia_id IS NULL
                AND COALESCE(d.periodo_fecha_inicio, d.fecha_emision) <= current_date
                AND (COALESCE(d.es_indefinido, false)
                     OR COALESCE(d.periodo_fecha_fin, d.fecha_vencimiento) >= current_date)
                AND NOT EXISTS (
                  SELECT 1 FROM public.personal_documentos v
                  WHERE v.empresa_id = d.empresa_id
                    AND v.contrato_periodo_id = d.contrato_periodo_id
                    AND v.id <> d.id
                    AND v.estado_validacion <> 'rechazado'
                    AND (v.version > d.version OR (v.version = d.version AND v.creado_en > d.creado_en)))
                AND EXISTS (
                  SELECT 1 FROM public.personal_documentos s
                  WHERE s.empresa_id = d.empresa_id
                    AND s.personal_id = d.personal_id
                    AND s.contrato_periodo_predecesor_id = d.contrato_periodo_id
                    AND s.estado_validacion <> 'rechazado'
                    AND COALESCE(s.periodo_fecha_inicio, s.fecha_emision) > current_date)
                AND NOT EXISTS (
                  SELECT 1 FROM public.personal_documentos s2
                  WHERE s2.empresa_id = d.empresa_id
                    AND s2.personal_id = d.personal_id
                    AND s2.contrato_periodo_predecesor_id = d.contrato_periodo_id
                    AND s2.estado_validacion <> 'rechazado'
                    AND COALESCE(s2.periodo_fecha_inicio, s2.fecha_emision) <= current_date))
           )
    ORDER  BY d.personal_id, d.tipo_documento_id,
              CASE WHEN COALESCE(d.periodo_fecha_inicio, d.fecha_emision) > current_date THEN 1 ELSE 0 END,
              CASE WHEN d.estado_validacion = 'pendiente' THEN 1 ELSE 2 END,
              d.fecha_vencimiento DESC NULLS LAST, d.creado_en DESC
  ),
  estado_docs AS (
    SELECT
      p.id              AS personal_id,
      p.personal_tipo,
      true              AS tiene_cargo,
      p.cargo_id,
      cdr.tipo_documento_id,
      tde.nombre        AS tipo_doc_nombre,
      tde.codigo        AS tipo_doc_codigo,
      tde.ambito        AS tipo_doc_ambito,
      tde.categoria     AS categoria,
      tde.es_habilitante,
      tde.requiere_validacion,
      tde.exige_vencimiento,
      tde.dias_alerta,
      tde.tipo_sucesor_id,
      tde.documento_padre_tipo_id,
      cdr.obligatorio,
      d.estado_validacion,
      d.fecha_vencimiento,
      d.es_indefinido,
      tde.dias_alerta   AS _dias,
      EXISTS (
        SELECT 1 FROM public.personal_documentos pd_suc
        WHERE pd_suc.empresa_id = p_empresa_id
          AND pd_suc.personal_id = p.id
          AND pd_suc.tipo_documento_id = tde.tipo_sucesor_id
          AND pd_suc.estado_validacion = 'aprobado'
          AND pd_suc.activo = true
      ) AS tiene_sucesor_aprobado,
      EXISTS (
        SELECT 1 FROM public.personal_documentos rf
        WHERE rf.empresa_id = p_empresa_id
          AND rf.personal_id = p.id
          AND rf.tipo_documento_id = cdr.tipo_documento_id
          AND rf.contrato_referencia_id IS NULL
          AND rf.estado_validacion = 'aprobado'
          AND COALESCE(rf.periodo_fecha_inicio, rf.fecha_emision) > current_date
          AND d.fecha_vencimiento IS NOT NULL
          AND COALESCE(rf.periodo_fecha_inicio, rf.fecha_emision) <= d.fecha_vencimiento + 1
      ) AS tiene_renovacion_aprobada
    FROM   personal p
    JOIN   public.cargo_documento_requisito  cdr
             ON  cdr.cargo_id   = p.cargo_id
             AND cdr.empresa_id = p_empresa_id
    JOIN   public.tipos_documento_empresa    tde
             ON  tde.id     = cdr.tipo_documento_id
             AND tde.estado = 'activo'
    LEFT   JOIN doc_activo d
             ON  d.personal_id       = p.id
             AND d.tipo_documento_id = cdr.tipo_documento_id
    WHERE  p.cargo_id IS NOT NULL
  )
  SELECT
    personal_id, personal_tipo, tiene_cargo, cargo_id, tipo_documento_id, tipo_doc_nombre, tipo_doc_codigo, tipo_doc_ambito,
    COALESCE(categoria, 'Otros') AS categoria,
    es_habilitante, requiere_validacion, exige_vencimiento, dias_alerta, obligatorio,
    CASE
      WHEN tipo_sucesor_id IS NOT NULL AND tiene_sucesor_aprobado                THEN 'historico'
      WHEN es_indefinido                                                         THEN 'vigente'
      WHEN estado_validacion IS NULL                                             THEN 'falta'
      WHEN estado_validacion = 'rechazado'                                       THEN 'rechazado'
      WHEN estado_validacion = 'pendiente' AND requiere_validacion               THEN 'en_revision'
      WHEN exige_vencimiento AND fecha_vencimiento IS NULL                       THEN 'incompleto'
      WHEN exige_vencimiento AND fecha_vencimiento < current_date                THEN 'vencido'
      WHEN exige_vencimiento AND tiene_renovacion_aprobada                       THEN 'vigente'
      WHEN exige_vencimiento
           AND fecha_vencimiento <= current_date + (_dias || ' days')::interval THEN 'por_vencer'
      ELSE 'vigente'
    END AS estado,
    fecha_vencimiento,
    CASE
      WHEN exige_vencimiento AND fecha_vencimiento IS NOT NULL AND NOT COALESCE(es_indefinido, false)
        THEN (fecha_vencimiento - current_date)::integer
      ELSE NULL
    END AS dias_restantes,
    tipo_sucesor_id,
    documento_padre_tipo_id
  FROM estado_docs
  UNION ALL
  SELECT id, personal_tipo, false, null, null, null, null, null, null, null, null, null, null, null,
         'sin_cargo', null, null, null, null
  FROM personal
  WHERE cargo_id IS NULL;
$function$;

grant execute on function public.calcular_habilitaciones_personal(text) to authenticated, service_role;

-- Comprobacion: la funcion definitiva coincide fila a fila con la version de prueba en todos los tenants
do $$
declare v_dif integer;
begin
  if to_regprocedure('public._calcular_habilitaciones_personal_v2_prueba(text)') is not null then
    execute $q$
      select count(*) from (
        (select e.id, h.* from public.empresas e, lateral public.calcular_habilitaciones_personal(e.id) h
         except all
         select e.id, h.* from public.empresas e, lateral public._calcular_habilitaciones_personal_v2_prueba(e.id) h)
        union all
        (select e.id, h.* from public.empresas e, lateral public._calcular_habilitaciones_personal_v2_prueba(e.id) h
         except all
         select e.id, h.* from public.empresas e, lateral public.calcular_habilitaciones_personal(e.id) h)
      ) x $q$ into v_dif;
    if v_dif <> 0 then
      raise exception '636: la funcion definitiva difiere de la version verificada (% filas)', v_dif;
    end if;
  end if;
  if not has_function_privilege('authenticated', 'public.calcular_habilitaciones_personal(text)', 'execute') then
    raise exception '636: authenticated perdio el permiso de ejecucion';
  end if;
end $$;
