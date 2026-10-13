import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { BuscadorCatalogo } from '../src/zahory-mock/components/BuscadorCatalogo.jsx';
import { buscarCausasProbables, agruparCausasProbables } from '../src/zahory-mock/pages/causasProbables.js';

describe('BuscadorCatalogo', () => {
  it('abre el listbox accesible, filtra y selecciona con Enter', () => {
    const onSelect = vi.fn();
    const options = [{ codigo: 'fatiga', etiqueta: 'Fatiga' }, { codigo: 'impacto', etiqueta: 'Impacto' }];
    let tree;
    act(() => { tree = create(<BuscadorCatalogo label="Causa probable" requiredKey="cause" options={options} value="" onSelect={onSelect} search={buscarCausasProbables} sections={agruparCausasProbables} />); });
    const input = tree.root.findByProps({ role: 'combobox' });
    expect(input.props['aria-expanded']).toBe(false);
    act(() => input.props.onFocus({ currentTarget: { getBoundingClientRect: () => ({ top: 10, bottom: 40 }) } }));
    expect(tree.root.findByProps({ role: 'listbox' })).toBeTruthy();
    const search = tree.root.findByProps({ type: 'search' });
    act(() => search.props.onChange({ target: { value: 'impacto' } }));
    const combo = tree.root.findByProps({ role: 'combobox' });
    act(() => combo.props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    expect(onSelect).toHaveBeenCalledWith('impacto', options[1]);
  });
  it('expone la acción accesible para limpiar la selección', () => {
    const onSelect = vi.fn();
    let tree;
    act(() => { tree = create(<BuscadorCatalogo label="Causa probable" options={[{ codigo: 'fatiga', etiqueta: 'Fatiga' }]} value="fatiga" onSelect={onSelect} clearable />); });
    act(() => tree.root.findByProps({ 'aria-label': 'Limpiar Causa probable' }).props.onClick());
    expect(onSelect).toHaveBeenCalledWith(null, null);
  });
});
