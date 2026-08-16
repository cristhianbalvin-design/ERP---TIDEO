import React, { useState as useS2 } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

// ─── OTs Centro de Control Operativo ─────────────────────────────────────────

// ── Columna 3: Clasificación (tipo_trabajo) — badge outline con color semántico
const TRABAJO_CFG = {
  Preventivo_PM:     { label: 'Preventivo PM',    cls: 'badge-tipo badge-tipo-pm'       },
  Correctivo:        { label: 'Correctivo',        cls: 'badge-tipo badge-tipo-corr'     },
  Acondicionamiento: { label: 'Acondicionamiento', cls: 'badge-tipo badge-tipo-acond'    },
  Overhaul:          { label: 'Overhaul',          cls: 'badge-tipo badge-tipo-overhaul' },
};

// ── Columna 3: Clasificación (tipo_cargo) — badge filled, rework destructivo
const CARGO_CFG = {
  Cliente_Contrato: { label: 'Cliente / Contrato', cls: 'badge cyan'    },
  Interno_Zahory:    { label: 'Interno plataforma', cls: 'badge slate'   },
  Garantia_Fabrica: { label: 'Garantía Fábrica',   cls: 'badge orange'  },
  Reclamo_Rework:   { label: '⚠ Reclamo / Rework', cls: 'badge-destructive' },
};

// ── Columna 4: Estado técnico — dot 8px + label
const ESTADO_CFG = {
  'Planificada':      { dotColor: '#94A3B8', bg: '#F1F5F9', textColor: '#475569', label: 'Planificada'       },
  'En Ejecución':     { dotColor: '#4CAF50', bg: '#E8F5E9', textColor: '#1B5E20', label: 'En Ejecución'      },
  'Espera Repuestos': { dotColor: '#FF9800', bg: '#FFF3E0', textColor: '#C15D00', label: 'Espera Repuestos'  },
  'Finalizada':       { dotColor: '#00BCD4', bg: '#E0F7FA', textColor: '#006978', label: 'Finalizada'        },
  'Cerrada':          { dotColor: '#64748b', bg: '#F1F5F9', textColor: '#475569', label: 'Cerrada'           },
};

// ── Centro de costo — badge monospace
const CC_CFG = {
  'FLO-ALQ':  { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  'OPS-INT':  { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
  'PROD-MAE': { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6' },
  'PROD-SOL': { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
};

// ── Variación de costo (retorna null si no aplica)
const getCostoVariacion = (ot) => {
  if (!ot.costo_estimado || ot.costo_estimado === 0) return null;
  if (!ot.costo_real || ot.costo_real === 0) return null;
  const diff = ot.costo_real - ot.costo_estimado;
  const pct  = (diff / ot.costo_estimado) * 100;
  return { diff, pct, ok: diff <= 0 };
};

// Enriquece cada OT con campos derivados no presentes en el mock
const NOW = new Date('2026-04-20');
const ESTADO_TEC_SEQ = ['En Ejecución','En Ejecución','Planificada','Espera Repuestos','Finalizada','Finalizada','En Ejecución','Espera Repuestos','Planificada'];
const UBICACION_MAP = {
  Buenaventura: 'Mina — Buenaventura',
  Antapaccay:   'Mina — Antapaccay',
  'Pepas de Oro': 'Mina — Pepas de Oro',
  '—':          'Taller — Lurín',
};
const enrichOT = (r, i) => ({
  ...r,
  estadoTecnico: r.tipoCargo === 'Reclamo_Rework' ? 'En Ejecución' : ESTADO_TEC_SEQ[i % ESTADO_TEC_SEQ.length],
  ubicacion: r.tipoCargo === 'Interno_Zahory' ? 'Taller — Lurín' : (UBICACION_MAP[r.proy] || 'Taller — Carapongo'),
  dias: Math.max(0, Math.round((NOW - new Date(r.fechaProgramadaInicio)) / 86400000)),
});

const QUICK_TABS = [
  { id: 'activas',   label: 'Todas las activas' },
  { id: 'taller',    label: 'En Taller' },
  { id: 'mina',      label: 'En Mina' },
  { id: 'repuestos', label: 'Espera Repuestos' },
  { id: 'rework',    label: 'Retrabajos', alert: true },
];

const applyQuickFilter = (rows, tab) => {
  if (tab === 'taller')    return rows.filter(r => r.ubicacion.startsWith('Taller'));
  if (tab === 'mina')      return rows.filter(r => r.ubicacion.startsWith('Mina'));
  if (tab === 'repuestos') return rows.filter(r => r.estadoTecnico === 'Espera Repuestos');
  if (tab === 'rework')    return rows.filter(r => r.tipoCargo === 'Reclamo_Rework');
  return rows;
};

const SlaChip = ({ dias }) => {
  const color = dias <= 3 ? '#4CAF50' : dias <= 7 ? '#FF9800' : '#E53935';
  const bg    = dias <= 3 ? '#E8F5E9' : dias <= 7 ? '#FFF3E0' : '#FFEBEE';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:12,
      background: bg, color, fontSize:11, fontWeight:700, fontFamily:'ui-monospace,monospace' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background: color, flexShrink:0 }}/>
      {dias}d
    </span>
  );
};

const ActionMenu = ({ ot, onNav, setCurrentOT, open, onOpen, onClose }) => (
  <div style={{ position:'relative' }}>
    <button
      className="btn btn-ghost btn-sm"
      style={{ padding:'4px 8px', fontSize:16, lineHeight:1 }}
      onClick={e => { e.stopPropagation(); open ? onClose() : onOpen(); }}
    >⋯</button>
    {open && (
      <div style={{
        position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:100,
        background:'white', border:'1px solid var(--card-border)',
        borderRadius:8, boxShadow:'0 8px 24px rgba(17,24,39,0.12)',
        width:200, padding:'4px 0', fontSize:13,
      }} onClick={e => e.stopPropagation()}>
        {[
          { icon:'report', label:'Ver detalles', action: () => { setCurrentOT(ot.codigo); onNav('ot-detalle'); onClose(); } },
          { icon:'pdf',    label:'Reporte técnico (PDF)', action: onClose },
          { icon:'edit',   label:'Registrar horas / partes', action: onClose },
          { icon:'orders', label:'Ver historial técnico', action: onClose },
        ].map(({ icon, label, action }) => (
          <button key={label}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:9, padding:'8px 14px',
              background:'none', fontSize:13, color:'var(--text)', textAlign:'left' }}
            className="btn"
            onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
            onMouseLeave={e => e.currentTarget.style.background='none'}
            onClick={action}>
            <Icon name={icon} size={13}/> {label}
          </button>
        ))}
      </div>
    )}
  </div>
);

export const OTsListadoPage = ({ onNav, setCurrentOT }) => {
  const D = ZAHORY_SAC_DATA;
  const [otsState, setOtsState] = useS2(() => D.otsCostos.map(enrichOT));
  const all = otsState;

  const [quickTab,  setQuickTab]  = useS2('activas');
  const [search,    setSearch]    = useS2('');
  const [filterTec, setFilterTec] = useS2('Todos');
  const [openMenu,  setOpenMenu]  = useS2(null);
  const [toast,     setToast]     = useS2(null);

  const handleCierreLiquidacion = (ot) => {
    if (!window.confirm(
      `¿Confirmar cierre y liquidación de ${ot.codigo}?\n\nCosto real: $${ot.costo_real.toLocaleString()}\nSe imputará al ${ot.objeto_costo_tipo}: ${ot.objeto_costo_id}\nCentro de costo: ${ot.centro_costo}`
    )) return;
    setOtsState(prev => prev.map(o =>
      o.codigo === ot.codigo
        ? { ...o, estadoTecnico: 'Cerrada', liquidada: true, fecha_cierre: new Date().toISOString().split('T')[0] }
        : o
    ));
    const msg = `${ot.codigo} cerrada y liquidada. Costo $${ot.costo_real.toLocaleString()} imputado a ${ot.objeto_costo_id}`;
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const filtered = applyQuickFilter(all, quickTab)
    .filter(r => !search || r.codigo.toLowerCase().includes(search.toLowerCase()) || r.eq.toLowerCase().includes(search.toLowerCase()))
    .filter(r => filterTec === 'Todos' || r.tec === filterTec);

  // KPIs para la barra de salud
  const kpis = {
    ejecucion: all.filter(r => r.estadoTecnico === 'En Ejecución').length,
    espera:    all.filter(r => r.estadoTecnico === 'Espera Repuestos').length,
    planif:    all.filter(r => r.estadoTecnico === 'Planificada').length,
    fin:       all.filter(r => r.estadoTecnico === 'Finalizada').length,
    rework:    all.filter(r => r.tipoCargo === 'Reclamo_Rework').length,
  };
  const total = all.length;
  const tecnicos = [...new Set(all.map(r => r.tec))];

  return (
    <div className="page" onClick={() => setOpenMenu(null)}>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Tablero de OTs</h1>
          <div className="sub">Centro de control operativo · {total} órdenes activas · Abril 2026</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar</button>
        <button className="btn btn-cyan" onClick={() => onNav('crear-ot')}><Icon name="plus" size={13}/> Nueva OT</button>
      </div>

      {/* ── Barra de Salud Operativa ── */}
      <div className="report-kpi-grid">
        <div className="kpi">
          <div className="kpi-header"><div className="label">OTs activas</div><div className="kpi-icon-wrap"><Icon name="orders" size={16}/></div></div>
          <div className="value">{total}</div>
          <div className="sub">Centro de control</div>
        </div>
        <div className="kpi green-soft">
          <div className="kpi-header"><div className="label">En ejecucion</div><div className="kpi-icon-wrap"><Icon name="check" size={16}/></div></div>
          <div className="value" style={{ color:'#15803d' }}>{kpis.ejecucion}</div>
          <div className="sub">Trabajos activos</div>
        </div>
        <div className="kpi orange-soft">
          <div className="kpi-header"><div className="label">Espera repuestos</div><div className="kpi-icon-wrap"><Icon name="clock" size={16}/></div></div>
          <div className="value" style={{ color:'#d97706' }}>{kpis.espera}</div>
          <div className="sub">Pendientes de abastecimiento</div>
        </div>
        <div className="kpi cyan-soft">
          <div className="kpi-header"><div className="label">Finalizadas</div><div className="kpi-icon-wrap"><Icon name="check" size={16}/></div></div>
          <div className="value" style={{ color:'#0891b2' }}>{kpis.fin}</div>
          <div className="sub">Listas para cierre</div>
        </div>
        <div className="kpi red-soft">
          <div className="kpi-header"><div className="label">Retrabajos</div><div className="kpi-icon-wrap"><Icon name="alert" size={16}/></div></div>
          <div className="value" style={{ color:'#dc2626' }}>{kpis.rework}</div>
          <div className="sub">Reclamos / rework</div>
        </div>
        <div style={{ display:'none' }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.8px', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:7 }}>
              Salud operativa — distribución de estados
            </div>
            <div style={{ display:'flex', height:8, borderRadius:8, overflow:'hidden', gap:2 }}>
              {[
                { n: kpis.ejecucion, color:'#4CAF50' },
                { n: kpis.espera,    color:'#FF9800'  },
                { n: kpis.planif,    color:'#94A3B8'  },
                { n: kpis.fin,       color:'#00BCD4'  },
              ].map(({ n, color }, i) => (
                <div key={i} style={{ flex: n || 0.05, background: color, borderRadius: 4, transition:'flex .3s' }}/>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            {[
              { label:'En Ejecución',     val: kpis.ejecucion, color:'#2E7D32', bg:'#E8F5E9' },
              { label:'Espera Repuestos', val: kpis.espera,    color:'#E65100', bg:'#FFF3E0' },
              { label:'Planificadas',     val: kpis.planif,    color:'#546E7A', bg:'#F1F5F9' },
              { label:'Finalizadas',      val: kpis.fin,       color:'#006064', bg:'#E0F7FA' },
              { label:'Retrabajos',       val: kpis.rework,    color:'#C62828', bg:'#FFEBEE' },
            ].map(({ label, val, color, bg }) => (
              <div key={label} style={{ textAlign:'center', padding:'6px 14px', borderRadius:8, background: bg, minWidth:80 }}>
                <div style={{ fontSize:22, fontWeight:800, color, fontFamily:'ui-monospace,monospace', lineHeight:1.1 }}>{val}</div>
                <div style={{ fontSize:10, color, fontWeight:700, marginTop:2, letterSpacing:'.3px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick Filter Tabs ── */}
      <div className="report-toolbar">
        <div className="report-tabs">
        {QUICK_TABS.map(t => (
          <button
            key={t.id}
            className={'report-tab' + (quickTab === t.id ? ' active' : '')}
            onClick={() => setQuickTab(t.id)}
          >
            {t.label} ({applyQuickFilter(all, t.id).length})
          </button>
        ))}
        </div>
        <div className="report-filters">
        {/* Secondary filters */}
        <input
          className="input"
          placeholder="Buscar OT o equipo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width:220 }}
        />
        <select className="select" value={filterTec} onChange={e => setFilterTec(e.target.value)} style={{ width:160 }}>
          <option value="Todos">Técnico: Todos</option>
          {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        </div>
      </div>

      {/* ── Tabla Principal ── */}
      <div className="card">
        <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width:130 }}>OT / Fecha</th>
              <th>Activo / Cliente</th>
              <th style={{ width:160 }}>Tipo & Cargo</th>
              <th style={{ width:152 }}>Estado técnico</th>
              <th>Ubicación</th>
              <th style={{ width:128, textAlign:'right' }}>Costo</th>
              <th style={{ width:72 }}>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  SLA
                  <span
                    title={"Días transcurridos desde la apertura de la OT.\nVerde: menos de 3 días.\nÁmbar: 3 a 7 días.\nRojo: más de 7 días sin cierre técnico."}
                    style={{ cursor:'help', color:'#64748b', fontSize:'11px', fontWeight:400 }}
                  >ⓘ</span>
                </span>
              </th>
              <th style={{ width:140 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const etCfg    = ESTADO_CFG[r.estadoTecnico]  || ESTADO_CFG['Planificada'];
              const tCfg     = TRABAJO_CFG[r.tipoTrabajo]   || { label: r.tipoTrabajo,  cls: 'badge-tipo' };
              const cargoCfg = CARGO_CFG[r.tipoCargo]       || { label: r.tipoCargo,    cls: 'badge slate' };
              const ccCfg    = CC_CFG[r.centro_costo]       || { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' };
              const costoVar = getCostoVariacion(r);
              return (
                <tr key={r.codigo} className="clickable"
                  onClick={() => { setCurrentOT(r.codigo); onNav('ot-detalle'); }}>

                  {/* Col 1 — OT / Fecha */}
                  <td>
                    <div className="ot-code" style={{ fontSize:12.5 }}>{r.codigo}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                      {r.fechaProgramadaInicio}
                    </div>
                  </td>

                  {/* Col 2 — Activo / Cliente */}
                  <td>
                    <div style={{ fontWeight:700, fontSize:13 }}>{r.eq}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{r.proy}</div>
                    {r.tipoCargo === 'Cliente_Contrato' && r.objeto_costo_id && (
                      <div
                        style={{ fontSize:'10px', color:'#60a5fa', fontFamily:'monospace', marginTop:'2px', cursor:'pointer' }}
                        onClick={e => { e.stopPropagation(); onNav('contratos-rental'); }}
                      >{r.objeto_costo_id}</div>
                    )}
                    {r.tipoCargo === 'Interno_Zahory' && (
                      <div style={{ fontSize:'10px', color:'#64748b', marginTop:'2px' }}>
                        Interno · {r.centro_costo}
                      </div>
                    )}
                    {r.horometro_apertura && (
                      <div style={{ fontSize:'9.5px', color:'#475569', fontFamily:'monospace', marginTop:'1px' }}>
                        Horóm. ap.: {r.horometro_apertura.toLocaleString()}h
                      </div>
                    )}
                  </td>

                  {/* Col 3 — Tipo & Cargo */}
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <span className={tCfg.cls}>{tCfg.label}</span>
                      <span className={cargoCfg.cls} style={{ fontSize:10 }}>
                        {r.tipoCargo !== 'Reclamo_Rework' && <span className="dot"/>}
                        {cargoCfg.label}
                        {r.tipoCargo === 'Reclamo_Rework' && (
                          <span
                            title={r.motivo_rework || '⚠ Sin motivo registrado'}
                            style={{ cursor:'help', marginLeft:'4px', color: r.motivo_rework ? '#ef4444' : '#b91c1c', fontSize:'11px' }}
                          >ⓘ</span>
                        )}
                      </span>
                      <span style={{
                        display:'inline-block',
                        background: ccCfg.bg,
                        color: ccCfg.color,
                        fontSize:'8.5px', fontFamily:'monospace',
                        padding:'1px 6px', borderRadius:'6px', fontWeight:600,
                        alignSelf:'flex-start',
                      }}>{r.centro_costo}</span>
                    </div>
                  </td>

                  {/* Col 4 — Estado Técnico */}
                  <td>
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      padding:'3px 9px', borderRadius:20,
                      background: etCfg.bg, color: etCfg.textColor,
                      fontSize:11.5, fontWeight:600,
                    }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background: etCfg.dotColor, flexShrink:0 }}/>
                      {etCfg.label}
                    </span>
                  </td>

                  {/* Col 5 — Ubicación */}
                  <td>
                    <div style={{ fontSize:12.5 }}>{r.ubicacion.split(' — ')[0]}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>
                      {r.ubicacion.split(' — ')[1] || ''}
                    </div>
                  </td>

                  {/* Col 6 — Costo estimado vs real */}
                  <td style={{ textAlign:'right', verticalAlign:'middle' }} onClick={e => e.stopPropagation()}>
                    {r.costo_estimado > 0 ? (
                      r.costo_real > 0 ? (
                        <div>
                          <span style={{ fontWeight:700, fontSize:'13px', color:'var(--navy)' }}>
                            ${r.costo_real.toLocaleString()}
                          </span>
                          <span style={{ display:'block', fontSize:'10px', color:'#64748b' }}>
                            est. ${r.costo_estimado.toLocaleString()}
                          </span>
                          {costoVar && (
                            <span style={{ fontSize:'9px', fontWeight:600, color: costoVar.ok ? '#22c55e' : '#ef4444' }}>
                              {costoVar.ok ? '▼' : '▲'}{Math.abs(costoVar.pct).toFixed(0)}%
                              {!costoVar.ok && ' sobre est.'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color:'#64748b', fontSize:'12px' }}>
                          Est. ${r.costo_estimado.toLocaleString()}
                        </span>
                      )
                    ) : (
                      <span style={{ color:'#334155' }}>—</span>
                    )}
                  </td>

                  {/* Col 7 — SLA */}
                  <td className="num" onClick={e => e.stopPropagation()}>
                    <SlaChip dias={r.dias}/>
                  </td>

                  {/* Col 8 — Acciones */}
                  <td onClick={e => e.stopPropagation()} style={{ overflow:'visible' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      {r.estadoTecnico === 'Finalizada' && !r.liquidada && (
                        <button
                          onClick={() => handleCierreLiquidacion(r)}
                          style={{
                            background:'rgba(34,197,94,0.15)', color:'#22c55e',
                            border:'1px solid rgba(34,197,94,0.3)',
                            borderRadius:'6px', padding:'4px 8px',
                            fontSize:'11px', fontWeight:600, cursor:'pointer',
                            whiteSpace:'nowrap',
                          }}
                        >✓ Cerrar & Liquidar</button>
                      )}
                      <ActionMenu
                        ot={r}
                        onNav={onNav}
                        setCurrentOT={setCurrentOT}
                        open={openMenu === r.codigo}
                        onOpen={() => setOpenMenu(r.codigo)}
                        onClose={() => setOpenMenu(null)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding:'40px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
            <Icon name="search" size={28}/>
            <div style={{ marginTop:10 }}>No hay OTs con los filtros seleccionados.</div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:1000,
          background:'#1e293b', color:'white',
          padding:'12px 20px', borderRadius:10,
          fontSize:13, fontWeight:600,
          boxShadow:'0 8px 24px rgba(0,0,0,0.3)',
          borderLeft:'4px solid #22c55e',
        }}>
          ✓ {toast}
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};
// ── Partes Diarios — datos mock ────────────────────────────────────────────
const PARTES_TALLER_MOCK = [
  { id: 'PT-2026-041', fecha: '2026-04-19', mecanico: 'Quispe R.',  ot: 'OT-2026-050', horas: 8.0, estado: 'Aprobado',  tecnico_id: 'TEC-003', tecnico_nombre: 'García Quispe, Roberto', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Mecánico', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-24', avance_ot_pct: 45, actividades: [{id:'ACT-001',descripcion:'Reparación menor',hora_inicio:'08:00',hora_fin:'16:00',horometro_inicio:1000,horometro_fin:1008}], repuestos_consumidos: [{item_id:'REP-CAT-0441',descripcion:'Sello hidráulico kit completo',cantidad:2,unidad:'kit',costo_unitario:145.00}], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-040', fecha: '2026-04-18', mecanico: 'Torres M.',  ot: 'OT-2026-048', horas: 7.5, estado: 'Aprobado',  tecnico_id: 'TEC-004', tecnico_nombre: 'Torres Mamani, Miguel', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Electricista', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-26', avance_ot_pct: 60, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-039', fecha: '2026-04-17', mecanico: 'Quispe R.',  ot: 'OT-2026-044', horas: 6.0, estado: 'Aprobado',  tecnico_id: 'TEC-003', tecnico_nombre: 'García Quispe, Roberto', supervisor: 'Supervisor del taller', taller: 'Satipo', especialidad: 'Mecánico', contrato_id: 'CT-2026-001', centro_costo: 'FLO-ALQ', equipo_id: 'JB-DD311', avance_ot_pct: 100, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-038', fecha: '2026-04-16', mecanico: 'Pajuelo E.', ot: 'OT-2026-042', horas: 8.0, estado: 'Pendiente', tecnico_id: 'TEC-001', tecnico_nombre: 'Pajuelo Jurado, Edson', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Mecatrónico', contrato_id: 'CT-2026-003', centro_costo: 'FLO-ALQ', equipo_id: 'SC-701', avance_ot_pct: 20, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-037', fecha: '2026-04-15', mecanico: 'Torres M.',  ot: 'OT-2026-041', horas: 4.5, estado: 'Rechazado', tecnico_id: 'TEC-004', tecnico_nombre: 'Torres Mamani, Miguel', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Electricista', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-24', avance_ot_pct: 35, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-036', fecha: '2026-04-14', mecanico: 'Condori L.', ot: 'OT-2026-039', horas: 8.0, estado: 'Aprobado',  tecnico_id: 'TEC-005', tecnico_nombre: 'López Vargas, Carlos', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Mecánico', contrato_id: 'CT-2026-001', centro_costo: 'FLO-ALQ', equipo_id: 'JB-DD311', avance_ot_pct: 50, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-035', fecha: '2026-04-13', mecanico: 'Quispe R.',  ot: 'OT-2026-038', horas: 7.0, estado: 'Aprobado',  tecnico_id: 'TEC-003', tecnico_nombre: 'García Quispe, Roberto', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Mecánico', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-26', avance_ot_pct: 80, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PT-2026-034', fecha: '2026-04-12', mecanico: 'Pajuelo E.', ot: 'OT-2026-035', horas: 3.0, estado: 'Pendiente', tecnico_id: 'TEC-001', tecnico_nombre: 'Pajuelo Jurado, Edson', supervisor: 'Supervisor del taller', taller: 'Ate', especialidad: 'Mecatrónico', contrato_id: 'CT-2026-003', centro_costo: 'FLO-ALQ', equipo_id: 'SC-701', avance_ot_pct: 10, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
];

const PARTES_MINA_MOCK = [
  { id: 'PM-2026-016', fecha: '2026-04-16', mecanico: 'Miranda B.', ot: 'OT-2026-047', horas: 2.9, estado: 'Aprobado',  tecnico_id: 'TEC-002', tecnico_nombre: 'Miranda Barra, Sandro', supervisor: 'Supervisor Mina', taller: 'Mina', especialidad: 'Mecánico', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-24', avance_ot_pct: 45, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PM-2026-015', fecha: '2026-04-15', mecanico: 'Pajuelo E.', ot: 'OT-2026-045', horas: 3.9, estado: 'Aprobado',  tecnico_id: 'TEC-001', tecnico_nombre: 'Pajuelo Jurado, Edson', supervisor: 'Supervisor Mina', taller: 'Mina', especialidad: 'Mecatrónico', contrato_id: 'CT-2026-003', centro_costo: 'FLO-ALQ', equipo_id: 'SC-701', avance_ot_pct: 60, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PM-2026-014', fecha: '2026-04-14', mecanico: 'Torres M.',  ot: 'OT-2026-043', horas: 2.5, estado: 'Rechazado', tecnico_id: 'TEC-004', tecnico_nombre: 'Torres Mamani, Miguel', supervisor: 'Supervisor Mina', taller: 'Mina', especialidad: 'Electricista', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-26', avance_ot_pct: 20, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PM-2026-013', fecha: '2026-04-13', mecanico: 'Miranda B.', ot: 'OT-2026-041', horas: 4.1, estado: 'Aprobado',  tecnico_id: 'TEC-002', tecnico_nombre: 'Miranda Barra, Sandro', supervisor: 'Supervisor Mina', taller: 'Mina', especialidad: 'Mecánico', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-24', avance_ot_pct: 100, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PM-2026-012', fecha: '2026-04-12', mecanico: 'Pajuelo E.', ot: 'OT-2026-040', horas: 3.5, estado: 'Pendiente', tecnico_id: 'TEC-001', tecnico_nombre: 'Pajuelo Jurado, Edson', supervisor: 'Supervisor Mina', taller: 'Mina', especialidad: 'Mecatrónico', contrato_id: 'CT-2026-003', centro_costo: 'FLO-ALQ', equipo_id: 'SC-701', avance_ot_pct: 35, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
  { id: 'PM-2026-011', fecha: '2026-04-11', mecanico: 'Torres M.',  ot: 'OT-2026-038', horas: 2.0, estado: 'Pendiente', tecnico_id: 'TEC-004', tecnico_nombre: 'Torres Mamani, Miguel', supervisor: 'Supervisor Mina', taller: 'Mina', especialidad: 'Electricista', contrato_id: 'CT-2026-002', centro_costo: 'FLO-ALQ', equipo_id: 'JB-26', avance_ot_pct: 50, actividades: [], repuestos_consumidos: [], fluidos_consumidos: [], trabajos_pendientes: null, observaciones: null, backlog_generado_id: null },
];

// ── Shared UI — Partes Diarios ─────────────────────────────────────────────

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const fmtFechaCorta = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d} ${MESES_CORTOS[parseInt(m, 10) - 1]} ${y}`;
};

const EstadoBadgeParte = ({ estado }) => {
  if (estado === 'Aprobado')  return <span className="badge green"><span className="dot"/>Aprobado</span>;
  if (estado === 'Rechazado') return <span className="badge red"><span className="dot"/>Rechazado</span>;
  return <span className="badge orange"><span className="dot"/>Pendiente</span>;
};

const PARTES_TABS = [
  { id: 'todos',      label: 'Todos'      },
  { id: 'Pendiente',  label: 'Pendientes' },
  { id: 'Aprobado',   label: 'Aprobados'  },
  { id: 'Rechazado',  label: 'Rechazados' },
];

const PartesMenuAcciones = ({ onNav, editRoute, open, onOpen, onClose }) => (
  <div style={{ position:'relative' }}>
    <button
      className="btn btn-ghost btn-sm"
      style={{ padding:'4px 8px', fontSize:16, lineHeight:1 }}
      onClick={e => { e.stopPropagation(); open ? onClose() : onOpen(); }}
    >⋯</button>
    {open && (
      <div style={{
        position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:100,
        background:'white', border:'1px solid var(--card-border)',
        borderRadius:8, boxShadow:'0 8px 24px rgba(17,24,39,0.12)',
        width:190, padding:'4px 0',
      }} onClick={e => e.stopPropagation()}>
        {[
          { icon:'report', label:'Ver detalle',  color:'var(--text)',  action: onClose },
          { icon:'edit',   label:'Editar parte', color:'var(--text)',  action: () => { onNav(editRoute); onClose(); } },
          { icon:'x',      label:'Eliminar',     color:'#E53935',     action: onClose },
        ].map(({ icon, label, color, action }) => (
          <button key={label}
            className="btn"
            style={{
              width:'100%', display:'flex', alignItems:'center', gap:9,
              padding:'8px 14px', background:'none', fontSize:13,
              color, textAlign:'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
            onMouseLeave={e => e.currentTarget.style.background='none'}
            onClick={action}
          >
            <Icon name={icon} size={13}/> {label}
          </button>
        ))}
      </div>
    )}
  </div>
);

const PartesDiariosToolbar = ({ tab, setTab, allRows, search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo }) => (
  <div className="report-toolbar">
    <div className="report-tabs">
    {PARTES_TABS.map(t => (
      <button key={t.id}
        className={'report-tab' + (tab === t.id ? ' active' : '')}
        onClick={() => setTab(t.id)}
      >
        {t.label} ({t.id === 'todos' ? allRows.length : allRows.filter(r => r.estado === t.id).length})
      </button>
    ))}
    </div>
    <div className="report-filters">
    <input className="input" placeholder="Buscar por técnico u OT..."
      value={search} onChange={e => setSearch(e.target.value)} style={{ width:230 }}/>
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>Desde</span>
      <input className="input" type="date" value={dateFrom}
        onChange={e => setDateFrom(e.target.value)} style={{ width:140 }}/>
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>Hasta</span>
      <input className="input" type="date" value={dateTo}
        onChange={e => setDateTo(e.target.value)} style={{ width:140 }}/>
    </div>
  </div>
  </div>
);

const PartesDiariosDataTable = ({ rows, onNav, editRoute, openMenu, setOpenMenu }) => (
  <div className="card">
    <div className="table-wrap">
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width:136 }}>Nº Parte</th>
          <th style={{ width:136 }}>Fecha</th>
          <th>Técnico</th>
          <th style={{ width:148 }}>OT Vinculada</th>
          <th style={{ width:116 }} className="num">Horas Totales</th>
          <th style={{ width:120 }}>Estado</th>
          <th style={{ width:56 }}>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="clickable">
            <td>
              <button
                className="btn btn-ghost btn-sm"
                title="Ver detalle del Parte Diario"
                onClick={() => onNav(editRoute)}
                style={{
                  fontFamily:'ui-monospace,monospace', fontSize:12,
                  color:'var(--cyan)', padding:'2px 6px',
                  textDecoration:'underline', textUnderlineOffset:3,
                }}
              >
                {r.id}
              </button>
            </td>
            <td style={{ fontSize:12.5 }}>{fmtFechaCorta(r.fecha)}</td>
            <td style={{ fontWeight:600, fontSize:13 }}>{r.mecanico}</td>
            <td>
              <span className="chip" style={{ fontSize:11.5, fontFamily:'ui-monospace,monospace' }}>
                {r.ot}
              </span>
            </td>
            <td className="num">
              <span style={{ fontFamily:'ui-monospace,monospace', fontWeight:700, fontSize:13 }}>
                {r.horas.toFixed(1)} h
              </span>
            </td>
            <td><EstadoBadgeParte estado={r.estado}/></td>
            <td onClick={e => e.stopPropagation()} style={{ overflow:'visible' }}>
              <PartesMenuAcciones
                onNav={onNav}
                editRoute={editRoute}
                open={openMenu === r.id}
                onOpen={() => setOpenMenu(r.id)}
                onClose={() => setOpenMenu(null)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
    {rows.length === 0 && (
      <div style={{ padding:'40px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
        <Icon name="search" size={28}/>
        <div style={{ marginTop:10 }}>No hay partes con los filtros aplicados.</div>
      </div>
    )}
  </div>
);

// ── Gestión de Partes Diarios — Taller ────────────────────────────────────
export const GestionPartesTallerPage = ({ onNav }) => {
  const [tab,      setTab]      = useS2('todos');
  const [search,   setSearch]   = useS2('');
  const [dateFrom, setDateFrom] = useS2('');
  const [dateTo,   setDateTo]   = useS2('');
  const [openMenu, setOpenMenu] = useS2(null);

  const filtered = PARTES_TALLER_MOCK
    .filter(r => tab === 'todos' || r.estado === tab)
    .filter(r => !search   || r.mecanico.toLowerCase().includes(search.toLowerCase()) || r.ot.toLowerCase().includes(search.toLowerCase()))
    .filter(r => !dateFrom || r.fecha >= dateFrom)
    .filter(r => !dateTo   || r.fecha <= dateTo);

  return (
    <div className="page" onClick={() => setOpenMenu(null)}>
      <div className="page-header">
        <div>
          <h1>Gestión de Partes Diarios — Taller</h1>
          <div className="sub">Carapongo y Lurín · {PARTES_TALLER_MOCK.length} registros</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-primary" onClick={() => onNav('crear-parte-taller')}>
          <Icon name="plus" size={13}/> Nuevo Parte Diario
        </button>
      </div>
      <PartesDiariosToolbar
        tab={tab} setTab={setTab} allRows={PARTES_TALLER_MOCK}
        search={search} setSearch={setSearch}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
      />
      <PartesDiariosDataTable
        rows={filtered} onNav={onNav}
        editRoute="crear-parte-taller"
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />
      <FooterBrand/>
    </div>
  );
};

// ── Gestión de Partes Diarios — Campo / Mina ──────────────────────────────
export const HistorialMinaPage = ({ onNav }) => {
  const [tab,      setTab]      = useS2('todos');
  const [search,   setSearch]   = useS2('');
  const [dateFrom, setDateFrom] = useS2('');
  const [dateTo,   setDateTo]   = useS2('');
  const [openMenu, setOpenMenu] = useS2(null);

  const filtered = PARTES_MINA_MOCK
    .filter(r => tab === 'todos' || r.estado === tab)
    .filter(r => !search   || r.mecanico.toLowerCase().includes(search.toLowerCase()) || r.ot.toLowerCase().includes(search.toLowerCase()))
    .filter(r => !dateFrom || r.fecha >= dateFrom)
    .filter(r => !dateTo   || r.fecha <= dateTo);

  return (
    <div className="page" onClick={() => setOpenMenu(null)}>
      <div className="page-header">
        <div>
          <h1>Gestión de Partes Diarios — Campo / Mina</h1>
          <div className="sub">Buenaventura · Antapaccay · Pepas de Oro · {PARTES_MINA_MOCK.length} registros</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-primary" onClick={() => onNav?.('nuevo-reporte')}>
          <Icon name="plus" size={13}/> Nuevo Parte Diario
        </button>
      </div>
      <PartesDiariosToolbar
        tab={tab} setTab={setTab} allRows={PARTES_MINA_MOCK}
        search={search} setSearch={setSearch}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
      />
      <PartesDiariosDataTable
        rows={filtered} onNav={onNav}
        editRoute="nuevo-reporte"
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />
      <FooterBrand/>
    </div>
  );
};

// ---------- Solicitudes SOLPE ----------
export const SolicitudesPage = ({ onNav }) => {
  const D = ZAHORY_SAC_DATA;
  const [solpes,             setSolpes]             = useS2(D.solicitudesUrgentes);
  const [repuestosState,     setRepuestosState]     = useS2(D.repuestos);
  const [solpeAtendiendo,    setSolpeAtendiendo]    = useS2(null);
  const [modalAtenderAbierto,setModalAtenderAbierto]= useS2(false);
  const [toast,              setToast]              = useS2(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAtender = (solpe) => {
    setSolpeAtendiendo(solpe);
    setModalAtenderAbierto(true);
  };

  const despacharDesdeStock = (solpe, item) => {
    setRepuestosState(prev => prev.map(r =>
      r.cod === item.cod ? { ...r, stock: r.stock - solpe.cantidad } : r
    ));
    setSolpes(prev => prev.map(s =>
      s.id === solpe.id
        ? { ...s, estado:'atendido', atendido_por:'A. Parado',
            atendido_fecha: new Date().toISOString().split('T')[0] }
        : s
    ));
    setModalAtenderAbierto(false);
    showToast(`SOLPE ${solpe.id} atendida. Stock de ${item.cod} actualizado.`);
  };

  const generarOC = (solpe) => {
    setModalAtenderAbierto(false);
    showToast('Redirigiendo a Órdenes de Compra con SOLPE pre-cargada.');
    setTimeout(() => onNav && onNav('compras-oc'), 800);
  };

  const itemAtendiendo = solpeAtendiendo
    ? repuestosState.find(r => r.cod === solpeAtendiendo.item_id)
    : null;

  const hayStock = itemAtendiendo && itemAtendiendo.stock >= (solpeAtendiendo?.cantidad || 0);

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Solicitudes SOLPE</h1><div className="sub">Pedidos desde mina y taller — para pasar a compras</div></div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar a Excel</button>
      </div>
      <div className="toolbar">
        <div className="seg"><button className="active">Todos</button><button>Urgentes</button><button>Normales</button></div>
        <select className="select"><option>Proyecto: Todos</option></select>
        <select className="select"><option>Técnico: Todos</option></select>
        <select className="select"><option>Estado: Todos</option></select>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descripción</th>
              <th className="num">Cant.</th>
              <th>Solicitado por</th>
              <th>Origen</th>
              <th>Proyecto</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {solpes.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.tipo === 'urgente'
                    ? <span style={{ background:'#ef4444', color:'#fff', fontWeight:700,
                                     fontSize:'10px', padding:'2px 8px', borderRadius:'5px' }}>URGENTE</span>
                    : <span style={{ background:'rgba(59,130,246,0.15)', color:'#3b82f6',
                                     fontSize:'10px', padding:'2px 8px', borderRadius:'5px' }}>NORMAL</span>
                  }
                </td>
                <td>
                  <div style={{ fontWeight:600, fontSize:'13px', color:'#1F2937' }}>{s.descripcion}</div>
                  {s.item_codigo && (
                    <div style={{ fontSize:'10px', fontFamily:'monospace', color:'#f59e0b', marginTop:'2px' }}>
                      {s.item_codigo}
                    </div>
                  )}
                  {s.costo_estimado_total != null && (
                    <div style={{ fontSize:'10px', color:'#64748b', marginTop:'1px' }}>
                      Est. ${s.costo_estimado_total.toFixed(2)}
                    </div>
                  )}
                </td>
                <td className="num mono">{s.cantidad} {s.unidad}</td>
                <td>{s.solicitado_por}</td>
                <td>
                  {s.origen_id ? (
                    <div>
                      <span style={{ fontSize:'10px', color:'#60a5fa', fontFamily:'monospace',
                                     cursor:'pointer', display:'block' }}
                        onClick={() => {
                          if (s.origen_tipo === 'ot') onNav && onNav('ots');
                          if (s.origen_tipo === 'of') onNav && onNav('maestranza-of');
                        }}>
                        {s.origen_id}
                      </span>
                      <span style={{ fontSize:'9px', color:'#475569' }}>
                        {s.origen_tipo === 'ot' ? 'Orden de Trabajo'
                       : s.origen_tipo === 'of' ? 'Orden de Fabricación'
                       : s.origen_tipo === 'stock_minimo' ? 'Stock mínimo'
                       : 'Área interna'}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span style={{ color:'#475569', fontSize:'11px' }}>—</span>
                      <div style={{ fontSize:'9px', color:'#475569' }}>
                        {s.origen_tipo === 'stock_minimo' ? 'Stock mínimo' : 'Área interna'}
                      </div>
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ fontSize:'12px', color:'#94a3b8' }}>{s.proyecto}</div>
                  {s.centro_costo && (
                    <span style={{
                      display:'inline-block', marginTop:'3px',
                      background:'rgba(245,158,11,0.12)', color:'#f59e0b',
                      fontSize:'8.5px', fontFamily:'monospace',
                      padding:'1px 6px', borderRadius:'6px', fontWeight:600
                    }}>{s.centro_costo}</span>
                  )}
                </td>
                <td style={{ fontSize:'12px', color:'#64748b', fontFamily:'monospace' }}>{s.fecha}</td>
                <td>
                  {s.estado === 'atendido'
                    ? <span className="badge green"><span className="dot"/>Atendido</span>
                    : s.estado === 'en_proceso'
                    ? <span className="badge cyan"><span className="dot"/>En proceso</span>
                    : <span className="badge orange"><span className="dot"/>Pendiente</span>}
                </td>
                <td>
                  {s.estado === 'pendiente'
                    ? <button className="btn btn-ghost btn-sm" onClick={() => handleAtender(s)}>Atender</button>
                    : <button className="btn btn-ghost btn-sm">Ver</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Atender SOLPE */}
      {modalAtenderAbierto && solpeAtendiendo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)',
                      zIndex:200, display:'grid', placeItems:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:480 }}>
            <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0' }}>
              <h3>Atender SOLPE — {solpeAtendiendo.id}</h3>
              <div className="spacer"/>
              <button className="icon-btn" onClick={() => setModalAtenderAbierto(false)}
                style={{ color:'white' }}><Icon name="x" size={16}/></button>
            </div>
            <div className="card-body" style={{ padding:'20px' }}>
              <div style={{ marginBottom:'16px' }}>
                <div style={{ fontWeight:600, fontSize:'14px', color:'#1F2937' }}>
                  {solpeAtendiendo.descripcion}
                </div>
                {solpeAtendiendo.item_codigo && (
                  <div style={{ fontSize:'11px', fontFamily:'monospace', color:'#f59e0b', marginTop:'3px' }}>
                    {solpeAtendiendo.item_codigo} · {solpeAtendiendo.cantidad} {solpeAtendiendo.unidad}
                  </div>
                )}
              </div>

              {hayStock ? (
                <div style={{ background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
                              borderRadius:'8px', padding:'12px', marginBottom:'16px' }}>
                  <div style={{ color:'#22c55e', fontWeight:600, fontSize:'13px' }}>
                    ✓ Hay stock disponible: {itemAtendiendo.stock} unidades
                  </div>
                  <div style={{ color:'#64748b', fontSize:'11px', marginTop:'3px' }}>
                    Se puede atender desde el almacén sin generar OC.
                  </div>
                  <button onClick={() => despacharDesdeStock(solpeAtendiendo, itemAtendiendo)}
                    style={{ marginTop:'10px', padding:'8px 16px',
                             background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)',
                             borderRadius:'6px', color:'#22c55e', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                    → Despachar desde almacén
                  </button>
                </div>
              ) : (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
                              borderRadius:'8px', padding:'12px', marginBottom:'16px' }}>
                  <div style={{ color:'#ef4444', fontWeight:600, fontSize:'13px' }}>
                    ✗ Sin stock — se debe generar orden de compra
                  </div>
                  {itemAtendiendo && (
                    <div style={{ color:'#64748b', fontSize:'11px', marginTop:'3px' }}>
                      Stock actual: {itemAtendiendo.stock} · Solicitado: {solpeAtendiendo.cantidad}
                    </div>
                  )}
                  <button onClick={() => generarOC(solpeAtendiendo)}
                    style={{ marginTop:'10px', padding:'8px 16px',
                             background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)',
                             borderRadius:'6px', color:'#3b82f6', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                    → Generar OC a proveedor
                  </button>
                </div>
              )}

              <button onClick={() => setModalAtenderAbierto(false)}
                style={{ padding:'10px 20px', background:'none', border:'1px solid #E4E7EB',
                         borderRadius:'6px', color:'#64748b', cursor:'pointer', fontSize:'13px' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
          background:'#1A2B4A', color:'#f8fafc', padding:'10px 20px',
          borderRadius:'8px', fontSize:'13px', fontWeight:500, zIndex:500,
          boxShadow:'0 4px 20px rgba(0,0,0,0.3)'
        }}>{toast}</div>
      )}

      <FooterBrand/>
    </div>
  );
};

// ---------- Import Modal ----------
const ImportModal = ({ tipo, onClose }) => {
  const [fase, setFase] = useS2('upload');
  const mockRows = [
    { fila: 2, codigo: 'REP-9901-HYD', desc: 'Filtro presión SANDVIK', stock: 4, ok: true, error: null },
    { fila: 3, codigo: 'INS-0099-LUB', desc: 'Grasa EP-2 (kg)', stock: 10, ok: true, error: null },
    { fila: 4, codigo: 'REP-ERR-001',  desc: 'Conector X440', stock: 'abc', ok: false, error: 'Stock debe ser número entero' },
    { fila: 5, codigo: 'REP-3311-PER', desc: 'Culata percusión completa', stock: 0, ok: true, error: null },
    { fila: 6, codigo: '',             desc: 'Sin código', stock: 2, ok: false, error: 'Código de ítem requerido' },
  ];
  const ok = mockRows.filter(r => r.ok).length;
  const err = mockRows.filter(r => !r.ok).length;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:1000, display:'grid', placeItems:'center', padding:20 }}>
      <div className="card" style={{ width:'100%', maxWidth:680, animation:'fadeInUp 0.2s ease-out' }}>
        <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0' }}>
          <h3>Importar {tipo === 'catalogo' ? 'Catálogo de Repuestos' : 'Reportes Diarios'}</h3>
          <div className="spacer"/>
          <button className="icon-btn" onClick={onClose} style={{ color:'white' }}><Icon name="x" size={16}/></button>
        </div>
        <div className="card-body">
          {fase === 'upload' && (
            <>
              <div style={{ border:'2px dashed var(--card-border)', borderRadius:10, padding:36, textAlign:'center', marginBottom:16, background:'#F8FAFC' }}>
                <Icon name="upload" size={32}/>
                <div style={{ fontWeight:700, fontSize:15, marginTop:12 }}>Arrastrar archivo aquí</div>
                <div className="muted" style={{ fontSize:12, marginTop:4 }}>Formatos aceptados: .xlsx · .xls · .csv</div>
                <button className="btn btn-secondary" style={{ marginTop:16 }}>Seleccionar archivo</button>
              </div>
              <div style={{ background:'var(--cyan-soft)', border:'1px solid var(--cyan)', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:16 }}>
                <b>Plantilla requerida:</b> La primera fila debe contener encabezados exactos.
                <a href="#" style={{ color:'var(--cyan)', textDecoration:'underline', marginLeft:6 }}>Descargar plantilla</a>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => { setFase('validating'); setTimeout(() => setFase('result'), 1200); }}>
                  <Icon name="upload" size={14}/> Cargar y validar
                </button>
              </div>
            </>
          )}
          {fase === 'validating' && (
            <div style={{ textAlign:'center', padding:48 }}>
              <div style={{ width:40, height:40, border:'3px solid var(--cyan)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
              <div style={{ fontWeight:600 }}>Validando filas...</div>
              <div className="muted" style={{ fontSize:12, marginTop:4 }}>Verificando códigos, formatos y duplicados</div>
            </div>
          )}
          {fase === 'result' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <div className="kpi green-soft" style={{ padding:14 }}>
                  <div className="label" style={{ color:'#1B5E20' }}>Filas válidas</div>
                  <div className="value" style={{ color:'#1B5E20', fontSize:28 }}>{ok}</div>
                </div>
                <div className="kpi red-soft" style={{ padding:14 }}>
                  <div className="label" style={{ color:'#B71C1C' }}>Filas con error</div>
                  <div className="value" style={{ color:'#B71C1C', fontSize:28 }}>{err}</div>
                </div>
              </div>
              <div className="card" style={{ marginBottom:16 }}>
                <table className="tbl" style={{ fontSize:12 }}>
                  <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th className="num">Stock</th><th>Resultado</th></tr></thead>
                  <tbody>
                    {mockRows.map((r, i) => (
                      <tr key={i} style={{ background: r.ok ? 'transparent' : 'var(--red-soft)' }}>
                        <td className="muted">{r.fila}</td>
                        <td className="ot-code">{r.codigo || <span className="muted">—</span>}</td>
                        <td>{r.desc}</td>
                        <td className="num mono">{String(r.stock)}</td>
                        <td>
                          {r.ok
                            ? <span className="badge green"><span className="dot"/>OK</span>
                            : <span className="badge red" style={{ fontSize:11 }}>{r.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn btn-secondary" onClick={() => setFase('upload')}><Icon name="back" size={13}/> Reintentar</button>
                <button className="btn btn-primary" onClick={onClose}><Icon name="check" size={14}/> Importar {ok} filas válidas</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Inventario & Kardex ----------
const getBadgeValuacion = (estado) => {
  switch(estado) {
    case 'C1': return { label:'C1 Nuevo',   bg:'rgba(34,197,94,0.12)',  color:'#22c55e' }
    case 'C2': return { label:'C2 Recup.',  bg:'rgba(245,158,11,0.12)', color:'#f59e0b' }
    case 'C3': return { label:'C3 Dañado',  bg:'rgba(239,68,68,0.12)',  color:'#ef4444' }
    default:   return { label:'—',          bg:'rgba(100,116,139,0.12)',color:'#64748b' }
  }
}

const costoAterrizado = (r) =>
  (r.costo_fob||0)+(r.costo_flete||0)+(r.costo_seguro||0)+
  (r.costo_arancel||0)+(r.costo_igv_importacion||0)+(r.costo_flete_local||0)

export const CatalogoPage = ({ onNav }) => {
  const D = ZAHORY_SAC_DATA;
  const [showImport,        setShowImport]        = useS2(false);
  const [itemSeleccionado,  setItemSeleccionado]  = useS2(null);
  const [kardexAbierto,     setKardexAbierto]     = useS2(false);
  const [showNuevo,         setShowNuevo]         = useS2(false);
  const [nuevoItem,         setNuevoItem]         = useS2({
    estado_valuacion:'C1', es_importado:false,
    costo_fob:0, costo_flete:0, costo_seguro:0,
    costo_arancel:0, costo_igv_importacion:0, costo_flete_local:0,
  });

  const totalNuevoAterrizado =
    (nuevoItem.costo_fob||0)+(nuevoItem.costo_flete||0)+(nuevoItem.costo_seguro||0)+
    (nuevoItem.costo_arancel||0)+(nuevoItem.costo_igv_importacion||0)+(nuevoItem.costo_flete_local||0);

  const itemsBajoStock = D.repuestos.filter(r => r.stock <= r.min);

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Inventario & Kardex</h1><div className="sub">{D.repuestos.length} ítems · valuación C1/C2/C3 · historial de movimientos</div></div>
        <div className="spacer"/>
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}><Icon name="upload" size={13}/> Importar Excel</button>
        <button className="btn btn-cyan" onClick={() => setShowNuevo(true)}><Icon name="plus" size={13}/> Nuevo repuesto</button>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Buscar por código, N° parte o descripción..." style={{ flex:1, maxWidth:400 }}/>
        <select className="select"><option>Categoría: Todos</option><option>Hidráulico</option><option>Filtros</option><option>Lubricantes</option><option>Consumibles</option><option>Eléctrico</option></select>
        <select className="select"><option>Stock: Todos</option><option>Stock bajo</option><option>Sin stock</option><option>OK</option></select>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Código</th><th>N° Parte</th><th>Descripción</th><th>Categoría</th><th>Unidad</th>
              <th className="num">USD</th><th className="num">PEN</th>
              <th className="num">Stock</th><th className="num">Mín.</th>
              <th>Contexto</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {D.repuestos.map(r => {
              const sinStock = r.stock === 0;
              const bajo = !sinStock && r.stock < r.min;
              const stockColor = sinStock ? '#ef4444' : bajo ? '#f59e0b' : '#22c55e';
              const usdDisplay = r.es_importado ? costoAterrizado(r) : r.usd;
              const bv = getBadgeValuacion(r.estado_valuacion);
              return (
                <tr key={r.cod}
                  className="clickable"
                  onClick={() => { setItemSeleccionado(r); setKardexAbierto(true); }}
                  style={{ background: sinStock ? 'rgba(229,57,53,0.05)' : bajo ? 'rgba(193,93,0,0.04)' : 'transparent' }}>
                  <td className="ot-code">{r.cod}</td>
                  <td className="mono">{r.np}</td>
                  <td className="bold">{r.desc}</td>
                  <td><span className="chip">{r.cat}</span></td>
                  <td>{r.um}</td>
                  <td className="num">
                    <div style={{ fontWeight:600, fontSize:'13px' }}>
                      ${usdDisplay.toFixed(2)}
                    </div>
                    <span style={{
                      display:'inline-block', marginTop:'2px',
                      background: r.es_importado ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                      color: r.es_importado ? '#22c55e' : '#64748b',
                      fontSize:'7.5px', fontFamily:'monospace',
                      padding:'1px 5px', borderRadius:'4px', fontWeight:700
                    }}>
                      {r.es_importado ? 'ATERR.' : 'LOCAL'}
                    </span>
                  </td>
                  <td className="num mono">S/ {(usdDisplay * D.fx).toFixed(2)}</td>
                  <td className="num">
                    <div style={{ fontWeight:700, fontSize:'14px', color:stockColor }}>
                      {r.stock}
                      {sinStock && (
                        <span style={{ marginLeft:'6px', background:'#ef4444', color:'#fff',
                                       fontSize:'8.5px', padding:'1px 5px',
                                       borderRadius:'4px', fontWeight:700 }}>
                          SIN STOCK
                        </span>
                      )}
                      {!sinStock && bajo && (
                        <span style={{ marginLeft:'6px', background:'rgba(245,158,11,0.2)',
                                       color:'#f59e0b', fontSize:'8.5px',
                                       padding:'1px 5px', borderRadius:'4px', fontWeight:700 }}>
                          BAJO
                        </span>
                      )}
                    </div>
                    <span style={{
                      display:'inline-block', marginTop:'3px',
                      background:bv.bg, color:bv.color,
                      fontSize:'8px', fontFamily:'monospace',
                      padding:'1px 5px', borderRadius:'5px', fontWeight:600
                    }}>{bv.label}</span>
                    {r.solpe_activa_id && (
                      <div
                        onClick={e => { e.stopPropagation(); onNav && onNav('solicitudes'); }}
                        style={{ fontSize:'9px', color:'#60a5fa', cursor:'pointer',
                                 marginTop:'3px', fontFamily:'monospace', textDecoration:'underline' }}>
                        → {r.solpe_activa_id}
                      </div>
                    )}
                  </td>
                  <td className="num mono" style={{ color:'var(--text-muted)' }}>{r.min}</td>
                  <td>
                    <div style={{ fontSize:'12px', color:'#94a3b8' }}>{r.ctx}</div>
                    {r.equipos_compatibles?.length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'3px', marginTop:'3px' }}>
                        {r.equipos_compatibles.slice(0,3).map(eq => (
                          <span key={eq} style={{
                            background:'rgba(59,130,246,0.1)', color:'#60a5fa',
                            fontSize:'8px', fontFamily:'monospace',
                            padding:'1px 4px', borderRadius:'4px'
                          }}>{eq}</span>
                        ))}
                        {r.equipos_compatibles.length > 3 && (
                          <span style={{ fontSize:'8px', color:'#475569' }}>
                            +{r.equipos_compatibles.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{r.activo ? <span className="badge green"><span className="dot"/>Activo</span> : <span className="badge slate"><span className="dot"/>Inactivo</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {itemsBajoStock.length > 0 && (
          <div style={{ padding:'10px 16px', background:'var(--red-soft)', borderTop:'1px solid #FFCDD2', display:'flex', alignItems:'center', gap:10, fontSize:12 }}>
            <Icon name="alert" size={15}/>
            <b>{itemsBajoStock.length} ítems</b> con stock bajo o agotado — solicitudes de reposición generadas automáticamente.
            <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }}
              onClick={() => onNav && onNav('solicitudes')}>Ver solicitudes</button>
          </div>
        )}
      </div>

      {/* Panel lateral Kardex */}
      {kardexAbierto && itemSeleccionado && (
        <div style={{
          position:'fixed', right:0, top:0, bottom:0, width:'480px',
          background:'#0d1422', borderLeft:'1px solid #1e2d47',
          zIndex:100, overflowY:'auto', padding:'24px'
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px' }}>
            <div>
              <div style={{ fontFamily:'monospace', fontSize:'13px', fontWeight:700, color:'#f59e0b' }}>
                {itemSeleccionado.cod}
              </div>
              <div style={{ fontSize:'14px', fontWeight:600, color:'#f8fafc', marginTop:'2px' }}>
                {itemSeleccionado.desc}
              </div>
            </div>
            <button onClick={() => setKardexAbierto(false)}
              style={{ background:'none', border:'none', color:'#64748b', fontSize:'20px', cursor:'pointer' }}>
              ✕
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'20px' }}>
            {[
              { label:'Stock actual', value: itemSeleccionado.stock,
                color: itemSeleccionado.stock === 0 ? '#ef4444'
                     : itemSeleccionado.stock < itemSeleccionado.min ? '#f59e0b' : '#22c55e' },
              { label:'Mínimo', value: itemSeleccionado.min, color:'#f8fafc' },
              { label:'Estado', value: itemSeleccionado.estado_valuacion,
                color: itemSeleccionado.estado_valuacion === 'C1' ? '#22c55e' : '#f59e0b' },
            ].map(k => (
              <div key={k.label} style={{ background:'rgba(255,255,255,0.04)', borderRadius:'8px', padding:'10px' }}>
                <div style={{ fontSize:'10px', color:'#64748b' }}>{k.label}</div>
                <div style={{ fontSize:'20px', fontWeight:700, color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {itemSeleccionado.es_importado && (
            <div style={{
              background:'rgba(245,158,11,0.06)', borderLeft:'3px solid #f59e0b',
              borderRadius:'0 8px 8px 0', padding:'12px 16px', marginBottom:'20px'
            }}>
              <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace',
                            textTransform:'uppercase', marginBottom:'8px' }}>
                Desglose costo aterrizado
              </div>
              {[
                ['FOB',                itemSeleccionado.costo_fob],
                ['Flete internacional',itemSeleccionado.costo_flete],
                ['Seguro',             itemSeleccionado.costo_seguro],
                ['Arancel',            itemSeleccionado.costo_arancel],
                ['IGV importación',    itemSeleccionado.costo_igv_importacion],
                ['Flete local',        itemSeleccionado.costo_flete_local],
              ].map(([label, valor]) => valor ? (
                <div key={label} style={{ display:'flex', justifyContent:'space-between',
                                          fontSize:'11px', color:'#94a3b8', padding:'2px 0' }}>
                  <span>{label}</span>
                  <span style={{ fontFamily:'monospace' }}>${valor.toFixed(2)}</span>
                </div>
              ) : null)}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700,
                            fontSize:'13px', color:'#f8fafc', borderTop:'1px solid #1e2d47',
                            marginTop:'6px', paddingTop:'6px' }}>
                <span>Costo aterrizado</span>
                <span style={{ color:'#22c55e', fontFamily:'monospace' }}>
                  ${costoAterrizado(itemSeleccionado).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace',
                          textTransform:'uppercase', marginBottom:'8px' }}>
              Compatible con
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {itemSeleccionado.equipos_compatibles?.map(eq => (
                <span key={eq} style={{
                  background:'rgba(59,130,246,0.12)', color:'#3b82f6',
                  fontSize:'10px', fontFamily:'monospace',
                  padding:'2px 8px', borderRadius:'6px', fontWeight:500
                }}>{eq}</span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace',
                          textTransform:'uppercase', marginBottom:'10px' }}>
              Historial de movimientos
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #1e2d47' }}>
                  {['Fecha','Tipo','Cant.','Costo u.','Origen','Saldo'].map(h => (
                    <th key={h} style={{ fontSize:'9.5px', color:'#475569', textAlign:'left',
                                         padding:'4px 6px', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemSeleccionado.kardex?.map((mov, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid rgba(30,45,71,0.4)' }}>
                    <td style={{ fontSize:'11px', color:'#64748b', padding:'6px 6px', fontFamily:'monospace' }}>
                      {mov.fecha}
                    </td>
                    <td style={{ padding:'6px 6px' }}>
                      <span style={{ fontSize:'10px', fontWeight:600,
                                     color: mov.tipo === 'entrada' ? '#22c55e' : '#f97316' }}>
                        {mov.tipo === 'entrada' ? '↓ Entrada' : '↑ Salida'}
                      </span>
                    </td>
                    <td style={{ fontSize:'12px', fontWeight:600, color:'#f8fafc',
                                 padding:'6px 6px', textAlign:'right' }}>
                      {mov.tipo === 'entrada' ? '+' : '-'}{mov.cantidad}
                    </td>
                    <td style={{ fontSize:'11px', color:'#94a3b8', padding:'6px 6px',
                                 fontFamily:'monospace', textAlign:'right' }}>
                      ${mov.costo_unit.toFixed(2)}
                    </td>
                    <td style={{ fontSize:'10px', color:'#60a5fa', padding:'6px 6px', fontFamily:'monospace' }}>
                      {mov.origen}
                    </td>
                    <td style={{ fontSize:'12px', fontWeight:700, color:'#f8fafc',
                                 padding:'6px 6px', textAlign:'right' }}>
                      {mov.saldo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuevo repuesto */}
      {showNuevo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)',
                      zIndex:200, display:'grid', placeItems:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0' }}>
              <h3>Nuevo repuesto</h3>
              <div className="spacer"/>
              <button className="icon-btn" onClick={() => setShowNuevo(false)} style={{ color:'white' }}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div className="card-body" style={{ padding:'20px' }}>
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', fontWeight:600, display:'block', marginBottom:'4px' }}>
                  Estado de valuación inicial *
                </label>
                <select className="select" style={{ width:'100%' }}
                  value={nuevoItem.estado_valuacion}
                  onChange={e => setNuevoItem(p => ({...p, estado_valuacion:e.target.value}))}>
                  <option value="C1">C1 — Nuevo (precio de compra o importación)</option>
                  <option value="C2">C2 — Recuperado (costo de la OF de recuperación)</option>
                  <option value="C3">C3 — Dañado (valor residual)</option>
                </select>
              </div>
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
                  <input type="checkbox" checked={nuevoItem.es_importado}
                    onChange={e => setNuevoItem(p => ({...p, es_importado:e.target.checked}))}/>
                  Es repuesto importado
                </label>
              </div>
              {nuevoItem.es_importado && (
                <div style={{ padding:'14px', background:'rgba(245,158,11,0.06)',
                              border:'1px solid rgba(245,158,11,0.2)', borderRadius:'8px' }}>
                  <div style={{ fontSize:'11px', color:'#64748b', marginBottom:'10px', fontFamily:'monospace', textTransform:'uppercase' }}>
                    Desglose de costo aterrizado
                  </div>
                  {[
                    ['costo_fob',             'Valor FOB (USD) *'],
                    ['costo_flete',           'Flete internacional (USD)'],
                    ['costo_seguro',          'Seguro (USD)'],
                    ['costo_arancel',         'Arancel aduanero (USD)'],
                    ['costo_igv_importacion', 'IGV importación (USD)'],
                    ['costo_flete_local',     'Flete local (USD)'],
                  ].map(([campo, label]) => (
                    <div key={campo} style={{ marginBottom:'8px' }}>
                      <label style={{ fontSize:'11px', color:'#94a3b8', display:'block', marginBottom:'3px' }}>{label}</label>
                      <input type="number" step="0.01" className="input" style={{ width:'100%' }}
                        value={nuevoItem[campo] || ''}
                        onChange={e => setNuevoItem(p => ({...p, [campo]: parseFloat(e.target.value)||0}))}/>
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid rgba(245,158,11,0.2)', paddingTop:'8px',
                                display:'flex', justifyContent:'space-between',
                                fontWeight:700, color:'#22c55e', fontSize:'13px' }}>
                    <span>Costo aterrizado total:</span>
                    <span style={{ fontFamily:'monospace' }}>${totalNuevoAterrizado.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:'20px' }}>
                <button className="btn btn-secondary" onClick={() => setShowNuevo(false)}>Cancelar</button>
                <button className="btn btn-cyan" onClick={() => setShowNuevo(false)}>
                  <Icon name="check" size={14}/> Guardar repuesto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && <ImportModal tipo="catalogo" onClose={() => setShowImport(false)}/>}
      <FooterBrand/>
    </div>
  );
};


// ---------- Documentos comerciales ----------
export const DocsPage = () => {
  const [tab, setTab] = useS2("prop");
  const D = ZAHORY_SAC_DATA;
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Documentos comerciales</h1><div className="sub">Propuestas, actas y remisiones a clientes</div></div>
        <div className="spacer"/>
        <button className="btn btn-cyan"><Icon name="plus" size={13}/> Nuevo documento</button>
      </div>
      <div className="tabs">
        <div className={"tab " + (tab === "prop"      ? "active" : "")} onClick={() => setTab("prop")}>Propuestas</div>
        <div className={"tab " + (tab === "actas"     ? "active" : "")} onClick={() => setTab("actas")}>Actas de inicio</div>
        <div className={"tab " + (tab === "rem"       ? "active" : "")} onClick={() => setTab("rem")}>Remisiones de servicio</div>
        <div className={"tab " + (tab === "checklist" ? "active" : "")} onClick={() => setTab("checklist")}>
          Checklist documental
          <span className="badge solid-red" style={{ marginLeft:6, fontSize:10 }}>1</span>
        </div>
      </div>
      {tab === "prop" && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>N°</th><th>Cliente</th><th>Proyecto</th><th>Fecha</th><th className="num">Monto USD</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {D.propuestas.map(p => (
                <tr key={p.n}>
                  <td className="ot-code">{p.n}</td>
                  <td className="bold">{p.cliente}</td>
                  <td>{p.proy}</td>
                  <td>{p.fecha}</td>
                  <td className="num mono">${p.usd.toLocaleString()}</td>
                  <td>
                    {p.estado === "Aceptada" && <span className="badge green"><span className="dot"/>Aceptada</span>}
                    {p.estado === "Enviada" && <span className="badge orange"><span className="dot"/>Enviada</span>}
                    {p.estado === "Borrador" && <span className="badge slate"><span className="dot"/>Borrador</span>}
                  </td>
                  <td><button className="btn btn-ghost btn-sm">Ver</button><button className="btn btn-ghost btn-sm">PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "actas" && (() => {
        const actas = [
          { n: 'AI-2026-001', proyecto: 'Pepas de Oro', contrato: 'CT-2026-PEP-003', cliente: 'Minsur S.A.', fechaInicio: '01/02/2026', estado: 'Firmada', responsable: 'A. Parado' },
          { n: 'AI-2026-002', proyecto: 'Antapaccay',   contrato: 'OS-2026-APC-011', cliente: 'Antapaccay - Glencore', fechaInicio: '15/01/2026', estado: 'Firmada', responsable: 'A. Parado' },
          { n: 'AI-2026-003', proyecto: 'Buenaventura', contrato: 'CT-2025-BUE-001', cliente: 'Buenaventura S.A.A.', fechaInicio: '01/01/2025', estado: 'Firmada', responsable: 'A. Parado' },
        ];
        return (
          <div className="card">
            <table className="tbl">
              <thead><tr><th>N° Acta</th><th>Proyecto</th><th>Contrato / OS</th><th>Cliente</th><th>Fecha inicio</th><th>Responsable</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {actas.map(a => (
                  <tr key={a.n}>
                    <td className="ot-code">{a.n}</td>
                    <td className="bold">{a.proyecto}</td>
                    <td className="mono" style={{fontSize:12}}>{a.contrato}</td>
                    <td>{a.cliente}</td>
                    <td>{a.fechaInicio}</td>
                    <td>{a.responsable}</td>
                    <td><span className="badge green"><span className="dot"/>Firmada</span></td>
                    <td><button className="btn btn-ghost btn-sm">Ver</button><button className="btn btn-ghost btn-sm">PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
      {tab === "rem" && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>N°</th><th>OTs incluidas</th><th>Período</th><th>Cliente</th><th className="num">Total USD</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {D.remisiones.map(r => (
                <tr key={r.n}>
                  <td className="ot-code">{r.n}</td>
                  <td className="mono">{r.ots}</td>
                  <td>{r.periodo}</td>
                  <td className="bold">{r.cliente}</td>
                  <td className="num mono">${r.usd.toLocaleString()}</td>
                  <td><span className="badge green"><span className="dot"/>{r.estado}</span></td>
                  <td><button className="btn btn-ghost btn-sm">Ver</button><button className="btn btn-ghost btn-sm">PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "checklist" && (() => {
        const ITEMS = [
          'Reportes / partes completos (sin borrador)',
          'Firmas del técnico ejecutor registradas',
          'Firmas del supervisor o jefe de taller',
          'Materiales consumidos registrados o declarados como no consumo',
          'Horas reales cerradas',
          'Paradas formalmente registradas',
          'Evidencia fotográfica adjunta (≥ 1 foto)',
          'Estado final del equipo declarado',
          'OT dentro del período del contrato vigente',
        ];
        const otsChecklist = [
          { ot: 'OT-2026-050', eq: 'JB-24',    cliente: 'Buenaventura S.A.A.', checks: [true,true,true,true,true,true,false,true,true] },
          { ot: 'OT-2026-048', eq: 'JB-26',    cliente: 'Antapaccay',          checks: [true,true,true,true,true,false,true,true,true] },
          { ot: 'OT-2026-052', eq: 'JB-DD311', cliente: 'Minsur S.A.',          checks: [true,true,false,true,true,true,true,true,true] },
        ];
        const completa = (checks) => checks.every(Boolean);
        return (
          <div>
            <div style={{ padding:'10px 16px', background:'var(--orange-soft)', border:'1px solid #FFD9A8', borderRadius:8, fontSize:12, display:'flex', gap:8, alignItems:'center', marginBottom:16 }}>
              <Icon name="alert" size={14}/>
              <span>Administración valida que cada OT cumpla estos requisitos antes de incluirla en una remisión. Una OT con ítems pendientes <b>no puede pasar a Costeada</b>.</span>
            </div>
            {otsChecklist.map(ot => (
              <div key={ot.ot} className="card" style={{ marginBottom:16 }}>
                <div className="card-header">
                  <div><span className="ot-code">{ot.ot}</span><span className="muted" style={{marginLeft:10,fontSize:12}}>{ot.eq} · {ot.cliente}</span></div>
                  <div className="spacer"/>
                  {completa(ot.checks)
                    ? <span className="badge green"><span className="dot"/>Lista para remisión</span>
                    : <span className="badge solid-red">{ot.checks.filter(c=>!c).length} pendiente{ot.checks.filter(c=>!c).length>1?'s':''}</span>}
                  <button className={`btn btn-sm ${completa(ot.checks)?'btn-primary':'btn-secondary'}`} style={{marginLeft:10}}>
                    {completa(ot.checks) ? 'Aprobar' : 'Completar pendientes'}
                  </button>
                </div>
                <div style={{ padding:'8px 16px' }}>
                  {ITEMS.map((item, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--card-border)', fontSize:13 }}>
                      <span style={{ fontSize:15 }}>{ot.checks[i] ? '✅' : '❌'}</span>
                      <span style={{ flex:1, color: ot.checks[i] ? 'var(--text)' : '#D32F2F', fontWeight: ot.checks[i] ? 400 : 600 }}>{item}</span>
                      {!ot.checks[i] && <button className="btn btn-ghost btn-sm" style={{fontSize:11}}>Completar</button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
      <FooterBrand/>
    </div>
  );
};

// ---------- Usuarios y roles ----------
export const UsuariosPage = () => {
  const [tab, setTab] = useS2("users");
  const [openModule, setOpenModule] = useS2("reportes");
  const [perms, setPerms] = useS2({
    "reportes.ver": true, "reportes.aprobar": true, "reportes.crear": false, "reportes.costos": false,
    "dashboard.graficos": false, "dashboard.tabla": true, "dashboard.pdf": false,
  });
  const togglePerm = (k) => setPerms({ ...perms, [k]: !perms[k] });

  const users = [
    { nombre: "A. Castro",     email: "acastro@empresa-demo.pe",       rol: "Gerente",       roloColor: "cyan", ctx: "Todos",          estado: "Activo" },
    { nombre: "Pajuelo E.",    email: "e.pajuelo@empresa-demo.pe",     rol: "Técnico Mina",  roloColor: "slate", ctx: "Buenaventura",  estado: "Activo" },
    { nombre: "Miranda B.",    email: "s.miranda@empresa-demo.pe",     rol: "Técnico Mina",  roloColor: "slate", ctx: "Pepas de Oro",  estado: "Activo" },
    { nombre: "García Q.",     email: "r.garcia@empresa-demo.pe",      rol: "Supervisor",    roloColor: "purple", ctx: "Buenaventura", estado: "Activo" },
    { nombre: "Torres M.",     email: "t.torres@empresa-demo.pe",      rol: "Técnico Mina",  roloColor: "slate", ctx: "Antapaccay",    estado: "Activo" },
    { nombre: "López V.",      email: "l.lopez@empresa-demo.pe",       rol: "Técnico Taller",roloColor: "slate", ctx: "Carapongo",    estado: "Inactivo" },
  ];

  const ToggleSwitch = ({ on, onClick }) => (
    <button onClick={onClick} style={{ width: 40, height: 22, borderRadius: 12, background: on ? "#00BCD4" : "#CFD8DC", position: "relative", transition: "background 0.15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "white", borderRadius: "50%", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}/>
    </button>
  );

  const PermRow = ({ k, label }) => (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--card-border)" }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 11, color: perms[k] ? "#00BCD4" : "var(--text-muted)", fontWeight: 700, marginRight: 10 }}>{perms[k] ? "ON" : "OFF"}</span>
      <ToggleSwitch on={perms[k]} onClick={() => togglePerm(k)}/>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Usuarios y roles</h1><div className="sub">Gestión de cuentas, permisos y personal operativo</div></div>
        <div className="spacer"/>
        <button className="btn btn-cyan"><Icon name="plus" size={13}/> Nuevo usuario</button>
      </div>
      <div className="tabs">
        <div className={"tab " + (tab === "users" ? "active" : "")} onClick={() => setTab("users")}>Usuarios del sistema</div>
        <div className={"tab " + (tab === "personal" ? "active" : "")} onClick={() => setTab("personal")}>Personal operativo</div>
        <div className={"tab " + (tab === "roles" ? "active" : "")} onClick={() => setTab("roles")}>Roles y permisos</div>
      </div>

      {tab === "users" && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Contexto</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.email}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#CFD8DC", color: "#37474F", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>
                        {u.nombre.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="bold">{u.nombre}</span>
                    </div>
                  </td>
                  <td className="mono">{u.email}</td>
                  <td><span className={"badge " + u.roloColor}><span className="dot"/>{u.rol}</span></td>
                  <td>{u.ctx}</td>
                  <td>{u.estado === "Activo" ? <span className="badge green"><span className="dot"/>Activo</span> : <span className="badge slate"><span className="dot"/>Inactivo</span>}</td>
                  <td><button className="btn btn-ghost btn-sm"><Icon name="edit" size={12}/> Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "personal" && (() => {
        const hoy = new Date('2026-04-23');
        const alertaDias = 60;
        const VigenciaCell = ({ fecha }) => {
          const d = new Date(fecha);
          const diff = Math.round((d - hoy) / 86400000);
          const vencido = diff < 0;
          const proximo = diff >= 0 && diff <= alertaDias;
          const color = vencido ? '#E53935' : proximo ? '#C15D00' : '#2E7D32';
          const bg = vencido ? 'var(--red-soft)' : proximo ? 'var(--orange-soft)' : 'transparent';
          const label = vencido ? 'VENCIDO' : proximo ? `${diff}d` : '✓';
          return (
            <td style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 11, fontFamily: 'ui-monospace,monospace', color: 'var(--text-muted)' }}>{fecha.slice(5).replace('-','/')}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color, background: bg, padding: '1px 5px', borderRadius: 4 }}>{label}</span>
              </div>
            </td>
          );
        };
        return (
          <div className="card">
            <div style={{ padding: '10px 16px', background: 'var(--orange-soft)', borderBottom: '1px solid #FFD9A8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alert" size={14}/>
              <span>Los técnicos con documentos <b>vencidos o próximos a vencer (&lt;60 días)</b> se marcan automáticamente. Un técnico <b>bloqueado</b> no puede ser asignado a nuevas OTs.</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Código</th><th>Nombre</th><th>Cargo / Esp.</th><th>Proyecto</th>
                    <th className="num">Costo/h USD</th><th className="num">Extra/h</th>
                    <th style={{ textAlign: 'center' }}>SCTR</th>
                    <th style={{ textAlign: 'center' }}>Licencia</th>
                    <th style={{ textAlign: 'center' }}>EMO</th>
                    <th style={{ textAlign: 'center' }}>Inducción</th>
                    <th>Habilitado</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {D.personalOperativo.map(p => (
                    <tr key={p.cod}>
                      <td className="ot-code">{p.cod}</td>
                      <td className="bold">{p.nombre}</td>
                      <td><div>{p.cargo}</div><span className="chip" style={{ marginTop: 2 }}>{p.esp}</span></td>
                      <td>{p.proy} <span className="muted">· {p.ctx}</span></td>
                      <td className="num mono" style={{ fontWeight: 700 }}>${p.costoHora.toFixed(2)}</td>
                      <td className="num mono" style={{ color: 'var(--text-muted)' }}>${p.costoExtra.toFixed(2)}</td>
                      <VigenciaCell fecha={p.sctr}/>
                      <VigenciaCell fecha={p.licencia}/>
                      <VigenciaCell fecha={p.emo}/>
                      <VigenciaCell fecha={p.induccion}/>
                      <td>
                        {p.habilitado
                          ? <span className="badge green"><span className="dot"/>Habilitado</span>
                          : <span className="badge solid-red"><Icon name="lock" size={11}/> Bloqueado</span>}
                      </td>
                      <td>{p.estado === 'Activo' ? <span className="badge green"><span className="dot"/>Activo</span> : <span className="badge slate"><span className="dot"/>Inactivo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {tab === "roles" && (
        <div className="grid-2" style={{ gridTemplateColumns: "240px 1fr", alignItems: "start" }}>
          <div className="card">
            <div className="card-header"><h3>Roles</h3></div>
            <div style={{ padding: "4px 0" }}>
              {["Gerente de Operaciones", "Supervisor de Mina", "Técnico de Mina", "Técnico de Taller", "Cliente"].map(r => (
                <button key={r} className={"nav-item " + (r === "Supervisor de Mina" ? "active" : "")} style={{ color: r === "Supervisor de Mina" ? "var(--navy)" : "var(--text)", background: r === "Supervisor de Mina" ? "var(--cyan-soft)" : "transparent", margin: "1px 6px", width: "calc(100% - 12px)" }}>
                  <Icon name="users" size={13}/>
                  <span className="label">{r}</span>
                </button>
              ))}
              <button className="btn btn-secondary btn-sm" style={{ margin: 8, width: "calc(100% - 16px)", justifyContent: "center" }}><Icon name="plus" size={12}/> Nuevo rol</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Permisos · Supervisor de Mina</h3>
              <div className="spacer"/>
              <button className="btn btn-primary btn-sm">Guardar cambios</button>
            </div>
            <div>
              <div className="accordion open">
                <button className="accordion-head" onClick={() => setOpenModule(openModule === "reportes" ? null : "reportes")}>
                  <Icon name="mine" size={14}/> Reportes de mina
                  <span className="chip" style={{ marginLeft: 8 }}>2/4 permisos</span>
                  <Icon name="chev" size={14} />
                </button>
                {openModule === "reportes" && (
                  <div>
                    <PermRow k="reportes.ver" label="Ver listado"/>
                    <PermRow k="reportes.aprobar" label="Aprobar / rechazar"/>
                    <PermRow k="reportes.crear" label="Crear nuevo reporte"/>
                    <PermRow k="reportes.costos" label="Ver costos en el reporte"/>
                  </div>
                )}
              </div>
              <div className="accordion open">
                <button className="accordion-head" onClick={() => setOpenModule(openModule === "dash" ? null : "dash")}>
                  <Icon name="chart" size={14}/> Dashboard · Costos
                  <span className="chip" style={{ marginLeft: 8 }}>1/3 permisos</span>
                </button>
                {openModule === "dash" && (
                  <div>
                    <PermRow k="dashboard.graficos" label="Ver gráficos de costos"/>
                    <PermRow k="dashboard.tabla" label="Ver tabla de OTs"/>
                    <PermRow k="dashboard.pdf" label="Exportar reporte PDF"/>
                  </div>
                )}
              </div>
              <div className="accordion">
                <button className="accordion-head" onClick={() => setOpenModule(openModule === "ots" ? null : "ots")}>
                  <Icon name="orders" size={14}/> OTs
                  <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>Colapsado</span>
                </button>
              </div>
              <div className="accordion" style={{ opacity: 0.5 }}>
                <div className="accordion-head">
                  <Icon name="box" size={14}/> Almacén
                  <span className="badge slate" style={{ marginLeft: 8 }}><Icon name="lock" size={10}/> Próximamente</span>
                </div>
              </div>
              <div className="accordion" style={{ opacity: 0.5 }}>
                <div className="accordion-head">
                  <Icon name="report" size={14}/> Facturación
                  <span className="badge slate" style={{ marginLeft: 8 }}><Icon name="lock" size={10}/> Próximamente</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <FooterBrand/>
    </div>
  );
};

// ---------- Reporte consolidado mensual ----------
export const ConsolidadoPage = () => {
  const D = ZAHORY_SAC_DATA;
  const rows = D.consolidadoJB_DD311;
  const tot = rows.reduce((a, r) => ({
    ht: a.ht + r.ht, prg: a.prg + r.prg, prv: a.prv + r.prv, ctvo: a.ctvo + r.ctvo, hsb: a.hsb + r.hsb, total: a.total + r.total
  }), { ht: 0, prg: 0, prv: 0, ctvo: 0, hsb: 0, total: 0 });
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Reporte consolidado</h1><div className="sub">Informe mensual para el cliente</div></div>
        <div className="spacer"/>
        <select className="select"><option>Equipo: JB-DD311</option></select>
        <select className="select"><option>Período: Marzo 2026</option></select>
        <button className="btn btn-primary"><Icon name="pdf" size={13}/> Generar PDF</button>
      </div>

      <div style={{ background: "var(--navy)", color: "white", padding: "16px 20px", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--slate-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>Equipo</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>JB-DD311 · SANDVIK DD311-40</div>
        </div>
        <div style={{ height: 40, width: 1, background: "rgba(255,255,255,0.15)" }}/>
        <div>
          <div style={{ fontSize: 11, color: "var(--slate-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>Proyecto</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Pepas de Oro · Serv. Civiles y Mineros Perú S.A.</div>
        </div>
        <div className="spacer"/>
        <span className="badge orange" style={{ padding: "6px 12px", fontSize: 12 }}><span className="dot"/>DMR 97.44% bajo objetivo</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Guardias del mes</h3><span className="hint">10 turnos registrados</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ fontSize: 11.5 }}>
            <thead>
              <tr>
                <th>Turno</th><th>Fecha</th>
                <th className="num">Motor Ini</th><th className="num">Fin</th><th className="num">HT</th>
                <th className="num">Perc. Ini</th><th className="num">Fin</th><th className="num">HT</th>
                <th className="num">Elec. Ini</th><th className="num">Fin</th><th className="num">HT</th>
                <th className="num">Hr.Trab</th><th className="num">PRG</th><th className="num">PRV</th><th className="num">Rep.ACC</th><th className="num">Rep.CTVO</th><th className="num">HSB</th><th className="num">Total</th>
                <th>D.M.%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><span className="chip" style={{ background: r.turno === "DÍA" ? "#FFF3E0" : "#E3F2FD", color: r.turno === "DÍA" ? "#C15D00" : "#0D47A1" }}>{r.turno}</span></td>
                  <td>{r.fecha}</td>
                  <td className="num mono">{r.mIni.toFixed(2)}</td><td className="num mono">{r.mFin.toFixed(2)}</td><td className="num mono bold">{(r.mFin - r.mIni).toFixed(2)}</td>
                  <td className="num mono">{r.pIni.toFixed(2)}</td><td className="num mono">{r.pFin.toFixed(2)}</td><td className="num mono bold">{(r.pFin - r.pIni).toFixed(2)}</td>
                  <td className="num mono">{r.eIni.toFixed(2)}</td><td className="num mono">{r.eFin.toFixed(2)}</td><td className="num mono bold">{(r.eFin - r.eIni).toFixed(2)}</td>
                  <td className="num mono bold">{r.ht.toFixed(2)}</td>
                  <td className="num mono">{r.prg.toFixed(2)}</td>
                  <td className="num mono">{r.prv.toFixed(2)}</td>
                  <td className="num mono">{r.acc.toFixed(2)}</td>
                  <td className="num mono">{r.ctvo.toFixed(2)}</td>
                  <td className="num mono">{r.hsb.toFixed(2)}</td>
                  <td className="num mono">{r.total.toFixed(2)}</td>
                  <td className="mono" style={{ color: r.dm < 97.92 ? "#FF9800" : "#4CAF50", fontWeight: 700 }}>{r.dm.toFixed(2)}%</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={11}>TOTALES</td>
                <td className="num mono">{tot.ht.toFixed(2)}</td>
                <td className="num mono">{tot.prg.toFixed(2)}</td>
                <td className="num mono">{tot.prv.toFixed(2)}</td>
                <td className="num mono">0.00</td>
                <td className="num mono">{tot.ctvo.toFixed(2)}</td>
                <td className="num mono">{tot.hsb.toFixed(2)}</td>
                <td className="num mono">{tot.total.toFixed(2)}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Resumen del mes</h3></div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">Horas disponibles</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22 }}>492.00 <span style={{ fontSize: 11, color: "var(--text-muted)" }}>hrs</span></div></div>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">Horas trabajadas</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22 }}>133.20 <span style={{ fontSize: 11, color: "var(--text-muted)" }}>hrs</span></div></div>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">Horas mantenimiento</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22 }}>10.25 <span style={{ fontSize: 11, color: "var(--text-muted)" }}>hrs</span></div></div>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">Horas reparación</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22, color: "#FF9800" }}>2.33 <span style={{ fontSize: 11, color: "var(--text-muted)" }}>hrs</span></div></div>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">Horas stand-by</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22 }}>346.22 <span style={{ fontSize: 11, color: "var(--text-muted)" }}>hrs</span></div></div>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">DMP objetivo</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22 }}>97.92%</div></div>
            <div className="kpi orange-soft" style={{ padding: 14, background: "var(--orange-soft)", borderColor: "#FFD9A8" }}><div className="label" style={{ color: "#C15D00" }}>DMR real</div><div className="value" style={{ fontSize: 22, color: "#C15D00" }}>97.44% <Icon name="alert" size={18}/></div></div>
            <div className="kpi" style={{ padding: 14 }}><div className="kpi-header"><div className="label">Factor DMR/DMP</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ fontSize: 22 }}>0.9995</div></div>
          </div>
        </div>
      </div>
      <FooterBrand/>
    </div>
  );
};

// ---------- Placeholder for tecnico dashboard and misc ----------
export const TecnicoDashboard = ({ onNav }) => (
  <div className="page" style={{ maxWidth: 560, margin: "0 auto" }}>
    <div className="page-header">
      <div><h1>Hola, Sandro</h1><div className="sub">Lunes 20 de abril · Turno Día</div></div>
    </div>
    <button className="card" style={{ width: "100%", padding: 20, display: "flex", gap: 14, alignItems: "center", background: "var(--cyan)", color: "white", border: "none", cursor: "pointer", marginBottom: 14 }} onClick={() => onNav("nuevo-reporte")}>
      <Icon name="plus" size={28} stroke={2.5}/>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Nuevo reporte de mina</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Registra el parte diario del equipo</div>
      </div>
    </button>
    <div className="grid-2" style={{ marginBottom: 14 }}>
      <div className="kpi"><div className="kpi-header"><div className="label">Mis reportes</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value">23</div><div className="sub">Este mes</div></div>
      <div className="kpi"><div className="kpi-header"><div className="label">Pendientes</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value" style={{ color: "#FF9800" }}>2</div><div className="sub">Por aprobar</div></div>
    </div>
    <div className="card">
      <div className="card-header"><h3>Mis últimos reportes</h3></div>
      <div>
        {[
          { fecha: "16/04", turno: "DÍA", eq: "JB-DD311", estado: "Aprobado" },
          { fecha: "15/04", turno: "NOCHE", eq: "JB-DD311", estado: "Aprobado" },
          { fecha: "14/04", turno: "DÍA", eq: "JB-DD311", estado: "Rechazado" },
          { fecha: "13/04", turno: "NOCHE", eq: "JB-DD311", estado: "Aprobado" },
        ].map((r, i) => (
          <div key={i} style={{ padding: "12px 16px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: r.turno === "DÍA" ? "#FFF3E0" : "#E3F2FD", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: r.turno === "DÍA" ? "#C15D00" : "#0D47A1" }}>{r.turno}</div>
            <div style={{ flex: 1 }}>
              <div className="bold">{r.eq}</div>
              <div className="muted" style={{ fontSize: 11 }}>{r.fecha}</div>
            </div>
            {r.estado === "Aprobado" ? <span className="badge green"><span className="dot"/>Aprobado</span> : <span className="badge red"><span className="dot"/>Rechazado</span>}
          </div>
        ))}
      </div>
    </div>
    <FooterBrand/>
  </div>
);

// ── Cierre & Conformidad ───────────────────────────────────────────────────

const VistaCierreTecnico = ({ ot, onConfirmar, onCancelar }) => {
  const [horometroFinal, setHorometroFinal] = useS2('');
  const [observaciones, setObservaciones] = useS2('');
  const [firmadoPor, setFirmadoPor] = useS2('');
  const [cargo, setCargo] = useS2('Supervisor de taller');
  const [errores, setErrores] = useS2([]);

  const validar = () => {
    const e = [];
    if (!horometroFinal) e.push('El horómetro final es obligatorio.');
    if (parseInt(horometroFinal) <= ot.horometro_apertura)
      e.push('El horómetro final debe ser mayor al horómetro de apertura.');
    if (!firmadoPor) e.push('El nombre del supervisor es obligatorio.');
    setErrores(e);
    return e.length === 0;
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#000' }}>1</div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b' }}>Cierre Técnico</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: '#1e2d47' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1e2d47', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#475569' }}>2</div>
          <span style={{ fontSize: '13px', color: '#475569' }}>Conformidad Cliente</span>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2d47', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: '12px' }}>Resumen de trabajo ejecutado</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>OT</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#60a5fa', fontSize: '14px' }}>{ot.id}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Equipo</div>
            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{ot.equipo_id}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Técnico</div>
            <div style={{ color: '#94a3b8' }}>{ot.tecnico_asignado}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Tipo de trabajo</div>
            <div style={{ color: '#f97316', fontWeight: 600 }}>{ot.tipo_trabajo}</div>
          </div>
        </div>

        <div style={{ marginTop: '16px', borderTop: '1px solid #1e2d47', paddingTop: '14px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Partes diarios aprobados ({ot.partes.length})</div>
          {ot.partes.map(parte => (
            <div key={parte.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', padding: '4px 0', borderBottom: '1px solid #1e2d4733' }}>
              <span style={{ fontFamily: 'monospace' }}>{parte.id}</span>
              <span>{parte.fecha}</span>
              <span>{parte.horas}h MO</span>
              <span style={{ color: '#22c55e' }}>✓ Aprobado</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(6,182,212,0.06)', borderLeft: '3px solid #06b6d4', borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: '10px' }}>Costos acumulados de la OT</div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {[['Mano de obra', ot.costo_mo_total], ['Repuestos', ot.costo_repuestos_total], ['Terceros', ot.costo_terceros_total], ['TOTAL REAL', ot.costo_real_total]].map(([label, valor]) => (
              <div key={label}>
                <div style={{ fontSize: '10px', color: '#475569' }}>{label}</div>
                <div style={{ fontSize: label === 'TOTAL REAL' ? '18px' : '15px', fontWeight: 700, color: label === 'TOTAL REAL' ? '#06b6d4' : '#f8fafc' }}>${valor.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2d47', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '16px' }}>Firma de cierre técnico</div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
            Horómetro final del equipo *
            <span style={{ fontSize: '10px', color: '#475569', marginLeft: '8px' }}>(Horómetro de apertura: {ot.horometro_apertura.toLocaleString()}h)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="number" className="input" value={horometroFinal} onChange={e => setHorometroFinal(e.target.value)} placeholder={`Mayor a ${ot.horometro_apertura}`} style={{ width: '200px' }}/>
            <span style={{ fontSize: '12px', color: '#64748b' }}>horas</span>
            {horometroFinal && parseInt(horometroFinal) > ot.horometro_apertura && (
              <span style={{ fontSize: '11px', color: '#22c55e' }}>+{parseInt(horometroFinal) - ot.horometro_apertura}h en esta OT</span>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Observaciones del supervisor</label>
          <textarea className="input" value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Descripción del trabajo realizado, hallazgos adicionales..." rows={3} style={{ width: '100%', height: 'auto', padding: '8px 10px', resize: 'vertical' }}/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Nombre del supervisor *</label>
            <input type="text" className="input" value={firmadoPor} onChange={e => setFirmadoPor(e.target.value)} placeholder="Nombre completo" style={{ width: '100%' }}/>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Cargo</label>
            <input type="text" className="input" value={cargo} onChange={e => setCargo(e.target.value)} style={{ width: '100%' }}/>
          </div>
        </div>
      </div>

      {errores.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          {errores.map((e, i) => <div key={i} style={{ fontSize: '12px', color: '#ef4444' }}>• {e}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ padding: '10px 20px', background: 'none', border: '1px solid #1e2d47', borderRadius: '8px', color: '#64748b', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
        <button
          onClick={() => {
            if (!validar()) return;
            onConfirmar({ firmado_por: firmadoPor, cargo, fecha: new Date().toISOString().split('T')[0], observaciones, horometro_final: parseInt(horometroFinal) });
          }}
          style={{ padding: '10px 24px', background: '#f59e0b', border: 'none', borderRadius: '8px', color: '#000', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          ✓ Confirmar cierre técnico → Paso 2
        </button>
      </div>
    </div>
  );
};

const VistaConformidadCliente = ({ ot, cierreTecnico, onConfirmar, onCancelar }) => {
  const [conformeCliente, setConformeCliente] = useS2(true);
  const [representante, setRepresentante] = useS2('');
  const [cargoCliente, setCargoCliente] = useS2('');
  const [observacionesCliente, setObservacionesCliente] = useS2('');
  const [motivoRechazo, setMotivoRechazo] = useS2('');
  const [errores, setErrores] = useS2([]);

  const validar = () => {
    const e = [];
    if (!representante) e.push('El nombre del representante del cliente es obligatorio.');
    if (!conformeCliente && !motivoRechazo) e.push('El motivo de rechazo es obligatorio si el cliente no da conformidad.');
    setErrores(e);
    return e.length === 0;
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#000' }}>✓</div>
          <span style={{ fontSize: '13px', color: '#22c55e' }}>Cierre Técnico — completado</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: '#3b82f6' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff' }}>2</div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}>Conformidad Cliente</span>
        </div>
      </div>

      <div style={{ background: 'rgba(34,197,94,0.06)', borderLeft: '3px solid #22c55e', borderRadius: '0 8px 8px 0', padding: '14px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>✓ Cierre técnico firmado por {cierreTecnico.firmado_por} · {cierreTecnico.fecha}</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Horómetro final: {cierreTecnico.horometro_final.toLocaleString()}h · Costo real: ${ot.costo_real_total.toLocaleString()}</div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2d47', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '16px' }}>Conformidad del cliente — {ot.cliente}</div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>¿El cliente da conformidad al trabajo realizado?</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            {[{ val: true, label: '✓ Sí, conforme', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }, { val: false, label: '✗ No conforme', bg: 'rgba(239,68,68,0.12)', color: '#ef4444' }].map(opt => (
              <button key={String(opt.val)} onClick={() => setConformeCliente(opt.val)}
                style={{ flex: 1, padding: '12px', background: conformeCliente === opt.val ? opt.bg : 'rgba(255,255,255,0.04)', border: conformeCliente === opt.val ? `1px solid ${opt.color}55` : '1px solid #1e2d47', borderRadius: '8px', color: conformeCliente === opt.val ? opt.color : '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!conformeCliente && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Motivo de no conformidad *</label>
            <textarea className="input" value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Describir por qué el cliente no da conformidad..." rows={3} style={{ width: '100%', height: 'auto', padding: '8px 10px', resize: 'vertical', borderColor: 'rgba(239,68,68,0.3)' }}/>
            <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px' }}>⚠ Se generará un backlog automáticamente con el motivo indicado.</div>
          </div>
        )}

        {conformeCliente && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Observaciones del cliente (opcional)</label>
            <textarea className="input" value={observacionesCliente} onChange={e => setObservacionesCliente(e.target.value)} placeholder="Comentarios o condiciones adicionales..." rows={2} style={{ width: '100%', height: 'auto', padding: '8px 10px', resize: 'vertical' }}/>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Representante del cliente *</label>
            <input type="text" className="input" value={representante} onChange={e => setRepresentante(e.target.value)} placeholder="Nombre completo" style={{ width: '100%' }}/>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Cargo</label>
            <input type="text" className="input" value={cargoCliente} onChange={e => setCargoCliente(e.target.value)} placeholder="ej: Supervisor de mantenimiento" style={{ width: '100%' }}/>
          </div>
        </div>
      </div>

      {conformeCliente && (
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', marginBottom: '8px' }}>Al confirmar se ejecutarán automáticamente:</div>
          {[
            `OT ${ot.id} → estado: Cerrada y liquidada`,
            `Costo $${ot.costo_real_total.toLocaleString()} imputado a ${ot.contrato_id} (${ot.centro_costo})`,
            `Horómetro de ${ot.equipo_id} actualizado`,
            `DMR del período recalculado`,
          ].map((accion, i) => <div key={i} style={{ fontSize: '11px', color: '#64748b', padding: '2px 0' }}>✓ {accion}</div>)}
        </div>
      )}

      {errores.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          {errores.map((e, i) => <div key={i} style={{ fontSize: '12px', color: '#ef4444' }}>• {e}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ padding: '10px 20px', background: 'none', border: '1px solid #1e2d47', borderRadius: '8px', color: '#64748b', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
        <button
          onClick={() => {
            if (!validar()) return;
            onConfirmar({ conforme: conformeCliente, representante, cargo_cliente: cargoCliente, observaciones: observacionesCliente, motivo_rechazo: motivoRechazo, fecha: new Date().toISOString().split('T')[0] });
          }}
          style={{ padding: '10px 24px', background: conformeCliente ? '#22c55e' : '#ef4444', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          {conformeCliente ? '✓ Confirmar conformidad y liquidar' : '✗ Registrar no conformidad'}
        </button>
      </div>
    </div>
  );
};

const BADGE_CIERRE = {
  pendiente_cierre_tecnico: { label: 'Pendiente cierre técnico', bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  pendiente_conformidad:    { label: 'Pendiente conformidad',    bg: 'rgba(59,130,246,0.12)',   color: '#3b82f6' },
  cerrada_liquidada:        { label: 'Cerrada y liquidada',      bg: 'rgba(34,197,94,0.12)',    color: '#22c55e' },
  rechazada:                { label: 'Rechazada',                bg: 'rgba(239,68,68,0.12)',    color: '#ef4444' },
};

export const CierreConformidad = () => {
  const [otSeleccionada, setOtSeleccionada] = useS2(null);
  const [vistaActiva, setVistaActiva] = useS2('lista');
  const [filtroEstado, setFiltroEstado] = useS2('todos');
  const [otsParaCierre, setOtsParaCierre] = useS2(ZAHORY_SAC_DATA.ots_para_cierre || []);
  const [toastMsg, setToastMsg] = useS2(null);

  const mostrarToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const actualizarHorometroEquipo = (equipo_id, horometro_final) => {
    const eq = (ZAHORY_SAC_DATA.equipos || []).find(e => e.id === equipo_id);
    if (eq) eq.horometro_actual = horometro_final;
  };

  const actualizarEstadoOT = (ot_id) => {
    const otD = (ZAHORY_SAC_DATA.otsDashboard || []).find(o => o.codigo === ot_id);
    if (otD) { otD.estado = 'cerrada'; otD.estadoLabel = 'Cerrada'; }
    const otC = (ZAHORY_SAC_DATA.otsCostos || []).find(o => o.codigo === ot_id);
    if (otC) otC.liquidada = true;
  };

  const agregarBacklog = (nuevoBacklog) => {
    if (ZAHORY_SAC_DATA.backlog) ZAHORY_SAC_DATA.backlog.unshift(nuevoBacklog);
  };

  const ejecutarLiquidacion = (ot, cierreTecnico, conformidadCliente) => {
    if (conformidadCliente.conforme) {
      setOtsParaCierre(prev => prev.map(o =>
        o.id === ot.id ? {
          ...o,
          estado_cierre: 'cerrada_liquidada',
          horometro_final: cierreTecnico.horometro_final,
          cierre_tecnico: cierreTecnico,
          conformidad_cliente: conformidadCliente,
          liquidacion: {
            fecha: new Date().toISOString().split('T')[0],
            costo_liquidado: ot.costo_real_total,
            objeto_costo_tipo: ot.objeto_costo_tipo,
            objeto_costo_id: ot.objeto_costo_id,
            centro_costo: ot.centro_costo,
            ejecutado_por: cierreTecnico.firmado_por,
          },
        } : o
      ));
      actualizarHorometroEquipo(ot.equipo_id, cierreTecnico.horometro_final);
      actualizarEstadoOT(ot.id);
      mostrarToast(`✓ OT ${ot.id} cerrada y liquidada. $${ot.costo_real_total.toLocaleString()} imputado a ${ot.contrato_id}.`);
    } else {
      const nuevoBacklog = {
        bkl: `BKL-CC-${Date.now()}`,
        fecha: new Date().toLocaleDateString('es-PE'),
        eq: ot.equipo_id,
        sistema: 'Conformidad cliente',
        hallazgo: conformidadCliente.motivo_rechazo,
        prioridad: 'Urgente',
        score: 80,
        dias: 0,
        estado: 'Pendiente',
        cicloVida: 'Nuevo',
        requiereRetorno: false,
        fuente: 'conformidad_cliente',
        contrato_id: ot.contrato_id,
        centro_costo: ot.centro_costo,
        asignado_a: null, fecha_asignacion: null, costo_estimado_ot: null, sos_analisis_id: null, ot_generada_id: null,
      };
      agregarBacklog(nuevoBacklog);
      setOtsParaCierre(prev => prev.map(o =>
        o.id === ot.id ? { ...o, estado_cierre: 'rechazada', conformidad_cliente: conformidadCliente } : o
      ));
      mostrarToast(`⚠ Conformidad rechazada. Backlog ${nuevoBacklog.bkl} generado.`);
    }
    setVistaActiva('lista');
    setOtSeleccionada(null);
  };

  const pendientesCierre = otsParaCierre.filter(o => o.estado_cierre === 'pendiente_cierre_tecnico').length;
  const pendientesConformidad = otsParaCierre.filter(o => o.estado_cierre === 'pendiente_conformidad').length;
  const today = new Date().toISOString().split('T')[0];
  const cerradasHoy = otsParaCierre.filter(o => o.estado_cierre === 'cerrada_liquidada' && o.liquidacion?.fecha === today).length;
  const otsFiltradas = filtroEstado === 'todos' ? otsParaCierre : otsParaCierre.filter(o => o.estado_cierre === filtroEstado);

  const renderVista = () => {
    switch (vistaActiva) {
      case 'cierre_tecnico':
        return (
          <VistaCierreTecnico
            ot={otSeleccionada}
            onConfirmar={(datosCierre) => {
              setOtsParaCierre(prev => prev.map(o =>
                o.id === otSeleccionada.id ? { ...o, estado_cierre: 'pendiente_conformidad', cierre_tecnico: datosCierre } : o
              ));
              setOtSeleccionada(prev => ({ ...prev, estado_cierre: 'pendiente_conformidad', cierre_tecnico: datosCierre }));
              setVistaActiva('conformidad');
            }}
            onCancelar={() => { setVistaActiva('lista'); setOtSeleccionada(null); }}
          />
        );
      case 'conformidad':
        return (
          <VistaConformidadCliente
            ot={otSeleccionada}
            cierreTecnico={otSeleccionada?.cierre_tecnico}
            onConfirmar={(datosConformidad) => {
              ejecutarLiquidacion(otSeleccionada, otSeleccionada.cierre_tecnico, datosConformidad);
            }}
            onCancelar={() => { setVistaActiva('lista'); setOtSeleccionada(null); }}
          />
        );
      default:
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--navy)' }}>Cierre & Conformidad</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>OTs con avance 100% listas para cierre técnico y conformidad del cliente</p>
              </div>
            </div>

            <div className="kpi-grid" style={{ marginBottom: '24px' }}>
              {[
                { label: 'Pendiente cierre técnico',      valor: pendientesCierre,      color: '#d97706', bg: 'var(--orange-soft)', icon: 'orders', desc: 'OTs al 100% sin firmar' },
                { label: 'Pendiente conformidad cliente', valor: pendientesConformidad, color: '#0369a1', bg: 'var(--cyan-soft)', icon: 'users', desc: 'Cierre técnico hecho — falta cliente' },
                { label: 'Cerradas hoy',                  valor: cerradasHoy,           color: '#15803d', bg: 'var(--green-soft)', icon: 'check', desc: 'Liquidadas y cerradas' },
              ].map(kpi => (
                <div key={kpi.label} className="kpi" style={{ background: kpi.bg, borderColor: kpi.bg }}>
                  <div className="kpi-header">
                    <div className="label">{kpi.label}</div>
                    <div className="kpi-icon-wrap" style={{ background: 'white', color: kpi.color }}><Icon name={kpi.icon} size={16}/></div>
                  </div>
                  <div className="value" style={{ color: kpi.color }}>{kpi.valor}</div>
                  <div className="sub" style={{ color: kpi.color, opacity: 0.8 }}>{kpi.desc}</div>
                </div>
              ))}
            </div>

            <div className="tabs" style={{ marginBottom: '20px' }}>
              {[
                { key: 'todos',                    label: 'Todas' },
                { key: 'pendiente_cierre_tecnico', label: 'Pendiente cierre técnico' },
                { key: 'pendiente_conformidad',    label: 'Pendiente conformidad' },
                { key: 'cerrada_liquidada',        label: 'Cerradas' },
              ].map(tab => (
                <div key={tab.key} className={`tab${filtroEstado === tab.key ? ' active' : ''}`} onClick={() => setFiltroEstado(tab.key)}>
                  {tab.label}
                </div>
              ))}
            </div>

            <div className="card">
              <table className="tbl">
                <thead>
                  <tr>
                    {['OT / Fecha', 'Equipo / Cliente', 'Tipo', 'CC', 'Costo real', 'Estado cierre', 'Acción'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {otsFiltradas.map(ot => {
                    const badge = BADGE_CIERRE[ot.estado_cierre];
                    return (
                      <tr key={ot.id} className="clickable">
                        <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--cyan)', fontSize: '13px' }}>{ot.id}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Abierta: {ot.fecha_apertura}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--navy)' }}>{ot.equipo_id}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{ot.cliente}</div>
                        <div style={{ fontSize: '10px', color: 'var(--cyan)', fontFamily: 'monospace', marginTop: '2px' }}>{ot.contrato_id}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: ot.tipo_trabajo === 'Correctivo' ? '#f97316' : ot.tipo_trabajo === 'Preventivo_PM' ? '#3b82f6' : '#8b5cf6' }}>{ot.tipo_trabajo}</span>
                      </td>
                      <td>
                        <span style={{ background: 'var(--bg)', color: 'var(--slate)', fontSize: '9px', fontFamily: 'monospace', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>{ot.centro_costo}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--navy)' }}>${ot.costo_real_total.toLocaleString()}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>est. ${ot.costo_estimado.toLocaleString()}</div>
                      </td>
                      <td>
                        {badge && <span style={{ background: badge.bg, color: badge.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 500 }}>{badge.label}</span>}
                      </td>
                      <td style={{ overflow: 'visible' }}>
                        {ot.estado_cierre === 'pendiente_cierre_tecnico' && (
                          <button className="btn btn-sm btn-ghost" onClick={() => { setOtSeleccionada(ot); setVistaActiva('cierre_tecnico'); }}
                            style={{ background: 'var(--orange-soft)', color: '#d97706', border: '1px solid #fde68a' }}>
                            ✓ Cierre técnico
                          </button>
                        )}
                        {ot.estado_cierre === 'pendiente_conformidad' && (
                          <button className="btn btn-sm btn-ghost" onClick={() => { setOtSeleccionada(ot); setVistaActiva('conformidad'); }}
                            style={{ background: 'var(--cyan-soft)', color: '#0284c7', border: '1px solid #bae6fd' }}>
                            → Conformidad cliente
                          </button>
                        )}
                        {ot.estado_cierre === 'cerrada_liquidada' && <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>✓ Completada</span>}
                        {ot.estado_cierre === 'rechazada' && <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>✗ Rechazada</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

            {otsFiltradas.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px', color: '#475569', fontSize: '13px' }}>No hay OTs en este estado</div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="page">
      {toastMsg && (
        <div style={{ position: 'fixed', top: '72px', right: '24px', zIndex: 1000, background: toastMsg.startsWith('✓') ? 'rgba(34,197,94,0.95)' : 'rgba(245,158,11,0.95)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, maxWidth: '480px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {toastMsg}
        </div>
      )}

      {vistaActiva !== 'lista' && (
        <div style={{ marginBottom: '20px' }}>
          <button onClick={() => { setVistaActiva('lista'); setOtSeleccionada(null); }}
            style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '13px', cursor: 'pointer', padding: 0 }}>
            ← Volver a la lista
          </button>
          <div style={{ marginTop: '12px', fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
            {vistaActiva === 'cierre_tecnico' ? 'Cierre Técnico' : 'Conformidad del Cliente'}
            {otSeleccionada && <span style={{ fontFamily: 'monospace', color: '#60a5fa', marginLeft: '8px', fontSize: '13px' }}>{otSeleccionada.id}</span>}
          </div>
        </div>
      )}

      {renderVista()}
      <FooterBrand/>
    </div>
  );
};



// ════════════════════════════════════
// MÓDULO 1: PROGRAMACIÓN PM
// ════════════════════════════════════

export const ProgramacionPM = ({ setCurrent }) => {
  const MOCK = ZAHORY_SAC_DATA;
  const planes = MOCK.planes_pm || []
  const [planSeleccionado, setPlanSeleccionado] = useS2(null)
  const [filtro, setFiltro] = useS2('todos')

  // Helpers
  const calcHorasPM = (plan) =>
    (plan.horometro_ultimo_pm + plan.pm_intervalo_horas) - plan.horometro_actual

  const getEstadoPM = (horas) => {
    if (horas <= 0)   return { label:'Vencido',    color:'#ef4444', bg:'rgba(239,68,68,0.12)'  }
    if (horas <= 50)  return { label:'Crítico',    color:'#ef4444', bg:'rgba(239,68,68,0.12)'  }
    if (horas <= 150) return { label:'Próximo',    color:'#f59e0b', bg:'rgba(245,158,11,0.12)' }
    return               { label:'Programado', color:'#22c55e', bg:'rgba(34,197,94,0.12)'   }
  }

  // KPIs
  const vencidos  = planes.filter(p => calcHorasPM(p) <= 0).length
  const criticos  = planes.filter(p => calcHorasPM(p) > 0 && calcHorasPM(p) <= 50).length
  const proximos  = planes.filter(p => calcHorasPM(p) > 50 && calcHorasPM(p) <= 150).length
  const okCount   = planes.filter(p => calcHorasPM(p) > 150).length

  const planesFiltrados = planes.filter(p => {
    if (filtro === 'todos') return true
    const h = calcHorasPM(p)
    if (filtro === 'vencido')   return h <= 0
    if (filtro === 'critico')   return h > 0 && h <= 50
    if (filtro === 'proximo')   return h > 50 && h <= 150
    if (filtro === 'ok')        return h > 150
    return true
  }).sort((a,b) => calcHorasPM(a) - calcHorasPM(b)) // peor primero

  const generarOTPM = (plan) => {
    // Navegar a crear-ot con contexto pre-llenado
    localStorage.setItem('zahory_ot_contexto', JSON.stringify({
      equipo_id:          plan.equipo_id,
      objeto_costo_tipo:  'contrato',
      objeto_costo_id:    plan.contrato_id,
      centro_costo:       plan.centro_costo,
      tipo_trabajo:       'Preventivo_PM',
      cargo_financiero:   'Cliente_Contrato',
      descripcion:        `${plan.tipo_pm} — Horómetro actual: ${plan.horometro_actual}h`,
      origen:             'programacion_pm',
    }))
    setCurrent('crear-ot')
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Programación PM</h1>
          <div className="sub">Plan de mantenimiento preventivo por horómetro · <span style={{ color:'var(--cyan)', cursor:'pointer' }}>Flota activa</span></div>
        </div>
      </div>

      {/* KPIs */}
      <div className="report-kpi-grid">
        {[
          { label:'Vencidos',    valor:vencidos, cls: filtro==='vencido'  ? 'kpi red-soft'    : 'kpi', filtro:'vencido',  icon:'alert' },
          { label:'Críticos',   valor:criticos, cls: filtro==='critico'  ? 'kpi red-soft'    : 'kpi', filtro:'critico',  icon:'alert' },
          { label:'Próximos',   valor:proximos, cls: filtro==='proximo'  ? 'kpi orange-soft' : 'kpi', filtro:'proximo',  icon:'clock' },
          { label:'Programados', valor:okCount,  cls: filtro==='ok'       ? 'kpi green-soft'  : 'kpi', filtro:'ok',       icon:'check' },
        ].map(kpi => (
          <div key={kpi.label}
            className={kpi.cls}
            onClick={() => setFiltro(filtro === kpi.filtro ? 'todos' : kpi.filtro)}
            style={{ cursor:'pointer' }}
          >
            <div className="kpi-header">
              <div className="label">{kpi.label}</div>
              <div className="kpi-icon-wrap"><Icon name={kpi.icon} size={16}/></div>
            </div>
            <div className="value">{kpi.valor}</div>
            <div className="sub">equipos</div>
          </div>
        ))}
      </div>

      {/* Tabla de planes PM */}
      <div className="card">
        <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {['Equipo','Contrato / CC','Tipo PM','Horómetro actual','Último PM','Próximo PM','Técnico','Estado','Acción'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planesFiltrados.map(plan => {
              const horasPM = calcHorasPM(plan)
              const estado = getEstadoPM(horasPM)
              const proximoHorom = plan.horometro_ultimo_pm + plan.pm_intervalo_horas
              const estadoBadge = horasPM <= 0 ? 'badge red' : horasPM <= 50 ? 'badge red' : horasPM <= 150 ? 'badge orange' : 'badge green'
              return (
                <tr key={plan.equipo_id}>
                  <td>
                    <div style={{ fontWeight:700, fontSize:13 }}>{plan.equipo_id}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{plan.equipo_modelo}</div>
                  </td>
                  <td>
                    <div style={{ fontSize:11, color:'var(--cyan)', fontFamily:'ui-monospace,monospace' }}>{plan.contrato_id}</div>
                    <span style={{ background:'var(--orange-soft)', color:'#C15D00', fontSize:'8.5px', fontFamily:'monospace', padding:'1px 6px', borderRadius:6, fontWeight:600 }}>{plan.centro_costo}</span>
                  </td>
                  <td>
                    <div style={{ fontSize:13 }}>{plan.tipo_pm}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>cada {plan.pm_intervalo_horas}h</div>
                  </td>
                  <td style={{ fontFamily:'ui-monospace,monospace', fontWeight:700, color:'var(--cyan)', fontSize:14 }}>
                    {plan.horometro_actual.toLocaleString()}h
                  </td>
                  <td>
                    <div style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'ui-monospace,monospace' }}>{plan.horometro_ultimo_pm.toLocaleString()}h</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>{plan.fecha_ultimo_pm}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight:700, fontSize:13, color: horasPM<=0?'#dc2626':horasPM<=50?'#dc2626':horasPM<=150?'#d97706':'#15803d', fontFamily:'ui-monospace,monospace' }}>
                      {horasPM <= 0 ? `${Math.abs(horasPM)}h vencido` : `en ${horasPM}h`}
                    </div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>a las {proximoHorom.toLocaleString()}h</div>
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{plan.tecnico_asignado}</td>
                  <td>
                    <span className={estadoBadge}><span className="dot"/> {estado.label}</span>
                  </td>
                  <td style={{ overflow:'visible' }}>
                    {plan.ot_pm_activa ? (
                      <div style={{ fontSize:11 }}>
                        <div style={{ color:'var(--text-muted)', fontSize:10 }}>OT activa:</div>
                        <div style={{ color:'var(--cyan)', fontFamily:'monospace' }}>{plan.ot_pm_activa}</div>
                      </div>
                    ) : horasPM <= 150 ? (
                      <button
                        onClick={() => generarOTPM(plan)}
                        className={`btn btn-sm ${horasPM <= 0 ? 'btn-secondary' : 'btn-secondary'}`}
                        style={{ color: horasPM <= 0 ? '#dc2626' : '#d97706', borderColor: horasPM <= 0 ? '#dc2626' : '#d97706', whiteSpace:'nowrap' }}
                      >
                        + Generar OT PM
                      </button>
                    ) : (
                      <span style={{ fontSize:11, color:'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {planesFiltrados.length === 0 && (
          <div style={{ padding:'40px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
            <Icon name="search" size={28}/>
            <div style={{ marginTop:10 }}>No hay planes con el filtro seleccionado.</div>
          </div>
        )}
      </div>

      {/* Panel de historial al hacer clic */}
      {planSeleccionado && (
        <div className="card" style={{ marginTop:24, overflow:'hidden' }}>
          <div className="card-header">
            <h3>Historial PM — {planSeleccionado.equipo_id}</h3>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }} onClick={() => setPlanSeleccionado(null)}>✕</button>
          </div>
          <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {['Fecha','Horómetro','Tipo','OT','Costo','Estado'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planSeleccionado.historial_pm.map((pm, i) => (
                <tr key={i}>
                  <td style={{ fontFamily:'ui-monospace,monospace', fontSize:11 }}>{pm.fecha}</td>
                  <td style={{ fontFamily:'ui-monospace,monospace', fontWeight:700, color:'var(--cyan)' }}>{pm.horometro.toLocaleString()}h</td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{pm.tipo}</td>
                  <td style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--cyan)' }}>{pm.ot_id}</td>
                  <td style={{ fontWeight:700 }}>${pm.costo.toLocaleString()}</td>
                  <td><span className="badge green"><span className="dot"/> {pm.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <FooterBrand />
    </div>
  )
}

// ════════════════════════════════════
// MÓDULO 2: DISPONIBILIDAD MECÁNICA
// ════════════════════════════════════

export const DisponibilidadMecanica = () => {
  const MOCK = ZAHORY_SAC_DATA;
  const datos = MOCK.dmr_historico || []
  const [equipoFiltro, setEquipoFiltro] = useS2('todos')
  const [tabActivo, setTabActivo] = useS2('tabla')

  // KPIs globales
  const ultimosPeriodos = datos.map(eq => eq.periodos[eq.periodos.length-1])
  const dmrPromedio = ultimosPeriodos.length ? (ultimosPeriodos.reduce((s,p) => s + p.dmr, 0) /
                      ultimosPeriodos.length) : 0
  const equiposCumplen = ultimosPeriodos.filter((p, i) =>
    p.dmr >= datos[i].meta_dmr).length
  const penalidades = datos.reduce((s, eq) =>
    s + eq.periodos.reduce((ps, p) => ps + (p.penalidad || 0), 0), 0)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Disponibilidad Mecánica</h1>
          <div className="sub">DMR real vs meta contractual · Histórico por equipo y período</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary">
          <Icon name="download" size={13}/> Exportar
        </button>
      </div>

      {/* KPIs globales */}
      <div className="report-kpi-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
        <div className="kpi green-soft">
          <div className="kpi-header">
            <div className="label">DMR Promedio Flota</div>
            <div className="kpi-icon-wrap"><Icon name="check" size={16}/></div>
          </div>
          <div className="value" style={{ color:'#0891b2' }}>{dmrPromedio.toFixed(1)}%</div>
          <div className="sub">Período actual</div>
        </div>
        <div className="kpi cyan-soft">
          <div className="kpi-header">
            <div className="label">Equipos sobre meta</div>
            <div className="kpi-icon-wrap"><Icon name="orders" size={16}/></div>
          </div>
          <div className="value" style={{ color:'var(--navy)' }}>{equiposCumplen} / {datos.length}</div>
          <div className="sub">Cumpliendo DMR contractual</div>
        </div>
        <div className={penalidades > 0 ? 'kpi red-soft' : 'kpi green-soft'}>
          <div className="kpi-header">
            <div className="label">Penalidades acumuladas</div>
            <div className="kpi-icon-wrap"><Icon name="alert" size={16}/></div>
          </div>
          <div className="value" style={{ color: penalidades > 0 ? '#dc2626' : '#15803d' }}>
            ${penalidades.toFixed(0)}
          </div>
          <div className="sub">Total por DMR bajo meta</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="report-toolbar">
        <div className="report-tabs">
          {[
            { key:'tabla',   label:'Tabla por período' },
            { key:'resumen', label:'Resumen por equipo' },
          ].map(tab => (
            <button key={tab.key}
              className={'report-tab' + (tabActivo === tab.key ? ' active' : '')}
              onClick={() => setTabActivo(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: TABLA POR PERÍODO */}
      {tabActivo === 'tabla' && (
        <div>
          {datos.map(equipo => (
            <div key={equipo.equipo_id} className="card" style={{ marginBottom:20, overflow:'hidden' }}>
              {/* Header del equipo */}
              <div className="card-header">
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{equipo.equipo_id}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{equipo.modelo}</div>
                </div>
                <span style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--cyan)' }}>{equipo.contrato_id}</span>
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>· {equipo.cliente}</span>
                <span style={{ marginLeft:'auto', fontSize:12, fontWeight:600 }}>Meta: {equipo.meta_dmr}%</span>
              </div>

              {/* Tabla de períodos */}
              <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    {['Período','Hrs totales','Hrs parada','Hrs disponibles','DMR Real','Meta','Estado','Penalidad'].map(h => (
                      <th key={h} style={{ textAlign: h==='Período' ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipo.periodos.map((periodo, i) => {
                    const diff = periodo.dmr - equipo.meta_dmr
                    const esUltimo = i === equipo.periodos.length - 1
                    const badgeCls = periodo.sobre_meta ? 'badge green' : diff >= -5 ? 'badge orange' : 'badge red'
                    return (
                      <tr key={periodo.mes} style={{ background: esUltimo ? 'var(--cyan-soft)' : 'transparent' }}>
                        <td style={{ fontWeight: esUltimo ? 700 : 400, color: esUltimo ? 'var(--cyan)' : 'var(--text)' }}>{periodo.mes}</td>
                        <td className="num" style={{ fontFamily:'ui-monospace,monospace', fontSize:12 }}>{periodo.horas_totales}h</td>
                        <td className="num" style={{ fontFamily:'ui-monospace,monospace', fontSize:12, color: periodo.horas_parada > 40 ? '#dc2626' : 'var(--text-muted)' }}>{periodo.horas_parada}h</td>
                        <td className="num" style={{ fontFamily:'ui-monospace,monospace', fontSize:12, color:'var(--text-muted)' }}>{periodo.horas_disponibles}h</td>
                        <td className="num" style={{ fontWeight:700, fontSize:14, fontFamily:'ui-monospace,monospace', color: periodo.sobre_meta ? '#15803d' : diff >= -5 ? '#d97706' : '#dc2626' }}>{periodo.dmr.toFixed(1)}%</td>
                        <td className="num" style={{ fontSize:12, color:'var(--text-muted)' }}>{equipo.meta_dmr}%</td>
                        <td className="num">
                          <span className={badgeCls}><span className="dot"/>{periodo.sobre_meta ? '✓ Cumple' : '⚠ Bajo meta'}</span>
                        </td>
                        <td className="num" style={{ fontFamily:'ui-monospace,monospace', fontSize:12, fontWeight: periodo.penalidad>0?700:400, color: periodo.penalidad>0?'#dc2626':'var(--text-muted)' }}>
                          {periodo.penalidad > 0 ? `-$${periodo.penalidad.toFixed(0)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: RESUMEN POR EQUIPO */}
      {tabActivo === 'resumen' && (
        <div className="card">
          <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {['Equipo','Contrato','Meta DMR','DMR actual','Meses bajo meta','Penalidad total','Tendencia'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map(equipo => {
                const ultimo = equipo.periodos[equipo.periodos.length-1]
                const mesesBajoMeta = equipo.periodos.filter(p => !p.sobre_meta).length
                const penalidad = equipo.periodos.reduce((s,p) => s+(p.penalidad||0), 0)
                const penultimo = equipo.periodos[equipo.periodos.length-2]
                const tendencia = !penultimo ? 'estable'
                  : ultimo.dmr > penultimo.dmr ? 'mejora'
                  : ultimo.dmr < penultimo.dmr ? 'deterioro' : 'estable'
                return (
                  <tr key={equipo.equipo_id}>
                    <td>
                      <div style={{ fontWeight:700, fontSize:13 }}>{equipo.equipo_id}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{equipo.modelo}</div>
                    </td>
                    <td style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--cyan)' }}>{equipo.contrato_id}</td>
                    <td style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)' }}>{equipo.meta_dmr}%</td>
                    <td>
                      <div style={{ fontWeight:700, fontSize:15, color: ultimo.sobre_meta ? '#15803d' : '#dc2626' }}>{ultimo.dmr.toFixed(1)}%</div>
                      <span className={ultimo.sobre_meta ? 'badge green' : 'badge red'}>
                        <span className="dot"/>{ultimo.sobre_meta ? '✓ Sobre meta' : '⚠ Bajo meta'}
                      </span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {mesesBajoMeta > 0 ? (
                        <span className="badge red" style={{ fontSize:14, fontWeight:800 }}>{mesesBajoMeta}</span>
                      ) : (
                        <span className="badge green">0</span>
                      )}
                    </td>
                    <td style={{ textAlign:'right', fontFamily:'ui-monospace,monospace', fontWeight:700, color: penalidad>0?'#dc2626':'#15803d' }}>
                      {penalidad > 0 ? `-$${penalidad.toFixed(0)}` : '$0'}
                    </td>
                    <td>
                      <span style={{ fontSize:15, fontWeight:700, color: tendencia==='mejora'?'#15803d':tendencia==='deterioro'?'#dc2626':'var(--text-muted)' }}>
                        {tendencia==='mejora'?'↑':tendencia==='deterioro'?'↓':'→'}
                      </span>
                      <span style={{ fontSize:10, marginLeft:4, color:'var(--text-muted)' }}>{tendencia}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <FooterBrand />
    </div>
  )
}
  
