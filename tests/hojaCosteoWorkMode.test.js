import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountCosteoWorkMode } from '../src/costeoWorkMode.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const wizard = readFileSync(new URL('../src/pages_hoja_costeo_wizard.jsx', import.meta.url), 'utf8');
const context = readFileSync(new URL('../src/context.jsx', import.meta.url), 'utf8');

describe('modo de trabajo de Hoja de Costeo', () => {
  afterEach(() => { delete globalThis.document; });

  it('se activa al montar en tablet y se desactiva al desmontar', () => {
    const listeners = new Map();
    const width = { matches: true, addEventListener: vi.fn((_, cb) => listeners.set('width', cb)), removeEventListener: vi.fn() };
    const height = { matches: false, addEventListener: vi.fn((_, cb) => listeners.set('height', cb)), removeEventListener: vi.fn() };
    globalThis.document = { documentElement: { dataset: {} } };
    const onChange = vi.fn();
    const unmount = mountCosteoWorkMode(onChange, { matchMedia: query => query.includes('width') ? width : height });
    expect(document.documentElement.dataset.dxWorkMode).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith(true);
    width.matches = false;
    listeners.get('width')();
    expect(document.documentElement.dataset.dxWorkMode).toBe('false');
    expect(onChange).toHaveBeenLastCalledWith(false);
    unmount();
    expect(document.documentElement.dataset.dxWorkMode).toBe('false');
    expect(width.removeEventListener).toHaveBeenCalledTimes(1);
    expect(height.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('define una sección a 100dvh, scroll interior único y barra final de una fila', () => {
    expect(styles).toContain('html[data-dx-work-mode="true"] .app-shell { height: 100dvh');
    expect(styles).toContain('html[data-dx-work-mode="true"] .main { min-width: 0; height: 100%; min-height: 0; padding: 0; overflow: hidden');
    expect(styles).toContain('html[data-dx-work-mode="true"] .hcw-root { width: 100%; height: 100dvh');
    expect(styles).toContain('html[data-dx-work-mode="true"] .hcw-scroll { min-height: 0; flex: 1 1 auto; overflow-y: auto; overflow-x: hidden');
    expect(styles).toContain('html[data-dx-work-mode="true"] .hcw-action-bar { min-height: 58px; flex: 0 0 auto; display: flex; flex-wrap: nowrap');
    expect(wizard.indexOf('<div className="hcw-scroll">')).toBeLessThan(wizard.indexOf('<footer className="hcw-action-bar"'));
    expect(wizard).toMatch(/<footer className="hcw-action-bar"[\s\S]*?<\/footer>\s*<\/section>/);
  });

  it('el regreso usa la navegación raíz, que reemplaza el hash y no agrega entradas', () => {
    expect(wizard).toContain("navigate('hoja_costeo');");
    expect(wizard).toContain("window.addEventListener('popstate', manejarPopState)");
    expect(context).toContain("window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hashPage}`)");
    expect(context).not.toContain('window.history.pushState');
  });
});
