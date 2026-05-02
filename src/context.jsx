import React, { createContext, useContext, useEffect, useState } from 'react';
import { MOCK } from './data.js';
import { isSupabaseMode } from './lib/dataMode.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { loadCrmFromSupabase, loadCsFromSupabase, persistirLead, actualizarLead, persistirCuenta, actualizarCuenta as svcActualizarCuenta, persistirContacto, actualizarContacto, persistirOportunidad, actualizarOportunidad, persistirHojaCosteo, crearHojaCosteoRpc, aprobarHojaCosteoRpc, actualizarHojaCosteoSvc, persistirCotizacion, actualizarCotizacion as svcActualizarCotizacion, persistirOSCliente, actualizarOSCliente as svcActualizarOSCliente, persistirAgendaEvento, actualizarAgendaEventoSvc, persistirActividadComercial, actualizarActividadComercial, subirLogoCuenta } from './services/crmService.js';
import { loadOpsFromSupabase, persistirBacklog, actualizarBacklog, persistirOT, crearOTDesdeOSRpc, actualizarOT as svcActualizarOT, persistirParteDiario, actualizarParteDiario as svcActualizarParteDiario, persistirCierreTecnico, consumirInventario } from './services/operacionesService.js';
import { finanzasService } from './services/finanzasService.js';
import { maestrosService } from './services/maestrosService.js';
import { comprasService } from './services/comprasService.js';
import { rrhhService } from './services/rrhhService.js';
import * as plannerSvc from './services/plannerService.js';
import { auditoriaService } from './services/auditoriaService.js';
import { plataformaService } from './services/plataformaService.js';
import { usuariosService } from './services/usuariosService.js';
import { rolesService } from './services/rolesService.js';
const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

function generateId(prefix) {
  return `${prefix}_${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
}

function buildRoleDePermisos(rol, permisosRows = [], acceso_campo = false) {
  const esSuperadmin = rol?.es_superadmin || false;
  const esAdmin = esSuperadmin || rol?.es_admin_empresa || false;
  const ver = permisosRows.filter(p => p.puede_ver).map(p => p.pantalla);
  const verFinanzas = esSuperadmin || permisosRows.some(p => p.puede_ver_finanzas);
  const verCostos = esSuperadmin || permisosRows.some(p => p.puede_ver_costos);
  const puedeAprobar = esSuperadmin || permisosRows.some(p => p.puede_aprobar);
  return {
    nombre: rol?.nombre || 'Usuario',
    color: esSuperadmin ? 'navy' : esAdmin ? 'purple' : 'cyan',
    permisos: {
      ver,
      todo: esAdmin,
      plataforma: esSuperadmin,
      soporte_tenant: esSuperadmin,
      tenant_admin: esAdmin,
      ver_finanzas: verFinanzas,
      ver_costos: verCostos,
      aprobar_descuentos: puedeAprobar,
      ver_agenda_equipo: esAdmin,
      acceso_campo,
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

function empresaPermiteAcceso(estado) {
  return ['activa', 'activo', 'demo'].includes(String(estado || '').toLowerCase());
}

export function AppProvider({ children }) {
  const [active, setActive] = useState('dashboard');
  const [activeParams, setActiveParams] = useState({});
  const [roleKey, setRoleKey] = useState('admin');
  const [empresa, setEmpresa] = useState(() => {
    try {
      const saved = localStorage.getItem('active_empresa_obj');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error('Error parsing saved empresa:', e); }
    return MOCK.empresas[0];
  });

  const [dark, setDark] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const [mobileProfile, setMobileProfile] = useState('tecnico');
  const [createdRecords, setCreatedRecords] = useState({});
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

  // Auto-seleccionar solo si hay exactamente 1 empresa — con múltiples siempre muestra el selector
  useEffect(() => {
    if (!authUser || membresiaActiva || todasMembresias.length !== 1) return;
    seleccionarEmpresa(todasMembresias[0].empresa_id);
  }, [authUser, todasMembresias, membresiaActiva]);

  // Guardar la última empresa seleccionada
  useEffect(() => {
    if (empresa?.id) {
      localStorage.setItem('active_empresa_obj', JSON.stringify(empresa));
    }
  }, [empresa]);


  // Business Data
  const [usuarios, setUsuarios] = useState(() => {
    try { const saved = localStorage.getItem('tideo_usuarios'); return saved ? JSON.parse(saved) : MOCK.usuarios; } catch { return MOCK.usuarios; }
  });
  useEffect(() => { try { localStorage.setItem('tideo_usuarios', JSON.stringify(usuarios)); } catch {} }, [usuarios]);
  const [leads, setLeads] = useState(MOCK.leads);
  const [cuentas, setCuentas] = useState(MOCK.cuentas);
  const [contactos, setContactos] = useState(MOCK.contactos);
  const [oportunidades, setOportunidades] = useState(MOCK.oportunidades);
  const [actividades, setActividades] = useState(MOCK.actividades);
  const [agendaEventos, setAgendaEventos] = useState(MOCK.agendaEventos || []);
  const [hojasCosteo, setHojasCosteo] = useState(MOCK.hojasCosteo || []);
  const [cotizaciones, setCotizaciones] = useState(MOCK.cotizaciones);
  const [osClientes, setOsClientes] = useState(MOCK.osClientes);
  const [cxp, setCxp] = useState(MOCK.cxp || []);
  const [cxc, setCxc] = useState(MOCK.cxc || []);
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
  const [valorizaciones, setValorizaciones] = useState(MOCK.valorizaciones || []);
  const [proveedores, setProveedores] = useState(MOCK.proveedores || []);
  const [evaluacionesProveedor, setEvaluacionesProveedor] = useState(MOCK.evaluacionesProveedor || []);
  const [procesosCompra, setProcesosCompra] = useState(MOCK.procesosCompra || []);
  const [respuestasCompra, setRespuestasCompra] = useState(MOCK.respuestasCompra || []);
  const [ordenesCompra, setOrdenesCompra] = useState(MOCK.ordenesCompra || []);
  const [ordenesServicio, setOrdenesServicio] = useState(MOCK.ordenesServicio || []);
  const [recepciones, setRecepciones] = useState(MOCK.recepciones || []);

  // Maestros Base Data
  const [cargos, setCargos] = useState(MOCK.cargos || []);
  const [especialidades, setEspecialidades] = useState(MOCK.especialidadesTecnicas || []);
  const [tiposServicio, setTiposServicio] = useState(MOCK.tiposServicioInterno || []);
  const [almacenes, setAlmacenes] = useState(MOCK.almacenesDepositos || []);
  const [sedes, setSedes] = useState(MOCK.sedes || []);
  const [industrias, setIndustrias] = useState(MOCK.industrias || []);

  // Personal Operativo (separado del admin, estado propio)
  const [personalOperativo, setPersonalOperativo] = useState(MOCK.personalOperativo || []);

  // Fase 3 Data
  const [personalAdmin, setPersonalAdmin] = useState(MOCK.personalAdmin || []);
  const [vacacionesSolicitudes, setVacacionesSolicitudes] = useState(MOCK.vacacionesSolicitudes || []);
  const [licencias, setLicencias] = useState(MOCK.licencias || []);
  const [solicitudesRRHH, setSolicitudesRRHH] = useState(MOCK.solicitudesRRHH || []);
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
    try {
      const saved = localStorage.getItem('tideo_roles');
      return saved ? JSON.parse(saved) : MOCK.roles;
    } catch { return MOCK.roles; }
  });
  useEffect(() => {
    try { localStorage.setItem('tideo_roles', JSON.stringify(rolesCtx)); } catch {}
  }, [rolesCtx]);

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
      if (error) throw error;
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
    loadSupabaseFinanceData();
  }, [empresa?.id, authSession?.user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !authSession?.user || !empresa?.id) return;
    
    // Limpiar listas actuales para evitar datos "pegados" de otro tenant
    // usuarios se limpia después del merge con localStorage
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
        setCuentas(data.cuentas || []);
        setLeads(data.leads || []);
        setContactos(data.contactos || []);
        setOportunidades(data.oportunidades || []);
        setHojasCosteo(data.hojasCosteo || []);
        setCotizaciones(data.cotizaciones || []);
        setOsClientes(data.osClientes || []);
        setAgendaEventos(data.agendaEventos || []);
        setActividades(data.actividades || []);
        
        const opsData = await loadOpsFromSupabase(supabase, empresa.id);
        if (opsData && mounted) {
          setOts(opsData.ots || []);
          setPartes(opsData.partes || []);
          setBacklog(opsData.backlog || []);
        }
        
        try {
          const cg = await maestrosService.getCargos(empresa.id);
          const es = await maestrosService.getEspecialidades(empresa.id);
          const ts = await maestrosService.getTiposServicio(empresa.id);
          const al = await maestrosService.getAlmacenes(empresa.id);
          const sd = await maestrosService.getSedes(empresa.id);
          const ind = await maestrosService.getIndustrias(empresa.id);
          if (mounted) {
            setCargos(cg || []);
            setEspecialidades(es || []);
            setTiposServicio(ts || []);
            setAlmacenes(al || []);
            setSedes(sd || []);
            setIndustrias(ind?.length ? ind : (MOCK.industrias || []));
          }
        } catch (_err) { /* keep mock */ }

        
        try {
          const valData = await finanzasService.getValorizaciones(empresa.id);
          const facData = await finanzasService.getFacturas(empresa.id);
          const cxcData = await finanzasService.getCxC(empresa.id);
          const cxpData = await finanzasService.getCxP(empresa.id);
          const mbData = await finanzasService.getMovimientosBanco(empresa.id);
          
          if (mounted) {
            setValorizaciones(valData || []);
            setFacturas(facData || []);
            setCxc(cxcData || []);
            setCxp(cxpData || []);
            setMovimientosBanco(mbData || []);
          }
        } catch (_err) { /* keep mock on error */ }

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
        } catch (_err) { /* keep mock */ }

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

        try {
          const usrData = await usuariosService.getUsuarios(empresa.id);
          if (mounted) {
            // Mergear usuarios locales (creados en prototipo) que no existan en Supabase
            const localUsuarios = (() => { try { const s = localStorage.getItem('tideo_usuarios'); return s ? JSON.parse(s) : []; } catch { return []; } })();
            const supabaseIds = new Set((usrData || []).map(u => u.id));
            const onlyLocal = localUsuarios.filter(u => !supabaseIds.has(u.id));
            setUsuarios([...(usrData || []), ...onlyLocal]);
            
            // Auto-sincronizar al admin logueado si no aparece en la lista
            if (authUser?.email && !usrData?.find(u => u.email === authUser.email)) {
              console.log('>>> Sincronizando usuario actual con la BD...');
              registrarUsuario({
                id: authUser.id,
                nombre: authUser.user_metadata?.nombre || authUser.email.split('@')[0],
                email: authUser.email,
                rol: 'admin',
                empresa_id: empresa.id,
                estado: 'Activo'
              });
            }
          }
        } catch (_err) { 
          console.error('Error loading usuarios from Supabase:', _err);
          // Solo en caso de error real mantenemos los mock para no romper la UI
        }

        try {
          const rolesData = await rolesService.getRoles(empresa.id);
          if (mounted && rolesData?.length) {
            // Convert list to object format if needed, but for the UI it might be easier as list
            // However, to keep compatibility with MOCK.roles, we might want to store it as object
            const rolesObj = {};
            for (const r of rolesData) {
              const pRows = await rolesService.getPermisosRoles(r.id);
              rolesObj[r.id] = {
                ...r,
                permisos: {
                  ver: pRows.filter(p => p.puede_ver).map(p => p.pantalla),
                  crear: pRows.some(p => p.puede_crear),
                  editar: pRows.some(p => p.puede_editar),
                  anular: pRows.some(p => p.puede_anular),
                  aprobar: pRows.some(p => p.puede_aprobar),
                  ver_costos: pRows.some(p => p.puede_ver_costos),
                  ver_finanzas: pRows.some(p => p.puede_ver_finanzas),
                }
              };
            }
            if (mounted) setRolesCtx(prev => ({ ...prev, ...rolesObj }));
          }
        } catch (_err) { /* keep mock */ }

      } catch (_err) { /* keep mock on error */ }
    };
    loadCrm();
    return () => { mounted = false; };
  }, [empresa?.id, authSession?.user?.id]);

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
          supabase.from('empresas').select('id, razon_social, nombre_comercial, ruc, moneda_base, plan_id, estado').in('id', empresaIds),
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

        if (activas.length === 1) {
          await cargarMembresiaCompleta(activas[0]);
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

  const addCreatedRecord = (screen, record) => {
    setCreatedRecords(prev => ({
      ...prev,
      [screen]: [record, ...(prev[screen] || [])]
    }));
  };

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
  };

  const role = (isSupabaseConfigured() && membresiaActiva)
    ? buildRoleDePermisos(membresiaActiva.rol, membresiaActiva.permisos_rows, membresiaActiva.acceso_campo)
    : (MOCK.roles[roleKey] || MOCK.roles['admin']);
  const isSuperadmin = Boolean(role.permisos?.plataforma);

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

  const crearLead = (lead) => {
    setLeads(prev => [lead, ...prev]);
    crmSync(sb => persistirLead(sb, empresa.id, lead));
    auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: lead.id, accion: 'crear', valor_nuevo: lead });
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

    const newCuentaId = generateId('cta');
    const newContactoId = generateId('con');
    const newOppId = generateId('opp');

    const nuevaCuenta = {
      id: newCuentaId,
      empresa_id: empresa.id,
      razon_social: lead.razon_social || lead.empresa_contacto,
      nombre_comercial: lead.empresa_contacto,
      tipo: 'prospecto',
      industria: lead.industria || 'Por definir',
      tamano: 'Por definir',
      estado: 'activo',
      responsable_comercial: lead.responsable,
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
      ruc: lead.ruc || 'Pendiente'
    };

    const nuevoContacto = {
      id: newContactoId,
      empresa_id: empresa.id,
      cuenta_id: newCuentaId,
      nombre: lead.nombre,
      cargo: lead.cargo,
      rol: 'decisor',
      telefono: lead.telefono,
      email: lead.email,
      principal: true,
      lead_origen: lead.id
    };

    const nuevaOportunidad = {
      id: newOppId,
      empresa_id: empresa.id,
      cuenta_id: newCuentaId,
      contacto_id: newContactoId,
      nombre: datosConversion.nombre_oportunidad,
      servicio_interes: lead.necesidad,
      etapa: datosConversion.etapa_inicial || 'calificacion',
      monto_estimado: datosConversion.monto_estimado || lead.presupuesto_estimado,
      probabilidad: 30, // default
      forecast_ponderado: (datosConversion.monto_estimado || lead.presupuesto_estimado) * 0.3,
      fecha_cierre_estimada: null,
      fuente: lead.fuente,
      responsable: lead.responsable,
      competidor: null,
      estado: 'abierta',
      lead_origen: lead.id,
      notas: lead.necesidad,
      fecha_creacion: new Date().toISOString().split('T')[0]
    };

    setCuentas(prev => [...prev, nuevaCuenta]);
    setContactos(prev => [...prev, nuevoContacto]);
    setOportunidades(prev => [...prev, nuevaOportunidad]);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: 'convertido', convertido: true } : l));

    crmSync(async sb => {
      await persistirCuenta(sb, empresa.id, nuevaCuenta);
      await persistirContacto(sb, empresa.id, nuevoContacto);
      await persistirOportunidad(sb, empresa.id, nuevaOportunidad);
      await actualizarLead(sb, leadId, { estado: 'convertido', convertido: true, cuenta_id: newCuentaId });
    });
    auditSync({
      modulo: 'crm',
      entidad: 'leads',
      entidad_id: leadId,
      accion: 'convertir',
      valor_anterior: lead,
      valor_nuevo: { cuenta: nuevaCuenta, contacto: nuevoContacto, oportunidad: nuevaOportunidad }
    });

    addNotificacion(`Lead convertido a oportunidad: ${nuevaOportunidad.nombre}`);
    navigate('pipeline', { panel: newOppId });
  };

  const descartarLead = (leadId, motivo) => {
    const anterior = leads.find(l => l.id === leadId) || null;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: 'descartado', motivo_descarte: motivo } : l));
    crmSync(sb => actualizarLead(sb, leadId, { estado: 'descartado', motivo_descarte: motivo }));
    auditSync({ modulo: 'crm', entidad: 'leads', entidad_id: leadId, accion: 'descartar', valor_anterior: anterior, valor_nuevo: { motivo } });
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
    setOportunidades(prev => prev.map(o => o.id === oppId ? { ...o, etapa: nuevaEtapa } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, { etapa: nuevaEtapa }));
  };

  const marcarGanada = (oppId, datos) => {
    const anterior = oportunidades.find(o => o.id === oppId) || null;
    setOportunidades(prev => prev.map(o => o.id === oppId ? {
      ...o,
      estado: 'ganada',
      etapa: 'ganada',
      probabilidad: 100,
      fecha_cierre_real: datos.fecha_cierre_real || new Date().toISOString().split('T')[0],
      notas: datos.notas || o.notas
    } : o));
    crmSync(sb => actualizarOportunidad(sb, oppId, {
      estado: 'ganada',
      etapa: 'ganada',
      probabilidad: 100,
      fecha_cierre_real: datos.fecha_cierre_real || new Date().toISOString().split('T')[0],
      notas: datos.notas
    }));
    auditSync({ modulo: 'crm', entidad: 'oportunidades', entidad_id: oppId, accion: 'ganar', valor_anterior: anterior, valor_nuevo: datos });

    addNotificacion(`Oportunidad ganada. Revisar datos para OS.`);

    if (datos.crear_osc && datos.cotizacion_id) {
      crearOSCliente(datos.cotizacion_id, datos);
    }
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
      cotizacion_id: null
    };
    const calculada = calcularHojaCosteo(hc);
    try {
      if (isSupabaseConfigured()) {
        const result = await crmPersist(sb => crearHojaCosteoRpc(sb, empresa.id, calculada));
        if (result?.data) Object.assign(calculada, result.data);
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
    if (isSupabaseConfigured()) {
      const cotBase = {
        id: generateId('cot'),
        oportunidad_id: hc.oportunidad_id,
        cuenta_id: hc.cuenta_id,
        numero: `COT-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
        version: 1,
        estado: 'borrador',
        fecha: new Date().toISOString().split('T')[0],
        moneda: 'PEN',
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
        crmSync(sb => svcActualizarCotizacion(sb, cotFinal.id, { items: cotFinal.items }));
        setCotizaciones(prev => prev.some(c => c.id === cotFinal.id)
          ? prev.map(c => c.id === cotFinal.id ? { ...c, ...cotFinal } : c)
          : [...prev, cotFinal]
        );
        setHojasCosteo(prev => prev.map(h => h.id === hcId ? { ...h, ...hcFinal } : h));
        auditSync({ modulo: 'comercial', entidad: 'hojas_costeo', entidad_id: hcId, accion: 'aprobar', valor_anterior: hc, valor_nuevo: { estado: 'aprobada', cotizacion_id: cotFinal.id } });
        addNotificacion(`HC aprobada. CotizaciÃ³n borrador generada.`);
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
      moneda: 'PEN',
      validez: '30 días',
      subtotal: hc.precio_sugerido_sin_igv,
      base_imponible: hc.precio_sugerido_sin_igv,
      igv: Math.round(hc.precio_sugerido_sin_igv * 0.18),
      total: hc.precio_sugerido_total,
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
    const cot = {
      id: generateId('cot'),
      empresa_id: empresa.id,
      numero: `COT-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
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
      ...datos,
      cuenta_id: datos.cuenta_id || oportunidades.find(o => o.id === datos.oportunidad_id)?.cuenta_id || null,
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
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cot.id, accion: 'crear', valor_nuevo: cot });
    addNotificacion(`Cotización ${cot.numero} generada con éxito.`);
    return cot.id;
  };
  
  const actualizarCotizacion = (cotId, datos) => {
    const anterior = cotizaciones.find(c => c.id === cotId) || null;
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, ...datos } : c));
    crmSync(sb => svcActualizarCotizacion(sb, cotId, datos));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
  };

  const aprobarCotizacion = (cotId) => {
    const anterior = cotizaciones.find(c => c.id === cotId) || null;
    setCotizaciones(prev => prev.map(c => c.id === cotId ? { ...c, estado: 'aprobada' } : c));
    crmSync(sb => svcActualizarCotizacion(sb, cotId, { estado: 'aprobada' }));
    auditSync({ modulo: 'comercial', entidad: 'cotizaciones', entidad_id: cotId, accion: 'aprobar', valor_anterior: anterior, valor_nuevo: { estado: 'aprobada' } });
    addNotificacion(`Cotización aprobada por el cliente.`);
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
      moneda: datos.moneda || 'PEN',
      condicion_pago: datos.condicion_pago || null,
      fecha_emision: datos.fecha_emision || new Date().toISOString().split('T')[0],
      fecha_inicio: datos.fecha_inicio || null,
      fecha_fin: datos.fecha_fin || null,
      sla: datos.sla || null,
      estado: datos.estado || 'en_ejecucion',
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

  const actualizarOSCliente = (oscId, datos) => {
    const anterior = osClientes.find(os => os.id === oscId) || null;
    setOsClientes(prev => prev.map(os => os.id === oscId ? { ...os, ...datos } : os));
    crmSync(sb => svcActualizarOSCliente(sb, oscId, datos));
    auditSync({ modulo: 'comercial', entidad: 'os_clientes', entidad_id: oscId, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
  };

  const registrarActividad = (datos) => {
    const act = {
      id: generateId('act'),
      empresa_id: empresa.id,
      estado: datos.resultado ? 'completada' : 'pendiente',
      ...datos
    };
    setActividades(prev => [act, ...prev]);
    crmSync(sb => persistirActividadComercial(sb, empresa.id, act));
    auditSync({ modulo: 'crm', entidad: 'actividades_comerciales', entidad_id: act.id, accion: 'crear', valor_nuevo: act });
  };

  const actualizarActividad = (id, datos) => {
    const anterior = actividades.find(a => a.id === id) || null;
    setActividades(prev => prev.map(a => a.id === id ? { ...a, ...datos } : a));
    crmSync(sb => actualizarActividadComercial(sb, id, datos));
    auditSync({ modulo: 'crm', entidad: 'actividades_comerciales', entidad_id: id, accion: 'editar', valor_anterior: anterior, valor_nuevo: datos });
  };

  // Fase 2 Mutators
  const convertirBacklogAOT = (backlogId) => {
    const req = backlog.find(b => b.id === backlogId);
    if (!req) return;
    setBacklog(prev => prev.map(b => b.id === backlogId ? { ...b, estado: 'convertido' } : b));
    opsSync(sb => actualizarBacklog(sb, backlogId, { estado: 'convertido' }));
    crearOT({
      cliente: req.cuenta_id, 
      descripcion: req.descripcion,
      tipo: 'Correctiva',
      estado: 'borrador',
      costoEst: 0, costoReal: 0, avance: 0,
      backlog_id: backlogId
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
      costoEst: montoPlanificado,
      costoReal: 0,
      avance: 0,
    };

    const otsAsociadas = Array.from(new Set([...(os.ots_asociadas || []), ot.id]));
    const saldoPorEjecutar = Math.max(0, Number(os.saldo_por_ejecutar || 0) - montoPlanificado);

    try {
      if (isSupabaseConfigured()) {
        const result = await opsPersist(sb => crearOTDesdeOSRpc(sb, empresa.id, os.id, ot));
        const data = result?.data || {};
        Object.assign(ot, data.orden_trabajo || {});
      } else {
        await opsPersist(sb => persistirOT(sb, empresa.id, ot));
        await crmPersist(sb => svcActualizarOSCliente(sb, os.id, { ots_asociadas: otsAsociadas, saldo_por_ejecutar: saldoPorEjecutar }));
      }
    } catch (error) {
      const message = error?.message || 'No se pudo guardar la OT en Supabase.';
      addNotificacion(`No se creo la OT: ${message}`);
      throw error;
    }

    setOts(prev => [...prev, ot]);
    setOsClientes(prev => prev.map(item => item.id === os.id ? { ...item, ots_asociadas: otsAsociadas, saldo_por_ejecutar: saldoPorEjecutar } : item));
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

  const registrarParteDiario = (datos) => {
    const p = {
      id: generateId('part'),
      empresa_id: empresa.id,
      estado: 'en_revision',
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

  const aprobarParteDiario = (parteId) => {
    const parte = partes.find(p => p.id === parteId);
    if (!parte) return;

    // Aprobar parte
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, estado: 'aprobado' } : p));
    opsSync(sb => svcActualizarParteDiario(sb, parteId, { estado: 'aprobado' }));
    auditSync({ modulo: 'operaciones', entidad: 'partes_diarios', entidad_id: parteId, accion: 'aprobar', valor_anterior: parte, valor_nuevo: { estado: 'aprobado' } });
    
    // Impactar OT (Avance y Costo Real)
    // Calculamos el costo de los materiales usados
    let costoMateriales = 0;
    
    if (parte.materiales_usados) {
      parte.materiales_usados.forEach(mu => {
        const itemInv = inventario.find(i => i.sku === mu.sku);
        if (itemInv) {
          costoMateriales += (mu.cantidad * itemInv.costo_promedio);
        }
      });
    }

    setOts(prev => prev.map(o => {
      if (o.id === parte.ot_id) {
        const nuevosDatos = { 
          avance: Math.min(100, (o.avance || 0) + (parte.avance_reportado || 0)),
          costoReal: (o.costoReal || 0) + costoMateriales
        };
        opsSync(sb => svcActualizarOT(sb, o.id, nuevosDatos));
        return { ...o, ...nuevosDatos };
      }
      return o;
    }));

    addNotificacion('Parte diario aprobado. Costos y avance actualizados.');
  };

  const cerrarTecnicamenteOT = (otId, datosCierre) => {
    const anterior = ots.find(o => o.id === otId) || null;
    setOts(prev => prev.map(o => o.id === otId ? { ...o, estado: 'cerrado' } : o));
    opsSync(sb => svcActualizarOT(sb, otId, { estado: 'cerrado' }));
    
    const cierre = {
      id: generateId('cier'),
      ot_id: otId,
      ...datosCierre
    };
    
    opsSync(sb => persistirCierreTecnico(sb, empresa.id, cierre));
    auditSync({ modulo: 'operaciones', entidad: 'ordenes_trabajo', entidad_id: otId, accion: 'cierre_tecnico', valor_anterior: anterior, valor_nuevo: cierre });

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
              itemsADescontar.push({ material_id: itemInv.id, cantidad: mu.cantidad, almacen_id: itemInv.almacen_id || null });
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
    const val = {
      id: generateId('val'),
      empresa_id: empresa.id,
      os_cliente_id: osClienteId,
      numero: `VAL-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'aprobada',
      periodo, subtotal, igv, total,
      moneda: meta.moneda || osClientes.find(os => os.id === osClienteId)?.moneda || 'PEN',
      ot_ids: meta.otIds || [],
      items: meta.items || []
    };
    setValorizaciones(prev => [...prev, val]);
    auditSync({ modulo: 'operaciones', entidad: 'valorizaciones', entidad_id: val.id, accion: 'aprobar', valor_nuevo: val });
    
    // Descontar de OS Cliente
    let saldoPorValorizar = null;
    setOsClientes(prev => prev.map(osc => {
      if (osc.id === osClienteId) {
        saldoPorValorizar = Math.max(0, Number(osc.saldo_por_valorizar || 0) - Number(total || 0));
        return {
          ...osc,
          saldo_por_valorizar: saldoPorValorizar
        };
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
          estado: val.estado
        });
      });
    }

    addNotificacion(`Valorización ${val.numero} aprobada.`);
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

  const crearUsuarioConAcceso = async ({ nombre, email, password, rol, area }) => {
    if (!isSupabaseConfigured()) {
      addNotificacion('Se requiere Supabase para crear usuarios con acceso.', 'error');
      return;
    }
    try {
      const supabase = await getSupabaseClient();

      // Guardar sesión del admin antes de signUp (que la reemplaza automáticamente)
      const { data: { session: adminSession } } = await supabase.auth.getSession();

      // 1. Intentar crear en Supabase Auth
      let uid = null;
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre } }
      });

      // Restaurar sesión del admin inmediatamente
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      if (authErr) {
        const yaExiste = authErr.message?.toLowerCase().includes('already registered') ||
                         authErr.message?.toLowerCase().includes('already been registered');
        if (!yaExiste) throw authErr;
        addNotificacion(`El usuario ya tiene cuenta. Se agrega al tenant actual.`);
      } else {
        uid = authData.user?.id;
        if (!uid) throw new Error('No se obtuvo ID de usuario de Auth');
      }

      let rolIdReal = rol;
      const { data: rolRow } = await supabase
        .from('roles')
        .select('id')
        .eq('empresa_id', empresa.id)
        .or(`id.eq.${rol},nombre.ilike.%${rol}%`)
        .limit(1)
        .single();
      if (rolRow?.id) rolIdReal = rolRow.id;

      if (empresa?.id) {
        const { data: vinculo, error: vinculoErr } = await supabase.rpc('vincular_usuario_a_empresa', {
          p_email: email,
          p_empresa_id: empresa.id,
          p_rol_id: rolIdReal,
          p_acceso_campo: false,
          p_perfil_campo: null,
        });
        if (vinculoErr) throw vinculoErr;
        uid = vinculo?.[0]?.user_id || uid;
      }

      if (!uid) throw new Error('No se pudo resolver el usuario Auth para vincularlo al tenant.');

      // 2. Crear registro en tabla usuarios para este tenant
      const nuevoUsuario = {
        id: uid,
        nombre,
        email,
        rol,
        area: area || '',
        empresa_id: empresa?.id,
        estado: 'Activo',
        must_change_password: true,
      };
      await usuariosService.registrarUsuario(nuevoUsuario);

      setUsuarios(prev => {
        if (prev.find(u => u.id === uid)) return prev.map(u => u.id === uid ? nuevoUsuario : u);
        return [...prev, nuevoUsuario];
      });
      if (!authErr) addNotificacion(`Usuario ${nombre} creado. Ya puede ingresar con la contraseña temporal.`);
      return nuevoUsuario;
    } catch (err) {
      addNotificacion('Error al crear usuario: ' + (err.message || 'Error desconocido'), 'error');
      throw err;
    }
  };

  const eliminarUsuario = async (id) => {
    setUsuarios(prev => prev.filter(u => u.id !== id));
    if (isSupabaseConfigured()) {
      try {
        await usuariosService.eliminarUsuario(id);
      } catch (err) {
        addNotificacion('Error al eliminar en Supabase: ' + err.message, 'error');
      }
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

  const updateLeadState = (leadId, newState) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: newState } : l));
    crmSync(sb => actualizarLead(sb, leadId, { estado: newState }));
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

  const emitirFacturaDesdeValorizacion = async (valorizacionId, datos = {}) => {
    const valorizacion = valorizaciones.find(v => v.id === valorizacionId);
    if (!valorizacion) {
      addNotificacion('No se encontro la valorizacion seleccionada.');
      return null;
    }

    const osCliente = osClientes.find(os => os.id === valorizacion.os_cliente_id);
    const cuentaId = datos.cuenta_id || osCliente?.cuenta_id;
    if (!cuentaId) {
      addNotificacion('La valorizacion no tiene cliente asociado para generar CxC.');
      return null;
    }

    const fechaEmision = datos.fecha_emision || new Date().toISOString().split('T')[0];
    const fechaVencimiento = datos.fecha_vencimiento || (() => {
      const d = new Date(`${fechaEmision}T00:00:00`);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();
    const numero = datos.numero || `F001-${Math.floor(Math.random() * 9000 + 1000)}`;
    const total = Number(valorizacion.total || 0);
    const subtotal = Number(valorizacion.subtotal || 0);
    const igv = Number(valorizacion.igv || Math.max(0, total - subtotal));
    const moneda = valorizacion.moneda || osCliente?.moneda || 'PEN';

    const facturaId = await emitirFactura({
      cuenta_id: cuentaId,
      valorizacion_id: valorizacion.id,
      numero,
      fecha_emision: fechaEmision,
      subtotal,
      igv,
      total,
      moneda,
      estado: 'emitida'
    });

    await generarCxC({
      cuenta_id: cuentaId,
      factura_id: facturaId,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      monto_total: total,
      monto_pagado: 0,
      saldo: total,
      moneda,
      estado: 'por_cobrar'
    });

    if (osCliente) {
      const saldoPorFacturar = Math.max(0, Number(osCliente.saldo_por_facturar || 0) - total);
      const montoFacturado = Number(osCliente.monto_facturado || 0) + total;
      setOsClientes(prev => prev.map(os => os.id === osCliente.id ? {
        ...os,
        saldo_por_facturar: saldoPorFacturar,
        monto_facturado: montoFacturado
      } : os));
      crmSync(sb => svcActualizarOSCliente(sb, osCliente.id, {
        saldo_por_facturar: saldoPorFacturar,
        monto_facturado: montoFacturado
      }));
    }

    addNotificacion(`Factura ${numero} emitida y CxC generada.`);
    return facturaId;
  };

  const registrarCobroCxC = async (cxcId, monto, datos = {}) => {
    const cuentaCobrar = cxc.find(c => c.id === cxcId);
    const montoCobrado = Number(monto || 0);
    let nuevoEstado = '';
    let nuevoSaldo = 0;
    setCxc(prev => prev.map(c => {
      if (c.id === cxcId) {
        const total = Number(c.monto_total || c.total || 0);
        const pagado = Number(c.monto_pagado || c.pagado || 0);
        const nuevoMonto = pagado + montoCobrado;
        nuevoSaldo = Math.max(0, total - nuevoMonto);
        nuevoEstado = nuevoSaldo <= 0 ? 'cobrada' : 'cobro_parcial';
        
        if (nuevoEstado === 'cobrada' && c.factura_id) {
          setFacturas(fPrev => fPrev.map(f => f.id === c.factura_id ? { ...f, estado: 'pagada' } : f));
        }

        return { ...c, monto_pagado: nuevoMonto, pagado: nuevoMonto, saldo: nuevoSaldo, estado: nuevoEstado };
      }
      return c;
    }));

    const fecha = datos.fecha || new Date().toISOString().split('T')[0];
    const movimiento = {
      id: generateId('tes'),
      empresa_id: empresa.id,
      tipo: 'ingreso',
      descripcion: datos.descripcion || `Cobro ${cuentaCobrar?.facturas?.numero || cuentaCobrar?.factura || cuentaCobrar?.factura_id || cxcId}`,
      monto: montoCobrado,
      moneda: cuentaCobrar?.moneda || 'PEN',
      fecha,
      cuenta_bancaria: datos.cuenta_bancaria || 'Cuenta principal',
      referencia: datos.referencia || '',
      vinculo_tipo: 'cxc',
      vinculo_id: cxcId,
      estado: 'registrado'
    };
    setMovimientosTesoreria(prev => [movimiento, ...prev]);

    if (cuentaCobrar?.cuenta_id) {
      setCuentas(prev => prev.map(c => c.id === cuentaCobrar.cuenta_id ? {
        ...c,
        saldo_cxc: Math.max(0, Number(c.saldo_cxc || 0) - montoCobrado)
      } : c));
    }

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.registrarCobroCxC(cxcId, montoCobrado);
        await finanzasService.registrarMovimientoTesoreria(movimiento);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxc', entidad_id: cxcId, accion: 'cobrar', valor_anterior: cuentaCobrar || null, valor_nuevo: { monto: montoCobrado, estado: nuevoEstado, movimiento } });
    addNotificacion(`Cobro registrado. Estado: ${nuevoEstado || 'Actualizado'}`);
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

    const movimiento = {
      id: generateId('tes'),
      empresa_id: empresa.id,
      tipo: 'egreso',
      descripcion: datos.descripcion || `Pago ${cuentaPagar?.factura_numero || cxpId}`,
      monto: montoPagado,
      moneda: cuentaPagar?.moneda || 'PEN',
      fecha: datos.fecha || new Date().toISOString().split('T')[0],
      cuenta_bancaria: datos.cuenta_bancaria || 'Cuenta principal',
      referencia: datos.referencia || '',
      vinculo_tipo: 'cxp',
      vinculo_id: cxpId,
      estado: 'registrado'
    };
    setMovimientosTesoreria(prev => [movimiento, ...prev]);

    if (isSupabaseConfigured()) {
      finSync(async () => {
        await finanzasService.registrarPagoCxP(cxpId, montoPagado);
        await finanzasService.registrarMovimientoTesoreria(movimiento);
      });
    }
    auditSync({ modulo: 'finanzas', entidad: 'cxp', entidad_id: cxpId, accion: 'pagar', valor_anterior: cuentaPagar || null, valor_nuevo: { monto: montoPagado, estado: nuevoEstado, movimiento } });
    addNotificacion(`Pago registrado. Estado: ${nuevoEstado || 'Actualizado'}`);
  };

  const conciliarMovimientoBancoConDocumento = async (movId, vinculadoTipo, vinculadoId) => {
    const mov = movimientosBanco.find(m => m.id === movId);
    if (!mov || !vinculadoId) return;

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
    setAgendaEventos(prev => [nuevo, ...prev]);
    crmSync(sb => persistirAgendaEvento(sb, empresa.id, nuevo));
    auditSync({ modulo: 'crm', entidad: 'agenda_comercial', entidad_id: nuevo.id, accion: 'crear', valor_nuevo: nuevo });
    return nuevo;
  };

  const actualizarAgendaEvento = (id, datos) => {
    const anterior = agendaEventos.find(e => e.id === id) || null;
    setAgendaEventos(prev => prev.map(e => e.id === id ? { ...e, ...datos } : e));
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
      setPlannerAsignaciones(prev => [
        ...prev.filter(a => !creadas.some(c => c.ot_id === a.ot_id && c.tecnico_id === a.tecnico_id && c.fecha === a.fecha)),
        ...creadas,
      ]);
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
      partes.map(p => `${p.tecnico_id || p.tecnico}__${p.fecha}`)
    );
    const pendientes = new Set();
    asigPasadas.forEach(a => {
      const key = `${a.tecnico_id}__${a.fecha}`;
      if (!partesRegistrados.has(key)) pendientes.add(key);
    });
    return pendientes;
  }, [plannerAsignaciones, partes]);

  /**
   * Crea una nueva cuadrilla y la agrega al estado.
   */
  const crearCuadrillaCtx = async ({ nombre, especialidad, tecnicoIds }) => {
    if (!empresa?.id) return null;
    let nueva;
    if (isSupabaseConfigured()) {
      nueva = await plannerSvc.crearCuadrilla({ nombre, especialidadPrincipal: especialidad, tecnicoIds, empresaId: empresa.id });
      const cuadData = await plannerSvc.getCuadrillas(empresa.id);
      setCuadrillas(cuadData || []);
    } else {
      const tecnicos = personalOperativo.filter(p => tecnicoIds.includes(p.id));
      nueva = { id: generateId('cua'), empresa_id: empresa.id, nombre, especialidad_principal: especialidad, activa: true };
      setCuadrillas(prev => [...prev, { ...nueva, miembros: tecnicos.map(t => ({ id: generateId('cm'), tecnico_id: t.id, tecnico: t })) }]);
    }
    auditSync({ modulo: 'planner', entidad: 'cuadrillas', entidad_id: nueva?.id, accion: 'crear', valor_nuevo: { nombre, tecnicoIds } });
    addNotificacion(`Cuadrilla "${nombre}" creada.`);
    return nueva;
  };

  const actualizarCuadrillaCtx = async (id, { nombre, especialidad, tecnicoIds }) => {
    if (!empresa?.id) return;
    if (isSupabaseConfigured()) {
      await plannerSvc.actualizarMiembrosCuadrilla(id, tecnicoIds);
      // Actualizar nombre/especialidad si cambiaron (supongo que actualiza la tabla cuadrillas)
      const cuadData = await plannerSvc.getCuadrillas(empresa.id);
      setCuadrillas(cuadData || []);
    } else {
      setCuadrillas(prev => prev.map(c => c.id === id ? { ...c, nombre, especialidad_principal: especialidad } : c));
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
    if (isSupabaseConfigured() && pantalla) {
      const payload = {
        pantalla,
        puede_ver: key === 'ver' ? value : Boolean(rolesCtx[rolId]?.permisos?.ver?.includes?.(pantalla)),
        puede_crear: key === 'crear' ? value : Boolean(rolesCtx[rolId]?.permisos?.crear?.includes?.(pantalla)),
        puede_editar: key === 'editar' ? value : Boolean(rolesCtx[rolId]?.permisos?.editar?.includes?.(pantalla)),
        puede_anular: key === 'anular' ? value : Boolean(rolesCtx[rolId]?.permisos?.anular?.includes?.(pantalla)),
        puede_aprobar: key === 'aprobar' ? value : Boolean(rolesCtx[rolId]?.permisos?.aprobar?.includes?.(pantalla)),
        puede_exportar: key === 'exportar' ? value : Boolean(rolesCtx[rolId]?.permisos?.exportar?.includes?.(pantalla)),
        puede_ver_costos: key === 'ver_costos' ? value : Boolean(rolesCtx[rolId]?.permisos?.ver_costos),
        puede_ver_finanzas: key === 'ver_finanzas' ? value : Boolean(rolesCtx[rolId]?.permisos?.ver_finanzas),
      };
      rolesService.actualizarPermisos(rolId, [payload]).catch(error => {
        addNotificacion(`No se pudo guardar el permiso en Supabase: ${error.message}`, 'error');
      });
    }
  };

  const crearRol = (rolData) => {
    const newId = isSupabaseConfigured() && empresa?.id
      ? `rol_${empresa.id}_${Math.random().toString(36).slice(2, 7)}`
      : `rol_${Math.random().toString(36).slice(2, 7)}`;
    setRolesCtx(prev => ({ ...prev, [newId]: { nombre: rolData.nombre, descripcion: rolData.descripcion || '', color: 'blue', permisos: { ver: [] } } }));
    if (isSupabaseConfigured() && empresa?.id) {
      rolesService.crearRol({
        id: newId,
        empresa_id: empresa.id,
        nombre: rolData.nombre,
        descripcion: rolData.descripcion || '',
        es_superadmin: false,
        es_admin_empresa: false,
        activo: true,
      }).catch(error => {
        addNotificacion(`No se pudo guardar el rol en Supabase: ${error.message}`, 'error');
      });
    }
    addNotificacion(`Rol "${rolData.nombre}" creado.`);
    return newId;
  };

  const eliminarRol = (rolId) => {
    setRolesCtx(prev => { const next = { ...prev }; delete next[rolId]; return next; });
    if (isSupabaseConfigured()) {
      rolesService.eliminarRol(rolId).catch(error => {
        addNotificacion(`No se pudo eliminar el rol en Supabase: ${error.message}`, 'error');
      });
    }
    addNotificacion('Rol eliminado.');
  };

  const editarRol = (rolId, datos) => {
    setRolesCtx(prev => ({ ...prev, [rolId]: { ...prev[rolId], ...datos } }));
    if (isSupabaseConfigured()) {
      rolesService.actualizarRol(rolId, datos).catch(error => {
        addNotificacion(`No se pudo actualizar el rol en Supabase: ${error.message}`, 'error');
      });
    }
  };

  const contextValue = {
    active, navigate, activeParams,
    roleKey, setRoleKey, role, isSuperadmin,
    empresa, setEmpresa,
    dark, setDark,
    mobileMode, setMobileMode,
    mobileProfile, setMobileProfile,
    authSession, authUser, authLoading, authError,
    signInWithPassword, signUpWithPassword, signOut,
    searchQuery: '',
    dataMode, supabaseStatus, reloadSupabaseFinanceData: loadSupabaseFinanceData,
    todasMembresias, membresiaActiva, membresiaCargando, seleccionarEmpresa,
    empresasPlataforma, setEmpresasPlataforma, crearTenantConAdmin,
    // Data
    usuarios, setUsuarios,
    roles: rolesCtx, clonarRol, actualizarPermisosRol, crearRol, eliminarRol, editarRol,
    leads, setLeads, updateLeadState,
    cuentas, setCuentas, actualizarCuenta, actualizarLogoCuenta,
    contactos, setContactos, crearContactoCuenta, actualizarContactoCuenta,
    oportunidades, setOportunidades,
    actividades, setActividades,
    agendaEventos, setAgendaEventos, crearAgendaEvento, actualizarAgendaEvento,
    hojasCosteo, setHojasCosteo, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo,
    cotizaciones, setCotizaciones, actualizarCotizacion,
    osClientes, setOsClientes,
    cxp, setCxp,
    cxc, setCxc,
    facturas, setFacturas,
    comprasGastos, setComprasGastos,
    financiamientos, setFinanciamientos,
    movimientosTesoreria, setMovimientosTesoreria,
    movimientosBanco, setMovimientosBanco,
    // Fase 2 Data
    ots, setOts,
    partes, setPartes,
    backlog, setBacklog,
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
    cargos, setCargos,
    especialidades, setEspecialidades,
    tiposServicio, setTiposServicio,
    almacenes, setAlmacenes,
    sedes, setSedes,
    industrias, setIndustrias,

    // Actions
    crearLead, crearCuenta,
    convertirLead, descartarLead,
    crearOportunidad, actualizarEtapaOportunidad, marcarGanada, marcarPerdida,
    crearCotizacion, aprobarCotizacion,
    crearOSCliente, crearOSClienteManual,
    registrarUsuario,
    eliminarUsuario,
    crearUsuarioConAcceso,
    marcarContrasenaActualizada,
    registrarActividad,
    actualizarActividad,
    // Fase 2 Actions
    convertirBacklogAOT, crearOT, crearOTDesdeOS, actualizarOT, registrarParteDiario, aprobarParteDiario, cerrarTecnicamenteOT, crearSOLPE, generarValorizacion,
    // Finanzas Actions
    emitirFactura, emitirFacturaDesdeValorizacion, generarCxC, registrarCobroCxC, generarCxP, registrarPagoCxP, conciliarMovimientoBanco, conciliarMovimientoBancoConDocumento,
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
    crearTecnicoCtx, crearAdminPersonalCtx, crearTurnoCtx, registrarAsistenciaCtx, crearPeriodoNominaCtx,
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
    crearCuadrillaCtx,
    actualizarCuadrillaCtx,
    eliminarCuadrillaCtx,
    partesPendientesSet,
    notificaciones, markNotificacionesRead, addNotificacion,
    createdRecords, addCreatedRecord
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
