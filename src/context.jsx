import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { MOCK, PLATFORM_PERMISSION_SCREENS } from './data.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { getDataMode } from './lib/dataMode.js';
import { loadCrmFromSupabase, loadCsFromSupabase, persistirLead, actualizarLead, eliminarLead as eliminarLeadSvc, persistirCuenta, actualizarCuenta as svcActualizarCuenta, eliminarCuenta as eliminarCuentaSvc, persistirContacto, actualizarContacto, persistirOportunidad, actualizarOportunidad, persistirHojaCosteo, crearHojaCosteoRpc, crearHojaCosteoSociedadRpc, aprobarHojaCosteoRpc, aprobarHojaCosteoSociedadRpc, actualizarHojaCosteoSvc, persistirCotizacion, actualizarCotizacion as svcActualizarCotizacion, subirArchivoSustento, persistirOSCliente, actualizarOSCliente as svcActualizarOSCliente, eliminarOSClienteReabrirCotizacion, persistirAgendaEvento, actualizarAgendaEventoSvc, persistirActividadComercial, actualizarActividadComercial, subirLogoCuenta, insertarNotificacionesSistema, cargarNotificacionesSistema, marcarNotificacionLeida, marcarNotificacionesLeidas, insertarHistorialAcuerdo, cargarHistorialAcuerdo } from './services/crmService.js';
import { loadOpsFromSupabase, actualizarBacklog, persistirOT, crearOTDesdeOSRpc, actualizarOT as svcActualizarOT, eliminarOT as svcEliminarOT, persistirParteDiario, actualizarParteDiario as svcActualizarParteDiario, persistirCierreTecnico, consumirInventario, subirConformidadOT as svcSubirConformidadOT, upsertCostoOT as svcUpsertCostoOT, calcularCostoRealOT as svcCalcularCostoRealOT, calcularCostosComprometidosOT as svcCalcularCostosComprometidosOT, calcularCostosOS as svcCalcularCostosOS, crearTarea as svcCrearTarea, actualizarAvanceTarea as svcActualizarAvanceTarea, completarTarea as svcCompletarTarea, reabrirTarea as svcReabrirTarea, actualizarAvanceSupervisor as svcActualizarAvanceSupervisor, procesarCierreOTConTareas as svcProcesarCierreOTConTareas } from './services/operacionesService.js';
import {
  CONDICION_PAGO_DEFECTO_CXC,
  calcularFechaVencimientoCxC,
  finanzasService,
  resolverCondicionPagoCxC,
} from './services/finanzasService.js';
import { clasificarCoincidenciasCargo, maestrosService, normalizarNombreCargo } from './services/maestrosService.js';
import { CargoCreationDialog } from './components/CargoCreationDialog.jsx';
import { comprasService, devolucionesService } from './services/comprasService.js';
import { registrarEntrada, registrarEntradaOcPendienteFactura, registrarSalida, registrarTransferencia, registrarAjuste, reservarStock, liberarReserva, getKardex, getStockCompleto, iniciarConteo, listarConteos, guardarAvanceConteo, cerrarConteo, getAnaliticaInventario, getMaterialesBajoReorden, listarEntradasOcPendientesValorizacion, registrarConsumoOT as registrarConsumoOTSvc } from './services/inventarioService.js';
import { registrarTransferenciaIntercompania } from './services/transferenciasIntercompaniaService.js';
import { rrhhService } from './services/rrhhService.js';
import { reclutamientoService } from './services/reclutamientoService.js';
import * as plannerSvc from './services/plannerService.js';
import { auditoriaService } from './services/auditoriaService.js';
import { generarCodigoTenant, plataformaService } from './services/plataformaService.js';
import { usuariosService } from './services/usuariosService.js';
import {
  cargarContextoSociedades,
  PERFIL_SOCIEDAD,
  SOCIEDAD_TODAS_ID,
  resolverSociedadActiva,
} from './services/sociedadesService.js';
import { posicionesService } from './services/posicionesService.js';
import { rolesService } from './services/rolesService.js';
import { campanasService } from './services/campanasService.js';
import { presupuestosService } from './services/presupuestosService.js';
import * as evaluacionesDesempenoService from './services/evaluacionesDesempenoService.js';
import * as liquidacionesCeseService from './services/liquidacionesCeseService.js';
import * as solicitudesRrhhService from './services/solicitudesRrhhService.js';
import * as personalDocumentosService from './services/personalDocumentosService.js';
import { portalFase2Service, sha256Text, plantillaConstanciaHtml } from './services/portalFase2Service.js';
import { biometricoService } from './services/biometricoService.js';
import { whatsappService } from './services/whatsappService.js';
import { geofencingService } from './services/geofencingService.js';
import { tiposDocumentoService } from './services/tiposDocumentoService.js';
import * as tareosAdminService from './services/tareosAdminService.js';
import { AFP_PARAMETROS_DEFAULT, latestAfpParametros, nominaService } from './services/nominaService.js';
import { resolverSociedadContratoVigente, resolverSociedadDocumentoLaboral } from './services/nominaSociedadService.js';
import { resolverIdentidadEmisora } from './services/identidadEmisoraService.js';
import { getTipoCambioHoy, getTipoCambioPorFecha, convertirMonto as convertirMontoFn } from './services/tipoCambioService.js';
import {
  prepararDesvinculacionMovimientoCuenta,
  prepararVinculacionMovimientoCuenta,
} from './services/tesoreriaService.js';
import {
  getMateriales, crearMaterial as svcCrearMaterial, actualizarMaterial as svcActualizarMaterial, eliminarMaterial as svcEliminarMaterial,
  getFabricantes, crearFabricante as svcCrearFabricante, actualizarFabricante as svcActualizarFabricante,
  getMaterialGrupos, crearMaterialGrupo as svcCrearGrupo, actualizarMaterialGrupo as svcActualizarGrupo, eliminarMaterialGrupo as svcEliminarGrupo,
  getMaterialFamilias, crearMaterialFamilia as svcCrearFamilia, actualizarMaterialFamilia as svcActualizarFamilia, eliminarMaterialFamilia as svcEliminarFamilia,
  getMaterialSubfamilias, crearMaterialSubfamilia as svcCrearSubfamilia, actualizarMaterialSubfamilia as svcActualizarSubfamilia, eliminarMaterialSubfamilia as svcEliminarSubfamilia,
} from './services/materialService.js';
import { getActivos, crearActivo as svcCrearActivo, actualizarActivo as svcActualizarActivo, darBajaActivo as svcDarBajaActivo, importarActivosMasivo } from './services/activosService.js';
import {
  getGuias, crearGuia as svcCrearGuia, actualizarGuia as svcActualizarGuia,
  emitirGuia as svcEmitirGuia, marcarEnTransito as svcMarcarEnTransito,
  confirmarEntrega as svcConfirmarEntrega, anularGuia as svcAnularGuia,
  getTransportistas as svcGetTransportistas, crearTransportista as svcCrearTransportista,
  actualizarTransportista as svcActualizarTransportista,
  crearVehiculo as svcCrearVehiculo, crearConductor as svcCrearConductor,
} from './services/guiasService.js';
import {
  getOrdenesVenta, crearOrdenVenta as svcCrearOV, actualizarOrdenVenta as svcActualizarOV,
  confirmarOrdenVenta as svcConfirmarOV, anularOrdenVenta as svcAnularOV,
  getCatalogoVenta, crearProductoCatalogo as svcCrearProductoCatalogo,
} from './services/ventasService.js';
const AppContext = createContext();
const PLATFORM_SUPERADMIN_EMAIL = 'cristhianbalvin@gmail.com';
const isPlatformSuperadminEmail = email =>
  String(email || '').trim().toLowerCase() === PLATFORM_SUPERADMIN_EMAIL;

// Adjunta a cada usuario sus posiciones activas (Fase 3: modelo Unidad -> Posicion -> Persona),
// igual que ya se le adjunta `asignaciones`. Extraida para poder recomputarla tanto en la carga
// inicial como al refrescar posiciones tras una alta/cambio de puesto.
const construirUsuariosConPosiciones = (usrData, posicionesData, posicionesUsuariosData, unidadesData) => {
  const unidadNombrePorId = new Map(unidadesData.map(u => [u.id, u.nombre]));
  const unidadCategoriaPorId = new Map(unidadesData.map(u => [u.id, u.categoria || 'otro']));
  const posicionPorId = new Map(posicionesData.map(p => [p.id, p]));
  const asignacionPorId = new Map();
  usrData.forEach(u => (Array.isArray(u.asignaciones) ? u.asignaciones : []).forEach(a => {
    if (a?.id) asignacionPorId.set(a.id, a);
  }));
  const posicionesPorUsuario = new Map();
  posicionesUsuariosData.forEach(pu => {
    const posicion = posicionPorId.get(pu.posicion_id);
    if (!posicion) return;
    const asignacionOrigen = posicion.origen_asignacion_id ? asignacionPorId.get(posicion.origen_asignacion_id) : null;
    const lista = posicionesPorUsuario.get(pu.user_id) || [];
    lista.push({
      posicion_id: posicion.id,
      reporta_a_posicion_id: posicion.reporta_a_posicion_id,
      unidad_organizacional_id: posicion.unidad_organizacional_id,
      unidad_organizacional_nombre: unidadNombrePorId.get(posicion.unidad_organizacional_id) || null,
      unidad_organizacional_categoria: unidadCategoriaPorId.get(posicion.unidad_organizacional_id) || 'otro',
      principal: Boolean(asignacionOrigen?.principal),
    });
    posicionesPorUsuario.set(pu.user_id, lista);
  });
  return usrData.map(u => ({ ...u, posiciones: posicionesPorUsuario.get(u.id) || [] }));
};

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

// "Mi portal" (mi_espacio) incluye Solicitudes como funcionalidad base; se asigna
// automaticamente para que RRHH no tenga que marcar dos modulos por separado.
function conSolicitudesIncluido(mods = []) {
  return mods.includes('mi_espacio') && !mods.includes('solicitudes') ? [...mods, 'solicitudes'] : mods;
}

function buildRoleDePermisos(rol, permisosRows = [], acceso_campo = false, campo_modulos = []) {
  const esSuperadmin = rol?.es_superadmin || false;
  const esAdmin = esSuperadmin || rol?.es_admin_empresa || false;
  const especialesExtra = permisosRows.find(p => p.pantalla === '__especiales__')?.permisos_extra || {};
  const ver = permisosRows.filter(p => p.puede_ver).map(p => p.pantalla);
  const crear = permisosRows.filter(p => p.puede_crear).map(p => p.pantalla);
  const editar = permisosRows.filter(p => p.puede_editar).map(p => p.pantalla);
  const anular = permisosRows.filter(p => p.puede_anular).map(p => p.pantalla);
  const aprobar = permisosRows.filter(p => p.puede_aprobar).map(p => p.pantalla);
  const exportar = permisosRows.filter(p => p.puede_exportar).map(p => p.pantalla);
  const verFinanzas = esSuperadmin || permisosRows.some(p => p.puede_ver_finanzas);
  const verCostos = esSuperadmin || permisosRows.some(p => p.puede_ver_costos);
  const verPrecios = esSuperadmin || permisosRows.some(p => p.permisos_extra?.puede_ver_precios);
  const puedeAprobar = esSuperadmin || permisosRows.some(p => p.puede_aprobar);
  const verConsolidadoGrupo = esAdmin || especialesExtra.ver_consolidado_grupo === true;
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
      ver_precios: verPrecios,
      aprobar_descuentos: Boolean(esAdmin || especialesExtra.aprobar_descuentos || puedeAprobar),
      anular_documentos: Boolean(esAdmin || especialesExtra.anular_documentos),
      ver_agenda_equipo: esAdmin,
      ver_consolidado_grupo: verConsolidadoGrupo,
      acceso_campo: Boolean(esAdmin || especialesExtra.acceso_campo || acceso_campo),
      monto_max_compras: especialesExtra.monto_max_compras ?? 0,
      perfil_campo: especialesExtra.perfil_campo ?? null,
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
    const especialesExtra = pRows.find(p => p.pantalla === '__especiales__')?.permisos_extra || {};
    const esAdminRol = Boolean(r.es_admin_empresa || r.es_superadmin);
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
        ver_consolidado_grupo: Boolean(esAdminRol || especialesExtra.ver_consolidado_grupo === true),
        aprobar_descuentos: Boolean(esAdminRol || especialesExtra.aprobar_descuentos === true),
        anular_documentos: Boolean(esAdminRol || especialesExtra.anular_documentos === true),
        acceso_campo: Boolean(esAdminRol || especialesExtra.acceso_campo === true),
        monto_max_compras: especialesExtra.monto_max_compras ?? 0,
        perfil_campo: especialesExtra.perfil_campo ?? null,
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
  const [dataMode] = useState(getDataMode);
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
  const [perfilSociedad, setPerfilSociedad] = useState(PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD);
  const [sociedadesIdsAlcance, setSociedadesIdsAlcance] = useState(null);
  const [sociedadActiva, setSociedadActiva] = useState(null);
  const [sociedadesDisponibles, setSociedadesDisponibles] = useState([]);
  const sociedadLoadRequestRef = useRef(0);
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
  // Modelo Unidad Organizacional -> Posicion -> Persona (Fase 3). Se guardan aparte de
  // `usuarios` (que solo trae las posiciones ocupadas) para poder mostrar vacantes.
  const [posiciones, setPosiciones] = useState([]);
  const [posicionesUsuarios, setPosicionesUsuarios] = useState([]);
  const [unidadesOrganizacionales, setUnidadesOrganizacionales] = useState([]);
  const useSupabase = isSupabaseConfigured();
  const [leads, setLeads] = useState(useSupabase ? [] : MOCK.leads);
  const [historialEstados, setHistorialEstados] = useState([]);
  const [oppHistorialEtapas, setOppHistorialEtapas] = useState([]);
  const [cuentas, setCuentas] = useState(useSupabase ? [] : MOCK.cuentas);
  const [contactos, setContactos] = useState(useSupabase ? [] : MOCK.contactos);
  const [oportunidades, setOportunidades] = useState(useSupabase ? [] : MOCK.oportunidades);
  const [campanas, setCampanas] = useState(useSupabase ? [] : (MOCK.campanas || []));
  const [actividades, setActividades] = useState(useSupabase ? [] : MOCK.actividades);
  const [agendaEventos, setAgendaEventos] = useState(useSupabase ? [] : (MOCK.agendaEventos || []));
  const [hojasCosteo, setHojasCosteo] = useState(useSupabase ? [] : (MOCK.hojasCosteo || []));
  const [cotizaciones, setCotizaciones] = useState(useSupabase ? [] : MOCK.cotizaciones);
  const [osClientes, setOsClientes] = useState(useSupabase ? [] : MOCK.osClientes);
  const [cxp, setCxp] = useState(useSupabase ? [] : (MOCK.cxp || []));
  const [cxpPagos, setCxpPagos] = useState([]);
  const [cajaChica, setCajaChica] = useState([]);
  const [cxc, setCxc] = useState(useSupabase ? [] : (MOCK.cxc || []));
  const [cobrosHistorial, setCobrosHistorial] = useState([]);
  const cobrosEnProceso = useRef(new Set());
  const [gestionesCobranza, setGestionesCobranza] = useState([]);
  const [comisiones, setComisiones] = useState([]);
  const [recibosHonorarios, setRecibosHonorarios] = useState([]);
  const [cuentasBancarias, setCuentasBancarias] = useState(useSupabase ? [] : (MOCK.cuentasBancarias || []));
  const [facturas, setFacturas] = useState(useSupabase ? [] : (MOCK.facturas || []));
  const [comprasGastos, setComprasGastos] = useState(useSupabase ? [] : (MOCK.compras || []));
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestoPartidas, setPresupuestoPartidas] = useState([]);
  const [presupuestoAprobaciones, setPresupuestoAprobaciones] = useState([]);
  const [financiamientos, setFinanciamientos] = useState(useSupabase ? [] : (MOCK.financiamientos || []));
  const [movimientosTesoreria, setMovimientosTesoreria] = useState(useSupabase ? [] : (MOCK.movimientosTesoreria || []));
  const [movimientosBanco, setMovimientosBanco] = useState(useSupabase ? [] : (MOCK.movimientosBanco || []));


  // Fase 2 Data
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [ots, setOts] = useState(useSupabase ? [] : (MOCK.ots || []));
  const [partes, setPartes] = useState(useSupabase ? [] : (MOCK.partes || []));
  const [backlog, setBacklog] = useState(useSupabase ? [] : (MOCK.backlog || []));
  const [inventario, setInventario] = useState(useSupabase ? [] : (MOCK.inventario || []));
  const [inventarioConteos, setInventarioConteos] = useState([]);
  const [solpes, setSolpes] = useState(useSupabase ? [] : (MOCK.solpes || []));
  const [cierresTecnicos, setCierresTecnicos] = useState(useSupabase ? [] : (MOCK.cierresTecnicos || []));
  const [valorizaciones, setValorizaciones] = useState(useSupabase ? [] : (MOCK.valorizaciones || []));
  const [proveedores, setProveedores] = useState(useSupabase ? [] : (MOCK.proveedores || []));
  const [evaluacionesProveedor, setEvaluacionesProveedor] = useState(useSupabase ? [] : (MOCK.evaluacionesProveedor || []));
  const [procesosCompra, setProcesosCompra] = useState(useSupabase ? [] : (MOCK.procesosCompra || []));
  const [respuestasCompra, setRespuestasCompra] = useState(useSupabase ? [] : (MOCK.respuestasCompra || []));
  const [ordenesCompra, setOrdenesCompra] = useState(useSupabase ? [] : (MOCK.ordenesCompra || []));
  const [ocTransitos, setOcTransitos] = useState(useSupabase ? [] : (MOCK.ocTransitos || []));
  const [ordenesServicio, setOrdenesServicio] = useState(useSupabase ? [] : (MOCK.ordenesServicio || []));
  const [recepciones, setRecepciones] = useState(useSupabase ? [] : (MOCK.recepciones || []));
  const [devolucionesProveedor, setDevolucionesProveedor] = useState([]);
  const [entradasOcPendientes, setEntradasOcPendientes] = useState([]);

  // Configuración de empresa
  const [empresaConfig, setEmpresaConfig] = useState({});
  const [seriesDocumentarias, setSeriesDocumentarias] = useState(isSupabaseConfigured() ? [] : SERIES_DOCUMENTARIAS_DEFAULT);
  const [slaPlantillas, setSlaPlantillas] = useState(isSupabaseConfigured() ? [] : SLA_PLANTILLAS_DEFAULT);
  const [diccionarioComercial, setDiccionarioComercial] = useState(isSupabaseConfigured() ? [] : DICCIONARIO_COMERCIAL_DEFAULT);
  const [monedasImpuestosUnidades, setMonedasImpuestosUnidades] = useState([]);

  // Maestros Base Data
  const [areasEmpresa, setAreasEmpresa] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [cargoCreationRequest, setCargoCreationRequest] = useState(null);
  const [cargoCreationSaving, setCargoCreationSaving] = useState(false);
  const [tiposContrato, setTiposContrato] = useState([]);
  const [tiposDocumento, setTiposDocumento] = useState(useSupabase ? [] : (MOCK.tiposDocumento || []));
  const [requisitosCargo, setRequisitosCargo] = useState(useSupabase ? [] : (MOCK.requisitosCargo || []));
  const [especialidades, setEspecialidades] = useState([]);
  const [nivelesJerarquicos, setNivelesJerarquicos] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [industrias, setIndustrias] = useState([]);
  const [centrosCosto, setCentrosCosto] = useState([]);
  const [centrosBeneficio, setCentrosBeneficio] = useState([]);
  const [materialGrupos, setMaterialGrupos] = useState([]);
  const [materialFamilias, setMaterialFamilias] = useState([]);
  const [materialSubfamilias, setMaterialSubfamilias] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [fabricantes, setFabricantes] = useState([]);
  const [activos, setActivos] = useState([]);

  // Módulo Transporte y Guías (Fase 4)
  const [guiasRemision, setGuiasRemision] = useState(useSupabase ? [] : (MOCK.remisiones || []));
  const [ordenesVenta, setOrdenesVenta] = useState(useSupabase ? [] : (MOCK.ordenesVentaMock || []));
  const [transportistas, setTransportistas] = useState(useSupabase ? [] : (MOCK.transportistasMock || []));
  const [catalogoVenta, setCatalogoVenta] = useState(useSupabase ? [] : (MOCK.catalogoVentaMock || []));

  // Personal Operativo (separado del admin, estado propio)
  const [personalOperativo, setPersonalOperativo] = useState(useSupabase ? [] : (MOCK.personalOperativo || []));

  // Fase 3 Data
  const [personalAdmin, setPersonalAdmin] = useState([]);
  const [vacacionesSolicitudes, setVacacionesSolicitudes] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [solicitudesRRHH, setSolicitudesRRHH] = useState(useSupabase ? [] : (MOCK.solicitudesRRHH || []));
  const [personalDocumentos, setPersonalDocumentos] = useState(useSupabase ? [] : (MOCK.personalDocumentos || []));
  const [reclutamientoVacantes, setReclutamientoVacantes] = useState(useSupabase ? [] : (MOCK.reclutamientoVacantes || []));
  const [reclutamientoCandidaturas, setReclutamientoCandidaturas] = useState(useSupabase ? [] : (MOCK.reclutamientoCandidaturas || []));
  const [amonestacionesPersonal, setAmonestacionesPersonal] = useState(useSupabase ? [] : (MOCK.amonestacionesPersonal || []));
  const [portalDatosSolicitudes, setPortalDatosSolicitudes] = useState(useSupabase ? [] : (MOCK.portalDatosSolicitudes || []));
  const [portalConstanciasTrabajo, setPortalConstanciasTrabajo] = useState(useSupabase ? [] : (MOCK.portalConstanciasTrabajo || []));
  const [portalBoletaAcuses, setPortalBoletaAcuses] = useState(useSupabase ? [] : (MOCK.portalBoletaAcuses || []));
  const [portalBoletaVisualizaciones, setPortalBoletaVisualizaciones] = useState(useSupabase ? [] : (MOCK.portalBoletaVisualizaciones || []));
  const [portalFirmaRegistros, setPortalFirmaRegistros] = useState(useSupabase ? [] : (MOCK.portalFirmaRegistros || []));
  const [portalFirmaOtpIntentos, setPortalFirmaOtpIntentos] = useState(useSupabase ? [] : (MOCK.portalFirmaOtpIntentos || []));
  const [biometricoPerfiles, setBiometricoPerfiles] = useState(useSupabase ? [] : (MOCK.biometricoPerfiles || []));
  const [biometricoLotes, setBiometricoLotes] = useState(useSupabase ? [] : (MOCK.biometricoLotes || []));
  const [whatsappPlantillas, setWhatsappPlantillas] = useState(useSupabase ? [] : (MOCK.whatsappPlantillas || []));
  const [whatsappMatriz, setWhatsappMatriz] = useState(useSupabase ? [] : (MOCK.whatsappMatriz || []));
  const [whatsappEnvios, setWhatsappEnvios] = useState(useSupabase ? [] : (MOCK.whatsappEnvios || []));
  const [geocercas, setGeocercas] = useState(useSupabase ? [] : (MOCK.geocercas || []));
  const [geocercaAsignaciones, setGeocercaAsignaciones] = useState(useSupabase ? [] : (MOCK.geocercaAsignaciones || []));
  const [ubicacionConsentimientos, setUbicacionConsentimientos] = useState(useSupabase ? [] : (MOCK.ubicacionConsentimientos || []));
  const [asignacionesJornada, setAsignacionesJornada] = useState([]);
  const [evaluacionPlantillas, setEvaluacionPlantillas] = useState([]);
  const [evaluacionCompetencias, setEvaluacionCompetencias] = useState([]);
  const [evaluacionObjetivos, setEvaluacionObjetivos] = useState([]);
  const [evaluacionEvaluaciones, setEvaluacionEvaluaciones] = useState([]);
  const [evaluacionRespCompetencias, setEvaluacionRespCompetencias] = useState([]);
  const [evaluacionRespObjetivos, setEvaluacionRespObjetivos] = useState([]);
  const [liquidacionesCese,       setLiquidacionesCese]       = useState([]);
  const [liquidacionesConceptos,  setLiquidacionesConceptos]  = useState([]);
  const [onboardings, setOnboardings] = useState(useSupabase ? [] : (MOCK.onboardings || []));
  const [planesExito, setPlanesExito] = useState(useSupabase ? [] : (MOCK.planesExito || []));
  const [healthScoresDetalle, setHealthScoresDetalle] = useState(useSupabase ? [] : (MOCK.healthScoresDetalle || []));
  const [churnPlanes, setChurnPlanes] = useState(useSupabase ? [] : (MOCK.churnPlanes || []));
  const [renovaciones, setRenovaciones] = useState(useSupabase ? [] : (MOCK.renovaciones || []));
  const [npsEncuestas, setNpsEncuestas] = useState(useSupabase ? [] : (MOCK.npsEncuestas || []));
  const [referidos, setReferidos] = useState(useSupabase ? [] : (MOCK.referidos || []));
  const [casosExito, setCasosExito] = useState(useSupabase ? [] : (MOCK.casosExito || []));
  const [iaLogs, setIaLogs] = useState(useSupabase ? [] : (MOCK.iaLogs || []));
  // Planner v2
  const [plannerAsignaciones, setPlannerAsignaciones] = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);
  const [semanaPlanner, setSemanaPlanner] = useState(null); // { inicio, fin } de la semana cargada

  const [turnos, setTurnos] = useState(useSupabase ? [] : (MOCK.turnos || []));
  const [registrosAsistencia, setRegistrosAsistencia] = useState(useSupabase ? [] : (MOCK.registrosAsistencia || []));
  const [periodosNomina, setPeriodosNomina] = useState(useSupabase ? [] : (MOCK.periodosNomina || []));
  const [trabajadoresDatosNomina, setTrabajadoresDatosNomina] = useState(useSupabase ? {} : (MOCK.trabajadoresDatosNomina || {}));
  const [afpParametros, setAfpParametros] = useState(useSupabase ? AFP_PARAMETROS_DEFAULT : (MOCK.afpParametros || AFP_PARAMETROS_DEFAULT));
  const [ocAnticipos, setOcAnticipos] = useState([]);
  const [tipoCambioHoy, setTipoCambioHoy] = useState({ cargando: true, usd: null, eur: null, fecha: null, desactualizado: false });

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
    { id: 'f3_4', text: 'Onboarding de Facilities Lima SA: hito “Capacitación técnica” con 2 días de atraso. Revisar.', read: false, time: 'Hace 3h' },
    { id: 'f3_5', text: 'Nuevo lead referido por Logística Altiplano SAC en proceso de calificación.', read: true, time: 'Ayer' },
    { id: 'f3_6', text: 'Bienvenido al ERP TIDEO Fase 3 — Customer Success, BI Financiero e IA Copiloto activos.', read: true, time: 'Hace 2 días' },
    { id: 'notif_fin_001', tipo: 'alerta', modulo: 'financiamiento', text: 'BCP Préstamo — Cuota N°2 vence en 7 días · S/ 2,354.17', read: false, time: 'Hoy' },
    {
      id: 'notif_doc_mock_001',
      tipo: 'doc_por_vencer',
      title: 'Documento por vencer',
      text: 'Carlos Reyes · SCTR vence en 15 dias. Solicita la renovacion.',
      read: false,
      time: 'Hoy',
      priority: 'media',
      referenceType: 'personal_documento',
      referencePayload: { personal_id: 'pop_002', personal_tipo: 'operativo', tipo_documento_id: 'tdoc_m001' },
    },
  ]);

  const addNotificacion = (msg) => {
    const id = generateId('not');
    setNotificaciones(prev => [{ id, text: msg, read: false, time: 'Justo ahora' }, ...prev]);
    if (isSupabaseConfigured() && authUser?.id && empresa?.id) {
      getSupabaseClient().then(sb =>
        sb.from('notificaciones_sistema').insert({ empresa_id: empresa.id, user_id: authUser.id, texto: msg, leida: false })
      ).catch(() => {});
    }
  };

  const [toasts, setToasts] = useState([]);
  const addToast = (text, tipo = 'warning', link = null) => {
    const id = generateId('tst');
    setToasts(prev => [...prev, { id, text, tipo, link }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 12000);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const [accessDebug, setAccessDebug] = useState({
    build: 'access-debug-2026-05-05-01',
    usuariosError: '',
    rolesError: '',
    usuariosLoading: false,
    rolesLoading: false,
    usuariosLoadedAt: '',
    rolesLoadedAt: '',
  });
  const markNotificacionesRead = (id = null) => {
    let idsDb = [];
    setNotificaciones(prev => prev.map(n => {
      const shouldMark = id ? n.id === id : !n.read;
      if (shouldMark && n._db) idsDb.push(n.id);
      return shouldMark ? { ...n, read: true } : n;
    }));
    if (isSupabaseConfigured() && authUser?.id) {
      getSupabaseClient().then(sb => {
        if (id) return marcarNotificacionLeida(sb, id);
        return marcarNotificacionesLeidas(sb, authUser.id, idsDb);
      }).catch(() => {});
    }
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
    setPerfilSociedad(PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD);
    setSociedadActiva(null);
    setSociedadesDisponibles([]);
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
      if (!empresaId) {
        setSupabaseStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      setValorizaciones([]);
      setFacturas([]);
      setCxc([]);
      setCxp([]);
      setCxpPagos([]);
      setMovimientosBanco([]);

      const safeFinanceLoad = async (label, loader, fallback = []) => {
        try {
          return await loader();
        } catch (error) {
          console.error(`[finanzas:${label}]`, error?.message || error, error);
          return fallback;
        }
      };

      const safeSupabaseData = async (label, request, fallback = []) => (
        safeFinanceLoad(label, async () => {
          const { data, error } = await request;
          if (error) throw error;
          return data || fallback;
        }, fallback)
      );

      const scoped = table => supabase.from(table).select('*').eq('empresa_id', empresaId);
      const [
        financiamientosData,
        amortizacion,
        pagos,
        gastosData,
        tesoreriaData,
      ] = await Promise.all([
        safeSupabaseData('financiamientos', scoped('financiamientos').order('fecha_desembolso', { ascending: false })),
        safeSupabaseData('tabla_amortizacion', scoped('tabla_amortizacion').order('numero', { ascending: true })),
        safeSupabaseData('pagos_financiamiento', scoped('pagos_financiamiento').order('fecha_pago', { ascending: false })),
        safeSupabaseData('compras_gastos', scoped('compras_gastos').order('fecha', { ascending: false })),
        safeSupabaseData('movimientos_tesoreria', scoped('movimientos_tesoreria').order('fecha', { ascending: false })),
      ]);

      const [
        valData,
        facData,
        cxcData,
        cxpData,
        cxpPagosData,
        mbData,
        ccData,
      ] = await Promise.all([
        safeFinanceLoad('valorizaciones', () => finanzasService.getValorizaciones(empresaId)),
        safeFinanceLoad('facturas', () => finanzasService.getFacturas(empresaId)),
        safeFinanceLoad('cxc', () => finanzasService.getCxC(empresaId)),
        safeFinanceLoad('cxp', () => finanzasService.getCxP(empresaId)),
        safeFinanceLoad('cxp_pagos', () => finanzasService.getCxpPagos(empresaId)),
        safeFinanceLoad('movimientos_banco', () => finanzasService.getMovimientosBanco(empresaId)),
        safeFinanceLoad('caja_chica', () => finanzasService.getCajaChica(empresaId)),
      ]);

      const financiamientosConDetalle = (financiamientosData || []).map(financiamiento => ({
        ...financiamiento,
        tabla_amortizacion: amortizacion.filter(cuota => cuota.financiamiento_id === financiamiento.id),
        pagos_realizados: pagos.filter(pago => pago.financiamiento_id === financiamiento.id),
      }));

      setFinanciamientos(financiamientosConDetalle);
      setComprasGastos(gastosData || []);
      setMovimientosTesoreria(tesoreriaData || []);

      setValorizaciones(valData || []);
      setFacturas(facData || []);
      setCxc(cxcData || []);
      setCxp(cxpData || []);
      setCxpPagos(cxpPagosData || []);
      setMovimientosBanco(mbData || []);
      setCajaChica(ccData || []);

      // presupuestos
      const [preData, ppaData, papData] = await Promise.all([
        safeFinanceLoad('presupuestos', () => presupuestosService.getPresupuestos(empresaId)),
        safeFinanceLoad('presupuesto_partidas', () => presupuestosService.getPartidas(empresaId)),
        safeFinanceLoad('presupuesto_aprobaciones', () => presupuestosService.getAprobaciones(empresaId)),
      ]);
      setPresupuestos(preData || []);
      setPresupuestoPartidas(ppaData || []);
      setPresupuestoAprobaciones(papData || []);

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
    const puedeListarRoles = Boolean(
      membresiaActiva?.rol?.es_admin_empresa ||
      membresiaActiva?.rol?.es_superadmin ||
      (membresiaActiva?.permisos_rows || []).some(p => p.pantalla === 'roles' && p.puede_ver)
    );

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
      const [usuariosResult, rolesResult, posicionesResult, posicionesUsuariosResult, unidadesResult] = await Promise.allSettled([
        usuariosService.getUsuarios(empresaId),
        puedeListarRoles ? rolesService.getRolesConPermisos(empresaId) : Promise.resolve(null),
        posicionesService.getPosiciones(empresaId),
        posicionesService.getPosicionesUsuarios(empresaId),
        posicionesService.getUnidadesOrganizacionales(empresaId),
      ]);

      if (!mounted) return;

      if (usuariosResult.status === 'fulfilled') {
        const usrData = usuariosResult.value || [];

        // Adjunta a cada usuario sus posiciones activas (Fase 3: modelo Unidad -> Posicion -> Persona),
        // igual que ya se le adjunta `asignaciones`. Degrada con lista vacia si la carga falla.
        const posicionesData = posicionesResult.status === 'fulfilled' ? (posicionesResult.value || []) : [];
        const posicionesUsuariosData = posicionesUsuariosResult.status === 'fulfilled' ? (posicionesUsuariosResult.value || []) : [];
        const unidadesData = unidadesResult.status === 'fulfilled' ? (unidadesResult.value || []) : [];
        const usrDataConPosiciones = construirUsuariosConPosiciones(usrData, posicionesData, posicionesUsuariosData, unidadesData);

        setUsuarios(usrDataConPosiciones);
        setPosiciones(posicionesData);
        setPosicionesUsuarios(posicionesUsuariosData);
        setUnidadesOrganizacionales(unidadesData);
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

      if (!puedeListarRoles) {
        setAccessDebug(prev => ({ ...prev, rolesError: '', rolesLoading: false }));
      } else if (rolesResult.status === 'fulfilled') {
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
        setProveedores([]);
        setEvaluacionesProveedor([]);
        setSolpes([]);
        setProcesosCompra([]);
        setOrdenesCompra([]);
        setOcTransitos([]);
        setOrdenesServicio([]);
        setRecepciones([]);
        setDevolucionesProveedor([]);
        setInventario([]);
        setInventarioConteos([]);
        setPersonalOperativo([]);
        setPersonalAdmin([]);
        setTurnos([]);
        setRegistrosAsistencia([]);
        setPeriodosNomina([]);
        setEvaluacionPlantillas([]);
        setEvaluacionCompetencias([]);
        setEvaluacionObjetivos([]);
        setEvaluacionEvaluaciones([]);
        setEvaluacionRespCompetencias([]);
        setEvaluacionRespObjetivos([]);

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
          // Fase 3: areasEmpresa ahora se nutre de unidades_organizacionales (mismo id/nombre/estado
          // que las areas migradas en la Fase 1), asi todos sus consumidores de solo lectura
          // (SOLPE, documentos de personal, reclutamiento) leen del modelo nuevo sin tocarlos.
          const ar = await posicionesService.getUnidadesOrganizacionales(empresa.id);
          const cg = await maestrosService.getCargos(empresa.id);
          const tc = await rrhhService.getTiposContrato(empresa.id);
          const es = await maestrosService.getEspecialidades(empresa.id);
          const nj = await maestrosService.getNivelesJerarquicos(empresa.id);
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
            setTiposContrato(tc || []);
            setEspecialidades(es || []);
            setNivelesJerarquicos(nj || []);
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
          const conteosData = await listarConteos(empresa.id);
          if (mounted) setInventarioConteos(conteosData || []);
        } catch (_err) { /* tabla WMS pendiente */ }

        try {
          const [mg, mf, ms, mat, fab] = await Promise.all([
            getMaterialGrupos(empresa.id),
            getMaterialFamilias(empresa.id),
            getMaterialSubfamilias(empresa.id),
            getMateriales(empresa.id),
            getFabricantes(empresa.id),
          ]);
          if (mounted) {
            setMaterialGrupos(mg || []);
            setMaterialFamilias(mf || []);
            setMaterialSubfamilias(ms || []);
            setMateriales(mat || []);
            setFabricantes(fab || []);
          }
        } catch (_err) { /* tabla aún no existe */ }

        try {
          const act = await getActivos(empresa.id);
          if (mounted) setActivos(act || []);
        } catch (_err) { /* tabla activos aún no aplicada */ }

        try {
          const [guias, ovs, trans, cat] = await Promise.all([
            getGuias(empresa.id),
            getOrdenesVenta(empresa.id),
            svcGetTransportistas(empresa.id),
            getCatalogoVenta(empresa.id),
          ]);
          if (mounted) {
            setGuiasRemision(guias || []);
            setOrdenesVenta(ovs || []);
            setTransportistas(trans || []);
            setCatalogoVenta(cat || []);
          }
        } catch (_err) { /* migración 211 pendiente */ }

        try {
          const { data: cfgData } = await supabase.from('empresa_config').select('*').eq('empresa_id', empresa.id).maybeSingle();
          if (mounted) setEmpresaConfig(cfgData || {});
          const afpData = await nominaService.getAfpParametros(empresa.id);
          if (mounted) setAfpParametros(afpData || AFP_PARAMETROS_DEFAULT);
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
            if (cuentasBanData) setCuentasBancarias(cuentasBanData);
            if (comisionesData) setComisiones(comisionesData);
            if (recibosData) setRecibosHonorarios(recibosData);
          }
        } catch (_err) { /* tabla aún no existe, ignorar */ }

        try {
          const [prvData, evalData, slpData, pcData, ocData, transData, osData, recData, invData, devData, grniData] = await Promise.all([
            comprasService.getProveedores(empresa.id),
            comprasService.getEvaluacionesProveedor(empresa.id),
            comprasService.getSolpes(empresa.id),
            comprasService.getProcesosCompra(empresa.id),
            comprasService.getOrdenesCompra(empresa.id),
            comprasService.getOrdenCompraTransitos(empresa.id),
            comprasService.getOrdenesServicio(empresa.id),
            comprasService.getRecepciones(empresa.id),
            comprasService.getInventario(empresa.id),
            devolucionesService.getDevolucionesProveedor(empresa.id),
            comprasService.listarEntradasOcPendientesValorizacion(empresa.id),
          ]);
          if (mounted) {
            setProveedores(prvData || []);
            setEvaluacionesProveedor(evalData || []);
            setSolpes(slpData || []);
            setProcesosCompra(pcData || []);
            setOrdenesCompra(ocData || []);
            setOcTransitos(transData || []);
            setOrdenesServicio(osData || []);
            setRecepciones(recData || []);
            setInventario(invData || []);
            setDevolucionesProveedor(devData || []);
            setEntradasOcPendientes(grniData || []);
          }
        } catch (_err) { /* keep mock */ }

        try {
          const [persOpsData, persAdmData, turnosData, asistenciaData, nominaData, asigJornadaData] = await Promise.all([
            rrhhService.getPersonalOperativo(empresa.id),
            rrhhService.getPersonalAdmin(empresa.id),
            rrhhService.getTurnos(empresa.id),
            rrhhService.getAsistencia(empresa.id),
            rrhhService.getPeriodosNomina(empresa.id),
            rrhhService.getAsignacionesJornada(empresa.id),
          ]);
          if (mounted) {
            setPersonalOperativo(persOpsData || []);
            setPersonalAdmin(persAdmData || []);
            setTurnos(turnosData || []);
            setRegistrosAsistencia(asistenciaData || []);
            setPeriodosNomina(nominaData || []);
            setAsignacionesJornada(asigJornadaData || []);
          }
        } catch (_err) {
          if (mounted) {
            setPersonalOperativo([]);
            setPersonalAdmin([]);
          }
        }

        try {
          const [solData, pdocsData] = await Promise.all([
            solicitudesRrhhService.cargarSolicitudes(empresa.id),
            personalDocumentosService.getDocumentosActivos(empresa.id),
          ]);
          if (mounted) {
            setSolicitudesRRHH(solData || []);
            setPersonalDocumentos(pdocsData || []);
          }
        } catch (_err) { /* módulo documental puede no estar migrado aún */ }

        try {
          const [vacData, candData] = await Promise.all([
            reclutamientoService.getVacantes(empresa.id),
            reclutamientoService.getCandidaturas(empresa.id),
          ]);
          if (mounted) {
            setReclutamientoVacantes(vacData || []);
            setReclutamientoCandidaturas(candData || []);
          }
        } catch (_err) { /* modulo reclutamiento puede no estar migrado */ }

        try {
          const supabase = await getSupabaseClient();
          const { data: amonData } = await supabase
            .from('amonestaciones_personal')
            .select('*')
            .eq('empresa_id', empresa.id)
            .order('fecha', { ascending: false });
          if (mounted) setAmonestacionesPersonal(amonData || []);
        } catch (_err) { /* modulo amonestaciones puede no estar migrado */ }

        try {
          const portalData = await portalFase2Service.listar(empresa.id);
          if (mounted) {
            setPortalDatosSolicitudes(portalData.datosSolicitudes || []);
            setPortalConstanciasTrabajo(portalData.constancias || []);
            setPortalBoletaAcuses(portalData.boletaAcuses || []);
            setPortalBoletaVisualizaciones(portalData.boletaVisualizaciones || []);
            setPortalFirmaRegistros(portalData.firmaRegistros || []);
            setPortalFirmaOtpIntentos(portalData.firmaOtpIntentos || []);
          }
        } catch (_err) { /* fase 2 portal empleado puede no estar migrada */ }

        try {
          const [bioData, waData] = await Promise.all([
            biometricoService.listar(empresa.id),
            whatsappService.listar(empresa.id),
          ]);
          if (mounted) {
            setBiometricoPerfiles(bioData.perfiles || []);
            setBiometricoLotes(bioData.lotes || []);
            setWhatsappPlantillas(waData.templates || []);
            setWhatsappMatriz(waData.rutas || []);
            setWhatsappEnvios(waData.logs || []);
          }
        } catch (_err) { /* ola 5A integraciones puede no estar migrada */ }

        try {
          const geoData = await geofencingService.listar(empresa.id);
          if (mounted) {
            setGeocercas(geoData.geocercas || []);
            setGeocercaAsignaciones(geoData.asignaciones || []);
            setUbicacionConsentimientos(geoData.consentimientos || []);
          }
        } catch (_err) { /* ola 5B geofencing puede no estar migrada */ }

        try {
          const [tdocsData, reqData] = await Promise.all([
            tiposDocumentoService.getTiposDocumento(empresa.id),
            tiposDocumentoService.getRequisitosCargo(empresa.id),
          ]);
          if (mounted) {
            setTiposDocumento(tdocsData || []);
            setRequisitosCargo(reqData || []);
          }
        } catch (_err) { /* modulo aun no migrado */ }

        try {
          const evalData = await evaluacionesDesempenoService.cargarEvaluacionesDesempeno(empresa.id);
          if (mounted) {
            setEvaluacionPlantillas(evalData.plantillas || []);
            setEvaluacionCompetencias(evalData.competencias || []);
            setEvaluacionObjetivos(evalData.objetivos || []);
            setEvaluacionEvaluaciones(evalData.evaluaciones || []);
            setEvaluacionRespCompetencias(evalData.respuestasCompetencias || []);
            setEvaluacionRespObjetivos(evalData.respuestasObjetivos || []);
          }
        } catch (_err) { /* modulo aun no migrado */ }

        try {
          const liqData = await liquidacionesCeseService.cargarLiquidaciones(empresa.id);
          if (mounted) {
            setLiquidacionesCese(liqData.liquidaciones || []);
            setLiquidacionesConceptos(liqData.conceptos || []);
          }
        } catch (_err) { /* modulo aun no migrado */ }

        try {
          const csData = await loadCsFromSupabase(supabase, empresa.id);
          if (csData && mounted) {
            setRenovaciones(csData.renovaciones || []);
            setOnboardings(csData.onboardings || []);
            setPlanesExito(csData.planesExito || []);
            setNpsEncuestas(csData.npsEncuestas || []);
            if (csData.healthScoresDetalle?.length) setHealthScoresDetalle(csData.healthScoresDetalle);
          }
        } catch (_err) { /* keep mock */ }

        // Tipo de cambio del día
        try {
          const tc = await getTipoCambioHoy(supabase);
          if (mounted) setTipoCambioHoy(tc
            ? { ...tc, cargando: false }
            : { cargando: false, usd: null, eur: null, fecha: null, desactualizado: false }
          );
        } catch (_err) {
          if (mounted) setTipoCambioHoy(p => ({ ...p, cargando: false }));
        }

        // Planner v2: cargar cuadrillas (asignaciones se cargan on-demand por semana)
        try {
          const cuadData = await plannerSvc.getCuadrillas(empresa.id);
          if (mounted) setCuadrillas(cuadData || []);
        } catch (_err) { /* keep mock */ }

      } catch (_err) { /* keep mock on error */ }
      if (mounted) setIsDataLoaded(true);
    };
    setIsDataLoaded(false);
    loadCrm();
    return () => { mounted = false; };
  }, [empresa?.id, authSession?.user?.id, membresiaActiva?.empresa?.id]);

  const cargarSociedadesDeEmpresa = async (empresaResuelta, permitirConsolidadoOverride = null) => {
    const requestId = ++sociedadLoadRequestRef.current;
    const storageKey = `last_sociedad_id_${empresaResuelta?.id || ''}`;
    let sociedadPreferidaId = null;
    try { sociedadPreferidaId = empresaResuelta?.id ? localStorage.getItem(storageKey) : null; } catch {}
    const permitirConsolidado = permitirConsolidadoOverride ?? Boolean(
      role?.permisos?.todo || role?.permisos?.ver_consolidado_grupo
    );

    try {
      const contexto = await cargarContextoSociedades({
        empresa: empresaResuelta,
        userId: authUser?.id,
        sociedadPreferidaId,
      });
      if (requestId !== sociedadLoadRequestRef.current) return;
      const sociedadInicial = !permitirConsolidado && contexto.sociedadActiva?.id === SOCIEDAD_TODAS_ID
        ? (contexto.sociedadesDisponibles[0] || null)
        : contexto.sociedadActiva;
      setPerfilSociedad(contexto.perfilSociedad);
      setSociedadesIdsAlcance(contexto.sociedadesIdsAlcance);
      setSociedadActiva(sociedadInicial);
      setSociedadesDisponibles(contexto.sociedadesDisponibles);
      if (!permitirConsolidado && empresaResuelta?.id && sociedadInicial?.id) {
        try { localStorage.setItem(storageKey, sociedadInicial.id); } catch {}
      }
    } catch (error) {
      if (requestId !== sociedadLoadRequestRef.current) return;
      console.error('[SOCIEDADES context]', error?.message || error, error);
      setPerfilSociedad(
        empresaResuelta?.multisociedad_habilitado
          ? PERFIL_SOCIEDAD.GRUPO
          : PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD
      );
      setSociedadesIdsAlcance(null);
      setSociedadActiva(null);
      setSociedadesDisponibles([]);
    }
  };

  const seleccionarSociedad = sociedadId => {
    if (perfilSociedad === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return;
    const esVistaConsolidada = sociedadId === SOCIEDAD_TODAS_ID;
    const puedeConsolidar = Boolean(role?.permisos?.todo || role?.permisos?.ver_consolidado_grupo);
    if (esVistaConsolidada && !puedeConsolidar) return;
    if (!esVistaConsolidada && !sociedadesDisponibles.some(sociedad => sociedad.id === sociedadId)) return;
    const siguiente = resolverSociedadActiva(sociedadesDisponibles, sociedadId);
    if (!siguiente) return;
    setSociedadActiva(siguiente);
    try { localStorage.setItem(`last_sociedad_id_${empresa.id}`, siguiente.id); } catch {}
  };

  const recargarSociedades = () => cargarSociedadesDeEmpresa(empresa);

  const cargarMembresiaCompleta = async (mem) => {
    const empresaBase = mem?.empresa || null;
    const empresaBaseResuelta = empresaBase ? normalizarEmpresaSupabase(empresaBase) : null;

    // get_mis_membresias ya entrego una membresia valida. La conservamos como
    // contexto base mientras se refrescan empresa y permisos; antes, un fallo
    // puntual en cualquiera de esas lecturas anulaba toda la membresia y las
    // tarjetas de aplicacion terminaban usando un rol mock sin app_*.
    if (empresaBaseResuelta) setEmpresa(empresaBaseResuelta);
    setMembresiaActiva({
      empresa: empresaBase,
      rol: mem?.rol || null,
      rol_id: mem?.rol_id || null,
      acceso_campo: Boolean(mem?.acceso_campo),
      perfil_campo: mem?.perfil_campo || null,
      campo_modulos: mem?.campo_modulos || [],
      permisos_rows: [],
    });

    try {
      const supabase = await getSupabaseClient();
      const [{ data: snapshotPermisos, error: snapshotError }, { data: empresaFresca, error: empresaError }] = await Promise.all([
        supabase.rpc('get_mis_permisos_efectivos', { p_empresa_id: mem.empresa_id }),
        supabase
          .from('empresas')
          .select('id, razon_social, nombre_comercial, ruc, moneda_base, plan_id, estado, es_plataforma, multisociedad_habilitado, modulo_operativo_habilitado, organigrama_v2_habilitado')
          .eq('id', mem.empresa_id)
          .single(),
      ]);
      if (empresaError) throw empresaError;

      // El contexto debe traer una fotografia completa de permisos. La
      // recuperacion anterior verificaba solo `ver` pantalla por pantalla y
      // reemplazaba crear/editar/aprobar por false; eso hacia que el menu se
      // viera, pero los flujos de una pantalla quedaran bloqueados.
      let permisosResueltos = [];
      let rolIdEfectivo = mem.rol_id;
      if (!snapshotError && snapshotPermisos) {
        permisosResueltos = Array.isArray(snapshotPermisos.permisos)
          ? snapshotPermisos.permisos
          : [];
        rolIdEfectivo = snapshotPermisos.rol_id || rolIdEfectivo;
      } else {
        // Compatibilidad transitoria mientras se despliega la RPC. Incluso
        // este camino conserva todas las acciones: nunca sintetiza permisos.
        const { data: permisosDirectos, error: permisosDirectosError } = await supabase
          .from('permisos_roles')
          .select('*')
          .eq('rol_id', mem.rol_id);
        if (permisosDirectosError) throw (snapshotError || permisosDirectosError);
        permisosResueltos = permisosDirectos || [];
      }

      const membresiaFresca = { ...mem, empresa: empresaFresca };
      const empresaResuelta = normalizarEmpresaSupabase(empresaFresca);
      setTodasMembresias(prev => prev.map(item => (
        item.empresa_id === mem.empresa_id ? { ...item, empresa: empresaFresca } : item
      )));
      if (empresaResuelta) setEmpresa(empresaResuelta);
      setMembresiaActiva({
        empresa: membresiaFresca.empresa,
        rol: membresiaFresca.rol,
        rol_id: rolIdEfectivo,
        acceso_campo: membresiaFresca.acceso_campo,
        perfil_campo: membresiaFresca.perfil_campo,
        campo_modulos: membresiaFresca.campo_modulos || [],
        permisos_rows: permisosResueltos,
      });
      const roleResuelto = buildRoleDePermisos(
        membresiaFresca.rol,
        permisosResueltos,
        membresiaFresca.acceso_campo,
        membresiaFresca.campo_modulos || []
      );
      await cargarSociedadesDeEmpresa(
        empresaResuelta,
        Boolean(roleResuelto.permisos?.todo || roleResuelto.permisos?.ver_consolidado_grupo)
      );
    } catch (_err) {
      // Se mantiene el contexto basico de una membresia que ya fue validada
      // por get_mis_membresias. ApplicationWelcome verifica app_* en el
      // servidor, por lo que una recarga parcial no debe convertir permisos
      // reales en tarjetas bloqueadas.
      setMembresiaActiva({
        empresa: empresaBase,
        rol: mem?.rol || null,
        rol_id: mem?.rol_id || null,
        acceso_campo: Boolean(mem?.acceso_campo),
        perfil_campo: mem?.perfil_campo || null,
        campo_modulos: mem?.campo_modulos || [],
        permisos_rows: [],
      });
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
        setPerfilSociedad(PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD);
        setSociedadActiva(null);
        setSociedadesDisponibles([]);
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
          supabase.from('empresas').select('id, razon_social, nombre_comercial, ruc, moneda_base, plan_id, estado, es_plataforma, multisociedad_habilitado, modulo_operativo_habilitado, organigrama_v2_habilitado').in('id', empresaIds),
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
        ...rows.map(r => ({
          id: r.id,
          text: r.mensaje || r.texto,
          title: r.titulo || '',
          message: r.mensaje || r.texto,
          read: r.leida,
          time: new Date(r.created_at || r.creada_en).toLocaleDateString('es-PE'),
          tipo: r.tipo,
          priority: r.prioridad || 'media',
          referenceType: r.referencia_tipo,
          referenceId: r.referencia_id,
          referencePayload: r.referencia_payload || {},
          _db: true,
        })),
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
  const puedeVerConsolidadoGrupo = Boolean(role?.permisos?.todo || role?.permisos?.ver_consolidado_grupo);

  useEffect(() => {
    if (puedeVerConsolidadoGrupo || sociedadActiva?.id !== SOCIEDAD_TODAS_ID) return;
    const sociedadConcreta = sociedadesDisponibles[0] || null;
    setSociedadActiva(sociedadConcreta);
    if (empresa?.id && sociedadConcreta?.id) {
      try { localStorage.setItem(`last_sociedad_id_${empresa.id}`, sociedadConcreta.id); } catch {}
    }
  }, [puedeVerConsolidadoGrupo, sociedadActiva?.id, sociedadesDisponibles, empresa?.id]);
  const condicionPagoFallbackCxC = empresaConfig?.condicion_pago_defecto || CONDICION_PAGO_DEFECTO_CXC;
  const mensajeFallbackCondicionPagoCxC = condicionPagoFallbackCxC === CONDICION_PAGO_DEFECTO_CXC
    ? 'Cliente sin condición de pago configurada. Se aplicó 30 días por defecto.'
    : `Cliente sin condición de pago configurada. Se aplicó ${condicionPagoFallbackCxC} por defecto.`;
  const resolverVencimientoCxC = (datos = {}) => {
    const fechaEmision = datos.fecha_emision || new Date().toISOString().split('T')[0];
    const cuenta = (cuentas || []).find(c => c.id === datos.cuenta_id);
    const osRef = datos.os_cliente_id ? (osClientes || []).find(o => o.id === datos.os_cliente_id) : null;
    // Prioridad: condici\xf3n explícita del form > condici\xf3n de la OS > condici\xf3n del cliente
    const condicionCliente = datos.condicion_pago || osRef?.condicion_pago || cuenta?.condicion_pago;
    const resuelta = resolverCondicionPagoCxC({
      condicionCliente,
      condicionFallback: condicionPagoFallbackCxC,
    });
    const fechaVencimientoManual = datos.fecha_vencimiento && (datos.fecha_vencimiento_manual || datos.fecha_vencimiento_resuelta);
    const fechaVencimiento = fechaVencimientoManual
      ? datos.fecha_vencimiento
      : calcularFechaVencimientoCxC(fechaEmision, resuelta.condicion_pago, condicionPagoFallbackCxC);

    return {
      fechaEmision,
      fechaVencimiento,
      condicionPago: resuelta.condicion_pago,
      usoFallback: resuelta.usoFallback && !fechaVencimientoManual,
    };
  };
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
        ? `Grupo ${result.empresa_id} creado y admin vinculado: ${datos.admin_email}.`
        : `Grupo ${result.empresa_id} creado con su sociedad principal. El email admin aún no existe en Supabase Auth; queda pendiente vincularlo.`);
      return result;
    }

    const nuevoId = await generarCodigoTenant(datos.nombre_grupo, {
      verificarDisponibilidad: async codigo => !empresasPlataforma.some(item => item.id === codigo),
    });
    const nuevo = {
      id: nuevoId,
      razon_social: datos.nombre_grupo,
      nombre_comercial: datos.nombre_grupo,
      nombre: datos.nombre_grupo,
      ruc: '',
      pais: datos.pais || 'PE',
      moneda_base: datos.moneda_base || 'PEN',
      moneda: datos.moneda_base || 'PEN',
      estado: datos.estado || 'activa',
      plan: null,
      admin_email: datos.admin_email || '',
      color: '#0ea5e9',
      multisociedad_habilitado: true,
      sociedad: { ...datos.sociedad, activa: true, es_principal: true },
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

  const normalizarMonedaCrm = moneda => String(moneda || empresa?.moneda || empresa?.moneda_base || 'PEN').trim().toUpperCase();
  const PROBABILIDAD_ETAPA_OPP = { calificacion: 20, propuesta: 40, negociacion: 70, cierre: 70, ganada: 100, perdida: 0 };
  const probabilidadPorEtapaOpp = etapa => PROBABILIDAD_ETAPA_OPP[String(etapa || 'calificacion').toLowerCase()] ?? 20;
  const forecastPorEtapaOpp = (opp, etapa) => Number(opp?.monto_estimado || 0) * probabilidadPorEtapaOpp(etapa) / 100;
  const getLeadIdDeOportunidad = opp => opp?.lead_id || opp?.lead_origen || null;

  useEffect(() => {
    if (isSupabaseConfigured()) {
      if (
        supabaseStatus.loading ||
        !authSession?.user ||
        !empresa?.id ||
        !membresiaActiva?.empresa?.id ||
        membresiaActiva.empresa.id !== empresa.id
      ) return;
    }
    if (!oportunidades.length) return;

    const pendientes = oportunidades.filter(o => {
      const estado = String(o.estado || '').toLowerCase();
      const etapa = String(o.etapa || 'calificacion').toLowerCase();
      if (estado === 'ganada' || estado === 'perdida' || etapa === 'ganada' || etapa === 'perdida') return false;
      const probabilidad = probabilidadPorEtapaOpp(etapa);
      const forecast = Number(o.monto_estimado || 0) * probabilidad / 100;
      return (
        Number(o.probabilidad ?? -1) !== probabilidad ||
        Math.abs(Number(o.forecast_ponderado ?? -1) - forecast) > 0.01
      );
    });

    if (!pendientes.length) return;

    const patchById = pendientes.reduce((acc, o) => {
      const etapa = String(o.etapa || 'calificacion').toLowerCase();
      const probabilidad = probabilidadPorEtapaOpp(etapa);
      acc[o.id] = {
        probabilidad,
        forecast_ponderado: Number(o.monto_estimado || 0) * probabilidad / 100,
      };
      return acc;
    }, {});

    setOportunidades(prev => prev.map(o => patchById[o.id] ? { ...o, ...patchById[o.id] } : o));
    pendientes.forEach(o => {
      crmSync(sb => actualizarOportunidad(sb, o.id, patchById[o.id]));
    });
  }, [empresa?.id, oportunidades, authSession?.user, membresiaActiva?.empresa?.id, supabaseStatus.loading]);

  const sincronizarPotencialLeadDesdeOportunidad = (opp, { monto, moneda }) => {
    const leadId = getLeadIdDeOportunidad(opp);
    if (!leadId) return;
    const patch = {};
    if (monto !== undefined) patch.presupuesto_estimado = Number(monto || 0);
    if (moneda) patch.moneda = normalizarMonedaCrm(moneda);
    if (!Object.keys(patch).length) return;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l));
    crmSync(sb => actualizarLead(sb, leadId, patch));
  };
  const sincronizarMontoOportunidadYLead = (oppId, { monto, moneda }) => {
    if (!oppId || monto === undefined) return;
    const opp = oportunidades.find(o => o.id === oppId);
    const montoNum = Number(monto || 0);
    const monedaNorm = normalizarMonedaCrm(moneda || opp?.moneda);
    const probabilidad = probabilidadPorEtapaOpp(opp?.etapa);
    const forecast_ponderado = montoNum * probabilidad / 100;
    const patch = { monto_estimado: montoNum, moneda: monedaNorm, forecast_ponderado };
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, ...patch } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, patch));
    sincronizarPotencialLeadDesdeOportunidad(opp, { monto: montoNum, moneda: monedaNorm });
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
    if (payload.presupuesto_estimado !== undefined || payload.moneda !== undefined) {
      const patchOpp = {
        ...(payload.presupuesto_estimado !== undefined ? { monto_estimado: payload.presupuesto_estimado } : {}),
        ...(payload.moneda !== undefined ? { moneda: normalizarMonedaCrm(payload.moneda) } : {}),
      };
      oportunidades
        .filter(o => getLeadIdDeOportunidad(o) === leadId)
        .filter(o => !cotizaciones.some(c => c.oportunidad_id === o.id))
        .forEach(o => {
          const patchConForecast = {
            ...patchOpp,
            ...(patchOpp.monto_estimado !== undefined
              ? { forecast_ponderado: Number(patchOpp.monto_estimado || 0) * probabilidadPorEtapaOpp(o.etapa) / 100 }
              : {}),
          };
          setOportunidades(prev => prev.map(opp => opp.id === o.id ? { ...opp, ...patchConForecast } : opp));
          crmSync(sb => actualizarOportunidad(sb, o.id, patchConForecast));
        });
    }
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
    if (payload.tasa_retencion_sunat !== undefined) {
      payload.tasa_retencion_sunat = Number(payload.tasa_retencion_sunat || 3);
    }

    setCuentas(prev => prev.map(c => c.id === cuentaId ? { ...c, ...payload } : c));
    await crmPersist(sb => svcActualizarCuenta(sb, empresa.id, cuentaId, payload));
    auditSync({ modulo: 'crm', entidad: 'cuentas', entidad_id: cuentaId, accion: 'editar', valor_anterior: anterior || null, valor_nuevo: payload });
    addNotificacion('Cuenta actualizada.');
    return { ...(anterior || {}), ...payload };
  };

  const eliminarCuenta = async (cuentaId) => {
    const anterior = cuentas.find(c => c.id === cuentaId) || null;
    if (!anterior) throw new Error('La cuenta ya no está disponible.');

    try {
      await crmPersist(sb => eliminarCuentaSvc(sb, empresa.id, cuentaId));
      setCuentas(prev => prev.filter(c => c.id !== cuentaId));
      // Las FKs de CRM quedan en NULL al eliminar una cuenta; conservamos los contactos.
      setContactos(prev => prev.map(c => c.cuenta_id === cuentaId ? { ...c, cuenta_id: null } : c));
      auditSync({ modulo: 'crm', entidad: 'cuentas', entidad_id: cuentaId, accion: 'eliminar', valor_anterior: anterior });
      addNotificacion(`Cuenta "${anterior.razon_social || anterior.nombre_comercial}" eliminada.`);
      return true;
    } catch (error) {
      const mensaje = error?.code === '23503'
        ? 'No se puede eliminar la cuenta porque tiene documentos financieros o CxC asociados. Anúlalos o regularízalos antes.'
        : `No se pudo eliminar la cuenta: ${error?.message || 'Error desconocido'}`;
      addNotificacion(mensaje);
      throw error;
    }
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
    const etapaInicialOpp = datosConversion.etapa_inicial || 'calificacion';
    const montoInicialOpp = Number(datosConversion.monto_estimado || lead.presupuesto_estimado || 0);
    const probInicialOpp = probabilidadPorEtapaOpp(etapaInicialOpp);
    const nuevaOportunidad = {
      id: newOppId,
      empresa_id: empresa.id,
      cuenta_id: cuentaId,
      contacto_id: contactoId,
      nombre: datosConversion.nombre_oportunidad,
      servicio_interes: lead.necesidad,
      etapa: etapaInicialOpp,
      monto_estimado: montoInicialOpp,
      moneda: datosConversion.moneda || lead.moneda || 'PEN',
      probabilidad: probInicialOpp,
      forecast_ponderado: montoInicialOpp * probInicialOpp / 100,
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
    const etapaInicial = datos.etapa || 'calificacion';
    const montoInicial = Number(datos.monto_estimado || 0);
    const probInicial = datos.probabilidad ?? probabilidadPorEtapaOpp(etapaInicial);
    const opp = {
      id: generateId('opp'),
      empresa_id: empresa.id,
      estado: 'abierta',
      fecha_creacion: new Date().toISOString().split('T')[0],
      ...datos,
      etapa: etapaInicial,
      monto_estimado: montoInicial,
      probabilidad: probInicial,
      forecast_ponderado: montoInicial * probInicial / 100,
    };
    setOportunidades(prev => [...prev, opp]);
    crmSync(sb => persistirOportunidad(sb, empresa.id, opp));
    auditSync({ modulo: 'crm', entidad: 'oportunidades', entidad_id: opp.id, accion: 'crear', valor_nuevo: opp });
  };

  const actualizarEtapaOportunidad = (oppId, nuevaEtapa) => {
    const opp = oportunidades.find(o => o.id === oppId);
    if (!opp) return false;
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
    const probabilidad = probabilidadPorEtapaOpp(nuevaEtapa);
    const forecast_ponderado = forecastPorEtapaOpp(opp, nuevaEtapa);
    const patch = { etapa: nuevaEtapa, probabilidad, forecast_ponderado };
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, ...patch, moved_at: Date.now() } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, patch));
  };

  const marcarGanada = (oppId, datos) => {
    const anterior = oportunidades.find(o => o.id === oppId) || null;
    const montoGanado = Number(datos.monto_estimado !== undefined ? datos.monto_estimado : anterior?.monto_estimado || 0);
    setOportunidades(prev => prev.map(o => o.id === oppId ? {
      ...o,
      estado: 'ganada',
      etapa: 'ganada',
      probabilidad: 100,
      forecast_ponderado: montoGanado,
      ...(datos.monto_estimado !== undefined ? { monto_estimado: datos.monto_estimado } : {}),
      ...(datos.moneda ? { moneda: datos.moneda } : {}),
      fecha_cierre_real: datos.fecha_cierre_real || new Date().toISOString().split('T')[0],
      notas: datos.notas || o.notas
    } : o));
    const patch = {
      estado: 'ganada',
      etapa: 'ganada',
      probabilidad: 100,
      forecast_ponderado: montoGanado,
      ...(datos.monto_estimado !== undefined ? { monto_estimado: datos.monto_estimado } : {}),
      ...(datos.moneda ? { moneda: datos.moneda } : {}),
      fecha_cierre_real: datos.fecha_cierre_real || new Date().toISOString().split('T')[0],
      notas: datos.notas
    };
    crmSync(sb => actualizarOportunidad(sb, oppId, patch));
    if (datos.monto_estimado !== undefined || datos.moneda) {
      sincronizarPotencialLeadDesdeOportunidad(anterior, {
        monto: datos.monto_estimado !== undefined ? datos.monto_estimado : anterior?.monto_estimado,
        moneda: datos.moneda || anterior?.moneda,
      });
    }
    auditSync({ modulo: 'crm', entidad: 'oportunidades', entidad_id: oppId, accion: 'ganar', valor_anterior: anterior, valor_nuevo: datos });

    addNotificacion(`Oportunidad ganada. Revisar datos para OS.`);

    if (datos.crear_osc && datos.cotizacion_id) {
      crearOSCliente(datos.cotizacion_id, datos);
    }
  };

  const marcarGanadaPorCotizacion = (cot, datos = {}) => {
    if (!cot?.oportunidad_id) return;
    const montoAprobado = cot.subtotal ?? cot.subtotal_impl ?? cot.total_impl ?? cot.total ?? 0;
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
      forecast_ponderado: 0,
      motivo_perdida: motivo
    } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, { estado: 'perdida', etapa: 'perdida', probabilidad: 0, forecast_ponderado: 0, motivo_perdida: motivo }));
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
    const cotizacionAprobada = cotizaciones.some(c => c.oportunidad_id === oppId && c.estado === 'aprobada');
    if (!opp || (opp.acuerdo_estado === 'aprobado' && (cotizacionAprobada || ['ganada', 'perdida'].includes(opp.etapa)))) return;
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
    return patch;
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
    if (empresa?.multisociedad_habilitado && !datos.sociedad_id) {
      throw new Error('Selecciona una sociedad para crear la Hoja de Costeo.');
    }
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
        const result = await crmPersist(sb => empresa?.multisociedad_habilitado
          ? crearHojaCosteoSociedadRpc(sb, empresa.id, calculada)
          : crearHojaCosteoRpc(sb, empresa.id, calculada));
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
    if (empresa?.multisociedad_habilitado && !hc.sociedad_id) {
      throw new Error('La Hoja de Costeo no tiene sociedad. Corrígela antes de aprobarla.');
    }
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
        hoja_costeo_id: hcId,
        sociedad_id: hc.sociedad_id || null,
      };
      try {
        const result = await crmPersist(sb => empresa?.multisociedad_habilitado
          ? aprobarHojaCosteoSociedadRpc(sb, empresa.id, hcId, cotBase)
          : aprobarHojaCosteoRpc(sb, empresa.id, hcId, cotBase));
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
        if (cotFinal.oportunidad_id && Number(cotFinal.subtotal || 0) > 0) {
          sincronizarMontoOportunidadYLead(cotFinal.oportunidad_id, { monto: cotFinal.subtotal, moneda: cotFinal.moneda });
        }
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
      moneda: String(datos.moneda || oportunidades.find(o => o.id === datos.oportunidad_id)?.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN').trim().toUpperCase(),
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
    if (cot.oportunidad_id && Number(cot.subtotal || 0) > 0) {
      sincronizarMontoOportunidadYLead(cot.oportunidad_id, { monto: cot.subtotal, moneda: cot.moneda });
    }
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
    const probabilidad = probabilidadPorEtapaOpp(targetEtapa);
    const forecast_ponderado = forecastPorEtapaOpp(opp, targetEtapa);
    const patch = { etapa: targetEtapa, probabilidad, forecast_ponderado };
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, ...patch, moved_at: Date.now() } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, patch));
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
      const monedaCot = String(datos.moneda || anterior?.moneda || 'PEN').trim().toUpperCase();
      sincronizarMontoOportunidadYLead(anterior.oportunidad_id, { monto: datos.subtotal, moneda: monedaCot });
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
    const canalEsReunion = String(datos.canal || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'aprobado en reunion';
    const notasAprobacion = String(datos.notas || '').trim();
    if (canalEsReunion && !notasAprobacion) throw new Error('Ingresa notas adicionales para una aprobacion en reunion.');
    if (!canalEsReunion && !archivos.length) throw new Error('Adjunta al menos una evidencia de aprobacion del cliente.');

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
      aprobacion_notas: notasAprobacion || null,
      aprobacion_registrada_por: usuarioRegistro,
      aprobacion_registrada_at: new Date().toISOString(),
      aprobacion_archivos: archivosAprobacion,
    };

    if (isSupabaseConfigured() && empresa?.id) {
      await crmPersist(sb => svcActualizarCotizacion(sb, cotId, datosAprobacion));
    }

    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, ...datosAprobacion } : c));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'aprobar_manual', valor_anterior: anterior, valor_nuevo: datosAprobacion });
    addNotificacion(`Cotizacion aprobada manualmente${archivosAprobacion.length ? ' con sustento' : ''}.`);
    marcarGanadaPorCotizacion({ ...anterior, ...datosAprobacion }, {
      origen_aprobacion: 'manual',
      canal_aprobacion: datos.canal,
      aprobacion_fecha_cliente: fechaCliente,
      notas: notasAprobacion || null,
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

    const responsableUser = datos.responsable_comercial_id
      ? usuarios.find(u => u.id === datos.responsable_comercial_id)
      : null;
    const osc = {
      id: generateId('osc'),
      empresa_id: empresa.id,
      numero: `OSC-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      numero_doc_cliente: datos.numero_doc_cliente || null,
      nombre: datos.nombre || null,
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
      responsable_comercial_id: datos.responsable_comercial_id || null,
      responsable_comercial: responsableUser?.nombre || null,
      observaciones: datos.observaciones || null,
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
        const cotResult = await svcActualizarCotizacion(sb, cotId, { estado: 'convertida', os_cliente_id: osc.id });
        if (cotResult?.error) throw cotResult.error;
      });
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la OS Cliente en Supabase.';
      addNotificacion(`No se creo la OS Cliente: ${message}`);
      throw error;
    }
    setOsClientes(prev => [...prev, osc]);
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, estado: 'convertida', os_cliente_id: osc.id } : c));
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
      sociedad_id: datos.sociedad_id || null,
      numero_doc_cliente: datos.numero_doc_cliente || null,
      nombre: datos.nombre || null,
      monto_aprobado: monto,
      moneda: datos.moneda || empresa?.moneda || 'PEN',
      condicion_pago: datos.condicion_pago || null,
      fecha_emision: datos.fecha_emision || new Date().toISOString().split('T')[0],
      fecha_inicio: datos.fecha_inicio || null,
      fecha_fin: datos.fecha_fin || null,
      sla: datos.sla || null,
      estado: datos.estado || 'en_ejecucion',
      centro_beneficio_id: datos.centro_beneficio_id || null,
      responsable_comercial_id: datos.responsable_comercial_id || null,
      responsable_comercial: datos.responsable_comercial || null,
      observaciones: datos.observaciones || null,
      hitos_facturacion: datos.hitos_facturacion || [],
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
    const cotizacion = cotizaciones.find(c => c.id === cotizacionId);
    const os = osClientes.find(o => o.id === osId);
    if (!cotizacion || !os) throw new Error('No se encontró la cotización u OS a vincular.');
    try {
      await crmPersist(async sb => {
        const osResult = await svcActualizarOSCliente(sb, osId, { cotizacion_id: cotizacionId });
        if (osResult?.error) throw osResult.error;
        const cotResult = await svcActualizarCotizacion(sb, cotizacionId, { os_cliente_id: osId });
        if (cotResult?.error) throw cotResult.error;
      });
    } catch (error) {
      addNotificacion(`No se pudo vincular la cotización: ${error?.message || error}`);
      throw error;
    }
    setOsClientes(prev => prev.map(o => o.id === osId ? { ...o, cotizacion_id: cotizacionId } : o));
    setCotizaciones(prev => prev.map(c => c.id === cotizacionId ? { ...c, os_cliente_id: osId } : c));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotizacionId, accion: 'vincular_os', valor_anterior: { os_cliente_id: cotizacion.os_cliente_id || null }, valor_nuevo: { os_cliente_id: osId } });
    addNotificacion('Cotización vinculada a la OS.');
  };

  const eliminarOSCliente = async (osId) => {
    const os = osClientes.find(o => o.id === osId);
    if (!os) throw new Error('OS Cliente no encontrada.');

    let resultado;
    if (isSupabaseConfigured()) {
      const sb = await getSupabaseClient();
      const { data, error } = await eliminarOSClienteReabrirCotizacion(sb, empresa.id, osId);
      if (error) throw error;
      resultado = data;
    } else {
      const valorizacionesOS = valorizaciones.filter(v => v.os_cliente_id === osId);
      const idsValorizaciones = new Set(valorizacionesOS.map(v => v.id));
      const facturasOS = facturas.filter(f => f.os_cliente_id === osId || idsValorizaciones.has(f.valorizacion_id));
      const idsFacturas = new Set(facturasOS.map(f => f.id));
      const dependencias = {
        ordenes_trabajo: ots.filter(ot => ot.os_cliente_id === osId).length,
        backlog: backlog.filter(b => b.os_cliente_id === osId).length,
        tareos_administrativos: 0,
        valorizaciones: valorizacionesOS.length,
        facturas: facturasOS.length,
        cuentas_por_cobrar: cxc.filter(c => c.os_cliente_id === osId || idsFacturas.has(c.factura_id)).length,
        comisiones: comisiones.filter(c => c.os_cliente_id === osId).length,
      };
      const tieneDependencias = Object.values(dependencias).some(Number);
      resultado = tieneDependencias
        ? { eliminada: false, motivo: 'No se puede eliminar la OS porque ya tiene registros relacionados.', dependencias }
        : { eliminada: true, os_id: osId, cotizacion_origen_id: os.cotizacion_id || null, dependencias };
    }

    if (!resultado?.eliminada) return resultado;

    const cotizacionOrigenId = resultado.cotizacion_origen_id || os.cotizacion_id || null;
    setOsClientes(prev => prev.filter(o => o.id !== osId));
    setCotizaciones(prev => prev.map(c => {
      if (c.id === cotizacionOrigenId) return { ...c, estado: 'borrador', os_cliente_id: null, token_activo: false };
      if (c.os_cliente_id === osId) return { ...c, os_cliente_id: null };
      return c;
    }));
    auditSync({
      modulo: 'comercial', entidad: 'os_clientes', entidad_id: osId, accion: 'eliminar_reabrir_cotizacion',
      valor_anterior: os,
      valor_nuevo: { cotizacion_origen_id: cotizacionOrigenId, dependencias: resultado.dependencias || {} },
    });
    return resultado;
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
      os_cliente_id: req.os_cliente_id || null,
      descripcion: req.descripcion,
      tipo: datos.tipo || 'Correctiva',
      estado: 'programada',
      centro_costo_id: datos.centro_costo_id,
      costoEst: 0, costoReal: 0, avance: 0,
      backlog_id: backlogId,
    });
    addNotificacion('Requerimiento convertido a OT.');
  };
  // La BD deriva la sociedad de una OT con esta precedencia. Repetimos la
  // resolucion para el estado local, que se pinta antes de la siguiente carga.
  // Sin esto, una OT recien creada se filtraba de la grilla por sociedad y en
  // consolidado se mostraba transitoriamente como "Sin sociedad".
  const resolverSociedadOTLocal = (datos = {}) => {
    const ceco = (centrosCosto || []).find(item => item.id === datos.centro_costo_id);
    if (ceco?.sociedad_id) return ceco.sociedad_id;

    const cebe = (centrosBeneficio || []).find(item => item.id === datos.centro_beneficio_id);
    if (cebe?.sociedad_id) return cebe.sociedad_id;

    const os = (osClientes || []).find(item => item.id === datos.os_cliente_id);
    return os?.sociedad_id || null;
  };

  const crearOT = (datos) => {
    const sociedadId = resolverSociedadOTLocal(datos);
    const ot = {
      id: generateId('ot'),
      empresa_id: empresa.id,
      numero: `OT-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      estado: 'borrador',
      sla: 'ok',
      costoEst: 0, costoReal: 0, avance: 0,
      tareas: [],
      materiales_estimados: [],
      ...datos,
      // La sociedad no se envía como valor autoritativo: el trigger de BD la
      // deriva y valida. Solo mantenemos el reflejo local consistente de forma
      // inmediata para filtros y badges.
      sociedad_id: sociedadId,
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

    const sociedadId = resolverSociedadOTLocal({
      ...datos,
      os_cliente_id: os.id,
      centro_beneficio_id: datos.centro_beneficio_id || os.centro_beneficio_id || null,
    });

    const montoPlanificado = Number(datos.costo_estimado_ot ?? datos.costo_estimado ?? datos.costoEst ?? 0);

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
      sociedad_id: sociedadId,
      numero: `OT-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random()*1000).toString().padStart(4,'0')}`,
      sla: 'ok',
      tareas: [],
      materiales_estimados: [],
      os_cliente_id: os.id,
      cuenta_id: os.cuenta_id,
      cliente: os.cuenta_id,
      tipo_servicio_interno_id: datos.tipo_servicio_interno_id || null,
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
      costo_estimado: montoPlanificado,
      costo_estimado_ot: montoPlanificado,
      costoReal: 0,
      avance: 0,
      es_adicional: datos.es_adicional || false,
      est_mo: datos.est_mo ?? hcDesglose.est_mo,
      est_materiales: datos.est_materiales ?? hcDesglose.est_materiales,
      est_terceros: datos.est_terceros ?? hcDesglose.est_terceros,
      est_logistica: datos.est_logistica ?? hcDesglose.est_logistica,
      est_detalle: datos.est_detalle || null,
      estimado_detalle: datos.estimado_detalle || datos.est_detalle || null,
      estimado_congelado_en: datos.estimado_congelado_en || null,
    };

    try {
      if (isSupabaseConfigured()) {
        const result = await opsPersist(sb => crearOTDesdeOSRpc(sb, empresa.id, os.id, ot));
        const data = result?.data || {};
        const localEst = { est_mo: ot.est_mo, est_materiales: ot.est_materiales, est_terceros: ot.est_terceros, est_logistica: ot.est_logistica };
        Object.assign(ot, data.orden_trabajo || {});
        // RPC insert doesn't include est breakdown columns — restore locally-computed values
        if (ot.est_mo == null && localEst.est_mo != null) ot.est_mo = localEst.est_mo;
        if (ot.est_materiales == null && localEst.est_materiales != null) ot.est_materiales = localEst.est_materiales;
        if (ot.est_terceros == null && localEst.est_terceros != null) ot.est_terceros = localEst.est_terceros;
        if (ot.est_logistica == null && localEst.est_logistica != null) ot.est_logistica = localEst.est_logistica;
        // Persist est breakdown to DB since the RPC doesn't save these columns
        if (ot.tipo_servicio_interno_id || [ot.est_mo, ot.est_materiales, ot.est_terceros, ot.est_logistica].some(v => v != null)) {
          opsSync(sb => svcActualizarOT(sb, ot.id, {
            tipo_servicio_interno_id: ot.tipo_servicio_interno_id,
            costoEst: ot.costoEst,
            costo_estimado_ot: ot.costo_estimado_ot,
            est_mo: ot.est_mo,
            est_materiales: ot.est_materiales,
            est_terceros: ot.est_terceros,
            est_logistica: ot.est_logistica,
            estimado_detalle: ot.estimado_detalle,
          }));
        }
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
    const estadoNorm = String(datos.estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const debeCongelar = ['ejecucion', 'en ejecucion', 'en_ejecucion'].includes(estadoNorm) && !anterior?.estimado_congelado_en;
    const payload = debeCongelar ? { ...datos, estimado_congelado_en: new Date().toISOString() } : datos;
    setOts(prev => prev.map(o => {
      if (o.id !== otId) return o;
      const next = { ...o, ...payload };
      if (payload.costo_estimado_ot !== undefined) {
        next.costoEst = Number(payload.costo_estimado_ot || 0);
        next.costo_estimado = next.costoEst;
      }
      if (payload.estimado_detalle !== undefined) next.estimado_detalle = payload.estimado_detalle;
      return next;
    }));
    opsSync(sb => svcActualizarOT(sb, otId, payload));
    auditSync({ modulo: 'operaciones', entidad: 'ordenes_trabajo', entidad_id: otId, accion: 'editar', valor_anterior: anterior, valor_nuevo: payload });
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
      tecnico_nombre: datos.tecnico || null,
      fecha: datos.fecha,
      horas_normales: datos.horas,
      actividad: datos.actividad,
      avance_pct: datos.avance_reportado,
      materiales: datos.materiales_usados || [],
      logistica_lineas: datos.logistica_lineas || [],
      terceros_lineas: datos.terceros_lineas || [],
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

  // Costo hora unificado: tarifa_hora de la ficha, con fallback legacy.
  const calcCostoHora = (personaId) => {
    const tec = [...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === personaId);
    const explicit = Number(tec?.tarifa_hora ?? tec?.costo_hora_real ?? tec?.costo ?? tec?.costo_hora ?? 0);
    if (explicit > 0) return explicit;
    return 0;
  };

  const aprobarParteDiario = (parteId, avanceValidado = null, motivoAprobacion = '') => {
    const parte = partes.find(p => p.id === parteId);
    if (!parte) return;
    const avanceFinal = avanceValidado !== null ? Number(avanceValidado) : (parte.avance_reportado || 0);
    const parteAprobado = { ...parte, estado: 'aprobado', avance_validado: avanceFinal, motivo_aprobacion: motivoAprobacion || undefined };
    setPartes(prev => prev.map(p => p.id === parteId ? parteAprobado : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'aprobado', avance_pct: avanceFinal, aprobado_at: new Date().toISOString() }));
    auditSync({ modulo: 'operaciones', entidad: 'partes_diarios', entidad_id: parteId, accion: 'aprobar', valor_anterior: parte, valor_nuevo: { estado: 'aprobado', avance_validado: avanceFinal } });

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

      // Recalcular costo real completo desde los partes aprobados
      const costoMO = partesAprobadosOT.reduce((s, p) => {
        const moIt = (o.est_detalle?.mano_obra || []).find(m => m.tecnico_id === p.tecnico_id);
        const ch = (moIt?.costo_hora > 0) ? moIt.costo_hora : calcCostoHora(p.tecnico_id);
        return s + Number(p.horas || 0) * ch;
      }, 0);
      const costoMat = partesAprobadosOT.reduce((s, p) =>
        s + (p.materiales_usados || []).reduce((sm, m) => {
          const itemInv = inventario.find(i => i.sku === m.sku);
          return sm + (m.cantidad || 0) * (itemInv?.costo_promedio || m.costo_unitario || 0);
        }, 0), 0);
      const costoTerceros = partesAprobadosOT.reduce((s, p) =>
        s + (p.terceros_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);
      const costoLogistica = partesAprobadosOT.reduce((s, p) =>
        s + (p.logistica_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);

      const fechasPartes = partesAprobadosOT.map(p => p.fecha).filter(Boolean).sort();
      const nuevaFechaInicio = o.fecha_inicio || fechasPartes[0] || null;
      const nuevaFechaFin = fechasPartes[fechasPartes.length - 1] || o.fecha_fin || null;
      const nuevosDatos = {
        avance: nuevoAvance,
        costoReal: costoMO + costoMat + costoTerceros + costoLogistica,
        fecha_inicio: nuevaFechaInicio,
        fecha_fin: nuevaFechaFin,
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

  const enviarParteARevision = (parteId) => {
    const parte = partes.find(p => p.id === parteId);
    if (!parte || !['borrador', 'rechazado', 'observado'].includes(parte.estado)) return;
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, estado: 'en_revision' } : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'en_revision' }));
    addNotificacion('Parte enviado a revisión.');
  };

  const reabrirParteDiario = (parteId, motivo = '') => {
    const parte = partes.find(p => p.id === parteId);
    if (!parte || parte.estado !== 'aprobado') return;

    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, estado: 'borrador', motivo_reapertura: motivo || undefined } : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'borrador' }));
    auditSync({ modulo: 'operaciones', entidad: 'partes_diarios', entidad_id: parteId, accion: 'reabrir', valor_anterior: { estado: 'aprobado' }, valor_nuevo: { estado: 'borrador', motivo } });

    // Recalcular OT desde los partes aprobados restantes (sin este)
    setOts(prev => prev.map(o => {
      if (o.id !== parte.ot_id) return o;
      const restantes = partes.filter(p => p.ot_id === o.id && p.id !== parteId && p.estado === 'aprobado');

      // Avance
      const tareas = o.tareas || [];
      const tareasConPeso = tareas.filter(t => Number(t.peso) > 0);
      let nuevoAvance;
      if (parte.tarea_id || tipoOTRequiereTareas(o)) {
        nuevoAvance = o.avance_supervisor_pct ?? o.avance ?? 0;
      } else if (tareasConPeso.length > 0) {
        let pond = 0;
        tareasConPeso.forEach(tarea => {
          let ac = 0;
          restantes.forEach(p => {
            const tt = (p.tareas_trabajadas || []).find(t => String(t.tarea_id) === String(tarea.id));
            if (tt) ac += Number(tt.avance_hoy) || 0;
          });
          pond += (Number(tarea.peso) / 100) * Math.min(100, ac);
        });
        nuevoAvance = Math.min(100, Math.round(pond));
      } else {
        nuevoAvance = Math.min(100, restantes.reduce((s, p) => s + (Number(p.avance_validado) || 0), 0));
      }

      // Costos
      const costoMO = restantes.reduce((s, p) => {
        const moIt = (o.est_detalle?.mano_obra || []).find(m => m.tecnico_id === p.tecnico_id);
        const ch = (moIt?.costo_hora > 0) ? moIt.costo_hora : calcCostoHora(p.tecnico_id);
        return s + Number(p.horas || 0) * ch;
      }, 0);
      const costoMat = restantes.reduce((s, p) =>
        s + (p.materiales_usados || []).reduce((sm, m) => {
          const itemInv = inventario.find(i => i.sku === m.sku);
          return sm + (m.cantidad || 0) * (itemInv?.costo_promedio || m.costo_unitario || 0);
        }, 0), 0);
      const costoTerceros = restantes.reduce((s, p) => s + (p.terceros_lineas || []).reduce((sm, l) => sm + Number(l.monto || 0), 0), 0);
      const costoLogistica = restantes.reduce((s, p) => s + (p.logistica_lineas || []).reduce((sm, l) => sm + Number(l.monto || 0), 0), 0);

      // Fechas
      const fechas = restantes.map(p => p.fecha).filter(Boolean).sort();
      const nuevosDatos = {
        avance: nuevoAvance,
        costoReal: costoMO + costoMat + costoTerceros + costoLogistica,
        fecha_inicio: fechas[0] || null,
        fecha_fin: fechas[fechas.length - 1] || null,
      };
      opsSync(sb => svcActualizarOT(sb, o.id, nuevosDatos));
      return { ...o, ...nuevosDatos };
    }));

    addNotificacion('Parte reabierto como borrador. Ya puede ser editado por el técnico.');
  };

  const recalcularCostoRealOT = async (otId) => {
    const ot = ots.find(o => o.id === otId);
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        const detalle = await opsPersist(sb => svcCalcularCostoRealOT(sb, otId, empresa.id));
        const nuevosCostoReal = Number(detalle?.total || 0);
        setOts(prev => prev.map(o => o.id === otId ? { ...o, costoReal: nuevosCostoReal } : o));
        opsSync(sb => svcActualizarOT(sb, otId, { costoReal: nuevosCostoReal }));
        opsSync(sb => svcUpsertCostoOT(sb, empresa.id, otId, {
          mano_obra: detalle.mo,
          materiales: detalle.materiales,
          servicios_terceros: detalle.terceros,
          logistica: detalle.logistica,
          moneda: ot?.moneda || 'PEN',
        }));
        addNotificacion(`OT recalculada desde Supabase: MO=${detalle.mo.toFixed(2)}, materiales=${detalle.materiales.toFixed(2)}, terceros=${detalle.terceros.toFixed(2)}, logistica=${detalle.logistica.toFixed(2)}.`);
        return nuevosCostoReal;
      } catch (error) {
        console.error('[Costo real OT]', error?.message || error, error);
        addNotificacion(`No se pudo recalcular desde Supabase: ${error?.message || error}`, 'error');
      }
    }

    const partesAprobados = partes.filter(p => p.ot_id === otId && p.estado === 'aprobado');

    const personasSinTarifa = new Map();
    const registrarSinTarifa = (personaId) => {
      const persona = [...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === personaId);
      const tarifa = Number(persona?.tarifa_hora ?? persona?.costo_hora_real ?? persona?.costo ?? persona?.costo_hora ?? 0);
      if (!persona || tarifa > 0) return;
      personasSinTarifa.set(persona.id, persona.nombre || persona.id);
    };
    const costoMO = partesAprobados.reduce((s, p) => {
      const moItem = (ot?.est_detalle?.mano_obra || []).find(m => m.tecnico_id === p.tecnico_id);
      const ch = (moItem?.costo_hora > 0) ? moItem.costo_hora : calcCostoHora(p.tecnico_id);
      if (!(ch > 0)) registrarSinTarifa(p.tecnico_id);
      return s + Number(p.horas || 0) * ch;
    }, 0);

    const costoMat = partesAprobados.reduce((s, p) =>
      s + (p.materiales_usados || []).reduce((sm, m) => {
        const itemInv = inventario.find(i => i.sku === m.sku);
        return sm + (m.cantidad || 0) * (itemInv?.costo_promedio || m.costo_unitario || 0);
      }, 0), 0);
    const costoTerceros = partesAprobados.reduce((s, p) =>
      s + (p.terceros_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);
    const costoLogistica = partesAprobados.reduce((s, p) =>
      s + (p.logistica_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);

    let costoAdmin = 0;
    try {
      if (empresa?.id) {
        const tareosAdmin = await tareosAdminService.cargarTareos(empresa.id, { otId });
        costoAdmin = (tareosAdmin || [])
          .filter(t => t.estado === 'enviado')
          .reduce((s, t) => {
            const ch = calcCostoHora(t.personal_id);
            if (!(ch > 0)) registrarSinTarifa(t.personal_id);
            return s + Number(t.horas || 0) * ch;
          }, 0);
      }
    } catch (error) {
      console.error('[Tareos admin cost]', error?.message || error, error);
      addNotificacion('No se pudieron incluir las horas administrativas en el recalculo.', 'error');
    }

    const nuevosCostoReal = costoMO + costoAdmin + costoMat + costoTerceros + costoLogistica;
    setOts(prev => prev.map(o => o.id === otId ? { ...o, costoReal: nuevosCostoReal } : o));
    opsSync(sb => svcActualizarOT(sb, otId, { costoReal: nuevosCostoReal }));
    if (empresa?.id) {
      opsSync(sb => svcUpsertCostoOT(sb, empresa.id, otId, {
        mano_obra: costoMO + costoAdmin,
        materiales: costoMat,
        servicios_terceros: costoTerceros,
        logistica: costoLogistica,
        moneda: ot?.moneda || 'PEN',
      }));
    }
    if (personasSinTarifa.size > 0) {
      addNotificacion(`Tarifa no configurada: ${Array.from(personasSinTarifa.values()).join(', ')}.`, 'error');
    }
    addNotificacion(`OT recalculada: MO operativa=${costoMO.toFixed(2)}, MO admin=${costoAdmin.toFixed(2)}, mat=${costoMat.toFixed(2)}, terceros=${costoTerceros.toFixed(2)}, logistica=${costoLogistica.toFixed(2)}.`);
    return nuevosCostoReal;
  };

  const crearTareaOT = async (otId, datos) => {
    const datosTarea = { ...datos, ot_id: otId };
    if (isSupabaseConfigured() && empresa?.id) {
      const result = await opsPersist(sb => svcCrearTarea(sb, datosTarea, empresa.id));
      return result?.data || null;
    }
    const tarea = { id: generateId('tar'), empresa_id: empresa?.id, ...datosTarea, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
    return tarea;
  };

  const completarTareaOT = (otId, tareaId) => {
    const usuarioNombre = authUser?.nombre || authUser?.email || '';
    opsSync(sb => svcCompletarTarea(sb, tareaId, usuarioNombre, empresa.id));
  };

  const reabrirTareaOT = (otId, tareaId) => {
    opsSync(sb => svcReabrirTarea(sb, tareaId, empresa.id));
  };

  const actualizarAvanceSupervisorOT = async (otId, pct, nota) => {
    const usuarioNombre = authUser?.nombre || authUser?.email || '';
    try {
      const result = await opsPersist(sb => svcActualizarAvanceSupervisor(sb, otId, pct, nota, usuarioNombre, empresa.id));
      setOts(prev => prev.map(o => o.id === otId ? { ...o, avance: Number(pct || 0), avance_pct: Number(pct || 0), avance_supervisor_pct: Number(pct || 0) } : o));
      return !!result;
    } catch (e) {
      console.error('[actualizarAvanceSupervisorOT]', e);
      return false;
    }
  };

  const cerrarTecnicamenteOT = async (otId, datosCierre) => {
    const { conformidad_archivo, tareas_incompletas, snapshot_tareas, ...restDatos } = datosCierre;
    const cierreId = generateId('cier');
    const anterior = ots.find(o => o.id === otId) || null;
    const sociedadOtId = anterior?.sociedad_id || null;
    if (empresa?.multisociedad_habilitado && !sociedadOtId) {
      throw new Error('La OT no tiene sociedad asignada. No se puede consumir inventario en un tenant con multisociedad.');
    }

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

    const updateOts = (o) => {
      if (o.id !== otId) return o;
      let newTareas = o.tareas || [];
      if (tareas_incompletas?.length > 0) {
        newTareas = newTareas.map(t => tareas_incompletas.includes(t.id) ? { ...t, estado: 'cerrada_sin_completar' } : t);
      }
      return { ...o, estado: 'cerrada', tareas: newTareas };
    };
    setOts(prev => prev.map(updateOts));
    opsSync(sb => svcActualizarOT(sb, otId, { estado: 'cerrada' }));

    if (tareas_incompletas?.length > 0) {
      opsSync(sb => svcProcesarCierreOTConTareas(sb, otId, tareas_incompletas, snapshot_tareas, authUser?.nombre || authUser?.email, empresa.id));
    }

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

    // Descontar inventario de los partes aprobados de esta OT
    const partesAprobados = partes.filter(p => p.ot_id === otId && p.estado === 'aprobado');
    const itemsADescontar = [];
    partesAprobados.forEach(p => {
      (p.materiales_usados || []).forEach(mu => {
        if (!mu.material_id || !Number(mu.cantidad)) return;
        const existente = itemsADescontar.find(i =>
          i.material_id === mu.material_id &&
          i.lote === (mu.lote || null) &&
          i.serie === (mu.serie || null)
        );
        if (existente) {
          existente.cantidad += Number(mu.cantidad);
        } else {
          const stockRow = inventario.find(i =>
            i.material_id === mu.material_id &&
            (!mu.lote || i.lote === mu.lote) &&
            (sociedadOtId ? i.sociedad_id === sociedadOtId : !i.sociedad_id)
          );
          itemsADescontar.push({
            material_id: mu.material_id,
            cantidad: Number(mu.cantidad),
            almacen_id: mu.almacen_id || stockRow?.almacen_id || null,
            lote: mu.lote || null,
            serie: mu.serie || null,
            vencimiento: mu.vencimiento || null,
            sociedad_id: sociedadOtId,
          });
        }
      });
    });

    if (itemsADescontar.length > 0) {
      setInventario(prev => prev.map(i => {
        const desc = itemsADescontar.find(d =>
          d.material_id === i.material_id &&
          d.lote === (i.lote || null) &&
          d.serie === (i.serie || null) &&
          (sociedadOtId ? i.sociedad_id === sociedadOtId : !i.sociedad_id)
        );
        if (desc) return { ...i, stock_actual: Math.max(0, i.stock_actual - desc.cantidad) };
        return i;
      }));
      if (isSupabaseConfigured()) {
        getSupabaseClient().then(sb => registrarConsumoOTSvc(sb, empresa.id, itemsADescontar, otId, authUser?.id, sociedadOtId))
          .then(() => getStockCompleto(empresa.id).then(inv => { if (inv?.length) setInventario(inv); }))
          .catch(err => console.error('consumo OT inventario:', err));
      } else {
        opsSync(sb => consumirInventario(sb, empresa.id, itemsADescontar, otId, sociedadOtId));
      }
    }

    addNotificacion(`Cierre Técnico registrado para la OT. Inventario consumido.`);
    return { cierreId, tokenConformidad };
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
    opsSync(sb => sb.from('solpe_interna').insert([{
      id: slp.id,
      empresa_id: empresa.id,
      codigo: slp.numero,
      descripcion: slp.descripcion,
      tipo: slp.tipo || 'bien',
      prioridad: slp.prioridad || 'normal',
      urgencia: slp.urgencia || slp.prioridad || 'normal',
      centro_costo_id: slp.centro_costo_id || null,
      origen: slp.origen || slp.origen_tipo || 'manual',
      material_id: slp.material_id || (slp.origen_tipo === 'inventario' ? slp.origen_id : null),
      cantidad_solicitada: slp.cantidad_solicitada || null,
      items: slp.items || [],
      solicitante: slp.solicitante || null,
      ot_id: slp.ot_id || null,
      estado: 'solicitada',
      creado_por: authUser?.id || null,
    }]));
  };

  const enviarSOLPE = (solpeId) => {
    setSolpes(prev => prev.map(s => s.id === solpeId ? { ...s, estado: 'solicitada' } : s));
    opsSync(sb => sb.from('solpe_interna').update({ estado: 'solicitada' }).eq('id', solpeId));
  };

  const atenderSOLPE = (solpeId) => {
    setSolpes(prev => prev.map(s => s.id === solpeId ? { ...s, estado: 'aprobada' } : s));
    opsSync(sb => sb.from('solpe_interna').update({ estado: 'aprobada', aprobada_por: authUser?.id || null, aprobada_at: new Date().toISOString() }).eq('id', solpeId));
  };

  const resolverSociedadOperacion = (registro = {}, { exigirSociedad = false } = {}) => {
    if (!empresa?.multisociedad_habilitado) return null;
    const otId = registro.ot_vinc_id || registro.ot_id || null;
    const ot = otId ? (ots || []).find(item => item.id === otId) : null;
    if (otId && !ot?.sociedad_id) {
      throw new Error('La OT vinculada no tiene sociedad asignada. Corrige la OT antes de registrar el gasto.');
    }
    const cecoId = registro.centro_costo_id || registro.ceco_id || null;
    const ceco = cecoId ? (centrosCosto || []).find(item => item.id === cecoId) : null;
    if (cecoId && !ceco?.sociedad_id) {
      throw new Error('El CECO seleccionado no tiene sociedad asignada. Corrige el CECO antes de registrar el gasto.');
    }
    if (ot?.sociedad_id && ceco?.sociedad_id && ot.sociedad_id !== ceco.sociedad_id) {
      throw new Error('La OT y el CECO seleccionados pertenecen a sociedades distintas.');
    }
    const sociedadDerivada = ot?.sociedad_id || ceco?.sociedad_id || registro.sociedad_id || null;
    if (registro.sociedad_id && sociedadDerivada !== registro.sociedad_id) {
      throw new Error('La sociedad informada no coincide con la sociedad del documento de origen.');
    }
    if (exigirSociedad && !sociedadDerivada) {
      throw new Error('Selecciona una OT, un CECO o una sociedad concreta antes de registrar la operación.');
    }
    return sociedadDerivada;
  };

  const compraGastoPayload = (gasto) => ({
    id: gasto.id,
    empresa_id: empresa.id,
    tipo: gasto.tipo || 'gasto',
    descripcion: gasto.descripcion,
    categoria: gasto.categoria,
    monto: gasto.monto,
    moneda: gasto.moneda || 'PEN',
    fecha: gasto.fecha,
    origen_registro: gasto.origen_registro || 'backoffice',
    estado: gasto.estado || 'registrado',
    estado_pago: gasto.estado_pago || 'pagado',
    referencia_pago: gasto.referencia_pago || null,
    cxp_id: gasto.cxp_id || null,
    centro_costo_id: gasto.centro_costo_id || null,
    sociedad_id: resolverSociedadOperacion(gasto),
    periodo_nomina_id: gasto.periodo_nomina_id || null,
    es_activo_fijo: gasto.es_activo_fijo || false,
    activo_tipo: gasto.activo_tipo || null,
    vida_util_anos: gasto.vida_util_anos || null,
    ...(gasto.personal_id ? { personal_id: gasto.personal_id } : {}),
    ...((gasto.ot_vinc_id || gasto.ot_id) ? { ot_vinc_id: gasto.ot_vinc_id || gasto.ot_id } : {}),
  });

  const insertarCompraGastoSeguro = async (_sb, gasto) => (
    finanzasService.insertarCompraGasto(compraGastoPayload(gasto))
  );

  const crearGasto = (datos, options = {}) => {
    const { notificar = true, persistir = true } = options;
    const gasto = {
      id: generateId('gasto'),
      empresa_id: empresa.id,
      origen_registro: 'backoffice',
      estado: 'registrado',
      created_at: new Date().toISOString(),
      ...datos,
      sociedad_id: resolverSociedadOperacion(datos),
    };
    setComprasGastos(prev => [...prev, gasto]);
    auditSync({ modulo: 'compras', entidad: 'compras_gastos', entidad_id: gasto.id, accion: 'crear', valor_nuevo: gasto });
    if (notificar) addNotificacion('Gasto registrado.');
    if (persistir) opsSync(sb => insertarCompraGastoSeguro(sb, gasto));
    return gasto;
  };

  // ── Presupuestos ─────────────────────────────────────────────────────────────
  const crearPresupuesto = async (datos, partidas) => {
    if (empresa?.multisociedad_habilitado && !datos.sociedad_id) {
      throw new Error('Selecciona una sociedad para crear el presupuesto.');
    }
    const pre = {
      id: generateId('pre'),
      empresa_id: empresa.id,
      nombre: datos.nombre,
      periodo: datos.periodo,
      centro_costo_id: datos.centro_costo_id || null,
      cebe_id: datos.cebe_id || null,
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
      estado: 'borrador',
      creado_por: authUser?.email || null,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };
    const ppas = (partidas || []).map((p, i) => ({
      id: generateId('ppa'),
      empresa_id: empresa.id,
      presupuesto_id: pre.id,
      categoria: p.categoria,
      descripcion: p.descripcion || null,
      monto_presupuestado: Number(p.monto_presupuestado || 0),
      moneda: p.moneda || 'PEN',
      orden: i,
      sociedad_id: pre.sociedad_id,
    }));
    setPresupuestos(prev => [pre, ...prev]);
    setPresupuestoPartidas(prev => [...prev, ...ppas]);
    addNotificacion('Presupuesto creado.');
    if (isSupabaseConfigured()) {
      try {
        await presupuestosService.crearPresupuesto(pre);
        await presupuestosService.insertarPartidas(ppas);
      } catch (err) {
        console.error('[presupuestos] crearPresupuesto:', err?.message || err);
      }
    }
    return pre;
  };

  const actualizarPresupuestoCtx = async (id, datos, partidas) => {
    const updates = {
      nombre: datos.nombre,
      periodo: datos.periodo,
      centro_costo_id: datos.centro_costo_id || null,
      cebe_id: datos.cebe_id || null,
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
    };
    const ppas = (partidas || []).map((p, i) => ({
      id: p.id || generateId('ppa'),
      empresa_id: empresa.id,
      presupuesto_id: id,
      categoria: p.categoria,
      descripcion: p.descripcion || null,
      monto_presupuestado: Number(p.monto_presupuestado || 0),
      moneda: p.moneda || 'PEN',
      orden: i,
      sociedad_id: updates.sociedad_id,
    }));
    setPresupuestos(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setPresupuestoPartidas(prev => [...prev.filter(p => p.presupuesto_id !== id), ...ppas]);
    if (isSupabaseConfigured()) {
      try {
        await presupuestosService.actualizarPresupuesto(id, updates);
        await presupuestosService.reemplazarPartidas(id, ppas);
      } catch (err) {
        console.error('[presupuestos] actualizarPresupuesto:', err?.message || err);
      }
    }
  };

  const enviarPresupuestoAAprobacion = async (id, aprobadores) => {
    const aprs = aprobadores.map((a, i) => ({
      id: generateId('pap'),
      empresa_id: empresa.id,
      presupuesto_id: id,
      orden: i + 1,
      aprobador_id: a.id,
      nombre_aprobador: a.nombre || a.email || a.id,
      estado: 'pendiente',
      fecha_accion: null,
      comentario: null,
      sociedad_id: presupuestos.find(p => p.id === id)?.sociedad_id || null,
    }));
    setPresupuestos(prev => prev.map(p => p.id === id ? { ...p, estado: 'en_aprobacion' } : p));
    setPresupuestoAprobaciones(prev => [...prev.filter(p => p.presupuesto_id !== id), ...aprs]);
    addNotificacion('Presupuesto enviado a aprobación.');
    if (isSupabaseConfigured()) {
      try {
        await presupuestosService.actualizarPresupuesto(id, { estado: 'en_aprobacion' });
        await presupuestosService.insertarAprobaciones(aprs);
      } catch (err) {
        console.error('[presupuestos] enviarAAprobacion:', err?.message || err);
      }
    }
  };

  const procesarAprobacionPresupuesto = async (presupuestoId, aprobacionId, accion, comentario) => {
    const now = new Date().toISOString();
    const nuevoEstadoApr = accion === 'aprobar' ? 'aprobado' : 'rechazado';
    setPresupuestoAprobaciones(prev => prev.map(a =>
      a.id === aprobacionId ? { ...a, estado: nuevoEstadoApr, fecha_accion: now, comentario: comentario || null } : a
    ));
    if (isSupabaseConfigured()) {
      try {
        await presupuestosService.actualizarAprobacion(aprobacionId, { estado: nuevoEstadoApr, fecha_accion: now, comentario: comentario || null });
      } catch (err) {
        console.error('[presupuestos] actualizarAprobacion:', err?.message || err);
      }
    }
    if (accion === 'rechazar') {
      setPresupuestos(prev => prev.map(p => p.id === presupuestoId ? { ...p, estado: 'borrador' } : p));
      addNotificacion('Presupuesto rechazado — vuelve a borrador.');
      if (isSupabaseConfigured()) {
        presupuestosService.actualizarPresupuesto(presupuestoId, { estado: 'borrador' }).catch(() => {});
      }
    } else {
      // verificar si era el último aprobador
      setPresupuestoAprobaciones(prev => {
        const cadena = prev.filter(a => a.presupuesto_id === presupuestoId);
        const actualizado = cadena.map(a => a.id === aprobacionId ? { ...a, estado: 'aprobado', fecha_accion: now, comentario: comentario || null } : a);
        const todoAprobado = actualizado.every(a => a.estado === 'aprobado');
        if (todoAprobado) {
          setPresupuestos(pp => pp.map(p => p.id === presupuestoId ? { ...p, estado: 'aprobado' } : p));
          addNotificacion('Presupuesto aprobado completamente.');
          if (isSupabaseConfigured()) {
            presupuestosService.actualizarPresupuesto(presupuestoId, { estado: 'aprobado' }).catch(() => {});
          }
        }
        return prev;
      });
    }
  };

  const getMontoTotalOSCliente = (os) => Number(
    os?.monto_aprobado ??
    os?.total ??
    os?.total_aprobado ??
    os?.importe_total ??
    0
  );

  const getValorizacionesAprobadasConActual = (valAprobada) => {
    const existe = valorizaciones.some(v => v.id === valAprobada.id);
    const base = existe
      ? valorizaciones.map(v => v.id === valAprobada.id ? valAprobada : v)
      : [...valorizaciones, valAprobada];
    return base.filter(v => v.estado === 'aprobada');
  };

  const calcularOtsPendienteCierrePorValorizacion = (valAprobada) => {
    const otIds = Array.from(new Set(valAprobada?.ot_ids || []));
    if (!otIds.length) return [];

    const valsAprobadas = getValorizacionesAprobadasConActual(valAprobada);
    return otIds.filter(otId => {
      const ot = ots.find(o => o.id === otId);
      if (!ot || ot.estado !== 'ejecucion') return false;

      const os = osClientes.find(o => o.id === (ot.os_cliente_id || valAprobada.os_cliente_id));
      const montoTotalOS = getMontoTotalOSCliente(os);
      if (montoTotalOS <= 0) return false;

      const montoAcumuladoOT = valsAprobadas
        .filter(v => (v.ot_ids || []).includes(otId))
        .reduce((sum, v) => sum + Number(v.total || 0), 0);

      return montoAcumuladoOT + 0.01 >= montoTotalOS;
    });
  };

  const moverOtsPendienteCierrePorValorizacion = (valAprobada) => {
    const otsPendienteCierre = calcularOtsPendienteCierrePorValorizacion(valAprobada);
    if (!otsPendienteCierre.length) return 0;

    setOts(prev => prev.map(ot =>
      otsPendienteCierre.includes(ot.id) && ot.estado === 'ejecucion'
        ? { ...ot, estado: 'pendiente_cierre' }
        : ot
    ));
    opsSync(sb => sb
      .from('ordenes_trabajo')
      .update({ estado: 'pendiente_cierre', updated_at: new Date().toISOString() })
      .eq('empresa_id', empresa.id)
      .eq('estado', 'ejecucion')
      .in('id', otsPendienteCierre)
    );
    otsPendienteCierre.forEach(otId => {
      auditSync({
        modulo: 'operaciones',
        entidad: 'ordenes_trabajo',
        entidad_id: otId,
        accion: 'pendiente_cierre_por_valorizacion',
        valor_nuevo: { estado: 'pendiente_cierre', valorizacion_id: valAprobada.id },
      });
    });

    return otsPendienteCierre.length;
  };

  const mensajeValorizacionAprobada = (numero, otsMovidas = 0) => {
    if (otsMovidas > 0) {
      return `Valorización ${numero} aprobada. ${otsMovidas} OT${otsMovidas === 1 ? '' : 's'} movida${otsMovidas === 1 ? '' : 's'} a Pendiente cierre.`;
    }
    return `Valorización ${numero} aprobada.`;
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
      tipo: (meta.otIds || []).some(id => ots.find(o => o.id === id)?.estado === 'ejecucion') ? 'avance' : 'final',
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
        const otsCerradas = ots.filter(o => meta.otIds.includes(o.id) && o.estado === 'cerrada').map(o => o.id);
        if (otsCerradas.length) {
          setOts(prev => prev.map(ot => otsCerradas.includes(ot.id) ? { ...ot, estado: 'valorizada' } : ot));
          otsCerradas.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'valorizada' })));
        }
      }
    }

    const otsMovidasPendienteCierre = estadoFinal === 'aprobada'
      ? moverOtsPendienteCierrePorValorizacion(val)
      : 0;

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.crearValorizacion({
          id: val.id,
          empresa_id: val.empresa_id,
          os_cliente_id: val.os_cliente_id,
          numero: val.numero,
          fecha: val.fecha,
          tipo: val.tipo,
          periodo: val.periodo,
          subtotal: val.subtotal,
          igv: val.igv,
          total: val.total,
          moneda: val.moneda,
          estado: val.estado,
          modelo_calculo: val.modelo_calculo,
          notas: val.notas,
          ot_ids: val.ot_ids,
          items: val.items,
          fecha_aprobacion: val.fecha_aprobacion,
          historial: val.historial,
        });
      });
    }

    addNotificacion(estadoFinal === 'borrador'
      ? `Valorización ${val.numero} guardada como borrador.`
      : mensajeValorizacionAprobada(val.numero, otsMovidasPendienteCierre));
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
      const otsCerradas = ots.filter(o => val.ot_ids.includes(o.id) && o.estado === 'cerrada').map(o => o.id);
      if (otsCerradas.length) {
        setOts(prev => prev.map(ot => otsCerradas.includes(ot.id) ? { ...ot, estado: 'valorizada' } : ot));
        otsCerradas.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'valorizada' })));
      }
    }
    const valAprobada = { ...val, estado: 'aprobada', fecha_aprobacion: now, historial: [...(val.historial || []), entrada] };
    const otsMovidasPendienteCierre = moverOtsPendienteCierrePorValorizacion(valAprobada);

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarValorizacion(valId, {
        estado: 'aprobada',
        fecha_aprobacion: now,
        historial: [...(val.historial || []), entrada],
      }));
    }

    addNotificacion(mensajeValorizacionAprobada(val.numero, otsMovidasPendienteCierre));
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
        const otsARevertir = ots.filter(o => val.ot_ids.includes(o.id) && o.estado === 'valorizada').map(o => o.id);
        if (otsARevertir.length) {
          setOts(prev => prev.map(ot => otsARevertir.includes(ot.id) ? { ...ot, estado: 'cerrada' } : ot));
          otsARevertir.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'cerrada' })));
        }
      }
    }

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarValorizacion(valId, {
        estado: 'anulada',
        motivo_anulacion: motivo,
        historial: [...(val.historial || []), entrada],
      }));
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
      tipo: (datos.ot_ids || []).some(id => ots.find(o => o.id === id)?.estado === 'ejecucion') ? 'avance' : 'final',
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
        const otsCerradas = ots.filter(o => datos.ot_ids.includes(o.id) && o.estado === 'cerrada').map(o => o.id);
        if (otsCerradas.length) {
          setOts(prev => prev.map(ot => otsCerradas.includes(ot.id) ? { ...ot, estado: 'valorizada' } : ot));
          otsCerradas.forEach(otId => opsSync(sb => svcActualizarOT(sb, otId, { estado: 'valorizada' })));
        }
      }
    }
    const otsMovidasPendienteCierre = estadoFinal === 'aprobada'
      ? moverOtsPendienteCierrePorValorizacion(updated)
      : 0;

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarValorizacion(valId, {
        subtotal: datos.subtotal, igv: datos.igv, total: datos.total,
        periodo: datos.periodo, modelo_calculo: datos.modelo_calculo,
        notas: datos.notas, items: datos.items || [], ot_ids: datos.ot_ids || [], estado: estadoFinal,
        tipo: updated.tipo,
        historial: updated.historial,
        ...(estadoFinal === 'aprobada' ? { fecha_aprobacion: now } : {}),
      }));
    }

    addNotificacion(estadoFinal === 'aprobada'
      ? mensajeValorizacionAprobada(val.numero, otsMovidasPendienteCierre)
      : `Valorización ${val.numero} actualizada.`);
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

  const crearUsuarioConAcceso = async ({ nombre, email, password, rol, jefe_user_id = null, posicion_id = null, asignaciones = [], alcance_tipo, sociedades_ids, campo = false, campoModulos = [], modo_automatico = false, personal_tipo = null, personal_id = null }) => {
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
          posicion_id: posicion_id || null,
          asignaciones,
          modo_automatico: modo_automatico === true,
          personal_tipo: personal_tipo || null,
          personal_id: personal_id || null,
          ...(alcance_tipo ? { alcance_tipo, sociedades_ids: sociedades_ids ?? null } : {}),
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
          const mods = conSolicitudesIncluido([...new Set(campoModulos.filter(Boolean))]);
          const perfilLegacy = ({ tecnico: 'Tecnico', vendedor: 'Vendedor', compras: 'Compras', supervisor: 'Supervisor', gerencia: 'Gerencia', asistencia: 'Asistencia', logistica: 'Logistica', mi_espacio: 'Empleado' }[mods[0]] || 'Tecnico');
          const saved = await usuariosService.actualizarUsuarioAcceso({
            user_id: uid,
            empresa_id: empresa.id,
            nombre,
            email,
            // En modo automático el rol se deriva y valida en el servidor.
            // Usar el rol devuelto evita sobrescribirlo con el valor vacío del cliente.
            rol: nuevoUsuario.rol || rol,
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
      if (posicion_id) await refrescarPosiciones();
      addNotificacion(
        data.alreadyExists
          ? `El usuario ${nombre} ya tenia cuenta. Se agrego al tenant actual y usara su contrasena actual.`
          : `Usuario ${nombre} creado. Ya puede ingresar con la contrasena temporal.`
      );
      return { ...nuevoUsuario, temporaryPassword: data.temporaryPassword || null, alreadyExists: Boolean(data.alreadyExists) };
    } catch (err) {
      addNotificacion('Error al crear usuario: ' + (err.message || 'Error desconocido'), 'error');
      throw err;
    }
  };

  const obtenerRolSugeridoPorPosicion = async (posicionId) => {
    const posicion = posiciones.find(p => p.id === posicionId);
    if (!posicion?.cargo_colocacion_id || !isSupabaseConfigured() || !empresa?.id) return null;
    if (posicion.empresa_id !== empresa.id) return null;

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cargo_colocaciones')
      .select('rol_id')
      .eq('id', posicion.cargo_colocacion_id)
      .eq('empresa_id', empresa.id)
      .maybeSingle();
    if (error) throw error;
    return data?.rol_id || null;
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
      if (Array.isArray(mods) && mods.length) return conSolicitudesIncluido([...new Set(mods.filter(Boolean))]);
      const value = String(perfil || '').toLowerCase();
      if (value.includes('vendedor')) return ['vendedor'];
      if (value.includes('compra')) return ['compras'];
      if (value.includes('supervisor')) return ['supervisor'];
      if (value.includes('gerencia')) return ['gerencia'];
      if (value.includes('admin')) return ['administrativo', 'solicitudes'];
      return ['tecnico'];
    };
    const campoModulos = datos.campo ? normalizarCampoModulos(datos.campoModulos || datos.campo_modulos, datos.campoPerfil || datos.perfil_campo) : [];
    const campoPerfilLegacy = campoModulos[0]
      ? ({ tecnico: 'Tecnico', vendedor: 'Vendedor', compras: 'Compras', supervisor: 'Supervisor', gerencia: 'Gerencia', asistencia: 'Asistencia', logistica: 'Logistica', administrativo: 'Administrativo' }[campoModulos[0]] || 'Tecnico')
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
        posicion_id: nextUser.posicion_id || null,
        asignaciones: nextUser.asignaciones || [],
        ...(nextUser.alcance_tipo ? {
          alcance_tipo: nextUser.alcance_tipo,
          sociedades_ids: nextUser.sociedades_ids ?? null,
        } : {}),
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
      // Al inactivar se libera la posición; refrescamos también en ese caso para que el
      // organigrama y los selectores no conserven el ocupante anterior en memoria.
      if (nextUser.posicion_id || String(nextUser.estado || '').trim().toLowerCase() !== 'activo') {
        await refrescarPosiciones();
      }
      addNotificacion(`Usuario ${mergedSavedUser.nombre || nextUser.nombre || ''} actualizado.`);
      return mergedSavedUser;
    } catch (err) {
      setUsuarios(previous);
      addNotificacion('Error al actualizar usuario: ' + (err.message || 'Error desconocido'), 'error');
      throw err;
    }
  };

  const reasignarRolUsuario = async (usuarioId, rolId, empresaId = empresa?.id) => {
    const previous = usuarios;
    const current = usuarios.find(u => u.id === usuarioId && (!empresaId || u.empresa_id === empresaId));
    if (!current) throw new Error('No se encontro el usuario dentro del tenant seleccionado.');
    const role = rolesCtx[rolId];
    if (!role) throw new Error('El rol seleccionado ya no esta disponible.');

    const actualizarLocal = (usuario, reasignacion = {}) => ({
      ...usuario,
      rol: rolId,
      rol_nombre: reasignacion.rol_nombre || role.nombre,
      rol_categoria: reasignacion.rol_categoria || role.categoria,
      nivel_jerarquico: reasignacion.nivel_jerarquico || role.nivel_jerarquico,
      asignaciones: Array.isArray(reasignacion.asignaciones)
        ? reasignacion.asignaciones
        : (usuario.asignaciones || []).map(asignacion => asignacion.principal
          ? {
            ...asignacion,
            rol_id: rolId,
            categoria: role.categoria || asignacion.categoria,
            nivel_jerarquico: role.nivel_jerarquico || asignacion.nivel_jerarquico,
          }
          : asignacion),
    });

    setUsuarios(prev => prev.map(usuario => (
      usuario.id === usuarioId && usuario.empresa_id === empresaId ? actualizarLocal(usuario) : usuario
    )));

    if (!isSupabaseConfigured()) return actualizarLocal(current);

    try {
      const reasignacion = await usuariosService.reasignarRolUsuario({
        user_id: usuarioId,
        empresa_id: empresaId,
        rol: rolId,
      });
      const savedUser = actualizarLocal(current, reasignacion);
      setUsuarios(prev => prev.map(usuario => (
        usuario.id === usuarioId && usuario.empresa_id === empresaId ? savedUser : usuario
      )));
      return savedUser;
    } catch (error) {
      setUsuarios(previous);
      throw error;
    }
  };

  const asignarPasswordTemporal = async (usuarioId, password) => {
    if (!isSupabaseConfigured()) {
      addNotificacion('Se requiere Supabase para asignar contrasenas temporales.', 'error');
      return;
    }
    const empresaId = usuarios.find(u => u.id === usuarioId)?.empresa_id || empresa?.id;
    try {
      if (!empresaId) throw new Error('No hay tenant activo para asignar la contrasena.');
      await usuariosService.asignarPasswordTemporal({ user_id: usuarioId, empresa_id: empresaId, password });
      setUsuarios(prev => prev.map(u => u.id === usuarioId ? { ...u, must_change_password: true } : u));
    } catch (err) {
      addNotificacion('Error al asignar contrasena: ' + (err.message || 'Error desconocido'), 'error');
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
    const {
      fecha_vencimiento_manual: _fechaVencimientoManual,
      fecha_vencimiento_resuelta: _fechaVencimientoResuelta,
      omitir_aviso_condicion_pago: omitirAvisoCondicionPago,
      ...datosCxC
    } = datos || {};
    const vencimientoCxC = resolverVencimientoCxC(datos || {});
    const cuentaCobrar = {
      id: generateId('cxc'),
      empresa_id: empresa.id,
      estado: 'por_cobrar',
      monto_pagado: 0,
      saldo: datosCxC.monto_total,
      ...datosCxC,
      fecha_emision: vencimientoCxC.fechaEmision,
      fecha_vencimiento: vencimientoCxC.fechaVencimiento,
      condicion_pago: vencimientoCxC.condicionPago,
    };
    setCxc(prev => [...prev, cuentaCobrar]);

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.generarCxC({ ...cuentaCobrar, fecha_vencimiento_resuelta: true });
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cuentaCobrar.id, accion: 'crear', valor_nuevo: cuentaCobrar });
    if (vencimientoCxC.usoFallback && !omitirAvisoCondicionPago) {
      addNotificacion(mensajeFallbackCondicionPagoCxC);
    }
    addNotificacion('Cuenta por Cobrar registrada.');
  };

  const emitirFacturaConCxC = async (datos = {}) => {
    if (empresa?.multisociedad_habilitado && !datos.sociedad_id) {
      throw new Error('Debe seleccionar una sociedad para emitir la factura.');
    }
    const vencimientoCxC = resolverVencimientoCxC(datos || {});
    const fechaEmision = vencimientoCxC.fechaEmision;
    const fechaVencimiento = vencimientoCxC.fechaVencimiento;
    const condicionPago = vencimientoCxC.condicionPago;
    const centroBeneficioId = datos.centro_beneficio_id || null;
    const centroBeneficio = centrosBeneficio.find(c => c.id === centroBeneficioId && c.empresa_id === empresa.id);

    if (!centroBeneficioId) {
      throw new Error('Debe seleccionar un CEBE para emitir la factura.');
    }
    if (!centroBeneficio) {
      throw new Error('El CEBE seleccionado no existe en el tenant actual.');
    }
    if (centroBeneficio.estado !== 'activo') {
      throw new Error('El CEBE seleccionado está inactivo.');
    }
    if (centroBeneficio.fecha_inicio && fechaEmision < String(centroBeneficio.fecha_inicio).slice(0, 10)) {
      throw new Error('El CEBE seleccionado no está vigente para la fecha de emisión.');
    }
    if (centroBeneficio.fecha_fin && fechaEmision > String(centroBeneficio.fecha_fin).slice(0, 10)) {
      throw new Error('El CEBE seleccionado no está vigente para la fecha de emisión.');
    }

    const serieDoc = (seriesDocumentarias || []).find(s => s.documento === 'Facturas' && s.estado === 'activo');
    const numero = datos.numero || (serieDoc
      ? `${serieDoc.serie}-${String(Number(serieDoc.siguiente_correlativo)).padStart(4,'0')}`
      : `F001-${String((facturas||[]).length+1).padStart(4,'0')}`);

    // En Supabase la factura y su CxC se persisten juntas. No se debe usar
    // emitirFactura + generarCxC por separado: ambas escrituras compiten y la
    // CxC puede llegar antes que su factura, violando la clave foranea.
    if (isSupabaseConfigured()) {
      const resultado = await finanzasService.emitirFacturaConCxCAtomica({
        empresa_id: empresa.id,
        factura_id: generateId('fac'),
        cxc_id: generateId('cxc'),
        tipo_documento: datos.tipo_documento || 'factura',
        cuenta_id: datos.cuenta_id,
        os_cliente_id: datos.os_cliente_id || null,
        valorizacion_id: datos.valorizacion_id || null,
        centro_beneficio_id: centroBeneficioId,
        sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
        items: datos.items || [],
        numero,
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVencimiento,
        condicion_pago: condicionPago,
        subtotal: datos.subtotal,
        igv: datos.igv,
        total: datos.total,
        moneda: datos.moneda || 'PEN',
        glosa: datos.glosa || null,
        notas: datos.notas || null,
        aplica_retencion: datos.aplica_retencion || false,
        monto_retencion: datos.monto_retencion || 0,
      });
      const facturaCreada = resultado?.factura;
      const cxcCreada = resultado?.cxc;
      if (!facturaCreada?.id || !cxcCreada?.id) throw new Error('La emisión no devolvió la factura y la CxC creadas.');

      setFacturas(prev => [facturaCreada, ...prev]);
      setCxc(prev => [cxcCreada, ...prev]);
      if (datos.valorizacion_id) {
        setValorizaciones(prev => prev.map(v => v.id === datos.valorizacion_id ? { ...v, estado: 'facturada' } : v));
      }
      if (resultado.os?.id) setOsClientes(prev => prev.map(os => os.id === resultado.os.id ? resultado.os : os));
      if (serieDoc) {
        const nextCorr = Number(serieDoc.siguiente_correlativo) + 1;
        setSeriesDocumentarias(prev => prev.map(s => s.id === serieDoc.id ? { ...s, siguiente_correlativo: nextCorr } : s));
        getSupabaseClient().then(sb =>
          sb.from('series_documentarias').update({ siguiente_correlativo: nextCorr }).eq('id', serieDoc.id)
            .then(({ error }) => { if (error) console.error('[series] increment failed:', error); })
        );
      }
      auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: facturaCreada.id, accion: 'emitir', valor_nuevo: facturaCreada });
      auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcCreada.id, accion: 'crear', valor_nuevo: cxcCreada });
      if (vencimientoCxC.usoFallback) addNotificacion(mensajeFallbackCondicionPagoCxC);
      addNotificacion(`Factura ${numero} emitida y CxC generada.`);
      return facturaCreada.id;
    }

    const facturaId = await emitirFactura({
      tipo_documento: datos.tipo_documento || 'factura',
      cuenta_id: datos.cuenta_id,
      os_cliente_id: datos.os_cliente_id || null,
      valorizacion_id: datos.valorizacion_id || null,
      centro_beneficio_id: centroBeneficioId,
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
      items: datos.items || [],
      numero,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      condicion_pago: condicionPago,
      subtotal: datos.subtotal,
      igv: datos.igv,
      total: datos.total,
      moneda: datos.moneda || 'PEN',
      glosa: datos.glosa || null,
      notas: datos.notas || null,
      aplica_retencion: datos.aplica_retencion || false,
      monto_retencion: datos.monto_retencion || 0,
      monto_neto_cobrable: datos.aplica_retencion ? (datos.monto_neto_cobrable || datos.total) : null,
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

    const saldoInicial = datos.aplica_retencion
      ? (datos.monto_neto_cobrable || datos.total)
      : datos.total;
    await generarCxC({
      cuenta_id: datos.cuenta_id,
      factura_id: facturaId,
      os_cliente_id: datos.os_cliente_id || null,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      fecha_vencimiento_resuelta: true,
      omitir_aviso_condicion_pago: true,
      condicion_pago: condicionPago,
      monto_total: datos.total,
      monto_pagado: 0,
      saldo: saldoInicial,
      monto_retencion: datos.monto_retencion || 0,
      moneda: datos.moneda || 'PEN',
      estado: 'por_cobrar',
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
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

    if (vencimientoCxC.usoFallback) {
      addNotificacion(mensajeFallbackCondicionPagoCxC);
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
      centro_beneficio_id: datos.centro_beneficio_id || osCliente?.centro_beneficio_id || null,
      ...datos,
    });
  };

  const actualizarVencimientoCxC = async (cxcId, fechaVencimiento) => {
    const cuentaCobrar = cxc.find(c => c.id === cxcId);
    const fechaAnterior = cuentaCobrar?.fecha_vencimiento || cuentaCobrar?.vence || null;
    if (!cuentaCobrar || !fechaVencimiento || fechaAnterior === fechaVencimiento) return cuentaCobrar || null;

    const actualizada = { ...cuentaCobrar, fecha_vencimiento: fechaVencimiento };
    setCxc(prev => prev.map(c => c.id === cxcId ? actualizada : c));

    try {
      if (isSupabaseConfigured()) {
        await finanzasService.actualizarVencimientoCxC(cxcId, fechaVencimiento);
      }
      auditSync({
        modulo: 'finanzas',
        entidad: 'cxc',
        entidad_id: cxcId,
        accion: 'editar_vencimiento',
        valor_anterior: { campo: 'fecha_vencimiento', valor: fechaAnterior },
        valor_nuevo: { campo: 'fecha_vencimiento', valor: fechaVencimiento },
      });
      addNotificacion('Fecha de vencimiento de CxC actualizada.');
      return actualizada;
    } catch (error) {
      setCxc(prev => prev.map(c => c.id === cxcId ? cuentaCobrar : c));
      addNotificacion(`No se pudo actualizar el vencimiento: ${error?.message || 'error desconocido'}`, 'error');
      throw error;
    }
  };

  const condonarMoraCxC = async (cxcId) => {
    const anterior = cxc.find(c => c.id === cxcId);
    setCxc(prev => prev.map(c => c.id === cxcId ? { ...c, tasa_mora_diaria: 0 } : c));
    if (isSupabaseConfigured()) {
      await finanzasService.actualizarCxC(cxcId, { tasa_mora_diaria: 0 });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcId, accion: 'condonar_mora', valor_anterior: { tasa_mora_diaria: anterior?.tasa_mora_diaria }, valor_nuevo: { tasa_mora_diaria: 0 } });
    addNotificacion('Mora condonada. El interés ya no aplica para esta CxC.');
  };

  const restaurarMoraCxC = async (cxcId) => {
    const tasaDefault = 0.000833;
    setCxc(prev => prev.map(c => c.id === cxcId ? { ...c, tasa_mora_diaria: tasaDefault } : c));
    if (isSupabaseConfigured()) {
      await finanzasService.actualizarCxC(cxcId, { tasa_mora_diaria: tasaDefault });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcId, accion: 'restaurar_mora', valor_nuevo: { tasa_mora_diaria: tasaDefault } });
    addNotificacion('Tasa de mora restaurada al valor estándar (0.0833% diario).');
  };

  const actualizarFechaEmisionFactura = async (facturaId, fechaEmision) => {
    const factura = facturas.find(f => f.id === facturaId);
    const cxcVinculada = cxc.find(c => c.factura_id === facturaId);
    const fechaAnterior = factura?.fecha_emision || null;
    if (!factura || !fechaEmision || fechaAnterior === fechaEmision) return factura || null;

    const facturaActualizada = { ...factura, fecha_emision: fechaEmision };
    const cxcActualizada = cxcVinculada ? { ...cxcVinculada, fecha_emision: fechaEmision } : null;
    setFacturas(prev => prev.map(f => f.id === facturaId ? facturaActualizada : f));
    if (cxcActualizada) {
      setCxc(prev => prev.map(c => c.id === cxcActualizada.id ? cxcActualizada : c));
    }

    try {
      if (isSupabaseConfigured()) {
        const updatedAt = new Date().toISOString();
        await finanzasService.actualizarFactura(facturaId, { fecha_emision: fechaEmision, updated_at: updatedAt });
        if (cxcVinculada) {
          await finanzasService.actualizarCxC(cxcVinculada.id, { fecha_emision: fechaEmision, updated_at: updatedAt });
        }
      }
      auditSync({
        modulo: 'finanzas',
        entidad: 'facturas',
        entidad_id: facturaId,
        accion: 'editar_fecha_emision',
        valor_anterior: { campo: 'fecha_emision', valor: fechaAnterior },
        valor_nuevo: { campo: 'fecha_emision', valor: fechaEmision },
      });
      if (cxcVinculada) {
        auditSync({
          modulo: 'finanzas',
          entidad: 'cxc',
          entidad_id: cxcVinculada.id,
          accion: 'editar_fecha_emision_factura',
          valor_anterior: { campo: 'fecha_emision', valor: cxcVinculada.fecha_emision || null, factura_id: facturaId },
          valor_nuevo: { campo: 'fecha_emision', valor: fechaEmision, factura_id: facturaId },
        });
      }
      addNotificacion('Fecha de emisión de factura actualizada.');
      return facturaActualizada;
    } catch (error) {
      setFacturas(prev => prev.map(f => f.id === facturaId ? factura : f));
      if (cxcVinculada) {
        setCxc(prev => prev.map(c => c.id === cxcVinculada.id ? cxcVinculada : c));
      }
      addNotificacion(`No se pudo actualizar la fecha de emisión: ${error?.message || 'error desconocido'}`, 'error');
      throw error;
    }
  };

  const subirArchivoFactura = async (facturaId, tipo, file) => {
    if (!file || !facturaId || !empresa?.id) throw new Error('Datos incompletos para subir archivo.');
    if (!isSupabaseConfigured()) throw new Error('Supabase no est\xe1 configurado.');
    const sb = await getSupabaseClient();
    const ext = (file.name.split('.').pop() || tipo).toLowerCase();
    const bucket = 'facturas-docs';
    const path = `${empresa.id}/${facturaId}/${tipo}.${ext}`;
    // Eliminar anterior si existe
    await sb.storage.from(bucket).remove([path]).catch(() => {});
    const { error: upErr } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (upErr) throw upErr;
    // URL firmada con 10 años de vigencia (365*10 días)
    const { data: signed, error: signErr } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr) throw signErr;
    const url = signed.signedUrl;
    const campo = tipo === 'pdf' ? 'archivo_pdf_url' : 'archivo_zip_url';
    setFacturas(prev => prev.map(f => f.id === facturaId ? { ...f, [campo]: url } : f));
    await sb.from('facturas').update({ [campo]: url, updated_at: new Date().toISOString() }).eq('id', facturaId);
    return url;
  };

  const eliminarArchivoFactura = async (facturaId, tipo) => {
    if (!facturaId || !empresa?.id) return;
    if (!isSupabaseConfigured()) return;
    const sb = await getSupabaseClient();
    const bucket = 'facturas-docs';
    // Busca el archivo con cualquier extensi\xf3n
    const prefix = `${empresa.id}/${facturaId}/${tipo}`;
    const { data: listedFiles } = await sb.storage.from(bucket).list(`${empresa.id}/${facturaId}`);
    const match = (listedFiles || []).find(f => f.name.startsWith(tipo + '.'));
    if (match) await sb.storage.from(bucket).remove([`${empresa.id}/${facturaId}/${match.name}`]).catch(() => {});
    const campo = tipo === 'pdf' ? 'archivo_pdf_url' : 'archivo_zip_url';
    setFacturas(prev => prev.map(f => f.id === facturaId ? { ...f, [campo]: null } : f));
    await sb.from('facturas').update({ [campo]: null, updated_at: new Date().toISOString() }).eq('id', facturaId);
  };

  const actualizarDatosFactura = async (facturaId, { numero, fecha_emision, items, subtotal, igv, total, condicion_pago, fecha_vencimiento, moneda, glosa, notas }) => {
    const factura = facturas.find(f => f.id === facturaId);
    if (!factura || factura.estado === 'anulada') return;

    const updates = {
      ...(numero          !== undefined && { numero }),
      ...(fecha_emision   !== undefined && { fecha_emision }),
      ...(items           !== undefined && { items }),
      ...(subtotal        !== undefined && { subtotal }),
      ...(igv             !== undefined && { igv }),
      ...(total           !== undefined && { total }),
      ...(condicion_pago  !== undefined && { condicion_pago }),
      ...(fecha_vencimiento !== undefined && { fecha_vencimiento }),
      ...(moneda          !== undefined && { moneda }),
      ...(glosa           !== undefined && { glosa }),
      ...(notas           !== undefined && { notas }),
      updated_at: new Date().toISOString(),
    };
    setFacturas(prev => prev.map(f => f.id === facturaId ? { ...f, ...updates } : f));

    // Actualizar CxC vinculada
    const cxcVinc = cxc.find(c => c.factura_id === facturaId && c.estado !== 'anulada');
    if (cxcVinc) {
      const cxcUpdates = {};
      if (total !== undefined) {
        const nuevoSaldo = Math.max(0, total - Number(cxcVinc.monto_pagado || 0));
        cxcUpdates.monto_total = total;
        cxcUpdates.saldo = nuevoSaldo;
        cxcUpdates.estado = nuevoSaldo <= 0 ? 'cobrada' : cxcVinc.estado === 'cobrada' ? 'por_cobrar' : cxcVinc.estado;
      }
      if (moneda          !== undefined) cxcUpdates.moneda = moneda;
      if (condicion_pago  !== undefined) cxcUpdates.condicion_pago = condicion_pago;
      if (fecha_vencimiento !== undefined) cxcUpdates.fecha_vencimiento = fecha_vencimiento;
      if (fecha_emision   !== undefined) cxcUpdates.fecha_emision = fecha_emision;
      if (Object.keys(cxcUpdates).length > 0) {
        setCxc(prev => prev.map(c => c.id === cxcVinc.id ? { ...c, ...cxcUpdates } : c));
        if (isSupabaseConfigured()) {
          finSync(async () => {
            const sb = await getSupabaseClient();
            await sb.from('cxc').update(cxcUpdates).eq('id', cxcVinc.id);
          });
        }
      }
    }

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarFactura(facturaId, updates));
    }
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: facturaId, accion: 'editar_datos' });
    addNotificacion('Factura actualizada.');
  };

  const textoComisionKey = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const mismoValorComision = (a, b) => {
    const rawA = String(a || '').trim();
    const rawB = String(b || '').trim();
    return Boolean(rawA && rawB && rawA === rawB);
  };

  const buscarVendedorComisionLocal = (refs = [], lista = personalAdmin) => {
    const ids = refs.map(r => String(r || '').trim()).filter(Boolean);
    const textos = ids.map(textoComisionKey).filter(Boolean);
    return (lista || []).find(p =>
      ids.some(ref => mismoValorComision(p.id, ref) || mismoValorComision(p.auth_user_id, ref)) ||
      textos.some(ref =>
        textoComisionKey(p.nombre) === ref ||
        textoComisionKey(p.email) === ref
      )
    ) || null;
  };

  const fetchRegistroSupabase = async (tabla, id, select = '*') => {
    if (!isSupabaseConfigured() || !id) return null;
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.from(tabla).select(select).eq('id', id).maybeSingle();
      if (error) return null;
      return data || null;
    } catch (_error) {
      return null;
    }
  };

  const buscarVendedorComision = async (refs = []) => {
    const local = buscarVendedorComisionLocal(refs);
    if (local || !isSupabaseConfigured() || !empresa?.id) return local;
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from('personal_administrativo')
        .select('*')
        .eq('empresa_id', empresa.id)
        .limit(500);
      if (error) return null;
      return buscarVendedorComisionLocal(refs, data || []);
    } catch (_error) {
      return null;
    }
  };

  const resolverContextoComisionCobro = async (cuentaCobrar = {}) => {
    const facturaId = cuentaCobrar?.factura_id || cuentaCobrar?.facturas?.id || null;
    const osId = cuentaCobrar?.os_cliente_id || cuentaCobrar?.os_clientes?.id || cuentaCobrar?.facturas?.os_cliente_id || null;
    const cuentaId = cuentaCobrar?.cuenta_id || cuentaCobrar?.cuentas?.id || null;

    const factura = facturas.find(f => f.id === facturaId) ||
      cuentaCobrar?.facturas ||
      await fetchRegistroSupabase('facturas', facturaId);
    const osCliente = osClientes.find(os => os.id === osId) ||
      cuentaCobrar?.os_clientes ||
      await fetchRegistroSupabase('os_clientes', osId);
    const cuenta = cuentas.find(c => c.id === cuentaId) ||
      cuentaCobrar?.cuentas ||
      await fetchRegistroSupabase('cuentas', cuentaId);

    const oportunidadId = cuentaCobrar?.oportunidad_id ||
      osCliente?.oportunidad_id ||
      factura?.oportunidad_id ||
      null;
    const oportunidad = oportunidades.find(op =>
      op.id === oportunidadId ||
      (osCliente?.id && op.os_cliente_id === osCliente.id)
    ) || await fetchRegistroSupabase('oportunidades', oportunidadId);

    const responsableRefs = [
      oportunidad?.responsable_id,
      oportunidad?.vendedor_id,
      oportunidad?.responsable,
      oportunidad?.asignado_a,
      oportunidad?.usuario,
      osCliente?.responsable_comercial_id,
      osCliente?.responsable_comercial,
      cuenta?.responsable_id,
      cuenta?.responsable_comercial,
      cuentaCobrar?.responsable_id,
      cuentaCobrar?.responsable_comercial,
    ].filter(Boolean);

    const vendedor = await buscarVendedorComision(responsableRefs);
    return { factura, osCliente, cuenta, oportunidad, vendedor, responsableRefs };
  };

  const construirComisionDesdeCobro = async ({ cuentaCobrar, cobro, montoCobrado, fecha, silencioso = false, omitirDuplicado = false }) => {
    if (!cuentaCobrar || Number(montoCobrado || 0) <= 0) return null;
    if (!omitirDuplicado && comisiones.some(c => c.cobro_cxc_id === cobro.id)) return null;

    const { factura, osCliente, cuenta, oportunidad, vendedor, responsableRefs } =
      await resolverContextoComisionCobro(cuentaCobrar);

    if (!vendedor) {
      if (!silencioso) {
        addToast(
          responsableRefs.length
            ? 'El cobro se registro correctamente, pero el responsable comercial no tiene ficha de RRHH con comisiones configurada.'
            : 'El cobro se registro correctamente, pero no se encontro un responsable comercial para calcular la comision.',
          'warning',
          { label: 'Ir a RRHH', modulo: 'rrhh_admin' }
        );
      }
      return null;
    }

    const pctBase = Number(vendedor.porcentaje_comision || 0);
    const acuerdoEstado = oportunidad?.acuerdo_estado || 'sin_acuerdo';
    let pct = pctBase;
    let bonificacionAcuerdo = 0;
    let notaFallback = null;

    if (acuerdoEstado === 'aprobado') {
      pct = Number(oportunidad.acuerdo_pct ?? pctBase);
      const montoCxC = Number(cuentaCobrar?.monto_total || cuentaCobrar?.total || osCliente?.monto_aprobado || montoCobrado || 0);
      const proporcion = montoCxC > 0 ? Math.min(1, Number(montoCobrado || 0) / montoCxC) : 1;
      bonificacionAcuerdo = Math.round(Number(oportunidad.acuerdo_bonificacion || 0) * proporcion * 100) / 100;
    } else if (acuerdoEstado === 'pendiente' || acuerdoEstado === 'rechazado') {
      notaFallback = `Se uso el % base (${pctBase}%) porque el acuerdo especial no esta aprobado.`;
    }

    const usoFallbackCuenta = !oportunidad?.responsable_id && !oportunidad?.responsable &&
      Boolean(cuenta?.responsable_id || cuenta?.responsable_comercial || osCliente?.responsable_comercial_id || osCliente?.responsable_comercial);

    if (!vendedor.tiene_comisiones || (pct === 0 && bonificacionAcuerdo === 0)) {
      if (!silencioso) {
        addToast(
          `El cobro se registro correctamente. El vendedor responsable (${vendedor.nombre}) no tiene comisiones activas configuradas.`,
          'warning',
          { label: 'Ir a RRHH', modulo: 'rrhh_admin' }
        );
      }
      return null;
    }

    // Base de la comisión: subtotal de la factura (sin IGV).
    const facturaTotal = Number(factura?.subtotal || 0);
    const cxcTotal = Number(cuentaCobrar?.monto_total || cuentaCobrar?.total || 0);
    const montoPago = Number(montoCobrado || 0);
    const cxcBase = cxcTotal || montoPago;
    const fraccionPagada = cxcBase > 0 ? Math.min(1, montoPago / cxcBase) : 1;
    const baseComision = facturaTotal > 0
      ? Math.round(facturaTotal * fraccionPagada * 100) / 100
      : montoPago;
    const montoComision = Math.round(baseComision * pct / 100 * 100) / 100;
    const periodoComision = String(fecha || new Date().toISOString()).slice(0, 7);
    const monedaComision = normalizarMonedaComision(
      cuentaCobrar?.moneda || factura?.moneda || osCliente?.moneda || oportunidad?.moneda || cuenta?.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN'
    );
    const tcUSDaPENHoy = tipoCambioHoy.usd ? Math.round(100 / tipoCambioHoy.usd) / 100 : null;
    const montoCobradoPEN = monedaComision === 'USD' && tipoCambioHoy.usd
      ? Math.round(baseComision / tipoCambioHoy.usd * 100) / 100
      : baseComision;
    const totalComision = Math.round((montoComision + bonificacionAcuerdo) * 100) / 100;

    return {
      id: generateId('com'),
      empresa_id: empresa.id,
      vendedor_id: vendedor.id,
      vendedor_nombre: vendedor.nombre,
      cobro_cxc_id: cobro.id,
      cxc_id: cuentaCobrar.id,
      factura_id: factura?.id || cuentaCobrar?.factura_id || null,
      os_cliente_id: osCliente?.id || cuentaCobrar?.os_cliente_id || null,
      oportunidad_id: oportunidad?.id || null,
      os_cliente_numero: osCliente?.numero || cuentaCobrar?.os_clientes?.numero || null,
      factura_numero: factura?.numero || cuentaCobrar?.facturas?.numero || null,
      oportunidad_nombre: oportunidad?.nombre || null,
      moneda: monedaComision,
      monto_cobrado: baseComision,
      porcentaje_base: pctBase,
      porcentaje_comision: pct,
      monto_comision: montoComision,
      bonificacion: bonificacionAcuerdo,
      monto_total: totalComision,
      modalidad_pago: vendedor.modalidad_comision || 'Planilla',
      periodo: periodoComision,
      estado: 'pendiente_aprobacion',
      acuerdo_especial: acuerdoEstado === 'aprobado' && Math.abs(Number(pct) - pctBase) > 0.0001,
      nota_acuerdo: notaFallback || (usoFallbackCuenta ? 'Se uso el responsable comercial del cliente/OS al no encontrar responsable en la oportunidad.' : null),
      tc_pen_usd: tcUSDaPENHoy,
      retencion_ir: montoCobradoPEN > 1500,
      creado_en: cobro.creado_en || new Date().toISOString(),
    };
  };

  const registrarCobroCxC = async (cxcId, monto, datos = {}) => {
    if (cobrosEnProceso.current.has(cxcId)) return;
    cobrosEnProceso.current.add(cxcId);
    const cuentaCobrar = cxc.find(c => c.id === cxcId);
    const montoCobrado = Number(monto || 0);
    const montoMora = Number(datos.monto_mora || 0);
    const totalCuenta = Number(cuentaCobrar?.monto_total || cuentaCobrar?.total || 0);
    const retencionCuenta = Number(cuentaCobrar?.monto_retencion || 0);
    const netoSnapshot = Number(cuentaCobrar?.monto_neto_cobrable || cuentaCobrar?.facturas?.monto_neto_cobrable || 0);
    const montoNetoCobrable = netoSnapshot > 0 ? netoSnapshot : Math.max(0, totalCuenta - retencionCuenta);
    const pagadoActual = Number(cuentaCobrar?.monto_pagado || cuentaCobrar?.pagado || 0);
    const nuevoMontoPagado = pagadoActual + montoCobrado;
    const nuevoSaldo = Math.max(0, montoNetoCobrable - nuevoMontoPagado);
    const nuevoEstado = nuevoSaldo <= 0 ? 'cobrada' : 'cobro_parcial';
    setCxc(prev => prev.map(c => {
      if (c.id === cxcId) {
        if (c?.factura_id) {
          const estadoFac = nuevoEstado === 'cobrada' ? 'cobrada' : 'cobro_parcial';
          setFacturas(fPrev => fPrev.map(f => f.id === c.factura_id ? { ...f, estado: estadoFac, monto_pagado: nuevoMontoPagado, saldo: nuevoSaldo } : f));
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

        return { ...c, monto_pagado: nuevoMontoPagado, pagado: nuevoMontoPagado, monto_neto_cobrable: montoNetoCobrable, saldo: nuevoSaldo, saldo_neto_cobranza: nuevoSaldo, estado: nuevoEstado };
      }
      return c;
    }));

    const fecha = datos.fecha_cobro || datos.fecha || new Date().toISOString().split('T')[0];
    const cobroId = generateId('cob');
    const facturaCobro = cuentaCobrar?.facturas ||
      facturas.find(f => f.id === cuentaCobrar?.factura_id) ||
      (cuentaCobrar?.factura_id ? await fetchRegistroSupabase('facturas', cuentaCobrar.factura_id) : null);
    const facturaTexto = String(cuentaCobrar?.factura || '').trim();
    const facturaTextoLegible = facturaTexto && !/^fac_/i.test(facturaTexto) ? facturaTexto : null;
    const facturaNumero = facturaCobro?.numero || cuentaCobrar?.factura_numero || facturaTextoLegible || 'factura';
    const monedaCobro = cuentaCobrar?.moneda || facturaCobro?.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN';

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
      moneda: monedaCobro,
      fecha,
      cuenta_bancaria: datos.cuenta_bancaria || 'Cuenta principal',
      cuenta_bancaria_id: datos.cuenta_bancaria_id || null,
      tc_aplicado: datos.tc_aplicado ?? null,
      monto_en_moneda_cuenta: datos.monto_en_moneda_cuenta ?? null,
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


    const comision = await construirComisionDesdeCobro({
      cuentaCobrar,
      cobro,
      montoCobrado,
      fecha,
    });

    if (comision) {
      setComisiones(prev => prev.some(c => c.cobro_cxc_id === comision.cobro_cxc_id) ? prev : [comision, ...prev]);
      if (comision.nota_acuerdo) addNotificacion(`Comision generada. ${comision.nota_acuerdo}`);
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.registrarCobroCxC(cxcId, montoCobrado);
        await finanzasService.registrarCobroDetalle(cobro);
        await finanzasService.registrarMovimientoTesoreria(movimiento);
        if (comision) await finanzasService.registrarComision(comision);
      });
    }

    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcId, accion: 'cobrar', valor_anterior: cuentaCobrar || null, valor_nuevo: { monto: montoCobrado, estado: nuevoEstado } });
    addNotificacion(`Cobro de ${facturaNumero} registrado. Nuevo estado: ${nuevoEstado === 'cobrada' ? 'Cobrada' : 'Cobro parcial'}.`);
    cobrosEnProceso.current.delete(cxcId);
    return movimiento;
  };

  const reconciliarComisionesPendientes = async ({ silencioso = false } = {}) => {
    const existentes = new Set((comisiones || []).map(c => c.cobro_cxc_id).filter(Boolean));
    const creadas = [];

    for (const cobro of (cobrosHistorial || [])) {
      const montoCapital = Number(cobro?.monto_capital || 0);
      if (!cobro?.id || montoCapital <= 0 || existentes.has(cobro.id)) continue;
      const cuentaCobrar = (cxc || []).find(cx => cx.id === cobro.cxc_id) ||
        await fetchRegistroSupabase('cxc', cobro.cxc_id);
      if (!cuentaCobrar) continue;

      const comision = await construirComisionDesdeCobro({
        cuentaCobrar,
        cobro,
        montoCobrado: montoCapital,
        fecha: cobro.fecha_cobro || cobro.creado_en || new Date().toISOString().slice(0, 10),
        silencioso: true,
        omitirDuplicado: true,
      });

      if (comision && !existentes.has(comision.cobro_cxc_id)) {
        creadas.push(comision);
        existentes.add(comision.cobro_cxc_id);
      }
    }

    if (!creadas.length) {
      if (!silencioso) addNotificacion('No hay comisiones faltantes por reconciliar.');
      return 0;
    }

    setComisiones(prev => {
      const prevIds = new Set((prev || []).map(c => c.cobro_cxc_id).filter(Boolean));
      const nuevas = creadas.filter(c => !prevIds.has(c.cobro_cxc_id));
      return nuevas.length ? [...nuevas, ...prev] : prev;
    });

    if (isSupabaseConfigured()) {
      finSync(async () => {
        for (const comision of creadas) {
          await finanzasService.registrarComision(comision);
        }
      });
    }

    if (!silencioso) addNotificacion(`Se generaron ${creadas.length} comision(es) faltante(s).`);
    return creadas.length;
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

  const corregirMontoComision = async (comisionId, nuevaBase) => {
    const c = comisiones.find(x => x.id === comisionId);
    if (!c) return;
    const base = Number(nuevaBase);
    const monto_comision = Math.round(base * Number(c.porcentaje_comision || 0) / 100 * 100) / 100;
    const monto_total = Math.round((monto_comision + Number(c.bonificacion || 0)) * 100) / 100;
    const updates = { monto_cobrado: base, monto_comision, monto_total };
    setComisiones(prev => prev.map(x => x.id === comisionId ? { ...x, ...updates } : x));
    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarComision(comisionId, updates));
    }
    addNotificacion('Monto de comisión corregido.');
  };

  const corregirBonificacionComision = async (comisionId, nuevaBonificacion) => {
    const c = comisiones.find(x => x.id === comisionId);
    if (!c || c.estado !== 'aprobada') return;
    const bonificacion = Math.round(Number(nuevaBonificacion || 0) * 100) / 100;
    const monto_total = Math.round((Number(c.monto_comision || 0) + bonificacion) * 100) / 100;
    const deltaTotal = monto_total - Number(c.monto_total || 0);
    const updates = { bonificacion, monto_total };
    setComisiones(prev => prev.map(x => x.id === comisionId ? { ...x, ...updates } : x));
    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarComision(comisionId, updates));
    }

    // Si hay un recibo borrador que incluye esta comisión, recalcula sus montos
    const reciboBorrador = recibosHonorarios.find(r =>
      r.estado === 'borrador' && (r.comisiones_ids || []).includes(comisionId)
    );
    if (reciboBorrador && deltaTotal !== 0) {
      const nuevoMontoBruto = Math.round((Number(reciboBorrador.monto_bruto || 0) + deltaTotal) * 100) / 100;
      const tasaIR = Number(reciboBorrador.monto_bruto || 0) > 0
        ? Number(reciboBorrador.retencion_ir || 0) / Number(reciboBorrador.monto_bruto)
        : 0;
      const nuevaRetencion = Math.round(nuevoMontoBruto * tasaIR * 100) / 100;
      const nuevoNeto = Math.round((nuevoMontoBruto - nuevaRetencion) * 100) / 100;
      const reciboUpdates = { monto_bruto: nuevoMontoBruto, retencion_ir: nuevaRetencion, monto_neto: nuevoNeto };
      setRecibosHonorarios(prev => prev.map(r => r.id === reciboBorrador.id ? { ...r, ...reciboUpdates } : r));
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('recibos_honorarios').update(reciboUpdates).eq('id', reciboBorrador.id);
        });
      }
    }

    addNotificacion('Bonificación corregida.');
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

    // Reglas de exoneración IR (Perú: RH)
    const today = new Date().toISOString().split('T')[0];
    const vencSusp = vendedor?.vencimiento_suspension || null;
    const suspensionVigente = Boolean(vendedor?.suspension_retenciones) && (!vencSusp || vencSusp >= today);
    const esAgente = Boolean(empresaConfig?.agente_retencion);
    const tipoCambio = Number(empresaConfig?.tipo_cambio_referencial) || 3.8;
    const montoBrutoPEN = monedaRecibo === 'USD' ? montoBruto * tipoCambio : montoBruto;
    const bajoUmbral = montoBrutoPEN <= 1500;

    const aplicaRetencion = !suspensionVigente && esAgente && !bajoUmbral;
    const tasaIR = aplicaRetencion ? Number(vendedor?.retencion_ir_comision ?? 8) / 100 : 0;
    const retencionIR = Math.round(montoBruto * tasaIR * 100) / 100;
    const motivo_retencion = aplicaRetencion
      ? `Se aplica ${tasaIR * 100}% de retención IR (empresa agente de retención, monto supera S/ 1,500, sin constancia de suspensión vigente).`
      : suspensionVigente
        ? 'Sin retención: el colaborador tiene constancia de suspensión de retenciones vigente.'
        : !esAgente
          ? 'Sin retención: la empresa no es Agente de Retención ante SUNAT.'
          : 'Sin retención: el monto bruto no supera el umbral de S/ 1,500.';
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
      motivo_retencion,
      estado: 'borrador',
      creado_en: new Date().toISOString(),
    };
    // INSERT directo con await — el recibo debe existir en Supabase antes de que la CxP lo referencie
    if (isSupabaseConfigured()) {
      const sb = await getSupabaseClient();
      const { error: recErr } = await sb.from('recibos_honorarios').insert(recibo);
      if (recErr) throw new Error(`No se pudo guardar el recibo: ${recErr.message}`);
    }
    setRecibosHonorarios(prev => [recibo, ...prev]);
    const simbolo = monedaRecibo === 'USD' ? 'US$' : 'S/';
    addNotificacion(`Recibo borrador generado. Monto neto: ${simbolo} ${(montoBruto - retencionIR).toFixed(2)}.`);
    return recibo;
  };

  const subirArchivoRhe = async (reciboId, file, tipo) => {
    if (!file || !reciboId || !empresa?.id) return null;
    const sb = await getSupabaseClient();
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `${empresa.id}/rhe/${reciboId}/${tipo}.${ext}`;
    const { error: upErr } = await sb.storage.from('documentos-privados').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (upErr) throw new Error(`Error subiendo ${tipo}: ${upErr.message}`);
    const { data: signed, error: signErr } = await sb.storage.from('documentos-privados').createSignedUrl(path, 600);
    if (signErr) throw new Error(`Error obteniendo URL de ${tipo}: ${signErr.message}`);
    return signed.signedUrl;
  };

  const confirmarReciboHonorarios = async (reciboId, { numero_rhe, fecha_emision, fecha_vencimiento, archivo_rhe_file, archivo_constancia_file, moneda_rhe, tipo_cambio } = {}) => {
    const recibo = recibosHonorarios.find(r => r.id === reciboId);
    if (!recibo || recibo.estado !== 'borrador') return;
    const now = new Date().toISOString().split('T')[0];
    const fechaEmision = fecha_emision || now;
    const fechaVenc = fecha_vencimiento || (() => {
      const d = new Date(`${now}T00:00:00`);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

    let sociedadHonorariosId = null;
    if (empresa?.multisociedad_habilitado) {
      const resolucionSociedad = resolverSociedadContratoVigente({
        documentos: personalDocumentos,
        tiposDocumento,
        sociedades: sociedadesDisponibles,
        personalId: recibo.vendedor_id,
        fecha: fechaEmision,
      });
      if (resolucionSociedad.conflicto) {
        throw new Error(`El colaborador tiene contratos vigentes en sociedades distintas: ${resolucionSociedad.nombres.join(', ')}. Resuelve manualmente la sociedad antes de continuar.`);
      }
      if (!resolucionSociedad.sociedadId) {
        throw new Error('El colaborador no tiene un contrato societario vigente para la fecha de emisión. Resuelve el contrato antes de continuar.');
      }
      sociedadHonorariosId = resolucionSociedad.sociedadId;
    }

    const monedaOriginal = normalizarMonedaComision(recibo.moneda || empresa?.moneda || empresa?.moneda_base || 'PEN');
    const monedaCxP = moneda_rhe || monedaOriginal;
    const tc = Number(tipo_cambio || 1);
    const convierte = monedaOriginal === 'USD' && monedaCxP === 'PEN' && tc > 0;

    const montoBrutoCxP = convierte ? Math.round(recibo.monto_bruto * tc * 100) / 100 : recibo.monto_bruto;
    const retencionCxP  = convierte ? Math.round(recibo.retencion_ir * tc * 100) / 100 : recibo.retencion_ir;
    const montoNetoCxP  = convierte ? Math.round(recibo.monto_neto * tc * 100) / 100 : recibo.monto_neto;

    // Subir archivos a Storage (no bloquea la creación de CxP si falla)
    let archivoRheUrl = null;
    let archivoConstanciaUrl = null;
    if (isSupabaseConfigured()) {
      if (archivo_rhe_file) {
        try { archivoRheUrl = await subirArchivoRhe(reciboId, archivo_rhe_file, 'rhe'); }
        catch (e) { console.error('[RHE upload]', e); addNotificacion(`Advertencia: no se pudo subir el RHE (${e.message}). La CxP se crea sin adjunto.`); }
      }
      if (archivo_constancia_file) {
        try { archivoConstanciaUrl = await subirArchivoRhe(reciboId, archivo_constancia_file, 'constancia'); }
        catch (e) { console.error('[Constancia upload]', e); addNotificacion(`Advertencia: no se pudo subir la constancia (${e.message}).`); }
      }
    }

    // Construir payload CxP
    const cxpId = generateId('cxp');
    let cuentaPagar = {
      id: cxpId,
      empresa_id: empresa.id,
      sociedad_id: sociedadHonorariosId,
      tipo_beneficiario: 'personal',
      tipo_comprobante: 'RHE',
      personal_id: recibo.vendedor_id || null,
      concepto: `Honorarios comisiones — ${recibo.vendedor_nombre} ${recibo.periodo}`,
      recibo_honorarios_id: reciboId,
      factura_numero: numero_rhe || null,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVenc,
      monto_total: montoNetoCxP,
      monto_bruto: montoBrutoCxP,
      retencion_ir: retencionCxP,
      monto_pagado: 0,
      saldo: montoNetoCxP,
      moneda: monedaCxP,
      estado: 'por_pagar',
      origen: 'honorarios',
      motivo_cxp: 'comisiones_honorarios',
      ...(convierte ? { tipo_cambio: tc, moneda_original: 'USD', monto_original: recibo.monto_neto } : {}),
      ...(archivoRheUrl ? { archivo_factura_url: archivoRheUrl } : {}),
      ...(archivoConstanciaUrl ? { archivo_constancia_url: archivoConstanciaUrl } : {}),
    };
    const gastoDevengo = buildDevengoCxP({
      ...cuentaPagar,
      categoria_er: 'Comisiones por honorarios',
    });
    cuentaPagar = { ...cuentaPagar, gasto_id: gastoDevengo.id };

    // INSERT directo con await — error visible inmediatamente si falla
    if (isSupabaseConfigured()) {
      await finanzasService.generarCxP(cuentaPagar);
      const sb = await getSupabaseClient();
      await insertarCompraGastoSeguro(sb, gastoDevengo);
    }

    // Actualizar estado local solo si el DB tuvo éxito
    setCxp(prev => [cuentaPagar, ...prev]);
    setComprasGastos(prev => [gastoDevengo, ...prev]);
    auditSync({ modulo: 'compras', entidad: 'compras_gastos', entidad_id: gastoDevengo.id, accion: 'devengar_cxp', valor_nuevo: gastoDevengo });

    const updates = { estado: 'pendiente_pago', ...(numero_rhe ? { numero_rhe } : {}), moneda_cxp: monedaCxP };
    setRecibosHonorarios(prev => prev.map(r => r.id === reciboId ? { ...r, ...updates } : r));
    if (isSupabaseConfigured()) {
      finSync(async () => {
        const sb = await getSupabaseClient();
        await sb.from('recibos_honorarios').update(updates).eq('id', reciboId);
      });
    }

    const simbolo = monedaCxP === 'USD' ? 'US$' : 'S/';
    addNotificacion(`Recibo confirmado. CxP de ${simbolo} ${montoNetoCxP.toFixed(2)} generada. Pendiente de pago.`);
  };

  const registrarMovimientoManual = async (datos) => {
    const now = new Date().toISOString().split('T')[0];
    const monedaDatos = String(datos.moneda || 'PEN').trim().toUpperCase();
    if (datos.tipo === 'transferencia') {
      const cuentaOrigen = (cuentasBancarias || []).find(c => c.id === datos.cuenta_origen_id);
      const cuentaDestino = (cuentasBancarias || []).find(c => c.id === datos.cuenta_destino_id);
      const base = { empresa_id: empresa.id, fecha: datos.fecha || now, descripcion: datos.descripcion || 'Transferencia entre cuentas', monto: Number(datos.monto || 0), categoria: 'transferencia', es_manual: true, referencia: datos.referencia || null, creado_en: new Date().toISOString() };
      const movE = {
        ...base,
        id: generateId('mov'),
        tipo: 'egreso',
        moneda: cuentaOrigen?.moneda || monedaDatos,
        cuenta_bancaria_id: datos.cuenta_origen_id || null,
        tc_aplicado: datos.cuenta_origen_id ? 1 : null,
        monto_en_moneda_cuenta: datos.cuenta_origen_id ? Number(datos.monto || 0) : null,
      };
      const movI = {
        ...base,
        id: generateId('mov'),
        tipo: 'ingreso',
        moneda: cuentaDestino?.moneda || monedaDatos,
        cuenta_bancaria_id: datos.cuenta_destino_id || null,
        tc_aplicado: datos.cuenta_destino_id ? 1 : null,
        monto_en_moneda_cuenta: datos.cuenta_destino_id ? Number(datos.monto || 0) : null,
      };
      setMovimientosTesoreria(prev => [...prev, movE, movI]);
      if (isSupabaseConfigured()) {
        finSync(async () => {
          await finanzasService.registrarMovimientoTesoreria(movE);
          await finanzasService.registrarMovimientoTesoreria(movI);
        });
      }
    } else {
      const cuentaSeleccionada = (cuentasBancarias || []).find(c =>
        c.id === (datos.tipo === 'ingreso' ? datos.cuenta_destino_id : datos.cuenta_origen_id)
      );
      const mov = {
        id: generateId('mov'),
        empresa_id: empresa.id,
        tipo: datos.tipo,
        fecha: datos.fecha || now,
        descripcion: datos.descripcion,
        monto: Number(datos.monto || 0),
        moneda: cuentaSeleccionada?.moneda || monedaDatos,
        categoria: datos.categoria || null,
        cuenta_bancaria_id: datos.tipo === 'ingreso' ? (datos.cuenta_destino_id || null) : (datos.cuenta_origen_id || null),
        tc_aplicado: cuentaSeleccionada ? 1 : null,
        monto_en_moneda_cuenta: cuentaSeleccionada ? Number(datos.monto || 0) : null,
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
    if (empresa?.multisociedad_habilitado && !datos.sociedad_id) {
      throw new Error('Selecciona una sociedad para la cuenta bancaria.');
    }
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
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
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

  const restaurarFacturaPorError = (facturaId) => {
    const fac = facturas.find(f => f.id === facturaId);
    if (!fac || fac.estado !== 'anulada') return;

    // Restaurar factura a emitida
    setFacturas(prev => prev.map(f => f.id === facturaId
      ? { ...f, estado: 'emitida', motivo_anulacion: null }
      : f));

    // Restaurar CxC vinculada si está anulada
    const cxcVinculada = cxc.find(c => c.factura_id === facturaId);
    if (cxcVinculada && cxcVinculada.estado === 'anulada') {
      const montoTotal = Number(cxcVinculada.monto_total ?? cxcVinculada.total ?? 0);
      setCxc(prev => prev.map(c => c.id === cxcVinculada.id
        ? { ...c, estado: 'por_cobrar', monto_pagado: 0, saldo: montoTotal }
        : c));
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('cxc')
            .update({ estado: 'por_cobrar', monto_pagado: 0, saldo: montoTotal })
            .eq('id', cxcVinculada.id);
        });
      }
    }

    // La valorización no se toca — sigue como 'facturada'

    if (isSupabaseConfigured()) {
      finSync(async () => {
        const sb = await getSupabaseClient();
        await sb.from('facturas')
          .update({ estado: 'emitida', motivo_anulacion: null })
          .eq('id', facturaId);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: facturaId, accion: 'restaurar_por_error' });
    addNotificacion(`Factura ${fac.numero} restaurada. CxC pendiente de cobro.`);
  };

  const anularFactura = (facturaId, motivo) => {
    const fac = facturas.find(f => f.id === facturaId);
    if (!fac || fac.estado === 'cobrada') return;
    setFacturas(prev => prev.map(f => f.id === facturaId ? { ...f, estado: 'anulada', motivo_anulacion: motivo } : f));
    // Restaurar valorizaci\xf3n a 'aprobada' para permitir re-facturar
    if (fac.valorizacion_id) {
      const valVinc = valorizaciones.find(v => v.id === fac.valorizacion_id);
      if (valVinc && valVinc.estado === 'facturada') {
        setValorizaciones(prev => prev.map(v => v.id === fac.valorizacion_id ? { ...v, estado: 'aprobada' } : v));
        if (isSupabaseConfigured()) {
          finSync(async () => {
            const sb = await getSupabaseClient();
            await sb.from('valorizaciones').update({ estado: 'aprobada' }).eq('id', fac.valorizacion_id);
          });
        }
      }
    }
    // Anular CxC vinculada si está por cobrar
    const cxcVinculada = cxc.find(c => c.factura_id === facturaId && c.estado !== 'cobrada');
    if (cxcVinculada) {
      setCxc(prev => prev.map(c => c.id === cxcVinculada.id ? { ...c, estado: 'anulada' } : c));

      // Rechazar comisiones pendientes/aprobadas vinculadas a esta CxC
      const comisionesParaRechazar = comisiones.filter(cm =>
        cm.cxc_id === cxcVinculada.id &&
        (cm.estado === 'pendiente_aprobacion' || cm.estado === 'aprobada')
      );
      if (comisionesParaRechazar.length > 0) {
        setComisiones(prev => prev.map(cm =>
          comisionesParaRechazar.some(r => r.id === cm.id)
            ? { ...cm, estado: 'rechazada', motivo_rechazo: 'Factura anulada' }
            : cm
        ));
      }

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
          if (comisionesParaRechazar.length > 0) {
            await sb.from('comisiones')
              .update({ estado: 'rechazada', motivo_rechazo: 'Factura anulada' })
              .in('id', comisionesParaRechazar.map(cm => cm.id));
          }
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
    // Revertir monto_facturado en OS
    if (fac.os_cliente_id) {
      const osRef = osClientes.find(os => os.id === fac.os_cliente_id);
      if (osRef) {
        const nuevoMF = Math.max(0, Number(osRef.monto_facturado || 0) - Number(fac.total || 0));
        const nuevoSPF = Math.min(Number(osRef.monto_aprobado || 0), Number(osRef.saldo_por_facturar || 0) + Number(fac.total || 0));
        setOsClientes(prev => prev.map(os => os.id === osRef.id ? { ...os, monto_facturado: nuevoMF, saldo_por_facturar: nuevoSPF } : os));
        crmSync(sb => svcActualizarOSCliente(sb, osRef.id, { monto_facturado: nuevoMF, saldo_por_facturar: nuevoSPF }));
      }
    }
    auditSync({ modulo: 'finanzas', entidad: 'facturas', entidad_id: facturaId, accion: 'anular', valor_nuevo: { motivo } });
    addNotificacion(`Factura ${fac.numero} anulada.`);
  };

  const revertirCobroCxC = (cxcId) => {
    const c = cxc.find(x => x.id === cxcId);
    if (!c || c.estado === 'anulada') return;

    const cobrosVinculados = cobrosHistorial.filter(cb => cb.cxc_id === cxcId);
    const cobrosIds = cobrosVinculados.map(cb => cb.id);

    // Bloquear si existe alguna comisión ya pagada — requiere ajuste manual
    const comisionesVinculadas = comisiones.filter(cm =>
      cm.cxc_id === cxcId || cobrosIds.includes(cm.cobro_cxc_id)
    );
    const tieneComisionPagada = comisionesVinculadas.some(cm => cm.estado === 'pagada');
    if (tieneComisionPagada) {
      addNotificacion('No se puede revertir: hay comisiones ya pagadas vinculadas. Realiza un ajuste manual.');
      return;
    }

    // Rechazar comisiones pendientes o aprobadas
    const comisionesRevertibles = comisionesVinculadas.filter(cm =>
      cm.estado === 'pendiente_aprobacion' || cm.estado === 'aprobada'
    );
    if (comisionesRevertibles.length > 0) {
      setComisiones(prev => prev.map(cm =>
        comisionesRevertibles.some(r => r.id === cm.id)
          ? { ...cm, estado: 'rechazada', motivo_rechazo: 'Cobro revertido por error' }
          : cm
      ));
    }

    // Eliminar cobros
    if (cobrosIds.length > 0) {
      setCobrosHistorial(prev => prev.filter(cb => cb.cxc_id !== cxcId));
    }

    // Restaurar CxC: saldo completo, sin pagos
    const montoTotal = Number(c.monto_total ?? c.total ?? 0);
    setCxc(prev => prev.map(x => x.id === cxcId
      ? { ...x, estado: 'por_cobrar', monto_pagado: 0, saldo: montoTotal }
      : x));

    // Restaurar factura a 'emitida' si estaba 'pagada'
    const fac = c.factura_id ? facturas.find(f => f.id === c.factura_id) : null;
    if (fac && fac.estado === 'pagada') {
      setFacturas(prev => prev.map(f => f.id === c.factura_id ? { ...f, estado: 'emitida' } : f));
    }

    // Revertir conciliaciones bancarias (por CxC y por cobros individuales)
    setMovimientosBanco(prev => prev.map(m => {
      const esCxC   = m.conciliado && m.vinculado_tipo === 'cxc'       && m.vinculado_id === cxcId;
      const esCobro = m.conciliado && m.vinculado_tipo === 'cobro_cxc' && cobrosIds.includes(m.vinculado_id);
      return (esCxC || esCobro)
        ? { ...m, conciliado: false, vinculado_tipo: null, vinculado_id: null }
        : m;
    }));

    // Revertir movimientos tesorería
    setMovimientosTesoreria(prev => prev.map(m =>
      (m.vinculo_id === cxcId || m.vinculado_id === cxcId) ? { ...m, estado: 'anulado' } : m));

    if (isSupabaseConfigured()) {
      finSync(async () => {
        const sb = await getSupabaseClient();
        await sb.from('cxc').update({ estado: 'por_cobrar', monto_pagado: 0, saldo: montoTotal }).eq('id', cxcId);
        if (cobrosIds.length > 0) {
          await sb.from('cobros_cxc').delete().eq('cxc_id', cxcId);
        }
        if (comisionesRevertibles.length > 0) {
          await sb.from('comisiones')
            .update({ estado: 'rechazada', motivo_rechazo: 'Cobro revertido por error' })
            .in('id', comisionesRevertibles.map(cm => cm.id));
        }
        if (fac && fac.estado === 'pagada') {
          await sb.from('facturas').update({ estado: 'emitida' }).eq('id', c.factura_id);
        }
        await sb.from('movimientos_banco')
          .update({ conciliado: false, vinculado_tipo: null, vinculado_id: null })
          .eq('vinculado_tipo', 'cxc').eq('vinculado_id', cxcId);
        if (cobrosIds.length > 0) {
          await sb.from('movimientos_banco')
            .update({ conciliado: false, vinculado_tipo: null, vinculado_id: null })
            .eq('vinculado_tipo', 'cobro_cxc').in('vinculado_id', cobrosIds);
        }
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcId, accion: 'revertir_cobro' });
    const msgComisiones = comisionesRevertibles.length > 0
      ? ` ${comisionesRevertibles.length} comisión(es) rechazada(s).`
      : '';
    addNotificacion(`Cobros revertidos. CxC pendiente de cobro.${msgComisiones}`);
  };

  const emitirNotaCredito = async (facturaOrigenId, datos) => {
    const facOrigen = facturas.find(f => f.id === facturaOrigenId);
    if (!facOrigen) return null;
    const cxcVinc = cxc.find(c => {
      const estado = String(c?.estado || '').toLowerCase();
      const mismaFactura = c.factura_id === facturaOrigenId ||
        c.factura === facOrigen.numero ||
        c.facturas?.numero === facOrigen.numero;
      return mismaFactura && !['cobrada','pagada','anulada','cancelada'].includes(estado);
    });
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
      if (cxcVinc) setCxc(prev => prev.map(c => c.id === cxcVinc.id ? { ...c, estado: 'cancelada', saldo: 0 } : c));
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
          if (cxcVinc) await sb.from('cxc').update({ estado: 'cancelada', saldo: 0 }).eq('id', cxcVinc.id);
        });
      }
    } else if (cxcVinc) {
      // Reducción parcial de CxC
      const nuevoTotal = Math.max(0, Number(cxcVinc.monto_total || 0) - totalAcreditar);
      const nuevoSaldo = Math.max(0, Number(cxcVinc.saldo || 0) - totalAcreditar);
      const nuevoEstado = nuevoSaldo <= 0 ? 'cancelada' : cxcVinc.estado;
      setCxc(prev => prev.map(c => c.id === cxcVinc.id ? { ...c, monto_total: nuevoTotal, saldo: nuevoSaldo, estado: nuevoEstado } : c));
      if (isSupabaseConfigured()) {
        finSync(async () => {
          const sb = await getSupabaseClient();
          await sb.from('cxc').update({ monto_total: nuevoTotal, saldo: nuevoSaldo, estado: nuevoEstado }).eq('id', cxcVinc.id);
        });
      }
    }

    // Revertir monto_facturado en OS por el importe acreditado
    if (facOrigen.os_cliente_id) {
      const osRef = osClientes.find(os => os.id === facOrigen.os_cliente_id);
      if (osRef) {
        const nuevoMF = Math.max(0, Number(osRef.monto_facturado || 0) - totalAcreditar);
        const nuevoSPF = Math.min(Number(osRef.monto_aprobado || 0), Number(osRef.saldo_por_facturar || 0) + totalAcreditar);
        setOsClientes(prev => prev.map(os => os.id === osRef.id ? { ...os, monto_facturado: nuevoMF, saldo_por_facturar: nuevoSPF } : os));
        crmSync(sb => svcActualizarOSCliente(sb, osRef.id, { monto_facturado: nuevoMF, saldo_por_facturar: nuevoSPF }));
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

  const textoFin = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const cxpExcluidaEr = cxp => {
    const origen = textoFin(cxp?.origen || 'manual');
    const motivo = textoFin(cxp?.motivo_cxp || '');
    if (cxp?.no_devengar_er || cxp?.gasto_id || cxp?.recepcion_id) return true;
    if (['nomina', 'nc_devolucion', 'recepcion'].includes(origen)) return true;
    if (['devolucion_nc', 'planilla', 'essalud', 'pensiones', 'ir_5ta'].includes(motivo)) return true;
    if (textoFin(cxp?.estado).includes('anulad')) return true;
    return false;
  };

  const cxpEsRhe = cxp => textoFin(cxp?.tipo_comprobante) === 'rhe'
    || Boolean(cxp?.recibo_honorarios_id)
    || Number(cxp?.monto_bruto || 0) > 0;

  const montoDevengoCxP = cxp => {
    if (cxpEsRhe(cxp)) return Number(cxp?.monto_bruto || cxp?.monto_total || 0);
    return Number(cxp?.monto_total || 0);
  };

  const categoriaDevengoCxP = cxp => {
    const origen = textoFin(cxp?.origen || 'manual');
    const motivo = textoFin(cxp?.motivo_cxp || '');
    if (cxp?.categoria_er) return cxp.categoria_er;
    if (cxpEsRhe(cxp) && cxp?.recibo_honorarios_id) return 'Comisiones por honorarios';
    if (cxpEsRhe(cxp)) return 'Servicios terceros';
    if (origen === 'viaticos' || motivo === 'viaticos_reembolso') return 'Administrativos';
    if (cxp?.tipo_beneficiario === 'personal') return 'Honorarios y reembolsos';
    return 'Gastos operativos';
  };

  const centroCostoDevengoCxP = cxp => {
    if (cxp?.centro_costo_id) return cxp.centro_costo_id;
    const ot = cxp?.ot_vinc_id ? (ots || []).find(o => o.id === cxp.ot_vinc_id) : null;
    if (ot?.centro_costo_id) return ot.centro_costo_id;
    const persona = cxp?.personal_id
      ? ([...(personalAdmin || []), ...(personalOperativo || [])]).find(p => p.id === cxp.personal_id)
      : null;
    return persona?.centro_costo_id || null;
  };

  const buildDevengoCxP = cxp => ({
    id: generateId('gasto'),
    empresa_id: empresa.id,
    tipo: 'gasto',
    descripcion: cxp.concepto || cxp.factura_numero || 'Devengo de CxP',
    categoria: categoriaDevengoCxP(cxp),
    monto: montoDevengoCxP(cxp),
    moneda: cxp.moneda || 'PEN',
    fecha: cxp.fecha_emision || new Date().toISOString().split('T')[0],
    origen_registro: `cxp_${cxp.origen || 'manual'}`,
    estado_pago: 'pendiente',
    estado: 'registrado',
    cxp_id: cxp.id,
    centro_costo_id: centroCostoDevengoCxP(cxp),
    periodo_nomina_id: null,
    personal_id: cxp.personal_id || null,
    ot_vinc_id: cxp.ot_vinc_id || null,
    sociedad_id: cxp.sociedad_id || null,
  });

  const generarCxP = async (datos = {}) => {
    const { no_devengar_er, ...datosDb } = datos || {};
    const sociedadId = resolverSociedadOperacion(datosDb, { exigirSociedad: true });
    let cuentaPagar = {
      id: generateId('cxp'),
      empresa_id: empresa.id,
      estado: 'por_pagar',
      monto_pagado: 0,
      saldo: datosDb.monto_total,
      ...datosDb,
      sociedad_id: sociedadId,
    };
    const cxpParaDevengo = { ...cuentaPagar, no_devengar_er };
    const yaDevengado = (comprasGastos || []).some(g => g.cxp_id === cuentaPagar.id);
    if (yaDevengado) console.log('[generarCxP] Devengo omitido: ya existe compras_gastos con cxp_id', cuentaPagar.id);
    const gastoDevengo = !cxpExcluidaEr(cxpParaDevengo) && !yaDevengado && montoDevengoCxP(cxpParaDevengo) > 0
      ? buildDevengoCxP(cxpParaDevengo)
      : null;
    if (gastoDevengo) {
      cuentaPagar = { ...cuentaPagar, gasto_id: gastoDevengo.id };
    }
    setCxp(prev => [cuentaPagar, ...prev]);
    if (gastoDevengo) {
      setComprasGastos(prev => [gastoDevengo, ...prev]);
      auditSync({ modulo: 'compras', entidad: 'compras_gastos', entidad_id: gastoDevengo.id, accion: 'devengar_cxp', valor_nuevo: gastoDevengo });
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.generarCxP(cuentaPagar);
        if (gastoDevengo) {
          const sb = await getSupabaseClient();
          await insertarCompraGastoSeguro(sb, gastoDevengo);
        }
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxp', entidad_id: cuentaPagar.id, accion: 'crear', valor_nuevo: cuentaPagar });
    addNotificacion(gastoDevengo ? 'Cuenta por Pagar registrada y devengo ER creado.' : 'Cuenta por Pagar registrada.');
    return cuentaPagar.id;
  };

  const registrarEgresoCajaChica = async (datos) => {
    if (empresa?.multisociedad_habilitado && !datos.sociedad_id) {
      throw new Error('Selecciona una sociedad para el egreso de caja chica.');
    }
    const fecha = datos.fecha || new Date().toISOString().split('T')[0];
    const gastoId = generateId('gasto');
    const ccId = generateId('cc');

    const gasto = {
      id: gastoId,
      empresa_id: empresa.id,
      tipo: 'gasto',
      descripcion: datos.concepto,
      categoria: datos.categoria || 'Administrativos',
      monto: Number(datos.monto),
      moneda: datos.moneda || 'PEN',
      fecha,
      origen_registro: 'caja_chica',
      estado_pago: 'pagado',
      estado: 'registrado',
      centro_costo_id: datos.ceco_id || null,
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
    };

    const movimiento = {
      id: generateId('tes'),
      empresa_id: empresa.id,
      tipo: 'egreso',
      descripcion: `Caja chica: ${datos.concepto}`,
      monto: Number(datos.monto),
      moneda: datos.moneda || 'PEN',
      fecha,
      cuenta_bancaria: 'Caja chica',
      referencia: datos.num_comprobante || '',
      vinculo_tipo: 'caja_chica',
      vinculo_id: ccId,
      estado: 'registrado',
    };

    const cc = {
      id: ccId,
      empresa_id: empresa.id,
      fecha,
      concepto: datos.concepto,
      monto: Number(datos.monto),
      moneda: datos.moneda || 'PEN',
      responsable_nombre: datos.responsable_nombre || authUser?.email || null,
      ceco_id: datos.ceco_id || null,
      categoria: datos.categoria || 'Administrativos',
      num_comprobante: datos.num_comprobante || null,
      estado: 'registrado',
      gasto_id: gastoId,
      sociedad_id: empresa?.multisociedad_habilitado ? datos.sociedad_id : null,
    };

    setComprasGastos(prev => [gasto, ...prev]);
    setMovimientosTesoreria(prev => [movimiento, ...prev]);
    setCajaChica(prev => [cc, ...prev]);

    if (isSupabaseConfigured()) {
      finSync(async () => {
        const gastoGuardado = await finanzasService.registrarMovimientoTesoreria(movimiento).catch(() => null);
        await finanzasService.insertarCajaChica({ ...cc, gasto_id: gastoId }).catch(() => null);
      });
      finSync(() => finanzasService.insertarCompraGasto({
        id: gasto.id,
        empresa_id: empresa.id,
        tipo: gasto.tipo,
        descripcion: gasto.descripcion,
        categoria: gasto.categoria,
        monto: gasto.monto,
        moneda: gasto.moneda,
        fecha: gasto.fecha,
        origen_registro: 'caja_chica',
        estado: 'registrado',
        estado_pago: 'pagado',
        centro_costo_id: gasto.centro_costo_id || null,
        sociedad_id: gasto.sociedad_id || null,
      }));
    }
    addNotificacion(`Egreso de caja chica registrado: S/ ${Number(datos.monto).toFixed(2)}`);
    return cc;
  };

  const registrarAnticipoOC = async ({ ordenCompraId, fecha, monto, moneda = 'PEN', referencia = '', notas = '' }) => {
    const id = generateId('ocanp');
    const anticipo = {
      id,
      empresa_id: empresa.id,
      orden_compra_id: ordenCompraId,
      fecha,
      monto: Number(monto),
      moneda,
      referencia: referencia || null,
      notas: notas || null,
      creado_por: authUser?.id || null,
      creado_en: new Date().toISOString(),
    };
    setOcAnticipos(prev => [anticipo, ...prev]);

    const movimiento = {
      id: generateId('tes'),
      empresa_id: empresa.id,
      tipo: 'egreso',
      descripcion: `Anticipo OC ${ordenCompraId}${referencia ? ' — ' + referencia : ''}`,
      monto: Number(monto),
      moneda,
      fecha,
      referencia: referencia || '',
      vinculo_tipo: 'oc_anticipo',
      vinculo_id: id,
      estado: 'registrado',
    };
    setMovimientosTesoreria(prev => [movimiento, ...prev]);

    if (isSupabaseConfigured() && empresa?.id) {
      finSync(async () => {
        const sb = await getSupabaseClient();
        await sb.from('oc_anticipos').insert([anticipo]).catch(() => null);
        await finanzasService.registrarMovimientoTesoreria(movimiento).catch(() => null);
      });
    }
    addNotificacion(`Anticipo de ${moneda} ${Number(monto).toFixed(2)} registrado en la OC.`);
    return anticipo;
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
      cuenta_bancaria_id: datos.cuenta_bancaria_id || null,
      tc_aplicado: datos.tc_aplicado ?? null,
      monto_en_moneda_cuenta: datos.monto_en_moneda_cuenta ?? null,
      referencia: datos.referencia || '',
      vinculo_tipo: 'cxp',
      vinculo_id: cxpId,
      estado: 'registrado'
    };
    setMovimientosTesoreria(prev => [movimiento, ...prev]);

    // Sincronizar compras_gastos cuando la CxP queda completamente pagada
    const gastoIdVinculado = cuentaPagar?.gasto_id;
    if (nuevoEstado === 'pagada' && gastoIdVinculado) {
      setComprasGastos(prev => prev.map(g =>
        g.id === gastoIdVinculado ? { ...g, estado_pago: 'pagado' } : g
      ));
    }

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
        if (nuevoEstado === 'pagada' && gastoIdVinculado) {
          const sb = await getSupabaseClient();
          await sb.from('compras_gastos').update({ estado_pago: 'pagado' }).eq('id', gastoIdVinculado);
        }
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
    return movimiento;
  };

  const prepararCamposVinculacionBanco = async (movBanco, movimientoSistema) => {
    const cuentaBanco = (cuentasBancarias || []).find(c => c.id === movBanco?.cuenta_bancaria_id);
    if (!cuentaBanco || !movimientoSistema) return {};
    const monedaMovimiento = String(movimientoSistema.moneda || 'PEN').trim().toUpperCase();
    const monedaCuenta = String(cuentaBanco.moneda || 'PEN').trim().toUpperCase();
    if (monedaMovimiento === monedaCuenta) {
      return prepararVinculacionMovimientoCuenta(movimientoSistema, cuentaBanco, null);
    }
    const supabase = isSupabaseConfigured() ? await getSupabaseClient() : null;
    const tc = await getTipoCambioPorFecha(movimientoSistema.fecha || movBanco.fecha, supabase);
    return prepararVinculacionMovimientoCuenta(movimientoSistema, cuentaBanco, tc);
  };

  const asignarCuentaMovimientoTesoreria = async (movimientoId, cuentaBancariaId) => {
    const movimiento = (movimientosTesoreria || []).find(m => m.id === movimientoId);
    if (!movimiento) return;

    let updates = prepararDesvinculacionMovimientoCuenta();
    if (cuentaBancariaId) {
      const cuentaBanco = (cuentasBancarias || []).find(c => c.id === cuentaBancariaId);
      if (!cuentaBanco) return;
      const monedaMovimiento = String(movimiento.moneda || 'PEN').trim().toUpperCase();
      const monedaCuenta = String(cuentaBanco.moneda || 'PEN').trim().toUpperCase();
      const tc = monedaMovimiento === monedaCuenta
        ? null
        : await getTipoCambioPorFecha(
            movimiento.fecha || movimiento.fecha_movimiento || new Date().toISOString().slice(0, 10),
            isSupabaseConfigured() ? await getSupabaseClient() : null,
          );
      updates = prepararVinculacionMovimientoCuenta(movimiento, cuentaBanco, tc);
    }

    setMovimientosTesoreria(prev => prev.map(m =>
      m.id === movimientoId ? { ...m, ...updates } : m
    ));

    if (isSupabaseConfigured()) {
      finSync(() => finanzasService.actualizarMovimientoTesoreria(movimientoId, updates));
    }
    addNotificacion(cuentaBancariaId ? 'Cuenta bancaria asignada al movimiento.' : 'Cuenta bancaria desasignada del movimiento.');
  };

  const conciliarMovimientoBancoConDocumento = async (movId, vinculadoTipo, vinculadoId) => {
    const mov = movimientosBanco.find(m => m.id === movId);
    if (!mov || !vinculadoId) return;
    // Part 8: bloquear doble conciliación
    if (mov.conciliado) {
      addNotificacion('Este movimiento bancario ya está conciliado y no puede vincularse nuevamente.');
      return;
    }

    const cuentaBanco = (cuentasBancarias || []).find(c => c.id === mov.cuenta_bancaria_id);
    const cuentaBancoNombre = cuentaBanco
      ? `${cuentaBanco.banco || ''} ${cuentaBanco.nombre || cuentaBanco.alias || ''}`.trim()
      : 'Banco';

    if (vinculadoTipo === 'cxc') {
      const cuentaCobrar = cxc.find(c => c.id === vinculadoId);
      const facturaCobro = facturas.find(f => f.id === cuentaCobrar?.factura_id);
      const moneda = cuentaCobrar?.moneda || facturaCobro?.moneda || empresa?.moneda || 'PEN';
      const camposVinculo = await prepararCamposVinculacionBanco(mov, {
        tipo: 'ingreso',
        monto: Number(mov.monto || 0),
        moneda,
        fecha: mov.fecha,
      });
      await registrarCobroCxC(vinculadoId, Number(mov.monto || 0), {
        fecha: mov.fecha,
        cuenta_bancaria: cuentaBancoNombre,
        referencia: mov.id,
        descripcion: mov.descripcion || mov.desc || `Cobro bancario ${mov.id}`,
        ...camposVinculo,
      });
    } else if (vinculadoTipo === 'cxp') {
      const cuentaPagar = cxp.find(p => p.id === vinculadoId);
      const camposVinculo = await prepararCamposVinculacionBanco(mov, {
        tipo: 'egreso',
        monto: Number(mov.monto || 0),
        moneda: cuentaPagar?.moneda || empresa?.moneda || 'PEN',
        fecha: mov.fecha,
      });
      await registrarPagoCxP(vinculadoId, Number(mov.monto || 0), {
        fecha: mov.fecha,
        cuenta_bancaria: cuentaBancoNombre,
        referencia: mov.id,
        descripcion: mov.descripcion || mov.desc || `Pago bancario ${mov.id}`,
        ...camposVinculo,
      });
    }

    await conciliarMovimientoBanco(
      movId,
      vinculadoTipo,
      vinculadoId,
      cuentaBanco ? { cuenta_bancaria_id: cuentaBanco.id } : {},
    );
  };

  const conciliarMovimientoBanco = async (movId, vinculadoTipo, vinculadoId, extra = {}) => {
    setMovimientosBanco(prev => prev.map(m =>
      m.id === movId ? { ...m, conciliado: true, vinculado_tipo: vinculadoTipo, vinculado_id: vinculadoId, ...extra } : m
    ));

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.conciliarMovimiento(movId, vinculadoTipo, vinculadoId, extra);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'movimientos_banco', entidad_id: movId, accion: 'conciliar', valor_nuevo: { vinculado_tipo: vinculadoTipo, vinculado_id: vinculadoId } });
    addNotificacion('Movimiento bancario conciliado.');
  };

  const deshacerConciliacionBanco = async (movId) => {
    const mov = movimientosBanco.find(m => m.id === movId);
    if (!mov?.conciliado) return;
    const desvinculo = prepararDesvinculacionMovimientoCuenta();
    setMovimientosBanco(prev => prev.map(m =>
      m.id === movId ? { ...m, conciliado: false, vinculado_tipo: null, vinculado_id: null } : m
    ));
    setMovimientosTesoreria(prev => prev.map(m =>
      m.vinculo_tipo === mov.vinculado_tipo && m.vinculo_id === mov.vinculado_id
        ? { ...m, ...desvinculo }
        : m
    ));
    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.deshacerConciliacionMovimiento(movId);
        if (mov.vinculado_tipo && mov.vinculado_id) {
          await finanzasService.actualizarMovimientoTesoreriaPorVinculo(mov.vinculado_tipo, mov.vinculado_id, desvinculo);
        }
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'movimientos_banco', entidad_id: movId, accion: 'desconciliar' });
    addNotificacion('Conciliacion bancaria deshecha.');
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
    const { pct_prima_seguro: _deprecatedPrimaSeguro, ...safeDatos } = datos || {};
    if (!empresa?.id) {
      const error = new Error('No hay una empresa activa para guardar la configuracion.');
      addNotificacion(error.message);
      throw error;
    }

    const payload = { ...safeDatos, empresa_id: empresa.id, updated_at: new Date().toISOString() };
    if (isSupabaseConfigured()) {
      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
          .from('empresa_config')
          .upsert(payload, { onConflict: 'empresa_id' })
          .select('*')
          .single();
        if (error) throw error;
        setEmpresaConfig(prev => ({ ...prev, ...(data || payload) }));
      } catch (_err) {
        console.error('[empresa_config]', _err?.message || _err, _err?.details || '');
        addNotificacion('Error al guardar configuracion: ' + (_err?.message || 'error desconocido'));
        throw _err;
      }
    } else {
      setEmpresaConfig(prev => ({ ...prev, ...payload }));
    }
    addNotificacion('Configuracion de empresa guardada.');
    return payload;
  };

  const guardarAfpParametro = async (datos) => {
    const payload = {
      ...datos,
      empresa_id: empresa?.id,
      pct_prima_seguro: Number(datos.pct_prima_seguro),
      vigente_desde: datos.vigente_desde || new Date().toISOString().slice(0, 10),
    };
    setAfpParametros(prev => latestAfpParametros([...(prev || []), payload]));
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        const saved = await nominaService.saveAfpParametro(empresa.id, payload);
        setAfpParametros(prev => latestAfpParametros([...(prev || []), saved]));
      } catch (err) {
        console.error('[afp_parametros]', err);
        addNotificacion('Error al guardar tasa AFP: ' + (err?.message || 'error'));
        throw err;
      }
    }
    addNotificacion(`Tasa AFP ${payload.afp_nombre} guardada.`);
  };

  const subirImagenEmpresa = async (campo, file) => {
    if (!isSupabaseConfigured() || !empresa?.id) throw new Error('Supabase no configurado');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${empresa.id}/${campo}.${ext}`;
    const supabase = await getSupabaseClient();
    const { error } = await supabase.storage.from('empresa-assets').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('empresa-assets').getPublicUrl(path);
    return {
      url: pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null,
      path,
    };
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

  const crearUnidadOrganizacional = async (unidad) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await posicionesService.crearUnidadOrganizacional(empresa.id, unidad);
      setUnidadesOrganizacionales(prev => [...prev, data]);
      return data;
    }
    const nuevo = { ...unidad, id: generateId('uo'), empresa_id: empresa?.id };
    setUnidadesOrganizacionales(prev => [...prev, nuevo]);
    return nuevo;
  };
  const actualizarUnidadOrganizacional = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await posicionesService.actualizarUnidadOrganizacional(id, datos);
      setUnidadesOrganizacionales(prev => prev.map(u => u.id === id ? act : u));
      return act;
    }
    setUnidadesOrganizacionales(prev => prev.map(u => u.id === id ? { ...u, ...datos } : u));
    return datos;
  };
  const eliminarUnidadOrganizacional = async (id) => {
    if (isSupabaseConfigured()) {
      await posicionesService.eliminarUnidadOrganizacional(id);
    }
    setUnidadesOrganizacionales(prev => prev.filter(u => u.id !== id));
  };
  // Reasigna la unidad organizacional de una posicion puntual (no en cascada a sus
  // subordinados, no toca el historico de posiciones_usuarios).
  const reasignarUnidadDePosicion = async (posicionId, unidadOrganizacionalId) => {
    if (isSupabaseConfigured()) {
      const act = await posicionesService.actualizarUnidadDePosicion(posicionId, unidadOrganizacionalId);
      setPosiciones(prev => prev.map(p => p.id === posicionId ? act : p));
    } else {
      setPosiciones(prev => prev.map(p => p.id === posicionId ? { ...p, unidad_organizacional_id: unidadOrganizacionalId } : p));
    }
    const unidadNombre = unidadesOrganizacionales.find(u => u.id === unidadOrganizacionalId)?.nombre || null;
    setUsuarios(prev => prev.map(u => (
      Array.isArray(u.posiciones) && u.posiciones.some(p => p.posicion_id === posicionId)
        ? {
            ...u,
            posiciones: u.posiciones.map(p => p.posicion_id === posicionId
              ? { ...p, unidad_organizacional_id: unidadOrganizacionalId, unidad_organizacional_nombre: unidadNombre }
              : p),
          }
        : u
    )));
  };

  const reasignarPadreDePosicion = async (posicionId, posicionPadreId) => {
    if (isSupabaseConfigured()) {
      await posicionesService.reasignarPadreDePosicion(posicionId, posicionPadreId);
    }
    setPosiciones(prev => prev.map(p => (
      p.id === posicionId ? { ...p, reporta_a_posicion_id: posicionPadreId || null } : p
    )));
  };

  // Asigna/cambia el cargo de UNA posicion puntual (backfill masivo desde Organigrama). No toca
  // personal_operativo.cargo_id ni personal_administrativo.cargo_id.
  const reasignarCargoDePosicion = async (posicionId, cargoId) => {
    if (isSupabaseConfigured()) {
      const act = await posicionesService.actualizarCargoDePosicion(posicionId, cargoId);
      setPosiciones(prev => prev.map(p => p.id === posicionId ? act : p));
      return act;
    }
    setPosiciones(prev => prev.map(p => p.id === posicionId ? { ...p, cargo_id: cargoId || null } : p));
  };

  const crearPosicion = async (datos) => {
    if (!empresa?.id) throw new Error('No hay tenant activo para crear la posicion.');
    const data = await posicionesService.crearPosicion(empresa.id, datos);
    setPosiciones(prev => [...prev, data]);
    return data;
  };

  const archivarPosicion = async (id) => {
    await posicionesService.archivarPosicion(id);
    setPosiciones(prev => prev.filter(p => p.id !== id));
  };

  const eliminarPosicion = async (id) => {
    await posicionesService.eliminarPosicion(id);
    setPosiciones(prev => prev.filter(p => p.id !== id));
  };

  // Vuelve a cargar posiciones/posicionesUsuarios/unidadesOrganizacionales y recompone
  // usuario.posiciones. Se llama tras crear/editar un usuario con posicion_id, porque esa
  // operacion escribe posiciones_usuarios en el backend sin que el estado local se entere.
  const refrescarPosiciones = async () => {
    if (!empresa?.id) return;
    try {
      const [posicionesData, posicionesUsuariosData, unidadesData] = await Promise.all([
        posicionesService.getPosiciones(empresa.id),
        posicionesService.getPosicionesUsuarios(empresa.id),
        posicionesService.getUnidadesOrganizacionales(empresa.id),
      ]);
      setPosiciones(posicionesData);
      setPosicionesUsuarios(posicionesUsuariosData);
      setUnidadesOrganizacionales(unidadesData);
      setUsuarios(prev => construirUsuariosConPosiciones(prev, posicionesData, posicionesUsuariosData, unidadesData));
    } catch (error) {
      console.error('Error refrescando posiciones:', error);
    }
  };

  const crearTipoContrato = async (datos) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await rrhhService.crearTipoContrato(empresa.id, datos);
      setTiposContrato(prev => [data, ...prev]);
      return data;
    }
    const nuevo = { id: generateId('tcon'), empresa_id: empresa?.id, estado: 'activo', ...datos };
    setTiposContrato(prev => [nuevo, ...prev]);
    return nuevo;
  };
  const actualizarTipoContrato = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await rrhhService.actualizarTipoContrato(id, datos);
      setTiposContrato(prev => prev.map(a => a.id === id ? act : a));
      return act;
    }
    setTiposContrato(prev => prev.map(a => a.id === id ? { ...a, ...datos } : a));
    return datos;
  };
  const eliminarTipoContrato = async (id) => {
    if (isSupabaseConfigured()) await rrhhService.eliminarTipoContrato(id);
    setTiposContrato(prev => prev.filter(a => a.id !== id));
  };

  const guardarCargoNuevo = async (cargo, { permitirDuplicado = false } = {}) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const resultado = await maestrosService.crearCargo(empresa.id, cargo, { permitirDuplicado });
      if (resultado.estado === 'creado') setCargos(prev => [resultado.cargo, ...prev]);
      return resultado;
    }

    const coincidencias = cargos.filter(item => (
      normalizarNombreCargo(item.nombre) === normalizarNombreCargo(cargo?.nombre)
    ));
    const clasificacion = clasificarCoincidenciasCargo(coincidencias);
    if (!permitirDuplicado && clasificacion) return clasificacion;

    const nuevo = { ...cargo, id: generateId('car'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
    setCargos(prev => [nuevo, ...prev]);
    return { estado: 'creado', cargo: nuevo };
  };

  const crearCargo = async (cargo, { origen = 'interactivo' } = {}) => {
    const resultado = await guardarCargoNuevo(cargo);
    if (resultado.estado === 'creado') {
      return origen === 'importacion' ? { resultado: 'creado', cargo: resultado.cargo } : resultado.cargo;
    }

    if (origen === 'importacion') {
      // La importacion de Maestros Base no abre un dialogo por fila. Si hay uno activo
      // se reutiliza; si solo existen inactivos, la fila de CARGO no se inserta y se
      // devuelve como pendiente prioritario para una decision manual posterior.
      if (resultado.estado === 'coincidencia_activa') return { resultado: 'reutilizado', cargo: resultado.activas[0] };
      return { resultado: 'omitido_inactivo', inactivas: resultado.inactivas };
    }

    return new Promise(resolve => {
      setCargoCreationRequest({
        id: generateId('cargo-create-request'),
        empresaId: empresa?.id,
        cargo,
        nombre: String(cargo?.nombre || '').trim(),
        activas: resultado.activas || [],
        inactivas: resultado.inactivas || [],
        resolve,
      });
    });
  };

  const cancelarCreacionCargo = () => {
    if (cargoCreationSaving || !cargoCreationRequest) return;
    cargoCreationRequest.resolve(null);
    setCargoCreationRequest(null);
  };

  const resolverCreacionCargo = async ({ accion, cargoId }) => {
    const solicitud = cargoCreationRequest;
    if (!solicitud || cargoCreationSaving) return;
    setCargoCreationSaving(true);
    try {
      let cargoResuelto = null;
      if (accion === 'reutilizar') {
        cargoResuelto = solicitud.activas.find(item => item.id === cargoId) || null;
      } else if (accion === 'reactivar') {
        if (isSupabaseConfigured() && solicitud.empresaId) {
          cargoResuelto = await maestrosService.reactivarCargo(solicitud.empresaId, cargoId);
          setCargos(prev => prev.map(item => item.id === cargoResuelto.id ? cargoResuelto : item));
        } else {
          setCargos(prev => prev.map(item => {
            if (item.id !== cargoId) return item;
            cargoResuelto = { ...item, estado: 'activo' };
            return cargoResuelto;
          }));
        }
        addNotificacion('Cargo reactivado. Verifica en Organigrama si tiene posiciones activas antes de asignarlo.');
      } else if (accion === 'crear_duplicado') {
        const resultado = await guardarCargoNuevo(solicitud.cargo, { permitirDuplicado: true });
        cargoResuelto = resultado.cargo;
      }

      if (!cargoResuelto) throw new Error('No se pudo resolver el cargo seleccionado.');
      solicitud.resolve(cargoResuelto);
      setCargoCreationRequest(null);
    } catch (error) {
      console.error('Error al resolver coincidencia de cargo:', error);
      addNotificacion(`No se pudo resolver la coincidencia del cargo: ${error?.message || 'Error desconocido'}`);
    } finally {
      setCargoCreationSaving(false);
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
  const fusionarCargos = async (origenId, destinoId) => {
    if (isSupabaseConfigured()) {
      await maestrosService.fusionarCargos(origenId, destinoId);
      // Recargar cargos y reapuntar personal en estado local
      const cargosAct = await maestrosService.getCargos(empresa?.id);
      setCargos(cargosAct || []);
    } else {
      // Mock: desactivar origen, no mover fichas (sin BD real no hay fichas reapuntadas)
      setCargos(prev => prev.map(c => c.id === origenId ? { ...c, estado: 'inactivo' } : c));
    }
  };


  const crearTipoDocumento = async (tipo) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await tiposDocumentoService.crearTipoDocumento(empresa.id, tipo);
      setTiposDocumento(prev => [...prev, data].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre)));
      return data;
    }
    const nuevo = { ...tipo, id: generateId('tdoc'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
    setTiposDocumento(prev => [...prev, nuevo]);
    return nuevo;
  };
  const actualizarTipoDocumento = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await tiposDocumentoService.actualizarTipoDocumento(id, datos);
      setTiposDocumento(prev => prev.map(t => t.id === id ? act : t));
      return act;
    }
    setTiposDocumento(prev => prev.map(t => t.id === id ? { ...t, ...datos } : t));
    return datos;
  };
  const importarPlantillaTiposDoc = async () => {
    if (!isSupabaseConfigured() || !empresa?.id) throw new Error('Requiere Supabase configurado');
    await tiposDocumentoService.importarPlantilla(empresa.id);
    const data = await tiposDocumentoService.getTiposDocumento(empresa.id);
    setTiposDocumento(data || []);
  };
  const upsertRequisitoCargo = async (cargoId, tipoDocId, obligatorio) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await tiposDocumentoService.upsertRequisitoCargo(empresa.id, cargoId, tipoDocId, obligatorio);
      setRequisitosCargo(prev => {
        const sin = prev.filter(r => !(r.cargo_id === cargoId && r.tipo_documento_id === tipoDocId));
        return [...sin, data];
      });
      return data;
    }
    const nuevo = { id: generateId('cdr'), empresa_id: empresa?.id, cargo_id: cargoId, tipo_documento_id: tipoDocId, obligatorio };
    setRequisitosCargo(prev => {
      const sin = prev.filter(r => !(r.cargo_id === cargoId && r.tipo_documento_id === tipoDocId));
      return [...sin, nuevo];
    });
    return nuevo;
  };
  const eliminarRequisitoCargo = async (id) => {
    if (isSupabaseConfigured()) await tiposDocumentoService.eliminarRequisitoCargo(id);
    setRequisitosCargo(prev => prev.filter(r => r.id !== id));
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
  const actualizarNivelJerarquico = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarNivelJerarquico(id, datos);
      setNivelesJerarquicos(prev => prev.map(n => n.id === id ? act : n));
      return act;
    }
    setNivelesJerarquicos(prev => prev.map(n => n.id === id ? { ...n, ...datos } : n));
    return datos;
  };
  const eliminarNivelJerarquico = async (id) => {
    if (isSupabaseConfigured()) await maestrosService.eliminarNivelJerarquico(id);
    setNivelesJerarquicos(prev => prev.filter(n => n.id !== id));
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
  const crearNivelJerarquico = async (nivel) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearNivelJerarquico(empresa.id, nivel);
      setNivelesJerarquicos(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...nivel, id: generateId('nvj'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setNivelesJerarquicos(prev => [nuevo, ...prev]);
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

  // ─── Materiales ─────────────────────────────────────────────────────────────
  const recargarMateriales = async () => {
    if (!empresa?.id) return;
    const [mg, mf, ms, mat, fab] = await Promise.all([
      getMaterialGrupos(empresa.id), getMaterialFamilias(empresa.id),
      getMaterialSubfamilias(empresa.id), getMateriales(empresa.id), getFabricantes(empresa.id),
    ]);
    setMaterialGrupos(mg || []);
    setMaterialFamilias(mf || []);
    setMaterialSubfamilias(ms || []);
    setMateriales(mat || []);
    setFabricantes(fab || []);
  };

  const crearFabricanteCtx = async (datos) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await svcCrearFabricante(empresa.id, datos);
      setFabricantes(prev => [...prev, data]);
      return data;
    }
    const nuevo = { ...datos, id: generateId('fab'), empresa_id: empresa?.id, codigo: datos.codigo || `FAB-${Date.now()}`, estado: datos.estado || 'activo' };
    setFabricantes(prev => [...prev, nuevo]);
    return nuevo;
  };
  const actualizarFabricanteCtx = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const actual = await svcActualizarFabricante(id, datos);
      setFabricantes(prev => prev.map(f => f.id === id ? actual : f));
      return actual;
    }
    setFabricantes(prev => prev.map(f => f.id === id ? { ...f, ...datos } : f));
    return datos;
  };

  const crearMatGrupo = async (datos) => {
    const data = await svcCrearGrupo(empresa.id, datos);
    setMaterialGrupos(prev => [...prev, data]);
    return data;
  };
  const actualizarMatGrupo = async (id, datos) => {
    const data = await svcActualizarGrupo(id, datos);
    setMaterialGrupos(prev => prev.map(x => x.id === id ? data : x));
    return data;
  };
  const eliminarMatGrupo = async (id) => {
    await svcEliminarGrupo(id);
    setMaterialGrupos(prev => prev.filter(x => x.id !== id));
  };

  const crearMatFamilia = async (datos) => {
    const data = await svcCrearFamilia(empresa.id, datos);
    setMaterialFamilias(prev => [...prev, data]);
    return data;
  };
  const actualizarMatFamilia = async (id, datos) => {
    const data = await svcActualizarFamilia(id, datos);
    setMaterialFamilias(prev => prev.map(x => x.id === id ? data : x));
    return data;
  };
  const eliminarMatFamilia = async (id) => {
    await svcEliminarFamilia(id);
    setMaterialFamilias(prev => prev.filter(x => x.id !== id));
  };

  const crearMatSubfamilia = async (datos) => {
    const data = await svcCrearSubfamilia(empresa.id, datos);
    setMaterialSubfamilias(prev => [...prev, data]);
    return data;
  };
  const actualizarMatSubfamilia = async (id, datos) => {
    const data = await svcActualizarSubfamilia(id, datos);
    setMaterialSubfamilias(prev => prev.map(x => x.id === id ? data : x));
    return data;
  };
  const eliminarMatSubfamilia = async (id) => {
    await svcEliminarSubfamilia(id);
    setMaterialSubfamilias(prev => prev.filter(x => x.id !== id));
  };

  const crearMaterialCtx = async (datos) => {
    const data = await svcCrearMaterial(empresa.id, { ...datos, creado_por: datos.creado_por || authUser?.id || null });
    setMateriales(prev => [...prev, data]);
    return data;
  };
  const actualizarMaterialCtx = async (id, datos) => {
    const data = await svcActualizarMaterial(id, datos);
    setMateriales(prev => prev.map(x => x.id === id ? data : x));
    return data;
  };
  const eliminarMaterialCtx = async (id) => {
    await svcEliminarMaterial(id);
    setMateriales(prev => prev.filter(x => x.id !== id));
  };

  // ─── Activos ──────────────────────────────────────────────────────────────────
  const recargarActivos = async () => {
    if (!empresa?.id) return;
    const act = await getActivos(empresa.id);
    setActivos(act || []);
  };

  const crearActivoCtx = async (datos) => {
    const data = await svcCrearActivo(empresa.id, datos, authUser?.id);
    setActivos(prev => [...prev, data]);
    return data;
  };

  const actualizarActivoCtx = async (id, datos) => {
    const data = await svcActualizarActivo(id, datos);
    setActivos(prev => prev.map(x => x.id === id ? data : x));
    return data;
  };

  const bajaActivoCtx = async (id, motivo) => {
    const data = await svcDarBajaActivo(id, motivo, authUser?.id);
    setActivos(prev => prev.map(x => x.id === id ? data : x));
    return data;
  };

  const importarActivosCtx = async (filas) => {
    const res = await importarActivosMasivo(empresa.id, filas);
    await recargarActivos();
    return res;
  };

  // ─── Guías de Remisión ────────────────────────────────────────────────────────
  const recargarGuias = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) return;
    const data = await getGuias(empresa.id);
    setGuiasRemision(data || []);
  };

  const crearGuiaCtx = async (form) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const data = await svcCrearGuia(empresa.id, form, authUser?.id);
      setGuiasRemision(prev => [data, ...prev]);
      return data;
    }
    const nuevo = {
      ...form,
      id: generateId('gr'),
      empresa_id: empresa.id,
      serie: form.serie || 'T001',
      numero: (guiasRemision.length || 0) + 1,
      numero_completo: `${form.serie || 'T001'}-${String((guiasRemision.length || 0) + 1).padStart(8, '0')}`,
      estado: 'borrador',
      kardex_salida_ids: [],
      anulado: false,
      created_at: new Date().toISOString(),
    };
    setGuiasRemision(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const actualizarGuiaCtx = async (id, cambios) => {
    if (isSupabaseConfigured()) {
      const data = await svcActualizarGuia(id, cambios, authUser?.id);
      setGuiasRemision(prev => prev.map(g => g.id === id ? data : g));
      return data;
    }
    const actualizado = { ...cambios, id, updated_at: new Date().toISOString() };
    setGuiasRemision(prev => prev.map(g => g.id === id ? { ...g, ...actualizado } : g));
    return actualizado;
  };

  const emitirGuiaCtx = async (id) => {
    if (isSupabaseConfigured()) {
      const data = await svcEmitirGuia(id, authUser?.id);
      setGuiasRemision(prev => prev.map(g => g.id === id ? data : g));
      return data;
    }
    return actualizarGuiaCtx(id, { estado: 'emitida' });
  };

  const marcarEnTransitoCtx = async (id) => {
    if (isSupabaseConfigured()) {
      const data = await svcMarcarEnTransito(id, authUser?.id);
      setGuiasRemision(prev => prev.map(g => g.id === id ? data : g));
      return data;
    }
    return actualizarGuiaCtx(id, { estado: 'en_transito' });
  };

  const confirmarEntregaCtx = async (id) => {
    if (isSupabaseConfigured()) {
      const data = await svcConfirmarEntrega(id, authUser?.id);
      setGuiasRemision(prev => prev.map(g => g.id === id ? data : g));
      return data;
    }
    return actualizarGuiaCtx(id, { estado: 'entregada' });
  };

  const anularGuiaCtx = async (id, motivo) => {
    if (isSupabaseConfigured()) {
      const data = await svcAnularGuia(id, motivo, authUser?.id);
      setGuiasRemision(prev => prev.map(g => g.id === id ? data : g));
      return data;
    }
    return actualizarGuiaCtx(id, { estado: 'anulada', anulado: true, anulado_motivo: motivo });
  };

  // ─── Transportistas ───────────────────────────────────────────────────────────
  const crearTransportistaCtx = async (form) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await svcCrearTransportista(empresa.id, form);
      setTransportistas(prev => [...prev, { ...data, vehiculos: [], conductores: [] }]);
      return data;
    }
    const nuevo = { ...form, tipo_operador: form.tipo_operador || 'tercero', id: generateId('tra'), empresa_id: empresa?.id, activo: true, vehiculos: [], conductores: [], created_at: new Date().toISOString() };
    setTransportistas(prev => [...prev, nuevo]);
    return nuevo;
  };

  const actualizarTransportistaCtx = async (id, cambios) => {
    if (isSupabaseConfigured()) {
      const data = await svcActualizarTransportista(id, cambios);
      setTransportistas(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      return data;
    }
    setTransportistas(prev => prev.map(t => t.id === id ? { ...t, ...cambios } : t));
    return { ...cambios, id };
  };

  const crearVehiculoCtx = async (form) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await svcCrearVehiculo(empresa.id, form);
      setTransportistas(prev => prev.map(t =>
        t.id === form.transportista_id ? { ...t, vehiculos: [...(t.vehiculos || []), data] } : t
      ));
      return data;
    }
    const nuevo = { ...form, id: generateId('veh'), empresa_id: empresa?.id, activo: true, created_at: new Date().toISOString() };
    setTransportistas(prev => prev.map(t =>
      t.id === form.transportista_id ? { ...t, vehiculos: [...(t.vehiculos || []), nuevo] } : t
    ));
    return nuevo;
  };

  const crearConductorCtx = async (form) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await svcCrearConductor(empresa.id, form);
      setTransportistas(prev => prev.map(t =>
        t.id === form.transportista_id ? { ...t, conductores: [...(t.conductores || []), data] } : t
      ));
      return data;
    }
    const nuevo = { ...form, id: generateId('con'), empresa_id: empresa?.id, activo: true, created_at: new Date().toISOString() };
    setTransportistas(prev => prev.map(t =>
      t.id === form.transportista_id ? { ...t, conductores: [...(t.conductores || []), nuevo] } : t
    ));
    return nuevo;
  };

  // ─── Órdenes de Venta ─────────────────────────────────────────────────────────
  const recargarOrdenesVenta = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) return;
    const data = await getOrdenesVenta(empresa.id);
    setOrdenesVenta(data || []);
  };

  const crearOVCtx = async (form) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const data = await svcCrearOV(empresa.id, form, authUser?.id);
      setOrdenesVenta(prev => [data, ...prev]);
      return data;
    }
    const n = (ordenesVenta.length || 0) + 1;
    const nuevo = {
      ...form,
      id: generateId('ov'),
      empresa_id: empresa.id,
      numero: `OV-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`,
      estado: 'pendiente',
      anulado: false,
      created_at: new Date().toISOString(),
    };
    setOrdenesVenta(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const actualizarOVCtx = async (id, cambios) => {
    if (isSupabaseConfigured()) {
      const data = await svcActualizarOV(id, cambios, authUser?.id);
      setOrdenesVenta(prev => prev.map(o => o.id === id ? data : o));
      return data;
    }
    setOrdenesVenta(prev => prev.map(o => o.id === id ? { ...o, ...cambios } : o));
    return { ...cambios, id };
  };

  const confirmarOVCtx = async (id) => {
    if (isSupabaseConfigured()) {
      const res = await svcConfirmarOV(id, authUser?.id);
      await recargarOrdenesVenta();
      return res;
    }
    setOrdenesVenta(prev => prev.map(o => o.id === id ? { ...o, estado: 'confirmada' } : o));
    return { ok: true, erroresReserva: [] };
  };

  const anularOVCtx = async (id, motivo) => {
    if (isSupabaseConfigured()) {
      const data = await svcAnularOV(id, motivo, authUser?.id);
      setOrdenesVenta(prev => prev.map(o => o.id === id ? data : o));
      return data;
    }
    setOrdenesVenta(prev => prev.map(o => o.id === id ? { ...o, estado: 'anulada', anulado: true } : o));
    return { ok: true };
  };

  // ─── Catálogo de Venta ────────────────────────────────────────────────────────
  const crearProductoCatalogoCtx = async (form) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await svcCrearProductoCatalogo(empresa.id, form);
      setCatalogoVenta(prev => [...prev, data]);
      return data;
    }
    const nuevo = { ...form, id: generateId('cat'), empresa_id: empresa?.id, activo: true, created_at: new Date().toISOString() };
    setCatalogoVenta(prev => [...prev, nuevo]);
    return nuevo;
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
  const eliminarProveedorCtx = async (id) => {
    const anterior = proveedores.find(p => p.id === id) || null;
    if (isSupabaseConfigured()) {
      await comprasService.eliminarProveedor(id);
      setProveedores(prev => prev.filter(p => p.id !== id));
      auditSync({ modulo: 'compras', entidad: 'proveedores', entidad_id: id, accion: 'eliminar', valor_anterior: anterior, valor_nuevo: null });
      return true;
    } else {
      setProveedores(prev => prev.filter(p => p.id !== id));
      auditSync({ modulo: 'compras', entidad: 'proveedores', entidad_id: id, accion: 'eliminar', valor_anterior: anterior, valor_nuevo: null });
      return true;
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
  const actualizarOrdenCompraCtx = async (id, cambios) => {
    const anterior = ordenesCompra.find(o => o.id === id) || null;
    if (isSupabaseConfigured()) {
      const data = await comprasService.actualizarOrdenCompra(id, cambios);
      setOrdenesCompra(prev => prev.map(o => o.id === id ? data : o));
      auditSync({ modulo: 'compras', entidad: 'ordenes_compra', entidad_id: id, accion: 'editar', valor_anterior: anterior, valor_nuevo: data });
      return data;
    } else {
      setOrdenesCompra(prev => prev.map(o => o.id === id ? { ...o, ...cambios } : o));
    }
  };
  const registrarTransitoOCCtx = async (datos) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    const orden = ordenesCompra.find(o => o.id === datos.orden_compra_id);
    if (!orden) throw new Error('Orden de compra no encontrada');
    const estadoActual = String(orden.estado || '').toLowerCase();
    if (datos.estado === 'en_transito' && !['emitida', 'confirmada', 'en_transito'].includes(estadoActual)) {
      throw new Error(`No se puede marcar en transito una OC en estado "${orden.estado}"`);
    }

    const fechaTransito = datos.fecha_salida || new Date().toISOString().slice(0, 10);
    let guardado;
    if (isSupabaseConfigured() && empresa?.id) {
      guardado = await comprasService.crearOrdenCompraTransito(empresa.id, {
        ...datos,
        creado_por: authUser?.id || null,
      });
    } else {
      guardado = {
        ...datos,
        id: datos.id || generateId('oct'),
        empresa_id: empresa.id,
        creado_por: authUser?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (datos.estado === 'en_transito' && !notificaciones.some(n => n.referenceType === 'orden_compra' && n.referenceId === orden.id && n.tipo === 'oc_en_transito')) {
        const tipoMsg = datos.tipo === 'recojo_propio' ? 'recojo propio' : 'despacho del proveedor';
        setNotificaciones(prev => [{
          id: generateId('not'),
          tipo: 'oc_en_transito',
          referenceType: 'orden_compra',
          referenceId: orden.id,
          text: `${orden.codigo || orden.id} esta en transito por ${tipoMsg}.`,
          read: false,
          time: 'Justo ahora',
          priority: 'media',
        }, ...prev]);
      }
    }

    setOcTransitos(prev => [guardado, ...prev.filter(t => t.id !== guardado.id)]);
    if (datos.estado === 'en_transito' && ['emitida', 'confirmada'].includes(estadoActual)) {
      setOrdenesCompra(prev => prev.map(o => o.id === orden.id ? {
        ...o,
        estado: 'en_transito',
        fecha_en_transito: o.fecha_en_transito || fechaTransito,
        updated_at: guardado.updated_at || new Date().toISOString(),
      } : o));
    }
    auditSync({ modulo: 'compras', entidad: 'orden_compra_transitos', entidad_id: guardado.id, accion: 'crear', valor_nuevo: guardado });
    return guardado;
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

  // ─── Devoluciones Proveedor ─────────────────────────────────────────────────
  const crearDevolucionCtx = async (datos) => {
    if (!empresa?.id) throw new Error('Empresa no seleccionada');
    if (isSupabaseConfigured()) {
      const data = await devolucionesService.crearDevolucion(empresa.id, datos, authUser?.id);
      setDevolucionesProveedor(prev => [data, ...prev]);
      return data;
    }
    const recepcionOrigen = (recepciones || []).find(r => r.id === datos.recepcion_id);
    const ordenCompraId = datos.oc_id || recepcionOrigen?.orden_compra_id || recepcionOrigen?.oc_id || null;
    const ordenServicioId = recepcionOrigen?.orden_servicio_id || recepcionOrigen?.os_id || null;
    const documentoOrigen = ordenCompraId
      ? (ordenesCompra || []).find(o => o.id === ordenCompraId)
      : (ordenesServicio || []).find(o => o.id === ordenServicioId);
    const sociedadDevolucionId = empresa?.multisociedad_habilitado ? (documentoOrigen?.sociedad_id || null) : null;
    if (empresa?.multisociedad_habilitado && !sociedadDevolucionId) {
      throw new Error('El documento de compra que originó la recepción no tiene sociedad; no se puede crear la devolución en un tenant con multisociedad.');
    }
    const mock = {
      ...datos,
      id: generateId('dev'),
      empresa_id: empresa.id,
      sociedad_id: sociedadDevolucionId,
      oc_id: ordenCompraId,
      numero_devolucion: `DEV-${String(devolucionesProveedor.length + 1).padStart(4, '0')}`,
      estado: 'borrador',
      kardex_salida_ids: [],
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
      devoluciones_proveedor_lineas: (datos.lineas || []).map(linea => ({
        ...linea,
        empresa_id: empresa.id,
        sociedad_id: sociedadDevolucionId,
      })),
    };
    setDevolucionesProveedor(prev => [mock, ...prev]);
    return mock;
  };

  const enviarDevolucionCtx = async (devolucionId) => {
    if (!empresa?.id) throw new Error('Empresa no seleccionada');
    if (isSupabaseConfigured()) {
      const data = await devolucionesService.enviarDevolucion(empresa.id, devolucionId, authUser?.id);
      setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, ...data } : d));
      return data;
    }
    setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, estado: 'enviada' } : d));
  };

  const aceptarDevolucionCtx = async (devolucionId) => {
    if (!empresa?.id) throw new Error('Empresa no seleccionada');
    if (isSupabaseConfigured()) {
      const data = await devolucionesService.aceptarDevolucion(empresa.id, devolucionId);
      setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, ...data } : d));
      return data;
    }
    setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, estado: 'aceptada' } : d));
  };

  const registrarNCDevolucionCtx = async (devolucionId, datosNC) => {
    if (!empresa?.id) throw new Error('Empresa no seleccionada');
    if (isSupabaseConfigured()) {
      const result = await devolucionesService.registrarNotaCredito(empresa.id, devolucionId, datosNC, authUser?.id);
      setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, ...result.devolucion } : d));
      if (datosNC.cxp_origen_id) {
        const montoAjuste = Math.abs(Number(datosNC.monto_nc));
        setCxp(prev => prev.map(c => {
          if (c.id !== datosNC.cxp_origen_id) return c;
          const nuevoSaldo = Math.max(0, Number(c.saldo) - montoAjuste);
          return { ...c, saldo: nuevoSaldo, monto_pagado: Number(c.monto_pagado || 0) + montoAjuste, estado: nuevoSaldo <= 0 ? 'pagada' : c.estado };
        }));
      }
      return result;
    }
    setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, estado: 'nota_credito_recibida' } : d));
  };

  const anularDevolucionCtx = async (devolucionId, motivo_anulacion) => {
    if (!empresa?.id) throw new Error('Empresa no seleccionada');
    if (isSupabaseConfigured()) {
      const data = await devolucionesService.anularDevolucion(empresa.id, devolucionId, motivo_anulacion, authUser?.id);
      setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, ...data } : d));
      return data;
    }
    setDevolucionesProveedor(prev => prev.map(d => d.id === devolucionId ? { ...d, estado: 'anulada', motivo_anulacion } : d));
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

  const registrarRecepcionConCxP = async ({ origenTipo, origenId, observaciones = '', facturaNumero = '', fechaEmision: fechaEmisionParam = '', fechaVencimiento: fechaVencimientoParam = '', archivoFacturaUrl = '', facturaProvNumero = '', facturaProvFecha = '', facturaProvMonto = null, itemsFactura = [], forzarConfirmacion = false }) => {
    const isOC = origenTipo === 'oc';
    const base = isOC
      ? ordenesCompra.find(o => o.id === origenId)
      : ordenesServicio.find(o => o.id === origenId);
    if (!base) {
      addNotificacion('Selecciona una orden valida para recepcionar.');
      return null;
    }

    // === Validaciones 3 vías (solo para OC) ===
    const toleranciaPct = Number(empresaConfig?.tolerancia_precio_compras ?? 5);
    const tolerancia = toleranciaPct / 100;
    const validacionErrores = [];
    const validacionAdvertencias = [];
    let precioDiferente = false;
    let cantidadDiferente = false;
    const itemsFacturaList = Array.isArray(itemsFactura) ? itemsFactura : [];
    const precioFacturaPorLinea = (item, idx) => {
      const linea = itemsFacturaList[idx];
      const precio = Number(linea?.precio_unitario_factura ?? linea?.precio_unitario ?? item.precio_unitario ?? 0);
      return Number.isFinite(precio) ? precio : 0;
    };
    const factorTotalFactura = () => {
      const itemsOC = base.items || [];
      const subtotalOC = Number(base.subtotal || 0) ||
        itemsOC.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio_unitario || 0), 0);
      const totalOC = Number(base.total || 0);
      if (subtotalOC > 0 && totalOC > 0) return totalOC / subtotalOC;
      return 1 + (Number(base.igv_pct ?? 18) / 100);
    };
    const entradasPendientesOC = isOC
      ? (entradasOcPendientes || []).filter(e => String(e.orden_compra_id || e.referencia_id || '') === String(base.id))
      : [];
    const tieneEntradaFisicaPendiente = entradasPendientesOC.length > 0;
    const cantidadFisicaPorLinea = (item, idx) => {
      const cantidadDesdeUi = Number(itemsFacturaList[idx]?.cantidad_recibida ?? itemsFacturaList[idx]?.recibido ?? NaN);
      if (Number.isFinite(cantidadDesdeUi) && cantidadDesdeUi >= 0) return cantidadDesdeUi;
      const porIdx = entradasPendientesOC.filter(e => e.orden_compra_item_idx !== null && e.orden_compra_item_idx !== undefined && Number(e.orden_compra_item_idx) === Number(idx));
      const matches = porIdx.length ? porIdx : entradasPendientesOC.filter(e => item.material_id && e.material_id === item.material_id);
      if (!matches.length) return Number(item.cantidad || 0);
      return matches.reduce((sum, e) => sum + Number(e.cantidad || 0), 0);
    };

    if (isOC) {
      const recepcionesAnteriores = (recepciones || []).filter(r =>
        String(r.orden_compra_id || r.oc_id || '') === String(base.id)
      );

      for (const item of (base.items || [])) {
        const cantidadPedida = Number(item.cantidad || 0);
        const cantidadYaRecibida = recepcionesAnteriores.reduce((sum, r) => {
          const itemRec = (r.items_recibidos || []).find(i =>
            (item.material_id && i.material_id === item.material_id) ||
            i.descripcion === item.descripcion
          );
          return sum + Number(itemRec?.recibido || 0);
        }, 0);
        const cantidadPendiente = Math.max(0, cantidadPedida - cantidadYaRecibida);
        const idx = (base.items || []).indexOf(item);
        const cantidadARecibir = tieneEntradaFisicaPendiente ? cantidadFisicaPorLinea(item, idx) : cantidadPedida;
        if (!tieneEntradaFisicaPendiente && cantidadARecibir > cantidadPendiente + 0.0001) {
          cantidadDiferente = true;
          validacionErrores.push(
            `No puedes recibir más unidades de las pendientes para "${item.descripcion}": ` +
            `intentas recibir ${cantidadARecibir} ${item.unidad || ''} pero solo quedan ${cantidadPendiente.toFixed(2)} pendientes.`
          );
        }
      }

      const itemsOC = base.items || [];
      for (const [idx, item] of itemsOC.entries()) {
        const precioOC = Number(item.precio_unitario || 0);
        const precioFactura = precioFacturaPorLinea(item, idx);
        if (precioOC <= 0 && precioFactura > 0) {
          precioDiferente = true;
          validacionAdvertencias.push(
            `Item ${item.descripcion}: precio OC S/ 0.00 vs precio factura S/ ${precioFactura.toFixed(2)}`
          );
          continue;
        }
        if (precioOC <= 0) continue;
        const diffItem = Math.abs(precioFactura - precioOC) / precioOC;
        if (diffItem > tolerancia) {
          precioDiferente = true;
          validacionAdvertencias.push(
            `Item ${item.descripcion}: precio OC S/ ${precioOC.toFixed(2)} vs precio factura S/ ${precioFactura.toFixed(2)} (diferencia ${(diffItem * 100).toFixed(1)}%)`
          );
        }
      }

      if (facturaProvMonto != null && Number(facturaProvMonto) > 0) {
        const subtotalLineasFactura = itemsOC.reduce((s, item, idx) =>
          s + Number(tieneEntradaFisicaPendiente ? cantidadFisicaPorLinea(item, idx) : item.cantidad || 0) * precioFacturaPorLinea(item, idx), 0);
        const totalLineasFactura = subtotalLineasFactura * factorTotalFactura();
        const montoFactura = Number(facturaProvMonto);
        if (totalLineasFactura > 0) {
          const diffAbs = Math.abs(montoFactura - totalLineasFactura);
          const diffPct = diffAbs / totalLineasFactura;
          if (diffPct > tolerancia) {
            precioDiferente = true;
            validacionAdvertencias.push(
              `Monto factura cabecera S/ ${montoFactura.toFixed(2)} vs total lineas c/IGV S/ ${totalLineasFactura.toFixed(2)} (diferencia S/ ${diffAbs.toFixed(2)}, ${(diffPct * 100).toFixed(1)}%)`
            );
          }
        }
      }

    }

    if (validacionErrores.length > 0) return { errors: validacionErrores };
    if (validacionAdvertencias.length > 0 && !forzarConfirmacion) return { warnings: validacionAdvertencias };

    const fecha = new Date().toISOString().split('T')[0];
    const fechaVencimientoAuto = (() => {
      const d = new Date(`${fecha}T00:00:00`);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();
    const itemsRecibidos = isOC
      ? (base.items || []).map((item, idx) => ({
        codigo: item.codigo || null,
        material_id: item.material_id || null,
        descripcion: item.descripcion,
        pedido: item.cantidad,
        recibido: tieneEntradaFisicaPendiente ? cantidadFisicaPorLinea(item, idx) : item.cantidad,
        unidad: item.unidad,
        conforme: !observaciones,
        precio_unitario: precioFacturaPorLinea(item, idx),
        precio_unitario_oc: Number(item.precio_unitario || 0)
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
      cxp_generada: !observaciones,
      factura_proveedor_numero: facturaProvNumero || facturaNumero || null,
      factura_proveedor_fecha: facturaProvFecha || fechaEmisionParam || null,
      factura_proveedor_monto: facturaProvMonto != null ? Number(facturaProvMonto) : null,
      archivo_factura_url: archivoFacturaUrl || null,
      precio_diferente: precioDiferente,
      cantidad_diferente: cantidadDiferente,
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
          recibido_por: recepcion.recibido_por,
          factura_proveedor_numero: recepcion.factura_proveedor_numero,
          factura_proveedor_fecha: recepcion.factura_proveedor_fecha,
          factura_proveedor_monto: recepcion.factura_proveedor_monto,
          archivo_factura_url: recepcion.archivo_factura_url,
          precio_diferente: recepcion.precio_diferente,
          cantidad_diferente: recepcion.cantidad_diferente,
        });
      } catch (error) {
        addNotificacion(`Compras no persistio en Supabase: ${error.message}`);
      }
    }

    const recepcionLocal = { ...recepcion, ...recepcionGuardada, proveedor_id: base.proveedor_id, cxp_generada: !observaciones };
    setRecepciones(prev => [recepcionLocal, ...prev]);
    auditSync({ modulo: 'compras', entidad: 'recepciones', entidad_id: recepcionLocal.id, accion: 'registrar', valor_nuevo: recepcionLocal });

    if (isOC) {
      const cambios = {
        estado: 'cerrada',
        porcentaje_recibido: 100,
        fecha_recepcion_real: fecha,
        lead_time_dias: comprasService.calcularLeadTimeDias(base.fecha_emision, fecha)
      };
      setOrdenesCompra(prev => prev.map(o => o.id === base.id ? { ...o, ...cambios } : o));
      setOcTransitos(prev => prev.map(t =>
        t.orden_compra_id === base.id && ['registrado', 'en_transito'].includes(t.estado)
          ? { ...t, estado: 'recibido', updated_at: new Date().toISOString() }
          : t
      ));
      if (isSupabaseConfigured()) {
        comprasService.cerrarOrdenCompraPorRecepcion(base.id, { fechaRecepcion: fecha, fechaEmision: base.fecha_emision })
          .then(data => {
            if (data) setOrdenesCompra(prev => prev.map(o => o.id === base.id ? { ...o, ...data } : o));
          })
          .catch(error => addNotificacion(`Compras no persistio en Supabase: ${error.message}`));
      }
      if (itemsRecibidos.length) {
        if (isSupabaseConfigured() && !observaciones && tieneEntradaFisicaPendiente) {
          comprasService.ajustarValorizacionOcPendiente(empresa.id, {
            orden_compra_id: base.id,
            recepcion_id: recepcionLocal.id,
            items: itemsRecibidos.map((item, idx) => ({
              index: idx,
              material_id: item.material_id,
              precio_unitario: item.precio_unitario,
            })),
          }).then(async () => {
            await recargarInventario();
            await recargarEntradasOcPendientes();
          }).catch(error => addNotificacion(`Ajuste GRNI no persistio en Supabase: ${error.message}`));
        } else if (isSupabaseConfigured() && !observaciones) {
          // Motor WMS: registra entradas reales, busca materiales en catálogo, actualiza costo promedio
          Promise.all(itemsRecibidos.map(item => comprasService.registrarEntradaInventario(empresa.id, {
            codigo: item.codigo || null,
            descripcion: item.descripcion,
            unidad: item.unidad,
            cantidad: item.recibido,
            costo_unitario: item.precio_unitario || 0,
            moneda: base.moneda || 'PEN',
            almacen_codigo: 'ALM-001',
            proveedor_id: base.proveedor_id || null,
          }, {
            tipo: 'recepcion',
            id: recepcion.id,
            orden_compra_id: base.id,
            sociedad_id: base.sociedad_id || null,
            proveedor_id: base.proveedor_id || null,
            observacion: `Entrada por recepcion ${recepcion.codigo}`
          }, authUser?.id))).then(async () => {
            const invData = await getStockCompleto(empresa.id);
            if (invData?.length) setInventario(invData);
          }).catch(error => addNotificacion(`Inventario no persistio en Supabase: ${error.message}`));
        } else if (!isSupabaseConfigured() && tieneEntradaFisicaPendiente) {
          setEntradasOcPendientes(prev => prev.filter(e => String(e.orden_compra_id || '') !== String(base.id)));
        } else if (!isSupabaseConfigured()) {
          // Mock: agrega entradas locales para demo
          setInventario(prev => [...prev, ...itemsRecibidos.map((item, idx) => ({
            id: generateId('inv'),
            empresa_id: empresa.id,
            material_id: generateId('mat'),
            almacen_id: 'ALM-001',
            sku: item.codigo || `CMP-${Date.now()}-${idx}`,
            nombre: item.descripcion,
            categoria: 'Compras',
            almacen: 'Almacén Principal',
            unidad: item.unidad,
            fisico: item.recibido,
            disponible: item.recibido,
            reservado: 0,
            stock_actual: item.recibido,
            costo_promedio: item.precio_unitario || 0,
            stock_minimo: 0,
            punto_reorden: 0,
          }))]);
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
      const anticiposOC = isOC ? ocAnticipos.filter(a => a.orden_compra_id === base.id) : [];
      const totalAnticipado = anticiposOC.reduce((s, a) => s + Number(a.monto || 0), 0);
      const totalOC = Number(base.total || 0);
      const saldoCxP = Math.max(0, Math.round((totalOC - totalAnticipado) * 100) / 100);
      await generarCxP({
        tipo_beneficiario: 'proveedor',
        proveedor_id: base.proveedor_id,
        factura_numero: facturaNumero || `PROV-${base.codigo || base.id}`,
        concepto: `Recepción ${base.codigo || base.id}${totalAnticipado > 0 ? ` (anticipo descontado: S/ ${totalAnticipado.toFixed(2)})` : ''}`,
        fecha_emision: fechaEmisionParam || fecha,
        fecha_vencimiento: fechaVencimientoParam || fechaVencimientoAuto,
        monto_total: saldoCxP,
        monto_pagado: 0,
        saldo: saldoCxP,
        moneda: base.moneda || 'PEN',
        sociedad_id: base.sociedad_id || null,
        estado: saldoCxP <= 0 ? 'pagada' : 'por_pagar',
        origen: 'recepcion',
        recepcion_id: recepcionLocal.id,
        ...(archivoFacturaUrl ? { archivo_factura_url: archivoFacturaUrl } : {})
      });
    }

    addNotificacion(`Recepcion registrada. ${observaciones ? 'Quedo observada.' : 'CxP generada.'}`);
    return recepcionLocal;
  };

  // ─── Acciones WMS ────────────────────────────────────────────────────────────
  const recargarInventario = async (filtroSociedades = null) => {
    if (!empresa?.id || !isSupabaseConfigured()) return;
    const inv = await getStockCompleto(empresa.id, filtroSociedades);
    if (inv) setInventario(inv);
  };

  const recargarEntradasOcPendientes = async (filtroSociedades = null) => {
    if (!empresa?.id || !isSupabaseConfigured()) return entradasOcPendientes;
    const data = await listarEntradasOcPendientesValorizacion(empresa.id, null, filtroSociedades);
    setEntradasOcPendientes(data || []);
    return data || [];
  };

  const registrarEntradaManualCtx = async (form, filtroSociedades = null) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (form?.motivo === 'oc_pendiente_factura') {
      if (isSupabaseConfigured()) {
        const res = await registrarEntradaOcPendienteFactura(empresa.id, form, authUser?.id);
        await recargarInventario(filtroSociedades);
        await recargarEntradasOcPendientes(filtroSociedades);
        return res;
      }
      const entradasMock = (form.lineas || [])
        .filter(l => Number(l.cantidad_recibida || 0) > 0)
        .map((linea, idx) => ({
          id: generateId('kdx'),
          empresa_id: empresa.id,
          material_id: linea.material_id || null,
          orden_compra_id: form.orden_compra_id,
          orden_compra_item_idx: linea.index ?? idx,
          cantidad: Number(linea.cantidad_recibida || 0),
          costo_unitario: Number(linea.precio_unitario_oc || linea.precio_unitario || 0),
          precio_unitario_provisional: Number(linea.precio_unitario_oc || linea.precio_unitario || 0),
          valorizacion_estado: 'pendiente_factura',
          anulado: false,
          created_at: new Date().toISOString(),
        }));
      setEntradasOcPendientes(prev => [...entradasMock, ...prev]);
      setInventario(prev => [
        ...prev,
        ...entradasMock.map((e, idx) => {
          const linea = (form.lineas || [])[idx] || {};
          return {
            id: generateId('inv'),
            empresa_id: empresa.id,
            material_id: e.material_id || generateId('mat'),
            almacen_id: form.almacen_id || 'ALM-001',
            sku: linea.codigo || e.material_id || `OC-${idx + 1}`,
            nombre: linea.descripcion || 'Material OC',
            disponible: e.cantidad,
            fisico: e.cantidad,
            stock_actual: e.cantidad,
            reservado: 0,
            costo_promedio: e.costo_unitario,
            almacen: 'Principal',
            unidad: linea.unidad || 'und',
            categoria: 'Compras',
          };
        })
      ]);
      return entradasMock;
    }
    if (isSupabaseConfigured()) {
      const res = await registrarEntrada(empresa.id, form, authUser?.id);
      await recargarInventario(filtroSociedades);
      return res;
    }
    // Mock
    setInventario(prev => {
      const idx = prev.findIndex(i => i.material_id === form.material_id && i.almacen_id === form.almacen_id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], disponible: updated[idx].disponible + Number(form.cantidad), stock_actual: updated[idx].stock_actual + Number(form.cantidad) };
        return updated;
      }
      return [...prev, { id: generateId('inv'), empresa_id: empresa.id, material_id: form.material_id, almacen_id: form.almacen_id, sku: form.sku || form.material_id, nombre: form.nombre || form.material_id, disponible: Number(form.cantidad), reservado: 0, fisico: Number(form.cantidad), stock_actual: Number(form.cantidad), costo_promedio: Number(form.costo_unitario || 0), almacen: form.almacen || 'Principal', unidad: form.unidad || 'und', categoria: form.categoria || 'General', stock_minimo: 0, punto_reorden: 0 }];
    });
    return { ok: true };
  };

  const registrarTransferenciaCtx = async (form, filtroSociedades = null) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const entreSociedades = form.sociedad_origen_id
        && form.sociedad_destino_id
        && form.sociedad_origen_id !== form.sociedad_destino_id;
      const res = entreSociedades
        ? await registrarTransferenciaIntercompania(empresa.id, form, authUser?.id)
        : await registrarTransferencia(empresa.id, form, authUser?.id);
      await recargarInventario(filtroSociedades);
      return res;
    }
    return { ok: true };
  };

  const registrarAjusteCtx = async (form, filtroSociedades = null) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const res = await registrarAjuste(empresa.id, form, authUser?.id);
      await recargarInventario(filtroSociedades);
      return res;
    }
    return { ok: true };
  };

  const reservarStockCtx = async (material_id, almacen_id, cantidad, otId) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      await reservarStock(empresa.id, material_id, almacen_id, cantidad, otId);
      await recargarInventario();
    }
  };

  const getKardexMaterialCtx = async (materialId, almacenId, filtroSociedades = null) => {
    if (!empresa?.id || !isSupabaseConfigured()) return [];
    return getKardex(empresa.id, materialId, almacenId, 50, filtroSociedades);
  };

  const iniciarConteoCtx = async (form) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const conteo = await iniciarConteo(empresa.id, form, authUser?.id);
      setInventarioConteos(prev => [conteo, ...prev.filter(c => c.id !== conteo.id)]);
      return conteo;
    }
    const rows = inventario
      .filter(i => !form.almacen_id || i.almacen_id === form.almacen_id)
      .map(i => ({
        material_id: i.material_id,
        almacen_id: i.almacen_id,
        sku: i.sku,
        nombre: i.nombre,
        categoria: i.categoria,
        unidad: i.unidad,
        almacen: i.almacen,
        tipo_control: i.tipo_control || 'sin_control',
        teorico: Number(i.fisico ?? i.disponible ?? 0),
        fisico: null,
        diferencia: null,
        lote: i.lote || null,
        serie: i.serie || null,
        vencimiento: i.vencimiento || null,
      }));
    const conteo = {
      id: generateId('cnt'),
      codigo: `CNT-MOCK-${String(inventarioConteos.length + 1).padStart(3, '0')}`,
      empresa_id: empresa.id,
      estado: 'en_proceso',
      tipo: form.tipo || 'total',
      nombre: form.nombre || 'Conteo fisico',
      almacen_id: form.almacen_id || null,
      zona: form.zona || null,
      items: rows,
      ajustes_generados: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setInventarioConteos(prev => [conteo, ...prev]);
    return conteo;
  };

  const recargarConteosInventarioCtx = async (filtroSociedades = null) => {
    if (!empresa?.id || !isSupabaseConfigured()) return inventarioConteos;
    const data = await listarConteos(empresa.id, 50, filtroSociedades);
    setInventarioConteos(data || []);
    return data || [];
  };

  const guardarAvanceConteoCtx = async (conteoId, items) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const data = await guardarAvanceConteo(empresa.id, conteoId, items, authUser?.id);
      setInventarioConteos(prev => prev.map(c => c.id === conteoId ? data : c));
      return data;
    }
    const data = { ...(inventarioConteos.find(c => c.id === conteoId) || {}), estado: 'en_proceso', items, updated_at: new Date().toISOString() };
    setInventarioConteos(prev => prev.map(c => c.id === conteoId ? data : c));
    return data;
  };

  const cerrarConteoCtx = async (conteoId, items, filtroSociedades = null) => {
    if (!empresa?.id) throw new Error('Sin empresa activa');
    if (isSupabaseConfigured()) {
      const res = await cerrarConteo(empresa.id, conteoId, items, authUser?.id);
      await recargarInventario(filtroSociedades);
      await recargarConteosInventarioCtx(filtroSociedades);
      return res;
    }
    const itemsConDif = (items || []).map(it => ({ ...it, diferencia: Number(it.fisico || 0) - Number(it.teorico || 0) }));
    setInventarioConteos(prev => prev.map(c => c.id === conteoId ? { ...c, estado: 'cerrado', items: itemsConDif, ajustes_generados: true, cerrado_at: new Date().toISOString(), updated_at: new Date().toISOString() } : c));
    return [];
  };

  const getAnaliticaInventarioCtx = async (filtros) => {
    if (!empresa?.id) return { abc: [], rotacion: [], stockMuerto: [], meta: { movimientosPeriodo: 0 } };
    if (isSupabaseConfigured()) return getAnaliticaInventario(empresa.id, filtros);
    const filtroSociedades = filtros?.filtroSociedades;
    const sociedadesPermitidas = new Set(filtroSociedades?.sociedadesIds || []);
    const inventarioAnalitica = !filtroSociedades || filtroSociedades.sinFiltro
      ? inventario
      : inventario.filter(i => i.sociedad_id && sociedadesPermitidas.has(i.sociedad_id));
    const stockMuerto = inventarioAnalitica
      .filter(i => !filtros?.almacen_id || i.almacen_id === filtros.almacen_id)
      .map(i => ({
        key: `${i.sociedad_id || 'sin_sociedad'}::${i.material_id || 'sin_material'}::${i.almacen_id || 'sin_almacen'}`,
        sociedad_id: i.sociedad_id || null,
        material_id: i.material_id,
        almacen_id: i.almacen_id,
        sku: i.sku,
        nombre: i.nombre,
        categoria: i.categoria,
        unidad: i.unidad,
        almacen: i.almacen,
        stock_actual: Number(i.fisico ?? i.disponible ?? 0),
        costo_promedio: Number(i.costo_promedio || 0),
        ultima_salida: null,
        dias_sin_actividad: null,
        valor_inmovilizado: Number(i.fisico ?? i.disponible ?? 0) * Number(i.costo_promedio || 0),
      }))
      .filter(i => i.stock_actual > 0);
    return {
      abc: [],
      rotacion: [],
      stockMuerto,
      meta: {
        periodo: filtros?.periodo || 'trimestre',
        movimientosPeriodo: 0,
        salidasPeriodo: 0,
        totalSalidasValor: 0,
        dias_sin_actividad: Number(filtros?.dias_sin_actividad || 90),
        valorInmovilizado: stockMuerto.reduce((s, r) => s + Number(r.valor_inmovilizado || 0), 0),
      },
    };
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
      setPeriodosNomina(prev => prev.some(p => p.id === data.id) ? prev : [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...periodo, id: generateId('pnm'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setPeriodosNomina(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };

  // ── Documentos del personal ──────────────────────────────────────────────────
  const aplicarSnapshotDocumentoPersonal = (doc) => {
    if (!doc || doc.estado_validacion !== 'aprobado') return;
    // En multisociedad las condiciones pertenecen al contrato, no a la ficha compartida.
    if (empresa?.multisociedad_habilitado && doc.sociedad_id) return;
    const tipo = String(`${doc.tipo_doc || ''} ${doc.tipo_doc_codigo || ''} ${doc.tipo_documento_codigo || ''} ${doc.tipo_documento_id || ''}`).toLowerCase();

    // Detección por catálogo (tipo_doc almacena IDs, no texto descriptivo)
    let capturaViaCatalogo = false;
    let esAdendaViaCatalogo = false;
    let tieneSucesorViaCatalogo = false;
    if (doc.tipo_documento_id && tiposDocumento) {
      const tipoInfo = tiposDocumento.find(t => t.id === doc.tipo_documento_id);
      if (tipoInfo?.captura_snapshot_laboral) {
        capturaViaCatalogo = true;
        esAdendaViaCatalogo = Boolean(tipoInfo.documento_padre_tipo_id);
        tieneSucesorViaCatalogo = Boolean(tipoInfo.tipo_sucesor_id);
      }
    }

    if (!tipo.includes('contrato') && !tipo.includes('adenda') && !capturaViaCatalogo) return;

    if (doc.fecha_vigencia_cambio && doc.fecha_vigencia_cambio > new Date().toISOString().slice(0, 10)) {
      addNotificacion('Adenda aprobada con vigencia futura. Queda registrada para aplicacion manual en la fecha indicada.', 'warning');
      return;
    }
    const cond = doc.condiciones_laborales || {};
    const cambios = doc.adenda_cambios || {};
    const esAdenda = tipo.includes('adenda') || esAdendaViaCatalogo;

    // Un Contrato Primigenio (tiene sucesor, ej. "Contrato Laboral") es histórico:
    // captura el estado de la ficha al subirlo, no lo empuja de vuelta al aprobarlo.
    if (!esAdenda && tieneSucesorViaCatalogo) return;

    // Conversión régimen snapshot → formato personal_asignaciones_jornada
    // La tabla solo acepta 'general' | 'ciclo_acumulativo' + dias_ciclo_*
    const CICLOS_MINEROS = {
      minero_14x7:  { t: 14, d: 7  },
      minero_20x10: { t: 20, d: 10 },
      minero_28x14: { t: 28, d: 14 },
      minero_2x1:   { t: 2,  d: 1  },
    };
    const regimenSnapshot = !esAdenda && cond.regimen_jornada ? cond.regimen_jornada : null;
    const cicloDatos = regimenSnapshot ? CICLOS_MINEROS[regimenSnapshot] : null;
    const regimenParaAsig = regimenSnapshot === 'general' ? 'general'
      : cicloDatos ? 'ciclo_acumulativo' : null;

    const aplicar = (persona) => {
      if (!persona) return persona;
      const patch = {};
      const usar = (key) => !esAdenda || Boolean(cambios[key]);
      // Cargo: solo histórico en snapshot, no se actualiza en la ficha operativa.
      // El cargo activo lo gestiona RRHH desde el formulario de edición.
      if (usar('remuneracion') && cond.remuneracion_base !== undefined && cond.remuneracion_base !== '') {
        const monto = Math.round(parseFloat(cond.remuneracion_base) || 0);
        patch.sueldo_base = monto;
        patch.remuneracion = monto;
        patch.monto_mensual = monto;
      }
      if (usar('modalidad') && cond.modalidad) patch.modalidad = cond.modalidad;
      if (usar('sede') && (cond.sede_nombre || cond.sede)) patch.sede = cond.sede_nombre || cond.sede;
      if (usar('sede') && cond.sede_id) patch.sede_id = cond.sede_id;
      if (!esAdenda && cond.tipo_contrato) patch.tipo_contrato = cond.tipo_contrato;
      if (regimenSnapshot && regimenParaAsig) {
        patch.regimen_jornada = regimenSnapshot; // columna directa — display en formulario
        if (cicloDatos) {
          patch.dias_ciclo_trabajo  = cicloDatos.t;
          patch.dias_ciclo_descanso = cicloDatos.d;
        }
      }
      if (!esAdenda && cond.area_id) patch.area_id = cond.area_id;
      return { ...persona, ...patch };
    };
    if (doc.personal_tipo === 'administrativo') {
      setPersonalAdmin(prev => prev.map(p => p.id === doc.personal_id ? aplicar(p) : p));
    } else {
      setPersonalOperativo(prev => prev.map(p => p.id === doc.personal_id ? aplicar(p) : p));
    }

    // El tramo contractual se crea en base de datos mediante trigger. Aquí se
    // actualiza únicamente el espejo visual inmediato, sin una segunda escritura.
    if (regimenSnapshot && !regimenParaAsig) {
      console.warn('Régimen del snapshot no reconocido:', regimenSnapshot);
    }
  };

  const subirDocumentoPersonalCtx = async (params) => {
    const data = await personalDocumentosService.subirDocumento({ ...params, empresaId: empresa?.id });
    // El nuevo doc empieza activo=false; solo se agrega sin tocar los anteriores
    setPersonalDocumentos(prev => [...prev, data]);
    return data;
  };

  const recargarPersonalDocumentosPersonaCtx = async (personalId) => {
    if (!isSupabaseConfigured() || !empresa?.id) return;
    try {
      const docsPersona = await personalDocumentosService.getDocumentosActivosPersona(empresa.id, personalId);
      setPersonalDocumentos(prev => {
        const sinPersona = prev.filter(d => String(d.personal_id) !== String(personalId));
        return [...sinPersona, ...(docsPersona || [])];
      });
    } catch (e) {
      console.error('Error al recargar documentos del personal:', e);
    }
  };
  const validarDocumentoPersonalCtx = async (documentoId, decision, motivoRechazo = null) => {
    const data = await personalDocumentosService.validarDocumento(documentoId, decision, motivoRechazo);
    setPersonalDocumentos(prev => {
      if (decision !== 'aprobado') return prev.map(d => d.id === documentoId ? data : d);
      // Al aprobar: desactiva todos los del mismo tipo en estado local, activa el aprobado
      return prev.map(d => {
        if (d.id === documentoId) return { ...data, activo: true };
        if (d.personal_id === data.personal_id &&
            (d.tipo_documento_id === data.tipo_documento_id || d.tipo_doc === data.tipo_doc) &&
            (data.sociedad_id == null || d.sociedad_id === data.sociedad_id)) {
          return { ...d, activo: false };
        }
        return d;
      });
    });
    aplicarSnapshotDocumentoPersonal(data);
    if (decision === 'aprobado') {
      const actualizado = await rrhhService.getAsignacionesJornada(empresa?.id);
      setAsignacionesJornada(actualizado || []);
    }
    return data;
  };
  const corregirDocumentoPersonalCtx = async (params) => {
    const data = await personalDocumentosService.corregirDocumento({ ...params, empresaId: empresa?.id });
    setPersonalDocumentos(prev => prev.map(d => d.id === params.documentoId ? data : d));
    return data;
  };

  const nuevoContratoPeriodoCtx = async (params) => {
    const data = await personalDocumentosService.nuevoContrato({ ...params, empresaId: empresa?.id });
    setPersonalDocumentos(prev => [
      ...prev.map(d => d.contrato_periodo_id === params.periodoIdAnterior
        ? { ...d, periodo_estado: 'archivado' }
        : d),
      data,
    ]);
    return data;
  };

  const enviarDocumentoAFirmaCtx = async ({ documentoId, workerAuthUserId, mensaje }) => {
    const data = await personalDocumentosService.enviarDocumentoAFirma({
      documentoId, empresaId: empresa?.id, workerAuthUserId, mensaje,
    });
    setPersonalDocumentos(prev => prev.map(d => d.id === documentoId ? data : d));
    return data;
  };
  const cancelarEnvioFirmaCtx = async ({ documentoId }) => {
    const data = await personalDocumentosService.cancelarEnvioFirma({ documentoId });
    setPersonalDocumentos(prev => prev.map(d => d.id === documentoId ? data : d));
    return data;
  };
  const reenviarNotificacionFirmaCtx = async ({ documentoId, workerAuthUserId }) => {
    await personalDocumentosService.reenviarNotificacionFirma({ documentoId, empresaId: empresa?.id, workerAuthUserId });
  };
  const subirDocumentoFirmadoPortalCtx = async ({ file, tipoDoc, tipoDocumentoId, personalId, personalTipo, documentoEnviadoAFirmaId, nombreColaborador }) => {
    const docEnviado = personalDocumentos.find(d => d.id === documentoEnviadoAFirmaId);
    const nuevoDoc = await subirDocumentoPersonalCtx({
      personalId, personalTipo, tipoDoc, tipoDocumentoId, file,
      fechaEmision: docEnviado?.fecha_emision || null,
      fechaVencimiento: docEnviado?.fecha_vencimiento || null,
      condicionesLaborales: docEnviado?.condiciones_laborales || {},
      notas: 'Documento firmado cargado desde Mi portal',
      subidoDesde: 'mobile', sociedadId: docEnviado?.sociedad_id || null,
    });
    if (isSupabaseConfigured() && nuevoDoc?.id) {
      await personalDocumentosService.vincularDocumentoFirmado({
        nuevoDocId: nuevoDoc.id, documentoEnviadoAFirmaId, empresaId: empresa?.id, nombreColaborador,
      });
      setPersonalDocumentos(prev => prev.map(d =>
        d.id === nuevoDoc.id ? { ...d, estado_firma: 'firmado_trabajador', documento_enviado_a_firma_id: documentoEnviadoAFirmaId || null }
        : d.id === documentoEnviadoAFirmaId ? { ...d, estado_firma: 'firmado_trabajador' }
        : d
      ));
    }
    return nuevoDoc;
  };

  const subirContratoFirmadoAprobadoCtx = async ({ file, docOriginal }) => {
    if (!docOriginal || !file || !empresa?.id) throw new Error('Parámetros inválidos para subir contrato firmado.');
    const nuevoDoc = await subirDocumentoPersonalCtx({
      personalId: docOriginal.personal_id,
      personalTipo: docOriginal.personal_tipo,
      tipoDoc: docOriginal.tipo_doc || docOriginal.tipo_documento_id || 'contrato',
      tipoDocumentoId: docOriginal.tipo_documento_id || null,
      file,
      fechaEmision: docOriginal.fecha_emision || null,
      fechaVencimiento: docOriginal.fecha_vencimiento || null,
      contratoPeriodoId: docOriginal.contrato_periodo_id || null,
      condicionesLaborales: docOriginal.condiciones_laborales || {},
      notas: 'Contrato firmado cargado desde portal empleado',
      subidoDesde: 'mobile', sociedadId: docOriginal.sociedad_id || null,
    });

    if (isSupabaseConfigured() && nuevoDoc?.id) {
      try {
        await portalFase2Service.registrarFirmaContrato(empresa.id, {
          personal_id: docOriginal.personal_id,
          documento_id: nuevoDoc.id,
          tipo_evento: 'subida_firmado',
          creado_en: new Date().toISOString(),
        });
        const supabase = await getSupabaseClient();
        await supabase.from('notificaciones_sistema').insert({
          empresa_id: empresa.id,
          tipo: 'contrato_firmado_pendiente',
          title: 'Contrato firmado pendiente de revisión',
          texto: `${authUser?.email || 'El colaborador'} subió su contrato firmado.`,
          referencia_tipo: 'personal_documento',
          referencia_id: nuevoDoc.id,
          prioridad: 'media',
          leida: false,
        });
      } catch (err) {
        console.error('Error al registrar auditoria/notificación de firma de contrato:', err);
      }
    }
    return nuevoDoc;
  };

  const crearAsignacionJornadaCtx = async (personalId, personalTipo, params) => {
    const data = await rrhhService.crearAsignacionJornada(empresa?.id, personalId, personalTipo, params);
    // La RPC cierra la anterior y retorna la nueva; recargar historial del trabajador
    const actualizado = await rrhhService.getAsignacionesJornada(empresa?.id);
    setAsignacionesJornada(actualizado || []);
    if (data?.tipo_tramo === 'normal') {
      const clave = `${Number(data.dias_ciclo_trabajo)}x${Number(data.dias_ciclo_descanso)}`;
      const regimenFicha = data.regimen_jornada === 'general' ? 'general' : ({
        '14x7':'minero_14x7', '20x10':'minero_20x10', '28x14':'minero_28x14', '2x1':'minero_2x1',
      })[clave];
      if (regimenFicha) {
        const aplicarEspejo = prev => prev.map(p => p.id === personalId ? {
          ...p,
          regimen_jornada: regimenFicha,
          dias_ciclo_trabajo: data.dias_ciclo_trabajo,
          dias_ciclo_descanso: data.dias_ciclo_descanso,
          fecha_inicio_ciclo: data.fecha_inicio_ciclo,
        } : p);
        if (personalTipo === 'administrativo') setPersonalAdmin(aplicarEspejo);
        else setPersonalOperativo(aplicarEspejo);
      }
    }
    return data;
  };

  const eliminarAsignacionJornadaCtx = async (id, forzarOverride = false, motivoOverride = null) => {
    await rrhhService.eliminarAsignacionJornada(id, forzarOverride, motivoOverride);
    const actualizado = await rrhhService.getAsignacionesJornada(empresa?.id);
    setAsignacionesJornada(actualizado || []);
    // La eliminación reabre el tramo anterior si existe. La actualización del campo
    // "regimen_jornada" espejo en personal_operativo/admin podría quedar desincronizado localmente,
    // pero la vista de Roster usará las asignaciones directamente.
  };

  const upsertListBy = (prev, rows, keyFn) => {
    const incoming = rows || [];
    if (!incoming.length) return prev;
    return [
      ...prev.filter(item => !incoming.some(row => keyFn(row) === keyFn(item))),
      ...incoming,
    ];
  };

  const getEvaluacionCtx = (evaluacionId) => {
    const evaluacion = evaluacionEvaluaciones.find(e => e.id === evaluacionId);
    const plantilla = evaluacion ? evaluacionPlantillas.find(p => p.id === evaluacion.plantilla_id) : null;
    const competencias = plantilla ? evaluacionCompetencias.filter(c => c.plantilla_id === plantilla.id).sort((a, b) => (a.orden || 0) - (b.orden || 0)) : [];
    const objetivos = plantilla ? evaluacionObjetivos.filter(o => o.plantilla_id === plantilla.id).sort((a, b) => (a.orden || 0) - (b.orden || 0)) : [];
    return { evaluacion, plantilla, competencias, objetivos };
  };

  const crearPlantillaEvaluacionCtx = async (payload) => {
    if (!empresa?.id) return null;
    const creadoPor = authUser?.id || null;
    if (isSupabaseConfigured()) {
      const data = await evaluacionesDesempenoService.crearPlantillaCompleta(empresa.id, payload, creadoPor);
      setEvaluacionPlantillas(prev => [data.plantilla, ...prev]);
      setEvaluacionCompetencias(prev => [...prev, ...(data.competencias || [])]);
      setEvaluacionObjetivos(prev => [...prev, ...(data.objetivos || [])]);
      setEvaluacionEvaluaciones(prev => [...(data.evaluaciones || []), ...prev]);
      addNotificacion(payload.estado === 'borrador' ? 'Plantilla de evaluacion guardada como borrador.' : 'Plantilla de evaluacion creada y activada.');
      return data;
    }

    const plantilla = {
      id: generateId('edp'),
      empresa_id: empresa.id,
      nombre: payload.nombre,
      descripcion: payload.descripcion || '',
      periodo: payload.periodo,
      estado: payload.estado || 'activa',
      peso_autoevaluacion: Number(payload.peso_autoevaluacion ?? 30),
      peso_jefe: Number(payload.peso_jefe ?? 70),
      peso_competencias: Number(payload.peso_competencias ?? 50),
      peso_objetivos: Number(payload.peso_objetivos ?? 50),
      fecha_inicio: payload.fecha_inicio || '',
      fecha_limite_autoevaluacion: payload.fecha_limite_autoevaluacion || '',
      fecha_limite_jefe: payload.fecha_limite_jefe || '',
      creado_por: creadoPor,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const competencias = (payload.competencias || []).map((c, idx) => ({
      id: generateId('edc'),
      empresa_id: empresa.id,
      plantilla_id: plantilla.id,
      nombre: c.nombre,
      descripcion: c.descripcion || '',
      escala_min: Number(c.escala_min ?? payload.escala_min ?? 1),
      escala_max: Number(c.escala_max ?? payload.escala_max ?? 5),
      orden: idx + 1,
    }));
    const objetivos = (payload.objetivos || []).map((o, idx) => ({
      id: generateId('edo'),
      empresa_id: empresa.id,
      plantilla_id: plantilla.id,
      nombre: o.nombre,
      descripcion: o.descripcion || '',
      unidad_medida: o.unidad_medida || 'numero',
      meta_numerica: Number(o.meta_numerica || 0),
      orden: idx + 1,
    }));
    const evaluaciones = plantilla.estado === 'borrador' ? [] : (payload.colaboradores || []).map(c => ({
      id: generateId('ede'),
      empresa_id: empresa.id,
      plantilla_id: plantilla.id,
      evaluado_id: c.evaluado_id,
      evaluado_nombre: c.evaluado_nombre,
      evaluado_tipo: c.evaluado_tipo,
      jefe_id: c.jefe_id || null,
      jefe_nombre: c.jefe_nombre || '',
      estado: 'pendiente',
      score_autoevaluacion: null,
      score_jefe: null,
      score_final: null,
      comentario_final_jefe: null,
      creado_por: creadoPor,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    setEvaluacionPlantillas(prev => [plantilla, ...prev]);
    setEvaluacionCompetencias(prev => [...prev, ...competencias]);
    setEvaluacionObjetivos(prev => [...prev, ...objetivos]);
    setEvaluacionEvaluaciones(prev => [...evaluaciones, ...prev]);
    addNotificacion(plantilla.estado === 'borrador' ? 'Plantilla de evaluacion guardada como borrador.' : 'Plantilla de evaluacion creada y activada.');
    return { plantilla, competencias, objetivos, evaluaciones };
  };

  const actualizarPlantillaEvaluacionCtx = async (plantillaId, patch) => {
    const data = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.actualizarPlantilla(plantillaId, patch)
      : { ...(evaluacionPlantillas.find(p => p.id === plantillaId) || {}), ...patch, updated_at: new Date().toISOString() };
    setEvaluacionPlantillas(prev => prev.map(p => p.id === plantillaId ? data : p));
    return data;
  };

  const cerrarPlantillaEvaluacionCtx = async (plantillaId) => {
    const data = await actualizarPlantillaEvaluacionCtx(plantillaId, { estado: 'cerrada' });
    addNotificacion('Plantilla cerrada. Los resultados ya son visibles para los colaboradores evaluados.');
    return data;
  };

  const reasignarJefeEvaluacionCtx = async (evaluacionId, jefeId, jefeNombre) => {
    const patch = { jefe_id: jefeId || null, jefe_nombre: jefeNombre || null };
    const data = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.actualizarEvaluacion(evaluacionId, patch)
      : { ...(evaluacionEvaluaciones.find(e => e.id === evaluacionId) || {}), ...patch, updated_at: new Date().toISOString() };
    setEvaluacionEvaluaciones(prev => prev.map(e => e.id === evaluacionId ? data : e));
    addNotificacion('Jefe evaluador reasignado.');
    return data;
  };

  const guardarAutoevaluacionCtx = async (evaluacionId, { competencias: respuestasComp = [], objetivos: respuestasObj = [] }) => {
    const ctx = getEvaluacionCtx(evaluacionId);
    if (!ctx.evaluacion || !ctx.plantilla) throw new Error('Evaluacion no encontrada.');
    const now = new Date().toISOString();
    const compRowsBase = respuestasComp.map(r => ({
      id: r.id || generateId('erc'),
      empresa_id: empresa.id,
      evaluacion_id: evaluacionId,
      competencia_id: r.competencia_id,
      tipo_evaluador: 'autoevaluacion',
      puntaje: Number(r.puntaje || 0),
      comentario: r.comentario || '',
      respondido_por: authUser?.id || null,
      respondido_en: now,
    }));
    const objRowsBase = respuestasObj.map(r => {
      const objetivo = ctx.objetivos.find(o => o.id === r.objetivo_id);
      const pct = evaluacionesDesempenoService.calcularPorcentajeObjetivo(r.resultado_real, objetivo?.meta_numerica);
      return {
        id: r.id || generateId('ero'),
        empresa_id: empresa.id,
        evaluacion_id: evaluacionId,
        objetivo_id: r.objetivo_id,
        tipo_evaluador: 'autoevaluacion',
        resultado_real: Number(r.resultado_real || 0),
        porcentaje_cumplimiento: pct,
        comentario: r.comentario || '',
        respondido_por: authUser?.id || null,
        respondido_en: now,
      };
    });

    const compRows = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.upsertRespuestasCompetencias(empresa.id, evaluacionId, 'autoevaluacion', compRowsBase, authUser?.id || null)
      : compRowsBase;
    const objRows = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.upsertRespuestasObjetivos(empresa.id, evaluacionId, 'autoevaluacion', objRowsBase, authUser?.id || null)
      : objRowsBase;

    const scoreAuto = evaluacionesDesempenoService.calcularScoreEvaluador(ctx.plantilla, ctx.competencias, ctx.objetivos, compRows, objRows);
    const patch = {
      score_autoevaluacion: scoreAuto,
      estado: ctx.evaluacion.score_jefe != null ? 'completada' : 'autoevaluacion_completa',
    };
    if (ctx.evaluacion.score_jefe != null) {
      patch.score_final = evaluacionesDesempenoService.calcularScoreFinal(ctx.plantilla, scoreAuto, ctx.evaluacion.score_jefe);
    }

    const evalData = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.actualizarEvaluacion(evaluacionId, patch)
      : { ...ctx.evaluacion, ...patch, updated_at: now };
    setEvaluacionRespCompetencias(prev => upsertListBy(prev, compRows, r => `${r.evaluacion_id}:${r.competencia_id}:${r.tipo_evaluador}`));
    setEvaluacionRespObjetivos(prev => upsertListBy(prev, objRows, r => `${r.evaluacion_id}:${r.objetivo_id}:${r.tipo_evaluador}`));
    setEvaluacionEvaluaciones(prev => prev.map(e => e.id === evaluacionId ? evalData : e));
    addNotificacion('Autoevaluacion enviada. Tu jefe ya puede revisarla.');
    return evalData;
  };

  const guardarEvaluacionJefeCtx = async (evaluacionId, { competencias: respuestasComp = [], objetivos: respuestasObj = [], comentarioFinal = '' }) => {
    const ctx = getEvaluacionCtx(evaluacionId);
    if (!ctx.evaluacion || !ctx.plantilla) throw new Error('Evaluacion no encontrada.');
    const now = new Date().toISOString();
    const compRowsBase = respuestasComp.map(r => ({
      id: r.id || generateId('erc'),
      empresa_id: empresa.id,
      evaluacion_id: evaluacionId,
      competencia_id: r.competencia_id,
      tipo_evaluador: 'jefe',
      puntaje: Number(r.puntaje || 0),
      comentario: r.comentario || '',
      respondido_por: authUser?.id || null,
      respondido_en: now,
    }));
    const objRowsBase = respuestasObj.map(r => {
      const objetivo = ctx.objetivos.find(o => o.id === r.objetivo_id);
      const pct = evaluacionesDesempenoService.calcularPorcentajeObjetivo(r.resultado_real, objetivo?.meta_numerica);
      return {
        id: r.id || generateId('ero'),
        empresa_id: empresa.id,
        evaluacion_id: evaluacionId,
        objetivo_id: r.objetivo_id,
        tipo_evaluador: 'jefe',
        resultado_real: Number(r.resultado_real || 0),
        porcentaje_cumplimiento: pct,
        comentario: r.comentario || '',
        respondido_por: authUser?.id || null,
        respondido_en: now,
      };
    });

    const compRows = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.upsertRespuestasCompetencias(empresa.id, evaluacionId, 'jefe', compRowsBase, authUser?.id || null)
      : compRowsBase;
    const objRows = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.upsertRespuestasObjetivos(empresa.id, evaluacionId, 'jefe', objRowsBase, authUser?.id || null)
      : objRowsBase;

    const autoComp = evaluacionRespCompetencias.filter(r => r.evaluacion_id === evaluacionId && r.tipo_evaluador === 'autoevaluacion');
    const autoObj = evaluacionRespObjetivos.filter(r => r.evaluacion_id === evaluacionId && r.tipo_evaluador === 'autoevaluacion');
    const scoreAuto = ctx.evaluacion.score_autoevaluacion ?? evaluacionesDesempenoService.calcularScoreEvaluador(ctx.plantilla, ctx.competencias, ctx.objetivos, autoComp, autoObj);
    const scoreJefe = evaluacionesDesempenoService.calcularScoreEvaluador(ctx.plantilla, ctx.competencias, ctx.objetivos, compRows, objRows);
    const scoreFinal = evaluacionesDesempenoService.calcularScoreFinal(ctx.plantilla, scoreAuto, scoreJefe);
    const patch = {
      estado: 'completada',
      score_autoevaluacion: scoreAuto,
      score_jefe: scoreJefe,
      score_final: scoreFinal,
      comentario_final_jefe: comentarioFinal,
    };
    const evalData = isSupabaseConfigured()
      ? await evaluacionesDesempenoService.actualizarEvaluacion(evaluacionId, patch)
      : { ...ctx.evaluacion, ...patch, updated_at: now };
    setEvaluacionRespCompetencias(prev => upsertListBy(prev, compRows, r => `${r.evaluacion_id}:${r.competencia_id}:${r.tipo_evaluador}`));
    setEvaluacionRespObjetivos(prev => upsertListBy(prev, objRows, r => `${r.evaluacion_id}:${r.objetivo_id}:${r.tipo_evaluador}`));
    setEvaluacionEvaluaciones(prev => prev.map(e => e.id === evaluacionId ? evalData : e));
    addNotificacion('Evaluacion del jefe enviada. El resultado queda disponible para RRHH.');
    return evalData;
  };

  // ── Liquidaciones por cese ────────────────────────────────────────────────

  const crearLiquidacionCtx = async (payload) => {
    if (!empresa?.id) throw new Error('No hay empresa activa.');
    const creadoPor = authUser?.id || null;
    if (isSupabaseConfigured()) {
      const data = await liquidacionesCeseService.crearLiquidacion(empresa.id, payload, creadoPor);
      setLiquidacionesCese(prev => [data.liquidacion, ...prev]);
      setLiquidacionesConceptos(prev => [...prev, ...(data.conceptos || [])]);
      return data;
    }
    const liq = {
      ...payload,
      id: generateId('liq'),
      empresa_id: empresa.id,
      estado: 'calculada',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setLiquidacionesCese(prev => [liq, ...prev]);
    return { liquidacion: liq, conceptos: [] };
  };

  const confirmarLiquidacionCtx = async (liquidacionId, params = {}) => {
    if (!empresa?.id) throw new Error('No hay empresa activa.');
    const confirmedBy = authUser?.id || null;
    if (isSupabaseConfigured()) {
      const liquidacionLocal = liquidacionesCese.find(item => item.id === liquidacionId);
      const personalId = params.personal_id || liquidacionLocal?.personal_id;
      const fechaCese = params.fecha_cese || liquidacionLocal?.fecha_cese;
      let sociedadLiquidacionId = null;
      if (empresa?.multisociedad_habilitado) {
        if (!personalId || !fechaCese) {
          throw new Error('No se pudo identificar al colaborador y la fecha de cese para derivar la sociedad de la liquidación.');
        }
        const resolucionSociedad = resolverSociedadContratoVigente({
          documentos: personalDocumentos,
          tiposDocumento,
          sociedades: sociedadesDisponibles,
          personalId,
          fecha: fechaCese,
        });
        if (resolucionSociedad.conflicto) {
          throw new Error(`El colaborador tiene contratos vigentes en sociedades distintas: ${resolucionSociedad.nombres.join(', ')}. Resuelve los contratos antes de confirmar la liquidación.`);
        }
        if (!resolucionSociedad.sociedadId) {
          throw new Error('El colaborador no tiene un contrato societario vigente para la fecha de cese. Resuelve el contrato antes de confirmar la liquidación.');
        }
        sociedadLiquidacionId = resolucionSociedad.sociedadId;
      }
      const { personal_id: _personalId, fecha_cese: _fechaCese, ...paramsServicio } = params;
      const data = await liquidacionesCeseService.confirmarLiquidacion(liquidacionId, {
        ...paramsServicio,
        sociedad_id: sociedadLiquidacionId,
      }, confirmedBy);
      setLiquidacionesCese(prev => prev.map(l => l.id === liquidacionId ? data.liquidacion : l));
      setLiquidacionesConceptos(prev => [
        ...prev.filter(c => c.liquidacion_id !== liquidacionId),
        ...(data.conceptos || []),
      ]);
      if (data.cxp) setCxp(prev => [data.cxp, ...prev]);
      // Marcar personal como cesado en estado local
      const liq = data.liquidacion;
      if (liq.personal_tipo === 'operativo') {
        setPersonalOperativo(prev => prev.map(p => p.id === liq.personal_id
          ? { ...p, estado_laboral: 'cesado', estado: 'inactivo', fecha_cese: liq.fecha_cese, tipo_cese: liq.tipo_cese, no_recontratar: liq.tipo_cese === 'despido_falta_grave' ? true : p.no_recontratar, no_recontratar_motivo: liq.tipo_cese === 'despido_falta_grave' ? (liq.motivo_falta_grave || 'Despido justificado por falta grave') : p.no_recontratar_motivo }
          : p));
      } else {
        setPersonalAdmin(prev => prev.map(p => p.id === liq.personal_id
          ? { ...p, estado_laboral: 'cesado', estado: 'inactivo', fecha_cese: liq.fecha_cese, tipo_cese: liq.tipo_cese, no_recontratar: liq.tipo_cese === 'despido_falta_grave' ? true : p.no_recontratar, no_recontratar_motivo: liq.tipo_cese === 'despido_falta_grave' ? (liq.motivo_falta_grave || 'Despido justificado por falta grave') : p.no_recontratar_motivo }
          : p));
      }
      return data;
    }
    const now = new Date().toISOString();
    setLiquidacionesCese(prev => prev.map(l => l.id === liquidacionId
      ? { ...l, estado: 'confirmada', confirmado_en: now, observaciones: params.observaciones || null }
      : l));
    return { liquidacion: { id: liquidacionId, estado: 'confirmada' }, cxp: null, conceptos: [] };
  };

  const anularLiquidacionCtx = async (liquidacionId, motivo) => {
    if (!empresa?.id) throw new Error('No hay empresa activa.');
    const anuladoPor = authUser?.id || null;
    if (isSupabaseConfigured()) {
      const data = await liquidacionesCeseService.anularLiquidacion(liquidacionId, motivo, anuladoPor);
      setLiquidacionesCese(prev => prev.map(l => l.id === liquidacionId ? data.liquidacion : l));
      if (data.cxp) setCxp(prev => prev.map(c => c.id === data.cxp.id ? data.cxp : c));
      // Revertir personal a activo si aplica
      const liq = data.liquidacion;
      if (liq.estado === 'anulada' && liq.confirmado_en) {
        if (liq.personal_tipo === 'operativo') {
          setPersonalOperativo(prev => prev.map(p => p.id === liq.personal_id
            ? { ...p, estado_laboral: 'activo', estado: 'activo', fecha_cese: null, tipo_cese: null, no_recontratar: false, no_recontratar_motivo: null }
            : p));
        } else {
          setPersonalAdmin(prev => prev.map(p => p.id === liq.personal_id
            ? { ...p, estado_laboral: 'activo', estado: 'activo', fecha_cese: null, tipo_cese: null, no_recontratar: false, no_recontratar_motivo: null }
            : p));
        }
      }
      return data;
    }
    const now = new Date().toISOString();
    setLiquidacionesCese(prev => prev.map(l => l.id === liquidacionId
      ? { ...l, estado: 'anulada', motivo_anulacion: motivo, anulado_en: now }
      : l));
    return { liquidacion: { id: liquidacionId, estado: 'anulada' }, cxp: null };
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

  const clonarRol = (rolId, nuevoNombre, accesoTecnico = {}) => {
    const source = rolesCtx[rolId];
    if (!source) { addNotificacion('Rol origen no encontrado.', 'error'); return; }
    const origenProtegido = Boolean(source.es_admin_empresa || source.es_superadmin);
    if (origenProtegido && !esSuperadminPlataforma) {
      addNotificacion('No puedes clonar un rol con acceso técnico protegido.', 'error');
      return null;
    }
    const banderasTecnicas = esSuperadminPlataforma ? {
      es_admin_empresa: Boolean(accesoTecnico.es_admin_empresa),
      es_superadmin: Boolean(accesoTecnico.es_superadmin && empresa?.id === 'emp_tideo' && empresa?.es_plataforma),
    } : {
      es_admin_empresa: false,
      es_superadmin: false,
    };
    const newId = isSupabaseConfigured() && empresa?.id
      ? `rol_${empresa.id}_${Math.random().toString(36).slice(2, 7)}`
      : `rol_${Math.random().toString(36).slice(2, 7)}`;
    const nuevo = { ...source, ...banderasTecnicas, nombre: nuevoNombre, descripcion: `Copia de ${source.nombre}` };
    setRolesCtx(prev => ({ ...prev, [newId]: nuevo }));
    if (isSupabaseConfigured() && empresa?.id) {
      rolesService.crearRol({
        id: newId,
        empresa_id: empresa.id,
        nombre: nuevoNombre,
        descripcion: `Copia de ${source.nombre}`,
        categoria: source.categoria || 'otro',
        nivel_jerarquico: source.nivel_jerarquico || 'operativo',
        ...(esSuperadminPlataforma ? banderasTecnicas : {}),
        activo: true,
      }).then(() => {
        const permisos = buildPermisosPayload(source.permisos || {});
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

  const puedeConfigurarPlataforma = Boolean(empresa?.id === 'emp_tideo' && empresa?.es_plataforma);

  const buildPermisosPayload = (permisos = {}) => [
    ...MOCK.pantallasPermisos
      .filter(p => puedeConfigurarPlataforma || !PLATFORM_PERMISSION_SCREENS.has(p.key))
      .map(p => {
      const soloVer = p.solo_ver === true;
      return {
        pantalla: p.key,
        puede_ver: permisoPantallaActivo(permisos, 'ver', p.key),
        puede_crear: soloVer ? false : permisoPantallaActivo(permisos, 'crear', p.key),
        puede_editar: soloVer ? false : permisoPantallaActivo(permisos, 'editar', p.key),
        puede_anular: soloVer ? false : permisoPantallaActivo(permisos, 'anular', p.key),
        puede_aprobar: soloVer ? false : permisoPantallaActivo(permisos, 'aprobar', p.key),
        puede_exportar: soloVer ? false : permisoPantallaActivo(permisos, 'exportar', p.key),
        puede_ver_costos: soloVer ? false : Boolean(permisos.ver_costos || permisos.todo),
        puede_ver_finanzas: soloVer ? false : Boolean(permisos.ver_finanzas || permisos.todo),
        permisos_extra: { puede_ver_precios: soloVer ? false : Boolean(permisos.ver_precios || permisos.todo) },
      };
    }),
    {
      pantalla: '__especiales__',
      puede_ver: false,
      puede_crear: false,
      puede_editar: false,
      puede_anular: false,
      puede_aprobar: false,
      puede_exportar: false,
      puede_ver_costos: false,
      puede_ver_finanzas: false,
      permisos_extra: {
        ver_consolidado_grupo: Boolean(permisos.ver_consolidado_grupo || permisos.todo),
        aprobar_descuentos: Boolean(permisos.aprobar_descuentos || permisos.todo),
        anular_documentos: Boolean(permisos.anular_documentos || permisos.todo),
        acceso_campo: Boolean(permisos.acceso_campo || permisos.todo),
        monto_max_compras: Number(permisos.monto_max_compras) || 0,
        perfil_campo: permisos.perfil_campo || null,
      },
    },
  ];

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
    if (membresiaActiva?.rol_id === rolId) {
      setMembresiaActiva(prev => prev ? {
        ...prev,
        permisos_rows: payload.map(row => ({ ...row, rol_id: rolId })),
      } : prev);
    }
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
    const puedeListarRoles = Boolean(
      membresiaActiva?.rol?.es_admin_empresa ||
      membresiaActiva?.rol?.es_superadmin ||
      (membresiaActiva?.permisos_rows || []).some(p => p.pantalla === 'roles' && p.puede_ver)
    );
    if (!puedeListarRoles) return;
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
    const banderasTecnicas = esSuperadminPlataforma ? {
      es_admin_empresa: Boolean(rolData.es_admin_empresa),
      es_superadmin: Boolean(rolData.es_superadmin && empresa?.id === 'emp_tideo' && empresa?.es_plataforma),
    } : {};
    setRolesCtx(prev => ({ ...prev, [newId]: { nombre: rolData.nombre, descripcion: rolData.descripcion || '', categoria: rolData.categoria || 'otro', nivel_jerarquico: rolData.nivel_jerarquico || 'operativo', color: 'blue', permisos: { ver: [] }, ...banderasTecnicas } }));
    if (isSupabaseConfigured() && empresa?.id) {
      try {
        await rolesService.crearRol({
          id: newId,
          empresa_id: empresa.id,
          nombre: rolData.nombre,
          descripcion: rolData.descripcion || '',
          categoria: rolData.categoria || 'otro',
          nivel_jerarquico: rolData.nivel_jerarquico || 'operativo',
          ...banderasTecnicas,
          activo: true,
        });
        await rolesService.actualizarPermisos(newId, buildPermisosPayload({ ver: [] }));
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
    const rolPrevio = rolesCtx[rolId];
    setRolesCtx(prev => { const next = { ...prev }; delete next[rolId]; return next; });
    if (isSupabaseConfigured()) {
      try {
        await rolesService.eliminarRol(rolId);
      } catch (error) {
        setRolesCtx(prev => ({ ...prev, [rolId]: rolPrevio }));
        const message = `No se pudo eliminar el rol en Supabase: ${error.message}`;
        addNotificacion(message, 'error');
        setAccessDebug(prev => ({ ...prev, rolesError: message }));
        try { window.alert(message); } catch {}
        return false;
      }
    }
    addNotificacion('Rol eliminado.');
    return true;
  };

  const editarRol = (rolId, datos) => {
    const rolActual = rolesCtx[rolId];
    const intentaEditarAccesoTecnico = (
      Object.prototype.hasOwnProperty.call(datos, 'es_admin_empresa')
      || Object.prototype.hasOwnProperty.call(datos, 'es_superadmin')
    );
    let datosActualizados = datos;

    if (intentaEditarAccesoTecnico) {
      const { es_admin_empresa, es_superadmin, ...datosSinAccesoTecnico } = datos;
      if (!esSuperadminPlataforma) {
        datosActualizados = datosSinAccesoTecnico;
      } else {
        const empresaDelRolId = rolActual?.empresa_id || empresa?.id;
        const empresaDelRol = empresaDelRolId === empresa?.id
          ? empresa
          : (empresasPlataforma || []).find(item => item.id === empresaDelRolId);
        const puedeSerSuperadmin = Boolean(
          empresaDelRol?.id === 'emp_tideo' && empresaDelRol?.es_plataforma
        );
        datosActualizados = {
          ...datosSinAccesoTecnico,
          ...(Object.prototype.hasOwnProperty.call(datos, 'es_admin_empresa')
            ? { es_admin_empresa: Boolean(es_admin_empresa) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(datos, 'es_superadmin')
            ? { es_superadmin: Boolean(es_superadmin && puedeSerSuperadmin) }
            : {}),
        };
      }
    }

    setRolesCtx(prev => ({ ...prev, [rolId]: { ...prev[rolId], ...datosActualizados } }));
    if (isSupabaseConfigured()) {
      rolesService.actualizarRol(rolId, datosActualizados).catch(error => {
        addNotificacion(`No se pudo actualizar el rol en Supabase: ${error.message}`, 'error');
      });
    }
  };

  const monedasActivas = (() => {
    const list = (monedasImpuestosUnidades || []).filter(m => m.tipo === 'moneda' && m.estado === 'activo');
    const source = list.length ? list : [{ codigo: empresa?.moneda || empresa?.moneda_base || 'PEN', nombre: 'Moneda base' }];
    return source.map(m => ({ ...m, codigo: String(m.codigo || 'PEN').trim().toUpperCase() }));
  })();

  const usuarioActual = authUser
    ? usuarios.find(u => u.id === authUser.id || u.email === authUser.email)
    : null;
  const esSuperadminPlataforma = Boolean(
    isSupabaseConfigured()
      ? todasMembresias.some(m => m.rol?.es_superadmin && m.empresa?.es_plataforma)
      : role?.permisos?.todo
  );
  const actualizarVacanteReclutamientoCtx = async (vacanteId, cambios) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await reclutamientoService.actualizarVacante(vacanteId, cambios);
      setReclutamientoVacantes(prev => prev.map(v => v.id === vacanteId ? data : v));
      return data;
    }
    let data;
    setReclutamientoVacantes(prev => prev.map(v => {
      if (v.id === vacanteId) {
        data = { ...v, ...cambios };
        return data;
      }
      return v;
    }));
    return data;
  };
  const crearVacanteReclutamientoCtx = async (payload) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await reclutamientoService.crearVacante(empresa.id, payload);
      setReclutamientoVacantes(prev => [data, ...prev]);
      return data;
    }
    const nuevo = {
      ...payload,
      id: generateId('vac'),
      empresa_id: empresa?.id || 'emp_001',
      posiciones: Number(payload.posiciones || 1),
      posiciones_cubiertas: 0,
      estado: 'abierta',
      public_token: `postula_${Date.now()}`,
      fecha_apertura: payload.fecha_apertura || new Date().toISOString().slice(0, 10),
    };
    setReclutamientoVacantes(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const crearCandidaturaReclutamientoCtx = async (payload) => {
    const empresaId = empresa?.id || 'emp_001';
    const alerta = payload.alerta_historial || null;
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await reclutamientoService.crearCandidatoYCandidatura(empresa.id, { ...payload, alerta_historial: alerta });
      setReclutamientoCandidaturas(prev => [data, ...prev]);
      return data;
    }
    const candidatoId = payload.candidato_id || generateId('cand');
    const nuevo = {
      id: generateId('candit'),
      empresa_id: empresaId,
      vacante_id: payload.vacante_id,
      candidato_id: candidatoId,
      etapa: payload.etapa || 'postulado',
      fuente: payload.fuente || 'interno',
      notas_evaluacion: payload.notas_evaluacion || '',
      candidato: {
        id: candidatoId,
        empresa_id: empresaId,
        nombre: payload.nombre,
        dni: payload.dni,
        telefono: payload.telefono || '',
        email: payload.email || '',
        cv_url: payload.cv_url || '#',
        alerta_historial: alerta || {},
      },
      historial: [{ etapa_hasta: payload.etapa || 'postulado', fecha: new Date().toISOString(), usuario: authUser?.email || 'Demo' }],
    };
    setReclutamientoCandidaturas(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const moverCandidaturaReclutamientoCtx = async (candidaturaId, etapa, params = {}) => {
    if (isSupabaseConfigured()) {
      const data = await reclutamientoService.moverCandidatura(candidaturaId, etapa, params);
      setReclutamientoCandidaturas(prev => prev.map(c => {
        if (c.id !== candidaturaId) return c;
        return {
          ...c,
          ...data,
          historial: [
            ...(c.historial || []),
            {
              etapa_desde: c.etapa,
              etapa_hasta: etapa,
              motivo: params.descarte_motivo || params.motivo || '',
              notas: params.notas_evaluacion || params.motivo || '',
              fecha: new Date().toISOString(),
              usuario_id: authUser?.id || null,
              usuario: authUser?.email || 'Sistema'
            }
          ]
        };
      }));
      if (etapa === 'contratado') {
        setReclutamientoVacantes(prev => prev.map(v => v.id === data.vacante_id ? { ...v, posiciones_cubiertas: Math.min(Number(v.posiciones || 1), Number(v.posiciones_cubiertas || 0) + 1), estado: Number(v.posiciones_cubiertas || 0) + 1 >= Number(v.posiciones || 1) ? 'cerrada' : v.estado } : v));
      }
      return data;
    }
    if (etapa === 'descartado' && !String(params.descarte_motivo || '').trim()) throw new Error('El descarte requiere motivo.');
    let actualizado = null;
    setReclutamientoCandidaturas(prev => prev.map(c => {
      if (c.id !== candidaturaId) return c;
      actualizado = {
        ...c,
        etapa,
        descarte_motivo: etapa === 'descartado' ? params.descarte_motivo : c.descarte_motivo,
        notas_evaluacion: params.notas_evaluacion ?? c.notas_evaluacion,
        personal_id: params.personal_id || c.personal_id,
        personal_tipo: params.personal_tipo || c.personal_tipo,
        historial: [...(c.historial || []), { etapa_desde: c.etapa, etapa_hasta: etapa, motivo: params.descarte_motivo || params.motivo || '', fecha: new Date().toISOString(), usuario: authUser?.email || 'Demo' }],
      };
      return actualizado;
    }));
    if (etapa === 'contratado' && actualizado?.vacante_id) {
      setReclutamientoVacantes(prev => prev.map(v => v.id === actualizado.vacante_id ? { ...v, posiciones_cubiertas: Math.min(Number(v.posiciones || 1), Number(v.posiciones_cubiertas || 0) + 1), estado: Number(v.posiciones_cubiertas || 0) + 1 >= Number(v.posiciones || 1) ? 'cerrada' : v.estado } : v));
    }
    return actualizado;
  };

  const invitarCandidatoReclutamientoCtx = async (candidato, vacanteId) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await reclutamientoService.invitarCandidato(empresa.id, candidato.id || candidato.candidato_id, vacanteId);
      setReclutamientoCandidaturas(prev => [data, ...prev]);
      return data;
    }
    return crearCandidaturaReclutamientoCtx({
      vacante_id: vacanteId,
      candidato_id: candidato.id || candidato.candidato_id,
      nombre: candidato.nombre,
      dni: candidato.dni,
      telefono: candidato.telefono,
      email: candidato.email,
      fuente: 'banco_talentos',
      alerta_historial: candidato.alerta_historial,
    });
  };

  const aplicarCambioDatosPortal = async (row) => {
    const cambios = row?.valor_propuesto || {};
    if (!row?.personal_id || !Object.keys(cambios).length) return;
    if (isSupabaseConfigured() && empresa?.id) {
      if (row.personal_tipo === 'administrativo') {
        const data = await rrhhService.actualizarPersonalAdmin(row.personal_id, cambios);
        setPersonalAdmin(prev => prev.map(p => p.id === row.personal_id ? data : p));
      } else {
        const data = await rrhhService.actualizarPersonalOperativo(row.personal_id, cambios);
        setPersonalOperativo(prev => prev.map(p => p.id === row.personal_id ? data : p));
      }
      return;
    }
    const patch = { ...cambios, updated_at: new Date().toISOString() };
    if (row.personal_tipo === 'administrativo') {
      setPersonalAdmin(prev => prev.map(p => p.id === row.personal_id ? { ...p, ...patch } : p));
    } else {
      setPersonalOperativo(prev => prev.map(p => p.id === row.personal_id ? { ...p, ...patch } : p));
    }
  };

  const crearSolicitudDatosPortalCtx = async (payload) => {
    const base = {
      ...payload,
      empresa_id: empresa?.id || payload.empresa_id || 'emp_001',
      estado: 'pendiente',
      solicitado_por: authUser?.id || null,
      created_at: new Date().toISOString(),
    };
    const data = isSupabaseConfigured() && empresa?.id
      ? await portalFase2Service.crearSolicitudDatos(empresa.id, base)
      : { ...base, id: generateId('pds') };
    setPortalDatosSolicitudes(prev => [data, ...prev]);
    addNotificacion('Solicitud de actualizacion enviada a RRHH.');
    return data;
  };

  const resolverSolicitudDatosPortalCtx = async (solicitudId, decision, comentario = '') => {
    const row = portalDatosSolicitudes.find(s => s.id === solicitudId);
    if (!row) throw new Error('Solicitud no encontrada.');
    const patch = {
      estado: decision,
      comentario_resolucion: comentario || null,
      resuelto_por: authUser?.id || null,
      resuelto_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const data = isSupabaseConfigured()
      ? await portalFase2Service.resolverSolicitudDatos(solicitudId, patch)
      : { ...row, ...patch };
    if (decision === 'aprobado') await aplicarCambioDatosPortal(data);
    setPortalDatosSolicitudes(prev => prev.map(s => s.id === solicitudId ? data : s));
    addNotificacion(decision === 'aprobado' ? 'Cambio de datos aprobado y aplicado.' : 'Solicitud de datos rechazada.');
    return data;
  };

  const crearConstanciaPortalCtx = async (payload) => {
    const emitidaDirecta = Boolean(empresaConfig?.portal_constancia_emision_directa);
    const emitidaEn = emitidaDirecta ? new Date().toISOString() : null;
    const sociedadId = emitidaDirecta
      ? (isSupabaseConfigured() && empresa?.id
          ? await portalFase2Service.resolverSociedadConstancia(
              empresa.id,
              payload.personal_id,
              emitidaEn.slice(0, 10),
            )
          : resolverSociedadDocumentoLaboral({
              multisociedadHabilitado: empresa?.multisociedad_habilitado,
              documentos: personalDocumentos,
              tiposDocumento,
              sociedades: sociedadesDisponibles,
              personalId: payload.personal_id,
              fecha: emitidaEn.slice(0, 10),
            }))
      : null;
    const sociedad = sociedadId
      ? sociedadesDisponibles.find(item => item.id === sociedadId) || null
      : null;
    const emisor = sociedadId
      ? resolverIdentidadEmisora({
          empresaConfig,
          sociedad,
          multisociedadHabilitado: empresa?.multisociedad_habilitado,
        })
      : null;
    const html = emitidaDirecta ? plantillaConstanciaHtml({ empresa, emisor, ficha: payload.ficha, proposito: payload.proposito, emitidaEn }) : null;
    const documentoHash = html ? await sha256Text(html) : null;
    const base = {
      empresa_id: empresa?.id || payload.empresa_id || 'emp_001',
      personal_id: payload.personal_id,
      personal_tipo: payload.personal_tipo,
      sociedad_id: sociedadId,
      proposito: payload.proposito || '',
      estado: emitidaDirecta ? 'emitida' : 'solicitada',
      plantilla_html: html,
      documento_hash: documentoHash,
      solicitado_por: authUser?.id || null,
      created_at: new Date().toISOString(),
      emitida_en: emitidaEn,
    };
    const data = isSupabaseConfigured() && empresa?.id
      ? await portalFase2Service.crearConstancia(empresa.id, base)
      : { ...base, id: generateId('pct') };
    setPortalConstanciasTrabajo(prev => [data, ...prev]);
    addNotificacion(emitidaDirecta ? 'Constancia emitida.' : 'Constancia solicitada para aprobacion de RRHH.');
    return data;
  };

  const resolverConstanciaPortalCtx = async (constanciaId, decision, comentario = '') => {
    const row = portalConstanciasTrabajo.find(c => c.id === constanciaId);
    if (!row) throw new Error('Constancia no encontrada.');
    const ficha = [...personalOperativo, ...personalAdmin].find(p => p.id === row.personal_id) || {};
    const emitida = decision === 'emitida' || decision === 'aprobada';
    const emitidaEn = emitida ? new Date().toISOString() : null;
    const sociedadId = emitida
      ? (isSupabaseConfigured() && empresa?.id
          ? await portalFase2Service.resolverSociedadConstancia(
              empresa.id,
              row.personal_id,
              emitidaEn.slice(0, 10),
            )
          : resolverSociedadDocumentoLaboral({
              multisociedadHabilitado: empresa?.multisociedad_habilitado,
              documentos: personalDocumentos,
              tiposDocumento,
              sociedades: sociedadesDisponibles,
              personalId: row.personal_id,
              fecha: emitidaEn.slice(0, 10),
            }))
      : (row.sociedad_id || null);
    const sociedad = sociedadId
      ? sociedadesDisponibles.find(item => item.id === sociedadId) || null
      : null;
    const emisor = sociedadId
      ? resolverIdentidadEmisora({
          empresaConfig,
          sociedad,
          multisociedadHabilitado: empresa?.multisociedad_habilitado,
        })
      : null;
    const html = emitida ? plantillaConstanciaHtml({ empresa, emisor, ficha, proposito: row.proposito, emitidaEn }) : row.plantilla_html;
    const patch = {
      estado: emitida ? 'emitida' : 'rechazada',
      comentario_resolucion: comentario || null,
      resuelto_por: authUser?.id || null,
      resuelto_en: new Date().toISOString(),
      emitida_en: emitidaEn,
      sociedad_id: sociedadId,
      plantilla_html: html,
      documento_hash: emitida ? await sha256Text(html) : row.documento_hash,
    };
    const data = isSupabaseConfigured()
      ? await portalFase2Service.resolverConstancia(constanciaId, patch)
      : { ...row, ...patch };
    setPortalConstanciasTrabajo(prev => prev.map(c => c.id === constanciaId ? data : c));
    addNotificacion(emitida ? 'Constancia aprobada y emitida.' : 'Constancia rechazada.');
    return data;
  };

  const registrarVisualizacionBoletaPortalCtx = async (payload) => {
    const hash = payload.documento_hash || await sha256Text(payload.detalle || payload);
    const base = {
      ...payload,
      empresa_id: empresa?.id || payload.empresa_id || 'emp_001',
      usuario_id: authUser?.id || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      documento_hash: hash,
      created_at: new Date().toISOString(),
    };
    const data = isSupabaseConfigured() && empresa?.id
      ? await portalFase2Service.registrarVisualizacionBoleta(empresa.id, base)
      : { ...base, id: generateId('pbv') };
    setPortalBoletaVisualizaciones(prev => [data, ...prev]);
    return data;
  };

  const registrarAcuseBoletaPortalCtx = async (payload) => {
    const hash = payload.documento_hash || await sha256Text(payload.detalle || payload);
    const base = {
      ...payload,
      empresa_id: empresa?.id || payload.empresa_id || 'emp_001',
      usuario_id: authUser?.id || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      documento_hash: hash,
      metadata: { ...(payload.metadata || {}), disclaimer: 'acuse_no_implica_aceptacion_contenido' },
      created_at: new Date().toISOString(),
    };
    const data = isSupabaseConfigured() && empresa?.id
      ? await portalFase2Service.registrarAcuseBoleta(empresa.id, base)
      : { ...base, id: generateId('pba') };
    setPortalBoletaAcuses(prev => [data, ...prev]);
    addNotificacion('Acuse de boleta registrado con evidencia.');
    return data;
  };

  const iniciarOtpFirmaPortalCtx = async (payload) => {
    const destino = payload.destino || '';
    const base = {
      ...payload,
      empresa_id: empresa?.id || payload.empresa_id || 'emp_001',
      destino_mask: destino ? destino.replace(/^(.{2}).+(@.+|.{2})$/, '$1***$2') : null,
      estado: 'enviado',
      created_at: new Date().toISOString(),
    };
    const data = isSupabaseConfigured() && empresa?.id
      ? await portalFase2Service.crearOtpFirma(empresa.id, base)
      : { ...base, id: generateId('pfo'), codigo_mock: '123456' };
    setPortalFirmaOtpIntentos(prev => [data, ...prev]);
    addNotificacion('OTP de firma enviado al canal personal.');
    return data;
  };

  const validarOtpFirmaPortalCtx = async (otpId, codigo, payload = {}) => {
    const otp = portalFirmaOtpIntentos.find(o => o.id === otpId);
    if (!otp) throw new Error('OTP no encontrado.');
    if (String(codigo || '').trim().length < 4) throw new Error('Codigo OTP invalido.');
    const now = new Date().toISOString();
    const validado = { ...otp, estado: 'validado', evidencia: { ...(otp.evidencia || {}), validado_en: now } };
    setPortalFirmaOtpIntentos(prev => prev.map(o => o.id === otpId ? validado : o));
    const hashOriginal = await sha256Text(payload.contrato || payload);
    const registro = {
      empresa_id: empresa?.id || otp.empresa_id,
      contrato_documento_id: payload.contrato_documento_id || null,
      personal_id: otp.personal_id,
      personal_tipo: otp.personal_tipo,
      usuario_id: authUser?.id || null,
      otp_intento_id: otpId,
      canal_otp: otp.canal,
      rubrica_url: payload.rubrica_url || null,
      autorizacion_documento_id: payload.autorizacion_documento_id || null,
      hash_original: hashOriginal,
      hash_firmado: await sha256Text(`${hashOriginal}:${otpId}:${now}`),
      tsa_url: empresaConfig?.portal_firma_tsa_url || null,
      tsa_estado: empresaConfig?.portal_firma_tsa_url ? 'pendiente' : 'no_configurado',
      evidencia: { user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null, validado_en: now },
      created_at: now,
    };
    const data = isSupabaseConfigured() && empresa?.id
      ? await portalFase2Service.registrarFirmaContrato(empresa.id, registro)
      : { ...registro, id: generateId('pcf') };
    setPortalFirmaRegistros(prev => [data, ...prev]);
    addNotificacion('Firma electronica registrada con evidencia.');
    return data;
  };

  const guardarOnboardingFirmaPortalCtx = async (ficha, payload) => {
    if (!ficha?.id) throw new Error('Ficha no encontrada.');
    const cambios = {
      telefono_personal: payload.telefono_personal || ficha.telefono_personal || ficha.telefono || '',
      email_personal: payload.email_personal || ficha.email_personal || ficha.email || '',
      celular_personal: payload.celular_personal || payload.telefono_personal || ficha.celular_personal || ficha.telefono_personal || ficha.telefono || '',
      consentimiento_entrega_electronica: Boolean(payload.consentimiento_entrega_electronica),
      consentimiento_entrega_electronica_en: payload.consentimiento_entrega_electronica ? new Date().toISOString() : ficha.consentimiento_entrega_electronica_en || null,
      firma_rubrica_url: payload.firma_rubrica_url || ficha.firma_rubrica_url || null,
      firma_rubrica_path: payload.firma_rubrica_path || ficha.firma_rubrica_path || null,
      firma_otp_canal: payload.firma_otp_canal || empresaConfig?.portal_firma_otp_canal_default || 'email_personal',
      firma_otp_verificado_en: payload.firma_otp_verificado_en || ficha.firma_otp_verificado_en || null,
      firma_autorizacion_doc_id: payload.firma_autorizacion_doc_id || ficha.firma_autorizacion_doc_id || null,
      firma_onboarding_completo: Boolean(payload.firma_onboarding_completo),
    };
    if (ficha.personal_tipo === 'administrativo') {
      if (isSupabaseConfigured()) {
        const data = await rrhhService.actualizarPersonalAdmin(ficha.id, cambios);
        setPersonalAdmin(prev => prev.map(p => p.id === ficha.id ? data : p));
        return data;
      }
      setPersonalAdmin(prev => prev.map(p => p.id === ficha.id ? { ...p, ...cambios } : p));
    } else {
      if (isSupabaseConfigured()) {
        const data = await rrhhService.actualizarPersonalOperativo(ficha.id, cambios);
        setPersonalOperativo(prev => prev.map(p => p.id === ficha.id ? data : p));
        return data;
      }
      setPersonalOperativo(prev => prev.map(p => p.id === ficha.id ? { ...p, ...cambios } : p));
    }
    addNotificacion('Configuracion de firma actualizada.');
    return { ...ficha, ...cambios };
  };

  const guardarPerfilBiometricoCtx = async (perfil) => {
    const data = await biometricoService.guardarPerfil(empresa?.id || perfil.empresa_id || 'emp_001', perfil);
    setBiometricoPerfiles(prev => data.id && prev.some(p => p.id === data.id)
      ? prev.map(p => p.id === data.id ? data : p)
      : [data, ...prev]
    );
    addNotificacion('Perfil biometrico guardado.');
    return data;
  };

  const registrarLoteBiometricoCtx = async (lote) => {
    const data = await biometricoService.crearLote(empresa?.id || lote.empresa_id || 'emp_001', lote);
    setBiometricoLotes(prev => [data, ...prev]);
    return data;
  };

  const anularLoteBiometricoCtx = async (loteId, motivo) => {
    const data = await biometricoService.anularLote(loteId, motivo);
    setBiometricoLotes(prev => prev.map(l => l.id === loteId ? { ...l, ...data, estado: 'anulado', motivo_anulacion: motivo, anulado_en: data.anulado_en || new Date().toISOString() } : l));
    setRegistrosAsistencia(prev => prev.map(r => r.importacion_biometrica_lote_id === loteId
      ? { ...r, estado: 'anulado', anulado_por_lote_id: loteId, motivo_anulacion: motivo, anulado_en: new Date().toISOString() }
      : r
    ));
    addNotificacion('Lote biometrico anulado y registros revertidos.');
    return data;
  };

  const guardarWhatsappPlantillaCtx = async (plantilla) => {
    const data = await whatsappService.guardarPlantilla(empresa?.id || plantilla.empresa_id || 'emp_001', plantilla);
    setWhatsappPlantillas(prev => data.id && prev.some(t => t.id === data.id) ? prev.map(t => t.id === data.id ? data : t) : [data, ...prev]);
    addNotificacion('Plantilla WhatsApp guardada.');
    return data;
  };

  const guardarWhatsappRutaCtx = async (ruta) => {
    const data = await whatsappService.guardarRuta(empresa?.id || ruta.empresa_id || 'emp_001', ruta);
    setWhatsappMatriz(prev => data.id && prev.some(r => r.id === data.id) ? prev.map(r => r.id === data.id ? data : r) : [data, ...prev]);
    addNotificacion('Matriz WhatsApp actualizada.');
    return data;
  };

  const registrarWhatsappSimuladoCtx = async (envio) => {
    const data = await whatsappService.encolarSimulado(empresa?.id || envio.empresa_id || 'emp_001', envio);
    setWhatsappEnvios(prev => [data, ...prev]);
    return data;
  };

  const guardarGeocercaCtx = async (geocerca) => {
    const data = await geofencingService.guardarGeocerca(empresa?.id || geocerca.empresa_id || 'emp_001', geocerca);
    setGeocercas(prev => data.id && prev.some(g => g.id === data.id) ? prev.map(g => g.id === data.id ? data : g) : [data, ...prev]);
    addNotificacion('Geocerca guardada.');
    return data;
  };

  const eliminarGeocercaCtx = async (id) => {
    if (isSupabaseConfigured()) {
      await geofencingService.eliminarGeocerca(id);
    }
    setGeocercas(prev => prev.filter(g => g.id !== id));
    setGeocercaAsignaciones(prev => prev.filter(a => a.geocerca_id !== id));
    addNotificacion('Geocerca eliminada.');
  };

  const guardarGeocercaAsignacionCtx = async (asignacion) => {
    const data = await geofencingService.guardarAsignacion(empresa?.id || asignacion.empresa_id || 'emp_001', asignacion);
    setGeocercaAsignaciones(prev => data.id && prev.some(a => a.id === data.id) ? prev.map(a => a.id === data.id ? data : a) : [data, ...prev]);
    addNotificacion('Asignacion de geocerca actualizada.');
    return data;
  };

  const registrarConsentimientoUbicacionCtx = async (payload) => {
    const data = await geofencingService.registrarConsentimiento(empresa?.id || payload.empresa_id || 'emp_001', payload);
    setUbicacionConsentimientos(prev => data.id && prev.some(c => c.id === data.id) ? prev.map(c => c.id === data.id ? data : c) : [data, ...prev]);
    addNotificacion('Consentimiento de ubicacion registrado.');
    return data;
  };

  const evaluarSarNoLlegadaCtx = async (fecha) => {
    const total = await geofencingService.evaluarSar(empresa?.id || 'emp_001', fecha);
    addNotificacion(`SAR evaluado: ${total} alerta(s) generadas.`);
    return total;
  };

  const authUserConAcceso = authUser ? {
    ...authUser,
    ...usuarioActual,
    id: authUser.id,
    email: authUser.email,
    nombre: usuarioActual?.nombre || authUser.user_metadata?.nombre || authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
    rol: usuarioActual?.rol || membresiaActiva?.rol_id || authUser.rol,
    empresa_id: empresa?.id || usuarioActual?.empresa_id,
    asignaciones: usuarioActual?.asignaciones || [],
    posiciones: usuarioActual?.posiciones || [],
    jefe_user_id: usuarioActual?.jefe_user_id || null,
    nivel_jerarquico: usuarioActual?.nivel_jerarquico || membresiaActiva?.rol?.nivel_jerarquico || (esSuperadminPlataforma ? 'direccion' : undefined),
    rol_categoria: usuarioActual?.rol_categoria || membresiaActiva?.rol?.categoria || (esSuperadminPlataforma ? 'admin' : undefined),
    es_admin_empresa: Boolean(usuarioActual?.es_admin_empresa || membresiaActiva?.rol?.es_admin_empresa),
    es_superadmin: Boolean(usuarioActual?.es_superadmin || membresiaActiva?.rol?.es_superadmin || esSuperadminPlataforma),
    superadmin_plataforma: esSuperadminPlataforma,
  } : null;

  const contextValue = {
    isDataLoaded,
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
    perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles, seleccionarSociedad, recargarSociedades,
    empresasPlataforma, setEmpresasPlataforma, crearTenantConAdmin, actualizarTenant, eliminarTenant,
    // Data
    usuarios, setUsuarios,
    posiciones, posicionesUsuarios, unidadesOrganizacionales,
    roles: rolesCtx, clonarRol, actualizarPermisosRol, guardarPermisosRol, crearRol, eliminarRol, editarRol, accessDebug,
    leads, setLeads, updateLeadState, historialEstados,
    campanas, setCampanas, crearCampana, actualizarCampana, cambiarEstadoCampana, eliminarCampana,
    cuentas, setCuentas, actualizarCuenta, eliminarCuenta, actualizarLogoCuenta,
    contactos, setContactos, crearContactoCuenta, actualizarContactoCuenta,
    oportunidades, setOportunidades, oppHistorialEtapas,
    actividades, setActividades,
    agendaEventos, setAgendaEventos, crearAgendaEvento, actualizarAgendaEvento,
    hojasCosteo, setHojasCosteo, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo,
    cotizaciones, setCotizaciones, actualizarCotizacion,
    osClientes, setOsClientes, actualizarOSCliente,
    cxp, setCxp,
    cxpPagos, setCxpPagos,
    cajaChica, setCajaChica, registrarEgresoCajaChica,
    cxc, setCxc,
    cobrosHistorial, setCobrosHistorial,
    gestionesCobranza, setGestionesCobranza,
    comisiones, setComisiones,
    facturas, setFacturas,
    comprasGastos, setComprasGastos,
    presupuestos, setPresupuestos,
    presupuestoPartidas, setPresupuestoPartidas,
    presupuestoAprobaciones, setPresupuestoAprobaciones,
    crearPresupuesto, actualizarPresupuestoCtx, enviarPresupuestoAAprobacion, procesarAprobacionPresupuesto,
    financiamientos, setFinanciamientos,
    movimientosTesoreria, setMovimientosTesoreria,
    movimientosBanco, setMovimientosBanco,
    // Fase 2 Data
    ots, setOts,
    partes, setPartes,
    backlog, setBacklog,
    cierresTecnicos,
    inventario, setInventario,
    inventarioConteos, setInventarioConteos,
    solpes, setSolpes,
    valorizaciones, setValorizaciones,
    proveedores, setProveedores,
    evaluacionesProveedor, setEvaluacionesProveedor,
    procesosCompra, setProcesosCompra,
    respuestasCompra, setRespuestasCompra,
    ordenesCompra, setOrdenesCompra,
    ocTransitos, setOcTransitos,
    ordenesServicio, setOrdenesServicio,
    recepciones, setRecepciones,
    entradasOcPendientes, setEntradasOcPendientes,
    devolucionesProveedor, setDevolucionesProveedor,
    crearDevolucionCtx, enviarDevolucionCtx, aceptarDevolucionCtx,
    registrarNCDevolucionCtx, anularDevolucionCtx,
    ocAnticipos, setOcAnticipos, registrarAnticipoOC,

    // Maestros Base Data
    areasEmpresa, setAreasEmpresa,
    crearUnidadOrganizacional, actualizarUnidadOrganizacional, eliminarUnidadOrganizacional, reasignarUnidadDePosicion,
    crearPosicion, archivarPosicion, eliminarPosicion, reasignarCargoDePosicion, reasignarPadreDePosicion,
    cargos, setCargos, actualizarCargo, eliminarCargo, fusionarCargos,
    tiposContrato, setTiposContrato, crearTipoContrato, actualizarTipoContrato, eliminarTipoContrato,
    tiposDocumento, setTiposDocumento, crearTipoDocumento, actualizarTipoDocumento, importarPlantillaTiposDoc,
    requisitosCargo, setRequisitosCargo, upsertRequisitoCargo, eliminarRequisitoCargo,
    especialidades, setEspecialidades, actualizarEspecialidad, eliminarEspecialidad,
    nivelesJerarquicos, setNivelesJerarquicos, crearNivelJerarquico, actualizarNivelJerarquico, eliminarNivelJerarquico,
    tiposServicio, setTiposServicio, actualizarTipoServicio, eliminarTipoServicio,
    almacenes, setAlmacenes, actualizarAlmacen, eliminarAlmacen,
    sedes, setSedes, actualizarSede, eliminarSede,
    industrias, setIndustrias, actualizarIndustria, eliminarIndustria,
    monedasImpuestosUnidades, setMonedasImpuestosUnidades, monedasActivas,
    crearMonedaImpuestoUnidad, actualizarMonedaImpuestoUnidad, eliminarMonedaImpuestoUnidad,
    centrosCosto, setCentrosCosto, crearCentroCosto, actualizarCentroCosto, eliminarCentroCosto, importarCentrosCosto,
    centrosBeneficio, setCentrosBeneficio, crearCentroBeneficio, actualizarCentroBeneficio, eliminarCentroBeneficio, importarCentrosBeneficio,
    materialGrupos, materialFamilias, materialSubfamilias, materiales, setMateriales,
    fabricantes, setFabricantes, crearFabricanteCtx, actualizarFabricanteCtx,
    crearMatGrupo, actualizarMatGrupo, eliminarMatGrupo,
    crearMatFamilia, actualizarMatFamilia, eliminarMatFamilia,
    crearMatSubfamilia, actualizarMatSubfamilia, eliminarMatSubfamilia,
    crearMaterialCtx, actualizarMaterialCtx, eliminarMaterialCtx, recargarMateriales,
    activos, setActivos, crearActivoCtx, actualizarActivoCtx, bajaActivoCtx, importarActivosCtx, recargarActivos,
    // Transporte y Guías
    guiasRemision, setGuiasRemision, crearGuiaCtx, actualizarGuiaCtx, emitirGuiaCtx, marcarEnTransitoCtx, confirmarEntregaCtx, anularGuiaCtx, recargarGuias,
    transportistas, setTransportistas, crearTransportistaCtx, actualizarTransportistaCtx, crearVehiculoCtx, crearConductorCtx,
    ordenesVenta, setOrdenesVenta, crearOVCtx, actualizarOVCtx, confirmarOVCtx, anularOVCtx, recargarOrdenesVenta,
    catalogoVenta, setCatalogoVenta, crearProductoCatalogoCtx,

    // Actions
    crearLead, actualizarLeadDatos, eliminarLead, crearCuenta,
    convertirLead, descartarLead, reactivarLead,
    crearOportunidad, actualizarEtapaOportunidad, marcarGanada, marcarPerdida,
    probabilidadPorEtapaOpp, forecastPorEtapaOpp,
    actualizarAcuerdoComision, enviarAcuerdoAAprobacion, retirarAcuerdoComision, aprobarAcuerdoComision, rechazarAcuerdoComision, obtenerHistorialAcuerdo,
    crearCotizacion, aprobarCotizacion, aprobarCotizacionInterna, registrarAprobacionManual, subirVersionCotizacion,
    crearOSCliente, crearOSClienteManual, vincularCotizacionOS, eliminarOSCliente,
    registrarUsuario,
    eliminarUsuario,
    actualizarUsuarioAcceso,
    reasignarRolUsuario,
    crearUsuarioConAcceso,
    obtenerRolSugeridoPorPosicion,
    asignarPasswordTemporal,
    marcarContrasenaActualizada,
    registrarActividad,
    actualizarActividad,
    // Fase 2 Actions
    convertirBacklogAOT, crearOT, crearOTDesdeOS, actualizarOT, eliminarOT, registrarParteDiario, actualizarBorradorParteDiario, aprobarParteDiario, observarParteDiario, rechazarParteDiario, reabrirParteDiario, enviarParteARevision, recalcularCostoRealOT, calcularCostoRealOT: svcCalcularCostoRealOT, calcularCostosComprometidosOT: svcCalcularCostosComprometidosOT, calcularCostosOS: svcCalcularCostosOS, cerrarTecnicamenteOT, actualizarCierreTecnico, crearSOLPE, enviarSOLPE, atenderSOLPE, crearGasto, generarValorizacion, aprobarValorizacion, anularValorizacion, actualizarDatosValorizacion,
    crearTareaOT, completarTareaOT, reabrirTareaOT, actualizarAvanceSupervisorOT,
    // Finanzas Actions
    emitirFactura, emitirFacturaConCxC, emitirFacturaDesdeValorizacion, actualizarFechaEmisionFactura, actualizarDatosFactura, subirArchivoFactura, eliminarArchivoFactura, anularFactura, restaurarFacturaPorError, revertirCobroCxC, emitirNotaCredito, emitirNotaDebito, generarCxC, actualizarVencimientoCxC, registrarCobroCxC, condonarMoraCxC, restaurarMoraCxC, reconciliarComisionesPendientes, registrarGestionCobranza, generarCxP, registrarPagoCxP, conciliarMovimientoBanco, conciliarMovimientoBancoConDocumento, deshacerConciliacionBanco, asignarCuentaMovimientoTesoreria, registrarMovimientoManual,
    cuentasBancarias, setCuentasBancarias, crearCuentaBancaria, actualizarCuentaBancaria, eliminarCuentaBancaria,
    recibosHonorarios, setRecibosHonorarios,
    aprobarComision, rechazarComision, corregirMontoComision, corregirBonificacionComision, generarReciboHonorarios, confirmarReciboHonorarios,
    // Maestros Base Actions
    crearCargo, crearEspecialidad, crearTipoServicio, crearAlmacen, crearSede, crearIndustria,
    // Compras Actions
    registrarProveedor, actualizarProveedorCtx, eliminarProveedorCtx,
    crearProcesoCompraCtx, actualizarProcesoCompraCtx,
    crearOrdenCompraCtx, actualizarOrdenCompraCtx, registrarTransitoOCCtx, crearOrdenServicioCtx, crearRecepcionCtx, registrarRecepcionConCxP, registrarEvaluacionProveedorCtx,
    // WMS Actions
    recargarInventario, recargarEntradasOcPendientes, registrarEntradaManualCtx, registrarTransferenciaCtx, registrarAjusteCtx,
    reservarStockCtx, getKardexMaterialCtx, iniciarConteoCtx, guardarAvanceConteoCtx, cerrarConteoCtx, recargarConteosInventarioCtx, getAnaliticaInventarioCtx,
    // Fase 3 Data
    personalOperativo, setPersonalOperativo,
    personalAdmin, setPersonalAdmin,
    vacacionesSolicitudes, setVacacionesSolicitudes,
    licencias, setLicencias,
    solicitudesRRHH, setSolicitudesRRHH,
    personalDocumentos, setPersonalDocumentos,
    reclutamientoVacantes, setReclutamientoVacantes,
    reclutamientoCandidaturas, setReclutamientoCandidaturas,
    amonestacionesPersonal, setAmonestacionesPersonal,
    portalDatosSolicitudes, setPortalDatosSolicitudes,
    portalConstanciasTrabajo, setPortalConstanciasTrabajo,
    portalBoletaAcuses, setPortalBoletaAcuses,
    portalBoletaVisualizaciones, setPortalBoletaVisualizaciones,
    portalFirmaRegistros, setPortalFirmaRegistros,
    portalFirmaOtpIntentos, setPortalFirmaOtpIntentos,
    biometricoPerfiles, setBiometricoPerfiles,
    biometricoLotes, setBiometricoLotes,
    whatsappPlantillas, setWhatsappPlantillas,
    whatsappMatriz, setWhatsappMatriz,
    whatsappEnvios, setWhatsappEnvios,
    geocercas, setGeocercas,
    geocercaAsignaciones, setGeocercaAsignaciones,
    ubicacionConsentimientos, setUbicacionConsentimientos,
    evaluacionPlantillas, setEvaluacionPlantillas,
    evaluacionCompetencias, setEvaluacionCompetencias,
    evaluacionObjetivos, setEvaluacionObjetivos,
    evaluacionEvaluaciones, setEvaluacionEvaluaciones,
    evaluacionRespCompetencias, setEvaluacionRespCompetencias,
    evaluacionRespObjetivos, setEvaluacionRespObjetivos,
    liquidacionesCese, setLiquidacionesCese,
    liquidacionesConceptos, setLiquidacionesConceptos,
    crearLiquidacionCtx, confirmarLiquidacionCtx, anularLiquidacionCtx,
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
    afpParametros, setAfpParametros, guardarAfpParametro,
    // Fase 3 Actions
    calcularHealthScore,
    // RRHH Actions
    crearTecnicoCtx, actualizarTecnicoCtx, eliminarTecnicoCtx,
    crearAdminPersonalCtx, actualizarAdminPersonalCtx, eliminarAdminPersonalCtx,
    crearVacanteReclutamientoCtx, actualizarVacanteReclutamientoCtx, crearCandidaturaReclutamientoCtx,
    moverCandidaturaReclutamientoCtx, invitarCandidatoReclutamientoCtx,
    crearSolicitudDatosPortalCtx, resolverSolicitudDatosPortalCtx,
    crearConstanciaPortalCtx, resolverConstanciaPortalCtx,
    registrarAcuseBoletaPortalCtx, registrarVisualizacionBoletaPortalCtx,
    iniciarOtpFirmaPortalCtx, validarOtpFirmaPortalCtx, guardarOnboardingFirmaPortalCtx,
    guardarPerfilBiometricoCtx, registrarLoteBiometricoCtx, anularLoteBiometricoCtx,
    guardarWhatsappPlantillaCtx, guardarWhatsappRutaCtx, registrarWhatsappSimuladoCtx,
    guardarGeocercaCtx, eliminarGeocercaCtx, guardarGeocercaAsignacionCtx, registrarConsentimientoUbicacionCtx, evaluarSarNoLlegadaCtx,
    crearTurnoCtx, actualizarTurnoCtx, eliminarTurnoCtx, registrarAsistenciaCtx, crearPeriodoNominaCtx,
    crearPlantillaEvaluacionCtx, actualizarPlantillaEvaluacionCtx, cerrarPlantillaEvaluacionCtx,
    reasignarJefeEvaluacionCtx, guardarAutoevaluacionCtx, guardarEvaluacionJefeCtx,
    aprobarVacacion, rechazarVacacion,
    subirDocumentoPersonalCtx, validarDocumentoPersonalCtx, corregirDocumentoPersonalCtx, nuevoContratoPeriodoCtx,
    recargarPersonalDocumentosPersonaCtx,
    enviarDocumentoAFirmaCtx, cancelarEnvioFirmaCtx, reenviarNotificacionFirmaCtx, subirDocumentoFirmadoPortalCtx, subirContratoFirmadoAprobadoCtx,
    asignacionesJornada, setAsignacionesJornada, crearAsignacionJornadaCtx, eliminarAsignacionJornadaCtx,
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
    toasts, addToast, removeToast,
    tipoCambioHoy,
    convertirMonto: (monto, origen, destino) => convertirMontoFn(monto, origen, destino, tipoCambioHoy),
    tcPENaUSD: tipoCambioHoy.usd || null,
    tcUSDaPEN: tipoCambioHoy.usd ? Math.round(1 / tipoCambioHoy.usd * 100) / 100 : null,
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
      <CargoCreationDialog
        solicitud={cargoCreationRequest}
        guardando={cargoCreationSaving}
        onResolver={resolverCreacionCargo}
        onCancelar={cancelarCreacionCargo}
      />
    </AppContext.Provider>
  );
}
