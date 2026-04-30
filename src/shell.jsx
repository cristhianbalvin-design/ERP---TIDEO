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
  { section: 'CRM & Marketing', items: [
    { key: 'cuentas', label: 'Cuentas y Contactos', icon: I.users },
    { key: 'leads', label: 'Leads y Scoring', icon: I.target, badge: 8 },
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
    { key: 'ot', label: 'Ordenes de Trabajo', icon: I.wrench, badge: 3 },
    { key: 'partes', label: 'Partes Diarios', icon: I.clipboard },
    { key: 'cierre', label: 'Cierre y Calidad', icon: I.check },
    { key: 'tickets', label: 'Soporte y Tickets', icon: I.alert },
  ]},
  { section: 'RRHH', items: [
    { key: 'rrhh_operativo', label: 'Personal Operativo', icon: I.wrench },
    { key: 'rrhh_admin', label: 'Personal Administrativo', icon: I.users },
    { key: 'asistencia', label: 'Control de Asistencia', icon: I.clock },
    { key: 'turnos', label: 'Turnos y Horarios', icon: I.calendar },
    { key: 'nomina', label: 'Nomina', icon: I.receipt },
    { key: 'prestamos_personal', label: 'Prestamos al Personal', icon: I.userCheck },
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
  ]},
  { section: 'Administracion', items: [
    { key: 'ventas', label: 'Ventas', icon: I.store },
    { key: 'caja', label: 'Caja Chica', icon: I.card },
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
    { key: 'roles', label: 'Roles y Permisos', icon: I.shield },
    { key: 'maestros', label: 'Maestros Base', icon: I.settings },
    { key: 'parametros', label: 'Parametros Generales', icon: I.settings },
    { key: 'servicios', label: 'Catalogo Servicios', icon: I.package },
    { key: 'tarifarios', label: 'Tarifarios', icon: I.dollar },
  ]},
];
export function Sidebar({ active, onNav, role, isSuperadmin }) {
  const allowed = role.permisos.todo ? null : new Set(role.permisos.ver || []);
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div style={{width:34, height:34, background:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:4, overflow:'hidden', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
          <img src="/tideo-isotipo.png" alt="TIDEO" style={{width:'100%', height:'100%', objectFit:'contain'}} />
        </div>
        <div>
          <div className="sidebar-logo-text" style={{letterSpacing:'0.05em'}}>TIDEO</div>
          <div className="sidebar-logo-sub" style={{opacity:0.6, fontSize:10, fontWeight:700, letterSpacing:'0.1em'}}>ERP</div>
        </div>
      </div>
      <nav className="sidebar-nav" style={{padding:'10px 12px'}}>
        {SIDEBAR.map((group, gi) => {
          if (group.plataforma && !isSuperadmin) return null;
          const visibleItems = group.items.filter(it => !allowed || allowed.has(it.key));
          if (visibleItems.length === 0) return null;
          return (
            <div key={gi} style={{marginBottom:16}}>
              {group.section && <div className="sidebar-section" style={{fontSize:9, letterSpacing:'0.08em', opacity:0.5, marginBottom:8}}>{group.section}</div>}
              {visibleItems.map(it => (
                <div key={it.key} className={'sidebar-item ' + (active === it.key ? 'active' : '')} onClick={() => onNav(it.key)} style={{padding:'8px 10px', fontSize:12, borderRadius:8}}>
                  {it.icon}<span style={{fontWeight:500}}>{it.label}</span>
                  {it.badge && <span className="sidebar-item-badge" style={{fontSize:9, padding:'1px 5px'}}>{it.badge}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      <div style={{padding:'16px 20px', borderTop:'1px solid rgba(255,255,255,0.05)', fontSize:12, color:'rgba(255,255,255,0.4)', cursor:'pointer', display:'flex', alignItems:'center', gap:10}}>
        {I.chevLeft} <span>Colapsar</span>
      </div>
    </aside>
  );
}

export function Header({ active, empresa, setEmpresa, role, setRoleKey, roleKey, dark, setDark, setMobileMode }) {
  const { notificaciones, markNotificacionesRead, dataMode, authUser, todasMembresias, seleccionarEmpresa, signOut, searchQuery, setSearchQuery } = useApp();
  const [compOpen, setCompOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const title = SIDEBAR.flatMap(g => g.items).find(i => i.key === active)?.label || 'Dashboard';

  const isSupabase = dataMode === 'supabase';
  const canSwitchCompany = isSupabase ? todasMembresias.length > 1 : Boolean(role.permisos?.plataforma);
  const unreadCount = notificaciones.filter(n => !n.read).length;

  const avatarText = isSupabase && authUser?.email
    ? authUser.email.slice(0, 2).toUpperCase()
    : 'LM';

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
    <header className="header" style={{padding:'0 20px', gap:20}}>
      <div className="header-title font-display" style={{minWidth:120}}>{title}</div>
      
      <div className="header-search" style={{flex:1, maxWidth:480, position:'relative'}}>
        <div style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.4)'}}>{I.search}</div>
        <input 
          placeholder="Buscar..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px 8px 36px', color:'#fff', fontSize:13}}
        />
        <div style={{position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.1)', borderRadius:4, padding:'2px 4px', fontSize:9, color:'rgba(255,255,255,0.5)', fontWeight:700}}>⌘K</div>
      </div>

      <div className="header-spacer"/>

      <div className="row" style={{gap:8}}>
        <button className="icon-btn" onClick={() => setMobileMode(true)} title="Modo campo">{I.mobile}</button>
        <button className="icon-btn" title="Buscar global">{I.search}</button>

        <div style={{position:'relative'}}>
          <button className="icon-btn" onClick={() => { setNotiOpen(v => !v); if(!notiOpen) markNotificacionesRead(); }} title="Notificaciones">
            {I.bell}
            {unreadCount > 0 && <span className="dot-badge" style={{background:'var(--danger)', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'white', right:0, top:0}}>{unreadCount}</span>}
          </button>
          {notiOpen && (
            <div className="dropdown" style={{top: 42, right: 0, minWidth: 320, padding:0, zIndex:100}} onMouseLeave={() => setNotiOpen(false)}>
              <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)', fontWeight:600}}>Notificaciones</div>
              <div style={{maxHeight: 400, overflowY:'auto'}}>
                {notificaciones.length === 0 && <div style={{padding:20, textAlign:'center', color:'var(--fg-muted)'}}>No hay notificaciones</div>}
                {notificaciones.map(n => (
                  <div key={n.id} style={{padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)', background: n.read ? 'transparent' : 'var(--bg-subtle)'}}>
                    <div style={{fontSize:13, color:'var(--fg)'}}>{n.text}</div>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>{n.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="icon-btn" onClick={() => setDark(!dark)} title="Dark mode">{dark ? I.sun : I.moon}</button>
      </div>

      <div style={{width:1, height:24, background:'rgba(255,255,255,0.15)', margin:'0 8px'}}/>

      <div style={{position:'relative'}}>
        <div 
          className="user-zone" 
          onClick={() => canSwitchCompany && setCompOpen(v => !v)}
          style={{
            display:'flex', 
            alignItems:'center', 
            gap:12, 
            padding:'4px 4px 4px 12px', 
            borderRadius:99, 
            background:'rgba(255,255,255,0.08)', 
            border:'1px solid rgba(255,255,255,0.15)',
            cursor: canSwitchCompany ? 'pointer' : 'default',
            transition: 'all 0.2s'
          }}
        >
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.02em', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {empresa.nombre}
            </div>
            <div style={{fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600}}>
              {isSupabase ? authUser?.email?.split('@')[0] : role.nombre}
            </div>
          </div>
          <div className="avatar" style={{margin:0, width:32, height:32, fontSize:12}}>{avatarText}</div>
        </div>

        {compOpen && (
          <div className="dropdown" style={{top: 48, right: 0, minWidth: 280}} onMouseLeave={() => setCompOpen(false)}>
            <div style={{padding:'8px 12px', fontSize:11, color:'var(--fg-subtle)', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700, borderBottom:'1px solid var(--border-subtle)'}}>
              {isSupabase ? 'Mis empresas' : 'Tenants disponibles'}
            </div>
            <div style={{maxHeight:300, overflowY:'auto'}}>
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
            <div style={{padding:8, borderTop:'1px solid var(--border-subtle)', background:'var(--bg-subtle)'}}>
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
    </header>
  );
}

export { SIDEBAR };
