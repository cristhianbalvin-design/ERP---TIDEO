import { describe, expect, it } from 'vitest';
import { transform } from 'esbuild';
import fs from 'node:fs';
import {
  observeZahoryHostTheme,
  syncZahoryHostTheme,
  transformShadowZahoryStyles,
} from '../src/zahory-mock/ZahoryScreenHost.jsx';

describe('ZahoryScreenHost CSS transform', () => {
  it('conserva variables en Shadow DOM con CSS minificado y no minificado', async () => {
    const minified = ':root{--navy-2:#253759}[data-theme=dark]{--navy-2:#1e293b}[data-theme="dark"] .diagnostico-modal-card .alert-warning{color:#fed7aa}';
    const formatted = ":root { --navy-2: #253759; } [data-theme='dark'] { --navy-2: #1e293b; } [data-theme=dark] .diagnostico-modal-card .alert-warning { color: #fed7aa; }";
    for (const css of [minified, formatted]) {
      const transformed = transformShadowZahoryStyles(css);
      expect(transformed).toContain(':host');
      expect(transformed).toContain(':host([data-theme="dark"])');
      expect(transformed).not.toContain(':root');
    }

    const sourceCss = fs.readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    const { code: realCssMinified } = await transform(sourceCss, { loader: 'css', minify: true });
    const realCss = transformShadowZahoryStyles(realCssMinified);
    expect(realCss).toContain(':host {');
    expect(realCss).toMatch(/:host\(\[data-theme="dark"\]\)\s*\{/);
    expect(realCss).not.toMatch(/:root\s*\{/);
  });
});

describe('ZahoryScreenHost theme bridge', () => {
  it('aplica el estado inicial, reacciona a dark y limpia al desmontar', () => {
    const host = {
      attrs: new Map(),
      setAttribute(name, value) { this.attrs.set(name, value); },
      removeAttribute(name) { this.attrs.delete(name); },
    };
    const documentElement = {
      classList: {
        values: new Set(),
        contains(name) { return this.values.has(name); },
      },
    };
    const observers = [];
    const previousObserver = globalThis.MutationObserver;
    globalThis.MutationObserver = class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    };
    try {
      syncZahoryHostTheme(host, documentElement);
      expect(host.attrs.has('data-theme')).toBe(false);
      documentElement.classList.values.add('dark');
      const cleanup = observeZahoryHostTheme(host, documentElement);
      expect(host.attrs.get('data-theme')).toBe('dark');
      observers[0].callback();
      expect(host.attrs.get('data-theme')).toBe('dark');
      cleanup();
      expect(observers[0].disconnected).toBe(true);
      expect(host.attrs.has('data-theme')).toBe(false);
    } finally {
      globalThis.MutationObserver = previousObserver;
    }
  });
});
