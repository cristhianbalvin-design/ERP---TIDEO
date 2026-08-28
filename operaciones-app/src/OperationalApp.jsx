import React, { useEffect, useState } from 'react';
import tideoIsotipo from '../../public/tideo-isotipo.png';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { useSesionOperativa } from './lib/sesionOperativa.js';
import { ZahoryScreenHost } from './zahory-mock/ZahoryScreenHost.jsx';
import { availableZahoryRoutes } from './zahory-mock/ZahoryRoutes.jsx';
import { Icon } from './zahory-mock/components/shell.jsx';
import {
  findAreaForRoute,
  findGroupForRoute,
  getZahoryNavigation,
  itemMatchesRoute,
} from './zahory-mock/navigation.js';

const routes = {
  inicio: { label: 'Inicio', icon: 'dashboard', title: 'Inicio operativo', description: 'Resumen de tu jornada y trabajo asignado.' },
  ordenes: { label: 'Órdenes', icon: 'orders', title: 'Órdenes de trabajo', description: 'Placeholder para la gestión de órdenes operativas.' },
  actividad: { label: 'Actividad', icon: 'activity', title: 'Actividad diaria', description: 'Placeholder para registrar y consultar la actividad operativa.' },
};

function readLocation() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [routeCandidate = 'inicio', queryString = ''] = hash.split('?');
  const route = routeCandidate || 'inicio';

  return {
    route: routes[route] || availableZahoryRoutes.has(route) ? route : 'inicio',
    params: Object.fromEntries(new URLSearchParams(queryString)),
  };
}

const zahoryNavigation = getZahoryNavigation(availableZahoryRoutes);

function NavEntry({ item, route, navigate }) {
  return (
    <button
      className={`ops-nav-entry${itemMatchesRoute(item, route) ? ' active' : ''}`}
      onClick={() => navigate(item.id)}
    >
      {item.icon && <Icon name={item.icon} size={14} />}
      <span className="ops-nav-entry-label">{item.label}</span>
      {item.badge && <span className={`ops-nav-badge${item.badgeColor ? ` ops-nav-badge-${item.badgeColor}` : ''}`}>{item.badge}</span>}
    </button>
  );
}

export function OperationalApp() {
  const sesionOperativa = useSesionOperativa();
  const [location, setLocation] = useState(readLocation);
  const route = location.route;
  const routeParams = location.params;
  const [openGroupIds, setOpenGroupIds] = useState(() => {
    const activeGroup = findGroupForRoute(readLocation().route, zahoryNavigation);
    const openGroups = new Set(['flota-alquileres']);
    if (activeGroup) openGroups.add(activeGroup);
    return openGroups;
  });
  const [openAreaId, setOpenAreaId] = useState(() => findAreaForRoute(readLocation().route, zahoryNavigation));
  useEffect(() => {
    const updateRoute = () => setLocation(readLocation());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const navigate = (key, params = {}) => {
    const queryString = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ).toString();
    window.location.hash = `/${key}${queryString ? `?${queryString}` : ''}`;
  };
  const page = routes[route];
  const adminAppUrl = import.meta.env.VITE_ADMIN_APP_URL || '/';
  const estadoSesion = !isSupabaseConfigured()
    ? 'Backend pendiente'
    : sesionOperativa.cargando
      ? 'Verificando sesion...'
      : sesionOperativa.estado === 'sin_sesion'
        ? 'Inicia sesion desde Administrativo'
        : sesionOperativa.estado === 'sin_empresa'
          ? 'No tienes una empresa activa'
          : sesionOperativa.estado === 'error'
            ? 'Sesion no disponible'
            : sesionOperativa.vistaConsolidada
              ? 'Vista consolidada - solo lectura'
              : 'Sesion operativa lista';
  const nombreTenant = sesionOperativa.empresa?.nombre_comercial || sesionOperativa.empresa?.razon_social || '';
  const etiquetaSociedad = sesionOperativa.cargando
    ? ''
    : sesionOperativa.vistaConsolidada
      ? 'Vista consolidada'
      : sesionOperativa.empresa?.multisociedad_habilitado && sesionOperativa.sociedadActiva
        ? (sesionOperativa.sociedadActiva.codigo || sesionOperativa.sociedadActiva.nombre || '')
        : '';
  const nombreUsuario = sesionOperativa.usuario?.user_metadata?.nombre
    || sesionOperativa.usuario?.user_metadata?.full_name
    || sesionOperativa.usuario?.email
    || '';

  useEffect(() => {
    const activeGroup = findGroupForRoute(route, zahoryNavigation);
    if (activeGroup) {
      setOpenGroupIds(current => current.has(activeGroup) ? current : new Set([...current, activeGroup]));
    }

    const activeArea = findAreaForRoute(route, zahoryNavigation);
    if (activeArea) setOpenAreaId(activeArea);
  }, [route]);

  const toggleGroup = groupId => {
    setOpenGroupIds(current => {
      const next = new Set(current);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <a className="ops-brand" href={adminAppUrl} aria-label="Ir al selector de aplicaciones">
          <span className="ops-brand-mark">T</span><span>TIDEO</span>
        </a>
        <div className="ops-product">OPERACIONES</div>
        <nav className="ops-nav" aria-label="Navegación operativa">
          {Object.entries(routes).map(([key, item]) => (
            <NavEntry key={key} item={{ ...item, id: key }} route={route} navigate={navigate} />
          ))}
          <div className="ops-imported-nav">
            {zahoryNavigation.map(zone => (
              <section className={`ops-nav-zone ops-nav-zone-${zone.id}`} key={zone.id}>
                <div className="ops-nav-zone-label">{zone.label}</div>
                {zone.type === 'flat' ? zone.items.map(item => (
                  <NavEntry key={item.id} item={item} route={route} navigate={navigate} />
                )) : zone.groups.map(group => {
                  const isOpen = openGroupIds.has(group.id);
                  const isActive = [...group.items, ...group.areaItems, ...group.tailItems]
                    .some(item => item.type !== 'divider' && itemMatchesRoute(item, route));

                  return (
                    <div className={`ops-nav-group${isOpen ? ' is-open' : ''}`} key={group.id}>
                      <button className={`ops-nav-group-head${isActive ? ' active' : ''}`} onClick={() => toggleGroup(group.id)} aria-expanded={isOpen}>
                        <span className="ops-nav-group-icon">{group.emoji}</span>
                        <span className="ops-nav-entry-label">{group.label}</span>
                        {group.groupBadge && <span className={`ops-nav-group-badge${group.groupBadgeClass ? ` ${group.groupBadgeClass}` : ''}`}>{group.groupBadge}</span>}
                        <Icon name="chev" size={11} />
                      </button>
                      {isOpen && <div className="ops-nav-group-body">
                        {group.items.map(item => <NavEntry key={item.id} item={item} route={route} navigate={navigate} />)}
                        {group.areaItems.length > 0 && <>
                          <div className="ops-nav-divider">ÁREAS PRODUCTIVAS</div>
                          {group.areaItems.map(area => {
                            const areaOpen = openAreaId === area.id;
                            return (
                              <div className="ops-nav-area" key={area.id}>
                                <button
                                  className={`ops-nav-area-head${itemMatchesRoute(area, route) ? ' active' : ''}`}
                                  onClick={() => {
                                    const nextOpen = !areaOpen;
                                    setOpenAreaId(nextOpen ? area.id : null);
                                    if (nextOpen) navigate(area.id);
                                  }}
                                  aria-expanded={areaOpen}
                                >
                                  <span className="ops-nav-area-dot" style={{ backgroundColor: area.areaColor }} />
                                  <span className="ops-nav-entry-label">{area.label}</span>
                                  <Icon name="chev" size={10} />
                                </button>
                                {areaOpen && <div className="ops-nav-area-body">
                                  {area.subItems.map(item => <NavEntry key={item.id} item={item} route={route} navigate={navigate} />)}
                                </div>}
                              </div>
                            );
                          })}
                        </>}
                        {group.tailItems.map((item, index) => item.type === 'divider'
                          ? <div className="ops-nav-divider" key={`${group.id}-divider-${index}`}>{item.label}</div>
                          : <NavEntry key={item.id} item={item} route={route} navigate={navigate} />)}
                      </div>}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </nav>
      </aside>
      <section className="ops-main-column">
        <header className="ops-header">
          <a className="ops-header-brand" href={adminAppUrl} aria-label="Volver al selector de aplicaciones">
            <span className="ops-header-logo-mark"><img src={tideoIsotipo} alt="" /></span>
            <span className="ops-header-wordmark"><strong>TIDEO</strong><small>OPERACIONES</small></span>
          </a>
          <div className="ops-header-context">
            {!sesionOperativa.cargando && nombreTenant && <span className="ops-tenant" title={nombreTenant}>{nombreTenant}</span>}
            {!sesionOperativa.cargando && etiquetaSociedad && <span className={`ops-sociedad${sesionOperativa.vistaConsolidada ? ' consolidated' : ''}`} title={sesionOperativa.sociedadActiva?.nombre || etiquetaSociedad}>{etiquetaSociedad}</span>}
            {!sesionOperativa.cargando && nombreUsuario && <span className="ops-user" title={nombreUsuario}>{nombreUsuario}</span>}
            {sesionOperativa.estado === 'sin_sesion' && isSupabaseConfigured() ? (
              <a className="ops-status" href={adminAppUrl}>{estadoSesion}</a>
            ) : (
              <span className={sesionOperativa.estado === 'listo' && !sesionOperativa.vistaConsolidada ? 'ops-status ready' : 'ops-status'} title={sesionOperativa.error || undefined}>{estadoSesion}</span>
            )}
          </div>
        </header>
        {page ? (
          <main className="ops-main">
            <div className="ops-eyebrow">Operaciones</div>
            <h1>{page.title}</h1>
            <p>{page.description}</p>
            <div className="ops-placeholder">Contenido operativo próximamente</div>
          </main>
        ) : (
          <main className="ops-imported-main">
            <ZahoryScreenHost route={route} routeParams={routeParams} onNavigate={navigate} />
          </main>
        )}
      </section>
    </div>
  );
}
