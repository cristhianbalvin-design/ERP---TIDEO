import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient.js', () => ({ isSupabaseConfigured: () => false }));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => ({}) }));
vi.mock('../src/OperationalHeader.jsx', () => ({ OperationalHeader: () => null }));
vi.mock('../src/zahory-mock/ZahoryScreenHost.jsx', () => ({ ZahoryScreenHost: () => null }));
vi.mock('../src/zahory-mock/ZahoryRoutes.jsx', () => ({ availableZahoryRoutes: new Set(['diagnostico-tecnico']) }));
vi.mock('../src/zahory-mock/components/shell.jsx', () => ({ Icon: () => <i /> }));
vi.mock('../src/zahory-mock/navigation.js', () => ({
  findAreaForRoute: () => null,
  findGroupForRoute: () => null,
  getZahoryNavigation: () => [{ id: 'area', label: 'Área', type: 'flat', items: [{ id: 'diagnostico-tecnico', label: 'Diagnóstico técnico', icon: 'report' }] }],
  itemMatchesRoute: (item, route) => item.id === route,
}));

import { OperationalApp } from '../src/OperationalApp.jsx';

afterEach(() => { vi.unstubAllGlobals(); });

describe('navegación compacta de trabajo', () => {
  const mountApp = async compact => {
    const listeners = new Map();
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('window', {
      location: { hash: '#/diagnostico-tecnico' },
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(name => listeners.delete(name)),
      matchMedia: vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    let renderer;
    await act(async () => { renderer = create(<OperationalApp />); });
    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: true } }));
    return { listeners, renderer };
  };

  it('dx-open-nav abre el cajón cuando workCompact es true', async () => {
    const { listeners, renderer } = await mountApp(true);
    await act(async () => listeners.get('dx-open-nav')());
    expect(renderer.root.findByType('aside').props.className).toContain('is-open');
    await act(async () => renderer.unmount());
  });

  it('dx-open-nav no abre el cajón cuando workCompact es false', async () => {
    const { listeners, renderer } = await mountApp(false);
    await act(async () => listeners.get('dx-open-nav')?.());
    expect(renderer.root.findByType('aside').props.className).not.toContain('is-open');
    await act(async () => renderer.unmount());
  });
});
