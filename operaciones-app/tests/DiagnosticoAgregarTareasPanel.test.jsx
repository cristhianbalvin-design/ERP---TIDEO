import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => supabase }));

import { listarPlantillasActividad, listarUsoTareasPorEmpresa } from '../src/services/diagnosticoTecnicoService.js';
import { DiagnosticoAgregarTareasPanel } from '../src/zahory-mock/pages/DiagnosticoAgregarTareasPanel.jsx';

const tipos = [
  { id: 'act-a', nombre: 'Inspección', codigo: 'ACT' },
  { id: 't-1', nombre: 'Cambio filtro', codigo: 'F-01' },
  { id: 't-2', nombre: 'Ajuste bomba', codigo: 'B-02' },
  ...Array.from({ length: 21 }, (_, i) => ({ id: `t-${i + 3}`, nombre: `Tarea ${i + 3}`, codigo: `C-${i + 3}` })),
];
const plantillas = [
  { actividad_id: 'act-a', tarea_id: 't-1', cargo_id: 'cargo-1', orden: 0 },
  { actividad_id: 'act-a', tarea_id: 't-2', cargo_id: null, orden: 1 },
];
const familia = { id: 'fam-1', nombre: 'Motor' };
let renderer;
const allText = node => node?.children?.map(child => typeof child === 'string' ? child : allText(child)).join('') || '';
const buttons = () => renderer.root.findAllByType('button');
const buttonText = value => buttons().find(button => allText(button).trim() === value);
const renderPanel = (overrides = {}) => create(<DiagnosticoAgregarTareasPanel familia={familia} tipos={tipos} plantillas={plantillas} uso={{ 't-1': 2, 't-2': 8 }} actividadId="act-a" lineas={[]} onClose={vi.fn()} onAdd={vi.fn()} onApplyTemplate={vi.fn()} {...overrides} />);

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
  it('filtra por nombre y código, y las píldoras filtran por uso, actividad y tareas existentes', async () => {
    renderer = renderPanel();
    const search = renderer.root.findByProps({ id: 'dx-panel-search' });
    await act(async () => { search.props.onChange({ target: { value: 'b-02' } }); });
    expect(allText(renderer.root)).toContain('Ajuste bomba');
    expect(allText(renderer.root)).not.toContain('Cambio filtro');
    await act(async () => { search.props.onChange({ target: { value: '' } }); buttonText('Más usadas').props.onClick(); });
    const rows = renderer.root.findAll(node => node.props.className?.includes('dx-panel-row'));
    expect(allText(rows[0])).toContain('Ajuste bomba');
    await act(async () => { buttonText('De la actividad').props.onClick(); });
    expect(allText(renderer.root)).toContain('Cambio filtro');
    expect(allText(renderer.root)).not.toContain('Tarea 3');
    await act(async () => { buttonText('Ya en el diagnóstico').props.onClick(); });
    expect(allText(renderer.root)).toContain('Sin coincidencias');
  });

  it('deshabilita De la actividad sin actividad y muestra solo tareas ya presentes en el grupo', async () => {
    renderer = renderPanel({ actividadId: null, lineas: [{ tarea_id: 't-2' }] });
    expect(buttonText('De la actividad').props.disabled).toBe(true);
    await act(async () => { buttonText('Ya en el diagnóstico').props.onClick(); });
    expect(allText(renderer.root)).toContain('Ajuste bomba');
    const checkbox = renderer.root.findAllByType('input').find(input => input.props.type === 'checkbox');
    expect(checkbox.props.disabled).toBe(true);
    expect(allText(renderer.root)).toContain('Ya agregada');
  });

  it('limita a 20 filas, selecciona y cuenta, y deshabilita Agregar en cero', async () => {
    renderer = renderPanel();
    expect(renderer.root.findAll(node => node.props.className?.includes('dx-panel-row'))).toHaveLength(20);
    expect(allText(renderer.root)).toContain('Mostrando las primeras 20 de');
    expect(buttonText('Agregar 0 tareas').props.disabled).toBe(true);
    const checkbox = renderer.root.findAllByType('input').find(input => input.props.type === 'checkbox');
    await act(async () => { checkbox.props.onChange(); });
    expect(allText(renderer.root)).toContain('1 seleccionadas');
    expect(buttonText('Agregar 1 tareas').props.disabled).toBe(false);
  });

  it('aplicar plantilla omite las tareas que ya existen', async () => {
    const apply = vi.fn();
    renderer = renderPanel({ lineas: [{ tarea_id: 't-1' }], onApplyTemplate: apply });
    await act(async () => { buttonText('Aplicar').props.onClick(); });
    expect(apply).toHaveBeenCalledWith([{ actividad_id: 'act-a', tarea_id: 't-2', cargo_id: null, orden: 1 }], 'act-a');
    expect(allText(renderer.root)).toContain('2 tareas');
    expect(allText(renderer.root)).toContain('sin horas, las ingresas tú');
  });

  it('muestra avisos no bloqueantes cuando fallan las cargas de plantillas y uso', () => {
    renderer = renderPanel({ plantillaError: true, usoError: true, plantillas: [], uso: {} });
    expect(allText(renderer.root)).toContain('No se pudieron cargar plantillas');
    expect(allText(renderer.root)).toContain('No se pudieron cargar uso');
    expect(renderer.root.findByProps({ id: 'dx-panel-search' })).toBeTruthy();
  });

  it('cierra con Escape, overlay y Cancelar', async () => {
    const close = vi.fn();
    renderer = renderPanel({ onClose: close });
    const overlay = renderer.root.findByProps({ className: 'dx-panel-overlay' });
    await act(async () => { overlay.props.onMouseDown({ target: {}, currentTarget: {} }); });
    expect(close).not.toHaveBeenCalled();
    await act(async () => { overlay.props.onMouseDown({ target: overlay, currentTarget: overlay }); });
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => { buttonText('Cancelar').props.onClick(); });
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => { windowListeners.get('keydown')?.({ key: 'Escape', stopPropagation: vi.fn() }); });
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('lee plantillas por empresa en orden de actividad y orden', async () => {
    const calls = [];
    const data = [{ actividad_id: 'act-a', tarea_id: 't-1', cargo_id: null, orden: 0 }];
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
      ['select', 'actividad_id,tarea_id,cargo_id,orden'],
      ['eq', 'empresa_id', 'empresa-1'],
      ['order', 'actividad_id'],
      ['order', 'orden'],
    ]);
  });

  it('acumula uso paginando el servicio en bloques de mil', async () => {
    const calls = [];
    supabase.from.mockImplementation(table => {
      const query = { table, offset: 0, select() { return this; }, eq() { return this; }, range(start, end) { this.offset = start; calls.push([start, end]); return this; }, then(resolve, reject) {
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
