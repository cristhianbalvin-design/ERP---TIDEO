import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCierreFondoRpcArgs, calcularFondos, listarTransferenciasPaginadas } from './cajaChicaService.js';

const fondoBase = (overrides = {}) => ({
  id: 'fondo-test',
  monto_asignado: 100,
  monto_minimo: 10,
  moneda: 'PEN',
  estado: 'activo',
  ...overrides,
});

const transferencia = (overrides = {}) => ({
  id: 'transferencia-test',
  fondo_origen_id: 'otro-fondo',
  fondo_destino_id: 'fondo-test',
  monto: 20,
  moneda: 'PEN',
  estado: 'registrado',
  ...overrides,
});

test('calcularFondos suma entradas y resta salidas de transferencias', () => {
  const [fondo] = calcularFondos(
    [fondoBase()],
    [],
    [],
    [],
    [],
    [
      transferencia({ id: 'saliente', fondo_origen_id: 'fondo-test', fondo_destino_id: 'otro-fondo', monto: 10 }),
      transferencia({ id: 'entrante', monto: 20 }),
    ],
  );

  assert.equal(fondo.saldo_disponible, 110);
  assert.equal(fondo.monto_transferido, 10);
  assert.equal(fondo.monto_recibido, 20);
  assert.equal(fondo.tiene_movimientos, true);
});

test('una transferencia anulada no afecta el saldo', () => {
  const [fondo] = calcularFondos(
    [fondoBase()],
    [],
    [],
    [],
    [],
    [
      transferencia({ id: 'registrada', fondo_origen_id: 'fondo-test', fondo_destino_id: 'otro-fondo', monto: 10 }),
      transferencia({ id: 'anulada', fondo_origen_id: 'fondo-test', fondo_destino_id: 'otro-fondo', monto: 90, estado: 'anulado' }),
    ],
  );

  assert.equal(fondo.saldo_disponible, 90);
  assert.equal(fondo.monto_transferido, 10);
});

test('una moneda nula usa PEN y no rompe la lista', () => {
  const fondos = calcularFondos(
    [fondoBase(), fondoBase({ id: 'otro-fondo', monto_asignado: 50 })],
    [],
    [],
    [],
    [],
    [transferencia({ moneda: null })],
  );

  assert.equal(fondos.length, 2);
  assert.equal(fondos[0].moneda_inconsistente, false);
  assert.equal(fondos[0].saldo_disponible, 120);
});

test('una moneda distinta marca solo el fondo afectado', () => {
  const fondos = calcularFondos(
    [fondoBase(), fondoBase({ id: 'otro-fondo', monto_asignado: 50 })],
    [],
    [],
    [],
    [],
    [transferencia({ moneda: 'USD', fondo_origen_id: 'externo' })],
  );

  assert.equal(fondos[0].moneda_inconsistente, true);
  assert.equal(fondos[1].moneda_inconsistente, false);
  assert.equal(fondos[1].saldo_disponible, 50);
});

test('calcularFondos mantiene la cadena transferencia, egreso y cierre en cero', () => {
  const [fondo] = calcularFondos(
    [fondoBase()],
    [{ fondo_id: 'fondo-test', monto: 120, moneda: 'PEN', estado: 'registrado' }],
    [],
    [],
    [],
    [transferencia()],
  );

  assert.equal(fondo.saldo_disponible, 0);
});

test('calcularFondos descuenta monto_devuelto y no enmascara saldos negativos', () => {
  const [cerrado] = calcularFondos([fondoBase({ estado: 'cerrado', monto_devuelto: 100 })]);
  const [negativo] = calcularFondos(
    [fondoBase()],
    [{ fondo_id: 'fondo-test', monto: 120, moneda: 'PEN', estado: 'registrado' }],
  );

  assert.equal(cerrado.saldo_disponible, 0);
  assert.equal(negativo.saldo_disponible, -20);
});

test('el saldo redondeado no expone -0', () => {
  const [fondo] = calcularFondos(
    [fondoBase({ monto_asignado: 0.004 })],
    [{ fondo_id: 'fondo-test', monto: 0.005, moneda: 'PEN', estado: 'registrado' }],
  );

  assert.equal(fondo.saldo_disponible, 0);
  assert.equal(Object.is(fondo.saldo_disponible, -0), false);
});

test('el wrapper de cierre usa la firma posicional de la RPC 585', () => {
  assert.deepEqual(
    buildCierreFondoRpcArgs('fondo-test', {
      destino_tipo: 'cuenta_bancaria',
      destino_id: 'cta-test',
      referencia: 'cierre-test',
    }),
    {
      p_fondo_id: 'fondo-test',
      p_destino_tipo: 'cuenta_bancaria',
      p_destino_id: 'cta-test',
      p_referencia: 'cierre-test',
    },
  );
});

test('un payload p_payload no satisface la firma de la RPC de cierre', () => {
  assert.throws(
    () => assert.deepEqual(
      { p_payload: { fondo_id: 'fondo-test' } },
      buildCierreFondoRpcArgs('fondo-test'),
    ),
    assert.AssertionError,
  );
});

test('la paginación de transferencias ordena por fecha e id y no duplica ni omite filas', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `cct_${String(index).padStart(4, '0')}`,
    empresa_id: 'emp-test',
    fecha: '2026-09-30',
  }));
  const orderCalls = [];
  const query = {
    select() { return this; },
    eq() { return this; },
    order(column, options) {
      orderCalls.push({ column, options });
      return this;
    },
    range(from, to) {
      const hasTieBreaker = orderCalls.some(call => call.column === 'id');
      const ordered = hasTieBreaker
        ? [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id)))
        : (from === 0 ? rows : rows.slice(999, 1000));
      const data = hasTieBreaker
        ? ordered.slice(from, Math.min(to + 1, ordered.length))
        : ordered;
      return Promise.resolve({ data, error: null });
    },
  };
  const result = await listarTransferenciasPaginadas({ from: () => query }, 'emp-test');

  assert.deepEqual(orderCalls.map(call => call.column), ['fecha', 'id', 'fecha', 'id']);
  assert.equal(result[0].id, 'cct_1000');
  assert.equal(result.at(-1).id, 'cct_0000');
  assert.equal(new Set(result.map(row => row.id)).size, rows.length);
  assert.equal(result.length, rows.length);
});
