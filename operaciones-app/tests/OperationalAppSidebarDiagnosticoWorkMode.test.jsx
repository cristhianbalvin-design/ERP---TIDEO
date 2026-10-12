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

describe('sidebar de Operaciones en modo de trabajo del diagnóstico', () => {
  it('inicia desde el dataset, escucha el evento y expone iconos con tooltip accesible', async () => {
    const listeners = new Map();
    const document = { documentElement: { dataset: { dxDiagnosticoWorkMode: 'true' } } };
    const window = {
      location: { hash: '#/diagnostico-tecnico' },
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(name => listeners.delete(name)),
    };
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);
    let renderer;
    await act(async () => { renderer = create(<OperationalApp />); });
    const sidebar = () => renderer.root.findByType('aside');
    expect(sidebar().props.className).toContain('is-diagnostico-rail');
    const navItem = renderer.root.findAll(node => node.type === 'button' && node.props.title === 'Diagnóstico técnico')[0];
    expect(navItem.props.title).toBe('Diagnóstico técnico');
    expect(navItem.props['aria-label']).toBe('Diagnóstico técnico');
    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: false } }));
    expect(sidebar().props.className).not.toContain('is-diagnostico-rail');
    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: true } }));
    expect(sidebar().props.className).toContain('is-diagnostico-rail');
    await act(async () => renderer.unmount());
  });
});
