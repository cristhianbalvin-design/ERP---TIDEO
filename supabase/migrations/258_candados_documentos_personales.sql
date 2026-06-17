-- ============================================================================
-- 258 · Candados Estructurales para Documentos Personales
-- ============================================================================

-- ── 1. Candado 2: Flag en empresa_config para prevenir backfill ─────────────
ALTER TABLE public.empresa_config 
ADD COLUMN IF NOT EXISTS backfill_periodos_documentos_aplicado boolean DEFAULT false;

UPDATE public.empresa_config 
SET backfill_periodos_documentos_aplicado = true;

-- NOTA TÉCNICA (DEUDA RESUELTA): La migración 254 (backfill) ya fue ejecutada en
-- los tenants existentes en Supabase. Se ha actualizado el código fuente de la 254
-- localmente añadiendo la verificación de este flag, de modo que en nuevos despliegues
-- el backfill solo correrá si el flag es false.

-- ── 2. Candado 4: tipo_documento_id explícito ───────────────────────────────
DO $$
BEGIN
    -- Añadir columna si no existe
    ALTER TABLE public.personal_documentos 
    ADD COLUMN IF NOT EXISTS tipo_documento_id uuid;

    -- Si existía con otro tipo como text, castearlo
    -- ALTER TABLE public.personal_documentos ALTER COLUMN tipo_documento_id TYPE uuid USING (tipo_documento_id::uuid);

    -- Añadir Foreign Key de manera idempotente
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_personal_documentos_tipo_documento_id'
    ) THEN
        ALTER TABLE public.personal_documentos
        ADD CONSTRAINT fk_personal_documentos_tipo_documento_id 
        FOREIGN KEY (tipo_documento_id) REFERENCES public.tipos_documento_empresa(id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso en configuración de tipo_documento_id: %', SQLERRM;
END $$;


-- ── 3. Candado 1: Trigger de Swap "Un solo activo por grupo" ────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_swap_activo_documento_grupo()
RETURNS trigger AS $$
BEGIN
    -- Desactivar todas las otras versiones del mismo grupo
    UPDATE public.personal_documentos
    SET activo = false
    WHERE periodo_grupo_id = NEW.periodo_grupo_id
      AND id != NEW.id
      AND activo = true;
      
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_swap_activo_documento_grupo ON public.personal_documentos;

CREATE TRIGGER trg_swap_activo_documento_grupo
AFTER INSERT OR UPDATE OF activo, periodo_grupo_id
ON public.personal_documentos
FOR EACH ROW
WHEN (NEW.activo = true AND NEW.periodo_grupo_id IS NOT NULL)
EXECUTE FUNCTION public.fn_trg_swap_activo_documento_grupo();
