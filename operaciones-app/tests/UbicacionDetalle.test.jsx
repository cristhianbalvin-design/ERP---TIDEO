import React from 'react';
import TestRenderer from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { UbicacionDetalle } from '../src/zahory-mock/pages/UbicacionDetalle.jsx';

const datos = {
  ubicacion: { id: 'z', almacen_id: 'a', codigo: 'Z-1', nombre: 'Zona uno', tipo: 'zona', activo: true },
  almacen: { id: 'a', nombre: 'Almacén norte' },
  ubicaciones: [{ id: 'z', almacen_id: 'a', codigo: 'Z-1', nombre: 'Zona uno', tipo: 'zona', activo: true }, { id: 'p', almacen_id: 'a', codigo: 'P-1', nombre: 'Piso', tipo: 'piso', padre_id: 'z', activo: false }],
  stock: [{ almacen_id: 'a', ubicacion_id: 'z', material_id: 'm1', lote: 'L-01', fisico: 2 }, { almacen_id: 'a', ubicacion_id: 'p', material_id: 'm1', fisico: 3 }],
  materiales: [{ id: 'm1', codigo: 'MAT-1', descripcion: 'Material genérico' }], puedeEditar: true,
  onBack: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn(),
};

describe('UbicacionDetalle', () => {
  it('muestra agregados jerárquicos, stock propio con nombre/código y sub-ubicación inactiva', () => {
    const root = TestRenderer.create(<UbicacionDetalle {...datos} />).root;
    expect(root.findAll(node => node.children?.join('') === '5').length).toBeGreaterThan(0);
    expect(root.findAll(node => node.children?.join('') === 'Material genérico')).toHaveLength(1);
    expect(root.findAll(node => node.children?.join('') === 'MAT-1')).toHaveLength(1);
    expect(root.findByProps({ 'aria-label': 'Abrir Piso' }).props.role).toBe('button');
    expect(root.findAll(node => node.children?.includes('Inactiva'))).toHaveLength(1);
  });

  it('muestra el motivo dentro de la tarjeta y deja las acciones fuera del detalle', () => {
    const root = TestRenderer.create(<UbicacionDetalle {...datos} motivoNoDesactivar="Tiene stock: no se puede desactivar" />).root;
    expect(root.findByProps({ id: 'dx-ubicaciones-motivo' }).children.join('')).toContain('Tiene stock: no se puede desactivar');
    expect(root.findAllByType('button').some(button => ['Editar', 'Desactivar', 'Reactivar'].includes(button.children.join('')))).toBe(false);
  });

  it('muestra el error de reactivación en una alerta antes de la tarjeta', () => {
    const root = TestRenderer.create(<UbicacionDetalle {...datos} errorAccion="No se pudo reactivar" />).root;
    expect(root.findByProps({ role: 'alert' }).children.join('')).toBe('No se pudo reactivar');
    expect(root.findAll(node => node.props.className === 'dx-ui-card')).toHaveLength(1);
  });

  it('no renderiza acciones para la ubicación General', () => {
    const general = { ...datos.ubicacion, es_general: true, activo: true };
    const root = TestRenderer.create(<UbicacionDetalle {...datos} ubicacion={general} stock={[]} />).root;
    expect(root.findAllByType('button').some(button => ['Editar', 'Desactivar', 'Reactivar'].includes(button.children.join('')))).toBe(false);
  });
});
