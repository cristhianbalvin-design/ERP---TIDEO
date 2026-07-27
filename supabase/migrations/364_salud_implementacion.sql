-- Migración para la pantalla de Salud de Implementación (Fase 2)

-- 1. Tabla de configuración
CREATE TABLE IF NOT EXISTS public.tideo_salud_configuracion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seccion TEXT NOT NULL,
    pantalla TEXT NOT NULL,
    tipo TEXT NOT NULL,
    tabla_principal TEXT,
    producto TEXT DEFAULT 'Administrativo',
    evidencia TEXT,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.tideo_salud_configuracion ENABLE ROW LEVEL SECURITY;

-- 2. Tabla de anotaciones humanas
CREATE TABLE IF NOT EXISTS public.tideo_salud_anotaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuracion_id UUID NOT NULL REFERENCES public.tideo_salud_configuracion(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    responsable TEXT, -- 'TIDEO', 'Cliente', 'Ambos', 'N/A'
    observacion TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(configuracion_id, empresa_id)
);

ALTER TABLE public.tideo_salud_anotaciones ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- (Solo superadmin TIDEO puede ver y modificar)
CREATE POLICY "Superadmin read config" ON public.tideo_salud_configuracion
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.usuarios u ON u.rol = r.id
    WHERE u.id = auth.uid()::text AND r.es_superadmin = true
  )
);

CREATE POLICY "Superadmin read anotaciones" ON public.tideo_salud_anotaciones
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.usuarios u ON u.rol = r.id
    WHERE u.id = auth.uid()::text AND r.es_superadmin = true
  )
);

CREATE POLICY "Superadmin modify anotaciones" ON public.tideo_salud_anotaciones
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.usuarios u ON u.rol = r.id
    WHERE u.id = auth.uid()::text AND r.es_superadmin = true
  )
);

-- 3. Función RPC para cálculo en vivo de los conteos
CREATE OR REPLACE FUNCTION public.get_salud_implementacion_conteos(p_tenant_ids TEXT[])
RETURNS TABLE (
    configuracion_id UUID,
    tenant_id TEXT,
    conteo BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER -- Se necesita para poder leer de múltiples tenants saltándose RLS en la función interna
AS $$
DECLARE
    v_config RECORD;
    v_tenant_id TEXT;
    v_count BIGINT;
    v_sql TEXT;
BEGIN
    -- Verificar si el usuario que llama es superadmin
    IF NOT EXISTS (
        SELECT 1 FROM public.roles r
        JOIN public.usuarios u ON u.rol = r.id
        WHERE u.id = auth.uid()::text AND r.es_superadmin = true
    ) THEN
        RAISE EXCEPTION 'Acceso denegado: solo superadmin TIDEO puede consultar la salud de implementacion';
    END IF;

    -- Iterar por cada configuración activa con tabla definida
    FOR v_config IN (SELECT id, tabla_principal FROM public.tideo_salud_configuracion WHERE activa = true AND tabla_principal IS NOT NULL AND tabla_principal <> '')
    LOOP
        -- Iterar por cada tenant solicitado
        FOREACH v_tenant_id IN ARRAY p_tenant_ids
        LOOP
            -- Armar query dinamico
            BEGIN
                v_sql := format('SELECT count(*) FROM public.%I WHERE empresa_id = %L', v_config.tabla_principal, v_tenant_id);
                EXECUTE v_sql INTO v_count;
                
                configuracion_id := v_config.id;
                tenant_id := v_tenant_id;
                conteo := v_count;
                RETURN NEXT;
            EXCEPTION WHEN OTHERS THEN
                -- Si la tabla no existe u otro error, retornamos 0
                configuracion_id := v_config.id;
                tenant_id := v_tenant_id;
                conteo := 0;
                RETURN NEXT;
            END;
        END LOOP;
    END LOOP;
END;
$$;

-- Poblado de tabla de configuración
INSERT INTO public.tideo_salud_configuracion (seccion, pantalla, tipo, tabla_principal, evidencia) VALUES
('Plataforma', 'Tenants', 'Maestro', 'empresas', 'App.jsx L357'),
('Plataforma', 'Planes', 'Maestro', 'planes_suscripcion', 'App.jsx L358'),
('Integraciones', 'API Keys', 'Config', 'api_keys', 'apiKeysService.js'),
('CRM & Mktg', 'Cuentas', 'Maestro', 'cuentas', 'crmService.js L186'),
('CRM & Mktg', 'Leads', 'Transaccional', 'leads', 'crmService.js L117'),
('CRM & Mktg', 'Marketing', 'Transaccional', 'campanas_marketing', 'campanasService.js'),
('CRM & Mktg', 'Pipeline', 'Transaccional', 'oportunidades', 'crmService.js L314'),
('CRM & Mktg', 'Actividades', 'Transaccional', 'actividades_comerciales', 'crmService.js L643'),
('Comercial', 'Agenda Comercial', 'Transaccional', 'agenda_comercial', 'crmService.js L606'),
('Comercial', 'Hoja Costeo', 'Transaccional', 'hojas_costeo', 'crmService.js L534'),
('Comercial', 'Cotizaciones', 'Transaccional', 'cotizaciones', 'crmService.js L376'),
('Comercial', 'OS Cliente', 'Transaccional', 'os_clientes', 'crmService.js L464'),
('Operaciones', 'Planner Eventos', 'Transaccional', 'planner_eventos', 'plannerService.js'),
('Operaciones', 'Cuadrillas', 'Maestro', 'cuadrillas', 'plannerService.js'),
('Operaciones', 'OT', 'Transaccional', 'ordenes_trabajo', 'operacionesService.js'),
('Operaciones', 'Partes', 'Transaccional', 'partes_diarios', 'operacionesService.js'),
('Operaciones', 'Cierre', 'Transaccional', 'ordenes_trabajo_cierres', 'operacionesService.js'),
('Operaciones', 'Tickets', 'Transaccional', 'tickets', 'ticketsService.js'),
('RRHH', 'Reclutamiento', 'Transaccional', 'reclutamiento_puestos', 'reclutamientoService.js'),
('RRHH', 'RRHH Operativo', 'Maestro', 'personal_operativo', 'rrhhService.js'),
('RRHH', 'RRHH Admin', 'Maestro', 'personal_administrativo', 'rrhhService.js'),
('RRHH', 'Asistencia', 'Transaccional', 'registros_asistencia', 'autoservicioEmpleadoService.js'),
('RRHH', 'Turnos', 'Transaccional', 'rrhh_turnos', 'rrhhService.js'),
('RRHH', 'Nomina', 'Transaccional', 'periodos_nomina', 'nominaService.js'),
('RRHH', 'Comisiones', 'Transaccional', 'comisiones', 'finanzasService.js'),
('RRHH', 'Solicitudes RRHH', 'Transaccional', 'solicitudes_rrhh', 'solicitudesRrhhService.js'),
('RRHH', 'Prestamos Personal', 'Transaccional', 'prestamos_personal', 'autoservicioEmpleadoService.js'),
('RRHH', 'Tareo Admin', 'Transaccional', 'tareos_admin', 'tareosAdminService.js'),
('RRHH', 'Control Horas', 'Transaccional', 'control_horas_extras', 'autoservicioEmpleadoService.js'),
('RRHH', 'Evaluaciones Desempeño', 'Transaccional', 'desempeno_evaluaciones', 'evaluacionesDesempenoService.js'),
('RRHH', 'Liquidaciones Cese', 'Transaccional', 'liquidaciones_cese', 'liquidacionesCeseService.js'),
('Logística', 'Inventario (Stock)', 'Transaccional', 'stock', 'inventarioService.js'),
('Logística', 'Inventario (Materiales)', 'Maestro', 'materiales', 'inventarioService.js'),
('Logística', 'Inventario (Almacenes)', 'Maestro', 'almacenes', 'inventarioService.js'),
('Logística', 'SOLPE', 'Transaccional', 'solicitudes_pedido', 'comprasService.js'),
('Logística', 'Remision', 'Transaccional', 'guias_remision', 'guiasService.js'),
('Compras', 'Proveedores', 'Maestro', 'proveedores', 'comprasService.js'),
('Compras', 'Cot. Compras', 'Transaccional', 'cotizaciones_compra', 'comprasService.js'),
('Compras', 'Ordenes Compra', 'Transaccional', 'ordenes_compra', 'comprasService.js'),
('Compras', 'Ordenes Servicio', 'Transaccional', 'ordenes_servicio', 'comprasService.js'),
('Compras', 'Recepciones', 'Transaccional', 'recepciones_compra', 'comprasService.js'),
('Compras', 'Compras Gastos', 'Transaccional', 'compras_gastos', 'finanzasService.js'),
('Admin/Finanzas', 'Ventas', 'Transaccional', 'ventas', 'ventasService.js'),
('Admin/Finanzas', 'Caja', 'Transaccional', 'caja_chica', 'cajaChicaService.js'),
('Admin/Finanzas', 'Activos Fijos', 'Maestro', 'activos', 'activosService.js'),
('Admin/Finanzas', 'Financiamiento', 'Transaccional', 'financiamientos', 'financiamientosService.js'),
('Admin/Finanzas', 'CxC', 'Transaccional', 'cxc', 'finanzasService.js'),
('Admin/Finanzas', 'CxP', 'Transaccional', 'cxp', 'finanzasService.js'),
('Admin/Finanzas', 'Facturacion', 'Transaccional', 'facturas', 'finanzasService.js'),
('Admin/Finanzas', 'Tesoreria', 'Transaccional', 'movimientos_tesoreria', 'finanzasService.js'),
('Admin/Finanzas', 'Valorizacion', 'Transaccional', 'valorizaciones', 'finanzasService.js'),
('Admin/Finanzas', 'Presupuestos', 'Transaccional', 'presupuestos_anuales', 'presupuestosService.js'),
('Configuración', 'Usuarios', 'Maestro', 'usuarios', 'usuariosService.js'),
('Configuración', 'Roles', 'Maestro', 'roles', 'context.jsx'),
('Configuración', 'Áreas Empresa', 'Maestro', 'areas_empresa', 'maestrosService.js'),
('Configuración', 'Cargos Empresa', 'Maestro', 'cargos_empresa', 'maestrosService.js'),
('Configuración', 'Sedes', 'Maestro', 'sedes', 'maestrosService.js'),
('Configuración', 'Centros Costo', 'Maestro', 'centros_costo', 'maestrosService.js'),
('Configuración', 'Centros Beneficio', 'Maestro', 'centros_beneficio', 'maestrosService.js'),
('Configuración', 'Industrias', 'Maestro', 'industrias', 'maestrosService.js'),
('Configuración', 'Monedas/Impuestos', 'Maestro', 'monedas_impuestos_unidades', 'maestrosService.js'),
('Configuración', 'Tipos Servicio', 'Maestro', 'tipos_servicio_interno', 'maestrosService.js'),
('Configuración', 'Niveles Jerárquicos', 'Maestro', 'niveles_jerarquicos', 'maestrosService.js'),
('Configuración', 'Servicios', 'Maestro', 'servicios', 'maestrosService.js'),
('Configuración', 'Tarifarios', 'Maestro', 'servicio_precios_cliente', 'maestrosService.js'),
('Configuración', 'Parámetros Generales', 'Config', 'empresa_config', 'context.jsx');
