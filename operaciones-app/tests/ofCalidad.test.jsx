import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ of: null, calidad: null, medir: vi.fn(), liberar: vi.fn(), enviar: vi.fn() }));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => ({ estado: 'listo', empresaId: 'e1' }) }));
vi.mock('../src/useCompactWorkMode.js', () => ({ useCompactWorkMode: () => {} }));
vi.mock('../src/services/diagnosticoFabricacionService.js', () => ({ firmarRutasPlanos: vi.fn(() => Promise.resolve(new Map())) }));
vi.mock('../src/services/ordenFabricacionService.js', () => ({
  obtenerOF: vi.fn(() => Promise.resolve(mocks.of)),
  obtenerCatalogoEdicionOF: vi.fn(() => Promise.resolve({ puede_editar: true, puede_aprobar: true, trabajos: [], actividades: [], tareas: [], cargos: [], equipos: [] })),
  listarMaterialesOF: vi.fn(() => Promise.resolve([])),
  guardarOperacionOF: vi.fn(), quitarOperacionOF: vi.fn(), guardarMaterialOF: vi.fn(), quitarMaterialOF: vi.fn(), aprobarOF: vi.fn(),
  obtenerCalidadOF: vi.fn(() => Promise.resolve(mocks.calidad)),
  enviarACalidadOF: mocks.enviar,
  liberarOF: mocks.liberar,
  medirCalidadOF: mocks.medir,
  abrirNoConformidadOF: vi.fn(),
  cerrarNoConformidadOF: vi.fn(),
  obtenerCatalogoAvanceOF: vi.fn(() => Promise.resolve({ puede_registrar: false, puede_revisar: false, tecnicos: [] })),
  listarPartesOF: vi.fn(() => Promise.resolve([])),
  registrarParteOF: vi.fn(),
  revisarParteOF: vi.fn(),
}));

import { DetalleOFPage } from '../src/zahory-mock/pages/of/DetalleOFPage.jsx';
import { esConforme, normalizarCalidad, piezasDeCalidad, resultadoUnidad, resumenCalidad, textoTolerancia } from '../src/zahory-mock/pages/of/ofCalidadLogic.js';

const esperar = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const texto = nodo => (nodo.children || []).map(h => (typeof h === 'string' ? h : texto(h))).join('');
const boton = (root, etiqueta) => root.root.findAllByType('button').find(b => texto(b).includes(etiqueta));

const CRIT = { id: 'c1', pieza_id: 'p1', pieza_nombre: 'Eje', pieza_orden: 1, pieza_cantidad: 2, numero: 1, nombre: 'Ø cuerpo', parte: 'Cuerpo central', tipo_control: 'medida', nominal: '60', unidad: 'mm', tol_menos: '0.02', tol_mas: '0.05', critica: true, pos_x: 50, pos_y: 50 };
const OPC = { ...CRIT, id: 'c2', numero: 2, nombre: 'Largo total', nominal: '420', tol_menos: '0.5', tol_mas: '0.5', critica: false };
const VIS = { ...CRIT, id: 'c3', numero: 3, nombre: 'Acabado', tipo_control: 'visual', nominal: null, nominal_texto: 'Sin rebabas', tol_menos: null, tol_mas: null, critica: true };

const OF_BASE = {
  id: 'of1', numero: 'OF-26-0002', estado: 'en_calidad', moneda: 'PEN', descripcion: 'Eje', cliente: 'Cliente Demo',
  costo_estimado: 0, costo_real: 0, avance_pct: 100, os: { numero: 'OSC-1', tipo_ejecucion: 'fabricacion' }, hoja: { numero: 'HC-1' },
  operaciones: [], materiales: [],
};

describe('reglas de calidad de la OF', () => {
  it('evalúa la tolerancia como la base de datos', () => {
    const [c] = normalizarCalidad({ caracteristicas: [CRIT] }).caracteristicas;
    expect(esConforme(c, '60,05')).toBe(true);
    expect(esConforme(c, '59.98')).toBe(true);
    expect(esConforme(c, '60.08')).toBe(false);
    expect(esConforme(c, '')).toBeNull();
    expect(textoTolerancia(c)).toBe('−0.02 / +0.05');
  });

  it('resume críticas por unidad, fuera de tolerancia, NC y opcionales', () => {
    const cal = normalizarCalidad({
      caracteristicas: [CRIT, OPC, VIS],
      mediciones: [
        { caracteristica_id: 'c1', unidad: 1, valor: 60.03, conforme: true },
        { caracteristica_id: 'c1', unidad: 2, valor: 60.08, conforme: false },
        { caracteristica_id: 'c2', unidad: 1, valor: 420.2, conforme: true },
        { caracteristica_id: 'c3', unidad: 1, valor: null, conforme: true },
      ],
      no_conformidades: [{ id: 'n1', caracteristica_id: 'c1', unidad: 2, estado: 'abierta', disposicion: 'reprocesar' }],
    });
    const r = resumenCalidad(cal);
    expect(r).toMatchObject({ criticasOk: 2, criticasTotal: 4, fuera: 1, ncAbiertas: 1, opcionalesMedidas: 1, opcionalesTotal: 2, liberable: false });
  });

  it('una unidad aceptada por concesión cuenta como crítica OK', () => {
    const cal = normalizarCalidad({
      caracteristicas: [{ ...CRIT, pieza_cantidad: 1 }],
      mediciones: [{ caracteristica_id: 'c1', unidad: 1, valor: 60.08, conforme: false }],
      no_conformidades: [{ id: 'n1', caracteristica_id: 'c1', unidad: 1, estado: 'cerrada', disposicion: 'concesion' }],
    });
    expect(resultadoUnidad(cal.caracteristicas[0], { ...cal.mediciones[0] }, cal.noConformidades)).toBe('concesion');
    expect(resumenCalidad(cal).liberable).toBe(true);
  });

  it('agrupa por pieza con su plano de la ficha', () => {
    const cal = normalizarCalidad({ caracteristicas: [OPC, CRIT], ficha: { version: 2, piezas: [{ id: 'p1', svg: '<svg></svg>' }] } });
    const [p] = piezasDeCalidad(cal.caracteristicas, cal.ficha);
    expect(p.caracteristicas.map(c => c.numero)).toEqual([1, 2]);
    expect(p.ficha.svg).toBe('<svg></svg>');
  });
});

describe('pestaña Calidad en la ficha de la OF', () => {
  beforeEach(() => {
    mocks.of = { ...OF_BASE };
    mocks.calidad = {
      estado: 'en_calidad', puede_enviar: true, puede_inspeccionar: true, puede_liberar: true,
      ficha: { version: 2, piezas: [{ id: 'p1', svg: '<svg viewBox="0 0 10 10"></svg>' }] },
      caracteristicas: [CRIT],
      mediciones: [{ caracteristica_id: 'c1', unidad: 1, valor: 60.03, conforme: true }],
      no_conformidades: [],
    };
    mocks.medir.mockReset().mockResolvedValue({});
    mocks.liberar.mockReset().mockResolvedValue({ estado: 'lista_entrega' });
  });

  it('muestra Calidad, bloquea Liberar sin críticas completas y guarda la medición al salir del campo', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<DetalleOFPage routeParams={{ id: 'of1' }} onNav={() => {}} />); await esperar(); });
    const liberar = boton(root, 'Liberar OF');
    expect(liberar.props.disabled).toBe(true);
    await act(async () => { boton(root, 'Calidad').props.onClick(); await esperar(); });
    expect(texto(root.root)).toContain('Críticas OK');
    const input = root.root.findAll(n => n.type === 'input' && n.props['aria-label'] === 'Ø cuerpo, unidad 2')[0];
    await act(async () => { input.props.onChange({ target: { value: '60,04' } }); });
    const input2 = root.root.findAll(n => n.type === 'input' && n.props['aria-label'] === 'Ø cuerpo, unidad 2')[0];
    await act(async () => { input2.props.onBlur(); await esperar(); });
    expect(mocks.medir).toHaveBeenCalledWith('c1', 2, 60.04, null);
  });

  it('libera cuando las críticas están OK y no hay NC abiertas', async () => {
    mocks.calidad.mediciones.push({ caracteristica_id: 'c1', unidad: 2, valor: 60.04, conforme: true });
    let root;
    await act(async () => { root = TestRenderer.create(<DetalleOFPage routeParams={{ id: 'of1' }} onNav={() => {}} />); await esperar(); });
    const liberar = boton(root, 'Liberar OF');
    expect(liberar.props.disabled).toBe(false);
    await act(async () => { liberar.props.onClick(); await esperar(); });
    const confirmar = root.root.findAllByType('button').filter(b => texto(b) === 'Liberar OF').pop();
    await act(async () => { confirmar.props.onClick(); await esperar(); });
    expect(mocks.liberar).toHaveBeenCalledWith('of1');
  });

  it('ofrece Enviar a calidad en una OF aprobada', async () => {
    mocks.of = { ...OF_BASE, estado: 'aprobada' };
    mocks.calidad = { ...mocks.calidad, estado: 'aprobada', caracteristicas: [], mediciones: [] };
    let root;
    await act(async () => { root = TestRenderer.create(<DetalleOFPage routeParams={{ id: 'of1' }} onNav={() => {}} />); await esperar(); });
    expect(boton(root, 'Enviar a calidad')).toBeTruthy();
    expect(boton(root, 'Liberar OF')).toBeFalsy();
  });
});
