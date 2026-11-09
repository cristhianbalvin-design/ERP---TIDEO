import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularFacturadoMes, calcularSaldos } from './facturacionKpis.js';

test('facturado neto conserva monedas y resta notas de crédito', () => {
  const facturas = [
    { tipo_documento: 'factura', fecha_emision: '2026-11-01', total: 100, moneda: 'PEN' },
    { tipo_documento: 'nota_credito', fecha_emision: '2026-11-02', total: 25, moneda: 'PEN' },
    { tipo_documento: 'boleta', fecha_emision: '2026-11-03', total: 50, moneda: 'USD' },
  ];
  assert.deepEqual(calcularFacturadoMes(facturas, '2026-11-09'), {
    montos: { PEN: 75, USD: 50 },
    emitidas: 2,
  });
});

test('saldos separan monedas, incluyen parcial vencido y excluyen cobradas', () => {
  const facturas = [
    { id: 1, tipo_documento: 'factura' },
    { id: 2, tipo_documento: 'factura' },
    { id: 3, tipo_documento: 'factura' },
  ];
  const cxc = [
    { factura_id: 1, saldo: 40, moneda: 'PEN', estado: 'cobro_parcial', fecha_vencimiento: '2026-11-01' },
    { factura_id: 2, saldo: 10, moneda: 'USD', estado: 'por_cobrar', fecha_vencimiento: '2026-11-20' },
    { factura_id: 3, saldo: 99, estado: 'cobrada', fecha_vencimiento: '2026-01-01' },
  ];
  assert.deepEqual(calcularSaldos(facturas, cxc, '2026-11-09'), {
    porCobrar: { montos: { PEN: 40, USD: 10 }, facturas: 2 },
    vencido: { montos: { PEN: 40, USD: 0 }, facturas: 1 },
  });
});

test('comprobante anulado se excluye del facturado y de los saldos', () => {
  const facturas = [{ id: 1, tipo_documento: 'factura', estado: 'anulada', fecha_emision: '2026-11-01', total: 100 }];
  const cxc = [{ factura_id: 1, saldo: 100, fecha_vencimiento: '2026-10-01' }];
  assert.deepEqual(calcularFacturadoMes(facturas, '2026-11-09'), { montos: { PEN: 0, USD: 0 }, emitidas: 0 });
  assert.deepEqual(calcularSaldos(facturas, cxc, '2026-11-09'), {
    porCobrar: { montos: { PEN: 0, USD: 0 }, facturas: 0 },
    vencido: { montos: { PEN: 0, USD: 0 }, facturas: 0 },
  });
});

test('boleta cuenta como emitida', () => {
  const facturas = [{ tipo_documento: 'boleta', fecha_emision: '2026-11-01', total: 30 }];
  assert.deepEqual(calcularFacturadoMes(facturas, '2026-11-09'), { montos: { PEN: 30, USD: 0 }, emitidas: 1 });
});
