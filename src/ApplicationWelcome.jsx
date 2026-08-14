import React from 'react';
import { getApplicationAccess } from './access/applicationAccess.js';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';

const APPLICATION_ICONS = {
  administrativa: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </svg>
  ),
  operativa: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 21V10l6 3V8l6 3V4l6 4v13H3z" />
      <path d="M7 21v-4h3v4M15 14h.01M18 14h.01M15 17h.01M18 17h.01" />
    </svg>
  ),
};

const apps = [
  {
    key: 'administrativa',
    title: 'Administración',
    description: 'Gestiona la plataforma, finanzas y configuración.',
    icon: APPLICATION_ICONS.administrativa,
  },
  {
    key: 'operativa',
    title: 'Operaciones',
    description: 'Consulta y ejecuta el trabajo operativo diario.',
    icon: APPLICATION_ICONS.operativa,
  },
];

function AppCard({ app, enabled, loading, onSelect }) {
  const content = <>
    <span className="application-card-icon" aria-hidden="true">
      {enabled ? app.icon : I.lock}
    </span>
    <span className="application-card-copy">
      <span className="font-display application-card-title">{app.title}</span>
      <span className="application-card-description">{loading ? 'Verificando acceso…' : app.description}</span>
    </span>
    {!loading && enabled && <span className="application-card-arrow" aria-hidden="true">→</span>}
  </>;

  if (loading) {
    return (
      <div className={`application-card application-card-${app.key}`} aria-busy="true">
        {content}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className={`application-card application-card-${app.key} application-card-disabled`} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <button className={`application-card application-card-${app.key}`} type="button" onClick={onSelect}>
      {content}
    </button>
  );
}

export function ApplicationWelcome({ onEnterAdministration }) {
  const { empresa, role, membresiaCargando } = useApp();
  const access = getApplicationAccess({ empresa, role });
  const enterOperations = () => {
    window.location.assign(import.meta.env.VITE_OPERATIONS_APP_URL || '/operaciones/');
  };

  return (
    <main className="application-welcome">
      <div className="application-welcome-content">
        <img className="application-wordmark" src="/logo_tideo.png" alt="TIDEO Tech & Strategy" />
        <div className="application-welcome-intro">
          <div className="eyebrow">Plataforma TIDEO</div>
          <h1 className="font-display">Elige una aplicación</h1>
          <p>Selecciona el espacio en el que deseas trabajar.</p>
        </div>
        <div className="application-card-grid">
          {apps.map(app => (
            <AppCard
              key={app.key}
              app={app}
              enabled={access[app.key]}
              loading={membresiaCargando}
              onSelect={app.key === 'administrativa' ? onEnterAdministration : enterOperations}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
