import { useEffect, useRef, useState } from 'react';
import { etiquetaMotivoMovimiento, motivoNoAnulable } from './inventarioMovimientosLogic.js';
import { claseTipoMovimiento, etiquetaTipoMovimiento, etiquetaValorizacion } from './inventarioKardexLogic.js';

const fecha = value => value ? new Date(value).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const cantidad = value => Number(value || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });

export function MovimientoDetalle({ movimiento, puedeEditar, stock = [], onClose, onAnnul }) {
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef(null);
  const focoRef = useRef(null);
  const envioRef = useRef(false);
  const motivoNo = motivoNoAnulable(movimiento, puedeEditar);
  const filaStock = stock.find(item => item.material_id === movimiento.material_id && item.almacen_id === movimiento.almacen_id && item.ubicacion_id === movimiento.ubicacion_id && item.sociedad_id === movimiento.sociedad_id && (item.lote || null) === (movimiento.lote || null) && (item.serie || null) === (movimiento.serie || null));
  const disponibleActual = Number(filaStock?.disponible ?? filaStock?.fisico ?? 0);
  const faltaStock = movimiento.tipo === 'entrada' && disponibleActual < Number(movimiento.cantidad || 0);

  useEffect(() => { focoRef.current?.focus(); }, [confirmar]);
  useEffect(() => {
    if (!globalThis.document) return undefined;
    const keydown = evento => { if (evento.key === 'Escape' && !guardando) { evento.stopPropagation(); confirmar ? setConfirmar(false) : onClose(); } };
    globalThis.document.addEventListener('keydown', keydown);
    return () => globalThis.document.removeEventListener('keydown', keydown);
  }, [confirmar, guardando, onClose]);

  const anular = async evento => {
    evento.preventDefault();
    if (envioRef.current) return;
    if (!motivo.trim()) { setError('Indica por qué se anula.'); return; }
    envioRef.current = true; setGuardando(true); setError('');
    try { await onAnnul(motivo.trim()); }
    catch (err) { setError(err?.message || 'No se pudo anular el movimiento.'); }
    finally { envioRef.current = false; setGuardando(false); }
  };
  const detalle = movimiento.materiales || {};
  const loc = movimiento.ubicaciones || {};
  const registradoPor = movimiento.usuario_nombre || movimiento.usuario_id || movimiento.created_by;
  const registradoPorEsUuid = typeof registradoPor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registradoPor);

  return <div className="dx-mov-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget) onClose(); }}>
    <section ref={panelRef} className="dx-mov-panel" role="dialog" aria-modal="true" aria-labelledby="mov-detalle-titulo" onKeyDown={evento => {
      if (evento.key !== 'Tab' || confirmar) return;
      const elementos = [...(panelRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || [])];
      const primero = elementos[0], ultimo = elementos[elementos.length - 1];
      if (evento.shiftKey && globalThis.document?.activeElement === primero) { evento.preventDefault(); ultimo?.focus(); }
      else if (!evento.shiftKey && globalThis.document?.activeElement === ultimo) { evento.preventDefault(); primero?.focus(); }
    }}>
      <header><h2 id="mov-detalle-titulo">Detalle del movimiento</h2><button ref={focoRef} type="button" className="dx-mov-x" aria-label="Cerrar" onClick={onClose}>×</button></header>
      <div className="dx-mov-body">
        <div className="dx-mov-pills"><span className={`dx-ui-pill ${claseTipoMovimiento(movimiento.tipo)}`}><i />{etiquetaTipoMovimiento(movimiento.tipo)}</span><span className={`dx-ui-pill ${movimiento.anulado ? 'is-gray' : etiquetaValorizacion(movimiento) === 'Provisional' ? 'is-amber' : 'is-green'}`}><i />{etiquetaValorizacion(movimiento)}</span></div>
        <dl className="dx-mov-dl">
          <div><dt>Fecha</dt><dd>{fecha(movimiento.created_at || movimiento.fecha)}</dd></div>
          <div><dt>Cantidad</dt><dd>{cantidad(movimiento.cantidad)} {detalle.unidad || ''}</dd></div>
          <div><dt>Material</dt><dd>{detalle.descripcion || movimiento.material_id || '—'}</dd></div>
          <div><dt>Motivo</dt><dd>{etiquetaMotivoMovimiento(movimiento.motivo) || '—'}</dd></div>
          <div><dt>Almacén</dt><dd>{movimiento.almacenes?.nombre || movimiento.almacen_id || '—'}</dd></div>
          <div><dt>Ubicación</dt><dd>{loc.nombre || loc.codigo || movimiento.ubicacion_id || '—'}</dd></div>
          <div><dt>Lote / serie</dt><dd>{[movimiento.lote, movimiento.serie].filter(Boolean).join(' / ') || '—'}</dd></div>
          <div><dt>Vencimiento</dt><dd>{movimiento.vencimiento || '—'}</dd></div>
          <div><dt>Costo unitario</dt><dd>{movimiento.costo_unitario == null ? '—' : `${movimiento.moneda || 'PEN'} ${cantidad(movimiento.costo_unitario)}`}</dd></div>
          <div><dt>Documento</dt><dd>{movimiento.nro_documento || movimiento.referencia_id || '—'}</dd></div>
          <div><dt>Observación</dt><dd>{movimiento.observacion || '—'}</dd></div>
          {!registradoPorEsUuid && <div><dt>Registrado por</dt><dd>{registradoPor || '—'}</dd></div>}
          <div><dt>Saldo después</dt><dd>{movimiento.saldo_cantidad == null ? '—' : `${cantidad(movimiento.saldo_cantidad)} ${detalle.unidad || ''}`}</dd></div>
          {movimiento.anulado_motivo && <div><dt>Motivo de anulación</dt><dd>{movimiento.anulado_motivo}</dd></div>}
        </dl>
        {motivoNo && <div className="dx-mov-warn">{motivoNo}</div>}
      </div>
      <footer><button type="button" className="dx-btn" onClick={onClose}>Cerrar</button>{!motivoNo && <button type="button" className="dx-btn danger" onClick={() => setConfirmar(true)}>Anular movimiento…</button>}</footer>
    </section>
    {confirmar && <div className="dx-mov-confirm-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget && !guardando) setConfirmar(false); }}>
      <form className="dx-mov-confirm" role="alertdialog" aria-modal="true" aria-labelledby="mov-anular-titulo" aria-describedby="mov-anular-descripcion" onSubmit={anular} onKeyDown={evento => {
        if (evento.key !== 'Tab') return;
        evento.stopPropagation();
        const elementos = [...evento.currentTarget.querySelectorAll('button:not(:disabled),textarea:not(:disabled)')];
        const primero = elementos[0], ultimo = elementos[elementos.length - 1];
        if (evento.shiftKey && globalThis.document?.activeElement === primero) { evento.preventDefault(); ultimo?.focus(); }
        else if (!evento.shiftKey && globalThis.document?.activeElement === ultimo) { evento.preventDefault(); primero?.focus(); }
      }}>
        <h2 id="mov-anular-titulo">¿Anular este movimiento?</h2>
        <p id="mov-anular-descripcion">Se registrará un movimiento inverso. El historial se conserva y no se puede deshacer.</p>
        {error && <div className="dx-mov-alert" role="alert">{error}</div>}
        {faltaStock && <div className="dx-mov-alert" role="alert">No se puede anular: en esa ubicación hay {cantidad(disponibleActual)} {detalle.unidad || ''} disponibles y se necesitan {cantidad(movimiento.cantidad)}. El stock ya se movió o se consumió.</div>}
        <div className="dx-mov-f"><label htmlFor="mov-anular-motivo">Motivo de la anulación</label><textarea ref={focoRef} id="mov-anular-motivo" className="dx-mov-field" maxLength={200} value={motivo} onChange={evento => { setMotivo(evento.target.value); setError(''); }} /><small>Obligatorio. Queda en el historial.</small></div>
        <div className="dx-mov-confirm-f"><button type="button" className="dx-btn" onClick={() => setConfirmar(false)} disabled={guardando}>Volver</button><button type="submit" className="dx-btn danger" disabled={guardando || faltaStock}>{guardando ? 'Anulando…' : 'Anular movimiento'}</button></div>
      </form>
    </div>}
  </div>;
}
