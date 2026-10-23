import React, { useCallback, useEffect, useMemo, useRef, useState as useS2 } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { WorkMenuButton } from '../components/WorkMenuButton.jsx';
import { useCompactWorkMode } from '../../useCompactWorkMode.js';
import { crearMaterialDesdeSolpe, crearSolpeInterna } from '../../services/solpeService.js';

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
  'Planificada':      { dotColor: 'var(--text-subtle)', bg: 'var(--badge-slate-bg)', textColor: 'var(--badge-slate-fg)', label: 'Planificada'       },
  'En Ejecución':     { dotColor: '#4CAF50', bg: '#E8F5E9', textColor: '#1B5E20', label: 'En Ejecución'      },
  'Espera Repuestos': { dotColor: 'var(--orange)', bg: 'var(--badge-orange-bg)', textColor: 'var(--badge-orange-fg)', label: 'Espera Repuestos'  },
  'Finalizada':       { dotColor: 'var(--cyan)', bg: 'var(--badge-cyan-bg)', textColor: 'var(--badge-cyan-fg)', label: 'Finalizada'        },
  'Cerrada':          { dotColor: 'var(--text-muted)', bg: 'var(--badge-slate-bg)', textColor: 'var(--badge-slate-fg)', label: 'Cerrada'           },
};

// ── Centro de costo — badge monospace
const CC_CFG = {
  'FLO-ALQ':  { bg: 'var(--badge-orange-bg)', color: 'var(--badge-orange-fg)' },
  'OPS-INT':  { bg: 'var(--badge-slate-bg)', color: 'var(--badge-slate-fg)' },
  'PROD-MAE': { bg: 'var(--badge-purple-bg)', color: 'var(--badge-purple-fg)' },
  'PROD-SOL': { bg: 'var(--badge-orange-bg)', color: 'var(--badge-orange-fg)' },
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

const OTsListadoPageMock = ({ onNav, setCurrentOT }) => {
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
              const ccCfg    = CC_CFG[r.centro_costo]       || { bg: 'var(--badge-slate-bg)', color: 'var(--badge-slate-fg)' };
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
                        style={{ fontSize:'10px', color:'var(--info-fg)', fontFamily:'monospace', marginTop:'2px', cursor:'pointer' }}
                        onClick={e => { e.stopPropagation(); onNav('contratos-rental'); }}
                      >{r.objeto_costo_id}</div>
                    )}
                    {r.tipoCargo === 'Interno_Zahory' && (
                      <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px' }}>
                        Interno · {r.centro_costo}
                      </div>
                    )}
                    {r.horometro_apertura && (
                      <div style={{ fontSize:'9.5px', color:'var(--text-strong-muted)', fontFamily:'monospace', marginTop:'1px' }}>
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
                            style={{ cursor:'help', marginLeft:'4px', color: r.motivo_rework ? 'var(--red)' : 'var(--badge-red-fg)', fontSize:'11px' }}
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
                          <span style={{ fontWeight:700, fontSize:'13px', color:'var(--heading)' }}>
                            ${r.costo_real.toLocaleString()}
                          </span>
                          <span style={{ display:'block', fontSize:'10px', color:'var(--text-muted)' }}>
                            est. ${r.costo_estimado.toLocaleString()}
                          </span>
                          {costoVar && (
                            <span style={{ fontSize:'9px', fontWeight:600, color: costoVar.ok ? 'var(--green)' : 'var(--red)' }}>
                              {costoVar.ok ? '▼' : '▲'}{Math.abs(costoVar.pct).toFixed(0)}%
                              {!costoVar.ok && ' sobre est.'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color:'var(--text-muted)', fontSize:'12px' }}>
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
                            background:'var(--badge-green-bg)', color:'var(--badge-green-fg)',
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
          background:'var(--navy-2)', color:'white',
          padding:'12px 20px', borderRadius:10,
          fontSize:13, fontWeight:600,
          boxShadow:'0 8px 24px rgba(0,0,0,0.3)',
          borderLeft:'4px solid var(--green)',
        }}>
          ✓ {toast}
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};
// ── Partes Diarios — datos mock ────────────────────────────────────────────
const OT_PAGE_SIZE = 25;
const OT_COLUMNS = [
  'id', 'numero', 'estado', 'fecha_programada', 'cuenta_id', 'os_cliente_id',
  'contrato_alquiler_id', 'equipo_id', 'tipo_trabajo', 'cargo_financiero', 'motivo_rework',
  'tecnico_responsable_id', 'avance_pct', 'costo_estimado', 'costo_real', 'moneda',
  'centro_costo_id', 'centro_beneficio_id', 'horometro_actual', 'direccion_ejecucion', 'created_at',
].join(',');
const ESTADOS_OT_BASE = ['borrador', 'programada', 'ejecucion', 'pendiente_cierre', 'cerrada', 'cerrado_conforme', 'valorizada', 'anulada'];
const ABIERTAS_OT = ['borrador', 'programada', 'ejecucion', 'pendiente_cierre'];
const LABEL_OT = {
  borrador: 'Borrador',
  programada: 'Programada',
  ejecucion: 'En ejecución',
  pendiente_cierre: 'Pendiente de cierre',
  cerrada: 'Cerrada',
  cerrado_conforme: 'Cerrada conforme',
  valorizada: 'Valorizada',
  anulada: 'Anulada',
};
const CARGO_OT = {
  Cliente_Contrato: 'Cliente · contrato',
  Interno_Plataforma: 'Interno · plataforma',
  Garantia_Fabrica: 'Garantía · fábrica',
  Reclamo_Rework: 'Retrabajo',
};
const TIPO_TRABAJO_OT = {
  Preventivo_PM: 'Preventivo PM',
  Correctivo: 'Correctivo',
  Acondicionamiento: 'Acondicionamiento',
  Overhaul: 'Overhaul',
};
const nombreCuentaOT = (cuenta) => cuenta?.nombre_comercial || cuenta?.razon_social || 'Sin cliente';
const formatoFechaOT = (fecha) => fecha
  ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).replace('.', '')
  : 'Sin programar';
const formatoMontoOT = (valor, moneda) => `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(valor || 0).toLocaleString('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
// Aplica el mismo alcance de empresa/sociedad a la página visible y a los conteos globales.
const construirConsultaBandejaOT = ({
  supabase,
  empresaId,
  sociedadId,
  vistaConsolidada,
  sociedadesIdsAlcance,
  filtros = {},
  soloConteo = false,
  columnas,
}) => {
  let consulta = supabase
    .from('ordenes_trabajo')
    .select(soloConteo ? 'id' : (columnas || OT_COLUMNS), { count: 'exact', head: soloConteo })
    .eq('empresa_id', empresaId);
  if (sociedadId && !vistaConsolidada) consulta = consulta.eq('sociedad_id', sociedadId);
  if (vistaConsolidada && Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
    consulta = consulta.in('sociedad_id', sociedadesIdsAlcance);
  }
  if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
  if (filtros.tecnicoId) consulta = consulta.eq('tecnico_responsable_id', filtros.tecnicoId);
  if (filtros.retrabajos) consulta = consulta.eq('cargo_financiero', 'Reclamo_Rework');
  if (filtros.kpi === 'abiertas' || filtros.kpi === 'sintec') consulta = consulta.in('estado', ABIERTAS_OT);
  if (filtros.kpi === 'sintec') consulta = consulta.is('tecnico_responsable_id', null);
  if (filtros.kpi === 'valorizar') consulta = consulta.in('estado', ['cerrada', 'cerrado_conforme']);
  if (filtros.kpi === 'sobrecosto' && filtros.sobrecostoIds) {
    consulta = filtros.sobrecostoIds.length
      ? consulta.in('id', filtros.sobrecostoIds)
      : consulta.eq('id', '__none__');
  }
  if (filtros.busquedaOR) consulta = consulta.or(filtros.busquedaOR);
  return consulta;
};
const consultaAuxiliarOT = (consulta, ids) => ids.length
  ? consulta.in('id', ids)
  : Promise.resolve({ data: [], error: null });
// Resuelve coincidencias de cliente, equipo y técnico a IDs; combina esos IDs con el número en un OR de ordenes_trabajo.
const resolverBusquedaOT = async (supabase, empresaId, texto) => {
  const termino = texto.trim();
  if (!termino) return '';
  const patron = `%${termino.replace(/[%,()]/g, ' ').trim()}%`;
  const [cuentas, equipos, tecnicos] = await Promise.all([
    supabase.from('cuentas')
      .select('id')
      .eq('empresa_id', empresaId)
      .or(`nombre_comercial.ilike.${patron},razon_social.ilike.${patron}`),
    supabase.from('activos')
      .select('id')
      .eq('empresa_id', empresaId)
      .or(`codigo.ilike.${patron},nombre.ilike.${patron}`),
    supabase.from('personal_operativo')
      .select('id')
      .eq('empresa_id', empresaId)
      .ilike('nombre', patron),
  ]);
  for (const resultado of [cuentas, equipos, tecnicos]) {
    if (resultado.error) throw resultado.error;
  }
  const terminos = [`numero.ilike.${patron}`];
  for (const [campo, resultado] of [
    ['cuenta_id', cuentas],
    ['equipo_id', equipos],
    ['tecnico_responsable_id', tecnicos],
  ]) {
    const ids = [...new Set((resultado.data || []).map((fila) => fila.id).filter(Boolean))];
    if (ids.length) terminos.push(`${campo}.in.(${ids.join(',')})`);
  }
  return terminos.join(',');
};
export const OTsListadoPage=({onNav})=>{
 useCompactWorkMode(true);
  const sesion=useSesionOperativa();
  const {empresaId,sociedadId,vistaConsolidada,sociedadesIdsAlcance,permiteEscritura,cargando:cargandoSesion,estado:estadoSesion}=sesion;

 const [filtros,setFiltros]=useS2({buscar:'',estado:'',tecnicoId:'',retrabajos:false,kpi:''});
  const [pagina,setPagina]=useS2(1);
  const [filas,setFilas]=useS2([]);
  const [total,setTotal]=useS2(0);

 const [stats,setStats]=useS2({total:0,abiertas:0,programadas:0,ejecucion:0,sinTecnico:0,valorizar:0,sobrecosto:0,estados:{}});
  const [tecnicos,setTecnicos]=useS2([]);
  const [cargando,setCargando]=useS2(false);
  const [error,setError]=useS2('');
  const [errorTec,setErrorTec]=useS2('');
  const [aviso,setAviso]=useS2('');
  const [iniciandoId,setIniciandoId]=useS2(null);
  const solicitud=useRef(0);

 const setFiltro=useCallback((k,v)=>{setPagina(1);
  setFiltros(x=>({...x,[k]:v}));
  },[]);

 useEffect(()=>{let live=true;
  if(!empresaId){setTecnicos([]);
  return undefined;
   }
   const cargarTecnicos = async () => {
    try {
     const {data,error:err}=await getSupabaseClient()
      .from('personal_operativo')
      .select('id,nombre,codigo')
      .eq('empresa_id',empresaId)
      .eq('estado','disponible')
      .order('nombre');
  if(err)throw err;
  if(live)setTecnicos(data||[]);
    } catch(err) {
     if(live){setTecnicos([]);
      setErrorTec(err?.message||'No se pudo cargar el catálogo de técnicos.');
     }
    }
   };
   cargarTecnicos();
  return()=>{live=false;
  };
  },[empresaId]);

 useEffect(()=>{if(!empresaId||estadoSesion!=='listo')return undefined;
  const request=++solicitud.current;
  (async()=>{setCargando(true);
  setError('');
  try{
   const supabase=getSupabaseClient();
   const base={supabase,empresaId,sociedadId,vistaConsolidada,sociedadesIdsAlcance};
   const busquedaOR=await resolverBusquedaOT(supabase,empresaId,filtros.buscar);
   const bf={tecnicoId:filtros.tecnicoId,retrabajos:filtros.retrabajos,busquedaOR};

  const metricas=[];
   for(let offset=0;;offset+=1000){
    const {data,error:err}=await construirConsultaBandejaOT({
     ...base,
     columnas:'id,estado,tecnico_responsable_id,costo_estimado,costo_real',
    }).range(offset,offset+999);
  if(err)throw err;
  metricas.push(...(data||[]));
  if(!data||data.length<1000)break;
  }
   const sobreIds=metricas
    .filter(o=>Number(o.costo_estimado)>0&&Number(o.costo_real)>Number(o.costo_estimado))
    .map(o=>o.id);
   const lf={...bf,estado:filtros.estado,kpi:filtros.kpi,sobrecostoIds:sobreIds};

   const [respuestaOTs,respuestaConteo]=await Promise.all([
    construirConsultaBandejaOT({...base,filtros:lf})
     .order('fecha_programada',{ascending:false,nullsFirst:false})
     .order('created_at',{ascending:false})
     .range((pagina-1)*OT_PAGE_SIZE,pagina*OT_PAGE_SIZE-1),
    construirConsultaBandejaOT({...base,filtros:lf,soloConteo:true}),
   ]);
   const {data:ots,error:err}=respuestaOTs;
   const {count,error:errCount}=respuestaConteo;
  if(err)throw err;
  if(errCount)throw errCount;

  const states=Object.fromEntries(ESTADOS_OT_BASE.map(e=>[e,0]));
  let abiertas=0,programadas=0,ejecucion=0,sinTecnico=0,valorizar=0,sobrecosto=0;
  metricas.forEach(o=>{states[o.estado]=(states[o.estado]||0)+1;
  if(ABIERTAS_OT.includes(o.estado)){abiertas++;
  if(!o.tecnico_responsable_id)sinTecnico++;
  }if(o.estado==='programada')programadas++;
  if(o.estado==='ejecucion')ejecucion++;
  if(['cerrada','cerrado_conforme'].includes(o.estado))valorizar++;
  if(Number(o.costo_estimado)>0&&Number(o.costo_real)>Number(o.costo_estimado))sobrecosto++;
  });

  const ids=k=>[...new Set((ots||[]).map(o=>o[k]).filter(Boolean))];
   const [cu,ct,os,cc,cb,te,eq,se]=await Promise.all([
    consultaAuxiliarOT(supabase.from('cuentas').select('id,nombre_comercial,razon_social').eq('empresa_id',empresaId),ids('cuenta_id')),
    consultaAuxiliarOT(supabase.from('contratos_alquiler').select('id,numero').eq('empresa_id',empresaId),ids('contrato_alquiler_id')),
    consultaAuxiliarOT(supabase.from('os_clientes').select('id,numero').eq('empresa_id',empresaId),ids('os_cliente_id')),
    consultaAuxiliarOT(supabase.from('centros_costo').select('id,codigo,nombre').eq('empresa_id',empresaId),ids('centro_costo_id')),
    consultaAuxiliarOT(supabase.from('centros_beneficio').select('id,codigo,nombre').eq('empresa_id',empresaId),ids('centro_beneficio_id')),
    consultaAuxiliarOT(supabase.from('personal_operativo').select('id,nombre').eq('empresa_id',empresaId),ids('tecnico_responsable_id')),
    consultaAuxiliarOT(supabase.from('activos').select('id,codigo,nombre').eq('empresa_id',empresaId),ids('equipo_id')),
    consultaAuxiliarOT(supabase.from('sedes').select('id,nombre').eq('empresa_id',empresaId),ids('direccion_ejecucion')),
   ]);
  for(const r of [cu,ct,os,cc,cb,te,eq,se])if(r.error)throw r.error;
  if(request!==solicitud.current)return;

  const map=r=>new Map((r.data||[]).map(x=>[x.id,x])),[mcu,mct,mos,mcc,mcb,mte,meq,mse]=[cu,ct,os,cc,cb,te,eq,se].map(map);
   setFilas((ots||[]).map(o=>({
    ...o,
    cliente:mcu.get(o.cuenta_id),
    contrato:mct.get(o.contrato_alquiler_id),
    osCliente:mos.get(o.os_cliente_id),
    centroCosto:mcc.get(o.centro_costo_id),
    centroBeneficio:mcb.get(o.centro_beneficio_id),
    tecnico:mte.get(o.tecnico_responsable_id),
    equipo:meq.get(o.equipo_id),
    sede:mse.get(o.direccion_ejecucion),
   })));
  setTotal(count||0);
  setStats({total:metricas.length,abiertas,programadas,ejecucion,sinTecnico,valorizar,sobrecosto,estados:states});

 }catch(err){if(request!==solicitud.current)return;
  setFilas([]);
  setTotal(0);
  setError(err?.message||'No se pudo cargar la Bandeja de OTs.');
  }finally{if(request===solicitud.current)setCargando(false);
  }})();
  return()=>{solicitud.current++;
  };
  },[empresaId,sociedadId,vistaConsolidada,sociedadesIdsAlcance,estadoSesion,pagina,filtros]);

 const paginas=Math.max(1,Math.ceil(total/OT_PAGE_SIZE)),sinSesion=!cargandoSesion&&estadoSesion!=='listo';
  const avisoDetalle=()=>{setAviso('El detalle real de OT estará disponible próximamente.');
  window.setTimeout(()=>setAviso(''),4000);
  };

 const iniciar=async o=>{if(!permiteEscritura){setAviso('La vista actual es solo lectura. Selecciona una sociedad operativa para iniciar la OT.');
  return;
  }if(!o.tecnico_responsable_id){setAviso('Asigna un técnico responsable antes de iniciar la OT.');
  return;
  }if(!o.centro_costo_id){setAviso('Asigna un centro de costo antes de iniciar la OT.');
  return;
  }setIniciandoId(o.id);
  try{const fecha_inicio_real=new Date().toISOString();
   const {data,error:err}=await getSupabaseClient()
    .from('ordenes_trabajo')
    .update({estado:'ejecucion',fecha_inicio_real})
    .eq('id',o.id)
    .eq('empresa_id',empresaId)
    .eq('estado','programada')
    .select('id,estado,fecha_inicio_real')
    .maybeSingle();
  if(err)throw err;
  if(!data)throw new Error('La OT ya no está programada o no tienes permiso para iniciarla. Actualiza la Bandeja e inténtalo nuevamente.');
  setFilas(xs=>xs.map(x=>x.id===data.id?{...x,...data}:x));
  setAviso(`OT ${o.numero} iniciada correctamente.`);
  }catch(err){setAviso(`No se pudo iniciar la OT: ${err?.message||'Error desconocido.'}`);
  }finally{setIniciandoId(x=>x===o.id?null:x);
  }};

 const setKpi=k=>{setPagina(1);
  setFiltros(x=>({...x,estado:'',kpi:x.kpi===k?'':k}));
  },limpiar=()=>{setPagina(1);
  setFiltros({buscar:'',estado:'',tecnicoId:'',retrabajos:false,kpi:''});
  };
   const activo=Boolean(filtros.buscar||filtros.estado||filtros.tecnicoId||filtros.retrabajos||filtros.kpi);
   const states=ESTADOS_OT_BASE.filter(e=>stats.estados[e]||filtros.estado===e);

  const raiz=o=>o.contrato
   ?`Contrato ${o.contrato.numero}`
   :o.osCliente
    ?`OS ${o.osCliente.numero}`
    :o.equipo_id?'Equipo interno':'Sin raíz registrada';
  const centro=o=>o.centroCosto
   ?`${o.centroCosto.codigo||'CECO'} · ${o.centroCosto.nombre}`
   :o.centroBeneficio
    ?`${o.centroBeneficio.codigo||'CEBE'} · ${o.centroBeneficio.nombre}`
    :'Sin centro asignado';

 return <section
        className="dx-otb">
  <div
        className="dx-otb-in">
  <header
        className="dx-otb-top">
  <div>
  <div
        className="dx-otb-eyebrow">Taller y operaciones</div>
  <h1
        className="dx-otb-title">Bandeja de OTs</h1>
  <p
        className="dx-otb-sub">{stats.abiertas} abiertas · {stats.total} en total</p>
  </div>
  <button
        className="dx-otb-primary"
        onClick={()=>onNav?.('crear-ot')}>＋ Nueva OT</button>
  </header>
 {cargandoSesion&&<div
        className="dx-otb-alert">Cargando el contexto de sesión operativa…</div>}{sinSesion&&<div
        className="dx-otb-alert">No hay una sesión operativa válida para consultar Órdenes de Trabajo.</div>}{vistaConsolidada&&estadoSesion==='listo'&&<div
        className="dx-otb-alert">Vista consolidada: se muestran las OTs de las sociedades permitidas.</div>}{estadoSesion==='listo'&&<>{errorTec&&<div
        className="dx-otb-alert">No se pudo cargar el filtro de técnicos: {errorTec}</div>}{error&&<div
        className="dx-otb-alert is-error">No se pudo cargar la Bandeja de OTs: {error}</div>}
 <div
        className="dx-otb-kpis">{[['abiertas','OTs abiertas',stats.abiertas,`${stats.programadas} programadas · ${stats.ejecucion} en ejecución`,'is-cyan',''],
        ['sintec','Sin técnico',stats.sinTecnico,'Abiertas sin responsable asignado','is-amber',stats.sinTecnico?'is-alert':''],
        ['valorizar','Por valorizar',stats.valorizar,'Cerradas pendientes de valorización','is-violet',''],
        ['sobrecosto','Con sobrecosto',stats.sobrecosto,'Costo real mayor al estimado','is-red',stats.sobrecosto?'is-danger':'']].map(([id,l,v,n,c,x])=>
  <button
        key={id}
        className={`dx-otb-kpi ${x} ${filtros.kpi===id?'is-on':''}`} aria-pressed={filtros.kpi===id}
        onClick={()=>setKpi(id)}>
  <span
        className="dx-otb-kpi-top">{l}<span
        className={`dx-otb-ico ${c}`}>
  <svg viewBox="0 0 24 24" aria-hidden="true">{id==='abiertas'?<>
  <rect x="3" y="4" width="18" height="16" rx="2"/>
  <path d="M3 9h18M8 2v4M16 2v4"/>
  </>:id==='sintec'?<>
  <circle cx="12" cy="8" r="4"/>
  <path d="M4 21a8 8 0 0 1 16 0"/>
  </>:id==='valorizar'?<>
  <path d="M6 2h9l5 5v15H6z"/>
  <path d="M14 2v6h6M9 13h6M9 17h6"/>
  </>:<>
  <path d="m3 17 6-6 4 4 8-8"/>
  <path d="M14 7h7v7"/>
  </>}</svg>
  </span>
  </span>
  <b
        className="dx-otb-kpi-val">{v}</b>
  <span
        className="dx-otb-kpi-note">{n}</span>
  </button>)}</div>
  <section
        className="dx-otb-card">
  <div
        className="dx-otb-bar">
  <h2>Órdenes de trabajo<span
        className="dx-otb-count">{total} resultados</span>
  </h2>
  <select
        className="dx-otb-select" aria-label="Filtrar por técnico"
        value={filtros.tecnicoId}
        onChange={e=>setFiltro('tecnicoId',e.target.value)}>
  <option
        value="">Técnico: todos</option>{tecnicos.map(t=>
  <option
        key={t.id}
        value={t.id}>{t.nombre||t.codigo||t.id}</option>)}</select>
  <button
        className={`dx-otb-toggle ${filtros.retrabajos?'is-on':''}`} aria-pressed={filtros.retrabajos}
        onClick={()=>setFiltro('retrabajos',!filtros.retrabajos)}>↻ Solo retrabajos</button>
  <label
        className="dx-otb-search"><svg
        width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="m10.6 10.6 3.2 3.2" stroke="currentColor" strokeWidth="1.8" />
        </svg><input
        value={filtros.buscar}
        onChange={e=>setFiltro('buscar',e.target.value)}
        placeholder="Buscar por OT, cliente, equipo o técnico" aria-label="Buscar Órdenes de trabajo" />
  </label>
  </div>
 <div
        className="dx-otb-filters">
  <div
        className="dx-otb-chips">
  <button
        className={`dx-otb-chip ${!filtros.estado?'is-on':''}`}
        onClick={()=>setFiltros(x=>({...x,estado:'',kpi:''}))}>Todos<b>{stats.total}</b>
  </button>{states.map(e=>
  <button
        key={e}
        className={`dx-otb-chip ${filtros.estado===e?'is-on':''}`} aria-pressed={filtros.estado===e}
        onClick={()=>{setPagina(1);
  setFiltros(x=>({...x,estado:x.estado===e?'':e,kpi:''}));
  }}>
  <i
        className={`is-${e}`} />{LABEL_OT[e]}<b>{stats.estados[e]||0}</b>
  </button>)}</div>
  <button
        className="dx-otb-clear" hidden={!activo}
        onClick={limpiar}>Limpiar</button>
  </div>
 <div
        className="dx-otb-cols dx-otb-head">
  <span>OT · Equipo</span>
  <span>Raíz de costo · CECO</span>
  <span
        className="dx-otb-area-tech">Técnico · Ubicación</span>
  <span>Estado</span>
  <span>Costo real · Avance</span>
  <span>Acciones</span>
  </div>{!cargando&&!error&&!filas.length&&<div
        className="dx-otb-empty">No hay OTs para los filtros seleccionados.</div>}
  {filas.map(o=>{
   const eq=o.equipo
    ?[o.equipo.codigo,o.equipo.nombre].filter(Boolean).join(' - ')
    :'Sin equipo';
   const tec=o.tecnico?.nombre||o.tecnico_responsable_id||'Sin técnico';
   const ubic=o.sede?.nombre||o.direccion_ejecucion||'Sin ubicación';
   const estado=LABEL_OT[o.estado]||String(o.estado||'Sin estado').replace(/_/g,' ');
   const avance=Math.min(100,Math.max(0,Number(o.avance_pct||0)));
   const over=Number(o.costo_estimado)>0&&Number(o.costo_real)>Number(o.costo_estimado);
   const title=!permiteEscritura
    ?'La vista actual es solo lectura. Selecciona una sociedad operativa para iniciar la OT.'
    :!o.tecnico_responsable_id
     ?'Asigna un técnico responsable antes de iniciar la OT.'
     :!o.centro_costo_id
      ?'Asigna un centro de costo antes de iniciar la OT.'
      :'Iniciar esta OT.';
  return <article
        key={o.id}
        className="dx-otb-cols dx-otb-row"
        title="El detalle real de OT estará disponible próximamente."
        onClick={avisoDetalle}>
  <div
        className="dx-otb-ot dx-otb-area-ot">
  <span
        className="dx-otb-oti">
  <svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>
  </svg>
  </span>
  <div>
  <b
        className="dx-otb-num">{o.numero}<small>{formatoFechaOT(o.fecha_programada)}</small>
  </b>
  <span
        className="dx-otb-strong">{eq}</span>
  <span
        className="dx-otb-muted">{nombreCuentaOT(o.cliente)==='Sin cliente'?'Uso interno':nombreCuentaOT(o.cliente)}</span>
  </div>
  </div>
  <div
        className="dx-otb-cell dx-otb-area-root">
  <b
        className="dx-otb-strong">{raiz(o)}</b>
  <span
        className="dx-otb-muted">{centro(o)}</span>
  <span
         className={`dx-otb-tag ${o.cargo_financiero==='Reclamo_Rework'?'is-warn':''}`}>
         {TIPO_TRABAJO_OT[o.tipo_trabajo]||o.tipo_trabajo||'Sin clasificar'}
         {' · '}{CARGO_OT[o.cargo_financiero]||'Sin cargo financiero'}
        </span>
  </div>
  <div
        className="dx-otb-cell dx-otb-area-tech">
  <b
        className={`dx-otb-strong ${o.tecnico_responsable_id?'':'is-amber'}`}>{tec}</b>
  <span
        className="dx-otb-muted">{ubic}</span>
  </div>
  <span
        className={`dx-otb-pill dx-otb-area-status is-${o.estado}`}>
  <i />{estado}</span>
  <div
        className="dx-otb-cost dx-otb-area-cost">
  <strong
         className={over?'is-over':''}>
         {formatoMontoOT(o.costo_real,o.moneda)}
         <small>
          est. {Number(o.costo_estimado)>0?formatoMontoOT(o.costo_estimado,o.moneda):'—'}
         </small>
  </strong>
  <div
        className="dx-otb-bar2">
  <i
        style={{width:`${avance}%`}} />
  </div>
  <span>{avance}% de avance{over&&<b
        className="is-over-note"> · sobrecosto</b>}</span>
  </div>
  <div
        className="dx-otb-acts dx-otb-area-actions"
        onClick={e=>e.stopPropagation()}>{o.estado==='programada'&&<button
        className="dx-otb-btn"
        disabled={!permiteEscritura||iniciandoId===o.id||!o.tecnico_responsable_id||!o.centro_costo_id}
        title={title}
        onClick={()=>iniciar(o)}>{iniciandoId===o.id?'Iniciando…':<>
  <svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="m7 4 13 8-13 8z"/>
  </svg>Iniciar OT</>}</button>}</div>
  </article>;
  })}
  {cargando&&<div
        className="dx-otb-loading">Cargando Órdenes de trabajo…</div>}{!error&&total>0&&<footer
        className="dx-otb-pag">
  <span>Mostrando {(pagina-1)*OT_PAGE_SIZE +1}–{Math.min(pagina*OT_PAGE_SIZE,total)} de {total}</span>
  <div>
  <button
        disabled={pagina===1||cargando}
        onClick={()=>setPagina(x=>x-1)}>← Ant.</button>
  <span>Pág. {pagina} / {paginas}</span>
  <button
        disabled={pagina===paginas||cargando}
        onClick={()=>setPagina(x=>x+1)}>Sig. →</button>
  </div>
  </footer>}</section>
  </>}{aviso&&<div
        className="dx-otb-toast">{aviso}</div>}<FooterBrand />
  </div>
  </section>;

};


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
                {r.numero || r.id}
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
  useCompactWorkMode(true);
  const sesionOperativa = useSesionOperativa();
  const [tab,      setTab]      = useS2('todos');
  const [search,   setSearch]   = useS2('');
  const [dateFrom, setDateFrom] = useS2('');
  const [dateTo,   setDateTo]   = useS2('');
  const [openMenu, setOpenMenu] = useS2(null);
  const [partesReales, setPartesReales] = useS2([]);
  const [cargandoPartes, setCargandoPartes] = useS2(false);
  const [errorPartes, setErrorPartes] = useS2('');

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || sesionOperativa.estado !== 'listo') {
      setPartesReales([]);
      setCargandoPartes(false);
      return () => { vigente = false; };
    }

    const cargarPartes = async () => {
      setCargandoPartes(true);
      setErrorPartes('');
      try {
        let consulta = getSupabaseClient()
          .from('partes_diarios')
          .select('id,numero,empresa_id,orden_trabajo_id,tecnico_id,tecnico_nombre,fecha,horas_normales,estado,avance_pct,ordenes_trabajo!inner(id,numero,sociedad_id)')
          .eq('empresa_id', sesionOperativa.empresaId)
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false });
        // partes_diarios no tiene sociedad_id: el alcance se aplica mediante la OT relacionada.
        if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
          consulta = consulta.eq('ordenes_trabajo.sociedad_id', sesionOperativa.sociedadId);
        }
        if (sesionOperativa.vistaConsolidada && Array.isArray(sesionOperativa.sociedadesIdsAlcance) && sesionOperativa.sociedadesIdsAlcance.length) {
          consulta = consulta.in('ordenes_trabajo.sociedad_id', sesionOperativa.sociedadesIdsAlcance);
        }
        const { data, error } = await consulta;
        if (error) throw error;

        const tecnicoIds = [...new Set((data || []).map(parte => parte.tecnico_id).filter(Boolean))];
        const { data: tecnicos, error: errorTecnicos } = tecnicoIds.length
          ? await getSupabaseClient().from('personal_operativo').select('id,nombre').eq('empresa_id', sesionOperativa.empresaId).in('id', tecnicoIds)
          : { data: [], error: null };
        if (errorTecnicos) throw errorTecnicos;
        const tecnicosPorId = new Map((tecnicos || []).map(tecnico => [tecnico.id, tecnico.nombre]));
        const estadoListado = estado => ({
          aprobado: 'Aprobado', rechazado: 'Rechazado', en_revision: 'Pendiente',
          registrado: 'Pendiente', borrador: 'Pendiente', con_restriccion: 'Pendiente',
        })[String(estado || '').toLowerCase()] || 'Pendiente';
        if (vigente) {
          setPartesReales((data || []).map(parte => ({
            id: parte.id,
            numero: parte.numero,
            fecha: parte.fecha,
            mecanico: parte.tecnico_nombre || tecnicosPorId.get(parte.tecnico_id) || parte.tecnico_id || 'Sin técnico',
            ot: parte.ordenes_trabajo?.numero || parte.orden_trabajo_id,
            horas: Number(parte.horas_normales || 0),
            estado: estadoListado(parte.estado),
          })));
        }
      } catch (error) {
        if (vigente) {
          setPartesReales([]);
          setErrorPartes(error?.message || 'No se pudieron cargar los partes diarios reales.');
        }
      } finally {
        if (vigente) setCargandoPartes(false);
      }
    };

    cargarPartes();
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.estado, sesionOperativa.sociedadId, sesionOperativa.vistaConsolidada, sesionOperativa.sociedadesIdsAlcance]);

  const filtered = partesReales
    .filter(r => tab === 'todos' || r.estado === tab)
    .filter(r => !search   || r.mecanico.toLowerCase().includes(search.toLowerCase()) || r.ot.toLowerCase().includes(search.toLowerCase()))
    .filter(r => !dateFrom || r.fecha >= dateFrom)
    .filter(r => !dateTo   || r.fecha <= dateTo);

  return (
    <div className="page" onClick={() => setOpenMenu(null)}>
      <div className="page-header">
        <WorkMenuButton />
        <div>
          <h1>Gestión de Partes Diarios — Taller</h1>
          <div className="sub">Carapongo y Lurín · {partesReales.length} registros reales</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-primary" onClick={() => onNav('crear-parte-taller')}>
          <Icon name="plus" size={13}/> Nuevo Parte Diario
        </button>
      </div>
      <PartesDiariosToolbar
        tab={tab} setTab={setTab} allRows={partesReales}
        search={search} setSearch={setSearch}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
      />
      <PartesDiariosDataTable
        rows={filtered} onNav={onNav}
        editRoute="crear-parte-taller"
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />
      {cargandoPartes && <div className="muted" style={{ marginTop: 12, textAlign: 'center' }}>Cargando partes diarios reales...</div>}
      {errorPartes && <div style={{ marginTop: 12, color: 'var(--text-danger)', textAlign: 'center' }}>{errorPartes}</div>}
      <FooterBrand/>
    </div>
  );
};

// ---------- Solicitudes SOLPE ----------
const nuevaLineaSolpe = () => ({ id: `itm_${crypto.randomUUID()}`, material_id: '', material_codigo: '', descripcion: '', cantidad: '', unidad: 'und', observacion: '' });

// Preview local equivalente al codigoAuto del maestro de Admin.
// La generacion definitiva al guardar sigue siendo la RPC generar_codigo_material.
const calcularCodigoMaterialSolpe = (subfamiliaId, grupos, familias, subfamilias, materiales, empresaId) => {
  const subfamilia = subfamilias.find(item => item.id === subfamiliaId);
  if (!subfamilia) return '';
  const familia = familias.find(item => item.id === subfamilia.familia_id);
  if (!familia) return '';
  const grupo = grupos.find(item => item.id === familia.grupo_id);
  if (!grupo || grupo.codigo == null || familia.codigo == null || subfamilia.codigo == null) return '';
  const prefijo = String(grupo.codigo).padStart(2, '0') + String(familia.codigo).padStart(2, '0') + String(subfamilia.codigo).padStart(2, '0');
  const existentes = (materiales || []).filter(material => material.subfamilia_id === subfamiliaId
    && (material.empresa_id === empresaId || !material.empresa_id)
    && typeof material.codigo === 'string' && material.codigo.length === 10 && material.codigo.startsWith(prefijo));
  const maxCorrelativo = existentes.reduce((max, material) => {
    const numero = parseInt(material.codigo.slice(6), 10);
    return Number.isNaN(numero) ? max : Math.max(max, numero);
  }, 0);
  return prefijo + String(maxCorrelativo + 1).padStart(4, '0');
};

const SelectorMaterialSolpe = ({ item, materiales, puedeCrearMaterial, empresaId, usuarioId, grupos, familias, subfamilias, almacenes, unidadesMedida = [], onSelect }) => {
  const [texto, setTexto] = useS2(item.descripcion || '');
  const [abierto, setAbierto] = useS2(false);
  const [crearAbierto, setCrearAbierto] = useS2(false);
  const [guardando, setGuardando] = useS2(false);
  const [error, setError] = useS2(null);
  const [resultadosRemotos, setResultadosRemotos] = useS2([]);
  const [buscando, setBuscando] = useS2(false);
  const [busquedaError, setBusquedaError] = useS2(null);
  const [form, setForm] = useS2({ grupo_id:'', familia_id:'', subfamilia_id:'', descripcion:item.descripcion || '', unidad:item.unidad || '', nro_parte:'', unidades_contenidas:'1', almacen_id:'', ubicacion:'', observacion:'', precio_unitario:'0', stock_minimo:'0', punto_reorden:'0', stock_maximo:'0', stock_seguridad:'0', estado:'activo' });
  const termino = texto.trim();
  const resultadosLocales = termino.length >= 2
    ? materiales.filter(material => material.estado !== 'inactivo' && `${material.codigo || ''} ${material.descripcion || ''}`.toLowerCase().includes(termino.toLowerCase())).slice(0, 12)
    : [];
  const resultados = resultadosRemotos.length ? resultadosRemotos : resultadosLocales;
  const familiasFiltradas = familias.filter(familia => familia.grupo_id === form.grupo_id);
  const subfamiliasFiltradas = subfamilias.filter(subfamilia => subfamilia.familia_id === form.familia_id);
  const unidadesOpciones = [...new Set([...(unidadesMedida || []), form.unidad, item.unidad].map(unidad => String(unidad || '').trim()).filter(Boolean))];
  const codigoSugerido = useMemo(() => calcularCodigoMaterialSolpe(form.subfamilia_id, grupos, familias, subfamilias, materiales, empresaId), [form.subfamilia_id, grupos, familias, subfamilias, materiales, empresaId]);

  useEffect(() => {
    let vigente = true;
    if (termino.length < 2 || !empresaId) {
      setResultadosRemotos([]);
      setBuscando(false);
      setBusquedaError(null);
      return () => { vigente = false; };
    }
    setBuscando(true);
    setBusquedaError(null);
    const timer = setTimeout(async () => {
      try {
        const supabase = getSupabaseClient();
        const patron = `%${termino.replace(/[%_]/g, '\\$&')}%`;
        const [porCodigo, porDescripcion] = await Promise.all([
          supabase.from('materiales').select('id,codigo,descripcion,unidad,estado,grupo_id,familia_id,subfamilia_id').eq('empresa_id', empresaId).neq('estado', 'inactivo').ilike('codigo', patron).limit(12),
          supabase.from('materiales').select('id,codigo,descripcion,unidad,estado,grupo_id,familia_id,subfamilia_id').eq('empresa_id', empresaId).neq('estado', 'inactivo').ilike('descripcion', patron).limit(12),
        ]);
        if (porCodigo.error) throw porCodigo.error;
        if (porDescripcion.error) throw porDescripcion.error;
        if (vigente) {
          const unicos = new Map([...(porCodigo.data || []), ...(porDescripcion.data || [])].map(material => [material.id, material]));
          setResultadosRemotos([...unicos.values()].slice(0, 12));
        }
      } catch (consultaError) {
        if (vigente) {
          setResultadosRemotos([]);
          setBusquedaError(consultaError?.message || 'No se pudo consultar el catálogo.');
        }
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 400);
    return () => { vigente = false; clearTimeout(timer); };
  }, [termino, empresaId]);
  const seleccionar = material => {
    setTexto(material.descripcion || '');
    setAbierto(false);
    onSelect({ material_id:material.id, material_codigo:material.codigo || '', descripcion:material.descripcion || '', unidad:material.unidad || 'und' });
  };
  useEffect(() => {
    if (!crearAbierto) return undefined;
    const cerrarConEscape = evento => { if (evento.key === 'Escape' && !guardando) setCrearAbierto(false); };
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, [crearAbierto, guardando]);
  const guardar = async () => {
    if (!form.grupo_id || !form.familia_id || !form.subfamilia_id || !form.descripcion.trim() || !form.unidad.trim()) {
      setError('Grupo, familia, subfamilia, descripción y unidad son obligatorios.');
      return;
    }
    setGuardando(true); setError(null);
    try {
      const material = await crearMaterialDesdeSolpe({ empresaId, usuarioId, datos:form });
      seleccionar(material);
      setCrearAbierto(false);
    } catch (guardarError) {
      setError(guardarError?.message || 'No se pudo crear el material.');
    } finally { setGuardando(false); }
  };
  return <>
    <div className="dx-solpe-pop">
      <input className="dx-solpe-in" aria-label="Buscar material por código o descripción" value={texto} placeholder="Buscar por código o descripción" autoComplete="off" onFocus={() => setAbierto(true)} onChange={event => { setTexto(event.target.value); setResultadosRemotos([]); setAbierto(true); }} />
      {abierto && texto.trim().length >= 2 && (
        <div className="dx-solpe-drop" role="listbox" aria-label="Resultados de materiales">
          {buscando && <div className="dx-solpe-hint">Buscando materiales...</div>}
          {!buscando && resultados.map(material => <button key={material.id} type="button" className="dx-solpe-opt" role="option" onMouseDown={event => event.preventDefault()} onClick={() => seleccionar(material)}><span className="dx-ui-icon is-cyan dx-solpe-opt-icon" aria-hidden="true"><Icon name="box" size={15}/></span><span><b>{material.descripcion}</b><small>{material.codigo || 'Sin código'} · {material.unidad || 'und'}</small></span></button>)}
          {!buscando && resultados.length === 0 && <div className="dx-solpe-hint">{busquedaError || 'Sin materiales coincidentes.'}</div>}
          {puedeCrearMaterial && <button type="button" className="dx-solpe-opt dx-solpe-new" onMouseDown={event => event.preventDefault()} onClick={() => { setForm(actual => ({ ...actual, descripcion:texto })); setCrearAbierto(true); setAbierto(false); }}>＋ Crear material «{texto.length > 28 ? `${texto.slice(0, 28)}…` : texto}»</button>}
        </div>
      )}
    </div>
    {crearAbierto && <div className="dx-solpe-scrim dx-solpe-scrim-material" onMouseDown={event => { if (event.target === event.currentTarget && !guardando) setCrearAbierto(false); }}><section className="dx-solpe-modal" role="dialog" aria-modal="true" aria-label="Nuevo material">
      <div className="dx-solpe-mhead"><div><div className="dx-ui-eyebrow">Catálogo de materiales</div><h2>Nuevo material</h2></div><button type="button" className="dx-solpe-x" aria-label="Cerrar" onClick={() => setCrearAbierto(false)}><Icon name="x" size={18}/></button></div>
      <div className="dx-solpe-mbody">
        {error && <div className="dx-solpe-error" role="alert">{error}</div>}
        <section className="dx-solpe-mgrp"><h3 className="dx-solpe-subh">Clasificación</h3><div className="dx-solpe-grid dx-solpe-grid-3">
          <div className="dx-solpe-f"><label>Grupo *</label><select className="dx-solpe-in" value={form.grupo_id} onChange={event => setForm(actual => ({ ...actual, grupo_id:event.target.value, familia_id:'', subfamilia_id:'' }))}><option value="">Seleccionar...</option>{grupos.map(grupo => <option key={grupo.id} value={grupo.id}>{grupo.codigo} - {grupo.nombre}</option>)}</select></div>
          <div className="dx-solpe-f"><label>Familia *</label><select className="dx-solpe-in" value={form.familia_id} disabled={!form.grupo_id} onChange={event => setForm(actual => ({ ...actual, familia_id:event.target.value, subfamilia_id:'' }))}><option value="">Seleccionar...</option>{familiasFiltradas.map(familia => <option key={familia.id} value={familia.id}>{familia.codigo} - {familia.nombre}</option>)}</select></div>
          <div className="dx-solpe-f"><label>Subfamilia *</label><select className="dx-solpe-in" value={form.subfamilia_id} disabled={!form.familia_id} onChange={event => setForm(actual => ({ ...actual, subfamilia_id:event.target.value }))}><option value="">Seleccionar...</option>{subfamiliasFiltradas.map(subfamilia => <option key={subfamilia.id} value={subfamilia.id}>{subfamilia.codigo} - {subfamilia.nombre}</option>)}</select></div>
          <div className="dx-solpe-f dx-solpe-full"><label>Código · automático</label><div className={`dx-solpe-code-box${codigoSugerido ? '' : ' dx-solpe-code-empty'}`}>{codigoSugerido || 'Selecciona una subfamilia para generar el código'}</div></div>
        </div></section>
        <section className="dx-solpe-mgrp"><h3 className="dx-solpe-subh">Datos del material</h3><div className="dx-solpe-grid">
          <div className="dx-solpe-f dx-solpe-full"><label>Descripción *</label><input className="dx-solpe-in" value={form.descripcion} onChange={event => setForm(actual => ({ ...actual, descripcion:event.target.value }))}/></div>
          <div className="dx-solpe-f"><label>Unidad de medida *</label><select className="dx-solpe-in" value={form.unidad} onChange={event => setForm(actual => ({ ...actual, unidad:event.target.value }))}><option value="">Seleccionar...</option>{unidadesOpciones.map(unidad => <option key={unidad} value={unidad}>{unidad}</option>)}</select></div>
          <div className="dx-solpe-f"><label>Nro. de parte</label><input className="dx-solpe-in" value={form.nro_parte} onChange={event => setForm(actual => ({ ...actual, nro_parte:event.target.value }))}/></div>
          <div className="dx-solpe-f"><label>Unidades contenidas</label><input className="dx-solpe-in" type="number" min="0.01" step="0.01" value={form.unidades_contenidas} onChange={event => setForm(actual => ({ ...actual, unidades_contenidas:event.target.value }))}/></div>
          <div className="dx-solpe-f"><label>Precio referencial (PEN)</label><input className="dx-solpe-in" type="number" min="0" step="0.01" value={form.precio_unitario} onChange={event => setForm(actual => ({ ...actual, precio_unitario:event.target.value }))}/></div>
          <div className="dx-solpe-f dx-solpe-full"><label>Observación</label><input className="dx-solpe-in" value={form.observacion} onChange={event => setForm(actual => ({ ...actual, observacion:event.target.value }))}/></div>
        </div></section>
        <section className="dx-solpe-mgrp"><h3 className="dx-solpe-subh">Almacén y stock</h3><div className="dx-solpe-grid">
          <div className="dx-solpe-f"><label>Almacén por defecto</label><select className="dx-solpe-in" value={form.almacen_id} onChange={event => setForm(actual => ({ ...actual, almacen_id:event.target.value }))}><option value="">Sin asignar</option>{almacenes.map(almacen => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}</select></div>
          <div className="dx-solpe-f"><label>Ubicación</label><input className="dx-solpe-in" value={form.ubicacion} onChange={event => setForm(actual => ({ ...actual, ubicacion:event.target.value }))} placeholder="Ej. Pasillo A, estante 3"/></div>
        </div><div className="dx-solpe-grid dx-solpe-grid-4 dx-solpe-stock">
          <div className="dx-solpe-f"><label>Stock mínimo</label><input className="dx-solpe-in" type="number" min="0" step="0.01" value={form.stock_minimo} onChange={event => setForm(actual => ({ ...actual, stock_minimo:event.target.value }))}/></div>
          <div className="dx-solpe-f"><label>Punto de reorden</label><input className="dx-solpe-in" type="number" min="0" step="0.01" value={form.punto_reorden} onChange={event => setForm(actual => ({ ...actual, punto_reorden:event.target.value }))}/></div>
          <div className="dx-solpe-f"><label>Stock máximo</label><input className="dx-solpe-in" type="number" min="0" step="0.01" value={form.stock_maximo} onChange={event => setForm(actual => ({ ...actual, stock_maximo:event.target.value }))}/></div>
          <div className="dx-solpe-f"><label>Stock de seguridad</label><input className="dx-solpe-in" type="number" min="0" step="0.01" value={form.stock_seguridad} onChange={event => setForm(actual => ({ ...actual, stock_seguridad:event.target.value }))}/></div>
        </div></section>
      </div>
      <div className="dx-solpe-mfoot"><span className="dx-solpe-miss">Se crea como material activo.</span><button type="button" className="dx-btn" onClick={() => setCrearAbierto(false)}>Cancelar</button><button type="button" className="dx-btn primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar y seleccionar'}</button></div>
    </section></div>}
  </>;
};

export const SolicitudesPage = ({ onNav }) => {
  const { empresaId, estado: estadoSesion, usuario } = useSesionOperativa();
  const [solpes, setSolpes] = useS2([]);
  const [pestana, setPestana] = useS2('todos');
  const [busquedaSolpe, setBusquedaSolpe] = useS2('');
  const [fechaSolpe, setFechaSolpe] = useS2('');
  const [filtroUrgencia, setFiltroUrgencia] = useS2('todas');
  const [solpeAtendiendo, setSolpeAtendiendo] = useS2(null);
  const [modalAtenderAbierto, setModalAtenderAbierto] = useS2(false);
  const [cargando, setCargando] = useS2(true);
  const [guardando, setGuardando] = useS2(false);
  const [error, setError] = useS2(null);
  const [toast, setToast] = useS2(null);
  const [formularioAbierto, setFormularioAbierto] = useS2(false);
  const [detalleAbierto, setDetalleAbierto] = useS2(null);
  const [seguimientoCompra, setSeguimientoCompra] = useS2({ ocs:[], recepciones:[], error:null });
  const [puedeCrearSolpe, setPuedeCrearSolpe] = useS2(false);
  const [puedeCrearMaterial, setPuedeCrearMaterial] = useS2(false);
  const [catalogoMateriales, setCatalogoMateriales] = useS2([]);
  const [gruposMaterial, setGruposMaterial] = useS2([]);
  const [familiasMaterial, setFamiliasMaterial] = useS2([]);
  const [subfamiliasMaterial, setSubfamiliasMaterial] = useS2([]);
  const [almacenesMaterial, setAlmacenesMaterial] = useS2([]);
  const [otsFormulario, setOtsFormulario] = useS2([]);
  const [areasFormulario, setAreasFormulario] = useS2([]);
  const [cecosFormulario, setCecosFormulario] = useS2([]);
  const [formSolpe, setFormSolpe] = useS2({ descripcion:'', tipo:'bien', prioridad:'normal', solicitante:'', centro_costo_id:'', ot_id:'', items:[nuevaLineaSolpe()] });
  const unidadesMaterial = useMemo(() => {
    const unidades = new Set((catalogoMateriales || []).map(material => String(material.unidad || '').trim()).filter(Boolean));
    unidades.add('und');
    return [...unidades].sort((a, b) => a.localeCompare(b));
  }, [catalogoMateriales]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAtender = (solpe) => {
    setSolpeAtendiendo(solpe);
    setModalAtenderAbierto(true);
  };

  const cargarSolpes = useCallback(async () => {
    if (estadoSesion !== 'listo' || !empresaId) return;
    setCargando(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: filas, error: solpesError } = await supabase
        .from('solpe_interna')
        .select('id, codigo, descripcion, tipo, prioridad, urgencia, origen, origen_tipo, origen_id, material_id, cantidad_solicitada, disponible_actual, fecha, fecha_requerida, items, solicitante, solicitante_id, ot_id, estado, aprobada_por, aprobada_at, created_at')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (solpesError) throw solpesError;

      const solpesReales = filas || [];
      const idsOt = [...new Set(solpesReales.map(solpe => solpe.ot_id).filter(Boolean))];
      const materialIdDeItem = solpe => (Array.isArray(solpe.items) ? solpe.items : [])
        .map(item => item?.material_id)
        .find(Boolean);
      const idsMaterial = [...new Set(solpesReales
        .flatMap(solpe => [solpe.material_id, materialIdDeItem(solpe)])
        .filter(Boolean))];
      const [otsResultado, materialesResultado] = await Promise.all([
        idsOt.length
          ? supabase.from('ordenes_trabajo').select('id, numero, direccion_ejecucion').eq('empresa_id', empresaId).in('id', idsOt)
          : Promise.resolve({ data: [], error: null }),
        idsMaterial.length
          ? supabase.from('materiales').select('id, codigo, descripcion, unidad').eq('empresa_id', empresaId).in('id', idsMaterial)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (otsResultado.error) throw otsResultado.error;
      if (materialesResultado.error) throw materialesResultado.error;

      const otsPorId = new Map((otsResultado.data || []).map(ot => [ot.id, ot]));
      const idsSede = [...new Set((otsResultado.data || []).map(ot => ot.direccion_ejecucion).filter(Boolean))];
      const { data: sedes, error: sedesError } = idsSede.length
        ? await supabase.from('sedes').select('id, nombre').eq('empresa_id', empresaId).in('id', idsSede)
        : { data: [], error: null };
      if (sedesError) throw sedesError;

      const sedesPorId = new Map((sedes || []).map(sede => [sede.id, sede]));
      const materialesPorId = new Map((materialesResultado.data || []).map(material => [material.id, material]));
      setSolpes(solpesReales.map(solpe => {
        const item = (Array.isArray(solpe.items) ? solpe.items : [])
          .find(candidato => candidato?.material_id || candidato?.descripcion || candidato?.nombre) || null;
        const material = materialesPorId.get(solpe.material_id || item?.material_id) || null;
        const ot = otsPorId.get(solpe.ot_id) || null;
        const direccion = ot?.direccion_ejecucion || null;
        return {
          ...solpe,
          itemCodigo: material?.codigo || item?.codigo || item?.material_codigo || null,
          descripcionVisible: solpe.descripcion || material?.descripcion || item?.descripcion || item?.nombre || 'Sin descripcion',
          cantidadVisible: solpe.cantidad_solicitada ?? item?.cantidad ?? item?.cantidad_solicitada ?? null,
          unidadVisible: material?.unidad || item?.unidad || '',
          urgenciaVisible: ['alta', 'urgente'].includes(String(solpe.urgencia || solpe.prioridad || 'normal').toLowerCase()) ? 'urgente' : 'normal',
          otNumero: ot?.numero || solpe.ot_id || null,
          ubicacion: ot ? (sedesPorId.get(direccion)?.nombre || direccion || 'Sin ubicacion') : '—',
        };
      }));
    } catch (cargaError) {
      setSolpes([]);
      setError(cargaError?.message || 'No se pudieron cargar las solicitudes SOLPE.');
    } finally {
      setCargando(false);
    }
  }, [empresaId, estadoSesion]);

  useEffect(() => { cargarSolpes(); }, [cargarSolpes]);

  const cargarDatosFormulario = useCallback(async () => {
    if (estadoSesion !== 'listo' || !empresaId) return;
    const supabase = getSupabaseClient();
    const resultados = await Promise.all([
      supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla:'solpe', target_accion:'crear' }),
      supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla:'inventario', target_accion:'crear' }),
      supabase.from('materiales').select('id,codigo,descripcion,unidad,estado,grupo_id,familia_id,subfamilia_id').eq('empresa_id', empresaId).order('codigo'),
      supabase.from('material_grupos').select('id,codigo,nombre').eq('empresa_id', empresaId).order('codigo'),
      supabase.from('material_familias').select('id,codigo,nombre,grupo_id').eq('empresa_id', empresaId).order('codigo'),
      supabase.from('material_subfamilias').select('id,codigo,nombre,familia_id').eq('empresa_id', empresaId).order('codigo'),
      supabase.from('almacenes').select('id,nombre').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('ordenes_trabajo').select('id,numero,estado').eq('empresa_id', empresaId).not('estado', 'in', '(cerrada,cancelada)').order('created_at', { ascending:false }),
      supabase.from('areas_empresa').select('id,nombre,estado').eq('empresa_id', empresaId).eq('estado','activo').order('nombre'),
      supabase.from('centros_costo').select('id,codigo,nombre,estado').eq('empresa_id', empresaId).eq('estado','activo').order('codigo'),
    ]);
    const [permisoSolpe, permisoMaterial, materiales, grupos, familias, subfamilias, almacenes, ots, areas, cecos] = resultados;
    setPuedeCrearSolpe(!permisoSolpe.error && Boolean(permisoSolpe.data));
    setPuedeCrearMaterial(!permisoMaterial.error && Boolean(permisoMaterial.data));
    if (!materiales.error) setCatalogoMateriales(materiales.data || []);
    if (!grupos.error) setGruposMaterial(grupos.data || []);
    if (!familias.error) setFamiliasMaterial(familias.data || []);
    if (!subfamilias.error) setSubfamiliasMaterial(subfamilias.data || []);
    if (!almacenes.error) setAlmacenesMaterial(almacenes.data || []);
    if (!ots.error) setOtsFormulario(ots.data || []);
    if (!areas.error) setAreasFormulario(areas.data || []);
    if (!cecos.error) setCecosFormulario(cecos.data || []);
  }, [empresaId, estadoSesion]);

  useEffect(() => { cargarDatosFormulario(); }, [cargarDatosFormulario]);

  useEffect(() => {
    if (!detalleAbierto && !modalAtenderAbierto) return undefined;
    const cerrarConEscape = evento => { if (evento.key === 'Escape') { if (modalAtenderAbierto) { if (!guardando) setModalAtenderAbierto(false); } else setDetalleAbierto(null); } };
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, [detalleAbierto, modalAtenderAbierto, guardando]);

  useEffect(() => {
    if (!detalleAbierto?.id || !empresaId) return undefined;
    let vigente = true;
    const cargarSeguimiento = async () => {
      const supabase = getSupabaseClient();
      const [{ data: ocsDirectas, error: ocsError }, { data: procesos, error: procesosError }] = await Promise.all([
        supabase.from('ordenes_compra').select('id,codigo,estado,items,solpe_id,proceso_compra_id').eq('empresa_id', empresaId).eq('solpe_id', detalleAbierto.id),
        supabase.from('procesos_compra').select('id').eq('empresa_id', empresaId).eq('solpe_id', detalleAbierto.id),
      ]);
      if (!vigente) return;
      if (ocsError || procesosError) { setSeguimientoCompra({ ocs:[], recepciones:[], error:'No tienes permiso para ver el seguimiento de compra.' }); return; }
      const idsProceso = (procesos || []).map(proceso => proceso.id);
      const { data: ocsProceso, error: ocsProcesoError } = idsProceso.length ? await supabase.from('ordenes_compra').select('id,codigo,estado,items,solpe_id,proceso_compra_id').eq('empresa_id', empresaId).in('proceso_compra_id', idsProceso) : { data:[], error:null };
      if (ocsProcesoError) { setSeguimientoCompra({ ocs:[], recepciones:[], error:'No tienes permiso para ver el seguimiento de compra.' }); return; }
      const ocs = [...(ocsDirectas || []), ...(ocsProceso || []).filter(oc => !(ocsDirectas || []).some(directa => directa.id === oc.id))];
      const idsOc = (ocs || []).map(oc => oc.id);
      const { data: recepciones, error: recepcionesError } = idsOc.length ? await supabase.from('recepciones').select('id,oc_id,estado,items_recibidos,fecha').eq('empresa_id', empresaId).in('oc_id', idsOc) : { data:[], error:null };
      if (vigente) setSeguimientoCompra({ ocs:ocs || [], recepciones:recepciones || [], error:recepcionesError ? 'No tienes permiso para ver recepciones.' : null });
    };
    cargarSeguimiento();
    return () => { vigente = false; };
  }, [detalleAbierto?.id, empresaId]);

  const confirmarAtencion = async () => {
    if (!solpeAtendiendo || solpeAtendiendo.estado !== 'solicitada') return;
    setGuardando(true);
    try {
      const supabase = getSupabaseClient();
      const { data: usuarioData, error: usuarioError } = await supabase.auth.getUser();
      if (usuarioError) throw usuarioError;
      const { data: solpeActualizada, error: actualizacionError } = await supabase
        .from('solpe_interna')
        .update({ estado: 'aprobada', aprobada_por: usuarioData?.user?.id || null, aprobada_at: new Date().toISOString() })
        .eq('id', solpeAtendiendo.id)
        .eq('estado', 'solicitada')
        .select('id, estado, aprobada_por, aprobada_at')
        .single();
      if (actualizacionError) throw actualizacionError;
      if (!solpeActualizada) throw new Error('La SOLPE ya no esta en estado solicitada. Actualiza la pantalla e intenta nuevamente.');
      setSolpes(anterior => anterior.map(solpe => solpe.id === solpeActualizada.id ? { ...solpe, ...solpeActualizada } : solpe));
      setModalAtenderAbierto(false);
      setSolpeAtendiendo(null);
      showToast(`SOLPE ${solpeActualizada.id} aprobada.`);
    } catch (atencionError) {
      setError(atencionError?.message || 'No se pudo aprobar la SOLPE.');
    } finally {
      setGuardando(false);
    }
  };

  const actualizarLinea = (lineaId, cambios) => setFormSolpe(actual => ({
    ...actual,
    items: actual.items.map(linea => linea.id === lineaId ? { ...linea, ...cambios } : linea),
  }));

  const crearSolicitud = async () => {
    if (!puedeCrearSolpe) { setError('Tu rol no tiene permiso para crear SOLPE.'); return; }
    const items = formSolpe.items.filter(linea => linea.material_id && Number(linea.cantidad) > 0).map(linea => ({
      id: linea.id,
      material_id: linea.material_id,
      material_codigo: linea.material_codigo || null,
      descripcion: linea.descripcion,
      cantidad: Number(linea.cantidad),
      unidad: linea.unidad || 'und',
      observacion: linea.observacion || '',
    }));
    if (!formSolpe.centro_costo_id || !formSolpe.descripcion.trim() || (formSolpe.tipo === 'bien' && !items.length)) {
      setError('Descripción, CECO y al menos un material con cantidad son obligatorios para una SOLPE de bienes.');
      return;
    }
    setGuardando(true); setError(null);
    try {
      const creada = await crearSolpeInterna({ empresaId, usuarioId:usuario?.id, datos:{ ...formSolpe, items } });
      setFormularioAbierto(false);
      setFormSolpe({ descripcion:'', tipo:'bien', prioridad:'normal', solicitante:'', centro_costo_id:'', ot_id:'', items:[nuevaLineaSolpe()] });
      await cargarSolpes();
      showToast(`SOLPE ${creada.codigo} creada.`);
    } catch (creacionError) {
      setError(creacionError?.message || 'No se pudo crear la SOLPE.');
    } finally { setGuardando(false); }
  };

  const normalizarSolpe = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const origenSolpe = solpe => solpe.origen_tipo === 'ot' && solpe.ot_id
    ? (solpe.otNumero || solpe.ot_id)
    : solpe.origen === 'automatico' ? 'Reorden automático' : 'Manual';
  const etiquetaEstado = estado => ({
    solicitada: ['is-amber', 'Solicitada'],
    aprobada: ['is-cyan', 'Aprobada'],
    oc_generada: ['is-green', 'OC generada'],
    borrador: ['is-gray', 'Borrador'],
  }[estado] || ['is-gray', estado || 'Sin estado']);
  const fechaDeSolpe = solpe => String(solpe.fecha || solpe.fecha_requerida || '—').slice(0, 10);
  const buscarEnSolpe = solpe => normalizarSolpe([
    solpe.codigo, solpe.descripcionVisible, solpe.itemCodigo, solpe.solicitante,
    origenSolpe(solpe), solpe.origen === 'automatico' ? 'Stock mínimo' : solpe.ubicacion, fechaDeSolpe(solpe), etiquetaEstado(solpe.estado)[1],
    solpe.urgenciaVisible, ...(Array.isArray(solpe.items) ? solpe.items.flatMap(item => [item?.descripcion, item?.nombre, item?.codigo, item?.material_codigo]) : []),
  ].filter(Boolean).join(' '));
  const terminosSolpe = normalizarSolpe(busquedaSolpe).split(/\s+/).filter(Boolean);
  const baseFiltrada = solpes.filter(solpe => (pestana === 'todos' || solpe.estado === pestana)
    && (!fechaSolpe || fechaDeSolpe(solpe) === fechaSolpe)
    && terminosSolpe.every(termino => buscarEnSolpe(solpe).includes(termino)));
  const solpesVisibles = baseFiltrada.filter(solpe => filtroUrgencia === 'todas' || solpe.urgenciaVisible === (filtroUrgencia === 'urgentes' ? 'urgente' : 'normal'));
  const conteoEstado = estado => solpes.filter(solpe => solpe.estado === estado).length;
  const filasEstado = [
    ['todos', 'Todos', solpes.length], ['solicitada', 'Solicitada', conteoEstado('solicitada')],
    ['aprobada', 'Aprobada', conteoEstado('aprobada')], ['oc_generada', 'OC generada', conteoEstado('oc_generada')],
  ];
  const textoVacio = error && solpes.length > 0 ? solpesVisibles.length === 0 ? 'No hay solicitudes con estos filtros.' : ''
    : cargando ? 'Cargando solicitudes SOLPE...'
    : solpes.length === 0 ? error || 'Aún no hay solicitudes SOLPE. Crea la primera con «Nueva SOLPE».'
    : solpesVisibles.length === 0 ? 'No hay solicitudes con estos filtros.' : '';
  const resumenSolpe = [
    [conteoEstado('solicitada'), 'por atender'],
    [solpes.filter(solpe => solpe.estado === 'solicitada' && solpe.urgenciaVisible === 'urgente').length, 'urgentes por atender'],
    [conteoEstado('aprobada'), 'aprobadas'], [conteoEstado('oc_generada'), 'con OC generada'],
  ];
  const fmtFecha = valor => valor ? String(valor).slice(0, 10) : '—';
  const detenerFila = evento => evento.stopPropagation();
  const tipoEtiqueta = tipo => tipo === 'servicio' ? 'Servicio' : tipo === 'bien' ? 'Bien' : tipo || '';
  const detalleItems = detalleAbierto?.items?.length ? detalleAbierto.items : [{
    material_codigo: detalleAbierto?.itemCodigo, descripcion: detalleAbierto?.descripcionVisible,
    cantidad: detalleAbierto?.cantidadVisible, unidad: detalleAbierto?.unidadVisible, observacion: '',
  }];
  return (
    <section className="dx-ui dx-solpe">
      {!formularioAbierto && <>
        <header className="dx-solpe-head">
          <div><div className="dx-ui-eyebrow">Almacén y repuestos</div><h1 className="dx-ui-title">Solicitudes SOLPE</h1><p className="dx-ui-sub">Pedidos desde mina y taller — para pasar a compras</p></div>
          <div className="dx-solpe-actions"><button type="button" className="dx-btn primary" disabled={!puedeCrearSolpe} onClick={() => { setError(null); setFormularioAbierto(true); }}><Icon name="plus" size={15}/> Nueva SOLPE</button></div>
        </header>
        <div className="dx-ui-summary" aria-label="Resumen de solicitudes">{resumenSolpe.map(([cantidad, etiqueta]) => <div className="dx-ui-chip" key={etiqueta}><b>{cantidad}</b><span>{etiqueta}</span></div>)}</div>
        <div className="dx-ui-tabs" role="group" aria-label="Estado de la solicitud">{filasEstado.map(([estado, etiqueta, cantidad]) => <button key={estado} type="button" className={`dx-ui-tab${pestana === estado ? ' on' : ''}`} aria-pressed={pestana === estado} onClick={() => setPestana(estado)}>{etiqueta} · {cantidad}</button>)}</div>
        {error && solpes.length > 0 && <div className="dx-solpe-error dx-solpe-list-error" role="alert">{error}</div>}
        <div className="dx-ui-card dx-solpe-list-card">
          <div className="dx-ui-toolbar"><h2>Solicitudes</h2><span className="dx-ui-count">{cargando ? '0 solicitudes' : solpesVisibles.length === solpes.length ? `${solpes.length} solicitudes` : `${solpesVisibles.length} de ${solpes.length} solicitudes`}</span>
            <label className="dx-ui-search"><span aria-hidden="true"><Icon name="search" size={16}/></span><input type="search" aria-label="Buscar solicitud" placeholder="Código, material, solicitante, OT o ubicación" value={busquedaSolpe} onChange={evento => setBusquedaSolpe(evento.target.value)}/></label>
            <label className="dx-solpe-datef" title="Fecha exacta"><span aria-hidden="true"><Icon name="calendar" size={16}/></span><input type="date" aria-label="Filtrar por fecha exacta" value={fechaSolpe} onChange={evento => setFechaSolpe(evento.target.value)}/>{fechaSolpe && <button type="button" aria-label="Quitar fecha" onClick={() => setFechaSolpe('')}><Icon name="x" size={12}/></button>}</label>
          </div>
          <div className="dx-solpe-filters" role="group" aria-label="Filtrar por urgencia">{[
            ['todas', 'Todas', baseFiltrada.length],
            ['urgentes', 'Urgentes', baseFiltrada.filter(solpe => solpe.urgenciaVisible === 'urgente').length],
            ['normales', 'Normales', baseFiltrada.filter(solpe => solpe.urgenciaVisible !== 'urgente').length],
          ].map(([clave, etiqueta, cantidad]) => <button key={clave} type="button" className={`dx-solpe-chipbtn${filtroUrgencia === clave ? ' on' : ''}`} aria-pressed={filtroUrgencia === clave} onClick={() => setFiltroUrgencia(clave)}>{etiqueta} <b>{cantidad}</b></button>)}</div>
          <div className="dx-ui-head dx-solpe-cols" aria-hidden="true"><span>Solicitud</span><span>Cant.</span><span>Origen</span><span>Fecha</span><span>Estado</span><span/></div>
          {textoVacio && <div className={`dx-ui-empty${error && solpes.length === 0 ? ' dx-solpe-error' : ''}`} role={error && solpes.length === 0 ? 'alert' : undefined}>{textoVacio}</div>}
          {!textoVacio && solpesVisibles.map(solpe => {
            const [estadoClase, estadoTexto] = etiquetaEstado(solpe.estado);
            const urgente = solpe.urgenciaVisible === 'urgente';
            const origen = origenSolpe(solpe);
            const fecha = fechaDeSolpe(solpe);
            const cantidad = solpe.cantidadVisible ?? '—';
            const abrirDetalle = () => { setSeguimientoCompra({ ocs:[], recepciones:[], error:null }); setDetalleAbierto(solpe); };
            return <div key={solpe.id} className="dx-ui-row dx-solpe-cols" role="button" tabIndex={0} aria-label={`Ver SOLPE ${solpe.codigo || solpe.id}: ${solpe.descripcionVisible}`} onClick={abrirDetalle} onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrirDetalle(); } }}>
              <div className="dx-solpe-main dx-solpe-c-main"><span className={`dx-ui-icon ${urgente ? 'is-red' : 'is-cyan'}`} aria-hidden="true"><Icon name="box" size={17}/></span><span><b>{solpe.descripcionVisible}</b><span className="dx-solpe-sub"><span className="dx-solpe-code">{solpe.codigo || solpe.itemCodigo || '—'}{solpe.itemCodigo && solpe.codigo ? ` · ${solpe.itemCodigo}` : ''}</span>{urgente && <span className="dx-solpe-flag">Urgente</span>}<span className="dx-solpe-by">{solpe.solicitante ? `· ${solpe.solicitante}` : ''}</span></span></span></div>
              <div className="dx-solpe-cell dx-solpe-c-qty"><span className="dx-solpe-lbl">Cantidad</span><span className="dx-solpe-qty">{cantidad}<small>{solpe.unidadVisible}</small></span></div>
              <div className="dx-solpe-cell dx-solpe-org dx-solpe-c-org"><span className="dx-solpe-lbl">Origen</span>{solpe.origen_tipo === 'ot' && solpe.ot_id ? <><button type="button" className="dx-solpe-ot" aria-label={`Abrir orden de trabajo ${solpe.otNumero || solpe.ot_id}`} onClick={evento => { detenerFila(evento); if (onNav) onNav('ots'); }}>{solpe.otNumero || solpe.ot_id}</button><small>{solpe.ubicacion || 'Orden de trabajo'}</small></> : <><b className="dx-solpe-plain">{origen}</b><small>{solpe.origen === 'automatico' ? 'Stock mínimo' : solpe.ubicacion && solpe.ubicacion !== '—' ? solpe.ubicacion : 'Manual'}</small></>}</div>
              <div className="dx-solpe-cell dx-solpe-c-date"><span className="dx-solpe-lbl">Fecha</span><span className="dx-solpe-date">{fecha}</span></div>
              <div className="dx-solpe-cell dx-solpe-c-st"><span className="dx-solpe-lbl">Estado</span><span className={`dx-ui-pill ${estadoClase}`}><i/>{estadoTexto}</span></div>
              <div className="dx-solpe-act dx-solpe-c-act">{solpe.estado === 'solicitada' && <button type="button" className="dx-btn primary dx-solpe-btn-sm" aria-label={`Atender ${solpe.codigo || solpe.id}`} onClick={evento => { detenerFila(evento); handleAtender(solpe); }}>Atender</button>}<button type="button" className="dx-btn dx-solpe-btn-sm dx-solpe-btn-ghost" aria-label={`Ver ${solpe.codigo || solpe.id}`} onClick={evento => { detenerFila(evento); abrirDetalle(); }}>Ver</button></div>
            </div>;
          })}
        </div>
      </>}

      {formularioAbierto && <>
        <button type="button" className="dx-solpe-back" onClick={() => { setError(null); setFormularioAbierto(false); }}><span aria-hidden="true"><Icon name="back" size={16}/></span> Volver a solicitudes</button>
        <header className="dx-solpe-head"><div><div className="dx-ui-eyebrow">Almacén y repuestos</div><h1 className="dx-ui-title">Nueva SOLPE</h1><p className="dx-ui-sub">Solicitud para seguimiento por Compras</p></div></header>
        <div className="dx-ui-card dx-solpe-form-card">
          {error && <div className="dx-solpe-form-error" role="alert">{error}</div>}
          <section className="dx-solpe-sec"><div className="dx-solpe-sech"><span className="dx-solpe-num">1</span><h3>Necesidad</h3></div><div className="dx-solpe-grid"><div className="dx-solpe-f dx-solpe-full"><label>Descripción de la necesidad</label><textarea className="dx-solpe-in" rows={3} value={formSolpe.descripcion} onChange={evento => setFormSolpe(actual => ({ ...actual, descripcion:evento.target.value }))} placeholder="Ej. Repuestos para la cabecera de la línea B"/></div></div></section>
          <section className="dx-solpe-sec"><div className="dx-solpe-sech"><span className="dx-solpe-num">2</span><h3>Ítems solicitados</h3><button type="button" className="dx-btn sm" onClick={() => setFormSolpe(actual => ({ ...actual, items:[...actual.items, nuevaLineaSolpe()] }))}><Icon name="plus" size={13}/> Agregar ítem</button></div>
            <div className="dx-solpe-lines-head dx-solpe-lines"><span>Material</span><span>Cantidad</span><span>Unidad</span><span>Observación</span><span/></div>
            {formSolpe.items.map(linea => <div key={linea.id} className="dx-solpe-lines dx-solpe-line">
              <div className="dx-solpe-pop"><span className="dx-solpe-mlabel">Material</span><SelectorMaterialSolpe item={linea} materiales={catalogoMateriales} puedeCrearMaterial={puedeCrearMaterial} empresaId={empresaId} usuarioId={usuario?.id} grupos={gruposMaterial} familias={familiasMaterial} subfamilias={subfamiliasMaterial} almacenes={almacenesMaterial} unidadesMedida={unidadesMaterial} onSelect={cambios => actualizarLinea(linea.id, cambios)}/></div>
              <div className="dx-solpe-f"><span className="dx-solpe-mlabel">Cantidad</span><input aria-label="Cantidad" className="dx-solpe-in" type="number" min="0" step="any" value={linea.cantidad} onChange={evento => actualizarLinea(linea.id, { cantidad:evento.target.value })}/></div>
              <div className="dx-solpe-f"><span className="dx-solpe-mlabel">Unidad</span><select aria-label="Unidad" className="dx-solpe-in" value={linea.unidad} onChange={evento => actualizarLinea(linea.id, { unidad:evento.target.value })}>{unidadesMaterial.map(unidad => <option key={unidad} value={unidad}>{unidad}</option>)}</select></div>
              <div className="dx-solpe-f dx-solpe-observacion"><span className="dx-solpe-mlabel">Observación</span><input aria-label="Observación" className="dx-solpe-in" value={linea.observacion} onChange={evento => actualizarLinea(linea.id, { observacion:evento.target.value })} placeholder="Opcional"/></div>
              <button type="button" className="dx-solpe-rm" aria-label="Quitar ítem" onClick={() => setFormSolpe(actual => ({ ...actual, items:actual.items.filter(item => item.id !== linea.id) }))}><Icon name="x" size={16}/></button>
            </div>)}
            {!puedeCrearMaterial && <p className="dx-solpe-helper">Tu rol puede seleccionar materiales existentes, pero no crear materiales nuevos.</p>}
          </section>
          <section className="dx-solpe-sec"><div className="dx-solpe-sech"><span className="dx-solpe-num">3</span><h3>Datos de la solicitud</h3></div><div className="dx-solpe-grid">
            <div className="dx-solpe-f"><label>Tipo</label><div className="dx-solpe-segb" role="group" aria-label="Tipo"><button type="button" className={formSolpe.tipo === 'bien' ? 'on' : ''} aria-pressed={formSolpe.tipo === 'bien'} onClick={() => setFormSolpe(actual => ({ ...actual, tipo:'bien' }))}>Bien</button><button type="button" className={formSolpe.tipo === 'servicio' ? 'on' : ''} aria-pressed={formSolpe.tipo === 'servicio'} onClick={() => setFormSolpe(actual => ({ ...actual, tipo:'servicio' }))}>Servicio</button></div></div>
            <div className="dx-solpe-f"><label>Urgencia</label><div className="dx-solpe-segb" role="group" aria-label="Urgencia"><button type="button" className={formSolpe.prioridad === 'normal' ? 'on' : ''} aria-pressed={formSolpe.prioridad === 'normal'} onClick={() => setFormSolpe(actual => ({ ...actual, prioridad:'normal' }))}>Normal</button><button type="button" className={formSolpe.prioridad === 'urgente' ? 'on is-red' : ''} aria-pressed={formSolpe.prioridad === 'urgente'} onClick={() => setFormSolpe(actual => ({ ...actual, prioridad:'urgente' }))}>Urgente</button><button type="button" className={formSolpe.prioridad === 'critica' ? 'on is-red' : ''} aria-pressed={formSolpe.prioridad === 'critica'} onClick={() => setFormSolpe(actual => ({ ...actual, prioridad:'critica' }))}>Crítica</button></div></div>
            <div className="dx-solpe-f"><label>Área solicitante</label><select className="dx-solpe-in" value={formSolpe.solicitante} onChange={evento => setFormSolpe(actual => ({ ...actual, solicitante:evento.target.value }))}><option value="">Seleccionar...</option>{areasFormulario.map(area => <option key={area.id} value={area.nombre}>{area.nombre}</option>)}</select></div>
            <div className="dx-solpe-f"><label>OT asociada</label><select className="dx-solpe-in" value={formSolpe.ot_id} onChange={evento => setFormSolpe(actual => ({ ...actual, ot_id:evento.target.value }))}><option value="">Sin OT</option>{otsFormulario.map(ot => <option key={ot.id} value={ot.id}>{ot.numero || ot.id}</option>)}</select></div>
            <div className="dx-solpe-f dx-solpe-full"><label>Centro de costo (CECO)</label><select className="dx-solpe-in" value={formSolpe.centro_costo_id} onChange={evento => setFormSolpe(actual => ({ ...actual, centro_costo_id:evento.target.value }))}><option value="">Seleccionar...</option>{cecosFormulario.map(ceco => <option key={ceco.id} value={ceco.id}>{ceco.codigo} - {ceco.nombre}</option>)}</select></div>
          </div></section>
          <div className="dx-solpe-foot"><span className="dx-solpe-miss">{!formSolpe.descripcion.trim() ? 'Falta: descripción.' : formSolpe.tipo === 'bien' && !formSolpe.items.some(item => item.material_id && Number(item.cantidad) > 0) ? 'Falta: un material con cantidad.' : !formSolpe.centro_costo_id ? 'Falta: CECO.' : 'Todo listo para crear la solicitud.'}</span><button type="button" className="dx-btn" onClick={() => { setError(null); setFormularioAbierto(false); }}>Cancelar</button><button type="button" className="dx-btn primary" disabled={guardando} onClick={crearSolicitud}>{guardando ? 'Creando...' : 'Crear SOLPE'}</button></div>
        </div>
      </>}

      {toast && <div className="dx-solpe-toast" role="status"><span aria-hidden="true"><Icon name="check" size={18}/></span>{toast}</div>}
      {detalleAbierto && <div className="dx-solpe-scrim dx-solpe-scrim-detail" onMouseDown={evento => { if (evento.target === evento.currentTarget) setDetalleAbierto(null); }}><section className="dx-solpe-modal" role="dialog" aria-modal="true" aria-label={`Detalle de SOLPE ${detalleAbierto.codigo || detalleAbierto.id}`}>
        <div className="dx-solpe-mhead"><div><div className="dx-ui-eyebrow">Detalle de SOLPE</div><h2>{detalleAbierto.codigo || detalleAbierto.id}</h2></div><div className="dx-solpe-mhead-tags"><span className={`dx-ui-pill ${etiquetaEstado(detalleAbierto.estado)[0]}`}><i/>{etiquetaEstado(detalleAbierto.estado)[1]}</span>{detalleAbierto.urgenciaVisible === 'urgente' && <span className="dx-ui-pill is-red"><i/>Urgente</span>}</div><button type="button" className="dx-solpe-x" aria-label="Cerrar" onClick={() => setDetalleAbierto(null)}><Icon name="x" size={18}/></button></div>
        <div className="dx-solpe-mbody">
          <div className="dx-solpe-meta">
            {detalleAbierto.solicitante && <div><small>Solicitante</small><span>{detalleAbierto.solicitante}</span></div>}
            {(detalleAbierto.otNumero || detalleAbierto.origen) && <div><small>Origen</small><span>{origenSolpe(detalleAbierto)}</span></div>}
            {detalleAbierto.ubicacion && detalleAbierto.ubicacion !== '—' && <div><small>Ubicación</small><span>{detalleAbierto.ubicacion}</span></div>}
            {(detalleAbierto.fecha || detalleAbierto.fecha_requerida) && <div><small>Fecha</small><span>{fmtFecha(detalleAbierto.fecha || detalleAbierto.fecha_requerida)}</span></div>}
            {detalleAbierto.tipo && <div><small>Tipo</small><span>{tipoEtiqueta(detalleAbierto.tipo)}</span></div>}
            {detalleAbierto.ceco && <div><small>CECO</small><span>{detalleAbierto.ceco}</span></div>}
          </div>
          <div><span className="dx-solpe-h">Descripción</span><p className="dx-solpe-desc">{detalleAbierto.descripcionVisible}</p></div>
          <div><span className="dx-solpe-h">Ítems solicitados</span><div className="dx-solpe-box"><div className="dx-ui-head dx-solpe-items" aria-hidden="true"><span>Material</span><span>Cantidad</span><span>Unidad</span><span>Observación</span></div>
            {detalleItems.map((item, index) => <div className="dx-ui-row dx-solpe-items" key={item.id || index}><div className="dx-solpe-it-main"><b>{item.descripcion || item.nombre || '—'}</b><div className="dx-solpe-code">{item.material_codigo || item.codigo || (index === 0 ? detalleAbierto.itemCodigo : '') || '—'}</div></div><div className="dx-solpe-qty">{item.cantidad ?? item.cantidad_solicitada ?? (index === 0 ? detalleAbierto.cantidadVisible : null) ?? '—'}</div><div>{item.unidad || (index === 0 ? detalleAbierto.unidadVisible : '') || '—'}</div><div className="dx-solpe-item-obs">{item.observacion || '—'}</div></div>)}
          </div></div>
          <div><span className="dx-solpe-h">Seguimiento de compra</span><ol className="dx-solpe-steps">{[
            ['Solicitada', ['solicitada', 'aprobada', 'oc_generada'].includes(detalleAbierto.estado)],
            ['Aprobada', ['aprobada', 'oc_generada'].includes(detalleAbierto.estado)],
            ['OC generada', detalleAbierto.estado === 'oc_generada' || seguimientoCompra.ocs.length > 0],
            ['Recibida', seguimientoCompra.recepciones.length > 0],
          ].map(([etiqueta, activo]) => <li key={etiqueta} className={activo ? 'on' : ''}>{etiqueta}</li>)}</ol>
            {seguimientoCompra.error ? <div className="dx-solpe-error" role="alert">{seguimientoCompra.error}</div> : seguimientoCompra.ocs.length ? <div className="dx-solpe-box"><div className="dx-ui-head dx-solpe-oc-cols"><span>OC</span><span>Estado</span><span>Recepciones</span></div>{seguimientoCompra.ocs.map(oc => <div className="dx-ui-row dx-solpe-oc-cols" key={oc.id}><span>{oc.codigo || oc.id}</span><span>{oc.estado || '—'}</span><span>{seguimientoCompra.recepciones.filter(recepcion => recepcion.oc_id === oc.id).length}</span></div>)}</div> : <p className="dx-solpe-seg">Sin OC vinculada todavía.</p>}
          </div>
        </div>
        <div className="dx-solpe-mfoot"><button type="button" className="dx-btn" onClick={() => setDetalleAbierto(null)}>Cerrar</button>{detalleAbierto.estado === 'solicitada' && <button type="button" className="dx-btn primary" onClick={() => { setSolpeAtendiendo(detalleAbierto); setDetalleAbierto(null); setModalAtenderAbierto(true); }}>Atender</button>}</div>
      </section></div>}
      {modalAtenderAbierto && solpeAtendiendo && <div className="dx-solpe-scrim dx-solpe-scrim-attend" onMouseDown={evento => { if (evento.target === evento.currentTarget && !guardando) setModalAtenderAbierto(false); }}><section className="dx-solpe-modal dx-solpe-sm" role="dialog" aria-modal="true" aria-label={`Atender SOLPE ${solpeAtendiendo.codigo || solpeAtendiendo.id}`}>
        <div className="dx-solpe-mhead"><div><div className="dx-ui-eyebrow">Atender SOLPE</div><h2>{solpeAtendiendo.codigo || solpeAtendiendo.id}</h2></div><button type="button" className="dx-solpe-x" aria-label="Cerrar" onClick={() => setModalAtenderAbierto(false)}><Icon name="x" size={18}/></button></div>
        <div className="dx-solpe-mbody"><div className="dx-solpe-sum"><b>{solpeAtendiendo.descripcionVisible}</b><span className="dx-solpe-code">{solpeAtendiendo.itemCodigo || '—'} · {solpeAtendiendo.cantidadVisible ?? '—'} {solpeAtendiendo.unidadVisible}</span></div><p className="dx-solpe-note"><Icon name="alert" size={16}/><span>Atender aprueba la SOLPE y registra quién la aprobó. Despachar y generar la OC se gestionan en flujos separados.</span></p></div>
        <div className="dx-solpe-mfoot"><button type="button" className="dx-btn" onClick={() => setModalAtenderAbierto(false)} disabled={guardando}>Cancelar</button><button type="button" className="dx-btn primary" onClick={confirmarAtencion} disabled={guardando}>{guardando ? 'Aprobando...' : 'Aprobar SOLPE'}</button></div>
      </section></div>}
      <FooterBrand/>
    </section>
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
  
