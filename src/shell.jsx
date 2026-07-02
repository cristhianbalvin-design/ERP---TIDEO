// Shell: sidebar + header + role simulator + company selector + dark toggle

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';


const SIDEBAR = [
  { section: 'Business Intelligence', items: [
    { key: 'dashboard', label: 'Dashboard General', icon: I.dashboard },
    { key: 'bi_comercial', label: 'BI Comercial', icon: I.trend },
    { key: 'bi_operativo', label: 'BI Operativo', icon: I.trend },
    { key: 'bi_financiero', label: 'BI Financiero', icon: I.trend },
  ]},
  { section: 'Plataforma', plataforma: true, items: [
    { key: 'tenants', label: 'Empresas / Tenants', icon: I.building },
    { key: 'planes', label: 'Planes y Licencias', icon: I.package },
    { key: 'metricas_saas', label: 'Metricas SaaS', icon: I.trend },
  ]},
  { section: 'Integraciones', items: [
    { key: 'api_keys', label: 'API Keys', icon: I.lock },
  ]},
  { section: 'CRM & Marketing', items: [
    { key: 'cuentas', label: 'Cuentas y Contactos', icon: I.users },
    { key: 'leads', label: 'Leads y Scoring', icon: I.target },
    { key: 'marketing', label: 'Marketing Automation', icon: I.plus },
    { key: 'pipeline', label: 'Pipeline', icon: I.pipe },
    { key: 'actividades', label: 'Actividades', icon: I.calendar },
  ]},
  { section: 'Comercial', items: [
    { key: 'agenda_comercial', label: 'Agenda Comercial', icon: I.calendar },
    { key: 'hoja_costeo', label: 'Hoja de Costeo', icon: I.receipt },
    { key: 'cotizaciones', label: 'Cotizaciones', icon: I.file },
    { key: 'os_cliente', label: 'OS Cliente', icon: I.clipboard },
  ]},
  { section: 'Operaciones', items: [
    { key: 'planner', label: 'Planner y Recursos', icon: I.calendar },
    { key: 'backlog', label: 'Backlog', icon: I.list },
    { key: 'ot', label: 'Ordenes de Trabajo', icon: I.wrench },
    { key: 'partes', label: 'Partes Diarios', icon: I.clipboard },
    { key: 'cierre', label: 'Cierre y Calidad', icon: I.check },
    { key: 'tickets', label: 'Soporte y Tickets', icon: I.alert },
  ]},
  { section: 'RRHH', items: [
    { key: 'mi_portal', label: 'Mi portal', icon: I.userCheck },
    { key: 'reclutamiento', label: 'Reclutamiento', icon: I.target },
    { key: 'rrhh_operativo', label: 'Personal Operativo', icon: I.wrench },
    { key: 'rrhh_admin', label: 'Personal Administrativo', icon: I.users },
    { key: 'asistencia', label: 'Control de Asistencia', icon: I.clock },
    { key: 'turnos', label: 'Turnos y Horarios', icon: I.calendar },
    { key: 'nomina', label: 'Nomina', icon: I.receipt },
    { key: 'comisiones', label: 'Comisiones', icon: I.percent },
    { key: 'solicitudes_rrhh', label: 'Solicitudes', icon: I.clipboard },
    { key: 'prestamos_personal', label: 'Prestamos al Personal', icon: I.userCheck },
    { key: 'tareo_admin', label: 'Tareo Administrativo', icon: I.clock },
    { key: 'control_horas', label: 'Control de Horas', icon: I.clock },
    { key: 'evaluaciones_desempeno', label: 'Evaluación de Desempeño', icon: I.target },
    { key: 'liquidaciones_cese', label: 'Liquidación por Cese', icon: I.receipt },
  ]},
  { section: 'Logistica', items: [
    { key: 'inventario', label: 'Almacenes', icon: I.warehouse },
    { key: 'solpe', label: 'SOLPE Interna', icon: I.clipboard },
    { key: 'remision', label: 'Transporte y Guias', icon: I.truck },
  ]},
  { section: 'Compras', items: [
    { key: 'proveedores', label: 'Proveedores', icon: I.users },
    { key: 'cot_compras', label: 'Cotizaciones', icon: I.file },
    { key: 'ordenes_compra', label: 'Ordenes de Compra', icon: I.cart },
    { key: 'ordenes_servicio', label: 'Ordenes de Servicio', icon: I.wrench },
    { key: 'recepciones', label: 'Recepciones', icon: I.check },
    { key: 'compras_gastos', label: 'Compras / Gastos', icon: I.receipt },
  ]},
  { section: 'Administracion', items: [
    { key: 'ventas', label: 'Ventas', icon: I.store },
    { key: 'caja', label: 'Caja Chica', icon: I.card },
    { key: 'activos_fijos', label: 'Activos Fijos', icon: I.package },
    { key: 'financiamiento', label: 'Financiamiento y Deuda', icon: I.bank },
    { key: 'cxc', label: 'Cuentas por Cobrar', icon: I.dollar },
    { key: 'cxp', label: 'Cuentas por Pagar', icon: I.dollar },
    { key: 'facturacion', label: 'Facturacion', icon: I.receipt },
    { key: 'tesoreria', label: 'Tesoreria / Match', icon: I.bank },
    { key: 'resultados', label: 'Estado Resultados', icon: I.trend },
    { key: 'valorizacion', label: 'Valorizaciones', icon: I.dollar },
    { key: 'presupuestos', label: 'Presupuesto vs Real', icon: I.trend },
  ]},
  { section: 'Customer Success', items: [
    { key: 'cs_onboarding', label: 'Onboarding', icon: I.users },
    { key: 'cs_planes', label: 'Planes de Exito', icon: I.target },
    { key: 'cs_health', label: 'Health Score', icon: I.trend },
    { key: 'cs_renovaciones', label: 'Renovaciones', icon: I.calendar },
    { key: 'cs_fidelizacion', label: 'Fidelizacion y NPS', icon: I.sparkles },
    { key: 'bi_cs', label: 'BI Customer Success', icon: I.trend },
  ]},
  { section: 'Inteligencia Artificial', items: [
    { key: 'ia_comercial', label: 'IA Comercial', icon: I.sparkles },
    { key: 'ia_operativa', label: 'IA Operativa', icon: I.sparkles },
    { key: 'ia_financiera', label: 'IA Financiera', icon: I.sparkles },
  ]},
  { section: 'Campo Movil', items: [
    { key: 'campo', label: 'Vistas de Campo', icon: I.mobile },
  ]},
  { section: 'Configuracion', items: [
    { key: 'usuarios', label: 'Usuarios', icon: I.users },
    { key: 'organigrama', label: 'Organigrama', icon: I.users },
    { key: 'roles', label: 'Roles y Permisos', icon: I.shield },
    { key: 'maestros', label: 'Maestros Base', icon: I.settings },
    { key: 'parametros', label: 'Parametros Generales', icon: I.settings },
    { key: 'servicios', label: 'Catalogo Servicios', icon: I.package },
    { key: 'tarifarios', label: 'Tarifarios', icon: I.dollar },
  ]},
];

if (import.meta.env.DEV) {
  const pantallasRegistradas = new Set(MOCK.pantallasPermisos.map(p => p.key));
  const faltantes = SIDEBAR.flatMap(g => g.items)
    .map(it => it.key)
    .filter(key => key !== 'mi_portal' && !pantallasRegistradas.has(key));
  if (faltantes.length) {
    console.warn(
      `[Roles y Permisos] ${faltantes.length} pantalla(s) del sidebar no estan registradas en MOCK.pantallasPermisos y quedaran ocultas para todo rol sin acceso total: ${faltantes.join(', ')}`
    );
  }
}

const SECTION_ICONS = {
  'Business Intelligence': I.dashboard,
  Plataforma: I.building,
  'CRM & Marketing': I.users,
  Comercial: I.file,
  Operaciones: I.wrench,
  RRHH: I.userCheck,
  Logistica: I.warehouse,
  Compras: I.cart,
  Administracion: I.bank,
  'Customer Success': I.target,
  'Inteligencia Artificial': I.sparkles,
  'Campo Movil': I.mobile,
  Configuracion: I.settings,
};

const sectionKey = section => String(section || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
const norm = value => String(value || '').toLowerCase();
const dateValue = value => {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const dayMs = 24 * 60 * 60 * 1000;
const daysUntil = (value, today) => {
  const date = dateValue(value);
  if (!date) return null;
  return Math.floor((date.getTime() - today.getTime()) / dayMs);
};
const isOpenStatus = value => !['cerrado', 'cerrada', 'cancelado', 'cancelada', 'anulado', 'anulada', 'pagada', 'pagado', 'aprobada', 'aprobado', 'convertido', 'convertida', 'realizado', 'realizada', 'completada', 'completado', 'conforme'].includes(norm(value));
const capBadge = value => value > 99 ? '99+' : value > 0 ? value : null;

function buildSidebarBadges(app) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueIn = (value, days = 7) => {
    const delta = daysUntil(value, today);
    return delta !== null && delta <= days;
  };
  const overdue = value => {
    const delta = daysUntil(value, today);
    return delta !== null && delta < 0;
  };

  const leads = app.leads || [];
  const oportunidades = app.oportunidades || [];
  const actividades = app.actividades || [];
  const agendaEventos = app.agendaEventos || [];
  const hojasCosteo = app.hojasCosteo || [];
  const cotizaciones = app.cotizaciones || [];
  const osClientes = app.osClientes || [];
  const backlog = app.backlog || [];
  const ots = app.ots || [];
  const partes = app.partes || [];
  const solpes = app.solpes || [];
  const procesosCompra = app.procesosCompra || [];
  const ordenesCompra = app.ordenesCompra || [];
  const ordenesServicio = app.ordenesServicio || [];
  const recepciones = app.recepciones || [];
  const cxc = app.cxc || [];
  const cxp = app.cxp || [];
  const facturas = app.facturas || [];
  const valorizaciones = app.valorizaciones || [];
  const financiamientos = app.financiamientos || [];
  const movimientosBanco = app.movimientosBanco || [];
  const evaluacionesDesempeno = app.evaluacionEvaluaciones || [];
  const plantillasEvaluacion = app.evaluacionPlantillas || [];
  const personalEvaluable = [...(app.personalOperativo || []), ...(app.personalAdmin || [])];
  const currentUserId = app.authUser?.id || null;
  const ownPersonalIds = new Set(personalEvaluable
    .filter(p => currentUserId && String(p.auth_user_id || '') === String(currentUserId))
    .map(p => String(p.id)));
  const plantillaById = new Map(plantillasEvaluacion.map(p => [String(p.id), p]));
  const isEvalTemplateOpen = ev => plantillaById.get(String(ev.plantilla_id))?.estado !== 'cerrada';

  const todayIso = today.toISOString().slice(0, 10);
  const facturaValorizaciones = new Set(facturas.map(f => f.valorizacion_id || f.valorizacionId).filter(Boolean));

  return {
    leads: leads.filter(l => !l.convertido && ['nuevo', 'sin_contacto', 'pendiente'].includes(norm(l.estado))).length,
    pipeline: new Set([
      ...oportunidades.filter(o => isOpenStatus(o.estado) && (overdue(o.fecha_cierre) || overdue(o.fecha_proximo_contacto) || overdue(o.proxima_accion_fecha))).map(o => o.id),
      ...oportunidades.filter(o => norm(o.acuerdo_estado) === 'pendiente').map(o => o.id),
    ]).size,
    actividades: actividades.filter(a => isOpenStatus(a.estado) && (dueIn(a.fecha, 0) || dueIn(a.proxima_accion_fecha, 0))).length,
    agenda_comercial: agendaEventos.filter(e => isOpenStatus(e.estado) && String(e.fecha || '').slice(0, 10) === todayIso).length,
    hoja_costeo: hojasCosteo.filter(h => ['en_revision', 'pendiente_aprobacion', 'por_aprobar'].includes(norm(h.estado))).length,
    cotizaciones: cotizaciones.filter(c => ['pendiente_aprobacion', 'por_aprobar'].includes(norm(c.estado)) || (isOpenStatus(c.estado) && overdue(c.valida_hasta))).length,
    os_cliente: osClientes.filter(os => isOpenStatus(os.estado) && (Number(os.saldo_por_ejecutar || 0) > 0 || Number(os.saldo_por_facturar || 0) > 0 || dueIn(os.fecha_fin, 7))).length,
    backlog: backlog.filter(b => isOpenStatus(b.estado) && ['alta', 'urgente', 'critica'].includes(norm(b.prioridad))).length,
    ot: ots.filter(ot => isOpenStatus(ot.estado) && (['riesgo', 'vencido', 'vencida'].includes(norm(ot.sla)) || overdue(ot.fecha_fin) || !ot.responsable)).length,
    partes: partes.filter(p => ['en_revision', 'pendiente', 'pendiente_aprobacion'].includes(norm(p.estado))).length,
    cierre: ots.filter(ot => ['terminada', 'finalizada', 'completada'].includes(norm(ot.estado)) || norm(ot.estado) === 'observada').length,
    solpe: solpes.filter(s => ['solicitada', 'pendiente', 'pendiente_aprobacion'].includes(norm(s.estado))).length,
    cot_compras: procesosCompra.filter(p => ['esperando_respuesta', 'pendiente', 'comparativo_pendiente'].includes(norm(p.estado)) || overdue(p.fecha_limite)).length,
    ordenes_compra: ordenesCompra.filter(oc => isOpenStatus(oc.estado) && Number(oc.porcentaje_recibido ?? 0) < 100).length,
    ordenes_servicio: ordenesServicio.filter(os => isOpenStatus(os.estado) && dueIn(os.fecha_fin, 7)).length,
    recepciones: recepciones.filter(r => ['observada', 'pendiente', 'pendiente_conformidad'].includes(norm(r.estado)) || norm(r.tipo) === 'observada').length,
    cxc: cxc.filter(c => Number(c.saldo ?? c.saldo_pendiente ?? 0) > 0 && (norm(c.estado) === 'vencida' || Number(c.mora || 0) > 0 || overdue(c.vence || c.vencimiento))).length,
    cxp: cxp.filter(c => !['pagada', 'pagado'].includes(norm(c.estado)) && (norm(c.estado) === 'vencido' || dueIn(c.vencimiento || c.vence, 7))).length,
    facturacion: valorizaciones.filter(v => ['aprobada', 'por_facturar'].includes(norm(v.estado)) && !facturaValorizaciones.has(v.id)).length,
    tesoreria: movimientosBanco.filter(m => m.conciliado === false || m.vinculado === null).length,
    financiamiento: financiamientos.reduce((total, f) => total + (f.tabla_amortizacion || []).filter(c => !['pagada', 'pagado'].includes(norm(c.estado)) && dueIn(c.fecha, 7)).length, 0),
    solicitudes_rrhh: 0,
    evaluaciones_desempeno: evaluacionesDesempeno.filter(e =>
      isEvalTemplateOpen(e) && (
        (ownPersonalIds.has(String(e.evaluado_id)) && e.estado === 'pendiente') ||
        (currentUserId && String(e.jefe_id || '') === String(currentUserId) && e.estado === 'autoevaluacion_completa')
      )
    ).length,
  };
}

export function Sidebar({ active, onNav, role, isSuperadmin }) {
  const app = useApp();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('tideo_sidebar_collapsed') === 'true');
  const [isMobileNav, setIsMobileNav] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);
  const [flyoutKey, setFlyoutKey] = useState(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const effectiveCollapsed = collapsed || isMobileNav;
  const allowed = role.permisos.todo ? null : new Set(role.permisos.ver || []);
  const badges = useMemo(() => buildSidebarBadges(app), [
    app.leads, app.oportunidades, app.actividades, app.agendaEventos, app.hojasCosteo,
    app.cotizaciones, app.osClientes, app.backlog, app.ots, app.partes, app.solpes,
    app.procesosCompra, app.ordenesCompra, app.ordenesServicio, app.recepciones,
    app.cxc, app.cxp, app.facturas, app.valorizaciones, app.financiamientos, app.movimientosBanco,
    app.evaluacionEvaluaciones, app.evaluacionPlantillas, app.personalOperativo, app.personalAdmin, app.authUser?.id
  ]);
  const visibleGroups = useMemo(() => SIDEBAR.map(group => {
    if (group.plataforma && !isSuperadmin) return null;
    const visibleItems = group.items
      .filter(it => it.key === 'mi_portal' || !allowed || allowed.has(it.key))
      .map(it => ({ ...it, badge: capBadge(badges[it.key]) }));
    if (visibleItems.length === 0) return null;
    const key = sectionKey(group.section);
    return {
      ...group,
      key,
      icon: SECTION_ICONS[group.section] || visibleItems[0]?.icon || I.package,
      items: visibleItems,
      active: visibleItems.some(it => it.key === active),
    };
  }).filter(Boolean), [active, allowed, badges, isSuperadmin]);
  const activeGroupKey = visibleGroups.find(group => group.active)?.key || visibleGroups[0]?.key || '';
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tideo_sidebar_open_sections') || 'null');
      if (Array.isArray(saved) && saved.length) return new Set(saved);
    } catch {}
    return new Set();
  });

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const onChange = () => {
      setIsMobileNav(media.matches);
      if (media.matches) setFlyoutKey(null);
    };
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenSections(prev => {
      if (prev.has(activeGroupKey)) return prev;
      const next = new Set(prev);
      next.add(activeGroupKey);
      localStorage.setItem('tideo_sidebar_open_sections', JSON.stringify([...next]));
      return next;
    });
  }, [activeGroupKey]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('tideo_sidebar_collapsed', String(next));
      setFlyoutKey(null);
      return next;
    });
  };
  const toggleSection = key => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('tideo_sidebar_open_sections', JSON.stringify([...next]));
      return next;
    });
  };
  const handleNav = key => {
    setFlyoutKey(null);
    onNav(key);
  };
  const toggleFlyout = (event, key) => {
    if (flyoutKey === key) {
      setFlyoutKey(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTop = isMobileNav
      ? Math.max(8, Math.min(rect.top, window.innerHeight - 280))
      : 0;
    setFlyoutTop(nextTop);
    setFlyoutKey(key);
  };

  return (
    <aside className={'sidebar ' + (effectiveCollapsed ? 'collapsed' : '')}>
      <div className="sidebar-logo">
        <div style={{width:34, height:34, background:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:4, overflow:'hidden', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
          <img src="/tideo-isotipo.png" alt="TIDEO" style={{width:'100%', height:'100%', objectFit:'contain'}} />
        </div>
        {!effectiveCollapsed && <div>
          <div className="sidebar-logo-text" style={{letterSpacing:'0.05em'}}>TIDEO</div>
          <div className="sidebar-logo-sub" style={{opacity:0.6, fontSize:10, fontWeight:700, letterSpacing:'0.1em'}}>ERP</div>
        </div>}
      </div>
      <nav className="sidebar-nav" style={{padding:'10px 12px'}}>
        {visibleGroups.map(group => {
          const isOpen = openSections.has(group.key);
          return (
            <div key={group.key} className="sidebar-group">
              {effectiveCollapsed ? (
                <>
                  <button
                    type="button"
                    className={'sidebar-area-btn ' + (group.active ? 'active' : '')}
                    onClick={(event) => toggleFlyout(event, group.key)}
                    title={group.section}
                    aria-label={group.section}
                  >
                    {group.icon}
                    {group.items.some(it => it.badge) && <span className="sidebar-area-dot" />}
                  </button>
                  {flyoutKey === group.key && (
                    <div className="sidebar-flyout" style={isMobileNav ? { top: flyoutTop } : undefined} onMouseLeave={() => setFlyoutKey(null)}>
                      <div className="sidebar-flyout-title">{group.section}</div>
                      {group.items.map(it => (
                        <button
                          type="button"
                          key={it.key}
                          className={'sidebar-flyout-item ' + (active === it.key ? 'active' : '')}
                          onClick={() => handleNav(it.key)}
                        >
                          {it.icon}
                          <span>{it.label}</span>
                          {it.badge && <span className="sidebar-item-badge">{it.badge}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={'sidebar-section-toggle ' + (group.active ? 'active' : '')}
                    onClick={() => toggleSection(group.key)}
                  >
                    <span className="sidebar-section-icon">{group.icon}</span>
                    <span>{group.section}</span>
                    <span className="sidebar-section-chev">{isOpen ? I.chev : I.chevRight}</span>
                  </button>
                  {isOpen && group.items.map(it => (
                    <div key={it.key} className={'sidebar-item ' + (active === it.key ? 'active' : '')} onClick={() => handleNav(it.key)} style={{padding:'8px 10px', fontSize:12, borderRadius:8}}>
                      {it.icon}
                      <span style={{fontWeight:500}}>{it.label}</span>
                      {it.badge && <span className="sidebar-item-badge" style={{fontSize:9, padding:'1px 5px'}}>{it.badge}</span>}
                    </div>
                  ))}
                </>
              )}
                </div>
          );
        })}
      </nav>
      <button
        type="button"
        className="sidebar-collapse"
        onClick={toggleCollapsed}
        style={isMobileNav ? {display:'none'} : undefined}
        title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
        aria-label={collapsed ? 'Expandir menu' : 'Colapsar menu'}
      >
        {collapsed ? I.chevRight : I.chevLeft}
        {!collapsed && !isMobileNav && <span>Colapsar</span>}
      </button>
    </aside>
  );
}

export function Header({ active, empresa, setEmpresa, role, setRoleKey, roleKey, dark, setDark, setMobileMode, openSelectorSignal }) {
  const { notificaciones, markNotificacionesRead, navigate, dataMode, authUser, todasMembresias, seleccionarEmpresa, signOut, tipoCambioHoy } = useApp();
  const [compOpen, setCompOpen] = useState(false);
  useEffect(() => { if (openSelectorSignal > 0) setCompOpen(true); }, [openSelectorSignal]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const title = SIDEBAR.flatMap(g => g.items).find(i => i.key === active)?.label || 'Dashboard';

  const isSupabase = dataMode === 'supabase';
  const canSwitchCompany = isSupabase ? todasMembresias.length > 1 : Boolean(role.permisos?.plataforma);
  const unreadCount = notificaciones.filter(n => !n.read).length;

  const avatarText = isSupabase && authUser?.email
    ? authUser.email.slice(0, 2).toUpperCase()
    : 'LM';

  const handleNotificacionClick = (n) => {
    markNotificacionesRead(n.id);
    if (n.referenceType === 'personal_documento') {
      const payload = n.referencePayload || {};
      const target = payload.personal_tipo === 'administrativo' ? 'rrhh_admin' : 'rrhh_operativo';
      navigate(target, {
        detail: payload.personal_id,
        tab: 'documentos',
        docTipo: payload.tipo_documento_id,
      });
      setNotiOpen(false);
    }
  };

  const empresaItems = isSupabase
    ? todasMembresias.map(m => ({
        id: m.empresa_id,
        nombre: m.empresa?.nombre_comercial || m.empresa?.razon_social || m.empresa_id,
        sub: m.rol?.nombre || '',
        color: m.rol?.es_superadmin ? '#1e3a5f' : '#0ea5e9',
        active: m.empresa_id === empresa?.id,
        onClick: () => { seleccionarEmpresa(m.empresa_id); setCompOpen(false); },
      }))
    : MOCK.empresas.map(e => ({
        id: e.id,
        nombre: e.nombre,
        sub: e.plan + ' · RUC ' + e.ruc,
        color: e.color,
        active: e.id === empresa?.id,
        onClick: () => { setEmpresa(e); setCompOpen(false); },
      }));

  return (
    <header className="header" style={{padding: isMobile ? '0 12px' : '0 20px', gap: isMobile ? 10 : 20}}>
      <div className="header-title font-display" style={{minWidth:0, flex:'0 1 auto', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth: isMobile ? 140 : 'none'}}>{title}</div>

      <div className="header-spacer"/>

      {/* Commit actual — oculto en móvil */}
      {!isMobile && (() => {
        const match = (typeof __COMMIT_MSG__ !== 'undefined' ? __COMMIT_MSG__ : '').match(/^(\d+)\s+cambios/i);
        const commitLabel = match ? match[1] : (typeof __COMMIT_MSG__ !== 'undefined' ? __COMMIT_MSG__ : '');
        if (!commitLabel) return null;
        return (
          <div
            title={typeof __COMMIT_MSG__ !== 'undefined' ? __COMMIT_MSG__ : ''}
            style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.01em', cursor: 'default', whiteSpace: 'nowrap', userSelect: 'none' }}
          >
            Commit: {commitLabel}
          </div>
        );
      })()}

      {/* TC tipo de cambio — oculto en móvil */}
      {!isMobile && tipoCambioHoy?.usd && !tipoCambioHoy.cargando && (() => {
        const tcUSD = Math.round(1 / tipoCambioHoy.usd * 100) / 100;
        const tcEUR = tipoCambioHoy.eur ? Math.round(1 / tipoCambioHoy.eur * 100) / 100 : null;
        const esHoy = tipoCambioHoy.fecha === new Date().toISOString().split('T')[0];
        const fechaLabel = esHoy ? 'hoy' : (tipoCambioHoy.fecha || '').slice(5).replace('-', '/');
        const tooltip = [
          `1 USD = S/ ${tcUSD.toFixed(2)}`,
          tcEUR ? `1 EUR = S/ ${tcEUR.toFixed(2)}` : '',
          `Fuente: ${tipoCambioHoy.fuente || 'open.er-api.com'}`,
          `Actualizado: ${(tipoCambioHoy.fecha || '').split('-').reverse().join('/')}`,
        ].filter(Boolean).join('\n');
        return (
          <div
            title={tooltip}
            style={{ fontSize: 11, fontWeight: 700, color: tipoCambioHoy.desactualizado ? '#f97316' : 'rgba(255,255,255,0.55)', letterSpacing: '0.01em', cursor: 'default', whiteSpace: 'nowrap', userSelect: 'none' }}
          >
            TC: S/ {tcUSD.toFixed(2)} · {fechaLabel}{tipoCambioHoy.desactualizado ? ' ⚠️' : ''}
          </div>
        );
      })()}

      {/* Botones de acción — en móvil solo notificaciones */}
      <div className="row" style={{gap:6}}>
        {!isMobile && <button className="icon-btn" onClick={() => setMobileMode(true)} title="Modo campo">{I.mobile}</button>}

        <div style={{position:'relative'}}>
          <button className="icon-btn" onClick={() => setNotiOpen(v => !v)} title="Notificaciones">
            {I.bell}
            {unreadCount > 0 && <span className="dot-badge" style={{background:'var(--danger)', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'white', right:0, top:0}}>{unreadCount}</span>}
          </button>
          {notiOpen && (
            <div className="dropdown" style={{top: 42, right: 0, minWidth: isMobile ? 'calc(100vw - 24px)' : 320, maxWidth: isMobile ? 'calc(100vw - 24px)' : 360, padding:0, zIndex:100}} onMouseLeave={() => !isMobile && setNotiOpen(false)}>
              <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)', fontWeight:600, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                Notificaciones
                <div className="row" style={{gap:6}}>
                  {unreadCount > 0 && <button className="btn btn-sm btn-ghost" onClick={() => markNotificacionesRead()} style={{fontSize:11}}>Marcar todas</button>}
                  {isMobile && <button className="icon-btn" style={{width:28, height:28}} onClick={() => setNotiOpen(false)}>{I.x}</button>}
                </div>
              </div>
              <div style={{maxHeight: 400, overflowY:'auto'}}>
                {notificaciones.length === 0 && <div style={{padding:20, textAlign:'center', color:'var(--fg-muted)'}}>No hay notificaciones</div>}
                {notificaciones.map(n => {
                  const docColor = n.priority === 'alta' ? 'var(--danger)' : n.priority === 'media' ? 'var(--orange)' : 'var(--border)';
                  const isDoc = n.referenceType === 'personal_documento';
                  return (
                  <div key={n.id} onClick={() => handleNotificacionClick(n)} style={{padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)', background: n.read ? 'transparent' : 'var(--bg-subtle)', borderLeft:isDoc ? `3px solid ${docColor}` : '3px solid transparent', cursor:isDoc ? 'pointer' : 'default'}}>
                    {n.title && <div style={{fontSize:11, fontWeight:700, color:isDoc ? docColor : 'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>{n.title}</div>}
                    <div style={{fontSize:13, color:'var(--fg)'}}>{n.text}</div>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>{n.time}</div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button className="icon-btn" onClick={() => setDark(!dark)} title="Dark mode">{dark ? I.sun : I.moon}</button>
      </div>

      {/* Separador — oculto en móvil */}
      {!isMobile && <div style={{width:1, height:24, background:'rgba(255,255,255,0.15)', margin:'0 4px'}}/>}

      {/* Zona de usuario */}
      <div style={{position:'relative'}}>
        <div
          className="user-zone"
          onClick={() => setCompOpen(v => !v)}
          style={{
            display:'flex',
            alignItems:'center',
            gap: isMobile ? 0 : 12,
            padding: isMobile ? 2 : '4px 4px 4px 12px',
            borderRadius:99,
            background:'rgba(255,255,255,0.08)',
            border:'1px solid rgba(255,255,255,0.15)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {/* Texto empresa/email — oculto en móvil */}
          {!isMobile && (
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.02em', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                {empresa.nombre}
              </div>
              <div style={{fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600}}>
                {isSupabase ? authUser?.email : role.nombre}
              </div>
            </div>
          )}
          <div className="avatar" style={{margin:0, width:32, height:32, fontSize:12}}>{avatarText}</div>
        </div>

        {compOpen && (
          <div className="dropdown" style={{top: 48, right: 0, minWidth: isMobile ? 'min(280px, calc(100vw - 24px))' : 280}} onMouseLeave={() => !isMobile && setCompOpen(false)}>
            {/* En móvil mostramos empresa activa en el header del dropdown */}
            {isMobile && (
              <div style={{padding:'10px 14px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:12, fontWeight:700, color:'var(--fg)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{empresa.nombre}</div>
                  <div style={{fontSize:11, color:'var(--fg-subtle)'}}>{isSupabase ? authUser?.email : role.nombre}</div>
                </div>
                <button className="icon-btn" style={{width:28, height:28}} onClick={() => setCompOpen(false)}>{I.x}</button>
              </div>
            )}
            {/* Lista de empresas — solo si hay más de una o es mock */}
            {(empresaItems.length > 1 || !isSupabase) && (
              <>
                <div style={{padding:'8px 12px', fontSize:11, color:'var(--fg-subtle)', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700, borderBottom:'1px solid var(--border-subtle)'}}>
                  {isSupabase ? 'Mis empresas' : 'Tenants disponibles'}
                </div>
                <div style={{maxHeight:260, overflowY:'auto'}}>
                  {empresaItems.map(e => (
                    <div key={e.id} className={'dropdown-item ' + (e.active ? 'active' : '')} onClick={e.onClick}>
                      <span className="company-dot" style={{background: e.color, width:8, height:8, borderRadius:999}}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600}}>{e.nombre}</div>
                        <div style={{fontSize:11, color:'var(--fg-subtle)'}}>{e.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{padding:8, borderTop:'1px solid var(--border-subtle)', background:'var(--bg-subtle)', display:'flex', flexDirection:'column', gap:4}}>
              {/* En móvil añadimos dark mode y modo campo aquí */}
              {isMobile && (
                <button className="btn btn-ghost btn-sm" style={{width:'100%', justifyContent:'center', gap:6, marginBottom:4}} onClick={() => { setMobileMode(true); setCompOpen(false); }}>
                  {I.mobile} Vista campo
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{width:'100%', justifyContent:'center', color:'var(--danger)', fontWeight:700, gap:8}}
                onClick={signOut}
              >
                {I.power || '🚪'} Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botón logout standalone — solo en escritorio */}
      {!isMobile && (
        <button
          className="icon-btn"
          onClick={signOut}
          title="Cerrar sesion"
          aria-label="Cerrar sesion"
          style={{
            color:'rgba(255,255,255,0.82)',
            border:'1px solid rgba(255,255,255,0.14)',
            background:'rgba(255,255,255,0.06)'
          }}
        >
          {I.power}
        </button>
      )}
    </header>
  );
}

export { SIDEBAR };
