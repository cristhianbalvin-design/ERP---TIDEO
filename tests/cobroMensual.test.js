import { describe, expect, it } from 'vitest';
import {
  conformidadValorizable, esCobroMensual, etiquetaTipoCobro, partidaTarifaMensual, periodoMensualISO, prorrateoMensual, validarCobroOS,
} from '../src/utils/cobroMensual.js';

describe('cobro recurrente mensual', () => {
  it('cobra la tarifa completa en un mes completo', () => {
    expect(prorrateoMensual({ tarifa: 3000, fechaInicio: '2026-01-10', fechaFin: null, anio: 2026, mesIdx: 1 }))
      .toMatchObject({ monto: 3000, dias: 28, diasMes: 28, completo: true });
  });

  it('prorratea por días el primer y el último mes', () => {
    // Octubre 2026: inicia el 15 → 17 de 31 días.
    expect(prorrateoMensual({ tarifa: 3100, fechaInicio: '2026-10-15', fechaFin: '2027-03-20', anio: 2026, mesIdx: 9 }))
      .toMatchObject({ monto: 1700, dias: 17, diasMes: 31, desde: '2026-10-15', hasta: '2026-10-31', completo: false });
    // Marzo 2027: termina el 20 → 20 de 31 días.
    expect(prorrateoMensual({ tarifa: 3100, fechaInicio: '2026-10-15', fechaFin: '2027-03-20', anio: 2027, mesIdx: 2 }))
      .toMatchObject({ monto: 2000, dias: 20, completo: false });
    // Inicio y fin dentro del mismo mes.
    expect(prorrateoMensual({ tarifa: 3000, fechaInicio: '2026-11-11', fechaFin: '2026-11-20', anio: 2026, mesIdx: 10 }))
      .toMatchObject({ monto: 1000, dias: 10, diasMes: 30 });
  });

  it('no cobra fuera de la vigencia', () => {
    expect(prorrateoMensual({ tarifa: 3000, fechaInicio: '2026-12-01', fechaFin: null, anio: 2026, mesIdx: 10 })).toMatchObject({ monto: 0, dias: 0 });
    expect(prorrateoMensual({ tarifa: 3000, fechaInicio: '2026-01-01', fechaFin: '2026-05-31', anio: 2026, mesIdx: 6 })).toMatchObject({ monto: 0, dias: 0 });
    expect(prorrateoMensual({ tarifa: 3000, fechaInicio: null, fechaFin: null, anio: 2026, mesIdx: 6 })).toMatchObject({ monto: 0 });
  });

  it('arma la partida con el detalle de días', () => {
    const os = { numero: 'OSC-1', nombre: 'Limpieza de oficinas', tarifa_mensual: 3100, fecha_inicio: '2026-10-15', fecha_fin: null };
    expect(partidaTarifaMensual(os, 2026, 9, 'Octubre')).toMatchObject({
      descripcion: 'Servicio mensual Limpieza de oficinas — Octubre 2026 (17 de 31 días)', cantidad: 1, precio_unitario: 1700,
    });
    expect(partidaTarifaMensual(os, 2026, 10, 'Noviembre').descripcion).toBe('Servicio mensual Limpieza de oficinas — Noviembre 2026');
  });

  it('valida la OS mensual', () => {
    expect(validarCobroOS({ tipo_cobro: 'puntual' })).toBe('');
    expect(validarCobroOS({ tipo_cobro: 'recurrente_mensual', tarifa_mensual: '', fecha_inicio: '2026-10-01' })).toMatch(/tarifa/);
    expect(validarCobroOS({ tipo_cobro: 'recurrente_mensual', tarifa_mensual: '0', fecha_inicio: '2026-10-01' })).toMatch(/tarifa/);
    expect(validarCobroOS({ tipo_cobro: 'recurrente_mensual', tarifa_mensual: '2500', fecha_inicio: '' })).toMatch(/inicio/);
    expect(validarCobroOS({ tipo_cobro: 'recurrente_mensual', tarifa_mensual: '2500', fecha_inicio: '2026-10-01' })).toBe('');
  });

  it('utilidades', () => {
    expect(periodoMensualISO(2026, 0)).toBe('2026-01-01');
    expect(etiquetaTipoCobro('recurrente_mensual')).toBe('Recurrente mensual');
    expect(etiquetaTipoCobro(null)).toBe('Servicio puntual');
    expect(esCobroMensual({ tipo_cobro: 'recurrente_mensual' })).toBe(true);
  });

  it('acepta el acta móvil como conformidad salvo si está pendiente', () => {
    expect(conformidadValorizable({ conformidad_cliente: { tipo: 'digital' } })).toBe(true);
    expect(conformidadValorizable({ conformidad_cliente: { tipo: 'fisico' } })).toBe(true);
    expect(conformidadValorizable({ conformidad_cliente: { tipo: 'acta_movil', resultado: 'observaciones' }, conformidad_resultado: 'observaciones' })).toBe(true);
    expect(conformidadValorizable({ conformidad_cliente: { tipo: 'acta_movil', resultado: 'pendiente' }, conformidad_resultado: 'pendiente' })).toBe(false);
    expect(conformidadValorizable({ conformidad_cliente: { tipo: 'pendiente' } })).toBe(false);
    expect(conformidadValorizable(null)).toBe(false);
  });
});
