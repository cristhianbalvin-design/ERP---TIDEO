import React, { useId, useState } from 'react';
// Mismos estilos que el cajón del ERP administrativo.
import '../../src/work_drawer_footer.css';
import { I } from './lib/icons.jsx';

// Pie del cajón ☰ en modo trabajo: como el header se oculta para ganar espacio, aquí quedan
// las notificaciones, el modo oscuro y la sesión (empresa, usuario y cerrar sesión).
export function WorkDrawerFooter({ empresaNombre, email, avatarText, notificaciones = [], onMarkRead, onNotificacionClick, dark = false, onToggleDark, onSignOut }) {
  const [notisOpen, setNotisOpen] = useState(false);
  const listId = useId();
  const unread = notificaciones.filter(n => !n.read).length;
  const handleClick = n => {
    if (onNotificacionClick) onNotificacionClick(n);
    else onMarkRead?.(n.id);
  };
  return (
    <div className="dx-wdf" role="group" aria-label="Cuenta y notificaciones">
      {notisOpen && (
        <div className="dx-wdf-notis" id={listId}>
          <div className="dx-wdf-notis-head">
            <strong>Notificaciones</strong>
            {unread > 0 && <button type="button" className="dx-wdf-link" onClick={() => onMarkRead?.()}>Marcar todas</button>}
          </div>
          <div className="dx-wdf-notis-list">
            {notificaciones.length === 0 && <p className="dx-wdf-empty">No hay notificaciones</p>}
            {notificaciones.map(n => (
              <button type="button" key={n.id} className={`dx-wdf-noti${n.read ? '' : ' is-unread'}`} onClick={() => handleClick(n)}>
                {n.title && <span className="dx-wdf-noti-title">{n.title}</span>}
                <span className="dx-wdf-noti-text">{n.text}</span>
                {n.time && <span className="dx-wdf-noti-time">{n.time}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="dx-wdf-actions">
        <button type="button" className={`dx-wdf-btn${notisOpen ? ' is-active' : ''}`} aria-expanded={notisOpen} aria-controls={notisOpen ? listId : undefined} onClick={() => setNotisOpen(open => !open)}>
          {I.bell}<span>Notificaciones</span>
          {unread > 0 && <b className="dx-wdf-badge" aria-label={`${unread} sin leer`}>{unread > 99 ? '99+' : unread}</b>}
        </button>
        <button type="button" className="dx-wdf-btn" aria-pressed={dark} onClick={onToggleDark}>
          {dark ? I.sun : I.moon}<span>{dark ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>
      </div>
      <div className="dx-wdf-user">
        <span className="dx-wdf-avatar" aria-hidden="true">{avatarText}</span>
        <div className="dx-wdf-user-text">
          <strong title={empresaNombre}>{empresaNombre}</strong>
          <small title={email}>{email}</small>
        </div>
        <button type="button" className="dx-wdf-logout" onClick={onSignOut} aria-label="Cerrar sesión" title="Cerrar sesión">{I.power}</button>
      </div>
    </div>
  );
}
