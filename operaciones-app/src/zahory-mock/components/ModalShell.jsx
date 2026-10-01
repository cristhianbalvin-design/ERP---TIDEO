import { useCallback, useEffect } from 'react';

export function ModalShell({ open, title, subtitle, status, width = 1040, dirty = false, busy = false, onClose, children, footer }) {
  const requestClose = useCallback(() => {
    if (busy) {
      if (typeof window.confirm === 'function' && !window.confirm('Hay un guardado en curso. Si cierras, puede completarse igualmente; verifica la lista al volver.')) return;
      onClose();
      return;
    }
    if (dirty && typeof window.confirm === 'function' && !window.confirm('Tienes cambios sin guardar')) return;
    onClose();
  }, [busy, dirty, onClose]);

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.addEventListener) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, requestClose]);

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
      <div className="card diagnostico-modal-card" style={{ width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
            {subtitle && <div className="muted" style={{ marginTop: 4 }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {status}
            <button type="button" className="btn btn-secondary" aria-label="Cerrar" onClick={requestClose}>×</button>
          </div>
        </div>
        {children}
        {footer && <div className="card-body diagnostico-modal-footer">{typeof footer === 'function' ? footer(requestClose) : footer}</div>}
      </div>
    </div>
  );
}
