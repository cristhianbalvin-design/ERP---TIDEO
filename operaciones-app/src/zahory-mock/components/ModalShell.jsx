import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

export function ModalShell({ open, title, subtitle, status, width = 1040, dirty = false, busy = false, onClose, children, footer, variant, titleClassName = '', subtitleClassName = '', statusClassName = '', closeClassName = '' }) {
  const [confirmType, setConfirmType] = useState(null);
  const confirmSafeButtonRef = useRef(null);
  const confirmId = useId();
  const requestClose = useCallback(() => {
    if (busy || dirty) {
      setConfirmType(busy ? 'busy' : 'dirty');
      return;
    }
    onClose();
  }, [busy, dirty, onClose]);

  useEffect(() => {
    if (!open) setConfirmType(null);
  }, [open]);

  useEffect(() => {
    if (confirmType) confirmSafeButtonRef.current?.focus();
  }, [confirmType]);

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.addEventListener) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        if (confirmType) {
          event.preventDefault();
          setConfirmType(null);
        } else requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, confirmType, requestClose]);

  if (!open) return null;

  return (
    <div
      className="ops-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.65)', display: 'grid', placeItems: 'center', padding: 20, overflowY: 'auto' }}
    >
      <div className={`card diagnostico-modal-card${variant ? ` ${variant} dx-scope` : ''}`} style={{ width: '100%', maxWidth: variant ? 'min(1160px, calc(100vw - 48px))' : width, maxHeight: 'min(1012px, calc(100vh - 40px))', overflowY: 'auto' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 className={titleClassName || undefined} style={{ margin: 0, fontSize: 18 }}>{title}</h2>
            {subtitle && <div className={`muted${subtitleClassName ? ` ${subtitleClassName}` : ''}`} style={{ marginTop: 4 }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {status && <span className={statusClassName || undefined}>{status}</span>}
            <button type="button" className={`btn btn-secondary${closeClassName ? ` ${closeClassName}` : ''}`} aria-label="Cerrar" onClick={requestClose}>{'\u00d7'}</button>
          </div>
        </div>
        {children}
        {footer && <div className="card-body diagnostico-modal-footer">{typeof footer === 'function' ? footer(requestClose) : footer}</div>}
      </div>
      {confirmType && (
        <div className="ops-modal-confirm-backdrop">
          <section className="ops-modal-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${confirmId}-title`} aria-describedby={`${confirmId}-description`}>
            <h2 className="ops-modal-confirm-title" id={`${confirmId}-title`}>
              {confirmType === 'busy' ? 'Hay un guardado en curso' : 'Tienes cambios sin guardar'}
            </h2>
            <p className="ops-modal-confirm-description" id={`${confirmId}-description`}>
              {confirmType === 'busy'
                ? 'Hay un guardado en curso. Si cierras, puede completarse igualmente; verifica la lista al volver.'
                : 'Si cierras ahora se perderán.'}
            </p>
            <div className="ops-modal-confirm-actions">
              <button type="button" className="ops-modal-confirm-safe" ref={confirmSafeButtonRef} onClick={() => setConfirmType(null)}>
                {confirmType === 'busy' ? 'Seguir aquí' : 'Seguir editando'}
              </button>
              <button type="button" className="ops-modal-confirm-close" onClick={() => { setConfirmType(null); onClose(); }}>
                {confirmType === 'busy' ? 'Cerrar igual' : 'Cerrar sin guardar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
