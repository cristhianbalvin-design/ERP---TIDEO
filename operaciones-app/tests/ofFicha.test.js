import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({}) }));

import { normalizarFichaOF } from '../src/services/ordenFabricacionService.js';
import { agruparRuta } from '../src/zahory-mock/pages/of/ofCrearLogic.js';

describe('ficha de la OF', () => {
  it('ordena la ruta por secuencia, resuelve nombres y calcula subtotales con céntimos', () => {
    const of = normalizarFichaOF({
      id: 'of1', numero: 'OF-26-0001', estado: 'borrador', moneda: 'USD', costo_estimado: '600', avance_pct: null,
      os: { numero: 'OSC-2026-0981', tipo_ejecucion: 'fabricacion' }, cuenta: { razon_social: 'Cliente Demo' },
      activo: { codigo: 'MOTOR', nombre: 'MOTOR' }, hoja: { numero: 'HC-2026-0583' },
      operaciones: [
        { id: 'b', secuencia: 2, titulo: 'Prueba', horas_estimadas: '2', horas_maquina: '2', costo_estimado: '20.4', estado: 'pendiente', trabajo: { nombre: 'Armado' }, actividad: { nombre: 'Prueba' }, equipo: { codigo: 'BH-1', nombre: 'Banco' }, bahia: { nombre: 'Hidráulica' } },
        { id: 'a', secuencia: 1, titulo: 'Armado', horas_estimadas: '5', costo_estimado: '42.4', estado: 'pendiente', trabajo: { nombre: 'Armado' }, actividad: { nombre: 'Armado' }, cargo: { nombre: 'Técnico' } },
      ],
      materiales: [{ id: 'm', descripcion: 'Sello', cantidad_plan: '3', costo_unitario: '10.005', origen: 'stock' }],
    });
    expect(of.operaciones.map(o => o.tarea)).toEqual(['Armado', 'Prueba']);
    expect(of.operaciones[1]).toMatchObject({ equipo: 'BH-1 · Banco', bahia: 'Hidráulica', horas: 2, horas_maquina: 2, costo: 20.4 });
    expect(of.componente).toBe('MOTOR');
    expect(of.materiales[0].subtotal).toBe(30.02);
    expect(of.avance_pct).toBe(0);
    expect(agruparRuta(of.operaciones).map(t => [t.nombre, t.actividades.length, t.horas])).toEqual([['Armado', 2, 7]]);
  });
});
