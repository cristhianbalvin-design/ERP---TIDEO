import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ObservationField from '../src/zahory-mock/components/ObservationField.jsx';

const mocks = vi.hoisted(() => ({ transcribirAudio: vi.fn(), iniciarGrabacion: vi.fn() }));
vi.mock('../src/services/transcribirAudio.js', () => ({ transcribirAudio: mocks.transcribirAudio }));
vi.mock('../src/zahory-mock/utils/grabadorAudio.js', () => ({ iniciarGrabacion: mocks.iniciarGrabacion }));

describe('ObservationField dictation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: function MediaRecorder() {} });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: vi.fn() } } });
  });
  it('muestra grabando/transcribiendo e inserta la transcripción al final', async () => {
    const stop = vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }));
    mocks.iniciarGrabacion.mockResolvedValue({ stop, cancel: vi.fn() });
    mocks.transcribirAudio.mockResolvedValue('Cambiar el retén');
    const onChange = vi.fn();
    let tree;
    act(() => { tree = create(<ObservationField item={{ _key: 'h1', observacion: 'Revisar cilindro' }} diagnosticoId="dt_1" disabled={false} onChange={onChange} />); });
    await act(async () => { await tree.root.findByProps({ 'aria-label': 'Dictar observaciones' }).props.onClick(); });
    expect(tree.root.findByProps({ 'aria-pressed': true })).toBeTruthy();
    await act(async () => { await tree.root.findByProps({ 'aria-label': 'Detener dictado' }).props.onClick(); });
    expect(onChange).toHaveBeenCalledWith('Revisar cilindro. Cambiar el retén');
  });
  it('conserva el audio y permite un reintento cuando falla la transcripción', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    mocks.iniciarGrabacion.mockResolvedValue({ stop: vi.fn().mockResolvedValue(blob), cancel: vi.fn() });
    mocks.transcribirAudio.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce('Texto recuperado');
    const onChange = vi.fn();
    let tree;
    act(() => { tree = create(<ObservationField item={{ _key: 'h2', observacion: 'Texto previo' }} diagnosticoId="dt_1" disabled={false} onChange={onChange} />); });
    await act(async () => { await tree.root.findByProps({ 'aria-label': 'Dictar observaciones' }).props.onClick(); });
    await act(async () => { await tree.root.findByProps({ 'aria-label': 'Detener dictado' }).props.onClick(); });
    expect(tree.root.findByProps({ children: 'Reintentar' })).toBeTruthy();
    await act(async () => { await tree.root.findByProps({ children: 'Reintentar' }).props.onClick(); });
    expect(onChange).toHaveBeenCalledWith('Texto previo. Texto recuperado');
  });
});
