import { SIDEBAR_ZONES } from './components/shell.jsx';

export const INITIAL_ZAHORY_ROUTES = new Set([
  'dashboard',
  'mis-ots-hoy',
  'mapa-campo',
]);

export function itemMatchesRoute(item, route) {
  return item.id === route
    || item.altIds?.includes(route)
    || item.subItems?.some(subItem => itemMatchesRoute(subItem, route));
}

function isAvailable(item, availableRoutes) {
  return item.type !== 'divider'
    && (availableRoutes.has(item.id)
      || item.altIds?.some(id => availableRoutes.has(id))
      || item.subItems?.some(subItem => isAvailable(subItem, availableRoutes)));
}

function filterItems(items = [], availableRoutes) {
  return items.filter(item => isAvailable(item, availableRoutes)).map(item => ({
    ...item,
    ...(item.subItems ? { subItems: filterItems(item.subItems, availableRoutes) } : {}),
  }));
}

function filterTailItems(items = [], availableRoutes) {
  const filtered = [];
  let divider = null;

  items.forEach(item => {
    if (item.type === 'divider') {
      divider = item;
    } else if (isAvailable(item, availableRoutes)) {
      if (divider) filtered.push(divider);
      divider = null;
      filtered.push({
        ...item,
        ...(item.subItems ? { subItems: filterItems(item.subItems, availableRoutes) } : {}),
      });
    }
  });

  return filtered;
}

function filterGroup(group, availableRoutes) {
  const items = filterItems(group.items, availableRoutes);
  const areaItems = filterItems(group.areaItems, availableRoutes);
  const tailItems = filterTailItems(group.tailItems, availableRoutes);

  return items.length || areaItems.length || tailItems.length
    ? { ...group, items, areaItems, tailItems }
    : null;
}

export function getZahoryNavigation(availableRoutes = INITIAL_ZAHORY_ROUTES) {
  return SIDEBAR_ZONES.map(zone => {
    if (zone.type === 'flat') {
      const items = filterItems(zone.items, availableRoutes);
      return items.length ? { ...zone, items } : null;
    }

    const groups = (zone.groups || [])
      .map(group => filterGroup(group, availableRoutes))
      .filter(Boolean);

    return groups.length ? { ...zone, groups } : null;
  }).filter(Boolean);
}

function groupItems(group) {
  return [...(group.items || []), ...(group.areaItems || []), ...(group.tailItems || [])];
}

export function findGroupForRoute(route, navigation) {
  return navigation
    .flatMap(zone => zone.groups || [])
    .find(group => groupItems(group).some(item => item.type !== 'divider' && itemMatchesRoute(item, route)))
    ?.id ?? null;
}

export function findAreaForRoute(route, navigation) {
  return navigation
    .flatMap(zone => zone.groups || [])
    .flatMap(group => group.areaItems || [])
    .find(area => itemMatchesRoute(area, route))
    ?.id ?? null;
}
