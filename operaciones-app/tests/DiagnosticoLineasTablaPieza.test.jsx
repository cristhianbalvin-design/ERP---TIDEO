import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticoLineasTabla } from '../src/zahory-mock/pages/DiagnosticoLineasTabla.jsx';

const catalogs = { familias: [{ id: 'f1', nombre: 'Ejes' }], materiales: [], tipos: [{ id: 'a1', nombre: 'Torneado' }, { id: 't1', nombre: 'Desbaste' }], cargos: [], activos: [] };
const linea = { id: 'l1', familia_trabajo_id: 'f1', actividad_id: 'a1', tarea_id: 't1', pieza_id: null, materiales: [] };
const Selector = () => null;
const render = props => {
  let renderer;
  act(() => { renderer = create(<DiagnosticoLineasTabla lines={[linea]} catalogs={catalogs} Selector={Selector} onChange={vi.fn()} onDelete={vi.fn()} onError={vi.fn()} validationErrors={{}} {...props} />); });
  return renderer;
};
const texto = node => node.findAll(item => typeof item.children?.[0] === 'string').map(item => item.children.join('')).join(' ');

describe('DiagnosticoLineasTabla · pieza por tarea (fabricación)', () => {
  it('sin piezas no muestra la columna Pieza', () => {
    const renderer = render({ canEdit: true });
    expect(renderer.root.findAll(node => node.type === 'th' && node.children.includes('Pieza'))).toHaveLength(0);
  });

  it('con piezas permite elegir la pieza de cada tarea', () => {
    const onChange = vi.fn();
    const renderer = render({ canEdit: true, onChange, piezas: [{ id: 'p1', nombre: 'Eje' }, { id: 'p2', nombre: 'Buje' }] });
    const select = renderer.root.findByProps({ 'aria-label': 'Pieza de Desbaste' });
    expect(select.findAllByType('option').map(option => option.children.join(''))).toEqual(['Todas las piezas', 'Eje', 'Buje']);
    act(() => { select.props.onChange({ target: { value: 'p2' } }); });
    expect(onChange).toHaveBeenCalledWith(linea, expect.objectContaining({ pieza_id: 'p2' }));
  });

  it('en solo lectura muestra el nombre de la pieza', () => {
    const renderer = render({ canEdit: false, lines: [{ ...linea, pieza_id: 'p1' }], piezas: [{ id: 'p1', nombre: 'Eje' }] });
    expect(texto(renderer.root)).toContain('Eje');
  });
});
