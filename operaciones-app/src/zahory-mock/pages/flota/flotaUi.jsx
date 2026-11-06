import { useEffect, useRef, useState } from 'react';
import { formatoFechaHora } from '../../../services/flotaRentalService.js';

// Piezas compartidas por las pantallas de Flota (PR B). Solo usan clases del estándar dx-ui
// y las propias del módulo (dx-flotab-*).

export function Pill({ tono = 'gray', children }) {
  return <i className={`dx-ui-pill is-${tono}`}><i />{children}</i>;
}

// cerrarFuera=false en asistentes y formularios: solo se cierran con Cancelar o ×, para no perder lo escrito.
export function Dialogo({ titulo, subtitulo, ancho = false, onCerrar, pie, children, etiqueta, cerrarFuera = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const previo = document.activeElement;
    ref.current?.querySelector('input,select,textarea,button:not([aria-label="Cerrar"])')?.focus?.();
    const alTeclear = evento => { if (evento.key === 'Escape' && cerrarFuera) onCerrar?.(); };
    globalThis.addEventListener?.('keydown', alTeclear);
    return () => { globalThis.removeEventListener?.('keydown', alTeclear); previo?.focus?.(); };
  // Solo al abrir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const id = useRef(`dlg-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className="dx-ui-overlay" role="presentation" onMouseDown={evento => { if (cerrarFuera && evento.target === evento.currentTarget) onCerrar?.(); }}>
      <section ref={ref} className={`dx-ui-dialog${ancho ? ' dx-ui-dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} aria-label={etiqueta}>
        <div className="dx-ui-dialog-head">
          <div><h2 id={id}>{titulo}</h2>{subtitulo && <p>{subtitulo}</p>}</div>
          <button type="button" className="dx-btn" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="dx-flotab-dialog-body">{children}</div>
        {pie && <div className="dx-ui-dialog-foot dx-flotab-foot">{pie}</div>}
      </section>
    </div>
  );
}

export function Campo({ etiqueta, requerido = false, error, ayuda, children, ancho }) {
  return (
    <label className={`dx-flotab-field${ancho ? ' is-wide' : ''}${error ? ' has-error' : ''}`}>
      <span className="dx-flotab-label">{etiqueta}{requerido && <b className="dx-flotab-required" aria-hidden="true"> *</b>}</span>
      {children}
      {error ? <small className="dx-flotab-field-error" role="alert">{error}</small> : ayuda ? <small className="dx-flotab-help">{ayuda}</small> : null}
    </label>
  );
}

// Devuelve true si no hay errores; si los hay, enfoca el primer campo inválido.
export function enfocarPrimerError(contenedor, errores) {
  const claves = Object.keys(errores).filter(k => errores[k]);
  if (!claves.length) return true;
  setTimeout(() => {
    const el = contenedor?.querySelector?.(`[data-campo="${claves[0]}"]`);
    el?.focus?.();
  }, 0);
  return false;
}

export function ErrorPie({ mensaje }) {
  return mensaje ? <p role="alert" className="dx-ui-error dx-flotab-foot-error">{mensaje}</p> : null;
}

export function Dato({ etiqueta, valor }) {
  const vacio = valor == null || valor === '';
  return <div><small>{etiqueta}</small><b className={vacio ? 'is-empty' : ''}>{vacio ? 'Sin dato' : valor}</b></div>;
}

const ACCIONES = {
  creada: 'Acta creada', borrador_guardado: 'Borrador guardado', confirmada: 'Acta confirmada', anulada: 'Anulada',
  registrada: 'Registrada', renovada: 'Renovada', actualizada: 'Actualizada', liberada: 'Liberada', ejecutada: 'Ejecutada',
  reclamo_registrado: 'Reclamo registrado', reclamo_en_analisis: 'Reclamo en análisis', reclamo_aprobado: 'Reclamo aprobado',
  reclamo_rechazado: 'Reclamo rechazado', reclamo_cerrado: 'Reclamo cerrado', reclamo_abierto: 'Reclamo reabierto',
};

export function LineaTiempo({ eventos, vacio = 'Sin movimientos registrados.' }) {
  if (!eventos?.length) return <p className="dx-flotab-muted">{vacio}</p>;
  return (
    <div className="dx-ui-timeline">
      {eventos.map(evento => (
        <div key={evento.id}>
          <b>{ACCIONES[evento.accion] || evento.accion}</b>
          <span>{formatoFechaHora(evento.created_at)}{evento.detalle?.motivo ? ` · ${evento.detalle.motivo}` : ''}{evento.detalle?.codigo ? ` · ${evento.detalle.codigo}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

// Formulario corto de motivo (anular, liberar, ejecutar). Valida en línea.
export function MotivoForm({ etiqueta = 'Motivo', boton = 'Confirmar', peligro = false, onCancelar, onConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async evento => {
    evento.preventDefault();
    if (!motivo.trim()) { setError('Indica el motivo.'); return; }
    setEnviando(true); setError('');
    try { await onConfirmar(motivo.trim()); } catch (e) { setError(e.message || 'No se pudo completar la acción.'); } finally { setEnviando(false); }
  };
  return (
    <form className="dx-flotab-inline-form" onSubmit={enviar}>
      <Campo etiqueta={etiqueta} requerido error={error}>
        <input data-campo="motivo" value={motivo} onChange={e => { setMotivo(e.target.value); setError(''); }} />
      </Campo>
      <div className="dx-flotab-inline-actions">
        <button type="button" className="dx-btn" onClick={onCancelar}>Cancelar</button>
        <button className={`dx-btn ${peligro ? 'danger' : 'primary'}`} disabled={enviando}>{enviando ? 'Guardando…' : boton}</button>
      </div>
    </form>
  );
}

export const contar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

export function filaTeclado(accion) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: accion,
    onKeyDown: evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); accion(); } },
  };
}
