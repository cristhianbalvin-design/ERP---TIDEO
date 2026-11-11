import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatearFecha,
  fechaHoyLima,
  diasEntreFechas,
  tramoAntiguedad,
  textoVencimiento,
  ordenarFilas,
  plural,
  validarCobroCxC,
} from './cxcCalculos.js';

test('formatea fechas civiles y valores vacíos', () => {
  assert.equal(formatearFecha('2026-11-05'), '05/11/2026');
  assert.equal(formatearFecha('2026-11-05T12:00:00Z'), '05/11/2026');
  assert.equal(formatearFecha(''), 'Sin dato');
  assert.equal(formatearFecha(null), 'Sin dato');
});

test('la fecha de Lima no adelanta el día a las 23:30', () => {
  assert.equal(fechaHoyLima(new Date('2026-11-11T04:30:00Z')), '2026-11-10');
  assert.equal(fechaHoyLima(new Date('2026-11-11T05:00:00Z')), '2026-11-11');
});

test('cuenta días civiles entre fechas', () => {
  assert.equal(diasEntreFechas('2026-11-10', '2026-11-11'), 1);
  assert.equal(diasEntreFechas('2026-11-11', '2026-11-10'), -1);
});

test('asigna los extremos de cada tramo', () => {
  for (const [dias, esperado] of [
    [0, 'al-dia'],
    [1, '1-30'],
    [30, '1-30'],
    [31, '31-60'],
    [60, '31-60'],
    [61, '61-90'],
    [90, '61-90'],
    [91, '+90'],
  ]) {
    assert.equal(tramoAntiguedad(dias), esperado);
  }
});

test('describe el vencimiento y usa el plural correcto', () => {
  assert.equal(textoVencimiento(0), 'Vence hoy');
  assert.equal(textoVencimiento(1), 'Vence en 1 día');
  assert.equal(textoVencimiento(-1), '1 día vencida');
  assert.equal(textoVencimiento(-5), '5 días vencida');
  assert.equal(textoVencimiento(-5, true), 'Cobrada');
  assert.equal(plural(2, 'factura', 'facturas'), '2 facturas');
});

test('ordena por mora descendente y luego vencimiento cercano', () => {
  const filas = [
    { diasMora: 0, vencimiento: '2026-12-01' },
    { diasMora: 2, vencimiento: '2026-11-08' },
    { diasMora: 0, vencimiento: '2026-11-12' },
    { diasMora: 10, vencimiento: '2026-10-31' },
  ];
  assert.deepEqual(
    filas.sort(ordenarFilas).map((f) => f.vencimiento),
    ['2026-10-31', '2026-11-08', '2026-11-12', '2026-12-01'],
  );
});

const contextoCobro = {
  saldo: 100,
  maxNormal: 80,
  pendiente: { monto_detraccion_origen: 20, monto_detraccion_soles: 20 },
};
const cobroValido = { monto: '80', fecha_cobro: '2026-11-10', medio_pago: 'Efectivo' };

test('valida todos los campos vacíos en una pasada', () => {
  assert.deepEqual(Object.keys(validarCobroCxC({}, contextoCobro)), ['monto', 'fecha_cobro', 'medio_pago']);
});

test('exige operación para transferencia', () => {
  assert.ok(validarCobroCxC({ ...cobroValido, medio_pago: 'Transferencia bancaria' }, contextoCobro).numero_operacion);
});

test('rechaza monto sobre el máximo', () => {
  assert.ok(validarCobroCxC({ ...cobroValido, monto: '81' }, contextoCobro).monto);
});

test('acepta cobro válido', () => {
  assert.deepEqual(validarCobroCxC(cobroValido, contextoCobro), {});
});
