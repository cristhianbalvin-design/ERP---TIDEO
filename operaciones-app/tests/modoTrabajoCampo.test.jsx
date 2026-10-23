import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORK_BACK_LABEL, WORK_COMPACT_QUERY, setWorkMode } from '../src/workMode.js';
import { useCompactWorkMode } from '../src/useCompactWorkMode.js';
import { WorkDrawerFooter } from '../src/WorkDrawerFooter.jsx';
import { syncZahoryHostWorkCompact } from '../src/zahory-mock/ZahoryScreenHost.jsx';

afterEach(() => { vi.unstubAllGlobals(); });

const stubEntorno = matches => {
  const listeners = new Map();
  const events = [];
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('window', {
    addEventListener: vi.fn((name, fn) => listeners.set(name, fn)),
    removeEventListener: vi.fn(name => listeners.delete(name)),
    dispatchEvent: event => events.push(event),
    matchMedia: vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  return { listeners, events };
};

function Pantalla(props) {
  useCompactWorkMode(true, props.options);
  return null;
}

describe('modo trabajo de las pantallas de campo', () => {
  it('la regla compacta incluye tablet como en la Hoja de Costeo', () => {
    expect(WORK_COMPACT_QUERY).toContain('(max-width: 1180px)');
    expect(WORK_COMPACT_QUERY).toContain('(pointer: coarse) and (max-width: 1366px)');
  });

  it('setWorkMode conserva «Volver a la bandeja» por defecto y permite ocultarlo', () => {
    const { events } = stubEntorno(true);
    setWorkMode(true);
    expect(document.documentElement.dataset.dxWorkBack).toBe(DEFAULT_WORK_BACK_LABEL);
    setWorkMode(true, { backLabel: null });
    expect(document.documentElement.dataset.dxWorkBack).toBe('');
    expect(events.at(-1).detail).toEqual({ active: true, backLabel: '' });
  });

  it('en tablet/celular activa el modo, atiende «volver» y lo apaga al salir', async () => {
    const { listeners } = stubEntorno(true);
    const onBack = vi.fn();
    let renderer;
    await act(async () => { renderer = create(<Pantalla options={{ backLabel: 'Volver a partes diarios', onBack }} />); });
    expect(window.matchMedia).toHaveBeenCalledWith(WORK_COMPACT_QUERY);
    expect(document.documentElement.dataset).toMatchObject({ dxWorkMode: 'true', dxWorkBack: 'Volver a partes diarios' });
    listeners.get('dx-work-back')();
    expect(onBack).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
    expect(document.documentElement.dataset.dxWorkMode).toBe('false');
    expect(listeners.has('dx-work-back')).toBe(false);
  });

  it('en escritorio no activa el modo trabajo', async () => {
    stubEntorno(false);
    let renderer;
    await act(async () => { renderer = create(<Pantalla />); });
    expect(document.documentElement.dataset.dxWorkMode).toBe('false');
    await act(async () => renderer.unmount());
  });

  it('copia data-dx-work-compact al host del shadow root', () => {
    const attrs = new Map();
    const host = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
    syncZahoryHostWorkCompact(host, { dataset: { dxWorkCompact: 'true' } });
    expect(attrs.has('data-work-compact')).toBe(true);
    syncZahoryHostWorkCompact(host, { dataset: { dxWorkCompact: 'false' } });
    expect(attrs.has('data-work-compact')).toBe(false);
  });
});

describe('WorkDrawerFooter', () => {
  const montar = props => {
    let renderer;
    act(() => { renderer = create(<WorkDrawerFooter empresaNombre="PRUEBA" email="cristhian@tideo.tech" avatarText="CR" {...props} />); });
    return renderer;
  };
  const texto = node => (typeof node === 'string' || typeof node === 'number') ? String(node) : (node?.children || []).map(texto).join('');
  const boton = (renderer, buscado) => renderer.root.findAll(n => n.type === 'button' && texto(n).includes(buscado))[0];

  it('muestra no leídas, abre la lista y marca todas', () => {
    const onMarkRead = vi.fn();
    const renderer = montar({ notificaciones: [{ id: 'n1', text: 'OT asignada', read: false }, { id: 'n2', text: 'Vieja', read: true }], onMarkRead });
    expect(renderer.root.findByProps({ className: 'dx-wdf-badge' }).props.children).toBe(1);
    act(() => boton(renderer, 'Notificaciones').props.onClick());
    expect(renderer.root.findAll(n => n.type === 'button' && /^dx-wdf-noti( |$)/.test(n.props.className || '')).length).toBe(2);
    act(() => boton(renderer, 'Marcar todas').props.onClick());
    expect(onMarkRead).toHaveBeenCalledWith();
  });

  it('cambia el tema y cierra sesión', () => {
    const onToggleDark = vi.fn();
    const onSignOut = vi.fn();
    const renderer = montar({ onToggleDark, onSignOut });
    act(() => boton(renderer, 'Modo oscuro').props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': 'Cerrar sesión' }).props.onClick());
    expect(onToggleDark).toHaveBeenCalled();
    expect(onSignOut).toHaveBeenCalled();
  });
});
