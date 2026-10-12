import React, { useEffect, useMemo, useRef, useState } from 'react';
import operaIsotipo from '../../public/opera/opera-isotipo-light.png';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { useSesionOperativa } from './lib/sesionOperativa.js';
import { OperationalHeader } from './OperationalHeader.jsx';
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

function getTitleForRoute(route, baseRoutes, navigation) {
  if (baseRoutes[route]) return baseRoutes[route].title || baseRoutes[route].label;
  for (const zone of navigation) {
    if (zone.type === 'flat') {
      const found = zone.items?.find(item => itemMatchesRoute(item, route));
      if (found) return found.label;
    } else if (zone.groups) {
      for (const group of zone.groups) {
        for (const item of (group.items || [])) {
          if (itemMatchesRoute(item, route)) return item.label;
        }
        for (const item of (group.tailItems || [])) {
          if (itemMatchesRoute(item, route)) return item.label;
        }
        for (const area of (group.areaItems || [])) {
          if (itemMatchesRoute(area, route)) return area.label;
          for (const sub of (area.subItems || [])) {
            if (itemMatchesRoute(sub, route)) return sub.label;
          }
        }
      }
    }
  }
  return 'Operaciones';
}


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

const normalizeSearch = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

function getSearchableModules(navigation) {
  const modules = [];
  const addItem = (item, section, fallbackIcon = 'report') => {
    if (!item || item.type === 'divider') return;
    modules.push({
      id: item.id,
      label: item.label,
      icon: item.icon || fallbackIcon,
      section,
      keywords: normalizeSearch(`${item.label} ${item.id} ${section}`),
    });
    item.subItems?.forEach(subItem => addItem(subItem, `${section} · ${item.label}`, item.icon || fallbackIcon));
  };

  Object.entries(routes).forEach(([id, item]) => addItem({ ...item, id }, 'Inicio'));
  navigation.forEach(zone => {
    if (zone.type === 'flat') {
      zone.items.forEach(item => addItem(item, zone.label));
      return;
    }
    zone.groups?.forEach(group => {
      const section = `${zone.label} · ${group.label}`;
      group.items?.forEach(item => addItem(item, section, 'report'));
      group.areaItems?.forEach(area => addItem(area, section, 'activity'));
      group.tailItems?.forEach(item => addItem(item, section, 'report'));
    });
  });
  return modules;
}

function scoreModuleSearch(query, module) {
  if (!query) return 0;
  const label = normalizeSearch(module.label);
  if (label === query) return 1000;
  if (label.startsWith(query)) return 800;
  if (module.keywords.includes(query)) return 600 - Math.min(module.keywords.indexOf(query), 120);
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every(word => module.keywords.includes(word))) return 450;
  return 0;
}

function NavEntry({ item, route, navigate }) {
  return (
    <button
      className={`ops-nav-entry${itemMatchesRoute(item, route) ? ' active' : ''}`}
      title={item.label}
      aria-label={item.label}
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
  const [moduleSearch, setModuleSearch] = useState('');
  const [diagnosticoWorkMode, setDiagnosticoWorkMode] = useState(() => typeof document !== 'undefined' && document.documentElement?.dataset.dxDiagnosticoWorkMode === 'true');
  useEffect(() => {
    const onWorkMode = event => setDiagnosticoWorkMode(Boolean(event.detail?.active));
    window.addEventListener('dx-diagnostico-work-mode', onWorkMode);
    return () => window.removeEventListener('dx-diagnostico-work-mode', onWorkMode);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('opera_ops_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [flyoutGroupId, setFlyoutGroupId] = useState(null);
  const [flyoutPosition, setFlyoutPosition] = useState(null);
  const flyoutRef = useRef(null);
  const flyoutAnchorRef = useRef(null);
  useEffect(() => {
    try {
      window.localStorage.setItem('opera_ops_sidebar_collapsed', String(sidebarCollapsed));
    } catch {}
  }, [sidebarCollapsed]);
  useEffect(() => {
    const updateRoute = () => setLocation(readLocation());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    setFlyoutGroupId(null);
    setFlyoutPosition(null);
  }, [route]);

  useEffect(() => {
    if (!flyoutGroupId || !sidebarCollapsed) return undefined;
    const closeFlyout = () => {
      setFlyoutGroupId(null);
      setFlyoutPosition(null);
    };
    const closeOnOutsideClick = event => {
      if (flyoutRef.current?.contains(event.target) || flyoutAnchorRef.current?.contains(event.target)) return;
      closeFlyout();
    };
    const closeOnKeyDown = event => {
      if (event.key === 'Escape') closeFlyout();
    };
    const closeOnPageScroll = event => {
      if (!flyoutRef.current?.contains(event.target)) closeFlyout();
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnKeyDown);
    document.addEventListener('scroll', closeOnPageScroll, true);
    window.addEventListener('resize', closeFlyout);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnKeyDown);
      document.removeEventListener('scroll', closeOnPageScroll, true);
      window.removeEventListener('resize', closeFlyout);
    };
  }, [flyoutGroupId, sidebarCollapsed]);

  const navigate = (key, params = {}) => {
    setFlyoutGroupId(null);
    setFlyoutPosition(null);
    const queryString = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ).toString();
    window.location.hash = `/${key}${queryString ? `?${queryString}` : ''}`;
  };
  const page = routes[route];
  const title = getTitleForRoute(route, routes, zahoryNavigation);
  const adminAppUrl = import.meta.env.VITE_ADMIN_APP_URL || '/';

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

  const toggleGroupFlyout = (event, group) => {
    if (flyoutGroupId === group.id) {
      setFlyoutGroupId(null);
      setFlyoutPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const itemCount = group.items.length + group.areaItems.reduce((count, area) => count + 1 + area.subItems.length, 0)
      + group.tailItems.filter(item => item.type !== 'divider').length;
    const dividerCount = group.tailItems.filter(item => item.type === 'divider').length;
    const estimatedHeight = Math.min(window.innerHeight - 16, 54 + itemCount * 36 + dividerCount * 25 + (group.areaItems.length ? 24 : 0));
    const availableBelow = window.innerHeight - rect.top - 8;
    const opensUp = estimatedHeight > availableBelow && rect.top > 8;
    const top = opensUp ? Math.max(8, rect.bottom - estimatedHeight) : Math.max(8, rect.top);
    const maxHeight = opensUp ? rect.bottom - 16 : window.innerHeight - top - 8;
    flyoutAnchorRef.current = event.currentTarget;
    setFlyoutPosition({ top, left: rect.right + 8, maxHeight });
    setFlyoutGroupId(group.id);
  };

  const searchResults = useMemo(() => {
    const query = normalizeSearch(moduleSearch);
    if (!query) return [];
    return getSearchableModules(zahoryNavigation)
      .map(module => ({ ...module, score: scoreModuleSearch(query, module) }))
      .filter(module => module.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'es'))
      .slice(0, 8);
  }, [moduleSearch]);

  const handleSearchNavigation = moduleId => {
    setModuleSearch('');
    navigate(moduleId);
  };

  return (
    <div className="ops-shell">
      <aside className={`ops-sidebar${diagnosticoWorkMode ? ' is-diagnostico-rail' : ''}${sidebarCollapsed ? ' is-collapsed' : ''}`}>
        <a className="ops-brand" href={adminAppUrl} aria-label="Ir al selector de aplicaciones">
          <div className="ops-brand-logo-box">
            <img src={operaIsotipo} alt="OPERA" />
          </div>
          <div className="ops-brand-copy">
            <div className="ops-brand-text">OPERA</div>
            <div className="ops-brand-sub">OPERACIONES</div>
          </div>
        </a>
        <div className="ops-module-search">
          <div className="ops-module-search-input">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={moduleSearch}
              onChange={event => setModuleSearch(event.target.value)}
              placeholder="Buscar módulo..."
              aria-label="Buscar módulo"
            />
            {moduleSearch && (
              <button type="button" onClick={() => setModuleSearch('')} aria-label="Limpiar búsqueda">
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        </div>
        <nav className="ops-nav" aria-label="Navegación operativa">
          {moduleSearch.trim() ? (
            <div className="ops-search-results" aria-label="Resultados de módulos">
              {searchResults.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={`ops-search-result${itemMatchesRoute(item, route) ? ' active' : ''}`}
                  onClick={() => handleSearchNavigation(item.id)}
                >
                  <Icon name={item.icon} size={16} />
                  <span><strong>{item.label}</strong><small>{item.section}</small></span>
                </button>
              ))}
              {!searchResults.length && <div className="ops-search-empty">No encontramos un módulo parecido.</div>}
            </div>
          ) : (
            <>
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
                      const isActive = [...group.items, ...group.areaItems.flatMap(area => [area, ...area.subItems]), ...group.tailItems]
                        .some(item => item.type !== 'divider' && itemMatchesRoute(item, route));

                      return (
                        <div className={`ops-nav-group${isOpen ? ' is-open' : ''}`} key={group.id}>
                          <button className={`ops-nav-group-head${isActive ? ' active' : ''}`} title={group.label} aria-label={group.label} onClick={event => sidebarCollapsed && window.matchMedia('(min-width: 681px)').matches ? toggleGroupFlyout(event, group) : toggleGroup(group.id)} aria-expanded={sidebarCollapsed && window.matchMedia('(min-width: 681px)').matches ? flyoutGroupId === group.id : isOpen}>
                            <span className="ops-nav-group-icon">{group.emoji}</span>
                            <span className="ops-nav-entry-label">{group.label}</span>
                            {group.groupBadge && <span className={`ops-nav-group-badge${group.groupBadgeClass ? ` ${group.groupBadgeClass}` : ''}`}>{group.groupBadge}</span>}
                            <Icon name="chev" size={11} />
                          </button>
                          {sidebarCollapsed && window.matchMedia('(min-width: 681px)').matches && flyoutGroupId === group.id && flyoutPosition && <div
                            className="ops-sidebar-flyout"
                            ref={flyoutRef}
                            style={flyoutPosition}
                            aria-label={group.label}
                          >
                            <div className="ops-sidebar-flyout-title">{group.label}</div>
                            {group.items.map(item => <NavEntry key={item.id} item={item} route={route} navigate={navigate} />)}
                            {group.areaItems.length > 0 && <>
                              <div className="ops-sidebar-flyout-divider">ÁREAS PRODUCTIVAS</div>
                              {group.areaItems.map(area => <div className="ops-sidebar-flyout-area" key={area.id}>
                                <button
                                  type="button"
                                  className={`ops-sidebar-flyout-item ops-sidebar-flyout-area-head${itemMatchesRoute(area, route) ? ' active' : ''}`}
                                  onClick={() => navigate(area.id)}
                                >
                                  <span className="ops-nav-area-dot" style={{ backgroundColor: area.areaColor }} />
                                  <span>{area.label}</span>
                                </button>
                                {area.subItems.map(item => <NavEntry key={item.id} item={item} route={route} navigate={navigate} />)}
                              </div>)}
                            </>}
                            {group.tailItems.map((item, index) => item.type === 'divider'
                              ? <div className="ops-sidebar-flyout-divider" key={`${group.id}-flyout-divider-${index}`}>{item.label}</div>
                              : <NavEntry key={item.id} item={item} route={route} navigate={navigate} />)}
                          </div>}
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
                                      title={area.label}
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
            </>
          )}
        </nav>
        <button
          type="button"
          className="ops-sidebar-collapse"
          title={sidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'}
          aria-label={sidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'}
          onClick={() => {
            setSidebarCollapsed(current => !current);
            setFlyoutGroupId(null);
            setFlyoutPosition(null);
          }}
        >
          <span className="ops-sidebar-collapse-icon"><Icon name="chev" size={16} /></span>
          {!sidebarCollapsed && <span>Colapsar</span>}
        </button>
      </aside>
      <section className="ops-main-column">
        <OperationalHeader title={title} sesionOperativa={sesionOperativa} />
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
