import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'empresa-1', estado: 'listo', cargando: false, permiteEscritura: true, sociedadId: 'soc-1', vistaConsolidada: false },
  listar: vi.fn(), contexto: vi.fn(), guardar: vi.fn(), revisar: vi.fn(), buscar: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../../src/services/storageService.js', () => ({ subirAdjunto: vi.fn() }));
vi.mock('../src/services/reportesMinaService.js', () => ({
  listarReportesMina: mocks.listar, contextoReporteMina: mocks.contexto, guardarReporteMina: mocks.guardar,
  revisarReporteMina: mocks.revisar, buscarMaterialesMina: mocks.buscar,
}));
import { ReportesMinaPage } from '../src/zahory-mock/pages/ReportesMinaPage.jsx';

const reporte = {
  id: 'pd-1', numero: 'RM-2026-0001', fecha: '2026-10-14', estado: 'en_revision', tecnico_nombre: 'Andre', es_propio: false,
  ot_id: 'ot-1', ot_numero: 'OT-26-0838', mina_id: 'min-1', mina_nombre: 'Mina Altiplano', proyecto_codigo: 'PROY-2026-0001',
  equipo_codigo: 'PC', equipo_marca: 'LENOVO', equipo_modelo: 'PX877', actividad: 'Inspección', avance_pct: 45,
  materiales: [], evidencias: [],
  datos_mina: { turno: 'dia', horas: { trabajadas: 2.1, preventivo: 0.25, standby: 9.65 }, disponibilidad_mecanica: 97.9, horometros: { motor: { inicial: 3588.3, final: 3590.4 } }, estado_equipo: 'operativo' },
};
const ctx = { ots: [{ id: 'ot-1', numero: 'OT-26-0838', mina_nombre: 'Mina Altiplano', proyecto_codigo: 'PROY-2026-0001', avance_pct: 30, horometro_actual: 3500 }], tecnico: { id: 'po-1', nombre: 'Andre' }, tecnicos: [] };

async function renderPage(props = {}) {
  let root;
  await act(async () => { root = TestRenderer.create(<ReportesMinaPage {...props} />); await new Promise(resolve => setTimeout(resolve, 0)); });
  return root;
}
const texto = node => (Array.isArray(node.children) ? node.children.map(c => (typeof c === 'string' ? c : texto(c))).join('') : '');
const boton = (root, etiqueta) => root.root.findAllByType('button').find(b => texto(b).includes(etiqueta));

describe('ReportesMinaPage', () => {
  beforeEach(() => {
    mocks.sesion = { empresaId: 'empresa-1', estado: 'listo', cargando: false, permiteEscritura: true, sociedadId: 'soc-1', vistaConsolidada: false };
    mocks.listar.mockReset().mockResolvedValue({ reportes: [reporte], permisos: { crear: true, aprobar: true } });
    mocks.contexto.mockReset().mockResolvedValue(ctx);
    mocks.guardar.mockReset().mockResolvedValue({ id: 'pd-2', numero: 'RM-2026-0002', estado: 'borrador' });
    mocks.revisar.mockReset().mockResolvedValue({ estado: 'aprobado' });
    mocks.buscar.mockReset().mockResolvedValue([]);
    vi.stubGlobal('window', { scrollTo: vi.fn() });
  });

  it('lista los reportes con la sociedad operativa y filas accesibles', async () => {
    const root = await renderPage();
    expect(mocks.listar).toHaveBeenCalledWith({ empresa_id: 'empresa-1', sociedad_id: 'soc-1' });
    const filas = root.root.findAll(n => n.props.className === 'dx-ui-row');
    expect(filas).toHaveLength(1);
    expect(filas[0].props.role).toBe('button');
    expect(filas[0].props.tabIndex).toBe(0);
    expect(texto(filas[0])).toContain('RM-2026-0001');
    expect(texto(filas[0])).toContain('PC · LENOVO PX877');
  });

  it('en vista consolidada no pasa sociedad y deshabilita «Nuevo reporte»', async () => {
    mocks.sesion = { ...mocks.sesion, vistaConsolidada: true, permiteEscritura: false };
    const root = await renderPage();
    expect(mocks.listar).toHaveBeenCalledWith({ empresa_id: 'empresa-1', sociedad_id: null });
    expect(boton(root, 'Nuevo reporte').props.disabled).toBe(true);
  });

  it('abre la revisión con teclado y aprueba', async () => {
    const root = await renderPage();
    const fila = root.root.find(n => n.props.className === 'dx-ui-row');
    await act(async () => { fila.props.onKeyDown({ key: 'Enter', preventDefault: () => {} }); });
    expect(texto(root.root)).toContain('Al aprobar');
    await act(async () => { await boton(root, 'Aprobar reporte').props.onClick(); });
    expect(mocks.revisar).toHaveBeenCalledWith({ empresa_id: 'empresa-1', parte_id: 'pd-1', accion: 'aprobar', observacion: null });
  });

  it('observar exige escribir la observación', async () => {
    const root = await renderPage();
    await act(async () => { root.root.find(n => n.props.className === 'dx-ui-row').props.onClick(); });
    await act(async () => { await boton(root, 'Observar').props.onClick(); });
    expect(mocks.revisar).not.toHaveBeenCalled();
    expect(texto(root.root)).toContain('Escribe la observación para el técnico.');
  });

  it('el formulario nuevo valida antes de enviar y guarda borrador', async () => {
    const root = await renderPage({ vistaInicial: 'nuevo' });
    expect(mocks.contexto).toHaveBeenCalled();
    expect(texto(root.root)).toContain('Nuevo reporte de mina');
    await act(async () => { await boton(root, 'Enviar a revisión').props.onClick(); });
    expect(mocks.guardar).not.toHaveBeenCalled();
    expect(texto(root.root)).toMatch(/horómetro de motor/);
    await act(async () => { await boton(root, 'Guardar borrador').props.onClick(); });
    expect(mocks.guardar).toHaveBeenCalledTimes(1);
    const llamada = mocks.guardar.mock.calls[0][0];
    expect(llamada.enviar).toBe(false);
    expect(llamada.reporte.ot_id).toBe('ot-1');
    expect(llamada.reporte.horometros.motor.inicial).toBe('3500');
  });

  it('muestra estado vacío cuando no hay reportes', async () => {
    mocks.listar.mockResolvedValue({ reportes: [], permisos: { crear: false, aprobar: false } });
    const root = await renderPage();
    expect(texto(root.root)).toContain('Aún no hay reportes de mina.');
    expect(boton(root, 'Nuevo reporte')).toBeUndefined();
  });

  it('al corregir un reporte observado, lo ya pedido queda bloqueado y el texto de retorno no promete avisos', async () => {
    const observado = {
      ...reporte, estado: 'observado', es_propio: true,
      datos_mina: { ...reporte.datos_mina, estado_equipo: 'retorno', motivo_retorno: 'Falla de bomba',
        revision: { accion: 'observar', observacion: 'Agrega el tubo' },
        pedido: [{ material_id: 'm1', codigo: 'QUI-LUB-044', descripcion: 'Grasa', unidad: 'UND', cantidad: 1, urgente: false }],
        pedido_resultado: { lineas: [{ material_id: 'm1', reservado: 1, faltante: 0 }] } },
    };
    mocks.listar.mockResolvedValue({ reportes: [observado], permisos: { crear: true, aprobar: false } });
    const root = await renderPage();
    await act(async () => { root.root.find(n => n.props.className === 'dx-ui-row').props.onClick(); });
    await act(async () => { await boton(root, 'Corregir y reenviar').props.onClick(); });
    const cantidad = root.root.find(n => n.type === 'input' && n.props['aria-label'] === 'Cantidad pedida de QUI-LUB-044');
    expect(cantidad.props.disabled).toBe(true);
    expect(texto(root.root)).toContain('ya en la reserva de la OT');
    expect(texto(root.root)).toContain('Agrega el tubo');
    expect(texto(root.root)).not.toContain('planner');
  });
});
