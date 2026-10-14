import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BoardView } from '../src/zahory-mock/pages/planner/BoardView.jsx';

describe('BoardView', () => {
  it('renderiza una asignación de una persona sin lanzar y muestra el bloque de OT', () => {
    const fecha = new Date().toISOString().slice(0, 10);
    const html = renderToStaticMarkup(createElement(BoardView, {
      datos: {
        ots: [{ id: 'OT-1', numero: '1001', estado: 'abierta' }],
        personas: [{ id: 'P-1', nombre: 'Técnico de prueba' }],
        maquinas: [],
        asignaciones: [{
          id: 'A-1',
          ot_id: 'OT-1',
          tecnico_id: 'P-1',
          fecha,
          horas_estimadas: 4,
          estado: 'programada',
        }],
        equipos: [],
      },
      permiteEscritura: false,
      onSelect: vi.fn(),
      onMoveDate: vi.fn(),
      onMoveOT: vi.fn(),
      undoDisponible: false,
      onUndo: vi.fn(),
    }));

    expect(html).toContain('dx-planner-block');
    expect(html).toContain('OT 1001');
  });
});
