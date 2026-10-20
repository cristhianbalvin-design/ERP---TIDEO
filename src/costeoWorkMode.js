// Modo trabajo de la Hoja de Costeo: en tablet y móvil oculta el header del ERP
// y convierte la barra lateral en un cajón que se abre con el botón de menú.
// Incluye tablets en horizontal (hasta 1180 px, o pantalla táctil hasta 1366 px).
const QUERIES = ['(max-width: 1180px)', '(max-height: 520px)', '(pointer: coarse) and (max-width: 1366px)'];

export function isCosteoWorkViewport(viewport = globalThis.window) {
  if (!viewport?.matchMedia) return false;
  return QUERIES.some(query => viewport.matchMedia(query).matches);
}

export function setCosteoWorkMode(active) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (active) root.dataset.dxCosteoWorkMode = 'true';
  else { delete root.dataset.dxCosteoWorkMode; delete root.dataset.dxWorkNavOpen; }
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent('dx-costeo-work-mode', { detail: { active: Boolean(active) } }));
  }
}

export function mountCosteoWorkMode(onChange, viewport = globalThis.window) {
  if (!viewport?.matchMedia) return () => {};
  const media = QUERIES.map(query => viewport.matchMedia(query));
  const update = () => {
    const active = isCosteoWorkViewport(viewport);
    setCosteoWorkMode(active);
    onChange?.(active);
  };
  media.forEach(item => item.addEventListener?.('change', update));
  update();
  return () => {
    media.forEach(item => item.removeEventListener?.('change', update));
    setCosteoWorkMode(false);
  };
}

export function openCosteoWorkNav(open = true) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  if (open) document.documentElement.dataset.dxWorkNavOpen = 'true';
  else delete document.documentElement.dataset.dxWorkNavOpen;
}

export function toggleCosteoWorkNav() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  openCosteoWorkNav(document.documentElement.dataset.dxWorkNavOpen !== 'true');
}
