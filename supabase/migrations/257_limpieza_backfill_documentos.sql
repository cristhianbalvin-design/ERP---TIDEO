-- ============================================================================
-- 257 · Limpieza Quirúrgica de Backfill de Documentos Corruptos
-- ============================================================================

DO $$
DECLARE
    rec record;
    v_grupo_id uuid;
BEGIN
    -- OPERACIÓN 1: Eliminar el período futuro completo
    -- Estos son v1, v2, v3 del período archivado 2026-06-23 -> 2026-07-23 (MATRIZ)
    IF EXISTS (
        SELECT 1 FROM public.personal_documentos 
        WHERE tipo_doc = 'Contrato Laboral' 
          AND fecha_vencimiento = '2026-07-23' 
          AND nombre_archivo LIKE '%MATRIZ%'
          AND activo = true
    ) THEN
        RAISE EXCEPTION 'Hay versiones de MATRIZ futuras con activo=true. Limpieza abortada.';
    END IF;

    FOR rec IN 
        SELECT id FROM public.personal_documentos 
        WHERE tipo_doc = 'Contrato Laboral' 
          AND fecha_vencimiento = '2026-07-23' 
          AND nombre_archivo LIKE '%MATRIZ%'
    LOOP
        DELETE FROM public.personal_documentos WHERE id = rec.id;
        RAISE NOTICE 'limpieza_backfill_254_255: Eliminado documento MATRIZ futuro id=%', rec.id;
    END LOOP;


    -- OPERACIÓN 2: Eliminar la versión huérfana del período activo
    -- (COT-2026-0506-v3 como v1 de 2026-06-22)
    IF EXISTS (
        SELECT 1 FROM public.personal_documentos 
        WHERE tipo_doc = 'Contrato Laboral' 
          AND nombre_archivo LIKE '%COT-2026-0506-v3%' 
          AND version = 1 
          AND fecha_vencimiento = '2026-06-22'
          AND activo = true
    ) THEN
        RAISE EXCEPTION 'El documento huérfano COT-2026-0506-v3 tiene activo=true. Limpieza abortada.';
    END IF;

    FOR rec IN 
        SELECT id, periodo_grupo_id FROM public.personal_documentos 
        WHERE tipo_doc = 'Contrato Laboral' 
          AND nombre_archivo LIKE '%COT-2026-0506-v3%' 
          AND version = 1 
          AND fecha_vencimiento = '2026-06-22'
    LOOP
        v_grupo_id := rec.periodo_grupo_id;
        DELETE FROM public.personal_documentos WHERE id = rec.id;
        RAISE NOTICE 'limpieza_backfill_254_255: Eliminado documento huérfano id=%', rec.id;
    END LOOP;

    -- OPERACIÓN 3: Renumerar versiones del período activo
    IF v_grupo_id IS NOT NULL THEN
        WITH renum AS (
            SELECT id, row_number() OVER (ORDER BY creado_en ASC) as nueva_version
            FROM public.personal_documentos
            WHERE periodo_grupo_id = v_grupo_id
        )
        UPDATE public.personal_documentos pd
        SET version = r.nueva_version
        FROM renum r
        WHERE pd.id = r.id;
        
        RAISE NOTICE 'limpieza_backfill_254_255: Renumerado grupo %', v_grupo_id;
    END IF;

END;
$$ LANGUAGE plpgsql;
