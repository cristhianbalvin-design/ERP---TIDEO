import React, { useCallback, useEffect, useState } from 'react';
import { accionRendicion, guardarFondo, obtenerRendicion, revisarGasto } from '../../../services/transporteLiquidacionService.js';
import { etiquetaContador, formatearImporte } from './transporteUtils.js';
import { DialogoLiq, ESTADO_GASTO, ESTADO_REN, TIPO_GASTO, fechaDMY } from './liquidacionComun.jsx';

const ICONO = { combustible: '⛽', peaje: '⛿', viatico: '🍽', estiba: '⇅', otro: '•' };
const horaFecha = valor => (valor ? new Date(valor).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function FormFondo({ ren, busy, error, onClose, onGuardar }) {
  const [monto, setMonto] = useState(ren?.fondo_entregado ?? '');
  const [ref, setRef] = useState(ren?.fondo_referencia || '');
  const [intento, setIntento] = useState(false);
  const err = monto === '' || !(Number(monto) >= 0) ? 'Ingresa el monto entregado (0 si no hubo fondo).' : '';
  return <DialogoLiq title="Fondo entregado al conductor" subtitle="Lo que se le dio antes del viaje" busy={busy} error={error} onClose={onClose}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" disabled={busy} onClick={() => { setIntento(true); if (!err) onGuardar(Number(monto), ref.trim()); }}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
    <div className="dx-tmsliq-fgrid">
      <label className="dx-ui-field" htmlFor="fondo-monto"><span>Monto <b className="dx-ui-required">*</b></span>
        <input id="fondo-monto" type="number" min="0" step="0.01" value={monto} aria-invalid={intento && !!err} onChange={e => setMonto(e.target.value)} />
        {intento && err && <small className="dx-ui-field-error">{err}</small>}</label>
      <label className="dx-ui-field" htmlFor="fondo-ref"><span>Referencia</span>
        <input id="fondo-ref" value={ref} placeholder="Ej.: egreso de Caja Chica CC-0012" onChange={e => setRef(e.target.value)} /></label>
    </div>
    <p className="dx-tmsliq-help">Solo se registra para calcular el saldo; no mueve Caja Chica.</p>
  </DialogoLiq>;
}

function FormObservar({ gasto, moneda, busy, error, onClose, onGuardar }) {
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);
  const err = !motivo.trim() ? 'Escribe por qué lo observas.' : '';
  return <DialogoLiq title="Observar gasto" subtitle={`${TIPO_GASTO[gasto.tipo] || gasto.tipo} · ${formatearImporte(gasto.monto, gasto.moneda || moneda)}`}
    busy={busy} error={error} onClose={onClose}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" disabled={busy} onClick={() => { setIntento(true); if (!err) onGuardar(motivo.trim()); }}>{busy ? 'Guardando…' : 'Observar'}</button></>}>
    <label className="dx-ui-field" htmlFor="obs-motivo"><span>Motivo <b className="dx-ui-required">*</b></span>
      <textarea id="obs-motivo" rows={3} value={motivo} aria-invalid={intento && !!err} placeholder="Ej.: sin comprobante" onChange={e => setMotivo(e.target.value)} />
      {intento && err && <small className="dx-ui-field-error">{err}</small>}</label>
    <p className="dx-tmsliq-help">Un gasto observado no cuenta como costo del viaje ni se reembolsa.</p>
  </DialogoLiq>;
}

export function RendicionDetalle({ viajeId, empresaId, perm, onNav }) {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dlgError, setDlgError] = useState('');
  const [aviso, setAviso] = useState('');

  const reload = useCallback(async () => {
    if (!empresaId) return;
    setError('');
    try { setDatos(await obtenerRendicion(empresaId, viajeId)); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [empresaId, viajeId]);
  useEffect(() => { setLoading(true); reload(); }, [reload]);

  async function ejecutar(fn, ok) {
    setBusy(true); setDlgError('');
    try { await fn(); setDlg(null); if (ok) setAviso(ok); await reload(); }
    catch (e) { if (dlg) setDlgError(e.message); else setAviso(e.message); }
    finally { setBusy(false); }
  }

  const volver = <button type="button" className="dx-tmsliq-back" onClick={() => onNav?.('transporte-liquidacion', { tab: 'ren' })}>‹ Rendiciones</button>;
  if (loading) return <section className="dx-ui dx-tms dx-tmsliq">{volver}<div className="dx-tms-skeletons">{[1, 2].map(k => <div key={k} className="dx-tms-sk" />)}</div></section>;
  if (error || !datos) return <section className="dx-ui dx-tms dx-tmsliq">{volver}<div className="dx-ui-card dx-tms-state"><span className="dx-tms-state-i is-red">!</span>
    <b>{error ? 'No pudimos cargar la rendición' : 'El viaje no existe'}</b><span>{error}</span></div></section>;

  const { rendicion: ren, viaje: v, gastos } = datos;
  const moneda = ren?.moneda || v.moneda || 'PEN';
  const aprobada = ren?.estado === 'aprobada';
  const pendientes = gastos.filter(g => g.estado === 'pendiente').length;
  const [tono, texto] = aprobada ? ESTADO_REN.aprobada : pendientes ? ESTADO_REN.por_revisar : ESTADO_REN.abierta;
  const validos = gastos.filter(g => g.estado !== 'observado' && (g.moneda || 'PEN') === moneda);
  const gastado = validos.reduce((s, g) => s + Number(g.monto), 0);
  const aprobado = gastos.filter(g => g.estado === 'aprobado' && (g.moneda || 'PEN') === moneda).reduce((s, g) => s + Number(g.monto), 0);
  const fondo = Number(ren?.fondo_entregado || 0);
  const saldo = Math.round((gastado - fondo) * 100) / 100;
  const terminado = ['entregado', 'en_liquidacion', 'cerrado'].includes(v.estado);
  const puedeRevisar = perm.aprobar && !aprobada;

  return <section className="dx-ui dx-tms dx-tmsliq">
    {volver}
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Rendición de gastos · <span className={`dx-ui-pill ${tono}`}><i />{texto}</span></div>
      <h1 className="dx-ui-title">{ren?.numero || 'Rendición'} · {v.conductor?.nombre || 'Sin conductor'}</h1>
      <p className="dx-ui-sub">Viaje {v.codigo} · {fechaDMY(v.fecha_programada)} · {v.origen_nombre} → {v.destino_nombre}</p></div>
      <div className="dx-ui-actions">
        <button type="button" className="dx-btn" onClick={() => onNav?.('transporte-viaje', { id: v.id })}>Ver viaje</button>
        {perm.editar && !aprobada && <button type="button" className="dx-btn" onClick={() => { setDlgError(''); setDlg({ tipo: 'fondo' }); }}>Fondo entregado</button>}
        {perm.aprobar && aprobada && <button type="button" className="dx-btn" disabled={busy} onClick={() => ejecutar(() => accionRendicion(v.id, 'reabrir'), 'Rendición reabierta.')}>Reabrir</button>}
        {puedeRevisar && <button type="button" className="dx-btn primary" disabled={busy || pendientes > 0 || !terminado}
          title={!terminado ? 'Se aprueba cuando el viaje termina' : pendientes ? 'Revisa todos los gastos primero' : ''}
          onClick={() => ejecutar(() => accionRendicion(v.id, 'aprobar'), 'Rendición aprobada.')}>Aprobar rendición</button>}
      </div>
    </header>

    {aviso && <div className="dx-tmsliq-note is-cyan" role="status">{aviso}<button type="button" aria-label="Cerrar aviso" onClick={() => setAviso('')}>×</button></div>}
    {!terminado && <div className="dx-tmsliq-note is-gray" role="note">El viaje sigue en curso: el conductor aún puede registrar gastos. La rendición se aprueba al terminar.</div>}

    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{formatearImporte(fondo, moneda)}</strong><span>Fondo entregado<small>{ren?.fondo_referencia || 'Sin referencia'}</small></span></div>
      <div className="dx-ui-kpi"><strong>{formatearImporte(gastado, moneda)}</strong><span>Gastado<small>{etiquetaContador(validos.length, 'gasto')} válidos</small></span></div>
      <div className="dx-ui-kpi"><strong>{formatearImporte(aprobado, moneda)}</strong><span>Aprobado</span></div>
      <div className="dx-ui-kpi"><strong>{formatearImporte(Math.abs(saldo), moneda)}</strong><span>{saldo > 0 ? 'A reembolsar al conductor' : saldo < 0 ? 'A devolver por el conductor' : 'Saldo'}
        <small>{pendientes ? 'Si se aprueban los pendientes' : 'Saldo final'}</small></span></div>
    </div>

    <div className="dx-ui-card">
      <div className="dx-ui-toolbar"><h2>Gastos registrados en la app <span className="dx-tmsliq-count">{etiquetaContador(gastos.length, 'gasto')}</span></h2></div>
      {!gastos.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">⛽</span><b>Sin gastos</b><span>El conductor los registra desde la app con la foto del comprobante.</span></div>
        : gastos.map(g => {
          const [gt, gx] = ESTADO_GASTO[g.estado] || ESTADO_GASTO.pendiente;
          return <div key={g.id} className="dx-tmsliq-gasto">
            {g.foto_url ? <a className="dx-tmsliq-thumb" href={g.foto_url} target="_blank" rel="noreferrer" aria-label={`Ver foto del comprobante de ${TIPO_GASTO[g.tipo] || g.tipo}`}>
              <img src={g.foto_url} alt="" loading="lazy" /></a> : <span className="dx-tmsliq-thumb" aria-hidden="true">{ICONO[g.tipo] || '•'}</span>}
            <div><b>{TIPO_GASTO[g.tipo] || g.tipo}</b><small>{[g.lugar, horaFecha(g.fecha)].filter(Boolean).join(' · ') || 'Sin detalle'}</small>
              <span className={`dx-ui-pill ${gt}`}><i />{gx}</span>{g.observacion && <small className="dx-tmsliq-obs">Observado: {g.observacion}</small>}</div>
            <div className="dx-tmsliq-num">{formatearImporte(g.monto, g.moneda || moneda)}{(g.moneda || 'PEN') !== moneda && <small>otra moneda</small>}</div>
            <div className="dx-tmsliq-gacts">{puedeRevisar && g.estado !== 'observado' && <button type="button" className="dx-btn" disabled={busy}
              onClick={() => { setDlgError(''); setDlg({ tipo: 'observar', gasto: g }); }}>Observar</button>}
              {puedeRevisar && g.estado !== 'aprobado' && <button type="button" className="dx-btn primary" disabled={busy}
                onClick={() => ejecutar(() => revisarGasto(g.id, true), 'Gasto aprobado.')}>Aprobar</button>}</div>
          </div>;
        })}
      <div className="dx-tmsliq-note is-cyan dx-tmsliq-inset" role="note">Los gastos aprobados son el costo del viaje en la liquidación. Un gasto observado no se cuenta ni se reembolsa.</div>
    </div>

    {dlg?.tipo === 'fondo' && <FormFondo ren={ren} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={(m, r) => ejecutar(() => guardarFondo(v.id, m, r), 'Fondo guardado.')} />}
    {dlg?.tipo === 'observar' && <FormObservar gasto={dlg.gasto} moneda={moneda} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={m => ejecutar(() => revisarGasto(dlg.gasto.id, false, m), 'Gasto observado.')} />}
  </section>;
}
