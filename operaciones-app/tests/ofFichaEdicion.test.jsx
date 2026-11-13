import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ of: null, catalogo: null, guardarOp: vi.fn(), aprobar: vi.fn() }));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => ({ estado: 'listo', empresaId: 'e1' }) }));
vi.mock('../src/useCompactWorkMode.js', () => ({ useCompactWorkMode: () => {} }));
vi.mock('../src/services/ordenFabricacionService.js', () => ({
  obtenerOF: vi.fn(() => Promise.resolve(mocks.of)),
  obtenerCatalogoEdicionOF: vi.fn(() => Promise.resolve(mocks.catalogo)),
  listarMaterialesOF: vi.fn(() => Promise.resolve([{ id: 'mat1', codigo: 'MEC-ROD-102', descripcion: 'Rodamiento 6204', unidad: 'UND', costo_unitario: 25, disponible: 1 }])),
  guardarOperacionOF: mocks.guardarOp,
  quitarOperacionOF: vi.fn(),
  guardarMaterialOF: vi.fn(),
  quitarMaterialOF: vi.fn(),
  aprobarOF: mocks.aprobar,
  obtenerCalidadOF: vi.fn(() => Promise.resolve({ estado: 'borrador', caracteristicas: [], mediciones: [], no_conformidades: [] })),
  enviarACalidadOF: vi.fn(),
  liberarOF: vi.fn(),
  medirCalidadOF: vi.fn(),
  abrirNoConformidadOF: vi.fn(),
  cerrarNoConformidadOF: vi.fn(),
  obtenerCatalogoAvanceOF: vi.fn(() => Promise.resolve({ puede_registrar: false, puede_revisar: false, tecnicos: [] })),
  listarPartesOF: vi.fn(() => Promise.resolve([])),
  registrarParteOF: vi.fn(),
  revisarParteOF: vi.fn(),
}));

import { DetalleOFPage } from '../src/zahory-mock/pages/of/DetalleOFPage.jsx';
import {
  costoTarea, datosTarea, hayCambios, opcionesPosicion, primerError, resumenAprobacion, textoStock, validarMaterial, validarTarea,
} from '../src/zahory-mock/pages/of/ofFichaLogic.js';

const esperar = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
const texto = nodo => (nodo.children || []).map(h => (typeof h === 'string' ? h : texto(h))).join('');
const botones = root => root.root.findAllByType('button');
const boton = (root, etiqueta) => botones(root).find(b => texto(b).includes(etiqueta) || b.props['aria-label'] === etiqueta);

const OF_BASE = {
  id: 'of1', numero: 'OF-26-0001', estado: 'borrador', moneda: 'PEN', descripcion: 'Vástago', cliente: 'Cliente Demo',
  costo_estimado: 106.9, costo_real: 0, avance_pct: 0, os: { numero: 'OSC-1', tipo_ejecucion: 'fabricacion' }, hoja: null,
  operaciones: [
    { id: 'op1', secuencia: 1, trabajo: 'Fabricación', actividad: 'Vástago', tarea: 'Torneado', cargo: 'Técnico', horas: 6, horas_maquina: 4, costo: 81.9, equipo: 'Torno', bahia: 'Mecanizado', estado: 'pendiente', familia_trabajo_id: 't1', actividad_id: 'a1', tarea_id: 'ta1', cargo_id: 'c1', activo_id: 'eq1' },
  ],
  materiales: [{ id: 'l1', material_id: 'mat1', descripcion: 'Rodamiento 6204', unidad: 'UND', cantidad: 2, costo_unitario: 12.5, subtotal: 25, origen: 'stock', operacion_id: 'op1', no_planificado: false, motivo: '' }],
};
const CATALOGO = {
  moneda: 'PEN', puede_editar: true, puede_aprobar: true,
  trabajos: [{ id: 't1', nombre: 'Fabricación' }], actividades: [{ id: 'a1', nombre: 'Vástago', familia_trabajo_id: 't1' }],
  tareas: [{ id: 'ta1', nombre: 'Torneado' }], cargos: [{ id: 'c1', nombre: 'Técnico', costo_hora: 12.5 }, { id: 'c2', nombre: 'Sin tarifa', costo_hora: null }],
  equipos: [{ id: 'eq1', codigo: 'TOR-1', nombre: 'Torno', costo_hora: 1.725, bahia: 'Mecanizado' }],
};

async function montar() {
  let root;
  await act(async () => { root = TestRenderer.create(<DetalleOFPage routeParams={{ id: 'of1' }} onNav={() => {}} />); await esperar(); });
  return root;
}

describe('lógica de la ficha editable de la OF', () => {
  it('valida la tarea por campo y respeta 2 decimales', () => {
    const errs = validarTarea({ horas_estimadas: '0', horas_maquina: '1.234' });
    expect(Object.keys(errs).sort()).toEqual(['actividad_id', 'cargo_id', 'familia_trabajo_id', 'horas_estimadas', 'horas_maquina', 'posicion', 'tarea_id']);
    expect(errs.horas_estimadas).toBe('Debe ser mayor a 0.');
    expect(errs.horas_maquina).toBe('Usa un número con máximo 2 decimales.');
    expect(validarTarea({ familia_trabajo_id: 't', actividad_id: 'a', tarea_id: 'x', cargo_id: 'c', horas_estimadas: '2,5', horas_maquina: '', posicion: '1' })).toEqual({});
    expect(primerError(errs, ['familia_trabajo_id', 'actividad_id'])).toBe('familia_trabajo_id');
    expect(datosTarea({ familia_trabajo_id: 't', actividad_id: 'a', tarea_id: 'x', cargo_id: 'c', activo_id: '', horas_estimadas: '2,5', horas_maquina: '', posicion: '1' }))
      .toMatchObject({ activo_id: null, horas_estimadas: '2.5', horas_maquina: '0' });
  });

  it('calcula la vista previa del costo y avisa si el cargo no tiene tarifa', () => {
    expect(costoTarea({ cargo_id: 'c1', activo_id: 'eq1', horas_estimadas: '6', horas_maquina: '4' }, CATALOGO)).toEqual({ costo: 81.9, sinTarifa: false });
    expect(costoTarea({ cargo_id: 'c2', horas_estimadas: '3' }, CATALOGO)).toEqual({ costo: 0, sinTarifa: true });
  });

  it('ofrece posiciones sin la tarea que se edita', () => {
    const ops = [{ id: 'a', tarea: 'Torneado' }, { id: 'b', tarea: 'Rectificado' }];
    expect(opcionesPosicion(ops).map(o => o.label)).toEqual(['1 · antes de Torneado', '2 · antes de Rectificado', '3 · después de Rectificado']);
    expect(opcionesPosicion(ops, 'b').map(o => o.value)).toEqual(['1', '2']);
    expect(opcionesPosicion([]).map(o => o.label)).toEqual(['1 · primera tarea']);
  });

  it('valida materiales y exige motivo solo si es no planificado', () => {
    expect(validarMaterial({ material_id: '', cantidad: '', origen: 'stock' })).toMatchObject({ material_id: expect.any(String), cantidad: 'Indica la cantidad.' });
    expect(validarMaterial({ material_id: 'm', cantidad: '1', origen: 'stock' })).toEqual({});
    expect(validarMaterial({ material_id: 'm', cantidad: '1', origen: 'stock' }, { noPlanificado: true }).motivo).toBeTruthy();
    expect(textoStock({ disponible: 1, unidad: 'UND' }, 2)).toEqual({ tono: 'low', texto: 'Stock: 1 de 2 UND' });
    expect(textoStock({ disponible: 10, unidad: 'UND' }, 2)).toEqual({ tono: 'ok', texto: 'Stock: 10 UND' });
    expect(hayCambios({ a: '1' }, { a: 1 })).toBe(false);
    expect(resumenAprobacion(OF_BASE, new Map([['mat1', 1]]))).toMatchObject({ operaciones: 1, horas: 6, horasMaquina: 4, sinStockSuficiente: ['Rodamiento 6204'] });
  });
});

describe('ficha editable de la OF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.of = structuredClone(OF_BASE);
    mocks.catalogo = structuredClone(CATALOGO);
    mocks.guardarOp.mockResolvedValue({ id: 'op1', sin_tarifa: false });
    mocks.aprobar.mockResolvedValue({ estado: 'aprobada' });
  });

  it('en borrador muestra aprobar, agregar, editar y quitar, con costo por tarea y stock del material', async () => {
    const root = await montar();
    expect(boton(root, 'Aprobar OF')).toBeTruthy();
    expect(boton(root, 'Agregar tarea')).toBeTruthy();
    expect(boton(root, 'Editar Torneado')).toBeTruthy();
    expect(boton(root, 'Quitar Torneado')).toBeTruthy();
    expect(texto(root.root.findByProps({ className: 'dx-ofd-o-st dx-ofd-money' }))).toContain('S/ 81.90');
    await act(async () => { boton(root, 'Materiales · 1').props.onClick(); await esperar(); });
    expect(root.root.findAllByProps({ className: 'dx-ofd-stock is-low' }).map(texto)).toEqual(['Stock: 1 de 2 UND']);
  });

  it('el modal de tarea muestra todos los errores y no llama a la BD; con datos válidos guarda y recarga', async () => {
    const root = await montar();
    await act(async () => { boton(root, 'Agregar tarea').props.onClick(); await esperar(); });
    const form = () => root.root.findAllByType('form').find(f => f.props.id === 'dx-ofd-form-tarea');
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await esperar(); });
    expect(root.root.findAllByProps({ className: 'dx-ui-field-error' }).length).toBe(5);
    expect(mocks.guardarOp).not.toHaveBeenCalled();

    await act(async () => { boton(root, 'Cancelar').props.onClick(); await esperar(); });
    await act(async () => { boton(root, 'Editar Torneado').props.onClick(); await esperar(); });
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await esperar(); });
    expect(mocks.guardarOp).toHaveBeenCalledWith('of1', 'op1', expect.objectContaining({ tarea_id: 'ta1', horas_estimadas: '6', horas_maquina: '4', activo_id: 'eq1', posicion: '1' }));
    expect(texto(root.root.findByProps({ className: 'dx-ofd-toast' }))).toBe('Tarea guardada.');
  });

  it('aprobar llama a la BD y recarga la ficha', async () => {
    const root = await montar();
    await act(async () => { boton(root, 'Aprobar OF').props.onClick(); await esperar(); });
    expect(texto(root.root.findByProps({ className: 'dx-ofd-cmp' }))).toContain('Rodamiento 6204');
    mocks.of = { ...structuredClone(OF_BASE), estado: 'aprobada' };
    const confirmar = botones(root).filter(b => texto(b) === 'Aprobar OF').pop();
    await act(async () => { confirmar.props.onClick(); await esperar(); });
    expect(mocks.aprobar).toHaveBeenCalledWith('of1');
    expect(boton(root, 'Aprobar OF')).toBeFalsy();
    expect(boton(root, 'Editar Torneado')).toBeFalsy();
    await act(async () => { boton(root, 'Materiales · 1').props.onClick(); await esperar(); });
    expect(boton(root, 'Material no planificado')).toBeTruthy();
  });

  it('sin permiso de edición la ficha queda en solo lectura', async () => {
    mocks.catalogo = { ...structuredClone(CATALOGO), puede_editar: false, puede_aprobar: false };
    const root = await montar();
    expect(boton(root, 'Aprobar OF')).toBeFalsy();
    expect(boton(root, 'Agregar tarea')).toBeFalsy();
    expect(boton(root, 'Editar Torneado')).toBeFalsy();
    expect(texto(root.root.findByProps({ className: 'dx-ofd-soon' }))).toContain('no editarla');
  });
});
