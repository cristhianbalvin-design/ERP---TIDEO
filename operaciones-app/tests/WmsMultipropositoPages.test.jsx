import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: null, rpc: vi.fn(), cola: vi.fn(), despachar: vi.fn(), despacharOT: vi.fn(), guardarCfg: vi.fn(), minimos: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/reservasRepuestosService.js', () => ({ despacharReservaOT: mocks.despacharOT }));
vi.mock('../src/services/solpeService.js', () => ({ crearSolpeInterna: vi.fn() }));
vi.mock('../src/services/wmsMultipropositoService.js', () => ({
  MODULOS_WMS_POR_DEFECTO: { consumo: true, venta: false, custodia: false, conteos: true, codigos: true, lotes: false, herramientas: false },
  obtenerConfiguracionWms: vi.fn().mockResolvedValue({ modulos: { consumo: true, venta: true, custodia: false, conteos: true, codigos: true, lotes: false, herramientas: false }, umbral_aprobacion_ajuste: 500 }),
  listarAlmacenesWms: vi.fn().mockResolvedValue([
    { id: 'a1', codigo: 'ALM-1', nombre: 'Principal', proposito: 'consumo_interno', estado: 'activo' },
    { id: 'a2', codigo: 'ALM-2', nombre: 'Tienda', proposito: 'venta', estado: 'activo' },
  ]),
  listarColaDespachos: mocks.cola,
  despacharDemanda: mocks.despachar,
  reintentarReserva: vi.fn(),
  guardarConfiguracionWms: mocks.guardarCfg,
  listarStockMinimos: mocks.minimos,
  guardarParametrosStock: vi.fn(),
  listarCentrosCostoActivos: vi.fn().mockResolvedValue([]),
}));
import { DespachosPage } from '../src/zahory-mock/pages/wms/DespachosPage.jsx';
import { ConfiguracionWmsPage } from '../src/zahory-mock/pages/wms/ConfiguracionWmsPage.jsx';
import { StockMinimosPage } from '../src/zahory-mock/pages/wms/StockMinimosPage.jsx';

const esperar = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const texto = nodo => (nodo.children || []).map(h => (typeof h === 'string' ? h : texto(h))).join('');
const boton = (root, etiqueta) => root.root.findAllByType('button').find(b => texto(b).includes(etiqueta));

describe('Pantallas WMS multipropósito', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sesion = { empresaId: 'e1', estado: 'listo', permiteEscritura: true, sociedadId: 's1', usuario: { id: 'u1' } };
    mocks.rpc.mockImplementation((_nombre, params) => Promise.resolve({ data: params.target_accion !== 'nada', error: null }));
    mocks.cola.mockResolvedValue([
      { id: 'ot1', canal: 'ot', numero: 'OT-26-1', destino: 'Taller · OT-26-1', estado: 'reservada', lineas: [{ linea_id: 'r1', codigo: 'FIL-1', descripcion: 'Filtro', pendiente: 2, ubicacion: 'A-01' }] },
      { id: 'd1', canal: 'venta', numero: 'OV-9', destino: 'Cliente SAC', estado: 'parcial', lineas: [{ linea_id: 'v1', codigo: 'LUB-1', descripcion: 'Lubricante', cantidad: 20, reservada: 12, despachada: 0, ubicacion: 'B-02' }] },
    ]);
    mocks.despachar.mockResolvedValue({ estado: 'parcial', guia_numero: 'T001-00000007' });
  });

  it('Despachos: muestra la cola por canal, pide la guía en ventas y despacha con los datos de la guía', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<DespachosPage />); await esperar(); });
    expect(texto(root.root.findByType('h1'))).toBe('Despachos');
    expect(root.root.findAllByType('tr').length).toBe(3);
    const filaVenta = root.root.findAllByType('tr').find(tr => texto(tr).includes('OV-9'));
    await act(async () => { filaVenta.props.onClick(); await esperar(); });
    expect(texto(root.root)).toContain('Guía de remisión');
    expect(texto(root.root)).toContain('faltan 8');
    await act(async () => { boton(root, 'Emitir guía y despachar').props.onClick(); await esperar(); });
    expect(mocks.despachar).not.toHaveBeenCalled();
    expect(texto(root.root)).toContain('Indica la cantidad preparada');
    await act(async () => { boton(root, 'Preparar todo lo listo').props.onClick(); });
    const set = (id, valor) => root.root.findByProps({ id }).props.onChange({ target: { value: valor } });
    await act(async () => { set('dx-wdesp-llegada_direccion', 'Av. Industrial 123'); set('dx-wdesp-peso_bruto_total', '15'); set('dx-wdesp-vehiculo_placa', 'ABC-123'); set('dx-wdesp-conductor_dni', '45678912'); });
    await act(async () => { boton(root, 'Emitir guía y despachar').props.onClick(); await esperar(); });
    expect(mocks.despachar).toHaveBeenCalledWith(expect.objectContaining({
      empresa_id: 'e1', demanda_id: 'd1', lineas: [{ linea_id: 'v1', cantidad: 12 }],
      guia: expect.objectContaining({ llegada_direccion: 'Av. Industrial 123', peso_bruto_total: 15, vehiculo_placa: 'ABC-123' }),
    }));
    expect(texto(root.root)).toContain('Guía T001-00000007 emitida');
  });

  it('Despachos: una OT se entrega a taller con la RPC existente de reservas', async () => {
    mocks.despacharOT.mockResolvedValue({});
    let root;
    await act(async () => { root = TestRenderer.create(<DespachosPage />); await esperar(); });
    await act(async () => { root.root.findAllByType('tr').find(tr => texto(tr).includes('OT-26-1')).props.onClick(); await esperar(); });
    await act(async () => { root.root.findByProps({ 'aria-label': 'Cantidad preparada de FIL-1' }).props.onChange({ target: { value: '2' } }); });
    await act(async () => { boton(root, 'Entregar a taller').props.onClick(); await esperar(); });
    expect(mocks.despacharOT).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'e1', ot_id: 'ot1', lineas: [{ ot_segmento_repuesto_id: 'r1', cantidad: 2 }] }));
  });

  it('Configuración: guarda módulos, umbral y solo los almacenes cuyo propósito cambió', async () => {
    mocks.guardarCfg.mockResolvedValue({});
    let root;
    await act(async () => { root = TestRenderer.create(<ConfiguracionWmsPage />); await esperar(); });
    await act(async () => { root.root.findByProps({ 'aria-label': 'Propósito de ALM-1' }).props.onChange({ target: { value: 'mixto' } }); });
    await act(async () => { boton(root, 'Guardar cambios').props.onClick(); await esperar(); });
    expect(mocks.guardarCfg).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'e1', umbral: 500, almacenes: [{ id: 'a1', proposito: 'mixto' }] }));
  });

  it('Mínimos: sin permiso de ver no consulta el stock', async () => {
    mocks.rpc.mockImplementation(() => Promise.resolve({ data: false, error: null }));
    let root;
    await act(async () => { root = TestRenderer.create(<StockMinimosPage />); await esperar(); });
    expect(mocks.minimos).not.toHaveBeenCalled();
    expect(texto(root.root)).toContain('No tienes permiso para ver los mínimos de stock');
  });
});
