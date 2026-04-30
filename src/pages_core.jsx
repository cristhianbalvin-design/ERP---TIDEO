import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';

// Dashboard, CRM screens

function Dashboard({ role }) {
  const { financiamientos, navigate } = useApp();
  const canFin = role.permisos.ver_finanzas || role.permisos.todo;
  const isSuperadmin = role.permisos.plataforma;

  const kpis = [
    { label: 'Leads este mes', val: '24', delta: '+12%', up: true, icon: I.target, color: 'cyan' },
    { label: 'Oportunidades activas', val: money(185000), delta: '+8%', up: true, icon: I.pipe, color: 'purple' },
    { label: 'Ventas del mes', val: money(342000), delta: '+15%', up: true, icon: I.dollar, color: 'green', fin: true },
    { label: 'OTs activas', val: '12', sub: '3 en riesgo SLA', icon: I.wrench, color: 'orange' },
    { label: 'Facturación del mes', val: money(298000), delta: '+6%', up: true, icon: I.receipt, color: 'cyan', fin: true },
    { label: 'Pendiente por cobrar', val: money(172900), sub: 'S/ 51.3K vencido', icon: I.dollar, color: 'danger', fin: true },
  ].filter(k => !k.fin || canFin);

  const healthDist = {
    verde:    MOCK.healthScoresDetalle.filter(h => h.semaforo === 'verde').length,
    amarillo: MOCK.healthScoresDetalle.filter(h => h.semaforo === 'amarillo').length,
    rojo:     MOCK.healthScoresDetalle.filter(h => h.semaforo === 'rojo').length,
  };
  const atRisk = MOCK.healthScoresDetalle
    .filter(h => h.score_total < 50)
    .map(h => ({ ...h, nombre: MOCK.cuentas.find(c => c.id === h.cuenta_id)?.razon_social || h.cuenta_id }));
  const cuentaNombre = id => MOCK.cuentas.find(c => c.id === id)?.razon_social || id;
  const upcomingRenovaciones = [...(MOCK.renovaciones || [])]
    .sort((a, b) => a.dias_restantes - b.dias_restantes)
    .slice(0, 3);
  const deudaPorVencer = (financiamientos || []).filter(f => {
    const cuota = (f.tabla_amortizacion || []).find(c => c.estado === 'pendiente');
    if (!cuota || f.estado !== 'vigente') return false;
    const dias = Math.ceil((new Date(cuota.fecha + 'T00:00:00') - new Date('2026-04-28T00:00:00')) / 86400000);
    return dias >= 0 && dias <= 7;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard General</h1>
          <div className="page-sub">Vista consolidada — {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtrar período</button>
          <button className="btn btn-secondary">{I.download} Exportar</button>
        </div>
      </div>

      {isSuperadmin && (
        <div className="card" style={{padding:16, marginBottom:20, background:'linear-gradient(135deg, rgba(0,188,212,0.08), transparent)', borderColor:'rgba(0,188,212,0.3)'}}>
          <div className="row" style={{gap:12}}>
            <div className="kpi-icon cyan" style={{position:'static'}}>{I.shield}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700, fontFamily:'Sora'}}>Vista Superadmin TIDEO</div>
              <div className="text-muted" style={{fontSize:12}}>Acceso a panel de plataforma multitenant. Gestionando 2 empresas activas.</div>
            </div>
            <span className="badge badge-cyan"><span className="dot" style={{background:'currentColor'}}/>2 tenants</span>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <div key={i} className="kpi-card hover-raise">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.val}</div>
            {k.delta && <div className={'kpi-delta ' + (k.up ? 'up' : 'down')}>{k.up ? I.arrowUp : I.arrowDown}{k.delta} vs mes anterior</div>}
            {k.sub && <div className="kpi-delta" style={{color: k.color === 'danger' ? 'var(--danger)' : 'var(--fg-muted)'}}>{k.sub}</div>}
            <div className={'kpi-icon ' + k.color}>{k.icon}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Ventas vs Costos — Últimos 6 meses</h3>
            <span className="badge badge-cyan">Margen prom. 37%</span>
          </div>
          <div className="card-body">
            <BarsChart/>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>OTs por estado</h3></div>
          <div className="card-body">
            <DonutChart/>
            <div className="col mt-4" style={{gap:6}}>
              {[
                {l:'Programadas', v:4, c:'var(--cyan)'},
                {l:'En ejecución', v:5, c:'var(--orange)'},
                {l:'Cerradas técnicas', v:2, c:'var(--purple)'},
                {l:'Facturadas', v:3, c:'var(--green)'},
              ].map((x,i) => (
                <div key={i} className="row" style={{justifyContent:'space-between', fontSize:12}}>
                  <span className="row" style={{gap:6}}><span style={{width:8,height:8,borderRadius:999,background:x.c}}/>{x.l}</span>
                  <strong>{x.v}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2 mt-6">
        {deudaPorVencer.length > 0 && (
          <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
            <div className="card-head"><h3>Cuotas por vencer</h3><button className="btn btn-secondary btn-sm" onClick={() => navigate('financiamiento')}>Ver deuda</button></div>
            <div className="card-body">
              {deudaPorVencer.map(f => {
                const cuota = (f.tabla_amortizacion || []).find(c => c.estado === 'pendiente');
                const dias = Math.ceil((new Date(cuota.fecha + 'T00:00:00') - new Date('2026-04-28T00:00:00')) / 86400000);
                return (
                  <div key={f.id} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:'13px' }}>
                    <span>{f.entidad}</span>
                    <span style={{ fontWeight:600 }}>{moneyD(cuota.total)}</span>
                    <span style={{ color:'var(--orange)' }}>Vence en {dias} días</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-head">
            <h3>Alertas operativas</h3>
            <span className="text-muted" style={{fontSize:12}}>Prioridad alta</span>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>OT</th><th>Cliente</th><th>SLA</th><th>Responsable</th></tr></thead>
              <tbody>
                {MOCK.ots.filter(o => o.estado === 'ejecucion' || o.sla === 'vencido').slice(0,4).map(o => (
                  <tr key={o.id}>
                    <td className="mono">{o.id}</td>
                    <td>{o.cliente}</td>
                    <td><span className={'badge ' + (o.sla==='vencido'?'badge-red':o.sla==='riesgo'?'badge-orange':'badge-green')}>{o.sla==='vencido'?'Vencido':o.sla==='riesgo'?'En riesgo':'En plazo'}</span></td>
                    <td className="text-muted">{o.responsable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Pendientes desde campo</h3>
            <span className="badge badge-cyan">2 por revisar</span>
          </div>
          <div className="card-body col" style={{gap:10}}>
            {MOCK.compras.filter(c => c.campo).map(c => (
              <div key={c.id} className="row" style={{gap:12, padding:10, border:'1px solid var(--border)', borderRadius:8}}>
                <div className="kpi-icon cyan" style={{position:'static',width:34,height:34}}>{I.camera}</div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:13}}>Compra {c.id} · {c.proveedor}</div>
                  <div className="text-muted" style={{fontSize:12}}>{c.ot} · {money(c.monto)}</div>
                </div>
                <span className="badge badge-cyan">Desde campo</span>
              </div>
            ))}
            <div style={{padding:10, border:'1px dashed var(--border)', borderRadius:8, fontSize:12, color:'var(--fg-muted)', textAlign:'center'}}>
              3 partes diarios pendientes de aprobación del supervisor
            </div>
          </div>
        </div>
      </div>

      {/* ── F3: Customer Success Overview ────────────────────────── */}
      <div className="grid-2 mt-6">
        <div className="card">
          <div className="card-head">
            <h3>Customer Health Portfolio</h3>
            <span className="badge badge-purple" style={{fontSize:10}}>F3 · Customer Success</span>
          </div>
          <div className="card-body">
            <div className="row" style={{gap:8, marginBottom:16, justifyContent:'space-around'}}>
              {[
                { label:'Saludable', count: healthDist.verde,    color:'var(--green)',   cls:'health-green' },
                { label:'Observación',count: healthDist.amarillo, color:'var(--warning)', cls:'health-orange' },
                { label:'Crítico',   count: healthDist.rojo,     color:'var(--danger)',  cls:'health-red' },
              ].map((s, i) => (
                <div key={i} style={{textAlign:'center'}}>
                  <div style={{fontSize:34, fontWeight:800, color:s.color, lineHeight:1}}>{s.count}</div>
                  <div style={{fontSize:11, color:'var(--fg-subtle)', marginTop:4}}>{s.label}</div>
                </div>
              ))}
            </div>
            {atRisk.length > 0 && (
              <div className="col" style={{gap:8}}>
                <div style={{fontSize:11, color:'var(--fg-subtle)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2}}>Clientes en riesgo</div>
                {atRisk.map((h, i) => (
                  <div key={i} className="row" style={{gap:10, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8}}>
                    <span className={'health-dot health-' + (h.score_total < 40 ? 'red' : 'orange')}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:600}}>{h.nombre}</div>
                      <div className="text-muted" style={{fontSize:11}}>Score {h.score_total} · {h.tendencia}</div>
                    </div>
                    <span className={'badge ' + (h.score_total < 40 ? 'badge-red' : 'badge-yellow')}>{h.semaforo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Renovaciones próximas</h3>
            <span className="badge badge-cyan" style={{fontSize:10}}>{upcomingRenovaciones.length} pendientes</span>
          </div>
          <div className="card-body col" style={{gap:10}}>
            {upcomingRenovaciones.map((r, i) => (
              <div key={i} className="row" style={{gap:12, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:13}}>{cuentaNombre(r.cuenta_id)}</div>
                  <div className="text-muted" style={{fontSize:11}}>{r.servicio} · {money(r.monto_contrato)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <span className={'badge ' + (r.dias_restantes <= 30 ? 'badge-red' : r.dias_restantes <= 60 ? 'badge-yellow' : 'badge-green')}>
                    {r.dias_restantes}d
                  </span>
                  <div style={{fontSize:10, color:'var(--fg-muted)', marginTop:2}}>{r.fecha_vencimiento}</div>
                </div>
              </div>
            ))}
            {upcomingRenovaciones.length === 0 && (
              <div className="text-muted" style={{textAlign:'center', padding:16, fontSize:13}}>Sin renovaciones próximas.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Simple bar/donut charts
function BarsChart() {
  const data = [
    { m:'Nov', v:280, c:180 }, { m:'Dic', v:320, c:200 },
    { m:'Ene', v:260, c:175 }, { m:'Feb', v:310, c:195 },
    { m:'Mar', v:355, c:220 }, { m:'Abr', v:342, c:216 },
  ];
  const max = 400;
  return (
    <svg viewBox="0 0 600 240" width="100%" height="240">
      {[0, 100, 200, 300, 400].map((y, i) => (
        <g key={i}>
          <line x1="40" y1={220 - y/max*200} x2="590" y2={220 - y/max*200} stroke="var(--border-subtle)"/>
          <text x="32" y={224 - y/max*200} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">{y}K</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = 70 + i * 90;
        return (
          <g key={i}>
            <rect x={x} y={220 - d.v/max*200} width="28" height={d.v/max*200} fill="var(--cyan)" rx="2"/>
            <rect x={x+32} y={220 - d.c/max*200} width="28" height={d.c/max*200} fill="var(--navy)" opacity="0.6" rx="2"/>
            <text x={x+30} y="234" textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{d.m}</text>
          </g>
        );
      })}
      <g transform="translate(420, 10)">
        <rect x="0" y="0" width="10" height="10" fill="var(--cyan)" rx="2"/>
        <text x="16" y="9" fontSize="11" fill="var(--fg)">Ventas</text>
        <rect x="70" y="0" width="10" height="10" fill="var(--navy)" opacity="0.6" rx="2"/>
        <text x="86" y="9" fontSize="11" fill="var(--fg)">Costos</text>
      </g>
    </svg>
  );
}

function DonutChart() {
  const segs = [
    { v: 4, c: 'var(--cyan)' },
    { v: 5, c: 'var(--orange)' },
    { v: 2, c: 'var(--purple)' },
    { v: 3, c: 'var(--green)' },
  ];
  const total = segs.reduce((s, x) => s + x.v, 0);
  let offset = 0;
  const R = 60, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 180 180" width="100%" height="180">
      <g transform="translate(90 90) rotate(-90)">
        {segs.map((s, i) => {
          const len = (s.v / total) * C;
          const el = <circle key={i} r={R} cx="0" cy="0" fill="none" stroke={s.c} strokeWidth="22" strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-offset}/>;
          offset += len;
          return el;
        })}
      </g>
      <text x="90" y="85" textAnchor="middle" fontFamily="Sora" fontWeight="700" fontSize="28" fill="var(--fg)">{total}</text>
      <text x="90" y="105" textAnchor="middle" fontSize="11" fill="var(--fg-muted)">OTs activas</text>
    </svg>
  );
}

// ============ LEADS KANBAN ============
function Leads() {
  const { leads, setLeads, crearLead, updateLeadState, convertirLead, descartarLead, navigate, usuarios, empresa, searchQuery } = useApp();
  const [view, setView] = useState('kanban');
  
  const query = searchQuery.toLowerCase();
  const filteredLeads = leads.filter(l => 
    l.nombre.toLowerCase().includes(query) ||
    l.empresa_contacto.toLowerCase().includes(query) ||
    (l.necesidad || '').toLowerCase().includes(query)
  );
  const [sel, setSel] = useState(null);
  const [modalConvertir, setModalConvertir] = useState(null);
  const [modalDescartar, setModalDescartar] = useState(null);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const formNuevoBase = { nombre:'', cargo:'', empresa_contacto:'', razon_social:'', ruc:'', industria:'', telefono:'', email:'', fuente:'', registrado_desde:'web', responsable:'', urgencia:'media', necesidad:'', presupuesto_estimado:'', moneda:'PEN' };
  const [formNuevo, setFormNuevo] = useState(formNuevoBase);
  const [errores, setErrores] = useState({});

  const updateNuevo = (f, v) => setFormNuevo(p => ({ ...p, [f]: v }));

  const guardarLead = (e) => {
    e.preventDefault();
    const errs = {};
    if (!formNuevo.nombre) errs.nombre = true;
    if (!formNuevo.empresa_contacto) errs.empresa_contacto = true;
    if (!formNuevo.responsable) errs.responsable = true;
    if (formNuevo.ruc && !/^\d{11}$/.test(formNuevo.ruc)) errs.ruc = 'El RUC debe tener 11 dígitos';
    if (Object.keys(errs).length) { setErrores(errs); return; }
    const nuevo = {
      id: `lead_${Date.now().toString(36)}`,
      empresa_id: empresa?.id || 'emp_001',
      nombre: formNuevo.nombre,
      cargo: formNuevo.cargo,
      empresa_contacto: formNuevo.empresa_contacto,
      razon_social: formNuevo.razon_social || formNuevo.empresa_contacto,
      ruc: formNuevo.ruc || null,
      industria: formNuevo.industria || null,
      telefono: formNuevo.telefono,
      email: formNuevo.email,
      fuente: formNuevo.fuente || 'Manual',
      registrado_desde: formNuevo.registrado_desde,
      responsable: formNuevo.responsable,
      urgencia: formNuevo.urgencia,
      necesidad: formNuevo.necesidad,
      presupuesto_estimado: Number(formNuevo.presupuesto_estimado) || 0,
      moneda: formNuevo.moneda,
      estado: 'nuevo',
      fecha_creacion: new Date().toISOString().split('T')[0],
      dias_sin_actividad: 0,
      convertido: false
    };
    crearLead(nuevo);
    setPanelNuevo(false);
    setFormNuevo(formNuevoBase);
    setErrores({});
  };

  const cols = [
    { k: 'nuevo', title: 'Nuevo', color: '#64748b' },
    { k: 'en_contacto', title: 'En contacto', color: '#06b6d4' },
    { k: 'calificado', title: 'Calificado', color: '#8b5cf6' },
    { k: 'convertido', title: 'Convertido', color: '#10b981' },
    { k: 'descartado', title: 'Descartado', color: '#f97316' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) updateLeadState(id, targetStatus);
  };

  const getFuenteIcon = (f) => {
    if(!f) return null;
    const fl = f.toLowerCase();
    if(fl.includes('web')) return <span style={{color:'var(--blue)'}}>🌐</span>;
    if(fl.includes('linkedin')) return <span style={{color:'var(--navy)'}}>💼</span>;
    if(fl.includes('evento') || fl.includes('feria')) return <span style={{color:'var(--purple)'}}>📅</span>;
    return <span style={{color:'var(--cyan)'}}>🔗</span>;
  };

  const leadsActivos = leads.filter(l => !['convertido','descartado'].includes(l.estado));
  const potencialTotal = leadsActivos.reduce((s,l) => s + (l.presupuesto_estimado||0), 0);
  
  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Leads</h1>
          <div className="page-sub" style={{marginTop:4, display:'flex', alignItems:'center', gap:10}}>
            <span>{leadsActivos.length} lead{leadsActivos.length !== 1 ? 's' : ''} activo{leadsActivos.length !== 1 ? 's' : ''}</span>
            <span style={{width:4, height:4, borderRadius:99, background:'var(--border)'}}/>
            <span>Potencial total <strong>{money(potencialTotal)}</strong></span>
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary" style={{padding:'8px 16px', borderRadius:8}}>{I.filter} Filtros</button>
          <button className="btn btn-primary" style={{padding:'8px 20px', borderRadius:8}} onClick={() => setPanelNuevo(true)}>{I.plus} Nuevo lead</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(5, 1fr)'}}>
        {cols.map((c, i) => {
          const list = filteredLeads.filter(l => l.estado === c.k);
          const sum = list.reduce((s,l)=>(s+(l.presupuesto_estimado||0)),0);
          const icons = [I.plus, I.users, I.star, I.check, I.x];
          const colors = ['var(--cyan)', 'var(--orange)', 'var(--purple)', 'var(--green)', 'var(--slate-400)'];
          return (
            <div key={c.k} className={`pipeline-kpi-card hover-raise`} style={{'--accent': c.color}}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>
                {icons[i]}
              </div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{money(sum)}</div>
              <div className="pipeline-kpi-count">{list.length} lead{list.length !== 1 ? 's' : ''}</div>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = filteredLeads.filter(l => l.estado === c.k);
              const colors = ['var(--cyan)', 'var(--orange)', 'var(--purple)', 'var(--green)', 'var(--slate-400)'];
              return (
                <div 
                  key={c.k} 
                  className="kanban-col-v2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(l => (
                        <div 
                          key={l.id} 
                          className="kanban-card-v2"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                          onClick={() => setSel(l)}
                          style={{cursor: 'grab'}}
                        >
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:10, lineHeight:1.4}}>
                            {l.nombre}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:10}}>
                            {l.empresa_contacto}
                          </div>
                          
                          <div style={{fontSize:14, fontWeight:800, color: 'var(--navy)', marginBottom:12}}>
                            {money(l.presupuesto_estimado)}
                          </div>
  
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <span className="badge badge-gray" style={{fontSize:9, padding:'1px 6px'}}>{l.fuente}</span>
                              <div className="text-muted" style={{fontSize:10}}>{l.fecha_creacion}</div>
                            </div>
                            <div className="avatar" style={{width:24, height:24, fontSize:10, margin:0, background:'var(--navy)', color:'#fff'}}>
                              {l.responsable?.charAt(0) || 'U'}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.5}}>{[I.plus, I.users, I.star, I.check, I.x][i]}</div>
                        <p>Sin leads en {c.title}<br/><span style={{fontSize:10}}>Arrastra aquí para actualizar.</span></p>
                      </div>
                    )}
                  </div>
  
                  <button className="kanban-btn-add" onClick={() => setPanelNuevo(true)}>
                    {I.plus} Agregar lead
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Empresa</th>
                  <th>Presupuesto</th>
                  <th>Fuente</th>
                  <th>Responsable</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => (
                  <tr key={l.id} className="hover-row" onClick={() => setSel(l)}>
                    <td><div style={{fontWeight:600}}>{l.nombre}</div><div className="text-muted" style={{fontSize:11}}>{l.cargo}</div></td>
                    <td>{l.empresa_contacto}</td>
                    <td><strong>{money(l.presupuesto_estimado)}</strong></td>
                    <td><span className="badge badge-gray">{l.fuente}</span></td>
                    <td>{l.responsable}</td>
                    <td className="text-muted">{l.fecha_creacion}</td>
                    <td><span className={'badge badge-' + (l.estado==='convertido'?'green':l.estado==='descartado'?'gray':'cyan')}>{(l.estado || '').toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
          <div className="side-panel">
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Lead</div>
                <div className="font-display" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.nombre}</div>
              </div>
              <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="col" style={{gap:12}}>
                <div><div className="eyebrow">Empresa</div><div style={{fontWeight:600}}>{sel.empresa_contacto}</div></div>
                <div><div className="eyebrow">Cargo</div><div>{sel.cargo}</div></div>
                <div><div className="eyebrow">Contacto</div><div>{sel.telefono} · {sel.email}</div></div>
                <div><div className="eyebrow">Necesidad</div><div>{sel.necesidad}</div></div>
                <div><div className="eyebrow">Presupuesto Estimado</div><div style={{fontFamily:'Sora', fontWeight:700}}>{money(sel.presupuesto_estimado)}</div></div>
                <div><div className="eyebrow">Responsable</div><div>{sel.responsable}</div></div>
                <div><div className="eyebrow">Estado</div><div style={{textTransform:'capitalize'}}>{sel.estado.replace('_',' ')}</div></div>
                {sel.motivo_descarte && <div><div className="eyebrow">Motivo Descarte</div><div className="text-muted">{sel.motivo_descarte}</div></div>}
              </div>

              {!['convertido', 'descartado'].includes(sel.estado) && (
                <div className="row mt-6" style={{gap:10}}>
                  <button className="btn btn-primary flex-1" onClick={() => { setModalConvertir(sel); setSel(null); }}>{I.check} Convertir</button>
                  <button className="btn btn-secondary" onClick={() => navigate('actividades')}>Registrar Actividad</button>
                  <button className="btn btn-ghost" onClick={() => { setModalDescartar(sel); setSel(null); }}>Descartar</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {modalConvertir && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head">
              <h2>Convertir Lead en Oportunidad</h2>
              <button className="icon-btn" onClick={() => setModalConvertir(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              convertirLead(modalConvertir.id, Object.fromEntries(fd));
              setModalConvertir(null);
            }}>
              <div style={{padding:'10px 14px', background:'rgba(6,182,212,0.07)', borderRadius:8, border:'1px solid var(--border)', fontSize:13}}>
                <div className="text-muted" style={{marginBottom:6, fontWeight:600}}>Datos del lead (pre-cargados)</div>
                <div className="grid-2" style={{gap:'4px 16px'}}>
                  <div><span className="text-muted">Empresa: </span><strong>{modalConvertir.empresa_contacto}</strong></div>
                  <div><span className="text-muted">RUC: </span>{modalConvertir.ruc || <span className="text-subtle">—</span>}</div>
                  <div><span className="text-muted">Contacto: </span>{modalConvertir.nombre}</div>
                  <div><span className="text-muted">Industria: </span>{modalConvertir.industria || <span className="text-subtle">—</span>}</div>
                </div>
                <div className="text-subtle" style={{fontSize:11, marginTop:6}}>Estos datos se copiarán automáticamente a la Cuenta y al Contacto.</div>
              </div>
              <div className="input-group">
                <label>Nombre de la Oportunidad</label>
                <input name="nombre_oportunidad" className="input" defaultValue={`${modalConvertir.necesidad?.slice(0,50) || 'Venta'} — ${modalConvertir.empresa_contacto}`} required autoFocus/>
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Monto Estimado</label>
                  <input name="monto_estimado" type="number" className="input" defaultValue={modalConvertir.presupuesto_estimado} required/>
                </div>
                <div className="input-group">
                  <label>Etapa Inicial</label>
                  <select name="etapa_inicial" className="select" defaultValue="calificacion">
                    <option value="calificacion">Calificación</option>
                    <option value="prospeccion">Prospección</option>
                    <option value="propuesta">Propuesta</option>
                  </select>
                </div>
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setModalConvertir(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.check} Convertir y crear cuenta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalDescartar && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-head">
              <h2>Descartar Lead</h2>
              <button className="icon-btn" onClick={() => setModalDescartar(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={(e) => {
              e.preventDefault();
              descartarLead(modalDescartar.id, new FormData(e.target).get('motivo'));
              setModalDescartar(null);
            }}>
              <div className="input-group">
                <label>Motivo del descarte</label>
                <textarea name="motivo" className="input" required rows="3"></textarea>
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setModalDescartar(null)}>Cancelar</button>
                <button type="submit" className="btn btn-danger">Descartar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {panelNuevo && <>
        <div className="side-panel-backdrop" onClick={() => { setPanelNuevo(false); setFormNuevo(formNuevoBase); setErrores({}); }}/>
        <div className="side-panel" style={{width:'min(640px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Registro de lead</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nuevo lead</div>
            </div>
            <button className="icon-btn" onClick={() => { setPanelNuevo(false); setFormNuevo(formNuevoBase); setErrores({}); }}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarLead}>
            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos del contacto</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Nombre del contacto *</label>
                <input className={'input'+(errores.nombre?' border-danger':'')} value={formNuevo.nombre} onChange={e=>updateNuevo('nombre',e.target.value)} placeholder="Ej: Carlos Huanca" autoFocus/>
                {errores.nombre && <span style={{fontSize:11,color:'var(--danger)'}}>Campo requerido</span>}
              </div>
              <div className="input-group"><label>Cargo</label><input className="input" value={formNuevo.cargo} onChange={e=>updateNuevo('cargo',e.target.value)} placeholder="Ej: Jefe de Mantenimiento"/></div>
              <div className="input-group"><label>Teléfono</label><input className="input" value={formNuevo.telefono} onChange={e=>updateNuevo('telefono',e.target.value)} placeholder="+51 9xx xxx xxx"/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Email</label><input className="input" type="email" value={formNuevo.email} onChange={e=>updateNuevo('email',e.target.value)} placeholder="contacto@empresa.pe"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos de la empresa</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group">
                <label>Nombre comercial *</label>
                <input className={'input'+(errores.empresa_contacto?' border-danger':'')} value={formNuevo.empresa_contacto} onChange={e=>updateNuevo('empresa_contacto',e.target.value)} placeholder="Ej: Minera San Cristóbal SAC"/>
                {errores.empresa_contacto && <span style={{fontSize:11,color:'var(--danger)'}}>Campo requerido</span>}
              </div>
              <div className="input-group"><label>Razón social legal</label><input className="input" value={formNuevo.razon_social} onChange={e=>updateNuevo('razon_social',e.target.value)} placeholder="Si difiere del nombre comercial"/></div>
              <div className="input-group">
                <label>RUC <span style={{fontSize:11,color:'var(--fg-subtle)',fontWeight:400}}>· 11 dígitos</span></label>
                <input className={'input'+(errores.ruc?' border-danger':'')} value={formNuevo.ruc} onChange={e=>updateNuevo('ruc',e.target.value.replace(/\D/g,'').slice(0,11))} placeholder="20xxxxxxxxx" inputMode="numeric" maxLength={11}/>
                {errores.ruc && <span style={{fontSize:11,color:'var(--danger)'}}>{errores.ruc}</span>}
              </div>
              <div className="input-group"><label>Industria</label><select className="select" value={formNuevo.industria} onChange={e=>updateNuevo('industria',e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Mineria','Industrial','Construccion','Agroindustria','Facilities','Energia','Petroleo & Gas','Logistica','Retail','Salud','Educacion','Tecnologia','Servicios profesionales','Sector publico','Otro'].map(i=><option key={i}>{i}</option>)}
              </select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Oportunidad</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Necesidad / Descripción</label><textarea className="input" rows={2} value={formNuevo.necesidad} onChange={e=>updateNuevo('necesidad',e.target.value)} placeholder="Ej: Mantenimiento de fajas transportadoras, 3 unidades con desgaste crítico"/></div>
              <div className="input-group"><label>Presupuesto estimado (S/)</label><input className="input" type="number" value={formNuevo.presupuesto_estimado} onChange={e=>updateNuevo('presupuesto_estimado',e.target.value)} placeholder="0"/></div>
              <div className="input-group"><label>Urgencia</label><select className="select" value={formNuevo.urgencia} onChange={e=>updateNuevo('urgencia',e.target.value)}>
                <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
              </select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Asignación</div>
            <div className="grid-2" style={{gap:14, marginBottom:24}}>
              <div className="input-group">
                <label>Responsable comercial *</label>
                <select className={'select'+(errores.responsable?' border-danger':'')} value={formNuevo.responsable} onChange={e=>updateNuevo('responsable',e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {usuarios.filter(u=>['comercial','admin'].includes(u.rol)).map(u=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                </select>
                {errores.responsable && <span style={{fontSize:11,color:'var(--danger)'}}>Campo requerido</span>}
              </div>
              <div className="input-group"><label>Fuente</label><select className="select" value={formNuevo.fuente} onChange={e=>updateNuevo('fuente',e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Referido','Formulario web','LinkedIn','Evento / Feria','Cold outreach','Manual'].map(f=><option key={f}>{f}</option>)}
              </select></div>
              <div className="input-group"><label>Registrado desde</label><select className="select" value={formNuevo.registrado_desde} onChange={e=>updateNuevo('registrado_desde',e.target.value)}>
                <option value="web">Web / CRM</option><option value="campo">Campo (app móvil)</option>
              </select></div>
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={() => { setPanelNuevo(false); setFormNuevo(formNuevoBase); setErrores({}); }}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.plus} Registrar lead</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}

// ============ PIPELINE ============
function Pipeline() {
  const {
    oportunidades, cuentas, actividades, agendaEventos, hojasCosteo, cotizaciones, osClientes,
    crearAgendaEvento, actualizarEtapaOportunidad, marcarGanada, marcarPerdida, navigate, activeParams,
    searchQuery
  } = useApp();
  const [view, setView] = useState('kanban');
  const [sel, setSel] = useState(null);
  const [agendaOpp, setAgendaOpp] = useState(null);

  useEffect(() => {
    if (activeParams?.panel) {
      const o = oportunidades.find(op => op.id === activeParams.panel);
      if (o) setSel(o);
    }
  }, [activeParams, oportunidades]);

  const cols = [
    { k: 'prospeccion', title: 'Prospección', color: '#64748b' },
    { k: 'calificacion', title: 'Calificación', color: '#06b6d4' },
    { k: 'propuesta', title: 'Propuesta', color: '#8b5cf6' },
    { k: 'ganada', title: 'Ganada', color: '#10b981' },
    { k: 'negociacion', title: 'Negociación', color: '#f97316' },
  ];
  
  const activeOps = oportunidades.filter(o => !['perdida'].includes(o.etapa));
  const query = searchQuery.toLowerCase();
  const getOppCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const filteredOps = activeOps.filter(o => 
    o.nombre.toLowerCase().includes(query) ||
    getOppCuentaNombre(o.cuenta_id).toLowerCase().includes(query)
  );

  const total = activeOps.reduce((s,o)=>s+(o.monto_estimado||0),0);
  const forecast = activeOps.reduce((s,o)=>s+(o.forecast_ponderado||0),0);

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      if (targetStatus === 'ganada') marcarGanada(id, {});
      else if (targetStatus === 'perdida') marcarPerdida(id, 'Perdida desde kanban');
      else actualizarEtapaOportunidad(id, targetStatus);
    }
  };

  const calculateDays = (dateStr) => {
    if(!dateStr) return 0;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getOppTimeline = (opp) => {
    if (!opp) return [];
    const oppId = opp.id;
    const items = [
      ...actividades
        .filter(a => a.oportunidad_id === oppId || (a.vinculo_tipo === 'oportunidad' && a.vinculo_id === oppId))
        .map(a => ({
          id: `act-${a.id}`,
          tipo: 'Actividad',
          titulo: a.descripcion,
          detalle: a.resultado || a.proxima_accion || a.estado,
          fecha: a.fecha,
          hora: a.hora,
          estado: a.estado,
          icon: I.check,
        })),
      ...agendaEventos
        .filter(e => e.oportunidad_id === oppId)
        .map(e => ({
          id: `evt-${e.id}`,
          tipo: 'Agenda',
          titulo: e.titulo,
          detalle: `${e.tipo} · ${e.vendedor || e.registrado_por || 'Sin asignar'}`,
          fecha: e.fecha,
          hora: e.hora,
          estado: e.estado,
          icon: I.calendar,
        })),
      ...hojasCosteo
        .filter(h => h.oportunidad_id === oppId)
        .map(h => ({
          id: `hc-${h.id}`,
          tipo: 'Hoja de Costeo',
          titulo: h.numero,
          detalle: `Costo ${money(h.costo_total || 0)} · sugerido ${money(h.precio_sugerido_total || 0)}`,
          fecha: h.fecha || h.created_at?.slice(0, 10),
          estado: h.estado,
          icon: I.receipt,
          action: () => navigate('hoja_costeo', { detail: h.id }),
        })),
      ...cotizaciones
        .filter(c => c.oportunidad_id === oppId)
        .map(c => ({
          id: `cot-${c.id}`,
          tipo: 'Cotizacion',
          titulo: c.numero,
          detalle: `${money(c.total || 0)} · v${c.version || 1}`,
          fecha: c.fecha || c.created_at?.slice(0, 10),
          estado: c.estado,
          icon: I.file,
          action: () => navigate('cotizaciones', { detail: c.id }),
        })),
      ...osClientes
        .filter(os => os.oportunidad_id === oppId)
        .map(os => ({
          id: `osc-${os.id}`,
          tipo: 'OS Cliente',
          titulo: os.numero,
          detalle: `${money(os.monto_aprobado || 0)} · ${os.estado}`,
          fecha: os.fecha_emision || os.created_at?.slice(0, 10),
          estado: os.estado,
          icon: I.file,
          action: () => navigate('os_cliente', { detail: os.id }),
        })),
    ];
    return items.sort((a, b) => `${b.fecha || ''} ${b.hora || ''}`.localeCompare(`${a.fecha || ''} ${a.hora || ''}`));
  };
  const timelineSel = getOppTimeline(sel);
  const crearEventoDesdeOportunidad = (e) => {
    e.preventDefault();
    if (!agendaOpp) return;
    const fd = new FormData(e.target);
    crearAgendaEvento({
      titulo: fd.get('titulo'),
      tipo: fd.get('tipo') || 'reunion',
      cuenta_id: agendaOpp.cuenta_id || null,
      lead_id: agendaOpp.lead_id || agendaOpp.lead_origen || null,
      oportunidad_id: agendaOpp.id,
      vendedor: agendaOpp.responsable || 'Por asignar',
      registrado_por: agendaOpp.responsable || 'Por asignar',
      fecha: fd.get('fecha'),
      hora: fd.get('hora'),
      duracion_minutos: Number(fd.get('duracion_minutos') || 60),
      estado: 'programado',
      notas: fd.get('notas') || null,
    });
    setAgendaOpp(null);
    setSel(agendaOpp);
  };

  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Pipeline</h1>
          <div className="page-sub" style={{marginTop:4, display:'flex', alignItems:'center', gap:10}}>
            <span>{activeOps.length} oportunidad{activeOps.length !== 1 ? 'es' : ''}</span>
            <span style={{width:4, height:4, borderRadius:99, background:'var(--border)'}}/>
            <span>Pipeline total <strong>{money(total)}</strong></span>
            <span style={{width:4, height:4, borderRadius:99, background:'var(--border)'}}/>
            <span>Forecast <strong>{money(Math.round(forecast))}</strong></span>
            <span style={{color:'var(--fg-subtle)', cursor:'help'}} title="Calculado en base a probabilidad por etapa">{I.info}</span>
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary" style={{padding:'8px 16px', borderRadius:8}}>{I.filter} Filtros</button>
          <div className="row" style={{background:'var(--green)', borderRadius:8, overflow:'hidden'}}>
            <button className="btn btn-primary" style={{background:'transparent', border:'none', padding:'8px 16px', borderRight:'1px solid rgba(255,255,255,0.1)'}}>{I.plus} Nueva oportunidad</button>
            <button className="btn btn-primary" style={{background:'transparent', border:'none', padding:'8px 10px'}}>{I.chev}</button>
          </div>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(5, 1fr)'}}>
        {cols.map((c, i) => {
          const ops = filteredOps.filter(o => o.etapa === c.k);
          const sum = ops.reduce((s,o)=>s+(o.monto_estimado||0),0);
          const icons = [I.users, I.star, I.file, I.hand, I.check];
          return (
            <div key={c.k} className={`pipeline-kpi-card ${c.k} hover-raise`} style={{ '--accent': c.color }}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>
                {icons[i]}
              </div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{money(sum)}</div>
              <div className="pipeline-kpi-count">{ops.length} oportunidad{ops.length !== 1 ? 'es' : ''}</div>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20}}>
          <div className="kanban-v2">
            {cols.map(c => {
              const list = filteredOps.filter(o => o.etapa === c.k);
              return (
                <div 
                  key={c.k} 
                  className="kanban-col-v2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(o => (
                        <div 
                          key={o.id} 
                          className="kanban-card-v2"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)}
                          onClick={() => setSel(o)}
                          style={{cursor: 'grab'}}
                        >
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:10, lineHeight:1.4}}>
                            {o.nombre}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:10}}>
                            {getOppCuentaNombre(o.cuenta_id)}
                          </div>
                          
                          <div style={{fontSize:14, fontWeight:800, color:'var(--navy)', marginBottom:12}}>
                            {money(o.monto_estimado)}
                          </div>
  
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <div className="badge badge-cyan" style={{fontSize:10, padding:'2px 8px'}}>{c.title}</div>
                              <div className="text-muted" style={{fontSize:10}}>{o.fecha_cierre_estimada || '12 may 2024'}</div>
                            </div>
                            <div className="avatar" style={{width:24, height:24, fontSize:10, margin:0, background:'var(--navy)', color:'#fff'}}>
                              {o.responsable?.charAt(0) || 'CR'}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.5}}>{[I.users, I.star, I.file, I.hand, I.check][cols.findIndex(col => col.k === c.k)]}</div>
                        <p>Aún no hay oportunidades<br/><span style={{fontSize:10}}>Las oportunidades nuevas aparecerán aquí.</span></p>
                      </div>
                    )}
                  </div>
  
                  <button className="kanban-btn-add">
                    {I.plus} Agregar oportunidad
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Oportunidad</th>
                  <th>Cuenta</th>
                  <th>Monto</th>
                  <th>Etapa</th>
                  <th>Prob.</th>
                  <th>Cierre</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {filteredOps.map(o => (
                  <tr key={o.id} className="hover-row" onClick={() => setSel(o)}>
                    <td style={{fontWeight:600}}>{o.nombre}</td>
                    <td>{getOppCuentaNombre(o.cuenta_id)}</td>
                    <td><strong>{money(o.monto_estimado)}</strong></td>
                    <td><span className="badge badge-cyan">{(o.etapa || '').toUpperCase()}</span></td>
                    <td>{o.probabilidad}%</td>
                    <td className="text-muted">{o.fecha_cierre_estimada}</td>
                    <td>{o.responsable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
          <div className="side-panel">
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Oportunidad</div>
                <div className="font-display" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.nombre}</div>
              </div>
              <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-3" style={{gap:12, marginBottom:20}}>
                <div><div className="eyebrow">Monto</div><div style={{fontFamily:'Sora', fontSize:20, fontWeight:700}}>{money(sel.monto_estimado)}</div></div>
                <div><div className="eyebrow">Probabilidad</div><div style={{fontFamily:'Sora', fontSize:20, fontWeight:700}}>{sel.probabilidad}%</div></div>
                <div><div className="eyebrow">Cierre est.</div><div style={{fontFamily:'Sora', fontSize:15, fontWeight:700}}>{sel.fecha_cierre_estimada || 'No definido'}</div></div>
              </div>
              <div className="col" style={{gap:12}}>
                <div><div className="eyebrow">Cuenta</div><div style={{fontWeight:600}}>{getOppCuentaNombre(sel.cuenta_id)}</div></div>
                <div><div className="eyebrow">Servicio de interés</div><div>{sel.servicio_interes}</div></div>
                <div><div className="eyebrow">Responsable</div><div>{sel.responsable}</div></div>
                <div><div className="eyebrow">Etapa actual</div><div style={{textTransform:'capitalize'}}>{sel.etapa}</div></div>
                <div><div className="eyebrow">Notas</div><div className="text-muted">{sel.notas}</div></div>
              </div>

              <div className="row mt-6" style={{gap:8}}>
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  data-local-form="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAgendaOpp(sel);
                  }}
                >
                  {I.calendar} Agendar seguimiento
                </button>
                <button className="btn btn-secondary flex-1" onClick={() => navigate('actividades')}>
                  {I.check} Ver actividades
                </button>
              </div>

              <div className="commercial-timeline mt-6">
                <div className="row" style={{justifyContent:'space-between', marginBottom:12}}>
                  <div>
                    <div className="eyebrow">Timeline comercial</div>
                    <div className="text-muted" style={{fontSize:12}}>Agenda, actividades, costeo, cotizaciones y OS Cliente</div>
                  </div>
                  <span className="badge badge-cyan">{timelineSel.length}</span>
                </div>
                {timelineSel.length > 0 ? (
                  <div className="commercial-timeline-list">
                    {timelineSel.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className={`commercial-timeline-item ${item.action ? 'clickable' : ''}`}
                        onClick={item.action || undefined}
                      >
                        <span className="commercial-timeline-icon">{item.icon}</span>
                        <span className="commercial-timeline-body">
                          <span className="commercial-timeline-meta">{item.tipo} · {item.fecha || 'Sin fecha'} {item.hora || ''}</span>
                          <strong>{item.titulo}</strong>
                          {item.detalle && <span>{item.detalle}</span>}
                        </span>
                        {item.estado && <span className={'badge ' + (item.estado === 'completada' || item.estado === 'aprobada' || item.estado === 'ganada' || item.estado === 'realizado' ? 'badge-green' : item.estado === 'borrador' || item.estado === 'pendiente' ? 'badge-cyan' : 'badge-orange')}>{item.estado}</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="calendar-empty">Aun no hay historial comercial vinculado a esta oportunidad.</div>
                )}
              </div>

              {!['ganada', 'perdida'].includes(sel.etapa) && (
                <div className="col mt-6" style={{gap:8}}>
                  <div className="row" style={{gap:8}}>
                    <button
                      className="btn btn-secondary flex-1"
                      data-local-form="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate('hoja_costeo', { nueva: true, opp: sel.id });
                      }}
                    >
                      {I.receipt} Crear Hoja de Costeo
                    </button>
                    <button
                      className="btn btn-primary flex-1"
                      data-local-form="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate('cotizaciones', { opp: sel.id, active_tab: 'nueva' });
                      }}
                    >
                      {I.file} Crear cotizacion
                    </button>
                  </div>
                  <div className="row" style={{gap:8}}>
                    <button className="btn btn-secondary flex-1" onClick={() => { marcarGanada(sel.id, {}); setSel(null); }}>Ganar</button>
                    <button className="btn btn-ghost flex-1" onClick={() => { marcarPerdida(sel.id, 'Perdida manualmente'); setSel(null); }}>Perder</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {agendaOpp && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Agenda comercial</div>
                <h2>Agendar seguimiento</h2>
              </div>
              <button className="icon-btn" onClick={() => setAgendaOpp(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={crearEventoDesdeOportunidad}>
              <div>
                <div className="eyebrow">Oportunidad</div>
                <div style={{fontWeight:700}}>{agendaOpp.nombre}</div>
                <div className="text-muted" style={{fontSize:12}}>{getOppCuentaNombre(agendaOpp.cuenta_id)} · {agendaOpp.responsable || 'Por asignar'}</div>
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Tipo</label>
                  <select name="tipo" className="select" required defaultValue="reunion">
                    <option value="reunion">Reunion</option>
                    <option value="visita">Visita</option>
                    <option value="llamada">Llamada</option>
                    <option value="demo">Demo</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Duracion</label>
                  <select name="duracion_minutos" className="select" defaultValue="60">
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Titulo</label>
                <input name="titulo" className="input" required defaultValue={`Seguimiento - ${agendaOpp.nombre}`} />
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Fecha</label>
                  <input name="fecha" type="date" className="input" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="input-group">
                  <label>Hora</label>
                  <input name="hora" type="time" className="input" required defaultValue="09:00" />
                </div>
              </div>
              <div className="input-group">
                <label>Notas</label>
                <textarea name="notas" className="input" rows="3" placeholder="Objetivo de la reunion o punto a tratar."></textarea>
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setAgendaOpp(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.calendar} Guardar evento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ============ ACTIVIDADES ============
function Actividades() {
  const { actividades, cuentas, registrarActividad, actualizarActividad, searchQuery } = useApp();
  const [view, setView] = useState('agenda'); // 'agenda' | 'lista'
  const [sel, setSel] = useState(null);
  const [modalNew, setModalNew] = useState(false);

  const query = searchQuery.toLowerCase();
  const getActCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const filteredActs = actividades.filter(a => 
    a.descripcion.toLowerCase().includes(query) ||
    (a.tipo || '').toLowerCase().includes(query) ||
    getActCuentaNombre(a.cuenta_id).toLowerCase().includes(query)
  );

  const cols = [
    { k: 'vencida', title: 'Vencidas', color: 'var(--danger)' },
    { k: 'pendiente', title: 'Pendientes', color: 'var(--cyan)' },
    { k: 'completada', title: 'Completadas', color: 'var(--green)' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      const actividad = actividades.find(a => a.id === id);
      if (!actividad) return;
      let newEstado = targetStatus;
      let newFecha = actividad.fecha;
      const todayStr = new Date().toISOString().split('T')[0];

      if (targetStatus === 'vencida') {
        newEstado = 'pendiente';
        if (actividad.fecha >= todayStr) {
          const ayer = new Date();
          ayer.setDate(ayer.getDate() - 1);
          newFecha = ayer.toISOString().split('T')[0];
        }
      } else if (targetStatus === 'pendiente') {
        newEstado = 'pendiente';
        if (actividad.fecha < todayStr) {
          newFecha = todayStr;
        }
      }

      actualizarActividad(id, { estado: newEstado, fecha: newFecha });
    }
  };

  const getIcon = (tipo) => {
    switch(tipo) {
      case 'llamada': return I.phone;
      case 'reunion': return I.users;
      case 'visita': return I.mapPin;
      case 'email': return <span style={{fontSize:14}}>📧</span>;
      case 'tarea': default: return I.check;
    }
  };


  const today = new Date().toISOString().split('T')[0];
  const actsCalculated = filteredActs.map(a => {
    let est = a.estado;
    if (est === 'pendiente' && a.fecha < today) est = 'vencida';
    return { ...a, estado: est };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Actividades Comerciales</h1>
          <div className="page-sub">Llamadas, reuniones, visitas y tareas del equipo comercial</div>
        </div>
        <div className="row">
          <div className="segmented-control">
            <button className={`seg-btn ${view==='agenda'?'active':''}`} onClick={()=>setView('agenda')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary" onClick={() => setModalNew(true)}>{I.plus} Nueva actividad</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        {cols.map((c, i) => {
          const list = actsCalculated.filter(a => a.estado === c.k);
          const icons = [I.alert, I.clock, I.check];
          const colors = ['#64748b', '#06b6d4', '#8b5cf6'];
          return (
            <div key={c.k} className="pipeline-kpi-card hover-raise" style={{'--accent': colors[i]}}>
              <div className="pipeline-kpi-icon" style={{color: colors[i]}}>
                {icons[i]}
              </div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{list.length}</div>
              <div className="pipeline-kpi-count">Actividades {c.k}</div>
            </div>
          );
        })}
      </div>

      {view === 'agenda' ? (
        <div style={{overflowX:'auto', paddingBottom:20, marginTop:24}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = actsCalculated.filter(a => a.estado === c.k);
              const colors = ['#64748b', '#06b6d4', '#8b5cf6'];
              return (
                <div 
                  key={c.k} 
                  className="kanban-col-v2" 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': colors[i] }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(a => (
                        <div 
                          key={a.id} 
                          className="kanban-card-v2" 
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', a.id)}
                          style={{cursor: 'grab'}}
                        >
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                            <span style={{fontSize:10, fontWeight:800, textTransform:'uppercase', color:'var(--fg-subtle)', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:4}}>
                              <span style={{width:14, height:14, display:'flex', alignItems:'center'}}>{getIcon(a.tipo)}</span>
                              {a.tipo}
                            </span>
                            <span className="badge badge-gray" style={{fontSize:9}}>{a.fecha}</span>
                          </div>
                          
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:4, lineHeight:1.4}}>
                            {a.descripcion}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:12}}>
                            {a.cuenta_id ? getActCuentaNombre(a.cuenta_id) : 'Lead/Prospecto'}
                          </div>
                          
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <div className="avatar" style={{width:24, height:24, fontSize:10, background:'var(--navy)', color:'#fff'}}>{a.responsable.charAt(0)}</div>
                              <span style={{fontSize:11, color:'var(--fg-muted)'}}>{a.responsable}</span>
                            </div>
                            <div style={{fontSize:10, fontWeight:700, color: c.k === 'vencida' ? 'var(--danger)' : 'var(--fg-muted)'}}>
                              {a.hora}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.3}}>{[I.alert, I.clock, I.check][i]}</div>
                        <p>Sin actividades {c.title.toLowerCase()}<br/><span style={{fontSize:10}}>Arrastra aquí para organizar.</span></p>
                      </div>
                    )}
                  </div>
                  
                  <button className="kanban-btn-add" onClick={() => setModalNew(true)}>
                    {I.plus} Nueva actividad
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card mt-6">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Relacionado</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {actsCalculated.map(a => (
                  <tr key={a.id} className="hover-row">
                    <td>
                      <div className="row" style={{gap:6, textTransform:'capitalize'}}>
                        <span style={{width:16, display:'flex', alignItems:'center', justifyContent:'center'}}>{getIcon(a.tipo)}</span>
                        {a.tipo}
                      </div>
                    </td>
                    <td>{a.fecha} {a.hora}</td>
                    <td style={{maxWidth:300, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={a.descripcion}>{a.descripcion}</td>
                    <td>{a.cuenta_id ? getActCuentaNombre(a.cuenta_id) : 'Lead'}</td>
                    <td>{a.responsable}</td>
                    <td>
                      <span className={'badge ' + (a.estado==='completada'?'badge-green':a.estado==='vencida'?'badge-red':'badge-cyan')}>
                        {a.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalNew && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:500}}>
            <div className="modal-head">
              <h2>Registrar Actividad</h2>
              <button className="icon-btn" onClick={() => setModalNew(false)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              registrarActividad({
                tipo: fd.get('tipo'),
                fecha: fd.get('fecha'),
                hora: fd.get('hora'),
                descripcion: fd.get('descripcion'),
                responsable: 'Usuario Actual'
              });
              setModalNew(false);
            }}>
              <div className="grid-2">
                <div className="input-group">
                  <label>Tipo</label>
                  <select name="tipo" className="select" required>
                    <option value="reunion">Reunión</option>
                    <option value="llamada">Llamada</option>
                    <option value="email">Email</option>
                    <option value="tarea">Tarea</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Fecha</label>
                  <input name="fecha" type="date" className="input" defaultValue={today} required/>
                </div>
              </div>
              <div className="input-group">
                <label>Descripción</label>
                <textarea name="descripcion" className="input" rows="3" required></textarea>
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setModalNew(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


// ============ OS CLIENTE ============
function FormCrearOT({ os, onSave, onCancel }) {
  const { personalOperativo } = useApp();
  const [form, setForm] = useState({
    servicio: 'Servicio cliente',
    descripcion: `Ejecucion de ${os.numero}`,
    costo_estimado: os.saldo_por_ejecutar || os.monto_aprobado || 0,
    fecha_programada: os.fecha_inicio || new Date().toISOString().split('T')[0],
    direccion_ejecucion: '',
    tecnico_responsable_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err?.message || 'No se pudo crear la OT.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a {os.numero}</button>
          <h1 className="page-title">Nueva Orden de Trabajo</h1>
          <div className="page-sub">Vinculada a OS Cliente <strong style={{color:'var(--fg)'}}>{os.numero}</strong></div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-primary" data-local-form="true" disabled={saving} onClick={submit}>{I.check} {saving ? 'Creando...' : 'Crear OT'}</button>
        </div>
      </div>
      <div className="card mt-6">
        <div className="card-body">
          {error && <div className="alert alert-danger" style={{marginBottom:16}}>{error}</div>}
          <div className="grid-2" style={{gap:16}}>
            <div className="input-group">
              <label>Servicio / tipo</label>
              <input className="input" value={form.servicio} onChange={e => upd('servicio', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Monto planificado</label>
              <input className="input" type="number" min="0" value={form.costo_estimado} onChange={e => upd('costo_estimado', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Fecha programada</label>
              <input className="input" type="date" value={form.fecha_programada} onChange={e => upd('fecha_programada', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Técnico responsable</label>
              <select className="select" value={form.tecnico_responsable_id} onChange={e => upd('tecnico_responsable_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {personalOperativo.filter(p => p.estado === 'activo').map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.cargo ? ` — ${p.cargo}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="input-group" style={{gridColumn:'1 / -1'}}>
              <label>Dirección de ejecución</label>
              <input className="input" value={form.direccion_ejecucion} onChange={e => upd('direccion_ejecucion', e.target.value)} />
            </div>
            <div className="input-group" style={{gridColumn:'1 / -1'}}>
              <label>Descripción / alcance</label>
              <textarea className="input" rows="4" value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} style={{resize:'vertical'}} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function OSCliente() {
  const { osClientes, cuentas, ots, activeParams, navigate, crearOTDesdeOS, searchQuery } = useApp();

  const getOSCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  
  const query = searchQuery.toLowerCase();
  const filteredOS = osClientes.filter(os => 
    os.numero.toLowerCase().includes(query) ||
    (os.numero_doc_cliente || '').toLowerCase().includes(query) ||
    getOSCuentaNombre(os.cuenta_id).toLowerCase().includes(query)
  );

  const otsDeOS = (osId) => ots.filter(ot => ot.os_cliente_id === osId || (osClientes.find(os => os.id === osId)?.ots_asociadas || []).includes(ot.id));

  if (activeParams?.detail) {
    const os = osClientes.find(o => o.id === activeParams.detail);
    if (!os) return <div className="p-4">OS no encontrada</div>;

    if (activeParams?.crear_ot) {
      return (
        <FormCrearOT
          os={os}
          onCancel={() => navigate('os_cliente', { detail: os.id })}
          onSave={async (form) => {
            const otId = await crearOTDesdeOS(os.id, form);
            if (!otId) throw new Error('No se pudo obtener el ID de la OT creada.');
            navigate('ot', { detail: otId });
          }}
        />
      );
    }

    const tabs = ['Resumen y OTs', 'Valorizaciones', 'Facturas', 'Historial'];
    const activeTab = activeParams.tab || tabs[0];
    const osOts = otsDeOS(os.id);

    return (
      <>
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={() => navigate('os_cliente')} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
            <h1 className="page-title row" style={{gap:10}}>{os.numero} <span className="badge badge-cyan" style={{fontSize:12, textTransform:'uppercase'}}>{os.estado.replace('_',' ')}</span></h1>
            <div className="page-sub">Cliente: <strong style={{color:'var(--fg)'}}>{getOSCuentaNombre(os.cuenta_id)}</strong> · OC Cliente: {os.numero_doc_cliente}</div>
          </div>
          <div className="row">
            <button className="btn btn-secondary">{I.file} Ver Cotización</button>
            <button className="btn btn-primary" data-local-form="true" onClick={() => navigate('os_cliente', { detail: os.id, crear_ot: true })}>{I.plus} Crear OT</button>
          </div>
        </div>

        <div className="tabs" style={{padding:'0 32px'}}>
          {tabs.map(t => (
            <button key={t} className={`tab ${activeTab===t?'active':''}`} onClick={() => navigate('os_cliente', { detail: os.id, tab: t })}>{t}</button>
          ))}
        </div>

        <div style={{padding:'20px 32px'}}>
          <div className="grid-4" style={{marginBottom:24}}>
            <div className="kpi-card">
              <div className="kpi-label">Monto Aprobado</div>
              <div className="kpi-value">{money(os.monto_aprobado)}</div>
              <div className="text-muted" style={{fontSize:12}}>Moneda: {os.moneda}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Ejecutado (OTs)</div>
              <div className="kpi-value">{money(os.monto_aprobado - os.saldo_por_ejecutar)}</div>
              <div className="text-muted" style={{fontSize:12}}>Falta ejecutar: {money(os.saldo_por_ejecutar)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Facturado</div>
              <div className="kpi-value">{money(os.monto_facturado)}</div>
              <div className="text-muted" style={{fontSize:12}}>Por facturar: {money(os.saldo_por_facturar)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Anticipo / Cobrado</div>
              <div className="kpi-value">{money(os.anticipo_recibido)}</div>
              <div className="text-muted" style={{fontSize:12}}>Cobrado total: {money(os.monto_cobrado)}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>{activeTab}</h3></div>
            {activeTab === 'Resumen y OTs' && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>OT</th><th>Servicio</th><th>Fecha</th><th>Monto planificado</th><th>Avance</th><th>Estado</th></tr></thead>
                  <tbody>
                    {osOts.map(ot => (
                      <tr key={ot.id} className="hover-row" onClick={() => navigate('ot', { detail: ot.id })} style={{cursor:'pointer'}}>
                        <td className="mono" style={{fontWeight:600}}>{ot.numero}</td>
                        <td>{ot.tipo || ot.servicio}</td>
                        <td>{ot.fecha_inicio || ot.fecha_programada || '-'}</td>
                        <td className="num">{money(ot.costoEst || ot.costo_estimado || 0)}</td>
                        <td>{ot.avance || ot.avance_pct || 0}%</td>
                        <td><span className="badge badge-cyan">{(ot.estado || 'programada').replace('_', ' ')}</span></td>
                      </tr>
                    ))}
                    {osOts.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>Aun no hay OTs vinculadas a esta OS.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab !== 'Resumen y OTs' && <div className="card-body" style={{minHeight:300, display:'flex', alignItems:'center', justifyContent:'center'}}>
              <div className="text-muted col" style={{alignItems:'center', gap:10}}>
                <span style={{fontSize:32}}>🚧</span>
                <div>Sección en construcción: {activeTab}</div>
              </div>
            </div>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes de Servicio (Cliente)</h1>
          <div className="page-sub">Contratos aprobados y emitidos por los clientes</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtros</button>
        </div>
      </div>

      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° OS Cliente</th>
                <th>OC Referencia</th>
                <th>Cliente</th>
                <th>Fecha Emisión</th>
                <th>Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOS.map(os => (
                <tr key={os.id} className="hover-row" onClick={() => navigate('os_cliente', { detail: os.id })} style={{cursor:'pointer'}}>
                  <td className="mono" style={{fontWeight:600}}>{os.numero}</td>
                  <td className="mono text-muted">{os.numero_doc_cliente}</td>
                  <td>{getOSCuentaNombre(os.cuenta_id)}</td>
                  <td>{os.fecha_emision}</td>
                  <td className="mono" style={{fontWeight:600}}>{money(os.monto_aprobado)}</td>
                  <td>
                    <span className={'badge ' + (os.estado==='facturada'?'badge-green':os.estado==='en_ejecucion'?'badge-cyan':os.estado==='por_facturar'?'badge-orange':'badge-gray')}>
                      {os.estado.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
              {osClientes.length === 0 && (
                <tr><td colSpan="7" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No hay OS Cliente registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Marketing() {
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Marketing Automation</h1><div className="page-sub">Campañas activas y automatización de nutrición de leads</div></div>
        <button className="btn btn-primary">{I.plus} Nueva Secuencia</button>
      </div>
      <div className="card mt-6 p-6">
        <h3 style={{marginBottom:16}}>Secuencias Activas (Simulado)</h3>
        <p className="text-muted">El editor visual de flujos de correo y triggers se implementará en la versión final.</p>
        <div className="table-wrap mt-4">
          <table className="tbl">
            <thead><tr><th>Campaña</th><th>Público Objetivo</th><th>Correos</th><th>Tasa Apertura</th><th>Conversión</th><th>Estado</th></tr></thead>
            <tbody>
              <tr><td>Nutrición: Leads Industriales</td><td>Industria: Manufactura, Score &lt; 50</td><td>4</td><td>42%</td><td>8%</td><td><span className="badge badge-green">Activa</span></td></tr>
              <tr><td>Reactivación Q4</td><td>Oportunidades Perdidas &gt; 6 meses</td><td>2</td><td>28%</td><td>2%</td><td><span className="badge badge-orange">Pausada</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function BIComercial() {
  const [tab, setTab] = useState('pipeline');
  const { oportunidades, leads, cuentas } = useApp();

  const oppsAbiertas  = oportunidades.filter(o => o.estado === 'abierta');
  const oppsGanadas   = oportunidades.filter(o => o.estado === 'ganada');
  const oppsPerdidas  = oportunidades.filter(o => o.estado === 'perdida');
  const forecastTotal = oppsAbiertas.reduce((s, o) => s + (o.forecast_ponderado || 0), 0);
  const ticketProm    = oportunidades.length ? Math.round(oportunidades.reduce((s, o) => s + o.monto_estimado, 0) / oportunidades.length) : 0;
  const totalCierres  = oppsGanadas.length + oppsPerdidas.length;
  const tasaCierre    = totalCierres > 0 ? Math.round(oppsGanadas.length / totalCierres * 100) : 0;
  const leadsActivos  = leads.filter(l => !l.convertido).length;

  const ETAPAS = [
    { key:'prospeccion', label:'Prospección',  color:'var(--fg-subtle)' },
    { key:'calificacion',label:'Calificación', color:'var(--cyan)'      },
    { key:'propuesta',   label:'Propuesta',    color:'var(--purple)'    },
    { key:'negociacion', label:'Negociación',  color:'var(--orange)'    },
    { key:'ganada',      label:'Ganada',       color:'var(--green)'     },
    { key:'perdida',     label:'Perdida',      color:'var(--danger)'    },
  ];
  const funnel = ETAPAS.map(e => ({
    ...e,
    count: oportunidades.filter(o => o.etapa === e.key).length,
    valor: oportunidades.filter(o => o.etapa === e.key).reduce((s, o) => s + o.monto_estimado, 0),
  }));
  const maxFunnelValor = Math.max(...funnel.map(f => f.valor), 1);

  const fuentesMap = {};
  leads.forEach(l => { fuentesMap[l.fuente] = (fuentesMap[l.fuente] || 0) + 1; });
  const fuentesArr = Object.entries(fuentesMap).sort((a, b) => b[1] - a[1]);
  const maxFuente  = Math.max(...Object.values(fuentesMap), 1);
  const urgMap     = { alta: leads.filter(l=>l.urgencia==='alta').length, media: leads.filter(l=>l.urgencia==='media').length, baja: leads.filter(l=>l.urgencia==='baja').length };

  const respMap = {};
  oppsAbiertas.forEach(o => {
    if (!respMap[o.responsable]) respMap[o.responsable] = { count: 0, forecast: 0 };
    respMap[o.responsable].count++;
    respMap[o.responsable].forecast += o.forecast_ponderado || 0;
  });
  const maxResp = Math.max(...Object.values(respMap).map(r => r.forecast), 1);

  const tendencia = [
    { mes:'Nov', ventas:2, valor:85000  },
    { mes:'Dic', ventas:1, valor:42000  },
    { mes:'Ene', ventas:3, valor:120000 },
    { mes:'Feb', ventas:2, valor:95000  },
    { mes:'Mar', ventas:4, valor:168000 },
    { mes:'Abr', ventas:oppsGanadas.length, valor: oppsGanadas.reduce((s,o)=>s+o.monto_estimado,0)||28500 },
  ];
  const maxTend = Math.max(...tendencia.map(t => t.valor), 1);

  const etapaBadge = { prospeccion:'badge-gray', calificacion:'badge-cyan', propuesta:'badge-purple', negociacion:'badge-orange' };
  const getNombre  = id => { const c = cuentas.find(c => c.id === id); return c?.razon_social || c?.nombre_comercial || id; };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">BI Comercial</h1><div className="page-sub">Pipeline, leads y rendimiento comercial · Abril 2026</div></div>
        <button className="btn btn-secondary">{I.download} Exportar</button>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Forecast pipeline</div><div className="kpi-value" style={{fontSize:20}}>{money(forecastTotal)}</div><div className="kpi-icon cyan">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">Tasa de cierre</div><div className="kpi-value" style={{color:tasaCierre>=50?'var(--green)':'var(--orange)'}}>{tasaCierre}%</div><div className={'kpi-icon '+(tasaCierre>=50?'green':'orange')}>{I.target}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ticket promedio</div><div className="kpi-value" style={{fontSize:20}}>{money(ticketProm)}</div><div className="kpi-icon purple">{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Leads activos</div><div className="kpi-value">{leadsActivos}</div><div className="kpi-icon orange">{I.users}</div></div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='pipeline'?'active':'')} onClick={()=>setTab('pipeline')}>Pipeline</div>
        <div className={'tab '+(tab==='leads'?'active':'')} onClick={()=>setTab('leads')}>Leads y Fuentes</div>
        <div className={'tab '+(tab==='rendimiento'?'active':'')} onClick={()=>setTab('rendimiento')}>Rendimiento Comercial</div>
      </div>

      {tab === 'pipeline' && (
        <div style={{display:'grid', gap:20}}>
          <div className="card">
            <div className="card-head"><h3>Embudo de Ventas</h3><span className="text-muted" style={{fontSize:12}}>{oportunidades.length} oportunidades</span></div>
            <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:14}}>
              {funnel.map((f, i) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'120px 1fr 48px 120px', gap:12, alignItems:'center'}}>
                  <span style={{fontSize:13, fontWeight:500, color:f.key==='perdida'?'var(--fg-muted)':'var(--fg)'}}>{f.label}</span>
                  <div style={{height:10, background:'var(--bg-subtle)', borderRadius:4}}>
                    {f.valor > 0 && <div style={{width:Math.round(f.valor/maxFunnelValor*100)+'%', height:'100%', background:f.color, borderRadius:4}}/>}
                  </div>
                  <span style={{fontSize:13, fontWeight:700, color:f.color, textAlign:'center'}}>{f.count}</span>
                  <span style={{fontSize:12, color:'var(--fg-muted)', textAlign:'right'}}>{money(f.valor)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Oportunidades abiertas</h3><span className="badge badge-cyan">{oppsAbiertas.length}</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Oportunidad</th><th>Etapa</th><th>Responsable</th><th>Fuente</th><th className="num">Monto est.</th><th className="num">Forecast</th><th>Cierre est.</th></tr></thead>
                <tbody>
                  {oppsAbiertas.sort((a,b)=>(b.forecast_ponderado||0)-(a.forecast_ponderado||0)).map(o => (
                    <tr key={o.id} className="hover-row">
                      <td><div style={{fontWeight:600,fontSize:13}}>{o.nombre}</div><div className="text-muted" style={{fontSize:11}}>{getNombre(o.cuenta_id)}</div></td>
                      <td><span className={'badge '+(etapaBadge[o.etapa]||'badge-gray')} style={{textTransform:'capitalize'}}>{o.etapa}</span></td>
                      <td>{o.responsable}</td>
                      <td><span className="badge badge-gray" style={{fontSize:11}}>{o.fuente}</span></td>
                      <td className="num">{money(o.monto_estimado)}</td>
                      <td className="num"><strong style={{color:'var(--green)'}}>{money(o.forecast_ponderado||0)}</strong></td>
                      <td className="text-muted" style={{fontSize:12}}>{o.fecha_cierre_estimada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Leads por Fuente</h3><span className="text-muted" style={{fontSize:12}}>{leads.length} total</span></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:14}}>
                {fuentesArr.map(([fuente, cnt], i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'150px 1fr 32px', gap:10, alignItems:'center'}}>
                    <span style={{fontSize:13}}>{fuente}</span>
                    <div style={{height:8, background:'var(--bg-subtle)', borderRadius:4}}>
                      <div style={{width:Math.round(cnt/maxFuente*100)+'%', height:'100%', background:'var(--cyan)', borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:13, fontWeight:700}}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Leads por Urgencia</h3></div>
              <div style={{padding:'24px', display:'flex', flexDirection:'column', gap:16}}>
                {[{k:'alta',label:'Alta urgencia',color:'var(--danger)',badge:'badge-red'},{k:'media',label:'Media urgencia',color:'var(--orange)',badge:'badge-orange'},{k:'baja',label:'Baja urgencia',color:'var(--green)',badge:'badge-green'}].map(u => (
                  <div key={u.k} className="row" style={{justifyContent:'space-between', padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid '+u.color}}>
                    <span style={{fontSize:13, fontWeight:500}}>{u.label}</span>
                    <span className={'badge '+u.badge} style={{fontSize:14, padding:'2px 12px'}}>{urgMap[u.k]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Leads — Detalle</h3></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Nombre</th><th>Empresa</th><th>Fuente</th><th>Urgencia</th><th className="num">Presupuesto est.</th><th>Responsable</th><th>Estado</th></tr></thead>
                <tbody>
                  {filteredLeads.map(l => (
                    <tr key={l.id} className="hover-row">
                      <td style={{fontWeight:600}}>{l.nombre}</td>
                      <td>{l.empresa_contacto}</td>
                      <td><span className="badge badge-gray" style={{fontSize:11}}>{l.fuente}</span></td>
                      <td><span className={'badge '+(l.urgencia==='alta'?'badge-red':l.urgencia==='media'?'badge-orange':'badge-green')} style={{fontSize:11}}>{l.urgencia}</span></td>
                      <td className="num">{money(l.presupuesto_estimado)}</td>
                      <td>{l.responsable}</td>
                      <td><span className={'badge '+(l.estado==='calificado'?'badge-cyan':l.estado==='nuevo'?'badge-gray':l.estado==='en_contacto'?'badge-purple':'badge-orange')} style={{textTransform:'capitalize'}}>{l.estado.replace('_',' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'rendimiento' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Ventas cerradas — últimos 6 meses</h3></div>
              <div style={{padding:'20px 24px'}}>
                <div style={{display:'flex', gap:8, alignItems:'flex-end', height:160}}>
                  {tendencia.map((t, i) => (
                    <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
                      <div style={{flex:1, width:'100%', display:'flex', alignItems:'flex-end'}}>
                        <div style={{width:'100%', height:Math.round(t.valor/maxTend*140)+'px', background:i===5?'var(--cyan)':'var(--navy)', borderRadius:'3px 3px 0 0', opacity:i===5?1:0.65}}/>
                      </div>
                      <div style={{fontSize:11, color:'var(--fg-subtle)'}}>{t.mes}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Forecast por Responsable</h3></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:16}}>
                {Object.entries(respMap).sort((a,b)=>b[1].forecast-a[1].forecast).map(([resp, data], i) => (
                  <div key={i}>
                    <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                      <span style={{fontSize:13, fontWeight:500}}>{resp}</span>
                      <span style={{fontSize:12, color:'var(--fg-muted)'}}>{data.count} opp · <strong style={{color:'var(--fg)'}}>{money(data.forecast)}</strong></span>
                    </div>
                    <div style={{height:7, background:'var(--bg-subtle)', borderRadius:4}}>
                      <div style={{width:Math.round(data.forecast/maxResp*100)+'%', height:'100%', background:'var(--cyan)', borderRadius:4}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Análisis de Competencia</h3></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Oportunidad</th><th>Responsable</th><th>Competidor</th><th>Estado</th><th className="num">Monto</th><th>Probabilidad</th></tr></thead>
                <tbody>
                  {oportunidades.filter(o => o.competidor).map(o => (
                    <tr key={o.id} className="hover-row">
                      <td style={{fontWeight:600}}>{o.nombre}</td>
                      <td>{o.responsable}</td>
                      <td><span className="badge badge-orange" style={{fontSize:11}}>{o.competidor}</span></td>
                      <td><span className={'badge '+(o.estado==='ganada'?'badge-green':o.estado==='perdida'?'badge-red':'badge-cyan')}>{o.estado}</span></td>
                      <td className="num">{money(o.monto_estimado)}</td>
                      <td>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <div style={{width:80, height:6, background:'var(--bg-subtle)', borderRadius:3}}>
                            <div style={{width:o.probabilidad+'%', height:'100%', background:o.probabilidad>=70?'var(--green)':o.probabilidad>=40?'var(--orange)':'var(--danger)', borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:12, fontWeight:600}}>{o.probabilidad}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BIOperativo() {
  const [tab, setTab] = useState('ots');
  const { ots, partes, backlog, cuentas } = useApp();

  const otsMes = [
    ...ots,
    { id:'ot_e1', numero:'OT-25-0011', cliente:'Planta Industrial Norte', tipo:'Preventiva', estado:'cerrada', avance:100, sla:'ok',     responsable:'Luis Mendoza',  costoEst:6000,  costoReal:5800  },
    { id:'ot_e2', numero:'OT-25-0010', cliente:'Logística Altiplano',      tipo:'Correctiva',estado:'cerrada', avance:100, sla:'riesgo',  responsable:'Carlos Reyes',  costoEst:12000, costoReal:13500 },
    { id:'ot_e3', numero:'OT-25-0009', cliente:'Minera Andes SAC',         tipo:'Preventiva', estado:'cerrada', avance:100, sla:'ok',     responsable:'Rosa Huanca',   costoEst:9000,  costoReal:8700  },
    { id:'ot_e4', numero:'OT-25-0008', cliente:'Facilities Lima',          tipo:'Proyectiva', estado:'ejecucion',avance:65, sla:'ok',    responsable:'Pedro Condori', costoEst:18000, costoReal:11200 },
  ];

  const otsCerradas = otsMes.filter(o => o.estado === 'cerrada').length;
  const slaPct      = Math.round(otsMes.filter(o => o.sla === 'ok').length / otsMes.length * 100);
  const horasMes    = partes.reduce((s, p) => s + p.horas, 0);
  const avanceProm  = Math.round(otsMes.reduce((s, o) => s + (o.avance || 0), 0) / otsMes.length);

  const tipoMap = {};
  otsMes.forEach(o => { tipoMap[o.tipo] = (tipoMap[o.tipo] || 0) + 1; });
  const maxTipo = Math.max(...Object.values(tipoMap), 1);

  const respMap = {};
  otsMes.forEach(o => {
    if (!respMap[o.responsable]) respMap[o.responsable] = { total: 0, cerradas: 0, horas: 0 };
    respMap[o.responsable].total++;
    if (o.estado === 'cerrada') respMap[o.responsable].cerradas++;
  });
  partes.forEach(p => {
    if (respMap[p.tecnico]) respMap[p.tecnico].horas += p.horas;
    else respMap[p.tecnico] = { total: 0, cerradas: 0, horas: p.horas };
  });
  const maxRespTotal = Math.max(...Object.values(respMap).map(r => r.total), 1);

  const tendencia = [
    { mes:'Nov', ots:12, cerradas:10 },
    { mes:'Dic', ots:8,  cerradas:7  },
    { mes:'Ene', ots:15, cerradas:13 },
    { mes:'Feb', ots:11, cerradas:9  },
    { mes:'Mar', ots:14, cerradas:12 },
    { mes:'Abr', ots:otsMes.length, cerradas:otsCerradas },
  ];
  const maxOts = Math.max(...tendencia.map(t => t.ots), 1);

  const bkPend     = backlog.filter(b => b.estado === 'pendiente');
  const bkPriority = { alta: bkPend.filter(b=>b.prioridad==='alta').length, media: bkPend.filter(b=>b.prioridad==='media').length, baja: bkPend.filter(b=>b.prioridad==='baja').length };

  const otsCerDat  = otsMes.filter(o => o.estado === 'cerrada' && (o.costoEst || 0) > 0);
  const eficiencia = otsCerDat.length > 0 ? Math.round(otsCerDat.reduce((s, o) => s + (o.costoReal || 0) / (o.costoEst || 1) * 100, 0) / otsCerDat.length) : 100;

  const tipoColors = ['var(--cyan)','var(--purple)','var(--orange)','var(--green)'];

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">BI Operativo</h1><div className="page-sub">Rendimiento de OTs, técnicos y SLAs · Abril 2026</div></div>
        <button className="btn btn-secondary">{I.download} Exportar</button>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">OTs del mes</div><div className="kpi-value">{otsMes.length}</div><div className="kpi-icon cyan">{I.wrench}</div></div>
        <div className="kpi-card"><div className="kpi-label">Completadas</div><div className="kpi-value" style={{color:'var(--green)'}}>{otsCerradas}</div><div className="kpi-icon green">{I.check}</div></div>
        <div className="kpi-card"><div className="kpi-label">Avance promedio</div><div className="kpi-value">{avanceProm}%</div><div className="kpi-icon purple">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">SLA cumplido</div><div className="kpi-value" style={{color:slaPct>=80?'var(--green)':'var(--orange)'}}>{slaPct}%</div><div className={'kpi-icon '+(slaPct>=80?'green':'orange')}>{I.shield}</div></div>
        <div className="kpi-card"><div className="kpi-label">Horas campo</div><div className="kpi-value">{horasMes}h</div><div className="kpi-icon orange">{I.clock}</div></div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='ots'?'active':'')} onClick={()=>setTab('ots')}>OTs y Ejecución</div>
        <div className={'tab '+(tab==='recursos'?'active':'')} onClick={()=>setTab('recursos')}>Recursos</div>
        <div className={'tab '+(tab==='backlog'?'active':'')} onClick={()=>setTab('backlog')}>Backlog y Alertas</div>
      </div>

      {tab === 'ots' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Tendencia OTs — últimos 6 meses</h3></div>
              <div style={{padding:'20px 24px'}}>
                <div style={{display:'flex', gap:6, alignItems:'flex-end', height:160}}>
                  {tendencia.map((t, i) => (
                    <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                      <div style={{flex:1, width:'100%', display:'flex', gap:3, alignItems:'flex-end'}}>
                        <div style={{flex:1, height:Math.round(t.ots/maxOts*140)+'px', background:i===5?'var(--cyan)':'var(--navy)', borderRadius:'2px 2px 0 0', opacity:i===5?1:0.6}}/>
                        <div style={{flex:1, height:Math.round(t.cerradas/maxOts*140)+'px', background:'var(--green)', borderRadius:'2px 2px 0 0', opacity:0.75}}/>
                      </div>
                      <div style={{fontSize:11, color:'var(--fg-subtle)'}}>{t.mes}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex', gap:16, marginTop:12, fontSize:12}}>
                  <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:10,height:10,borderRadius:2,background:'var(--navy)',display:'inline-block'}}/> Total</span>
                  <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:10,height:10,borderRadius:2,background:'var(--green)',display:'inline-block'}}/> Completadas</span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>OTs por Tipo</h3></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:14}}>
                {Object.entries(tipoMap).sort((a,b)=>b[1]-a[1]).map(([tipo, cnt], i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'120px 1fr 40px', gap:10, alignItems:'center'}}>
                    <span style={{fontSize:13}}>{tipo}</span>
                    <div style={{height:10, background:'var(--bg-subtle)', borderRadius:4}}>
                      <div style={{width:Math.round(cnt/maxTipo*100)+'%', height:'100%', background:tipoColors[i%tipoColors.length], borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:13, fontWeight:700, textAlign:'right'}}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>OTs — Estado actual</h3><span className="text-muted" style={{fontSize:12}}>{otsMes.length} OTs este mes</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>OT</th><th>Cliente</th><th>Tipo</th><th>Responsable</th><th>Avance</th><th>SLA</th><th>Estado</th></tr></thead>
                <tbody>
                  {otsMes.map(o => (
                    <tr key={o.id} className="hover-row">
                      <td className="mono" style={{fontWeight:600}}>{o.numero}</td>
                      <td><strong>{o.cliente}</strong></td>
                      <td><span className="badge badge-cyan" style={{fontSize:11}}>{o.tipo}</span></td>
                      <td>{o.responsable}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:80,height:6,background:'var(--bg-subtle)',borderRadius:3}}>
                            <div style={{width:(o.avance||0)+'%',height:'100%',background:o.avance===100?'var(--green)':o.avance>50?'var(--cyan)':'var(--orange)',borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:12,fontWeight:600,minWidth:28}}>{o.avance||0}%</span>
                        </div>
                      </td>
                      <td><span className={'badge '+(o.sla==='ok'?'badge-green':'badge-orange')}>{(o.sla || '').toUpperCase()}</span></td>
                      <td><span className={'badge '+(o.estado==='cerrada'?'badge-purple':o.estado==='ejecucion'?'badge-cyan':'badge-gray')}>{o.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'recursos' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>OTs por Técnico</h3></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:16}}>
                {Object.entries(respMap).sort((a,b)=>b[1].total-a[1].total).map(([resp, data], i) => (
                  <div key={i}>
                    <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                      <span style={{fontSize:13, fontWeight:500}}>{resp}</span>
                      <span style={{fontSize:12, color:'var(--fg-muted)'}}>{data.total} OTs · {data.horas}h</span>
                    </div>
                    <div style={{display:'flex', height:8, borderRadius:4, overflow:'hidden'}}>
                      <div style={{flex:data.cerradas, background:'var(--green)'}}/>
                      <div style={{flex:data.total-data.cerradas, background:'var(--cyan)', opacity:0.5}}/>
                    </div>
                    <div style={{display:'flex', gap:12, marginTop:4, fontSize:11, color:'var(--fg-muted)'}}>
                      <span style={{color:'var(--green)'}}>■ {data.cerradas} cerradas</span>
                      <span style={{color:'var(--cyan)'}}>■ {data.total-data.cerradas} en curso</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Eficiencia de Costo</h3><span className="badge badge-cyan">Real vs. Estimado</span></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:14}}>
                {otsCerDat.map(o => {
                  const pct = o.costoEst > 0 ? Math.round((o.costoReal||0)/o.costoEst*100) : 0;
                  return (
                    <div key={o.id} style={{display:'grid', gridTemplateColumns:'110px 1fr 46px', gap:10, alignItems:'center'}}>
                      <span className="mono" style={{fontSize:12}}>{o.numero}</span>
                      <div style={{height:8, background:'var(--bg-subtle)', borderRadius:4}}>
                        <div style={{width:Math.min(pct,100)+'%', height:'100%', background:pct>100?'var(--danger)':pct>90?'var(--orange)':'var(--green)', borderRadius:4}}/>
                      </div>
                      <span style={{fontSize:12, fontWeight:700, textAlign:'right', color:pct>100?'var(--danger)':pct>90?'var(--orange)':'var(--green)'}}>{pct}%</span>
                    </div>
                  );
                })}
                <div style={{padding:'12px 0', borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', fontSize:13}}>
                  <span className="text-muted">Eficiencia promedio</span>
                  <strong style={{color:eficiencia<=100?'var(--green)':'var(--danger)'}}>{eficiencia}%</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Partes diarios registrados</h3><span className="badge badge-cyan">{partes.length}</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Parte</th><th>OT</th><th>Técnico</th><th>Fecha</th><th>Horas</th><th>Avance</th><th>Estado</th></tr></thead>
                <tbody>
                  {partes.map(p => (
                    <tr key={p.id} className="hover-row">
                      <td className="mono" style={{fontWeight:600}}>{p.id}</td>
                      <td className="mono text-muted">{ots.find(o=>o.id===p.ot_id)?.numero||p.ot_id}</td>
                      <td>{p.tecnico}</td>
                      <td className="text-muted">{p.fecha}</td>
                      <td className="num" style={{fontWeight:600}}>{p.horas}h</td>
                      <td><span className="badge badge-cyan">{p.avance_reportado}%</span></td>
                      <td><span className={'badge '+(p.estado==='aprobado'?'badge-green':'badge-orange')}>{p.estado.replace('_',' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'backlog' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Backlog pendiente</h3><span className="badge badge-orange">{bkPend.length}</span></div>
              <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:16}}>
                {[{k:'alta',l:'Alta prioridad',color:'var(--danger)',b:'badge-red'},{k:'media',l:'Media prioridad',color:'var(--orange)',b:'badge-orange'},{k:'baja',l:'Baja prioridad',color:'var(--green)',b:'badge-green'}].map(pr => (
                  <div key={pr.k} className="row" style={{justifyContent:'space-between', padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid '+pr.color}}>
                    <span style={{fontSize:13, fontWeight:500}}>{pr.l}</span>
                    <span className={'badge '+pr.b} style={{fontSize:14, padding:'2px 12px'}}>{bkPriority[pr.k]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>OTs con SLA en riesgo</h3></div>
              <div style={{padding:'16px 24px'}}>
                {otsMes.filter(o=>o.sla!=='ok').length === 0 ? (
                  <div style={{textAlign:'center', padding:32, color:'var(--green)'}}>
                    <div style={{fontSize:28, marginBottom:8}}>✓</div>
                    <div style={{fontWeight:600}}>Sin OTs con SLA en riesgo</div>
                  </div>
                ) : otsMes.filter(o=>o.sla!=='ok').map(o => (
                  <div key={o.id} style={{padding:'12px', border:'1px solid var(--border)', borderRadius:8, marginBottom:12, borderLeft:'3px solid var(--danger)'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong className="mono">{o.numero}</strong>
                      <span className="badge badge-orange">{(o.sla || '').toUpperCase()}</span>
                    </div>
                    <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:4}}>{o.cliente} · {o.responsable}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Requerimientos pendientes de programación</h3></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>ID</th><th>Prioridad</th><th>Cliente</th><th>Título</th><th>Origen</th><th>Fecha</th></tr></thead>
                <tbody>
                  {bkPend.map(b => {
                    const cuenta = cuentas.find(c=>c.id===b.cuenta_id);
                    return (
                      <tr key={b.id} className="hover-row">
                        <td className="mono">{b.id}</td>
                        <td><span className={'badge '+(b.prioridad==='alta'?'badge-red':b.prioridad==='media'?'badge-orange':'badge-green')}>{(b.prioridad || '').toUpperCase()}</span></td>
                        <td><strong>{cuenta?.razon_social||b.cuenta_id}</strong></td>
                        <td style={{maxWidth:200}}>{b.titulo}</td>
                        <td className="text-muted" style={{fontSize:12}}>{b.origen}</td>
                        <td className="text-muted">{b.fecha}</td>
                      </tr>
                    );
                  })}
                  {bkPend.length===0 && <tr><td colSpan="6" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>Backlog limpio</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ AGENDA COMERCIAL ============
function AgendaComercial() {
  const { agendaEventos, cuentas, role, actualizarAgendaEvento, registrarActividad, searchQuery } = useApp();
  const getAgendaCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;

  const [view, setView] = useState('calendario'); // 'calendario' | 'semana' | 'dia' | 'lista'
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [eventoRealizado, setEventoRealizado] = useState(null);
  const [mesVisible, setMesVisible] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);

  // Jefes, supervisores, gerencia y admins ven la agenda del equipo completo.
  const puedeVerEquipo = Boolean(
    role.permisos?.ver_agenda_equipo ||
    role.permisos?.tenant_admin ||
    role.permisos?.plataforma ||
    /jefe|supervisor|gerente|administrador|admin/i.test(role.nombre || '')
  );
  const usuarioSimulado = 'Carla Meza';

  const query = searchQuery.toLowerCase();
  const eventosFiltrados = agendaEventos.filter(e => {
    if (!puedeVerEquipo && e.vendedor !== usuarioSimulado) return false;
    if (filtroVendedor && e.vendedor !== filtroVendedor) return false;
    if (filtroTipo && e.tipo !== filtroTipo) return false;
    
    const matchesQuery = !query || 
      e.titulo.toLowerCase().includes(query) ||
      (e.tipo || '').toLowerCase().includes(query) ||
      getAgendaCuentaNombre(e.cuenta_id).toLowerCase().includes(query) ||
      (e.vendedor || '').toLowerCase().includes(query);
      
    return matchesQuery;
  });

  const getIcon = (tipo) => {
    switch(tipo) {
      case 'llamada': return I.phone;
      case 'reunion': return I.users;
      case 'visita': return I.mapPin;
      case 'demo': return I.sparkles;
      default: return I.calendar;
    }
  };

  const getBadgeColor = (estado) => {
    switch(estado) {
      case 'programado': return 'badge-cyan';
      case 'realizado': return 'badge-green';
      case 'cancelado': return 'badge-red';
      case 'reprogramado': return 'badge-orange';
      default: return 'badge-purple';
    }
  };
  const getRegistrador = (evento) => evento.registrado_por || evento.vendedor || 'Sin asignar';

  const today = new Date().toISOString().split('T')[0];
  const eventosHoy = eventosFiltrados.filter(e => e.fecha === today);
  const realizados = eventosFiltrados.filter(e => e.estado === 'realizado').length;
  const tasaRealizacion = eventosFiltrados.length ? Math.round((realizados / eventosFiltrados.length) * 100) : 0;

  const uniqueVendedores = [...new Set(agendaEventos.map(e => e.vendedor))];
  const parseISODate = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const dateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const getWeekStart = (date) => {
    const d = new Date(date);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  };
  const hourFromEvent = (event) => Number(String(event.hora || '00:00').split(':')[0]);
  const eventosPorDia = (key) => eventosFiltrados
    .filter(e => e.fecha === key)
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  const monthLabel = mesVisible.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const selectedDate = parseISODate(fechaSeleccionada);
  const semanaInicio = getWeekStart(selectedDate);
  const diasSemana = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(semanaInicio);
    d.setDate(semanaInicio.getDate() + idx);
    const key = dateKey(d);
    return { date: d, key, events: eventosPorDia(key), isToday: key === today, isSelected: key === fechaSeleccionada };
  });
  const horasAgenda = Array.from({ length: 14 }, (_, idx) => 6 + idx);
  const rangeSemana = `${diasSemana[0].date.toLocaleDateString('es-PE', { day:'numeric', month:'short' })} - ${diasSemana[6].date.toLocaleDateString('es-PE', { day:'numeric', month:'short', year:'numeric' })}`;
  const calendarTitle = view === 'calendario'
    ? monthLabel
    : view === 'semana'
      ? rangeSemana
      : selectedDate.toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const navegarCalendario = (delta) => {
    if (view === 'calendario') {
      setMesVisible(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
      return;
    }
    const d = parseISODate(fechaSeleccionada);
    d.setDate(d.getDate() + (view === 'semana' ? delta * 7 : delta));
    setFechaSeleccionada(dateKey(d));
    setMesVisible(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const irHoy = () => {
    const d = new Date();
    setMesVisible(new Date(d.getFullYear(), d.getMonth(), 1));
    setFechaSeleccionada(dateKey(d));
  };
  const primerDiaMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const offsetLunes = (primerDiaMes.getDay() + 6) % 7;
  const inicioGrid = new Date(primerDiaMes);
  inicioGrid.setDate(primerDiaMes.getDate() - offsetLunes);
  const diasCalendario = Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(inicioGrid);
    d.setDate(inicioGrid.getDate() + idx);
    const key = dateKey(d);
    return {
      date: d,
      key,
      isCurrentMonth: d.getMonth() === mesVisible.getMonth(),
      isToday: key === today,
      isSelected: key === fechaSeleccionada,
      events: eventosFiltrados
        .filter(e => e.fecha === key)
        .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')))
    };
  });
  const eventosSeleccionados = eventosFiltrados
    .filter(e => e.fecha === fechaSeleccionada)
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));

  const cerrarEventoRealizado = (e) => {
    e.preventDefault();
    if (!eventoRealizado) return;
    const fd = new FormData(e.target);
    const resultado = String(fd.get('resultado') || '').trim();
    const proximaAccion = String(fd.get('proxima_accion') || '').trim();
    const proximaAccionFecha = fd.get('proxima_accion_fecha') || null;

    actualizarAgendaEvento(eventoRealizado.id, {
      estado: 'realizado',
      resultado,
      updated_at: new Date().toISOString(),
    });

    registrarActividad({
      tipo: eventoRealizado.tipo,
      vinculo_tipo: eventoRealizado.oportunidad_id ? 'oportunidad' : eventoRealizado.lead_id ? 'lead' : eventoRealizado.cuenta_id ? 'cuenta' : 'agenda',
      vinculo_id: eventoRealizado.oportunidad_id || eventoRealizado.lead_id || eventoRealizado.cuenta_id || eventoRealizado.id,
      cuenta_id: eventoRealizado.cuenta_id || null,
      oportunidad_id: eventoRealizado.oportunidad_id || null,
      lead_id: eventoRealizado.lead_id || null,
      responsable: eventoRealizado.vendedor || getRegistrador(eventoRealizado),
      fecha: eventoRealizado.fecha,
      hora: eventoRealizado.hora,
      descripcion: eventoRealizado.titulo,
      resultado,
      proxima_accion: proximaAccion || null,
      proxima_accion_fecha: proximaAccionFecha || null,
      estado: 'completada',
    });

    setEventoRealizado(null);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agenda Comercial</h1>
          <div className="page-sub">Planificación de visitas, reuniones y demos del equipo</div>
        </div>
        <div className="row">
          <div className="segmented-control" style={{background:'var(--bg)', border:'1px solid var(--border)'}}>
            <button className={`seg-btn ${view==='calendario'?'active':''}`} onClick={()=>setView('calendario')}>{I.calendar} Mes</button>
            <button className={`seg-btn ${view==='semana'?'active':''}`} onClick={()=>setView('semana')}>Semana</button>
            <button className={`seg-btn ${view==='dia'?'active':''}`} onClick={()=>setView('dia')}>Dia</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-primary">{I.plus} Nuevo evento</button>
        </div>
      </div>

      <div className="grid-3" style={{marginBottom: 20}}>
        <div className="card" style={{padding: 16}}>
          <div className="text-muted" style={{fontSize:12}}>Eventos Programados (Hoy)</div>
          <div style={{fontSize: 24, fontWeight: 700}}>{eventosHoy.length}</div>
        </div>
        <div className="card" style={{padding: 16}}>
          <div className="text-muted" style={{fontSize:12}}>Tasa de Realización (Mes)</div>
          <div style={{fontSize: 24, fontWeight: 700, color: 'var(--green)'}}>{tasaRealizacion}%</div>
        </div>
        <div className="card" style={{padding: 16}}>
          <div className="text-muted" style={{fontSize:12}}>Total Eventos ({puedeVerEquipo ? 'Equipo' : 'Mis eventos'})</div>
          <div style={{fontSize: 24, fontWeight: 700}}>{eventosFiltrados.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="row" style={{gap:16}}>
            {puedeVerEquipo && (
              <div className="input-group" style={{margin:0}}>
                <select className="select" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
                  <option value="">Todos los vendedores</option>
                  {uniqueVendedores.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <div className="input-group" style={{margin:0}}>
              <select className="select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="visita">Visitas</option>
                <option value="reunion">Reuniones</option>
                <option value="llamada">Llamadas</option>
                <option value="demo">Demos</option>
              </select>
            </div>
          </div>
        </div>

        {view === 'lista' ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Tipo</th>
                  <th>Título / Prospecto</th>
                  <th>Registrado por</th>
                  <th>Duración</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {eventosFiltrados.map(e => (
                  <tr key={e.id} className="hover-row">
                    <td><strong>{e.fecha}</strong> <span className="text-muted">{e.hora}</span></td>
                    <td>
                      <div className="row" style={{gap:6, textTransform:'capitalize'}}>
                        <span style={{width:16, display:'flex', alignItems:'center', justifyContent:'center'}}>{getIcon(e.tipo)}</span>
                        {e.tipo}
                      </div>
                    </td>
                    <td>
                      <div>{e.titulo}</div>
                      <div className="text-muted" style={{fontSize:12}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'}</div>
                    </td>
                    <td>{getRegistrador(e)}</td>
                    <td>{e.duracion_minutos} min</td>
                    <td><span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span></td>
                  </tr>
                ))}
                {eventosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                      No hay eventos programados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : view === 'calendario' ? (
          <div className="commercial-calendar">
            <div className="calendar-toolbar">
              <div className="row" style={{gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={irHoy}>Hoy</button>
                <button className="icon-btn" onClick={() => navegarCalendario(-1)} title="Anterior">{'<'}</button>
                <button className="icon-btn" onClick={() => navegarCalendario(1)} title="Siguiente">{'>'}</button>
                <div className="calendar-title">{calendarTitle}</div>
              </div>
              <div className="calendar-legend">
                <span><i className="dot dot-visita"/> Visita</span>
                <span><i className="dot dot-reunion"/> Reunion</span>
                <span><i className="dot dot-llamada"/> Llamada</span>
                <span><i className="dot dot-demo"/> Demo</span>
              </div>
            </div>
            <div className="calendar-layout">
              <div className="month-calendar">
                {['LUN','MAR','MIE','JUE','VIE','SAB','DOM'].map(day => (
                  <div key={day} className="calendar-weekday">{day}</div>
                ))}
                {diasCalendario.map(day => (
                  <button
                    key={day.key}
                    className={[
                      'calendar-day',
                      day.isCurrentMonth ? '' : 'muted',
                      day.isToday ? 'today' : '',
                      day.isSelected ? 'selected' : ''
                    ].filter(Boolean).join(' ')}
                    onClick={() => setFechaSeleccionada(day.key)}
                  >
                    <div className="calendar-day-head">
                      <span>{day.date.getDate()}</span>
                      {day.events.length > 0 && <strong>{day.events.length}</strong>}
                    </div>
                    <div className="calendar-events">
                      {day.events.slice(0, 3).map(e => (
                        <div key={e.id} className={`calendar-event event-${e.tipo}`}>
                          <span>{e.hora}</span>
                          <strong>{e.titulo}</strong>
                          <em>{getRegistrador(e)}</em>
                        </div>
                      ))}
                      {day.events.length > 3 && <div className="calendar-more">+{day.events.length - 3} mas</div>}
                    </div>
                  </button>
                ))}
              </div>
              <aside className="calendar-day-panel">
                <div className="eyebrow">Dia seleccionado</div>
                <h3>{parseISODate(fechaSeleccionada).toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long' })}</h3>
                <div className="calendar-day-list">
                  {eventosSeleccionados.map(e => (
                    <div key={e.id} className={`calendar-detail event-${e.tipo}`}>
                      <div className="row" style={{justifyContent:'space-between', gap:10}}>
                        <strong>{e.hora} - {e.titulo}</strong>
                        <span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span>
                      </div>
                      <div className="text-muted" style={{fontSize:12}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'} - {e.tipo} - {e.duracion_minutos} min</div>
                      <div className="calendar-owner">{I.user} Registrado por: {getRegistrador(e)}</div>
                      {e.estado !== 'realizado' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => setEventoRealizado(e)}>
                          {I.check} Realizado
                        </button>
                      )}
                    </div>
                  ))}
                  {eventosSeleccionados.length === 0 && (
                    <div className="calendar-empty">No hay eventos para este dia.</div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        ) : view === 'semana' ? (
          <div className="commercial-calendar">
            <div className="calendar-toolbar">
              <div className="row" style={{gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={irHoy}>Hoy</button>
                <button className="icon-btn" onClick={() => navegarCalendario(-1)} title="Semana anterior">{'<'}</button>
                <button className="icon-btn" onClick={() => navegarCalendario(1)} title="Semana siguiente">{'>'}</button>
                <div className="calendar-title">{calendarTitle}</div>
              </div>
              <div className="calendar-legend">
                <span><i className="dot dot-visita"/> Visita</span>
                <span><i className="dot dot-reunion"/> Reunion</span>
                <span><i className="dot dot-llamada"/> Llamada</span>
                <span><i className="dot dot-demo"/> Demo</span>
              </div>
            </div>
            <div className="week-calendar">
              <div className="week-head week-time">GMT-05</div>
              {diasSemana.map(day => (
                <button
                  key={day.key}
                  className={`week-head ${day.isToday ? 'today' : ''} ${day.isSelected ? 'selected' : ''}`}
                  onClick={() => setFechaSeleccionada(day.key)}
                >
                  <span>{day.date.toLocaleDateString('es-PE', { weekday:'short' })}</span>
                  <strong>{day.date.getDate()}</strong>
                </button>
              ))}
              {horasAgenda.map(hour => (
                <React.Fragment key={hour}>
                  <div className="week-time">{String(hour).padStart(2, '0')}:00</div>
                  {diasSemana.map(day => {
                    const events = day.events.filter(e => hourFromEvent(e) === hour);
                    return (
                      <div key={`${day.key}-${hour}`} className="week-slot">
                        {events.map(e => (
                          <div key={e.id} className={`week-event event-${e.tipo}`}>
                            <strong>{e.hora} {e.titulo}</strong>
                            <span>{getRegistrador(e)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : view === 'dia' ? (
          <div className="commercial-calendar">
            <div className="calendar-toolbar">
              <div className="row" style={{gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={irHoy}>Hoy</button>
                <button className="icon-btn" onClick={() => navegarCalendario(-1)} title="Dia anterior">{'<'}</button>
                <button className="icon-btn" onClick={() => navegarCalendario(1)} title="Dia siguiente">{'>'}</button>
                <div className="calendar-title">{calendarTitle}</div>
              </div>
            </div>
            <div className="day-calendar">
              {horasAgenda.map(hour => {
                const events = eventosSeleccionados.filter(e => hourFromEvent(e) === hour);
                return (
                  <div key={hour} className="day-hour">
                    <div className="week-time">{String(hour).padStart(2, '0')}:00</div>
                    <div className="day-slot">
                      {events.map(e => (
                        <div key={e.id} className={`day-event event-${e.tipo}`}>
                          <div className="row" style={{justifyContent:'space-between', gap:10}}>
                            <strong>{e.hora} - {e.titulo}</strong>
                            <span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span>
                          </div>
                          <div className="text-muted" style={{fontSize:12}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'} - {e.tipo} - {e.duracion_minutos} min</div>
                          <div className="calendar-owner">{I.user} Registrado por: {getRegistrador(e)}</div>
                          {e.estado !== 'realizado' && (
                            <button className="btn btn-sm btn-secondary" onClick={() => setEventoRealizado(e)}>
                              {I.check} Realizado
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {eventosSeleccionados.length === 0 && (
                <div className="calendar-empty" style={{margin:16}}>No hay eventos para este dia.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{padding: 20}}>
            {/* Visualización simplificada de calendario tipo agenda */}
            <div className="eyebrow" style={{marginBottom: 10}}>Próximos eventos</div>
            <div className="col" style={{gap: 12}}>
              {eventosFiltrados.sort((a,b) => a.fecha.localeCompare(b.fecha)).map(e => (
                <div key={e.id} className="row card hover-raise" style={{padding: 14, gap: 16, borderLeft: `4px solid var(--${e.tipo==='visita'?'green':e.tipo==='reunion'?'cyan':'purple'})`}}>
                  <div style={{textAlign: 'center', minWidth: 60}}>
                    <div style={{fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase'}}>{new Date(e.fecha).toLocaleDateString('es-ES', {weekday: 'short'})}</div>
                    <div style={{fontSize: 20, fontWeight: 800}}>{new Date(e.fecha).getDate()}</div>
                    <div style={{fontSize: 12, color: 'var(--fg-muted)'}}>{e.hora}</div>
                  </div>
                  <div style={{flex: 1}}>
                    <div className="row" style={{justifyContent: 'space-between', marginBottom: 4}}>
                      <div style={{fontWeight: 600, fontSize: 15}}>{e.titulo}</div>
                      <span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span>
                    </div>
                    <div className="text-muted" style={{fontSize: 13, marginBottom: 8}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'}</div>
                    <div className="row" style={{gap: 12, fontSize: 12, color: 'var(--fg-muted)'}}>
                      <span className="row" style={{gap:4}}><span style={{width:14, height:14}}>{getIcon(e.tipo)}</span> {e.tipo}</span>
                      <span className="row" style={{gap:4}}><span style={{width:14, height:14}}>{I.user}</span> {getRegistrador(e)}</span>
                    </div>
                  </div>
                  <div className="row" style={{gap:8}}>
                    {e.estado !== 'realizado' && (
                      <button className="btn btn-sm btn-secondary" onClick={() => setEventoRealizado(e)}>
                        {I.check} Realizado
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {eventoRealizado && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Cerrar evento de agenda</div>
                <h2>{eventoRealizado.titulo}</h2>
              </div>
              <button className="icon-btn" onClick={() => setEventoRealizado(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={cerrarEventoRealizado}>
              <div className="grid-2">
                <div>
                  <div className="eyebrow">Fecha y hora</div>
                  <div style={{fontWeight:700}}>{eventoRealizado.fecha} {eventoRealizado.hora}</div>
                </div>
                <div>
                  <div className="eyebrow">Comercial</div>
                  <div style={{fontWeight:700}}>{eventoRealizado.vendedor || getRegistrador(eventoRealizado)}</div>
                </div>
              </div>
              <div className="input-group">
                <label>Resultado de la reunion / visita</label>
                <textarea name="resultado" className="input" rows="4" required placeholder="Ej: Cliente confirma interes, solicita propuesta con alcance ajustado."></textarea>
              </div>
              <div className="input-group">
                <label>Proxima accion</label>
                <input name="proxima_accion" className="input" placeholder="Ej: Enviar cotizacion actualizada" />
              </div>
              <div className="input-group">
                <label>Fecha proxima accion</label>
                <input name="proxima_accion_fecha" type="date" className="input" />
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setEventoRealizado(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.check} Marcar realizado y crear actividad</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export { Dashboard, Leads, Marketing, BIComercial, BIOperativo, Pipeline, Actividades, AgendaComercial, OSCliente };
