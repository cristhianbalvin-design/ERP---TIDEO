import { itemMatchesRoute } from './zahory-mock/navigation.js';

// Lógica pura del menú lateral de Operaciones (franja de íconos + panel por grupo), sin React.

export const INICIO_ITEM = { id: 'inicio', label: 'Inicio', icon: 'home' };

// Ícono de línea de cada grupo en la franja (los grupos del árbol solo traen emoji).
export const ICONOS_GRUPO = {
  'flota-alquileres': 'equipment',
  transporte: 'truck',
  produccion: 'factory',
  'venta-repuestos': 'cart',
  'ordenes-trabajo': 'workshop',
  'hse-grp': 'shield',
  'confiabilidad-grp': 'activity',
  almacen: 'package',
  compras: 'globe',
  finanzas: 'bank',
  'clientes-activos': 'users',
  'config-grp': 'cog',
};

const esPantalla = item => item && item.type !== 'divider';

// Convierte las zonas del árbol en grupos de la franja, igual que Administración: «Inicio» y
// «Dashboard Gerencial» son botones directos (standalone) que abren la pantalla y muestran el menú
// general; Mis OTs del día y Mapa de Campo van con Inicio. El resto son áreas con su panel.
export function construirGruposMenu(navegacion = []) {
  const zonaPlana = navegacion.find(zona => zona.type === 'flat');
  const planos = zonaPlana?.items || [];
  const dashboard = planos.find(item => item.id === 'dashboard');
  const grupos = [{
    key: 'inicio', label: 'Inicio', zona: null, icon: 'home', badge: null, badgeClass: null, standalone: true,
    items: [INICIO_ITEM, ...planos.filter(item => item.id !== 'dashboard')], areas: [], cola: [],
  }];
  if (dashboard) {
    grupos.push({ key: 'dashboard', label: dashboard.label, zona: null, icon: 'dashboard', badge: null, badgeClass: null, standalone: true, items: [dashboard], areas: [], cola: [] });
  }
  for (const zona of navegacion) {
    if (zona.type === 'flat') continue;
    for (const grupo of zona.groups || []) {
      grupos.push({
        key: grupo.id,
        label: grupo.label,
        zona: zona.label,
        icon: ICONOS_GRUPO[grupo.id] || 'report',
        badge: grupo.groupBadge || null,
        badgeClass: grupo.groupBadgeClass || null,
        items: grupo.items || [],
        areas: grupo.areaItems || [],
        cola: grupo.tailItems || [],
      });
    }
  }
  return grupos
    .map(grupo => ({ ...grupo, cola: limpiarDivisores(grupo.cola), pantallas: pantallasDeGrupo(grupo) }))
    .filter(grupo => grupo.pantallas.length > 0);
}

// Quita divisores que quedaron sin pantallas debajo (por permisos o módulos apagados).
function limpiarDivisores(cola = []) {
  return cola.filter((item, indice) => esPantalla(item) || esPantalla(cola[indice + 1]));
}

export function pantallasDeGrupo(grupo) {
  return [
    ...(grupo.items || []),
    ...(grupo.areas || []).flatMap(area => [area, ...(area.subItems || [])]),
    ...(grupo.cola || []),
  ].filter(esPantalla);
}

export function grupoDeRuta(grupos, route) {
  return grupos.find(grupo => grupo.pantallas.some(item => itemMatchesRoute(item, route)))?.key ?? null;
}

// Item activo: el que coincide con la ruta, sin contar el área que solo «contiene» la ruta por sus subítems.
export function itemActivo(item, route) {
  return item.id === route || Boolean(item.altIds?.includes(route));
}

export const normalizarBusqueda = value => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

// Lista plana de pantallas para el buscador (Ctrl K), con su sección legible.
export function modulosBuscables(grupos) {
  const vistos = new Set();
  const modulos = [];
  for (const grupo of grupos) {
    const seccion = grupo.zona ? `${capitalizar(grupo.zona)} · ${grupo.label}` : grupo.label;
    for (const item of grupo.pantallas) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      modulos.push({
        id: item.id,
        label: item.label,
        icon: item.icon || grupo.icon,
        seccion,
        palabras: normalizarBusqueda(`${item.label} ${item.id} ${seccion}`),
      });
    }
  }
  return modulos;
}

export function puntuarModulo(consulta, modulo) {
  const q = normalizarBusqueda(consulta);
  if (!q) return 0;
  const etiqueta = normalizarBusqueda(modulo.label);
  if (etiqueta === q) return 1000;
  if (etiqueta.startsWith(q)) return 800;
  if (modulo.palabras.includes(q)) return 600 - Math.min(modulo.palabras.indexOf(q), 120);
  const palabras = q.split(/\s+/).filter(Boolean);
  if (palabras.length > 1 && palabras.every(palabra => modulo.palabras.includes(palabra))) return 450;
  return 0;
}

export function buscarModulos(consulta, modulos, limite = 8) {
  return modulos
    .map(modulo => ({ modulo, puntaje: puntuarModulo(consulta, modulo) }))
    .filter(resultado => resultado.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || a.modulo.label.localeCompare(b.modulo.label, 'es'))
    .slice(0, limite)
    .map(resultado => resultado.modulo);
}

function capitalizar(texto = '') {
  const minusculas = texto.toLocaleLowerCase('es');
  return minusculas.charAt(0).toLocaleUpperCase('es') + minusculas.slice(1);
}
