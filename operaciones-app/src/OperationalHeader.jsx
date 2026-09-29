import React, { useEffect, useState } from 'react';
import { I } from './lib/icons.jsx';
import { PERFIL_SOCIEDAD, SOCIEDAD_TODAS_ID } from './lib/sesionOperativa.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

export function SociedadSelector({
  perfilSociedad,
  sociedadActiva,
  sociedadesDisponibles = [],
  seleccionarSociedad,
  puedeVerConsolidado,
  isMobile,
}) {
  const [open, setOpen] = useState(false);

  if (perfilSociedad === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD && (!sociedadesDisponibles || sociedadesDisponibles.length <= 1) && !sociedadActiva?.nombre) {
    return null;
  }

  const esVistaConsolidada = sociedadActiva?.id === SOCIEDAD_TODAS_ID;
  const nombreActivo = esVistaConsolidada
    ? 'GRUPO — Vista consolidada'
    : (sociedadActiva?.nombre || sociedadActiva?.codigo || 'Sin sociedades registradas');

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="user-zone"
        onClick={() => setOpen(v => !v)}
        title={`Sociedad: ${nombreActivo}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 0 : 8,
          padding: isMobile ? 7 : '6px 10px',
          borderRadius: 99,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          cursor: 'pointer',
          maxWidth: isMobile ? 38 : 190,
        }}
      >
        <span style={{ display: 'flex', flexShrink: 0 }}>{I.building}</span>
        {!isMobile && (
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Sociedad
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nombreActivo}
            </div>
          </div>
        )}
      </button>

      {open && (
        <div
          className="dropdown"
          style={{ top: 48, right: 0, minWidth: isMobile ? 'min(280px, calc(100vw - 24px))' : 280, zIndex: 110 }}
          onMouseLeave={() => !isMobile && setOpen(false)}
        >
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>
            Sociedades disponibles
          </div>
          {sociedadesDisponibles.length === 0 ? (
            <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--fg-subtle)' }}>
              {sociedadActiva?.nombre ? sociedadActiva.nombre : 'No hay sociedades activas configuradas.'}
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {puedeVerConsolidado && sociedadesDisponibles.length >= 2 && (
                <div
                  className={'dropdown-item ' + (esVistaConsolidada ? 'active' : '')}
                  onClick={() => { seleccionarSociedad(SOCIEDAD_TODAS_ID); setOpen(false); }}
                >
                  <span className="company-dot" style={{ background: '#64748b', width: 8, height: 8, borderRadius: 999 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>Todas (vista consolidada)</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Grupo de sociedades</div>
                  </div>
                </div>
              )}
              {sociedadesDisponibles.map(sociedad => (
                <div
                  key={sociedad.id}
                  className={'dropdown-item ' + (sociedad.id === sociedadActiva?.id ? 'active' : '')}
                  onClick={() => { seleccionarSociedad(sociedad.id); setOpen(false); }}
                >
                  <span className="company-dot" style={{ background: '#0ea5e9', width: 8, height: 8, borderRadius: 999 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sociedad.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{sociedad.codigo}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OperationalHeader({ title, sesionOperativa }) {
  const [compOpen, setCompOpen] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  const [isCompactHeader, setIsCompactHeader] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1180px)').matches);
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark' || document.documentElement.classList.contains('dark');
  });

  const [notificaciones, setNotificaciones] = useState([]);

  useEffect(() => {
    const mediaMobile = window.matchMedia('(max-width: 640px)');
    const onChangeMobile = () => setIsMobile(mediaMobile.matches);
    mediaMobile.addEventListener?.('change', onChangeMobile);

    const mediaCompact = window.matchMedia('(max-width: 1180px)');
    const onChangeCompact = () => setIsCompactHeader(mediaCompact.matches);
    mediaCompact.addEventListener?.('change', onChangeCompact);

    return () => {
      mediaMobile.removeEventListener?.('change', onChangeMobile);
      mediaCompact.removeEventListener?.('change', onChangeCompact);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !sesionOperativa?.usuario?.id) return;
    const client = getSupabaseClient();
    client
      .from('notificaciones_sistema')
      .select('id, texto, leida, created_at, titulo, prioridad')
      .eq('user_id', sesionOperativa.usuario.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!error && data && data.length) {
          setNotificaciones(data.map(d => ({
            id: d.id,
            text: d.texto,
            title: d.titulo,
            read: Boolean(d.leida),
            time: d.created_at ? new Date(d.created_at).toLocaleDateString() : '',
            priority: d.prioridad,
          })));
        }
      })
      .catch(() => {});
  }, [sesionOperativa?.usuario?.id]);

  const markNotificacionesRead = async (id = null) => {
    if (id) {
      setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      if (isSupabaseConfigured()) {
        getSupabaseClient().from('notificaciones_sistema').update({ leida: true }).eq('id', id).catch(() => {});
      }
    } else {
      setNotificaciones(prev => prev.map(n => ({ ...n, read: true })));
      if (isSupabaseConfigured() && sesionOperativa?.usuario?.id) {
        getSupabaseClient().from('notificaciones_sistema').update({ leida: true }).eq('user_id', sesionOperativa.usuario.id).catch(() => {});
      }
    }
  };

  const adminAppUrl = import.meta.env.VITE_ADMIN_APP_URL || '/';
  const empresa = sesionOperativa?.empresa;
  const nombreEmpresa = empresa?.nombre_comercial || empresa?.razon_social || 'PRUEBA';
  const usuario = sesionOperativa?.usuario;
  const userEmail = usuario?.email || sesionOperativa?.rolActivo?.nombre || 'operaciones@tideo.tech';
  const avatarText = usuario?.email
    ? usuario.email.slice(0, 2).toUpperCase()
    : 'CR';

  const unreadCount = notificaciones.filter(n => !n.read).length;
  const todasMembresias = sesionOperativa?.todasMembresias || [];

  const empresaItems = todasMembresias.length > 0
    ? todasMembresias.map(m => ({
        id: m.empresa_id,
        nombre: m.empresa?.nombre_comercial || m.empresa?.razon_social || m.empresa_id,
        sub: m.rol?.nombre || '',
        color: m.rol?.es_superadmin ? '#1e3a5f' : '#0ea5e9',
        active: m.empresa_id === empresa?.id,
        onClick: () => {
          sesionOperativa?.seleccionarEmpresa?.(m.empresa_id);
          setCompOpen(false);
        },
      }))
    : [{
        id: empresa?.id || 'demo',
        nombre: nombreEmpresa,
        sub: 'Tenant actual',
        color: '#0ea5e9',
        active: true,
        onClick: () => setCompOpen(false),
      }];

  const mostrarSelectorSociedad = Boolean(
    sesionOperativa?.sociedadActiva
    || (empresa?.multisociedad_habilitado && (sesionOperativa?.sociedadesDisponibles?.length > 0))
  );

  return (
    <header
      className={'header' + (isCompactHeader ? ' header-compact' : '')}
      style={{
        padding: isCompactHeader ? '0 12px' : '0 20px',
        gap: isCompactHeader ? 10 : 20,
      }}
    >
      <div
        className="header-title font-display"
        style={{
          minWidth: 0,
          flex: '0 1 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: isCompactHeader ? 140 : 'none',
        }}
      >
        {title || 'Operaciones'}
      </div>

      <div className="header-spacer" />

      {/* Commit actual — oculto en móvil */}
      {!isCompactHeader && (() => {
        const commitMsg = typeof __COMMIT_MSG__ !== 'undefined' ? __COMMIT_MSG__ : '';
        const match = commitMsg.match(/^(\d+)\s+cambios/i);
        const commitLabel = match ? match[1] : commitMsg;
        if (!commitLabel) return null;
        return (
          <div
            title={commitMsg}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.01em',
              cursor: 'default',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            Commit: {commitLabel}
          </div>
        );
      })()}

      {/* Botones de acción */}
      <div className="row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isCompactHeader && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              window.location.href = adminAppUrl.replace(/\/$/, '') + '/?mobile=1';
            }}
            title="Modo campo"
          >
            {I.mobile}
          </button>
        )}

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setNotiOpen(v => !v)}
            title="Notificaciones"
          >
            {I.bell}
            {unreadCount > 0 && (
              <span
                className="dot-badge"
                style={{
                  background: 'var(--danger)',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: 'white',
                  right: 0,
                  top: 0,
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {notiOpen && (
            <div
              className="dropdown"
              style={{
                top: 42,
                right: 0,
                minWidth: isMobile ? 'calc(100vw - 24px)' : 320,
                maxWidth: isMobile ? 'calc(100vw - 24px)' : 360,
                padding: 0,
                zIndex: 100,
              }}
              onMouseLeave={() => !isMobile && setNotiOpen(false)}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                Notificaciones
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => markNotificacionesRead()}
                      style={{ fontSize: 11 }}
                    >
                      Marcar todas
                    </button>
                  )}
                  {isMobile && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 28, height: 28 }}
                      onClick={() => setNotiOpen(false)}
                    >
                      {I.x}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {notificaciones.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-muted)' }}>
                    No hay notificaciones
                  </div>
                )}
                {notificaciones.map(n => (
                  <div
                    key={n.id}
                    onClick={() => markNotificacionesRead(n.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: n.read ? 'transparent' : 'var(--bg-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    {n.title && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--fg-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 4,
                        }}
                      >
                        {n.title}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--fg)' }}>{n.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>{n.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={() => setDark(!dark)}
          title="Dark mode"
        >
          {dark ? I.sun : I.moon}
        </button>
      </div>

      {mostrarSelectorSociedad && (
        <SociedadSelector
          perfilSociedad={sesionOperativa?.perfilSociedad}
          sociedadActiva={sesionOperativa?.sociedadActiva}
          sociedadesDisponibles={sesionOperativa?.sociedadesDisponibles}
          seleccionarSociedad={sesionOperativa?.seleccionarSociedad}
          puedeVerConsolidado={sesionOperativa?.puedeVerConsolidado}
          isMobile={isCompactHeader}
        />
      )}

      {/* Separador — oculto en móvil */}
      {!isCompactHeader && (
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      )}

      {/* Zona de usuario */}
      <div style={{ position: 'relative' }}>
        <div
          className="user-zone"
          onClick={() => setCompOpen(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isCompactHeader ? 0 : 12,
            padding: isCompactHeader ? 2 : '4px 4px 4px 12px',
            borderRadius: 99,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {!isCompactHeader && (
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#fff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  maxWidth: 140,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {nombreEmpresa}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                {userEmail}
              </div>
            </div>
          )}
          <div className="avatar" style={{ margin: 0, width: 32, height: 32, fontSize: 12 }}>
            {avatarText}
          </div>
        </div>

        {compOpen && (
          <div
            className="dropdown"
            style={{
              top: 48,
              right: 0,
              minWidth: isMobile ? 'min(280px, calc(100vw - 24px))' : 280,
            }}
            onMouseLeave={() => !isMobile && setCompOpen(false)}
          >
            {isMobile && (
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--fg)',
                      maxWidth: 180,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {nombreEmpresa}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{userEmail}</div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={() => setCompOpen(false)}
                >
                  {I.x}
                </button>
              </div>
            )}

            {empresaItems.length > 1 && (
              <>
                <div
                  style={{
                    padding: '8px 12px',
                    fontSize: 11,
                    color: 'var(--fg-subtle)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  Mis empresas
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {empresaItems.map(e => (
                    <div
                      key={e.id}
                      className={'dropdown-item ' + (e.active ? 'active' : '')}
                      onClick={e.onClick}
                    >
                      <span className="company-dot" style={{ background: e.color, width: 8, height: 8, borderRadius: 999 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{e.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{e.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div
              style={{
                padding: 8,
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {isMobile && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', justifyContent: 'center', gap: 6, marginBottom: 4 }}
                  onClick={() => {
                    window.location.href = adminAppUrl.replace(/\/$/, '') + '/?mobile=1';
                    setCompOpen(false);
                  }}
                >
                  {I.mobile} Vista campo
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'center', color: 'var(--danger)', fontWeight: 700, gap: 8 }}
                onClick={() => sesionOperativa?.signOut?.()}
              >
                {I.power} Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botón logout standalone — solo en escritorio */}
      {!isMobile && (
        <button
          type="button"
          className="icon-btn"
          onClick={() => sesionOperativa?.signOut?.()}
          title="Cerrar sesion"
          aria-label="Cerrar sesion"
          style={{
            color: 'rgba(255,255,255,0.82)',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          {I.power}
        </button>
      )}
    </header>
  );
}
