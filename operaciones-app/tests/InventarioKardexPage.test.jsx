import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', sociedadId: 's1', estado: 'listo', vistaConsolidada: false, sociedadesIdsAlcance: ['s1'] },
  cargarInventario: vi.fn(), cargarKardexMaterial: vi.fn(), rpc: vi.fn(), registrar: vi.fn(), anular: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/inventarioKardexService.js', () => ({ cargarInventarioKardex: mocks.cargarInventario, cargarKardexPorMaterial: mocks.cargarKardexMaterial }));
vi.mock('../src/services/inventarioMovimientosService.js', () => ({ registrarMovimientoManual: mocks.registrar, anularMovimiento: mocks.anular }));
import { InventarioKardexPage } from '../src/zahory-mock/pages/InventarioKardexPage.jsx';

const material = (id, descripcion, extra = {}) => ({ id, codigo: id.toUpperCase(), descripcion, familia: 'Insumos', unidad: 'und', tipo_control: 'lote', punto_reorden: 10, stock_seguridad: 2, costo_promedio: 3, ...extra });
const datos = {
  almacenes: [{ id: 'a1', nombre: 'Almacén Norte' }],
  ubicaciones: [{ id: 'u1', almacen_id: 'a1', nombre: 'CUA-01', codigo: 'CUA-01', uso: 'cuarentena' }, { id: 'u2', almacen_id: 'a1', nombre: 'R-01', codigo: 'R-01', uso: 'almacenaje' }],
  stock: [
    { id: 'st1', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u1', lote: 'L-1', fisico: 5, reservado: 0, materiales: material('m1', 'Filtro hidráulico'), almacenes: { nombre: 'Almacén Norte' }, ubicaciones: { nombre: 'CUA-01', codigo: 'CUA-01', uso: 'cuarentena' } },
    { id: 'st1b', material_id: 'm1', empresa_id: 'e1', sociedad_id: 's1', almacen_id: 'a1', ubicacion_id: 'u2', lote: 'L-2', fisico: 5, disponible: 5, reservado: 0, materiales: material('m1', 'Filtro hidr\u00e1ulico'), almacenes: { nombre: 'Almac\u00e9n Norte' }, ubicaciones: { nombre: 'R-01', codigo: 'R-01', uso: 'almacenaje' } },
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
});

describe('InventarioKardexPage', () => {
  it('muestra el stock consolidado con estados Bajo reorden y Agotado', async () => {
    const root = await renderPage();
    expect(root.root.findAllByProps({ className: 'dx-ui-pill is-amber' })).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('') === 'Agotado')).toHaveLength(1);
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
});
