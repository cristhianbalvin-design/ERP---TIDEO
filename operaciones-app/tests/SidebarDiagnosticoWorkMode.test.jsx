import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../src/zahory-mock/components/shell.jsx';

afterEach(() => vi.unstubAllGlobals());

describe('Sidebar durante el modo de trabajo del diagnóstico', () => {
  it('se repliega al riel sin cambiar la preferencia guardada', async () => {
    const listeners = new Map();
    const localStorage = { getItem: vi.fn(() => 'false'), setItem: vi.fn() };
    const document = { documentElement: { dataset: {}, style: { setProperty: vi.fn() } } };
    const window = {
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(name => listeners.delete(name)),
    };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);

    let renderer;
    await act(async () => { renderer = create(<Sidebar current="dashboard" role="admin" onNav={() => {}} />); });
    expect(renderer.root.findByType('aside').props.className).toBe('sidebar');
    expect(window.addEventListener).toHaveBeenCalledWith('dx-diagnostico-work-mode', expect.any(Function));

    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: true } }));
    expect(renderer.root.findByType('aside').props.className).toBe('sidebar collapsed');
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).toHaveBeenCalledWith('difesmaq_sidebar_collapsed', 'false');

    await act(async () => listeners.get('dx-diagnostico-work-mode')({ detail: { active: false } }));
    expect(renderer.root.findByType('aside').props.className).toBe('sidebar');
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });
});
