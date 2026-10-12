import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', sociedadId: 's1', estado: 'listo', vistaConsolidada: false, sociedadesIdsAlcance: ['s1'] },
  cargarInventario: vi.fn(), cargarKardexMaterial: vi.fn(), rpc: vi.fn(), registrar: vi.fn(), anular: vi.fn(), transferir: vi.fn(), liberar: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/inventarioKardexService.js', () => ({ cargarInventarioKardex: mocks.cargarInventario, cargarKardexPorMaterial: mocks.cargarKardexMaterial }));
vi.mock('../src/services/inventarioMovimientosService.js', () => ({ registrarMovimientoManual: mocks.registrar, anularMovimiento: mocks.anular, transferirStock: mocks.transferir, liberarCuarentena: mocks.liberar }));
import { InventarioKardexPage } from '../src/zahory-mock/pages/InventarioKardexPage.jsx';
import { redirigirAlmacenMovimientosObsoleto, supplyAdministrationRouteIds } from '../src/zahory-mock/routes/supplyAdministrationRoutes.jsx';
import { getZahoryNavigation } from '../src/zahory-mock/navigation.js';

const material = (id, descripcion, extra = {}) => ({ id, codigo: id.toUpperCase(), descripcion, familia: 'Insumos', unidad: 'und', tipo_control: 'lote', punto_reorden: 10, stock_seguridad: 2, costo_promedio: 3, ...extra });
const datos = {
  almacenes: [{ id: 'a1', nombre: 'Almacén Norte' }],
  ubicaciones: [{ id: 'u1', almacen_id: 'a1', nombre: 'CUA-01', codigo: 'CUA-01', uso: 'cuarentena' }, { id: 'u2', almacen_id: 'a1', nombre: 'R-01', codigo: 'R-01', uso: 'almacenaje' }, { id: 'u3', almacen_id: 'a1', nombre: 'MER-01', codigo: 'MER-01', uso: 'merma' }],
  stock: [
    { id: 'st1', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u1', lote: 'L-1', fisico: 5, reservado: 0, materiales: material('m1', 'Filtro hidráulico'), almacenes: { nombre: 'Almacén Norte' }, ubicaciones: { nombre: 'CUA-01', codigo: 'CUA-01', uso: 'cuarentena' } },
    { id: 'st1b', material_id: 'm1', empresa_id: 'e1', sociedad_id: 's1', almacen_id: 'a1', ubicacion_id: 'u2', lote: 'L-2', fisico: 5, disponible: 5, reservado: 0, materiales: material('m1', 'Filtro hidr\u00e1ulico'), almacenes: { nombre: 'Almac\u00e9n Norte' }, ubicaciones: { nombre: 'R-01', codigo: 'R-01', uso: 'almacenaje' } },
    { id: 'st1c', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u3', lote: 'L-3', fisico: 1, disponible: 1, reservado: 0, materiales: material('m1', 'Filtro hidráulico'), almacenes: { nombre: 'Almacén Norte' }, ubicaciones: { nombre: 'MER-01', codigo: 'MER-01', uso: 'merma' } },
    { id: 'st2', material_id: 'm2', almacen_id: 'a1', fisico: 0, reservado: 0, materiales: material('m2', 'Perno agotado'), almacenes: { nombre: 'Almacén Norte' } },
  ],
  kardex: [], kardexParcial: false, limiteKardex: 200,
};
const movimiento = { id: 'k1', material_id: 'm1', tipo: 'entrada', cantidad: 5, created_at: '2026-01-01T10:00:00Z', anulado: true, motivo: 'Recepción', saldo_cantidad: 0, almacenes: { nombre: 'Almacén Norte' }, ubicaciones: { nombre: 'CUA-01' }, materiales: material('m1', 'Filtro hidráulico') };

async function renderPage() {
  let root;
  await act(async () => { root = TestRenderer.create(<InventarioKardexPage />); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return root;
}

function texto(root) {
  const recorrer = nodo => typeof nodo === 'string' ? nodo : Array.isArray(nodo) ? nodo.map(recorrer).join('') : nodo && typeof nodo === 'object' ? (nodo.children || []).map(recorrer).join('') : '';
  return recorrer(root.toJSON());
}

beforeEach(() => {
  mocks.sesion = { empresaId: 'e1', sociedadId: 's1', estado: 'listo', vistaConsolidada: false, sociedadesIdsAlcance: ['s1'] };
  mocks.cargarInventario.mockReset().mockResolvedValue(datos);
  mocks.cargarKardexMaterial.mockReset().mockResolvedValue({ kardex: [movimiento], kardexParcial: false, limiteKardex: 200 });
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.registrar.mockReset().mockResolvedValue({ kardex_id: 'k-new' });
  mocks.anular.mockReset().mockResolvedValue('k-reverse');
  mocks.transferir.mockReset().mockResolvedValue({ transferencia_id: 'tr-new' });
  mocks.liberar.mockReset().mockResolvedValue({ transferencia_id: 'tr-new' });
});

describe('InventarioKardexPage', () => {
  it('muestra el stock consolidado con estados Bajo reorden y Agotado', async () => {
    const root = await renderPage();
    expect(root.root.findAllByProps({ className: 'dx-ui-pill is-amber' })).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('') === 'Agotado')).toHaveLength(1);
  });

  it('carga el permiso liberar junto con ver, crear y editar', async () => {
    const root = await renderPage();
    expect(mocks.rpc.mock.calls.map(([nombre, args]) => [nombre, args.target_accion])).toEqual([
      ['usuario_puede', 'ver'], ['usuario_puede', 'crear'], ['usuario_puede', 'editar'], ['usuario_puede', 'liberar'],
    ]);
    root.unmount();
  });

  it('abre detalle con ubicación en cuarentena y carga el kardex del material con anulado tachado', async () => {
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.cargarKardexMaterial).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'e1', sociedadId: 's1', materialId: 'm1' }));
    expect(texto(root)).toContain('Cuarentena');
    expect(texto(root)).toContain('reorden 10 + seguridad 2');
    expect(root.root.findAll(node => node.props.className?.includes('dx-stk-dcols') && node.props.className.includes('is-void'))).toHaveLength(1);
    expect(texto(root)).not.toContain('historial de este material podría estar incompleto');
    expect(texto(root)).toContain('Almacén Norte');
    expect(texto(root)).toContain('CUA-01');
  });

  it('muestra el motivo como etiqueta y omite el UUID de registrado por en el detalle', async () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    mocks.cargarInventario.mockResolvedValue({ ...datos, kardex: [{ ...movimiento, anulado: false, motivo: 'recepcion_oc', usuario_id: uuid }] });
    const root = await renderPage();
    await act(async () => { root.root.findAllByProps({ role: 'tab' }).find(tab => tab.children.join('') === 'Kardex').props.onClick(); });
    const fila = root.root.findAll(node => node.props.className?.includes('dx-stk-kcols') && node.props.role === 'button')[0];
    await act(async () => { fila.props.onClick(); });
    expect(texto(root)).toContain('Recepción de OC');
    expect(texto(root)).not.toContain(uuid);
    expect(root.root.findAll(node => node.type === 'dt' && node.children.join('') === 'Registrado por')).toHaveLength(0);
  });

  it('avisa si el kardex del material está parcial', async () => {
    mocks.cargarKardexMaterial.mockResolvedValue({ kardex: [movimiento], kardexParcial: true, limiteKardex: 200 });
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(texto(root)).toContain('El kardex muestra solo los 200 movimientos más recientes');
  });

  it('muestra el estado sin permiso', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const root = await renderPage();
    expect(texto(root)).toContain('No tienes permiso para ver el inventario.');
    expect(mocks.cargarInventario).not.toHaveBeenCalled();
  });

  it('muestra error de lectura y permite reintentar', async () => {
    mocks.cargarInventario.mockRejectedValueOnce(new Error('Fallo de lectura'));
    const root = await renderPage();
    expect(root.root.findByProps({ role: 'alert' }).children.join('')).toContain('Fallo de lectura');
    await act(async () => { root.root.findAllByType('button').find(button => button.children.join('') === 'Reintentar').props.onClick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
    expect(mocks.cargarInventario).toHaveBeenCalledTimes(2);
  });

  it('oculta Entrada y Salida sin permiso crear, y conserva Ajuste con permiso editar', async () => {
    mocks.rpc.mockImplementation((_nombre, { target_accion }) => Promise.resolve({ data: target_accion !== 'crear', error: null }));
    const root = await renderPage();
    expect(texto(root)).not.toContain('Registrar entrada');
    expect(texto(root)).not.toContain('Registrar salida');
    expect(texto(root)).toContain('Ajustar stock');
  });

  it('oculta Ajuste y Anular sin permiso editar', async () => {
    mocks.rpc.mockImplementation((_nombre, { target_accion }) => Promise.resolve({ data: target_accion !== 'editar', error: null }));
    mocks.cargarInventario.mockResolvedValue({ ...datos, kardex: [{ ...movimiento, anulado: false, motivo: 'saldo_inicial', referencia_tipo: 'manual' }] });
    const root = await renderPage();
    expect(texto(root)).not.toContain('Ajustar stock');
    await act(async () => { root.root.findAllByProps({ role: 'tab' }).find(tab => tab.children.join('') === 'Kardex').props.onClick(); });
    const fila = root.root.findAll(node => node.props.className?.includes('dx-stk-kcols') && node.props.role === 'button')[0];
    await act(async () => { fila.props.onClick(); });
    expect(texto(root)).toContain('Tu rol no permite anular movimientos.');
    expect(texto(root)).not.toContain('Anular movimiento…');
  });

  it('explica el bloqueo de escritura consolidada solo cuando hay permisos', async () => {
    mocks.sesion = { empresaId: 'e1', sociedadId: '**todas**', estado: 'listo', vistaConsolidada: true, sociedadesIdsAlcance: ['s1', 's2'], permiteEscritura: false };
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const consolidada = await renderPage();
    expect(texto(consolidada)).toContain('Elige una sociedad concreta en el selector superior para registrar movimientos.');
    expect(texto(consolidada)).not.toContain('Ajustar stock');
    expect(texto(consolidada)).not.toContain('Registrar entrada');
    expect(texto(consolidada)).not.toContain('Registrar salida');
    consolidada.unmount();

    mocks.sesion = { ...mocks.sesion, permiteEscritura: true };
    const concreta = await renderPage();
    expect(texto(concreta)).not.toContain('Elige una sociedad concreta en el selector superior para registrar movimientos.');
    expect(texto(concreta)).toContain('Ajustar stock');
    expect(texto(concreta)).toContain('Registrar entrada');
    expect(texto(concreta)).toContain('Registrar salida');
    concreta.unmount();

    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.sesion = { ...mocks.sesion, permiteEscritura: false };
    const sinPermisos = await renderPage();
    expect(texto(sinPermisos)).not.toContain('Elige una sociedad concreta en el selector superior para registrar movimientos.');
    expect(texto(sinPermisos)).not.toContain('Ajustar stock');
    expect(texto(sinPermisos)).not.toContain('Registrar entrada');
    expect(texto(sinPermisos)).not.toContain('Registrar salida');
    sinPermisos.unmount();
  });

  it('registra una entrada y refresca stock y kardex; el doble clic no duplica', async () => {
    let resolver;
    mocks.registrar.mockReturnValueOnce(new Promise(resolve => { resolver = resolve; }));
    const root = await renderPage();
    await act(async () => { root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar entrada').props.onClick(); });
    const change = async (name, value) => act(async () => { root.root.findAll(node => node.props.name === name)[0].props.onChange({ target: { value } }); });
    await change('material_id', 'm1'); await change('motivo', 'saldo_inicial'); await change('almacen_id', 'a1'); await change('ubicacion_id', 'u2'); await change('lote', 'L-new'); await change('cantidad', '2'); await change('costo_unitario', '4');
    const form = root.root.findAllByType('form').find(item => item.props.onSubmit);
    await act(async () => { const evento = { preventDefault: vi.fn() }; form.props.onSubmit(evento); form.props.onSubmit(evento); await Promise.resolve(); });
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    await act(async () => { resolver({ kardex_id: 'k-new' }); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'e1', accion: 'entrada', sociedad_id: 's1', cantidad: '2', vencimiento: null }));
    expect(texto(root)).toContain('Entrada registrada correctamente.');
    expect(mocks.cargarInventario).toHaveBeenCalledTimes(2);
  });

  it('muestra el error del servidor dentro del panel', async () => {
    mocks.registrar.mockRejectedValueOnce(new Error('El lote ya existe con otro vencimiento.'));
    const root = await renderPage();
    await act(async () => { root.root.findAllByType('button').find(button => button.children.join('') === 'Registrar entrada').props.onClick(); });
    const change = async (name, value) => act(async () => { root.root.findAll(node => node.props.name === name)[0].props.onChange({ target: { value } }); });
    await change('material_id', 'm1'); await change('motivo', 'saldo_inicial'); await change('almacen_id', 'a1'); await change('ubicacion_id', 'u2'); await change('lote', 'L-new'); await change('cantidad', '1'); await change('costo_unitario', '4');
    await act(async () => { await root.root.findAllByType('form').find(item => item.props.onSubmit).props.onSubmit({ preventDefault: vi.fn() }); });
    expect(root.root.findAllByProps({ role: 'alert' }).some(alert => alert.children.join('').includes('El lote ya existe con otro vencimiento.'))).toBe(true);
  });

  it('muestra Liberar solo en cuarentena/merma y Mover en ubicaciones normales', async () => {
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(root.root.findAllByProps({ children: 'Mover' })).toHaveLength(1);
    expect(root.root.findByProps({ 'aria-label': 'Liberar Filtro hidráulico desde CUA-01' })).toBeTruthy();
    expect(root.root.findByProps({ 'aria-label': 'Liberar Filtro hidráulico desde MER-01' })).toBeTruthy();
    root.unmount();

    const agotado = await renderPage();
    await act(async () => { agotado.root.findByProps({ 'aria-label': 'Abrir Perno agotado' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { agotado.root.findAllByProps({ children: 'Mover' })[0].props.onClick(); });
    expect(agotado.root.findByProps({ role: 'dialog' }).findAllByType('button').find(button => button.props.type === 'submit').props.disabled).toBe(true);
    agotado.unmount();

    const cuarentena = await renderPage();
    await act(async () => { cuarentena.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { cuarentena.root.findByProps({ 'aria-label': 'Liberar Filtro hidráulico desde CUA-01' }).props.onClick(); });
    expect(texto(cuarentena)).toContain('Destino · ubicación normal');
    expect(cuarentena.root.findByProps({ role: 'dialog' }).findAllByType('button').find(button => button.props.type === 'submit').props.disabled).toBe(true);
    cuarentena.unmount();

    mocks.rpc.mockImplementation((_nombre, { target_accion }) => Promise.resolve({ data: target_accion !== 'crear', error: null }));
    const sinCrear = await renderPage();
    await act(async () => { sinCrear.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(sinCrear.root.findAllByProps({ children: 'Mover' })).toHaveLength(0);
  });

  it('deshabilita Liberar si falta el permiso y conserva Mover en filas normales', async () => {
    mocks.rpc.mockImplementation((_nombre, { target_accion }) => Promise.resolve({ data: target_accion !== 'liberar', error: null }));
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    const liberar = root.root.findAllByProps({ 'aria-label': 'Liberar deshabilitado: sin permiso' })[0];
    expect(liberar.props.disabled).toBe(true);
    expect(liberar.props.title).toBe('Sin permiso para liberar');
    expect(root.root.findByProps({ 'aria-label': 'Mover Filtro hidráulico desde R-01' })).toBeTruthy();
  });

  it('libera cuarentena con destino, cantidad y motivo, recarga y avisa el éxito', async () => {
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { root.root.findByProps({ 'aria-label': 'Liberar Filtro hidráulico desde CUA-01' }).props.onClick(); });
    await act(async () => { root.root.findByProps({ name: 'cantidad' }).props.onChange({ target: { value: '2' } }); });
    await act(async () => { root.root.findByProps({ name: 'motivo' }).props.onChange({ target: { value: 'Inspección aprobada' } }); });
    const form = root.root.findAllByType('form').find(item => item.props.onSubmit);
    await act(async () => { await form.props.onSubmit({ preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.liberar).toHaveBeenCalledWith({ empresa_id: 'e1', stock_origen_id: 'st1', almacen_destino_id: 'a1', ubicacion_destino_id: 'u2', cantidad: 2, motivo: 'Inspección aprobada', observacion: null });
    expect(mocks.cargarInventario).toHaveBeenCalledTimes(2);
    expect(mocks.cargarKardexMaterial).toHaveBeenCalledTimes(2);
    expect(texto(root)).toContain('Stock liberado. Se trasladó a una ubicación normal y quedó disponible.');
  });

  it('registra transferencia, recarga stock y kardex y avisa el éxito', async () => {
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    const mover = root.root.findByProps({ 'aria-label': 'Mover Filtro hidráulico desde R-01' });
    await act(async () => { mover.props.onClick(); });
    expect(texto(root)).toContain('Origen · solo lectura');
    await act(async () => { root.root.findByProps({ name: 'cantidad' }).props.onChange({ target: { value: '2,5' } }); });
    const form = root.root.findAllByType('form').find(item => item.props.onSubmit);
    await act(async () => { await form.props.onSubmit({ preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.transferir).toHaveBeenCalledWith({ empresa_id: 'e1', stock_origen_id: 'st1b', almacen_destino_id: 'a1', ubicacion_destino_id: 'u1', cantidad: 2.5, observacion: null });
    expect(mocks.cargarInventario).toHaveBeenCalledTimes(2);
    expect(mocks.cargarKardexMaterial).toHaveBeenCalledTimes(2);
    expect(texto(root)).toContain('Transferencia registrada correctamente.');
  });

  it('mantiene el panel abierto y muestra el error del servidor', async () => {
    mocks.transferir.mockRejectedValueOnce(new Error('Solo se puede mover stock disponible.'));
    const root = await renderPage();
    await act(async () => { root.root.findByProps({ 'aria-label': 'Abrir Filtro hidráulico' }).props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { root.root.findByProps({ 'aria-label': 'Mover Filtro hidráulico desde R-01' }).props.onClick(); });
    await act(async () => { root.root.findByProps({ name: 'cantidad' }).props.onChange({ target: { value: '1' } }); });
    await act(async () => { await root.root.findAllByType('form').find(item => item.props.onSubmit).props.onSubmit({ preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve(); });
    expect(root.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
    expect(root.root.findAllByProps({ role: 'alert' }).some(alert => alert.children.join('').includes('Solo se puede mover stock disponible.'))).toBe(true);
  });

  it('muestra transferencia enlazada sin anulación y redirige la ruta obsoleta', async () => {
    const salida = { id: 'tr-out', tipo: 'transferencia_salida', cantidad: 2, motivo: 'transferencia', referencia_tipo: 'transferencia', referencia_id: 'tr-ref', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u2', created_at: '2026-02-01', materiales: material('m1', 'Filtro hidráulico'), ubicaciones: { nombre: 'R-01' }, almacenes: { nombre: 'Almacén Norte' } };
    const entrada = { ...salida, id: 'tr-in', tipo: 'transferencia_entrada', almacen_id: 'a1', ubicacion_id: 'u1', ubicaciones: { nombre: 'CUA-01' } };
    mocks.cargarInventario.mockResolvedValue({ ...datos, kardex: [salida, entrada] });
    const root = await renderPage();
    await act(async () => { root.root.findAllByProps({ role: 'tab' }).find(tab => tab.children.join('') === 'Kardex').props.onClick(); });
    const fila = root.root.findAll(node => node.props.className?.includes('dx-stk-kcols') && node.props.role === 'button')[0];
    expect(texto(root)).toContain('Transf. salida');
    await act(async () => { fila.props.onClick(); });
    expect(texto(root)).toContain('tr-ref');
    expect(texto(root)).toContain('Asiento relacionado');
    expect(texto(root)).toContain('Una transferencia se corrige con una transferencia inversa.');
    expect(texto(root)).not.toContain('Anular movimiento…');
    expect(texto(root)).toContain('−2');

    vi.stubGlobal('window', { location: { hash: '#/almacen-movimientos' } });
    expect(redirigirAlmacenMovimientosObsoleto()).toBe(true);
    expect(globalThis.window.location.hash).toBe('#/almacen-inventario');
    vi.unstubAllGlobals();
    expect(supplyAdministrationRouteIds.has('almacen-movimientos')).toBe(false);
    const menu = getZahoryNavigation(supplyAdministrationRouteIds);
    expect(JSON.stringify(menu)).not.toContain('Entradas & Salidas');
  });

  it('muestra nro_documento como Referencia en la lista y el detalle para despacho y reversa OT', async () => {
    const despacho = { id: 'k-desp', tipo: 'salida', cantidad: 1, motivo: 'despacho_taller', referencia_tipo: 'ot', referencia_id: 'ot_raw_dispatch', nro_documento: 'OT-104', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u2', materiales: material('m1', 'Filtro hidráulico') };
    const reversa = { ...despacho, id: 'k-rev', tipo: 'entrada', motivo: 'reversa_despacho', referencia_id: 'ot_raw_reverse', nro_documento: 'OT-105' };
    mocks.cargarInventario.mockResolvedValue({ ...datos, kardex: [despacho, reversa] });
    const root = await renderPage();
    await act(async () => { root.root.findAllByProps({ role: 'tab' }).find(tab => tab.children.join('') === 'Kardex').props.onClick(); });
    expect(texto(root)).toContain('OT-104');
    expect(texto(root)).toContain('OT-105');
    expect(texto(root)).not.toContain('ot_raw_dispatch');
    expect(texto(root)).not.toContain('ot_raw_reverse');
    const fila = root.root.findAll(node => node.props.className?.includes('dx-stk-kcols') && node.props.role === 'button')[0];
    await act(async () => { fila.props.onClick(); });
    const valores = Object.fromEntries(root.root.findAllByType('dt').map(dt => [dt.children.join(''), dt.parent.findByType('dd').children.join('')]));
    expect(valores.Referencia).toBe('OT-104');
    expect(texto(root)).not.toContain('ot_raw_dispatch');
  });

  it('resuelve ubicación, origen y destino de una transferencia sin joins', async () => {
    const salida = { id: 'tr-out-no-join', tipo: 'transferencia_salida', cantidad: 2, referencia_tipo: 'transferencia', referencia_id: 'tr-ref-no-join', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u2', created_at: '2026-02-01', materiales: material('m1', 'Filtro hidráulico') };
    const entrada = { ...salida, id: 'tr-in-no-join', tipo: 'transferencia_entrada', ubicacion_id: 'u1' };
    mocks.cargarInventario.mockResolvedValue({ ...datos, kardex: [salida, entrada] });
    const root = await renderPage();
    await act(async () => { root.root.findAllByProps({ role: 'tab' }).find(tab => tab.children.join('') === 'Kardex').props.onClick(); });
    const fila = root.root.findAll(node => node.props.className?.includes('dx-stk-kcols') && node.props.role === 'button')[0];
    await act(async () => { fila.props.onClick(); });

    const valores = Object.fromEntries(root.root.findAllByType('dt').map(dt => [dt.children.join(''), dt.parent.findByType('dd').children.join('')]));
    expect(valores['Ubicación']).toBe('R-01 · R-01');
    expect(valores['Origen']).toBe('Almacén Norte · R-01 · R-01');
    expect(valores['Destino']).toBe('Almacén Norte · CUA-01 · CUA-01');
    expect(valores['Ubicación']).not.toContain('u2');
    expect(valores['Origen']).not.toContain('u2');
    expect(valores['Destino']).not.toContain('u1');
  });
});
