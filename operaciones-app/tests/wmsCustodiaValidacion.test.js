import { describe, expect, it } from 'vitest';
import { hoyIso, validarAsignacionCustodia, validarIngresoCustodia, validarRangoLiquidacion, validarTarifaCustodia } from '../src/zahory-mock/pages/wms/wmsMultiLogic.js';

describe('custodia: validación por campo', () => {
  it('ingreso devuelve todos los errores a la vez', () => {
    expect(validarIngresoCustodia({ cantidad: '' })).toEqual({ ubicacion_id: 'Elige la posición.', material: 'Elige el material de la lista.', cantidad: 'Indica la cantidad.' });
    expect(validarIngresoCustodia({ ubicacion_id: 'u', material: { material_id: 'm' }, cantidad: '0' }).cantidad).toMatch(/mayor a cero/);
    expect(validarIngresoCustodia({ ubicacion_id: 'u', material: { material_id: 'm' }, cantidad: '2,5' })).toEqual({});
  });
  it('asignación y tarifa', () => {
    expect(Object.keys(validarAsignacionCustodia({ ubicaciones: [] }))).toEqual(['cuenta_id', 'ubicaciones']);
    expect(validarAsignacionCustodia({ cuenta_id: 'c', ubicaciones: ['u'] })).toEqual({});
    expect(Object.keys(validarTarifaCustodia({ tarifa_posicion_dia: '', tarifa_movimiento: '-1' }))).toEqual(['tarifa_posicion_dia', 'tarifa_movimiento']);
    expect(validarTarifaCustodia({ tarifa_posicion_dia: '0', tarifa_movimiento: '5' })).toEqual({});
  });
  it('la liquidación no admite días futuros', () => {
    expect(validarRangoLiquidacion({ desde: '2026-10-01', hasta: '2026-10-31' }, '2026-11-03')).toEqual({});
    expect(validarRangoLiquidacion({ desde: '2026-11-01', hasta: '2026-11-30' }, '2026-11-03').hasta).toMatch(/ya transcurridos/);
    expect(validarRangoLiquidacion({ desde: '2026-10-10', hasta: '2026-10-01' }, '2026-11-03').hasta).toMatch(/posterior a la fecha inicial/);
    expect(hoyIso(new Date(2026, 10, 3))).toBe('2026-11-03');
  });
});
