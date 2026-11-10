import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularTotalesNota, monedaInicialFicha } from './facturacionFicha.js';
import { calcularTotalesEmision } from './facturacionEmision.js';

const valores = ({ subtotal, igv, total }) => ({ subtotal, igv, total });
test('boleta editada: 118 incluye 18 de IGV', () => {
  assert.deepEqual(
    valores(calcularTotalesEmision({ partidas: [{ cantidad: 1, precio_unitario: 118 }], igvPct: 18, esBoleta: true })),
    { subtotal: 100, igv: 18, total: 118 },
  );
});
test('nota sobre boleta: 118 incluye IGV', () => {
  assert.deepEqual(valores(calcularTotalesNota({ monto: 118, tipoOrigen: 'boleta' })), {
    subtotal: 100,
    igv: 18,
    total: 118,
  });
});
test('nota sobre factura: 100 más IGV', () => {
  assert.deepEqual(valores(calcularTotalesNota({ monto: 100, tipoOrigen: 'factura' })), {
    subtotal: 100,
    igv: 18,
    total: 118,
  });
});
test('nota sin IGV', () => {
  assert.deepEqual(valores(calcularTotalesNota({ monto: 118, tipoOrigen: 'boleta', conIgv: false })), {
    subtotal: 118,
    igv: 0,
    total: 118,
  });
});
test('nota en cero', () => assert.equal(calcularTotalesNota().total, 0));
test('la moneda del origen prevalece', () =>
  assert.equal(monedaInicialFicha({ origen: 'USD', cliente: 'PEN', empresa: { moneda: 'PEN' } }), 'USD'));
test('la moneda del cliente prevalece sobre la empresa', () =>
  assert.equal(monedaInicialFicha({ cliente: 'USD', empresa: { moneda: 'PEN' } }), 'USD'));
test('se usa la moneda de empresa', () => assert.equal(monedaInicialFicha({ empresa: { moneda: 'USD' } }), 'USD'));
test('se usa moneda base si no hay moneda de empresa', () =>
  assert.equal(monedaInicialFicha({ empresa: { moneda_base: 'USD' } }), 'USD'));
test('el respaldo es PEN', () => assert.equal(monedaInicialFicha(), 'PEN'));

test('permisos por módulo y privilegios', async () => {
  const { permisosFicha } = await import('./facturacionFicha.js');
  for (const role of [
    { es_admin_empresa: true },
    { es_superadmin: true },
    { permisos: { todo: true } },
    { permisos: { plataforma: true } },
  ])
    assert.ok(Object.values(permisosFicha(role)).every(Boolean));
  assert.equal(permisosFicha({ permisos: { editar: ['cxc'], crear: ['tesoreria'] } }).cobro, true);
  assert.equal(permisosFicha({ permisos: { editar: ['cxc'], crear: ['tesoreria'] } }).editar, false);
  assert.equal(permisosFicha({ permisos: { crear: true } }).autodetraccion, true);
  assert.ok(Object.values(permisosFicha({ permisos: { editar: true, crear: true } })).every(Boolean));
  assert.ok(Object.values(permisosFicha()).every((x) => !x));
});
test('acción primaria requiere estado, saldo y permiso', async () => {
  const { accionPrimaria } = await import('./facturacionFicha.js');
  for (const estado of ['emitida', 'cobro_parcial'])
    assert.equal(accionPrimaria({ estado }, 1, { cobro: true }), 'Registrar cobro');
  for (const estado of ['cobrada', 'anulada']) assert.equal(accionPrimaria({ estado }, 1, { cobro: true }), null);
  assert.equal(accionPrimaria({ estado: 'emitida' }, 0, { cobro: true }), null);
  assert.equal(accionPrimaria({ estado: 'emitida' }, 1, { cobro: false }), null);
});
test('historial combina y ordena emisión, cobros, notas y anulación', async () => {
  const { armarHistorial } = await import('./facturacionFicha.js');
  const eventos = armarHistorial(
    { estado: 'anulada', fecha_emision: '2026-01-01', fecha_anulacion: '2026-01-04' },
    [
      {
        fecha_cobro: '2026-01-02',
        monto_capital: 100,
        monto_mora: 2,
        medio_pago: 'transferencia',
        numero_operacion: '123',
        cuenta_bancaria: 'BCP',
      },
    ],
    [{ tipo_documento: 'nota_credito', fecha_emision: '2026-01-03' }],
  );
  assert.deepEqual(
    eventos.map((e) => e.tipo),
    ['anulacion', 'nota', 'cobro', 'emision'],
  );
  assert.match(eventos[2].detalle, /123/);
  assert.match(eventos[2].texto, /Mora: S\/ 2[.,]00/);
});
