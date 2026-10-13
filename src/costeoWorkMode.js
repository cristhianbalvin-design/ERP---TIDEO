export function isCosteoWorkViewport(viewport = globalThis.window) {
  if (!viewport?.matchMedia) return false;
  return viewport.matchMedia('(max-width: 1024px)').matches
    || viewport.matchMedia('(max-height: 520px)').matches;
}

export function setCosteoWorkMode(active) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  root.dataset.dxWorkMode = String(Boolean(active));
  root.dataset.dxCosteoWorkMode = String(Boolean(active));
  if (!active) delete root.dataset.dxWorkNavOpen;
  if (typeof window !== 'undefined') {
    const EventConstructor = window.CustomEvent || globalThis.CustomEvent;
    window.dispatchEvent(typeof EventConstructor === 'function'
      ? new EventConstructor('dx-costeo-work-mode', { detail: { active: Boolean(active) } })
      : { type: 'dx-costeo-work-mode', detail: { active: Boolean(active) } });
  }
}

export function mountCosteoWorkMode(onChange, viewport = globalThis.window) {
  const media = [viewport.matchMedia('(max-width: 1024px)'), viewport.matchMedia('(max-height: 520px)')];
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
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.dxWorkNavOpen = String(Boolean(open));
  }
}
