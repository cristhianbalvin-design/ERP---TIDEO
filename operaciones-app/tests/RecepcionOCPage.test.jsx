import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: true },
  cargar: vi.fn(), cargarUbicaciones: vi.fn(), registrar: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/recepcionOCService.js', () => ({ cargarRecepcionesOC: mocks.cargar, cargarUbicacionesAlmacen: mocks.cargarUbicaciones, registrarRecepcionOC: mocks.registrar }));
import { RecepcionOCPage } from '../src/zahory-mock/pages/RecepcionOCPage.jsx';

const filas = { ordenes: [{ id: 'oc1', codigo: 'OC-1', proveedor_id: 'p1', estado: 'emitida', porcentaje_recibido: 0, fecha_emision: '2026-10-01', items: [{ item_id: 'it1', material_id: 'm1', descripcion: 'Filtro genérico', codigo: 'MAT-1', cantidad: 2, unidad: 'und' }] }], almacenes: [{ id: 'a1', nombre: 'Almacén central' }], recepciones: [], proveedores: [{ id: 'p1', razon_social: 'Proveedor genérico' }] };

async function renderPage() {
  let root;
  await act(async () => { root = TestRenderer.create(<RecepcionOCPage />); await Promise.resolve(); await Promise.resolve(); });
  return root;
}

describe('RecepcionOCPage', () => {
  beforeEach(() => {
    mocks.sesion = { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: true };
    mocks.cargar.mockReset().mockResolvedValue(filas);
    mocks.cargarUbicaciones.mockReset().mockResolvedValue([{ id: 'u1', codigo: 'GEN', nombre: 'General', es_general: true, activo: true }]);
    mocks.registrar.mockReset().mockResolvedValue({ recepcion_id: 'r1', movimientos: 1 });
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  });
  it('renderiza la lista y abre el detalle desde una fila accesible', async () => {
    const root = await renderPage();
    expect(root.root.findAllByProps({ role: 'button' })[0].props['aria-label']).toBe('Abrir OC-1');
    await act(async () => { root.root.findAllByProps({ role: 'button' })[0].props.onClick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(root.root.findByType('h1').children.join('')).toContain('Recepción OC-1');
  });
  it('deshabilita registrar si la cantidad supera el pendiente y si el total es cero', async () => {
    const root = await renderPage();
    await act(async () => root.root.findAllByProps({ role: 'button' })[0].props.onClick());
    const cantidad = root.root.findByProps({ 'aria-label': 'Cantidad a recibir de Filtro genérico' });
    await act(async () => cantidad.props.onChange({ target: { value: '3' } }));
    expect(root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar recepción').props.disabled).toBe(true);
    await act(async () => cantidad.props.onChange({ target: { value: '0' } }));
    expect(root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar recepción').props.disabled).toBe(true);
  });
  it('registra el payload esperado y queda en modo solo lectura sin permiso', async () => {
    const root = await renderPage();
    await act(async () => root.root.findAllByProps({ role: 'button' })[0].props.onClick());
    await act(async () => root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar recepción').props.onClick());
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'e1', ordenCompraId: 'oc1', almacenId: 'a1', lineas: [{ idx: 0, recibido: 2, ubicacion_id: 'u1' }], observaciones: null }));
    mocks.sesion = { empresaId: 'e1', sociedadId: 's1', estado: 'listo', permiteEscritura: false };
    const readonly = await renderPage();
    expect(readonly.root.findByProps({ className: 'dx-recepcion-readonly' }).children.join('')).toContain('solo lectura');
  });

  it('muestra sin permiso y no carga datos si el permiso ver es denegado', async () => {
    mocks.rpc.mockImplementation((nombre, args) => Promise.resolve({
      data: nombre === 'usuario_puede' && args.target_accion !== 'ver', error: null,
    }));
    const root = await renderPage();
    expect(root.root.findAll(node => node.children?.join('').includes('No tienes permiso para ver recepciones de compra.'))).toHaveLength(1);
    expect(mocks.cargar).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.rpc.mock.calls.map(([nombre, args]) => [nombre, args.target_pantalla, args.target_accion])).toEqual([
      ['usuario_puede', 'recepciones', 'ver'],
      ['usuario_puede', 'recepciones', 'crear'],
      ['usuario_puede', 'inventario', 'crear'],
    ]);
  });

  it('mantiene el estado de carga mientras los permisos no se resuelven', async () => {
    mocks.rpc.mockImplementation((_nombre, _args) => new Promise(() => {}));
    const root = await renderPage();
    expect(root.root.findAll(node => node.children?.join('').includes('No tienes permiso para ver recepciones de compra.'))).toHaveLength(0);
    expect(root.root.findAll(node => node.children?.join('').includes('Cargando permisos de recepciones'))).toHaveLength(1);
    expect(mocks.cargar).not.toHaveBeenCalled();
  });

  it('deshabilita y muestra cero en líneas sin material, y las excluye del payload', async () => {
    mocks.cargar.mockResolvedValue({ ...filas, ordenes: [{ ...filas.ordenes[0], items: [
      { item_id: 'it0', descripcion: 'Línea manual', cantidad: 5 },
      { item_id: 'it1', material_id: 'm1', descripcion: 'Filtro válido', cantidad: 2 },
    ] }] });
    const root = await renderPage();
    await act(async () => root.root.findAllByProps({ role: 'button' })[0].props.onClick());
    const input = root.root.findByProps({ 'aria-label': 'Cantidad a recibir de Línea manual' });
    expect(input.props.disabled).toBe(true);
    expect(input.props.value).toBe(0);
    expect(input.props.step).toBe('any');
    expect(root.root.findByProps({ 'aria-label': 'Marcar observación en Línea manual' }).props.disabled).toBe(true);
    await act(async () => root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar recepción').props.onClick());
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ lineas: [{ idx: 1, recibido: 2, ubicacion_id: 'u1' }] }));
  });

  it('envía la descripción de las líneas observadas al registrar', async () => {
    const root = await renderPage();
    await act(async () => root.root.findAllByProps({ role: 'button' })[0].props.onClick());
    await act(async () => root.root.findByProps({ 'aria-label': 'Marcar observación en Filtro genérico' }).props.onClick());
    await act(async () => root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar recepción').props.onClick());
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ observaciones: 'Líneas observadas: Filtro genérico' }));
  });

  it('muestra destinos activos, anota su uso y conserva tipos directos de zona', async () => {
    mocks.cargarUbicaciones.mockResolvedValue([
      { id: 'pos', codigo: 'P-1', nombre: 'Posición zona', tipo: 'posicion', padre_id: 'z', activo: true, uso: 'cuarentena' },
      { id: 'off', codigo: 'OFF', nombre: 'Inactiva', tipo: 'piso', padre_id: 'z', activo: false },
      { id: 'z', codigo: 'Z-1', nombre: 'Zona', tipo: 'zona', activo: true },
      { id: 'piso', codigo: 'F-1', nombre: 'Piso', tipo: 'piso', padre_id: 'z', activo: true },
    ]);
    const root = await renderPage();
    await act(async () => { root.root.findAllByProps({ role: 'button' })[0].props.onClick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const selector = root.root.findByProps({ 'aria-label': 'Ubicación destino de Filtro genérico' });
    const opciones = selector.findAllByType('option');
    expect(opciones.map(option => option.children.join('').trimStart())).toContain('P-1 · Posición zona (cuarentena u observados)');
    expect(opciones.map(option => option.children.join('')).some(label => label.includes('Inactiva'))).toBe(false);
    expect(opciones.map(option => option.children.join('').trimStart())).toContain('F-1 · Piso');
  });

  it('muestra el error de registro en role alert y conserva abierto el detalle', async () => {
    mocks.registrar.mockRejectedValue(new Error('Fallo de registro'));
    const root = await renderPage();
    await act(async () => root.root.findAllByProps({ role: 'button' })[0].props.onClick());
    await act(async () => root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar recepción').props.onClick());
    expect(root.root.findByProps({ role: 'alert' }).children.join('')).toBe('Fallo de registro');
    expect(root.root.findByType('h1').children.join('')).toContain('Recepción OC-1');
  });
});
