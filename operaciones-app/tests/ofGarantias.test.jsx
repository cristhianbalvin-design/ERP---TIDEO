import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { validarReclamo, datosReclamo, etiquetaSituacion, tonoReclamo, filtrarGarantias, textoCostoPorMoneda } from '../src/zahory-mock/pages/of/ofGarantiasLogic.js';
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => ({ estado: 'listo', empresaId: 'e1' }) }));
vi.mock('../src/services/ofGarantiasService.js', () => ({
  listarGarantias: () => Promise.resolve({ kpis: { vigentes: 3, vencen_30: 1, reclamos_abiertos: 2, costo_no_facturable: { PEN: 150 } }, filas: [{ id: 'g1', numero: 'GAR-1', serie: 'SER-1', cliente: 'Cliente', of_numero: 'OF-1', unidad_id: 'u1', situacion: 'vigente' }] }),
  obtenerPasaporte: () => Promise.resolve({ unidad: { id: 'u1', unidad: 1, serie: 'SER-1' }, of: { id: 'of1', numero: 'OF-1' }, reclamos: [] }),
  buscarPasaportes: vi.fn(), registrarReclamo: vi.fn(), evaluarReclamo: vi.fn(), crearOFGarantia: vi.fn(), subirFotoReclamo: vi.fn(),
}));
vi.mock('../src/services/ordenFabricacionService.js', () => ({ obtenerOF: () => Promise.resolve({ operaciones: [] }), listarPartesOF: () => Promise.resolve([]), obtenerReservasOF: () => Promise.resolve({ lineas: [] }), obtenerCalidadOF: () => Promise.resolve({ mediciones: [], no_conformidades: [] }) }));
vi.mock('../src/services/ofEntregaService.js', () => ({ urlsFirmadasEntrega: vi.fn() }));
import { OFGarantiasPage } from '../src/zahory-mock/pages/of/OFGarantiasPage.jsx';
import { OFPasaportePage } from '../src/zahory-mock/pages/of/OFPasaportePage.jsx';
import { OFEntregaUnidades } from '../src/zahory-mock/pages/of/OFEntregaPanel.jsx';
describe('garantias y pasaporte', () => {
  it('abre el pasaporte desde la fila de unidad', () => {
    const onVerPasaporte = vi.fn();
    const root = TestRenderer.create(<OFEntregaUnidades datos={{ unidades: [{ id: 'u1', unidad: 1, serie: 'SER-1' }] }} onVerPasaporte={onVerPasaporte} />);
    const boton = root.root.findByType('button');
    expect(boton.children).toContain('Ver pasaporte');
    act(() => boton.props.onClick());
    expect(onVerPasaporte).toHaveBeenCalledWith('u1');
    root.unmount();
  });
  it('valida todos los errores y arma el contrato', () => {
    const f = { fecha: '2026-12-01', falla: 'mal', evaluacion: 'no_procede', observacion: '', fotos: Array(7).fill({}) };
    expect(Object.keys(validarReclamo(f, {}, '2026-11-14'))).toEqual(['fecha', 'falla', 'observacion', 'fotos']);
    expect(datosReclamo({ ...f, falla: ' Falla real ', observacion: ' detalle ' }, [{ path: 'foto' }], true)).toMatchObject({ falla: 'Falla real', observacion: 'detalle', fotos: [{ path: 'foto' }], crear_of: true });
    expect(etiquetaSituacion('vence_pronto')).toBe('Vence pronto'); expect(tonoReclamo('cerrado')).toBe('green');
    expect(textoCostoPorMoneda({ PEN: 12, USD: 5 })).toContain('PEN 12.00');
    expect(filtrarGarantias([{ serie: 'ABC', situacion: 'vigente' }], 'abc', 'vigente')).toHaveLength(1);
  });
  it('muestra indicadores y reclamo en el listado', async () => {
    let root; await act(async () => { root = TestRenderer.create(<OFGarantiasPage />); for (let i = 0; i < 10; i++) await Promise.resolve(); });
    const contenido = JSON.stringify(root.toJSON()); expect(contenido).toContain('GAR-1'); expect(contenido).toContain('SER-1'); expect(contenido).toContain('Vigentes'); expect(contenido).toContain('PEN 150.00'); expect(contenido).toContain('Registrar reclamo');
    await act(async () => root.unmount());
  });
  it('muestra el pasaporte de la unidad', async () => {
    let root; await act(async () => { root = TestRenderer.create(<OFPasaportePage routeParams={{ id: 'u1' }} />); for (let i = 0; i < 20; i++) await Promise.resolve(); });
    const contenido = JSON.stringify(root.toJSON()); expect(contenido).toContain('SER-1'); expect(contenido).toContain('OF-1'); expect(contenido).toContain('Ruta ejecutada');
    await act(async () => root.unmount());
  });
});
