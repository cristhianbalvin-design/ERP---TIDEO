import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCierreFondoRpcArgs,
  extraerCodigoErrorCierre,
  filtrarCuentasDevolucion,
  filtrarDestinosTransferencia,
  mapTransferenciasHistorial,
  mensajeErrorCierre,
} from './cajaChicaCierreLogic.js';

const fondo = (overrides = {}) => ({
  id: 'origen',
  moneda: 'PEN',
  sociedad_id: 'soc-a',
  ...overrides,
});

test('filtra cajas destino por estado, moneda, sociedad y origen', () => {
  const result = filtrarDestinosTransferencia(fondo(), [
    { id: 'origen', estado: 'activo', moneda: 'PEN', sociedad_id: 'soc-a' },
    { id: 'valida', estado: 'activo', moneda: 'PEN', sociedad_id: 'soc-a' },
    { id: 'cerrada', estado: 'cerrado', moneda: 'PEN', sociedad_id: 'soc-a' },
    { id: 'usd', estado: 'activo', moneda: 'USD', sociedad_id: 'soc-a' },
    { id: 'otra-sociedad', estado: 'activo', moneda: 'PEN', sociedad_id: 'soc-b' },
  ]);

  assert.deepEqual(result.map(row => row.id), ['valida']);
  assert.deepEqual(filtrarDestinosTransferencia(fondo({ sociedad_id: null }), result), []);
});

test('filtra cuentas destino por estado, moneda, alcance y sociedad del fondo', () => {
  const cuentas = [
    { id: 'cta-valida', estado: 'activo', moneda: 'PEN', sociedad_id: 'soc-a' },
    { id: 'cta-otra-sociedad', estado: 'activo', moneda: 'PEN', sociedad_id: 'soc-b' },
    { id: 'cta-usd', estado: 'activo', moneda: 'USD', sociedad_id: 'soc-a' },
    { id: 'cta-inactiva', estado: 'inactivo', moneda: 'PEN', sociedad_id: 'soc-a' },
  ];

  assert.deepEqual(
    filtrarCuentasDevolucion(fondo(), cuentas, { sociedadesIds: ['soc-a'] }).map(row => row.id),
    ['cta-valida'],
  );
  assert.deepEqual(
    filtrarCuentasDevolucion(fondo({ sociedad_id: null }), cuentas, { sociedadesIds: ['soc-a', 'soc-b'] }).map(row => row.id),
    ['cta-valida', 'cta-otra-sociedad'],
  );
  assert.deepEqual(
    filtrarCuentasDevolucion(fondo({ sociedad_id: null }), cuentas, { sociedadesIds: ['soc-b'] }).map(row => row.id),
    ['cta-otra-sociedad'],
  );
});

test('extrae y traduce códigos de error conocidos', () => {
  const error = new Error('MONEDA_NO_COINCIDE: La moneda no coincide.');
  assert.equal(extraerCodigoErrorCierre(error), 'MONEDA_NO_COINCIDE');
  assert.equal(mensajeErrorCierre(error), 'El destino debe tener la misma moneda del fondo.');
});

test('mantiene el mensaje original para códigos desconocidos o sin código', () => {
  assert.equal(extraerCodigoErrorCierre(new Error('CODIGO_NUEVO: detalle')), 'CODIGO_NUEVO');
  assert.equal(
    mensajeErrorCierre(new Error('CODIGO_NUEVO: detalle')),
    'No se pudo cerrar el fondo. CODIGO_NUEVO: detalle',
  );
  assert.equal(
    mensajeErrorCierre(new Error('fallo de red')),
    'No se pudo cerrar el fondo. fallo de red',
  );
});

test('los argumentos de cierre no incluyen monto y solo envían destino y referencia', () => {
  assert.deepEqual(
    buildCierreFondoRpcArgs('origen', {
      destino_tipo: 'transferencia',
      destino_id: 'destino',
      referencia: 'cierre-test',
      monto: 999999,
    }),
    {
      p_fondo_id: 'origen',
      p_destino_tipo: 'transferencia',
      p_destino_id: 'destino',
      p_referencia: 'cierre-test',
    },
  );
});

test('mapea transferencias entrantes y salientes sin convertirlas en ingresos o egresos', () => {
  const rows = mapTransferenciasHistorial([
    { id: 'saliente', fondo_origen_id: 'origen', fondo_destino_id: 'destino', monto: 25, fecha: '2026-09-30', moneda: 'PEN', estado: 'registrado' },
    { id: 'entrante', fondo_origen_id: 'otro', fondo_destino_id: 'origen', monto: 10, fecha: '2026-09-29', moneda: 'PEN', estado: 'registrado' },
    { id: 'ajena', fondo_origen_id: 'otro', fondo_destino_id: 'destino', monto: 99, fecha: '2026-09-28', moneda: 'PEN', estado: 'registrado' },
  ], fondo(), [
    { id: 'destino', nombre: 'Caja destino' },
    { id: 'otro', nombre: 'Otra caja' },
  ]);

  assert.deepEqual(rows.map(row => [row.id, row.sentido, row.monto_movimiento]), [
    ['saliente', 'saliente', -25],
    ['entrante', 'entrante', 10],
  ]);
  assert.equal(rows[0].fondo_contraparte_nombre, 'Caja destino');
  assert.equal(rows[1].fondo_contraparte_nombre, 'Otra caja');
  assert.equal(rows[0].tipo_movimiento, 'transferencia_saliente');
});
