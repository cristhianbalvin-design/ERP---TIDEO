import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'empresa-1', estado: 'listo', cargando: false },
  listar: vi.fn(), despachar: vi.fn(), liberar: vi.fn(), revertir: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/services/reservasRepuestosService.js', () => ({ listarReservasOT: mocks.listar, despacharReservaOT: mocks.despachar, liberarReservaOT: mocks.liberar, revertirDespachoOT: mocks.revertir }));
import { ReservaRepuestosPage } from '../src/zahory-mock/pages/ReservaRepuestosPage.jsx';

const lineaBase = { id: 'segmento-1', descripcion: 'Filtro hidráulico', codigo: 'FIL-01', unidad: 'und', cantidad_estimada: 3, reservado: 3, despachado: 0, liberado: 0, pendiente: 3, estado: 'reservado', origenes: [] };
const otBase = { id: 'ot-1', numero: 'OT-104', estado: 'programada', lineas: [lineaBase], acciones: [] };
const resultado = (ot = otBase, permisos = { despachar: true, liberar: true }) => ({ ordenes: [ot], permisos });

async function renderPage() {
  let root;
  await act(async () => { root = TestRenderer.create(<ReservaRepuestosPage />); await new Promise(resolve => setTimeout(resolve, 0)); });
  return root;
}
function button(root, label) { return root.root.findAllByType('button').find(item => item.children.join('') === label); }
async function openDetail(root) { await act(async () => root.root.find(node => node.props.className === 'dx-desp-list-row').props.onClick()); }

describe('ReservaRepuestosPage', () => {
  beforeEach(() => {
    mocks.sesion = { empresaId: 'empresa-1', estado: 'listo', cargando: false };
    mocks.listar.mockReset().mockResolvedValue(resultado());
    mocks.despachar.mockReset().mockResolvedValue({});
    mocks.liberar.mockReset().mockResolvedValue({});
    mocks.revertir.mockReset().mockResolvedValue({});
    vi.stubGlobal('requestAnimationFrame', callback => callback());
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), querySelector: vi.fn(() => null) });
  });

  it('muestra el estado agregado Reserva completa cuando todas las líneas tienen pendiente cero', async () => {
    const completa = { ...otBase, lineas: [{ ...lineaBase, reservado: 2, pendiente: 0 }] };
    mocks.listar.mockResolvedValue(resultado(completa));
    const root = await renderPage();
    expect(root.root.findAll(node => node.children?.includes('Reserva completa'))).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.includes('Reserva pendiente'))).toHaveLength(0);
  });

  it('muestra el detalle con siete columnas y acciones habilitadas con permiso', async () => {
    const root = await renderPage(); await openDetail(root);
    const cabecera = root.root.find(node => node.props.className === 'dx-desp-line-head');
    expect(cabecera.findAllByType('span')).toHaveLength(7);
    expect(button(root, 'Despachar').props.disabled).not.toBe(true);
    expect(button(root, 'Liberar').props.disabled).not.toBe(true);
    expect(root.root.findAll(node => node.children?.join('') === 'SOLPE en curso')).toHaveLength(0);
  });

  it('marca cantidad central por trasladar a la mina y omite periferia o OT sin mina', async () => {
    const lineaConCentral = { ...lineaBase, origenes: [{ almacen_clase: 'central', pendiente: 2 }] };
    mocks.listar.mockResolvedValue(resultado({ ...otBase, mina_id: 'mina-1', mina_nombre: 'Mina Norte', lineas: [lineaConCentral] }));
    const conMina = await renderPage(); await openDetail(conMina);
    expect(conMina.root.findAll(node => node.props.className === 'dx-ui-pill is-amber' && node.children.join('').includes('Por trasladar a Mina Norte: 2 und'))).toHaveLength(1);
    conMina.unmount();

    mocks.listar.mockResolvedValue(resultado({ ...otBase, mina_id: null, mina_nombre: null, lineas: [lineaConCentral] }));
    const sinMina = await renderPage(); await openDetail(sinMina);
    expect(sinMina.root.findAll(node => node.children?.join('').includes('Por trasladar a'))).toHaveLength(0);
    sinMina.unmount();

    mocks.listar.mockResolvedValue(resultado({ ...otBase, mina_id: 'mina-1', mina_nombre: 'Mina Norte', lineas: [{ ...lineaBase, origenes: [{ almacen_clase: 'periferico', almacen_mina_id: 'mina-1', pendiente: 2 }] }] }));
    const periferico = await renderPage(); await openDetail(periferico);
    expect(periferico.root.findAll(node => node.children?.join('').includes('Por trasladar a'))).toHaveLength(0);
  });

  it('muestra solo la etiqueta de líneas en el chip y conserva el conteo del encabezado', async () => {
    const root = await renderPage(); await openDetail(root);
    const chipResumen = root.root.find(node => node.props.className === 'dx-ui-summary').findAllByType('span')[0];
    const encabezadoTarjeta = root.root.findAll(node => node.props.className === 'dx-ui-count').find(node => node.children.join('').includes('programada'));
    expect(chipResumen.children.join('')).toBe('Línea');
    expect(encabezadoTarjeta.children.join('')).toBe('1 línea · programada');
  });

  it('deshabilita las acciones y explica la falta de permisos', async () => {
    mocks.listar.mockResolvedValue(resultado(otBase, { despachar: false, liberar: false }));
    const root = await renderPage(); await openDetail(root);
    expect(button(root, 'Despachar').props.disabled).toBe(true);
    expect(button(root, 'Liberar').props.disabled).toBe(true);
    expect(root.root.findAll(node => node.children?.join('').includes('Sin permiso de despacho'))).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('').includes('Sin permiso para liberar'))).toHaveLength(1);
    expect(button(root, 'Revertir').props.disabled).toBe(true);
    expect(button(root, 'Revertir').props.title).toBe('Sin permiso para revertir');
  });

  it('deshabilita Revertir cuando no hay despacho o la OT está cerrada', async () => {
    const sinDespacho = await renderPage(); await openDetail(sinDespacho);
    expect(button(sinDespacho, 'Revertir').props.title).toBe('Nada despachado');
    sinDespacho.unmount();
    mocks.listar.mockResolvedValue(resultado({ ...otBase, estado: 'cerrada', lineas: [{ ...lineaBase, despachado: 2, pendiente: 1 }] }));
    const cerrada = await renderPage(); await openDetail(cerrada);
    expect(button(cerrada, 'Revertir').props.disabled).toBe(true);
    expect(button(cerrada, 'Revertir').props.title).toBe('OT cerrada');
  });

  it('abre el panel, exige motivo, revierte con el servicio y muestra la acción en el historial', async () => {
    const conDespacho = { ...otBase, lineas: [{ ...lineaBase, despachado: 2, pendiente: 1 }], acciones: [{ id: 'acc-1', tipo: 'reversa_despacho', cantidad: 1, motivo: 'Error de despacho' }] };
    mocks.listar.mockResolvedValue(resultado(conDespacho));
    const root = await renderPage(); await openDetail(root);
    expect(button(root, 'Revertir').props.disabled).not.toBe(true);
    await act(async () => button(root, 'Revertir').props.onClick({ currentTarget: { isConnected: true, focus: vi.fn() } }));
    const dialog = root.root.findByProps({ role: 'dialog' });
    expect(button(root, 'Revertir despacho').props.disabled).toBe(true);
    await act(async () => dialog.findByProps({ id: 'dx-reversa-motivo' }).props.onChange({ target: { value: 'Error de despacho' } }));
    expect(button(root, 'Revertir despacho').props.disabled).toBe(false);
    await act(async () => dialog.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
    expect(mocks.revertir).toHaveBeenCalledWith({ empresa_id: 'empresa-1', ot_id: 'ot-1', lineas: [{ ot_segmento_repuesto_id: 'segmento-1', cantidad: 2 }], motivo: 'Error de despacho', observacion: null });
    expect(root.root.findAll(node => node.children?.join('').includes('Reversa de despacho'))).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('').includes('1 · Error de despacho'))).toHaveLength(1);
    expect(root.root.findAllByProps({ role: 'status' }).some(node => node.children.join('').includes('Despacho revertido. La cantidad vuelve a la reserva de la OT.'))).toBe(true);
  });

  it('envía el despacho al servicio con los parámetros exactos', async () => {
    const root = await renderPage(); await openDetail(root);
    await act(async () => button(root, 'Despachar').props.onClick({ currentTarget: { isConnected: true, focus: vi.fn() } }));
    const dialog = root.root.findByProps({ role: 'dialog' });
    await act(async () => dialog.findByProps({ id: 'dx-desp-recibe' }).props.onChange({ target: { value: 'Taller A' } }));
    await act(async () => dialog.findByProps({ id: 'dx-desp-observacion' }).props.onChange({ target: { value: 'Entrega urgente' } }));
    await act(async () => dialog.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
    expect(mocks.despachar).toHaveBeenCalledWith({ empresa_id: 'empresa-1', ot_id: 'ot-1', lineas: [{ ot_segmento_repuesto_id: 'segmento-1', cantidad: 3 }], recibe_en_taller: 'Taller A', observacion: 'Entrega urgente' });
  });

  it('exige motivo para habilitar Liberar', async () => {
    const root = await renderPage(); await openDetail(root);
    await act(async () => button(root, 'Liberar').props.onClick({ currentTarget: { isConnected: true, focus: vi.fn() } }));
    const dialog = root.root.findByProps({ role: 'dialog' });
    expect(button(root, 'Liberar reserva').props.disabled).toBe(true);
    await act(async () => dialog.findByProps({ id: 'dx-desp-motivo' }).props.onChange({ target: { value: 'Error de reserva' } }));
    expect(button(root, 'Liberar reserva').props.disabled).toBe(false);
    expect(mocks.liberar).not.toHaveBeenCalled();
  });

  it('muestra el error del RPC en una alerta del panel', async () => {
    mocks.despachar.mockRejectedValueOnce(new Error('Fallo del RPC de despacho'));
    const root = await renderPage(); await openDetail(root);
    await act(async () => button(root, 'Despachar').props.onClick({ currentTarget: { isConnected: true, focus: vi.fn() } }));
    const dialog = root.root.findByProps({ role: 'dialog' });
    await act(async () => dialog.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
    expect(root.root.findByProps({ role: 'alert' }).children.join('')).toBe('Fallo del RPC de despacho');
  });

  it('Ver Kardex navega a Inventario & Kardex y mantiene Actualizar', async () => {
    const location = { hash: '' }; vi.stubGlobal('window', { location });
    const root = await renderPage(); await openDetail(root);
    expect(button(root, 'Actualizar')).toBeTruthy();
    await act(async () => button(root, 'Ver Kardex').props.onClick());
    expect(location.hash).toBe('#/almacen-inventario');
  });

  it('muestra SOLPE en curso cuando la línea tiene SOLPE y no hay cantidad reservada', async () => {
    mocks.listar.mockResolvedValue(resultado({ ...otBase, lineas: [{ ...lineaBase, estado: 'reservado_parcial_solpe', solpe_id: 'solpe-1', reservado: 0 }] }));
    const root = await renderPage(); await openDetail(root);
    expect(root.root.findAll(node => node.type === 'i' && node.children.includes('Sin stock · SOLPE en curso'))).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('') === 'SOLPE en curso')).toHaveLength(1);

    root.unmount();
    mocks.listar.mockResolvedValue(resultado({ ...otBase, lineas: [{ ...lineaBase, estado: 'reservado_parcial_solpe', solpe_id: 'solpe-1', reservado: 1 }] }));
    const rootConReserva = await renderPage(); await openDetail(rootConReserva);
    expect(rootConReserva.root.findAll(node => node.type === 'i' && node.children.includes('Reservado parcial + SOLPE'))).toHaveLength(1);
  });
});
