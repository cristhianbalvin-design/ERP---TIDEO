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
  it('mantiene abierto el sheet ante pointerdown dentro del composedPath y cierra fuera', () => {
    const listeners = new Map();
    const previousDocument = globalThis.document;
    const fakeDocument = { addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: name => listeners.delete(name) };
    globalThis.document = fakeDocument;
    const rootNode = { contains: () => false };
    const menuNode = {};
    let tree;
    try {
      act(() => { tree = create(<BuscadorCatalogo label="Causa probable" options={[{ codigo: 'fatiga', etiqueta: 'Fatiga' }]} value="" onSelect={() => {}} />, { createNodeMock: element => element.type === 'div' && element.props.className?.includes('dx-buscador-catalogo') ? rootNode : element.props.className === 'dx-tipo-dano-menu' ? menuNode : null }); });
      act(() => tree.root.findByProps({ role: 'combobox' }).props.onFocus({ currentTarget: { getBoundingClientRect: () => ({ top: 10, bottom: 40 }) } }));
      act(() => listeners.get('pointerdown')({ target: {}, composedPath: () => [menuNode, rootNode] }));
      expect(tree.root.findByProps({ role: 'listbox' })).toBeTruthy();
      act(() => listeners.get('pointerdown')({ target: {}, composedPath: () => [{}] }));
      expect(tree.root.findAllByProps({ role: 'listbox' })).toHaveLength(0);
    } finally {
      act(() => tree?.unmount());
      globalThis.document = previousDocument;
    }
  });

  it('filtra opciones al escribir en el input de busqueda del sheet', () => {
    let tree;
    const options = [{ codigo: 'fatiga', etiqueta: 'Fatiga' }, { codigo: 'impacto', etiqueta: 'Impacto' }];
    const search = (items, query) => ({ items: items.filter(item => item.etiqueta.toLowerCase().includes(query.toLowerCase())), exacta: false });
    act(() => { tree = create(<BuscadorCatalogo label="Causa probable" options={options} value="" onSelect={() => {}} search={search} />); });
    act(() => tree.root.findByProps({ role: 'combobox' }).props.onFocus({ currentTarget: { getBoundingClientRect: () => ({ top: 10, bottom: 40 }) } }));
    act(() => tree.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'impacto' } }));
    expect(tree.root.findAllByProps({ role: 'option' })).toHaveLength(1);
    expect(tree.root.findByProps({ role: 'option' }).props.children).toContain('Impacto');
    act(() => tree.unmount());
  });

  it('expone la acción accesible para limpiar la selección', () => {
    const onSelect = vi.fn();
    let tree;
    act(() => { tree = create(<BuscadorCatalogo label="Causa probable" options={[{ codigo: 'fatiga', etiqueta: 'Fatiga' }]} value="fatiga" onSelect={onSelect} clearable />); });
    act(() => tree.root.findByProps({ 'aria-label': 'Limpiar Causa probable' }).props.onClick());
    expect(onSelect).toHaveBeenCalledWith(null, null);
  });
});
