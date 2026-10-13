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
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
  api.actualizarFotoHallazgo.mockImplementation(async values => values);
  api.borrarFotoHallazgo.mockResolvedValue({ huerfana: false });
});

describe('HallazgoFotos', () => {
  it('permite agregar fotos a un hallazgo nuevo y muestra la nota de guardado', async () => {
    await render({ hallazgo: {} });
    expect(getText(renderer.root)).toContain('Las fotos se subirán al guardar el hallazgo.');
    expect(getText(renderer.root)).not.toContain('Guarda el hallazgo para agregar fotos');
    expect(renderer.root.findAllByType('input').filter(input => input.props.type === 'file')).toHaveLength(1);
    renderer.unmount();
  });

  it('envía la foto seleccionada como pendiente cuando el hallazgo no tiene id', async () => {
    const onFotosPendientesChange = vi.fn();
    await render({ hallazgo: {}, onFotosPendientesChange });
    const input = renderer.root.findAllByType('input').find(node => node.props.type === 'file');
    const file = new File(['imagen'], 'foto.jpg', { type: 'image/jpeg' });
    await act(async () => input.props.onChange({ target: { files: [file], value: 'foto.jpg' }, currentTarget: { blur() {} } }));
    expect(onFotosPendientesChange).toHaveBeenCalledTimes(1);
    expect(onFotosPendientesChange.mock.calls[0][0][0].archivo).toBe(file);
    renderer.unmount();
  });

  it('en táctil muestra cámara y galería con atributos de selección adecuados', async () => {
    window.matchMedia.mockReturnValue({ matches: true });
    await render({ hallazgo: {} });
    const inputs = renderer.root.findAllByType('input').filter(input => input.props.type === 'file');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].props['aria-label']).toBe('Tomar foto del hallazgo');
    expect(inputs[0].props.capture).toBe('environment');
    expect(inputs[0].props.accept).toBe('image/*');
    expect(inputs[0].props.multiple).toBeUndefined();
    expect(inputs[1].props['aria-label']).toBe('Agregar fotos al hallazgo');
    expect(inputs[1].props.multiple).toBe(true);
    renderer.unmount();
  });

  it('en escritorio muestra un solo input para agregar fotos', async () => {
    await render({ hallazgo: {} });
    expect(renderer.root.findAllByType('input').filter(input => input.props.type === 'file')).toHaveLength(1);
    renderer.unmount();
  });

  it('deshabilita el input con tres fotos', async () => {
    await render({ fotos: [foto, { ...foto, id: 'f2' }, { ...foto, id: 'f3' }] });
    expect(renderer.root.findAllByType('input').find(input => input.props.type === 'file').props.disabled).toBe(true);
    renderer.unmount();
  });

  it('en solo lectura conserva la vista previa y bloquea cambios de leyenda e inclusión', async () => {
    await render({ fotos: [foto], readOnly: true });
    expect(renderer.root.findAllByType('input').some(input => input.props.type === 'file')).toBe(false);
    expect(renderer.root.findAllByType('button').every(button => button.props.className === 'dx-foto-preview-trigger')).toBe(true);
    expect(renderer.root.findAllByType('input').some(input => input.props.type === 'text' && input.props.value === 'Bomba')).toBe(true);
    const checkbox = renderer.root.findByProps({ type: 'checkbox' });
    expect(checkbox.props.checked).toBe(true);
    expect(checkbox.props.disabled).toBe(true);
    expect(renderer.root.findAllByType('input').find(input => input.props.type === 'text').props.disabled).toBe(true);
    expect(api.actualizarFotoHallazgo).not.toHaveBeenCalled();
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
