// BI Financiero — Resultados · Cobranza · Pagos · Flujo de caja · Presupuesto vs Real
// Estado de resultados servido por estadoResultadosService, igual que la pantalla Estado de Resultados

import { useState, useEffect, useMemo, useRef } from 'react';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { ER_SCOPE_MODE, buildEstadoResultados, getEstadoResultados, getEstadoResultadosPorScope } from './services/estadoResultadosService.js';
import { isSupabaseMode } from './lib/dataMode.js';
import { normalizarMonedaBI } from './biComercialMetrics.js';
import {
  calcularCajaNetaMes, calcularCxc, calcularCxcProximos30, calcularCxp,
  calcularFacturacionPorCliente, calcularRetenciones, calcularSemanasCaja,
  categoriasCostosResultados, crearCSVFinanciero, filasCSVFinanciero,
  filasPresupuestoFinanciero, formatDateFinanciero, porcentajeDeIngresos,
  serieResultados, tablaResultadosFinancieros, totalizar, variacionPorcentual,
} from './biFinancieroMetrics.js';
import { PERFIL_SOCIEDAD } from './services/sociedadesService.js';
import { crearFilasRealPresupuestoCxp } from './services/presupuestoRealCxp.js';
import { crearResumenRealPresupuesto, crearTotalesConsolidadosReferencialesPEN, normalizarMonedaPresupuesto, otCompatibleConPresupuesto } from './services/presupuestoReal.js';

const P = (n) => n == null ? '—' : Number(n).toFixed(1) + '%';
function BarH({ value, max, color = 'var(--cyan)' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 4, height: 8, width: '100%' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
    </div>
  );
}

function MultiSelect({ opts, sel, onSel, placeholder }) {
  const [open, setOpen] = useState(false);
  const allSel = sel.length === 0;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="select" style={{ cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 160 }} onClick={() => setOpen(o => !o)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {allSel ? placeholder : `${sel.length} seleccionado${sel.length > 1 ? 's' : ''}`}
        </span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: 220, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.15)', zIndex: 100, maxHeight: 240, overflowY: 'auto' }}>
            <div onClick={() => { onSel([]); setOpen(false); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: allSel ? 700 : 400, background: allSel ? 'var(--bg-subtle)' : 'transparent', borderBottom: '1px solid var(--border-subtle)' }}>
              Todos
            </div>
            {opts.map(o => {
              const on = sel.includes(o.id);
              return (
                <div key={o.id} onClick={() => onSel(on ? sel.filter(x => x !== o.id) : [...sel, o.id])} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, background: on ? 'var(--bg-subtle)' : 'transparent' }}>
                  <span style={{ width: 14, height: 14, border: '2px solid ' + (on ? 'var(--cyan)' : 'var(--border)'), borderRadius: 3, background: on ? 'var(--cyan)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 9 }}>{on ? '✓' : ''}</span>
                  {o.nombre}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function BadgePre({ estado }) {
  const b = BADGE_PRE[estado] || BADGE_PRE.borrador;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, color: b.color, background: b.bg }}>{b.label}</span>;
}

function TabPresupuesto({ periodo, efectivoCecos }) {
  const {
    presupuestos, presupuestoPartidas, presupuestoAprobaciones,
    crearPresupuesto, enviarPresupuestoAAprobacion, procesarAprobacionPresupuesto,
    comprasGastos, cxp, cxpDistribucionesCeco, ots, usuarios, empresa, authUser, tipoCambioHoy, tcUSDaPEN,
    centrosCosto, centrosBeneficio,
  } = useApp();

  const [subTab, setSubTab]         = useState('partidas');
  const [preSelId, setPreSelId]     = useState(null);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [panelDetalle, setPanelDetalle] = useState(null);
  const [panelEnviar, setPanelEnviar]   = useState(false);
  const [formPre, setFormPre]       = useState({ nombre: '', periodo, centro_costo_id: '', cebe_id: '' });
  const [formPartidas, setFormPartidas] = useState([{ categoria: 'Materiales', descripcion: '', monto_presupuestado: '', moneda: 'PEN' }]);
  const [aprobadores, setAprobadores]   = useState([null]);
  const [comentarioApr, setComentarioApr] = useState('');
  const [saving, setSaving]         = useState(false);

  const empresaId = empresa?.id;

  const presDePeriodo = (presupuestos || []).filter(p => p.empresa_id === empresaId && p.periodo === periodo);
  const presActivo = preSelId
    ? (presupuestos || []).find(p => p.id === preSelId)
    : presDePeriodo[0] || null;

  const partidas = useMemo(() =>
    presActivo ? (presupuestoPartidas || []).filter(p => p.presupuesto_id === presActivo.id).sort((a, b) => a.orden - b.orden) : [],
    [presActivo, presupuestoPartidas]);

  const cadena = useMemo(() =>
    presActivo ? (presupuestoAprobaciones || []).filter(a => a.presupuesto_id === presActivo.id).sort((a, b) => a.orden - b.orden) : [],
    [presActivo, presupuestoAprobaciones]);

  const esPeriodoMensual = periodo.length === 7;

  const filasRealCxp = useMemo(() => crearFilasRealPresupuestoCxp({
    cxp,
    cxpDistribucionesCeco,
    comprasGastos,
    empresaId,
    periodo,
    efectivoCecos,
  }), [cxp, cxpDistribucionesCeco, comprasGastos, empresaId, periodo, efectivoCecos]);

  const resumenReal = useMemo(() => crearResumenRealPresupuesto({
    partidas, comprasGastos, ots, filasCxp: filasRealCxp, empresaId, periodo, efectivoCecos,
    incluirRegistro: (registro, tipo) => tipo !== 'ot' || otCompatibleConPresupuesto(registro, presActivo),
  }), [partidas, comprasGastos, ots, filasRealCxp, empresaId, periodo, efectivoCecos, presActivo]);
  const resultadosPartidas = resumenReal.porPartida;
  const resultadosSinPartida = resumenReal.sinPartida;
  const hayMontosUSD = ['presupuestado', 'real', 'variacion'].some(clave => Number(resumenReal.totales[clave].USD || 0) !== 0);
  const totalesConsolidados = crearTotalesConsolidadosReferencialesPEN(resumenReal.totales, tcUSDaPEN);
  const formatoMoneda = (monto, moneda = 'PEN') => `${normalizarMonedaPresupuesto(moneda) === 'USD' ? 'US$' : 'S/'} ${Number(monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatoConsolidadoPEN = monto => `S/ ${Number(monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lineasKpi = (montos, conSigno = false) => ['PEN', ...(Number(montos.USD || 0) !== 0 ? ['USD'] : [])].map(moneda => {
    const monto = Number(montos[moneda] || 0);
    return <div key={moneda}>{conSigno && monto > 0 ? '+' : ''}{formatoMoneda(monto, moneda)}</div>;
  });
  const ejecucionPorMoneda = moneda => {
    const pres = resumenReal.totales.presupuestado[moneda];
    return pres > 0 ? Math.round(resumenReal.totales.real[moneda] / pres * 100) : 0;
  };
  const obtenerResultado = partida => resultadosPartidas.find(resultado => resultado.partida === partida);
  const alertas = resultadosPartidas.filter(resultado => resultado.real > Number(resultado.partida.monto_presupuestado || 0)).map(resultado => resultado.partida);

  const siguienteApr = cadena.find(a => a.estado === 'pendiente');
  const puedoAprobar = siguienteApr && siguienteApr.aprobador_id === authUser?.id;

  const usuariosEmpresa = (usuarios || []).filter(u => u.empresa_id === empresaId || !u.empresa_id);

  const abrirNuevo = () => {
    setFormPre({ nombre: '', periodo, centro_costo_id: '', cebe_id: '' });
    setFormPartidas([{ categoria: 'Materiales', descripcion: '', monto_presupuestado: '', moneda: 'PEN' }]);
    setPanelNuevo(true);
  };

  const guardarNuevo = async () => {
    if (!formPre.nombre.trim() || !formPre.periodo.trim() || formPartidas.length === 0) return;
    setSaving(true);
    try {
      const pre = await crearPresupuesto(formPre, formPartidas);
      setPreSelId(pre.id);
      setPanelNuevo(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEnviar = async () => {
    const aprs = aprobadores.filter(Boolean);
    if (!aprs.length || !presActivo) return;
    setSaving(true);
    try {
      await enviarPresupuestoAAprobacion(presActivo.id, aprs);
      setPanelEnviar(false);
      setAprobadores([null]);
    } finally {
      setSaving(false);
    }
  };

  const handleProcesar = async (aprId, accion) => {
    if (!presActivo) return;
    await procesarAprobacionPresupuesto(presActivo.id, aprId, accion, comentarioApr);
    setComentarioApr('');
  };

  const panelStyle = {
    position: 'fixed', top: 0, right: 0, width: 480, height: '100vh',
    background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
    boxShadow: '-8px 0 32px rgba(0,0,0,.18)',
    zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };
  const pHead = { padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const pBody = { flex: 1, overflowY: 'auto', padding: '20px 24px' };
  const Overlay = ({ onClick }) => <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 999 }} onClick={onClick} />;
  const CloseBtn = ({ onClick }) => <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--fg-muted)', lineHeight: 1 }} onClick={onClick}>×</button>;

  return (
    <div>
      {/* ── Cabecera módulo ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {presDePeriodo.length > 0 ? (
            <select className="select" style={{ width: 240 }} value={presActivo?.id || ''}
              onChange={e => setPreSelId(e.target.value || null)}>
              {presDePeriodo.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Sin presupuesto para este período</span>
          )}
          {presActivo && <BadgePre estado={presActivo.estado} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {presActivo?.estado === 'borrador' && (
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPanelEnviar(true)}>
              Enviar a aprobación
            </button>
          )}
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={abrirNuevo}>
            + Nuevo presupuesto
          </button>
        </div>
      </div>

      {/* ── Alertas excedidas ─────────────────────────────────────────── */}
      {alertas.length > 0 && presActivo && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: 'var(--danger)' }}>⚠ Partidas excedidas:</strong>{' '}
          {alertas.map(a => a.categoria).join(', ')}
        </div>
      )}

      {!presActivo ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--fg-muted)' }}>
          No hay presupuesto para este período. Crea uno con el botón de arriba.
        </div>
      ) : (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────── */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}>
            <div className="kpi-card"><div className="kpi-label">Presupuestado</div><div className="kpi-value" style={{ fontSize: 20 }}>{lineasKpi(resumenReal.totales.presupuestado)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Real ejecutado</div><div className="kpi-value" style={{ fontSize: 20 }}>{lineasKpi(resumenReal.totales.real)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Variación neta</div><div className="kpi-value" style={{ fontSize: 20 }}>{lineasKpi(resumenReal.totales.variacion, true)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Ejecución</div><div className="kpi-value" style={{ fontSize: 20 }}>{['PEN', ...(resumenReal.totales.presupuestado.USD || resumenReal.totales.real.USD ? ['USD'] : [])].map(moneda => <div key={moneda} style={{ color: ejecucionPorMoneda(moneda) > 100 ? 'var(--danger)' : ejecucionPorMoneda(moneda) > 80 ? 'var(--warning)' : 'var(--green)' }}>{ejecucionPorMoneda(moneda)}%{(resumenReal.totales.presupuestado.USD || resumenReal.totales.real.USD) ? ` (${moneda === 'USD' ? 'US$' : 'S/'})` : ''}</div>)}</div></div>
          </div>
          {hayMontosUSD && (
            <div className="card" style={{ marginBottom: 18, padding: '12px 16px', fontSize: 13 }}>
              {totalesConsolidados ? <>
                <strong>Total consolidado (referencial) S/</strong>: Presupuestado <strong>{formatoConsolidadoPEN(totalesConsolidados.presupuestado)}</strong> · Real <strong>{formatoConsolidadoPEN(totalesConsolidados.real)}</strong> · Variación <strong>{formatoConsolidadoPEN(totalesConsolidados.variacion)}</strong>
                <span className="text-muted"> · TC US$1 = S/ {Number(tcUSDaPEN).toFixed(2)}</span>
                {tipoCambioHoy?.desactualizado && <span className="text-muted"> · TC desactualizado</span>}
              </> : <span className="text-muted">No hay tipo de cambio disponible para consolidar los montos en USD.</span>}
            </div>
          )}

          {/* ── Sub-tabs ──────────────────────────────────────────────── */}
          <div className="tab-bar" style={{ marginBottom: 14 }}>
            <button className={'tab-btn ' + (subTab === 'partidas' ? 'active' : '')} onClick={() => setSubTab('partidas')}>Partidas</button>
            <button className={'tab-btn ' + (subTab === 'aprobacion' ? 'active' : '')} onClick={() => setSubTab('aprobacion')}>Flujo de aprobación</button>
          </div>

          {/* ── Partidas ──────────────────────────────────────────────── */}
          {subTab === 'partidas' && (
            <div className="card">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Presupuestado</th>
                    <th style={{ textAlign: 'right' }}>Real</th>
                    <th style={{ textAlign: 'right' }}>Variación</th>
                    <th style={{ width: 130 }}>Ejecución</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 24 }}>Sin partidas.</td></tr>
                  )}
                  {partidas.map(p => {
                    const resultado = obtenerResultado(p);
                    const real = resultado?.real || 0;
                    const pres = Number(p.monto_presupuestado || 0);
                    const varAbs = real - pres;
                    const excede = real > pres;
                    const ep = pres > 0 ? Math.round(real / pres * 100) : 0;
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setPanelDetalle(p)}>
                        <td>
                          {excede && <span style={{ color: 'var(--danger)', fontWeight: 700, marginRight: 4 }}>!</span>}
                          {p.categoria}
                        </td>
                        <td style={{ color: 'var(--fg-muted)' }}>{p.descripcion || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{formatoMoneda(pres, p.moneda)}</td>
                        <td style={{ textAlign: 'right', color: excede ? 'var(--danger)' : 'var(--fg)', fontWeight: excede ? 700 : 400 }}>{formatoMoneda(real, p.moneda)}</td>
                        <td style={{ textAlign: 'right', color: excede ? 'var(--danger)' : 'var(--green)' }}>
                          {varAbs >= 0 ? '+' : ''}{formatoMoneda(varAbs, p.moneda)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BarH value={Math.min(ep, 100)} max={100} color={excede ? 'var(--danger)' : ep > 80 ? 'var(--warning)' : 'var(--green)'} />
                            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{ep}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {resultadosSinPartida.map(resultado => {
                    const real = resultado.real;
                    return (
                      <tr key={resultado.id} style={{ cursor: 'pointer' }} onClick={() => setPanelDetalle({
                        id: resultado.id,
                        categoria: resultado.categoria,
                        descripcion: resultado.descripcion,
                        monto_presupuestado: 0,
                        moneda: resultado.moneda,
                        resultadoSinPartida: resultado,
                      })}>
                        <td><span style={{ color: 'var(--danger)', fontWeight: 700, marginRight: 4 }}>!</span>{resultado.categoria} ({resultado.moneda === 'USD' ? 'US$' : 'S/'})</td>
                        <td style={{ color: 'var(--fg-muted)' }}>{resultado.descripcion}</td>
                        <td style={{ textAlign: 'right' }}>—</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{formatoMoneda(real, resultado.moneda)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)' }}>+{formatoMoneda(real, resultado.moneda)}</td>
                        <td style={{ color: 'var(--fg-subtle)', textAlign: 'center', fontSize: 10 }}>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Flujo de aprobación ───────────────────────────────────── */}
          {subTab === 'aprobacion' && (
            <div className="card">
              {cadena.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--fg-muted)' }}>
                  Sin cadena de aprobación.
                  {presActivo.estado === 'borrador' && (
                    <div style={{ marginTop: 12 }}>
                      <button className="btn btn-secondary" onClick={() => setPanelEnviar(true)}>Enviar a aprobación</button>
                    </div>
                  )}
                </div>
              ) : (
                cadena.map((apr, i) => {
                  const esActual = siguienteApr?.id === apr.id;
                  return (
                    <div key={apr.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px',
                      borderBottom: i < cadena.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      background: esActual ? 'rgba(99,102,241,.04)' : 'transparent',
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                        background: apr.estado === 'aprobado' ? 'var(--green)' : apr.estado === 'rechazado' ? 'var(--danger)' : esActual ? 'var(--accent)' : 'var(--bg-subtle)',
                        color: apr.estado !== 'pendiente' || esActual ? '#fff' : 'var(--fg-muted)',
                      }}>
                        {apr.estado === 'aprobado' ? '✓' : apr.estado === 'rechazado' ? '✗' : apr.orden}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{apr.nombre_aprobador}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                          {apr.estado === 'pendiente'
                            ? (esActual ? 'Pendiente — turno actual' : 'Pendiente')
                            : apr.estado === 'aprobado'
                              ? `Aprobado ${apr.fecha_accion ? new Date(apr.fecha_accion).toLocaleDateString('es-PE') : ''}`
                              : `Rechazado ${apr.fecha_accion ? new Date(apr.fecha_accion).toLocaleDateString('es-PE') : ''}`}
                        </div>
                        {apr.comentario && <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 4, fontStyle: 'italic' }}>"{apr.comentario}"</div>}
                        {puedoAprobar && esActual && (
                          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input className="input" style={{ flex: 1, minWidth: 160, fontSize: 12 }}
                              placeholder="Comentario (opcional)"
                              value={comentarioApr}
                              onChange={e => setComentarioApr(e.target.value)} />
                            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => handleProcesar(apr.id, 'aprobar')}>Aprobar</button>
                            <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => handleProcesar(apr.id, 'rechazar')}>Rechazar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {/* ── Panel: Nuevo presupuesto ──────────────────────────────────── */}
      {panelNuevo && (
        <>
          <Overlay onClick={() => setPanelNuevo(false)} />
          <div style={panelStyle}>
            <div style={pHead}><strong>Nuevo presupuesto</strong><CloseBtn onClick={() => setPanelNuevo(false)} /></div>
            <div style={pBody}>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Nombre</label>
                <input className="input" value={formPre.nombre} onChange={e => setFormPre(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej. Presupuesto Operativo Mayo 2026" />
              </div>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Período (YYYY-MM o YYYY)</label>
                <input className="input" value={formPre.periodo} onChange={e => setFormPre(p => ({ ...p, periodo: e.target.value }))} placeholder="2026-05" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="input-group">
                  <label>CECO (opcional)</label>
                  <select className="select" value={formPre.centro_costo_id} onChange={e => setFormPre(p => ({ ...p, centro_costo_id: e.target.value }))}>
                    <option value="">— Todos —</option>
                    {(centrosCosto || []).filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>CEBE (opcional)</label>
                  <select className="select" value={formPre.cebe_id} onChange={e => setFormPre(p => ({ ...p, cebe_id: e.target.value }))}>
                    <option value="">— Todos —</option>
                    {(centrosBeneficio || []).filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Partidas</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 4px 4px 0', fontWeight: 600 }}>Categoría</th>
                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 600 }}>Descripción</th>
                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 600 }}>Moneda</th>
                    <th style={{ textAlign: 'right', padding: '4px 0 4px 4px', fontWeight: 600 }}>Monto</th>
                    <th style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {formPartidas.map((fp, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 4px 3px 0' }}>
                        <select className="select" style={{ fontSize: 12 }} value={fp.categoria}
                          onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, categoria: e.target.value } : x))}>
                          {CATEGORIAS_PRESUPUESTO.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="input" style={{ fontSize: 12 }} value={fp.descripcion} placeholder="Descripción"
                          onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <select className="select" style={{ fontSize: 12 }} value={fp.moneda || 'PEN'} onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, moneda: e.target.value } : x))}>
                          <option value="PEN">PEN</option><option value="USD">USD</option>
                        </select>
                      </td>
                      <td style={{ padding: '3px 0 3px 4px' }}>
                        <input className="input" style={{ fontSize: 12, textAlign: 'right' }} type="number" min="0" step="0.01" value={fp.monto_presupuestado} placeholder="0.00"
                          onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, monto_presupuestado: e.target.value } : x))} />
                      </td>
                      <td style={{ textAlign: 'center', padding: 3 }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, lineHeight: 1 }}
                          onClick={() => setFormPartidas(prev => prev.filter((_, j) => j !== i))}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-ghost" style={{ fontSize: 12, width: '100%', marginBottom: 20 }}
                onClick={() => setFormPartidas(prev => [...prev, { categoria: 'Materiales', descripcion: '', monto_presupuestado: '', moneda: 'PEN' }])}>
                + Agregar partida
              </button>
              <button className="btn btn-primary" style={{ width: '100%' }}
                disabled={saving || !formPre.nombre.trim() || formPartidas.length === 0}
                onClick={guardarNuevo}>
                {saving ? 'Guardando…' : 'Guardar presupuesto'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Detalle de partida ─────────────────────────────────── */}
      {panelDetalle && (
        <>
          <Overlay onClick={() => setPanelDetalle(null)} />
          <div style={{ ...panelStyle, width: 560 }}>
            <div style={pHead}>
              <div>
                <strong>{panelDetalle.categoria}</strong>
                {panelDetalle.descripcion && <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 8 }}>{panelDetalle.descripcion}</span>}
              </div>
              <CloseBtn onClick={() => setPanelDetalle(null)} />
            </div>
            <div style={pBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Presupuestado</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{panelDetalle.resultadoSinPartida ? '—' : formatoMoneda(panelDetalle.monto_presupuestado, panelDetalle.moneda)}</div>
                </div>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Real ejecutado</div>
                  {(() => {
                    const r = panelDetalle.resultadoSinPartida ? panelDetalle.resultadoSinPartida.real : obtenerResultado(panelDetalle)?.real || 0;
                    return <div style={{ fontSize: 18, fontWeight: 700, color: r > Number(panelDetalle.monto_presupuestado) ? 'var(--danger)' : 'var(--green)' }}>{formatoMoneda(r, panelDetalle.moneda)}</div>;
                  })()}
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Desglose del Real</div>
              {(() => {
                const items = panelDetalle.resultadoSinPartida ? panelDetalle.resultadoSinPartida.desglose : obtenerResultado(panelDetalle)?.desglose || [];
                if (!items.length) return <div style={{ color: 'var(--fg-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin registros para este período.</div>;
                return (
                  <table className="tbl" style={{ fontSize: 12 }}>
                    <thead><tr><th>Fecha</th><th>Descripción</th><th>Proveedor</th><th style={{ textAlign: 'right' }}>Monto</th><th>Documento</th></tr></thead>
                    <tbody>
                      {items.map((g, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap' }}>{g.fecha}</td>
                          <td>{g.descripcion}</td>
                          <td style={{ color: 'var(--fg-muted)' }}>{g.proveedor}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatoMoneda(g.monto, g.moneda || panelDetalle.moneda)}</td>
                          <td style={{ color: 'var(--fg-muted)' }}>{g.documento}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Enviar a aprobación ────────────────────────────────── */}
      {panelEnviar && (
        <>
          <Overlay onClick={() => setPanelEnviar(false)} />
          <div style={{ ...panelStyle, width: 420 }}>
            <div style={pHead}><strong>Cadena de aprobación</strong><CloseBtn onClick={() => setPanelEnviar(false)} /></div>
            <div style={pBody}>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 16 }}>
                Selecciona 1 a 4 aprobadores. La firma es secuencial: cada uno actúa después del anterior.
              </p>
              {aprobadores.map((apr, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', width: 20 }}>{i + 1}.</span>
                  <select className="select" style={{ flex: 1 }} value={apr?.id || ''}
                    onChange={e => {
                      const u = usuariosEmpresa.find(u => u.id === e.target.value);
                      setAprobadores(prev => prev.map((a, j) => j === i ? (u || null) : a));
                    }}>
                    <option value="">— Seleccionar usuario —</option>
                    {usuariosEmpresa.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
                  </select>
                  {aprobadores.length > 1 && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 20, lineHeight: 1 }}
                      onClick={() => setAprobadores(prev => prev.filter((_, j) => j !== i))}>×</button>
                  )}
                </div>
              ))}
              {aprobadores.length < 4 && (
                <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 20 }}
                  onClick={() => setAprobadores(prev => [...prev, null])}>
                  + Agregar aprobador
                </button>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }}
                disabled={saving || aprobadores.filter(Boolean).length === 0}
                onClick={handleEnviar}>
                {saving ? 'Enviando…' : 'Enviar a aprobación'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const EMPTY_ARRAY = [];

function Empty({ children = 'Sin datos para los filtros seleccionados.' }) {
  return <div className="bic-empty">{children}</div>;
}

function Panel({ title, children }) {
  return (
    <section className="card bic-panel">
      <div className="card-head"><h3>{title}</h3></div>
      {children}
    </section>
  );
}

function Tooltip({ title, description, items, footer }) {
  return (
    <div className="bi-kpi-tooltip" role="tooltip">
      <div className="bi-tooltip-title">{title}</div>
      <div className="bi-tooltip-description">{description}</div>
      <div className="bi-tooltip-separator" />
      <div className="bi-tooltip-items">
        {items.length ? items.map((row, index) => (
          <div className="bi-tooltip-row" key={index}>
            <span>{row.label}</span><strong>{row.value}</strong>
          </div>
        )) : (
          <div className="bi-tooltip-row is-empty">
            <span>Sin datos en el per?odo</span><strong>{'—'}</strong>
          </div>
        )}
      </div>
      <div className="bi-tooltip-separator" />
      <div className="bi-tooltip-row bi-tooltip-result">
        <span>Total</span><strong>{footer}</strong>
      </div>
    </div>
  );
}

function rowsTable(headers, rows, empty) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>{headers.map(header => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows : (
            <tr><td colSpan={headers.length}><Empty>{empty}</Empty></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function BIFinanciero() {
  const [tab, setTab] = useState('resultados');
  const {
    comprasGastos = EMPTY_ARRAY,
    ots = EMPTY_ARRAY,
    empresa,
    centrosCosto = EMPTY_ARRAY,
    centrosBeneficio = EMPTY_ARRAY,
    cxc = EMPTY_ARRAY,
    cxp = EMPTY_ARRAY,
    cxpPagos = EMPTY_ARRAY,
    cuentas = EMPTY_ARRAY,
    movimientosTesoreria = EMPTY_ARRAY,
    facturas = EMPTY_ARRAY,
    presupuestos = EMPTY_ARRAY,
    presupuestoPartidas = EMPTY_ARRAY,
    perfilSociedad,
    sociedadActiva,
    sociedadesDisponibles = EMPTY_ARRAY,
  } = useApp();
  const now = new Date();
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [periodo, setPeriodo] = useState(hoy.slice(0, 7));
  const monedaBase = normalizarMonedaBI(empresa?.moneda || empresa?.moneda_base || 'PEN');
  const monedas = ['PEN', 'USD'];
  const [moneda, setMoneda] = useState(monedaBase);

  useEffect(() => {
    if (!monedas.includes(moneda)) setMoneda(monedaBase);
  }, [moneda, monedaBase]);

  const [cecosSel, setCecosSel] = useState([]);
  const [cebesSel, setCebesSel] = useState([]);
  const [scopeMode, setScopeMode] = useState(ER_SCOPE_MODE.SOCIEDAD);
  const [scopeSociedadId, setScopeSociedadId] = useState(
    sociedadActiva?.id || sociedadesDisponibles[0]?.id || '',
  );
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cache = useRef(new Map());
  const supabaseMode = isSupabaseMode();
  const multisociedadActiva = Boolean(
    empresa?.multisociedad_habilitado
      && perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD,
  );
  const puedeComparar = multisociedadActiva && sociedadesDisponibles.length > 1;
  const scopeIds = scopeMode === ER_SCOPE_MODE.SOCIEDAD
    ? [scopeSociedadId || sociedadActiva?.id].filter(Boolean)
    : sociedadesDisponibles.map(sociedad => sociedad.id);
  const cecosEmpresa = centrosCosto.filter(centro => (
    centro.empresa_id === empresa?.id && centro.estado === 'activo'
  ));
  const cebesEmpresa = centrosBeneficio.filter(centro => (
    centro.empresa_id === empresa?.id && centro.estado === 'activo'
  ));
  const cecosCebe = cebesSel.length
    ? cecosEmpresa.filter(centro => cebesSel.includes(centro.cebe_id)).map(centro => centro.id)
    : null;
  const efectivoCecos = cecosSel.length && cecosCebe
    ? cecosSel.filter(id => cecosCebe.includes(id))
    : cecosSel.length ? cecosSel : cecosCebe;
  const periods = useMemo(() => {
    const [year, month] = periodo.split('-').map(Number);
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(year, month - 6 + index, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });
  }, [periodo]);
  const scopeIdsKey = scopeIds.slice().sort().join('|');
  const cecosKey = cecosSel.slice().sort().join('|');
  const cebesKey = cebesSel.slice().sort().join('|');
  const sociedadesKey = sociedadesDisponibles.map(sociedad => sociedad.id).sort().join('|');
  const queryKey = JSON.stringify([
    periods,
    supabaseMode,
    empresa?.id,
    multisociedadActiva,
    scopeSociedadId,
    scopeMode,
    scopeIdsKey,
    sociedadesKey,
    cecosKey,
    cebesKey,
    comprasGastos.length,
    ...(!supabaseMode ? [ots.length, centrosCosto.length, centrosBeneficio.length] : []),
  ]);

  useEffect(() => {
    if (!empresa?.id) {
      setResultados([]);
      return;
    }
    if (multisociedadActiva && !sociedadesDisponibles.some(sociedad => sociedad.id === scopeSociedadId)) {
      setScopeSociedadId(sociedadActiva?.id || sociedadesDisponibles[0]?.id || '');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    let request = cache.current.get(queryKey);

    if (!request) {
      request = Promise.all(periods.map(period => {
        if (supabaseMode) {
          return multisociedadActiva
            ? getEstadoResultadosPorScope({
              empresaId: empresa.id,
              periodo: period,
              mode: scopeMode,
              sociedadIds: scopeIds,
              cecoIds: cecosSel,
              cebeIds: cebesSel,
            })
            : getEstadoResultados({
              empresaId: empresa.id,
              periodo: period,
              cecoIds: cecosSel,
              cebeIds: cebesSel,
            });
        }
        const filteredCecos = cecosSel.length && cecosCebe
          ? cecosSel.filter(id => cecosCebe.includes(id))
          : cecosSel.length ? cecosSel : cecosCebe;
        const cg = filteredCecos
          ? comprasGastos.filter(gasto => filteredCecos.includes(gasto.centro_costo_id))
          : comprasGastos;
        const otRows = filteredCecos
          ? ots.filter(ot => filteredCecos.includes(ot.centro_costo_id))
          : ots;
        return Promise.resolve(buildEstadoResultados({
          base: MOCK.estadoResultados,
          comprasGastos: cg,
          ots: otRows,
          centrosCosto,
          centrosBeneficio,
          empresa,
          periodo: period,
        }));
      }));
      cache.current.set(queryKey, request);
    }
    request
      .then(rows => { if (!cancelled) setResultados(rows); })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message || 'No se pudo calcular el Estado de Resultados.');
          setResultados([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryKey]);

  const serie = serieResultados(resultados, moneda);
  const idx = serie.findIndex(row => row.periodo === periodo);
  const actual = serie[idx] || null;
  const anterior = serie[idx - 1] || null;
  const er = actual?.source;
  const comparativo = er?.scopeMode === ER_SCOPE_MODE.COMPARATIVO ? er.comparativo : null;
  const sociedadLabel = id => sociedadesDisponibles.find(sociedad => sociedad.id === id)?.nombre || id;
  const sociedadIds = multisociedadActiva ? scopeIds : EMPTY_ARRAY;
  const cxcData = calcularCxc({
    cxc, empresaId: empresa?.id, sociedadIds, multisociedad: multisociedadActiva, moneda, hoy,
  });
  const cxpData = calcularCxp({
    cxp, cxpPagos, empresaId: empresa?.id, sociedadIds, multisociedad: multisociedadActiva, moneda, hoy,
  });
  const semanas = calcularSemanasCaja({
    movimientos: movimientosTesoreria,
    empresaId: empresa?.id,
    sociedadIds,
    multisociedad: multisociedadActiva,
    moneda,
    hoy,
  });
  const maxAcumulado = Math.max(1, ...semanas.map(row => Math.abs(row.acumulado)));
  const cajaNeta = calcularCajaNetaMes({
    movimientos: movimientosTesoreria,
    periodo,
    empresaId: empresa?.id,
    sociedadIds,
    multisociedad: multisociedadActiva,
    moneda,
  });
  const cliente = row => {
    const cuenta = cuentas.find(item => item.id === row.cuenta_id);
    return cuenta?.razon_social || cuenta?.nombre_comercial || row.cliente || 'Sin cliente';
  };
  const proveedor = row => row.proveedores?.razon_social || row.proveedor || row.nombre_emisor || 'Proveedor';
  const ventas = calcularFacturacionPorCliente({
    facturas, cuentas, periodo, empresaId: empresa?.id, sociedadIds,
    multisociedad: multisociedadActiva, moneda,
  });
  const retenciones = calcularRetenciones({
    facturas, cuentas, periodo, empresaId: empresa?.id, sociedadIds,
    multisociedad: multisociedadActiva, moneda,
  });
  const dinero = value => `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(value || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const compacto = value => {
    const number = Number(value) || 0;
    const unit = Math.abs(number) >= 1e6 ? 1e6 : Math.abs(number) >= 1e3 ? 1e3 : 1;
    const formatted = unit === 1 ? number : (number / unit).toFixed(1).replace(/\.0$/, '');
    return `${formatted}${unit === 1e6 ? 'M' : unit === 1e3 ? 'K' : ''}`;
  };
  const plural = (number, singular, pluralForm) => `${number} ${number === 1 ? singular : pluralForm}`;
  const periodLabel = new Date(`${periodo}-01T00:00:00`)
    .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
    .replace(/^\w/, character => character.toUpperCase());
  const ingresos = actual?.ingresos || 0;
  const bruto = actual?.utilidadBruta || 0;
  const neto = actual?.resultadoNeto || 0;
  const margenBruto = porcentajeDeIngresos(bruto, ingresos);
  const margenNeto = porcentajeDeIngresos(neto, ingresos);
  const variacion = variacionPorcentual(ingresos, anterior?.ingresos || 0);
  const tabla = tablaResultadosFinancieros(actual, anterior);
  const costos = categoriasCostosResultados(er, moneda);
  const totalCostos = totalizar(costos);
  const exportData = {
    tablaResultados: tabla.map(row => [
      row.label,
      row.value,
      row.porcentaje.toFixed(1),
      anterior ? row.previo : '',
      anterior ? row.value - row.previo : '',
    ]),
    cxc: cxcData,
    cxp: cxpData,
    semanas,
    cliente,
    proveedor,
    presupuestoRows: filasPresupuestoFinanciero({
      presupuestos,
      partidas: presupuestoPartidas,
      empresaId: empresa?.id,
      periodo,
    }),
  };
  const exportar = () => {
    const { headers, rows } = filasCSVFinanciero(tab, exportData);
    const csv = crearCSVFinanciero(headers, rows);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bi-financiero-${tab}-${periodo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const kpis = [
    ['Ingresos', actual ? dinero(ingresos) : '—',
      variacion == null ? 'Sin mes anterior comparable' : `${variacion >= 0 ? '▲' : '▼'} ${P(Math.abs(variacion))} vs. mes anterior`,
      'Ingresos del Estado de Resultados.',
      (er?.er?.ingresos?.items || []).map(item => ({ label: item.label, value: dinero(item.totals?.[moneda]) })),
      dinero(ingresos)],
    ['Resultado bruto', actual ? dinero(bruto) : '—', `${P(margenBruto)} de ingresos`,
      'Ingresos menos costo de ventas.',
      (er?.er?.costoVentas?.items || []).map(item => ({ label: item.label, value: dinero(item.totals?.[moneda]) })),
      dinero(bruto)],
    ['Resultado neto', actual ? dinero(neto) : '—', `${P(margenNeto)} de ingresos`,
      'Resultado neto del Estado de Resultados.',
      [...(er?.er?.gastosOp?.items || []), ...(er?.er?.gastosFin?.items || [])]
        .map(item => ({ label: item.label, value: dinero(item.totals?.[moneda]) })),
      dinero(neto)],
    ['Por cobrar (CxC)', dinero(cxcData.total), `${dinero(cxcData.vencida)} vencida`,
      'Saldos activos en la moneda elegida.',
      cxcData.tramos.map(item => ({
        label: `${item.label} · ${plural(item.cantidad, 'comprobante', 'comprobantes')}`,
        value: dinero(item.monto),
      })),
      dinero(cxcData.total)],
    ['Por pagar (CxP)', dinero(cxpData.total),
      `${dinero(cxpData.vencida)} vencida · ${dinero(cxpData.proximos30)} en 30 días`,
      'Saldo descontando pagos registrados.',
      cxpData.tramos.map(item => ({
        label: `${item.label} · ${plural(item.cantidad, 'comprobante', 'comprobantes')}`,
        value: dinero(item.monto),
      })),
      dinero(cxpData.total)],
    ['Caja neta del mes', dinero(cajaNeta), 'Ingresos menos egresos de tesorería',
      'Neto de movimientos del mes elegido.',
      semanas.map(item => ({
        label: `${formatDateFinanciero(item.inicio)}–${formatDateFinanciero(item.fin)}`,
        value: dinero(item.neto),
      })),
      dinero(cajaNeta)],
  ];
  const chartMax = Math.max(1, ...serie.flatMap(row => [Math.abs(row.ingresos), Math.abs(row.resultadoNeto)]));
  const chart = (
    <div className="bic-bars bif-chart">
      {serie.map(row => (
        <div className="bic-bar-col" key={row.periodo}>
          <strong title={`Ingresos ${dinero(row.ingresos)} · Neto ${dinero(row.resultadoNeto)}`}>
            {compacto(row.ingresos)} / {compacto(row.resultadoNeto)}
          </strong>
          <div className="bif-chart-track">
            <i className={row.periodo === periodo ? 'is-current' : ''}
              style={{ height: `${Math.max(2, Math.abs(row.ingresos) / chartMax * 100)}%` }} />
            <i className={`bif-net-bar ${row.resultadoNeto < 0 ? 'is-negative' : ''} ${row.periodo === periodo ? 'is-current' : ''}`}
              style={{ height: `${Math.max(2, Math.abs(row.resultadoNeto) / chartMax * 100)}%` }} />
          </div>
          <span>{row.periodo.slice(5)}</span>
        </div>
      ))}
    </div>
  );
  const tablaRows = tabla.map(row => (
    <tr key={row.label}>
      <td><strong>{row.label}</strong></td>
      <td>{dinero(row.value)}</td>
      <td>{P(row.porcentaje)}</td>
      <td>{anterior ? dinero(row.previo) : '—'}</td>
      <td>{anterior ? dinero(row.value - row.previo) : '—'}</td>
    </tr>
  ));
  const ventasRows = ventas.map(row => (
    <tr key={row.nombre}>
      <td>{row.nombre}</td>
      <td>{plural(row.cantidad, 'comprobante', 'comprobantes')}</td>
      <td>{dinero(row.monto)}</td>
    </tr>
  ));
  const cobranzaRows = cxcData.vencidas.map(row => (
    <tr key={row.id}>
      <td>{cliente(row)}</td>
      <td>{row.numero || row.comprobante || row.id}</td>
      <td>{formatDateFinanciero(row.fecha_vencimiento || row.vence)}</td>
      <td>{plural(row.mora, 'día', 'días')}</td>
      <td>{dinero(row.saldo)}</td>
    </tr>
  ));
  const retencionRows = retenciones.map((row, index) => (
    <tr key={`${row.comprobante}-${index}`}>
      <td>{row.cliente}</td><td>{row.comprobante}</td><td>{dinero(row.monto)}</td>
    </tr>
  ));
  const pagosRows = cxpData.urgentes.map(row => (
    <tr key={row.id}>
      <td>{proveedor(row)}</td>
      <td>{row.concepto || row.categoria || row.factura_numero || 'Sin concepto'}</td>
      <td>{formatDateFinanciero(row.fecha_vencimiento)}</td>
      <td>{row.dias < 0 ? `Vencida ${Math.abs(row.dias)} d` : plural(row.dias, 'día', 'días')}</td>
      <td>{dinero(row.saldo)}</td>
    </tr>
  ));
  const cajaRows = semanas.map(row => (
    <tr key={row.inicio}>
      <td>{formatDateFinanciero(row.inicio)} {'·'} {formatDateFinanciero(row.fin)}</td>
      <td>{dinero(row.ingresos)}</td><td>{dinero(row.egresos)}</td>
      <td>{dinero(row.neto)}</td><td>{dinero(row.acumulado)}</td>
    </tr>
  ));

  return (
    <div className="bic-page bif-page">
      <header className="bic-header">
        <div>
          <h1>BI Financiero</h1>
          <div className="page-sub">Resultados, cobranza, pagos y caja {'·'} {periodLabel} {'·'} {moneda}</div>
        </div>
        <div className="bic-controls">
          <div className="bic-segment" aria-label="Moneda">
            {monedas.map(item => (
              <button key={item} className={moneda === item ? 'active' : ''} onClick={() => setMoneda(item)}>
                {item}
              </button>
            ))}
          </div>
          <input aria-label="Mes" className="input bic-month" type="month" value={periodo}
            onChange={event => setPeriodo(event.target.value)} />
          {multisociedadActiva && (
            <select className="select bif-scope-mode" aria-label="Alcance de sociedad" value={scopeMode}
              onChange={event => setScopeMode(event.target.value)}>
              <option value={ER_SCOPE_MODE.SOCIEDAD}>Sociedad {'única'}</option>
              {puedeComparar && <option value={ER_SCOPE_MODE.COMPARATIVO}>Comparativo</option>}
              {puedeComparar && <option value={ER_SCOPE_MODE.CONSOLIDADO}>Consolidado</option>}
            </select>
          )}
          {multisociedadActiva && scopeMode === ER_SCOPE_MODE.SOCIEDAD && (
            <select className="select bif-society" aria-label="Sociedad" value={scopeSociedadId}
              onChange={event => setScopeSociedadId(event.target.value)}>
              {sociedadesDisponibles.map(sociedad => (
                <option key={sociedad.id} value={sociedad.id}>
                  {sociedad.nombre || sociedad.razon_social || sociedad.codigo}
                </option>
              ))}
            </select>
          )}
          <MultiSelect opts={cecosEmpresa} sel={cecosSel} onSel={setCecosSel} placeholder="CECO: Todos" />
          <MultiSelect opts={cebesEmpresa} sel={cebesSel} onSel={setCebesSel} placeholder="CEBE: Todos" />
          <button className="btn btn-secondary" onClick={exportar}>Exportar CSV</button>
          <small className="bif-filter-note">CECO y CEBE solo filtran Resultados.</small>
        </div>
      </header>
      {loading && <div className="card bif-status" role="status">Cargando Estado de Resultados{'…'}</div>}
      {error && <div className="alert alert-error bif-status" role="alert">{error}</div>}
      {comparativo && (
        <div className="card bic-panel">
          <div className="card-head"><h3>Estado de Resultados comparativo</h3></div>
          {rowsTable(['Concepto', ...comparativo.map(item => sociedadLabel(item.sociedadId))], [
            ['Ingresos', item => item.data.er.ingresos.total],
            ['Costo de ventas', item => item.data.er.costoVentas.total],
            ['Utilidad bruta', item => item.data.utilidadBruta],
            ['Gastos operativos', item => item.data.er.gastosOp.total],
            ['Gastos financieros', item => item.data.er.gastosFin.total],
            ['Resultado neto', item => item.data.resultadoNeto],
          ].map(([label, get]) => (
            <tr key={label}>
              <td><strong>{label}</strong></td>
              {comparativo.map(item => <td key={item.sociedadId}>{dinero(get(item)?.[moneda] || 0)}</td>)}
            </tr>
          )), 'Sin datos comparativos.')}
        </div>
      )}
      <div className="kpi-grid bic-kpis bif-kpis">
        {kpis.map(([title, value, note, description, items, footer]) => (
          <div className="kpi-card bi-kpi-card bic-kpi" key={title}>
            <div className="kpi-label">
              {title}
              <span className="bic-tooltip-trigger" tabIndex="0" aria-label={`Detalle: ${title}`}>
                {'ⓘ'}<Tooltip title={title} description={description} items={items} footer={footer} />
              </span>
            </div>
            <div className="kpi-value">{value}</div><div className="kpi-sub">{note}</div>
          </div>
        ))}
      </div>
      <div className="tabs bic-tabs">
        {[
          ['resultados', 'Resultados'],
          ['cobranza', 'Cobranza (CxC)'],
          ['pagos', 'Pagos (CxP)'],
          ['flujo', 'Flujo de caja'],
          ['presupuesto', 'Presupuesto vs Real'],
        ].map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'resultados' && (
        <div className="bic-content">
          <Panel title="Estado de resultados">
            {rowsTable(['Concepto', 'Mes', '% de ingresos', 'Mes anterior', 'Variación'], tablaRows,
              'No hay resultados para este mes y moneda.')}
          </Panel>
          <div className="bic-grid">
            <Panel title="Ingresos y resultado neto, últimos 6 meses">
              <div className="bif-chart-legend">
                <span><i />Ingresos</span><span><i className="is-net" />Resultado neto</span>
              </div>
              {chart}
            </Panel>
            <Panel title="Costos y gastos por categoría">
              {costos.length ? (
                <div className="bic-list">
                  {costos.map((row, index) => (
                    <div className="bic-list-row" key={`${row.nombre}-${index}`}>
                      <span>{row.nombre}<small>{P(totalCostos ? row.monto / totalCostos * 100 : 0)}</small></span>
                      <strong>{dinero(row.monto)}</strong>
                    </div>
                  ))}
                </div>
              ) : <Empty>No hay costos ni gastos en este mes y moneda.</Empty>}
            </Panel>
          </div>
          <Panel title="Facturación por cliente">
            {rowsTable(['Cliente', 'Comprobantes', 'Subtotal sin IGV'], ventasRows,
              'No hay facturas ni boletas en este mes y moneda.')}
          </Panel>
        </div>
      )}
      {tab === 'cobranza' && (
        <div className="bic-content">
          <Panel title="Antigüedad de cuentas por cobrar">
            <div className="bic-series">
              {cxcData.tramos.map(row => (
                <div key={row.key}><span>{row.label}</span><b>{dinero(row.monto)}</b>
                  <b>{plural(row.cantidad, 'comprobante', 'comprobantes')}</b></div>
              ))}
            </div>
          </Panel>
          <Panel title="Facturas vencidas por cobrar">
            {rowsTable(['Cliente', 'Comprobante', 'Vencimiento', 'Días de mora', 'Saldo'], cobranzaRows,
              'No hay facturas vencidas por cobrar.')}
          </Panel>
          <Panel title="Retenciones SUNAT del mes">
            {rowsTable(['Cliente', 'Comprobante', 'Monto de retención'], retencionRows,
              'No hay retenciones en este mes y moneda.')}
          </Panel>
        </div>
      )}
      {tab === 'pagos' && (
        <div className="bic-content">
          <Panel title="Antigüedad de cuentas por pagar">
            <div className="bic-series">
              {cxpData.tramos.map(row => (
                <div key={row.key}><span>{row.label}</span><b>{dinero(row.monto)}</b>
                  <b>{plural(row.cantidad, 'comprobante', 'comprobantes')}</b></div>
              ))}
            </div>
          </Panel>
          <Panel title="Por cobrar vs. por pagar, próximos 30 días">
            <div className="bic-compare bif-near-compare">
              <div><span>CxC {'·'} próximos 30 días</span>
                <strong>{dinero(calcularCxcProximos30(cxcData, hoy))}</strong></div>
              <div><span>CxP {'·'} próximos 30 días</span><strong>{dinero(cxpData.proximos30)}</strong></div>
            </div>
            <p className="bif-overdue-note">CxP vencida: <strong>{dinero(cxpData.vencida)}</strong></p>
          </Panel>
          <Panel title="Pagos más urgentes">
            {rowsTable(['Proveedor', 'Concepto', 'Vencimiento', 'Días', 'Saldo'], pagosRows,
              'No hay cuentas por pagar pendientes.')}
          </Panel>
        </div>
      )}
      {tab === 'flujo' && (
        <div className="bic-content">
          <Panel title="Flujo de caja &#183; &uacute;ltimas 8 semanas">
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Semana</th><th>Ingresos</th><th>Egresos</th><th>Neto</th><th>Acumulado</th></tr></thead>
                <tbody>{cajaRows}</tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Flujo neto acumulado">
            <div className="bic-bars bif-cumulative">
              {semanas.map(row => (
                <div className="bic-bar-col" key={row.inicio}>
                  <strong title={dinero(row.acumulado)}>{compacto(row.acumulado)}</strong>
                  <div className="bic-bar-track">
                    <i className={`bif-cumulative-bar ${row.acumulado < 0 ? 'is-negative' : ''} ${row.inicio === semanas[7]?.inicio ? 'is-current' : ''}`}
                      style={{ height: `${Math.max(3, Math.abs(row.acumulado) / maxAcumulado * 100)}%` }} />
                  </div>
                  <span>{row.inicio.slice(5)}</span>
                </div>
              ))}
            </div>
            <p className="bif-filter-note">Acumulado de netos semanales; no representa saldo bancario.</p>
          </Panel>
        </div>
      )}
      {tab === 'presupuesto' && <TabPresupuesto periodo={periodo} efectivoCecos={efectivoCecos} />}
    </div>
  );
}
