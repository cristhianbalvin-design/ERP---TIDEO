import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  emitirDiagnosticoTecnico: vi.fn(), reabrirDiagnosticoTecnico: vi.fn(), listarHistorialEstadosDiagnostico: vi.fn(),
}));
vi.mock('../src/services/diagnosticoTecnicoService.js', () => service);
import { DiagnosticoEstadoPanel } from '../src/zahory-mock/pages/DiagnosticoEstadoPanel.jsx';

const textOf = node => node?.children?.map(child => typeof child === 'string' ? child : textOf(child)).join('') || '';
const button = (root, label) => root.findAllByType('button').find(item => textOf(item).trim() === label);
let renderer;
const render = async (props = {}) => act(async () => {
  renderer = create(<DiagnosticoEstadoPanel empresaId="empresa" diagnostico={{ id: 'd1', estado: 'borrador' }} puedeAprobar permiteEscritura cambiosSinGuardar={false} onCambioCompleto={vi.fn()} {...props} />);
  await Promise.resolve();
});

beforeEach(() => {
  service.emitirDiagnosticoTecnico.mockReset().mockResolvedValue({});
  service.reabrirDiagnosticoTecnico.mockReset().mockResolvedValue({});
  service.listarHistorialEstadosDiagnostico.mockReset().mockResolvedValue([]);
});
afterEach(() => { renderer?.unmount(); renderer = null; });

describe('DiagnosticoEstadoPanel', () => {
  it('muestra botones solo a aprobadores con escritura y según el estado', async () => {
    await render();
    expect(button(renderer.root, 'Emitir diagnóstico')).toBeTruthy();
    expect(renderer.root.findByProps({ className: 'diagnostico-estado-actions dx-action-bar' })).toBeTruthy();
    await act(async () => { renderer.unmount(); });
    await render({ puedeAprobar: false });
    expect(button(renderer.root, 'Emitir diagnóstico')).toBeFalsy();
    await act(async () => { renderer.unmount(); });
    await render({ diagnostico: { id: 'd1', estado: 'emitido' } });
    expect(button(renderer.root, 'Reabrir diagnóstico')).toBeTruthy();
    await act(async () => { renderer.unmount(); });
    await render({ diagnostico: { id: 'd1', estado: 'emitido' }, permiteEscritura: false });
    expect(button(renderer.root, 'Reabrir diagnóstico')).toBeFalsy();
  });

  it('coloca el botón opcional del informe en la misma barra de acciones', async () => {
    await render({ diagnostico: { id: 'd1', estado: 'emitido' }, informeAction: <button type="button">Informe al cliente</button> });
    const actions = renderer.root.findByProps({ className: 'diagnostico-estado-actions dx-action-bar' });
    expect(actions.findAllByType('button').map(textOf)).toEqual(['Reabrir diagnóstico', 'Informe al cliente']);
  });

  it('bloquea emisión con cambios pendientes y explica por qué', async () => {
    await render({ cambiosSinGuardar: true });
    expect(button(renderer.root, 'Emitir diagnóstico').props.disabled).toBe(true);
    expect(textOf(renderer.root)).toContain('Guarda los cambios antes de emitir');
  });

  it('confirma la emisión una sola vez, refresca datos y devuelve al padre', async () => {
    const onCambioCompleto = vi.fn().mockResolvedValue(undefined);
    await render({ onCambioCompleto });
    await act(async () => { button(renderer.root, 'Emitir diagnóstico').props.onClick(); });
    const confirm = button(renderer.root, 'Confirmar emisión');
    await act(async () => { confirm.props.onClick(); confirm.props.onClick(); await Promise.resolve(); });
    expect(service.emitirDiagnosticoTecnico).toHaveBeenCalledTimes(1);
    expect(onCambioCompleto).toHaveBeenCalledTimes(1);
    expect(textOf(renderer.root)).toContain('Historial de estados');
  });

  it('exige motivo de al menos diez caracteres recortados para reabrir', async () => {
    await render({ diagnostico: { id: 'd1', estado: 'emitido' } });
    await act(async () => { button(renderer.root, 'Reabrir diagnóstico').props.onClick(); });
    const confirm = button(renderer.root, 'Confirmar reapertura');
    expect(confirm.props.disabled).toBe(true);
    const field = renderer.root.findByProps({ id: 'diagnostico-reapertura-motivo' });
    await act(async () => { field.props.onChange({ target: { value: '  abcdefghij  ' } }); });
    expect(button(renderer.root, 'Confirmar reapertura').props.disabled).toBe(false);
    await act(async () => { button(renderer.root, 'Confirmar reapertura').props.onClick(); await Promise.resolve(); });
    expect(service.reabrirDiagnosticoTecnico).toHaveBeenCalledWith('d1', 'abcdefghij');
  });

  it('enfoca el motivo al abrir el diálogo de reapertura', async () => {
    await render({ diagnostico: { id: 'd1', estado: 'emitido' } });
    await act(async () => { button(renderer.root, 'Reabrir diagnóstico').props.onClick(); });
    expect(renderer.root.findByProps({ id: 'diagnostico-reapertura-motivo' }).props.autoFocus).toBe(true);
  });

  it('cierra el diálogo de reapertura con Escape', async () => {
    await render({ diagnostico: { id: 'd1', estado: 'emitido' } });
    await act(async () => { button(renderer.root, 'Reabrir diagnóstico').props.onClick(); });
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    await act(async () => { dialog.props.onKeyDown({ key: 'Escape' }); });
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
  });

  it.each([
    [{ code: '42501', message: 'permission denied' }, 'No tienes permiso para emitir el diagnóstico.'],
    [{ code: '22023', message: 'Solo se puede emitir un borrador' }, 'Solo se puede emitir un borrador'],
    [{ code: 'P0002', message: 'no data found' }, 'El diagnóstico ya no existe.'],
  ])('mapea el error %s a un mensaje claro', async (failure, message) => {
      service.emitirDiagnosticoTecnico.mockRejectedValue(Object.assign(new Error(failure.message), { code: failure.code }));
      await render();
      await act(async () => { button(renderer.root, 'Emitir diagnóstico').props.onClick(); });
      await act(async () => { button(renderer.root, 'Confirmar emisión').props.onClick(); await Promise.resolve(); });
      expect(textOf(renderer.root)).toContain(message);
  });

  it('muestra el historial descendente y el estado vacío sin inferir emisiones previas', async () => {
    service.listarHistorialEstadosDiagnostico.mockResolvedValueOnce([
      { id: 'h1', estado_anterior: 'emitido', estado_nuevo: 'borrador', usuario_nombre: 'Usuario ····abcd', motivo: 'Corrección solicitada', ocurrido_en: '2025-01-01T12:00:00Z' },
      { id: 'h2', estado_anterior: 'borrador', estado_nuevo: 'emitido', usuario_nombre: 'Usuario ····1234', ocurrido_en: '2024-12-01T12:00:00Z' },
    ]);
    await render();
    const historyToggle = renderer.root.findByProps({ className: 'diagnostico-estado-history-toggle' });
    expect(historyToggle.props['aria-expanded']).toBe(false);
    await act(async () => { historyToggle.props.onClick(); });
    expect(textOf(renderer.root)).toContain('Emitido → Borrador');
    expect(textOf(renderer.root)).toContain('Borrador → Emitido');
    expect(textOf(renderer.root)).toContain('Corrección solicitada');
    await act(async () => { renderer.unmount(); });
    service.listarHistorialEstadosDiagnostico.mockResolvedValueOnce([]);
    await render();
    await act(async () => { renderer.root.findByProps({ className: 'diagnostico-estado-history-toggle' }).props.onClick(); });
    expect(textOf(renderer.root)).toContain('Sin movimientos registrados.');
  });
});
