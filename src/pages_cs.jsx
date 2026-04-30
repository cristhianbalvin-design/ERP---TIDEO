import React, { useState } from 'react';
import { I, money } from './icons.jsx';
import { useApp } from './context.jsx';

// ============================================================
// HELPERS COMPARTIDOS
// ============================================================
function SemaforoBadge({ score }) {
  if (score === null || score === undefined) return <span className="badge">—</span>;
  const cfg = score >= 80 ? { color: 'green', label: 'Saludable' }
    : score >= 60 ? { color: 'cyan', label: 'Observación' }
    : score >= 40 ? { color: 'orange', label: 'Riesgo' }
    : { color: 'red', label: 'Crítico' };
  return <span className={'badge badge-' + cfg.color}>{score} · {cfg.label}</span>;
}

function GaugeMini({ score }) {
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--cyan)' : score >= 40 ? 'var(--orange)' : 'var(--danger)';
  return (
    <div style={{ position: 'relative', width: 80, height: 80 }}>
      <svg viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)', width: 80, height: 80 }}>
        <circle cx="40" cy="40" r="32" fill="none" stroke="var(--bg-subtle)" strokeWidth="10" />
        <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${(score / 100) * 201} 201`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 18, color }}>{score}</div>
      </div>
    </div>
  );
}

function TendenciaIcon({ tendencia }) {
  if (tendencia === 'subiendo') return <span style={{ color: 'var(--green)', fontSize: 16 }}>↑</span>;
  if (tendencia === 'bajando') return <span style={{ color: 'var(--danger)', fontSize: 16 }}>↓</span>;
  return <span style={{ color: 'var(--fg-muted)', fontSize: 16 }}>→</span>;
}

function MiniBar({ value, max = 100, color = 'var(--cyan)' }) {
  return (
    <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: (value / max * 100) + '%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
    </div>
  );
}

// ============================================================
// ONBOARDING
// ============================================================
export function CSOnboarding() {
  const { onboardings, cuentas } = useApp();
  const [sel, setSel] = useState(null);
  const onb = sel ? onboardings.find(o => o.id === sel) : null;
  const getCuenta = (id) => cuentas.find(c => c.id === id);

  if (onb) {
    const cuenta = getCuenta(onb.cuenta_id);
    const completados = onb.checklist.filter(c => c.completado).length;
    const pct = Math.round((completados / onb.checklist.length) * 100);
    const hitosAtrasados = onb.hitos.filter(h => !h.fecha_real && h.fecha_plan < '2025-01-25' && h.estado !== 'completado').length;

    return (
      <>
        <div className="page-header">
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>{I.chev} Volver</button>
            <div>
              <h1 className="page-title">Onboarding — {cuenta?.nombre_comercial}</h1>
              <div className="page-sub">{onb.tipo_servicio} · CS: {onb.responsable_cs}</div>
            </div>
          </div>
          <span className={'badge badge-' + (onb.estado === 'completado' ? 'green' : 'cyan')} style={{ fontSize: 13 }}>
            {onb.estado.replace('_', ' ')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-head"><h3>Checklist</h3><span className="text-muted">{completados}/{onb.checklist.length}</span></div>
            <div style={{ padding: '0 20px 8px' }}>
              <MiniBar value={pct} color={pct === 100 ? 'var(--green)' : 'var(--cyan)'} />
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{pct}% completado</div>
            </div>
            <div className="col" style={{ padding: '0 20px 16px', gap: 8 }}>
              {onb.checklist.map(item => (
                <div key={item.id} className="row" style={{ gap: 10, padding: '10px 12px', background: item.completado ? 'rgba(22,163,74,0.06)' : 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: item.completado ? 'var(--green)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontSize: 12 }}>
                    {item.completado && I.check}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: item.completado ? 400 : 600 }}>{item.item}</div>
                    {item.fecha && <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>Completado: {item.fecha}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col" style={{ gap: 20 }}>
            <div className="card">
              <div className="card-head"><h3>Objetivo del cliente</h3></div>
              <div className="card-body">
                <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 13, fontStyle: 'italic' }}>"{onb.objetivo_cliente}"</div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Hitos</h3>
                {hitosAtrasados > 0 && <span className="badge badge-red">{hitosAtrasados} atrasado{hitosAtrasados > 1 ? 's' : ''}</span>}
              </div>
              <div className="col" style={{ padding: '0 20px 16px', gap: 10 }}>
                {onb.hitos.map((h, i) => (
                  <div key={i} style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, borderLeft: `3px solid ${h.estado === 'completado' ? 'var(--green)' : h.estado === 'en_curso' ? 'var(--cyan)' : 'var(--border)'}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{h.nombre}</div>
                    <div className="row" style={{ gap: 12, marginTop: 4 }}>
                      <span className="text-muted" style={{ fontSize: 11 }}>Plan: {h.fecha_plan}</span>
                      {h.fecha_real && <span style={{ fontSize: 11, color: 'var(--green)' }}>Real: {h.fecha_real}</span>}
                      <span className={'badge badge-' + (h.estado === 'completado' ? 'green' : h.estado === 'en_curso' ? 'cyan' : 'orange')} style={{ fontSize: 10 }}>{h.estado.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {onb.nps_inicial !== null && (
              <div className="card">
                <div className="card-head"><h3>Satisfacción inicial</h3></div>
                <div className="card-body">
                  <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'Sora', fontSize: 40, fontWeight: 700, color: onb.nps_inicial >= 9 ? 'var(--green)' : onb.nps_inicial >= 7 ? 'var(--cyan)' : 'var(--danger)' }}>{onb.nps_inicial}</div>
                    <div>
                      <span className={'badge badge-' + (onb.nps_inicial >= 9 ? 'green' : onb.nps_inicial >= 7 ? 'cyan' : 'red')}>{onb.nps_inicial >= 9 ? 'Promotor' : onb.nps_inicial >= 7 ? 'Neutro' : 'Detractor'}</span>
                      {onb.comentario_nps && <div className="text-muted" style={{ fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>"{onb.comentario_nps}"</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Onboarding de Clientes</h1><div className="page-sub">{onboardings.length} onboardings · Fase 3</div></div>
        <button className="btn btn-primary">{I.plus} Nuevo onboarding</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">En curso</div><div className="kpi-value">{onboardings.filter(o => o.estado === 'en_curso').length}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Completados</div><div className="kpi-value">{onboardings.filter(o => o.estado === 'completado').length}</div><div className="kpi-icon green">{I.check}</div></div>
        <div className="kpi-card"><div className="kpi-label">NPS inicial prom.</div>
          <div className="kpi-value">{(onboardings.filter(o => o.nps_inicial !== null).reduce((s, o) => s + o.nps_inicial, 0) / Math.max(onboardings.filter(o => o.nps_inicial !== null).length, 1)).toFixed(1)}</div>
          <div className="kpi-icon purple">{I.sparkles}</div></div>
        <div className="kpi-card"><div className="kpi-label">Hitos atrasados</div><div className="kpi-value" style={{ color: 'var(--orange)' }}>1</div><div className="kpi-icon orange">{I.alert}</div></div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Tipo de servicio</th><th>CS</th><th>Inicio</th><th>Avance</th><th>NPS inicial</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {onboardings.map(o => {
                const cuenta = getCuenta(o.cuenta_id);
                const pct = Math.round((o.checklist.filter(c => c.completado).length / Math.max(o.checklist.length, 1)) * 100);
                return (
                  <tr key={o.id} className="hover-row">
                    <td><strong>{cuenta?.nombre_comercial}</strong><div className="text-muted" style={{ fontSize: 11 }}>{cuenta?.industria}</div></td>
                    <td>{o.tipo_servicio}</td>
                    <td>{o.responsable_cs}</td>
                    <td>{o.fecha_inicio}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : 'var(--cyan)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>{o.nps_inicial !== null ? <span style={{ fontWeight: 700, color: o.nps_inicial >= 9 ? 'var(--green)' : o.nps_inicial >= 7 ? 'var(--cyan)' : 'var(--danger)' }}>{o.nps_inicial}</span> : <span className="text-subtle">—</span>}</td>
                    <td><span className={'badge badge-' + (o.estado === 'completado' ? 'green' : 'cyan')}>{o.estado.replace('_', ' ')}</span></td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(o.id)}>Ver detalle</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// PLANES DE ÉXITO
// ============================================================
export function CSPlanes() {
  const { planesExito, cuentas, healthScoresDetalle } = useApp();
  const [sel, setSel] = useState(null);
  const plan = sel ? planesExito.find(p => p.id === sel) : null;
  const getCuenta = (id) => cuentas.find(c => c.id === id);
  const getHealth = (cuentaId) => healthScoresDetalle.find(h => h.cuenta_id === cuentaId);

  if (plan) {
    const cuenta = getCuenta(plan.cuenta_id);
    const health = getHealth(plan.cuenta_id);
    return (
      <>
        <div className="page-header">
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>{I.chev} Volver</button>
            <div>
              <h1 className="page-title">Plan de Éxito — {cuenta?.nombre_comercial}</h1>
              <div className="page-sub">CS: {plan.responsable_cs} · {plan.periodicidad_reunion}</div>
            </div>
          </div>
          <span className={'badge badge-' + (plan.estado === 'activo' ? 'green' : 'red')} style={{ fontSize: 13 }}>{plan.estado}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="col" style={{ gap: 20 }}>
            <div className="card">
              <div className="card-head"><h3>Objetivo</h3></div>
              <div className="card-body">
                <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, fontStyle: 'italic', fontSize: 13 }}>"{plan.objetivo}"</div>
                <div className="row" style={{ marginTop: 14, gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>ADOPCIÓN DEL SERVICIO</div>
                    <div style={{ fontFamily: 'Sora', fontSize: 28, fontWeight: 700, color: plan.adopcion_pct >= 80 ? 'var(--green)' : 'var(--orange)' }}>{plan.adopcion_pct}%</div>
                  </div>
                  {health && <div><div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>HEALTH SCORE</div><GaugeMini score={health.score_total} /></div>}
                </div>
              </div>
            </div>
            {plan.alertas.length > 0 && (
              <div className="card" style={{ borderColor: 'var(--danger)' }}>
                <div className="card-head"><h3>Alertas activas</h3><span className="badge badge-red">{plan.alertas.length}</span></div>
                <div className="col" style={{ padding: '0 20px 16px', gap: 8 }}>
                  {plan.alertas.map((a, i) => (
                    <div key={i} className="row" style={{ gap: 8, padding: '8px 12px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>
                      <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--danger)'}}>{I.alert}</span><span style={{ fontSize: 13 }}>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>Reuniones de seguimiento</h3><button className="btn btn-sm btn-primary">{I.plus} Nueva reunión</button></div>
            <div className="col" style={{ padding: '0 20px 16px', gap: 10 }}>
              {plan.reuniones.map((r, i) => (
                <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, borderLeft: `3px solid ${r.completado ? 'var(--green)' : 'var(--cyan)'}` }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.tipo}</div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="text-muted" style={{ fontSize: 11 }}>{r.fecha}</span>
                      <span className={'badge badge-' + (r.completado ? 'green' : 'orange')} style={{ fontSize: 10 }}>{r.completado ? 'Realizada' : 'Pendiente'}</span>
                    </div>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>{r.temas}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Planes de Éxito</h1><div className="page-sub">{planesExito.length} planes activos · Customer Success continuo</div></div>
        <button className="btn btn-primary">{I.plus} Nuevo plan</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Responsable CS</th><th>Objetivo</th><th>Health</th><th>Adopción</th><th>Alertas</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {planesExito.map(p => {
                const cuenta = getCuenta(p.cuenta_id);
                const health = getHealth(p.cuenta_id);
                return (
                  <tr key={p.id} className="hover-row">
                    <td><strong>{cuenta?.nombre_comercial}</strong><div className="text-muted" style={{ fontSize: 11 }}>{cuenta?.industria}</div></td>
                    <td>{p.responsable_cs}</td>
                    <td style={{ maxWidth: 240 }}><div className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.objetivo}</div></td>
                    <td>{health ? <SemaforoBadge score={health.score_total} /> : <span className="text-subtle">—</span>}</td>
                    <td><span style={{ fontWeight: 700, color: p.adopcion_pct >= 80 ? 'var(--green)' : p.adopcion_pct >= 60 ? 'var(--cyan)' : 'var(--orange)' }}>{p.adopcion_pct}%</span></td>
                    <td>{p.alertas.length > 0 ? <span className="badge badge-red">{p.alertas.length}</span> : <span className="badge badge-green">0</span>}</td>
                    <td><span className={'badge badge-' + (p.estado === 'activo' ? 'green' : 'red')}>{p.estado}</span></td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(p.id)}>Ver plan</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// HEALTH SCORE
// ============================================================
export function CSHealthScore() {
  const { healthScoresDetalle, cuentas, churnPlanes, crearPlanRetencion } = useApp();
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const detalle = sel ? healthScoresDetalle.find(h => h.id === sel) : null;
  const getCuenta = (id) => cuentas.find(c => c.id === id);

  const promedio = Math.round(healthScoresDetalle.reduce((s, h) => s + h.score_total, 0) / Math.max(healthScoresDetalle.length, 1));
  const filtrados = filtro === 'todos' ? healthScoresDetalle : healthScoresDetalle.filter(h => h.semaforo === filtro);

  const dimColors = { comercial: 'cyan', operativa: 'purple', financiera: 'green', soporte: 'orange', satisfaccion: 'red' };
  const dimLabels = { comercial: 'Comercial', operativa: 'Operativa', financiera: 'Financiera', soporte: 'Soporte', satisfaccion: 'Satisfacción' };

  if (detalle) {
    const cuenta = getCuenta(detalle.cuenta_id);
    const tienePlan = churnPlanes.some(c => c.cuenta_id === detalle.cuenta_id);
    return (
      <>
        <div className="page-header">
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>{I.chev} Volver</button>
            <div>
              <h1 className="page-title">Health Score — {cuenta?.nombre_comercial}</h1>
              <div className="page-sub">Actualizado: {detalle.ultima_actualizacion} · CS: {cuenta?.responsable_cs}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <SemaforoBadge score={detalle.score_total} />
            <TendenciaIcon tendencia={detalle.tendencia} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
          <div className="card" style={{ padding: 24, textAlign: 'center', height: 'fit-content' }}>
            <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Score total</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}><GaugeMini score={detalle.score_total} /></div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>Tendencia: <TendenciaIcon tendencia={detalle.tendencia} /> {detalle.tendencia}</div>
            {detalle.score_total < 50 && !tienePlan && (
              <button className="btn btn-sm btn-primary" style={{ marginTop: 12, width: '100%' }}
                onClick={() => crearPlanRetencion({ cuenta_id: detalle.cuenta_id, causa_probable: 'Score crítico detectado', responsable: cuenta?.responsable_cs || '—' })}>
                Crear plan retención
              </button>
            )}
            {tienePlan && <div className="badge badge-orange" style={{ marginTop: 12, display: 'block' }}>Plan retención activo</div>}
          </div>

          <div className="card">
            <div className="card-head"><h3>Desglose por dimensión</h3></div>
            <div className="col" style={{ padding: '0 20px 16px', gap: 16 }}>
              {Object.entries(detalle.dimensiones).map(([dim, data]) => (
                <div key={dim}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={'badge badge-' + dimColors[dim]} style={{ fontSize: 10 }}>{dimLabels[dim]}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>peso {data.peso}%</span>
                    </div>
                    <strong style={{ color: data.score >= 80 ? 'var(--green)' : data.score >= 60 ? 'var(--cyan)' : data.score >= 40 ? 'var(--orange)' : 'var(--danger)' }}>{data.score}</strong>
                  </div>
                  <MiniBar value={data.score} color={`var(--${dimColors[dim]})`} />
                  <div className="row" style={{ gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    {Object.entries(data.variables).map(([v, val]) => (
                      <span key={v} className="text-muted" style={{ fontSize: 10 }}>{v.replace(/_/g, ' ')}: <strong>{val}</strong></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card mt-6">
          <div className="card-head"><h3>Histórico del score (últimos 5 meses)</h3></div>
          <div style={{ padding: '0 20px 20px', display: 'flex', gap: 12, alignItems: 'flex-end', height: 110 }}>
            {detalle.historico.map((h, i) => {
              const color = h.score >= 80 ? 'var(--green)' : h.score >= 60 ? 'var(--cyan)' : h.score >= 40 ? 'var(--orange)' : 'var(--danger)';
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>{h.score}</div>
                  <div style={{ width: '100%', background: color, borderRadius: '4px 4px 0 0', height: (h.score / 100 * 65) + 'px', opacity: 0.85 }} />
                  <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{h.mes}</div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Health Score de Clientes</h1><div className="page-sub">Score promedio: {promedio} · {healthScoresDetalle.length} clientes monitoreados</div></div>
        <button className="btn btn-secondary">{I.download} Exportar</button>
      </div>
      <div className="kpi-grid">
        {[
          { label: 'Saludables (≥80)', val: healthScoresDetalle.filter(h => h.score_total >= 80).length, color: 'green' },
          { label: 'Observación (60-79)', val: healthScoresDetalle.filter(h => h.score_total >= 60 && h.score_total < 80).length, color: 'cyan' },
          { label: 'Riesgo (40-59)', val: healthScoresDetalle.filter(h => h.score_total >= 40 && h.score_total < 60).length, color: 'orange' },
          { label: 'Críticos (<40)', val: healthScoresDetalle.filter(h => h.score_total < 40).length, color: 'red' },
        ].map((k, i) => (
          <div key={i} className="kpi-card"><div className="kpi-label">{k.label}</div><div className="kpi-value" style={{ color: `var(--${k.color})` }}>{k.val}</div></div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {[['todos', 'Todos'], ['verde', '🟢 Saludables'], ['amarillo', '🟡 Observación'], ['rojo', '🔴 Críticos']].map(([f, lbl]) => (
          <button key={f} className={'btn btn-sm ' + (filtro === f ? 'btn-primary' : 'btn-secondary')} onClick={() => setFiltro(f)}>{lbl}</button>
        ))}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>CS</th><th>Score</th><th>Estado</th><th>Tend.</th><th>Comercial</th><th>Operativa</th><th>Financiera</th><th>Soporte</th><th></th></tr></thead>
            <tbody>
              {filtrados.map(h => {
                const cuenta = getCuenta(h.cuenta_id);
                return (
                  <tr key={h.id} className="hover-row">
                    <td><strong>{cuenta?.nombre_comercial}</strong><div className="text-muted" style={{ fontSize: 11 }}>{cuenta?.industria}</div></td>
                    <td>{cuenta?.responsable_cs || '—'}</td>
                    <td><span style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 20, color: h.score_total >= 80 ? 'var(--green)' : h.score_total >= 60 ? 'var(--cyan)' : h.score_total >= 40 ? 'var(--orange)' : 'var(--danger)' }}>{h.score_total}</span></td>
                    <td><SemaforoBadge score={h.score_total} /></td>
                    <td><TendenciaIcon tendencia={h.tendencia} /></td>
                    <td className="num">{h.dimensiones.comercial.score}</td>
                    <td className="num">{h.dimensiones.operativa.score}</td>
                    <td className="num">{h.dimensiones.financiera.score}</td>
                    <td className="num">{h.dimensiones.soporte.score}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(h.id)}>Ver detalle</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// RENOVACIONES Y UPSELL
// ============================================================
export function CSRenovaciones() {
  const { renovaciones, cuentas, healthScoresDetalle, generarRenovacion } = useApp();
  const [tab, setTab] = useState('renovaciones');
  const getCuenta = (id) => cuentas.find(c => c.id === id);
  const getHealth = (cuentaId) => healthScoresDetalle.find(h => h.cuenta_id === cuentaId);
  const upsellCandidatos = cuentas.filter(c => c.health_score && c.health_score >= 80 && c.margen_acumulado && c.margen_acumulado >= 35);

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Renovaciones y Expansión</h1><div className="page-sub">{renovaciones.length} contratos · {renovaciones.filter(r => r.dias_restantes <= 60).length} próximos a vencer</div></div>
        <button className="btn btn-primary">{I.plus} Nueva renovación</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Próximos 30 días</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{renovaciones.filter(r => r.dias_restantes <= 30).length}</div><div className="kpi-icon red">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Próximos 60 días</div><div className="kpi-value" style={{ color: 'var(--orange)' }}>{renovaciones.filter(r => r.dias_restantes <= 60).length}</div><div className="kpi-icon orange">{I.calendar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Oportunidades generadas</div><div className="kpi-value">{renovaciones.filter(r => r.oportunidad_generada).length}</div><div className="kpi-icon green">{I.target}</div></div>
        <div className="kpi-card"><div className="kpi-label">Candidatos upsell</div><div className="kpi-value">{upsellCandidatos.length}</div><div className="kpi-icon cyan">{I.sparkles}</div></div>
      </div>
      <div style={{ padding: '0 0 12px' }}>
        <div className="tabs">
          <div className={'tab ' + (tab === 'renovaciones' ? 'active' : '')} onClick={() => setTab('renovaciones')}>Renovaciones</div>
          <div className={'tab ' + (tab === 'upsell' ? 'active' : '')} onClick={() => setTab('upsell')}>Upsell / Cross-sell</div>
        </div>
      </div>

      {tab === 'renovaciones' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>Servicio</th><th>Vencimiento</th><th>Días rest.</th><th>Monto</th><th>CS</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {renovaciones.sort((a, b) => a.dias_restantes - b.dias_restantes).map(r => {
                  const cuenta = getCuenta(r.cuenta_id);
                  const health = getHealth(r.cuenta_id);
                  const diasColor = r.dias_restantes <= 30 ? 'red' : r.dias_restantes <= 60 ? 'orange' : 'cyan';
                  return (
                    <tr key={r.id} className="hover-row">
                      <td>
                        <strong>{cuenta?.nombre_comercial}</strong>
                        {health && <div style={{ marginTop: 2 }}><SemaforoBadge score={health.score_total} /></div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{r.servicio}</td>
                      <td>{r.fecha_vencimiento}</td>
                      <td><span className={'badge badge-' + diasColor}>{r.dias_restantes}d</span></td>
                      <td className="num">{money(r.monto_contrato)}</td>
                      <td>{r.responsable_cs}</td>
                      <td><span className={'badge badge-' + (r.estado === 'en_negociacion' ? 'green' : r.estado === 'en_riesgo' ? 'red' : 'orange')}>{r.estado.replace(/_/g, ' ')}</span></td>
                      <td>
                        {r.estado === 'en_riesgo' && <span className="text-muted" style={{ fontSize: 11 }}>Requiere retención</span>}
                        {!r.oportunidad_generada && r.estado !== 'en_riesgo' && (
                          <button className="btn btn-sm btn-primary" onClick={() => generarRenovacion(r.id)}>Generar oportunidad</button>
                        )}
                        {r.oportunidad_generada && <span className="badge badge-green">{I.check} Opp. generada</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'upsell' && (
        <>
          <div style={{ padding: '12px 16px', background: 'rgba(6,182,212,0.08)', border: '1px solid var(--cyan)', borderRadius: 10, marginBottom: 16 }} className="row">
            {I.sparkles}<div><strong>Criterios:</strong> Health ≥80, margen ≥35%. Clientes con deuda vencida o health &lt;50 requieren aprobación gerencial.</div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Cliente</th><th>Health score</th><th>Margen acumulado</th><th>Oportunidad sugerida</th><th></th></tr></thead>
                <tbody>
                  {upsellCandidatos.map(c => (
                    <tr key={c.id} className="hover-row">
                      <td><strong>{c.nombre_comercial}</strong><div className="text-muted" style={{ fontSize: 11 }}>{c.industria}</div></td>
                      <td><SemaforoBadge score={c.health_score} /></td>
                      <td><span style={{ fontWeight: 700, color: 'var(--green)' }}>{c.margen_acumulado}%</span></td>
                      <td><span className="badge badge-cyan">Ampliación de cobertura</span></td>
                      <td><button className="btn btn-sm btn-primary">Crear oportunidad</button></td>
                    </tr>
                  ))}
                  {upsellCandidatos.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--fg-muted)' }}>Sin candidatos que cumplan los criterios.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// FIDELIZACIÓN Y NPS
// ============================================================
export function CSFidelizacion() {
  const { npsEncuestas, referidos, casosExito, cuentas } = useApp();
  const [tab, setTab] = useState('nps');
  const getCuenta = (id) => cuentas.find(c => c.id === id);
  const respondidos = npsEncuestas.filter(n => n.estado === 'respondido');
  const npsPromedio = respondidos.length > 0
    ? (respondidos.reduce((s, n) => s + n.score, 0) / respondidos.length).toFixed(1) : '—';

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Fidelización y NPS</h1>
          <div className="page-sub">NPS promedio: {npsPromedio} · {respondidos.filter(n => n.clasificacion === 'promotor').length} promotores · {respondidos.filter(n => n.clasificacion === 'detractor').length} detractores</div></div>
        <button className="btn btn-primary">{I.plus} Enviar encuesta</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">NPS promedio</div><div className="kpi-value" style={{ color: 'var(--green)' }}>{npsPromedio}</div><div className="kpi-icon green">{I.sparkles}</div></div>
        <div className="kpi-card"><div className="kpi-label">Promotores (≥9)</div><div className="kpi-value" style={{ color: 'var(--green)' }}>{respondidos.filter(n => n.clasificacion === 'promotor').length}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Detractores (≤6)</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{respondidos.filter(n => n.clasificacion === 'detractor').length}</div><div className="kpi-icon red">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Referidos activos</div><div className="kpi-value">{referidos.length}</div><div className="kpi-icon purple">{I.target}</div></div>
      </div>
      <div style={{ padding: '0 0 12px' }}>
        <div className="tabs">
          <div className={'tab ' + (tab === 'nps' ? 'active' : '')} onClick={() => setTab('nps')}>NPS y Satisfacción</div>
          <div className={'tab ' + (tab === 'referidos' ? 'active' : '')} onClick={() => setTab('referidos')}>Referidos</div>
          <div className={'tab ' + (tab === 'casos' ? 'active' : '')} onClick={() => setTab('casos')}>Casos de Éxito</div>
        </div>
      </div>

      {tab === 'nps' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>OT / Período</th><th>Fecha envío</th><th>Score</th><th>Clasificación</th><th>Comentario</th><th>Estado</th></tr></thead>
              <tbody>
                {npsEncuestas.map(n => {
                  const cuenta = getCuenta(n.cuenta_id);
                  return (
                    <tr key={n.id}>
                      <td><strong>{cuenta?.nombre_comercial}</strong></td>
                      <td className="text-muted">{n.ot_id || 'Post-período'}</td>
                      <td>{n.fecha_envio}</td>
                      <td>{n.score !== null
                        ? <span style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 20, color: n.score >= 9 ? 'var(--green)' : n.score >= 7 ? 'var(--cyan)' : 'var(--danger)' }}>{n.score}</span>
                        : <span className="text-subtle">—</span>}</td>
                      <td>{n.clasificacion
                        ? <span className={'badge badge-' + (n.clasificacion === 'promotor' ? 'green' : n.clasificacion === 'neutro' ? 'cyan' : 'red')}>{n.clasificacion}</span>
                        : <span className="text-subtle">—</span>}</td>
                      <td style={{ maxWidth: 220 }}><span className="text-muted" style={{ fontSize: 12, fontStyle: n.comentario ? 'italic' : 'normal' }}>{n.comentario ? `"${n.comentario}"` : '—'}</span></td>
                      <td><span className={'badge badge-' + (n.estado === 'respondido' ? 'green' : 'orange')}>{n.estado}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'referidos' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Cliente origen</th><th>Referido</th><th>Empresa</th><th>Fecha</th><th>Lead generado</th><th>Estado</th></tr></thead>
              <tbody>
                {referidos.map(r => {
                  const origen = getCuenta(r.cuenta_origen_id);
                  return (
                    <tr key={r.id}>
                      <td><strong>{origen?.nombre_comercial}</strong></td>
                      <td>{r.nombre_referido}</td>
                      <td>{r.empresa_referida}</td>
                      <td>{r.fecha}</td>
                      <td>{r.lead_generado_id ? <span className="badge badge-cyan">Lead activo</span> : <button className="btn btn-sm btn-ghost">Convertir a lead</button>}</td>
                      <td><span className={'badge badge-' + (r.estado === 'convertido' ? 'green' : 'cyan')}>{r.estado.replace('_', ' ')}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'casos' && (
        <div className="col" style={{ gap: 16 }}>
          {casosExito.map(c => {
            const cuenta = getCuenta(c.cuenta_id);
            return (
              <div key={c.id} className="card" style={{ padding: 24 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 16 }}>{c.titulo}</div>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{cuenta?.nombre_comercial} · {c.servicio}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={'badge badge-' + (c.estado === 'publicado' ? 'green' : 'orange')}>{c.estado.replace('_', ' ')}</span>
                    {c.autorizacion_cliente && <span className="badge badge-cyan">Autorizado</span>}
                  </div>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 12px', color: 'var(--fg-muted)' }}>{c.descripcion}</p>
                <div style={{ padding: '10px 14px', background: 'rgba(22,163,74,0.08)', borderRadius: 8, border: '1px solid var(--green)', fontSize: 13, fontWeight: 600 }}>
                  {I.trend} {c.resultado_cuantificado}
                </div>
                {!c.autorizacion_cliente && <div style={{ marginTop: 12 }}><button className="btn btn-sm btn-primary">Solicitar autorización al cliente</button></div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ============================================================
// BI CUSTOMER SUCCESS
// ============================================================
export function BICustomerSuccess() {
  const { healthScoresDetalle, cuentas, npsEncuestas, onboardings, renovaciones, churnPlanes } = useApp();
  const getCuenta = (id) => cuentas.find(c => c.id === id);
  const respondidos = npsEncuestas.filter(n => n.estado === 'respondido');
  const npsPromedio = respondidos.length > 0
    ? (respondidos.reduce((s, n) => s + n.score, 0) / respondidos.length).toFixed(1) : '—';
  const promedio = Math.round(healthScoresDetalle.reduce((s, h) => s + h.score_total, 0) / Math.max(healthScoresDetalle.length, 1));

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">BI Customer Success</h1><div className="page-sub">Dashboard de retención, salud y crecimiento · Fase 3</div></div>
        <button className="btn btn-secondary">{I.download} Exportar</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Health score promedio</div><div className="kpi-value">{promedio}</div><div className="kpi-icon cyan">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">Clientes saludables</div><div className="kpi-value" style={{ color: 'var(--green)' }}>{healthScoresDetalle.filter(h => h.score_total >= 80).length}</div><div className="kpi-icon green">{I.check}</div></div>
        <div className="kpi-card"><div className="kpi-label">En riesgo / críticos</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{healthScoresDetalle.filter(h => h.score_total < 60).length}</div><div className="kpi-icon red">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">NPS promedio</div><div className="kpi-value" style={{ color: 'var(--green)' }}>{npsPromedio}</div><div className="kpi-icon purple">{I.sparkles}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-head"><h3>Distribución Health Score</h3></div>
          <div className="card-body col" style={{ gap: 14 }}>
            {[
              { label: 'Saludables (≥80)', val: healthScoresDetalle.filter(h => h.score_total >= 80).length, color: 'green' },
              { label: 'Observación (60-79)', val: healthScoresDetalle.filter(h => h.score_total >= 60 && h.score_total < 80).length, color: 'cyan' },
              { label: 'Críticos (<60)', val: healthScoresDetalle.filter(h => h.score_total < 60).length, color: 'red' },
            ].map((b, i) => (
              <div key={i}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className={'badge badge-' + b.color}>{b.label}</span>
                  <strong>{b.val}</strong>
                </div>
                <MiniBar value={b.val} max={Math.max(healthScoresDetalle.length, 1)} color={`var(--${b.color})`} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Clientes en riesgo</h3><span className="badge badge-red">{churnPlanes.length} con plan retención</span></div>
          <div className="col" style={{ padding: '0 20px 16px', gap: 10 }}>
            {healthScoresDetalle.filter(h => h.score_total < 70).map(h => {
              const cuenta = getCuenta(h.cuenta_id);
              return (
                <div key={h.id} style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, borderLeft: `3px solid ${h.score_total < 40 ? 'var(--danger)' : 'var(--orange)'}` }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>{cuenta?.nombre_comercial}</strong>
                    <SemaforoBadge score={h.score_total} />
                  </div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>CS: {cuenta?.responsable_cs} · <TendenciaIcon tendencia={h.tendencia} /> {h.tendencia}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Renovaciones próximas</h3></div>
          <div className="col" style={{ padding: '0 20px 16px', gap: 10 }}>
            {renovaciones.sort((a, b) => a.dias_restantes - b.dias_restantes).map(r => {
              const cuenta = getCuenta(r.cuenta_id);
              return (
                <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{cuenta?.nombre_comercial}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{r.servicio}</div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <span className={'badge badge-' + (r.dias_restantes <= 30 ? 'red' : r.dias_restantes <= 60 ? 'orange' : 'cyan')}>{r.dias_restantes}d</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.fecha_vencimiento}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Onboardings en curso</h3></div>
          <div className="col" style={{ padding: '0 20px 16px', gap: 10 }}>
            {onboardings.filter(o => o.estado === 'en_curso').map(o => {
              const cuenta = getCuenta(o.cuenta_id);
              const pct = Math.round((o.checklist.filter(c => c.completado).length / Math.max(o.checklist.length, 1)) * 100);
              return (
                <div key={o.id} style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{cuenta?.nombre_comercial}</strong>
                    <span className="text-muted" style={{ fontSize: 11 }}>CS: {o.responsable_cs}</span>
                  </div>
                  <MiniBar value={pct} color="var(--cyan)" />
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{pct}% checklist completado</div>
                </div>
              );
            })}
            {onboardings.filter(o => o.estado === 'en_curso').length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-muted)' }}>No hay onboardings en curso.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
