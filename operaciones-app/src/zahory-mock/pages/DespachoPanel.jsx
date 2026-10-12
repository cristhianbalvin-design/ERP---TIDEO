import { useEffect, useRef, useState } from 'react';
import { textoUbicacionOrigen, validarCantidadReserva } from './reservasRepuestosLogic.js';

export function DespachoPanel({ ot, linea, enviando, error, onClose, onSubmit }) {
  const [cantidad, setCantidad] = useState(String(linea.pendiente));
  const [recibe, setRecibe] = useState('');
  const [observacion, setObservacion] = useState('');
  const primero = useRef(null);
  const origenes = (linea.origenes || []).filter(origen => Number(origen.pendiente) > 0);
  const origen = origenes.map(textoUbicacionOrigen).join(' · ') || 'Sin ubicación (sin stock reservado)';
  const errorCantidad = validarCantidadReserva(cantidad, linea.pendiente);
  const cantidadNumerica = Number(String(cantidad).replace(',', '.'));
  useEffect(() => { primero.current?.focus(); }, []);
  useEffect(() => {
    const keydown = evento => { if (evento.key === 'Escape' && !enviando) onClose(); };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [enviando, onClose]);
  return <div className="dx-desp-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget && !enviando) onClose(); }}>
      <section className="dx-desp-panel" role="dialog" aria-modal="true" aria-labelledby="dx-desp-panel-title" onKeyDown={evento => {
        if (evento.key !== 'Tab') return;
        const controles = [...evento.currentTarget.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')];
        if (!controles.length) return;
        if (evento.shiftKey && document.activeElement === controles[0]) { evento.preventDefault(); controles.at(-1).focus(); }
        else if (!evento.shiftKey && document.activeElement === controles.at(-1)) { evento.preventDefault(); controles[0].focus(); }
      }}>
      <form onSubmit={evento => { evento.preventDefault(); if (!errorCantidad && !enviando) onSubmit({ cantidad: cantidadNumerica, recibe_en_taller: recibe.trim() || null, observacion: observacion.trim() || null }); }}>
        <header><div><h2 id="dx-desp-panel-title">Despachar a taller</h2><p>{ot.numero} · {linea.descripcion}</p></div><button type="button" className="dx-desp-close" onClick={onClose} aria-label="Cerrar panel" disabled={enviando}>×</button></header>
        <div className="dx-desp-panelbody">
          {error && <div className="dx-desp-alert" role="alert">{error}</div>}
          <label className="dx-desp-field" htmlFor="dx-desp-cantidad"><span>Cantidad a despachar ({linea.unidad || 'und'})</span><input ref={primero} id="dx-desp-cantidad" name="cantidad" inputMode="decimal" value={cantidad} onChange={evento => setCantidad(evento.target.value)} aria-invalid={Boolean(cantidad && errorCantidad)} aria-describedby="dx-desp-cantidad-ayuda dx-desp-cantidad-error" /><small id="dx-desp-cantidad-ayuda">Máximo: {linea.pendiente} {linea.unidad || 'und'} pendientes.</small>{cantidad && errorCantidad && <small id="dx-desp-cantidad-error" className="dx-desp-invalid" role="alert">{errorCantidad}</small>}</label>
          <label className="dx-desp-field" htmlFor="dx-desp-origen"><span>Ubicación de origen</span><input id="dx-desp-origen" value={origen} readOnly aria-readonly="true" /></label>
          <label className="dx-desp-field" htmlFor="dx-desp-recibe"><span>Recibe en taller · opcional</span><input id="dx-desp-recibe" maxLength={120} value={recibe} onChange={evento => setRecibe(evento.target.value)} /></label>
          <label className="dx-desp-field" htmlFor="dx-desp-observacion"><span>Observación</span><textarea id="dx-desp-observacion" maxLength={500} value={observacion} onChange={evento => setObservacion(evento.target.value)} /></label>
          <div className="dx-desp-sum" aria-live="polite"><small>Resumen en vivo</small><div><span>Sale de</span><b>{origen}</b></div><div><span>Después de esta acción, quedará pendiente</span><b>{cantidadNumerica > 0 ? Math.max(0, Number(linea.pendiente) - cantidadNumerica) : '—'} {linea.unidad || ''}</b></div></div>
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={enviando}>Cancelar</button><button type="submit" className="dx-btn primary" disabled={enviando || Boolean(errorCantidad)}>{enviando ? 'Despachando…' : 'Despachar a taller'}</button></footer>
      </form>
    </section>
  </div>;
}
