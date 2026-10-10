import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: false },
  cargar: vi.fn(), cargarMateriales: vi.fn(), crear: vi.fn(), actualizar: vi.fn(), cambiarEstado: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/ubicacionesService.js', () => ({ cargarMapaUbicaciones: mocks.cargar, cargarMaterialesPorIds: mocks.cargarMateriales, crearUbicacion: mocks.crear, actualizarUbicacion: mocks.actualizar, cambiarEstadoUbicacion: mocks.cambiarEstado }));
import { UbicacionesPage } from '../src/zahory-mock/pages/UbicacionesPage.jsx';
import { UbicacionPanel } from '../src/zahory-mock/pages/UbicacionPanel.jsx';

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
    mocks.cargarMateriales.mockReset().mockResolvedValue([]);
    mocks.crear.mockReset().mockResolvedValue({}); mocks.actualizar.mockReset().mockResolvedValue({}); mocks.cambiarEstado.mockReset().mockResolvedValue({});
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  });

  it('carga permiso inventario/ver antes de mostrar la vista y preselecciona el primer almacén', async () => {
    const root = await renderPage();
    expect(mocks.rpc).toHaveBeenCalledWith('usuario_puede', { target_empresa_id: 'e1', target_pantalla: 'inventario', target_accion: 'ver' });
    expect(root.root.findByType('h1').children.join('')).toBe('Ubicaciones');
    expect(root.root.findAllByProps({ role: 'tab' })[0].props['aria-selected']).toBe(true);
    expect(root.root.findAllByType('div').filter(node => node.props.className === 'dx-ui-row dx-ubicaciones-cols')).toHaveLength(3);
    expect(root.root.findAllByProps({ role: 'button' })).toHaveLength(3);
    expect(root.root.findAllByProps({ role: 'button' })[0].props['aria-label']).toBe('Abrir General');
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

  it('combina uso e inactivas, abre detalle accesible y conserva filtros al volver', async () => {
    const conInactiva = { ...datos, ubicaciones: [...datos.ubicaciones, { id: 'off', almacen_id: 'a1', codigo: 'OFF', nombre: 'Piso revisión', tipo: 'piso', uso: 'cuarentena', activo: false }] };
    mocks.cargar.mockResolvedValue(conInactiva);
    const root = await renderPage();
    const filtro = root.root.findByProps({ 'aria-label': 'Filtrar por uso' });
    await act(async () => filtro.props.onChange({ target: { value: 'cuarentena' } }));
    expect(root.root.findAllByProps({ role: 'button' })).toHaveLength(0);
    const interruptor = root.root.findByProps({ role: 'switch' });
    expect(interruptor.props['aria-checked']).toBe(false);
    await act(async () => interruptor.props.onClick());
    const filas = root.root.findAllByProps({ role: 'button' });
    expect(filas).toHaveLength(1);
    await act(async () => filas[0].props.onClick());
    expect(root.root.findAll(node => node.children?.join('').includes('Stock almacenado directamente aquí'))).toHaveLength(1);
    const volver = root.root.findAllByType('button').find(button => button.children.join('').includes('Volver a ubicaciones'));
    await act(async () => volver.props.onClick());
    expect(root.root.findByProps({ 'aria-label': 'Filtrar por uso' }).props.value).toBe('cuarentena');
    expect(root.root.findByProps({ role: 'switch' }).props['aria-checked']).toBe(true);
  });

  it('solo ofrece alta cuando inventario/crear y la sesión permiten escribir', async () => {
    mocks.sesion = { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: true };
    mocks.rpc.mockImplementation((_name, args) => Promise.resolve({ data: args.target_accion !== 'crear', error: null }));
    const root = await renderPage();
    expect(root.root.findAllByType('button').some(button => button.children.join('').includes('Nueva ubicación'))).toBe(false);
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

  it('después de guardar no repite usuario_puede ni muestra carga de permisos, conserva el foco en Editar', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    const raiz = await renderPage();
    await act(async () => raiz.root.findByProps({ 'aria-label': 'Abrir Zona uno' }).props.onClick());
    const control = { isConnected: true, focus: vi.fn() };
    vi.stubGlobal('document', { activeElement: control, contains: vi.fn(() => true) });
    try {
      await act(async () => raiz.root.findAllByType('button').find(button => button.children.join('') === 'Editar').props.onClick());
      const totalRpc = mocks.rpc.mock.calls.length;
      await act(async () => raiz.root.findByType(UbicacionPanel).props.onSave({ modo: 'editar', id: 'z1', codigo: 'Z-1', nombre: 'Zona uno', uso: 'almacenaje' }));
      await act(async () => new Promise(resolve => globalThis.setTimeout(resolve, 5)));
      expect(mocks.rpc).toHaveBeenCalledTimes(totalRpc);
      expect(raiz.root.findAll(node => node.children?.join('').includes('Cargando permisos de inventario'))).toHaveLength(0);
      expect(raiz.root.findByType('h1').children.join('')).toBe('Zona uno');
      expect(control.focus).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it('deja abierto el diálogo y muestra el error de la base al fallar DESACTIVAR', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    mocks.cargar.mockResolvedValue({ ...datos, stock: [] });
    mocks.cambiarEstado.mockRejectedValueOnce(new Error('No se puede desactivar una ubicación que tiene stock.'));
    const raiz = await renderPage();
    await act(async () => raiz.root.findByProps({ 'aria-label': 'Abrir Zona uno' }).props.onClick());
    await act(async () => raiz.root.findAllByType('button').find(button => button.children.join('') === 'Desactivar').props.onClick());
    const dialogo = raiz.root.findByProps({ role: 'alertdialog' });
    await act(async () => dialogo.findAllByType('button').find(button => button.children.join('') === 'Desactivar').props.onClick());
    expect(raiz.root.findByProps({ role: 'alert' }).children.join('')).toBe('No se puede desactivar una ubicación que tiene stock.');
    expect(raiz.root.findByProps({ role: 'alertdialog' })).toBeTruthy();
    expect(raiz.root.findByType('h1').children.join('')).toBe('Zona uno');
  });

  it('muestra el error de REACTIVAR en una alerta del detalle', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    const inactiva = { id: 'off', almacen_id: 'a1', codigo: 'OFF', nombre: 'Piso revisión', tipo: 'piso', activo: false };
    mocks.cargar.mockResolvedValue({ ...datos, stock: [], ubicaciones: [...datos.ubicaciones, inactiva] });
    mocks.cambiarEstado.mockRejectedValueOnce(new Error('Fallo al reactivar desde la base'));
    const raiz = await renderPage();
    await act(async () => raiz.root.findByProps({ role: 'switch' }).props.onClick());
    await act(async () => raiz.root.findByProps({ 'aria-label': 'Abrir Piso revisión' }).props.onClick());
    await act(async () => raiz.root.findAllByType('button').find(button => button.children.join('') === 'Reactivar').props.onClick());
    expect(raiz.root.findByProps({ role: 'alert' }).children.join('')).toBe('Fallo al reactivar desde la base');
    expect(raiz.root.findByType('h1').children.join('')).toBe('Piso revisión');
  });

  it('limpia el aviso al volver al mapa', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    const raiz = await renderPage();
    await act(async () => raiz.root.findByProps({ 'aria-label': 'Abrir Zona uno' }).props.onClick());
    await act(async () => raiz.root.findAllByType('button').find(button => button.children.join('') === 'Editar').props.onClick());
    await act(async () => raiz.root.findByType(UbicacionPanel).props.onSave({ modo: 'editar', id: 'z1', codigo: 'Z-1', nombre: 'Zona uno', uso: 'almacenaje' }));
    expect(raiz.root.findByProps({ role: 'status' }).children.join('')).toBe('Cambios guardados.');
    await act(async () => raiz.root.findAllByType('button').find(button => button.children.join('').includes('Volver a ubicaciones')).props.onClick());
    expect(raiz.root.findAllByProps({ role: 'status' })).toHaveLength(0);
  });

  it('limpia el aviso automáticamente a los seis segundos con temporizadores simulados', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    vi.useFakeTimers();
    try {
      const raiz = await renderPage();
      await act(async () => raiz.root.findByProps({ 'aria-label': 'Abrir Zona uno' }).props.onClick());
      await act(async () => raiz.root.findAllByType('button').find(button => button.children.join('') === 'Editar').props.onClick());
      await act(async () => raiz.root.findByType(UbicacionPanel).props.onSave({ modo: 'editar', id: 'z1', codigo: 'Z-1', nombre: 'Zona uno', uso: 'almacenaje' }));
      expect(raiz.root.findByProps({ role: 'status' })).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(5999); });
      expect(raiz.root.findAllByProps({ role: 'status' })).toHaveLength(1);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(raiz.root.findAllByProps({ role: 'status' })).toHaveLength(0);
      raiz.unmount();
    } finally { vi.useRealTimers(); }
  });

  it('renderiza Editar y Desactivar en el encabezado, fuera de la tarjeta', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    mocks.cargar.mockResolvedValue({ ...datos, stock: [] });
    const raiz = await renderPage();
    await act(async () => raiz.root.findByProps({ 'aria-label': 'Abrir Zona uno' }).props.onClick());
    const encabezado = raiz.root.findAllByType('header').find(header => header.props.className.includes('dx-ui-head-page'));
    const tarjeta = raiz.root.findAll(node => node.props.className === 'dx-ui-card')[0];
    expect(encabezado.findAllByType('button').map(button => button.children.join(''))).toEqual(['Editar', 'Desactivar']);
    expect(tarjeta.findAllByType('button').some(button => ['Editar', 'Desactivar', 'Reactivar'].includes(button.children.join('')))).toBe(false);
  });
});
