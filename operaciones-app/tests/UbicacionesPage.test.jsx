import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: false },
  cargar: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/ubicacionesService.js', () => ({ cargarMapaUbicaciones: mocks.cargar }));
import { UbicacionesPage } from '../src/zahory-mock/pages/UbicacionesPage.jsx';

const datos = {
  almacenes: [{ id: 'a1', nombre: 'Almacén Norte' }, { id: 'a2', nombre: 'Almacén Sur' }, { id: 'a3', nombre: 'Almacén Este' }],
  ubicaciones: [
    { id: 'g1', almacen_id: 'a1', codigo: 'GEN', nombre: 'General', tipo: 'general', es_general: true, activo: true },
    { id: 'z1', almacen_id: 'a1', codigo: 'Z-1', nombre: 'Zona uno', tipo: 'zona', activo: true },
    { id: 'p1', almacen_id: 'a1', codigo: 'P-1', nombre: 'Posición uno', tipo: 'posicion', padre_id: 'z1', activo: true },
    { id: 'g2', almacen_id: 'a2', codigo: 'GEN', nombre: 'General', tipo: 'general', es_general: true, activo: true },
  ],
  stock: [
    { almacen_id: 'a1', ubicacion_id: 'g1', material_id: 'm1', fisico: 2 },
    { almacen_id: 'a1', ubicacion_id: 'p1', material_id: 'm1', fisico: 3 },
    { almacen_id: 'a1', ubicacion_id: 'p1', material_id: 'm2', fisico: 4 },
  ],
};

async function renderPage() {
  let root;
  await act(async () => { root = TestRenderer.create(<UbicacionesPage />); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return root;
}

describe('UbicacionesPage', () => {
  beforeEach(() => {
    mocks.sesion = { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: false };
    mocks.cargar.mockReset().mockResolvedValue(datos);
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  });

  it('carga permiso inventario/ver antes de mostrar la vista y preselecciona el primer almacén', async () => {
    const root = await renderPage();
    expect(mocks.rpc).toHaveBeenCalledWith('usuario_puede', { target_empresa_id: 'e1', target_pantalla: 'inventario', target_accion: 'ver' });
    expect(root.root.findByType('h1').children.join('')).toBe('Ubicaciones');
    expect(root.root.findAllByProps({ role: 'tab' })[0].props['aria-selected']).toBe(true);
    expect(root.root.findAllByType('div').filter(node => node.props.className === 'dx-ui-row dx-ubicaciones-cols')).toHaveLength(3);
    expect(root.root.findAllByProps({ role: 'button' })).toHaveLength(0);
  });

  it('muestra permisos cargando hasta resolver el RPC', async () => {
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    const root = await renderPage();
    expect(root.root.findAll(node => node.children?.join('').includes('Cargando permisos de inventario'))).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('').includes('No tienes permiso'))).toHaveLength(0);
    expect(mocks.cargar).not.toHaveBeenCalled();
  });

  it('presenta el error de permiso con reintento y luego carga el mapa', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Fallo de permisos') });
    const root = await renderPage();
    expect(root.root.findByProps({ role: 'alert' }).children.join('')).toBe('Fallo de permisos');
    await act(async () => { root.root.findAllByType('button').find(button => button.children.join('') === 'Reintentar').props.onClick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(root.root.findByType('h1').children.join('')).toBe('Ubicaciones');
  });

  it('busca por código o nombre y mantiene la jerarquía con los ancestros', async () => {
    const root = await renderPage();
    const buscador = root.root.findByProps({ 'aria-label': 'Buscar ubicación por código o nombre' });
    await act(async () => buscador.props.onChange({ target: { value: 'Posición uno' } }));
    expect(root.root.findAllByType('div').filter(node => node.props.className === 'dx-ui-row dx-ubicaciones-cols')).toHaveLength(2);
    expect(root.root.findAll(node => node.children?.join('') === 'Zona uno')).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('') === 'General')).toHaveLength(0);
  });

  it('permite seleccionar otro almacén, muestra General en a2 y estado vacío en a3', async () => {
    const root = await renderPage();
    await act(async () => root.root.findAllByProps({ role: 'tab' })[1].props.onClick());
    expect(root.root.findAllByProps({ role: 'tab' })[1].props['aria-selected']).toBe(true);
    expect(root.root.findAllByType('div').filter(node => node.props.className === 'dx-ui-row dx-ubicaciones-cols')).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('') === 'General')).toHaveLength(1);
    await act(async () => root.root.findAllByProps({ role: 'tab' })[2].props.onClick());
    expect(root.root.findAllByProps({ role: 'tab' })[2].props['aria-selected']).toBe(true);
    expect(root.root.findAll(node => node.children?.join('') === 'Este almacén no tiene ubicaciones activas.')).toHaveLength(1);
  });

  it('muestra estado sin almacenes y estado sin resultados de búsqueda', async () => {
    mocks.cargar.mockResolvedValueOnce({ almacenes: [], ubicaciones: [], stock: [] });
    const sinAlmacenes = await renderPage();
    expect(sinAlmacenes.root.findAll(node => node.children?.join('') === 'No hay almacenes activos.')).toHaveLength(1);
    const root = await renderPage();
    await act(async () => root.root.findByProps({ 'aria-label': 'Buscar ubicación por código o nombre' }).props.onChange({ target: { value: 'sin coincidencia' } }));
    expect(root.root.findAll(node => node.children?.join('') === 'Sin coincidencias para tu búsqueda.')).toHaveLength(1);
    expect(root.root.findAllByType('div').filter(node => node.props.className === 'dx-ui-row dx-ubicaciones-cols')).toHaveLength(0);
  });

  it('muestra error de lectura con alerta y permite reintentar', async () => {
    mocks.cargar.mockRejectedValueOnce(new Error('Fallo de lectura'));
    const root = await renderPage();
    expect(root.root.findByProps({ role: 'alert' }).children.join('')).toBe('Fallo de lectura');
    await act(async () => { root.root.findAllByType('button').find(button => button.children.join('') === 'Reintentar').props.onClick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(root.root.findByType('h1').children.join('')).toBe('Ubicaciones');
  });

  it('muestra estado sin empresa y sin permiso', async () => {
    mocks.sesion = { empresaId: null, estado: 'sin_empresa', cargando: false };
    const sinEmpresa = await renderPage();
    expect(sinEmpresa.root.findAll(node => node.children?.join('').includes('acceso a una empresa'))).toHaveLength(1);
    mocks.sesion = { empresaId: 'e1', estado: 'listo', cargando: false };
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const sinPermiso = await renderPage();
    expect(sinPermiso.root.findAll(node => node.children?.join('').includes('No tienes permiso para ver ubicaciones.'))).toHaveLength(1);
  });
});
