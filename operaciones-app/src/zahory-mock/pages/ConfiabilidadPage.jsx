import React, { useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

export const KPIsConfiabilidad = () => {
  const data = ZAHORY_SAC_DATA.kpis_confiabilidad;
  const [filtroEquipo, setFiltroEquipo] = useState('todos');
  const [tabActivo, setTabActivo] = useState('resumen');

  // Helpers
  const getMRBadge = (mr) =>
    mr < 0.20 ? 'badge green' : mr < 0.30 ? 'badge orange' : 'badge red';
  const getMRLabel = (mr) =>
    mr < 0.20 ? 'Óptimo' : mr < 0.30 ? 'Aceptable' : 'Crítico';
  const getMRColor = (mr) =>
    mr < 0.20 ? '#15803d' : mr < 0.30 ? '#d97706' : '#dc2626';
  const getMTBFBadge = (equipo) =>
    equipo.estado_confiabilidad === 'ok' ? 'badge green'
    : equipo.estado_confiabilidad === 'alerta' ? 'badge orange' : 'badge red';
  const getMTBFColor = (equipo) =>
    equipo.estado_confiabilidad === 'ok' ? '#15803d'
    : equipo.estado_confiabilidad === 'alerta' ? '#d97706' : '#dc2626';
  const getTendenciaIcon = (t) =>
    t === 'mejora' ? '↑' : t === 'deterioro' ? '↓' : '→';
  const getTendenciaColor = (t) =>
    t === 'mejora' ? '#15803d' : t === 'deterioro' ? '#dc2626' : 'var(--text-muted)';

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>KPIs de Confiabilidad</h1>
          <div className="sub">{data.periodo} · Análisis de disponibilidad, fallas y mantenimiento</div>
        </div>
      </div>

      {/* ── SECCIÓN 1: KPIs GLOBALES ── */}
      <div className="report-kpi-grid">
        <div className="kpi green-soft">
          <div className="kpi-header">
            <div className="label">MTBF Promedio</div>
            <div className="kpi-icon-wrap"><Icon name="check" size={16}/></div>
          </div>
          <div className="value" style={{ color:'#15803d', fontFamily:'ui-monospace,monospace' }}>
            {data.globales.mtbf_promedio}h
          </div>
          <div className="sub">Horas entre fallas · flota completa</div>
        </div>

        <div className="kpi orange-soft">
          <div className="kpi-header">
            <div className="label">MTTR Promedio</div>
            <div className="kpi-icon-wrap"><Icon name="clock" size={16}/></div>
          </div>
          <div className="value" style={{ color:'#d97706', fontFamily:'ui-monospace,monospace' }}>
            {data.globales.mttr_promedio}h
          </div>
          <div className="sub">Horas promedio para reparar</div>
        </div>

        <div className="kpi cyan-soft">
          <div className="kpi-header">
            <div className="label">DMR Promedio Flota</div>
            <div className="kpi-icon-wrap"><Icon name="orders" size={16}/></div>
          </div>
          <div className="value" style={{ color:'#0891b2' }}>
            {data.globales.dmr_promedio}%
          </div>
          <div className="sub">Disponibilidad mecánica real</div>
        </div>

        <div className={data.globales.maintenance_ratio < 0.20 ? 'kpi green-soft' : data.globales.maintenance_ratio < 0.30 ? 'kpi orange-soft' : 'kpi red-soft'}>
          <div className="kpi-header">
            <div className="label">Maintenance Ratio</div>
            <div className="kpi-icon-wrap"><Icon name="alert" size={16}/></div>
          </div>
          <div className="value" style={{ color: getMRColor(data.globales.maintenance_ratio) }}>
            {data.globales.maintenance_ratio.toFixed(2)}
          </div>
          <div className="sub">
            <span className={getMRBadge(data.globales.maintenance_ratio)}>
              <span className="dot"/> {getMRLabel(data.globales.maintenance_ratio)}
            </span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(meta: &lt; 0.20)</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="report-toolbar">
        <div className="report-tabs">
          {[
            { key:'resumen',   label:'Resumen por equipo' },
            { key:'tendencia', label:'Tendencia histórica' },
            { key:'pareto',    label:'Pareto de fallas' },
            { key:'pm_ratio',  label:'PM vs Correctivo' },
          ].map(tab => (
            <button key={tab.key}
              className={'report-tab' + (tabActivo === tab.key ? ' active' : '')}
              onClick={() => setTabActivo(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB 1: RESUMEN POR EQUIPO ── */}
      {tabActivo === 'resumen' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {['Equipo','MTBF','MTTR','DMR Real','Meta DMR','Maint. Ratio','Tendencia','Estado'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.por_equipo
                  .sort((a,b) => a.mtbf - b.mtbf)
                  .map(eq => (
                  <tr key={eq.equipo_id}>
                    <td>
                      <div style={{ fontWeight:700, fontSize:13 }}>{eq.equipo_id}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{eq.modelo}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight:700, fontSize:14, color: getMTBFColor(eq), fontFamily:'ui-monospace,monospace' }}>
                        {eq.mtbf.toFixed(1)}h
                      </div>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>{eq.ots_correctivas} fallas</div>
                    </td>
                    <td>
                      <div style={{ fontWeight:600, fontSize:13, fontFamily:'ui-monospace,monospace' }}>{eq.mttr.toFixed(1)}h</div>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>{eq.horas_parada}h parada total</div>
                    </td>
                    <td>
                      <div style={{ fontWeight:700, fontSize:14, color: eq.dmr_real >= eq.meta_dmr ? '#15803d' : '#dc2626' }}>
                        {eq.dmr_real.toFixed(1)}%
                      </div>
                    </td>
                    <td style={{ color:'var(--text-muted)', fontSize:13 }}>{eq.meta_dmr}%</td>
                    <td>
                      <div style={{ fontWeight:600, fontSize:13, color: getMRColor(eq.maintenance_ratio) }}>
                        {eq.maintenance_ratio.toFixed(2)}
                      </div>
                      <div style={{ fontSize:10, color: getMRColor(eq.maintenance_ratio) }}>{getMRLabel(eq.maintenance_ratio)}</div>
                    </td>
                    <td>
                      <span style={{ fontSize:15, fontWeight:700, color: getTendenciaColor(eq.tendencia) }}>
                        {getTendenciaIcon(eq.tendencia)}
                      </span>
                      <span style={{ fontSize:10, marginLeft:4, color: getTendenciaColor(eq.tendencia) }}>{eq.tendencia}</span>
                    </td>
                    <td>
                      <span className={getMTBFBadge(eq)}>
                        <span className="dot"/>
                        {eq.estado_confiabilidad === 'ok' ? 'OK' : eq.estado_confiabilidad === 'alerta' ? 'Alerta' : 'Crítico'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: TENDENCIA HISTÓRICA ── */}
      {tabActivo === 'tendencia' && (
        <div className="card">
          <div style={{ padding:'16px 20px', fontSize:13, color:'var(--text-muted)', borderBottom:'1px solid var(--card-border)' }}>
            Evolución de los KPIs principales en los últimos 6 meses
          </div>

          {/* Tabla de tendencia */}
          <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {['Mes','MTBF','MTTR','DMR','Maint. Ratio'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Mes' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.historico_mensual.map((mes, i) => {
                const esMesActual = i === data.historico_mensual.length - 1;
                return (
                  <tr key={mes.mes} style={{ background: esMesActual ? 'var(--cyan-soft)' : 'transparent' }}>
                    <td style={{ fontWeight: esMesActual ? 700 : 400, color: esMesActual ? 'var(--cyan)' : 'var(--text)' }}>
                      {mes.mes} {esMesActual && <span className="badge cyan" style={{ marginLeft:6 }}>actual</span>}
                    </td>
                    {[
                      { val:`${mes.mtbf}h`, color:'#22c55e' },
                      { val:`${mes.mttr}h`, color:'#f59e0b' },
                      { val:`${mes.dmr}%`,  color:'#3b82f6' },
                      { val:mes.mr.toFixed(2),
                        color: getMRColor(mes.mr) },
                    ].map(({ val, color }, j) => (
                      <td key={j} style={{ padding:'10px 12px',
                                           textAlign:'right',
                                           fontFamily:'monospace',
                                           fontWeight: esMesActual ? 700 : 400,
                                           fontSize:'13px', color }}>
                        {val}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {/* Mini sparklines SVG por KPI */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16, padding:'20px', borderTop:'1px solid var(--card-border)' }}>
            {[
              { label:'MTBF (horas entre fallas)', data: data.historico_mensual.map(m => m.mtbf), color:'#15803d', unit:'h' },
              { label:'DMR % (disponibilidad)',    data: data.historico_mensual.map(m => m.dmr),  color:'#0891b2', unit:'%' },
            ].map(kpi => {
              const max = Math.max(...kpi.data);
              const min = Math.min(...kpi.data);
              const range = max - min || 1;
              const w = 300, h = 60, pad = 8;
              const points = kpi.data.map((v, i) => {
                const x = pad + (i / (kpi.data.length - 1)) * (w - 2*pad);
                const y = h - pad - ((v - min) / range) * (h - 2*pad);
                return `${x},${y}`;
              }).join(' ');
              return (
                <div key={kpi.label} style={{ background:'var(--row-alt)', border:'1px solid var(--card-border)', borderRadius:10, padding:16 }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>{kpi.label}</div>
                  <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:'block' }}>
                    <polyline points={points} fill="none" stroke={kpi.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {kpi.data.map((v, i) => {
                      const x = pad + (i / (kpi.data.length - 1)) * (w - 2*pad);
                      const y = h - pad - ((v - min) / range) * (h - 2*pad);
                      return <circle key={i} cx={x} cy={y} r="3" fill={kpi.color}/>
                    })}
                  </svg>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginTop:4 }}>
                    <span>{data.historico_mensual[0].mes}</span>
                    <span style={{ color:kpi.color, fontWeight:700 }}>Actual: {kpi.data[kpi.data.length-1]}{kpi.unit}</span>
                    <span>{data.historico_mensual[data.historico_mensual.length-1].mes}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB 3: PARETO DE FALLAS ── */}
      {tabActivo === 'pareto' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
            Los sistemas con más fallas en el período — ordenados por frecuencia
          </div>

          {data.pareto_fallas.map((falla, i) => (
            <div key={falla.sistema} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--navy)', width:130 }}>{falla.sistema}</span>
                  <span style={{ fontSize:12, color:'var(--text-muted)' }}>{falla.cantidad} fallas</span>
                </div>
                <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--orange, #FF9800)', fontWeight:600 }}>${falla.costo.toLocaleString()}</span>
                  <span style={{ fontSize:13, fontWeight:700, color: i===0?'#dc2626':i===1?'#ea580c':'var(--text-muted)', width:40, textAlign:'right' }}>{falla.pct}%</span>
                </div>
              </div>
              <div style={{ height:8, background:'var(--card-border)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${falla.pct}%`, background:i===0?'#dc2626':i===1?'#ea580c':i===2?'#d97706':'var(--slate)', borderRadius:4, transition:'width 0.5s ease' }}/>
              </div>
            </div>
          ))}

          <div style={{ marginTop:20, padding:'12px 14px', background:'var(--orange-soft)', borderLeft:'3px solid var(--orange)', borderRadius:'0 8px 8px 0' }}>
            <div style={{ fontSize:12, color:'#C15D00', fontWeight:700 }}>Análisis Pareto</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
              El sistema Hidráulico representa el {data.pareto_fallas[0].pct}% de las fallas
              y el {Math.round(data.pareto_fallas[0].costo / data.pareto_fallas.reduce((s,f)=>s+f.costo,0)*100)}% del costo
              de correctivos. Priorizar PM hidráulico reduciría significativamente el costo de mantenimiento.
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: PM vs CORRECTIVO ── */}
      {tabActivo === 'pm_ratio' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>

          {/* Ratio de OTs */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Distribución de OTs del período</div>
            <div style={{ display:'flex', alignItems:'center', gap:24 }}>
              <div style={{ position:'relative', width:100, height:100, flexShrink:0 }}>
                <svg viewBox="0 0 36 36" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--card-border)" strokeWidth="3.8"/>
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={data.ratio_pm_correctivo.pct_preventivo >= 60 ? 'var(--green)' : 'var(--red)'}
                    strokeWidth="3.8"
                    strokeDasharray={`${data.ratio_pm_correctivo.pct_preventivo} ${100 - data.ratio_pm_correctivo.pct_preventivo}`}
                    strokeLinecap="round"/>
                </svg>
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:18, fontWeight:800,
                  color: data.ratio_pm_correctivo.pct_preventivo >= 60 ? '#15803d' : '#dc2626' }}>
                  {data.ratio_pm_correctivo.pct_preventivo}%
                </div>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span className="badge green"><span className="dot"/>Preventivas: {data.ratio_pm_correctivo.preventivas} OTs</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span className="badge red"><span className="dot"/>Correctivas: {data.ratio_pm_correctivo.correctivas} OTs</span>
                </div>
                <div style={{ marginTop:12, fontSize:12, fontWeight:700,
                  color: data.ratio_pm_correctivo.pct_preventivo >= 60 ? '#15803d' : '#dc2626' }}>
                  {data.ratio_pm_correctivo.pct_preventivo >= 60 ? '✓ Meta cumplida (≥ 60% PM)' : '⚠ Por debajo de meta (< 60% PM)'}
                </div>
              </div>
            </div>
          </div>

          {/* Costo PM vs Correctivo */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>Costo: Preventivo vs Correctivo</div>
            {[
              { label:'Costo PM (preventivo)', valor:data.ratio_pm_correctivo.costo_pm,       barColor:'var(--green)', ots:data.ratio_pm_correctivo.preventivas  },
              { label:'Costo correctivo',      valor:data.ratio_pm_correctivo.costo_correctivo, barColor:'var(--red)',   ots:data.ratio_pm_correctivo.correctivas },
            ].map(item => (
              <div key={item.label} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, color:'var(--text-muted)' }}>{item.label}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--navy)' }}>${item.valor.toLocaleString()}</span>
                </div>
                <div style={{ height:6, background:'var(--card-border)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', background:item.barColor, borderRadius:3,
                    width:`${item.valor / (data.ratio_pm_correctivo.costo_pm + data.ratio_pm_correctivo.costo_correctivo) * 100}%` }}/>
                </div>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>${(item.valor/item.ots).toFixed(0)} por OT promedio</div>
              </div>
            ))}
            <div style={{ marginTop:10, padding:'10px 12px', background:'var(--green-soft)', borderRadius:6, fontSize:12, color:'#1B5E20' }}>
              El mantenimiento correctivo cuesta{' '}
              {(data.ratio_pm_correctivo.costo_correctivo / data.ratio_pm_correctivo.costo_pm).toFixed(1)}×
              más que el preventivo por OT. Incrementar el programa de PM reduce el costo total.
            </div>
          </div>
        </div>
      )}
      <FooterBrand />
    </div>
  );
};
