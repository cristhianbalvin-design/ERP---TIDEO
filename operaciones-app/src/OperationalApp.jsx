import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { useSesionOperativa } from './lib/sesionOperativa.js';
import { OperationalHeader } from './OperationalHeader.jsx';
import { ZahoryScreenHost } from './zahory-mock/ZahoryScreenHost.jsx';
import { availableZahoryRoutes } from './zahory-mock/ZahoryRoutes.jsx';
import { DEFAULT_WORK_BACK_LABEL, WORK_COMPACT_QUERY } from './workMode.js';
import { WorkDrawerFooter } from './WorkDrawerFooter.jsx';
import { AriaOperaciones } from './AriaOperaciones.jsx';
import { InicioOperaciones } from './InicioOperaciones.jsx';
import { useNotificacionesSistema, useTemaOscuro } from './useCuentaOperativa.js';
import { getZahoryNavigation, itemMatchesRoute } from './zahory-mock/navigation.js';
import { MenuLateralOperaciones } from './MenuLateralOperaciones.jsx';
import { filtrarNavegacionPorModulos } from './zahory-mock/navegacionModulos.js';
import { useModulosWms } from './zahory-mock/pages/wms/useModulosWms.js';

const routes = {
  inicio: { label: 'Inicio', icon: 'home', title: 'Inicio operativo', description: 'Resumen de tu jornada y trabajo asignado.' },
};

// Enlaces antiguos: «Órdenes» y «Actividad» salieron del menú porque repetían la Bandeja de OTs
// y la lista de partes de taller, que ya están en Órdenes de Trabajo.
const RUTAS_ANTIGUAS = { ordenes: 'ots', actividad: 'partes-taller' };

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
  const route = RUTAS_ANTIGUAS[routeCandidate] || routeCandidate || 'inicio';

  return {
    route: routes[route] || availableZahoryRoutes.has(route) ? route : 'inicio',
    params: Object.fromEntries(new URLSearchParams(queryString)),
  };
}

const zahoryNavigation = getZahoryNavigation(availableZahoryRoutes);

export function OperationalApp() {
  const sesionOperativa = useSesionOperativa();
  const modulosWms = useModulosWms();
  const navegacionVisible = useMemo(() => filtrarNavegacionPorModulos(zahoryNavigation, modulosWms), [modulosWms]);
  const [location, setLocation] = useState(readLocation);
  const route = location.route;
  const page = availableZahoryRoutes.has(route) ? undefined : routes[route];
  const routeParams = location.params;
  const [workMode, setWorkModeActive] = useState(() => typeof document !== 'undefined' && (document.documentElement?.dataset.dxWorkMode === 'true' || document.documentElement?.dataset.dxDiagnosticoWorkMode === 'true'));
  const [workBackLabel, setWorkBackLabel] = useState(() => {
    const stored = typeof document !== 'undefined' ? document.documentElement?.dataset.dxWorkBack : undefined;
    return stored === undefined ? DEFAULT_WORK_BACK_LABEL : stored;
  });
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(WORK_COMPACT_QUERY).matches);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    const onWorkMode = event => {
      setWorkModeActive(Boolean(event.detail?.active));
      const label = event.detail?.backLabel;
      setWorkBackLabel(label === undefined ? DEFAULT_WORK_BACK_LABEL : label);
    };
    const media = window.matchMedia(WORK_COMPACT_QUERY);
    const onCompact = event => setCompact(event.matches);
    window.addEventListener('dx-work-mode', onWorkMode);
    window.addEventListener('dx-diagnostico-work-mode', onWorkMode);
    media.addEventListener?.('change', onCompact);
    // La pantalla inicial activa el modo trabajo en su efecto, que corre antes que este: se lee lo ya fijado.
    const dataset = document.documentElement?.dataset || {};
    if (dataset.dxWorkMode === 'true' || dataset.dxDiagnosticoWorkMode === 'true') {
      setWorkModeActive(true);
      setWorkBackLabel(dataset.dxWorkBack ?? DEFAULT_WORK_BACK_LABEL);
    }
    return () => { window.removeEventListener('dx-work-mode', onWorkMode); window.removeEventListener('dx-diagnostico-work-mode', onWorkMode); media.removeEventListener?.('change', onCompact); };
  }, []);
  const workCompact = workMode && compact;
  // El contenido de las pantallas vive en un shadow root: ZahoryScreenHost copia este atributo
  // al host para que los botones ☰ se muestren también en tablet.
  useEffect(() => {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!root?.dataset) return undefined;
    root.dataset.dxWorkCompact = String(workCompact);
    return () => { delete root.dataset.dxWorkCompact; };
  }, [workCompact]);
  const { notificaciones, markRead: markNotificacionesRead } = useNotificacionesSistema(sesionOperativa?.usuario?.id);
  const [dark, setDark] = useTemaOscuro();
  useEffect(() => {
    if (!workCompact) { setNavOpen(false); return undefined; }
    const openNav = () => setNavOpen(true);
    const closeOnEscape = event => { if (event.key === 'Escape') setNavOpen(false); };
    window.addEventListener('dx-open-nav', openNav);
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('dx-open-nav', openNav); window.removeEventListener('keydown', closeOnEscape); };
  }, [workCompact]);
  useEffect(() => {
    const updateRoute = () => setLocation(readLocation());
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('popstate', updateRoute);
    return () => { window.removeEventListener('hashchange', updateRoute); window.removeEventListener('popstate', updateRoute); };
  }, []);

  const navigate = (key, params = {}) => {
    setNavOpen(false);
    const destino = RUTAS_ANTIGUAS[key] || key;
    const queryString = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ).toString();
    window.location.hash = `/${destino}${queryString ? `?${queryString}` : ''}`;
  };
  const title = getTitleForRoute(route, routes, zahoryNavigation);
  const adminAppUrl = import.meta.env.VITE_ADMIN_APP_URL || '/';

  return (
    <div className={`ops-shell${workCompact ? ' is-work-compact' : ''}`}>
      {workCompact && navOpen && <button type="button" className="ops-drawer-backdrop" aria-label="Cerrar menú" onClick={() => setNavOpen(false)} />}
      <MenuLateralOperaciones
        navegacion={navegacionVisible}
        route={route}
        navigate={navigate}
        userId={sesionOperativa?.usuario?.id}
        adminAppUrl={adminAppUrl}
        workMode={workMode}
        workCompact={workCompact}
        navOpen={navOpen}
        onCloseNav={() => setNavOpen(false)}
        workBackLabel={workBackLabel}
        footer={workCompact ? (
          <WorkDrawerFooter
            empresaNombre={sesionOperativa?.empresa?.nombre_comercial || sesionOperativa?.empresa?.razon_social || 'Empresa'}
            email={sesionOperativa?.usuario?.email || sesionOperativa?.rolActivo?.nombre || ''}
            avatarText={(sesionOperativa?.usuario?.email || 'OP').slice(0, 2).toUpperCase()}
            notificaciones={notificaciones}
            onMarkRead={markNotificacionesRead}
            dark={dark}
            onToggleDark={() => setDark(value => !value)}
            onSignOut={() => sesionOperativa?.signOut?.()}
          />
        ) : null}
      />
      <section className="ops-main-column">
        <OperationalHeader title={title} sesionOperativa={sesionOperativa} workCompact={workCompact} onMenu={() => setNavOpen(true)} navOpen={navOpen} notificaciones={notificaciones} onMarkNotificacionesRead={markNotificacionesRead} dark={dark} setDark={setDark} />
        {page ? (
          <main className="ops-main">
            <div className="ops-eyebrow">Operaciones</div>
            <h1>{page.title}</h1>
            <p>{page.description}</p>
            <div className="ops-placeholder">Contenido operativo próximamente</div>
          </main>
        ) : (
          route === 'inicio' ? (
            <main className="ops-imported-main"><InicioOperaciones sesion={sesionOperativa} onNavigate={navigate} /></main>
          ) : (
            <main className="ops-imported-main">
              <ZahoryScreenHost route={route} routeParams={routeParams} onNavigate={navigate} />
            </main>
          )
        )}
      </section>
      <AriaOperaciones sesion={sesionOperativa} ruta={route} />
    </div>
  );
}
