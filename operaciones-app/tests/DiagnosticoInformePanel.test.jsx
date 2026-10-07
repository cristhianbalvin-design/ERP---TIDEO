import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ obtenerOCrearBorrador: vi.fn(), obtenerInformeVigente: vi.fn(), actualizarOpciones: vi.fn(), generarConclusionIA: vi.fn(), obtenerIdentidadEmpresa: vi.fn() }));
vi.mock('../src/services/diagnosticoInformeService.js', () => ({ ...api, OPCIONES_INFORME_POR_DEFECTO: { conclusion: '', conclusion_origen: 'manual', conclusion_confirmada: false, incluir_mediciones: false, mostrar_horas: false, ocultar_conformes: false } }));
import { DiagnosticoInformePanel } from '../src/zahory-mock/pages/DiagnosticoInformePanel.jsx';

const draft = options => ({ id: 'inf-1', estado: 'borrador', opciones: { conclusion: '', conclusion_origen: 'manual', conclusion_confirmada: false, incluir_mediciones: false, mostrar_horas: false, ocultar_conformes: false, ...options } });
const diagnosis = { id: 'd1', recepcion_id: 'r1', tipo: 'mantenimiento', estado: 'emitido', hallazgos: [], lineas: [] };
let renderer;
const text = node => node?.children?.map(child => typeof child === 'string' ? child : text(child)).join('') || '';
const byLabel = label => renderer.root.findAll(node => node.type === 'label' && text(node).includes(label))[0];
const button = label => renderer.root.findAllByType('button').find(node => text(node).trim() === label);
async function render(overrides = {}) {
  await act(async () => { renderer = create(<DiagnosticoInformePanel diagnostico={diagnosis} catalogos={{}} cabecera={{}} puedeEditar onClose={vi.fn()} {...overrides} />); await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.obtenerOCrearBorrador.mockResolvedValue(draft());
  api.obtenerInformeVigente.mockResolvedValue({ borrador: draft(), emitidos: [] });
  api.actualizarOpciones.mockImplementation(async (_id, opciones) => ({ id: 'inf-1', estado: 'borrador', opciones: { ...opciones } }));
  api.generarConclusionIA.mockResolvedValue({ ok: true, conclusion: 'La bomba requiere revisión.', modelo: 'gpt-4o-mini' });
  api.obtenerIdentidadEmpresa.mockResolvedValue(null);
});

describe('DiagnosticoInformePanel', () => {
  it('solo crea borrador con edición, y usuario con ver consulta existente sin poder editar', async () => {
    await render();
    expect(api.obtenerOCrearBorrador).toHaveBeenCalledWith('r1');
    renderer.unmount(); renderer = null;
    await render({ puedeEditar: false });
    expect(api.obtenerInformeVigente).toHaveBeenCalledWith('r1');
    expect(api.obtenerOCrearBorrador).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ id: 'dx-inf-conclusion' }).props.disabled).toBe(true);
    expect(button('Guardar borrador')).toBeUndefined();
  });

  it('deshabilita confirmación con texto sin guardar y confirma con un UPDATE independiente', async () => {
    await render();
    const textarea = renderer.root.findByProps({ id: 'dx-inf-conclusion' });
    await act(async () => { textarea.props.onChange({ target: { value: 'Conclusión manual' } }); });
    const confirmation = byLabel('Revisé y confirmo la conclusión').findByType('input');
    expect(confirmation.props.disabled).toBe(true);
    await act(async () => { button('Guardar borrador').props.onClick(); await Promise.resolve(); });
    expect(api.actualizarOpciones).toHaveBeenCalledTimes(1);
    const confirmed = byLabel('Revisé y confirmo la conclusión').findByType('input');
    expect(confirmed.props.disabled).toBe(false);
    await act(async () => { confirmed.props.onChange({ target: { checked: true } }); await Promise.resolve(); });
    expect(api.actualizarOpciones).toHaveBeenCalledTimes(2);
    expect(api.actualizarOpciones.mock.calls[1][1]).toEqual(expect.objectContaining({ conclusion: 'Conclusión manual', conclusion_confirmada: true }));
  });

  it('persiste opciones al guardar y cambia origen IA a ia_editada al editar conclusión', async () => {
    api.obtenerOCrearBorrador.mockResolvedValue(draft({ conclusion: 'Texto inicial', conclusion_origen: 'ia' }));
    await render();
    const textarea = renderer.root.findByProps({ id: 'dx-inf-conclusion' });
    await act(async () => { textarea.props.onChange({ target: { value: 'Texto editado' } }); });
    const checks = renderer.root.findAllByType('input').filter(input => input.props.type === 'checkbox');
    await act(async () => { checks[0].props.onChange({ target: { checked: true } }); checks[2].props.onChange({ target: { checked: true } }); });
    await act(async () => { button('Guardar borrador').props.onClick(); await Promise.resolve(); });
    expect(api.actualizarOpciones.mock.calls[0][1]).toEqual(expect.objectContaining({ conclusion: 'Texto editado', conclusion_origen: 'ia_editada', incluir_mediciones: true, ocultar_conformes: true }));
  });

  it('genera en el textarea sin guardar y pide confirmación inline al reemplazar texto existente', async () => {
    await render();
    await act(async () => { button('Generar conclusión con IA').props.onClick(); await Promise.resolve(); });
    expect(api.generarConclusionIA).toHaveBeenCalledWith('d1');
    expect(renderer.root.findByProps({ id: 'dx-inf-conclusion' }).props.value).toBe('La bomba requiere revisión.');
    expect(renderer.root.findAllByType('small').some(node => text(node).includes('Generado por IA, requiere revisión'))).toBe(true);
    expect(api.actualizarOpciones).not.toHaveBeenCalled();
    await act(async () => { button('Generar conclusión con IA').props.onClick(); });
    expect(renderer.root.findAll(node => node.props?.['aria-label'] === 'Confirmar reemplazo de conclusión')).toHaveLength(1);
    expect(api.generarConclusionIA).toHaveBeenCalledTimes(1);
  });
});
