import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context.jsx';
import { AuthGate } from './AuthGate.jsx';
import { Sidebar, Header } from './shell.jsx';

import { Roles, Usuarios, Tenants, Planes, Stub, Maestros, Servicios, Tarifarios, Parametros, RRHHAdmin, MetricasSaaS, Organigrama, Comisiones } from './pages_admin.jsx';
import { CSOnboarding, CSPlanes, CSHealthScore, CSRenovaciones, CSFidelizacion, BICustomerSuccess } from './pages_cs.jsx';
import { IAComercial, IAOperativa, IAFinanciera } from './pages_ia.jsx';
import { BIFinanciero } from './pages_bi_fin.jsx';
import { Dashboard, Leads, Pipeline, Actividades, AgendaComercial, OSCliente, Marketing, BIComercial, BIOperativo } from './pages_core.jsx';
import { Cotizaciones, Valorizacion, Inventario, HojaCosteo } from './pages_extra.jsx';
import { PaginaAceptacion, PaginaConformidadOT } from './pages_aceptar.jsx';
import { CxC, Tesoreria, Resultados, Facturacion, Ventas, CajaChica, PrestamosPersonal, CxP, Presupuestos } from './pages_fin.jsx';
import { FinanciamientoDeuda } from './pages_fin_deuda.jsx';
import { MobileFieldView } from './pages_mobile.jsx';
import { Cuentas, OT, Partes, Compras, Proveedores, CotizacionesCompras, OrdenesCompra, OrdenesServicio, Recepciones, ControlAsistencia, Nomina, Backlog, Cierre, Remision, SOLPE, Planner, Tickets, RRHH_Operativo } from './pages_ops.jsx';
import { TurnosHorarios } from './pages_turnos.jsx';
import { ApiKeys } from './pages_api_keys.jsx';
import { MOCK } from './data.js';

const PLATFORM_PAGES = new Set(['tenants', 'planes', 'metricas_saas']);

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

  // Auto-redirect if current page is not allowed for role
  useEffect(() => {
    if (active === 'campo') { setMobileMode(true); return; }
    if (!isSuperadmin && PLATFORM_PAGES.has(active)) {
      navigate('dashboard');
      return;
    }
    if (allowed && !allowed.has(active)) {
      navigate('dashboard');
    }
  }, [roleKey, active, isSuperadmin]);

  if (mobileMode) {
    return <MobileFieldView onExit={() => setMobileMode(false)} profile={mobileProfile} setProfile={setMobileProfile} dark={dark} setDark={setDark}/>;
  }

  const Page = () => {
    switch (active) {
      case 'dashboard': return <Dashboard role={role}/>;
      case 'bi_comercial': return <BIComercial />;
      case 'bi_operativo': return <BIOperativo />;
      case 'marketing': return <Marketing />;
      case 'planner': return <Planner />;
      case 'rrhh_operativo': return <RRHH_Operativo />;
      case 'asistencia': return <ControlAsistencia />;
      case 'turnos': return <TurnosHorarios />;
      case 'nomina': return <Nomina />;
      case 'comisiones': return <Comisiones />;
      case 'tickets': return <Tickets />;
      case 'presupuestos': return <Presupuestos />;
      case 'cuentas': return <Cuentas/>;
      case 'leads': return <Leads/>;
      case 'pipeline': return <Pipeline/>;
      case 'ot': return <OT role={role}/>;
      case 'partes': return <Partes/>;
      case 'proveedores': return <Proveedores/>;
      case 'cot_compras': return <CotizacionesCompras/>;
      case 'ordenes_compra': return <OrdenesCompra/>;
      case 'ordenes_servicio': return <OrdenesServicio/>;
      case 'recepciones': return <Recepciones/>;
      case 'compras': return <Compras/>;
      case 'cxc': return <CxC/>;
      case 'tesoreria': return <Tesoreria/>;
      case 'resultados': return <Resultados role={role}/>;
      case 'facturacion': return <Facturacion/>;
      case 'roles': return <Roles/>;
      case 'usuarios': return <Usuarios/>;
      case 'organigrama': return <Organigrama/>;
      case 'tenants': return isSuperadmin ? <Tenants/> : <Dashboard role={role}/>;
      case 'planes': return isSuperadmin ? <Planes/> : <Dashboard role={role}/>;
      case 'actividades': return <Actividades/>;
      case 'agenda_comercial': return <AgendaComercial/>;
      case 'hoja_costeo': return <HojaCosteo/>;
      case 'cotizaciones': return <Cotizaciones/>;
      case 'os_cliente': return <OSCliente/>;
      case 'backlog': return <Backlog/>;
      case 'cierre': return <Cierre/>;
      case 'remision': return <Remision/>;
      case 'valorizacion': return <Valorizacion role={role}/>;
      case 'inventario': return <Inventario/>;
      case 'solpe': return <SOLPE/>;
      case 'ventas': return <Ventas/>;
      case 'caja': return <CajaChica/>;
      case 'prestamos_personal': return <PrestamosPersonal/>;
      case 'financiamiento': return <FinanciamientoDeuda/>;
      case 'cxp': return <CxP/>;
      case 'maestros': return <Maestros/>;
      case 'servicios': return <Servicios/>;
      case 'tarifarios': return <Tarifarios/>;
      case 'parametros': return <Parametros/>;
      case 'rrhh_admin': return <RRHHAdmin/>;
      case 'metricas_saas': return isSuperadmin ? <MetricasSaaS/> : <Dashboard role={role}/>;
      case 'api_keys': return <ApiKeys/>;
      case 'cs_onboarding': return <CSOnboarding/>;
      case 'cs_planes': return <CSPlanes/>;
      case 'cs_health': return <CSHealthScore/>;
      case 'cs_renovaciones': return <CSRenovaciones/>;
      case 'cs_fidelizacion': return <CSFidelizacion/>;
      case 'bi_cs': return <BICustomerSuccess/>;
      case 'ia_comercial': return <IAComercial/>;
      case 'ia_operativa': return <IAOperativa/>;
      case 'ia_financiera': return <IAFinanciera/>;
      case 'bi_financiero': return <BIFinanciero/>;
      default: return <Dashboard role={role}/>;
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
          {Page()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const hash = window.location.hash;
  if (hash.startsWith('#aceptar/')) {
    const token = hash.slice('#aceptar/'.length).split('?')[0];
    return <ErrorBoundary><PaginaAceptacion token={token} /></ErrorBoundary>;
  }
  if (hash.startsWith('#conformidad-ot/')) {
    const token = hash.slice('#conformidad-ot/'.length).split('?')[0];
    return <ErrorBoundary><PaginaConformidadOT token={token} /></ErrorBoundary>;
  }
  return (
    <ErrorBoundary>
      <AppProvider>
        <AuthGate>
          <MainLayout />
        </AuthGate>
      </AppProvider>
    </ErrorBoundary>
  );
}
