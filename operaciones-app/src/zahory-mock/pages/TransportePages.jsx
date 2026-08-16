import React, { useState, Fragment } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY = '2026-05-15';

const OV_STATES = {
  borrador:      { label: 'Borrador',      badge: 'slate'  },
  programada:    { label: 'Programada',    badge: 'cyan'   },
  en_ruta:       { label: 'En ruta',       badge: 'orange' },
  con_incidente: { label: 'Con incidente', badge: 'red'    },
  completada:    { label: 'Completada',    badge: 'green'  },
  cerrada:       { label: 'Cerrada',       badge: 'green'  },
};

const UNIT_STATES = {
  disponible:       { label: 'Disponible',      badge: 'green'  },
  en_ruta:          { label: 'En ruta',          badge: 'orange' },
  en_mantenimiento: { label: 'En mantenimiento', badge: 'red'    },
  baja:             { label: 'Baja',             badge: 'slate'  },
};

const TIPO_TARIFA_LABEL = {
  por_viaje:        'Por viaje',
  por_km:           'Por km',
  por_dia:          'Por día',
  contrato_mensual: 'Contrato mensual',
};

const TIPO_UNIDAD_LABEL = {
  camioneta_4x4: 'Camioneta 4x4',
  camion_plano:  'Camión plano',
  camion_grua:   'Camión grúa',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d} ${meses[parseInt(m,10)-1]} ${y}`;
};

const fmtUSD = (n) => {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

// ── Shared sub-components ─────────────────────────────────────────────────────

const OVBadge = ({ estado }) => {
  const s = OV_STATES[estado] || { label: estado, badge: 'slate' };
  return <span className={`badge ${s.badge}`}><span className="dot"/>{s.label}</span>;
};

const UnitBadge = ({ estado }) => {
  const s = UNIT_STATES[estado] || { label: estado, badge: 'slate' };
  return <span className={`badge ${s.badge}`}><span className="dot"/>{s.label}</span>;
};

const MetaField = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value || '—'}</div>
  </div>
);

// ── 1. DashboardTransporte ────────────────────────────────────────────────────

export const DashboardTransporte = ({ onNav }) => {
  const unidades = ZAHORY_SAC_DATA.unidades_transporte || [];
  const ovs      = ZAHORY_SAC_DATA.ordenes_viaje || [];

  const enRutaHoy   = ovs.filter(v => v.estado === 'en_ruta' && v.fecha_programada === TODAY).length;
  const disponibles = unidades.filter(u => u.estado === 'disponible').length;
  const enRutaUnits = unidades.filter(u => u.estado === 'en_ruta').length;
  const enMantto    = unidades.filter(u => u.estado === 'en_mantenimiento').length;
  const kmMes       = ovs.reduce((s, v) => s + (v.km_real || 0), 0);
  const factMes     = ovs
    .filter(v => v.tipo_operacion === 'comercial')
    .reduce((s, v) => s + (v.ingreso_estimado || 0), 0);

  const ovEnRuta = ovs.filter(v => v.estado === 'en_ruta');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard Transporte Comercial</h1>
          <div className="sub">Monitor de flota y KPIs del día · {fmtDate(TODAY)}</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-cyan" onClick={() => onNav('transporte-crear-ov')}>
          <Icon name="plus" size={14}/> Nueva Orden de Viaje
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi orange-soft"><div className="kpi-header"><div className="label">Viajes en ruta hoy</div><div className="kpi-icon-wrap"><Icon name="truck" size={16}/></div></div><div className="value" style={{color:'#d97706'}}>{enRutaHoy}</div></div>
        <div className="kpi green-soft"><div className="kpi-header"><div className="label">Unidades disponibles</div><div className="kpi-icon-wrap"><Icon name="check" size={16}/></div></div><div className="value" style={{color:'#15803d'}}>{disponibles}</div><div className="sub">{enRutaUnits} en ruta · {enMantto} en mantto</div></div>
        <div className="kpi"><div className="kpi-header"><div className="label">Km recorridos (mes)</div><div className="kpi-icon-wrap"><Icon name="activity" size={16}/></div></div><div className="value">{kmMes.toLocaleString()} km</div></div>
        <div className="kpi"><div className="kpi-header"><div className="label">Facturación del mes</div><div className="kpi-icon-wrap" style={{background:'rgba(124,58,237,0.1)',color:'#7c3aed'}}><Icon name="rates" size={16}/></div></div><div className="value">{fmtUSD(factMes)}</div><div className="sub">Transporte comercial</div></div>
      </div>

      {/* Alertas */}
      {enMantto > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--orange)' }}>
          <div className="card-body" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="alert" size={16}/>
            <span style={{ fontSize: 13 }}>
              <strong>{enMantto} unidad(es)</strong> en mantenimiento · revisar disponibilidad antes de programar nuevos viajes.
            </span>
          </div>
        </div>
      )}

      {/* Monitor de flota */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3>Monitor de Flota</h3></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {unidades.map(u => {
              const viajeActual = ovs.find(v => v.unidad_id === u.id && v.estado === 'en_ruta');
              const bgColor = u.estado === 'en_ruta' ? 'rgba(234,179,8,0.04)'
                : u.estado === 'en_mantenimiento' ? 'rgba(239,68,68,0.04)'
                : 'var(--card-bg)';
              return (
                <div key={u.id} style={{ border: '1px solid var(--card-border)', borderRadius: 8, padding: 14, background: bgColor }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{u.placa || 'Tercerizada'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {TIPO_UNIDAD_LABEL[u.tipo] || u.tipo} · {u.marca}
                      </div>
                    </div>
                    <UnitBadge estado={u.estado}/>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginTop: 8 }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Conductor</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>
                        {u.origen === 'tercerizada' ? 'Del proveedor' : u.conductor_default}
                      </div>
                    </div>
                    {u.km_actual != null && (
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Odómetro</div>
                        <div style={{ fontWeight: 600, marginTop: 2 }}>{u.km_actual.toLocaleString()} km</div>
                      </div>
                    )}
                    {u.origen === 'tercerizada' && (
                      <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                        <span className="badge slate" style={{ fontSize: 10 }}>Unidad tercerizada</span>
                      </div>
                    )}
                  </div>

                  {viajeActual && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>{viajeActual.id}</div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        {viajeActual.origen?.split('—')[0]?.trim()} → {viajeActual.destino?.split('—')[0]?.trim()}
                      </div>
                      {viajeActual.hora_salida && (
                        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>Salida {viajeActual.hora_salida}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Viajes activos */}
      {ovEnRuta.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Viajes en Curso</h3>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('transporte-viajes')}>
              Ver todos
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Tipo</th><th>Destino</th>
                  <th>Unidad</th><th>Conductor</th><th>Salida</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ovEnRuta.map(v => (
                  <tr key={v.id}>
                    <td><strong>{v.id}</strong></td>
                    <td>
                      <span className={`badge ${v.tipo_operacion === 'comercial' ? 'cyan' : 'slate'}`} style={{ fontSize: 10 }}>
                        {v.tipo_operacion === 'comercial' ? 'Comercial' : 'Propio'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>{v.destino?.split('—')[0]?.trim()}</td>
                    <td style={{ fontSize: 12 }}>{v.unidad_id}</td>
                    <td style={{ fontSize: 12 }}>{v.conductor}</td>
                    <td style={{ fontSize: 12 }}>{v.hora_salida || '—'}</td>
                    <td><OVBadge estado={v.estado}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};

// ── Inline badge configs para el sistema visual ───────────────────────────────

const ESTADO_BADGE_CFG = {
  completada:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  cerrada:       { color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  en_ruta:       { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'   },
  programada:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  borrador:      { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  con_incidente: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
};

const InlineEstadoBadge = ({ estado, label }) => {
  const cfg = ESTADO_BADGE_CFG[estado] || { color: '#64748b', bg: 'rgba(100,116,139,0.12)' };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600,
      padding: '3px 10px', borderRadius: 20,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
};

// ── 2. MonitorViajes ─────────────────────────────────────────────────────────

export const MonitorViajes = ({ onNav }) => {
  const ovs = ZAHORY_SAC_DATA.ordenes_viaje || [];
  const [quickTab, setQuickTab] = useState('todos');
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const filtered = ovs.filter(v => {
    if (quickTab !== 'todos' && v.estado !== quickTab) return false;
    if (filtroTipo !== 'todos' && v.tipo_operacion !== filtroTipo) return false;
    if (search && !v.id.toLowerCase().includes(search.toLowerCase()) && !v.conductor?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const kpis = {
    en_ruta: ovs.filter(v => v.estado === 'en_ruta').length,
    con_incidente: ovs.filter(v => v.estado === 'con_incidente').length,
    completadas: ovs.filter(v => v.estado === 'completada' || v.estado === 'cerrada').length,
    programadas: ovs.filter(v => v.estado === 'programada' || v.estado === 'borrador').length,
  };

  const QUICK_TABS = [
    { id: 'todos',         label: 'Todos' },
    { id: 'en_ruta',       label: 'En Ruta' },
    { id: 'con_incidente', label: 'Incidentes', alert: true },
    { id: 'completada',    label: 'Completadas' },
    { id: 'programada',    label: 'Programadas' },
  ];

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Monitor de Viajes</h1>
          <div className="sub">Control de órdenes de viaje · Taller Central ↔ minas y sedes</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar</button>
        <button className="btn btn-cyan" onClick={() => onNav('transporte-crear-ov')}><Icon name="plus" size={13}/> Nueva Orden de Viaje</button>
      </div>

      {/* ── Barra de Salud Operativa ── */}
      <div className="report-kpi-grid">
        <div className="kpi cyan-soft">
          <div className="kpi-header"><div className="label">En Ruta</div><div className="kpi-icon-wrap"><Icon name="parts" size={16}/></div></div>
          <div className="value" style={{ color:'#0891b2' }}>{kpis.en_ruta}</div>
          <div className="sub">Viajes activos</div>
        </div>
        <div className="kpi red-soft">
          <div className="kpi-header"><div className="label">Incidentes</div><div className="kpi-icon-wrap"><Icon name="alert" size={16}/></div></div>
          <div className="value" style={{ color:'#dc2626' }}>{kpis.con_incidente}</div>
          <div className="sub">Retrasos o problemas</div>
        </div>
        <div className="kpi green-soft">
          <div className="kpi-header"><div className="label">Completados</div><div className="kpi-icon-wrap"><Icon name="check" size={16}/></div></div>
          <div className="value" style={{ color:'#15803d' }}>{kpis.completadas}</div>
          <div className="sub">Listos para liquidar</div>
        </div>
        <div className="kpi orange-soft">
          <div className="kpi-header"><div className="label">Programados</div><div className="kpi-icon-wrap"><Icon name="clock" size={16}/></div></div>
          <div className="value" style={{ color:'#d97706' }}>{kpis.programadas}</div>
          <div className="sub">Pendientes de salida</div>
        </div>
      </div>

      {/* ── Quick Filter Tabs ── */}
      <div className="report-toolbar">
        <div className="report-tabs">
          {QUICK_TABS.map(t => (
            <button key={t.id}
              className={'report-tab' + (quickTab === t.id ? ' active' : '')}
              onClick={() => setQuickTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="report-filters">
          <input className="input" placeholder="Buscar OV o conductor..." value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }}/>
          <select className="select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width:160 }}>
            <option value="todos">Tipo: Todos</option>
            <option value="propio">Transporte Propio</option>
            <option value="comercial">Transp. Comercial</option>
          </select>
        </div>
      </div>

      {/* ── Tabla Principal ── */}
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width:110 }}>Código OV</th>
                <th style={{ width:100 }}>Tipo</th>
                <th>Ruta</th>
                <th style={{ width:120 }}>Fecha</th>
                <th style={{ width:100 }}>Unidad</th>
                <th style={{ width:160 }}>Conductor</th>
                <th style={{ width:120 }}>Estado</th>
                <th style={{ width:100, textAlign:'right' }}>Km real</th>
                <th style={{ width:110, textAlign:'right' }}>Costo total</th>
                <th style={{ width:110 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} className="clickable">
                  <td>
                    <div className="ot-code" style={{ fontSize:12.5 }}>{v.id}</div>
                  </td>
                  <td>
                    {v.tipo_operacion === 'comercial'
                      ? <span className="badge cyan"><span className="dot"/>Comercial</span>
                      : <span className="badge slate"><span className="dot"/>Propio</span>
                    }
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{v.origen?.split('—')[0]?.trim()}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>→ {v.destino?.split('—')[0]?.trim()}</div>
                  </td>
                  <td>
                    <div style={{ fontSize:12 }}>{fmtDate(v.fecha_programada)}</div>
                  </td>
                  <td>
                    <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, fontWeight:600 }}>{v.unidad_id}</div>
                  </td>
                  <td>
                    <div style={{ fontSize:13 }}>{v.conductor}</div>
                  </td>
                  <td>
                    <InlineEstadoBadge estado={v.estado} label={OV_STATES[v.estado]?.label || v.estado}/>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {v.km_real != null ? `${v.km_real} km` : <span style={{ color:'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--navy)' }}>
                    {v.costo_total != null ? fmtUSD(v.costo_total) : <span style={{ color:'var(--text-muted)' }}>—</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {v.estado === 'en_ruta' ? (
                      <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(6,182,212,0.12)', color: '#06b6d4', fontWeight: 600, border: '1px solid rgba(6,182,212,0.3)' }} onClick={() => onNav('transporte-ruta')}>
                        Hoja de ruta
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 16 }}>⋯</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding:'40px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                    <Icon name="search" size={28}/>
                    <div style={{ marginTop:10 }}>No hay órdenes de viaje para los filtros seleccionados.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ── 3. CrearOVPage ────────────────────────────────────────────────────────────

export const CrearOVPage = ({ onNav }) => {
  const unidades      = ZAHORY_SAC_DATA.unidades_transporte || [];
  const rutas         = ZAHORY_SAC_DATA.rutas_maestro || [];
  const contratos     = ZAHORY_SAC_DATA.contratos_transporte || [];
  const otsData       = ZAHORY_SAC_DATA.otsDashboard || [];
  const ctrRental     = ZAHORY_SAC_DATA.contratos_rental || [];

  const [form, setForm] = useState({
    tipo_operacion: 'propio',
    vinculo_tipo: 'contrato',
    vinculo_id: '',
    cliente_id: '',
    contrato_id: '',
    ruta_id: '',
    origen: '',
    destino: '',
    km_planificado: '',
    tiempo_estimado: '',
    guardar_ruta: false,
    unidad_origen: 'propia',
    unidad_id: '',
    conductor: '',
    proveedor: '',
    conductor_tercero: '',
    carga_descripcion: '',
    peso_kg: '',
    fecha_programada: TODAY,
    hora_salida: '',
    obs: '',
  });

  const [openSecs, setOpenSecs] = useState({ tipo: true, ruta: true, unidad: true, carga: true });
  const toggleSec = (k) => setOpenSecs(p => ({ ...p, [k]: !p[k] }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onRutaChange = (rutaId) => {
    const r = rutas.find(r => r.id === rutaId);
    if (r) {
      setForm(f => ({ ...f, ruta_id: rutaId, origen: r.origen, destino: r.destino, km_planificado: r.km_estandar, tiempo_estimado: r.tiempo_estimado_hrs }));
    } else {
      set('ruta_id', '');
    }
  };

  const unidadesDisponibles = unidades.filter(u => u.origen === 'propia' && u.estado === 'disponible');
  const nextId = (ZAHORY_SAC_DATA.ordenes_viaje || []).length + 1;
  const codigoOV = `OV-${new Date().getFullYear()}-${String(nextId).padStart(3, '0')}`;

  const Section = ({ id, title, icon, children }) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSec(id)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={14}/>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>
        <div className="spacer"/>
        <Icon name={openSecs[id] ? 'chevDown' : 'chev'} size={14}/>
      </div>
      {openSecs[id] && <div className="card-body" style={{ paddingTop: 0 }}>{children}</div>}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Nueva Orden de Viaje</h1>
          <div className="sub">Código asignado: <strong>{codigoOV}</strong></div>
        </div>
        <div className="spacer"/>
        <button className="btn" onClick={() => onNav('transporte-viajes')}>
          <Icon name="back" size={14}/> Volver
        </button>
      </div>

      {/* Sección 1 — Tipo */}
      <Section id="tipo" title="Tipo de operación" icon="briefcase">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { value: 'propio',     label: 'Transporte propio',     sub: 'Costo se carga a OT o contrato' },
            { value: 'comercial',  label: 'Transporte comercial',  sub: 'Genera ciclo comercial facturable' },
          ].map(opt => (
            <label key={opt.value} style={{
              flex: 1, border: `2px solid ${form.tipo_operacion === opt.value ? 'var(--cyan)' : 'var(--card-border)'}`,
              borderRadius: 8, padding: 12, cursor: 'pointer',
              background: form.tipo_operacion === opt.value ? 'rgba(0,188,212,0.06)' : undefined,
            }}>
              <input type="radio" name="tipo_operacion" value={opt.value}
                checked={form.tipo_operacion === opt.value}
                onChange={e => set('tipo_operacion', e.target.value)}
                style={{ marginRight: 8 }}
              />
              <strong>{opt.label}</strong>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{opt.sub}</div>
            </label>
          ))}
        </div>

        {form.tipo_operacion === 'propio' && (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Vinculado a</label>
              <select className="form-control" value={form.vinculo_tipo} onChange={e => set('vinculo_tipo', e.target.value)}>
                <option value="ot">Orden de Trabajo</option>
                <option value="contrato">Contrato de alquiler</option>
              </select>
            </div>
            <div>
              <label className="form-label">
                {form.vinculo_tipo === 'ot' ? 'Orden de Trabajo' : 'Contrato'} <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <select className="form-control" value={form.vinculo_id} onChange={e => set('vinculo_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {form.vinculo_tipo === 'ot'
                  ? otsData.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.eq}</option>)
                  : ctrRental.map(c => <option key={c.id} value={c.id}>{c.id} · {c.cliente_nombre || c.cliente_id}</option>)
                }
              </select>
            </div>
          </div>
        )}

        {form.tipo_operacion === 'comercial' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Cliente</label>
              <select className="form-control" value={form.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {[...new Set(contratos.map(c => c.cliente_id))].map(cid => (
                  <option key={cid} value={cid}>{contratos.find(c => c.cliente_id === cid)?.cliente_nombre || cid}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Contrato de transporte</label>
              <select className="form-control" value={form.contrato_id} onChange={e => set('contrato_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {contratos.filter(c => !form.cliente_id || c.cliente_id === form.cliente_id).map(c => (
                  <option key={c.id} value={c.id}>{c.id} · {TIPO_TARIFA_LABEL[c.tipo_tarifa]}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Section>

      {/* Sección 2 — Ruta */}
      <Section id="ruta" title="Ruta" icon="arrow">
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Ruta predefinida (Maestro Rutas)</label>
          <select className="form-control" value={form.ruta_id} onChange={e => onRutaChange(e.target.value)}>
            <option value="">— Ingresar manualmente —</option>
            {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre} · {r.km_estandar} km</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">Origen</label>
            <input className="form-control" value={form.origen} onChange={e => set('origen', e.target.value)} placeholder="Ej. Taller Central - Lurín, Lima"/>
          </div>
          <div>
            <label className="form-label">Destino</label>
            <input className="form-control" value={form.destino} onChange={e => set('destino', e.target.value)} placeholder="Ej. Unidad Minera La Oroya"/>
          </div>
          <div>
            <label className="form-label">Km planificado</label>
            <input className="form-control" type="number" value={form.km_planificado} onChange={e => set('km_planificado', e.target.value)} placeholder="km"/>
          </div>
          <div>
            <label className="form-label">Tiempo estimado (hrs)</label>
            <input className="form-control" type="number" step="0.5" value={form.tiempo_estimado} onChange={e => set('tiempo_estimado', e.target.value)} placeholder="horas"/>
          </div>
        </div>
        {!form.ruta_id && (form.origen || form.destino) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.guardar_ruta} onChange={e => set('guardar_ruta', e.target.checked)}/>
            Guardar esta ruta para uso futuro
          </label>
        )}
      </Section>

      {/* Sección 3 — Unidad */}
      <Section id="unidad" title="Unidad y conductor" icon="equipment">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { value: 'propia',      label: 'Unidad propia' },
            { value: 'tercerizada', label: 'Unidad tercerizada' },
          ].map(opt => (
            <label key={opt.value} style={{
              flex: 1, border: `2px solid ${form.unidad_origen === opt.value ? 'var(--cyan)' : 'var(--card-border)'}`,
              borderRadius: 8, padding: 10, cursor: 'pointer',
              background: form.unidad_origen === opt.value ? 'rgba(0,188,212,0.06)' : undefined,
            }}>
              <input type="radio" name="unidad_origen" value={opt.value}
                checked={form.unidad_origen === opt.value}
                onChange={e => set('unidad_origen', e.target.value)}
                style={{ marginRight: 8 }}
              />
              <strong>{opt.label}</strong>
            </label>
          ))}
        </div>

        {form.unidad_origen === 'propia' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Unidad (solo disponibles)</label>
              <select className="form-control" value={form.unidad_id} onChange={e => set('unidad_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {unidadesDisponibles.map(u => (
                  <option key={u.id} value={u.id}>{u.placa} · {TIPO_UNIDAD_LABEL[u.tipo] || u.tipo}</option>
                ))}
              </select>
              {unidades.some(u => u.origen === 'propia' && u.estado === 'en_mantenimiento') && (
                <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4 }}>
                  <Icon name="alert" size={11}/> Algunas unidades propias están en mantenimiento.
                </div>
              )}
            </div>
            <div>
              <label className="form-label">Conductor asignado</label>
              <input
                className="form-control"
                value={form.conductor || (unidades.find(u => u.id === form.unidad_id)?.conductor_default || '')}
                onChange={e => set('conductor', e.target.value)}
                placeholder="Nombre del conductor"
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Proveedor de transporte homologado</label>
              <select className="form-control" value={form.proveedor} onChange={e => set('proveedor', e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option value="PROV-TRANS-001">PROV-TRANS-001 · Transportes Andinos SAC</option>
              </select>
            </div>
            <div>
              <label className="form-label">Conductor del proveedor</label>
              <input className="form-control" value={form.conductor_tercero} onChange={e => set('conductor_tercero', e.target.value)} placeholder="Nombre del conductor"/>
            </div>
          </div>
        )}
      </Section>

      {/* Sección 4 — Carga */}
      <Section id="carga" title="Carga y programación" icon="box">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Descripción de carga o equipo transportado</label>
            <input className="form-control" value={form.carga_descripcion} onChange={e => set('carga_descripcion', e.target.value)} placeholder="Ej. LHD R1600G-001 — traslado post-mantenimiento"/>
          </div>
          <div>
            <label className="form-label">Peso estimado (kg)</label>
            <input className="form-control" type="number" value={form.peso_kg} onChange={e => set('peso_kg', e.target.value)} placeholder="kg"/>
          </div>
          <div>
            <label className="form-label">Fecha programada de salida</label>
            <input className="form-control" type="date" value={form.fecha_programada} onChange={e => set('fecha_programada', e.target.value)}/>
          </div>
          <div>
            <label className="form-label">Hora de salida programada</label>
            <input className="form-control" type="time" value={form.hora_salida} onChange={e => set('hora_salida', e.target.value)}/>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows={2} value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Instrucciones especiales, restricciones, etc."/>
          </div>
        </div>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 24 }}>
        <button className="btn" onClick={() => onNav('transporte-viajes')}>Cancelar</button>
        <button className="btn btn-cyan" onClick={() => { alert(`Orden de Viaje ${codigoOV} creada.`); onNav('transporte-viajes'); }}>
          <Icon name="check" size={14}/> Crear Orden de Viaje
        </button>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ── 4. HojaDeRuta ─────────────────────────────────────────────────────────────

export const HojaDeRuta = ({ onNav }) => {
  const ovs = ZAHORY_SAC_DATA.ordenes_viaje || [];
  const ovActual = ovs.find(v => v.estado === 'en_ruta') || ovs[0];

  const [fase, setFase]               = useState('salida');
  const [kmInicial, setKmInicial]     = useState('10000');
  const [kmFinal, setKmFinal]         = useState('');
  const [combustible, setCombustible] = useState('');
  const [peajes, setPeajes]           = useState('');
  const [destinatario, setDestinatario] = useState('');

  if (!ovActual) {
    return (
      <div className="page">
        <div className="page-header"><div><h1>Hoja de Ruta</h1></div></div>
        <div className="card"><div className="card-body muted" style={{ textAlign: 'center', padding: 40 }}>No hay viajes activos.</div></div>
        <FooterBrand/>
      </div>
    );
  }

  const FASES = [
    { id: 'salida',  label: 'Salida',           icon: 'arrow',    desc: 'Registro inicial de odómetro',       num: 1 },
    { id: 'en_ruta', label: 'En ruta',          icon: 'activity', desc: 'Registro de incidentes y tanqueo',   num: 2 },
    { id: 'llegada', label: 'Llegada',          icon: 'check',    desc: 'Confirmación de llegada y Km',       num: 3 },
    { id: 'cierre',  label: 'Cierre económico', icon: 'wallet',   desc: 'Resumen financiero del viaje',       num: 4 },
  ];
  const faseIdx    = FASES.findIndex(f => f.id === fase);
  const kmRecorridos = kmFinal && kmInicial ? Number(kmFinal) - Number(kmInicial) : null;
  const costoTotal   = (Number(combustible) || 0) + (Number(peajes) || 0) + (ovActual.costo_tercero || 0);
  const margen       = ovActual.ingreso_estimado != null ? ovActual.ingreso_estimado - costoTotal : null;
  const origen       = ovActual.origen?.split('—')[0]?.trim();
  const destino      = ovActual.destino?.split('—')[0]?.trim();

  const SummaryRowA = ({ label, value }) => {
    if (!value) return null;
    return (
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, fontSize:12 }}>
        <div style={{ color:'rgba(255,255,255,0.45)' }}>{label}</div>
        <div style={{ color:'#fff', fontWeight:600, textAlign:'right', maxWidth:'60%', wordBreak:'break-word' }}>{value}</div>
      </div>
    );
  };

  const lblStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' };

  return (
    <div className="wizard-layout" style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

      {/* ══ PANEL IZQUIERDO ════════════════════════════════════════════ */}
      <div className="wizard-detail-panel" style={{ width:272, flexShrink:0, background:'linear-gradient(180deg,#1A2B4A 0%,#1F3358 100%)', display:'flex', flexDirection:'column', padding:'24px 20px 32px', borderRight:'1px solid rgba(255,255,255,0.06)' }}>

        {/* Cabecera */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:32 }}>
          <button onClick={() => onNav('transporte-viajes')} style={{ color:'rgba(255,255,255,0.45)', padding:'5px 7px', borderRadius:7, background:'rgba(255,255,255,0.07)', marginTop:1, flexShrink:0, border:'1px solid rgba(255,255,255,0.08)' }}>
            <Icon name="back" size={14}/>
          </button>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:15, lineHeight:1.2 }}>Hoja de Ruta</div>
            <div style={{ color:'var(--cyan)', fontSize:11, marginTop:3, fontWeight:600, letterSpacing:'0.3px' }}>
              {ovActual.id}
            </div>
          </div>
        </div>

        {/* Stepper vertical */}
        <div>
          {FASES.map((s, i) => {
            const isActive = faseIdx === i;
            const isDone   = faseIdx > i;
            return (
              <div key={s.id} style={{ display:'flex', gap:14 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                  <div onClick={() => isDone && setFase(s.id)} style={{ width:30, height:30, borderRadius:'50%', background: isDone ? 'var(--cyan)' : isActive ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.05)', border:`2px solid ${isDone || isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.12)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color: isDone ? '#fff' : isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.28)', cursor: isDone ? 'pointer' : 'default', boxShadow: isActive ? '0 0 0 4px rgba(0,188,212,0.12)' : 'none', transition:'all 0.2s', flexShrink:0 }}>
                    {isDone ? <Icon name="check" size={12}/> : s.num}
                  </div>
                  {i < FASES.length - 1 && <div style={{ width:2, height:34, background: isDone ? 'var(--cyan)' : 'rgba(255,255,255,0.07)', margin:'4px 0', borderRadius:1, transition:'background 0.3s' }}/>}
                </div>
                <div style={{ paddingTop:5 }}>
                  <div onClick={() => isDone && setFase(s.id)} style={{ fontSize:13, fontWeight: isActive ? 700 : 500, cursor: isDone ? 'pointer' : 'default', lineHeight:1.3, color: isActive ? '#fff' : isDone ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)' }}>
                    {s.label}
                  </div>
                  {isActive && <div style={{ fontSize:10, color:'rgba(0,188,212,0.75)', marginTop:2, fontWeight:500, lineHeight:1.4 }}>{s.desc}</div>}
                  {i < FASES.length - 1 && <div style={{ height: isActive ? 22 : 30 }}/>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Divisor */}
        <div style={{ height:1, background:'rgba(255,255,255,0.07)', margin:'24px 0 20px' }}/>

        {/* Resumen en vivo */}
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.24)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:14 }}>Detalles del viaje</div>
          <SummaryRowA label="Ruta"       value={`${origen} → ${destino}`}/>
          <SummaryRowA label="Unidad"     value={ovActual.unidad_id}/>
          <SummaryRowA label="Conductor"  value={ovActual.conductor}/>
          <SummaryRowA label="Fecha"      value={fmtDate(ovActual.fecha_programada)}/>
          <SummaryRowA label="Km plan."   value={`${ovActual.km_planificado} km`}/>
          <SummaryRowA label="Tipo"       value={ovActual.tipo_operacion === 'comercial' ? 'Comercial' : 'Propio'}/>
          {ovActual.estado === 'en_ruta' && <div style={{ marginTop: 12 }}><OVBadge estado={ovActual.estado}/></div>}
        </div>
      </div>

      {/* ══ PANEL DERECHO ══════════════════════════════════════════════ */}
      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', justifyContent:'center' }}>
        <div style={{ width:'100%', maxWidth:860, padding:'32px 36px 80px' }}>

          {/* Cabecera del paso */}
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28, paddingBottom:22, borderBottom:'1px solid var(--card-border)' }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'var(--cyan-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--cyan)', flexShrink:0 }}>
              <Icon name={FASES[faseIdx].icon} size={20}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:2 }}>Paso {faseIdx + 1} de 4</div>
              <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--navy)', lineHeight:1.2 }}>{FASES[faseIdx].label}</h2>
              <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text-muted)' }}>{FASES[faseIdx].desc}</p>
            </div>
          </div>

          {/* ── SALIDA ── */}
          {fase === 'salida' && (
            <div className="card" style={{ padding:'22px 24px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Registro de Salida</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={lblStyle}>Km inicial (odómetro)</label>
                  <input className="input" type="number" value={kmInicial} onChange={e => setKmInicial(e.target.value)} placeholder="km"/>
                </div>
                <div>
                  <label style={lblStyle}>Hora de salida real</label>
                  <input className="input" type="time" defaultValue={ovActual.hora_salida || '05:30'}/>
                </div>
                <div>
                  <label style={lblStyle}>Foto del odómetro</label>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    border: '1px dashed var(--card-border)', borderRadius: 8,
                    padding: '10px 14px', background: 'rgba(0,0,0,0.02)',
                    fontSize: 12, color: 'var(--text-muted)',
                  }}>
                    <Icon name="camera" size={18}/>
                    <span>Tomar foto o cargar imagen</span>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}/>
                  </label>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 16, display: 'flex', gap: 10 }}>
                <button className="btn btn-cyan" onClick={() => setFase('en_ruta')}>
                  <Icon name="arrow" size={14}/> Iniciar viaje
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Guardar borrador
                </button>
              </div>
            </div>
          )}

          {/* ── EN RUTA ── */}
          {fase === 'en_ruta' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card" style={{ padding:'22px 24px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Combustible cargado</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lblStyle}>Galones</label>
                    <input className="input" type="number" step="0.5" placeholder="gal"/>
                  </div>
                  <div>
                    <label style={lblStyle}>Costo (USD)</label>
                    <input className="input" type="number" step="0.01" placeholder="$"/>
                  </div>
                </div>
                <div>
                  <label style={lblStyle}>Estación de servicio</label>
                  <input className="input" placeholder="Nombre de la estación"/>
                </div>
              </div>
              <div className="card" style={{ padding:'22px 24px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Incidente (opcional)</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lblStyle}>Tipo de incidente</label>
                  <select className="select">
                    <option value="">— Sin incidentes —</option>
                    <option>Mecánico</option>
                    <option>Accidente</option>
                    <option>Demora externa</option>
                    <option>Clima</option>
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Descripción</label>
                  <textarea className="input" rows={3} placeholder="Descripción del incidente..."/>
                </div>
              </div>
              <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn" onClick={() => setFase('salida')}>← Volver</button>
                <button className="btn btn-cyan" onClick={() => setFase('llegada')}>
                  <Icon name="check" size={14}/> Registrar llegada
                </button>
              </div>
            </div>
          )}

          {/* ── LLEGADA ── */}
          {fase === 'llegada' && (
            <div className="card" style={{ padding:'22px 24px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Registro de Llegada</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={lblStyle}>Km final (odómetro)</label>
                  <input className="input" type="number" value={kmFinal} onChange={e => setKmFinal(e.target.value)} placeholder="km"/>
                </div>
                <div>
                  <label style={lblStyle}>Hora de llegada real</label>
                  <input className="input" type="time"/>
                </div>
                <div>
                  <label style={lblStyle}>Destinatario</label>
                  <input className="input" value={destinatario} onChange={e => setDestinatario(e.target.value)} placeholder="Nombre de quien recibe"/>
                </div>
                <div>
                  <label style={lblStyle}>Código de conformidad</label>
                  <input className="input" placeholder="Código o referencia"/>
                </div>
              </div>
              {kmRecorridos != null && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '14px 16px', background: 'rgba(0,188,212,0.06)', borderRadius: 8, border: '1px solid rgba(0,188,212,0.2)', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Km recorridos</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{kmRecorridos} km</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Km planificados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{ovActual.km_planificado} km</div>
                  </div>
                  {ovActual.km_planificado && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Variación</div>
                      <div style={{
                        fontSize: 22, fontWeight: 700, marginTop: 4,
                        color: Math.abs(kmRecorridos - ovActual.km_planificado) / ovActual.km_planificado > 0.1
                          ? 'var(--orange)' : 'var(--green)'
                      }}>
                        {kmRecorridos > ovActual.km_planificado ? '+' : ''}{kmRecorridos - ovActual.km_planificado} km
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 16, display: 'flex', gap: 10 }}>
                <button className="btn" onClick={() => setFase('en_ruta')}>← Volver</button>
                <button className="btn btn-cyan" onClick={() => setFase('cierre')}>
                  <Icon name="check" size={14}/> Confirmar llegada → Cierre
                </button>
              </div>
            </div>
          )}

          {/* ── CIERRE ECONÓMICO ── */}
          {fase === 'cierre' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
              <div className="card" style={{ padding:'22px 24px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Costos del viaje</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={lblStyle}>Combustible total (USD)</label>
                    <input className="input" type="number" step="0.01" value={combustible} onChange={e => setCombustible(e.target.value)} placeholder="$"/>
                  </div>
                  <div>
                    <label style={lblStyle}>Peajes (USD)</label>
                    <input className="input" type="number" step="0.01" value={peajes} onChange={e => setPeajes(e.target.value)} placeholder="$"/>
                  </div>
                  {ovActual.costo_tercero != null && ovActual.costo_tercero > 0 && (
                    <div>
                      <label style={lblStyle}>Costo tercero (USD)</label>
                      <input className="input" readOnly value={fmtUSD(ovActual.costo_tercero)}/>
                    </div>
                  )}
                </div>
                {ovActual.tipo_operacion === 'propio' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    El costo se registrará como gasto en {ovActual.vinculo_tipo === 'ot' ? 'OT' : 'contrato'} {ovActual.vinculo_id}
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 16, marginTop: 16, display: 'flex', gap: 10 }}>
                  <button className="btn" onClick={() => setFase('llegada')}>← Volver</button>
                  <button className="btn btn-cyan" onClick={() => { alert('Viaje cerrado.'); onNav('transporte-viajes'); }}>
                    <Icon name="check" size={14}/> Cerrar viaje
                  </button>
                </div>
              </div>

              {/* Resumen financiero */}
              <div className="card" style={{ padding:'22px 24px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Resumen financiero</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: '12px 14px', border: '1px solid var(--card-border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Costo total viaje</div>
                    <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{fmtUSD(costoTotal)}</div>
                  </div>
                  {ovActual.tipo_operacion === 'comercial' && ovActual.ingreso_estimado != null && (
                    <>
                      <div style={{ padding: '12px 14px', border: '1px solid var(--card-border)', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ingreso estimado</div>
                        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>{fmtUSD(ovActual.ingreso_estimado)}</div>
                      </div>
                      <div style={{ padding: '12px 14px', border: `1px solid ${(margen || 0) >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, background: (margen || 0) >= 0 ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Margen bruto</div>
                        <div style={{ fontSize: 26, fontWeight: 700, color: (margen || 0) >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>{fmtUSD(margen)}</div>
                        {ovActual.ingreso_estimado > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {Math.round(((margen || 0) / ovActual.ingreso_estimado) * 100)}% margen
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ── 5. MaestroRutas ───────────────────────────────────────────────────────────

export const MaestroRutas = () => {
  const rutas = ZAHORY_SAC_DATA.rutas_maestro || [];
  const ovs   = ZAHORY_SAC_DATA.ordenes_viaje || [];

  const [selectedId, setSelectedId] = useState(rutas[0]?.id || null);

  const rutaSel = rutas.find(r => r.id === selectedId);

  const kmPromedio = (() => {
    const con = ovs.filter(v => v.km_real);
    if (!con.length) return null;
    return Math.round(con.reduce((s, v) => s + v.km_real, 0) / con.length);
  })();

  const rutaFrecNombre = (() => {
    const counts = {};
    ovs.forEach(v => { if (v.ruta_id) counts[v.ruta_id] = (counts[v.ruta_id] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? rutas.find(r => r.id === top[0])?.nombre || top[0] : '—';
  })();

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Maestro de Rutas</h1>
          <div className="sub">Catálogo de rutas predefinidas y tarifas por tipo de unidad</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar</button>
        <button className="btn btn-cyan"><Icon name="plus" size={13}/> Nueva ruta</button>
      </div>

      {/* ── Barra de Salud Operativa ── */}
      <div className="report-kpi-grid">
        <div className="kpi cyan-soft">
          <div className="kpi-header"><div className="label">Rutas</div><div className="kpi-icon-wrap"><Icon name="parts" size={16}/></div></div>
          <div className="value" style={{ color:'#0891b2' }}>{rutas.length}</div>
          <div className="sub">Rutas predefinidas</div>
        </div>
        <div className="kpi orange-soft">
          <div className="kpi-header"><div className="label">Más Frecuente</div><div className="kpi-icon-wrap"><Icon name="clock" size={16}/></div></div>
          <div className="value" style={{ color:'#d97706', fontSize: rutaFrecNombre.length > 15 ? 16 : 24 }}>{rutaFrecNombre}</div>
          <div className="sub">Ruta principal</div>
        </div>
        <div className="kpi green-soft">
          <div className="kpi-header"><div className="label">Km Promedio</div><div className="kpi-icon-wrap"><Icon name="check" size={16}/></div></div>
          <div className="value" style={{ color:'#15803d' }}>{kmPromedio != null ? `${kmPromedio} km` : '—'}</div>
          <div className="sub">Distancia por viaje</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Panel Izquierdo — Tabla */}
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nombre de ruta</th>
                  <th style={{ width: 120 }}>Km estándar</th>
                  <th style={{ width: 120 }}>Tiempo est.</th>
                  <th style={{ width: 100 }}>Tarifas</th>
                </tr>
              </thead>
              <tbody>
                {rutas.map(r => (
                  <tr key={r.id}
                    className={'clickable' + (selectedId === r.id ? ' active' : '')}
                    onClick={() => setSelectedId(r.id)}
                    style={{ background: selectedId === r.id ? 'var(--bg-muted)' : undefined }}
                  >
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{r.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Carga: {r.tipo_carga_habitual}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.km_estandar} km</div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-muted)' }}>{r.tiempo_estimado_hrs} hrs</div>
                    </td>
                    <td>
                      <span className="badge cyan"><span className="dot"/>{r.tarifas?.length || 0} tarifas</span>
                    </td>
                  </tr>
                ))}
                {!rutas.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                      <Icon name="search" size={28}/>
                      <div style={{ marginTop:10 }}>Sin rutas definidas.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel lateral */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase', paddingLeft: 4 }}>
            Detalles de Ruta
          </div>
          {rutaSel ? (
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header">
                <h3 style={{ fontSize: 14 }}>{rutaSel.nombre}</h3>
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }}><Icon name="edit" size={13}/></button>
              </div>
              <div className="card-body">
                {[
                  ['Origen',          rutaSel.origen],
                  ['Destino',         rutaSel.destino],
                  ['Km estándar',     `${rutaSel.km_estandar} km`],
                  ['Tiempo estimado', `${rutaSel.tiempo_estimado_hrs} hrs`],
                  ['Carga habitual',  rutaSel.tipo_carga_habitual],
                ].map(([lbl, val]) => (
                  <MetaField key={lbl} label={lbl} value={val}/>
                ))}

                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 16, marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
                    Tarifas por tipo de unidad
                  </div>
                  {(rutaSel.tarifas || []).map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--card-border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--navy)' }}>{TIPO_UNIDAD_LABEL[t.tipo_unidad] || t.tipo_unidad}</span>
                      <strong style={{ color: 'var(--text)' }}>{t.moneda} {t.tarifa_por_km}/km</strong>
                    </div>
                  ))}
                  {!rutaSel.tarifas?.length && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>Sin tarifas definidas.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', marginBottom: 0 }}>
              <Icon name="search" size={28}/>
              <div style={{ marginTop: 10, fontSize: 13 }}>Selecciona una ruta para ver sus detalles y tarifas.</div>
            </div>
          )}
        </div>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ── 6. SchedulerDespacho ─────────────────────────────────────────────────────

export const SchedulerDespacho = ({ setCurrent }) => {
  const tecnicos = ZAHORY_SAC_DATA.scheduler_tecnicos || [];
  const otsSinAsignar = ZAHORY_SAC_DATA.ots_sin_asignar || [];
  
  const [otSeleccionada, setOtSeleccionada] = React.useState(null);
  const [asignaciones, setAsignaciones] = React.useState({});
  const [quickTab, setQuickTab] = React.useState('todas');
  const [search, setSearch] = React.useState('');
  const [filterTec, setFilterTec] = React.useState('Todos');

  const asignar = (otId, tecId) => {
    setAsignaciones(prev => ({ ...prev, [otId]: tecId }));
    setOtSeleccionada(null);
  };

  const otsConEstado = otsSinAsignar.map(ot => ({
    ...ot,
    asignado_a: asignaciones[ot.id] || null
  }));

  const filtradas = otsConEstado
    .filter(ot => {
      if (quickTab === 'sin_asignar') return !ot.asignado_a;
      if (quickTab === 'asignadas') return !!ot.asignado_a;
      if (quickTab === 'urgentes') return ot.prioridad === 'urgente';
      return true;
    })
    .filter(ot => !search || ot.id.toLowerCase().includes(search.toLowerCase()) || ot.equipo_id.toLowerCase().includes(search.toLowerCase()))
    .filter(ot => filterTec === 'Todos' || (ot.asignado_a && tecnicos.find(t => t.id === ot.asignado_a)?.nombre === filterTec));

  const kpis = {
    disponibles: tecnicos.filter(t => t.disponible).length,
    en_ot: tecnicos.filter(t => !t.disponible).length,
    sin_asignar: otsSinAsignar.length - Object.keys(asignaciones).length,
    urgentes: otsSinAsignar.filter(o => o.prioridad === 'urgente').length,
  };

  const getPrioBadge = (p) => {
    if (p === 'urgente') return <span className="badge red">Urgente</span>;
    if (p === 'normal') return <span className="badge green">Normal</span>;
    return <span className="badge slate">Programable</span>;
  };

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Scheduler · Despacho</h1>
          <div className="sub">Asignación de técnicos a OTs según disponibilidad, zona y especialidad</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar</button>
        <button className="btn btn-cyan"><Icon name="check" size={13}/> Auto-Asignar</button>
      </div>

      {/* ── Barra de Salud Operativa ── */}
      <div className="report-kpi-grid">
        <div className="kpi green-soft">
          <div className="kpi-header"><div className="label">Disponibles</div><div className="kpi-icon-wrap"><Icon name="users" size={16}/></div></div>
          <div className="value" style={{ color:'#15803d' }}>{kpis.disponibles}</div>
          <div className="sub">Técnicos libres</div>
        </div>
        <div className="kpi cyan-soft">
          <div className="kpi-header"><div className="label">En OT activa</div><div className="kpi-icon-wrap"><Icon name="tools" size={16}/></div></div>
          <div className="value" style={{ color:'#0891b2' }}>{kpis.en_ot}</div>
          <div className="sub">Técnicos ocupados</div>
        </div>
        <div className="kpi orange-soft">
          <div className="kpi-header"><div className="label">Sin Asignar</div><div className="kpi-icon-wrap"><Icon name="clock" size={16}/></div></div>
          <div className="value" style={{ color:'#d97706' }}>{kpis.sin_asignar}</div>
          <div className="sub">OTs pendientes</div>
        </div>
        <div className="kpi red-soft">
          <div className="kpi-header"><div className="label">Urgentes</div><div className="kpi-icon-wrap"><Icon name="alert" size={16}/></div></div>
          <div className="value" style={{ color:'#dc2626' }}>{kpis.urgentes}</div>
          <div className="sub">Prioridad alta</div>
        </div>
      </div>

      {/* ── Quick Filter Tabs ── */}
      <div className="report-toolbar">
        <div className="report-tabs">
          <button className={'report-tab' + (quickTab === 'todas' ? ' active' : '')} onClick={() => setQuickTab('todas')}>Todas las OTs</button>
          <button className={'report-tab' + (quickTab === 'sin_asignar' ? ' active' : '')} onClick={() => setQuickTab('sin_asignar')}>Sin Asignar ({kpis.sin_asignar})</button>
          <button className={'report-tab' + (quickTab === 'asignadas' ? ' active' : '')} onClick={() => setQuickTab('asignadas')}>Asignadas ({Object.keys(asignaciones).length})</button>
          <button className={'report-tab' + (quickTab === 'urgentes' ? ' active' : '')} onClick={() => setQuickTab('urgentes')}>Urgentes ({kpis.urgentes})</button>
        </div>
        <div className="report-filters">
          <input className="input" placeholder="Buscar OT o equipo..." value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }}/>
          <select className="select" value={filterTec} onChange={e => setFilterTec(e.target.value)} style={{ width:160 }}>
            <option value="Todos">Técnico: Todos</option>
            {tecnicos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Panel izquierdo — Tabla de OTs */}
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width:110 }}>OT</th>
                  <th>Equipo / Tipo</th>
                  <th style={{ width:120 }}>Prioridad</th>
                  <th>Ubicación</th>
                  <th style={{ width:140 }}>Asignación</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(ot => {
                  const tecAsignado = tecnicos.find(t => t.id === ot.asignado_a);
                  const expands = otSeleccionada === ot.id;
                  return (
                    <React.Fragment key={ot.id}>
                      <tr className="clickable" onClick={() => setOtSeleccionada(expands ? null : ot.id)}>
                        <td>
                          <div className="ot-code" style={{ fontSize:12.5 }}>{ot.id}</div>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>{ot.horas_estimadas}h est.</div>
                        </td>
                        <td>
                          <div style={{ fontWeight:700, fontSize:13 }}>{ot.equipo_id}</div>
                          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{ot.tipo} · {ot.habilidad_requerida}</div>
                        </td>
                        <td>{getPrioBadge(ot.prioridad)}</td>
                        <td>
                          <div style={{ fontSize:12.5 }}>{ot.zona}</div>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          {tecAsignado ? (
                            <span className="badge cyan"><span className="dot"/>{tecAsignado.nombre}</span>
                          ) : (
                            <button className="btn btn-sm" onClick={() => setOtSeleccionada(ot.id)} style={{ padding: '4px 8px', fontSize: 11, background: 'var(--card-bg)', border: '1px dashed var(--card-border)', color: 'var(--text-muted)' }}>
                              + Asignar
                            </button>
                          )}
                        </td>
                      </tr>
                      {expands && !ot.asignado_a && (
                        <tr style={{ background: '#F8FAFC' }}>
                          <td colSpan={5} style={{ padding: '16px', borderBottom: '1px solid var(--card-border)' }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Seleccionar Técnico para {ot.id} ({ot.habilidad_requerida})
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                              {tecnicos
                                .filter(t => t.disponible && t.habilidades.includes(ot.habilidad_requerida))
                                .map(tec => (
                                  <div key={tec.id} onClick={() => asignar(ot.id, tec.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'white', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--cyan)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-border)'}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{tec.nombre}</div>
                                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{tec.zona} · ${tec.costo_hora}/h</div>
                                    </div>
                                    <button className="btn btn-cyan btn-sm">Asignar</button>
                                  </div>
                                ))}
                              {tecnicos.filter(t => t.disponible && t.habilidades.includes(ot.habilidad_requerida)).length === 0 && (
                                <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 0' }}>
                                  No hay técnicos disponibles con la habilidad "{ot.habilidad_requerida}".
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding:'40px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                      <Icon name="search" size={28}/>
                      <div style={{ marginTop:10 }}>No hay OTs con los filtros seleccionados.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel derecho — Disponibilidad de técnicos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase', paddingLeft: 4 }}>
            Directorio de Técnicos
          </div>
          {tecnicos.map(tec => (
            <div key={tec.id} className="card" style={{ padding: 16, marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{tec.nombre}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{tec.especialidad}</div>
                </div>
                {tec.disponible ? (
                  <span className="badge green"><span className="dot"/>Disponible</span>
                ) : (
                  <span className="badge cyan"><span className="dot"/>En OT</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
                📍 {tec.zona} &nbsp;&nbsp; ⏰ {tec.turno}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tec.habilidades.map(h => (
                  <span key={h} style={{ fontSize: 10, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 6 }}>
                    {h}
                  </span>
                ))}
              </div>
              {tec.ot_actual && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E2E8F0', fontSize: 11, color: 'var(--cyan)', fontWeight: 600 }}>
                  OT Activa: {tec.ot_actual}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ── 7. MapaCampo ──────────────────────────────────────────────────────────────

export const MapaCampo = ({ setCurrent }) => {
  const datos = ZAHORY_SAC_DATA.mapa_campo || { ubicaciones: [] };
  const [seleccionado, setSeleccionado] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const tecnicos = datos.ubicaciones.filter(u => u.tipo === 'tecnico');
  const equipos  = datos.ubicaciones.filter(u => u.tipo === 'equipo');

  const getColor = (estado) => ({
    'en_ot':            '#06b6d4',
    'disponible':       '#22c55e',
    'bloqueado':        '#ef4444',
    'operativo':        '#22c55e',
    'en_mantenimiento': '#f59e0b',
    'en_transito':      '#8b5cf6',
  }[estado] || '#64748b');

  const filtrados = datos.ubicaciones.filter(u =>
    filtro === 'todos' || u.tipo === filtro
  );

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#f8fafc', margin: 0 }}>
          Mapa de Campo
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
          Vista geográfica de técnicos y equipos en campo · {datos.fecha}
        </p>
      </div>

      {/* Aviso GPS simulado */}
      <div style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 8, padding: '10px 16px',
        fontSize: 12, color: '#f59e0b', marginBottom: 20,
      }}>
        📡 Posiciones simuladas — GPS en tiempo real disponible en Fase 6 con integración de telemetría.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Técnicos en campo',     valor: tecnicos.length,                                      color: '#06b6d4' },
          { label: 'Equipos monitoreados',  valor: equipos.length,                                       color: '#8b5cf6' },
          { label: 'OTs activas',           valor: tecnicos.filter(t => t.estado === 'en_ot').length,    color: '#22c55e' },
          { label: 'Situaciones críticas',  valor: tecnicos.filter(t => t.estado === 'bloqueado').length, color: '#ef4444' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${k.color}33`,
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Mapa SVG simulado */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid #1e2d47', borderRadius: 10,
          padding: 20, minHeight: 420, position: 'relative',
        }}>
          <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 12 }}>
            Vista de zonas operativas — Perú Central y Sur
          </div>

          <svg viewBox="0 0 600 400" style={{ width: '100%', height: 360 }}>
            <rect width="600" height="400" fill="rgba(13,20,34,0.6)" rx="8"/>
            {[1,2,3,4,5].map(i => (
              <line key={`v${i}`} x1={i*100} y1="0" x2={i*100} y2="400" stroke="#1e2d47" strokeWidth="1"/>
            ))}
            {[1,2,3].map(i => (
              <line key={`h${i}`} x1="0" y1={i*100} x2="600" y2={i*100} stroke="#1e2d47" strokeWidth="1"/>
            ))}
            <text x="80"  y="80"  fill="#334155" fontSize="11" fontFamily="monospace">La Oroya</text>
            <text x="250" y="200" fill="#334155" fontSize="11" fontFamily="monospace">Lima</text>
            <text x="80"  y="320" fill="#334155" fontSize="11" fontFamily="monospace">Antapaccay</text>
            <text x="380" y="120" fill="#334155" fontSize="11" fontFamily="monospace">Buenaventura</text>

            {[
              { x: 100, y: 90,  id: 'TEC-001',  color: '#06b6d4', label: 'Miranda B.' },
              { x: 420, y: 160, id: 'TEC-002',  color: '#06b6d4', label: 'Pajuelo E.' },
              { x: 110, y: 310, id: 'TEC-003',  color: '#ef4444', label: 'Torres M.'  },
              { x: 100, y: 100, id: 'JB-DD311', color: '#f59e0b', label: 'JB-DD311'   },
              { x: 300, y: 80,  id: 'LHD-02',   color: '#22c55e', label: 'LHD-02'     },
            ].map(p => (
              <g key={p.id}
                onClick={() => setSeleccionado(datos.ubicaciones.find(u => u.id === p.id))}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={p.x} cy={p.y} r="12" fill={`${p.color}22`} stroke={p.color} strokeWidth="2"/>
                <circle cx={p.x} cy={p.y} r="5" fill={p.color}/>
                <text x={p.x+16} y={p.y+4} fill="#94a3b8" fontSize="10" fontFamily="monospace">
                  {p.label}
                </text>
              </g>
            ))}
          </svg>

          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { color: '#06b6d4', label: 'Técnico en OT'        },
              { color: '#22c55e', label: 'Equipo operativo'     },
              { color: '#f59e0b', label: 'Equipo en mantención' },
              { color: '#ef4444', label: 'Situación crítica'    },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }}/>
                <span style={{ fontSize: 10, color: '#475569' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel lateral — lista de ubicaciones */}
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['todos', 'tecnico', 'equipo'].map(f => (
              <button key={f}
                onClick={() => setFiltro(f)}
                style={{
                  flex: 1, padding: 6,
                  background: filtro === f ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.04)',
                  border: filtro === f ? '1px solid rgba(6,182,212,0.3)' : '1px solid #1e2d47',
                  borderRadius: 6, cursor: 'pointer',
                  color: filtro === f ? '#06b6d4' : '#64748b',
                  fontSize: 11, fontWeight: filtro === f ? 600 : 400,
                }}
              >
                {f === 'todos' ? 'Todos' : f === 'tecnico' ? 'Técnicos' : 'Equipos'}
              </button>
            ))}
          </div>

          {filtrados.map(u => (
            <div key={u.id}
              onClick={() => setSeleccionado(seleccionado?.id === u.id ? null : u)}
              style={{
                background: seleccionado?.id === u.id ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${seleccionado?.id === u.id ? 'rgba(6,182,212,0.3)' : '#1e2d47'}`,
                borderRadius: 8, padding: 12, marginBottom: 8, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc' }}>{u.nombre}</div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getColor(u.estado), flexShrink: 0, marginTop: 3 }}/>
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{u.zona}</div>
              {u.ot_id && (
                <div style={{ fontSize: 10, color: '#60a5fa', fontFamily: 'monospace', marginTop: 3 }}>{u.ot_id}</div>
              )}
              <div style={{ fontSize: 10, color: '#334155', marginTop: 3 }}>Última señal: {u.ultima_actualizacion}</div>
            </div>
          ))}
        </div>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ── 8. LiquidacionTransporte ──────────────────────────────────────────────────

export const LiquidacionTransporte = () => {
  const ovs       = ZAHORY_SAC_DATA.ordenes_viaje || [];
  const contratos = ZAHORY_SAC_DATA.contratos_transporte || [];

  const [filtroCliente, setFiltroCliente] = useState('todos');
  const [estadoLiq, setEstadoLiq]         = useState('borrador');

  const comerciales = ovs.filter(v =>
    v.tipo_operacion === 'comercial' &&
    (v.estado === 'completada' || v.estado === 'cerrada') &&
    (filtroCliente === 'todos' || v.cliente_id === filtroCliente)
  );

  const totalKm       = comerciales.reduce((s, v) => s + (v.km_real ?? v.km_planificado ?? 0), 0);
  const totalFacturar = comerciales.reduce((s, v) => s + (v.ingreso_estimado || 0), 0);
  const clientes      = [...new Set(ovs.filter(v => v.cliente_id).map(v => v.cliente_id))];

  const LIQ_FLOW   = ['borrador', 'enviada', 'aprobada', 'facturada'];
  const LIQ_BADGES = { borrador: 'slate', enviada: 'cyan', aprobada: 'orange', facturada: 'green' };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Liquidación de Transporte</h1>
          <div className="sub">Agrupación de viajes comerciales por cliente y período</div>
        </div>
        <div className="spacer"/>
        {comerciales.length > 0 && estadoLiq === 'borrador' && (
          <button className="btn btn-cyan" onClick={() => setEstadoLiq('enviada')}>
            <Icon name="report" size={14}/> Enviar al cliente
          </button>
        )}
      </div>

      {/* Flujo de estados */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Estado:</span>
            {LIQ_FLOW.map((s, i) => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <Icon name="arrow" size={12} style={{ color: 'var(--text-muted)' }}/>}
                <span
                  className={`badge ${LIQ_BADGES[s]}`}
                  style={{ cursor: 'pointer', opacity: estadoLiq === s ? 1 : 0.45, fontSize: 11 }}
                  onClick={() => setEstadoLiq(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Icon name="filter" size={14}/>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Cliente:</span>
            <select className="form-control" style={{ width: 220 }} value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
              <option value="todos">Todos los clientes</option>
              {clientes.map(c => {
                const ctr = contratos.find(ct => ct.cliente_id === c);
                return <option key={c} value={c}>{ctr?.cliente_nombre || c}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de viajes */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Viajes comerciales completados</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código OV</th><th>Fecha</th><th>Ruta</th>
                <th>Km real</th><th>Tarifa aplicada</th><th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {!comerciales.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    No hay viajes comerciales completados para liquidar.
                  </td>
                </tr>
              )}
              {comerciales.map(v => {
                const ctr = contratos.find(c => c.id === v.contrato_id);
                return (
                  <tr key={v.id}>
                    <td><strong>{v.id}</strong></td>
                    <td style={{ fontSize: 12 }}>{fmtDate(v.fecha_programada)}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>
                      <div>{v.origen?.split('—')[0]?.trim()}</div>
                      <div style={{ color: 'var(--text-muted)' }}>→ {v.destino?.split('—')[0]?.trim()}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {v.km_real != null ? `${v.km_real} km` : `${v.km_planificado} km (est.)`}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {ctr ? `${TIPO_TARIFA_LABEL[ctr.tipo_tarifa]} · ${ctr.tarifa_km || ctr.tarifa_base} ${ctr.moneda}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtUSD(v.ingreso_estimado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen */}
      {comerciales.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>Resumen de liquidación</h3></div>
          <div className="card-body">
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
              <div className="kpi-card">
                <div className="kpi-value">{comerciales.length}</div>
                <div className="kpi-label">Viajes del período</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{totalKm.toLocaleString()} km</div>
                <div className="kpi-label">Km totales</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{fmtUSD(totalFacturar)}</div>
                <div className="kpi-label">Total a facturar</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {estadoLiq === 'aprobada' && (
                <button className="btn btn-cyan" onClick={() => alert('Generando factura en módulo Facturación...')}>
                  <Icon name="report" size={14}/> Generar factura
                </button>
              )}
              {estadoLiq === 'enviada' && (
                <button className="btn btn-cyan" onClick={() => setEstadoLiq('aprobada')}>
                  <Icon name="check" size={14}/> Marcar como aprobada
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};
