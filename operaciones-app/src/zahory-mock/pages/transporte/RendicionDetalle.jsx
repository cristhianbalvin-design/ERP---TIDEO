import React, { useCallback, useEffect, useRef, useState } from 'react';
import { accionRendicion, guardarFondo, obtenerCajaRendicion, obtenerRendicion, revisarGasto } from '../../../services/transporteLiquidacionService.js';
import { etiquetaContador, formatearImporte } from './transporteUtils.js';
import { DialogoLiq, ESTADO_GASTO, ESTADO_REN, TIPO_GASTO, fechaDMY } from './liquidacionComun.jsx';

const ICONO = { combustible: '⛽', peaje: '⛿', viatico: '🍽', estiba: '⇅', otro: '•' };
const horaFecha = valor => (valor ? new Date(valor).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const redondear = valor => Math.round(Number(valor) * 100) / 100;
const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function FormFondo({ ren, cajas, moneda, busy, error, onClose, onGuardar }) {
  const [monto, setMonto] = useState(ren?.fondo_entregado ?? '');
  const [ref, setRef] = useState(ren?.fondo_referencia || '');
  const [cajaId, setCajaId] = useState(ren?.fondo_caja_id || '');
  const [fecha, setFecha] = useState(ren?.fondo_fecha || hoyLima());
  const [intento, setIntento] = useState(false);
  const cajaRef = useRef(null);
  const montoRef = useRef(null);
  const fechaRef = useRef(null);
  const caja = cajas.find(c => c.id === cajaId);
  const disponible = caja ? redondear(Number(caja.saldo) + (caja.id === ren?.fondo_caja_id && ren?.entrega_caja_id ? Number(ren.fondo_entregado || 0) : 0)) : 0;
  const errores = {
    caja: Number(monto) > 0 && !caja ? 'Elige una caja de origen.' : '',
    monto: monto === '' || !Number.isFinite(Number(monto)) || Number(monto) < 0 ? 'Ingresa el monto entregado (0 si no hubo fondo).' : caja && redondear(monto) > disponible ? 'El monto supera el disponible de la caja.' : '',
    fecha: !fecha ? 'Indica la fecha de entrega.' : '',
  };
  function guardar() {
    setIntento(true);
    const primero = ['caja', 'monto', 'fecha'].find(k => errores[k]);
    if (primero) { ({ caja: cajaRef, monto: montoRef, fecha: fechaRef })[primero].current?.focus(); return; }
    onGuardar(redondear(monto), ref.trim(), caja?.id || null, fecha);
  }
  return <DialogoLiq title="Fondo entregado al conductor" subtitle="Sale de una caja chica abierta de la misma moneda" busy={busy} error={error} onClose={onClose}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Registrar entrega'}</button></>}>
    <div className="dx-tmsliq-fgrid">
      <label className="dx-ui-field" htmlFor="fondo-caja"><span>Caja de origen <b className="dx-ui-required">*</b></span>
        <select ref={cajaRef} className="dx-ui-select" id="fondo-caja" value={cajaId} aria-invalid={intento && !!errores.caja} onChange={e => setCajaId(e.target.value)}><option value="">Selecciona una caja</option>{cajas.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}</select>
        {caja && <small className="dx-ui-field-hint">Disponible: {formatearImporte(disponible, moneda)}</small>}
        {intento && errores.caja && <small className="dx-ui-field-error">{errores.caja}</small>}</label>
      <label className="dx-ui-field" htmlFor="fondo-monto"><span>Monto <b className="dx-ui-required">*</b></span>
        <input ref={montoRef} id="fondo-monto" type="number" min="0" step="0.01" value={monto} aria-invalid={intento && !!errores.monto} onChange={e => setMonto(e.target.value)} />
        {intento && errores.monto && <small className="dx-ui-field-error">{errores.monto}</small>}</label>
      <label className="dx-ui-field" htmlFor="fondo-fecha"><span>Fecha de entrega <b className="dx-ui-required">*</b></span><input ref={fechaRef} id="fondo-fecha" type="date" value={fecha} aria-invalid={intento && !!errores.fecha} onChange={e => setFecha(e.target.value)} />{intento && errores.fecha && <small className="dx-ui-field-error">{errores.fecha}</small>}</label>
      <label className="dx-ui-field" htmlFor="fondo-ref"><span>Referencia</span>
        <input id="fondo-ref" value={ref} placeholder="Efectivo entregado en Taller Ate" onChange={e => setRef(e.target.value)} /></label>
    </div>
    {!cajas.length && <p className="dx-tmsliq-help">Hace falta una caja chica abierta en esta moneda y permiso de Caja Chica.</p>}
    <p className="dx-tmsliq-help">Se registra en la caja como «Entrega a rendir». Al aprobar la rendición, los gastos aprobados pasan a egresos de Logística.</p>
  </DialogoLiq>;
}

function FormAprobar({ cajas, busy, error, onClose, onGuardar }) {
  const [caja, setCaja] = useState('');
  const [intento, setIntento] = useState(false);
  const cajaRef = useRef(null);
  return <DialogoLiq title="Aprobar rendición" subtitle="Elige la caja chica de la que salen los gastos aprobados" busy={busy} error={error} onClose={onClose}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className="dx-btn primary" disabled={busy} onClick={() => { setIntento(true); if (caja) onGuardar(caja); else cajaRef.current?.focus(); }}>Aprobar rendición</button></>}>
    <label className="dx-ui-field" htmlFor="aprobar-caja"><span>Caja de origen <b className="dx-ui-required">*</b></span><select ref={cajaRef} id="aprobar-caja" className="dx-ui-select" value={caja} aria-invalid={intento && !caja} onChange={e => setCaja(e.target.value)}><option value="">Selecciona una caja</option>{cajas.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}</select>{intento && !caja && <small className="dx-ui-field-error">Elige una caja de origen.</small>}</label>
    {!cajas.length && <p className="dx-tmsliq-help">Hace falta una caja chica abierta en esta moneda y permiso de Caja Chica.</p>}
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
  const [cajaDatos, setCajaDatos] = useState({ cajas: [], movimientos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dlgError, setDlgError] = useState('');
  const [aviso, setAviso] = useState('');

  const reload = useCallback(async () => {
    if (!empresaId) return;
    setError('');
    try { const [detalle, caja] = await Promise.all([obtenerRendicion(empresaId, viajeId), obtenerCajaRendicion(viajeId).catch(() => ({ cajas: [], movimientos: [] }))]); setDatos(detalle); setCajaDatos(caja); } catch (e) { setError(e.message); }
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
  const gastado = redondear(validos.reduce((s, g) => s + Number(g.monto), 0));
  const aprobado = redondear(gastos.filter(g => g.estado === 'aprobado' && (g.moneda || 'PEN') === moneda).reduce((s, g) => s + Number(g.monto), 0));
  const fondo = Number(ren?.fondo_entregado || 0);
  const saldo = Math.round((gastado - fondo) * 100) / 100;
  const terminado = ['entregado', 'en_liquidacion', 'cerrado'].includes(v.estado);
  const puedeRevisar = perm.aprobar && !aprobada;
  const cajas = cajaDatos.cajas.filter(c => c.moneda === moneda);
  const movimientos = cajaDatos.movimientos;
  const cajaOrigen = cajas.find(c => c.id === ren?.fondo_caja_id);
  const nombreCaja = cajaOrigen?.nombre || movimientos.find(m => m.fondo_id === ren?.fondo_caja_id)?.fondo_nombre;
  const gastosAprobados = gastos.filter(g => g.estado === 'aprobado');
  const categoria = g => movimientos.find(m => m.gasto_id === g.id && m.origen === 'transporte_gasto')?.categoria || 'Logística';
  const entrega = movimientos.find(m => m.id === ren?.entrega_caja_id);
  const vista = aprobada ? movimientos : [
    ...(entrega ? [{ ...entrega, vistaEntrega: true }] : []),
    ...gastosAprobados.map(g => ({ id: g.id, fecha: g.fecha, concepto: TIPO_GASTO[g.tipo] || g.tipo, categoria: categoria(g), monto: g.monto, moneda: g.moneda, origen: 'transporte_gasto' })),
  ];
  const diferencia = redondear(aprobado - fondo);

  return <section className="dx-ui dx-tms dx-tmsliq">
    {volver}
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Rendición de gastos · <span className={`dx-ui-pill ${tono}`}><i />{texto}</span></div>
      <h1 className="dx-ui-title">{ren?.numero || 'Rendición'} · {v.conductor?.nombre || 'Sin conductor'}</h1>
      <p className="dx-ui-sub">Viaje {v.codigo} · {fechaDMY(v.fecha_programada)} · {v.origen_nombre} → {v.destino_nombre}</p></div>
      <div className="dx-ui-actions">
        <button type="button" className="dx-btn" onClick={() => onNav?.('transporte-viaje', { id: v.id })}>Ver viaje</button>
        {perm.aprobar && aprobada && <button type="button" className="dx-btn" disabled={busy} onClick={() => ejecutar(() => accionRendicion(v.id, 'reabrir'), ren?.fondo_caja_id ? 'Rendición reabierta. Se anularon sus egresos en Caja Chica.' : 'Rendición reabierta.')}>Reabrir</button>}
        {puedeRevisar && <button type="button" className="dx-btn primary" disabled={busy || pendientes > 0 || !terminado}
          title={!terminado ? 'Se aprueba cuando el viaje termina' : pendientes ? 'Revisa todos los gastos primero' : ''}
          onClick={() => { if (!ren?.fondo_caja_id && gastosAprobados.length) { setDlgError(''); setDlg({ tipo: 'aprobar' }); } else ejecutar(() => accionRendicion(v.id, 'aprobar'), 'Rendición aprobada.'); }}>Aprobar rendición</button>}
      </div>
    </header>

    {aviso && <div className="dx-tmsliq-note is-cyan" role="status">{aviso}<button type="button" aria-label="Cerrar aviso" onClick={() => setAviso('')}>×</button></div>}
    {!terminado && <div className="dx-tmsliq-note is-gray" role="note">El viaje sigue en curso: el conductor aún puede registrar gastos. La rendición se aprueba al terminar.</div>}

    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{formatearImporte(fondo, moneda)}</strong><span>Fondo entregado</span></div>
      <div className="dx-ui-kpi"><strong>{formatearImporte(gastado, moneda)}</strong><span>Gastado</span></div>
      <div className="dx-ui-kpi"><strong>{formatearImporte(aprobado, moneda)}</strong><span>Aprobado</span></div>
      <div className="dx-ui-kpi"><strong>{formatearImporte(Math.abs(saldo), moneda)}</strong><span>{saldo > 0 ? 'A reembolsar' : saldo < 0 ? 'A devolver' : 'Saldo'}</span></div>
    </div>
    <p className="dx-tmsliq-help dx-tmsliq-kpinote">Fondo: {ren?.fondo_referencia || 'sin referencia'} · {etiquetaContador(validos.length, 'gasto')} válidos
      {saldo !== 0 && ` · ${saldo > 0 ? 'el conductor gastó más del fondo' : 'al conductor le sobró fondo'}${pendientes ? ' (si se aprueban los pendientes)' : ''}`}</p>

    <div className="dx-ui-card dx-tmsliq-caja">
      <div className="dx-ui-toolbar"><h2>Fondo entregado</h2>{ren?.fondo_caja_id && <span className="dx-ui-pill is-cyan"><i />Salió de Caja Chica</span>}{perm.editar && !aprobada && <button type="button" className="dx-btn" onClick={() => { setDlgError(''); setDlg({ tipo: 'fondo' }); }}>{ren?.fondo_caja_id ? 'Cambiar' : 'Fondo entregado'}</button>}</div>
      {ren?.fondo_caja_id ? <><div className="dx-tmsliq-datos"><div>Caja de origen <b>{nombreCaja || 'Sin dato'}</b></div><div>Monto <b>{formatearImporte(fondo, moneda)}</b></div><div>Fecha de entrega <b>{ren?.fondo_fecha ? fechaDMY(ren.fondo_fecha) : 'Sin dato'}</b></div><div>Referencia <b>{ren?.fondo_referencia || 'Sin dato'}</b></div></div>{entrega && <p className="dx-tmsliq-help">En la caja se registró «{entrega.concepto}». No es gasto: no entra al Estado de Resultados.</p>}</> : <p className="dx-tmsliq-help"><b>Sin caja chica.</b> El fondo solo cuenta para el saldo.</p>}
    </div>

    <div className="dx-ui-card">
      <div className="dx-ui-toolbar"><h2>Gastos registrados en la app <span className="dx-tmsliq-count">{etiquetaContador(gastos.length, 'gasto')}</span></h2></div>
      {!gastos.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">⛽</span><b>Sin gastos</b><span>El conductor los registra desde la app con la foto del comprobante.</span></div>
        : gastos.map(g => {
          const [gt, gx] = ESTADO_GASTO[g.estado] || ESTADO_GASTO.pendiente;
          return <div key={g.id} className="dx-tmsliq-gasto">
            {g.foto_url ? <a className="dx-tmsliq-thumb" href={g.foto_url} target="_blank" rel="noreferrer" aria-label={`Ver foto del comprobante de ${TIPO_GASTO[g.tipo] || g.tipo}`}>
              <img src={g.foto_url} alt="" loading="lazy" /></a> : <span className="dx-tmsliq-thumb" aria-hidden="true">{ICONO[g.tipo] || '•'}</span>}
            <div><b>{TIPO_GASTO[g.tipo] || g.tipo}</b><small>{[g.lugar, horaFecha(g.fecha)].filter(Boolean).join(' · ') || 'Sin detalle'}{g.estado === 'aprobado' && ` · pasa a ${categoria(g)}`}</small>
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

    {(aprobada ? movimientos.length > 0 : (ren?.fondo_caja_id || gastosAprobados.length > 0)) && <div className="dx-ui-card dx-tmsliq-caja">
      <div className="dx-ui-toolbar"><h2>{aprobada ? 'Movimientos en Caja Chica' : 'Así queda en Caja Chica al aprobar'}</h2></div>
      <p className="dx-tmsliq-help">{nombreCaja || 'Sin caja chica seleccionada'}</p>
      <div className="dx-tmsliq-caja-head"><span>Fecha</span><span>Movimiento</span><span>Categoría ER</span><span>Monto</span></div>
      {vista.map(m => <div className="dx-tmsliq-caja-row" key={m.id}><span data-label="Fecha">{fechaDMY(m.fecha)}</span><span data-label="Movimiento">{m.concepto} {m.origen === 'transporte_entrega' && <span className="dx-ui-pill is-gray"><i />{m.vistaEntrega || (m.estado === 'anulado' && m.motivo_anulacion?.startsWith('Rendida en')) ? 'Rendida' : m.estado === 'anulado' ? 'Anulada' : 'Por rendir'}</span>}{m.origen !== 'transporte_entrega' && m.estado === 'anulado' && <span className="dx-ui-pill is-gray"><i />Anulado</span>}</span><span data-label="Categoría ER">{m.origen === 'transporte_entrega' ? 'No es gasto' : m.categoria || 'Logística'}</span><span data-label="Monto">{formatearImporte(Number(m.monto), m.moneda || moneda)}</span></div>)}
      <div className="dx-tmsliq-datos"><div>Entrega rendida (se revierte) <b>+ {formatearImporte(entrega ? fondo : 0, moneda)}</b></div><div>Gastos aprobados (Logística · costo de ventas) <b>− {formatearImporte(aprobado, moneda)}</b></div><div>Efecto neto en la caja <b>{(n => `${n < 0 ? '− ' : n > 0 ? '+ ' : ''}${formatearImporte(Math.abs(n), moneda)}`)(redondear((entrega ? fondo : 0) - aprobado))}</b></div><div>Saldo actual de la caja <b>{cajaOrigen ? formatearImporte(cajaOrigen.saldo, moneda) : 'Sin dato'}</b></div></div>
      {entrega && diferencia !== 0 && <p className="dx-tmsliq-help">{diferencia > 0 ? `El conductor gastó ${formatearImporte(diferencia, moneda)} más que el fondo: se le reembolsa en efectivo desde la caja y el saldo coincide con lo contado.` : `El conductor gastó ${formatearImporte(Math.abs(diferencia), moneda)} menos que el fondo: devuelve ese importe a la caja y el saldo coincide con lo contado.`}</p>}
    </div>}

    {dlg?.tipo === 'fondo' && <FormFondo ren={ren} cajas={cajas} moneda={moneda} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={(m, r, c, f) => ejecutar(() => guardarFondo(v.id, m, r, c, f), 'Fondo guardado.')} />}
    {dlg?.tipo === 'aprobar' && <FormAprobar cajas={cajas} busy={busy} error={dlgError} onClose={() => setDlg(null)} onGuardar={c => ejecutar(() => accionRendicion(v.id, 'aprobar', c), 'Rendición aprobada.')} />}
    {dlg?.tipo === 'observar' && <FormObservar gasto={dlg.gasto} moneda={moneda} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={m => ejecutar(() => revisarGasto(dlg.gasto.id, false, m), 'Gasto observado.')} />}
  </section>;
}
