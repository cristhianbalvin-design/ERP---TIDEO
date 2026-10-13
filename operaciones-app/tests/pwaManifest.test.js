import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('PWA metadata', () => {
  it('declares the installable standalone manifest and four ERP icons', () => {
    expect(manifest).toMatchObject({ start_url: '/operaciones/', scope: '/operaciones/', display: 'standalone' });
    expect(manifest.icons).toHaveLength(4);
    expect(manifest.icons.filter(icon => icon.purpose === 'any')).toHaveLength(2);
    expect(manifest.icons.filter(icon => icon.purpose === 'maskable')).toHaveLength(2);
  });
  it('links the Vite base manifest and enables safe-area viewport layout', () => {
    expect(html).toContain('href="%BASE_URL%manifest.webmanifest"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
  });
});
