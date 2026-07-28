-- Completa el inventario de Pantallas de Salud de Implementacion: 66 -> 84.
--
-- Disciplina de auditoria:
-- - Solo se asigna tabla_principal cuando la pantalla tiene una fuente principal
--   inequivoca en el flujo real de carga.
-- - Las vistas compuestas quedan con tabla_principal NULL y evidencia explicita
--   de "PENDIENTE DEFINICION MANUAL"; no se les atribuye una tabla arbitraria.
-- - No se modifica ni renombra ninguna fila preexistente.

INSERT INTO public.tideo_salud_configuracion (
  pestana,
  seccion,
  pantalla,
  tipo,
  tabla_principal,
  evidencia,
  orden
)
VALUES
  (
    'pantallas',
    'Business Intelligence',
    'Dashboard General',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_core.jsx, Dashboard consume financiamientos y cxp; no tiene una entidad principal unica.',
    201
  ),
  (
    'pantallas',
    'Business Intelligence',
    'BI Comercial',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_core.jsx, BIComercial combina oportunidades, leads, cuentas, campanas, historial de etapas y cotizaciones.',
    202
  ),
  (
    'pantallas',
    'Business Intelligence',
    'BI Operativo',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_core.jsx, BIOperativo combina ordenes de trabajo, partes, backlog y personal.',
    203
  ),
  (
    'pantallas',
    'Business Intelligence',
    'BI Financiero',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_bi_fin.jsx, BIFinanciero combina compras/gastos, OT, CECO/CEBE, CxC, CxP, tesoreria y facturas.',
    204
  ),
  (
    'pantallas',
    'Operaciones',
    'Backlog',
    'Transaccional',
    'backlog',
    'src/pages_ops.jsx, Backlog; src/services/operacionesService.js, loadOperationsFromSupabase consulta public.backlog por empresa_id.',
    205
  ),
  (
    'pantallas',
    'RRHH',
    'Mi portal',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_mi_portal.jsx y src/services/autoservicioEmpleadoService.js combinan ficha, documentos, solicitudes, asistencia, nomina, prestamos y otras entidades.',
    206
  ),
  (
    'pantallas',
    'Administracion',
    'Estado de Resultados',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_fin.jsx, Resultados; src/services/estadoResultadosService.js agrega facturas, costos OT, compras/gastos, nomina, financiamientos, CxP, caja chica y configuracion ER.',
    207
  ),
  (
    'pantallas',
    'Customer Success',
    'Onboarding',
    'Transaccional',
    'onboardings',
    'src/pages_cs.jsx, CSOnboarding; src/services/crmService.js, loadCsFromSupabase consulta public.onboardings por empresa_id.',
    208
  ),
  (
    'pantallas',
    'Customer Success',
    'Planes de Exito',
    'Transaccional',
    'planes_exito',
    'src/pages_cs.jsx, CSPlanes; src/services/crmService.js, loadCsFromSupabase consulta public.planes_exito por empresa_id.',
    209
  ),
  (
    'pantallas',
    'Customer Success',
    'Health Score',
    'Transaccional',
    'health_scores',
    'src/pages_cs.jsx, CSHealthScore; src/services/crmService.js, loadCsFromSupabase consulta public.health_scores por empresa_id.',
    210
  ),
  (
    'pantallas',
    'Customer Success',
    'Renovaciones',
    'Transaccional',
    'renovaciones',
    'src/pages_cs.jsx, CSRenovaciones; src/services/crmService.js, loadCsFromSupabase consulta public.renovaciones por empresa_id.',
    211
  ),
  (
    'pantallas',
    'Customer Success',
    'Fidelizacion y NPS',
    'Transaccional',
    'nps_encuestas',
    'src/pages_cs.jsx, CSFidelizacion; src/services/crmService.js, loadCsFromSupabase consulta public.nps_encuestas por empresa_id. Referidos y casos de exito no tienen carga Supabase activa.',
    212
  ),
  (
    'pantallas',
    'Customer Success',
    'BI Customer Success',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_cs.jsx, BICustomerSuccess combina health scores, cuentas, NPS, onboardings, renovaciones y planes de retencion.',
    213
  ),
  (
    'pantallas',
    'Inteligencia Artificial',
    'IA Comercial',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_ia.jsx, IAComercial combina CRM y CS; registrarIaLog en src/context.jsx solo actualiza estado local y no persiste en Supabase.',
    214
  ),
  (
    'pantallas',
    'Inteligencia Artificial',
    'IA Operativa',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_ia.jsx, IAOperativa combina OT, cuentas y backlog; registrarIaLog en src/context.jsx solo actualiza estado local y no persiste en Supabase.',
    215
  ),
  (
    'pantallas',
    'Inteligencia Artificial',
    'IA Financiera',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_ia.jsx, IAFinanciera combina cuentas, OT y health scores; registrarIaLog en src/context.jsx solo actualiza estado local y no persiste en Supabase.',
    216
  ),
  (
    'pantallas',
    'Campo Movil',
    'Vistas de Campo',
    'Vista compuesta',
    NULL,
    'PENDIENTE DEFINICION MANUAL: src/pages_mobile.jsx enruta multiples modulos y entidades de campo; no existe una fuente principal unica.',
    217
  ),
  (
    'pantallas',
    'Configuracion',
    'Organigrama',
    'Maestro',
    'posiciones',
    'src/pages_admin.jsx, Organigrama; src/services/posicionesService.js, getPosiciones consulta public.posiciones por empresa_id.',
    218
  )
ON CONFLICT (pestana, seccion, pantalla, tipo)
DO NOTHING;

