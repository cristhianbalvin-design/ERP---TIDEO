import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ of: null, partes: [], avance: null, registrar: vi.fn(), revisar: vi.fn() }));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => ({ estado: 'listo', empresaId: 'e1' }) }));
vi.mock('../src/useCompactWorkMode.js', () => ({ useCompactWorkMode: () => {} }));
vi.mock('../src/services/ordenFabricacionService.js', () => ({
  obtenerOF: vi.fn(() => Promise.resolve(mocks.of)),
  obtenerCatalogoEdicionOF: vi.fn(() => Promise.resolve({ puede_editar: true, puede_aprobar: true, trabajos: [], actividades: [], tareas: [], cargos: [], equipos: [] })),
  listarMaterialesOF: vi.fn(() => Promise.resolve([])),
  guardarOperacionOF: vi.fn(), quitarOperacionOF: vi.fn(), guardarMaterialOF: vi.fn(), quitarMaterialOF: vi.fn(), aprobarOF: vi.fn(),
  obtenerCalidadOF: vi.fn(() => Promise.resolve({ estado: 'borrador', caracteristicas: [], mediciones: [], no_conformidades: [] })),
  enviarACalidadOF: vi.fn(), liberarOF: vi.fn(), medirCalidadOF: vi.fn(), abrirNoConformidadOF: vi.fn(), cerrarNoConformidadOF: vi.fn(),
  obtenerCatalogoAvanceOF: vi.fn(() => Promise.resolve(mocks.avance)),
  listarPartesOF: vi.fn(() => Promise.resolve(mocks.partes)),
  obtenerReservasOF: vi.fn(() => Promise.resolve(mocks.reservas || { demanda_id: null, almacen: '', lineas: [] })),
  registrarParteOF: mocks.registrar,
  revisarParteOF: mocks.revisar,
}));

import { DetalleOFPage } from '../src/zahory-mock/pages/of/DetalleOFPage.jsx';
import { datosAvance, etiquetasReserva, resumenProduccion, resumenReservas, validarAvance, validarRevision } from '../src/zahory-mock/pages/of/ofAvanceLogic.js';

const esperar = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const texto = nodo => (nodo.children || []).map(h => (typeof h === 'string' ? h : texto(h))).join('');
const botones = root => root.root.findAllByType('button');
const control = (root, id) => root.root.find(n => ['input', 'select', 'textarea'].includes(n.type) && n.props.id === id);
const boton = (root, etiqueta) => botones(root).find(b => texto(b).includes(etiqueta) || b.props['aria-label'] === etiqueta);

const OP = { secuencia: 1, trabajo: 'Fabricación', actividad: 'Vástago', cargo: 'Técnico', horas_maquina: 0, costo: 0, equipo: '', bahia: '' };
const OF_BASE = {
  id: 'of1', numero: 'OF-26-0003', estado: 'aprobada', moneda: 'PEN', descripcion: 'Vástago', cliente: 'Cliente Demo',
  costo_estimado: 200, costo_real: 0, avance_pct: 0, os: { numero: 'OSC-1', tipo_ejecucion: 'fabricacion' }, hoja: null,
  operaciones: [
    { ...OP, id: 'op1', tarea: 'Torneado', horas: 4, horas_reales: 0, avance_pct: 0, estado: 'pendiente' },
    { ...OP, id: 'op2', secuencia: 2, tarea: 'Rectificado', horas: 6, horas_reales: 0, avance_pct: 0, estado: 'pendiente' },
  ],
  materiales: [],
};
const PARTE = { id: 'pd1', numero: 'PD-2026-0001', fecha: '2026-11-12', estado: 'en_revision', operacion_id: 'op1', secuencia: 1, operacion: 'Torneado', tecnico: 'M. Torres', horas: 2, avance_reportado: 50, avance_validado: null, detalle: 'Desbaste', costo: null, horas_operacion: 0, horas_estimadas: 4 };

async function montar() {
  let root;
  await act(async () => { root = TestRenderer.create(<DetalleOFPage routeParams={{ id: 'of1' }} onNav={() => {}} />); await esperar(); });
  return root;
}

describe('lógica del avance por partes', () => {
  it('valida el parte por campo, sin fechas futuras y con 2 decimales', () => {
    const errs = validarAvance({ operacion_id: '', tecnico_id: '', fecha: '2026-11-13', horas: '0', avance: '101' }, '2026-11-12');
    expect(Object.keys(errs).sort()).toEqual(['avance', 'fecha', 'horas', 'operacion_id', 'tecnico_id']);
    expect(errs.fecha).toBe('La fecha no puede ser futura.');
    expect(validarAvance({ operacion_id: 'o', tecnico_id: 't', fecha: '2026-11-12', horas: '1.234', avance: '10' }, '2026-11-12').horas).toBe('Usa un número con máximo 2 decimales.');
    expect(validarAvance({ operacion_id: 'o', tecnico_id: 't', fecha: '2026-11-12', horas: '1,5', avance: '30' }, '2026-11-12')).toEqual({});
    expect(datosAvance({ operacion_id: 'o', tecnico_id: 't', fecha: '2026-11-12', horas: '1,5', avance: '30', detalle: ' x ' })).toEqual({ operacion_id: 'o', tecnico_id: 't', fecha: '2026-11-12', horas: '1.5', avance: '30', detalle: 'x' });
  });

  it('exige observación al observar o al cambiar el avance reportado', () => {
    expect(validarRevision('observar', { observacion: '' }, PARTE)).toEqual({ observacion: 'Indica qué hay que corregir.' });
    expect(validarRevision('aprobar', { avance: '50', observacion: '' }, PARTE)).toEqual({});
    expect(validarRevision('aprobar', { avance: '60', observacion: '' }, PARTE)).toEqual({ observacion: 'Indica por qué cambias el avance reportado.' });
    expect(validarRevision('aprobar', { avance: '60', observacion: 'Medido en taller' }, PARTE)).toEqual({});
  });

  it('resume horas, partes por aprobar y costo real', () => {
    const of = { ...OF_BASE, avance_pct: 80, operaciones: [{ horas: 4, horas_reales: 2 }, { horas: 6, horas_reales: 3 }], materiales: [{ cantidad_real: 2, costo_unitario: 10 }] };
    expect(resumenProduccion(of, [PARTE, { ...PARTE, estado: 'aprobado', costo: 49.08 }])).toEqual({ avance: 80, horasReales: 5, horasEstimadas: 10, porAprobar: 1, manoObra: 49.08, materiales: 20 });
  });
});

describe('reservas WMS de la OF (F3c)', () => {
  it('etiqueta reservado, despachado y faltante con su SOLPE', () => {
    expect(etiquetasReserva(null, 'UND')).toEqual([{ tono: 'gray', texto: 'Sin reserva' }]);
    expect(etiquetasReserva({ en_pedido: true, cantidad: 12, reservada: 7, despachada: 5, faltante: 0 }, 'UND').map(t => t.texto))
      .toEqual(['Despachado 5 UND', 'Reservado 7 UND · por despachar']);
    expect(etiquetasReserva({ en_pedido: true, cantidad: 12, reservada: 6, despachada: 0, faltante: 6, solpe: 'SLP-OF-1' }, 'UND').map(t => t.tono))
      .toEqual(['blue', 'warn']);
    expect(resumenReservas({ lineas: [{ en_pedido: true, faltante: 0 }, { en_pedido: true, faltante: 6 }, { en_pedido: false, faltante: 0 }] }))
      .toMatchObject({ total: 2, completas: 1 });
  });

  it('la ficha aprobada avisa el faltante con su SOLPE y muestra la reserva por material', async () => {
    mocks.of = { ...structuredClone(OF_BASE), materiales: [
      { id: 'm1', material_id: 'x1', descripcion: 'Rodamiento', unidad: 'UND', cantidad: 12, costo_unitario: 1, subtotal: 12, origen: 'stock' },
      { id: 'm2', material_id: 'x2', descripcion: 'Bomba', unidad: 'UND', cantidad: 2, costo_unitario: 1, subtotal: 2, origen: 'stock' },
    ] };
    mocks.partes = [];
    mocks.avance = { puede_registrar: true, puede_revisar: true, tecnicos: [] };
    mocks.reservas = { demanda_id: 'd1', almacen: 'Almacén Central', lineas: [
      { of_material_id: 'm1', en_pedido: true, cantidad: 12, reservada: 12, despachada: 0, faltante: 0 },
      { of_material_id: 'm2', en_pedido: true, cantidad: 2, reservada: 1, despachada: 0, faltante: 1, solpe: 'SLP-OF-1' },
    ] };
    const root = await montar();
    const aviso = texto(root.root.findByProps({ className: 'dx-ofd-notice is-warn' }));
    expect(aviso).toContain('Se reservaron 1 de 2 materiales en Almacén Central.');
    expect(aviso).toContain('Falta 1 UND de Bomba: va a Compras en la SOLPE SLP-OF-1.');
    await act(async () => { boton(root, 'Materiales · 2').props.onClick(); await esperar(); });
    expect(root.root.findAllByProps({ className: 'dx-ofd-tag is-warn' }).map(texto)).toEqual(['Falta 1 UND · SOLPE SLP-OF-1']);
    mocks.reservas = null;
  });
});

describe('avance en la ficha de la OF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.of = structuredClone(OF_BASE);
    mocks.partes = [];
    mocks.avance = { puede_registrar: true, puede_revisar: true, tecnicos: [{ id: 't1', nombre: 'M. Torres' }] };
    mocks.registrar.mockResolvedValue({ id: 'pd1', numero: 'PD-2026-0001', estado: 'en_revision' });
    mocks.revisar.mockResolvedValue({ estado: 'en_produccion', avance_pct: 20, costo_real: 49.08 });
  });

  it('aprobada: registra un avance validando antes y lo envía a revisión', async () => {
    const root = await montar();
    expect(boton(root, 'Partes · 0')).toBeTruthy();
    await act(async () => { boton(root, 'Registrar avance').props.onClick(); await esperar(); });
    const form = () => root.root.findAllByType('form').find(f => f.props.id === 'dx-ofd-form-avance');
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await esperar(); });
    expect(root.root.findAllByProps({ className: 'dx-ui-field-error' }).length).toBe(4);
    expect(mocks.registrar).not.toHaveBeenCalled();

    const cambiar = (id, valor) => control(root, id).props.onChange({ target: { value: valor } });
    await act(async () => { cambiar('ofa-operacion_id', 'op1'); cambiar('ofa-tecnico_id', 't1'); cambiar('ofa-horas', '2'); cambiar('ofa-avance', '50'); await esperar(); });
    expect(root.root.findAllByProps({ className: 'dx-ui-field-hint' }).map(texto)).toContain('Estimado: 4 h · lleva 0 h · avance 0 %');
    mocks.partes = [PARTE];
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await esperar(); });
    expect(mocks.registrar).toHaveBeenCalledWith('of1', expect.objectContaining({ operacion_id: 'op1', tecnico_id: 't1', horas: '2', avance: '50' }));
    expect(texto(root.root.findByProps({ className: 'dx-ofd-toast' }))).toBe('Parte PD-2026-0001 enviado a revisión.');
    expect(boton(root, 'Revisar PD-2026-0001')).toBeTruthy();
  });

  it('en producción: KPI, ruta con avance y revisión que exige motivo al cambiar el avance', async () => {
    mocks.of = { ...structuredClone(OF_BASE), estado: 'en_produccion', avance_pct: 20, costo_real: 49.08,
      operaciones: [{ ...OF_BASE.operaciones[0], horas_reales: 2, avance_pct: 50, estado: 'en_proceso' }, OF_BASE.operaciones[1]] };
    mocks.partes = [PARTE];
    const root = await montar();
    const kpis = root.root.findAllByProps({ className: 'dx-ui-kpi' }).map(texto);
    expect(kpis).toEqual(['20 %Avance ponderado', '2 hHoras reales de 10 h', 'S/ 49.08Costo real', '1Parte por aprobar']);
    expect(root.root.findAllByProps({ className: 'dx-ofd-o-bah dx-ofd-progress' }).map(texto)).toEqual(['50 %', '0 %']);

    await act(async () => { boton(root, 'Partes · 1').props.onClick(); await esperar(); });
    await act(async () => { boton(root, 'Revisar PD-2026-0001').props.onClick(); await esperar(); });
    await act(async () => { control(root, 'ofr-avance').props.onChange({ target: { value: '60' } }); await esperar(); });
    await act(async () => { boton(root, 'Aprobar parte').props.onClick(); await esperar(); });
    expect(texto(root.root.findByProps({ id: 'ofr-observacion-err' }))).toBe('Indica por qué cambias el avance reportado.');
    expect(mocks.revisar).not.toHaveBeenCalled();
    await act(async () => { control(root, 'ofr-observacion').props.onChange({ target: { value: 'Medido' } }); await esperar(); });
    await act(async () => { boton(root, 'Aprobar parte').props.onClick(); await esperar(); });
    expect(mocks.revisar).toHaveBeenCalledWith('pd1', 'aprobar', 60, 'Medido');
    expect(texto(root.root.findByProps({ className: 'dx-ofd-toast' }))).toBe('Parte aprobado: avance y costo real actualizados.');
  });

  it('sin permiso de revisión no muestra Revisar ni Registrar avance', async () => {
    mocks.avance = { puede_registrar: false, puede_revisar: false, tecnicos: [] };
    mocks.partes = [PARTE];
    const root = await montar();
    expect(boton(root, 'Registrar avance')).toBeFalsy();
    await act(async () => { boton(root, 'Partes · 1').props.onClick(); await esperar(); });
    expect(boton(root, 'Revisar PD-2026-0001')).toBeFalsy();
  });
});
