import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listarCatalogosHallazgos: vi.fn(),
  crearDiagnosticoHallazgo: vi.fn(),
  actualizarDiagnosticoHallazgo: vi.fn(),
  eliminarDiagnosticoHallazgo: vi.fn(),
  crearDiagnosticoMedicion: vi.fn(),
  actualizarDiagnosticoMedicion: vi.fn(),
  eliminarDiagnosticoMedicion: vi.fn(),
  crearEnlaceDiagnosticoHallazgoLinea: vi.fn(),
  eliminarEnlaceDiagnosticoHallazgoLinea: vi.fn(),
}));

vi.mock('../src/services/diagnosticoTecnicoService.js', () => mocks);

import { HallazgosTrabajoPanel } from '../src/zahory-mock/pages/HallazgosTrabajoPanel.jsx';

const catalogos = [
  { catalogo: 'tipo_dano', codigo: 'desgaste', etiqueta: 'Desgaste' },
  { catalogo: 'causa_probable', codigo: 'desgaste_normal', etiqueta: 'Desgaste normal' },
  { catalogo: 'unidad_medicion', codigo: 'mm', etiqueta: 'mm' },
];
const line = { id: 'line-1', familia_trabajo_id: 'family-1', tarea_id: 'task-1', cargo_id: 'cargo-1', horas_mano_obra: 2, horas_maquina: 1 };
const baseHallazgo = {
  id: 'hallazgo-1', familia_trabajo_id: 'family-1', componente_parte: 'Vástago', tipo_dano_codigo: 'desgaste',
  causa_probable_codigo: 'desgaste_normal', condicion: 'fuera_de_tolerancia', riesgo: 'antes_de_operar',
  prioridad_calculada: 'P1', prioridad_efectiva: 'P1', accion_recomendada: 'reparar', atribuible_a: 'desgaste_normal',
  incluir_en_informe: true, mediciones: [], lineas: [],
};
const textOf = node => node?.children?.map(child => typeof child === 'string' ? child : textOf(child)).join('') || '';

const renderPanel = async hallazgos => {
  const callbacks = {};
  let renderer;
  await act(async () => {
    renderer = create(<HallazgosTrabajoPanel
      empresaId="empresa-prueba"
      diagnostico={{ id: 'diagnostico-1', hallazgos }}
      lines={[line]}
      familias={[{ id: 'family-1', nombre: 'Trabajo 1' }]}
      tipos={[{ id: 'task-1', nombre: 'Tarea 1' }]}
      cargos={[{ id: 'cargo-1', nombre: 'Técnico' }]}
      canEdit
      readOnly={false}
      onRegisterSave={save => { callbacks.save = save; }}
      onDirtyChange={dirty => { callbacks.dirty = dirty; }}
      onSavingChange={saving => { callbacks.saving = saving; }}
      onError={error => { callbacks.error = error; }}
      onNotice={notice => { callbacks.notice = notice; }}
    />);
    await Promise.resolve();
  });
  return { renderer, callbacks };
};

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.listarCatalogosHallazgos.mockResolvedValue(catalogos);
});

describe('HallazgosTrabajoPanel', () => {
  it('muestra campos de hallazgo, matriz, mediciones y tareas, sin controles fuera de v1', async () => {
    const { renderer } = await renderPanel([{
      id: 'hallazgo-1', familia_trabajo_id: 'family-1', componente_parte: 'Vástago', tipo_dano_codigo: 'desgaste',
      causa_probable_codigo: 'desgaste_normal', condicion: 'fuera_de_tolerancia', riesgo: 'antes_de_operar',
      prioridad_calculada: 'P1', prioridad_efectiva: 'P1', accion_recomendada: 'reparar', atribuible_a: 'desgaste_normal',
      incluir_en_informe: true, mediciones: [], lineas: [{ id: 'link-1', linea_id: 'line-1' }],
    }]);
    const text = textOf(renderer.root);
    expect(text).toContain('Hallazgos del trabajo');
    expect(text).toContain('Condición del componente');
    expect(text).toContain('MATRIZ v1');
    expect(text).toContain('P1 · 1');
    expect(text).toContain('P2 · 0');
    expect(text).toContain('P3 · 0');
    expect(text).toContain('P4 · 0');
    expect(text).toContain('Mediciones');
    expect(text).toContain('Tareas relacionadas');
    expect(text).not.toContain('Agregar fotos');
    expect(text).not.toContain('Aplicar una actividad completa');
    expect(text).not.toContain('Repuesto');
  });

  it('permite agregar un hallazgo solo bajo un trabajo que ya tiene líneas', async () => {
    const { renderer } = await renderPanel([]);
    const add = renderer.root.findAllByType('button').find(button => button.children.join('').includes('Agregar hallazgo'));
    await act(async () => add.props.onClick());
    expect(renderer.root.findAllByType('input').some(input => input.props.value === '')).toBe(true);
    expect(textOf(renderer.root)).not.toContain('Aplicar una actividad completa');
  });

  it('guarda un hallazgo nuevo antes de sus mediciones y enlaces', async () => {
    const { renderer, callbacks } = await renderPanel([]);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('Agregar hallazgo')).props.onClick());
    const componentInput = renderer.root.findAllByType('input').find(input => input.props.value === '');
    await act(async () => componentInput.props.onChange({ target: { value: 'Vástago' } }));
    const catalogSelects = renderer.root.findAllByType('select');
    await act(async () => {
      catalogSelects[0].props.onChange({ target: { value: 'desgaste' } });
      catalogSelects[1].props.onChange({ target: { value: 'desgaste_normal' } });
    });
    mocks.crearDiagnosticoHallazgo.mockResolvedValue({ id: 'hallazgo-new', prioridad_calculada: 'P4', prioridad_efectiva: 'P4' });
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoHallazgo).toHaveBeenCalled();
    expect(mocks.crearDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(mocks.crearEnlaceDiagnosticoHallazgoLinea).not.toHaveBeenCalled();
    expect(callbacks.notice).toBe('Hallazgos guardados.');
  });

  it('no llama al servicio si faltan campos obligatorios', async () => {
    const { renderer, callbacks } = await renderPanel([]);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('Agregar hallazgo')).props.onClick());
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoHallazgo).not.toHaveBeenCalled();
    expect(callbacks.error).toContain('Completa componente');
  });

  it('valida el parámetro de cada medición y no envía la medición incompleta', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(mocks.actualizarDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(callbacks.error).toContain('Escribe el parámetro de la medición 1.');
    expect(callbacks.error).not.toContain('unidad no pertenece a empresa_id');
    expect(callbacks.notice).toContain('Guardado parcial');
  });

  it('valida la unidad de cada medición y no envía la medición incompleta', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    const measurementParam = renderer.root.findAllByType('input').find(input => input.props.value === '');
    await act(async () => measurementParam.props.onChange({ target: { value: 'Presión' } }));
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(mocks.actualizarDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(callbacks.error).toContain('Elige la unidad de la medición 1.');
    expect(callbacks.error).not.toContain('unidad no pertenece a empresa_id');
    expect(callbacks.notice).toContain('Guardado parcial');
  });

  it('expone guardado parcial y oculta el error crudo si falla una medición', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    const measurementParam = renderer.root.findAllByType('input').find(input => input.props.value === '');
    await act(async () => measurementParam.props.onChange({ target: { value: 'Presión' } }));
    const measurementUnit = renderer.root.findAllByType('select').at(-1);
    await act(async () => measurementUnit.props.onChange({ target: { value: 'mm' } }));
    mocks.actualizarDiagnosticoHallazgo.mockResolvedValue({ id: 'hallazgo-1' });
    mocks.crearDiagnosticoMedicion.mockRejectedValue(new Error('unidad no pertenece a empresa_id'));
    await act(async () => callbacks.save());
    expect(mocks.actualizarDiagnosticoHallazgo).toHaveBeenCalled();
    expect(mocks.crearDiagnosticoMedicion).toHaveBeenCalled();
    expect(callbacks.error).toContain('Guardado parcial');
    expect(callbacks.error).not.toContain('unidad no pertenece a empresa_id');
  });
});
