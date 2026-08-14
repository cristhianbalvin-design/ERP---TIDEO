import React, { useEffect, useState } from 'react';
import { isSupabaseConfigured } from './lib/supabaseClient.js';

const routes = {
  inicio: { label: 'Inicio', title: 'Inicio operativo', description: 'Resumen de tu jornada y trabajo asignado.' },
  ordenes: { label: 'Órdenes', title: 'Órdenes de trabajo', description: 'Placeholder para la gestión de órdenes operativas.' },
  actividad: { label: 'Actividad', title: 'Actividad diaria', description: 'Placeholder para registrar y consultar la actividad operativa.' },
};

function readRoute() {
  const route = window.location.hash.replace('#/', '') || 'inicio';
  return routes[route] ? route : 'inicio';
}

export function OperationalApp() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const updateRoute = () => setRoute(readRoute());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const navigate = key => { window.location.hash = `/${key}`; };
  const page = routes[route];

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <a className="ops-brand" href={import.meta.env.VITE_ADMIN_APP_URL || '/'} aria-label="Ir al selector de aplicaciones">
          <span className="ops-brand-mark">T</span><span>TIDEO</span>
        </a>
        <div className="ops-product">OPERACIONES</div>
        <nav className="ops-nav" aria-label="Navegación operativa">
          {Object.entries(routes).map(([key, item]) => (
            <button key={key} className={route === key ? 'active' : ''} onClick={() => navigate(key)}>{item.label}</button>
          ))}
        </nav>
      </aside>
      <section className="ops-main-column">
        <header className="ops-header">
          <a className="ops-header-brand" href={import.meta.env.VITE_ADMIN_APP_URL || '/'} aria-label="Volver al selector de aplicaciones">TIDEO</a>
          <span className={isSupabaseConfigured() ? 'ops-status ready' : 'ops-status'}>{isSupabaseConfigured() ? 'Backend configurado' : 'Backend pendiente'}</span>
        </header>
        <main className="ops-main">
          <div className="ops-eyebrow">Operaciones</div>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          <div className="ops-placeholder">Contenido operativo próximamente</div>
        </main>
      </section>
    </div>
  );
}
