import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlannerSide } from '../src/zahory-mock/pages/planner/PlannerSide.jsx';
import { construirModelo } from '../src/zahory-mock/pages/planner/PlannerPage.jsx';

describe('aviso de OT cerrada en Planner', () => {
  for (const estado of ['cerrada', 'anulada', 'valorizada', 'cerrado_conforme']) {
    it(`bloquea la asignación para estado ${estado}`, () => {
      const ot = { id: 'OT-1', numero: 'OT-1', estado, ot_tareas: [{ id: 't', titulo: 'Tarea', horas_estimadas: 8, horas_reales: 0 }] };
      const datos = {
        ots: [ot], personas: [], maquinas: [], puestos: [], bahias: [], ocupaciones: [], equipos: [],
        asignaciones: [{ id: 'a', ot_id: 'OT-1', tecnico_id: 'p', tarea_id: 't', fecha: '2026-10-15', estado: 'programado' }],
      };
      const modelo = construirModelo(datos, '2026-10-15');
      const html = renderToStaticMarkup(createElement(PlannerSide, {
        datos, infos: modelo.infos, alertas: [], cargos: [], dias: modelo.dias, hoy: modelo.hoy,
        seleccion: { ot }, permiteEscritura: true, guardando: false,
        onSelect: () => {}, onPlanificar: () => {}, onConfigurar: () => {}, onResponsable: () => {},
        onMaquina: () => {}, onNoAntes: () => {}, onPuesto: () => {},
      }));
      expect(html).toContain('La OT está cerrada y no admite cambios.');
      expect(html).not.toContain('Automático');
    });
  }
});
