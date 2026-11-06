import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: null, rpc: vi.fn(), devoluciones: vi.fn(), registrar: vi.fn(), cerrar: vi.fn(), prestamos: vi.fn(), prestar: vi.fn(), recibir: vi.fn(), reporte: vi.fn(), lotes: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/wmsMultipropositoService.js', () => ({
  MODULOS_WMS_POR_DEFECTO: { consumo: true, venta: false, custodia: false, conteos: true, codigos: true, lotes: true, herramientas: true },
  obtenerConfiguracionWms: vi.fn().mockResolvedValue({ modulos: { consumo: true, codigos: true, lotes: true, herramientas: true }, umbral_aprobacion_ajuste: 500 }),
  listarAlmacenesWms: vi.fn().mockResolvedValue([{ id: 'a1', codigo: 'ALM-001', nombre: 'Principal', proposito: 'consumo_interno', estado: 'activo' }]),
  listarDevoluciones: mocks.devoluciones, registrarDevolucion: mocks.registrar, cerrarDevolucion: mocks.cerrar,
  obtenerPrestamos: mocks.prestamos, prestarHerramienta: mocks.prestar, recibirHerramienta: mocks.recibir,
  obtenerReporteValorizado: mocks.reporte, listarLotes: mocks.lotes, moverLoteACuarentena: vi.fn(),
}));
import { DevolucionesPage } from '../src/zahory-mock/pages/wms/DevolucionesPage.jsx';
import { HerramientasPage } from '../src/zahory-mock/pages/wms/HerramientasPage.jsx';
import { ReporteValorizadoPage } from '../src/zahory-mock/pages/wms/ReporteValorizadoPage.jsx';
import { VencimientosPage } from '../src/zahory-mock/pages/wms/VencimientosPage.jsx';

const esperar = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const texto = nodo => (nodo.children || []).map(h => (typeof h === 'string' ? h : texto(h))).join('');
const boton = (root, etiqueta) => root.root.findAllByType('button').find(b => texto(b).includes(etiqueta));
const enviar = async (root, id) => { const form = root.root.findAllByType('form').find(f => f.props['aria-labelledby'] === id); await act(async () => { form.props.onSubmit({ preventDefault() {} }); await esperar(); }); };

describe('Pantallas WMS PR2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.requestAnimationFrame = fn => fn();
    mocks.sesion = { empresaId: 'e1', estado: 'listo', permiteEscritura: true, sociedadId: 's1', usuario: { id: 'u1' } };
    mocks.rpc.mockImplementation(() => Promise.resolve({ data: true, error: null }));
    mocks.devoluciones.mockResolvedValue({
      devoluciones: [{ id: 'd1', numero: 'DEV-26-0001', origen: 'cliente', estado: 'en_inspeccion', nc_estado: 'no_aplica', motivo: 'Producto no conforme', guia_numero: 'T001-00000003', cliente: 'Minera SAC', almacen_id: 'a1', ubicacion_cuarentena: 'CUA-01', lineas: [{ linea_id: 'l1', codigo: 'QUI-LUB-044', descripcion: 'Grasa', cantidad: 6, unidad: 'UND' }] }],
      guias: [{ id: 'g1', numero: 'T001-00000003', cliente: 'Minera SAC', lineas: [{ material_id: 'm1', codigo: 'QUI-LUB-044', descripcion: 'Grasa', cantidad: 10 }] }],
      ots: [],
    });
    mocks.registrar.mockResolvedValue({ id: 'd2', numero: 'DEV-26-0002' });
    mocks.cerrar.mockResolvedValue({ nc_estado: 'pendiente' });
    mocks.prestamos.mockResolvedValue({
      prestamos: [{ id: 'p1', numero: 'PRE-26-0001', estado: 'activo', codigo: 'HER-MAN-012', descripcion: 'Llave', pendiente: 2, cantidad: 2, personal: 'Juan', personal_codigo: 'TEC-0017', fecha_prestamo: '2026-10-21', fecha_devolucion_prevista: '2026-10-25', dias_vencido: 2 }],
      disponibles: [{ stock_id: 'st1', codigo: 'HER-MAN-012', descripcion: 'Llave', disponible: 5, es_herramienta: true, almacen_codigo: 'ALM-001', ubicacion: 'B-01-1' }],
      personal: [{ id: 'per1', codigo: 'TEC-0017', nombre: 'Juan' }], ots: [],
    });
    mocks.prestar.mockResolvedValue({ numero: 'PRE-26-0002' });
    mocks.reporte.mockResolvedValue({ materiales: [{ material_id: 'm1', codigo: 'QUI', descripcion: 'Grasa', clase: 'A', fisico: 104, costo_promedio: 10, valor: 1040, consumo_12m: 100, sin_salida_90: false }], almacenes: [{ almacen_id: 'a1', codigo: 'ALM-001', nombre: 'Principal', valor: 1040 }] });
    mocks.lotes.mockResolvedValue([]);
  });

  it('Devoluciones: valida por campo al registrar y luego registra con las cantidades', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<DevolucionesPage />); await esperar(); });
    await act(async () => { boton(root, 'Registrar devolución').props.onClick(); });
    await enviar(root, 'dx-wdev-nuevo-t');
    expect(mocks.registrar).not.toHaveBeenCalled();
    expect(texto(root.root)).toContain('Elige la guía de origen.');
    await act(async () => { root.root.findByProps({ id: 'dx-wdev-doc' }).props.onChange({ target: { value: 'g1' } }); });
    await act(async () => { root.root.findByProps({ id: 'dx-wdev-linea_m1' }).props.onChange({ target: { value: '12' } }); });
    await enviar(root, 'dx-wdev-nuevo-t');
    expect(texto(root.root)).toContain('Máximo 10');
    await act(async () => { root.root.findByProps({ id: 'dx-wdev-linea_m1' }).props.onChange({ target: { value: '4' } }); });
    await enviar(root, 'dx-wdev-nuevo-t');
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'e1', origen: 'cliente', referencia_id: 'g1', lineas: [{ material_id: 'm1', cantidad: 4 }] }));
  });

  it('Devoluciones: cierra la inspección repartiendo stock y merma', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<DevolucionesPage />); await esperar(); });
    await act(async () => { root.root.findAllByType('tr').find(tr => texto(tr).includes('DEV-26-0001')).props.onClick(); });
    const merma = root.root.findAllByType('input').find(i => i.props.value === '0');
    await act(async () => { merma.props.onChange({ target: { value: '2' } }); });
    await act(async () => { boton(root, 'Cerrar inspección').props.onClick(); await esperar(); });
    expect(mocks.cerrar).toHaveBeenCalledWith({ empresa_id: 'e1', devolucion_id: 'd1', lineas: [{ linea_id: 'l1', liberar: 4, merma: 2 }] });
    expect(texto(root.root)).toContain('nota de crédito');
  });

  it('Herramientas: muestra todos los errores a la vez y presta con los datos elegidos', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<HerramientasPage />); await esperar(); });
    expect(texto(root.root)).toContain('Vencido 2 días');
    await act(async () => { boton(root, 'Prestar herramienta').props.onClick(); });
    await enviar(root, 'dx-wher-p-t');
    const t = texto(root.root);
    expect(t).toContain('Elige la herramienta.');
    expect(t).toContain('Elige a quién se presta.');
    expect(mocks.prestar).not.toHaveBeenCalled();
    await act(async () => { root.root.findAll(n => n.props?.role === 'option')[0].props.onClick(); });
    await act(async () => { root.root.findByProps({ id: 'dx-wher-persona' }).props.onChange({ target: { value: 'per1' } }); });
    await enviar(root, 'dx-wher-p-t');
    expect(mocks.prestar).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'e1', stock_id: 'st1', cantidad: 1, personal_id: 'per1' }));
  });

  it('Reporte y Vencimientos: renderizan resumen y estado vacío', async () => {
    let rep; let ven;
    await act(async () => { rep = TestRenderer.create(<ReporteValorizadoPage />); ven = TestRenderer.create(<VencimientosPage />); await esperar(); });
    expect(texto(rep.root)).toContain('S/ 1,040.00');
    expect(texto(rep.root)).toContain('1 material');
    expect(texto(ven.root)).toContain('Aún no hay stock con lote');
  });
});
