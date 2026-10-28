import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({}) }));

import {
  filtrarBandejaOF,
  formatearFecha,
  formatearMonto,
  resumenBandejaOF,
  situacionCompromiso,
  textoOperaciones,
  textoSinBahia,
} from '../src/zahory-mock/pages/of/ofBandejaLogic.js';
import { normalizarFilaBandejaOF } from '../src/services/ordenFabricacionService.js';

const HOY = '2026-10-27';
const of = (extra) => ({ numero: 'OF-26-0001', os_numero: 'OSC-1', cliente: 'Cliente Demo', componente: 'Cilindro', estado: 'borrador', fecha_compromiso: '2026-11-12', ...extra });

describe('bandeja de órdenes de fabricación', () => {
  it('cuenta en curso, borrador, atrasadas y que vencen en 7 días sin contar las terminadas', () => {
    const r = resumenBandejaOF([
      of({ estado: 'borrador' }),
      of({ estado: 'en_produccion', fecha_compromiso: '2026-11-03' }),
      of({ estado: 'en_calidad', fecha_compromiso: '2026-10-24' }),
      of({ estado: 'entregada', fecha_compromiso: '2026-10-20' }),
      of({ estado: 'anulada', fecha_compromiso: '2026-10-01' }),
    ], HOY);
    expect(r).toMatchObject({ total: 5, enCurso: 2, borrador: 1, atrasadas: 1, vencen: 1 });
    expect(r.porEstado.entregada).toBe(1);
  });

  it('describe el compromiso con singular y plural', () => {
    expect(situacionCompromiso(of({ fecha_compromiso: '2026-10-26', estado: 'en_produccion' }), HOY)).toEqual({ tono: 'late', nota: 'atrasada 1 día' });
    expect(situacionCompromiso(of({ fecha_compromiso: '2026-10-27' }), HOY)).toEqual({ tono: 'soon', nota: 'vence hoy' });
    expect(situacionCompromiso(of({ fecha_compromiso: '2026-11-03' }), HOY)).toEqual({ tono: 'soon', nota: 'en 7 días' });
    expect(situacionCompromiso(of({ fecha_compromiso: '2026-11-12' }), HOY)).toEqual({ tono: '', nota: 'en 16 días' });
    expect(situacionCompromiso(of({ fecha_compromiso: null }), HOY).nota).toBe('Sin compromiso');
    expect(situacionCompromiso(of({ estado: 'entregada', fecha_compromiso: '2026-10-01' }), HOY)).toEqual({ tono: '', nota: 'Entregada' });
  });

  it('filtra por estado, KPI y búsqueda sin acentos', () => {
    const lista = [of({ numero: 'OF-26-0001', cliente: 'Minería Sur' }), of({ numero: 'OF-26-0002', estado: 'en_produccion', fecha_compromiso: '2026-10-20' })];
    expect(filtrarBandejaOF(lista, { estado: 'en_produccion' }, HOY).map(o => o.numero)).toEqual(['OF-26-0002']);
    expect(filtrarBandejaOF(lista, { kpi: 'atrasadas' }, HOY).map(o => o.numero)).toEqual(['OF-26-0002']);
    expect(filtrarBandejaOF(lista, { buscar: 'mineria' }, HOY).map(o => o.numero)).toEqual(['OF-26-0001']);
  });

  it('formatea montos con céntimos y fechas legibles', () => {
    expect(formatearMonto(1240.5, 'PEN')).toBe('S/ 1,240.50');
    expect(formatearMonto(88.235, 'USD')).toBe('US$ 88.24');
    expect(formatearFecha('2026-11-12')).toBe('12 nov 2026');
    expect(formatearFecha(null)).toBe('Sin dato');
  });

  it('normaliza la fila y cuenta las operaciones sin bahía', () => {
    const fila = normalizarFilaBandejaOF({
      id: 'x', numero: 'OF-26-0001', estado: 'borrador', costo_estimado: '88.24', avance_pct: 150,
      os: { id: 'os1', numero: 'OSC-2026-0598' }, cuenta: { razon_social: 'Cliente Demo SAC', nombre_comercial: null },
      activo: { codigo: 'ACT-1', nombre: 'Cilindro' }, operaciones: [{ id: 1, bahia_id: null }, { id: 2, bahia_id: 'b' }, { id: 3, bahia_id: null }],
    });
    expect(fila).toMatchObject({ os_numero: 'OSC-2026-0598', cliente: 'Cliente Demo SAC', componente: 'ACT-1 · Cilindro', costo_estimado: 88.24, avance_pct: 100, operaciones_total: 3, operaciones_sin_bahia: 2, moneda: 'PEN' });
    expect(textoOperaciones(fila)).toBe('3 operaciones');
    expect(textoSinBahia(fila)).toBe('2 sin bahía');
    expect(textoOperaciones({ operaciones_total: 1 })).toBe('1 operación');
    expect(textoSinBahia({ operaciones_total: 0, operaciones_sin_bahia: 0 })).toBe('');
  });
});
