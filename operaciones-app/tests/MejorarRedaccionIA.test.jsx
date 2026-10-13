import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ mejorarRedaccion: vi.fn() }));
vi.mock('../src/services/diagnosticoInformeService.js', () => ({ mejorarRedaccion: mock.mejorarRedaccion }));
import { MejorarRedaccionIA } from '../src/zahory-mock/components/MejorarRedaccionIA.jsx';

beforeEach(() => vi.clearAllMocks());
describe('MejorarRedaccionIA', () => {
  it('oculta sin diagnóstico y deshabilita texto corto o solo lectura', () => {
    let tree;
    act(() => { tree = create(<MejorarRedaccionIA diagnosticoId={null} texto="Texto suficientemente largo." />); });
    expect(tree.toJSON()).toBeNull();
    act(() => tree.update(<MejorarRedaccionIA diagnosticoId="d1" texto="corto" />));
    expect(tree.root.findByType('button').props.disabled).toBe(true);
    act(() => tree.update(<MejorarRedaccionIA diagnosticoId="d1" texto="Texto suficientemente largo." disabled />));
    expect(tree.root.findByType('button').props.disabled).toBe(true);
    act(() => tree.unmount());
  });
  it('muestra propuesta y permite aplicar o descartar', async () => {
    mock.mejorarRedaccion.mockResolvedValue({ ok: true, texto_original: 'texto incorrecto de ejemplo', texto_mejorado: 'Texto corregido de ejemplo.', sin_cambios: false });
    const onApply = vi.fn();
    let tree;
    await act(async () => { tree = create(<MejorarRedaccionIA diagnosticoId="d1" texto="texto incorrecto de ejemplo" onApply={onApply} />); });
    await act(async () => tree.root.findByType('button').props.onClick());
    expect(tree.root.findByProps({ 'aria-label': 'Texto propuesto' })).toBeTruthy();
    const buttons = tree.root.findAllByType('button');
    await act(async () => buttons.find(button => button.children.join('') === 'Aplicar').props.onClick());
    expect(onApply).toHaveBeenCalledWith('Texto corregido de ejemplo.');
    await act(async () => tree.unmount());
    mock.mejorarRedaccion.mockResolvedValue({ ok: true, texto_original: 'texto incorrecto de ejemplo', texto_mejorado: 'Texto corregido de ejemplo.', sin_cambios: false });
    await act(async () => { tree = create(<MejorarRedaccionIA diagnosticoId="d1" texto="texto incorrecto de ejemplo" />); });
    await act(async () => tree.root.findByType('button').props.onClick());
    await act(async () => tree.root.findAllByType('button').find(button => button.children.join('') === 'Descartar').props.onClick());
    expect(tree.root.findAllByProps({ 'aria-label': 'Texto propuesto' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });
  it('presenta errores legibles', async () => {
    mock.mejorarRedaccion.mockRejectedValue(new Error('Se agotó tu cuota diaria de IA.'));
    let tree;
    await act(async () => { tree = create(<MejorarRedaccionIA diagnosticoId="d1" texto="texto incorrecto de ejemplo" />); });
    await act(async () => tree.root.findByType('button').props.onClick());
    expect(tree.root.findByProps({ role: 'alert' }).children.join('')).toContain('cuota diaria');
    await act(async () => tree.unmount());
  });
});
