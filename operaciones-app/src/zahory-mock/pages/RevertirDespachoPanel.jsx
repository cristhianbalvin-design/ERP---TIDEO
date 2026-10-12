import { useEffect, useRef, useState } from 'react';
import { validarCantidadReserva } from './reservasRepuestosLogic.js';

const MOTIVOS = ['Error de despacho', 'El taller no lo necesita', 'Material equivocado', 'Otro'];

export function RevertirDespachoPanel({ ot, linea, enviando, error, onClose, onSubmit }) {
  const [cantidad, setCantidad] = useState(String(linea.despachado));
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [observacion, setObservacion] = useState('');
  const primero = useRef(null);
  const motivoFinal = motivo === 'Otro' ? otro.trim() : motivo;
  const errorCantidad = validarCantidadReserva(cantidad, linea.despachado);
  const cantidadNumerica = Number(String(cantidad).replace(',', '.'));
  const errorValidacion = errorCantidad || (!motivoFinal ? 'Indica un motivo para revertir.' : '');
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
        <header><div><h2 id="dx-desp-panel-title">Revertir despacho</h2><p>{ot.numero} · {linea.descripcion}</p></div><button type="button" className="dx-desp-close" onClick={onClose} aria-label="Cerrar panel" disabled={enviando}>×</button></header>
        <div className="dx-desp-panelbody">
          {error && <div className="dx-desp-alert" role="alert">{error}</div>}
          <label className="dx-desp-field" htmlFor="dx-reversa-cantidad"><span>Cantidad a revertir ({linea.unidad || 'und'})</span><input ref={primero} id="dx-reversa-cantidad" name="cantidad" inputMode="decimal" value={cantidad} onChange={evento => setCantidad(evento.target.value)} aria-invalid={Boolean(cantidad && errorCantidad)} /><small>M&aacute;ximo: {linea.despachado} {linea.unidad || 'und'} despachados.</small>{cantidad && errorCantidad && <small className="dx-desp-invalid" role="alert">{errorCantidad}</small>}</label>
          <label className="dx-desp-field" htmlFor="dx-reversa-motivo"><span>Motivo obligatorio</span><select id="dx-reversa-motivo" value={motivo} onChange={evento => setMotivo(evento.target.value)} aria-required="true" aria-invalid={!motivoFinal}><option value="">Selecciona un motivo</option>{MOTIVOS.map(item => <option key={item}>{item}</option>)}</select>{!motivoFinal && <small className="dx-desp-invalid">Indica un motivo para revertir.</small>}</label>
          {motivo === 'Otro' && <label className="dx-desp-field" htmlFor="dx-reversa-otro"><span>Especifica el motivo</span><input id="dx-reversa-otro" maxLength={160} value={otro} onChange={evento => setOtro(evento.target.value)} /></label>}
          <label className="dx-desp-field" htmlFor="dx-reversa-observacion"><span>Observaci&oacute;n opcional</span><textarea id="dx-reversa-observacion" maxLength={500} value={observacion} onChange={evento => setObservacion(evento.target.value)} /></label>
          <div className="dx-desp-notice">La cantidad vuelve a la reserva de la OT y queda disponible para despacharse de nuevo.</div>
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={enviando}>Cancelar</button><button type="submit" className="dx-btn danger" disabled={enviando || Boolean(errorValidacion)}>{enviando ? 'Revirtiendo…' : 'Revertir despacho'}</button></footer>
      </form>
    </section>
  </div>;
}
