import React, { createContext, useContext, useEffect, useState } from 'react';
import { MOCK } from './data.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { loadCrmFromSupabase, loadCsFromSupabase, persistirLead, actualizarLead, eliminarLead as eliminarLeadSvc, persistirCuenta, actualizarCuenta as svcActualizarCuenta, persistirContacto, actualizarContacto, persistirOportunidad, actualizarOportunidad, persistirHojaCosteo, crearHojaCosteoRpc, aprobarHojaCosteoRpc, actualizarHojaCosteoSvc, persistirCotizacion, actualizarCotizacion as svcActualizarCotizacion, subirArchivoSustento, persistirOSCliente, actualizarOSCliente as svcActualizarOSCliente, persistirAgendaEvento, actualizarAgendaEventoSvc, persistirActividadComercial, actualizarActividadComercial, subirLogoCuenta, insertarNotificacionesSistema, cargarNotificacionesSistema, insertarHistorialAcuerdo, cargarHistorialAcuerdo } from './services/crmService.js';
import { loadOpsFromSupabase, actualizarBacklog, persistirOT, crearOTDesdeOSRpc, actualizarOT as svcActualizarOT, eliminarOT as svcEliminarOT, persistirParteDiario, actualizarParteDiario as svcActualizarParteDiario, persistirCierreTecnico, consumirInventario, subirConformidadOT as svcSubirConformidadOT } from './services/operacionesService.js';
import { finanzasService } from './services/finanzasService.js';
import { maestrosService } from './services/maestrosService.js';
import { comprasService } from './services/comprasService.js';
import { rrhhService } from './services/rrhhService.js';
import * as plannerSvc from './services/plannerService.js';
import { auditoriaService } from './services/auditoriaService.js';
import { plataformaService } from './services/plataformaService.js';
import { usuariosService } from './services/usuariosService.js';
import { rolesService } from './services/rolesService.js';
import { campanasService } from './services/campanasService.js';
const AppContext = createContext();
const PLATFORM_SUPERADMIN_EMAIL = 'cristhianbalvin@gmail.com';
const isPlatformSuperadminEmail = email =>
  String(email || '').trim().toLowerCase() === PLATFORM_SUPERADMIN_EMAIL;

export function useApp() {
  return useContext(AppContext);
}

function generateId(prefix) {
  return `${prefix}_${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDaysFromToday(value) {
  const date = toDateOnly(value);
  if (!date) return 0;
  const today = toDateOnly(new Date().toISOString().slice(0, 10));
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getLeadActivityDate(lead, actividades = [], agendaEventos = []) {
  const today = toDateOnly(new Date().toISOString().slice(0, 10));
  const dates = [];
  actividades.forEach(a => {
    const linked = a.lead_id === lead.id || (a.vinculo_tipo === 'lead' && a.vinculo_id === lead.id);
    const date = linked ? toDateOnly(a.fecha || a.created_at) : null;
    if (date && date <= today) dates.push(date);
  });
  agendaEventos.forEach(e => {
    const date = e.lead_id === lead.id ? toDateOnly(e.fecha || e.created_at) : null;
    if (date && date <= today) dates.push(date);
  });
  if (!dates.length) return lead.fecha_creacion || lead.created_at || null;
  return dates.sort((a, b) => b - a)[0].toISOString().slice(0, 10);
}

function calcularDiasSinActividadLead(lead, actividades = [], agendaEventos = []) {
  if (['convertido', 'descartado'].includes(lead.estado)) return Number(lead.dias_sin_actividad || 0);
  return diffDaysFromToday(getLeadActivityDate(lead, actividades, agendaEventos));
}

function recalcularDiasSinActividadLeads(leads = [], actividades = [], agendaEventos = []) {
  return leads.map(lead => ({
    ...lead,
    dias_sin_actividad: calcularDiasSinActividadLead(lead, actividades, agendaEventos),
  }));
}

function buildRoleDePermisos(rol, permisosRows = [], acceso_campo = false, campo_modulos = []) {
  const esSuperadmin = rol?.es_superadmin || false;
  const esAdmin = esSuperadmin || rol?.es_admin_empresa || false;
  const ver = permisosRows.filter(p => p.puede_ver).map(p => p.pantalla);
  const crear = permisosRows.filter(p => p.puede_crear).map(p => p.pantalla);
  const editar = permisosRows.filter(p => p.puede_editar).map(p => p.pantalla);
  const anular = permisosRows.filter(p => p.puede_anular).map(p => p.pantalla);
  const aprobar = permisosRows.filter(p => p.puede_aprobar).map(p => p.pantalla);
  const exportar = permisosRows.filter(p => p.puede_exportar).map(p => p.pantalla);
  const verFinanzas = esSuperadmin || permisosRows.some(p => p.puede_ver_finanzas);
  const verCostos = esSuperadmin || permisosRows.some(p => p.puede_ver_costos);
  const puedeAprobar = esSuperadmin || permisosRows.some(p => p.puede_aprobar);
  return {
    nombre: rol?.nombre || 'Usuario',
    color: esSuperadmin ? 'navy' : esAdmin ? 'purple' : 'cyan',
    permisos: {
      ver,
      crear,
      editar,
      anular,
      aprobar,
      exportar,
      todo: esAdmin,
      plataforma: esSuperadmin,
      soporte_tenant: esSuperadmin,
      tenant_admin: esAdmin,
      ver_finanzas: verFinanzas,
      ver_costos: verCostos,
      aprobar_descuentos: puedeAprobar,
      ver_agenda_equipo: esAdmin,
      acceso_campo,
      campo_modulos: Array.isArray(campo_modulos) ? campo_modulos : [],
    },
  };
}

function normalizarEmpresaSupabase(e) {
  return {
    ...e,
    nombre: e.nombre_comercial || e.razon_social || e.id,
    moneda: e.moneda_base,
    plan: e.plan_id,
    color: '#0ea5e9',
  };
}

function rolesConPermisosAObjeto(rolesData = [], permisosData = []) {
  const rolesObj = {};
  for (const r of rolesData || []) {
    const pRows = (permisosData || []).filter(p => p.rol_id === r.id);
    rolesObj[r.id] = {
      ...r,
      permisos: {
        ver: pRows.filter(p => p.puede_ver).map(p => p.pantalla),
        crear: pRows.filter(p => p.puede_crear).map(p => p.pantalla),
        editar: pRows.filter(p => p.puede_editar).map(p => p.pantalla),
        anular: pRows.filter(p => p.puede_anular).map(p => p.pantalla),
        aprobar: pRows.filter(p => p.puede_aprobar).map(p => p.pantalla),
        exportar: pRows.filter(p => p.puede_exportar).map(p => p.pantalla),
        ver_costos: pRows.some(p => p.puede_ver_costos),
        ver_finanzas: pRows.some(p => p.puede_ver_finanzas),
        ver_precios: pRows.some(p => p.permisos_extra?.puede_ver_precios),
      },
    };
  }
  return rolesObj;
}

function empresaPermiteAcceso(estado) {
  return ['activa', 'activo', 'demo'].includes(String(estado || '').toLowerCase());
}

const SERIES_DOCUMENTARIAS_DEFAULT = [
  { id: 'ser_cotizaciones', documento: 'Cotizaciones', serie: 'COT-2026', siguiente_correlativo: 42, regla: 'Anual por empresa', estado: 'activo' },
  { id: 'ser_os_cliente', documento: 'OS Cliente', serie: 'OSC-2026', siguiente_correlativo: 18, regla: 'Anual por empresa', estado: 'activo' },
  { id: 'ser_ordenes_trabajo', documento: 'Ordenes de Trabajo', serie: 'OT-26', siguiente_correlativo: 64, regla: 'Anual por empresa', estado: 'activo' },
  { id: 'ser_solpe', documento: 'SOLPE', serie: 'SLP-2026', siguiente_correlativo: 28, regla: 'Anual por empresa', estado: 'activo' },
  { id: 'ser_facturas', documento: 'Facturas', serie: 'F001', siguiente_correlativo: 520, regla: 'Serie fiscal externa', estado: 'activo' },
  { id: 'ser_finanzas', documento: 'CxC / CxP', serie: 'FIN-2026', siguiente_correlativo: 145, regla: 'Correlativo financiero', estado: 'activo' },
];

const SLA_PLANTILLAS_DEFAULT = [
  { id: 'sla_correctivo_critico', nombre: 'Correctivo critico', tiempo_respuesta_horas: 4, tiempo_resolucion_horas: 24, semaforo_regla: 'Rojo a 80%', estado: 'activo' },
  { id: 'sla_preventivo_mensual', nombre: 'Preventivo mensual', tiempo_respuesta_horas: 24, tiempo_resolucion_horas: 120, semaforo_regla: 'Naranja a 70%', estado: 'activo' },
  { id: 'sla_soporte_premium', nombre: 'Soporte Premium', tiempo_respuesta_horas: 2, tiempo_resolucion_horas: 12, semaforo_regla: 'Rojo a 90%', estado: 'activo' },
];

const DICCIONARIO_COMERCIAL_DEFAULT = [
  { id: 'dic_inicio_proyecto', categoria: 'Proyecto', clave: 'Inicio del proyecto', texto: 'Inicio del proyecto', estado: 'activo' },
  { id: 'dic_avance_proyecto', categoria: 'Proyecto', clave: 'Avance del proyecto', texto: 'Avance del proyecto', estado: 'activo' },
  { id: 'dic_culminado_proyecto', categoria: 'Proyecto', clave: 'Culminado el proyecto', texto: 'Culminado el proyecto', estado: 'activo' },
  { id: 'dic_anticipo', categoria: 'Pagos', clave: 'Anticipo', texto: 'Anticipo', estado: 'activo' },
  { id: 'dic_primera_factura', categoria: 'Facturacion', clave: 'Primera factura', texto: 'Primera factura', estado: 'activo' },
  { id: 'dic_segunda_factura', categoria: 'Facturacion', clave: 'Segunda factura', texto: 'Segunda factura', estado: 'activo' },
  { id: 'dic_tercera_factura', categoria: 'Facturacion', clave: 'Tercera factura', texto: 'Tercera factura', estado: 'activo' },
];

function getInitialActivePage() {
  if (typeof window === 'undefined') return 'dashboard';
  const hashPage = window.location.hash.replace(/^#\/?/, '').trim();
  const queryPage = new URLSearchParams(window.location.search).get('pantalla')?.trim();
  const savedPage = localStorage.getItem('tideo_active_page')?.trim();
  return hashPage || queryPage || savedPage || 'dashboard';
}

export function AppProvider({ children }) {
  const [active, setActive] = useState(getInitialActivePage);
  const [activeParams, setActiveParams] = useState({});
  const [roleKey, setRoleKey] = useState('admin');
  const [empresa, setEmpresa] = useState(() => {
    if (isSupabaseConfigured()) return MOCK.empresas[0];
    try {
      const saved = localStorage.getItem('active_empresa_obj');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error('Error parsing saved empresa:', e); }
    return MOCK.empresas[0];
  });

  const [dark, setDark] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const [mobileProfile, setMobileProfile] = useState(null);
  const [dataMode] = useState(isSupabaseConfigured() ? 'supabase' : 'mock');
  const [authSession, setAuthSession] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured());
  const [authError, setAuthError] = useState(null);
  const [supabaseStatus, setSupabaseStatus] = useState({
    enabled: isSupabaseConfigured(),
    configured: isSupabaseConfigured(),
    connected: false,
    loading: false,
    error: null,
  });
  const [todasMembresias, setTodasMembresias] = useState([]);
  const [membresiaActiva, setMembresiaActiva] = useState(null);
  const [membresiaCargando, setMembresiaCargando] = useState(isSupabaseConfigured());
  const [empresasPlataforma, setEmpresasPlataforma] = useState(MOCK.empresas);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    try {
      localStorage.removeItem('active_empresa_obj');
      localStorage.removeItem('tideo_usuarios');
    } catch { /* limpieza best-effort de estado mock local */ }
  }, []);

  // Auto-seleccionar solo si hay exactamente 1 empresa — con múltiples siempre muestra el selector
  useEffect(() => {
    if (!authUser || membresiaActiva || todasMembresias.length !== 1) return;
    seleccionarEmpresa(todasMembresias[0].empresa_id);
  }, [authUser, todasMembresias, membresiaActiva]);

  // Guardar la última empresa seleccionada
  useEffect(() => {
    if (isSupabaseConfigured()) return;
    if (empresa?.id) {
      localStorage.setItem('active_empresa_obj', JSON.stringify(empresa));
    }
  }, [empresa]);


  // Business Data
  const [usuarios, setUsuarios] = useState(() => {
    if (isSupabaseConfigured()) return [];
    try { const saved = localStorage.getItem('tideo_usuarios'); return saved ? JSON.parse(saved) : MOCK.usuarios; } catch { return MOCK.usuarios; }
  });
  useEffect(() => {
    if (isSupabaseConfigured()) return;
    try { localStorage.setItem('tideo_usuarios', JSON.stringify(usuarios)); } catch {}
  }, [usuarios]);
  const [leads, setLeads] = useState(MOCK.leads);
  const [historialEstados, setHistorialEstados] = useState([]);
  const [oppHistorialEtapas, setOppHistorialEtapas] = useState([]);
  const [cuentas, setCuentas] = useState(MOCK.cuentas);
  const [contactos, setContactos] = useState(MOCK.contactos);
  const [oportunidades, setOportunidades] = useState(MOCK.oportunidades);
  const [campanas, setCampanas] = useState(MOCK.campanas || []);
  const [actividades, setActividades] = useState(MOCK.actividades);
  const [agendaEventos, setAgendaEventos] = useState(MOCK.agendaEventos || []);
  const [hojasCosteo, setHojasCosteo] = useState(MOCK.hojasCosteo || []);
  const [cotizaciones, setCotizaciones] = useState(MOCK.cotizaciones);
  const [osClientes, setOsClientes] = useState(MOCK.osClientes);
  const [cxp, setCxp] = useState(MOCK.cxp || []);
  const [cxpPagos, setCxpPagos] = useState([]);
  const [cxc, setCxc] = useState(MOCK.cxc || []);
  const [cobrosHistorial, setCobrosHistorial] = useState([]);
  const [gestionesCobranza, setGestionesCobranza] = useState([]);
  const [comisiones, setComisiones] = useState([]);
  const [recibosHonorarios, setRecibosHonorarios] = useState([]);
  const [cuentasBancarias, setCuentasBancarias] = useState(MOCK.cuentasBancarias || []);
  const [facturas, setFacturas] = useState(MOCK.facturas || []);
  const [comprasGastos, setComprasGastos] = useState(MOCK.compras || []);
  const [financiamientos, setFinanciamientos] = useState(MOCK.financiamientos || []);
  const [movimientosTesoreria, setMovimientosTesoreria] = useState(MOCK.movimientosTesoreria || []);
  const [movimientosBanco, setMovimientosBanco] = useState(MOCK.movimientosBanco || []);
  

  // Fase 2 Data
  const [ots, setOts] = useState(MOCK.ots || []);
  const [partes, setPartes] = useState(MOCK.partes || []);
  const [backlog, setBacklog] = useState(MOCK.backlog || []);
  const [inventario, setInventario] = useState(MOCK.inventario || []);
  const [solpes, setSolpes] = useState(MOCK.solpes || []);
  const [cierresTecnicos, setCierresTecnicos] = useState(MOCK.cierresTecnicos || []);
  const [valorizaciones, setValorizaciones] = useState(MOCK.valorizaciones || []);
  const [proveedores, setProveedores] = useState(MOCK.proveedores || []);
  const [evaluacionesProveedor, setEvaluacionesProveedor] = useState(MOCK.evaluacionesProveedor || []);
  const [procesosCompra, setProcesosCompra] = useState(MOCK.procesosCompra || []);
  const [respuestasCompra, setRespuestasCompra] = useState(MOCK.respuestasCompra || []);
  const [ordenesCompra, setOrdenesCompra] = useState(MOCK.ordenesCompra || []);
  const [ordenesServicio, setOrdenesServicio] = useState(MOCK.ordenesServicio || []);
  const [recepciones, setRecepciones] = useState(MOCK.recepciones || []);

  // Configuración de empresa
  const [empresaConfig, setEmpresaConfig] = useState({});
  const [seriesDocumentarias, setSeriesDocumentarias] = useState(isSupabaseConfigured() ? [] : SERIES_DOCUMENTARIAS_DEFAULT);
  const [slaPlantillas, setSlaPlantillas] = useState(isSupabaseConfigured() ? [] : SLA_PLANTILLAS_DEFAULT);
  const [diccionarioComercial, setDiccionarioComercial] = useState(isSupabaseConfigured() ? [] : DICCIONARIO_COMERCIAL_DEFAULT);
  const [monedasImpuestosUnidades, setMonedasImpuestosUnidades] = useState([]);

  // Maestros Base Data
  const [areasEmpresa, setAreasEmpresa] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [especialidades, setEspecialidades] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [industrias, setIndustrias] = useState([]);
  const [centrosCosto, setCentrosCosto] = useState([]);
  const [centrosBeneficio, setCentrosBeneficio] = useState([]);

  // Personal Operativo (separado del admin, estado propio)
  const [personalOperativo, setPersonalOperativo] = useState([]);

  // Fase 3 Data
  const [personalAdmin, setPersonalAdmin] = useState([]);
  const [vacacionesSolicitudes, setVacacionesSolicitudes] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [solicitudesRRHH, setSolicitudesRRHH] = useState([]);
  const [onboardings, setOnboardings] = useState(MOCK.onboardings || []);
  const [planesExito, setPlanesExito] = useState(MOCK.planesExito || []);
  const [healthScoresDetalle, setHealthScoresDetalle] = useState(MOCK.healthScoresDetalle || []);
  const [churnPlanes, setChurnPlanes] = useState(MOCK.churnPlanes || []);
  const [renovaciones, setRenovaciones] = useState(MOCK.renovaciones || []);
  const [npsEncuestas, setNpsEncuestas] = useState(MOCK.npsEncuestas || []);
  const [referidos, setReferidos] = useState(MOCK.referidos || []);
  const [casosExito, setCasosExito] = useState(MOCK.casosExito || []);
  const [iaLogs, setIaLogs] = useState(MOCK.iaLogs || []);
  // Planner v2
  const [plannerAsignaciones, setPlannerAsignaciones] = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);
  const [semanaPlanner, setSemanaPlanner] = useState(null); // { inicio, fin } de la semana cargada

  const [turnos, setTurnos] = useState(MOCK.turnos || []);
  const [registrosAsistencia, setRegistrosAsistencia] = useState(MOCK.registrosAsistencia || []);
  const [periodosNomina, setPeriodosNomina] = useState(MOCK.periodosNomina || []);
  const [trabajadoresDatosNomina, setTrabajadoresDatosNomina] = useState(MOCK.trabajadoresDatosNomina || {});

  const [rolesCtx, setRolesCtx] = useState(() => {
    if (isSupabaseConfigured()) return {};
    try {
      const saved = localStorage.getItem('tideo_roles');
      return saved ? JSON.parse(saved) : MOCK.roles;
    } catch { return MOCK.roles; }
  });
  useEffect(() => {
    if (isSupabaseConfigured()) return;
    try { localStorage.setItem('tideo_roles', JSON.stringify(rolesCtx)); } catch {}
  }, [rolesCtx]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!membresiaActiva?.rol_id) return;
    if (Object.keys(rolesCtx || {}).length) return;

    const rolBase = membresiaActiva.rol || {
      id: membresiaActiva.rol_id,
      nombre: 'Rol actual',
      descripcion: 'Rol asignado al usuario actual',
      es_admin_empresa: true,
      es_superadmin: false,
    };

    setRolesCtx({
      [membresiaActiva.rol_id]: {
        ...rolBase,
        id: membresiaActiva.rol_id,
        descripcion: rolBase.descripcion || 'Rol asignado al usuario actual',
        ...buildRoleDePermisos(rolBase, membresiaActiva.permisos_rows || [], membresiaActiva.acceso_campo, membresiaActiva.campo_modulos),
      },
    });
  }, [membresiaActiva?.rol_id, rolesCtx]);

  const [notificaciones, setNotificaciones] = useState([
    { id: 'f3_1', text: 'Health Score de Logística Altiplano bajó a 28 — riesgo crítico. Se requiere plan de retención urgente.', read: false, time: 'Hace 15 min' },
    { id: 'f3_2', text: 'Renovación de Planta Industrial Norte vence en 28 días (S/ 76,200). Responsable: Pedro Salas.', read: false, time: 'Hace 1h' },
    { id: 'f3_3', text: 'NPS 9 recibido de Minera Andes — cliente promotor. Solicitar autorización para caso de éxito.', read: false, time: 'Hace 2h' },
    { id: 'f3_4', text: 'Onboarding de Facilities Lima SA: hito "Capacitación técnica" con 2 días de atraso. Revisar.', read: false, time: 'Hace 3h' },
    { id: 'f3_5', text: 'Nuevo lead referido por Logística Altiplano SAC en proceso de calificación.', read: true, time: 'Ayer' },
    { id: 'f3_6', text: 'Bienvenido al ERP TIDEO Fase 3 — Customer Success, BI Financiero e IA Copiloto activos.', read: true, time: 'Hace 2 días' },
    { id: 'notif_fin_001', tipo: 'alerta', modulo: 'financiamiento', text: 'BCP Préstamo — Cuota N°2 vence en 7 días · S/ 2,354.17', read: false, time: 'Hoy' },
  ]);

  const addNotificacion = (msg) => {
    setNotificaciones(prev => [{ id: generateId('not'), text: msg, read: false, time: 'Justo ahora' }, ...prev]);
  };
  const [accessDebug, setAccessDebug] = useState({
    build: 'access-debug-2026-05-05-01',
    usuariosError: '',
    rolesError: '',
    usuariosLoading: false,
    rolesLoading: false,
    usuariosLoadedAt: '',
    rolesLoadedAt: '',
  });
  const markNotificacionesRead = () => {
    setNotificaciones(prev => prev.map(n => ({ ...n, read: true })));
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let mounted = true;
    let subscription = null;

    const initAuth = async () => {
      if (!isSupabaseConfigured()) {
        setAuthLoading(false);
        setAuthError('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
        return;
      }

      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;
        setAuthSession(data.session || null);
        setAuthUser(data.session?.user || null);

        const authListener = supabase.auth.onAuthStateChange((_event, session) => {
          setAuthSession(session || null);
          setAuthUser(session?.user || null);
        });
        subscription = authListener.data.subscription;
      } catch (error) {
        if (mounted) setAuthError(error?.message || 'No se pudo iniciar Supabase Auth.');
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  const signInWithPassword = async ({ email, password }) => {
    try {
      setAuthError(null);
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthSession(data.session || null);
      setAuthUser(data.user || data.session?.user || null);
      return { data };
    } catch (error) {
      const message = error?.message || 'No se pudo iniciar sesion.';
      setAuthError(message);
      return { error: message };
    }
  };

  const signUpWithPassword = async ({ email, password }) => {
    try {
      setAuthError(null);
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        let message = error.message;
        try {
          const body = await error.context?.json?.();
          message = body?.error || message;
        } catch { /* la respuesta de la funcion no siempre trae JSON */ }
        throw new Error(message || 'No se pudo crear el usuario.');
      }
      setAuthSession(data.session || null);
      setAuthUser(data.user || data.session?.user || null);
      return { data };
    } catch (error) {
      const message = error?.message || 'No se pudo crear el usuario.';
      setAuthError(message);
      return { error: message };
    }
  };

  const signOut = async () => {
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    setAuthSession(null);
    setAuthUser(null);
  };

  const loadSupabaseFinanceData = async () => {
    if (!isSupabaseConfigured()) return;

    if (!isSupabaseConfigured()) {
      setSupabaseStatus({
        enabled: true,
        configured: false,
        connected: false,
        loading: false,
        error: 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
      });
      return;
    }

    if (!authSession?.user) {
      setSupabaseStatus({
        enabled: true,
        configured: true,
        connected: false,
        loading: false,
        error: null,
      });
      return;
    }

    setSupabaseStatus(prev => ({ ...prev, loading: true, error: null }));

    try {
      const supabase = await getSupabaseClient();
      const empresaId = empresa?.id;

      const scoped = table => supabase.from(table).select('*').eq('empresa_id', empresaId);
      const [
        financiamientosResult,
        amortizacionResult,
        pagosResult,
        gastosResult,
        tesoreriaResult,
      ] = await Promise.all([
        scoped('financiamientos').order('fecha_desembolso', { ascending: false }),
        scoped('tabla_amortizacion').order('numero', { ascending: true }),
        scoped('pagos_financiamiento').order('fecha_pago', { ascending: false }),
        scoped('compras_gastos').order('fecha', { ascending: false }),
        scoped('movimientos_tesoreria').order('fecha', { ascending: false }),
      ]);

      const firstError = [
        financiamientosResult,
        amortizacionResult,
        pagosResult,
        gastosResult,
        tesoreriaResult,
      ].find(result => result.error)?.error;

      if (firstError) throw firstError;

      // Nuevos datos de finanzas (facturación y tesorería)
      const valData = await finanzasService.getValorizaciones(empresaId);
      const facData = await finanzasService.getFacturas(empresaId);
      const cxcData = await finanzasService.getCxC(empresaId);
      const cxpData = await finanzasService.getCxP(empresaId);
      const cxpPagosData = await finanzasService.getCxpPagos(empresaId);
      const mbData = await finanzasService.getMovimientosBanco(empresaId);

      const amortizacion = amortizacionResult.data || [];
      const pagos = pagosResult.data || [];
      const financiamientosConDetalle = (financiamientosResult.data || []).map(financiamiento => ({
        ...financiamiento,
        tabla_amortizacion: amortizacion.filter(cuota => cuota.financiamiento_id === financiamiento.id),
        pagos_realizados: pagos.filter(pago => pago.financiamiento_id === financiamiento.id),
      }));

      setFinanciamientos(financiamientosConDetalle);
      setComprasGastos(gastosResult.data || []);
      setMovimientosTesoreria(tesoreriaResult.data || []);
      
      setValorizaciones(valData || []);
      setFacturas(facData || []);
      setCxc(cxcData || []);
      setCxp(cxpData || []);
      setCxpPagos(cxpPagosData || []);
      setMovimientosBanco(mbData || []);

      setSupabaseStatus({
        enabled: true,
        configured: true,
        connected: true,
        loading: false,
        error: null,
      });
    } catch (error) {
      setSupabaseStatus({
        enabled: true,
        configured: true,
        connected: false,
        loading: false,
        error: error?.message || 'No se pudo conectar con Supabase.',
      });
    }
  };

  useEffect(() => {
    if (isSupabaseConfigured() && (!membresiaActiva?.empresa?.id || membresiaActiva.empresa.id !== empresa?.id)) return;
    loadSupabaseFinanceData();
  }, [empresa?.id, authSession?.user?.id, membresiaActiva?.empresa?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !authSession?.user || !empresa?.id) return;
    if (!membresiaActiva?.empresa?.id || membresiaActiva.empresa.id !== empresa.id) return;

    let mounted = true;
    const empresaId = empresa.id;
    const empresaEsPlataforma = Boolean(empresa.es_plataforma);
    const callerEmail = authUser?.email || '';
    const callerId = authUser?.id || '';
    const hasPlatformSuperadminMembership = todasMembresias.some(m => m.rol?.es_superadmin && m.empresa?.es_plataforma);

    setUsuarios([]);
    setAccessDebug(prev => ({
      ...prev,
      usuariosError: '',
      rolesError: '',
      usuariosLoading: true,
      rolesLoading: true,
      usuariosLoadedAt: '',
      rolesLoadedAt: '',
    }));

    const loadAccessData = async () => {
      const [usuariosResult, rolesResult] = await Promise.allSettled([
        usuariosService.getUsuarios(empresaId),
        rolesService.getRolesConPermisos(empresaId),
      ]);

      if (!mounted) return;

      if (usuariosResult.status === 'fulfilled') {
        const usrData = usuariosResult.value || [];
        setUsuarios(usrData);
        setAccessDebug(prev => ({
          ...prev,
          usuariosError: '',
          usuariosLoading: false,
          usuariosLoadedAt: new Date().toLocaleTimeString('es-PE'),
        }));

        const isPlatformSuperadminSupport = isPlatformSuperadminEmail(callerEmail)
          && !empresaEsPlataforma
          && hasPlatformSuperadminMembership;
        if (callerEmail && !isPlatformSuperadminSupport && !usrData.find(u => u.email === callerEmail)) {
          registrarUsuario({
            id: callerId,
            nombre: authUser?.user_metadata?.nombre || callerEmail.split('@')[0],
            email: callerEmail,
            rol: 'admin',
            empresa_id: empresaId,
            estado: 'Activo',
          });
        }
      } else {
        const message = usuariosResult.reason?.message || 'Error desconocido';
        setAccessDebug(prev => ({
          ...prev,
          usuariosError: message,
          usuariosLoading: false,
        }));
        addNotificacion(`No se pudieron cargar usuarios: ${message}`);
      }

      if (rolesResult.status === 'fulfilled') {
        const { roles: rolesData, permisos: permisosData } = rolesResult.value || {};
        if (rolesData?.length) {
          setRolesCtx(rolesConPermisosAObjeto(rolesData, permisosData));
        } else {
          setRolesCtx(prev => prev || {});
        }
        setAccessDebug(prev => ({
          ...prev,
          rolesError: '',
          rolesLoading: false,
          rolesLoadedAt: new Date().toLocaleTimeString('es-PE'),
        }));
      } else {
        const message = rolesResult.reason?.message || 'Error desconocido';
        setAccessDebug(prev => ({
          ...prev,
          rolesError: message,
          rolesLoading: false,
        }));
      }
    };

    loadAccessData();
    return () => { mounted = false; };
  }, [empresa?.id, empresa?.es_plataforma, authSession?.user?.id, authUser?.id, authUser?.email, membresiaActiva?.empresa?.id, todasMembresias]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !authSession?.user || !empresa?.id) return;
    if (!membresiaActiva?.empresa?.id || membresiaActiva.empresa.id !== empresa.id) return;
    
    // Limpiar listas actuales para evitar datos "pegados" de otro tenant
    // usuarios se limpia después del merge con localStorage
    // Usuarios y roles cargan en un efecto dedicado para responder mas rapido.
    setLeads([]);
    setCuentas([]);
    // ... (opcional otras listas)

    let mounted = true;
    const loadCrm = async () => {
      try {
        const supabase = await getSupabaseClient();
        setCuentas([]);
        setLeads([]);
        setContactos([]);
        setOportunidades([]);
        setCampanas([]);
        setHojasCosteo([]);
        setCotizaciones([]);
        setOsClientes([]);
        setAgendaEventos([]);
        setActividades([]);
        setOts([]);
        setPartes([]);
        setBacklog([]);
        setValorizaciones([]);
        setFacturas([]);
        setCxc([]);
        setCxp([]);
        setCxpPagos([]);
        setMovimientosBanco([]);
        setProveedores([]);
        setEvaluacionesProveedor([]);
        setSolpes([]);
        setProcesosCompra([]);
        setOrdenesCompra([]);
        setOrdenesServicio([]);
        setRecepciones([]);
        setInventario([]);
        setPersonalOperativo([]);
        setPersonalAdmin([]);
        setTurnos([]);
        setRegistrosAsistencia([]);
        setPeriodosNomina([]);

        const data = await loadCrmFromSupabase(supabase, empresa.id);
        if (!data || !mounted) return;
        const agendaData = data.agendaEventos || [];
        const actividadesData = data.actividades || [];
        const leadsCalculados = recalcularDiasSinActividadLeads(data.leads || [], actividadesData, agendaData);
        setCuentas(data.cuentas || []);
        setLeads(leadsCalculados);
        Promise.all(
          leadsCalculados
            .filter((lead, index) => Number((data.leads || [])[index]?.dias_sin_actividad || 0) !== Number(lead.dias_sin_actividad || 0))
            .map(lead => actualizarLead(supabase, lead.id, { dias_sin_actividad: lead.dias_sin_actividad }))
        ).catch(err => console.error('No se pudo sincronizar dias_sin_actividad', err));
        setContactos(data.contactos || []);
        setOportunidades(data.oportunidades || []);
        setHojasCosteo(data.hojasCosteo || []);
        setCotizaciones(data.cotizaciones || []);
        setOsClientes(data.osClientes || []);
        setAgendaEventos(agendaData);
        setActividades(actividadesData);
        setHistorialEstados(data.historialEstados || []);
        setOppHistorialEtapas(data.oppHistorialEtapas || []);

        try {
          const campanasData = await campanasService.listar(empresa.id);
          if (mounted) setCampanas(campanasData || []);
        } catch (_err) { /* keep empty list if campaign table is not available */ }
        
        const opsData = await loadOpsFromSupabase(supabase, empresa.id);
        if (opsData && mounted) {
          setOts(opsData.ots || []);
          setPartes(opsData.partes || []);
          setBacklog(opsData.backlog || []);
          setPlannerAsignaciones(opsData.plannerAsignaciones || []);
          setCierresTecnicos(opsData.cierresTecnicos || []);
        }
        
        try {
          const ar = await maestrosService.getAreas(empresa.id);
          const cg = await maestrosService.getCargos(empresa.id);
          const es = await maestrosService.getEspecialidades(empresa.id);
          const ts = await maestrosService.getTiposServicio(empresa.id);
          const al = await maestrosService.getAlmacenes(empresa.id);
          const sd = await maestrosService.getSedes(empresa.id);
          const ind = await maestrosService.getIndustrias(empresa.id);
          const cc = await maestrosService.getCentrosCosto(empresa.id);
          const cb = await maestrosService.getCentrosBeneficio(empresa.id);
          const miu = await maestrosService.getMonedasImpuestosUnidades(empresa.id);
          if (mounted) {
            setAreasEmpresa(ar || []);
            setCargos(cg || []);
            setEspecialidades(es || []);
            setTiposServicio(ts || []);
            setAlmacenes(al || []);
            setSedes(sd || []);
            setIndustrias(ind || []);
            setCentrosCosto(cc || []);
            setCentrosBeneficio(cb || []);
            setMonedasImpuestosUnidades(miu || []);
          }
        } catch (_err) { /* keep mock */ }

        try {
          const { data: cfgData } = await supabase.from('empresa_config').select('*').eq('empresa_id', empresa.id).maybeSingle();
          if (mounted) setEmpresaConfig(cfgData || {});
          const [{ data: seriesData }, { data: slaData }, { data: diccionarioData }] = await Promise.all([
            supabase.from('series_documentarias').select('*').eq('empresa_id', empresa.id).order('documento', { ascending: true }),
            supabase.from('sla_plantillas').select('*').eq('empresa_id', empresa.id).order('nombre', { ascending: true }),
            supabase.from('diccionario_comercial').select('*').eq('empresa_id', empresa.id).order('categoria', { ascending: true }).order('clave', { ascending: true }),
          ]);
          if (mounted) {
            setSeriesDocumentarias(seriesData || []);
            setSlaPlantillas(slaData || []);
            setDiccionarioComercial(diccionarioData || []);
          }
        } catch (_err) { /* tabla aún no existe, ignorar */ }

        try {
          const [cobrosData, gestionesData, cuentasBanData, comisionesData, recibosData] = await Promise.all([
            finanzasService.getCobrosHistorial(empresa.id),
            finanzasService.getGestionesCobranza(empresa.id),
            finanzasService.getCuentasBancarias(empresa.id),
            finanzasService.getComisiones(empresa.id),
            finanzasService.getRecibosHonorarios(empresa.id),
          ]);
          if (mounted) {
            setCobrosHistorial(cobrosData || []);
            setGestionesCobranza(gestionesData || []);
            if ((cuentasBanData || []).length > 0) setCuentasBancarias(cuentasBanData);
            if ((comisionesData || []).length > 0) setComisiones(comisionesData);
            if ((recibosData || []).length > 0) setRecibosHonorarios(recibosData);
          }
        } catch (_err) { /* tabla aún no existe, ignorar */ }

        try {
          const [prvData, evalData, slpData, pcData, ocData, osData, recData, invData] = await Promise.all([
            comprasService.getProveedores(empresa.id),
            comprasService.getEvaluacionesProveedor(empresa.id),
            comprasService.getSolpes(empresa.id),
            comprasService.getProcesosCompra(empresa.id),
            comprasService.getOrdenesCompra(empresa.id),
            comprasService.getOrdenesServicio(empresa.id),
            comprasService.getRecepciones(empresa.id),
            comprasService.getInventario(empresa.id),
          ]);
          if (mounted) {
            setProveedores(prvData || []);
            setEvaluacionesProveedor(evalData || []);
            setSolpes(slpData || []);
            setProcesosCompra(pcData || []);
            setOrdenesCompra(ocData || []);
            setOrdenesServicio(osData || []);
            setRecepciones(recData || []);
            setInventario(invData || []);
          }
        } catch (_err) { /* keep mock */ }

        try {
          const [persOpsData, persAdmData, turnosData, asistenciaData, nominaData] = await Promise.all([
            rrhhService.getPersonalOperativo(empresa.id),
            rrhhService.getPersonalAdmin(empresa.id),
            rrhhService.getTurnos(empresa.id),
            rrhhService.getAsistencia(empresa.id),
            rrhhService.getPeriodosNomina(empresa.id),
          ]);
          if (mounted) {
            setPersonalOperativo(persOpsData || []);
            setPersonalAdmin(persAdmData || []);
            setTurnos(turnosData || []);
            setRegistrosAsistencia(asistenciaData || []);
            setPeriodosNomina(nominaData || []);
          }
        } catch (_err) {
          if (mounted) {
            setPersonalOperativo([]);
            setPersonalAdmin([]);
          }
        }

        try {
          const csData = await loadCsFromSupabase(supabase, empresa.id);
          if (csData && mounted) {
            setRenovaciones(csData.renovaciones || []);
            setOnboardings(csData.onboardings || []);
            setPlanesExito(csData.planesExito || []);
            setNpsEncuestas(csData.npsEncuestas || []);
          }
        } catch (_err) { /* keep mock */ }

        // Planner v2: cargar cuadrillas (asignaciones se cargan on-demand por semana)
        try {
          const cuadData = await plannerSvc.getCuadrillas(empresa.id);
          if (mounted) setCuadrillas(cuadData || []);
        } catch (_err) { /* keep mock */ }

      } catch (_err) { /* keep mock on error */ }
    };
    loadCrm();
    return () => { mounted = false; };
  }, [empresa?.id, authSession?.user?.id, membresiaActiva?.empresa?.id]);

  const cargarMembresiaCompleta = async (mem) => {
    try {
      const supabase = await getSupabaseClient();
      const { data: permisosRows } = await supabase
        .from('permisos_roles')
        .select('*')
        .eq('rol_id', mem.rol_id);
      if (mem.empresa) setEmpresa(normalizarEmpresaSupabase(mem.empresa));
      setMembresiaActiva({
        empresa: mem.empresa,
        rol: mem.rol,
        rol_id: mem.rol_id,
        acceso_campo: mem.acceso_campo,
        perfil_campo: mem.perfil_campo,
        campo_modulos: mem.campo_modulos || [],
        permisos_rows: permisosRows || [],
      });
    } catch (_err) {
      setMembresiaActiva(null);
    } finally {
      setMembresiaCargando(false);
    }
  };

  const seleccionarEmpresa = async (empresaId) => {
    const mem = todasMembresias.find(m => m.empresa_id === empresaId);
    if (!mem) return;
    try { localStorage.setItem('last_empresa_id', empresaId); } catch {}
    setMembresiaCargando(true);
    await cargarMembresiaCompleta(mem);
    if (isSupabaseConfigured() && mem.rol?.es_superadmin && !mem.empresa?.es_plataforma) {
      getSupabaseClient().then(sb => sb.from('superadmin_accesos').insert({
        user_id: authUser.id,
        empresa_id: mem.empresa_id,
        empresa_nombre: mem.empresa?.nombre_comercial || mem.empresa?.razon_social || mem.empresa_id,
      })).catch(() => {});
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured() || !authUser?.id) {
      if (isSupabaseConfigured()) {
        setTodasMembresias([]);
        setMembresiaActiva(null);
        setMembresiaCargando(false);
      }
      return;
    }

    let mounted = true;
    setMembresiaCargando(true);

    const loadMembresia = async () => {
      try {
        const supabase = await getSupabaseClient();

        const { data: ues, error: uesError } = await supabase.rpc('get_mis_membresias');
        console.log('>>> UES RPC:', { ues, uesError });

        if (uesError || !ues?.length) {
          if (mounted) { setTodasMembresias([]); setMembresiaCargando(false); }
          return;
        }

        const empresaIds = [...new Set(ues.map(u => u.empresa_id))];
        const rolIds = [...new Set(ues.map(u => u.rol_id).filter(Boolean))];

        const [{ data: empresasRows, error: empErr }, { data: rolesRows, error: rolErr }] = await Promise.all([
          supabase.from('empresas').select('id, razon_social, nombre_comercial, ruc, moneda_base, plan_id, estado, es_plataforma').in('id', empresaIds),
          supabase.from('roles').select('id, nombre, es_admin_empresa, es_superadmin').in('id', rolIds),
        ]);

        console.log('>>> EMPRESAS:', { empresasRows, empErr }, '>>> ROLES:', { rolesRows, rolErr });

        const memberships = ues.map(u => ({
          ...u,
          empresa: empresasRows?.find(e => e.id === u.empresa_id) || null,
          rol: rolesRows?.find(r => r.id === u.rol_id) || null,
        }));

        const activas = memberships.filter(m => empresaPermiteAcceso(m.empresa?.estado));
        console.log('>>> ACTIVAS:', activas);
        if (!mounted) return;

        setTodasMembresias(activas);

        if (activas.length >= 1) {
          const lastId = localStorage.getItem('last_empresa_id');
          const mem = (lastId && activas.find(m => m.empresa_id === lastId)) || activas[0];
          await cargarMembresiaCompleta(mem);
        } else {
          setMembresiaCargando(false);
        }
      } catch (_err) {
        if (mounted) { setTodasMembresias([]); setMembresiaCargando(false); }
      }
    };

    loadMembresia();
    return () => { mounted = false; };
  }, [authUser?.id]);

  // Carga notificaciones persistentes del sistema al iniciar sesión
  useEffect(() => {
    if (!isSupabaseConfigured() || !authUser?.id) return;
    getSupabaseClient().then(sb =>
      cargarNotificacionesSistema(sb, authUser.id)
    ).then(rows => {
      if (!rows?.length) return;
      setNotificaciones(prev => [
        ...rows.map(r => ({ id: r.id, text: r.texto, read: r.leida, time: new Date(r.created_at).toLocaleDateString('es-PE'), _db: true })),
        ...prev,
      ]);
    }).catch(() => {});
  }, [authUser?.id]);

  const crmSync = (fn) => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    crmPersist(fn)
      .catch((error) => {
        const message = error?.message || 'No se pudo persistir el cambio CRM en Supabase.';
        console.error('[CRM sync]', message, error);
        addNotificacion(`CRM no persistio en Supabase: ${message}`);
      });
  };

  const crmPersist = async (fn) => {
    if (!isSupabaseConfigured() || !empresa?.id) return null;
    const sb = await getSupabaseClient();
    const result = await fn(sb);
    if (result?.error) throw result.error;
    return result;
  };

  const opsSync = (fn) => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    getSupabaseClient()
      .then(async sb => {
        const result = await fn(sb);
        if (result?.error) throw result.error;
        return result;
      })
      .catch((error) => {
        const message = error?.message || 'No se pudo persistir el cambio operativo en Supabase.';
        console.error('[OPS sync]', message, error);
        addNotificacion(`Operaciones no persistio en Supabase: ${message}`);
      });
  };

  const opsPersist = async (fn) => {
    if (!isSupabaseConfigured() || !empresa?.id) return null;
    const sb = await getSupabaseClient();
    const result = await fn(sb);
    if (result?.error) throw result.error;
    return result;
  };

  const finSync = (fn) => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    fn().catch((error) => {
      const message = error?.message || 'No se pudo persistir el cambio financiero en Supabase.';
      console.error('[FIN sync]', message, error);
      addNotificacion(`Finanzas no persistio en Supabase: ${message}`);
    });
  };

  const auditSync = ({ modulo, entidad, entidad_id, accion, valor_anterior = null, valor_nuevo = null }) => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    auditoriaService.registrar({
      empresa_id: empresa.id,
      user_id: authUser?.id || null,
      modulo,
      entidad,
      entidad_id,
      accion,
      valor_anterior,
      valor_nuevo
    }).catch((error) => {
      console.error('[AUDIT sync]', error?.message || error, error);
    });
  };

  const navigate = (page, params = {}) => {
    setActive(page);
    setActiveParams(params);
    try {
      localStorage.setItem('tideo_active_page', page);
      if (window.location.hash.replace(/^#\/?/, '') !== page) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${page}`);
      }
    } catch { /* navegacion local: no bloquear si el storage no esta disponible */ }
  };

  const role = (isSupabaseConfigured() && membresiaActiva)
    ? buildRoleDePermisos(membresiaActiva.rol, membresiaActiva.permisos_rows, membresiaActiva.acceso_campo, membresiaActiva.campo_modulos)
    : (MOCK.roles[roleKey] || MOCK.roles['admin']);
  // Superadmin de plataforma solo aplica cuando el tenant activo es emp_tideo.
  // En cualquier otro tenant el usuario actúa como admin de ese tenant, sin acceso a módulos de plataforma.
  const isSuperadmin = Boolean(role.permisos?.plataforma) &&
    (!isSupabaseConfigured() || Boolean(membresiaActiva?.empresa?.es_plataforma));

  useEffect(() => {
    if (!isSupabaseConfigured() || !authSession?.user || !isSuperadmin) return;
    plataformaService.listarEmpresas()
      .then(rows => setEmpresasPlataforma(rows.map(normalizarEmpresaSupabase)))
      .catch(error => {
        console.error('[PLATFORM sync]', error?.message || error, error);
        addNotificacion(`Plataforma no pudo cargar tenants: ${error?.message || 'error de Supabase'}`);
      });
  }, [authSession?.user?.id, isSuperadmin]);

  const crearTenantConAdmin = async (datos) => {
    if (!isSuperadmin) throw new Error('Solo Superadmin TIDEO puede crear tenants.');

    if (isSupabaseConfigured()) {
      const result = await plataformaService.crearTenantConAdmin(datos);
      const rows = await plataformaService.listarEmpresas();
      setEmpresasPlataforma(rows.map(normalizarEmpresaSupabase));
      addNotificacion(result?.admin_vinculado
        ? `Tenant creado y admin vinculado: ${datos.admin_email}.`
        : 'Tenant creado. El email admin aun no existe en Supabase Auth; queda pendiente vincularlo.');
      return result;
    }

    const nuevo = {
      id: generateId('emp'),
      razon_social: datos.razon_social,
      nombre_comercial: datos.nombre_comercial || datos.razon_social,
      nombre: datos.nombre_comercial || datos.razon_social,
      ruc: datos.ruc || '',
      pais: datos.pais || 'PE',
      moneda_base: datos.moneda_base || 'PEN',
      moneda: datos.moneda_base || 'PEN',
      estado: datos.estado || 'activa',
      plan: null,
      admin_email: datos.admin_email || '',
      color: '#0ea5e9',
    };
    setEmpresasPlataforma(prev => [nuevo, ...prev]);
    addNotificacion(`Tenant creado en modo prototipo: ${nuevo.nombre}.`);
    return { empresa_id: nuevo.id, rol_id: `rol_${nuevo.id}_admin`, admin_vinculado: Boolean(datos.admin_email) };
  };

  const actualizarTenant = async (id, datos) => {
    if (!isSuperadmin) throw new Error('Solo Superadmin TIDEO puede editar tenants.');
    if (isSupabaseConfigured()) {
      await plataformaService.actualizarEmpresa(id, datos);
    }
    const rows = isSupabaseConfigured()
      ? await plataformaService.listarEmpresas()
      : null;
    if (rows) {
      setEmpresasPlataforma(rows.map(normalizarEmpresaSupabase));
    } else {
      setEmpresasPlataforma(prev => prev.map(e => e.id === id ? { ...e, ...datos, nombre: datos.nombre_comercial || datos.razon_social || e.nombre } : e));
    }
  };

  const eliminarTenant = async (id) => {
    if (!isSuperadmin) throw new Error('Solo Superadmin TIDEO puede eliminar tenants.');
    if (isSupabaseConfigured()) {
      await plataformaService.eliminarEmpresa(id);
    }
    setEmpresasPlataforma(prev => prev.filter(e => e.id !== id));
  };

  const recargarCampanas = async () => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    try {
      const data = await campanasService.listar(empresa.id);
      setCampanas(data || []);
    } catch (err) { console.error(err); }
  };

  const crearCampana = async (datos) => {
    if (!isSupabaseConfigured()) {
      const campana = { ...datos, id: generateId('camp'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setCampanas(prev => [campana, ...prev]);
      return;
    }
    try {
      await campanasService.crear(empresa.id, datos);
      await recargarCampanas();
    } catch (err) {
      addNotificacion(`Error al crear campaña: ${err.message}`);
      throw err;
    }
  };

  const actualizarCampana = async (id, datos) => {
    if (!isSupabaseConfigured()) {
      setCampanas(prev => prev.map(c => c.id === id ? { ...c, ...datos } : c));
      return;
    }
    try {
      await campanasService.actualizar(id, datos);
      await recargarCampanas();
    } catch (err) {
      addNotificacion(`Error al actualizar campaña: ${err.message}`);
      throw err;
    }
  };

  const cambiarEstadoCampana = async (id, estado) => {
    if (!isSupabaseConfigured()) {
      setCampanas(prev => prev.map(c => c.id === id ? { ...c, estado } : c));
      return;
    }
    try {
      await campanasService.cambiarEstado(id, estado);
      await recargarCampanas();
    } catch (err) {
      addNotificacion(`Error al cambiar estado de campaña: ${err.message}`);
      throw err;
    }
  };

  const eliminarCampana = async (id) => {
    if (!isSupabaseConfigured()) {
      setCampanas(prev => prev.filter(c => c.id !== id));
      return;
    }
    try {
      await campanasService.eliminar(id);
      await recargarCampanas();
    } catch (err) {
      addNotificacion(`Error al eliminar campaña: ${err.message}`);
      throw err;
    }
  };

  const crearLead = (lead) => {
    setLeads(prev => [lead, ...prev]);
    crmSync(sb => persistirLead(sb, empresa.id, lead));
    auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: lead.id, accion: 'crear', valor_nuevo: lead });
  };

  const actualizarLeadDatos = (leadId, datos) => {
    const anterior = leads.find(l => l.id === leadId) || null;
    const payload = { ...datos };
    if (payload.presupuesto_estimado !== undefined) {
      payload.presupuesto_estimado = Number(payload.presupuesto_estimado || 0);
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...payload } : l));
    crmSync(sb => actualizarLead(sb, leadId, {
      ...payload,
      nombre_contacto: payload.nombre ?? payload.nombre_contacto,
      empresa_nombre: payload.empresa_contacto ?? payload.empresa_nombre,
    }));
    auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: leadId, accion: 'editar', valor_anterior: anterior, valor_nuevo: payload });
    addNotificacion('Lead actualizado.');
  };

  const eliminarLead = async (leadId) => {
    const anterior = leads.find(l => l.id === leadId) || null;
    setLeads(prev => prev.filter(l => l.id !== leadId));
    try {
      await crmPersist(sb => eliminarLeadSvc(sb, leadId));
      auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: leadId, accion: 'eliminar', valor_anterior: anterior });
      addNotificacion('Lead eliminado.');
      return true;
    } catch (error) {
      if (anterior) setLeads(prev => prev.some(l => l.id === leadId) ? prev : [anterior, ...prev]);
      addNotificacion(`No se pudo eliminar el lead: ${error?.message || 'Error desconocido'}`);
      throw error;
    }
  };

  const crearCuenta = (cuenta) => {
    const contactoPrincipal = cuenta.nombre_contacto ? {
      id: generateId('con'),
      empresa_id: empresa.id,
      cuenta_id: cuenta.id,
      nombre: cuenta.nombre_contacto,
      cargo: cuenta.cargo_contacto || null,
      telefono: cuenta.telefono || null,
      email: cuenta.email || null,
      principal: true,
      es_principal: true,
      estado: 'activo',
    } : null;

    setCuentas(prev => [...prev, cuenta]);
    if (contactoPrincipal) setContactos(prev => [...prev, contactoPrincipal]);
    crmSync(async sb => {
      await persistirCuenta(sb, empresa.id, cuenta);
      if (contactoPrincipal) await persistirContacto(sb, empresa.id, contactoPrincipal);
    });
    auditSync({ modulo: 'crm', entidad: 'cuentas', entidad_id: cuenta.id, accion: 'crear', valor_nuevo: cuenta });
  };

  const actualizarCuenta = async (cuentaId, datos) => {
    const anterior = cuentas.find(c => c.id === cuentaId);
    const payload = { ...datos };
    if (payload.limite_credito !== undefined) {
      payload.limite_credito = Number(payload.limite_credito || 0);
    }

    setCuentas(prev => prev.map(c => c.id === cuentaId ? { ...c, ...payload } : c));
    await crmPersist(sb => svcActualizarCuenta(sb, empresa.id, cuentaId, payload));
    auditSync({ modulo: 'crm', entidad: 'cuentas', entidad_id: cuentaId, accion: 'editar', valor_anterior: anterior || null, valor_nuevo: payload });
    addNotificacion('Cuenta actualizada.');
    return { ...(anterior || {}), ...payload };
  };

  const actualizarLogoCuenta = async (cuenta, file) => {
    if (!cuenta?.id || !file) return null;

    if (!isSupabaseConfigured()) {
      throw new Error('Supabase no esta configurado para guardar logotipos.');
    }

    const anterior = cuentas.find(c => c.id === cuenta.id) || cuenta;
    const actualizada = await crmPersist(sb => subirLogoCuenta(sb, empresa.id, cuenta.id, file));

    setCuentas(prev => prev.map(c => c.id === cuenta.id ? { ...c, ...actualizada } : c));
    auditSync({
      modulo: 'crm',
      entidad: 'cuentas',
      entidad_id: cuenta.id,
      accion: 'actualizar_logo',
      valor_anterior: { logo_url: anterior.logo_url || null, logo_path: anterior.logo_path || null },
      valor_nuevo: { logo_url: actualizada.logo_url, logo_path: actualizada.logo_path },
    });
    addNotificacion(`Logo actualizado: ${actualizada.razon_social || cuenta.razon_social}`);
    return actualizada;
  };

  const crearContactoCuenta = async (cuentaId, datos) => {
    const contacto = {
      id: generateId('con'),
      empresa_id: empresa.id,
      cuenta_id: cuentaId,
      nombre: datos.nombre || 'Sin nombre',
      cargo: datos.cargo || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      principal: Boolean(datos.principal || datos.es_principal),
      es_principal: Boolean(datos.principal || datos.es_principal),
      estado: 'activo',
    };

    if (contacto.es_principal) {
      setContactos(prev => prev.map(c => c.cuenta_id === cuentaId ? { ...c, principal: false, es_principal: false } : c));
    }
    setContactos(prev => [...prev, contacto]);

    crmSync(async sb => {
      if (contacto.es_principal) {
        const actuales = contactos.filter(c => c.cuenta_id === cuentaId);
        await Promise.all(actuales.map(c => actualizarContacto(sb, empresa.id, c.id, { es_principal: false })));
      }
      await persistirContacto(sb, empresa.id, contacto);
    });
    auditSync({ modulo: 'crm', entidad: 'contactos', entidad_id: contacto.id, accion: 'crear', valor_nuevo: contacto });
    addNotificacion(`Contacto creado: ${contacto.nombre}`);
    return contacto;
  };

  const actualizarContactoCuenta = async (contactoId, datos) => {
    const anterior = contactos.find(c => c.id === contactoId);
    if (!anterior) return null;
    const normalizado = {
      ...datos,
      es_principal: datos.es_principal ?? datos.principal,
      principal: datos.principal ?? datos.es_principal,
    };

    setContactos(prev => prev.map(c => {
      if (normalizado.es_principal && c.cuenta_id === anterior.cuenta_id && c.id !== contactoId) {
        return { ...c, principal: false, es_principal: false };
      }
      return c.id === contactoId ? { ...c, ...normalizado } : c;
    }));

    crmSync(async sb => {
      if (normalizado.es_principal) {
        const otros = contactos.filter(c => c.cuenta_id === anterior.cuenta_id && c.id !== contactoId);
        await Promise.all(otros.map(c => actualizarContacto(sb, empresa.id, c.id, { es_principal: false })));
      }
      await actualizarContacto(sb, empresa.id, contactoId, {
        nombre: normalizado.nombre,
        cargo: normalizado.cargo,
        telefono: normalizado.telefono,
        email: normalizado.email,
        es_principal: normalizado.es_principal,
        estado: normalizado.estado,
      });
    });
    auditSync({ modulo: 'crm', entidad: 'contactos', entidad_id: contactoId, accion: 'editar', valor_anterior: anterior, valor_nuevo: normalizado });
    addNotificacion(`Contacto actualizado: ${normalizado.nombre || anterior.nombre}`);
    return { ...anterior, ...normalizado };
  };

  // Mutations
  const convertirLead = (leadId, datosConversion) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const rucLead = datosConversion.ruc || lead.ruc;
    const emailContacto = datosConversion.contacto_email || lead.email;

    // Deduplicar cuenta por RUC
    const cuentaExistente = rucLead && rucLead !== 'Pendiente'
      ? cuentas.find(c => c.empresa_id === empresa.id && c.ruc === rucLead)
      : null;

    const cuentaId = cuentaExistente ? cuentaExistente.id : generateId('cta');
    const nuevaCuenta = cuentaExistente ? null : {
      id: cuentaId,
      empresa_id: empresa.id,
      razon_social: datosConversion.razon_social || lead.razon_social || lead.empresa_contacto,
      nombre_comercial: datosConversion.nombre_comercial || lead.empresa_contacto,
      tipo: 'prospecto',
      industria: datosConversion.industria || lead.industria || 'Por definir',
      tamano: 'Por definir',
      estado: 'activo',
      responsable_comercial: lead.responsable,
      responsable_id: lead?.['responsable_id'] || null,
      responsable_cs: null,
      condicion_pago: 'Por definir',
      limite_credito: 0,
      riesgo_financiero: 'bajo',
      health_score: null,
      riesgo_churn: null,
      fecha_ultima_compra: null,
      margen_acumulado: null,
      saldo_cxc: 0,
      lead_origen: lead.id,
      direccion: lead.direccion || 'Pendiente',
      telefono: lead.telefono,
      email: lead.email,
      ruc: rucLead || 'Pendiente'
    };

    // Deduplicar contacto por email dentro de la misma cuenta
    const contactoExistente = emailContacto
      ? contactos.find(c => c.cuenta_id === cuentaId && c.email === emailContacto)
      : null;

    const contactoId = contactoExistente ? contactoExistente.id : generateId('con');
    const nuevoContacto = contactoExistente ? null : {
      id: contactoId,
      empresa_id: empresa.id,
      cuenta_id: cuentaId,
      nombre: datosConversion.contacto_nombre || lead.nombre,
      cargo: datosConversion.contacto_cargo || lead.cargo,
      rol: 'decisor',
      telefono: datosConversion.contacto_telefono || lead.telefono,
      email: emailContacto,
      principal: true,
      lead_origen: lead.id
    };

    const newOppId = generateId('opp');
    const nuevaOportunidad = {
      id: newOppId,
      empresa_id: empresa.id,
      cuenta_id: cuentaId,
      contacto_id: contactoId,
      nombre: datosConversion.nombre_oportunidad,
      servicio_interes: lead.necesidad,
      etapa: datosConversion.etapa_inicial || 'calificacion',
      monto_estimado: datosConversion.monto_estimado || lead.presupuesto_estimado,
      moneda: datosConversion.moneda || lead.moneda || 'PEN',
      probabilidad: 30,
      forecast_ponderado: (datosConversion.monto_estimado || lead.presupuesto_estimado) * 0.3,
      fecha_cierre_estimada: null,
      fuente: lead.fuente,
      campana_id: lead.campana_id || null,
      responsable: lead.responsable,
      responsable_id: lead?.['responsable_id'] || null,
      competidor: null,
      estado: 'abierta',
      lead_origen: lead.id,
      notas: lead.necesidad,
      fecha_creacion: new Date().toISOString().split('T')[0]
    };

    if (nuevaCuenta) setCuentas(prev => [...prev, nuevaCuenta]);
    if (nuevoContacto) setContactos(prev => [...prev, nuevoContacto]);
    setOportunidades(prev => [...prev, nuevaOportunidad]);
    const montoFinal = datosConversion.monto_estimado || lead.presupuesto_estimado;
    const monedaFinal = datosConversion.moneda || lead.moneda || 'PEN';

    setLeads(prev => prev.map(l => l.id === leadId ? {
      ...l, estado: 'convertido', convertido: true,
      presupuesto_estimado: montoFinal,
      moneda: monedaFinal
    } : l));

    crmSync(async sb => {
      const { data: lr } = await sb.from('leads').select('campana_id').eq('id', leadId).single();
      const campanaIdFinal = lr?.campana_id ?? (lead.campana_id || null);
      if (nuevaCuenta) await persistirCuenta(sb, empresa.id, nuevaCuenta);
      if (nuevoContacto) await persistirContacto(sb, empresa.id, nuevoContacto);
      await persistirOportunidad(sb, empresa.id, { ...nuevaOportunidad, campana_id: campanaIdFinal });
      await actualizarLead(sb, leadId, { estado: 'convertido', convertido: true, cuenta_id: cuentaId, presupuesto_estimado: montoFinal, moneda: monedaFinal });
    });
    auditSync({
      modulo: 'crm',
      entidad: 'leads',
      entidad_id: leadId,
      accion: 'convertir',
      valor_anterior: lead,
      valor_nuevo: { cuenta: nuevaCuenta ?? cuentaExistente, contacto: nuevoContacto ?? contactoExistente, oportunidad: nuevaOportunidad }
    });

    addNotificacion(`Lead convertido a oportunidad: ${nuevaOportunidad.nombre}`);
    navigate('pipeline', { panel: newOppId });
  };

  const descartarLead = (leadId, motivo) => {
    const anterior = leads.find(l => l.id === leadId) || null;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: 'descartado', motivo_descarte: motivo } : l));
    crmSync(sb => actualizarLead(sb, leadId, { estado: 'descartado', motivo_descarte: motivo }));
    auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: leadId, accion: 'descartar', valor_anterior: anterior, valor_nuevo: { motivo } });
    if (anterior) pushHistorial(leadId, anterior.estado, 'descartado', motivo);
  };

  const reactivarLead = (leadId, motivo) => {
    const anterior = leads.find(l => l.id === leadId) || null;
    const ahora = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId ? {
      ...l,
      estado: 'en_contacto',
      motivo_descarte: null,
      reactivado_en: ahora,
      reactivado_por: authUser?.id,
      veces_reactivado: (l.veces_reactivado || 0) + 1
    } : l));
    // El trigger DB gestiona reactivado_* — solo enviamos el cambio de estado
    crmSync(sb => actualizarLead(sb, leadId, { estado: 'en_contacto', motivo_descarte: null }));
    pushHistorial(leadId, 'descartado', 'en_contacto', motivo);
    auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: leadId, accion: 'reactivar', valor_anterior: anterior, valor_nuevo: { motivo } });
  };

  const crearOportunidad = (datos) => {
    const opp = {
      id: generateId('opp'),
      empresa_id: empresa.id,
      estado: 'abierta',
      fecha_creacion: new Date().toISOString().split('T')[0],
      probabilidad: 30,
      forecast_ponderado: (datos.monto_estimado || 0) * 0.3,
      ...datos
    };
    setOportunidades(prev => [...prev, opp]);
    crmSync(sb => persistirOportunidad(sb, empresa.id, opp));
    auditSync({ modulo: 'crm', entidad: 'oportunidades', entidad_id: opp.id, accion: 'crear', valor_nuevo: opp });
  };

  const actualizarEtapaOportunidad = (oppId, nuevaEtapa) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (nuevaEtapa === 'propuesta') {
      const tieneCotEnviada = cotizaciones.some(
        c => c.oportunidad_id === oppId && ['enviada', 'aprobada', 'ganada', 'convertida'].includes(c.estado)
      );
      if (!tieneCotEnviada) {
        addNotificacion('Para pasar a Propuesta debes tener al menos una cotización enviada al cliente.');
        return false;
      }
    }
    if (opp && opp.etapa !== nuevaEtapa) {
      const ev = {
        id: generateId('ohe'),
        empresa_id: empresa?.id,
        opp_id: oppId,
        cuenta_id: opp.cuenta_id || null,
        etapa_desde: opp.etapa,
        etapa_hasta: nuevaEtapa,
        usuario: opp.responsable || null,
        creado_en: new Date().toISOString(),
        fecha: new Date().toISOString().split('T')[0],
      };
      setOppHistorialEtapas(prev => [ev, ...prev]);
      if (isSupabaseConfigured() && empresa?.id) {
        getSupabaseClient().then(sb => sb.from('opp_historial_etapas').insert({
          id: ev.id, empresa_id: ev.empresa_id, opp_id: ev.opp_id,
          cuenta_id: ev.cuenta_id, etapa_desde: ev.etapa_desde,
          etapa_hasta: ev.etapa_hasta, usuario: ev.usuario, creado_en: ev.creado_en,
        })).catch(() => {});
      }
    }
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, etapa: nuevaEtapa, moved_at: Date.now() } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, { etapa: nuevaEtapa }));
  };

  const marcarGanada = (oppId, datos) => {
    const anterior = oportunidades.find(o => o.id === oppId) || null;
    setOportunidades(prev => prev.map(o => o.id === oppId ? {
      ...o,
      estado: 'ganada',
      etapa: 'ganada',
      probabilidad: 100,
      ...(datos.monto_estimado !== undefined ? { monto_estimado: datos.monto_estimado } : {}),
      ...(datos.moneda ? { moneda: datos.moneda } : {}),
      fecha_cierre_real: datos.fecha_cierre_real || new Date().toISOString().split('T')[0],
      notas: datos.notas || o.notas
    } : o));
    const patch = {
      estado: 'ganada',
      etapa: 'ganada',
      probabilidad: 100,
      ...(datos.monto_estimado !== undefined ? { monto_estimado: datos.monto_estimado } : {}),
      ...(datos.moneda ? { moneda: datos.moneda } : {}),
      fecha_cierre_real: datos.fecha_cierre_real || new Date().toISOString().split('T')[0],
      notas: datos.notas
    };
    crmSync(sb => actualizarOportunidad(sb, oppId, patch));
    auditSync({ modulo: 'crm', entidad: 'oportunidades', entidad_id: oppId, accion: 'ganar', valor_anterior: anterior, valor_nuevo: datos });

    addNotificacion(`Oportunidad ganada. Revisar datos para OS.`);

    if (datos.crear_osc && datos.cotizacion_id) {
      crearOSCliente(datos.cotizacion_id, datos);
    }
  };

  const marcarGanadaPorCotizacion = (cot, datos = {}) => {
    if (!cot?.oportunidad_id) return;
    const montoAprobado = cot.total_impl ?? cot.total ?? cot.subtotal ?? 0;
    marcarGanada(cot.oportunidad_id, {
      cotizacion_id: cot.id,
      fecha_cierre_real: datos.fecha_cierre_real || datos.aprobacion_fecha_cliente || new Date().toISOString().split('T')[0],
      monto_estimado: montoAprobado,
      moneda: cot.moneda || 'PEN',
      notas: datos.notas,
      origen_aprobacion: datos.origen_aprobacion || 'cotizacion',
      canal_aprobacion: datos.canal_aprobacion || null,
    });
  };

  const marcarPerdida = (oppId, motivo) => {
    const anterior = oportunidades.find(o => o.id === oppId) || null;
    setOportunidades(prev => prev.map(o => o.id === oppId ? {
      ...o,
      estado: 'perdida',
      etapa: 'perdida',
      probabilidad: 0,
      motivo_perdida: motivo
    } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, { estado: 'perdida', etapa: 'perdida', probabilidad: 0, motivo_perdida: motivo }));
    auditSync({ modulo: 'crm', entidad: 'oportunidades', entidad_id: oppId, accion: 'perder', valor_anterior: anterior, valor_nuevo: { motivo } });
  };

  // ─── Acuerdo de comisión por oportunidad ─────────────────────────────────
  const _acuerdoPatch = (opp, extra) => {
    const patch = { ...extra };
    setOportunidades(prev => prev.map(o => o.id === opp.id ? { ...o, ...patch } : o));
    crmSync(sb => actualizarOportunidad(sb, opp.id, patch));
  };

  // Usuarios con permiso de aprobar (gerentes/admins) dentro de la empresa
  const _getGerentes = () => usuarios.filter(u => {
    if (u.empresa_id && empresa?.id && u.empresa_id !== empresa.id) return false;
    const rolUsuario = rolesCtx?.[u.rol_id] || rolesCtx?.[u.rol] || null;
    return rolUsuario?.es_admin_empresa || rolUsuario?.es_superadmin ||
      u.es_admin_empresa || u.permisos?.aprobar_descuentos || u.permisos?.ver_costos;
  });

  const _notificarSistema = async (destinatarios, texto) => {
    addNotificacion(texto);
    if (!isSupabaseConfigured() || !empresa?.id || !destinatarios.length) return;
    const sb = await getSupabaseClient();
    const rows = destinatarios
      .filter(u => u.auth_user_id)
      .map(u => ({ empresa_id: empresa.id, user_id: u.auth_user_id, texto }));
    if (rows.length) insertarNotificacionesSistema(sb, rows).catch(() => {});
  };

  const _registrarHistorialAcuerdo = async (opp, accion, extra = {}) => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    const fila = {
      empresa_id: empresa.id,
      oportunidad_id: opp.id,
      accion,
      actor_nombre: authUser?.user_metadata?.nombre || authUser?.email || null,
      actor_id: authUser?.id || null,
      acuerdo_pct: extra.pct ?? opp.acuerdo_pct ?? null,
      acuerdo_bonificacion: extra.bonificacion ?? opp.acuerdo_bonificacion ?? 0,
      justificacion: extra.justificacion ?? opp.acuerdo_justificacion ?? null,
      motivo: extra.motivo ?? null,
    };
    getSupabaseClient().then(sb => insertarHistorialAcuerdo(sb, fila)).catch(() => {});
  };

  const actualizarAcuerdoComision = async (oppId, campos) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp || opp.acuerdo_estado === 'aprobado') return;
    const nuevoEstado = campos.acuerdo_estado ?? (opp.acuerdo_estado === 'pendiente' ? 'pendiente' : 'borrador');
    const patch = { ...campos, acuerdo_estado: nuevoEstado };
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, ...patch } : o));
    _registrarHistorialAcuerdo(opp, 'propuesta', { pct: campos.acuerdo_pct, bonificacion: campos.acuerdo_bonificacion, justificacion: campos.acuerdo_justificacion });
    try {
      await crmPersist(sb => actualizarOportunidad(sb, oppId, patch));
      addNotificacion('Borrador guardado.');
    } catch (err) {
      addNotificacion(`Error al guardar borrador: ${err?.message || 'Error desconocido.'}`);
    }
  };

  const enviarAcuerdoAAprobacion = async (oppId) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp || ['ganada', 'perdida'].includes(opp.etapa)) return;
    if (!['borrador', 'rechazado'].includes(opp.acuerdo_estado ?? 'borrador')) return;
    const pct = opp.acuerdo_pct ?? 0;
    const bon = opp.acuerdo_bonificacion ?? 0;
    const moneda = opp.moneda === 'USD' ? 'US$' : 'S/';
    const texto = `${opp.responsable || 'Vendedor'} propone acuerdo de comisión especial para "${opp.nombre}". % propuesto: ${pct}%. Bonificación: ${moneda} ${Number(bon).toFixed(2)}. Requiere aprobación.`;
    _acuerdoPatch(opp, { acuerdo_estado: 'pendiente', acuerdo_motivo_rechazo: null });
    _registrarHistorialAcuerdo(opp, 'envio');
    await _notificarSistema(_getGerentes(), texto);
  };

  const retirarAcuerdoComision = (oppId) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp || opp.acuerdo_estado !== 'pendiente') return;
    _acuerdoPatch(opp, { acuerdo_estado: 'borrador' });
    _registrarHistorialAcuerdo(opp, 'retiro');
  };

  const aprobarAcuerdoComision = async (oppId, ajustes = {}) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp || opp.acuerdo_estado !== 'pendiente') return;
    const aprobadoPor = authUser?.user_metadata?.nombre || authUser?.email || 'Gerente';
    const pctFinal = ajustes.acuerdo_pct !== undefined ? ajustes.acuerdo_pct : opp.acuerdo_pct;
    const bonFinal = ajustes.acuerdo_bonificacion !== undefined ? ajustes.acuerdo_bonificacion : opp.acuerdo_bonificacion;
    const patch = {
      acuerdo_estado: 'aprobado',
      acuerdo_aprobado_por: aprobadoPor,
      acuerdo_aprobado_id: authUser?.id || null,
      acuerdo_fecha_aprobacion: new Date().toISOString(),
      acuerdo_motivo_rechazo: null,
      ...(ajustes.acuerdo_pct !== undefined ? { acuerdo_pct: pctFinal } : {}),
      ...(ajustes.acuerdo_bonificacion !== undefined ? { acuerdo_bonificacion: bonFinal } : {}),
    };
    _acuerdoPatch(opp, patch);
    const huboAjuste = ajustes.acuerdo_pct !== undefined || ajustes.acuerdo_bonificacion !== undefined;
    _registrarHistorialAcuerdo(opp, huboAjuste ? 'ajuste_gerente' : 'aprobacion', { pct: pctFinal, bonificacion: bonFinal });
    const vendedor = usuarios.find(u => u.id === opp.responsable_id || u.auth_user_id === opp.responsable_id || u.nombre === opp.responsable);
    const textoVend = huboAjuste
      ? `Tu acuerdo de comisión para "${opp.nombre}" fue aprobado por ${aprobadoPor} con ajustes: ${pctFinal}% · S/ ${Number(bonFinal||0).toFixed(2)} bonificación.`
      : `Tu acuerdo de comisión para "${opp.nombre}" fue aprobado por ${aprobadoPor}.`;
    await _notificarSistema(vendedor ? [vendedor] : [], textoVend);
    addNotificacion(`Acuerdo aprobado para "${opp.nombre}".`);
  };

  const rechazarAcuerdoComision = async (oppId, motivo) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp || opp.acuerdo_estado !== 'pendiente') return;
    const rechazadoPor = authUser?.user_metadata?.nombre || authUser?.email || 'Gerente';
    _acuerdoPatch(opp, { acuerdo_estado: 'rechazado', acuerdo_motivo_rechazo: motivo });
    _registrarHistorialAcuerdo(opp, 'rechazo', { motivo });
    const vendedor = usuarios.find(u => u.id === opp.responsable_id || u.auth_user_id === opp.responsable_id || u.nombre === opp.responsable);
    const textoVend = `Tu acuerdo de comisión para "${opp.nombre}" fue rechazado por ${rechazadoPor}. Motivo: ${motivo}`;
    await _notificarSistema(vendedor ? [vendedor] : [], textoVend);
    addNotificacion(`Acuerdo rechazado para "${opp.nombre}".`);
  };

  const obtenerHistorialAcuerdo = async (oppId) => {
    if (!isSupabaseConfigured()) return [];
    const sb = await getSupabaseClient();
    return cargarHistorialAcuerdo(sb, oppId);
  };
  // ─────────────────────────────────────────────────────────────────────────

  const calcularHojaCosteo = (base) => {
    const calcTotales = (items) => (items || []).reduce((s, i) => s + (Number(i.cantidad) * Number(i.costo_unitario)), 0);
    const mo = calcTotales(base.mano_obra);
    const mat = calcTotales(base.materiales);
    const st = calcTotales(base.servicios_terceros);
    const log = calcTotales(base.logistica);
    const costo = mo + mat + st + log;
    const margen = Number(base.margen_objetivo_pct || 35);
    const sinIgv = margen < 100 ? costo / (1 - margen / 100) : costo;
    return {
      ...base,
      total_mano_obra: mo,
      total_materiales: mat,
      total_servicios_terceros: st,
      total_logistica: log,
      costo_total: costo,
      precio_sugerido_sin_igv: Math.round(sinIgv),
      precio_sugerido_total: Math.round(sinIgv * 1.18)
    };
  };

  const construirItemsCotizacionDesdeHC = (hc) => {
    const margen = Math.min(Math.max(Number(hc.margen_objetivo_pct || 35), 0), 95) / 100;
    const divisor = 1 - margen;
    const secciones = [
      ...(hc.mano_obra || []).map(i => ({ ...i, tipo: 'mano_obra' })),
      ...(hc.materiales || []).map(i => ({ ...i, tipo: 'material' })),
      ...(hc.servicios_terceros || []).map(i => ({ ...i, tipo: 'servicio_tercero' })),
      ...(hc.logistica || []).map(i => ({ ...i, tipo: 'logistica' }))
    ];
    return secciones.map((i, index) => {
      const cantidad = Number(i.cantidad || 0);
      const costoUnitario = Number(i.costo_unitario ?? i.precio_unitario ?? 0);
      const precioUnitario = divisor > 0 ? Math.round(costoUnitario / divisor) : costoUnitario;
      return {
        id: i.id || index + 1,
        descripcion: i.descripcion || 'Partida de costeo',
        tipo: i.tipo === 'material' ? 'material' : 'servicio',
        cantidad,
        unidad: i.unidad || 'und',
        precio_unitario: precioUnitario,
        subtotal: cantidad * precioUnitario
      };
    });
  };

  const crearHojaCosteo = async (datos) => {
    const hc = {
      id: generateId('hc'),
      empresa_id: empresa.id,
      numero: `HC-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
      version: 1,
      historial_versiones: [],
      estado: 'borrador',
      fecha: new Date().toISOString().split('T')[0],
      mano_obra: [], materiales: [], servicios_terceros: [], logistica: [],
      margen_objetivo_pct: 35,
      ...datos,
      cuenta_id: datos.cuenta_id || oportunidades.find(o => o.id === datos.oportunidad_id)?.cuenta_id || null,
      moneda: datos.moneda || oportunidades.find(o => o.id === datos.oportunidad_id)?.moneda || 'PEN',
      cotizacion_id: null
    };
    const calculada = calcularHojaCosteo(hc);
    try {
      if (isSupabaseConfigured()) {
        const result = await crmPersist(sb => crearHojaCosteoRpc(sb, empresa.id, calculada));
        if (result?.data) Object.assign(calculada, result.data);
        if (calculada.moneda && calculada.moneda !== 'PEN') {
          crmSync(sb => actualizarHojaCosteoSvc(sb, calculada.id, { moneda: calculada.moneda }));
        }
      } else {
        await crmPersist(sb => persistirHojaCosteo(sb, empresa.id, calculada));
      }
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la Hoja de Costeo en Supabase.';
      addNotificacion(`No se creo la Hoja de Costeo: ${message}`);
      throw error;
    }
    setHojasCosteo(prev => [...prev, calculada]);
    auditSync({ modulo: 'comercial', entidad: 'hojas_costeo', entidad_id: calculada.id, accion: 'crear', valor_nuevo: calculada });
    addNotificacion(`Hoja de Costeo ${calculada.numero} creada.`);
    return calculada.id;
  };

  const actualizarHojaCosteo = (hcId, datos) => {
    const actual = hojasCosteo.find(h => h.id === hcId);
    if (actual?.estado === 'aprobada') {
      addNotificacion('La Hoja de Costeo aprobada no se puede editar. Crea una nueva version desde una cotizacion futura.');
      return;
    }
    const { __incrementVersion, ...limpio } = datos;
    const historial = actual?.historial_versiones || [];
    const versionActual = Number(actual?.version || 1);
    const base = actual && __incrementVersion
      ? {
          ...actual,
          version: versionActual + 1,
          historial_versiones: [
            ...historial,
            {
              version: versionActual,
              fecha: new Date().toISOString(),
              estado: actual.estado,
              costo_total: actual.costo_total || 0,
              precio_sugerido_total: actual.precio_sugerido_total || 0,
              margen_objetivo_pct: actual.margen_objetivo_pct || 35,
            }
          ],
        }
      : actual;
    const payload = base ? calcularHojaCosteo({ ...base, ...limpio }) : limpio;
    setHojasCosteo(prev => prev.map(h => h.id === hcId ? { ...h, ...payload } : h));
    crmSync(sb => actualizarHojaCosteoSvc(sb, hcId, payload));
    auditSync({ modulo: 'comercial', entidad: 'hojas_costeo', entidad_id: hcId, accion: 'editar', valor_anterior: actual || null, valor_nuevo: payload });
    if (__incrementVersion) addNotificacion(`Hoja de Costeo guardada como version v${payload.version}.`);
  };

  const aprobarHojaCosteo = async (hcId) => {
    const hc = hojasCosteo.find(h => h.id === hcId);
    if (!hc) return;
    const oppDeHC = oportunidades.find(o => o.id === hc.oportunidad_id);
    const monedaHC = oppDeHC?.moneda || hc.moneda || empresa?.moneda || 'PEN';
    if (isSupabaseConfigured()) {
      const serieDocHC = (seriesDocumentarias || []).find(s => s.documento === 'Cotizaciones' && s.estado === 'activo');
      const numeroCotHC = serieDocHC
        ? `${serieDocHC.serie}-${Number(serieDocHC.siguiente_correlativo).toString().padStart(4, '0')}`
        : `COT-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
      const cotBase = {
        id: generateId('cot'),
        oportunidad_id: hc.oportunidad_id,
        cuenta_id: hc.cuenta_id,
        numero: numeroCotHC,
        version: 1,
        estado: 'borrador',
        fecha: new Date().toISOString().split('T')[0],
        moneda: monedaHC,
        validez: '30 dias',
        subtotal: hc.precio_sugerido_sin_igv,
        base_imponible: hc.precio_sugerido_sin_igv,
        igv: Math.round(hc.precio_sugerido_sin_igv * 0.18),
        total: hc.precio_sugerido_total,
        items: construirItemsCotizacionDesdeHC(hc),
        hoja_costeo_id: hcId
      };
      try {
        const result = await crmPersist(sb => aprobarHojaCosteoRpc(sb, empresa.id, hcId, cotBase));
        const cotFinal = { ...cotBase, ...(result?.data?.cotizacion || {}), items: cotBase.items };
        const hcFinal = result?.data?.hoja_costeo || { ...hc, estado: 'aprobada', cotizacion_id: cotFinal.id };
        crmSync(sb => svcActualizarCotizacion(sb, cotFinal.id, {
          items: cotFinal.items,
          moneda: cotFinal.moneda,
          subtotal: cotFinal.subtotal,
          base_imponible: cotFinal.base_imponible,
          igv_pct: 18,
          igv: cotFinal.igv,
          total: cotFinal.total,
          subtotal_impl: cotFinal.subtotal,
          igv_impl: cotFinal.igv,
          total_impl: cotFinal.total,
        }));
        setCotizaciones(prev => prev.some(c => c.id === cotFinal.id)
          ? prev.map(c => c.id === cotFinal.id ? { ...c, ...cotFinal } : c)
          : [...prev, cotFinal]
        );
        setHojasCosteo(prev => prev.map(h => h.id === hcId ? { ...h, ...hcFinal } : h));
        if (serieDocHC) {
          const nextCorr = Number(serieDocHC.siguiente_correlativo) + 1;
          setSeriesDocumentarias(prev => prev.map(s => s.id === serieDocHC.id ? { ...s, siguiente_correlativo: nextCorr } : s));
          getSupabaseClient().then(sb =>
            sb.from('series_documentarias').update({ siguiente_correlativo: nextCorr }).eq('id', serieDocHC.id)
              .then(({ error }) => { if (error) console.error('[series] increment failed:', error); })
          );
        }
        auditSync({ modulo: 'comercial', entidad: 'hojas_costeo', entidad_id: hcId, accion: 'aprobar', valor_anterior: hc, valor_nuevo: { estado: 'aprobada', cotizacion_id: cotFinal.id } });
        addNotificacion('HC aprobada. Cotización borrador generada.');
        navigate('cotizaciones', { detail: cotFinal.id });
        return;
      } catch (error) {
        const message = error?.message || 'No se pudo aprobar la Hoja de Costeo en Supabase.';
        addNotificacion(`No se aprobo la HC: ${message}`);
        throw error;
      }
    }

    const itemsCot = construirItemsCotizacionDesdeHC(hc);
    const cotId = await crearCotizacion({
      oportunidad_id: hc.oportunidad_id,
      cuenta_id: hc.cuenta_id,
      moneda: monedaHC,
      validez: '30 días',
      subtotal: hc.precio_sugerido_sin_igv,
      base_imponible: hc.precio_sugerido_sin_igv,
      igv_pct: 18,
      igv: Math.round(hc.precio_sugerido_sin_igv * 0.18),
      total: hc.precio_sugerido_total,
      subtotal_impl: hc.precio_sugerido_sin_igv,
      igv_impl: Math.round(hc.precio_sugerido_sin_igv * 0.18),
      total_impl: hc.precio_sugerido_total,
      items: itemsCot,
      hoja_costeo_id: hcId
    });
    try {
      await crmPersist(sb => actualizarHojaCosteoSvc(sb, hcId, { estado: 'aprobada', cotizacion_id: cotId }));
    } catch (error) {
      const message = error?.message || 'No se pudo aprobar la Hoja de Costeo en Supabase.';
      addNotificacion(`No se aprobo la HC: ${message}`);
      throw error;
    }
    setHojasCosteo(prev => prev.map(h => h.id === hcId ? { ...h, estado: 'aprobada', cotizacion_id: cotId } : h));
    auditSync({ modulo: 'comercial', entidad: 'hojas_costeo', entidad_id: hcId, accion: 'aprobar', valor_anterior: hc, valor_nuevo: { estado: 'aprobada', cotizacion_id: cotId } });
    addNotificacion(`HC aprobada. Cotización borrador generada.`);
    navigate('cotizaciones', { detail: cotId });
  };

  const crearCotizacion = async (datos) => {
    // Generar número server-side cuando Supabase está disponible para evitar
    // duplicados cuando el estado local está desactualizado (ej. permisos RLS recién aplicados).
    let numeroCot;
    if (isSupabaseConfigured()) {
      const sb = await getSupabaseClient();
      const { data: numData, error: numErr } = await sb.rpc('siguiente_numero_cotizacion', { p_empresa_id: empresa.id });
      if (numErr) throw numErr;
      numeroCot = numData;
    } else {
      const serieDoc = (seriesDocumentarias || []).find(s => s.documento === 'Cotizaciones' && s.estado === 'activo');
      numeroCot = serieDoc
        ? `${serieDoc.serie}-${Number(serieDoc.siguiente_correlativo).toString().padStart(4, '0')}`
        : (() => {
            const year = new Date().getFullYear();
            const yearCots = cotizaciones.filter(c => c.numero?.startsWith(`COT-${year}`));
            const maxCorr = yearCots.length
              ? Math.max(...yearCots.map(c => parseInt(c.numero.split('-').pop()) || 0))
              : 0;
            return `COT-${year}-${(maxCorr + 1).toString().padStart(4, '0')}`;
          })();
    }
    const cot = {
      id: generateId('cot'),
      empresa_id: empresa.id,
      numero: numeroCot,
      version: 1,
      estado: 'borrador',
      fecha: new Date().toISOString().split('T')[0],
      subtotal: 0,
      descuento_global_pct: 0,
      descuento_global: 0,
      base_imponible: 0,
      igv_pct: 18,
      igv: 0,
      total: 0,
      historial_versiones: [],
      token_aceptacion: crypto.randomUUID(),
      token_activo: true,
      ...datos,
      cuenta_id: datos.cuenta_id || oportunidades.find(o => o.id === datos.oportunidad_id)?.cuenta_id || null,
      responsable_id: datos.responsable_id || oportunidades.find(o => o.id === datos.oportunidad_id)?.responsable_id || null,
      items: datos.items || datos.partidas || []
    };
    try {
      await crmPersist(sb => persistirCotizacion(sb, empresa.id, cot));
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la Cotizacion en Supabase.';
      addNotificacion(`No se creo la Cotizacion: ${message}`);
      throw error;
    }
    setCotizaciones(prev => [...prev, cot]);
    if (!isSupabaseConfigured()) {
      // En modo local incrementar el correlativo localmente (el RPC lo maneja en Supabase)
      const serieDocLocal = (seriesDocumentarias || []).find(s => s.documento === 'Cotizaciones' && s.estado === 'activo');
      if (serieDocLocal) {
        setSeriesDocumentarias(prev => prev.map(s =>
          s.id === serieDocLocal.id ? { ...s, siguiente_correlativo: Number(s.siguiente_correlativo) + 1 } : s
        ));
      }
    }
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cot.id, accion: 'crear', valor_nuevo: cot });
    addNotificacion(`Cotización ${cot.numero} generada con éxito.`);
    return cot.id;
  };
  
  const ETAPA_ORDER = ['calificacion', 'propuesta', 'negociacion', 'ganada'];
  const avanzarEtapaOpp = (oppId, targetEtapa) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp) return;
    const cur = ETAPA_ORDER.indexOf(opp.etapa);
    const tgt = ETAPA_ORDER.indexOf(targetEtapa);
    if (tgt <= cur) return;
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, etapa: targetEtapa, moved_at: Date.now() } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, { etapa: targetEtapa }));
  };

  const actualizarCotizacion = (cotId, datos) => {
    const anterior = cotizaciones.find(c => c.id === cotId) || null;
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, ...datos } : c));
    crmSync(sb => svcActualizarCotizacion(sb, cotId, datos));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
    if (datos.estado === 'enviada' && anterior?.oportunidad_id) {
      avanzarEtapaOpp(anterior.oportunidad_id, 'propuesta');
    }
    if (datos.subtotal !== undefined && anterior?.oportunidad_id) {
      const monedaCot = datos.moneda || anterior?.moneda || 'PEN';
      setOportunidades(prev => prev.map(o => o.id === anterior.oportunidad_id ? { ...o, monto_estimado: datos.subtotal, moneda: monedaCot } : o));
      crmSync(sb => actualizarOportunidad(sb, anterior.oportunidad_id, { monto_estimado: datos.subtotal, moneda: monedaCot }));
    }
  };

  const aprobarCotizacion = (cotId) => {
    const anterior = cotizaciones.find(c => c.id === cotId) || null;
    if (!anterior) return;
    const hoy = new Date().toISOString().split('T')[0];
    const datosAprobacion = {
      estado: 'aprobada',
      token_activo: false,
      aprobacion_tipo: 'digital',
      aprobacion_canal: 'link_publico',
      aprobacion_fecha_cliente: hoy,
      aprobacion_registrada_at: new Date().toISOString(),
    };
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, ...datosAprobacion } : c));
    crmSync(sb => svcActualizarCotizacion(sb, cotId, datosAprobacion));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'aprobar', valor_anterior: anterior, valor_nuevo: datosAprobacion });
    addNotificacion(`Cotización aprobada por el cliente.`);
    marcarGanadaPorCotizacion({ ...anterior, ...datosAprobacion }, {
      origen_aprobacion: 'digital',
      canal_aprobacion: 'link_publico',
      aprobacion_fecha_cliente: hoy,
    });
  };

  const aprobarCotizacionInterna = async (cotId) => {
    const u = (usuarios || []).find(u => u.id === authUser?.id);
    const nombreAprobador = u?.nombre || authUser?.user_metadata?.nombre || authUser?.email || 'Aprobador';
    const cotActual = cotizaciones.find(c => c.id === cotId);
    const patch = {
      aprobada_interna_por: nombreAprobador,
      aprobada_interna_at: new Date().toISOString(),
      // Si estaba pendiente_aprobacion, vuelve a borrador para que el asesor pueda enviar
      ...(cotActual?.estado === 'pendiente_aprobacion' ? { estado: 'borrador' } : {}),
    };
    if (isSupabaseConfigured()) {
      const sb = await getSupabaseClient();
      const { error } = await sb.from('cotizaciones').update(patch).eq('id', cotId);
      if (error) throw error;
    }
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, ...patch } : c));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'aprobar_interna', valor_nuevo: patch });
    addNotificacion(`Cotización aprobada para envío al cliente.`);
  };

  const registrarAprobacionManual = async (cotId, datos) => {
    const anterior = cotizaciones.find(c => c.id === cotId) || null;
    if (!anterior) throw new Error('Cotizacion no encontrada.');
    const archivos = Array.from(datos.archivos || []);
    if (!archivos.length) throw new Error('Adjunta al menos una evidencia de aprobacion del cliente.');

    const usuarioRegistro =
      usuarios.find(u => u.id === authUser?.id)?.nombre ||
      authUser?.user_metadata?.nombre ||
      authUser?.user_metadata?.full_name ||
      authUser?.email ||
      'Usuario ERP';

    let archivosAprobacion = archivos.map(f => ({
      nombre: f.name,
      tipo: f.type,
      tamanio: f.size,
      local: true,
    }));

    if (isSupabaseConfigured() && empresa?.id) {
      const sb = await getSupabaseClient();
      archivosAprobacion = [];
      for (const file of archivos) {
        archivosAprobacion.push(await subirArchivoSustento(sb, empresa.id, cotId, file));
      }
    }

    const fechaCliente = datos.fecha_cliente || new Date().toISOString().split('T')[0];
    const datosAprobacion = {
      estado: 'aprobada',
      token_activo: false,
      aprobacion_tipo: 'manual',
      aprobacion_canal: datos.canal,
      aprobacion_fecha_cliente: fechaCliente,
      aprobacion_notas: datos.notas || null,
      aprobacion_registrada_por: usuarioRegistro,
      aprobacion_registrada_at: new Date().toISOString(),
      aprobacion_archivos: archivosAprobacion,
    };

    if (isSupabaseConfigured() && empresa?.id) {
      await crmPersist(sb => svcActualizarCotizacion(sb, cotId, datosAprobacion));
    }

    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, ...datosAprobacion } : c));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'aprobar_manual', valor_anterior: anterior, valor_nuevo: datosAprobacion });
    addNotificacion(`Cotizacion aprobada manualmente con sustento.`);
    marcarGanadaPorCotizacion({ ...anterior, ...datosAprobacion }, {
      origen_aprobacion: 'manual',
      canal_aprobacion: datos.canal,
      aprobacion_fecha_cliente: fechaCliente,
      notas: datos.notas,
    });
  };

  const subirVersionCotizacion = async (cotId) => {
    const cotAnterior = cotizaciones.find(c => c.id === cotId);
    if (!cotAnterior) throw new Error('Cotización no encontrada');
    const nuevaVersion = (cotAnterior.version || 1) + 1;
    const nuevoId = generateId('cot');
    const historialEntry = {
      version: cotAnterior.version || 1,
      fecha: cotAnterior.fecha,
      total: cotAnterior.total,
      cotizacion_id: cotAnterior.id,
    };
    const nuevaCot = {
      ...cotAnterior,
      id: nuevoId,
      version: nuevaVersion,
      estado: 'borrador',
      fecha: new Date().toISOString().split('T')[0],
      historial_versiones: [...(cotAnterior.historial_versiones || []), historialEntry],
      token_aceptacion: crypto.randomUUID(),
      token_activo: true,
      aceptacion_nombre: null,
      aceptacion_dni: null,
      aceptacion_fecha: null,
      aceptacion_ip: null,
    };
    // Desactivar token de la versión anterior
    crmSync(sb => svcActualizarCotizacion(sb, cotId, { token_activo: false }));
    try {
      await crmPersist(sb => persistirCotizacion(sb, empresa.id, nuevaCot));
    } catch (error) {
      addNotificacion('Error al crear nueva versión: ' + (error?.message || error));
      throw error;
    }
    setCotizaciones(prev => [...prev, nuevaCot]);
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: nuevoId, accion: 'nueva_version', valor_anterior: { id: cotId, version: cotAnterior.version }, valor_nuevo: { id: nuevoId, version: nuevaVersion } });
    addNotificacion(`Nueva versión v${nuevaVersion} creada para ${cotAnterior.numero}.`);
    if (nuevaVersion >= 2 && cotAnterior.oportunidad_id) avanzarEtapaOpp(cotAnterior.oportunidad_id, 'negociacion');
    navigate('cotizaciones', { detail: nuevoId, edit: true });
    return nuevoId;
  };

  const crearOSCliente = async (cotId, datos) => {
    const cot = cotizaciones.find(c => c.id === cotId);
    if (!cot) return;

    const osc = {
      id: generateId('osc'),
      empresa_id: empresa.id,
      numero: `OSC-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      numero_doc_cliente: datos.numero_doc_cliente,
      cuenta_id: cot.cuenta_id,
      cotizacion_id: cotId,
      oportunidad_id: cot.oportunidad_id,
      monto_aprobado: cot.total,
      moneda: cot.moneda,
      condicion_pago: datos.condicion_pago || cot.condicion_pago,
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      sla: datos.sla,
      estado: 'en_ejecucion',
      centro_beneficio_id: datos.centro_beneficio_id || null,
      saldo_por_ejecutar: cot.total,
      saldo_por_valorizar: cot.total,
      saldo_por_facturar: cot.total,
      anticipo_recibido: 0,
      monto_facturado: 0,
      monto_cobrado: 0,
      ots_asociadas: []
    };

    try {
      await crmPersist(async sb => {
        const osResult = await persistirOSCliente(sb, empresa.id, osc);
        if (osResult?.error) throw osResult.error;
        const cotResult = await svcActualizarCotizacion(sb, cotId, { estado: 'convertida' });
        if (cotResult?.error) throw cotResult.error;
      });
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la OS Cliente en Supabase.';
      addNotificacion(`No se creo la OS Cliente: ${message}`);
      throw error;
    }
    setOsClientes(prev => [...prev, osc]);
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, estado: 'convertida' } : c));
    auditSync({ modulo: 'comercial', entidad: 'os_clientes', entidad_id: osc.id, accion: 'crear', valor_nuevo: osc });
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'convertir_os', valor_anterior: cot, valor_nuevo: { estado: 'convertida', os_cliente_id: osc.id } });
    addNotificacion(`Orden de Servicio ${osc.numero} registrada.`);
    navigate('os_cliente', { detail: osc.id });
  };

  const crearOSClienteManual = async (datos) => {
    const monto = Number(datos.monto_aprobado || 0);
    const osc = {
      id: generateId('osc'),
      empresa_id: empresa.id,
      numero: datos.numero || `OSC-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      cuenta_id: datos.cuenta_id || null,
      cotizacion_id: datos.cotizacion_id || null,
      oportunidad_id: datos.oportunidad_id || null,
      numero_doc_cliente: datos.numero_doc_cliente || null,
      monto_aprobado: monto,
      moneda: datos.moneda || empresa?.moneda || 'PEN',
      condicion_pago: datos.condicion_pago || null,
      fecha_emision: datos.fecha_emision || new Date().toISOString().split('T')[0],
      fecha_inicio: datos.fecha_inicio || null,
      fecha_fin: datos.fecha_fin || null,
      sla: datos.sla || null,
      estado: datos.estado || 'en_ejecucion',
      centro_beneficio_id: datos.centro_beneficio_id || null,
      saldo_por_ejecutar: datos.saldo_por_ejecutar ?? monto,
      saldo_por_valorizar: datos.saldo_por_valorizar ?? monto,
      saldo_por_facturar: datos.saldo_por_facturar ?? monto,
      anticipo_recibido: datos.anticipo_recibido || 0,
      monto_facturado: datos.monto_facturado || 0,
      monto_cobrado: datos.monto_cobrado || 0,
      ots_asociadas: datos.ots_asociadas || [],
    };

    try {
      await crmPersist(sb => persistirOSCliente(sb, empresa.id, osc));
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la OS Cliente en Supabase.';
      addNotificacion(`No se creo la OS Cliente: ${message}`);
      throw error;
    }
    setOsClientes(prev => [...prev, osc]);
    auditSync({ modulo: 'comercial', entidad: 'os_clientes', entidad_id: osc.id, accion: 'crear_manual', valor_nuevo: osc });
    addNotificacion(`Orden de Servicio ${osc.numero} registrada.`);
    navigate('os_cliente', { detail: osc.id });
    return osc.id;
  };

  const actualizarOSCliente = async (id, datos) => {
    setOsClientes(prev => prev.map(o => o.id === id ? { ...o, ...datos } : o));
    crmSync(sb => svcActualizarOSCliente(sb, id, datos));
  };

  const vincularCotizacionOS = async (cotizacionId, osId) => {
    setOsClientes(prev => prev.map(o => o.id === osId ? { ...o, cotizacion_id: cotizacionId } : o));
    crmSync(sb => svcActualizarOSCliente(sb, osId, { cotizacion_id: cotizacionId }));
    addNotificacion('Cotización vinculada a la OS.');
  };

  const registrarActividad = (datos) => {
    const act = {
      id: generateId('act'),
      empresa_id: empresa.id,
      estado: datos.resultado ? 'completada' : 'pendiente',
      ...datos
    };
    const leadId = act.lead_id || (act.vinculo_tipo === 'lead' ? act.vinculo_id : null);
    const nextActividades = [act, ...actividades];
    setActividades(prev => [act, ...prev]);
    if (leadId) {
      setLeads(prev => {
        const nextLeads = recalcularDiasSinActividadLeads(prev, nextActividades, agendaEventos);
        const leadActualizado = nextLeads.find(l => l.id === leadId);
        if (leadActualizado) {
          crmSync(sb => actualizarLead(sb, leadId, { dias_sin_actividad: leadActualizado.dias_sin_actividad }));
        }
        return nextLeads;
      });
    }
    crmSync(sb => persistirActividadComercial(sb, empresa.id, act));
    auditSync({ modulo: 'crm', entidad: 'actividades_comerciales', entidad_id: act.id, accion: 'crear', valor_nuevo: act });
  };

  const actualizarActividad = (id, datos) => {
    const anterior = actividades.find(a => a.id === id) || null;
    const leadId = datos.lead_id || anterior?.lead_id || (datos.vinculo_tipo === 'lead' ? datos.vinculo_id : null) || (anterior?.vinculo_tipo === 'lead' ? anterior.vinculo_id : null);
    const nextActividades = actividades.map(a => a.id === id ? { ...a, ...datos } : a);
    setActividades(nextActividades);
    if (leadId) {
      setLeads(prev => {
        const nextLeads = recalcularDiasSinActividadLeads(prev, nextActividades, agendaEventos);
        const leadActualizado = nextLeads.find(l => l.id === leadId);
        if (leadActualizado) {
          crmSync(sb => actualizarLead(sb, leadId, { dias_sin_actividad: leadActualizado.dias_sin_actividad }));
        }
        return nextLeads;
      });
    }
    crmSync(sb => actualizarActividadComercial(sb, id, datos));
    auditSync({ modulo: 'crm', entidad: 'actividades_comerciales', entidad_id: id, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
  };

  // Fase 2 Mutators
  const convertirBacklogAOT = (backlogId, datos = {}) => {
    const req = backlog.find(b => b.id === backlogId);
    if (!req) return;
    if (!datos.centro_costo_id) { addNotificacion('Selecciona un CECO antes de convertir a OT.'); return; }
    setBacklog(prev => prev.map(b => b.id === backlogId ? { ...b, estado: 'convertido' } : b));
    opsSync(sb => actualizarBacklog(sb, backlogId, { estado: 'convertido' }));
    crearOT({
      cliente: req.cuenta_id,
      cuenta_id: req.cuenta_id,
      descripcion: req.descripcion,
      tipo: datos.tipo || 'Correctiva',
      estado: 'programada',
      centro_costo_id: datos.centro_costo_id,
      costoEst: 0, costoReal: 0, avance: 0,
      backlog_id: backlogId,
    });
    addNotificacion('Requerimiento convertido a OT.');
  };
  const crearOT = (datos) => {
    const ot = {
      id: generateId('ot'),
      empresa_id: empresa.id,
      numero: `OT-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      estado: 'borrador',
      sla: 'ok',
      costoEst: 0, costoReal: 0, avance: 0,
      tareas: [],
      materiales_estimados: [],
      ...datos
    };
    setOts(prev => [...prev, ot]);
    opsSync(sb => persistirOT(sb, empresa.id, ot));
    auditSync({ modulo: 'operaciones', entidad: 'ordenes_trabajo', entidad_id: ot.id, accion: 'crear', valor_nuevo: ot });
    addNotificacion(`OT ${ot.numero} creada exitosamente.`);
    return ot.id;
  };

  const crearOTDesdeOS = async (osClienteId, datos) => {
    const os = osClientes.find(item => item.id === osClienteId);
    if (!os) return null;

    const montoPlanificado = Number(datos.costo_estimado || datos.costoEst || 0);

    // Heredar desglose de HC si la OS viene de una cotización con HC vinculada
    let hcDesglose = { est_mo: null, est_materiales: null, est_terceros: null, est_logistica: null };
    if (os.cotizacion_id) {
      const cot = cotizaciones.find(c => c.id === os.cotizacion_id);
      if (cot?.hoja_costeo_id) {
        const hc = hojasCosteo.find(h => h.id === cot.hoja_costeo_id);
        if (hc) {
          hcDesglose = {
            est_mo: hc.total_mano_obra || null,
            est_materiales: hc.total_materiales || null,
            est_terceros: hc.total_servicios_terceros || null,
            est_logistica: hc.total_logistica || null,
          };
        }
      }
    }

    const ot = {
      id: generateId('ot'),
      empresa_id: empresa.id,
      numero: `OT-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      sla: 'ok',
      tareas: [],
      materiales_estimados: [],
      os_cliente_id: os.id,
      cuenta_id: os.cuenta_id,
      cliente: os.cuenta_id,
      tipo: datos.servicio || 'Servicio cliente',
      descripcion: datos.descripcion || `Ejecucion de ${os.numero}`,
      estado: datos.estado || 'programada',
      fecha_inicio: datos.fecha_programada || os.fecha_inicio || null,
      fecha_programada: datos.fecha_programada || os.fecha_inicio || null,
      fecha_fin: datos.fecha_fin || os.fecha_fin || null,
      sede: datos.direccion_ejecucion || null,
      direccion_ejecucion: datos.direccion_ejecucion || null,
      responsable: datos.responsable || null,
      tecnico_responsable_id: datos.tecnico_responsable_id || null,
      centro_costo_id: datos.centro_costo_id || null,
      centro_beneficio_id: datos.centro_beneficio_id || os.centro_beneficio_id || null,
      costoEst: montoPlanificado,
      costoReal: 0,
      avance: 0,
      es_adicional: datos.es_adicional || false,
      est_mo: datos.est_mo ?? hcDesglose.est_mo,
      est_materiales: datos.est_materiales ?? hcDesglose.est_materiales,
      est_terceros: datos.est_terceros ?? hcDesglose.est_terceros,
      est_logistica: datos.est_logistica ?? hcDesglose.est_logistica,
    };

    try {
      if (isSupabaseConfigured()) {
        const result = await opsPersist(sb => crearOTDesdeOSRpc(sb, empresa.id, os.id, ot));
        const data = result?.data || {};
        Object.assign(ot, data.orden_trabajo || {});
      } else {
        await opsPersist(sb => persistirOT(sb, empresa.id, ot));
      }
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la OT en Supabase.';
      addNotificacion(`No se creo la OT: ${message}`);
      throw error;
    }

    setOts(prev => [...prev, ot]);
    setOsClientes(prev => prev.map(item => {
      if (item.id !== os.id) return item;
      const nuevasOTs = Array.from(new Set([...(item.ots_asociadas || []), ot.id]));
      const nuevoSaldo = Math.max(0, Number(item.saldo_por_ejecutar || 0) - montoPlanificado);
      if (!isSupabaseConfigured()) {
        crmSync(sb => svcActualizarOSCliente(sb, os.id, { ots_asociadas: nuevasOTs, saldo_por_ejecutar: nuevoSaldo }));
      }
      return { ...item, ots_asociadas: nuevasOTs, saldo_por_ejecutar: nuevoSaldo };
    }));
    auditSync({ modulo: 'operaciones', entidad: 'ordenes_trabajo', entidad_id: ot.id, accion: 'crear_desde_os', valor_nuevo: ot });
    addNotificacion(`OT ${ot.numero} creada exitosamente.`);
    return ot.id;
  };

  const actualizarOT = (otId, datos) => {
    const anterior = ots.find(o => o.id === otId) || null;
    setOts(prev => prev.map(o => o.id === otId ? { ...o, ...datos } : o));
    opsSync(sb => svcActualizarOT(sb, otId, datos));
    auditSync({ modulo: 'operaciones', entidad: 'ordenes_trabajo', entidad_id: otId, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
  };

  const eliminarOT = async (otId) => {
    const ot = ots.find(o => o.id === otId);
    if (isSupabaseConfigured()) {
      const result = await opsPersist(sb => svcEliminarOT(sb, otId));
      if (result?.error) { addNotificacion('No se pudo eliminar la OT.'); return; }
    }
    setOts(prev => prev.filter(o => o.id !== otId));
    if (ot?.os_cliente_id) {
      setOsClientes(prev => prev.map(os =>
        os.id === ot.os_cliente_id
          ? { ...os, ots_asociadas: (os.ots_asociadas || []).filter(id => id !== otId) }
          : os
      ));
    }
    addNotificacion('OT eliminada.');
  };

  const registrarParteDiario = async (datos) => {
    // Generar número de serie desde Supabase o fallback local
    let numero = null;
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        const sb = await getSupabaseClient();
        const { data: numData } = await sb.rpc('siguiente_numero_parte_diario', { p_empresa_id: empresa.id });
        if (numData) numero = numData;
      } catch { /* fallback a null, se muestra generado en UI */ }
    }
    if (!numero) {
      const anio = new Date().getFullYear();
      const serie = (seriesDocumentarias || []).find(s => s.documento === 'Partes Diarios' && s.estado === 'activo');
      numero = serie ? `${serie.serie}-${String(serie.siguiente_correlativo).padStart(4, '0')}` : null;
    }

    const p = {
      id: generateId('part'),
      empresa_id: empresa.id,
      estado: 'en_revision',
      ...(numero ? { numero } : {}),
      ...datos
    };
    setPartes(prev => [...prev, p]);
    opsSync(sb => persistirParteDiario(sb, empresa.id, p));
    auditSync({ modulo: 'operaciones', entidad: 'partes_diarios', entidad_id: p.id, accion: 'crear', valor_nuevo: p });
    const ot = ots.find(o => o.id === p.ot_id);
    if (ot && ['borrador', 'programada'].includes(ot.estado)) {
      setOts(prev => prev.map(o => o.id === p.ot_id ? { ...o, estado: 'ejecucion' } : o));
      opsSync(sb => svcActualizarOT(sb, p.ot_id, { estado: 'ejecucion' }));
    }
    addNotificacion(`Parte diario registrado y enviado a revisión.`);
  };

  const actualizarBorradorParteDiario = (parteId, datos) => {
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, ...datos } : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, {
      estado: datos.estado,
      tecnico_id: datos.tecnico_id,
      fecha: datos.fecha,
      horas_normales: datos.horas,
      actividad: datos.actividad,
      avance_pct: datos.avance_reportado,
      materiales: datos.materiales_usados || [],
      evidencias: datos.evidencias || [],
      datos_borrador: datos.estado === 'borrador' ? {
        tareas_trabajadas: datos.tareas_trabajadas || [],
        actividades_adicionales: datos.actividades_adicionales || [],
        avance_ajustado_manual: datos.avance_ajustado_manual || false,
        avance_global: datos.avance_global || datos.avance_reportado || 0,
        observaciones: datos.observaciones || '',
        es_restriccion: datos.es_restriccion || false,
      } : null,
    }));
  };

  const aprobarParteDiario = (parteId, avanceValidado = null, motivoAprobacion = '') => {
    const parte = partes.find(p => p.id === parteId);
    if (!parte) return;
    const avanceFinal = avanceValidado !== null ? Number(avanceValidado) : (parte.avance_reportado || 0);
    const parteAprobado = { ...parte, estado: 'aprobado', avance_validado: avanceFinal, motivo_aprobacion: motivoAprobacion || undefined };
    setPartes(prev => prev.map(p => p.id === parteId ? parteAprobado : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'aprobado', avance_pct: avanceFinal, aprobado_at: new Date().toISOString() }));
    auditSync({ modulo: 'operaciones', entidad: 'partes_diarios', entidad_id: parteId, accion: 'aprobar', valor_anterior: parte, valor_nuevo: { estado: 'aprobado', avance_validado: avanceFinal } });

    // Costo materiales
    let costoMateriales = 0;
    if (parte.materiales_usados) {
      parte.materiales_usados.forEach(mu => {
        const itemInv = inventario.find(i => i.sku === mu.sku);
        if (itemInv) costoMateriales += (mu.cantidad * itemInv.costo_promedio);
      });
    }

    // Costo mano de obra (horas × costo_hora del técnico)
    const tecnico = personalOperativo.find(p => p.id === parte.tecnico_id);
    const costoManoObra = (parte.horas || 0) * (tecnico?.costo_hora || 0);

    setOts(prev => prev.map(o => {
      if (o.id !== parte.ot_id) return o;

      // Partes aprobados incluyendo el recién aprobado
      const partesAprobadosOT = [...partes.filter(p => p.ot_id === o.id && p.id !== parteId && p.estado === 'aprobado'), parteAprobado];

      // Calcular avance según si la OT tiene tareas con peso
      const tareas = o.tareas || [];
      const tareasConPeso = tareas.filter(t => Number(t.peso) > 0);
      let nuevoAvance;
      if (tareasConPeso.length > 0) {
        let avancePonderado = 0;
        tareasConPeso.forEach(tarea => {
          let acumuladoTarea = 0;
          partesAprobadosOT.forEach(p => {
            const tt = (p.tareas_trabajadas || []).find(t => String(t.tarea_id) === String(tarea.id));
            if (tt) acumuladoTarea += Number(tt.avance_hoy) || 0;
          });
          avancePonderado += (Number(tarea.peso) / 100) * Math.min(100, acumuladoTarea);
        });
        nuevoAvance = Math.min(100, Math.round(avancePonderado));
      } else {
        nuevoAvance = Math.min(100, partesAprobadosOT.reduce((s, p) => s + (Number(p.avance_validado) || 0), 0));
      }

      const nuevosDatos = {
        avance: nuevoAvance,
        costoReal: (o.costoReal || 0) + costoMateriales + costoManoObra,
      };
      opsSync(sb => svcActualizarOT(sb, o.id, nuevosDatos));
      return { ...o, ...nuevosDatos };
    }));

    addNotificacion('Parte diario aprobado. Avance y costos actualizados.');
  };

  const observarParteDiario = (parteId, motivo = '') => {
    if (!motivo.trim()) return;
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, estado: 'observado', motivo_observacion: motivo } : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'observado' }));
    addNotificacion('Parte diario observado. El técnico puede corregirlo y reenviarlo.');
  };

  const rechazarParteDiario = (parteId, motivo = '') => {
    if (!motivo.trim()) return;
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, estado: 'rechazado', motivo_rechazo: motivo } : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'rechazado' }));
    addNotificacion('Parte diario rechazado.');
  };

  const cerrarTecnicamenteOT = async (otId, datosCierre) => {
    const { conformidad_archivo, ...restDatos } = datosCierre;
    const cierreId = generateId('cier');

    let tokenConformidad = null;
    let conformidadArchivoUrl = null;
    let conformidadArchivoNombre = null;

    if (restDatos.conformidad_cliente?.tipo === 'digital') {
      tokenConformidad = crypto.randomUUID();
    } else if (conformidad_archivo && restDatos.conformidad_cliente?.tipo === 'fisico') {
      try {
        const res = await opsPersist(sb => svcSubirConformidadOT(sb, empresa.id, cierreId, conformidad_archivo));
        if (res) { conformidadArchivoUrl = res.url; conformidadArchivoNombre = res.nombre; }
      } catch (_) {}
    }

    const anterior = ots.find(o => o.id === otId) || null;
    setOts(prev => prev.map(o => o.id === otId ? { ...o, estado: 'cerrada' } : o));
    opsSync(sb => svcActualizarOT(sb, otId, { estado: 'cerrada' }));

    const cierre = {
      id: cierreId,
      ot_id: otId,
      ...restDatos,
      token_conformidad: tokenConformidad,
      conformidad_archivo_url: conformidadArchivoUrl,
      conformidad_archivo_nombre: conformidadArchivoNombre,
    };

    setCierresTecnicos(prev => [...prev, { ...cierre, ot_id: otId, empresa_id: empresa.id }]);
    opsSync(sb => persistirCierreTecnico(sb, empresa.id, cierre));
    auditSync({ modulo: 'operaciones', entidad: 'ordenes_trabajo', entidad_id: otId, accion: 'cierre_tecnico', valor_anterior: anterior, valor_nuevo: cierre });
    return { cierreId, tokenConformidad };

    // Descontar inventario de los partes aprobados de esta OT
    const partesAprobados = partes.filter(p => p.ot_id === otId && p.estado === 'aprobado');
    const itemsADescontar = [];
    partesAprobados.forEach(p => {
      if (p.materiales_usados) {
        p.materiales_usados.forEach(mu => {
          const itemInv = inventario.find(i => i.sku === mu.sku);
          if (itemInv) {
            // Buscamos si ya esta en itemsADescontar
            const existente = itemsADescontar.find(i => i.material_id === itemInv.id);
            if (existente) {
              existente.cantidad += mu.cantidad;
            } else {
              itemsADescontar.push({ material_id: itemInv.id, cantidad: mu.cantidad, almacen_id: itemInv?.['almacen_id'] || null });
            }
          }
        });
      }
    });

    if (itemsADescontar.length > 0) {
      setInventario(prev => prev.map(i => {
        const desc = itemsADescontar.find(d => d.material_id === i.id);
        if (desc) {
          return { ...i, stock_actual: Math.max(0, i.stock_actual - desc.cantidad) };
        }
        return i;
      }));
      opsSync(sb => consumirInventario(sb, empresa.id, itemsADescontar, otId));
    }

    addNotificacion(`Cierre Técnico registrado para la OT. Inventario consumido.`);
  };

  const actualizarCierreTecnico = async (cierreId, datos) => {
    setCierresTecnicos(prev => prev.map(c => c.id === cierreId ? { ...c, ...datos } : c));
    await opsSync(sb => sb.from('cierres_tecnicos').update(datos).eq('id', cierreId));
  };

  const crearSOLPE = (datos) => {
    const slp = {
      id: generateId('slp'),
      empresa_id: empresa.id,
      numero: `SLP-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`,
      estado: 'solicitada',
      ...datos
    };
    setSolpes(prev => [...prev, slp]);
    auditSync({ modulo: 'compras', entidad: 'solpe_interna', entidad_id: slp.id, accion: 'crear', valor_nuevo: slp });
    addNotificacion(`SOLPE ${slp.numero} generada.`);
  };

  const generarValorizacion = (osClienteId, subtotal, igv, total, periodo, meta = {}) => {
    const estadoFinal = meta.estadoFinal || 'aprobada';
    const now = new Date().toISOString().split('T')[0];
    const val = {
      id: generateId('val'),
      empresa_id: empresa.id,
      os_cliente_id: osClienteId,
      numero: `VAL-${new Date().getFullYear()}-${String(valorizaciones.length + 1).padStart(3, '0')}`,
      fecha: now,
      estado: estadoFinal,
      periodo, subtotal, igv, total,
      moneda: meta.moneda || osClientes.find(os => os.id === osClienteId)?.moneda || 'PEN',
      modelo_calculo: meta.modelo_calculo || null,
      notas: meta.notas || null,
      ot_ids: meta.otIds || [],
      items: meta.items || [],
      fecha_aprobacion: estadoFinal === 'aprobada' ? now : null,
      historial: [{ accion: estadoFinal === 'borrador' ? 'guardado_borrador' : 'creado', estado: estadoFinal, fecha: now, usuario: authUser?.email || 'Sistema' }],
    };
    setValorizaciones(prev => [...prev, val]);
    auditSync({ modulo: 'operaciones', entidad: 'valorizaciones', entidad_id: val.id, accion: estadoFinal, valor_nuevo: val });

    if (estadoFinal === 'aprobada') {
      // Descontar de OS Cliente solo al aprobar
      let saldoPorValorizar = null;
      setOsClientes(prev => prev.map(osc => {
        if (osc.id === osClienteId) {
          saldoPorValorizar = Math.max(0, Number(osc.saldo_por_valorizar || 0) - Number(total || 0));
          return { ...osc, saldo_por_valorizar: saldoPorValorizar };
        }
        return osc;
      }));
      if (saldoPorValorizar !== null) {
        crmSync(sb => svcActualizarOSCliente(sb, osClienteId, { saldo_por_valorizar: saldoPorValorizar }));
      }

      if (meta.otIds?.length) {
        setOts(prev => prev.map(ot => meta.otIds.includes(ot.id) ? { ...ot, estado: 'valorizada' } : ot));
        meta.otIds.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'valorizada' })));
      }
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.crearValorizacion({
          id: val.id,
          empresa_id: val.empresa_id,
          os_cliente_id: val.os_cliente_id,
          numero: val.numero,
          fecha: val.fecha,
          periodo: val.periodo,
          subtotal: val.subtotal,
          igv: val.igv,
          total: val.total,
          moneda: val.moneda,
          estado: val.estado,
          modelo_calculo: val.modelo_calculo,
          notas: val.notas,
        });
      });
    }

    addNotificacion(`Valorización ${val.numero} ${estadoFinal === 'borrador' ? 'guardada como borrador' : 'aprobada'}.`);
  };

  const aprobarValorizacion = (valId) => {
    const val = valorizaciones.find(v => v.id === valId);
    if (!val || val.estado !== 'borrador') return;

    const total = Number(val.total || 0);
    const osClienteId = val.os_cliente_id;
    const now = new Date().toISOString().split('T')[0];
    const entrada = { accion: 'aprobado', estado: 'aprobada', fecha: now, usuario: authUser?.email || 'Sistema' };

    setValorizaciones(prev => prev.map(v => v.id === valId ? {
      ...v, estado: 'aprobada', fecha_aprobacion: now,
      historial: [...(v.historial || []), entrada],
    } : v));
    auditSync({ modulo: 'operaciones', entidad: 'valorizaciones', entidad_id: valId, accion: 'aprobar', valor_nuevo: { ...val, estado: 'aprobada' } });

    let saldoPorValorizar = null;
    setOsClientes(prev => prev.map(osc => {
      if (osc.id === osClienteId) {
        saldoPorValorizar = Math.max(0, Number(osc.saldo_por_valorizar || 0) - total);
        return { ...osc, saldo_por_valorizar: saldoPorValorizar };
      }
      return osc;
    }));
    if (saldoPorValorizar !== null) {
      crmSync(sb => svcActualizarOSCliente(sb, osClienteId, { saldo_por_valorizar: saldoPorValorizar }));
    }

    if (val.ot_ids?.length) {
      setOts(prev => prev.map(ot => val.ot_ids.includes(ot.id) ? { ...ot, estado: 'valorizada' } : ot));
      val.ot_ids.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'valorizada' })));
    }

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarValorizacion(valId, { estado: 'aprobada', fecha_aprobacion: now }));
    }

    addNotificacion(`Valorización ${val.numero} aprobada.`);
  };

  const anularValorizacion = (valId, motivo) => {
    const val = valorizaciones.find(v => v.id === valId);
    if (!val || val.estado === 'facturada') return;

    const fueAprobada = val.estado === 'aprobada';
    const total = Number(val.total || 0);
    const osClienteId = val.os_cliente_id;
    const now = new Date().toISOString().split('T')[0];
    const entrada = { accion: 'anulado', estado: 'anulada', motivo, fecha: now, usuario: authUser?.email || 'Sistema' };

    setValorizaciones(prev => prev.map(v => v.id === valId ? {
      ...v, estado: 'anulada', motivo_anulacion: motivo,
      historial: [...(v.historial || []), entrada],
    } : v));
    auditSync({ modulo: 'operaciones', entidad: 'valorizaciones', entidad_id: valId, accion: 'anular', valor_nuevo: { motivo } });

    if (fueAprobada) {
      let saldoRestaurado = null;
      setOsClientes(prev => prev.map(osc => {
        if (osc.id === osClienteId) {
          saldoRestaurado = Number(osc.saldo_por_valorizar || 0) + total;
          return { ...osc, saldo_por_valorizar: saldoRestaurado };
        }
        return osc;
      }));
      if (saldoRestaurado !== null) {
        crmSync(sb => svcActualizarOSCliente(sb, osClienteId, { saldo_por_valorizar: saldoRestaurado }));
      }
      if (val.ot_ids?.length) {
        setOts(prev => prev.map(ot => val.ot_ids.includes(ot.id) ? { ...ot, estado: 'cerrada' } : ot));
        val.ot_ids.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'cerrada' })));
      }
    }

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarValorizacion(valId, { estado: 'anulada', motivo_anulacion: motivo }));
    }

    addNotificacion(`Valorización ${val.numero} anulada.`);
  };

  const actualizarDatosValorizacion = (valId, datos) => {
    const val = valorizaciones.find(v => v.id === valId);
    if (!val || val.estado !== 'borrador') return;

    const estadoFinal = datos.estadoFinal || 'borrador';
    const now = new Date().toISOString().split('T')[0];
    const entrada = { accion: estadoFinal === 'aprobada' ? 'aprobado' : 'editado', estado: estadoFinal, fecha: now, usuario: authUser?.email || 'Sistema' };

    const updated = {
      ...val,
      subtotal: datos.subtotal, igv: datos.igv, total: datos.total,
      periodo: datos.periodo, modelo_calculo: datos.modelo_calculo,
      notas: datos.notas, items: datos.items || [], ot_ids: datos.ot_ids || [],
      estado: estadoFinal,
      ...(estadoFinal === 'aprobada' ? { fecha_aprobacion: now } : {}),
      historial: [...(val.historial || []), entrada],
    };

    setValorizaciones(prev => prev.map(v => v.id === valId ? updated : v));
    auditSync({ modulo: 'operaciones', entidad: 'valorizaciones', entidad_id: valId, accion: estadoFinal === 'aprobada' ? 'aprobar' : 'editar', valor_nuevo: updated });

    if (estadoFinal === 'aprobada') {
      let saldoPorValorizar = null;
      setOsClientes(prev => prev.map(osc => {
        if (osc.id === val.os_cliente_id) {
          saldoPorValorizar = Math.max(0, Number(osc.saldo_por_valorizar || 0) - Number(datos.total || 0));
          return { ...osc, saldo_por_valorizar: saldoPorValorizar };
        }
        return osc;
      }));
      if (saldoPorValorizar !== null) {
        crmSync(sb => svcActualizarOSCliente(sb, val.os_cliente_id, { saldo_por_valorizar: saldoPorValorizar }));
      }
      if (datos.ot_ids?.length) {
        setOts(prev => prev.map(ot => datos.ot_ids.includes(ot.id) ? { ...ot, estado: 'valorizada' } : ot));
        datos.ot_ids.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'valorizada' })));
      }
    }

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarValorizacion(valId, {
        subtotal: datos.subtotal, igv: datos.igv, total: datos.total,
        periodo: datos.periodo, modelo_calculo: datos.modelo_calculo,
        notas: datos.notas, estado: estadoFinal,
        ...(estadoFinal === 'aprobada' ? { fecha_aprobacion: now } : {}),
      }));
    }

    addNotificacion(`Valorización ${val.numero} ${estadoFinal === 'aprobada' ? 'aprobada' : 'actualizada'}.`);
  };

  const registrarUsuario = async (u) => {
    // Validar que tenga empresa_id
    if (!u.empresa_id && empresa?.id) u.empresa_id = empresa.id;
    
    if (!u.empresa_id) {
      addNotificacion('No se pudo crear el usuario: Falta ID de empresa', 'error');
      return;
    }

    setUsuarios(prev => {
      const exists = prev.find(x => x.id === u.id);
      if (exists) return prev.map(x => x.id === u.id ? u : x);
      return [...prev, u];
    });

    if (isSupabaseConfigured()) {
      try {
        console.log('>>> Persistiendo usuario en Supabase:', u);
        await usuariosService.registrarUsuario(u);
        addNotificacion(`Usuario ${u.nombre} guardado en la nube.`);
      } catch (err) {
        console.error('>>> Error crítico Supabase:', err);
        addNotificacion('Error de conexión: ' + (err.message || 'Error desconocido'), 'error');
      }
    } else {
      console.log('>>> Supabase no configurado, modo local');
      addNotificacion(`Usuario ${u.nombre} creado localmente (PRUEBA).`);
    }
  };

  const crearUsuarioConAcceso = async ({ nombre, email, password, rol, jefe_user_id = null, asignaciones = [], campo = false, campoModulos = [] }) => {
    if (!isSupabaseConfigured()) {
      addNotificacion('Se requiere Supabase para crear usuarios con acceso.', 'error');
      return;
    }
    try {
      const supabase = await getSupabaseClient();
      if (!empresa?.id) throw new Error('No hay tenant activo para crear el usuario.');

      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('La creacion del usuario esta tardando demasiado. Revisa la funcion crear-usuario-acceso en Supabase.')), 25000);
      });
      const { data, error } = await Promise.race([
        supabase.functions.invoke('crear-usuario-acceso', {
        body: {
          nombre,
          email,
          password,
          rol,
          jefe_user_id: jefe_user_id || null,
          asignaciones,
          empresa_id: empresa.id,
        },
        }),
        timeout,
      ]);

      if (error) {
        let message = error.message;
        try {
          const body = await error.context?.json?.();
          message = body?.error || message;
        } catch { /* la respuesta de la funcion no siempre trae JSON */ }
        throw new Error(message || 'No se pudo crear el usuario.');
      }
      if (!data?.success) throw new Error(data?.error || 'No se pudo crear el usuario.');

      let nuevoUsuario = data.user;
      const uid = nuevoUsuario.id;

      if (campo && campoModulos.length > 0) {
        try {
          const mods = [...new Set(campoModulos.filter(Boolean))];
          const perfilLegacy = ({ tecnico: 'Tecnico', vendedor: 'Vendedor', compras: 'Compras', supervisor: 'Supervisor', gerencia: 'Gerencia', asistencia: 'Asistencia', logistica: 'Logistica' }[mods[0]] || 'Tecnico');
          const saved = await usuariosService.actualizarUsuarioAcceso({
            user_id: uid,
            empresa_id: empresa.id,
            nombre,
            email,
            rol,
            jefe_user_id: jefe_user_id || null,
            asignaciones,
            acceso_campo: true,
            perfil_campo: perfilLegacy,
            campo_modulos: mods,
            estado: 'Activo',
          });
          nuevoUsuario = { ...nuevoUsuario, ...saved, campo: true, campoModulos: mods, campo_modulos: mods };
        } catch { /* si falla el campo, el usuario igual queda creado */ }
      }

      setUsuarios(prev => {
        const targetEmpresaId = nuevoUsuario.empresa_id || empresa.id;
        if (prev.find(u => u.id === uid && u.empresa_id === targetEmpresaId)) {
          return prev.map(u => (u.id === uid && u.empresa_id === targetEmpresaId) ? nuevoUsuario : u);
        }
        return [...prev, nuevoUsuario];
      });
      addNotificacion(
        data.alreadyExists
          ? `El usuario ${nombre} ya tenia cuenta. Se agrego al tenant actual y usara su contrasena actual.`
          : `Usuario ${nombre} creado. Ya puede ingresar con la contrasena temporal.`
      );
      return nuevoUsuario;
    } catch (err) {
      addNotificacion('Error al crear usuario: ' + (err.message || 'Error desconocido'), 'error');
      throw err;
    }
  };
  const eliminarUsuario = async (id, empresaIdOverride = null) => {
    const previous = usuarios;
    const empresaId = empresaIdOverride || empresa?.id;
    const usuarioEliminado = usuarios.find(u => u.id === id && (!empresaId || u.empresa_id === empresaId)) || usuarios.find(u => u.id === id);
    setUsuarios(prev => prev.filter(u => !(u.id === id && (!empresaId || u.empresa_id === empresaId))));
    if (isSupabaseConfigured()) {
      try {
        const supabase = await getSupabaseClient();
        if (!empresaId) throw new Error('No hay tenant activo para eliminar el usuario.');
        const { data, error } = await supabase.functions.invoke('eliminar-usuario-acceso', {
          body: { user_id: id, empresa_id: empresaId },
        });
        if (error) {
          let message = error.message;
          try {
            const body = await error.context?.json?.();
            message = body?.error || message;
          } catch { /* la respuesta de la funcion no siempre trae JSON */ }
          throw new Error(message || 'No se pudo eliminar el usuario.');
        }
        if (!data?.success) throw new Error(data?.error || 'No se pudo eliminar el usuario.');
        addNotificacion(`Usuario ${usuarioEliminado?.nombre || ''} eliminado del tenant.`);
      } catch (err) {
        setUsuarios(previous);
        addNotificacion('Error al eliminar en Supabase: ' + err.message, 'error');
      }
    }
  };

  const actualizarUsuarioAcceso = async (usuarioId, datos) => {
    const empresaId = datos?.empresa_id || empresa?.id;
    const previous = usuarios;
    const current = usuarios.find(u => u.id === usuarioId && (!empresaId || u.empresa_id === empresaId)) || usuarios.find(u => u.id === usuarioId);
    const normalizarCampoModulos = (mods, perfil) => {
      if (Array.isArray(mods) && mods.length) return [...new Set(mods.filter(Boolean))];
      const value = String(perfil || '').toLowerCase();
      if (value.includes('vendedor')) return ['vendedor'];
      if (value.includes('compra')) return ['compras'];
      if (value.includes('supervisor')) return ['supervisor'];
      if (value.includes('gerencia')) return ['gerencia'];
      return ['tecnico'];
    };
    const campoModulos = datos.campo ? normalizarCampoModulos(datos.campoModulos || datos.campo_modulos, datos.campoPerfil || datos.perfil_campo) : [];
    const campoPerfilLegacy = campoModulos[0]
      ? ({ tecnico: 'Tecnico', vendedor: 'Vendedor', compras: 'Compras', supervisor: 'Supervisor', gerencia: 'Gerencia', asistencia: 'Asistencia', logistica: 'Logistica' }[campoModulos[0]] || 'Tecnico')
      : null;
    const nextUser = {
      ...current,
      ...datos,
      id: usuarioId,
      empresa_id: empresaId,
      campo: Boolean(datos.campo),
      campoPerfil: datos.campo ? campoPerfilLegacy : null,
      campoModulos,
      campo_modulos: campoModulos,
    };

    setUsuarios(prev => prev.map(u => (
      u.id === usuarioId && (!empresaId || u.empresa_id === empresaId)
        ? nextUser
        : u
    )));

    if (!isSupabaseConfigured()) {
      addNotificacion(`Usuario ${nextUser.nombre || ''} actualizado localmente.`);
      return nextUser;
    }

    try {
      const savedUser = await usuariosService.actualizarUsuarioAcceso({
        user_id: usuarioId,
        empresa_id: empresaId,
        nombre: nextUser.nombre,
        email: nextUser.email,
        rol: nextUser.rol,
        jefe_user_id: nextUser.jefe_user_id || null,
        asignaciones: nextUser.asignaciones || [],
        acceso_campo: Boolean(nextUser.campo),
        perfil_campo: nextUser.campoPerfil,
        campo_modulos: campoModulos,
        estado: nextUser.estado || 'Activo',
      });
      const mergedSavedUser = {
        ...nextUser,
        ...savedUser,
        campo: savedUser.campo ?? nextUser.campo,
        campoPerfil: savedUser.campoPerfil ?? savedUser.campo_perfil ?? nextUser.campoPerfil,
        campoModulos: savedUser.campoModulos || savedUser.campo_modulos || campoModulos,
        campo_modulos: savedUser.campo_modulos || savedUser.campoModulos || campoModulos,
      };
      setUsuarios(prev => prev.map(u => (
        u.id === usuarioId && u.empresa_id === empresaId
          ? mergedSavedUser
          : u
      )));
      addNotificacion(`Usuario ${mergedSavedUser.nombre || nextUser.nombre || ''} actualizado.`);
      return mergedSavedUser;
    } catch (err) {
      setUsuarios(previous);
      addNotificacion('Error al actualizar usuario: ' + (err.message || 'Error desconocido'), 'error');
      throw err;
    }
  };

  const marcarContrasenaActualizada = async () => {
    if (!authUser?.id) return;
    try {
      const supabase = await getSupabaseClient();
      await supabase.from('usuarios').update({ must_change_password: false }).eq('id', authUser.id);
      setUsuarios(prev => prev.map(u => u.id === authUser.id ? { ...u, must_change_password: false } : u));
    } catch { /* silently ignore */ }
  };

  const pushHistorial = (leadId, estadoDesde, estadoHasta, motivo = null) => {
    const ev = {
      id: generateId('lhe'),
      lead_id: leadId,
      empresa_id: empresa?.id,
      estado_desde: estadoDesde,
      estado_hasta: estadoHasta,
      motivo,
      creado_por: authUser?.id,
      creado_en: new Date().toISOString(),
    };
    setHistorialEstados(prev => [ev, ...prev]);
    crmSync(sb => sb.from('lead_historial_estados').insert(ev));
  };

  const updateLeadState = (leadId, newState, motivo = null) => {
    const anterior = leads.find(l => l.id === leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: newState, moved_at: Date.now() } : l));
    crmSync(sb => actualizarLead(sb, leadId, { estado: newState }));
    if (anterior && anterior.estado !== newState) pushHistorial(leadId, anterior.estado, newState, motivo);
  };

  // ============================================================
  // FINANZAS — Mutaciones
  // ============================================================
  
  const emitirFactura = async (datos) => {
    const fac = {
      id: generateId('fac'),
      empresa_id: empresa.id,
      estado: 'emitida',
      ...datos
    };
    setFacturas(prev => [...prev, fac]);
    
    if (datos.valorizacion_id) {
      setValorizaciones(prev => prev.map(v => v.id === datos.valorizacion_id ? { ...v, estado: 'facturada' } : v));
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.emitirFactura(fac);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: fac.id, accion: 'emitir', valor_nuevo: fac });
    
    addNotificacion(`Factura ${fac.numero || 'emitida'} exitosamente.`);
    return fac.id;
  };

  const generarCxC = async (datos) => {
    const cuentaCobrar = {
      id: generateId('cxc'),
      empresa_id: empresa.id,
      estado: 'por_cobrar',
      monto_pagado: 0,
      saldo: datos.monto_total,
      ...datos
    };
    setCxc(prev => [...prev, cuentaCobrar]);

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.generarCxC(cuentaCobrar);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cuentaCobrar.id, accion: 'crear', valor_nuevo: cuentaCobrar });
    addNotificacion('Cuenta por Cobrar registrada.');
  };

  const emitirFacturaConCxC = async (datos) => {
    const fechaEmision = datos.fecha_emision || new Date().toISOString().split('T')[0];
    const condicionDias = { '0':0,'15':15,'30':30,'45':45,'60':60,'90':90 }[String(datos.condicion_pago||'30')] ?? 30;
    const fechaVencimiento = datos.fecha_vencimiento || (() => {
      const d = new Date(`${fechaEmision}T00:00:00`);
      d.setDate(d.getDate() + condicionDias);
      return d.toISOString().split('T')[0];
    })();

    const serieDoc = (seriesDocumentarias || []).find(s => s.documento === 'Facturas' && s.estado === 'activo');
    const numero = datos.numero || (serieDoc
      ? `${serieDoc.serie}-${String(Number(serieDoc.siguiente_correlativo)).padStart(4,'0')}`
      : `F001-${String((facturas||[]).length+1).padStart(4,'0')}`);

    const facturaId = await emitirFactura({
      tipo_documento: datos.tipo_documento || 'factura',
      cuenta_id: datos.cuenta_id,
      os_cliente_id: datos.os_cliente_id || null,
      valorizacion_id: datos.valorizacion_id || null,
      items: datos.items || [],
      numero,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      condicion_pago: datos.condicion_pago || '30',
      subtotal: datos.subtotal,
      igv: datos.igv,
      total: datos.total,
      moneda: datos.moneda || 'PEN',
      glosa: datos.glosa || null,
      notas: datos.notas || null,
    });

    if (serieDoc && facturaId) {
      const nextCorr = Number(serieDoc.siguiente_correlativo) + 1;
      setSeriesDocumentarias(prev => prev.map(s => s.id === serieDoc.id ? { ...s, siguiente_correlativo: nextCorr } : s));
      if (isSupabaseConfigured()) {
        getSupabaseClient().then(sb =>
          sb.from('series_documentarias').update({ siguiente_correlativo: nextCorr }).eq('id', serieDoc.id)
            .then(({ error }) => { if (error) console.error('[series] increment failed:', error); })
        );
      }
    }

    await generarCxC({
      cuenta_id: datos.cuenta_id,
      factura_id: facturaId,
      os_cliente_id: datos.os_cliente_id || null,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      monto_total: datos.total,
      monto_pagado: 0,
      saldo: datos.total,
      moneda: datos.moneda || 'PEN',
      estado: 'por_cobrar',
    });

    if (datos.os_cliente_id) {
      const osCliente = osClientes.find(os => os.id === datos.os_cliente_id);
      if (osCliente) {
        const saldoPorFacturar = Math.max(0, Number(osCliente.saldo_por_facturar || 0) - Number(datos.total || 0));
        const montoFacturado = Number(osCliente.monto_facturado || 0) + Number(datos.total || 0);
        setOsClientes(prev => prev.map(os => os.id === osCliente.id ? { ...os, saldo_por_facturar: saldoPorFacturar, monto_facturado: montoFacturado } : os));
        crmSync(sb => svcActualizarOSCliente(sb, osCliente.id, { saldo_por_facturar: saldoPorFacturar, monto_facturado: montoFacturado }));
      }
    }

    addNotificacion(`Factura ${numero} emitida y CxC generada.`);
    return facturaId;
  };

  const emitirFacturaDesdeValorizacion = async (valorizacionId, datos = {}) => {
    const valorizacion = valorizaciones.find(v => v.id === valorizacionId);
    if (!valorizacion) { addNotificacion('No se encontró la valorización seleccionada.'); return null; }
    const osCliente = osClientes.find(os => os.id === valorizacion.os_cliente_id);
    const cuentaId = datos.cuenta_id || osCliente?.cuenta_id;
    if (!cuentaId) { addNotificacion('La valorización no tiene cliente asociado.'); return null; }

    return emitirFacturaConCxC({
      tipo_documento: 'factura',
      cuenta_id: cuentaId,
      os_cliente_id: valorizacion.os_cliente_id,
      valorizacion_id: valorizacion.id,
      items: valorizacion.items || [],
      subtotal: Number(valorizacion.subtotal || 0),
      igv: Number(valorizacion.igv || 0),
      total: Number(valorizacion.total || 0),
      moneda: valorizacion.moneda || osCliente?.moneda || 'PEN',
      ...datos,
    });
  };

  const registrarCobroCxC = async (cxcId, monto, datos = {}) => {
    const cuentaCobrar = cxc.find(c => c.id === cxcId);
    const montoCobrado = Number(monto || 0);
    const montoMora = Number(datos.monto_mora || 0);
    let nuevoEstado = '';
    let nuevoSaldo = 0;
    setCxc(prev => prev.map(c => {
      if (c.id === cxcId) {
        const total = Number(c.monto_total || c.total || 0);
        const pagado = Number(c.monto_pagado || c.pagado || 0);
        const nuevoMonto = pagado + montoCobrado;
        nuevoSaldo = Math.max(0, total - nuevoMonto);
        nuevoEstado = nuevoSaldo <= 0 ? 'cobrada' : 'cobro_parcial';

        if (c?.factura_id) {
          const estadoFac = nuevoEstado === 'cobrada' ? 'cobrada' : 'cobro_parcial';
          setFacturas(fPrev => fPrev.map(f => f.id === c.factura_id ? { ...f, estado: estadoFac, monto_pagado: nuevoMonto, saldo: nuevoSaldo } : f));
          if (isSupabaseConfigured()) {
            finSync(async () => {
              const sb = await getSupabaseClient();
              await sb.from('facturas').update({ estado: estadoFac }).eq('id', c.factura_id);
            });
          }
        }

        if (c?.os_cliente_id) {
          setOsClientes(prev => prev.map(o => o.id === c.os_cliente_id ? {
            ...o, cobrado: Number(o.cobrado || 0) + montoCobrado,
          } : o));
        }

        return { ...c, monto_pagado: nuevoMonto, pagado: nuevoMonto, saldo: nuevoSaldo, estado: nuevoEstado };
      }
      return c;
    }));

    const fecha = datos.fecha_cobro || datos.fecha || new Date().toISOString().split('T')[0];
    const cobroId = generateId('cob');
    const facturaNumero = cuentaCobrar?.facturas?.numero || cuentaCobrar?.factura || cuentaCobrar?.factura_id || cxcId;

    const cobro = {
      id: cobroId,
      empresa_id: empresa.id,
      cxc_id: cxcId,
      factura_id: cuentaCobrar?.factura_id || null,
      cuenta_id: cuentaCobrar?.cuenta_id || null,
      monto_capital: montoCobrado,
      monto_mora: montoMora,
      medio_pago: datos.medio_pago || 'Efectivo',
      cuenta_bancaria: datos.cuenta_bancaria || null,
      numero_operacion: datos.numero_operacion || datos.referencia || null,
      fecha_cobro: fecha,
      notas: datos.notas || null,
      registrado_por: authUser?.email || 'Sistema',
      creado_en: new Date().toISOString(),
    };
    setCobrosHistorial(prev => [cobro, ...prev]);

    const movimiento = {
      id: generateId('tes'),
      empresa_id: empresa.id,
      tipo: 'ingreso',
      descripcion: `Cobro ${facturaNumero}`,
      monto: montoCobrado + montoMora,
      moneda: cuentaCobrar?.moneda || 'PEN',
      fecha,
      cuenta_bancaria: datos.cuenta_bancaria || 'Cuenta principal',
      referencia: datos.numero_operacion || datos.referencia || '',
      vinculo_tipo: 'cxc',
      vinculo_id: cxcId,
      estado: 'registrado',
    };
    setMovimientosTesoreria(prev => [movimiento, ...prev]);

    if (cuentaCobrar?.cuenta_id) {
      setCuentas(prev => prev.map(c => c.id === cuentaCobrar.cuenta_id ? {
        ...c, saldo_cxc: Math.max(0, Number(c.saldo_cxc || 0) - montoCobrado),
      } : c));
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.registrarCobroCxC(cxcId, montoCobrado);
        await finanzasService.registrarCobroDetalle(cobro);
        await finanzasService.registrarMovimientoTesoreria(movimiento);
      });
    }

    // Auto-generar comisión aplicando acuerdo aprobado si existe
    const osCliente = osClientes.find(os => os.id === cuentaCobrar?.os_cliente_id);
    const oportunidad = oportunidades.find(op =>
      op.id === osCliente?.oportunidad_id ||
      op.os_cliente_id === osCliente?.id
    );
    const responsableId = oportunidad?.responsable_id || oportunidad?.responsable || oportunidad?.asignado_a || oportunidad?.usuario || oportunidad?.vendedor_id;
    if (responsableId) {
      const vendedor = personalAdmin.find(p =>
        p.id === responsableId || p.auth_user_id === responsableId || p.nombre === responsableId
      );
      if (vendedor?.tiene_comisiones) {
        const pctBase = Number(vendedor.porcentaje_comision || 0);
        const acuerdoEstado = oportunidad?.acuerdo_estado || 'sin_acuerdo';
        let pct = pctBase;
        let bonificacionAcuerdo = 0;
        let notaFallback = null;

        if (acuerdoEstado === 'aprobado') {
          // Usar acuerdo aprobado
          pct = Number(oportunidad.acuerdo_pct ?? pctBase);
          // Prorratear bonificación según proporción cobrada sobre factura total
          const montoCxC = cuentaCobrar?.monto || cuentaCobrar?.saldo || montoCobrado;
          const proporcion = montoCxC > 0 ? Math.min(1, montoCobrado / montoCxC) : 1;
          bonificacionAcuerdo = Math.round(Number(oportunidad.acuerdo_bonificacion || 0) * proporcion * 100) / 100;
        } else if (acuerdoEstado === 'pendiente' || acuerdoEstado === 'rechazado') {
          // Fallback a % base con advertencia
          notaFallback = `Se usó el % base (${pctBase}%) porque el acuerdo especial no está aprobado.`;
        }

        if (pct > 0 || bonificacionAcuerdo > 0) {
          const montoComision = Math.round(montoCobrado * pct / 100 * 100) / 100;
          const periodoComision = fecha.slice(0, 7);
          const comision = {
            id: generateId('com'),
            empresa_id: empresa.id,
            vendedor_id: vendedor.id,
            vendedor_nombre: vendedor.nombre,
            cobro_cxc_id: cobroId,
            cxc_id: cxcId,
            factura_id: cuentaCobrar?.factura_id || null,
            os_cliente_id: osCliente?.id || null,
            oportunidad_id: oportunidad?.id || null,
            os_cliente_numero: osCliente?.numero || null,
            factura_numero: facturas.find(f => f.id === cuentaCobrar?.factura_id)?.numero || null,
            oportunidad_nombre: oportunidad?.nombre || null,
            moneda: normalizarMonedaComision(cuentaCobrar?.moneda || facturas.find(f => f.id === cuentaCobrar?.factura_id)?.moneda || osCliente?.moneda || oportunidad?.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN'),
            monto_cobrado: montoCobrado,
            porcentaje_base: pctBase,
            porcentaje_comision: pct,
            monto_comision: montoComision,
            bonificacion: bonificacionAcuerdo,
            monto_total: montoComision + bonificacionAcuerdo,
            modalidad_pago: vendedor.modalidad_comision || 'Planilla',
            periodo: periodoComision,
            estado: 'pendiente_aprobacion',
            acuerdo_especial: acuerdoEstado === 'aprobado' && Math.abs(Number(pct) - pctBase) > 0.0001,
            nota_acuerdo: notaFallback,
            creado_en: new Date().toISOString(),
          };
          setComisiones(prev => [comision, ...prev]);
          if (isSupabaseConfigured()) {
            finSync(() => finanzasService.registrarComision(comision));
          }
          if (notaFallback) addNotificacion(`Comisión generada con % base. ${notaFallback}`);
        }
      }
    }

    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcId, accion: 'cobrar', valor_anterior: cuentaCobrar || null, valor_nuevo: { monto: montoCobrado, estado: nuevoEstado } });
    addNotificacion(`Cobro de ${facturaNumero} registrado. Nuevo estado: ${nuevoEstado === 'cobrada' ? 'Cobrada' : 'Cobro parcial'}.`);
  };

  const registrarGestionCobranza = async (cxcId, datos) => {
    const gestion = {
      id: generateId('ges'),
      empresa_id: empresa.id,
      cxc_id: cxcId,
      tipo_gestion: datos.tipo_gestion,
      resultado: datos.resultado,
      fecha_gestion: new Date().toISOString().split('T')[0],
      fecha_proxima_accion: datos.fecha_proxima_accion || null,
      fecha_acordada_pago: datos.fecha_acordada_pago || null,
      notas: datos.notas,
      usuario: authUser?.email || 'Sistema',
      creado_en: new Date().toISOString(),
    };
    setGestionesCobranza(prev => [gestion, ...prev]);
    setCxc(prev => prev.map(c => c.id === cxcId ? { ...c, estado: 'en_gestion' } : c));

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.registrarGestion(gestion);
        const sb = await getSupabaseClient();
        await sb.from('cxc').update({ estado: 'en_gestion' }).eq('id', cxcId);
      });
    }
    if (datos.fecha_proxima_accion) {
      addNotificacion(`Gestión registrada. Próxima acción: ${datos.fecha_proxima_accion}.`);
    } else {
      addNotificacion('Gestión de cobranza registrada.');
    }
  };

  const aprobarComision = async (comisionId, datos) => {
    const bonificacion = Number(datos.bonificacion || 0);
    const notaAprobacion = datos.nota_aprobacion ?? datos.nota ?? null;
    setComisiones(prev => prev.map(c => c.id === comisionId ? {
      ...c,
      estado: 'aprobada',
      bonificacion,
      monto_total: Number(c.monto_comision || 0) + bonificacion,
      nota_aprobacion: notaAprobacion,
      aprobado_por: authUser?.email || 'Admin',
      aprobado_en: new Date().toISOString(),
    } : c));
    if (isSupabaseConfigured()) {
      const c = comisiones.find(x => x.id === comisionId);
      finSync(() => finanzasService.actualizarComision(comisionId, {
        estado: 'aprobada',
        bonificacion,
        monto_total: Number(c?.monto_comision || 0) + bonificacion,
        nota_aprobacion: notaAprobacion,
        aprobado_por: authUser?.email || 'Admin',
        aprobado_en: new Date().toISOString(),
      }));
    }
    addNotificacion('Comisión aprobada.');
  };

  const rechazarComision = async (comisionId, motivo) => {
    setComisiones(prev => prev.map(c => c.id === comisionId
      ? { ...c, estado: 'rechazada', motivo_rechazo: motivo } : c));
    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarComision(comisionId, { estado: 'rechazada', motivo_rechazo: motivo }));
    }
    addNotificacion('Comisión rechazada.');
  };

  const normalizarMonedaComision = (moneda) => {
    const raw = String(moneda || '').trim().toUpperCase();
    if (raw.includes('USD') || raw.includes('US$') || raw.includes('DOLAR')) return 'USD';
    return 'PEN';
  };

  const monedaDeComision = (comision) => {
    const cxcRef = cxc.find(x => x.id === comision.cxc_id);
    const facturaRef = facturas.find(f => f.id === (comision.factura_id || cxcRef?.factura_id));
    const osRef = osClientes.find(os => os.id === (comision.os_cliente_id || cxcRef?.os_cliente_id));
    return normalizarMonedaComision(comision.moneda || cxcRef?.moneda || facturaRef?.moneda || osRef?.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN');
  };

  const generarReciboHonorarios = async (vendedorId, moneda = null) => {
    const aprobadasPendientes = comisiones.filter(c =>
      c.vendedor_id === vendedorId &&
      c.estado === 'aprobada' &&
      c.modalidad_pago === 'Honorarios'
    );
    const monedaRecibo = moneda ? normalizarMonedaComision(moneda) : monedaDeComision(aprobadasPendientes[0] || {});
    const pendientes = aprobadasPendientes.filter(c => monedaDeComision(c) === monedaRecibo);
    if (!pendientes.length) { addNotificacion('No hay comisiones aprobadas pendientes para este vendedor.'); return null; }
    const vendedor = personalAdmin.find(p => p.id === vendedorId);
    const montoBruto = pendientes.reduce((s, c) => s + Number(c.monto_total || 0), 0);
    const tasaIR = Number(vendedor?.retencion_ir_comision ?? 8) / 100;
    const retencionIR = Math.round(montoBruto * tasaIR * 100) / 100;
    const recibo = {
      id: generateId('rec'),
      empresa_id: empresa.id,
      vendedor_id: vendedorId,
      vendedor_nombre: vendedor?.nombre || vendedorId,
      vendedor_ruc: vendedor?.ruc_vendedor || vendedor?.ruc || vendedor?.dni || null,
      periodo: new Date().toISOString().slice(0, 7),
      comisiones_ids: pendientes.map(c => c.id),
      moneda: monedaRecibo,
      monto_bruto: montoBruto,
      retencion_ir: retencionIR,
      monto_neto: montoBruto - retencionIR,
      estado: 'borrador',
      creado_en: new Date().toISOString(),
    };
    setRecibosHonorarios(prev => [recibo, ...prev]);
    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.crearReciboHonorarios(recibo));
    }
    const simbolo = monedaRecibo === 'USD' ? 'US$' : 'S/';
    addNotificacion(`Recibo borrador generado. Monto neto: ${simbolo} ${(montoBruto - retencionIR).toFixed(2)}.`);
    return recibo;
  };

  const confirmarReciboHonorarios = async (reciboId) => {
    const recibo = recibosHonorarios.find(r => r.id === reciboId);
    if (!recibo || recibo.estado !== 'borrador') return;
    const now = new Date().toISOString().split('T')[0];
    const fechaVencimiento = (() => {
      const d = new Date(`${now}T00:00:00`);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

    // Genera CxP en lugar de ir directo a Tesorería — trazabilidad completa
    await generarCxP({
      tipo_beneficiario: 'personal',
      personal_id: recibo.vendedor_id || null,
      concepto: `Honorarios comisiones — ${recibo.vendedor_nombre} ${recibo.periodo}`,
      recibo_honorarios_id: reciboId,
      factura_numero: recibo.id,
      fecha_emision: now,
      fecha_vencimiento: fechaVencimiento,
      monto_total: recibo.monto_neto,
      monto_pagado: 0,
      saldo: recibo.monto_neto,
      moneda: normalizarMonedaComision(recibo.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN'),
      estado: 'por_pagar',
    });

    setRecibosHonorarios(prev => prev.map(r => r.id === reciboId ? { ...r, estado: 'pendiente_pago' } : r));
    if (isSupabaseConfigured()) {
      finSync(async () => {
        const sb = await getSupabaseClient();
        await sb.from('recibos_honorarios').update({ estado: 'pendiente_pago' }).eq('id', reciboId);
      });
    }
    const simbolo = normalizarMonedaComision(recibo.moneda || empresa?.moneda || empresa?.moneda_base) === 'USD' ? 'US$' : 'S/';
    addNotificacion(`Recibo confirmado. CxP de ${simbolo} ${recibo.monto_neto.toFixed(2)} generada. Pendiente de pago.`);
  };

  const registrarMovimientoManual = async (datos) => {
    const now = new Date().toISOString().split('T')[0];
    if (datos.tipo === 'transferencia') {
      const base = { empresa_id: empresa.id, fecha: datos.fecha || now, descripcion: datos.descripcion || 'Transferencia entre cuentas', monto: Number(datos.monto || 0), categoria: 'transferencia', es_manual: true, referencia: datos.referencia || null, creado_en: new Date().toISOString() };
      const movE = { ...base, id: generateId('mov'), tipo: 'egreso', cuenta_bancaria_id: datos.cuenta_origen_id || null };
      const movI = { ...base, id: generateId('mov'), tipo: 'ingreso', cuenta_bancaria_id: datos.cuenta_destino_id || null };
      setMovimientosTesoreria(prev => [...prev, movE, movI]);
      if (isSupabaseConfigured()) {
        finSync(async () => {
          await finanzasService.registrarMovimientoTesoreria(movE);
          await finanzasService.registrarMovimientoTesoreria(movI);
        });
      }
    } else {
      const mov = {
        id: generateId('mov'),
        empresa_id: empresa.id,
        tipo: datos.tipo,
        fecha: datos.fecha || now,
        descripcion: datos.descripcion,
        monto: Number(datos.monto || 0),
        categoria: datos.categoria || null,
        cuenta_bancaria_id: datos.tipo === 'ingreso' ? (datos.cuenta_destino_id || null) : (datos.cuenta_origen_id || null),
        es_manual: true,
        referencia: datos.referencia || null,
        creado_en: new Date().toISOString(),
      };
      setMovimientosTesoreria(prev => [...prev, mov]);
      if (isSupabaseConfigured()) {
        finSync(() => finanzasService.registrarMovimientoTesoreria(mov));
      }
    }
    addNotificacion('Movimiento manual registrado.');
  };

  const crearCuentaBancaria = async (datos) => {
    const cuenta = {
      id: generateId('cb'),
      empresa_id: empresa.id,
      nombre: datos.nombre,
      banco: datos.banco,
      numero_cuenta: datos.numero_cuenta || null,
      cci: datos.cci || null,
      moneda: datos.moneda || 'PEN',
      tipo: datos.tipo || 'corriente',
      estado: datos.estado || 'activo',
      saldo_inicial: Number(datos.saldo_inicial || 0),
      creado_en: new Date().toISOString(),
    };
    setCuentasBancarias(prev => [...prev, cuenta]);
    if (isSupabaseConfigured()) {
      finSync(async () => {
        const saved = await finanzasService.crearCuentaBancaria(cuenta);
        if (saved?.id !== cuenta.id) setCuentasBancarias(prev => prev.map(c => c.id === cuenta.id ? { ...c, ...saved } : c));
      });
    }
    addNotificacion(`Cuenta bancaria "${cuenta.nombre}" creada.`);
    return cuenta;
  };

  const actualizarCuentaBancaria = async (id, updates) => {
    setCuentasBancarias(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarCuentaBancaria(id, updates));
    }
  };

  const eliminarCuentaBancaria = async (id) => {
    setCuentasBancarias(prev => prev.filter(c => c.id !== id));
    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.eliminarCuentaBancaria(id));
    }
    addNotificacion('Cuenta bancaria eliminada.');
  };

  const anularFactura = (facturaId, motivo) => {
    const fac = facturas.find(f => f.id === facturaId);
    if (!fac || fac.estado === 'cobrada') return;
    setFacturas(prev => prev.map(f => f.id === facturaId ? { ...f, estado: 'anulada', motivo_anulacion: motivo } : f));
    // Anular CxC vinculada si está por cobrar
    const cxcVinculada = cxc.find(c => c.factura_id === facturaId && c.estado !== 'cobrada');
    if (cxcVinculada) {
      setCxc(prev => prev.map(c => c.id === cxcVinculada.id ? { ...c, estado: 'anulada' } : c));
      // Part 8: deshacer conciliación bancaria y anular movimiento tesorería vinculados a esta CxC
      const movBancoVinculado = movimientosBanco.find(m => m.conciliado && m.vinculado_tipo === 'cxc' && m.vinculado_id === cxcVinculada.id);
      if (movBancoVinculado) {
        setMovimientosBanco(prev => prev.map(m => m.id === movBancoVinculado.id
          ? { ...m, conciliado: false, vinculado_tipo: null, vinculado_id: null } : m));
      }
      setMovimientosTesoreria(prev => prev.map(m =>
        (m.vinculo_id === cxcVinculada.id || m.vinculado_id === cxcVinculada.id)
          ? { ...m, estado: 'anulado' } : m));
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('cxc').update({ estado: 'anulada' }).eq('id', cxcVinculada.id);
          if (movBancoVinculado) {
            await sb.from('movimientos_banco')
              .update({ conciliado: false, vinculado_tipo: null, vinculado_id: null })
              .eq('id', movBancoVinculado.id);
          }
        });
      }
    }
    if (isSupabaseConfigured()) {
      finSync(async () => {
        const sb = await getSupabaseClient();
        await sb.from('facturas').update({ estado: 'anulada', motivo_anulacion: motivo }).eq('id', facturaId);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: facturaId, accion: 'anular', valor_nuevo: { motivo } });
    addNotificacion(`Factura ${fac.numero} anulada.`);
  };

  const emitirNotaCredito = async (facturaOrigenId, datos) => {
    const facOrigen = facturas.find(f => f.id === facturaOrigenId);
    if (!facOrigen) return null;
    const cxcVinc = cxc.find(c => c.factura_id === facturaOrigenId && c.estado !== 'cobrada');
    const ncCount = facturas.filter(f => f.tipo_documento === 'nota_credito').length + 1;
    const numero = `NC01-${String(ncCount).padStart(4,'0')}`;
    const totalAcreditar = Number(datos.total || 0);
    const now = new Date().toISOString().split('T')[0];

    const ncFac = {
      id: generateId('fac'),
      empresa_id: empresa.id,
      tipo_documento: 'nota_credito',
      estado: 'emitida',
      numero,
      cuenta_id: facOrigen.cuenta_id,
      os_cliente_id: facOrigen.os_cliente_id || null,
      valorizacion_id: facOrigen.valorizacion_id || null,
      factura_origen_id: facturaOrigenId,
      items: datos.items || [],
      subtotal: datos.subtotal || totalAcreditar,
      igv: datos.igv || 0,
      total: totalAcreditar,
      moneda: facOrigen.moneda || 'PEN',
      fecha_emision: now,
      motivo: datos.motivo || null,
      notas: datos.notas || null,
    };
    setFacturas(prev => [...prev, ncFac]);

    const totalFactura = Number(facOrigen.total || 0);
    if (totalAcreditar >= totalFactura) {
      // Anulación total
      setFacturas(prev => prev.map(f => f.id === facturaOrigenId
        ? { ...f, estado: 'anulada', motivo_anulacion: `NC emitida: ${numero}` } : f));
      if (cxcVinc) setCxc(prev => prev.map(c => c.id === cxcVinc.id ? { ...c, estado: 'anulada', saldo: 0 } : c));
      if (facOrigen.valorizacion_id) {
        setValorizaciones(prev => prev.map(v => v.id === facOrigen.valorizacion_id ? { ...v, estado: 'aprobada' } : v));
        if (isSupabaseConfigured()) {
          finSync(async () => {
            const sb = await getSupabaseClient();
            await sb.from('valorizaciones').update({ estado: 'aprobada' }).eq('id', facOrigen.valorizacion_id);
          });
        }
      }
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('facturas').update({ estado: 'anulada', motivo_anulacion: `NC emitida: ${numero}` }).eq('id', facturaOrigenId);
          if (cxcVinc) await sb.from('cxc').update({ estado: 'anulada', saldo: 0 }).eq('id', cxcVinc.id);
        });
      }
    } else if (cxcVinc) {
      // Reducción parcial de CxC
      const nuevoTotal = Math.max(0, Number(cxcVinc.monto_total || 0) - totalAcreditar);
      const nuevoSaldo = Math.max(0, Number(cxcVinc.saldo || 0) - totalAcreditar);
      const nuevoEstado = nuevoSaldo <= 0 ? 'cobrada' : cxcVinc.estado;
      setCxc(prev => prev.map(c => c.id === cxcVinc.id ? { ...c, monto_total: nuevoTotal, saldo: nuevoSaldo, estado: nuevoEstado } : c));
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('cxc').update({ monto_total: nuevoTotal, saldo: nuevoSaldo, estado: nuevoEstado }).eq('id', cxcVinc.id);
        });
      }
    }

    if (isSupabaseConfigured()) finSync(async () => { await finanzasService.emitirFactura(ncFac); });
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: ncFac.id, accion: 'emitir_nc', valor_nuevo: ncFac });
    addNotificacion(`Nota de Crédito ${numero} emitida.`);
    return ncFac.id;
  };

  const emitirNotaDebito = async (facturaOrigenId, datos) => {
    const facOrigen = facturas.find(f => f.id === facturaOrigenId);
    if (!facOrigen) return null;
    const cxcVinc = cxc.find(c => c.factura_id === facturaOrigenId);
    const ndCount = facturas.filter(f => f.tipo_documento === 'nota_debito').length + 1;
    const numero = `ND01-${String(ndCount).padStart(4,'0')}`;
    const totalND = Number(datos.total || 0);
    const now = new Date().toISOString().split('T')[0];

    const ndFac = {
      id: generateId('fac'),
      empresa_id: empresa.id,
      tipo_documento: 'nota_debito',
      estado: 'emitida',
      numero,
      cuenta_id: facOrigen.cuenta_id,
      os_cliente_id: facOrigen.os_cliente_id || null,
      valorizacion_id: facOrigen.valorizacion_id || null,
      factura_origen_id: facturaOrigenId,
      items: datos.items || [],
      subtotal: datos.subtotal || totalND,
      igv: datos.igv || 0,
      total: totalND,
      moneda: facOrigen.moneda || 'PEN',
      fecha_emision: now,
      motivo: datos.motivo || null,
      notas: datos.notas || null,
    };
    setFacturas(prev => [...prev, ndFac]);

    if (cxcVinc) {
      const nuevoTotal = Number(cxcVinc.monto_total || 0) + totalND;
      const nuevoSaldo = Number(cxcVinc.saldo || 0) + totalND;
      setCxc(prev => prev.map(c => c.id === cxcVinc.id ? { ...c, monto_total: nuevoTotal, saldo: nuevoSaldo } : c));
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('cxc').update({ monto_total: nuevoTotal, saldo: nuevoSaldo }).eq('id', cxcVinc.id);
        });
      }
    }

    if (isSupabaseConfigured()) finSync(async () => { await finanzasService.emitirFactura(ndFac); });
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: ndFac.id, accion: 'emitir_nd', valor_nuevo: ndFac });
    addNotificacion(`Nota de Débito ${numero} emitida.`);
    return ndFac.id;
  };

  const generarCxP = async (datos) => {
    const cuentaPagar = {
      id: generateId('cxp'),
      empresa_id: empresa.id,
      estado: 'por_pagar',
      monto_pagado: 0,
      saldo: datos.monto_total,
      ...datos
    };
    setCxp(prev => [cuentaPagar, ...prev]);

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.generarCxP(cuentaPagar);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxp', entidad_id: cuentaPagar.id, accion: 'crear', valor_nuevo: cuentaPagar });
    addNotificacion('Cuenta por Pagar registrada.');
    return cuentaPagar.id;
  };

  const registrarPagoCxP = async (cxpId, monto, datos = {}) => {
    const cuentaPagar = cxp.find(c => c.id === cxpId);
    const montoPagado = Number(monto || 0);
    let nuevoEstado = '';
    setCxp(prev => prev.map(c => {
      if (c.id === cxpId) {
        const nuevoMonto = Number(c.monto_pagado || 0) + montoPagado;
        const nuevoSaldo = Math.max(0, Number(c.monto_total || 0) - nuevoMonto);
        nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'pago_parcial';
        return { ...c, monto_pagado: nuevoMonto, saldo: nuevoSaldo, estado: nuevoEstado };
      }
      return c;
    }));

    const now = datos.fecha || new Date().toISOString().split('T')[0];

    // Historial detallado de pagos
    const registroPago = {
      id: generateId('cxpp'),
      empresa_id: empresa.id,
      cxp_id: cxpId,
      fecha_pago: now,
      monto: montoPagado,
      cuenta_bancaria: datos.cuenta_bancaria || null,
      referencia: datos.referencia || null,
      registrado_por: authUser?.id || null,
      creado_en: new Date().toISOString(),
    };
    setCxpPagos(prev => [registroPago, ...prev]);

    const movimiento = {
      id: generateId('tes'),
      empresa_id: empresa.id,
      tipo: 'egreso',
      descripcion: datos.descripcion || cuentaPagar?.concepto || `Pago ${cuentaPagar?.factura_numero || cxpId}`,
      monto: montoPagado,
      moneda: cuentaPagar?.moneda || 'PEN',
      fecha: now,
      cuenta_bancaria: datos.cuenta_bancaria || 'Cuenta principal',
      referencia: datos.referencia || '',
      vinculo_tipo: 'cxp',
      vinculo_id: cxpId,
      estado: 'registrado'
    };
    setMovimientosTesoreria(prev => [movimiento, ...prev]);

    // Cuando la CxP de honorarios queda pagada, cerrar el ciclo de comisiones
    const reciboId = cuentaPagar?.recibo_honorarios_id;
    if (nuevoEstado === 'pagada' && reciboId) {
      const recibo = recibosHonorarios.find(r => r.id === reciboId);
      if (recibo) {
        setRecibosHonorarios(prev => prev.map(r => r.id === reciboId ? { ...r, estado: 'pagado' } : r));
        setComisiones(prev => prev.map(c =>
          (recibo.comisiones_ids || []).includes(c.id)
            ? { ...c, estado: 'pagada', pagado_en: new Date().toISOString(), recibo_id: reciboId } : c));
      }
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.registrarPagoCxP(cxpId, montoPagado);
        await finanzasService.insertarCxpPago(registroPago);
        await finanzasService.registrarMovimientoTesoreria(movimiento);
        if (nuevoEstado === 'pagada' && reciboId) {
          const sb = await getSupabaseClient();
          await sb.from('recibos_honorarios').update({ estado: 'pagado' }).eq('id', reciboId);
          const recibo = recibosHonorarios.find(r => r.id === reciboId);
          for (const cId of (recibo?.comisiones_ids || [])) {
            await sb.from('comisiones').update({ estado: 'pagada', pagado_en: new Date().toISOString(), recibo_id: reciboId }).eq('id', cId);
          }
        }
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxp', entidad_id: cxpId, accion: 'pagar', valor_anterior: cuentaPagar || null, valor_nuevo: { monto: montoPagado, estado: nuevoEstado, movimiento } });
    addNotificacion(`Pago registrado. Estado: ${nuevoEstado || 'Actualizado'}`);
  };

  const conciliarMovimientoBancoConDocumento = async (movId, vinculadoTipo, vinculadoId) => {
    const mov = movimientosBanco.find(m => m.id === movId);
    if (!mov || !vinculadoId) return;
    // Part 8: bloquear doble conciliación
    if (mov.conciliado) {
      addNotificacion('Este movimiento bancario ya está conciliado y no puede vincularse nuevamente.');
      return;
    }

    if (vinculadoTipo === 'cxc') {
      await registrarCobroCxC(vinculadoId, Number(mov.monto || 0), {
        fecha: mov.fecha,
        cuenta_bancaria: 'Banco',
        referencia: mov.id,
        descripcion: mov.descripcion || mov.desc || `Cobro bancario ${mov.id}`
      });
    } else if (vinculadoTipo === 'cxp') {
      await registrarPagoCxP(vinculadoId, Number(mov.monto || 0), {
        fecha: mov.fecha,
        cuenta_bancaria: 'Banco',
        referencia: mov.id,
        descripcion: mov.descripcion || mov.desc || `Pago bancario ${mov.id}`
      });
    }

    await conciliarMovimientoBanco(movId, vinculadoTipo, vinculadoId);
  };

  const conciliarMovimientoBanco = async (movId, vinculadoTipo, vinculadoId) => {
    setMovimientosBanco(prev => prev.map(m => 
      m.id === movId ? { ...m, conciliado: true, vinculado_tipo: vinculadoTipo, vinculado_id: vinculadoId } : m
    ));

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.conciliarMovimiento(movId, vinculadoTipo, vinculadoId);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'movimientos_banco', entidad_id: movId, accion: 'conciliar', valor_nuevo: { vinculado_tipo: vinculadoTipo, vinculado_id: vinculadoId } });
    addNotificacion('Movimiento bancario conciliado.');
  };

  // ============================================================
  // FASE 3 — Mutaciones
  // ============================================================

  const calcularHealthScore = (cuentaId) => {
    const detalle = healthScoresDetalle.find(h => h.cuenta_id === cuentaId);
    if (!detalle) return null;
    const { comercial, operativa, financiera, soporte, satisfaccion } = detalle.dimensiones;
    return Math.round(
      (comercial.score * comercial.peso +
       operativa.score * operativa.peso +
       financiera.score * financiera.peso +
       soporte.score * soporte.peso +
       satisfaccion.score * satisfaccion.peso) / 100
    );
  };

  const aprobarVacacion = (vacId) => {
    setVacacionesSolicitudes(prev => prev.map(v =>
      v.id === vacId ? { ...v, estado: 'aprobado', aprobador: 'Admin Master' } : v
    ));
    addNotificacion('Solicitud de vacaciones aprobada.');
  };

  const rechazarVacacion = (vacId, motivo) => {
    setVacacionesSolicitudes(prev => prev.map(v =>
      v.id === vacId ? { ...v, estado: 'rechazado', motivo_rechazo: motivo } : v
    ));
  };

  const crearOnboarding = (datos) => {
    const onb = {
      id: generateId('onb'),
      empresa_id: empresa.id,
      estado: 'en_curso',
      checklist: [],
      hitos: [],
      nps_inicial: null,
      ...datos
    };
    setOnboardings(prev => [...prev, onb]);
    addNotificacion(`Onboarding iniciado para el cliente.`);
  };

  const registrarNPS = (datos) => {
    const enc = {
      id: generateId('nps'),
      empresa_id: empresa.id,
      estado: 'respondido',
      fecha_respuesta: new Date().toISOString().split('T')[0],
      clasificacion: datos.score >= 9 ? 'promotor' : datos.score >= 7 ? 'neutro' : 'detractor',
      ...datos
    };
    setNpsEncuestas(prev => [...prev, enc]);
    addNotificacion(`NPS registrado — score ${datos.score} (${enc.clasificacion}).`);
  };

  const generarRenovacion = (renovacionId) => {
    const ren = renovaciones.find(r => r.id === renovacionId);
    if (!ren) return;
    setRenovaciones(prev => prev.map(r =>
      r.id === renovacionId ? { ...r, oportunidad_generada: true, estado: 'en_negociacion' } : r
    ));
    const opp = {
      id: generateId('opp'),
      empresa_id: empresa.id,
      cuenta_id: ren.cuenta_id,
      nombre: `Renovación — ${ren.servicio}`,
      servicio_interes: ren.servicio,
      etapa: 'negociacion',
      monto_estimado: ren.monto_contrato,
      probabilidad: 70,
      forecast_ponderado: ren.monto_contrato * 0.7,
      fuente: 'Renovación',
      responsable: ren.responsable_cs,
      estado: 'abierta',
      fecha_creacion: new Date().toISOString().split('T')[0]
    };
    setOportunidades(prev => [...prev, opp]);
    addNotificacion(`Oportunidad de renovación generada en pipeline.`);
  };

  const crearPlanRetencion = (datos) => {
    const plan = {
      id: generateId('chp'),
      empresa_id: empresa.id,
      fecha_deteccion: new Date().toISOString().split('T')[0],
      estado: 'en_intervencion',
      acciones: [],
      ...datos
    };
    setChurnPlanes(prev => [...prev, plan]);
    addNotificacion('Plan de retención creado.');
  };

  const registrarIaLog = (tipo, recomendacion, accion_tomada) => {
    const log = {
      id: generateId('ial'),
      empresa_id: empresa.id,
      tipo,
      recomendacion,
      accion_tomada,
      usuario: role?.nombre || 'Sistema',
      fecha: new Date().toISOString()
    };
    setIaLogs(prev => [log, ...prev]);
  };

  // ---- Empresa Config ----
  const guardarEmpresaConfig = async (datos) => {
    const payload = { ...datos, empresa_id: empresa?.id };
    setEmpresaConfig(prev => ({ ...prev, ...datos }));
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        const supabase = await getSupabaseClient();
        const { error } = await supabase.from('empresa_config').upsert(payload, { onConflict: 'empresa_id' });
        if (error) {
          console.error('[empresa_config upsert]', error.message, error.details);
          addNotificacion('Error al guardar configuración: ' + error.message);
          return;
        }
      } catch (_err) { console.error('[empresa_config]', _err); }
    }
    addNotificacion('Configuración de empresa guardada.');
  };

  const subirImagenEmpresa = async (campo, file) => {
    if (!isSupabaseConfigured() || !empresa?.id) throw new Error('Supabase no configurado');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${empresa.id}/${campo}.${ext}`;
    const supabase = await getSupabaseClient();
    const { error } = await supabase.storage.from('empresa-assets').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('empresa-assets').getPublicUrl(path);
    return pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;
  };

  const recargarParametrosGenerales = async () => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    const supabase = await getSupabaseClient();
    const [{ data: seriesData, error: seriesError }, { data: slaData, error: slaError }, { data: diccionarioData, error: diccionarioError }] = await Promise.all([
      supabase.from('series_documentarias').select('*').eq('empresa_id', empresa.id).order('documento', { ascending: true }),
      supabase.from('sla_plantillas').select('*').eq('empresa_id', empresa.id).order('nombre', { ascending: true }),
      supabase.from('diccionario_comercial').select('*').eq('empresa_id', empresa.id).order('categoria', { ascending: true }).order('clave', { ascending: true }),
    ]);
    if (seriesError) throw seriesError;
    if (slaError) throw slaError;
    if (diccionarioError) throw diccionarioError;
    setSeriesDocumentarias(seriesData || []);
    setSlaPlantillas(slaData || []);
    setDiccionarioComercial(diccionarioData || []);
  };

  const crearSerieDocumentaria = async (datos) => {
    const payload = {
      id: datos.id || generateId('ser'),
      empresa_id: empresa?.id,
      documento: datos.documento || '',
      serie: datos.serie || '',
      siguiente_correlativo: Number(datos.siguiente_correlativo || 1),
      regla: datos.regla || '',
      estado: datos.estado || 'activo',
    };
    if (isSupabaseConfigured() && empresa?.id) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('series_documentarias').insert(payload).select('*').single();
      if (error) throw error;
      setSeriesDocumentarias(prev => [data, ...prev]);
      return data;
    }
    setSeriesDocumentarias(prev => [payload, ...prev]);
    return payload;
  };

  const actualizarSerieDocumentaria = async (id, datos) => {
    const payload = {
      documento: datos.documento || '',
      serie: datos.serie || '',
      siguiente_correlativo: Number(datos.siguiente_correlativo || 1),
      regla: datos.regla || '',
      estado: datos.estado || 'activo',
      updated_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('series_documentarias').update(payload).eq('id', id).select('*').single();
      if (error) throw error;
      setSeriesDocumentarias(prev => prev.map(s => s.id === id ? data : s));
      return data;
    }
    setSeriesDocumentarias(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s));
    return payload;
  };

  const eliminarSerieDocumentaria = async (id) => {
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('series_documentarias').delete().eq('id', id);
      if (error) throw error;
    }
    setSeriesDocumentarias(prev => prev.filter(s => s.id !== id));
  };

  const crearSlaPlantilla = async (datos) => {
    const payload = {
      id: datos.id || generateId('sla'),
      empresa_id: empresa?.id,
      nombre: datos.nombre || '',
      tiempo_respuesta_horas: Number(datos.tiempo_respuesta_horas || 0),
      tiempo_resolucion_horas: Number(datos.tiempo_resolucion_horas || 0),
      semaforo_regla: datos.semaforo_regla || '',
      estado: datos.estado || 'activo',
    };
    if (isSupabaseConfigured() && empresa?.id) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('sla_plantillas').insert(payload).select('*').single();
      if (error) throw error;
      setSlaPlantillas(prev => [data, ...prev]);
      return data;
    }
    setSlaPlantillas(prev => [payload, ...prev]);
    return payload;
  };

  const actualizarSlaPlantilla = async (id, datos) => {
    const payload = {
      nombre: datos.nombre || '',
      tiempo_respuesta_horas: Number(datos.tiempo_respuesta_horas || 0),
      tiempo_resolucion_horas: Number(datos.tiempo_resolucion_horas || 0),
      semaforo_regla: datos.semaforo_regla || '',
      estado: datos.estado || 'activo',
      updated_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('sla_plantillas').update(payload).eq('id', id).select('*').single();
      if (error) throw error;
      setSlaPlantillas(prev => prev.map(s => s.id === id ? data : s));
      return data;
    }
    setSlaPlantillas(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s));
    return payload;
  };

  const eliminarSlaPlantilla = async (id) => {
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('sla_plantillas').delete().eq('id', id);
      if (error) throw error;
    }
    setSlaPlantillas(prev => prev.filter(s => s.id !== id));
  };

  const crearDiccionarioComercial = async (datos) => {
    const payload = {
      id: datos.id || generateId('dic'),
      empresa_id: empresa?.id,
      categoria: datos.categoria || 'Comercial',
      clave: datos.clave || '',
      texto: datos.texto || '',
      estado: datos.estado || 'activo',
    };
    if (isSupabaseConfigured() && empresa?.id) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('diccionario_comercial').insert(payload).select('*').single();
      if (error) throw error;
      setDiccionarioComercial(prev => [data, ...prev]);
      return data;
    }
    setDiccionarioComercial(prev => [payload, ...prev]);
    return payload;
  };

  const actualizarDiccionarioComercial = async (id, datos) => {
    const payload = {
      categoria: datos.categoria || 'Comercial',
      clave: datos.clave || '',
      texto: datos.texto || '',
      estado: datos.estado || 'activo',
      updated_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('diccionario_comercial').update(payload).eq('id', id).select('*').single();
      if (error) throw error;
      setDiccionarioComercial(prev => prev.map(d => d.id === id ? data : d));
      return data;
    }
    setDiccionarioComercial(prev => prev.map(d => d.id === id ? { ...d, ...payload } : d));
    return payload;
  };

  const eliminarDiccionarioComercial = async (id) => {
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('diccionario_comercial').delete().eq('id', id);
      if (error) throw error;
    }
    setDiccionarioComercial(prev => prev.filter(d => d.id !== id));
  };

  const crearArea = async (area) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearArea(empresa.id, area);
      setAreasEmpresa(prev => [data, ...prev]);
      return data;
    }
    const nuevo = { ...area, id: generateId('area'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
    setAreasEmpresa(prev => [nuevo, ...prev]);
    return nuevo;
  };
  const actualizarArea = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarArea(id, datos);
      setAreasEmpresa(prev => prev.map(a => a.id === id ? act : a));
      return act;
    }
    setAreasEmpresa(prev => prev.map(a => a.id === id ? { ...a, ...datos } : a));
    return datos;
  };
  const eliminarArea = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarArea(id);
    setAreasEmpresa(prev => prev.filter(a => a.id !== id));
  };

  const crearCargo = async (cargo) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearCargo(empresa.id, cargo);
      setCargos(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...cargo, id: generateId('car'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setCargos(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const actualizarCargo = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarCargo(id, datos);
      setCargos(prev => prev.map(c => c.id === id ? act : c));
      return act;
    } else {
      setCargos(prev => prev.map(c => c.id === id ? { ...c, ...datos } : c));
      return datos;
    }
  };
  const eliminarCargo = async (id) => {
    if (isSupabaseConfigured()) {
      await maestrosService.eliminarCargo(id);
    }
    setCargos(prev => prev.filter(c => c.id !== id));
  };
  const actualizarEspecialidad = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarEspecialidad(id, datos);
      setEspecialidades(prev => prev.map(e => e.id === id ? act : e));
      return act;
    }
    setEspecialidades(prev => prev.map(e => e.id === id ? { ...e, ...datos } : e));
    return datos;
  };
  const eliminarEspecialidad = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarEspecialidad(id);
    setEspecialidades(prev => prev.filter(e => e.id !== id));
  };
  const actualizarTipoServicio = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarTipoServicio(id, datos);
      setTiposServicio(prev => prev.map(t => t.id === id ? act : t));
      return act;
    }
    setTiposServicio(prev => prev.map(t => t.id === id ? { ...t, ...datos } : t));
    return datos;
  };
  const eliminarTipoServicio = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarTipoServicio(id);
    setTiposServicio(prev => prev.filter(t => t.id !== id));
  };
  const actualizarAlmacen = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarAlmacen(id, datos);
      setAlmacenes(prev => prev.map(a => a.id === id ? act : a));
      return act;
    }
    setAlmacenes(prev => prev.map(a => a.id === id ? { ...a, ...datos } : a));
    return datos;
  };
  const eliminarAlmacen = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarAlmacen(id);
    setAlmacenes(prev => prev.filter(a => a.id !== id));
  };
  const actualizarSede = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarSede(id, datos);
      setSedes(prev => prev.map(s => s.id === id ? act : s));
      return act;
    }
    setSedes(prev => prev.map(s => s.id === id ? { ...s, ...datos } : s));
    return datos;
  };
  const eliminarSede = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarSede(id);
    setSedes(prev => prev.filter(s => s.id !== id));
  };
  const crearEspecialidad = async (especialidad) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearEspecialidad(empresa.id, especialidad);
      setEspecialidades(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...especialidad, id: generateId('esp'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setEspecialidades(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const crearTipoServicio = async (ts) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearTipoServicio(empresa.id, ts);
      setTiposServicio(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...ts, id: generateId('tsi'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setTiposServicio(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const crearAlmacen = async (almacen) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearAlmacen(empresa.id, almacen);
      setAlmacenes(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...almacen, id: generateId('alm'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setAlmacenes(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const crearSede = async (sede) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearSede(empresa.id, sede);
      setSedes(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...sede, id: generateId('sed'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setSedes(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };

  // ─── Compras Mutators ─────────────────────────────────────────
  const crearIndustria = async (industria) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearIndustria(empresa.id, industria);
      setIndustrias(prev => [data, ...prev]);
      return data;
    }
    const nuevo = { ...industria, id: generateId('ind'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
    setIndustrias(prev => [nuevo, ...prev]);
    return nuevo;
  };
  const actualizarIndustria = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarIndustria(id, datos);
      setIndustrias(prev => prev.map(i => i.id === id ? act : i));
      return act;
    }
    setIndustrias(prev => prev.map(i => i.id === id ? { ...i, ...datos } : i));
    return datos;
  };
  const eliminarIndustria = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarIndustria(id);
    setIndustrias(prev => prev.filter(i => i.id !== id));
  };

  const crearMonedaImpuestoUnidad = async (item) => {
    const payload = {
      ...item,
      tipo: item.tipo || 'moneda',
      codigo: String(item.codigo || '').trim().toUpperCase(),
      estado: item.estado || 'activo',
    };
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearMonedaImpuestoUnidad(empresa.id, payload);
      setMonedasImpuestosUnidades(prev => [...prev, data]);
      return data;
    }
    const nuevo = { ...payload, id: generateId('miu'), empresa_id: empresa?.id };
    setMonedasImpuestosUnidades(prev => [...prev, nuevo]);
    return nuevo;
  };
  const actualizarMonedaImpuestoUnidad = async (id, datos) => {
    const payload = {
      ...datos,
      tipo: datos.tipo || 'moneda',
      codigo: String(datos.codigo || '').trim().toUpperCase(),
      estado: datos.estado || 'activo',
    };
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarMonedaImpuestoUnidad(id, payload);
      setMonedasImpuestosUnidades(prev => prev.map(i => i.id === id ? act : i));
      return act;
    }
    setMonedasImpuestosUnidades(prev => prev.map(i => i.id === id ? { ...i, ...payload } : i));
    return payload;
  };
  const eliminarMonedaImpuestoUnidad = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarMonedaImpuestoUnidad(id);
    setMonedasImpuestosUnidades(prev => prev.filter(i => i.id !== id));
  };

  const crearCentroCosto = async (datos) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearCentroCosto(empresa.id, datos);
      setCentrosCosto(prev => [...prev, data]);
      return data;
    }
    const nuevo = { ...datos, id: `ceco_${Date.now()}`, empresa_id: empresa?.id };
    setCentrosCosto(prev => [...prev, nuevo]);
    return nuevo;
  };
  const actualizarCentroCosto = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarCentroCosto(id, datos);
      setCentrosCosto(prev => prev.map(c => c.id === id ? act : c));
      return act;
    }
    setCentrosCosto(prev => prev.map(c => c.id === id ? { ...c, ...datos } : c));
    return datos;
  };
  const eliminarCentroCosto = async (id) => {
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('centros_costo').delete().eq('id', id);
      if (error) throw error;
    }
    setCentrosCosto(prev => prev.filter(c => c.id !== id));
  };
  const importarCentrosCosto = async (filas) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.importarCentrosCosto(empresa.id, filas);
      setCentrosCosto(await maestrosService.getCentrosCosto(empresa.id));
      return data;
    }
  };

  const crearCentroBeneficio = async (datos) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearCentroBeneficio(empresa.id, datos);
      setCentrosBeneficio(prev => [...prev, data]);
      return data;
    }
    const nuevo = { ...datos, id: `cebe_${Date.now()}`, empresa_id: empresa?.id };
    setCentrosBeneficio(prev => [...prev, nuevo]);
    return nuevo;
  };
  const actualizarCentroBeneficio = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarCentroBeneficio(id, datos);
      setCentrosBeneficio(prev => prev.map(c => c.id === id ? act : c));
      return act;
    }
    setCentrosBeneficio(prev => prev.map(c => c.id === id ? { ...c, ...datos } : c));
    return datos;
  };
  const eliminarCentroBeneficio = async (id) => {
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('centros_beneficio').delete().eq('id', id);
      if (error) throw error;
    }
    setCentrosBeneficio(prev => prev.filter(c => c.id !== id));
  };
  const importarCentrosBeneficio = async (filas) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.importarCentrosBeneficio(empresa.id, filas);
      setCentrosBeneficio(await maestrosService.getCentrosBeneficio(empresa.id));
      return data;
    }
  };

  const registrarProveedor = async (proveedor) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await comprasService.crearProveedor(empresa.id, proveedor);
      setProveedores(prev => [data, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'proveedores', entidad_id: data.id, accion: 'crear', valor_nuevo: data });
      return data;
    } else {
      const nuevo = { ...proveedor, id: generateId('prv'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setProveedores(prev => [nuevo, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'proveedores', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
      return nuevo;
    }
  };
  const actualizarProveedorCtx = async (id, cambios) => {
    const anterior = proveedores.find(p => p.id === id) || null;
    if (isSupabaseConfigured()) {
      const data = await comprasService.actualizarProveedor(id, cambios);
      setProveedores(prev => prev.map(p => p.id === id ? data : p));
      auditSync({ modulo: 'compras', entidad: 'proveedores', entidad_id: id, accion: 'editar', valor_anterior: anterior, valor_nuevo: data });
      return data;
    } else {
      setProveedores(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p));
      auditSync({ modulo: 'compras', entidad: 'proveedores', entidad_id: id, accion: 'editar', valor_anterior: anterior, valor_nuevo: cambios });
    }
  };
  const crearProcesoCompraCtx = async (proceso) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await comprasService.crearProcesoCompra(empresa.id, proceso);
      setProcesosCompra(prev => [data, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'procesos_compra', entidad_id: data.id, accion: 'crear', valor_nuevo: data });
      return data;
    } else {
      const nuevo = { ...proceso, id: generateId('pc'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setProcesosCompra(prev => [nuevo, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'procesos_compra', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
      return nuevo;
    }
  };
  const actualizarProcesoCompraCtx = async (id, cambios) => {
    if (isSupabaseConfigured()) {
      const data = await comprasService.actualizarProcesoCompra(id, cambios);
      setProcesosCompra(prev => prev.map(p => p.id === id ? data : p));
      return data;
    } else {
      setProcesosCompra(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p));
    }
  };
  const crearOrdenCompraCtx = async (oc) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await comprasService.crearOrdenCompra(empresa.id, oc);
      setOrdenesCompra(prev => [data, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'ordenes_compra', entidad_id: data.id, accion: 'crear', valor_nuevo: data });
      return data;
    } else {
      const nuevo = { ...oc, id: generateId('oc'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setOrdenesCompra(prev => [nuevo, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'ordenes_compra', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
      return nuevo;
    }
  };
  const crearOrdenServicioCtx = async (os) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await comprasService.crearOrdenServicio(empresa.id, os);
      setOrdenesServicio(prev => [data, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'ordenes_servicio_interna', entidad_id: data.id, accion: 'crear', valor_nuevo: data });
      return data;
    } else {
      const nuevo = { ...os, id: generateId('os'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setOrdenesServicio(prev => [nuevo, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'ordenes_servicio_interna', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
      return nuevo;
    }
  };
  const crearRecepcionCtx = async (recepcion) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await comprasService.crearRecepcion(empresa.id, recepcion);
      setRecepciones(prev => [data, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'recepciones', entidad_id: data.id, accion: 'crear', valor_nuevo: data });
      return data;
    } else {
      const nuevo = { ...recepcion, id: generateId('rec'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setRecepciones(prev => [nuevo, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'recepciones', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
      return nuevo;
    }
  };

  // ─── RRHH Mutators ────────────────────────────────────────────
  const registrarEvaluacionProveedorCtx = async ({ proveedor_id, origen_tipo, origen_id, puntaje, detalle = {}, resultado = 'conforme' }) => {
    if (!proveedor_id || !empresa?.id) return null;
    const fecha = new Date().toISOString().split('T')[0];
    const evaluacion = {
      id: generateId('eval_prv'),
      empresa_id: empresa.id,
      proveedor_id,
      tipo: origen_tipo === 'os' ? 'post_os' : 'post_oc',
      puntaje: Number(puntaje || 0),
      detalle: { ...detalle, origen_tipo, origen_id },
      resultado,
      evaluado_por: authUser?.id || null,
      fecha
    };

    let guardada = evaluacion;
    if (isSupabaseConfigured()) {
      try {
        guardada = await comprasService.registrarEvaluacionProveedor(empresa.id, evaluacion);
      } catch (error) {
        addNotificacion(`Evaluacion de proveedor no persistio en Supabase: ${error.message}`);
      }
    }

    const normalizeScore = ev => Number(ev.puntaje ?? ev.score ?? ev.score_homologacion ?? 0);
    const proveedorEvals = [...evaluacionesProveedor, guardada].filter(ev => ev.proveedor_id === proveedor_id);
    const scores = proveedorEvals.map(normalizeScore).filter(n => Number.isFinite(n) && n > 0);
    const promedio = scores.length ? Number((scores.reduce((sum, n) => sum + n, 0) / scores.length).toFixed(2)) : guardada.puntaje;
    const cambiosProveedor = { calificacion_promedio: promedio, total_evaluaciones: scores.length };

    setEvaluacionesProveedor(prev => [guardada, ...prev]);
    setProveedores(prev => prev.map(p => p.id === proveedor_id ? { ...p, ...cambiosProveedor } : p));
    auditSync({ modulo: 'compras', entidad: 'evaluaciones_proveedor', entidad_id: guardada.id, accion: 'crear', valor_nuevo: guardada });
    if (isSupabaseConfigured()) {
      comprasService.actualizarProveedor(proveedor_id, { calificacion_promedio: promedio })
        .catch(error => addNotificacion(`Score de proveedor no persistio en Supabase: ${error.message}`));
    }
    return guardada;
  };

  const registrarRecepcionConCxP = async ({ origenTipo, origenId, observaciones = '' }) => {
    const isOC = origenTipo === 'oc';
    const base = isOC
      ? ordenesCompra.find(o => o.id === origenId)
      : ordenesServicio.find(o => o.id === origenId);
    if (!base) {
      addNotificacion('Selecciona una orden valida para recepcionar.');
      return null;
    }

    const fecha = new Date().toISOString().split('T')[0];
    const fechaVencimiento = (() => {
      const d = new Date(`${fecha}T00:00:00`);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();
    const itemsRecibidos = isOC
      ? (base.items || []).map(item => ({
        descripcion: item.descripcion,
        pedido: item.cantidad,
        recibido: item.cantidad,
        unidad: item.unidad,
        conforme: !observaciones,
        precio_unitario: item.precio_unitario || 0
      }))
      : [];
    const recepcion = {
      id: generateId('rec'),
      empresa_id: empresa.id,
      codigo: `REC-${new Date().getFullYear()}-${String(recepciones.length + 1).padStart(4, '0')}`,
      orden_compra_id: isOC ? base.id : null,
      orden_servicio_id: isOC ? null : base.id,
      tipo: observaciones ? 'observada' : 'total',
      fecha,
      items_recibidos: itemsRecibidos,
      observaciones,
      estado: observaciones ? 'observada' : 'confirmada',
      recibido_por: authUser?.id || null,
      proveedor_id: base.proveedor_id,
      cxp_generada: !observaciones
    };

    let recepcionGuardada = recepcion;
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        recepcionGuardada = await comprasService.crearRecepcion(empresa.id, {
          id: recepcion.id,
          orden_compra_id: recepcion.orden_compra_id,
          orden_servicio_id: recepcion.orden_servicio_id,
          tipo: recepcion.tipo,
          fecha: recepcion.fecha,
          items_recibidos: recepcion.items_recibidos,
          observaciones: recepcion.observaciones,
          estado: recepcion.estado,
          recibido_por: recepcion.recibido_por
        });
      } catch (error) {
        addNotificacion(`Compras no persistio en Supabase: ${error.message}`);
      }
    }

    const recepcionLocal = { ...recepcion, ...recepcionGuardada, proveedor_id: base.proveedor_id, cxp_generada: !observaciones };
    setRecepciones(prev => [recepcionLocal, ...prev]);
    auditSync({ modulo: 'compras', entidad: 'recepciones', entidad_id: recepcionLocal.id, accion: 'registrar', valor_nuevo: recepcionLocal });

    if (isOC) {
      const cambios = { estado: 'cerrada', porcentaje_recibido: 100 };
      setOrdenesCompra(prev => prev.map(o => o.id === base.id ? { ...o, ...cambios } : o));
      if (isSupabaseConfigured()) comprasService.actualizarOrdenCompra(base.id, cambios).catch(error => addNotificacion(`Compras no persistio en Supabase: ${error.message}`));
      if (itemsRecibidos.length) {
        setInventario(prev => [...prev, ...itemsRecibidos.map((item, idx) => ({
          id: generateId('inv'),
          empresa_id: empresa.id,
          sku: `CMP-${Date.now()}-${idx}`,
          nombre: item.descripcion,
          categoria: 'Compras',
          almacen: 'ALM-001',
          unidad: item.unidad,
          stock_actual: item.recibido,
          costo_promedio: item.precio_unitario || 0
        }))]);
        if (isSupabaseConfigured() && !observaciones) {
          Promise.all(itemsRecibidos.map((item, idx) => comprasService.registrarEntradaInventario(empresa.id, {
            codigo: item.codigo || `CMP-${String(idx + 1).padStart(3, '0')}-${base.codigo || base.id}`,
            descripcion: item.descripcion,
            unidad: item.unidad,
            cantidad: item.recibido,
            precio_unitario: item.precio_unitario || 0,
            moneda: base.moneda || 'PEN',
            almacen_codigo: 'ALM-001'
          }, {
            tipo: 'recepcion',
            id: recepcion.id,
            observacion: `Entrada por recepcion ${recepcion.codigo}`
          }))).then(async () => {
            const invData = await comprasService.getInventario(empresa.id);
            if (invData?.length) setInventario(invData);
          }).catch(error => addNotificacion(`Inventario no persistio en Supabase: ${error.message}`));
        }
      }
    } else {
      const cambios = { estado: 'cerrada' };
      setOrdenesServicio(prev => prev.map(o => o.id === base.id ? { ...o, ...cambios } : o));
      if (isSupabaseConfigured()) comprasService.actualizarOrdenServicio(base.id, cambios).catch(error => addNotificacion(`Compras no persistio en Supabase: ${error.message}`));
    }

    await registrarEvaluacionProveedorCtx({
      proveedor_id: base.proveedor_id,
      origen_tipo: isOC ? 'oc' : 'os',
      origen_id: base.id,
      puntaje: observaciones ? 3.25 : 4.75,
      resultado: observaciones ? 'observado' : 'conforme',
      detalle: {
        documento: base.codigo || base.id,
        plazo: observaciones ? 3 : 5,
        calidad: observaciones ? 3 : 5,
        precio: 4,
        comunicacion: observaciones ? 3 : 5,
        observaciones
      }
    });

    if (!observaciones) {
      await generarCxP({
        proveedor_id: base.proveedor_id,
        factura_numero: `PROV-${base.codigo || base.id}`,
        fecha_emision: fecha,
        fecha_vencimiento: fechaVencimiento,
        monto_total: Number(base.total || 0),
        monto_pagado: 0,
        saldo: Number(base.total || 0),
        moneda: base.moneda || 'PEN',
        estado: 'por_pagar'
      });
    }

    addNotificacion(`Recepcion registrada. ${observaciones ? 'Quedo observada.' : 'CxP generada.'}`);
    return recepcionLocal;
  };

  const crearTecnicoCtx = async (persona) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.crearPersonalOperativo(empresa.id, persona);
      setPersonalOperativo(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...persona, id: generateId('pop'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setPersonalOperativo(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const actualizarTecnicoCtx = async (id, cambios) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.actualizarPersonalOperativo(id, cambios);
      setPersonalOperativo(prev => prev.map(p => p.id === id ? data : p));
      return data;
    }
    const actualizado = { ...cambios, id, updated_at: new Date().toISOString() };
    setPersonalOperativo(prev => prev.map(p => p.id === id ? { ...p, ...actualizado } : p));
    return actualizado;
  };
  const eliminarTecnicoCtx = async (id) => {
    if (isSupabaseConfigured() && empresa?.id) {
      await rrhhService.eliminarPersonalOperativo(id);
    }
    setPersonalOperativo(prev => prev.filter(p => p.id !== id));
    return id;
  };
  const crearAdminPersonalCtx = async (persona) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.crearPersonalAdmin(empresa.id, persona);
      setPersonalAdmin(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...persona, id: generateId('pad'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setPersonalAdmin(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const actualizarAdminPersonalCtx = async (id, cambios) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.actualizarPersonalAdmin(id, cambios);
      setPersonalAdmin(prev => prev.map(p => p.id === id ? data : p));
      return data;
    }
    const actualizado = { ...cambios, id, updated_at: new Date().toISOString() };
    setPersonalAdmin(prev => prev.map(p => p.id === id ? { ...p, ...actualizado } : p));
    return actualizado;
  };
  const eliminarAdminPersonalCtx = async (id) => {
    if (isSupabaseConfigured() && empresa?.id) {
      await rrhhService.eliminarPersonalAdmin(id);
    }
    setPersonalAdmin(prev => prev.filter(p => p.id !== id));
    return id;
  };
  const crearTurnoCtx = async (turno) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.crearTurno(empresa.id, turno);
      setTurnos(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...turno, id: generateId('tur'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setTurnos(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const actualizarTurnoCtx = async (id, turno) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.actualizarTurno(empresa.id, id, turno);
      setTurnos(prev => prev.map(t => t.id === id ? data : t));
      return data;
    } else {
      setTurnos(prev => prev.map(t => t.id === id ? { ...t, ...turno } : t));
    }
  };
  const eliminarTurnoCtx = async (id) => {
    if (isSupabaseConfigured()) {
      await rrhhService.eliminarTurno(id);
    }
    setTurnos(prev => prev.filter(t => t.id !== id));
  };
  const registrarAsistenciaCtx = async (registro) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.registrarAsistencia(empresa.id, registro);
      setRegistrosAsistencia(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...registro, id: generateId('ras'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setRegistrosAsistencia(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const crearPeriodoNominaCtx = async (periodo) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.crearPeriodoNomina(empresa.id, periodo);
      setPeriodosNomina(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...periodo, id: generateId('pnm'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setPeriodosNomina(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };

  const crearAgendaEvento = (evento) => {
    const nuevo = { ...evento, registrado_por: evento.registrado_por || evento.vendedor, id: generateId('evt'), empresa_id: empresa?.id };
    const nextAgenda = [nuevo, ...agendaEventos];
    setAgendaEventos(nextAgenda);
    if (nuevo.lead_id) {
      setLeads(prev => {
        const nextLeads = recalcularDiasSinActividadLeads(prev, actividades, nextAgenda);
        const leadActualizado = nextLeads.find(l => l.id === nuevo.lead_id);
        if (leadActualizado) {
          crmSync(sb => actualizarLead(sb, nuevo.lead_id, { dias_sin_actividad: leadActualizado.dias_sin_actividad }));
        }
        return nextLeads;
      });
    }
    crmSync(sb => persistirAgendaEvento(sb, empresa.id, nuevo));
    auditSync({ modulo: 'crm', entidad: 'agenda_comercial', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
    return nuevo;
  };

  const actualizarAgendaEvento = (id, datos) => {
    const anterior = agendaEventos.find(e => e.id === id) || null;
    const leadId = datos.lead_id || anterior?.lead_id || null;
    const nextAgenda = agendaEventos.map(e => e.id === id ? { ...e, ...datos } : e);
    setAgendaEventos(nextAgenda);
    if (leadId) {
      setLeads(prev => {
        const nextLeads = recalcularDiasSinActividadLeads(prev, actividades, nextAgenda);
        const leadActualizado = nextLeads.find(l => l.id === leadId);
        if (leadActualizado) {
          crmSync(sb => actualizarLead(sb, leadId, { dias_sin_actividad: leadActualizado.dias_sin_actividad }));
        }
        return nextLeads;
      });
    }
    crmSync(sb => actualizarAgendaEventoSvc(sb, id, datos));
    auditSync({ modulo: 'crm', entidad: 'agenda_comercial', entidad_id: id, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
  };

  // ─── PLANNER V2 ────────────────────────────────────────────────────────────
  /**
   * Carga las asignaciones del planner para la semana (o rango) indicado.
   * Guarda también el rango cargado para saber qué semana está en vista.
   */
  const loadPlannerSemana = async (fechaInicio, fechaFin) => {
    if (!empresa?.id) return;
    try {
      let data;
      if (isSupabaseConfigured()) {
        data = await plannerSvc.getAsignaciones(empresa.id, fechaInicio, fechaFin);
      } else {
        // modo mock: filter plannerAsignaciones por rango
        data = plannerAsignaciones.filter(a => a.fecha >= fechaInicio && a.fecha <= fechaFin);
      }
      setPlannerAsignaciones(data || []);
      setSemanaPlanner({ inicio: fechaInicio, fin: fechaFin });
    } catch (err) {
      addNotificacion(`Planner: no se pudo cargar la semana — ${err?.message || err}`);
    }
  };

  const mergePlannerAsignaciones = (items = []) => {
    if (!items.length) return;
    setPlannerAsignaciones(prev => [
      ...prev.filter(a => !items.some(c => c.id === a.id || (c.ot_id === a.ot_id && c.tecnico_id === a.tecnico_id && c.fecha === a.fecha))),
      ...items,
    ]);
  };

  /**
   * Crea asignaciones en lote (tecnico×día) para un rango.
   * Detecta conflictos antes de persistir y los retorna para que el UI muestre el warning.
   */
  const crearAsignacionesRango = async ({ otId, tecnicoIds, fechaInicio, fechaFin, horaInicio = null, horaFin = null, cuadrillaOrigenId = null, forzar = false }) => {
    if (!empresa?.id || !otId || !tecnicoIds?.length) return { conflictos: {}, creadas: [] };

    // Generar lista de días del rango
    const dias = [];
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      dias.push(d.toISOString().split('T')[0]);
    }

    let conflictos = {};
    if (isSupabaseConfigured() && !forzar) {
      conflictos = await plannerSvc.detectarConflictos(tecnicoIds, dias, empresa.id);
    }

    let creadas = [];
    if (isSupabaseConfigured()) {
      creadas = await plannerSvc.crearAsignacionesRango({
        otId, tecnicoIds, fechaInicio, fechaFin,
        horaInicio, horaFin,
        empresaId: empresa.id,
        cuadrillaOrigenId: cuadrillaOrigenId || null,
        createdBy: authUser?.id || null,
      });
      // Recargar la semana visible
      if (semanaPlanner) await loadPlannerSemana(semanaPlanner.inicio, semanaPlanner.fin);
      mergePlannerAsignaciones(creadas);
    } else {
      // Modo mock: generar objetos locales
      creadas = tecnicoIds.flatMap(tid =>
        dias.map(fecha => ({
          id: generateId('pa'),
          empresa_id: empresa.id,
          ot_id: otId,
          tecnico_id: tid,
          fecha,
          hora_inicio_estimada: horaInicio,
          hora_fin_estimada: horaFin,
          estado: 'programado',
          cuadrilla_origen_id: cuadrillaOrigenId || null,
        }))
      );
      mergePlannerAsignaciones(creadas);
    }

    auditSync({ modulo: 'planner', entidad: 'asignaciones', entidad_id: otId, accion: 'crear_rango', valor_nuevo: { tecnicoIds, fechaInicio, fechaFin } });
    addNotificacion(`Planner: ${creadas.length} asignaciones creadas para la OT.`);
    return { conflictos, creadas };
  };

  /**
   * Agrega un solo técnico a una OT en un día específico.
   */
  const agregarTecnicoADia = async ({ otId, tecnicoId, fecha, horaInicio = null, horaFin = null, cuadrillaOrigenId = null }) => {
    if (!empresa?.id) return null;
    try {
      let nueva;
      if (isSupabaseConfigured()) {
        nueva = await plannerSvc.agregarTecnicoDia({ 
          otId, tecnicoId, fecha, empresaId: empresa.id, 
          horaInicio, horaFin,
          cuadrillaOrigenId, createdBy: authUser?.id || null 
        });
        if (semanaPlanner) await loadPlannerSemana(semanaPlanner.inicio, semanaPlanner.fin);
        addNotificacion('Asignación guardada');
      } else {
        nueva = { 
          id: generateId('pa'), empresa_id: empresa.id, ot_id: otId, tecnico_id: tecnicoId, 
          fecha, hora_inicio_estimada: horaInicio, hora_fin_estimada: horaFin, 
          estado: 'programado' 
        };
        setPlannerAsignaciones(prev => [...prev, nueva]);
      }
      return nueva;
    } catch (err) {
      console.error('Error al agregar técnico:', err);
      addNotificacion('Error al asignar: ' + (err.message || 'Error desconocido'), 'error');
      return null;
    }
  };

  /**
   * Cancela una asignación específica con motivo.
   */
  const quitarTecnicoDeDia = async (asignacionId, motivo = '') => {
    if (isSupabaseConfigured()) {
      await plannerSvc.quitarTecnicoDia(asignacionId, motivo);
      setPlannerAsignaciones(prev => prev.filter(a => a.id !== asignacionId));
    } else {
      setPlannerAsignaciones(prev => prev.map(a => a.id === asignacionId ? { ...a, estado: 'cancelado', motivo_reprogramacion: motivo } : a));
    }
    auditSync({ modulo: 'planner', entidad: 'asignaciones', entidad_id: asignacionId, accion: 'cancelar', valor_nuevo: { motivo } });
  };

  /**
   * Actualiza fecha y/o horario de una asignación existente.
   */
  const actualizarAsignacionCtx = async (asignacionId, { fecha, horaInicio, horaFin }) => {
    if (isSupabaseConfigured()) {
      await plannerSvc.actualizarAsignacion(asignacionId, { fecha, horaInicio, horaFin });
      if (semanaPlanner) await loadPlannerSemana(semanaPlanner.inicio, semanaPlanner.fin);
    } else {
      setPlannerAsignaciones(prev => prev.map(a => a.id === asignacionId
        ? { ...a, ...(fecha !== undefined && { fecha }), hora_inicio_estimada: horaInicio || null, hora_fin_estimada: horaFin || null }
        : a));
    }
    auditSync({ modulo: 'planner', entidad: 'asignaciones', entidad_id: asignacionId, accion: 'actualizar', valor_nuevo: { fecha, horaInicio, horaFin } });
  };

  /**
   * Detecta técnicos con parte pendiente en los últimos 14 días.
   * Retorna un Set de "tecnicoId__fecha" con partes pendientes.
   */
  const partesPendientesSet = React.useMemo(() => {
    const hoy = new Date();
    const hace14 = new Date(hoy);
    hace14.setDate(hoy.getDate() - 14);
    const hace14Str = hace14.toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];

    // Asignaciones pasadas (entre hace14 y ayer)
    const asigPasadas = plannerAsignaciones.filter(a =>
      a.fecha >= hace14Str && a.fecha < hoyStr && a.estado !== 'cancelado'
    );
    // Partes registrados: map tecnicoId__fecha
    const partesRegistrados = new Set(
      partes.map(p => `${p?.['tecnico_id'] || p.tecnico}__${p.fecha}`)
    );
    const pendientes = new Set();
    asigPasadas.forEach(a => {
      const key = `${a?.['tecnico_id']}__${a.fecha}`;
      if (!partesRegistrados.has(key)) pendientes.add(key);
    });
    return pendientes;
  }, [plannerAsignaciones, partes]);

  /**
   * Crea una nueva cuadrilla y la agrega al estado.
   */
  const crearCuadrillaCtx = async ({ nombre, descripcion, especialidad, liderTecnicoId, tecnicoIds }) => {
    if (!empresa?.id) return null;
    let nueva;
    if (isSupabaseConfigured()) {
      nueva = await plannerSvc.crearCuadrilla({ nombre, descripcion, especialidadPrincipal: especialidad, liderTecnicoId, tecnicoIds, empresaId: empresa.id });
      const cuadData = await plannerSvc.getCuadrillas(empresa.id);
      setCuadrillas(cuadData || []);
    } else {
      const tecsList = personalOperativo.filter(p => tecnicoIds.includes(p.id));
      nueva = { id: generateId('cua'), empresa_id: empresa.id, nombre, descripcion, especialidad_principal: especialidad, lider_id: liderTecnicoId || null, activa: true };
      setCuadrillas(prev => [...prev, { ...nueva, cuadrilla_miembros: tecsList.map(t => ({ id: generateId('cm'), tecnico_id: t.id })) }]);
    }
    auditSync({ modulo: 'planner', entidad: 'cuadrillas', entidad_id: nueva?.id, accion: 'crear', valor_nuevo: { nombre, tecnicoIds } });
    addNotificacion(`Cuadrilla "${nombre}" creada.`);
    return nueva;
  };

  const actualizarCuadrillaCtx = async (id, { nombre, descripcion, especialidad, liderTecnicoId, tecnicoIds }) => {
    if (!empresa?.id) return;
    if (isSupabaseConfigured()) {
      await plannerSvc.actualizarCuadrilla(id, { nombre, descripcion, especialidadPrincipal: especialidad, liderTecnicoId, tecnicoIds });
      const cuadData = await plannerSvc.getCuadrillas(empresa.id);
      setCuadrillas(cuadData || []);
    } else {
      setCuadrillas(prev => prev.map(c => c.id === id
        ? { ...c, nombre, descripcion, especialidad_principal: especialidad, lider_id: liderTecnicoId || null, cuadrilla_miembros: tecnicoIds.map(tid => ({ tecnico_id: tid })) }
        : c));
    }
    addNotificacion('Cuadrilla actualizada');
  };
  const eliminarCuadrillaCtx = async (id) => {
    if (!empresa?.id) return;
    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('cuadrillas').update({ activa: false }).eq('id', id);
      if (error) throw error;
      setCuadrillas(prev => prev.filter(c => c.id !== id));
    } else {
      setCuadrillas(prev => prev.filter(c => c.id !== id));
    }
    addNotificacion('Cuadrilla eliminada');
  };

  const clonarRol = (rolId, nuevoNombre) => {
    const source = rolesCtx[rolId];
    if (!source) { addNotificacion('Rol origen no encontrado.', 'error'); return; }
    const newId = isSupabaseConfigured() && empresa?.id
      ? `rol_${empresa.id}_${Math.random().toString(36).slice(2, 7)}`
      : `rol_${Math.random().toString(36).slice(2, 7)}`;
    const nuevo = { ...source, nombre: nuevoNombre, descripcion: `Copia de ${source.nombre}` };
    setRolesCtx(prev => ({ ...prev, [newId]: nuevo }));
    if (isSupabaseConfigured() && empresa?.id) {
      rolesService.crearRol({
        id: newId,
        empresa_id: empresa.id,
        nombre: nuevoNombre,
        descripcion: `Copia de ${source.nombre}`,
        categoria: source.categoria || 'otro',
        nivel_jerarquico: source.nivel_jerarquico || 'operativo',
        es_superadmin: false,
        es_admin_empresa: Boolean(source.es_admin_empresa),
        activo: true,
      }).then(() => {
        const permisos = MOCK.pantallasPermisos.map(p => ({
          pantalla: p.key,
          puede_ver: Boolean(source.permisos?.ver === true || source.permisos?.ver?.includes?.(p.key)),
          puede_crear: Boolean(source.permisos?.crear === true || source.permisos?.crear?.includes?.(p.key)),
          puede_editar: Boolean(source.permisos?.editar === true || source.permisos?.editar?.includes?.(p.key)),
          puede_anular: Boolean(source.permisos?.anular === true || source.permisos?.anular?.includes?.(p.key)),
          puede_aprobar: Boolean(source.permisos?.aprobar === true || source.permisos?.aprobar?.includes?.(p.key)),
          puede_exportar: Boolean(source.permisos?.exportar === true || source.permisos?.exportar?.includes?.(p.key)),
          puede_ver_costos: Boolean(source.permisos?.ver_costos),
          puede_ver_finanzas: Boolean(source.permisos?.ver_finanzas),
        }));
        return rolesService.actualizarPermisos(newId, permisos);
      }).catch(error => {
        addNotificacion(`No se pudo guardar el rol en Supabase: ${error.message}`, 'error');
      });
    }
    addNotificacion(`Rol "${nuevoNombre}" creado.`);
    return newId;
  };

  const permisoPantallaActivo = (permisos, key, pantalla) => {
    const current = permisos?.[key];
    if (Array.isArray(current)) return current.includes(pantalla);
    return current === true || permisos?.todo;
  };

  const buildPermisosPayload = (permisos = {}) => MOCK.pantallasPermisos.map(p => ({
    pantalla: p.key,
    puede_ver: permisoPantallaActivo(permisos, 'ver', p.key),
    puede_crear: permisoPantallaActivo(permisos, 'crear', p.key),
    puede_editar: permisoPantallaActivo(permisos, 'editar', p.key),
    puede_anular: permisoPantallaActivo(permisos, 'anular', p.key),
    puede_aprobar: permisoPantallaActivo(permisos, 'aprobar', p.key),
    puede_exportar: permisoPantallaActivo(permisos, 'exportar', p.key),
    puede_ver_costos: Boolean(permisos.ver_costos || permisos.todo),
    puede_ver_finanzas: Boolean(permisos.ver_finanzas || permisos.todo),
    permisos_extra: { puede_ver_precios: Boolean(permisos.ver_precios || permisos.todo) },
  }));

  const actualizarPermisosRol = (rolId, pantalla, key, value) => {
    const PER_SCREEN = ['ver', 'crear', 'editar', 'anular', 'aprobar', 'exportar'];
    setRolesCtx(prev => {
      const r = { ...prev[rolId] };
      if (!r.permisos) r.permisos = { ver: [] };
      if (PER_SCREEN.includes(key)) {
        const current = r.permisos[key];
        let arr = Array.isArray(current)
          ? [...current]
          : (current === true ? MOCK.pantallasPermisos.map(p => p.key) : []);
        if (value) { if (!arr.includes(pantalla)) arr.push(pantalla); }
        else { arr = arr.filter(k => k !== pantalla); }
        r.permisos = { ...r.permisos, [key]: arr };
      } else {
        r.permisos = { ...r.permisos, [key]: value };
      }
      return { ...prev, [rolId]: r };
    });
  };

  const guardarPermisosRol = async (rolId) => {
    const rol = rolesCtx[rolId];
    if (!rol) throw new Error('Rol no encontrado.');
    if (!isSupabaseConfigured()) {
      addNotificacion('Permisos guardados localmente.');
      return true;
    }
    const payload = buildPermisosPayload(rol.permisos);
    await rolesService.actualizarPermisos(rolId, payload);
    await cargarRolesAcceso();
    addNotificacion(`Permisos de "${rol.nombre}" guardados.`);
    return true;
  };

  const cargarRolesAcceso = async () => {
    if (!empresa?.id) return {};
    const { roles: rolesData, permisos: permisosData } = await rolesService.getRolesConPermisos(empresa.id);
    const rolesObj = rolesConPermisosAObjeto(rolesData, permisosData);
    setRolesCtx(rolesObj);
    setAccessDebug(prev => ({ ...prev, rolesError: '', rolesLoading: false, rolesLoadedAt: new Date().toLocaleTimeString('es-PE') }));
    return rolesObj;
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!authSession?.user?.id || !empresa?.id || !membresiaActiva?.rol_id) return;
    cargarRolesAcceso().catch(error => {
      console.error('Error reloading roles from Supabase:', error);
      setAccessDebug(prev => ({ ...prev, rolesError: error.message || 'Error desconocido' }));
      addNotificacion(`No se pudieron cargar roles desde Supabase: ${error.message}`, 'error');
    });
  }, [authSession?.user?.id, empresa?.id, membresiaActiva?.rol_id]);

  const crearRol = async (rolData) => {
    const newId = isSupabaseConfigured() && empresa?.id
      ? `rol_${empresa.id}_${Math.random().toString(36).slice(2, 7)}`
      : `rol_${Math.random().toString(36).slice(2, 7)}`;
    setRolesCtx(prev => ({ ...prev, [newId]: { nombre: rolData.nombre, descripcion: rolData.descripcion || '', categoria: rolData.categoria || 'otro', nivel_jerarquico: rolData.nivel_jerarquico || 'operativo', color: 'blue', permisos: { ver: [] } } }));
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        await rolesService.crearRol({
          id: newId,
          empresa_id: empresa.id,
          nombre: rolData.nombre,
          descripcion: rolData.descripcion || '',
          categoria: rolData.categoria || 'otro',
          nivel_jerarquico: rolData.nivel_jerarquico || 'operativo',
          es_superadmin: false,
          es_admin_empresa: false,
          activo: true,
        });
        await rolesService.actualizarPermisos(newId, MOCK.pantallasPermisos.map(p => ({
          pantalla: p.key,
          puede_ver: false,
          puede_crear: false,
          puede_editar: false,
          puede_anular: false,
          puede_aprobar: false,
          puede_exportar: false,
          puede_ver_costos: false,
          puede_ver_finanzas: false,
        })));
        await cargarRolesAcceso();
      } catch (error) {
        setRolesCtx(prev => { const next = { ...prev }; delete next[newId]; return next; });
        addNotificacion(`No se pudo guardar el rol en Supabase: ${error.message}`, 'error');
        return null;
      }
    }
    addNotificacion(`Rol "${rolData.nombre}" creado.`);
    return newId;
  };

  const eliminarRol = async (rolId) => {
    if (isSupabaseConfigured()) {
      try {
        await rolesService.eliminarRol(rolId);
        await cargarRolesAcceso();
      } catch (error) {
        const message = `No se pudo eliminar el rol en Supabase: ${error.message}`;
        addNotificacion(message, 'error');
        setAccessDebug(prev => ({ ...prev, rolesError: message }));
        try { window.alert(message); } catch {}
        return false;
      }
    } else {
      setRolesCtx(prev => { const next = { ...prev }; delete next[rolId]; return next; });
    }
    addNotificacion('Rol eliminado.');
    return true;
  };

  const editarRol = (rolId, datos) => {
    setRolesCtx(prev => ({ ...prev, [rolId]: { ...prev[rolId], ...datos } }));
    if (isSupabaseConfigured()) {
      rolesService.actualizarRol(rolId, datos).catch(error => {
        addNotificacion(`No se pudo actualizar el rol en Supabase: ${error.message}`, 'error');
      });
    }
  };

  const monedasActivas = (() => {
    const list = (monedasImpuestosUnidades || []).filter(m => m.tipo === 'moneda' && m.estado === 'activo');
    return list.length ? list : [{ codigo: empresa?.moneda || 'PEN', nombre: 'Moneda base' }];
  })();

  const usuarioActual = authUser
    ? usuarios.find(u => u.id === authUser.id || u.email === authUser.email)
    : null;
  const esSuperadminPlataforma = Boolean(
    isSupabaseConfigured()
      ? todasMembresias.some(m => m.rol?.es_superadmin && m.empresa?.es_plataforma)
      : role?.permisos?.todo
  );
  const authUserConAcceso = authUser ? {
    ...authUser,
    ...usuarioActual,
    id: authUser.id,
    email: authUser.email,
    nombre: usuarioActual?.nombre || authUser.user_metadata?.nombre || authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
    rol: usuarioActual?.rol || membresiaActiva?.rol_id || authUser.rol,
    empresa_id: empresa?.id || usuarioActual?.empresa_id,
    asignaciones: usuarioActual?.asignaciones || [],
    jefe_user_id: usuarioActual?.jefe_user_id || null,
    nivel_jerarquico: usuarioActual?.nivel_jerarquico || membresiaActiva?.rol?.nivel_jerarquico || (esSuperadminPlataforma ? 'direccion' : undefined),
    rol_categoria: usuarioActual?.rol_categoria || membresiaActiva?.rol?.categoria || (esSuperadminPlataforma ? 'admin' : undefined),
    es_admin_empresa: Boolean(usuarioActual?.es_admin_empresa || membresiaActiva?.rol?.es_admin_empresa),
    es_superadmin: Boolean(usuarioActual?.es_superadmin || membresiaActiva?.rol?.es_superadmin || esSuperadminPlataforma),
    superadmin_plataforma: esSuperadminPlataforma,
  } : null;

  const contextValue = {
    active, navigate, activeParams,
    roleKey, setRoleKey, role, isSuperadmin,
    empresa, setEmpresa,
    dark, setDark,
    mobileMode, setMobileMode,
    mobileProfile, setMobileProfile,
    authSession, authUser: authUserConAcceso, authLoading, authError,
    signInWithPassword, signUpWithPassword, signOut,
    searchQuery: '',
    dataMode, supabaseStatus, reloadSupabaseFinanceData: loadSupabaseFinanceData,
    todasMembresias, membresiaActiva, membresiaCargando, seleccionarEmpresa,
    empresasPlataforma, setEmpresasPlataforma, crearTenantConAdmin, actualizarTenant, eliminarTenant,
    // Data
    usuarios, setUsuarios,
    roles: rolesCtx, clonarRol, actualizarPermisosRol, guardarPermisosRol, crearRol, eliminarRol, editarRol, accessDebug,
    leads, setLeads, updateLeadState, historialEstados,
    campanas, setCampanas, crearCampana, actualizarCampana, cambiarEstadoCampana, eliminarCampana,
    cuentas, setCuentas, actualizarCuenta, actualizarLogoCuenta,
    contactos, setContactos, crearContactoCuenta, actualizarContactoCuenta,
    oportunidades, setOportunidades, oppHistorialEtapas,
    actividades, setActividades,
    agendaEventos, setAgendaEventos, crearAgendaEvento, actualizarAgendaEvento,
    hojasCosteo, setHojasCosteo, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo,
    cotizaciones, setCotizaciones, actualizarCotizacion,
    osClientes, setOsClientes, actualizarOSCliente,
    cxp, setCxp,
    cxpPagos, setCxpPagos,
    cxc, setCxc,
    cobrosHistorial, setCobrosHistorial,
    gestionesCobranza, setGestionesCobranza,
    comisiones, setComisiones,
    facturas, setFacturas,
    comprasGastos, setComprasGastos,
    financiamientos, setFinanciamientos,
    movimientosTesoreria, setMovimientosTesoreria,
    movimientosBanco, setMovimientosBanco,
    // Fase 2 Data
    ots, setOts,
    partes, setPartes,
    backlog, setBacklog,
    cierresTecnicos,
    inventario, setInventario,
    solpes, setSolpes,
    valorizaciones, setValorizaciones,
    proveedores, setProveedores,
    evaluacionesProveedor, setEvaluacionesProveedor,
    procesosCompra, setProcesosCompra,
    respuestasCompra, setRespuestasCompra,
    ordenesCompra, setOrdenesCompra,
    ordenesServicio, setOrdenesServicio,
    recepciones, setRecepciones,
    
    // Maestros Base Data
    areasEmpresa, setAreasEmpresa, crearArea, actualizarArea, eliminarArea,
    cargos, setCargos, actualizarCargo, eliminarCargo,
    especialidades, setEspecialidades, actualizarEspecialidad, eliminarEspecialidad,
    tiposServicio, setTiposServicio, actualizarTipoServicio, eliminarTipoServicio,
    almacenes, setAlmacenes, actualizarAlmacen, eliminarAlmacen,
    sedes, setSedes, actualizarSede, eliminarSede,
    industrias, setIndustrias, actualizarIndustria, eliminarIndustria,
    monedasImpuestosUnidades, setMonedasImpuestosUnidades, monedasActivas,
    crearMonedaImpuestoUnidad, actualizarMonedaImpuestoUnidad, eliminarMonedaImpuestoUnidad,
    centrosCosto, setCentrosCosto, crearCentroCosto, actualizarCentroCosto, eliminarCentroCosto, importarCentrosCosto,
    centrosBeneficio, setCentrosBeneficio, crearCentroBeneficio, actualizarCentroBeneficio, eliminarCentroBeneficio, importarCentrosBeneficio,

    // Actions
    crearLead, actualizarLeadDatos, eliminarLead, crearCuenta,
    convertirLead, descartarLead, reactivarLead,
    crearOportunidad, actualizarEtapaOportunidad, marcarGanada, marcarPerdida,
    actualizarAcuerdoComision, enviarAcuerdoAAprobacion, retirarAcuerdoComision, aprobarAcuerdoComision, rechazarAcuerdoComision, obtenerHistorialAcuerdo,
    crearCotizacion, aprobarCotizacion, aprobarCotizacionInterna, registrarAprobacionManual, subirVersionCotizacion,
    crearOSCliente, crearOSClienteManual, vincularCotizacionOS,
    registrarUsuario,
    eliminarUsuario,
    actualizarUsuarioAcceso,
    crearUsuarioConAcceso,
    marcarContrasenaActualizada,
    registrarActividad,
    actualizarActividad,
    // Fase 2 Actions
    convertirBacklogAOT, crearOT, crearOTDesdeOS, actualizarOT, eliminarOT, registrarParteDiario, actualizarBorradorParteDiario, aprobarParteDiario, observarParteDiario, rechazarParteDiario, cerrarTecnicamenteOT, actualizarCierreTecnico, crearSOLPE, generarValorizacion, aprobarValorizacion, anularValorizacion, actualizarDatosValorizacion,
    // Finanzas Actions
    emitirFactura, emitirFacturaConCxC, emitirFacturaDesdeValorizacion, anularFactura, emitirNotaCredito, emitirNotaDebito, generarCxC, registrarCobroCxC, registrarGestionCobranza, generarCxP, registrarPagoCxP, conciliarMovimientoBanco, conciliarMovimientoBancoConDocumento, registrarMovimientoManual,
    cuentasBancarias, setCuentasBancarias, crearCuentaBancaria, actualizarCuentaBancaria, eliminarCuentaBancaria,
    recibosHonorarios, setRecibosHonorarios,
    aprobarComision, rechazarComision, generarReciboHonorarios, confirmarReciboHonorarios,
    // Maestros Base Actions
    crearCargo, crearEspecialidad, crearTipoServicio, crearAlmacen, crearSede, crearIndustria,
    // Compras Actions
    registrarProveedor, actualizarProveedorCtx,
    crearProcesoCompraCtx, actualizarProcesoCompraCtx,
    crearOrdenCompraCtx, crearOrdenServicioCtx, crearRecepcionCtx, registrarRecepcionConCxP, registrarEvaluacionProveedorCtx,
    // Fase 3 Data
    personalOperativo, setPersonalOperativo,
    personalAdmin, setPersonalAdmin,
    vacacionesSolicitudes, setVacacionesSolicitudes,
    licencias, setLicencias,
    solicitudesRRHH, setSolicitudesRRHH,
    onboardings, setOnboardings,
    planesExito, setPlanesExito,
    healthScoresDetalle, setHealthScoresDetalle,
    churnPlanes, setChurnPlanes,
    renovaciones, setRenovaciones,
    npsEncuestas, setNpsEncuestas,
    referidos, setReferidos,
    casosExito, setCasosExito,
    iaLogs, setIaLogs,
    turnos, setTurnos,
    registrosAsistencia, setRegistrosAsistencia,
    periodosNomina, setPeriodosNomina,
    trabajadoresDatosNomina, setTrabajadoresDatosNomina,
    // Fase 3 Actions
    calcularHealthScore,
    // RRHH Actions
    crearTecnicoCtx, actualizarTecnicoCtx, eliminarTecnicoCtx,
    crearAdminPersonalCtx, actualizarAdminPersonalCtx, eliminarAdminPersonalCtx,
    crearTurnoCtx, actualizarTurnoCtx, eliminarTurnoCtx, registrarAsistenciaCtx, crearPeriodoNominaCtx,
    aprobarVacacion, rechazarVacacion,
    crearOnboarding, registrarNPS,
    generarRenovacion, crearPlanRetencion,
    registrarIaLog,
    // Planner v2
    plannerAsignaciones, setPlannerAsignaciones,
    cuadrillas, setCuadrillas,
    semanaPlanner,
    loadPlannerSemana,
    crearAsignacionesRango,
    agregarTecnicoADia,
    quitarTecnicoDeDia,
    actualizarAsignacionCtx,
    crearCuadrillaCtx,
    actualizarCuadrillaCtx,
    eliminarCuadrillaCtx,
    partesPendientesSet,
    notificaciones, markNotificacionesRead, addNotificacion,
    // Empresa Config
    empresaConfig, guardarEmpresaConfig, subirImagenEmpresa,
    seriesDocumentarias, slaPlantillas, diccionarioComercial, recargarParametrosGenerales,
    crearSerieDocumentaria, actualizarSerieDocumentaria, eliminarSerieDocumentaria,
    crearSlaPlantilla, actualizarSlaPlantilla, eliminarSlaPlantilla,
    crearDiccionarioComercial, actualizarDiccionarioComercial, eliminarDiccionarioComercial,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
