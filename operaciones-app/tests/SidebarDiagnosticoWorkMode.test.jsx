import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/context.jsx', () => ({ useApp: () => ({ empresa: { id: 'empresa' }, authUser: {}, leads: [], oportunidades: [] }) }));
vi.mock('../../src/context/AsistenteErpContext.jsx', () => ({ useAsistenteErp: () => ({ solicitarApertura: vi.fn() }) }));
vi.mock('../../src/services/navLabelsService.js', () => ({ useTenantNavLabels: () => ({ getLabel: (_key, fallback) => fallback, getSectionLabel: (_key, fallback) => fallback }) }));

import { Sidebar } from '../../src/shell.jsx';

afterEach(() => vi.unstubAllGlobals());

describe('Sidebar raíz durante el modo de trabajo del diagnóstico', () => {
  it('se repliega al riel, restaura la preferencia y no la persiste', async () => {
    const listeners = new Map();
    const localStorage = { getItem: vi.fn(key => key === 'tideo_sidebar_collapsed' ? 'false' : null), setItem: vi.fn() };
    const document = { documentElement: { dataset: {} } };
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const window = {
      matchMedia: vi.fn(() => media),
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(name => listeners.delete(name)),
      innerWidth: 1440,
    };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);

    let renderer;
    await act(async () => { renderer = create(<Sidebar active="dashboard" role={{ permisos: { todo: true } }} onNav={() => {}} />); });
    const sidebar = () => renderer.root.findByType('aside');
    expect(sidebar().props.className).toBe('sidebar ');
    expect(window.addEventListener).toHaveBeenCalledWith('dx-diagnostico-work-mode', expect.any(Function));

    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: true } }));
    expect(sidebar().props.className).toBe('sidebar collapsed diagnostico-work-mode');
    expect(localStorage.setItem.mock.calls.filter(([key]) => key === 'tideo_sidebar_collapsed')).toEqual([]);

    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: false } }));
    expect(sidebar().props.className).toBe('sidebar ');
    expect(localStorage.setItem.mock.calls.filter(([key]) => key === 'tideo_sidebar_collapsed')).toEqual([]);

    document.documentElement.dataset.dxDiagnosticoWorkMode = 'true';
    await act(async () => { renderer.unmount(); renderer = create(<Sidebar active="dashboard" role={{ permisos: { todo: true } }} onNav={() => {}} />); });
    expect(sidebar().props.className).toBe('sidebar collapsed diagnostico-work-mode');
    await act(async () => { renderer.unmount(); });
  });
});
