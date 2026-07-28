-- Corrige únicamente la comparación de tipos en el gate de superadmin.
-- usuarios.id es text y auth.uid() retorna uuid.

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
        WHERE u.id = auth.uid()::text AND r.es_superadmin = true
    ) THEN
        RAISE EXCEPTION 'Acceso denegado: solo superadmin TIDEO puede consultar la matriz general';
    END IF;

    -- Iterar por cada tenant activo (evitar iterar todos los eliminados si existieran, asumiendo todos)
    FOR v_tenant IN (SELECT id FROM public.empresas)
    LOOP
        FOR v_config IN (
            SELECT id, tabla_principal
            FROM public.tideo_salud_configuracion
            WHERE activa = true
              AND tabla_principal IS NOT NULL
              AND tabla_principal <> ''
        )
        LOOP
            BEGIN
                v_sql := format(
                    'SELECT count(*) FROM public.%I WHERE empresa_id = %L',
                    v_config.tabla_principal,
                    v_tenant.id
                );
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
