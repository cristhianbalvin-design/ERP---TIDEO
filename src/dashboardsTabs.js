import { puedeVerPantalla } from './access/roleAccess.js';

export const DASHBOARDS_ACCESS_ANY_OF = ['bi_comercial', 'bi_operativo', 'bi_financiero'];

export const DASHBOARD_TABS = [
  { key: 'dashboard', routeKey: '', label: 'Dashboard General', icon: 'dashboard' },
  { key: 'bi_comercial', routeKey: 'comercial', label: 'BI Comercial', icon: 'trend' },
  { key: 'bi_operativo', routeKey: 'operativo', label: 'BI Operativo', icon: 'trend' },
  { key: 'bi_financiero', routeKey: 'financiero', label: 'BI Financiero', icon: 'trend' },
];

const ROUTE_ALIASES = Object.fromEntries(DASHBOARD_TABS.slice(1).map(tab => [tab.key, tab.routeKey]));
const ROUTE_KEYS = new Set(DASHBOARD_TABS.map(tab => tab.routeKey));

export function getVisibleDashboardTabs(role) {
  return DASHBOARD_TABS.filter(tab => puedeVerPantalla(role, tab.key));
}

export function resolveDashboardTab(role, requestedRouteKey) {
  const visible = getVisibleDashboardTabs(role);
  const requested = visible.find(tab => tab.routeKey === (requestedRouteKey || ''));
  return requested || visible[0] || null;
}

export function normalizeDashboardRoute(value) {
  const raw = String(value || '').trim().replace(/^#\/?/, '').replace(/^\//, '');
  const [page = '', routeKey = ''] = raw.split('/');
  if (ROUTE_ALIASES[page]) return { pagina: 'dashboard', pestana: ROUTE_ALIASES[page] };
  if (page === 'dashboard') {
    return { pagina: 'dashboard', pestana: ROUTE_KEYS.has(routeKey) ? routeKey : '' };
  }
  return { pagina: page, pestana: null };
}
