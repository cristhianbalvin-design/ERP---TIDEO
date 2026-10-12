import { useEffect, useRef, useState } from 'react';
import { validarLiberacion } from './reservasRepuestosLogic.js';

const MOTIVOS = ['Reprogramación de la OT', 'Repuesto ya no requerido', 'Error de reserva', 'Otro'];

export function LiberarReservaPanel({ ot, linea, enviando, error, onClose, onSubmit }) {
  const [cantidad, setCantidad] = useState(String(linea.pendiente));
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [observacion, setObservacion] = useState('');
  const primero = useRef(null);
  const motivoFinal = motivo === 'Otro' ? otro.trim() : motivo;
  const errorValidacion = validarLiberacion({ cantidad, pendiente: linea.pendiente, motivo: motivoFinal });
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
      <form onSubmit={evento => { evento.preventDefault(); if (!errorValidacion && !enviando) onSubmit({ cantidad: cantidadNumerica, motivo: motivoFinal, observacion: observacion.trim() || null }); }}>
        <header><div><h2 id="dx-desp-panel-title">Liberar reserva</h2><p>{ot.numero} · {linea.descripcion}</p></div><button type="button" className="dx-desp-close" onClick={onClose} aria-label="Cerrar panel" disabled={enviando}>×</button></header>
        <div className="dx-desp-panelbody">
          {error && <div className="dx-desp-alert" role="alert">{error}</div>}
          <label className="dx-desp-field" htmlFor="dx-desp-cantidad"><span>Cantidad a liberar ({linea.unidad || 'und'})</span><input ref={primero} id="dx-desp-cantidad" name="cantidad" inputMode="decimal" value={cantidad} onChange={evento => setCantidad(evento.target.value)} aria-invalid={Boolean(cantidad && errorValidacion)} /><small>Máximo: {linea.pendiente} {linea.unidad || 'und'} pendientes.</small></label>
          <label className="dx-desp-field" htmlFor="dx-desp-motivo"><span>Motivo obligatorio</span><select ref={!cantidad ? primero : null} id="dx-desp-motivo" value={motivo} onChange={evento => setMotivo(evento.target.value)} aria-required="true" aria-invalid={!motivoFinal} aria-describedby="dx-desp-motivo-ayuda"><option value="">Selecciona un motivo</option>{MOTIVOS.map(item => <option key={item}>{item}</option>)}</select>{!motivoFinal && <small id="dx-desp-motivo-ayuda" className="dx-desp-invalid">Indica un motivo para liberar.</small>}</label>
          {motivo === 'Otro' && <label className="dx-desp-field" htmlFor="dx-desp-otro"><span>Especifica el motivo</span><input id="dx-desp-otro" value={otro} maxLength={160} onChange={evento => setOtro(evento.target.value)} /></label>}
          <label className="dx-desp-field" htmlFor="dx-desp-observacion"><span>Observación</span><textarea id="dx-desp-observacion" maxLength={500} value={observacion} onChange={evento => setObservacion(evento.target.value)} /></label>
          <div className="dx-desp-notice">La cantidad liberada vuelve a Disponible. Esta acción no genera movimiento de Kardex.</div>
          <div className="dx-desp-sum" aria-live="polite"><small>Resumen en vivo</small><div><span>Después de esta acción, quedará pendiente</span><b>{cantidadNumerica > 0 ? Math.max(0, Number(linea.pendiente) - cantidadNumerica) : '—'} {linea.unidad || ''}</b></div></div>
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={enviando}>Cancelar</button><button type="submit" className="dx-btn danger" disabled={enviando || Boolean(errorValidacion)}>{enviando ? 'Liberando…' : 'Liberar reserva'}</button></footer>
      </form>
    </section>
  </div>;
}
