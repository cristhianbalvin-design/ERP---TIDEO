import React, { useEffect, useState } from 'react';

export function TransportePanel({ open = true, title, subtitle, dirty, busy, onClose, children, footer }) {
  const [discard, setDiscard] = useState(false);
  useEffect(() => { if (open) setDiscard(false); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const keydown = event => {
      if (event.key !== 'Escape' || busy) return;
      if (discard) setDiscard(false);
      else if (dirty) setDiscard(true);
      else onClose?.();
    };
    const guard = event => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('beforeunload', guard);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('beforeunload', guard);
    };
  }, [open, dirty, busy, discard, onClose]);
  if (!open) return null;
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose?.();
  }
  return <div className="dx-transporte-composer-scrim" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) close();
  }}>
    <section className="dx-transporte-composer" role="dialog" aria-modal="true" aria-labelledby="transporte-panel-title">
      <header className="dx-transporte-composer-head"><div><h2 id="transporte-panel-title">{title}</h2><p>{subtitle}</p></div>
        <button type="button" className="dx-btn icon" aria-label="Cerrar" onClick={close}>×</button></header>
      {children}
      {footer && <footer className="dx-transporte-composer-footer">{typeof footer === 'function' ? footer(close) : footer}</footer>}
      {discard && <div className="dx-transporte-composer-confirm"><section role="alertdialog" aria-modal="true">
        <h3>¿Salir sin guardar?</h3><p>Se perderán los cambios.</p>
        <button type="button" className="dx-btn" onClick={() => setDiscard(false)}>Seguir editando</button>
        <button type="button" className="dx-btn primary" onClick={() => {
          setDiscard(false); onClose?.();
        }}>Salir</button>
      </section></div>}
    </section>
  </div>;
}
