-- Fase 3: Correcciones a Salud de Implementacion

-- 1. Modificar tabla de anotaciones (doble responsable)
ALTER TABLE public.tideo_salud_anotaciones DROP COLUMN IF EXISTS responsable;
ALTER TABLE public.tideo_salud_anotaciones ADD COLUMN IF NOT EXISTS responsable_tideo TEXT;
ALTER TABLE public.tideo_salud_anotaciones ADD COLUMN IF NOT EXISTS responsable_cliente TEXT;

-- 2. Corregir funciones RPC (SECURITY DEFINER para saltar RLS en conteos)
CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos()
RETURNS TABLE (
    configuracion_id UUID,
    tenant_id TEXT,
    conteo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_config RECORD;
    v_tenant RECORD;
    v_count BIGINT;
    v_sql TEXT;
BEGIN
    -- Validar superadmin localmente antes de continuar
    IF NOT EXISTS (
        SELECT 1 FROM public.roles r
        JOIN public.usuarios u ON u.rol = r.id
        WHERE u.id = auth.uid() AND r.es_superadmin = true
    ) THEN
        RAISE EXCEPTION 'Acceso denegado: solo superadmin TIDEO puede consultar la matriz general';
    END IF;

    -- Iterar por cada tenant activo (evitar iterar todos los eliminados si existieran, asumiendo todos)
    FOR v_tenant IN (SELECT id FROM public.empresas)
    LOOP
        FOR v_config IN (SELECT id, tabla_principal FROM public.tideo_salud_configuracion WHERE activa = true AND tabla_principal IS NOT NULL AND tabla_principal <> '')
        LOOP
            BEGIN
                v_sql := format('SELECT count(*) FROM public.%I WHERE empresa_id = %L', v_config.tabla_principal, v_tenant.id);
                EXECUTE v_sql INTO v_count;

                configuracion_id := v_config.id;
                tenant_id := v_tenant.id;
                conteo := v_count;
                RETURN NEXT;
            EXCEPTION WHEN OTHERS THEN
                configuracion_id := v_config.id;
                tenant_id := v_tenant.id;
                conteo := 0;
                RETURN NEXT;
            END;
        END LOOP;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos_local(p_tenant_id TEXT)
RETURNS TABLE (
    configuracion_id UUID,
    tenant_id TEXT,
    conteo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_config RECORD;
    v_count BIGINT;
    v_sql TEXT;
BEGIN
    -- Validar que quien llama ES admin de ESA empresa
    IF NOT public.usuario_es_admin_empresa(p_tenant_id) THEN
        RAISE EXCEPTION 'Acceso denegado: solo admin de la empresa puede consultar sus metricas';
    END IF;

    FOR v_config IN (SELECT id, tabla_principal FROM public.tideo_salud_configuracion WHERE activa = true AND tabla_principal IS NOT NULL AND tabla_principal <> '')
    LOOP
        BEGIN
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

-- 3. Naming consistente en la tabla base
UPDATE public.tideo_salud_configuracion SET pantalla = 'Empresas / Tenants' WHERE pantalla = 'Tenants';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Planes y Licencias' WHERE pantalla = 'Planes';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Cuentas y Contactos' WHERE pantalla = 'Cuentas';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Leads y Scoring' WHERE pantalla = 'Leads';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Personal Operativo' WHERE pantalla = 'Personal';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Control de Asistencia' WHERE pantalla = 'Asistencia';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Liquidación por Cese' WHERE pantalla = 'Liquidaciones';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Transporte y Guias' WHERE pantalla = 'Transporte';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Compras / Gastos' WHERE pantalla = 'Compras';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Caja Chica' WHERE pantalla = 'Caja';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Cuentas por Cobrar' WHERE pantalla = 'CxC';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Cuentas por Pagar' WHERE pantalla = 'CxP';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Tesoreria / Match' WHERE pantalla = 'Tesoreria';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Presupuesto vs Real' WHERE pantalla = 'Presupuestos';
UPDATE public.tideo_salud_configuracion SET pantalla = 'Metricas SaaS' WHERE pantalla = 'Métricas';
UPDATE public.tideo_salud_configuracion SET seccion = 'CRM & Marketing' WHERE seccion = 'CRM & Mktg';
