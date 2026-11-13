import React, { useEffect, useRef } from 'react';
import { fechaLima } from '../../../../../src/lib/transporteLogistica.js';

export const ESTADO_LIQ = {
  borrador: ['is-amber', 'Borrador'], en_revision: ['is-cyan', 'En revisión'], con_cliente: ['is-violet', 'Con el cliente'],
  aprobada: ['is-green', 'Aprobada'], en_ventas: ['is-green', 'En Ventas'], anulada: ['is-red', 'Anulada'],
};
export const ESTADO_REN = {
  abierta: ['is-gray', 'Abierta'], por_revisar: ['is-amber', 'Por revisar'], aprobada: ['is-green', 'Aprobada'],
};
export const ESTADO_GASTO = { pendiente: ['is-amber', 'Por revisar'], aprobado: ['is-green', 'Aprobado'], observado: ['is-red', 'Observado'] };
export const TIPO_GASTO = { peaje: 'Peaje', combustible: 'Combustible', estiba: 'Estiba', viatico: 'Viático', otro: 'Otro' };

export const nombreCuenta = cuenta => cuenta?.nombre_comercial || cuenta?.razon_social || 'Sin cliente';
export function fechaDMY(valor) {
  const iso = (valor && String(valor).length > 10 ? fechaLima(valor) : String(valor || '').slice(0, 10));
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function horasTexto(minutos) {
  if (minutos == null) return 'Sin dato';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

// Diálogo centrado y compacto para formularios cortos de la liquidación.
export function DialogoLiq({ title, subtitle, busy, onClose, error, footer, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const nodo = ref.current;
    (nodo?.querySelector('.dx-tmsliq-dlg-b :is(input:not([type=hidden]),select,textarea)') || nodo?.querySelector('footer button'))?.focus();
    const key = event => { if (event.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="dx-tmsliq-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose?.(); }}>
    <section ref={ref} className="dx-tmsliq-dlg" role="dialog" aria-modal="true" aria-labelledby="tmsliq-dlg-t">
      <header><div><h2 id="tmsliq-dlg-t">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="dx-btn icon" aria-label="Cerrar" onClick={onClose} disabled={busy}>×</button></header>
      <div className="dx-tmsliq-dlg-b">{children}</div>
      {/* Tras pulsar una acción del pie, si la validación marcó campos, el foco va al primero inválido. */}
      <footer onClickCapture={() => setTimeout(() => ref.current?.querySelector('.dx-tmsliq-dlg-b [aria-invalid="true"]')?.focus(), 0)}>{error &&<div className="dx-tmsliq-err" role="alert">{error}</div>}{footer}</footer>
    </section>
  </div>;
}
