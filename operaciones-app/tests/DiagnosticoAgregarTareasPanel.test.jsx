import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => supabase }));

import { listarPlantillasActividad, listarUsoTareasPorEmpresa } from '../src/services/diagnosticoTecnicoService.js';
import { DiagnosticoAgregarTareasPanel } from '../src/zahory-mock/pages/DiagnosticoAgregarTareasPanel.jsx';

const familias = [{ id: 'fam-1', nombre: 'Motor' }];
const tipos = [
  { id: 'act-a', nombre: 'Inspección', codigo: 'ACT', rol: 'actividad', familia_trabajo_id: 'fam-1' },
  { id: 't-1', nombre: 'Cambio filtro', codigo: 'F-01', rol: 'tarea' },
  { id: 't-2', nombre: 'Ajuste bomba', codigo: 'B-02', rol: 'tarea' },
  ...Array.from({ length: 21 }, (_, i) => ({ id: `t-${i + 3}`, nombre: `Tarea ${i + 3}`, codigo: `C-${i + 3}`, rol: 'tarea' })),
];
const plantillas = [
  { actividad_id: 'act-a', tarea_id: 't-1', cargo_id: 'cargo-1', orden: 0, horas: 1 },
  { actividad_id: 'act-a', tarea_id: 't-2', cargo_id: null, orden: 1, horas: 2 },
];
let renderer;
const text = node => node?.children?.map(child => typeof child === 'string' ? child : text(child)).join('') || '';
const buttons = () => renderer.root.findAllByType('button');
const buttonContaining = value => buttons().find(button => text(button).includes(value));
const input = label => renderer.root.findByProps({ 'aria-label': label });
const renderPanel = (overrides = {}) => create(<DiagnosticoAgregarTareasPanel
  initialFamiliaId="fam-1" familias={familias} tipos={tipos} plantillas={plantillas}
  uso={{ 't-1': 2, 't-2': 8 }} tipoDiagnostico="fabricacion"
  onClose={vi.fn()} onAdd={vi.fn()} {...overrides}
/>, { createNodeMock: element => element.type === 'input' ? { focus: vi.fn() } : null });

afterEach(() => { renderer?.unmount(); renderer = null; });
let windowListeners;
beforeEach(() => {
  windowListeners = new Map();
  globalThis.window = {
    addEventListener: (name, listener) => windowListeners.set(name, listener),
    removeEventListener: name => windowListeners.delete(name),
  };
});

describe('DiagnosticoAgregarTareasPanel', () => {
  it('muestra las familias propuestas en hallazgos con su recuento y conserva el catálogo completo', () => {
    renderer = renderPanel({ initialFamiliaId: '', familias: [...familias, { id: 'fam-2', nombre: 'Bomba' }], suggestedFamilies: [{ familia: familias[0], count: 2 }, { familia: { id: 'fam-2', nombre: 'Bomba' }, count: 1 }] });
    expect(text(renderer.root)).toContain('Propuestos en hallazgos');
    expect(text(renderer.root)).toContain('2 hallazgos');
    expect(text(renderer.root)).toContain('1 hallazgo');
    expect(renderer.root.findAllByProps({ role: 'listbox', 'aria-label': 'Trabajo o componente' })).toHaveLength(1);
  });
  it('preselecciona el trabajo y presenta la cascada Trabajo > Actividad > Tarea', () => {
    renderer = renderPanel();
    expect(text(renderer.root)).toContain('Motor');
    expect(renderer.root.findByProps({ className: 'dx-cascada-cols has-initial-family' })).toBeTruthy();
    expect(text(renderer.root)).toContain('Inspección');
    expect(renderer.root.findAll(node => node.props['aria-current'] === 'step').map(text)).toContain('2Actividad');
    expect(renderer.root.findAllByProps({ role: 'listbox', 'aria-label': 'Trabajo o componente' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ role: 'listbox', 'aria-label': 'Actividad' })).toHaveLength(1);
  });

  it('filtra actividad y tareas por nombre o código y agrega las tareas seleccionadas', async () => {
    const onAdd = vi.fn();
    renderer = renderPanel({ onAdd, plantillas: [] });
    await act(async () => { input('Buscar actividad').props.onChange({ target: { value: 'act' } }); });
    expect(text(renderer.root)).toContain('Inspección');
    await act(async () => { buttonContaining('Inspección').props.onClick(); });
    await act(async () => { input('Buscar tarea').props.onChange({ target: { value: 'b-02' } }); });
    expect(text(renderer.root)).toContain('Ajuste bomba');
    expect(text(renderer.root)).not.toContain('Cambio filtro');
    const checkbox = renderer.root.findAllByType('input').find(node => node.props.type === 'checkbox');
    await act(async () => { checkbox.props.onChange(); });
    expect(buttonContaining('Agregar a la lista').props.disabled).toBe(false);
    await act(async () => { buttonContaining('Agregar a la lista').props.onClick(); });
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({
      familia_trabajo_id: 'fam-1', actividad_id: 'act-a', tarea_id: 't-2', horas_mano_obra: 0,
    })], 0);
  });

  it('aplica la receta al seleccionar la actividad y evita duplicar tareas existentes', async () => {
    const onAdd = vi.fn();
    renderer = renderPanel({ onAdd, lineas: [{ familia_trabajo_id: 'fam-1', actividad_id: 'act-a', tarea_id: 't-1' }] });
    await act(async () => { buttonContaining('Inspección').props.onClick(); });
    expect(text(renderer.root)).toContain('Receta cargada: 2 tareas');
    expect(text(renderer.root)).toContain('Cambio filtro');
    expect(text(renderer.root)).toContain('Ajuste bomba');
    await act(async () => { buttonContaining('Agregar a la lista').props.onClick(); });
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ tarea_id: 't-2', horas_mano_obra: 2 })], 1);
  });

  it('mantiene horas de equipo deshabilitadas sin un activo propio', async () => {
    renderer = renderPanel();
    await act(async () => { buttonContaining('Inspección').props.onClick(); });
    expect(renderer.root.findAllByProps({ 'aria-label': 'Horas de equipo' }).every(field => field.props.disabled)).toBe(true);
  });

  it('cierra con Escape y Cancelar desde el panel integrado', async () => {
    const close = vi.fn();
    renderer = renderPanel({ onClose: close });
    const panel = renderer.root.findByProps({ role: 'region' });
    await act(async () => { panel.props.onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() }); });
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => { buttonContaining('Cancelar').props.onClick(); });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('lee plantillas por empresa incluyendo los valores de costo en orden estable', async () => {
    const calls = [];
    const data = [{ actividad_id: 'act-a', tarea_id: 't-1', cargo_id: null, orden: 0, horas: 1, activo_id: null, horas_maquina: 0 }];
    const query = {
      select(value) { calls.push(['select', value]); return this; },
      eq(...args) { calls.push(['eq', ...args]); return this; },
      order(value) { calls.push(['order', value]); return this; },
      then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); },
    };
    supabase.from.mockReturnValue(query);
    await expect(listarPlantillasActividad('empresa-1')).resolves.toEqual(data);
    expect(supabase.from).toHaveBeenCalledWith('plantillas_actividad');
    expect(calls).toEqual([
      ['select', 'actividad_id,tarea_id,cargo_id,orden,horas,activo_id,horas_maquina'],
      ['eq', 'empresa_id', 'empresa-1'],
      ['order', 'actividad_id'],
      ['order', 'orden'],
    ]);
  });

  it('acumula uso paginando el servicio en bloques de mil', async () => {
    const calls = [];
    supabase.from.mockImplementation(table => {
      const query = { offset: 0, select() { return this; }, eq() { return this; }, range(start, end) { this.offset = start; calls.push([start, end]); return this; }, then(resolve, reject) {
        const data = this.offset === 0 ? Array.from({ length: 1000 }, (_, i) => ({ tarea_id: i < 999 ? 't-1' : 't-2' })) : [{ tarea_id: 't-1' }, { tarea_id: 't-2' }];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      } };
      expect(table).toBe('diagnostico_tecnico_lineas');
      return query;
    });
    const result = await listarUsoTareasPorEmpresa('empresa-1');
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
    expect(result).toEqual({ 't-1': 1000, 't-2': 2 });
  });
});
