import { describe, expect, it } from 'vitest';
import { transform } from 'esbuild';
import fs from 'node:fs';
import { transformShadowZahoryStyles } from '../src/zahory-mock/ZahoryScreenHost.jsx';

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
