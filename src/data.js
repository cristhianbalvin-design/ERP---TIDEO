// src/data.js

export const empresas = [
  { id: 'emp_001', nombre: 'Servicios Industriales Norte SAC', plan: 'Enterprise', pais: 'PE', moneda: 'PEN' },
  { id: 'emp_002', nombre: 'Mantenimiento Andes SRL', plan: 'Standard', pais: 'PE', moneda: 'PEN' }
];

const tenantAdminScreens = [
  'dashboard','bi_comercial','bi_operativo','bi_financiero',
  'cuentas','leads','marketing','pipeline','actividades','agenda_comercial',
  'hoja_costeo','cotizaciones','os_cliente',
  'planner','backlog','ot','partes','cierre','tickets',
  'inventario','solpe','remision',
  'proveedores','cot_compras','ordenes_compra','ordenes_servicio','recepciones',
  'ventas','caja','financiamiento','prestamos_personal','cxc','cxp','facturacion','tesoreria','resultados','valorizacion','presupuestos',
  'cs_onboarding','cs_planes','cs_health','cs_renovaciones','cs_fidelizacion','bi_cs',
  'ia_comercial','ia_operativa','ia_financiera',
  'campo','usuarios','rrhh_operativo','rrhh_admin','asistencia','turnos','nomina','roles','maestros','parametros','servicios','tarifarios'
];

const platformScreens = ['dashboard','tenants','planes','metricas_saas','usuarios','roles'];

export const roles = {
  plataforma: { nombre: 'Superadmin TIDEO', color: 'navy', descripcion: 'Administra la plataforma SaaS, tenants, planes, metricas y soporte TIDEO', permisos: { ver: platformScreens, plataforma: true, soporte_tenant: true, ver_costos: true, ver_finanzas: true } },
  admin: { nombre: 'Super Administrador', color: 'purple', descripcion: 'Administra todos los modulos del ERP dentro de su empresa', permisos: { ver: tenantAdminScreens, tenant_admin: true, ver_costos: true, ver_precios: true, ver_finanzas: true, aprobar_descuentos: true, anular_documentos: true, acceso_campo: true, perfil_campo: 'Gerencia', ver_agenda_equipo: true } },
  comercial: { nombre: 'Jefe Comercial', color: 'cyan', descripcion: 'Gestión de ventas y cotizaciones', permisos: { ver: ['dashboard','cuentas','leads','pipeline','actividades','agenda_comercial','hoja_costeo','cotizaciones','os_cliente'], crear: true, aprobar_descuentos: true, ver_costos: true, ver_agenda_equipo: true } },
  vendedor: { nombre: 'Vendedor', color: 'blue', descripcion: 'Gestión de sus propias ventas y agenda', permisos: { ver: ['dashboard','cuentas','leads','pipeline','actividades','agenda_comercial','cotizaciones'], crear: true, acceso_campo: true, perfil_campo: 'Vendedor' } },
  tecnico: { nombre: 'Técnico de Campo', color: 'orange', descripcion: 'Ejecución de OTs', permisos: { ver: ['ot','partes'], acceso_campo: true } },
  finanzas: { nombre: 'Finanzas', color: 'green', descripcion: 'Control de cajas y facturación', permisos: { ver: ['dashboard','bi_financiero','presupuestos','cxc','cxp','tesoreria','resultados','facturacion','caja','financiamiento','prestamos_personal','ventas','valorizacion','nomina'], ver_finanzas: true } },
};

export const usuarios = [
  { id: 'u1', nombre: 'Admin Master', email: 'admin@tideo.pe', rol: 'admin', area: 'Sistemas', estado: 'Activo', ultimo: 'Hace 5 min' },
  { id: 'u2', nombre: 'Carla Meza', email: 'cmeza@tideo.pe', rol: 'comercial', area: 'Comercial', estado: 'Activo', ultimo: 'Ayer' },
  { id: 'u3', nombre: 'Pedro Salas', email: 'psalas@tideo.pe', rol: 'comercial', area: 'Comercial', estado: 'Activo', ultimo: 'Hoy' },
  { id: 'u4', nombre: 'Andrea Rios', email: 'arios@tideo.pe', rol: 'comercial', area: 'Comercial', estado: 'Activo', ultimo: 'Hoy' },
  { id: 'u5', nombre: 'Juan Técnico', email: 'jtec@tideo.pe', rol: 'tecnico', area: 'Operaciones', campo: true, campoPerfil: 'Técnico', estado: 'Activo', ultimo: 'Hace 2 horas' },
];

export const leads = [
  {
    id: 'lead_001', empresa_id: 'emp_001',
    nombre: 'Carlos Huanca', empresa_contacto: 'Minera San Cristóbal SAC',
    cargo: 'Jefe de Mantenimiento',
    telefono: '+51 987 654 321', email: 'c.huanca@sancristobal.pe',
    fuente: 'Referido', campana: null,
    registrado_desde: 'campo',
    necesidad: 'Mantenimiento de fajas transportadoras, 3 unidades con desgaste crítico',
    urgencia: 'alta', presupuesto_estimado: 85000,
    responsable: 'Carla Meza',
    estado: 'calificado',
    fecha_creacion: '2025-01-08',
    dias_sin_actividad: 1,
    convertido: false
  },
  {
    id: 'lead_002', empresa_id: 'emp_001',
    nombre: 'Rosa Mamani', empresa_contacto: 'Textil Andina SA',
    cargo: 'Gerente de Operaciones',
    telefono: '+51 976 543 210', email: 'r.mamani@textil-andina.pe',
    fuente: 'Formulario web', campana: 'Google Ads Q1 2025',
    registrado_desde: 'web',
    necesidad: 'Servicio de limpieza industrial y mantenimiento preventivo mensual',
    urgencia: 'media', presupuesto_estimado: 24000,
    responsable: 'Pedro Salas',
    estado: 'nuevo',
    fecha_creacion: '2025-01-15',
    dias_sin_actividad: 3,
    convertido: false
  },
  {
    id: 'lead_003', empresa_id: 'emp_001',
    nombre: 'Jorge Quispe', empresa_contacto: 'Distribuidora Sur EIRL',
    cargo: 'Administrador',
    telefono: '+51 965 432 109', email: 'j.quispe@distrisur.pe',
    fuente: 'Evento / Feria', campana: 'ExpoMantenimiento 2025',
    registrado_desde: 'campo',
    necesidad: 'Mantenimiento eléctrico preventivo de almacenes',
    urgencia: 'baja', presupuesto_estimado: 8000,
    responsable: 'Carla Meza',
    estado: 'en_contacto',
    fecha_creacion: '2025-01-12',
    dias_sin_actividad: 5,
    convertido: false
  },
  {
    id: 'lead_004', empresa_id: 'emp_001',
    nombre: 'Patricia Condori', empresa_contacto: 'Agroindustrial Valle Verde SAC',
    cargo: 'Jefa de Planta',
    telefono: '+51 954 321 098', email: 'p.condori@valleverde.pe',
    fuente: 'Referido', campana: null,
    registrado_desde: 'web',
    necesidad: 'Instalación de sistema de riego automatizado y mantenimiento',
    urgencia: 'alta', presupuesto_estimado: 45000,
    responsable: 'Andrea Rios',
    estado: 'nuevo',
    fecha_creacion: '2025-01-16',
    dias_sin_actividad: 0,
    convertido: false
  },
  {
    id: 'lead_005', empresa_id: 'emp_001',
    nombre: 'Manuel Chávez', empresa_contacto: 'Constructora Rimac SA',
    cargo: 'Director de Proyectos',
    telefono: '+51 943 210 987', email: 'm.chavez@constructora-rimac.pe',
    fuente: 'LinkedIn', campana: null,
    registrado_desde: 'web',
    necesidad: 'Outsourcing de personal técnico para proyecto 8 meses',
    urgencia: 'media', presupuesto_estimado: 120000,
    responsable: 'Pedro Salas',
    estado: 'descartado',
    motivo_descarte: 'Presupuesto no disponible hasta Q3',
    fecha_creacion: '2024-12-20',
    dias_sin_actividad: 26,
    convertido: false
  }
];

export const cuentas = [
  {
    id: 'cta_001', empresa_id: 'emp_001',
    razon_social: 'Minera Andes SAC', nombre_comercial: 'Minera Andes',
    tipo: 'estrategico', industria: 'Minería', tamano: 'grande',
    estado: 'activo', responsable_comercial: 'Carla Meza', responsable_cs: 'Carla Meza',
    condicion_pago: '30 días', limite_credito: 200000, riesgo_financiero: 'bajo',
    health_score: 92, riesgo_churn: 'bajo',
    fecha_ultima_compra: '2025-01-10', margen_acumulado: 38.5,
    saldo_cxc: 0, direccion: 'Av. Javier Prado Este 4200, San Borja, Lima',
    telefono: '+51 1 615 0000', email: 'operaciones@mineandes.pe',
    ruc: '20100023491'
  },
  {
    id: 'cta_002', empresa_id: 'emp_001',
    razon_social: 'Planta Industrial Norte SRL', nombre_comercial: 'PIN SRL',
    tipo: 'activo', industria: 'Industrial', tamano: 'mediana',
    estado: 'activo', responsable_comercial: 'Pedro Salas', responsable_cs: 'Pedro Salas',
    condicion_pago: '45 días', limite_credito: 80000, riesgo_financiero: 'medio',
    health_score: 61, riesgo_churn: 'medio',
    fecha_ultima_compra: '2024-12-15', margen_acumulado: 29.2,
    saldo_cxc: 18500, dias_mora: 15,
    direccion: 'Carretera Panamericana Norte Km 23, Ancón, Lima',
    telefono: '+51 1 524 3300', email: 'compras@pinnorte.pe',
    ruc: '20456789012'
  },
  {
    id: 'cta_003', empresa_id: 'emp_001',
    razon_social: 'Constructora del Pacífico SA', nombre_comercial: 'ConsPacifico',
    tipo: 'prospecto', industria: 'Construcción', tamano: 'grande',
    estado: 'activo', responsable_comercial: 'Andrea Rios', responsable_cs: null,
    condicion_pago: 'Por definir', limite_credito: 0, riesgo_financiero: 'bajo',
    health_score: null, riesgo_churn: null,
    fecha_ultima_compra: null, margen_acumulado: null,
    saldo_cxc: 0,
    direccion: 'Calle Las Begonias 441, San Isidro, Lima',
    telefono: '+51 1 211 4500', email: 'licitaciones@conspacifico.pe',
    ruc: '20312345678'
  },
  {
    id: 'cta_004', empresa_id: 'emp_001',
    razon_social: 'Facilities Lima SA', nombre_comercial: 'FacLima',
    tipo: 'activo', industria: 'Facilities', tamano: 'mediana',
    estado: 'activo', responsable_comercial: 'Pedro Salas', responsable_cs: 'Pedro Salas',
    condicion_pago: '30 días', limite_credito: 60000, riesgo_financiero: 'bajo',
    health_score: 85, riesgo_churn: 'bajo',
    fecha_ultima_compra: '2025-01-14', margen_acumulado: 41.0,
    saldo_cxc: 4200, dias_mora: 0,
    direccion: 'Av. República de Panamá 3030, San Isidro, Lima',
    telefono: '+51 1 441 2200', email: 'admin@faclima.pe',
    ruc: '20567890123'
  },
  {
    id: 'cta_005', empresa_id: 'emp_001',
    razon_social: 'Logística Altiplano SAC', nombre_comercial: 'LogAlti',
    tipo: 'en_riesgo', industria: 'Logística', tamano: 'pequeña',
    estado: 'activo', responsable_comercial: 'Carla Meza', responsable_cs: 'Carla Meza',
    condicion_pago: '30 días', limite_credito: 40000, riesgo_financiero: 'alto',
    health_score: 28, riesgo_churn: 'alto',
    fecha_ultima_compra: '2024-11-20', margen_acumulado: 18.3,
    saldo_cxc: 32800, dias_mora: 45,
    direccion: 'Jr. Huánuco 1240, La Victoria, Lima',
    telefono: '+51 1 324 5500', email: 'gerencia@logalti.pe',
    ruc: '20678901234'
  },
  {
    id: 'cta_006', empresa_id: 'emp_001',
    razon_social: 'Minera San Cristóbal SAC', nombre_comercial: 'MSC',
    tipo: 'prospecto', industria: 'Minería', tamano: 'grande',
    estado: 'activo', responsable_comercial: 'Carla Meza', responsable_cs: null,
    condicion_pago: 'Por definir', limite_credito: 0, riesgo_financiero: 'bajo',
    health_score: null, riesgo_churn: null,
    fecha_ultima_compra: null, margen_acumulado: null,
    saldo_cxc: 0, lead_origen: 'lead_001',
    direccion: 'Av. El Derby 254, Surquillo, Lima',
    telefono: '+51 1 630 2000', email: 'operaciones@sancristobal.pe',
    ruc: '20789012345'
  }
];

export const contactos = [
  { id: 'con_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    nombre: 'Ana Torres', cargo: 'Gerente de Operaciones', rol: 'decisor',
    telefono: '+51 987 001 001', email: 'a.torres@mineandes.pe', principal: true },
  { id: 'con_002', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    nombre: 'Ricardo Vega', cargo: 'Jefe de Compras', rol: 'comprador',
    telefono: '+51 987 001 002', email: 'r.vega@mineandes.pe', principal: false },
  { id: 'con_003', empresa_id: 'emp_001', cuenta_id: 'cta_002',
    nombre: 'Luis Paredes', cargo: 'Administrador', rol: 'comprador',
    telefono: '+51 987 002 001', email: 'l.paredes@pinnorte.pe', principal: true },
  { id: 'con_004', empresa_id: 'emp_001', cuenta_id: 'cta_004',
    nombre: 'Sofia Mendez', cargo: 'Directora de Facilities', rol: 'decisor',
    telefono: '+51 987 004 001', email: 's.mendez@faclima.pe', principal: true },
  { id: 'con_005', empresa_id: 'emp_001', cuenta_id: 'cta_005',
    nombre: 'Hugo Ramos', cargo: 'Gerente General', rol: 'decisor',
    telefono: '+51 987 005 001', email: 'h.ramos@logalti.pe', principal: true },
  { id: 'con_006', empresa_id: 'emp_001', cuenta_id: 'cta_006',
    nombre: 'Carlos Huanca', cargo: 'Jefe de Mantenimiento', rol: 'decisor_tecnico',
    telefono: '+51 987 654 321', email: 'c.huanca@sancristobal.pe',
    principal: true, lead_origen: 'lead_001' }
];

export const oportunidades = [
  {
    id: 'opp_001', empresa_id: 'emp_001',
    cuenta_id: 'cta_006', contacto_id: 'con_006',
    nombre: 'Mantenimiento fajas transportadoras — MSC',
    servicio_interes: 'Mantenimiento correctivo de fajas transportadoras',
    etapa: 'propuesta', monto_estimado: 85000, probabilidad: 60,
    forecast_ponderado: 51000,
    fecha_cierre_estimada: '2025-02-15',
    fuente: 'Referido', responsable: 'Carla Meza',
    competidor: 'TecnoMant Perú SAC',
    estado: 'abierta', lead_origen: 'lead_001',
    notas: 'Cliente tiene urgencia en faja #2. Presupuesto aprobado para Q1.',
    fecha_creacion: '2025-01-09'
  },
  {
    id: 'opp_002', empresa_id: 'emp_001',
    cuenta_id: 'cta_001', contacto_id: 'con_001',
    nombre: 'Contrato anual mantenimiento preventivo — Minera Andes',
    servicio_interes: 'Mantenimiento preventivo mensual',
    etapa: 'negociacion', monto_estimado: 180000, probabilidad: 75,
    forecast_ponderado: 135000,
    fecha_cierre_estimada: '2025-01-31',
    fuente: 'Recompra', responsable: 'Carla Meza',
    competidor: null,
    estado: 'abierta',
    notas: 'Renovación del contrato anual. Cliente satisfecho con el servicio.',
    fecha_creacion: '2025-01-05'
  },
  {
    id: 'opp_003', empresa_id: 'emp_001',
    cuenta_id: 'cta_003', contacto_id: null,
    nombre: 'Servicio de supervisión técnica — ConsPacífico',
    servicio_interes: 'Supervisión técnica de obra',
    etapa: 'calificacion', monto_estimado: 95000, probabilidad: 30,
    forecast_ponderado: 28500,
    fecha_cierre_estimada: '2025-03-15',
    fuente: 'Licitación', responsable: 'Andrea Rios',
    competidor: 'Supervisiones del Norte SAC',
    estado: 'abierta',
    notas: 'Proceso de licitación. Presentamos propuesta técnica la próxima semana.',
    fecha_creacion: '2025-01-10'
  },
  {
    id: 'opp_004', empresa_id: 'emp_001',
    cuenta_id: 'cta_004', contacto_id: 'con_004',
    nombre: 'Instalación sistema CCTV — FacLima',
    servicio_interes: 'Instalación y configuración sistema de videovigilancia',
    etapa: 'ganada', monto_estimado: 28500, probabilidad: 100,
    forecast_ponderado: 28500,
    fecha_cierre_estimada: '2025-01-20',
    fecha_cierre_real: '2025-01-18',
    fuente: 'Upsell', responsable: 'Pedro Salas',
    competidor: null,
    estado: 'ganada',
    notas: 'Cliente aprobó propuesta sin modificaciones.',
    fecha_creacion: '2025-01-03'
  },
  {
    id: 'opp_005', empresa_id: 'emp_001',
    cuenta_id: 'cta_002', contacto_id: 'con_003',
    nombre: 'Reparación sistema eléctrico — PIN SRL',
    servicio_interes: 'Reparación tablero eléctrico principal',
    etapa: 'perdida', monto_estimado: 15000, probabilidad: 0,
    fecha_cierre_estimada: '2025-01-10',
    fuente: 'Inbound', responsable: 'Pedro Salas',
    competidor: 'ElectroPeru Servicios SAC',
    estado: 'perdida',
    motivo_perdida: 'Precio — competidor ofreció 20% menos',
    notas: 'Mantener contacto. El cliente puede requerir servicio en Q2.',
    fecha_creacion: '2024-12-28'
  },
  {
    id: 'opp_006', empresa_id: 'emp_001',
    cuenta_id: 'cta_001', contacto_id: 'con_002',
    nombre: 'Instalación compresores industriales — Minera Andes',
    servicio_interes: 'Instalación y puesta en marcha de compresores',
    etapa: 'prospeccion', monto_estimado: 42000, probabilidad: 20,
    forecast_ponderado: 8400,
    fecha_cierre_estimada: '2025-03-30',
    fuente: 'Recompra', responsable: 'Carla Meza',
    competidor: null, estado: 'abierta',
    notas: 'Cliente mencionó necesidad en reunión de seguimiento.',
    fecha_creacion: '2025-01-14'
  }
];

export const actividades = [
  { id: 'act_001', empresa_id: 'emp_001',
    tipo: 'reunion', vinculo_tipo: 'oportunidad', vinculo_id: 'opp_001',
    cuenta_id: 'cta_006', contacto_id: 'con_006',
    responsable: 'Carla Meza',
    fecha: '2025-01-10', hora: '10:00',
    descripcion: 'Visita a planta Toquepala. Levantamiento técnico de las 3 fajas. La faja #2 tiene desgaste crítico en rodillos de retorno.',
    resultado: 'Cliente confirmó urgencia. Presupuesto aprobado por gerencia.',
    proxima_accion: 'Enviar propuesta técnica esta semana',
    proxima_accion_fecha: '2025-01-16',
    estado: 'completada' },
  { id: 'act_002', empresa_id: 'emp_001',
    tipo: 'llamada', vinculo_tipo: 'oportunidad', vinculo_id: 'opp_001',
    cuenta_id: 'cta_006', contacto_id: 'con_006',
    responsable: 'Carla Meza',
    fecha: '2025-01-14', hora: '15:30',
    descripcion: 'Llamada de seguimiento. Confirmaron disponibilidad de presupuesto para Q1. Piden incluir informe técnico en la propuesta.',
    resultado: 'Verde para presentar cotización. Piden entrega antes del viernes.',
    proxima_accion: 'Enviar COT-2025-0089',
    proxima_accion_fecha: '2025-01-17',
    estado: 'completada' },
  { id: 'act_003', empresa_id: 'emp_001',
    tipo: 'email', vinculo_tipo: 'oportunidad', vinculo_id: 'opp_001',
    cuenta_id: 'cta_006', contacto_id: 'con_006',
    responsable: 'Carla Meza',
    fecha: '2025-01-16', hora: '09:00',
    descripcion: 'Envío de Cotización COT-2025-0089 V1 con propuesta técnica adjunta.',
    resultado: 'Email enviado con acuse de recibo.',
    proxima_accion: 'Llamar para confirmar recepción y resolver dudas',
    proxima_accion_fecha: '2025-01-19',
    estado: 'completada' },
  { id: 'act_004', empresa_id: 'emp_001',
    tipo: 'seguimiento', vinculo_tipo: 'oportunidad', vinculo_id: 'opp_001',
    cuenta_id: 'cta_006', contacto_id: 'con_006',
    responsable: 'Carla Meza',
    fecha: '2025-01-21', hora: '11:00',
    descripcion: 'Seguimiento de cotización. Cliente pide ajustar precio de rodillos.',
    resultado: 'Pendiente — preparar V2 con descuento del 5% en rodillos',
    proxima_accion: 'Enviar COT-2025-0089 V2',
    proxima_accion_fecha: '2025-01-22',
    estado: 'pendiente' },
  { id: 'act_005', empresa_id: 'emp_001',
    tipo: 'reunion', vinculo_tipo: 'oportunidad', vinculo_id: 'opp_002',
    cuenta_id: 'cta_001', contacto_id: 'con_001',
    responsable: 'Carla Meza',
    fecha: '2025-01-13', hora: '09:00',
    descripcion: 'Reunión de renovación contrato anual. Cliente satisfecho. Piden incluir 2 sedes adicionales.',
    resultado: 'Propuesta ajustada en proceso.',
    proxima_accion: 'Presentar propuesta renovación con 2 sedes',
    proxima_accion_fecha: '2025-01-20',
    estado: 'completada' },
  { id: 'act_006', empresa_id: 'emp_001',
    tipo: 'tarea', vinculo_tipo: 'lead', vinculo_id: 'lead_002',
    cuenta_id: null, contacto_id: null,
    responsable: 'Pedro Salas',
    fecha: '2025-01-18', hora: '10:00',
    descripcion: 'Primer contacto con Rosa Mamani de Textil Andina.',
    resultado: null,
    proxima_accion: null,
    proxima_accion_fecha: null,
    estado: 'pendiente' }
];

export const cotizaciones = [
  {
    id: 'cot_001', empresa_id: 'emp_001',
    numero: 'COT-2025-0089', version: 2,
    cuenta_id: 'cta_006', contacto_id: 'con_006', oportunidad_id: 'opp_001',
    responsable: 'Carla Meza',
    fecha: '2025-01-22', valida_hasta: '2025-02-22',
    condicion_pago: '50% anticipo, 50% a 30 días desde conformidad',
    moneda: 'PEN', tipo_cambio: null,
    alcance: 'Mantenimiento correctivo de 3 fajas transportadoras en planta Toquepala. Incluye diagnóstico técnico, reemplazo de componentes con desgaste y puesta en marcha. Personal especializado incluido.',
    exclusiones: 'Reparación de estructura metálica. Repuestos adicionales no listados. Traslado de personal si cliente no proporciona alojamiento.',
    plazo_ejecucion: '15 días calendario desde conformidad de OS Cliente',
    garantia: '6 meses en mano de obra',
    estado: 'enviada',
    items: [
      { id: 1, servicio: 'Mantenimiento correctivo faja transportadora', cantidad: 3, unidad: 'Unidad', precio_unitario: 18000, descuento_pct: 0, subtotal: 54000 },
      { id: 2, servicio: 'Reemplazo de rodillos de carga (juego de 12)', cantidad: 3, unidad: 'Juego', precio_unitario: 4900, descuento_pct: 5, subtotal: 13965 },
      { id: 3, servicio: 'Informe técnico de condición y recomendaciones', cantidad: 1, unidad: 'Global', precio_unitario: 2500, descuento_pct: 0, subtotal: 2500 }
    ],
    subtotal: 70465, descuento_global_pct: 0, descuento_global: 0,
    base_imponible: 70465, igv_pct: 18, igv: 12684, total: 83149,
    historial_versiones: [
      { version: 1, fecha: '2025-01-16', total: 84960, motivo_cambio: 'Versión inicial' },
      { version: 2, fecha: '2025-01-22', total: 83149, motivo_cambio: 'Descuento 5% en rodillos solicitado por cliente' }
    ]
  },
  {
    id: 'cot_002', empresa_id: 'emp_001',
    numero: 'COT-2025-0074', version: 1,
    cuenta_id: 'cta_001', contacto_id: 'con_002', oportunidad_id: 'opp_002',
    responsable: 'Carla Meza',
    fecha: '2025-01-15', valida_hasta: '2025-02-15',
    condicion_pago: 'Pago mensual los 5 primeros días de cada mes',
    moneda: 'PEN',
    alcance: 'Servicio de mantenimiento preventivo mensual en 4 sedes de Minera Andes. Incluye visita mensual por sede, informe de condición y atención de emergencias con tiempo de respuesta de 4 horas.',
    exclusiones: 'Repuestos mayores. Trabajos correctivos fuera del plan preventivo.',
    plazo_ejecucion: '12 meses desde firma de contrato',
    garantia: 'Incluida en el servicio mensual',
    estado: 'en_negociacion',
    items: [
      { id: 1, servicio: 'Mantenimiento preventivo mensual por sede', cantidad: 4, unidad: 'Sede/mes', precio_unitario: 3500, descuento_pct: 0, subtotal: 14000 },
      { id: 2, servicio: 'Atención de emergencias (incluye hasta 4 por mes)', cantidad: 1, unidad: 'Global/mes', precio_unitario: 1200, descuento_pct: 0, subtotal: 1200 }
    ],
    subtotal: 15200, descuento_global_pct: 0, descuento_global: 0,
    base_imponible: 15200, igv_pct: 18, igv: 2736, total: 215232, total_mensual: 17936, total_anual: 215232,
    historial_versiones: [
      { version: 1, fecha: '2025-01-15', total: 215232, motivo_cambio: 'Versión inicial' }
    ]
  },
  {
    id: 'cot_003', empresa_id: 'emp_001',
    numero: 'COT-2025-0081', version: 1,
    cuenta_id: 'cta_004', contacto_id: 'con_004', oportunidad_id: 'opp_004',
    responsable: 'Pedro Salas',
    fecha: '2025-01-10', valida_hasta: '2025-01-25',
    condicion_pago: '60% anticipo, 40% a 15 días desde instalación',
    moneda: 'PEN',
    alcance: 'Suministro e instalación de sistema CCTV con 24 cámaras IP, NVR central, cableado estructurado y configuración de acceso remoto.',
    exclusiones: 'Obras civiles. Reparación de cableado existente.',
    plazo_ejecucion: '10 días hábiles',
    garantia: '12 meses en equipos, 6 meses en instalación',
    estado: 'aprobada',
    items: [
      { id: 1, servicio: 'Cámara IP Full HD exterior', cantidad: 16, unidad: 'Und', precio_unitario: 480, descuento_pct: 0, subtotal: 7680 },
      { id: 2, servicio: 'Cámara IP PTZ interior', cantidad: 8, unidad: 'Und', precio_unitario: 620, descuento_pct: 0, subtotal: 4960 },
      { id: 3, servicio: 'NVR 32 canales + disco 8TB', cantidad: 1, unidad: 'Equipo', precio_unitario: 3800, descuento_pct: 0, subtotal: 3800 },
      { id: 4, servicio: 'Instalación, cableado y configuración', cantidad: 1, unidad: 'Global', precio_unitario: 5200, descuento_pct: 0, subtotal: 5200 }
    ],
    subtotal: 21640, descuento_global_pct: 0, descuento_global: 0,
    base_imponible: 21640, igv_pct: 18, igv: 3895, total: 25535,
    historial_versiones: [
      { version: 1, fecha: '2025-01-10', total: 25535, motivo_cambio: 'Versión inicial' }
    ]
  }
];

export const osClientes = [
  {
    id: 'osc_001', empresa_id: 'emp_001',
    numero: 'OSC-2025-0028', numero_doc_cliente: 'OC-FAC-0892',
    cuenta_id: 'cta_004', cotizacion_id: 'cot_003', oportunidad_id: 'opp_004',
    monto_aprobado: 25535, moneda: 'PEN',
    condicion_pago: '60% anticipo, 40% a 15 días',
    fecha_emision: '2025-01-18', fecha_inicio: '2025-01-20', fecha_fin: '2025-01-31',
    sla: 'Inicio en 2 días hábiles desde aprobación',
    estado: 'en_ejecucion',
    saldo_por_ejecutar: 0, saldo_por_valorizar: 0,
    saldo_por_facturar: 10214, // 40% restante
    anticipo_recibido: 15321, // 60%
    monto_facturado: 15321, monto_cobrado: 15321,
    ots_asociadas: ['ot_001']
  }
];

// OTs and others (simplified mock data to prevent undefined errors in other modules)
export const ots = [
  { 
    id: 'ot_001', empresa_id: 'emp_001', os_cliente_id: 'osc_001', cuenta_id: 'cta_001',
    numero: 'OT-25-0012', cliente: 'Minera Andes SAC', sede: 'Planta Principal', tipo: 'Preventiva', 
    estado: 'ejecucion', sla: 'ok', responsable: 'J. Quispe', supervisor: 'M. López',
    fecha_inicio: '2025-01-20', fecha_fin: '2025-01-30', 
    costoEst: 8000, costoReal: 4500, avance: 60, gps: true,
    tareas: [
      { id: 1, descripcion: 'Desmontaje de equipos', completado: true },
      { id: 2, descripcion: 'Limpieza y lubricación', completado: true },
      { id: 3, descripcion: 'Reemplazo de rodamientos', completado: false }
    ],
    materiales_estimados: [
      { sku: 'ROD-001', nombre: 'Rodamiento 6205', cantidad: 4, costo_unitario: 120 }
    ],
    descripcion: 'Mantenimiento preventivo semestral de fajas.'
  },
  { 
    id: 'ot_002', empresa_id: 'emp_001', os_cliente_id: 'osc_002', cuenta_id: 'cta_006',
    numero: 'OT-25-0013', cliente: 'Facilities Lima SA', sede: 'Torre Central', tipo: 'Correctiva', 
    estado: 'borrador', sla: 'riesgo', responsable: 'A. Gómez', supervisor: 'M. López',
    fecha_inicio: '2025-01-28', fecha_fin: '2025-02-05', 
    costoEst: 15000, costoReal: 0, avance: 0, gps: false,
    tareas: [
      { id: 1, descripcion: 'Inspección de daños', completado: false },
      { id: 2, descripcion: 'Reparación de motor', completado: false }
    ],
    materiales_estimados: [],
    descripcion: 'Reparación urgente de motor de bomba de agua.'
  }
];

export const partes = [
  {
    id: 'part_001', empresa_id: 'emp_001', ot_id: 'ot_001',
    tecnico: 'J. Quispe', fecha: '2025-01-22', horas: 8, avance_reportado: 30,
    actividades: 'Se completó el desmontaje y la limpieza inicial.',
    materiales_usados: [
      { sku: 'ROD-001', nombre: 'Rodamiento 6205', cantidad: 2 }
    ],
    estado: 'aprobado'
  },
  {
    id: 'part_002', empresa_id: 'emp_001', ot_id: 'ot_001',
    tecnico: 'J. Quispe', fecha: '2025-01-23', horas: 6, avance_reportado: 30,
    actividades: 'Se avanzó con lubricación y calibración.',
    materiales_usados: [],
    estado: 'en_revision'
  }
];

export const inventario = [
  { id: 'inv_001', sku: 'ROD-001', nombre: 'Rodamiento 6205 ZZ', categoria: 'Repuestos', unidad: 'Und', stock_actual: 45, costo_promedio: 115, almacen: 'Principal' },
  { id: 'inv_002', sku: 'LUB-005', nombre: 'Grasa Litio 500g', categoria: 'Consumibles', unidad: 'Tarro', stock_actual: 12, costo_promedio: 45, almacen: 'Principal' },
  { id: 'inv_003', sku: 'MOT-012', nombre: 'Motor Trifásico 5HP', categoria: 'Equipos', unidad: 'Und', stock_actual: 2, costo_promedio: 1500, almacen: 'Principal' },
  { id: 'inv_004', sku: 'CAB-008', nombre: 'Cable vulcanizado 3x12', categoria: 'Materiales', unidad: 'Metro', stock_actual: 150, costo_promedio: 8.5, almacen: 'Sede Sur' }
];

export const backlog = [
  { id: 'bkl_001', empresa_id: 'emp_001', cuenta_id: 'cta_001', titulo: 'Ruido anormal en faja 2', origen: 'Técnico en campo', prioridad: 'alta', estado: 'pendiente', fecha: '2025-01-24', descripcion: 'Durante el mantenimiento se detectó ruido metálico en la faja 2. Requiere revisión urgente.' },
  { id: 'bkl_002', empresa_id: 'emp_001', cuenta_id: 'cta_006', titulo: 'Solicitud de ampliación de red', origen: 'Cliente', prioridad: 'media', estado: 'convertido', fecha: '2025-01-10', descripcion: 'Cliente solicita cotizar 3 puntos de red adicionales.' }
];

export const solpes = [
  { id: 'slp_001', empresa_id: 'emp_001', ot_id: 'ot_001', numero: 'SLP-2025-001', solicitante: 'J. Quispe', fecha: '2025-01-21', estado: 'atendida', urgencia: 'alta', centro_costo: 'Mantenimiento', items: [{ nombre: 'Rodamiento 6205', cantidad: 4 }] },
  { id: 'slp_002', empresa_id: 'emp_001', ot_id: 'ot_002', numero: 'SLP-2025-002', solicitante: 'A. Gómez', fecha: '2025-01-26', estado: 'solicitada', urgencia: 'media', centro_costo: 'Servicios', items: [{ nombre: 'Contactores 220V', cantidad: 2 }] }
];

export const valorizaciones = [
  { id: 'val_001', empresa_id: 'emp_001', os_cliente_id: 'osc_001', numero: 'VAL-2025-001', fecha: '2025-01-25', periodo: 'Ene 2025', estado: 'aprobada', subtotal: 15000, igv: 2700, total: 17700 }
];

export const compras = [
  { id: 'COM-001', proveedor: 'Ferretería Industrial SAC', doc: 'F001-2341', monto: 450.00, ot: 'OT-25-0012', fecha: '2025-01-22', estado: 'pendiente_revision', campo: true },
  { id: 'COM-002', proveedor: 'Electroandes', doc: 'F002-1122', monto: 1250.00, ot: 'OT-25-0013', fecha: '2025-01-20', estado: 'pagado', campo: false }
];
export const proveedores = [
  {
    id: 'prv_001', empresa_id: 'emp_001', codigo: 'PRV-001', ruc: '20456789012', pais: 'Peru',
    razon_social: 'Ferreteria Industrial SAC', nombre_comercial: 'Ferreteria Industrial', categoria: 'Materiales',
    servicios: 'Suministro de materiales electricos, ferreteria industrial, EPP y herramientas', estado: 'homologado',
    calificacion_promedio: 4.2, total_evaluaciones: 3, contacto_nombre: 'Luis Carreno', contacto_cargo: 'Gerente Comercial',
    telefono: '+51 987 111 222', email: 'l.carreno@ferind.pe', web: 'www.ferreteriaindustrial.pe', direccion: 'Av. Argentina 2100, Cercado de Lima',
    responsable_compras: 'Roberto Quispe', condicion_pago: '30 dias', moneda: 'PEN', sujeto_retencion: false, pct_retencion: 0,
    banco: 'BCP', tipo_cuenta: 'Corriente', nro_cuenta: '193-12345678-0-12', cci: '002-193-012345678012-13', limite_gasto_mensual: 20000,
    total_ocs: 12, monto_total_comprado: 48200, fecha_ultima_oc: '2025-04-22', fecha_homologacion: '2025-03-15',
    notas: 'Proveedor estrategico para materiales electricos. Entrega en 24-48h para Lima.'
  },
  {
    id: 'prv_002', empresa_id: 'emp_001', codigo: 'PRV-002', ruc: '20567890123', pais: 'Peru',
    razon_social: 'Electroandes SAC', nombre_comercial: 'Electroandes', categoria: 'Materiales',
    servicios: 'Tableros electricos, conductores, equipos de medicion y control', estado: 'homologado',
    calificacion_promedio: 5.0, total_evaluaciones: 1, contacto_nombre: 'Pedro Rios', contacto_cargo: 'Vendedor tecnico',
    telefono: '+51 987 222 333', email: 'p.rios@electroandes.pe', web: 'www.electroandes.pe', direccion: 'Jr. Lampa 1240, Cercado de Lima',
    responsable_compras: 'Roberto Quispe', condicion_pago: 'Contado', moneda: 'PEN', sujeto_retencion: false, limite_gasto_mensual: 0,
    total_ocs: 3, monto_total_comprado: 12400, fecha_ultima_oc: '2025-04-18', fecha_homologacion: '2025-02-10', notas: ''
  },
  {
    id: 'prv_003', empresa_id: 'emp_001', codigo: 'PRV-003', ruc: '20678901234', pais: 'Peru',
    razon_social: 'Transportes Rapidos del Norte SAC', nombre_comercial: 'TransRapido', categoria: 'Transporte',
    servicios: 'Transporte de carga, materiales y personal tecnico a nivel nacional', estado: 'homologado',
    calificacion_promedio: 3.8, total_evaluaciones: 5, contacto_nombre: 'Carmen Vega', contacto_cargo: 'Coordinadora logistica',
    telefono: '+51 987 444 555', email: 'c.vega@transrapido.pe', web: '', direccion: 'Av. Tomas Valle 890, Los Olivos',
    responsable_compras: 'Maria Flores', condicion_pago: '15 dias', moneda: 'PEN', sujeto_retencion: true, pct_retencion: 8, limite_gasto_mensual: 8000,
    total_ocs: 18, monto_total_comprado: 24600, fecha_ultima_oc: '2025-04-25', fecha_homologacion: '2024-11-05',
    notas: 'Puntualidad variable. Revisar antes de usar para proyectos con SLA estricto.'
  },
  {
    id: 'prv_004', empresa_id: 'emp_001', codigo: 'PRV-004', ruc: '20789012345', pais: 'Peru',
    razon_social: 'Servicios Tecnicos Andinos EIRL', nombre_comercial: 'ServTec Andinos', categoria: 'Servicios',
    servicios: 'Subcontrato de personal tecnico especializado, montaje industrial', estado: 'en_evaluacion',
    calificacion_promedio: null, total_evaluaciones: 0, contacto_nombre: 'Marco Huanca', contacto_cargo: 'Gerente',
    telefono: '+51 987 666 777', email: 'm.huanca@servtec.pe', web: '', direccion: 'Calle Los Pinos 340, San Juan de Lurigancho',
    responsable_compras: 'Roberto Quispe', condicion_pago: '', moneda: 'PEN', sujeto_retencion: false, limite_gasto_mensual: 0,
    total_ocs: 0, monto_total_comprado: 0, fecha_ultima_oc: null, fecha_homologacion: null,
    notas: 'En proceso de homologacion. Faltan SCTR y poliza de RC.'
  },
  {
    id: 'prv_005', empresa_id: 'emp_001', codigo: 'PRV-005', ruc: '20890123456', pais: 'Peru',
    razon_social: 'Repuestos y Maquinaria Industrial SA', nombre_comercial: 'Repuestos IM', categoria: 'Equipos',
    servicios: 'Repuestos para fajas transportadoras, rodillos, motorreductores', estado: 'observado',
    calificacion_promedio: 2.8, total_evaluaciones: 2, contacto_nombre: 'Jorge Salinas', contacto_cargo: 'Representante',
    telefono: '+51 987 888 999', email: 'j.salinas@repuestosim.pe', web: '', direccion: 'Av. Industrial 560, Ate',
    responsable_compras: 'Maria Flores', condicion_pago: '30 dias', moneda: 'PEN', sujeto_retencion: false, limite_gasto_mensual: 5000,
    total_ocs: 4, monto_total_comprado: 8900, fecha_ultima_oc: '2025-03-10', fecha_homologacion: '2024-08-20',
    notas: 'Observado por incumplimiento de plazo en OC-2025-0041. Usar solo si no hay alternativa.'
  }
];

export const documentosProveedor = [
  { id: 'doc_001', proveedor_id: 'prv_001', tipo: 'RUC activo (SUNAT)', vencimiento: null, estado: 'vigente', archivo: 'ruc_ferreteria_ind.pdf' },
  { id: 'doc_002', proveedor_id: 'prv_001', tipo: 'SCTR - Seguro complementario', vencimiento: '2025-06-30', estado: 'por_vencer', archivo: 'sctr_ferreteria_2025.pdf' },
  { id: 'doc_003', proveedor_id: 'prv_001', tipo: 'Poliza responsabilidad civil', vencimiento: '2025-12-31', estado: 'vigente', archivo: 'poliza_rc_ferreteria.pdf' },
  { id: 'doc_004', proveedor_id: 'prv_001', tipo: 'Contrato marco', vencimiento: '2025-12-31', estado: 'vigente', archivo: 'contrato_marco_ferreteria.pdf' },
  { id: 'doc_005', proveedor_id: 'prv_003', tipo: 'SCTR - Seguro complementario', vencimiento: '2025-04-15', estado: 'vencido', archivo: 'sctr_transrapido.pdf' },
  { id: 'doc_006', proveedor_id: 'prv_003', tipo: 'Poliza responsabilidad civil', vencimiento: '2025-09-30', estado: 'vigente', archivo: 'poliza_rc_transrapido.pdf' }
];

export const evaluacionesProveedor = [
  { id: 'eval_001', proveedor_id: 'prv_001', tipo: 'post_oc', oc_id: 'OC-2025-0089', fecha: '2025-04-22', cumple_plazo: true, calidad: 5, precio: 4, comunicacion: 5, score: 4.7, evaluador: 'Roberto Quispe', comentario: 'Entrega puntual y materiales en buen estado.' },
  { id: 'eval_002', proveedor_id: 'prv_001', tipo: 'post_oc', oc_id: 'OC-2025-0071', fecha: '2025-04-07', cumple_plazo: true, calidad: 4, precio: 4, comunicacion: 4, score: 4.0, evaluador: 'Roberto Quispe', comentario: 'Correcto. Sin observaciones.' },
  { id: 'eval_003', proveedor_id: 'prv_001', tipo: 'post_oc', oc_id: 'OC-2025-0058', fecha: '2025-03-24', cumple_plazo: false, calidad: 4, precio: 5, comunicacion: 3, score: 3.5, evaluador: 'Maria Flores', comentario: 'Llego con 2 dias de retraso. Comunicacion tardia.' },
  { id: 'eval_hom_001', proveedor_id: 'prv_001', tipo: 'homologacion', fecha: '2025-03-15', criterios: { capacidad_tecnica: 4, documentacion: 5, solidez_financiera: 4, referencias: 4, precio_competitivo: 4 }, score_homologacion: 4.25, resultado: 'aprobado', evaluador: 'Roberto Quispe', comentario: 'Proveedor con buena capacidad tecnica. Documentacion completa.' }
];

export const contactosProveedor = [
  { id: 'cprv_001', proveedor_id: 'prv_001', nombre: 'Luis Carreno', cargo: 'Gerente Comercial', telefono: '+51 987 111 222', email: 'l.carreno@ferind.pe', principal: true },
  { id: 'cprv_002', proveedor_id: 'prv_001', nombre: 'Ana Gutierrez', cargo: 'Ejecutiva de Ventas', telefono: '+51 987 333 444', email: 'a.gutierrez@ferind.pe', principal: false },
  { id: 'cprv_003', proveedor_id: 'prv_003', nombre: 'Carmen Vega', cargo: 'Coordinadora logistica', telefono: '+51 987 444 555', email: 'c.vega@transrapido.pe', principal: true }
];
export const procesosCompra = [
  {
    id: 'pc_001', empresa_id: 'emp_001', codigo: 'COT-COMP-001', solpe_id: 'slp_001', ot_id: 'ot_001', tipo: 'bien',
    descripcion: 'Materiales electricos para mantenimiento fajas - cable, terminales, canaletas',
    monto_referencial: 4500, proveedores_consultados: ['prv_001', 'prv_002'], fecha_limite: '2025-04-28',
    responsable: 'Roberto Quispe', estado: 'comparativo_listo', proveedor_ganador: 'prv_001', monto_seleccionado: 4150,
    documento_generado: null
  },
  {
    id: 'pc_002', empresa_id: 'emp_001', codigo: 'COT-COMP-002', solpe_id: 'slp_002', ot_id: 'ot_002', tipo: 'servicio',
    descripcion: 'Transporte de materiales a planta Toquepala',
    monto_referencial: 900, proveedores_consultados: ['prv_003'], fecha_limite: '2025-04-30',
    responsable: 'Maria Flores', estado: 'esperando_respuesta', proveedor_ganador: null, monto_seleccionado: null,
    documento_generado: null
  }
];

export const respuestasCompra = [
  { id:'rpc_001', proceso_id:'pc_001', proveedor_id:'prv_001', estado:'respondida', solicitado:'2025-04-23', precio_total:4150, plazo_entrega:'2 dias habiles', condiciones:'30 dias', valido_hasta:'2025-05-07', observaciones:'Stock disponible' },
  { id:'rpc_002', proceso_id:'pc_001', proveedor_id:'prv_002', estado:'respondida', solicitado:'2025-04-23', precio_total:4380, plazo_entrega:'3 dias habiles', condiciones:'Contado', valido_hasta:'2025-05-05', observaciones:'Entrega sujeta a pago previo' },
  { id:'rpc_003', proceso_id:'pc_002', proveedor_id:'prv_003', estado:'enviada', solicitado:'2025-04-25', precio_total:null, plazo_entrega:'', condiciones:'', valido_hasta:'', observaciones:'' }
];

export const ordenesCompra = [
  {
    id: 'oc_001', empresa_id: 'emp_001', codigo: 'OC-2025-0089', proceso_compra_id: 'pc_001', proveedor_id: 'prv_001', ot_id: 'ot_001',
    descripcion: 'Materiales electricos - cable 2.5mm, terminales, canaletas',
    items: [
      { descripcion: 'Cable NHX-80 2.5mm', cantidad: 100, unidad: 'm', precio_unitario: 2.80, subtotal: 280 },
      { descripcion: 'Terminales de compresion', cantidad: 50, unidad: 'Und', precio_unitario: 1.20, subtotal: 60 },
      { descripcion: 'Canaleta ranurada 40x25', cantidad: 20, unidad: 'm', precio_unitario: 8.50, subtotal: 170 },
      { descripcion: 'Breaker 3x32A Schneider', cantidad: 2, unidad: 'Und', precio_unitario: 185, subtotal: 370 }
    ],
    subtotal: 880, igv: 158.40, total: 1038.40, condicion_pago: '30 dias', moneda: 'PEN',
    fecha_emision: '2025-04-23', fecha_entrega_esperada: '2025-04-25', almacen_destino: 'ALM-001',
    estado: 'recibida_total', porcentaje_recibido: 100, notas_proveedor: 'Entrega en almacen central Lima, horario 8am-5pm',
    notas_internas: 'Urgente para OT Minera San Cristobal'
  },
  {
    id: 'oc_002', empresa_id: 'emp_001', codigo: 'OC-2025-0090', proceso_compra_id: null, proveedor_id: 'prv_001', ot_id: 'ot_002',
    descripcion: 'EPP para personal - cascos, lentes, guantes',
    items: [
      { descripcion: 'Casco MSA blanco', cantidad: 5, unidad: 'Und', precio_unitario: 45, subtotal: 225 },
      { descripcion: 'Lentes de seguridad', cantidad: 10, unidad: 'Und', precio_unitario: 12, subtotal: 120 },
      { descripcion: 'Guantes nitrilo talla L', cantidad: 20, unidad: 'Par', precio_unitario: 8.50, subtotal: 170 }
    ],
    subtotal: 515, igv: 92.70, total: 607.70, condicion_pago: '30 dias', moneda: 'PEN',
    fecha_emision: '2025-04-24', fecha_entrega_esperada: '2025-04-28', almacen_destino: 'ALM-001',
    estado: 'confirmada', porcentaje_recibido: 0, notas_proveedor: '', notas_internas: ''
  },
  {
    id: 'oc_003', empresa_id: 'emp_001', codigo: 'OC-2025-0086', proveedor_id: 'prv_002', ot_id: 'ot_001',
    descripcion: 'Tablero electrico 12 polos con caja',
    items: [
      { descripcion: 'Tablero electrico 12 polos', cantidad: 1, unidad: 'Und', precio_unitario: 380, subtotal: 380 },
      { descripcion: 'Caja metalica 400x300x150', cantidad: 1, unidad: 'Und', precio_unitario: 120, subtotal: 120 }
    ],
    subtotal: 500, igv: 90, total: 590, condicion_pago: 'Contado', moneda: 'PEN',
    fecha_emision: '2025-04-18', fecha_entrega_esperada: '2025-04-21', almacen_destino: 'ALM-001',
    estado: 'cerrada', porcentaje_recibido: 100, notas_proveedor: '', notas_internas: ''
  }
];

export const ordenesServicio = [
  {
    id: 'os_001', empresa_id: 'emp_001', codigo: 'OS-2025-0012', proveedor_id: 'prv_003', ot_id: 'ot_001',
    descripcion: 'Transporte de materiales y personal tecnico a planta Toquepala',
    alcance: 'Traslado de 3 tecnicos + materiales desde Lima a planta Toquepala. Incluye flete de retorno.',
    entregables: 'Guia de remision, registro de llegada firmado por supervisor de planta',
    criterios_conformidad: 'Llegada antes de las 8am del 22/04. Materiales sin danos.',
    total: 800, moneda: 'PEN', condicion_pago: '15 dias', fecha_emision: '2025-04-20',
    fecha_inicio: '2025-04-22', fecha_fin: '2025-04-22', responsable_validacion: 'Roberto Quispe',
    estado: 'cerrada', notas: ''
  }
];

export const recepciones = [
  {
    id: 'rec_001', empresa_id: 'emp_001', codigo: 'REC-2025-0018', oc_id: 'oc_001', proveedor_id: 'prv_001',
    fecha: '2025-04-25', responsable: 'Roberto Quispe', almacen: 'ALM-001',
    items_recibidos: [
      { descripcion: 'Cable NHX-80 2.5mm', pedido: 100, recibido: 100, unidad: 'm', conforme: true },
      { descripcion: 'Terminales de compresion', pedido: 50, recibido: 50, unidad: 'Und', conforme: true },
      { descripcion: 'Canaleta ranurada 40x25', pedido: 20, recibido: 20, unidad: 'm', conforme: true },
      { descripcion: 'Breaker 3x32A Schneider', pedido: 2, recibido: 2, unidad: 'Und', conforme: true }
    ],
    tipo: 'total', estado: 'conforme', observaciones: '', archivo_guia: 'guia_ferreteria_20250425.pdf',
    cxp_generada: true, cxp_id: 'cxp_005'
  }
];
export const cxc = [
  { id: 'cxc_001', cliente: 'Minera Andes SAC', factura: 'F001-0512', emision: '2026-04-20', vence: '2026-05-20', total: 95000, pagado: 0, saldo: 95000, mora: 0, estado: 'vigente', promesa_pago: null },
  { id: 'cxc_002', cliente: 'Planta Industrial Norte SRL', factura: 'F001-0498', emision: '2026-04-01', vence: '2026-04-16', total: 18500, pagado: 0, saldo: 18500, mora: 11, estado: 'vencida', promesa_pago: '2026-04-30' },
  { id: 'cxc_003', cliente: 'Facilities Lima SA', factura: 'F001-0505', emision: '2026-04-15', vence: '2026-05-15', total: 4200, pagado: 0, saldo: 4200, mora: 0, estado: 'por_vencer', promesa_pago: null },
  { id: 'cxc_004', cliente: 'Logistica Altiplano SAC', factura: 'F001-0461', emision: '2026-03-01', vence: '2026-03-16', total: 32800, pagado: 0, saldo: 32800, mora: 42, estado: 'vencida', promesa_pago: '2026-05-10' },
  { id: 'cxc_005', cliente: 'Facilities Lima SA', factura: 'F001-0510', emision: '2026-04-18', vence: '2026-04-18', total: 22400, pagado: 22400, saldo: 0, mora: 0, estado: 'pagada', promesa_pago: null }
];
export const movimientosBanco = [
  { id: 'mb_001', fecha: '2026-04-22', desc: 'Abono cliente Facilities Lima F001-0510', tipo: 'credito', monto: 22400, vinculado: 'F001-0510', conciliado: true },
  { id: 'mb_002', fecha: '2026-04-24', desc: 'Pago proveedor Electroandes F002-1122', tipo: 'debito', monto: 1250, vinculado: 'CXP-002', conciliado: true },
  { id: 'mb_003', fecha: '2026-04-25', desc: 'Abono parcial Logistica Altiplano', tipo: 'credito', monto: 5000, vinculado: 'F001-0461', conciliado: true },
  { id: 'mb_004', fecha: '2026-04-26', desc: 'Ingreso por identificar BBVA', tipo: 'credito', monto: 10214, vinculado: null, conciliado: false },
  { id: 'mb_005', fecha: '2026-04-27', desc: 'Cargo comision bancaria', tipo: 'debito', monto: 180, vinculado: null, conciliado: false }
];
export const estadoResultados = {
  ingresos: { total: 285400, items: [
    { label: 'Mantenimiento preventivo', valor: 112400 },
    { label: 'Instalaciones y proyectos', valor: 87600 },
    { label: 'Soporte tecnico', valor: 43200 },
    { label: 'Consultoria y capacitacion', valor: 42200 }
  ] },
  costoVentas: { total: 172600, items: [
    { label: 'Mano de obra directa', valor: 84200 },
    { label: 'Materiales consumidos por OT', valor: 46300 },
    { label: 'Servicios terceros', valor: 28100 },
    { label: 'Logistica directa', valor: 14000 }
  ] },
  gastosOp: { total: 32200, items: [
    { label: 'Administrativos', valor: 19800 },
    { label: 'Comerciales', valor: 12400 }
  ] },
  gastosFin: { total: 6000, items: [
    { label: 'Intereses de prestamos', valor: 4200 },
    { label: 'Comisiones bancarias', valor: 1800 }
  ] }
};
export const pantallasPermisos = [
  { key: 'dashboard', modulo: 'BI', pantalla: 'Dashboard General', acciones: ['ver','exportar','finanzas'] },
  { key: 'bi_comercial', modulo: 'BI', pantalla: 'BI Comercial', acciones: ['ver','exportar','precios'] },
  { key: 'bi_operativo', modulo: 'BI', pantalla: 'BI Operativo', acciones: ['ver','exportar','costos'] },
  { key: 'bi_financiero', modulo: 'BI', pantalla: 'BI Financiero', acciones: ['ver','exportar','costos','finanzas'] },
  { key: 'tenants', modulo: 'Plataforma', pantalla: 'Empresas / Tenants', acciones: ['ver','crear','editar','anular','exportar'] },
  { key: 'planes', modulo: 'Plataforma', pantalla: 'Planes y Licencias', acciones: ['ver','crear','editar','exportar'] },
  { key: 'metricas_saas', modulo: 'Plataforma', pantalla: 'Metricas SaaS', acciones: ['ver','exportar','finanzas'] },
  { key: 'cuentas', modulo: 'CRM', pantalla: 'Cuentas y Contactos', acciones: ['ver','crear','editar','exportar','finanzas'] },
  { key: 'leads', modulo: 'CRM', pantalla: 'Leads', acciones: ['ver','crear','editar','anular','exportar'] },
  { key: 'pipeline', modulo: 'CRM', pantalla: 'Pipeline y Oportunidades', acciones: ['ver','crear','editar','aprobar','exportar','precios'] },
  { key: 'actividades', modulo: 'CRM', pantalla: 'Actividades Comerciales', acciones: ['ver','crear','editar','exportar'] },
  { key: 'agenda_comercial', modulo: 'CRM', pantalla: 'Agenda Comercial', acciones: ['ver','crear','editar','exportar'] },
  { key: 'hoja_costeo', modulo: 'Comercial', pantalla: 'Hoja de Costeo', acciones: ['ver','crear','editar','aprobar','exportar','costos'] },
  { key: 'cotizaciones', modulo: 'Comercial', pantalla: 'Cotizaciones', acciones: ['ver','crear','editar','anular','aprobar','exportar','precios'] },
  { key: 'os_cliente', modulo: 'Comercial', pantalla: 'OS Cliente', acciones: ['ver','crear','editar','anular','exportar','precios','finanzas'] },
  { key: 'planner', modulo: 'Operaciones', pantalla: 'Planner y Recursos', acciones: ['ver','crear','editar','exportar','costos'] },
  { key: 'backlog', modulo: 'Operaciones', pantalla: 'Backlog', acciones: ['ver','crear','editar','aprobar'] },
  { key: 'ot', modulo: 'Operaciones', pantalla: 'Ordenes de Trabajo', acciones: ['ver','crear','editar','anular','aprobar','exportar','costos'] },
  { key: 'partes', modulo: 'Operaciones', pantalla: 'Partes Diarios', acciones: ['ver','crear','editar','aprobar','costos'] },
  { key: 'cierre', modulo: 'Operaciones', pantalla: 'Cierre y Calidad', acciones: ['ver','editar','aprobar','exportar'] },
  { key: 'tickets', modulo: 'Operaciones', pantalla: 'Soporte y Tickets', acciones: ['ver','crear','editar','aprobar','exportar'] },
  { key: 'inventario', modulo: 'Logistica', pantalla: 'Almacenes e Inventario', acciones: ['ver','crear','editar','aprobar','exportar','costos'] },
  { key: 'solpe', modulo: 'Logistica', pantalla: 'SOLPE Interna', acciones: ['ver','crear','editar','aprobar','exportar','costos'] },
  { key: 'remision', modulo: 'Logistica', pantalla: 'Transporte y Guias', acciones: ['ver','crear','editar','aprobar','exportar','costos'] },
  { key: 'proveedores', modulo: 'Compras', pantalla: 'Proveedores', acciones: ['ver','crear','editar','aprobar','exportar','costos','finanzas'] },
  { key: 'cot_compras', modulo: 'Compras', pantalla: 'Cotizaciones de Compra', acciones: ['ver','crear','editar','aprobar','exportar','costos'] },
  { key: 'ordenes_compra', modulo: 'Compras', pantalla: 'Ordenes de Compra', acciones: ['ver','crear','editar','aprobar','exportar','costos','finanzas'] },
  { key: 'ordenes_servicio', modulo: 'Compras', pantalla: 'Ordenes de Servicio', acciones: ['ver','crear','editar','aprobar','exportar','costos','finanzas'] },
  { key: 'recepciones', modulo: 'Compras', pantalla: 'Recepciones', acciones: ['ver','crear','editar','aprobar','exportar','costos'] },
  { key: 'rrhh_operativo', modulo: 'RRHH', pantalla: 'Personal Operativo', acciones: ['ver','crear','editar','exportar','costos','finanzas'] },
  { key: 'rrhh_admin', modulo: 'RRHH', pantalla: 'Personal Administrativo', acciones: ['ver','crear','editar','exportar','costos','finanzas'] },
  { key: 'asistencia', modulo: 'RRHH', pantalla: 'Control de Asistencia', acciones: ['ver','crear','editar','exportar'] },
  { key: 'turnos', modulo: 'RRHH', pantalla: 'Turnos y Horarios', acciones: ['ver','crear','editar','exportar'] },
  { key: 'nomina', modulo: 'RRHH', pantalla: 'Nomina', acciones: ['ver','crear','editar','aprobar','exportar','finanzas'] },
  { key: 'prestamos_personal', modulo: 'RRHH', pantalla: 'Prestamos al Personal', acciones: ['ver','crear','editar','exportar','finanzas'] },
  { key: 'financiamiento', modulo: 'Administracion', pantalla: 'Financiamiento y Deuda', acciones: ['ver','crear','editar','aprobar','exportar','finanzas'] },
  { key: 'ventas', modulo: 'Administracion', pantalla: 'Ventas', acciones: ['ver','crear','editar','exportar','finanzas'] },
  { key: 'cxc', modulo: 'Administracion', pantalla: 'Cuentas por Cobrar', acciones: ['ver','crear','editar','aprobar','exportar','finanzas'] },
  { key: 'cxp', modulo: 'Administracion', pantalla: 'Cuentas por Pagar', acciones: ['ver','crear','editar','aprobar','exportar','finanzas'] },
  { key: 'tesoreria', modulo: 'Administracion', pantalla: 'Tesoreria y Match Bancario', acciones: ['ver','crear','editar','aprobar','exportar','finanzas'] },
  { key: 'resultados', modulo: 'Administracion', pantalla: 'Estado de Resultados', acciones: ['ver','exportar','costos','finanzas'] },
  { key: 'roles', modulo: 'Configuracion', pantalla: 'Roles y Permisos', acciones: ['ver','crear','editar','anular','exportar'] },
  { key: 'usuarios', modulo: 'Configuracion', pantalla: 'Usuarios', acciones: ['ver','crear','editar','anular','exportar'] },
  { key: 'maestros', modulo: 'Configuracion', pantalla: 'Maestros Base', acciones: ['ver','crear','editar','exportar'] },
  { key: 'parametros', modulo: 'Configuracion', pantalla: 'Parametros Generales', acciones: ['ver','crear','editar','exportar'] }
];
export const servicios = [
  { id: 'SRV-001', familia: 'Mantenimiento', descripcion: 'Mantenimiento preventivo mensual', unidad: 'Servicio', costo: 3800, precio: 6200, margen: 39, estado: 'activo', facturable: true },
  { id: 'SRV-002', familia: 'Correctivo', descripcion: 'Atencion correctiva industrial', unidad: 'Hora', costo: 95, precio: 165, margen: 42, estado: 'activo', facturable: true },
  { id: 'SRV-003', familia: 'Instalacion', descripcion: 'Instalacion electrica y CCTV', unidad: 'Proyecto', costo: 12800, precio: 21500, margen: 40, estado: 'activo', facturable: true },
  { id: 'SRV-004', familia: 'Consultoria', descripcion: 'Diagnostico operativo y plan de mejora', unidad: 'Informe', costo: 2400, precio: 6800, margen: 65, estado: 'activo', facturable: true },
  { id: 'SRV-005', familia: 'Interno', descripcion: 'Inspeccion interna de calidad', unidad: 'Actividad', costo: 420, precio: 0, margen: 0, estado: 'activo', facturable: false }
];
export const tarifarios = [
  { id: 'TAR-STD-2026', cliente: 'Lista estandar servicios 2026', moneda: 'PEN', items: 18, vigencia: '01 Ene 2026 - 31 Dic 2026', estado: 'activo' },
  { id: 'TAR-MIN-001', cliente: 'Minera Andes SAC', moneda: 'PEN', items: 12, vigencia: '01 Abr 2026 - 31 Mar 2027', estado: 'activo' },
  { id: 'TAR-FAC-004', cliente: 'Facilities Lima SA', moneda: 'PEN', items: 8, vigencia: '15 Ene 2026 - 15 Ene 2027', estado: 'activo' }
];
export const cargosEmpresa = [
  { id:'car_001', codigo:'CAR-001', nombre:'Gerente General',                 tipo:'Administrativo', detalle:'Dirección general de la empresa',             estado:'activo' },
  { id:'car_002', codigo:'CAR-002', nombre:'Super Administrador',              tipo:'Administrativo', detalle:'Administrador total del tenant',              estado:'activo' },
  { id:'car_003', codigo:'CAR-003', nombre:'Jefe Comercial',                   tipo:'Administrativo', detalle:'Responsable de ventas y pipeline',            estado:'activo' },
  { id:'car_004', codigo:'CAR-004', nombre:'Ejecutivo Comercial',              tipo:'Administrativo', detalle:'Gestión de cuentas y oportunidades',          estado:'activo' },
  { id:'car_005', codigo:'CAR-005', nombre:'Jefe de Operaciones',              tipo:'Administrativo', detalle:'Responsable de ejecución operativa',          estado:'activo' },
  { id:'car_006', codigo:'CAR-006', nombre:'Jefe de Finanzas',                 tipo:'Administrativo', detalle:'CxC, CxP, tesorería y EEFF',                 estado:'activo' },
  { id:'car_007', codigo:'CAR-007', nombre:'Analista Financiero',              tipo:'Administrativo', detalle:'Soporte financiero y reportes',               estado:'activo' },
  { id:'car_008', codigo:'CAR-008', nombre:'Responsable Customer Success',     tipo:'Administrativo', detalle:'Gestión de clientes y renovaciones',          estado:'activo' },
  { id:'car_009', codigo:'CAR-009', nombre:'Comprador',                        tipo:'Administrativo', detalle:'Adquisiciones y proveedores',                 estado:'activo' },
  { id:'car_010', codigo:'CAR-010', nombre:'Almacenero',                       tipo:'Administrativo', detalle:'Control de inventario y despacho',            estado:'activo' },
  { id:'car_011', codigo:'CAR-011', nombre:'Técnico Mecánico',                 tipo:'Operativo',      detalle:'Mantenimiento mecánico industrial',           estado:'activo' },
  { id:'car_012', codigo:'CAR-012', nombre:'Técnico Electrónico',              tipo:'Operativo',      detalle:'Sistemas eléctricos y electrónicos',          estado:'activo' },
  { id:'car_013', codigo:'CAR-013', nombre:'Técnico de Instrumentación',       tipo:'Operativo',      detalle:'Instrumentos de medición y control',          estado:'activo' },
  { id:'car_014', codigo:'CAR-014', nombre:'Técnica de Instrumentación',       tipo:'Operativo',      detalle:'Instrumentos de medición y control',          estado:'activo' },
  { id:'car_015', codigo:'CAR-015', nombre:'Electricista Industrial',          tipo:'Operativo',      detalle:'Instalaciones eléctricas de alta tensión',    estado:'activo' },
  { id:'car_016', codigo:'CAR-016', nombre:'Supervisora SSO',                  tipo:'Operativo',      detalle:'Seguridad y salud ocupacional',               estado:'activo' },
  { id:'car_017', codigo:'CAR-017', nombre:'Supervisor HSE',                   tipo:'Operativo',      detalle:'Health, safety & environment',                estado:'activo' },
  { id:'car_018', codigo:'CAR-018', nombre:'Ayudante Técnico',                 tipo:'Operativo',      detalle:'Apoyo en trabajos de campo',                  estado:'activo' },
  { id:'car_019', codigo:'CAR-019', nombre:'Soldador Certificado',             tipo:'Operativo',      detalle:'Soldadura estructural e industrial',          estado:'activo' },
  { id:'car_020', codigo:'CAR-020', nombre:'Técnico PLC / SCADA',             tipo:'Operativo',      detalle:'Automatización y control industrial',          estado:'activo' },
  { id:'car_021', codigo:'CAR-021', nombre:'Operario de Mantenimiento',        tipo:'Operativo',      detalle:'Mantenimiento general en campo',              estado:'activo' },
  { id:'car_022', codigo:'CAR-022', nombre:'Supervisor de Operaciones',        tipo:'Ambos',          detalle:'Supervisión de equipos mixtos',               estado:'activo' },
];
export const maestros = [
  { id: 'mst_clientes', tabla: 'Clientes y contactos', valores: 42, actualizado: 'hoy' },
  { id: 'mst_proveedores', tabla: 'Proveedores', valores: 18, actualizado: 'ayer' },
  { id: 'mst_industrias', tabla: 'Industrias', valores: 15, actualizado: 'hoy' },
  { id: 'mst_sedes', tabla: 'Sedes y ubicaciones GPS', valores: 14, actualizado: 'hace 2 dias' },
  { id: 'mst_centros_costo', tabla: 'Centros de costo', valores: 9, actualizado: 'hace 1 semana' },
  { id: 'mst_cargos', tabla: 'Cargos de la empresa', valores: 12, actualizado: 'hoy' },
  { id: 'mst_especialidades', tabla: 'Especialidades técnicas', valores: 8, actualizado: 'hoy' },
  { id: 'mst_materiales', tabla: 'Materiales e insumos con codigo de barras', valores: 186, actualizado: 'hoy' },
  { id: 'mst_impuestos', tabla: 'Monedas, impuestos y unidades', valores: 21, actualizado: 'hace 1 mes' },
  { id: 'mst_tipos_servicio', tabla: 'Tipos de servicio interno', valores: 6, actualizado: 'hace 3 dias' },
  { id: 'mst_almacenes', tabla: 'Almacenes y depósitos', valores: 4, actualizado: 'hace 1 semana' },
];
export const industrias = [
  { id:'ind_001', codigo:'MIN', nombre:'Mineria', categoria:'Industrial', estado:'activo' },
  { id:'ind_002', codigo:'IND', nombre:'Industrial', categoria:'Industrial', estado:'activo' },
  { id:'ind_003', codigo:'CON', nombre:'Construccion', categoria:'Infraestructura', estado:'activo' },
  { id:'ind_004', codigo:'AGR', nombre:'Agroindustria', categoria:'Industrial', estado:'activo' },
  { id:'ind_005', codigo:'FAC', nombre:'Facilities', categoria:'Servicios', estado:'activo' },
  { id:'ind_006', codigo:'ENE', nombre:'Energia', categoria:'Industrial', estado:'activo' },
  { id:'ind_007', codigo:'OIL', nombre:'Petroleo & Gas', categoria:'Industrial', estado:'activo' },
  { id:'ind_008', codigo:'LOG', nombre:'Logistica', categoria:'Servicios', estado:'activo' },
  { id:'ind_009', codigo:'RET', nombre:'Retail', categoria:'Comercial', estado:'activo' },
  { id:'ind_010', codigo:'SAL', nombre:'Salud', categoria:'Servicios', estado:'activo' },
  { id:'ind_011', codigo:'EDU', nombre:'Educacion', categoria:'Servicios', estado:'activo' },
  { id:'ind_012', codigo:'TEC', nombre:'Tecnologia', categoria:'Servicios', estado:'activo' },
  { id:'ind_013', codigo:'PRO', nombre:'Servicios profesionales', categoria:'Servicios', estado:'activo' },
  { id:'ind_014', codigo:'PUB', nombre:'Sector publico', categoria:'Gobierno', estado:'activo' },
  { id:'ind_015', codigo:'OTR', nombre:'Otro', categoria:'General', estado:'activo' },
];
export const especialidadesTecnicas = [
  { id:'esp_001', codigo:'ESP-001', nombre:'Electricista industrial', area:'Eléctrica', requiere_cert:true, estado:'activo' },
  { id:'esp_002', codigo:'ESP-002', nombre:'Mecánico de fajas transportadoras', area:'Mecánica', requiere_cert:false, estado:'activo' },
  { id:'esp_003', codigo:'ESP-003', nombre:'Técnico en instrumentación', area:'Instrumentación', requiere_cert:true, estado:'activo' },
  { id:'esp_004', codigo:'ESP-004', nombre:'Soldador homologado', area:'Mecánica', requiere_cert:true, estado:'activo' },
  { id:'esp_005', codigo:'ESP-005', nombre:'Técnico CCTV y seguridad', area:'Sistemas', requiere_cert:false, estado:'activo' },
  { id:'esp_006', codigo:'ESP-006', nombre:'Técnico en climatización', area:'Mecánica', requiere_cert:false, estado:'activo' },
  { id:'esp_007', codigo:'ESP-007', nombre:'Supervisor HSE', area:'Seguridad', requiere_cert:true, estado:'activo' },
  { id:'esp_008', codigo:'ESP-008', nombre:'Técnico polivalente', area:'General', requiere_cert:false, estado:'activo' }
];
export const tiposServicioInterno = [
  { id:'tsi_001', codigo:'TSI-001', nombre:'Mantenimiento preventivo', clasificacion:'Preventivo', facturable:true, estado:'activo' },
  { id:'tsi_002', codigo:'TSI-002', nombre:'Mantenimiento correctivo', clasificacion:'Correctivo', facturable:true, estado:'activo' },
  { id:'tsi_003', codigo:'TSI-003', nombre:'Proyecto de instalación', clasificacion:'Proyecto', facturable:true, estado:'activo' },
  { id:'tsi_004', codigo:'TSI-004', nombre:'Atención de emergencia', clasificacion:'Emergencia', facturable:true, estado:'activo' },
  { id:'tsi_005', codigo:'TSI-005', nombre:'Servicio en garantía', clasificacion:'Garantía', facturable:false, estado:'activo' },
  { id:'tsi_006', codigo:'TSI-006', nombre:'Trabajo interno', clasificacion:'Interno', facturable:false, estado:'activo' }
];
export const almacenesDepositos = [
  { id:'alm_001', codigo:'ALM-001', nombre:'Almacén Central Lima', tipo:'Central', responsable:'Roberto Quispe', direccion:'Av. Argentina 2450, Cercado de Lima', estado:'activo' },
  { id:'alm_002', codigo:'ALM-002', nombre:'Almacén Sede Norte', tipo:'Sede', responsable:'María Flores', direccion:'Carretera Panamericana Norte Km 23', estado:'activo' },
  { id:'alm_003', codigo:'ALM-003', nombre:'Almacén Móvil Unidad 1', tipo:'Móvil', responsable:'Juan Técnico', direccion:'—', estado:'activo' },
  { id:'alm_004', codigo:'ALM-004', nombre:'Almacén en Tránsito', tipo:'Tránsito', responsable:'—', direccion:'—', estado:'activo' }
];
export const remisiones = [
  { id: 'GR-002-4512', ot: 'OT-25-0012', destino: 'Minera Andes - Planta Norte', transportista: 'Transporte Rapido SAC / H. Pinedo', fecha: '2026-04-26', estado: 'en_transito' },
  { id: 'GR-002-4508', ot: 'OT-25-0013', destino: 'Facilities Lima - Sede Sur', transportista: 'Unidad propia / A. Gomez', fecha: '2026-04-24', estado: 'entregado' },
  { id: 'GR-002-4499', ot: 'OT-25-0011', destino: 'PIN SRL - Planta Ancon', transportista: 'Logistica Norte EIRL', fecha: '2026-04-20', estado: 'entregado' }
];
export const ventas = [
  { id: 'VEN-2026-0041', fecha: '2026-04-20', cliente: 'Minera Andes SAC', concepto: 'Servicio mantenimiento preventivo', monto: 95000, moneda: 'PEN', estado: 'emitida' },
  { id: 'VEN-2026-0039', fecha: '2026-04-18', cliente: 'Facilities Lima SA', concepto: 'Instalacion CCTV - hito 2', monto: 22400, moneda: 'PEN', estado: 'cobrada' },
  { id: 'VEN-2026-0034', fecha: '2026-04-01', cliente: 'Planta Industrial Norte SRL', concepto: 'Correctivo tablero principal', monto: 18500, moneda: 'PEN', estado: 'pendiente' },
  { id: 'VEN-2026-0028', fecha: '2026-03-01', cliente: 'Logistica Altiplano SAC', concepto: 'Servicio logistico recurrente', monto: 32800, moneda: 'PEN', estado: 'vencida' }
];
export const cajaChica = [
  { id: 'CC-001', fecha: '2026-04-22', responsable: 'Juan Tecnico', concepto: 'Movilidad a planta cliente', comprobante: 'BOL-00321', monto: 85, estado: 'rendido' },
  { id: 'CC-002', fecha: '2026-04-23', responsable: 'R. Chavez', concepto: 'Compra urgente de consumibles', comprobante: 'F001-2341', monto: 450, estado: 'pendiente' },
  { id: 'CC-003', fecha: '2026-04-24', responsable: 'A. Gomez', concepto: 'Estacionamiento y peajes', comprobante: 'TCK-8821', monto: 64, estado: 'aprobado' }
];
export const prestamos = [
  { id: 'PRE-001', empleado: 'Juan Tecnico', fecha: '2026-02-01', monto: 2400, cuotas: 6, pagado: 800, estado: 'vigente', descuento_nomina: true, cuota_mensual: 400 },
  { id: 'PRE-002', empleado: 'Pedro Salas', fecha: '2026-01-15', monto: 1500, cuotas: 3, pagado: 1500, estado: 'cancelado', descuento_nomina: true, cuota_mensual: 500 },
  { id: 'PRE-003', empleado: 'Andrea Rios', fecha: '2026-04-10', monto: 900, cuotas: 3, pagado: 0, estado: 'vigente', descuento_nomina: true, cuota_mensual: 300 }
];

export const financiamientos = [
  {
    id: 'fin_001', empresa_id: 'emp_001', codigo: 'FIN-001',
    tipo: 'bancario', entidad: 'BCP — Banco de Crédito del Perú', tipo_entidad: 'banco',
    contacto_nombre: 'María Gutierrez', contacto_telefono: '01-311-9898', contacto_email: 'm.gutierrez@bcp.com.pe',
    monto_original: 50000, moneda: 'PEN', tasa_anual: 12, tipo_tasa: 'TEA',
    plazo_meses: 24, meses_gracia: 0, dia_pago: 5, tipo_cuota: 'frances',
    cuota_mensual: 2354.17, fecha_desembolso: '2026-03-01',
    fecha_primer_pago: '2026-04-05', fecha_ultimo_pago: '2028-03-05',
    saldo_pendiente: 31250, cuotas_pagadas: 8, intereses_pagados_total: 3240,
    proposito: 'Compra de equipos para operaciones de campo', centro_costo: 'CC-OPS',
    cuenta_bancaria_destino: 'BCP Cta. cte.', estado: 'vigente',
    notas: 'Préstamo capital de trabajo aprobado en comité de crédito.',
    tabla_amortizacion: [
      { numero:1, fecha:'2026-04-05', capital:1854.17, interes:500.00, total:2354.17, saldo:48145.83, estado:'pagada', fecha_pago_real:'2026-04-05' },
      { numero:2, fecha:'2026-05-05', capital:1872.71, interes:481.46, total:2354.17, saldo:46273.12, estado:'pendiente' },
      { numero:3, fecha:'2026-06-05', capital:1891.44, interes:462.73, total:2354.17, saldo:44381.68, estado:'futura' },
      { numero:4, fecha:'2026-07-05', capital:1910.35, interes:443.82, total:2354.17, saldo:42471.33, estado:'futura' },
      { numero:5, fecha:'2026-08-05', capital:1929.46, interes:424.71, total:2354.17, saldo:40541.87, estado:'futura' },
      { numero:6, fecha:'2026-09-05', capital:1948.75, interes:405.42, total:2354.17, saldo:38593.12, estado:'futura' }
    ]
  },
  {
    id: 'fin_002', empresa_id: 'emp_001', codigo: 'FIN-002',
    tipo: 'tercero', entidad: 'Jorge Mamani Quispe', tipo_entidad: 'persona_natural',
    contacto_nombre: 'Jorge Mamani Quispe', contacto_telefono: '+51 987 123 456', contacto_email: 'j.mamani@gmail.com',
    monto_original: 15000, moneda: 'PEN', tasa_anual: 18, tipo_tasa: 'TEA',
    plazo_meses: 12, meses_gracia: 0, dia_pago: 15, tipo_cuota: 'frances',
    cuota_mensual: 1375, fecha_desembolso: '2025-09-15',
    fecha_primer_pago: '2025-10-15', fecha_ultimo_pago: '2026-09-15',
    saldo_pendiente: 7500, cuotas_pagadas: 6, intereses_pagados_total: 1080,
    proposito: 'Financiamiento urgente para capital de trabajo Q4 2025',
    estado: 'vigente', notas: 'Préstamo personal con acuerdo notarial. Tasa 1.5% mensual.',
    tabla_amortizacion: [
      { numero:1, fecha:'2025-10-15', capital:1150.00, interes:225.00, total:1375.00, saldo:13850.00, estado:'pagada', fecha_pago_real:'2025-10-15' },
      { numero:2, fecha:'2025-11-15', capital:1167.25, interes:207.75, total:1375.00, saldo:12682.75, estado:'pagada', fecha_pago_real:'2025-11-14' },
      { numero:3, fecha:'2025-12-15', capital:1184.75, interes:190.25, total:1375.00, saldo:11498.00, estado:'pagada', fecha_pago_real:'2025-12-15' },
      { numero:4, fecha:'2026-01-15', capital:1202.52, interes:172.48, total:1375.00, saldo:10295.48, estado:'pagada', fecha_pago_real:'2026-01-15' },
      { numero:5, fecha:'2026-02-15', capital:1220.56, interes:154.44, total:1375.00, saldo:9074.92, estado:'pagada', fecha_pago_real:'2026-02-17' },
      { numero:6, fecha:'2026-03-15', capital:1238.87, interes:136.13, total:1375.00, saldo:7836.05, estado:'pagada', fecha_pago_real:'2026-03-15' },
      { numero:7, fecha:'2026-04-15', capital:1257.45, interes:117.55, total:1375.00, saldo:6578.60, estado:'pendiente' },
      { numero:8, fecha:'2026-05-15', capital:1276.32, interes:98.68, total:1375.00, saldo:5302.28, estado:'futura' }
    ]
  },
  {
    id: 'fin_003', empresa_id: 'emp_001', codigo: 'FIN-003',
    tipo: 'leasing', entidad: 'Scotiabank — Leasing vehicular', tipo_entidad: 'banco',
    contacto_nombre: 'Rosa Delgado', contacto_telefono: '01-211-6000',
    monto_original: 28000, moneda: 'PEN', tasa_anual: 9, tipo_tasa: 'TEA',
    plazo_meses: 36, meses_gracia: 0, dia_pago: 10, tipo_cuota: 'frances',
    cuota_mensual: 890.14, fecha_desembolso: '2025-07-10',
    fecha_primer_pago: '2025-08-10', fecha_ultimo_pago: '2028-07-10',
    saldo_pendiente: 21000, cuotas_pagadas: 9, intereses_pagados_total: 1820,
    proposito: 'Leasing camioneta Pick-up para operaciones de campo — Placa AXY-123',
    estado: 'vigente', notas: 'Incluye seguro vehicular en cuota.',
    tabla_amortizacion: [
      { numero:1, fecha:'2025-08-10', capital:680.14, interes:210.00, total:890.14, saldo:27319.86, estado:'pagada', fecha_pago_real:'2025-08-10' },
      { numero:2, fecha:'2025-09-10', capital:685.23, interes:204.91, total:890.14, saldo:26634.63, estado:'pagada', fecha_pago_real:'2025-09-10' },
      { numero:10, fecha:'2026-05-10', capital:732.03, interes:158.11, total:890.14, saldo:20267.97, estado:'pendiente' },
      { numero:11, fecha:'2026-06-10', capital:737.52, interes:152.62, total:890.14, saldo:19530.45, estado:'futura' },
      { numero:12, fecha:'2026-07-10', capital:743.05, interes:147.09, total:890.14, saldo:18787.40, estado:'futura' }
    ]
  },
  {
    id: 'fin_004', empresa_id: 'emp_001', codigo: 'FIN-004',
    tipo: 'linea_credito', entidad: 'BBVA — Línea de crédito', tipo_entidad: 'banco',
    monto_original: 20000, moneda: 'PEN', tasa_anual: 15, tipo_tasa: 'TEA',
    plazo_meses: 0, meses_gracia: 0, dia_pago: 25, tipo_cuota: 'revolvente',
    cuota_mensual: 0, fecha_desembolso: '2025-11-01', fecha_primer_pago: null, fecha_ultimo_pago: null,
    saldo_pendiente: 0, cuotas_pagadas: 0, intereses_pagados_total: 450,
    proposito: 'Línea revolvente para desfases de caja', estado: 'cancelado',
    notas: 'Sin saldo utilizado actualmente.', tabla_amortizacion: []
  }
];

export const movimientosTesoreria = [];
export const cxp = [
  { id: 'CXP-001', proveedor: 'Ferreteria Industrial SAC', factura: 'F001-2341', emision: '2026-04-22', vencimiento: '2026-05-07', monto: 450, estado: 'por_pagar' },
  { id: 'CXP-002', proveedor: 'Electroandes', factura: 'F002-1122', emision: '2026-04-20', vencimiento: '2026-04-24', monto: 1250, estado: 'pagada' },
  { id: 'CXP-003', proveedor: 'Mantenimientos Externos EIRL', factura: 'E001-0881', emision: '2026-04-25', vencimiento: '2026-05-10', monto: 3800, estado: 'por_pagar' },
  { id: 'CXP-004', proveedor: 'Logistica Norte EIRL', factura: 'F003-0714', emision: '2026-03-28', vencimiento: '2026-04-12', monto: 2100, estado: 'vencido' }
];

// ============================================================
// FASE 3 — RRHH ADMINISTRATIVO
// ============================================================
export const personalAdmin = [
  { id: 'per_001', empresa_id: 'emp_001', usuario_id: 'u2',
    nombre: 'Carla Meza', dni: '74512345', fecha_nacimiento: '1990-03-15',
    direccion: 'Av. Brasil 2341, Breña, Lima',
    contacto_emergencia: 'María Meza', telefono_emergencia: '+51 987 111 222', relacion_emergencia: 'Madre',
    nivel_estudios: 'Universitario', especialidad: 'Administración de Empresas', institucion: 'PUCP',
    cargo: 'Jefa Comercial', area: 'Comercial', supervisor: 'Admin Master',
    tipo_contrato: 'Indefinido', fecha_inicio_contrato: '2022-01-01', fecha_fin_contrato: null,
    remuneracion: 4500, modalidad: 'Presencial', sede: 'Lima Principal', turno_id: 'tur_005',
    dias_vacaciones_total: 30, dias_vacaciones_usados: 12, dias_vacaciones_disponibles: 18,
    estado: 'activo', fecha_ingreso: '2022-01-01',
    documentos: [
      { nombre: 'DNI', vencimiento: null, estado: 'vigente' },
      { nombre: 'Brevete Cat. B', vencimiento: '2026-08-15', estado: 'vigente' }
    ]
  },
  { id: 'per_002', empresa_id: 'emp_001', usuario_id: 'u3',
    nombre: 'Pedro Salas', dni: '76543210', fecha_nacimiento: '1988-07-22',
    direccion: 'Jr. Camaná 890, Cercado, Lima',
    contacto_emergencia: 'Rosa Salas', telefono_emergencia: '+51 987 222 333', relacion_emergencia: 'Esposa',
    nivel_estudios: 'Universitario', especialidad: 'Ingeniería Industrial', institucion: 'UNI',
    cargo: 'Ejecutivo Comercial', area: 'Comercial', supervisor: 'Carla Meza',
    tipo_contrato: 'Plazo fijo', fecha_inicio_contrato: '2023-03-01', fecha_fin_contrato: '2025-03-01',
    remuneracion: 3200, modalidad: 'Presencial', sede: 'Lima Principal', turno_id: 'tur_005',
    dias_vacaciones_total: 30, dias_vacaciones_usados: 5, dias_vacaciones_disponibles: 25,
    estado: 'activo', fecha_ingreso: '2023-03-01',
    documentos: [
      { nombre: 'DNI', vencimiento: null, estado: 'vigente' },
      { nombre: 'Contrato plazo fijo', vencimiento: '2025-03-01', estado: 'por_vencer' }
    ]
  },
  { id: 'per_003', empresa_id: 'emp_001', usuario_id: 'u4',
    nombre: 'Andrea Rios', dni: '73210987', fecha_nacimiento: '1993-11-05',
    direccion: 'Calle Las Flores 445, San Isidro, Lima',
    contacto_emergencia: 'Carlos Rios', telefono_emergencia: '+51 987 333 444', relacion_emergencia: 'Padre',
    nivel_estudios: 'Universitario', especialidad: 'Marketing', institucion: 'UPC',
    cargo: 'Ejecutiva Comercial', area: 'Comercial', supervisor: 'Carla Meza',
    tipo_contrato: 'Indefinido', fecha_inicio_contrato: '2021-06-15', fecha_fin_contrato: null,
    remuneracion: 3400, modalidad: 'Presencial', sede: 'Lima Principal', turno_id: 'tur_005',
    dias_vacaciones_total: 30, dias_vacaciones_usados: 20, dias_vacaciones_disponibles: 10,
    estado: 'activo', fecha_ingreso: '2021-06-15',
    documentos: [
      { nombre: 'DNI', vencimiento: null, estado: 'vigente' }
    ]
  },
  { id: 'per_004', empresa_id: 'emp_001', usuario_id: 'u5',
    nombre: 'Juan Técnico', dni: '72109876', fecha_nacimiento: '1985-04-18',
    direccion: 'Av. Tupac Amaru 1230, Comas, Lima',
    contacto_emergencia: 'Elena Torres', telefono_emergencia: '+51 987 444 555', relacion_emergencia: 'Esposa',
    nivel_estudios: 'Técnico', especialidad: 'Mecánica Industrial', institucion: 'SENATI',
    cargo: 'Técnico de Campo', area: 'Operaciones', supervisor: 'M. López',
    tipo_contrato: 'Indefinido', fecha_inicio_contrato: '2020-02-01', fecha_fin_contrato: null,
    remuneracion: 2800, modalidad: 'Campo', sede: 'Lima Norte', turno_id: 'tur_001',
    dias_vacaciones_total: 30, dias_vacaciones_usados: 8, dias_vacaciones_disponibles: 22,
    estado: 'activo', fecha_ingreso: '2020-02-01',
    documentos: [
      { nombre: 'DNI', vencimiento: null, estado: 'vigente' },
      { nombre: 'Cert. altura (ISOS)', vencimiento: '2025-06-30', estado: 'vigente' },
      { nombre: 'Cert. electricidad BT', vencimiento: '2024-12-31', estado: 'vencido' }
    ]
  }
];

export const vacacionesSolicitudes = [
  { id: 'vac_001', empresa_id: 'emp_001', personal_id: 'per_001',
    tipo: 'vacaciones', fecha_solicitud: '2025-01-20',
    fecha_inicio: '2025-02-10', fecha_fin: '2025-02-21', dias: 10,
    motivo: 'Vacaciones anuales programadas', estado: 'aprobado', aprobador: 'Admin Master' },
  { id: 'vac_002', empresa_id: 'emp_001', personal_id: 'per_003',
    tipo: 'vacaciones', fecha_solicitud: '2025-01-15',
    fecha_inicio: '2025-03-01', fecha_fin: '2025-03-15', dias: 15,
    motivo: 'Viaje familiar internacional', estado: 'pendiente', aprobador: null },
  { id: 'vac_003', empresa_id: 'emp_001', personal_id: 'per_004',
    tipo: 'vacaciones', fecha_solicitud: '2024-12-10',
    fecha_inicio: '2025-01-06', fecha_fin: '2025-01-10', dias: 5,
    motivo: 'Fiestas de Año Nuevo', estado: 'aprobado', aprobador: 'Admin Master' }
];

export const licencias = [
  { id: 'lic_001', empresa_id: 'emp_001', personal_id: 'per_002',
    tipo: 'medica', fecha_solicitud: '2025-01-12',
    fecha_inicio: '2025-01-13', fecha_fin: '2025-01-17', dias: 5,
    motivo: 'Reposo médico — gripe con complicaciones', documento: 'descanso_medico.pdf',
    estado: 'aprobado', aprobador: 'Admin Master' },
  { id: 'lic_002', empresa_id: 'emp_001', personal_id: 'per_001',
    tipo: 'permiso', fecha_solicitud: '2025-01-23',
    fecha_inicio: '2025-01-24', fecha_fin: '2025-01-24', dias: 1,
    motivo: 'Trámite personal en notaría', documento: null,
    estado: 'pendiente', aprobador: null }
];

export const solicitudesRRHH = [
  { id: 'srr_001', empresa_id: 'emp_001', personal_id: 'per_004',
    tipo: 'certificado', descripcion: 'Certificado de trabajo para préstamo bancario',
    fecha: '2025-01-18', estado: 'atendido', fecha_entrega: '2025-01-20' },
  { id: 'srr_002', empresa_id: 'emp_001', personal_id: 'per_003',
    tipo: 'adelanto', descripcion: 'Adelanto de sueldo S/ 500', monto: 500,
    fecha: '2025-01-22', estado: 'aprobado', fecha_entrega: null }
];

// ============================================================
// FASE 3 — CUSTOMER SUCCESS
// ============================================================
export const onboardings = [
  { id: 'onb_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    responsable_cs: 'Carla Meza', tipo_servicio: 'Mantenimiento Preventivo',
    fecha_inicio: '2024-11-01', fecha_fin_planificada: '2024-11-30', fecha_fin_real: '2024-12-05',
    objetivo_cliente: 'Reducir paradas no planificadas en 40% en los primeros 6 meses',
    checklist: [
      { id: 1, item: 'Reunión de bienvenida realizada', completado: true, fecha: '2024-11-04' },
      { id: 2, item: 'Presentación del equipo técnico', completado: true, fecha: '2024-11-06' },
      { id: 3, item: 'Relevamiento de instalaciones', completado: true, fecha: '2024-11-10' },
      { id: 4, item: 'Definición de cronograma mensual', completado: true, fecha: '2024-11-15' },
      { id: 5, item: 'Primera visita de mantenimiento ejecutada', completado: true, fecha: '2024-12-01' },
      { id: 6, item: 'Encuesta de satisfacción inicial enviada', completado: true, fecha: '2024-12-05' }
    ],
    hitos: [
      { nombre: 'Primera OT ejecutada', fecha_plan: '2024-11-20', fecha_real: '2024-12-01', estado: 'completado' },
      { nombre: 'Informe técnico inicial entregado', fecha_plan: '2024-11-30', fecha_real: '2024-12-05', estado: 'completado' }
    ],
    nps_inicial: 8, comentario_nps: 'Proceso ordenado, equipo muy profesional.',
    estado: 'completado' },
  { id: 'onb_002', empresa_id: 'emp_001', cuenta_id: 'cta_004',
    responsable_cs: 'Pedro Salas', tipo_servicio: 'Instalación CCTV',
    fecha_inicio: '2025-01-20', fecha_fin_planificada: '2025-02-15', fecha_fin_real: null,
    objetivo_cliente: 'Monitoreo 24/7 con acceso remoto desde cualquier dispositivo',
    checklist: [
      { id: 1, item: 'Reunión de bienvenida realizada', completado: true, fecha: '2025-01-20' },
      { id: 2, item: 'Levantamiento de planos y ubicaciones', completado: true, fecha: '2025-01-22' },
      { id: 3, item: 'Instalación ejecutada', completado: false, fecha: null },
      { id: 4, item: 'Capacitación en uso del sistema', completado: false, fecha: null },
      { id: 5, item: 'Encuesta de satisfacción inicial', completado: false, fecha: null }
    ],
    hitos: [
      { nombre: 'Instalación completada', fecha_plan: '2025-02-01', fecha_real: null, estado: 'en_curso' },
      { nombre: 'Capacitación al cliente', fecha_plan: '2025-02-10', fecha_real: null, estado: 'pendiente' }
    ],
    nps_inicial: null, comentario_nps: null,
    estado: 'en_curso' },
  { id: 'onb_003', empresa_id: 'emp_001', cuenta_id: 'cta_005',
    responsable_cs: 'Carla Meza', tipo_servicio: 'Servicio Logístico Recurrente',
    fecha_inicio: '2024-08-01', fecha_fin_planificada: '2024-08-31', fecha_fin_real: '2024-08-28',
    objetivo_cliente: 'Outsourcing operativo integral con SLA definido y reportes mensuales',
    checklist: [
      { id: 1, item: 'Reunión de bienvenida realizada', completado: true, fecha: '2024-08-02' },
      { id: 2, item: 'Definición de SLAs operativos', completado: true, fecha: '2024-08-08' },
      { id: 3, item: 'Primera OT ejecutada', completado: true, fecha: '2024-08-15' },
      { id: 4, item: 'Encuesta de satisfacción inicial enviada', completado: true, fecha: '2024-08-28' }
    ],
    hitos: [
      { nombre: 'Primera operación ejecutada', fecha_plan: '2024-08-20', fecha_real: '2024-08-15', estado: 'completado' }
    ],
    nps_inicial: 6, comentario_nps: 'Cumplió lo esperado pero hubo retrasos en el inicio.',
    estado: 'completado' }
];

export const planesExito = [
  { id: 'pex_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    responsable_cs: 'Carla Meza', fecha_inicio: '2025-01-01',
    objetivo: 'Mantener SLA >98% y reducir incidencias críticas en 30%',
    periodicidad_reunion: 'Mensual',
    reuniones: [
      { fecha: '2024-11-15', tipo: 'Seguimiento mensual', temas: 'Revisión OTs del mes, SLA 96%, planificación Q4.', completado: true },
      { fecha: '2024-12-12', tipo: 'Seguimiento mensual', temas: 'Cierre anual, planificación Q1 2025, renovación contrato.', completado: true },
      { fecha: '2025-01-16', tipo: 'Seguimiento mensual', temas: 'Revisión Q1, expansión a 2 nuevas sedes.', completado: false }
    ],
    adopcion_pct: 94, alertas: [], estado: 'activo' },
  { id: 'pex_002', empresa_id: 'emp_001', cuenta_id: 'cta_002',
    responsable_cs: 'Pedro Salas', fecha_inicio: '2024-09-01',
    objetivo: 'Regularizar deuda y mantener nivel de servicio sin degradación',
    periodicidad_reunion: 'Quincenal',
    reuniones: [
      { fecha: '2025-01-08', tipo: 'Seguimiento gestión deuda', temas: 'Compromiso de pago al 31/01. Solicitan mejora en tiempos de respuesta.', completado: true },
      { fecha: '2025-01-22', tipo: 'Seguimiento', temas: 'Verificar cumplimiento de compromiso de pago.', completado: false }
    ],
    adopcion_pct: 62,
    alertas: ['Saldo vencido S/ 18,500', 'Mora de 15 días', 'Satisfacción baja en último ticket'],
    estado: 'activo' },
  { id: 'pex_003', empresa_id: 'emp_001', cuenta_id: 'cta_005',
    responsable_cs: 'Carla Meza', fecha_inicio: '2024-08-01',
    objetivo: 'Plan de rescate: regularización financiera y recuperación de adopción',
    periodicidad_reunion: 'Semanal',
    reuniones: [
      { fecha: '2025-01-10', tipo: 'Reunión de rescate ejecutiva', temas: 'Cliente reconoce deuda. Propone pagos en cuotas. Reducción de servicios.', completado: true },
      { fecha: '2025-01-17', tipo: 'Seguimiento plan de pagos', temas: 'Primer pago recibido S/ 5,000. Restan S/ 27,800.', completado: true },
      { fecha: '2025-01-24', tipo: 'Seguimiento', temas: 'Evaluar continuidad del servicio.', completado: false }
    ],
    adopcion_pct: 28,
    alertas: ['Saldo vencido crítico S/ 32,800', 'Mora 45 días', '3 tickets sin resolver', 'NPS 3 — cliente detractor'],
    estado: 'critico' }
];

export const healthScoresDetalle = [
  { id: 'hsd_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    score_total: 92, semaforo: 'verde', tendencia: 'estable',
    dimensiones: {
      comercial: { score: 95, peso: 25, variables: { frecuencia_compra: 98, monto_promedio: 95, antiguedad: 92 } },
      operativa: { score: 94, peso: 25, variables: { sla_cumplido: 97, ots_vencidas: 90, reprogramaciones: 95 } },
      financiera: { score: 95, peso: 25, variables: { saldo_vencido: 100, dias_mora: 100, riesgo_credito: 85 } },
      soporte: { score: 88, peso: 15, variables: { tickets_abiertos: 90, tiempo_resolucion: 85, reclamos: 88 } },
      satisfaccion: { score: 82, peso: 10, variables: { nps: 80, encuestas: 85 } }
    },
    historico: [
      { mes: 'Sep 24', score: 88 }, { mes: 'Oct 24', score: 90 },
      { mes: 'Nov 24', score: 91 }, { mes: 'Dic 24', score: 90 }, { mes: 'Ene 25', score: 92 }
    ],
    ultima_actualizacion: '2025-01-24' },
  { id: 'hsd_002', empresa_id: 'emp_001', cuenta_id: 'cta_002',
    score_total: 61, semaforo: 'amarillo', tendencia: 'bajando',
    dimensiones: {
      comercial: { score: 65, peso: 25, variables: { frecuencia_compra: 60, monto_promedio: 70, antiguedad: 65 } },
      operativa: { score: 72, peso: 25, variables: { sla_cumplido: 78, ots_vencidas: 68, reprogramaciones: 70 } },
      financiera: { score: 45, peso: 25, variables: { saldo_vencido: 35, dias_mora: 42, riesgo_credito: 58 } },
      soporte: { score: 65, peso: 15, variables: { tickets_abiertos: 60, tiempo_resolucion: 70, reclamos: 65 } },
      satisfaccion: { score: 55, peso: 10, variables: { nps: 50, encuestas: 60 } }
    },
    historico: [
      { mes: 'Sep 24', score: 72 }, { mes: 'Oct 24', score: 70 },
      { mes: 'Nov 24', score: 67 }, { mes: 'Dic 24', score: 64 }, { mes: 'Ene 25', score: 61 }
    ],
    ultima_actualizacion: '2025-01-24' },
  { id: 'hsd_003', empresa_id: 'emp_001', cuenta_id: 'cta_004',
    score_total: 85, semaforo: 'verde', tendencia: 'subiendo',
    dimensiones: {
      comercial: { score: 88, peso: 25, variables: { frecuencia_compra: 85, monto_promedio: 90, antiguedad: 88 } },
      operativa: { score: 90, peso: 25, variables: { sla_cumplido: 92, ots_vencidas: 88, reprogramaciones: 90 } },
      financiera: { score: 80, peso: 25, variables: { saldo_vencido: 82, dias_mora: 85, riesgo_credito: 74 } },
      soporte: { score: 82, peso: 15, variables: { tickets_abiertos: 80, tiempo_resolucion: 84, reclamos: 82 } },
      satisfaccion: { score: 85, peso: 10, variables: { nps: 84, encuestas: 86 } }
    },
    historico: [
      { mes: 'Sep 24', score: 78 }, { mes: 'Oct 24', score: 80 },
      { mes: 'Nov 24', score: 81 }, { mes: 'Dic 24', score: 83 }, { mes: 'Ene 25', score: 85 }
    ],
    ultima_actualizacion: '2025-01-24' },
  { id: 'hsd_004', empresa_id: 'emp_001', cuenta_id: 'cta_005',
    score_total: 28, semaforo: 'rojo', tendencia: 'bajando',
    dimensiones: {
      comercial: { score: 30, peso: 25, variables: { frecuencia_compra: 20, monto_promedio: 35, antiguedad: 35 } },
      operativa: { score: 35, peso: 25, variables: { sla_cumplido: 40, ots_vencidas: 30, reprogramaciones: 35 } },
      financiera: { score: 12, peso: 25, variables: { saldo_vencido: 8, dias_mora: 10, riesgo_credito: 18 } },
      soporte: { score: 28, peso: 15, variables: { tickets_abiertos: 20, tiempo_resolucion: 30, reclamos: 34 } },
      satisfaccion: { score: 22, peso: 10, variables: { nps: 18, encuestas: 26 } }
    },
    historico: [
      { mes: 'Sep 24', score: 52 }, { mes: 'Oct 24', score: 45 },
      { mes: 'Nov 24', score: 38 }, { mes: 'Dic 24', score: 32 }, { mes: 'Ene 25', score: 28 }
    ],
    ultima_actualizacion: '2025-01-24' }
];

export const churnPlanes = [
  { id: 'chp_001', empresa_id: 'emp_001', cuenta_id: 'cta_005',
    causa_probable: 'Deuda crítica acumulada + baja adopción del servicio + insatisfacción con tiempos de respuesta',
    fecha_deteccion: '2025-01-10', responsable: 'Carla Meza', estado: 'en_intervencion',
    acciones: [
      { descripcion: 'Reunión ejecutiva con gerencia del cliente', responsable: 'Carla Meza', fecha_compromiso: '2025-01-15', estado: 'completado' },
      { descripcion: 'Plan de pagos acordado en 4 cuotas mensuales', responsable: 'Admin Master', fecha_compromiso: '2025-01-20', estado: 'completado' },
      { descripcion: 'Asignar técnico senior para próximas 3 OTs', responsable: 'Pedro Salas', fecha_compromiso: '2025-01-31', estado: 'pendiente' },
      { descripcion: 'Encuesta de satisfacción ejecutiva post-intervención', responsable: 'Carla Meza', fecha_compromiso: '2025-02-10', estado: 'pendiente' }
    ]
  }
];

export const renovaciones = [
  { id: 'ren_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    oportunidad_id: 'opp_002',
    servicio: 'Contrato anual mantenimiento preventivo',
    fecha_vencimiento: '2025-03-31', dias_restantes: 65,
    monto_contrato: 180000, responsable_cs: 'Carla Meza',
    estado: 'en_negociacion', oportunidad_generada: true,
    notas: 'Cliente desea ampliar a 6 sedes. Propuesta en preparación.' },
  { id: 'ren_002', empresa_id: 'emp_001', cuenta_id: 'cta_004',
    oportunidad_id: null,
    servicio: 'Mantenimiento anual sistema CCTV instalado',
    fecha_vencimiento: '2025-04-15', dias_restantes: 80,
    monto_contrato: 8400, responsable_cs: 'Pedro Salas',
    estado: 'pendiente_contacto', oportunidad_generada: false,
    notas: null },
  { id: 'ren_003', empresa_id: 'emp_001', cuenta_id: 'cta_002',
    oportunidad_id: null,
    servicio: 'Servicio correctivo recurrente semestral',
    fecha_vencimiento: '2025-02-28', dias_restantes: 33,
    monto_contrato: 45000, responsable_cs: 'Pedro Salas',
    estado: 'en_riesgo', oportunidad_generada: false,
    notas: 'Deuda vencida bloquea renovación. Requiere plan de retención aprobado primero.' }
];

export const npsEncuestas = [
  { id: 'nps_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    ot_id: 'ot_001', responsable_cs: 'Carla Meza',
    fecha_envio: '2025-01-22', fecha_respuesta: '2025-01-23',
    score: 9, clasificacion: 'promotor',
    comentario: 'Excelente trabajo del equipo técnico. Muy puntuales y profesionales.', estado: 'respondido' },
  { id: 'nps_002', empresa_id: 'emp_001', cuenta_id: 'cta_004',
    ot_id: 'ot_002', responsable_cs: 'Pedro Salas',
    fecha_envio: '2025-01-20', fecha_respuesta: null,
    score: null, clasificacion: null, comentario: null, estado: 'pendiente' },
  { id: 'nps_003', empresa_id: 'emp_001', cuenta_id: 'cta_002',
    ot_id: null, responsable_cs: 'Pedro Salas',
    fecha_envio: '2024-12-20', fecha_respuesta: '2024-12-22',
    score: 6, clasificacion: 'neutro',
    comentario: 'Cumple lo esperado, pero los tiempos de respuesta deberían mejorar.', estado: 'respondido' },
  { id: 'nps_004', empresa_id: 'emp_001', cuenta_id: 'cta_005',
    ot_id: null, responsable_cs: 'Carla Meza',
    fecha_envio: '2024-11-25', fecha_respuesta: '2024-11-26',
    score: 3, clasificacion: 'detractor',
    comentario: 'Muchos retrasos, no cumplieron los tiempos prometidos. Esperamos mejoras urgentes.',
    estado: 'respondido', plan_accion: 'Reunión ejecutiva programada + asignación técnico senior' }
];

export const referidos = [
  { id: 'ref_001', empresa_id: 'emp_001',
    cuenta_origen_id: 'cta_001', lead_generado_id: 'lead_001',
    nombre_referido: 'Carlos Huanca', empresa_referida: 'Minera San Cristóbal SAC',
    contacto: 'c.huanca@sancristobal.pe', telefono: '+51 987 654 321',
    fecha: '2025-01-08', estado: 'en_proceso',
    beneficio: null, beneficio_aplicado: false,
    notas: 'Referido por Ana Torres de Minera Andes. Lead activo con oportunidad abierta.' }
];

export const casosExito = [
  { id: 'cse_001', empresa_id: 'emp_001', cuenta_id: 'cta_001',
    titulo: 'Reducción del 45% en paradas no planificadas',
    servicio: 'Mantenimiento preventivo mensual',
    descripcion: 'Minera Andes logró reducir sus paradas de producción no planificadas en 45% durante el primer año de contrato. El plan de mantenimiento preventivo diseñado para sus equipos permitió anticipar fallas críticas y optimizar el ciclo de vida de los rodamientos.',
    resultado_cuantificado: 'De 12 paradas/año a 6.6. Ahorro estimado: S/ 280,000.',
    autorizacion_cliente: true, fecha_autorizacion: '2025-01-15', uso_comercial: true, estado: 'publicado' },
  { id: 'cse_002', empresa_id: 'emp_001', cuenta_id: 'cta_004',
    titulo: 'Implementación sistema CCTV en tiempo récord',
    servicio: 'Instalación sistema de videovigilancia',
    descripcion: 'FacLima logró cubrir el 100% de sus instalaciones con monitoreo 24/7 en 10 días hábiles, sin interrumpir operaciones en ningún momento.',
    resultado_cuantificado: 'Implementación en 10 días. 24 cámaras. 100% de cobertura.',
    autorizacion_cliente: false, fecha_autorizacion: null, uso_comercial: false, estado: 'pendiente_autorizacion' }
];

export const iaLogs = [
  { id: 'ial_001', tipo: 'comercial', accion: 'brief_cliente', entidad: 'Minera Andes SAC', usuario: 'Carla Meza', recomendacion: 'Brief ejecutivo generado: cliente estratégico, 92 health score, sin deuda, OT activa con SLA en plazo. Ángulo de reunión: expansión de servicio preventivo.', accion_tomada: 'Revisado y utilizado en reunión del 27/04', fecha: '2026-04-26 09:15' },
  { id: 'ial_002', tipo: 'operativa', accion: 'deteccion_demoras', entidad: 'OT-0045', usuario: 'Pedro Salas', recomendacion: 'OT-0045 proyecta 2 días de atraso por falta de repuesto en almacén. Riesgo de SLA con Minera Andes.', accion_tomada: 'Reprogramado con cliente, SOLPE de emergencia emitida', fecha: '2026-04-25 14:30' },
  { id: 'ial_003', tipo: 'financiera', accion: 'analisis_cxc', entidad: 'Logística Altiplano SAC', usuario: 'Admin Master', recomendacion: 'CxC de S/ 32,800 con 45 días mora. Riesgo alto de incobrabilidad. Se recomienda cobranza ejecutiva antes de nueva OS.', accion_tomada: 'Llamada de cobranza programada para 2026-04-28', fecha: '2026-04-24 11:00' },
  { id: 'ial_004', tipo: 'comercial', accion: 'siguiente_accion', entidad: 'Opp: Mantenimiento Anual MSC', usuario: 'Andrea Rios', recomendacion: 'Enviar cotización actualizada antes del viernes. Cliente está evaluando propuesta de competidor. Diferenciar con garantía extendida y SLA 24h.', accion_tomada: 'Pendiente — cotización en preparación', fecha: '2026-04-23 16:45' },
  { id: 'ial_005', tipo: 'financiera', accion: 'alerta_margen', entidad: 'OT-0046', usuario: 'Admin Master', recomendacion: 'Margen bruto actual 18.4% — bajo el umbral del 25%. Principal desvío: horas extra no planificadas (+S/ 4,200). Revisar estructura de costos.', accion_tomada: 'Revisando con jefe de operaciones', fecha: '2026-04-22 10:20' },
  { id: 'ial_006', tipo: 'operativa', accion: 'resumen_ot', entidad: 'OT-0045', usuario: 'Luis Mendoza', recomendacion: 'OT al 68% de avance. 3 tareas críticas pendientes. Materiales disponibles. Sin restricciones activas. Proyección de cierre: mañana 17:00.', accion_tomada: 'Compartido con supervisor', fecha: '2026-04-21 08:00' },
];

// ============================================================
// FASE 3 — BI FINANCIERO
// ============================================================
export const biFinanciero = {
  periodo: 'Abril 2026',
  resumen: {
    facturacion_mes: 285400, facturacion_mes_ant: 241200, var_facturacion_pct: 18.4,
    margen_bruto: 112800, margen_bruto_pct: 39.5, margen_bruto_ant_pct: 36.2,
    margen_neto: 74600, margen_neto_pct: 26.1,
    cxc_total: 198400, cxc_vencida: 67200,
    cxp_total: 89300, cxp_proximos_30d: 34100,
  },
  margen_por_cliente: [
    { cuenta_id: 'c1', nombre: 'Minera Andes SAC', facturacion: 98400, costo: 52100, margen: 46300, margen_pct: 47.1, ots: 12, riesgo: 'bajo' },
    { cuenta_id: 'c2', nombre: 'TechCorp Perú', facturacion: 76200, costo: 43800, margen: 32400, margen_pct: 42.5, ots: 8, riesgo: 'bajo' },
    { cuenta_id: 'c3', nombre: 'LogiPeru SAC', facturacion: 54800, costo: 38200, margen: 16600, margen_pct: 30.3, ots: 6, riesgo: 'medio' },
    { cuenta_id: 'c4', nombre: 'Constructora Norte', facturacion: 32100, costo: 24900, margen: 7200, margen_pct: 22.4, ots: 4, riesgo: 'alto' },
    { cuenta_id: 'c5', nombre: 'Alimentos del Sur', facturacion: 23900, costo: 14200, margen: 9700, margen_pct: 40.6, ots: 3, riesgo: 'bajo' },
  ],
  margen_por_servicio: [
    { servicio: 'Capacitación', facturacion: 13300, margen_pct: 70.5, volumen: 6 },
    { servicio: 'Consultoría', facturacion: 28900, margen_pct: 62.3, volumen: 8 },
    { servicio: 'Soporte Técnico', facturacion: 43200, margen_pct: 55.1, volumen: 32 },
    { servicio: 'Mantenimiento Preventivo', facturacion: 112400, margen_pct: 48.2, volumen: 28 },
    { servicio: 'Instalación', facturacion: 87600, margen_pct: 38.4, volumen: 14 },
  ],
  evolucion_margen: [
    { mes: 'Nov', facturacion: 198400, margen_pct: 32.1 },
    { mes: 'Dic', facturacion: 224600, margen_pct: 33.8 },
    { mes: 'Ene', facturacion: 209100, margen_pct: 35.2 },
    { mes: 'Feb', facturacion: 231800, margen_pct: 36.9 },
    { mes: 'Mar', facturacion: 241200, margen_pct: 36.2 },
    { mes: 'Abr', facturacion: 285400, margen_pct: 39.5 },
  ],
  cxc_antiguedad: {
    vigente:  { monto: 84200, clientes: 8 },
    d30:      { monto: 46900, clientes: 5 },
    d60:      { monto: 31800, clientes: 4 },
    d90:      { monto: 21400, clientes: 3 },
    mas90:    { monto: 14100, clientes: 2 },
  },
  cxp_proximos: [
    { proveedor: 'Proveedor Elec SAC',  monto: 12400, vence: '2026-04-30', dias: 3,  categoria: 'Materiales' },
    { proveedor: 'Logística Rápida',    monto:  8700, vence: '2026-05-05', dias: 8,  categoria: 'Logística' },
    { proveedor: 'Servicios IT Lima',   monto:  5200, vence: '2026-05-10', dias: 13, categoria: 'Servicios' },
    { proveedor: 'Suministros Norte',   monto:  7800, vence: '2026-05-15', dias: 18, categoria: 'Materiales' },
  ],
  flujo_caja: [
    { semana: 'S1 Abr', ing_proy: 45200, ing_real: 42800, egr_proy: 28900, egr_real: 31200 },
    { semana: 'S2 Abr', ing_proy: 62100, ing_real: 58400, egr_proy: 34100, egr_real: 32800 },
    { semana: 'S3 Abr', ing_proy: 71400, ing_real: 74600, egr_proy: 29800, egr_real: 28400 },
    { semana: 'S4 Abr', ing_proy: 84200, ing_real: null,  egr_proy: 38200, egr_real: null  },
    { semana: 'S1 May', ing_proy: 68900, ing_real: null,  egr_proy: 31400, egr_real: null  },
  ],
  presupuesto_vs_real: {
    ingresos:           { presupuesto: 310000, real: 285400, var_pct: -7.9 },
    costo_ventas:       { presupuesto: 182000, real: 172600, var_pct: -5.2 },
    margen_bruto:       { presupuesto: 128000, real: 112800, var_pct: -11.9 },
    gastos_admin:       { presupuesto: 22000,  real: 19800,  var_pct: -10.0 },
    gastos_comercial:   { presupuesto: 14000,  real: 12400,  var_pct: -11.4 },
    resultado_operativo:{ presupuesto: 92000,  real: 80600,  var_pct: -12.4 },
    resultado_neto:     { presupuesto: 84000,  real: 74600,  var_pct: -11.2 },
  },
};

// ============================================================
// FASE 3 — MÉTRICAS SAAS (Superadmin TIDEO)
// ============================================================
export const metricasSaaS = {
  fecha: '2025-01-24',
  tenants: { activos: 2, nuevos_mes: 1, cancelados: 0, en_prueba: 1 },
  mrr: 3200, arr: 38400,
  churn_tenants_pct: 0, retencion_mensual_pct: 100, retencion_anual_pct: 100,
  upgrades_mes: 1, downgrades_mes: 0,
  distribucion_planes: [
    { plan: 'Enterprise', tenants: 1, mrr: 2400, pct_mrr: 75, color: 'purple' },
    { plan: 'Professional', tenants: 1, mrr: 800, pct_mrr: 25, color: 'cyan' },
    { plan: 'Starter', tenants: 0, mrr: 0, pct_mrr: 0, color: 'orange' }
  ],
  distribucion_paises: [{ pais: 'Perú', tenants: 2 }],
  tendencia_mrr: [
    { mes: 'Sep 24', mrr: 2400 }, { mes: 'Oct 24', mrr: 2400 },
    { mes: 'Nov 24', mrr: 3200 }, { mes: 'Dic 24', mrr: 3200 }, { mes: 'Ene 25', mrr: 3200 }
  ],
  tenants_riesgo: []
};

// ============================================================
// FASE 3 — TURNOS Y ASISTENCIA
// ============================================================
export const turnos = [
  { id:'tur_001', empresa_id:'emp_001', codigo:'TUR-001', nombre:'Turno Mañana',
    hora_entrada:'08:00', hora_salida:'17:00', tolerancia_minutos:10,
    cruza_medianoche:false, refrigerio_minutos:60,
    horas_efectivas:8, dias_laborables:['lun','mar','mie','jue','vie'],
    dias_variables:false, estado:'activo' },
  { id:'tur_002', empresa_id:'emp_001', codigo:'TUR-002', nombre:'Turno Tarde',
    hora_entrada:'14:00', hora_salida:'23:00', tolerancia_minutos:10,
    cruza_medianoche:false, refrigerio_minutos:60,
    horas_efectivas:8, dias_laborables:['lun','mar','mie','jue','vie'],
    dias_variables:false, estado:'activo' },
  { id:'tur_003', empresa_id:'emp_001', codigo:'TUR-003', nombre:'Turno Noche',
    hora_entrada:'22:00', hora_salida:'06:00', tolerancia_minutos:15,
    cruza_medianoche:true, refrigerio_minutos:60,
    horas_efectivas:8, dias_laborables:['lun','mar','mie','jue','vie','sab','dom'],
    dias_variables:false, estado:'activo' },
  { id:'tur_004', empresa_id:'emp_001', codigo:'TUR-004', nombre:'Turno Especial Campo',
    hora_entrada:'06:00', hora_salida:'18:00', tolerancia_minutos:30,
    cruza_medianoche:false, refrigerio_minutos:60,
    horas_efectivas:11, dias_laborables:[],
    dias_variables:true, estado:'activo' },
  { id:'tur_005', empresa_id:'emp_001', codigo:'TUR-005', nombre:'Administrativo',
    hora_entrada:'09:00', hora_salida:'18:00', tolerancia_minutos:15,
    cruza_medianoche:false, refrigerio_minutos:60,
    horas_efectivas:8, dias_laborables:['lun','mar','mie','jue','vie'],
    dias_variables:false, estado:'activo' }
];

export const registrosAsistencia = [
  { id:'asis_001', empresa_id:'emp_001', trabajador_id:'TEC-001', fecha:'2026-04-22',
    turno_id:'tur_001', hora_entrada:'08:05', hora_salida:'17:10',
    horas_trabajadas_min:485, tardanza_min:0, horas_extra_min:10,
    estado:'completo', es_falta:false, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_002', empresa_id:'emp_001', trabajador_id:'TEC-001', fecha:'2026-04-23',
    turno_id:'tur_001', hora_entrada:'08:42', hora_salida:'17:00',
    horas_trabajadas_min:438, tardanza_min:32, horas_extra_min:0,
    estado:'tardanza', es_falta:false, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_003', empresa_id:'emp_001', trabajador_id:'TEC-001', fecha:'2026-04-24',
    turno_id:'tur_001', hora_entrada:null, hora_salida:null,
    horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0,
    estado:'falta', es_falta:true, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_004', empresa_id:'emp_001', trabajador_id:'TEC-001', fecha:'2026-04-25',
    turno_id:'tur_001', hora_entrada:'08:00', hora_salida:'17:00',
    horas_trabajadas_min:480, tardanza_min:0, horas_extra_min:0,
    estado:'completo', es_falta:false, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_005', empresa_id:'emp_001', trabajador_id:'TEC-001', fecha:'2026-04-26',
    turno_id:'tur_001', hora_entrada:'08:00', hora_salida:'17:00',
    horas_trabajadas_min:480, tardanza_min:0, horas_extra_min:0,
    estado:'completo', es_falta:false, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_006', empresa_id:'emp_001', trabajador_id:'TEC-002', fecha:'2026-04-22',
    turno_id:'tur_001', hora_entrada:'08:00', hora_salida:'17:00',
    horas_trabajadas_min:480, tardanza_min:0, horas_extra_min:0,
    estado:'completo', es_falta:false, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_007', empresa_id:'emp_001', trabajador_id:'TEC-002', fecha:'2026-04-23',
    turno_id:'tur_001', hora_entrada:null, hora_salida:null,
    horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0,
    estado:'falta', es_falta:true, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_008', empresa_id:'emp_001', trabajador_id:'TEC-002', fecha:'2026-04-24',
    turno_id:'tur_001', hora_entrada:'08:15', hora_salida:'17:00',
    horas_trabajadas_min:465, tardanza_min:5, horas_extra_min:0,
    estado:'tardanza', es_falta:false, justificada:false, motivo_falta:null, notas:'' },
  { id:'asis_009', empresa_id:'emp_001', trabajador_id:'TEC-005', fecha:'2026-04-22',
    turno_id:'tur_004', hora_entrada:'06:00', hora_salida:'18:30',
    horas_trabajadas_min:690, tardanza_min:0, horas_extra_min:30,
    estado:'horas_extra', es_falta:false, justificada:false, motivo_falta:null, notas:'Trabajo extendido por cierre de OT' },
  { id:'asis_010', empresa_id:'emp_001', trabajador_id:'TEC-003', fecha:'2026-04-24',
    turno_id:'tur_005', hora_entrada:null, hora_salida:null,
    horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0,
    estado:'falta_justificada', es_falta:true, justificada:true,
    motivo_falta:'Enfermedad con certificado', notas:'' }
];

export const trabajadoresDatosNomina = {
  'TEC-001': { sueldo_base:3000, sistema_pensionario:'AFP', afp_nombre:'Integra', tiene_hijos:false, cuota_prestamo_mes:16.50, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'TEC-002': { sueldo_base:3200, sistema_pensionario:'AFP', afp_nombre:'Prima', tiene_hijos:true, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'TEC-003': { sueldo_base:4500, sistema_pensionario:'ONP', afp_nombre:null, tiene_hijos:true, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'TEC-004': { sueldo_base:1800, sistema_pensionario:'ONP', afp_nombre:null, tiene_hijos:false, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'mype' },
  'TEC-005': { sueldo_base:3500, sistema_pensionario:'AFP', afp_nombre:'Habitat', tiene_hijos:true, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'TEC-006': { sueldo_base:4200, sistema_pensionario:'AFP', afp_nombre:'Profuturo', tiene_hijos:false, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'per_001': { sueldo_base:4500, sistema_pensionario:'AFP', afp_nombre:'Integra', tiene_hijos:false, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'per_002': { sueldo_base:3200, sistema_pensionario:'AFP', afp_nombre:'Prima', tiene_hijos:true, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'per_003': { sueldo_base:3400, sistema_pensionario:'ONP', afp_nombre:null, tiene_hijos:false, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' },
  'per_004': { sueldo_base:2800, sistema_pensionario:'ONP', afp_nombre:null, tiene_hijos:false, cuota_prestamo_mes:0, anticipo_periodo:0, descuento_judicial:0, regimen_laboral:'general' }
};

export const periodosNomina = [
  { id:'nom_2026_04', empresa_id:'emp_001', periodo:'Abril 2026', anio:2026, mes:4, estado:'abierto', fecha_calculo:null, fecha_cierre:null, usuario_cierre:null, total_trabajadores:10, masa_salarial_bruta:null, total_neto:null, total_cargas_empresa:null },
  { id:'nom_2026_03', empresa_id:'emp_001', periodo:'Marzo 2026', anio:2026, mes:3, estado:'cerrado', fecha_calculo:'2026-03-28', fecha_cierre:'2026-03-31', usuario_cierre:'Administrador', total_trabajadores:10, masa_salarial_bruta:27800, total_neto:21340, total_cargas_empresa:8720 },
  { id:'nom_2026_02', empresa_id:'emp_001', periodo:'Febrero 2026', anio:2026, mes:2, estado:'cerrado', fecha_calculo:'2026-02-27', fecha_cierre:'2026-02-28', usuario_cierre:'Administrador', total_trabajadores:9, masa_salarial_bruta:26400, total_neto:20280, total_cargas_empresa:8280 }
];

export const hojasCosteo = [
  {
    id: 'hc_001', empresa_id: 'emp_001',
    numero: 'HC-2025-0001',
    oportunidad_id: 'opp_001',
    cuenta_id: 'cta_006',
    estado: 'aprobada',
    responsable_costeo: 'Equipo Técnico',
    fecha: '2025-01-18',
    margen_objetivo_pct: 35,
    notas: 'Experiencia previa en cliente similar. Rodillos con descuento de proveedor confirmado.',
    mano_obra: [
      { id: 1, descripcion: 'Técnico especialista (2 personas × 10 días)', cantidad: 20, unidad: 'día/persona', costo_unitario: 280 },
      { id: 2, descripcion: 'Supervisor de campo (5 días)', cantidad: 5, unidad: 'día', costo_unitario: 380 }
    ],
    materiales: [
      { id: 1, descripcion: 'Rodillos de carga (juego de 12)', cantidad: 3, unidad: 'juego', costo_unitario: 2600 },
      { id: 2, descripcion: 'Lubricantes y consumibles', cantidad: 1, unidad: 'global', costo_unitario: 450 }
    ],
    servicios_terceros: [
      { id: 1, descripcion: 'Grúa para desmontaje', cantidad: 2, unidad: 'turno', costo_unitario: 1200 }
    ],
    logistica: [
      { id: 1, descripcion: 'Alojamiento y viáticos (2 técnicos × 10 días)', cantidad: 20, unidad: 'día/persona', costo_unitario: 130 }
    ],
    total_mano_obra: 7500,
    total_materiales: 8250,
    total_servicios_terceros: 2400,
    total_logistica: 2600,
    costo_total: 20750,
    precio_sugerido_sin_igv: 31923,
    precio_sugerido_total: 37670,
    cotizacion_id: 'cot_001'
  },
  {
    id: 'hc_002', empresa_id: 'emp_001',
    numero: 'HC-2025-0002',
    oportunidad_id: 'opp_003',
    cuenta_id: 'cta_003',
    estado: 'en_revision',
    responsable_costeo: 'Carlos Quispe',
    fecha: '2025-01-28',
    margen_objetivo_pct: 40,
    notas: 'Requiere coordinación con área de seguridad del cliente para ingresos.',
    mano_obra: [
      { id: 1, descripcion: 'Técnico senior de instrumentación', cantidad: 8, unidad: 'día', costo_unitario: 420 },
      { id: 2, descripcion: 'Técnico de soporte', cantidad: 8, unidad: 'día', costo_unitario: 260 }
    ],
    materiales: [
      { id: 1, descripcion: 'Sensores de presión diferencial', cantidad: 4, unidad: 'und', costo_unitario: 1800 },
      { id: 2, descripcion: 'Cable apantallado 2×1.5mm (rollo 100m)', cantidad: 2, unidad: 'rollo', costo_unitario: 320 }
    ],
    servicios_terceros: [],
    logistica: [
      { id: 1, descripcion: 'Transporte equipos (ida y vuelta)', cantidad: 2, unidad: 'viaje', costo_unitario: 650 }
    ],
    total_mano_obra: 5440,
    total_materiales: 7840,
    total_servicios_terceros: 0,
    total_logistica: 1300,
    costo_total: 14580,
    precio_sugerido_sin_igv: 24300,
    precio_sugerido_total: 28674,
    cotizacion_id: null
  },
  {
    id: 'hc_003', empresa_id: 'emp_001',
    numero: 'HC-2025-0003',
    oportunidad_id: 'opp_004',
    cuenta_id: 'cta_004',
    estado: 'borrador',
    responsable_costeo: 'Carla Meza',
    fecha: '2025-01-29',
    margen_objetivo_pct: 30,
    notas: '',
    mano_obra: [
      { id: 1, descripcion: 'Instalador de CCTV (2 personas × 5 días)', cantidad: 10, unidad: 'día/persona', costo_unitario: 240 }
    ],
    materiales: [
      { id: 1, descripcion: 'Cámara IP Full HD exterior', cantidad: 16, unidad: 'und', costo_unitario: 290 },
      { id: 2, descripcion: 'Cámara IP PTZ interior', cantidad: 8, unidad: 'und', costo_unitario: 380 },
      { id: 3, descripcion: 'NVR 32 canales + disco 8TB', cantidad: 1, unidad: 'equipo', costo_unitario: 2400 }
    ],
    servicios_terceros: [
      { id: 1, descripcion: 'Cableado estructurado (subcontrato)', cantidad: 1, unidad: 'global', costo_unitario: 2800 }
    ],
    logistica: [],
    total_mano_obra: 2400,
    total_materiales: 9864,
    total_servicios_terceros: 2800,
    total_logistica: 0,
    costo_total: 15064,
    precio_sugerido_sin_igv: 21520,
    precio_sugerido_total: 25394,
    cotizacion_id: null
  }
];

export const agendaEventos = [
  { id: 'evt_001', empresa_id: 'emp_001', titulo: 'Visita de inspeccion inicial', tipo: 'visita', cuenta_id: 'cta_006', vendedor: 'Carla Meza', registrado_por: 'Carla Meza', fecha: '2026-04-29', hora: '10:00', duracion_minutos: 60, estado: 'programado', notas: 'Confirmar medidas para propuesta' },
  { id: 'evt_002', empresa_id: 'emp_001', titulo: 'Reunion de seguimiento', tipo: 'reunion', cuenta_id: 'cta_001', vendedor: 'Carla Meza', registrado_por: 'Carla Meza', fecha: '2026-04-30', hora: '15:00', duracion_minutos: 45, estado: 'programado', notas: 'Revision de contrato anual' },
  { id: 'evt_003', empresa_id: 'emp_001', titulo: 'Llamada prospecto', tipo: 'llamada', lead_id: 'lead_002', vendedor: 'Pedro Salas', registrado_por: 'Pedro Salas', fecha: '2026-04-29', hora: '09:30', duracion_minutos: 15, estado: 'realizado', notas: 'No contesto, reprogramar' },
  { id: 'evt_004', empresa_id: 'emp_001', titulo: 'Demo del servicio', tipo: 'demo', cuenta_id: 'cta_004', vendedor: 'Pedro Salas', registrado_por: 'Pedro Salas', fecha: '2026-05-02', hora: '11:00', duracion_minutos: 60, estado: 'programado', notas: 'Llevar equipos de muestra' }
];

export const MOCK = {
  empresas, roles, usuarios, leads, cuentas, contactos, oportunidades,
  actividades, hojasCosteo, cotizaciones, osClientes, ots, partes, compras, cxc,
  movimientosBanco, estadoResultados, pantallasPermisos, servicios,
  tarifarios, maestros, backlog, remisiones, solpes, ventas, cajaChica,
  prestamos, financiamientos, movimientosTesoreria, cxp, inventario, valorizaciones, proveedores, documentosProveedor,
  evaluacionesProveedor, contactosProveedor, procesosCompra, respuestasCompra,
  ordenesCompra, ordenesServicio, recepciones,
  // Fase 3
  personalAdmin, vacacionesSolicitudes, licencias, solicitudesRRHH,
  onboardings, planesExito, healthScoresDetalle, churnPlanes,
  renovaciones, npsEncuestas, referidos, casosExito, iaLogs,
  biFinanciero, metricasSaaS,
  especialidadesTecnicas, tiposServicioInterno, almacenesDepositos, cargosEmpresa, industrias,
  // Turnos y asistencia
  turnos, registrosAsistencia, trabajadoresDatosNomina, periodosNomina,
  // Agenda Comercial
  agendaEventos
};

const agendaEventosLegacy = [
  { id: 'evt_001', empresa_id: 'emp_001', titulo: 'Visita de inspección inicial', tipo: 'visita', cuenta_id: 'cta_006', vendedor: 'Carla Meza', fecha: '2026-04-29', hora: '10:00', duracion_minutos: 60, estado: 'programado', notas: 'Confirmar medidas para propuesta' },
  { id: 'evt_002', empresa_id: 'emp_001', titulo: 'Reunión de seguimiento', tipo: 'reunion', cuenta_id: 'cta_001', vendedor: 'Carla Meza', fecha: '2026-04-30', hora: '15:00', duracion_minutos: 45, estado: 'programado', notas: 'Revisión de contrato anual' },
  { id: 'evt_003', empresa_id: 'emp_001', titulo: 'Llamada prospecto', tipo: 'llamada', lead_id: 'lead_002', vendedor: 'Pedro Salas', fecha: '2026-04-29', hora: '09:30', duracion_minutos: 15, estado: 'realizado', notas: 'No contestó, reprogramar' },
  { id: 'evt_004', empresa_id: 'emp_001', titulo: 'Demo del servicio', tipo: 'demo', cuenta_id: 'cta_004', vendedor: 'Pedro Salas', fecha: '2026-05-02', hora: '11:00', duracion_minutos: 60, estado: 'programado', notas: 'Llevar equipos de muestra' }
];
