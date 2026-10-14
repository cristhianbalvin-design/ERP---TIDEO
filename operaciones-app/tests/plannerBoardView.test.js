import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BoardView } from '../src/zahory-mock/pages/planner/BoardView.jsx';
import { construirModelo } from '../src/zahory-mock/pages/planner/PlannerPage.jsx';

const HOY = '2026-10-14';
const datosBase = estado => ({
  ots: [{ id: 'OT-1', numero: '1001', estado: 'abierta', ot_tareas: [] }],
  personas: [{ id: 'P-1', nombre: 'Técnico de prueba', cargo: 'Mecánico' }],
  maquinas: [], puestos: [], bahias: [], ocupaciones: [],
  asignaciones: [{ id: 'A-1', ot_id: 'OT-1', tecnico_id: 'P-1', fecha: HOY, horas_estimadas: 4, estado }],
  equipos: [],
});
const props = (datos, seleccion = {}) => ({
  datos, modelo: construirModelo(datos, HOY), seleccion, permiteEscritura: false,
  onSelect: vi.fn(), onMoverBloque: vi.fn(), onMoverUnidad: vi.fn(), onConfigurar: vi.fn(),
});

describe('BoardView', () => {
  it('resalta la OT seleccionada en sus bloques', () => {
    const datos = datosBase('programado');
    const html = renderToStaticMarkup(createElement(BoardView, props(datos, { ot: datos.ots[0] })));
    expect(html).toContain('dx-pl-blk is-sel');
    expect(html).toContain('aria-label="OT 1001');
  });

  it('renderiza una asignación de una persona sin lanzar y muestra el bloque de OT', () => {
    const html = renderToStaticMarkup(createElement(BoardView, props(datosBase('programada'))));
    expect(html).toContain('dx-pl-blk');
    expect(html).toContain('Técnico de prueba');
    expect(html).toContain('1001 · 4 h');
  });
});
