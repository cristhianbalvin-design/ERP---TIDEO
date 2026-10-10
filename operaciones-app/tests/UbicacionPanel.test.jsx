import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { UbicacionPanel } from '../src/zahory-mock/pages/UbicacionPanel.jsx';

const almacen = { id: 'a', nombre: 'Almacén norte' };
const ubicaciones = [
  { id: 'z', almacen_id: 'a', codigo: 'Z-1', nombre: 'Zona uno', tipo: 'zona', activo: true },
  { id: 'r', almacen_id: 'a', codigo: 'R-1', nombre: 'Rack uno', tipo: 'rack', padre_id: 'z', activo: true },
  { id: 'ri', almacen_id: 'a', codigo: 'R-2', nombre: 'Rack inactivo', tipo: 'rack', padre_id: 'z', activo: false },
];

describe('UbicacionPanel', () => {
  it('presenta los tipos de alta, optgroups permitidos y nota de uso', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<UbicacionPanel almacen={almacen} ubicaciones={ubicaciones} onClose={vi.fn()} onSave={vi.fn()} />); });
    expect(root.root.findByProps({ role: 'dialog' }).props['aria-modal']).toBe('true');
    expect(root.root.findAllByProps({ role: 'radio' }).map(node => node.children.join(''))).toEqual(['Zona', 'Rack', 'Posición', 'Piso']);
    await act(async () => root.root.findAllByProps({ role: 'radio' })[2].props.onClick());
    const padre = root.root.findByProps({ id: 'ubi-padre' });
    expect(padre.findAllByType('optgroup').map(item => item.props.label)).toEqual(['Racks', 'Zonas (posición sin rack)']);
    expect(padre.findAllByType('option').some(option => option.children.join('').includes('Rack inactivo'))).toBe(false);
    expect(root.root.findAll(node => node.children?.join('').includes('no cambia la disponibilidad del stock'))).toHaveLength(1);
  });

  it('permite editar uso, código y nombre, y muestra error del servidor sin cerrar', async () => {
    const onSave = vi.fn().mockRejectedValue(Object.assign(new Error('duplicado'), { code: '23505' }));
    let root;
    await act(async () => { root = TestRenderer.create(<UbicacionPanel almacen={almacen} ubicaciones={ubicaciones} ubicacion={ubicaciones[0]} onClose={vi.fn()} onSave={onSave} />); });
    expect(root.root.findAll(node => node.children?.join('') === 'El tipo y la ubicación padre no se cambian una vez creada.')).toHaveLength(1);
    await act(async () => root.root.findByProps({ id: 'ubi-codigo' }).props.onChange({ target: { value: 'Z-1A' } }));
    await act(async () => root.root.findByProps({ id: 'ubi-nombre' }).props.onChange({ target: { value: 'Zona editada' } }));
    await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'Z-1A', nombre: 'Zona editada', uso: 'almacenaje' }));
    expect(root.root.findByProps({ role: 'alert' }).children.join('')).toBe('Ya existe una ubicación con ese código en este almacén.');
    expect(root.root.findByProps({ role: 'dialog' })).toBeTruthy();
  });
});
