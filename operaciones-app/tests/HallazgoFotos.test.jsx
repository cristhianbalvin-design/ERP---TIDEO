import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ actualizarFotoHallazgo: vi.fn(), borrarFotoHallazgo: vi.fn(), listarFotosHallazgos: vi.fn(), subirFotoHallazgo: vi.fn() }));
vi.mock('../src/services/diagnosticoHallazgoFotosService.js', () => api);
import HallazgoFotos from '../src/zahory-mock/pages/HallazgoFotos.jsx';

const foto = { id: 'f1', signedUrl: 'https://signed/f1', ruta_storage: 'e/d/h/f1.jpg', leyenda: 'Bomba', excluir_del_informe: false };
const getText = node => node?.children?.map(child => typeof child === 'string' ? child : getText(child)).join('') || '';
let renderer;
const render = async props => { await act(async () => { renderer = create(<HallazgoFotos empresaId="e" diagnosticoId="d" hallazgo={{ id: 'h' }} {...props} />); await Promise.resolve(); }); };
beforeEach(() => { vi.clearAllMocks(); api.actualizarFotoHallazgo.mockImplementation(async values => values); api.borrarFotoHallazgo.mockResolvedValue({ huerfana: false }); });

describe('HallazgoFotos', () => {
  it('deshabilita agregar cuando el hallazgo no tiene id', async () => {
    await render({ hallazgo: {} });
    expect(getText(renderer.root)).toContain('Guarda el hallazgo para agregar fotos');
    expect(renderer.root.findAllByType('input').filter(input => input.props.type === 'file')).toHaveLength(0);
    renderer.unmount();
  });

  it('deshabilita el input con tres fotos', async () => {
    await render({ fotos: [foto, { ...foto, id: 'f2' }, { ...foto, id: 'f3' }] });
    expect(renderer.root.findAllByType('input').find(input => input.props.type === 'file').props.disabled).toBe(true);
    renderer.unmount();
  });

  it('en solo lectura conserva leyenda y checkbox, oculta subir y quitar; checkbox invierte exclusión', async () => {
    await render({ fotos: [foto], readOnly: true });
    expect(renderer.root.findAllByType('input').some(input => input.props.type === 'file')).toBe(false);
    expect(renderer.root.findAllByType('button')).toHaveLength(0);
    expect(renderer.root.findAllByType('input').some(input => input.props.type === 'text' && input.props.value === 'Bomba')).toBe(true);
    const checkbox = renderer.root.findByProps({ type: 'checkbox' });
    expect(checkbox.props.checked).toBe(true);
    await act(async () => { checkbox.props.onChange({ target: { checked: false } }); await Promise.resolve(); });
    expect(api.actualizarFotoHallazgo).toHaveBeenCalledWith({ empresaId: 'e', id: 'f1', leyenda: 'Bomba', excluir_del_informe: true });
    renderer.unmount();
  });

  it('pide confirmación inline para quitar sin window.confirm', async () => {
    globalThis.window = { confirm: vi.fn() };
    await render({ fotos: [foto] });
    const quitar = renderer.root.findAllByType('button').find(button => getText(button) === 'Quitar');
    await act(async () => quitar.props.onClick());
    expect(getText(renderer.root)).toContain('¿Quitar esta foto?');
    expect(renderer.root.findAllByType('button').some(button => getText(button) === 'Confirmar')).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
    renderer.unmount();
  });
});
