export function setWorkMode(active) {
  const value = Boolean(active);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.dxWorkMode = String(value);
    document.documentElement.dataset.dxDiagnosticoWorkMode = String(value);
  }
  if (typeof window !== 'undefined') {
    for (const name of ['dx-work-mode', 'dx-diagnostico-work-mode']) {
      const event = typeof CustomEvent === 'function' ? new CustomEvent(name, { detail: { active: value } }) : { type: name, detail: { active: value } };
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
