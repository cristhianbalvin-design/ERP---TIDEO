-- Fase 2.5: Mejoras a Salud de Implementacion para vista de Tenants

-- 1. Nuevo campo 'solo_interno'
ALTER TABLE public.tideo_salud_anotaciones ADD COLUMN IF NOT EXISTS solo_interno BOOLEAN DEFAULT false;

-- 2. Politicas para la configuracion (lectura para admins de tenant)
CREATE POLICY "Admin tenant read config" ON public.tideo_salud_configuracion
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    JOIN public.roles r ON r.id = ue.rol_id
    WHERE ue.user_id = auth.uid() AND ue.estado = 'activo' AND r.es_admin_empresa = true
  )
);

-- 3. Politicas para las anotaciones (lectura/escritura para admins de tenant)
-- NOTA: El RLS filtra y oculta automaticamente si solo_interno es true
CREATE POLICY "Admin tenant read anotaciones" ON public.tideo_salud_anotaciones
FOR SELECT USING (
  public.usuario_es_admin_empresa(empresa_id)
  AND solo_interno = false
);

CREATE POLICY "Admin tenant update anotaciones" ON public.tideo_salud_anotaciones
FOR UPDATE USING (
  public.usuario_es_admin_empresa(empresa_id)
  AND solo_interno = false
);

CREATE POLICY "Admin tenant insert anotaciones" ON public.tideo_salud_anotaciones
FOR INSERT WITH CHECK (
  public.usuario_es_admin_empresa(empresa_id)
  AND solo_interno = false
);

-- 4. RPC Local para conteo (SECURITY INVOKER = el RLS actual del usuario aplicara)
CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos_local(p_tenant_id TEXT)
RETURNS TABLE (
    configuracion_id UUID,
    tenant_id TEXT,
    conteo BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_config RECORD;
    v_count BIGINT;
    v_sql TEXT;
BEGIN
    -- Validacion rapida para evitar que un usuario pase un tenant_id ajeno
    IF NOT public.usuario_es_admin_empresa(p_tenant_id) THEN
        RAISE EXCEPTION 'Acceso denegado: solo admin de la empresa puede consultar sus metricas de implementacion.';
    END IF;

    -- Iterar por cada configuracion activa
    FOR v_config IN (SELECT id, tabla_principal FROM public.tideo_salud_configuracion WHERE activa = true AND tabla_principal IS NOT NULL AND tabla_principal <> '')
    LOOP
        BEGIN
            -- El query en si es simple, pero como es SECURITY INVOKER, 
            -- cualquier tabla que el usuario no pueda leer fallara o dara 0 si el RLS le oculta las filas.
            v_sql := format('SELECT count(*) FROM public.%I WHERE empresa_id = %L', v_config.tabla_principal, p_tenant_id);
            EXECUTE v_sql INTO v_count;
            
            configuracion_id := v_config.id;
            tenant_id := p_tenant_id;
            conteo := v_count;
            RETURN NEXT;
        EXCEPTION WHEN OTHERS THEN
            configuracion_id := v_config.id;
            tenant_id := p_tenant_id;
            conteo := 0;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$;
