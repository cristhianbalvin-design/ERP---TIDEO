// Pantallas donde el modo trabajo usa el cajón: celular, tablet (vertical u horizontal)
// y pantallas táctiles hasta 1366 px. Es la misma regla que la Hoja de Costeo del ERP.
export const WORK_COMPACT_QUERY = '(max-width: 1180px), (max-height: 520px), (pointer: coarse) and (max-width: 1366px)';
export const DEFAULT_WORK_BACK_LABEL = 'Volver a la bandeja';

// backLabel: texto del botón «←» del cajón; null lo oculta (pantallas que ya son una bandeja).
export function setWorkMode(active, { backLabel = DEFAULT_WORK_BACK_LABEL } = {}) {
  const value = Boolean(active);
  const back = value && backLabel ? String(backLabel) : '';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.dxWorkMode = String(value);
    document.documentElement.dataset.dxDiagnosticoWorkMode = String(value);
    document.documentElement.dataset.dxWorkBack = back;
  }
  if (typeof window !== 'undefined') {
    for (const name of ['dx-work-mode', 'dx-diagnostico-work-mode']) {
      const event = typeof CustomEvent === 'function' ? new CustomEvent(name, { detail: { active: value, backLabel: back } }) : { type: name, detail: { active: value, backLabel: back } };
      window.dispatchEvent(event);
    }
  }
}

export function openWorkNav() {
  if (typeof window !== 'undefined') {
    const EventConstructor = window.CustomEvent || globalThis.CustomEvent;
    const event = typeof EventConstructor === 'function' ? new EventConstructor('dx-open-nav') : { type: 'dx-open-nav' };
    window.dispatchEvent(event);
  }
}

export function requestWorkBack() {
  if (typeof window !== 'undefined') {
    const EventConstructor = window.CustomEvent || globalThis.CustomEvent;
    const event = typeof EventConstructor === 'function' ? new EventConstructor('dx-work-back') : { type: 'dx-work-back' };
    window.dispatchEvent(event);
  }
}
