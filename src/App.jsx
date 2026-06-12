import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context.jsx';
import { AuthGate } from './AuthGate.jsx';
import { Sidebar, Header } from './shell.jsx';

// ─── Lazy imports ─────────────────────────────────────────────────────────────
// Cada archivo de páginas genera un chunk separado, cargado solo cuando el
// usuario navega al módulo correspondiente.

// Core CRM / BI
const Dashboard       = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.Dashboard })));
const Leads           = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.Leads })));
const Pipeline        = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.Pipeline })));
const Actividades     = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.Actividades })));
const AgendaComercial = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.AgendaComercial })));
const OSCliente       = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.OSCliente })));
const Marketing       = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.Marketing })));
const BIComercial     = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.BIComercial })));
const BIOperativo     = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.BIOperativo })));

// Operaciones
const Cuentas             = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Cuentas })));
const OT                  = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.OT })));
const Partes              = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Partes })));
const Compras             = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Compras })));
const Proveedores         = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Proveedores })));
const CotizacionesCompras = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.CotizacionesCompras })));
const OrdenesCompra       = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.OrdenesCompra })));
const OrdenesServicio     = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.OrdenesServicio })));
const Recepciones         = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Recepciones })));
const ComprasGastos       = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.ComprasGastos })));
const ControlAsistencia   = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.ControlAsistencia })));
const Nomina              = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Nomina })));
const Backlog             = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Backlog })));
const Cierre              = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Cierre })));
const Remision            = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Remision })));
const SOLPE               = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.SOLPE })));
const Planner             = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Planner })));
const Tickets             = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.Tickets })));
const RRHH_Operativo      = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.RRHH_Operativo })));

// Administración
const Roles        = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Roles })));
const Usuarios     = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Usuarios })));
const Tenants      = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Tenants })));
const Planes       = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Planes })));
const Maestros     = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Maestros })));
const Servicios    = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Servicios })));
const Tarifarios   = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Tarifarios })));
const Parametros   = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Parametros })));
const RRHHAdmin    = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.RRHHAdmin })));
const Reclutamiento = lazy(() => import('./pages_reclutamiento.jsx').then(m => ({ default: m.Reclutamiento })));
const MiPortal      = lazy(() => import('./pages_mi_portal.jsx').then(m => ({ default: m.MiPortal })));
const MetricasSaaS = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.MetricasSaaS })));
const Organigrama  = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Organigrama })));
const Comisiones         = lazy(() => import('./pages_admin.jsx').then(m => ({ default: m.Comisiones })));
const SolicitudesRrhh    = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.SolicitudesRrhh })));
const TareoAdmin         = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.TareoAdmin })));
const ControlHoras       = lazy(() => import('./pages_ops.jsx').then(m => ({ default: m.ControlHoras })));
const EvaluacionesDesempeno = lazy(() => import('./pages_evaluaciones.jsx').then(m => ({ default: m.EvaluacionesDesempeno })));
const LiquidacionesCese     = lazy(() => import('./pages_liquidaciones.jsx').then(m => ({ default: m.LiquidacionesCese })));

// Finanzas
const CxC               = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.CxC })));
const Tesoreria         = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.Tesoreria })));
const Resultados        = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.Resultados })));
const Facturacion       = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.Facturacion })));
const Ventas            = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.Ventas })));
const CajaChica         = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.CajaChica })));
const PrestamosPersonal = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.PrestamosPersonal })));
const CxP               = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.CxP })));
const ActivosFijos      = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.ActivosFijos })));
const Presupuestos      = lazy(() => import('./pages_fin.jsx').then(m => ({ default: m.Presupuestos })));
const FinanciamientoDeuda = lazy(() => import('./pages_fin_deuda.jsx').then(m => ({ default: m.FinanciamientoDeuda })));

// Comercial / Logística
const Cotizaciones = lazy(() => import('./pages_extra.jsx').then(m => ({ default: m.Cotizaciones })));
const Valorizacion = lazy(() => import('./pages_extra.jsx').then(m => ({ default: m.Valorizacion })));
const Inventario   = lazy(() => import('./pages_extra.jsx').then(m => ({ default: m.Inventario })));
const HojaCosteo   = lazy(() => import('./pages_extra.jsx').then(m => ({ default: m.HojaCosteo })));

// Módulos secundarios
const MobileFieldView   = lazy(() => import('./pages_mobile.jsx').then(m => ({ default: m.MobileFieldView })));
const BIFinanciero      = lazy(() => import('./pages_bi_fin.jsx').then(m => ({ default: m.BIFinanciero })));
const IAComercial       = lazy(() => import('./pages_ia.jsx').then(m => ({ default: m.IAComercial })));
const IAOperativa       = lazy(() => import('./pages_ia.jsx').then(m => ({ default: m.IAOperativa })));
const IAFinanciera      = lazy(() => import('./pages_ia.jsx').then(m => ({ default: m.IAFinanciera })));
const CSOnboarding      = lazy(() => import('./pages_cs.jsx').then(m => ({ default: m.CSOnboarding })));
const CSPlanes          = lazy(() => import('./pages_cs.jsx').then(m => ({ default: m.CSPlanes })));
const CSHealthScore     = lazy(() => import('./pages_cs.jsx').then(m => ({ default: m.CSHealthScore })));
const CSRenovaciones    = lazy(() => import('./pages_cs.jsx').then(m => ({ default: m.CSRenovaciones })));
const CSFidelizacion    = lazy(() => import('./pages_cs.jsx').then(m => ({ default: m.CSFidelizacion })));
const BICustomerSuccess = lazy(() => import('./pages_cs.jsx').then(m => ({ default: m.BICustomerSuccess })));
const TurnosHorarios    = lazy(() => import('./pages_turnos.jsx').then(m => ({ default: m.TurnosHorarios })));
const ApiKeys           = lazy(() => import('./pages_api_keys.jsx').then(m => ({ default: m.ApiKeys })));

// Páginas públicas (acceso directo por hash URL, sin autenticación)
const PaginaAceptacion    = lazy(() => import('./pages_aceptar.jsx').then(m => ({ default: m.PaginaAceptacion })));
const PaginaConformidadOT = lazy(() => import('./pages_aceptar.jsx').then(m => ({ default: m.PaginaConformidadOT })));
const PostulacionPublica  = lazy(() => import('./pages_reclutamiento.jsx').then(m => ({ default: m.PostulacionPublica })));

// ─── iOS Install Banner ───────────────────────────────────────────────────────

function IOSShareIcon() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: 'rgba(255,255,255,0.13)', borderRadius: 5,
      padding: '1px 6px', fontSize: 11, color: '#fff', verticalAlign: 'middle',
    }}>
      <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
        <path d="M5 8V1.5M5 1.5L2.5 4M5 1.5L7.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M1 6.5V11.5C1 12.0523 1.44772 12.5 2 12.5H8C8.55228 12.5 9 12.0523 9 11.5V6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      Compartir
    </span>
  );
}

function IOSInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem('tideo_ios_banner_dismissed') === '1';

    if (isIOS && !isStandalone && !dismissed) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem('tideo_ios_banner_dismissed', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 12, right: 12, zIndex: 99999,
      background: '#1A2B4A',
      border: '1px solid rgba(255,255,255,0.1)',
      borderTop: '2px solid rgba(0,188,212,0.5)',
      borderRadius: 16,
      padding: '14px 14px 14px 16px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 12,
      maxWidth: 440, margin: '0 auto',
    }}>
      <img src="/icons/tideo-icon-192.png" alt="" style={{ width: 42, height: 42, borderRadius: 9, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
          Instala TIDEO ERP
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
          Toca <IOSShareIcon /> y luego{' '}
          <span style={{ color: '#fff', fontWeight: 600 }}>"Agregar a pantalla de inicio"</span>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Cerrar"
        style={{
          flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: 'none',
          borderRadius: 8, color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          fontSize: 18, lineHeight: 1, padding: '5px 8px',
        }}
      >×</button>
    </div>
  );
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const PLATFORM_PAGES = new Set(['tenants', 'planes', 'metricas_saas']);

function PageLoader() {
  return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <span className="text-muted" style={{ fontSize: 13 }}>Cargando módulo…</span>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[App render error]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell" style={{alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24}}>
        <div className="card" style={{width:'min(720px, 100%)', padding:28}}>
          <div className="eyebrow">Error de pantalla</div>
          <div className="font-display" style={{fontSize:24, fontWeight:800, marginTop:6}}>No se pudo abrir este módulo</div>
          <p className="text-muted" style={{marginTop:8}}>
            La app capturó un error de render. Copia este mensaje si vuelve a aparecer.
          </p>
          <pre style={{whiteSpace:'pre-wrap', background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:8, padding:12, fontSize:12, marginTop:16}}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}

function ToastContainer() {
  const { toasts, removeToast, navigate } = useApp();
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#fffbeb',
          border: '1px solid #f59e0b',
          borderLeft: '4px solid #f59e0b',
          borderRadius: 8,
          padding: '12px 14px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.5 }}>{t.text}</p>
            <button
              onClick={() => removeToast(t.id)}
              style={{ marginLeft: 'auto', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontSize: 16, lineHeight: 1, padding: 0 }}
              title="Cerrar"
            >×</button>
          </div>
          {t.link && (
            <button
              onClick={() => { navigate(t.link.modulo, t.link.params || {}); removeToast(t.id); }}
              style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid #f59e0b', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#92400e', cursor: 'pointer', fontWeight: 600 }}
            >
              {t.link.label} →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Layout principal ─────────────────────────────────────────────────────────

function MainLayout() {
  const {
    active, navigate, role, roleKey, setRoleKey, isSuperadmin,
    empresa, setEmpresa, dark, setDark, mobileMode, setMobileMode,
    mobileProfile, setMobileProfile
  } = useApp();
  const [openSelectorSignal, setOpenSelectorSignal] = useState(0);

  const allowed = role.permisos.todo ? null : new Set(role.permisos.ver || []);

  useEffect(() => {
    document.documentElement.className = dark ? 'dark' : '';
  }, [dark]);

  useEffect(() => {
    if (active === 'campo') { setMobileMode(true); return; }
    if (!isSuperadmin && PLATFORM_PAGES.has(active)) {
      navigate('dashboard');
      return;
    }
    if (allowed && active !== 'mi_portal' && !allowed.has(active)) {
      navigate('dashboard');
    }
  }, [roleKey, active, isSuperadmin]);

  if (mobileMode) {
    return (
      <Suspense fallback={<PageLoader />}>
        <MobileFieldView onExit={() => setMobileMode(false)} profile={mobileProfile} setProfile={setMobileProfile} dark={dark} setDark={setDark}/>
      </Suspense>
    );
  }

  const Page = () => {
    switch (active) {
      case 'dashboard':        return <Dashboard role={role}/>;
      case 'bi_comercial':     return <BIComercial />;
      case 'bi_operativo':     return <BIOperativo />;
      case 'marketing':        return <Marketing />;
      case 'planner':          return <Planner />;
      case 'mi_portal':        return <MiPortal />;
      case 'rrhh_operativo':   return <RRHH_Operativo />;
      case 'reclutamiento':    return <Reclutamiento />;
      case 'asistencia':       return <ControlAsistencia />;
      case 'turnos':           return <TurnosHorarios />;
      case 'nomina':           return <Nomina />;
      case 'comisiones':          return <Comisiones />;
      case 'solicitudes_rrhh':    return <SolicitudesRrhh />;
      case 'tareo_admin':         return <TareoAdmin />;
      case 'control_horas':       return <ControlHoras />;
      case 'evaluaciones_desempeno': return <EvaluacionesDesempeno />;
      case 'liquidaciones_cese':    return <LiquidacionesCese />;
      case 'tickets':          return <Tickets />;
      case 'presupuestos':     return <Presupuestos />;
      case 'cuentas':          return <Cuentas/>;
      case 'leads':            return <Leads/>;
      case 'pipeline':         return <Pipeline/>;
      case 'ot':               return <OT role={role}/>;
      case 'partes':           return <Partes/>;
      case 'proveedores':      return <Proveedores/>;
      case 'cot_compras':      return <CotizacionesCompras/>;
      case 'ordenes_compra':   return <OrdenesCompra/>;
      case 'ordenes_servicio': return <OrdenesServicio/>;
      case 'recepciones':      return <Recepciones/>;
      case 'compras_gastos':   return <ComprasGastos/>;
      case 'compras':          return <Compras/>;
      case 'cxc':              return <CxC/>;
      case 'tesoreria':        return <Tesoreria/>;
      case 'resultados':       return <Resultados role={role}/>;
      case 'facturacion':      return <Facturacion/>;
      case 'roles':            return <Roles/>;
      case 'usuarios':         return <Usuarios/>;
      case 'organigrama':      return <Organigrama/>;
      case 'tenants':          return isSuperadmin ? <Tenants/> : <Dashboard role={role}/>;
      case 'planes':           return isSuperadmin ? <Planes/> : <Dashboard role={role}/>;
      case 'actividades':      return <Actividades/>;
      case 'agenda_comercial': return <AgendaComercial/>;
      case 'hoja_costeo':      return <HojaCosteo/>;
      case 'cotizaciones':     return <Cotizaciones/>;
      case 'os_cliente':       return <OSCliente/>;
      case 'backlog':          return <Backlog/>;
      case 'cierre':           return <Cierre/>;
      case 'remision':         return <Remision/>;
      case 'valorizacion':     return <Valorizacion role={role}/>;
      case 'inventario':       return <Inventario/>;
      case 'solpe':            return <SOLPE/>;
      case 'ventas':           return <Ventas/>;
      case 'caja':             return <CajaChica/>;
      case 'activos_fijos':    return <ActivosFijos/>;
      case 'prestamos_personal': return <PrestamosPersonal/>;
      case 'financiamiento':   return <FinanciamientoDeuda/>;
      case 'cxp':              return <CxP/>;
      case 'maestros':         return <Maestros/>;
      case 'servicios':        return <Servicios/>;
      case 'tarifarios':       return <Tarifarios/>;
      case 'parametros':       return <Parametros/>;
      case 'rrhh_admin':       return <RRHHAdmin/>;
      case 'metricas_saas':    return isSuperadmin ? <MetricasSaaS/> : <Dashboard role={role}/>;
      case 'api_keys':         return <ApiKeys/>;
      case 'cs_onboarding':    return <CSOnboarding/>;
      case 'cs_planes':        return <CSPlanes/>;
      case 'cs_health':        return <CSHealthScore/>;
      case 'cs_renovaciones':  return <CSRenovaciones/>;
      case 'cs_fidelizacion':  return <CSFidelizacion/>;
      case 'bi_cs':            return <BICustomerSuccess/>;
      case 'ia_comercial':     return <IAComercial/>;
      case 'ia_operativa':     return <IAOperativa/>;
      case 'ia_financiera':    return <IAFinanciera/>;
      case 'bi_financiero':    return <BIFinanciero/>;
      default:                 return <Dashboard role={role}/>;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} onNav={(p) => navigate(p)} role={role} isSuperadmin={isSuperadmin}/>
      <div className="main-col">
        <Header active={active} empresa={empresa} setEmpresa={setEmpresa} role={role} roleKey={roleKey} setRoleKey={setRoleKey} dark={dark} setDark={setDark} setMobileMode={setMobileMode} openSelectorSignal={openSelectorSignal}/>
        {isSuperadmin && empresa?.es_plataforma && (
          <div style={{background:'#7c3aed', color:'#fff', padding:'8px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, fontSize:13}}>
            <span>⚠️ Estás operando en el contexto de plataforma. Para gestión interna de TIDEO usa el tenant empresa.</span>
            <button
              className="btn btn-sm"
              style={{background:'rgba(255,255,255,0.18)', color:'#fff', border:'1px solid rgba(255,255,255,0.35)', whiteSpace:'nowrap', flexShrink:0}}
              onClick={() => setOpenSelectorSignal(v => v + 1)}
            >
              Cambiar empresa
            </button>
          </div>
        )}
        <main className="main">
          <Suspense fallback={<PageLoader />}>
            {Page()}
          </Suspense>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

// ─── Raíz de la app ───────────────────────────────────────────────────────────

export default function App() {
  const hash = window.location.hash;

  if (hash.startsWith('#aceptar/')) {
    const token = hash.slice('#aceptar/'.length).split('?')[0];
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PaginaAceptacion token={token} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (hash.startsWith('#conformidad-ot/')) {
    const token = hash.slice('#conformidad-ot/'.length).split('?')[0];
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PaginaConformidadOT token={token} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (hash.startsWith('#postular/')) {
    const token = hash.slice('#postular/'.length).split('?')[0];
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PostulacionPublica token={token} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <>
      <ErrorBoundary>
        <AppProvider>
          <AuthGate>
            <MainLayout />
          </AuthGate>
        </AppProvider>
      </ErrorBoundary>
      <IOSInstallBanner />
    </>
  );
}
