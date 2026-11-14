import { describe, expect, it } from 'vitest';
import { buscarModulos, construirGruposMenu, grupoDeRuta, itemActivo, modulosBuscables } from '../src/menuLateralLogic.js';
import { getZahoryNavigation } from '../src/zahory-mock/navigation.js';
import { availableZahoryRoutes } from '../src/zahory-mock/ZahoryRoutes.jsx';

const grupos = construirGruposMenu(getZahoryNavigation(availableZahoryRoutes));

describe('menú lateral de Operaciones', () => {
  it('arma Inicio primero y un grupo de la franja por cada grupo del árbol', () => {
    expect(grupos[0].key).toBe('inicio');
    expect(grupos[0].items.map(item => item.id)).toEqual(expect.arrayContaining(['inicio', 'dashboard', 'mis-ots-hoy']));
    expect(grupos.map(grupo => grupo.key)).toEqual(expect.arrayContaining(['flota-alquileres', 'ordenes-trabajo', 'almacen', 'config-grp']));
    expect(grupos.every(grupo => grupo.icon && grupo.pantallas.length > 0)).toBe(true);
  });

  it('ya no repite Órdenes ni Actividad: la Bandeja de OTs y Partes Taller viven en Órdenes de Trabajo', () => {
    const ids = grupos.flatMap(grupo => grupo.pantallas.map(item => item.id));
    expect(ids).not.toContain('ordenes');
    expect(ids).not.toContain('actividad');
    expect(ids.filter(id => id === 'ots')).toHaveLength(1);
    expect(grupoDeRuta(grupos, 'ots')).toBe('ordenes-trabajo');
    const partes = grupos.find(grupo => grupo.key === 'ordenes-trabajo').items.find(item => item.label === 'Partes Taller');
    expect(partes.id).toBe('partes-taller');
    expect(itemActivo(partes, 'crear-parte-taller')).toBe(true);
    expect(itemActivo(partes, 'taller')).toBe(true);
  });

  it('el buscador encuentra pantallas sin tildes y con su sección', () => {
    const modulos = modulosBuscables(grupos);
    const [primero] = buscarModulos('bandeja de ots', modulos);
    expect(primero.id).toBe('ots');
    expect(primero.seccion).toMatch(/Órdenes de Trabajo/);
    expect(buscarModulos('liquidacion', modulos)[0].id).toBe('liquidacion');
    expect(buscarModulos('zzz', modulos)).toEqual([]);
  });

  it('descarta divisores sin pantallas debajo', () => {
    const [, grupo] = construirGruposMenu([{ id: 'z', label: 'ZONA', type: 'business-lines', groups: [{ id: 'g', label: 'G', items: [], tailItems: [{ type: 'divider', label: 'Vacío' }, { type: 'divider', label: 'Con algo' }, { id: 'x', label: 'X' }] }] }]);
    expect(grupo.cola.map(item => item.label)).toEqual(['Con algo', 'X']);
  });
});
