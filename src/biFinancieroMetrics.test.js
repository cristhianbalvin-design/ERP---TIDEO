import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCajaNetaMes, calcularCxc, calcularCxp, calcularFacturacionPorCliente,
  calcularRetenciones, calcularSemanasCaja, filasCSVFinanciero, filtrarPorMoneda,
  filasPresupuestoFinanciero, formatDateFinanciero, serieResultados,
} from './biFinancieroMetrics.js';

test('filtra por moneda normalizada y conserva nulos como cero', () => {
  const rows = [{ moneda: 'PEN', monto: 9 }, { moneda: '$', monto: 3 }, { moneda: 'USD', monto: null }];
  assert.deepEqual(filtrarPorMoneda(rows, 'USD'), rows.slice(1));
});

test('calcula tramos, mora y saldos de CxC con alcance y moneda', () => {
  const data = calcularCxc({ empresaId: 'e', moneda: 'PEN', hoy: '2026-10-12', cxc: [
    { id: 'vigente', empresa_id: 'e', moneda: 'PEN', saldo: 10, fecha_vencimiento: '2026-10-12' },
    { id: 'mora', empresa_id: 'e', moneda: 'PEN', saldo: 20, fecha_vencimiento: '2026-09-01' },
    { id: 'usd', empresa_id: 'e', moneda: 'USD', saldo: 50, fecha_vencimiento: '2026-09-01' },
    { id: 'cobrada', empresa_id: 'e', moneda: 'PEN', saldo: 50, estado: 'cobrada' },
    { id: 'otra', empresa_id: 'x', moneda: 'PEN', saldo: 50 },
  ] });
  assert.equal(data.total, 30);
  assert.equal(data.vencida, 20);
  assert.equal(data.items.find(row => row.id === 'mora').mora, 41);
  assert.deepEqual(data.tramos.map(row => row.cantidad), [1, 0, 1, 0, 0]);
});

test('calcula tramos, vencimientos y saldo CxP descontando pagos', () => {
  const data = calcularCxp({ empresaId: 'e', moneda: 'PEN', hoy: '2026-10-12', cxp: [
    { id: 'past', empresa_id: 'e', moneda: 'PEN', monto_total: 100, fecha_vencimiento: '2026-10-10' },
    { id: 'soon', empresa_id: 'e', moneda: 'PEN', monto_total: 80, fecha_vencimiento: '2026-10-20', nombre_emisor: 'Proveedor X' },
    { id: 'far', empresa_id: 'e', moneda: 'PEN', monto_total: 20, fecha_vencimiento: '2026-12-20' },
    { id: 'paid', empresa_id: 'e', moneda: 'PEN', monto_total: 60, estado: 'pagada' },
  ], cxpPagos: [{ cxp_id: 'past', monto: 30 }, { cxp_id: 'soon', monto: 10 }] });
  assert.equal(data.total, 160);
  assert.equal(data.vencida, 70);
  assert.equal(data.proximos30, 70);
  assert.deepEqual(data.tramos.map(row => row.cantidad), [1, 1, 0, 1]);
  assert.equal(data.urgentes[0].saldo, 70);
});

test('genera ocho semanas lunes-domingo incluyendo la actual y acumulado neto', () => {
  const semanas = calcularSemanasCaja({ empresaId: 'e', moneda: 'PEN', hoy: '2026-10-14', movimientos: [
    { empresa_id: 'e', moneda: 'PEN', fecha: '2026-10-12', tipo: 'ingreso', monto: 100 },
    { empresa_id: 'e', moneda: 'PEN', fecha: '2026-10-13', tipo: 'debito', monto: 35 },
    { empresa_id: 'e', moneda: 'USD', fecha: '2026-10-14', tipo: 'ingreso', monto: 500 },
  ] });
  assert.equal(semanas.length, 8);
  assert.equal(semanas[7].inicio, '2026-10-12');
  assert.equal(semanas[7].fin, '2026-10-18');
  assert.equal(semanas[7].neto, 65);
  assert.equal(semanas[7].acumulado, 65);
});

test('suma caja neta solo del mes, sociedad y moneda indicados', () => {
  const movimientos = [
    { empresa_id: 'e', sociedad_id: 's1', moneda: 'PEN', fecha: '2026-10-01', tipo: 'credito', monto: 90 },
    { empresa_id: 'e', sociedad_id: 's1', moneda: 'PEN', fecha: '2026-10-05', tipo: 'egreso', monto: 30 },
    { empresa_id: 'e', sociedad_id: 's2', moneda: 'PEN', fecha: '2026-10-05', tipo: 'ingreso', monto: 100 },
    { empresa_id: 'e', sociedad_id: 's1', moneda: 'USD', fecha: '2026-10-05', tipo: 'ingreso', monto: 100 },
  ];
  assert.equal(calcularCajaNetaMes({ movimientos, periodo: '2026-10', empresaId: 'e', sociedadIds: ['s1'], multisociedad: true, moneda: 'PEN' }), 60);
});

test('filtra retenciones y facturación por cliente, período, sociedad y tipo de comprobante', () => {
  const facturas = [
    { id: 'f1', empresa_id: 'e', sociedad_id: 's1', cuenta_id: 'c', tipo_documento: 'factura', fecha_emision: '2026-10-02', moneda: 'PEN', subtotal: 100, aplica_retencion: true, monto_retencion: 3, numero: 'F1' },
    { id: 'f2', empresa_id: 'e', sociedad_id: 's1', cuenta_id: 'c', tipo_documento: 'boleta', fecha_emision: '2026-10-03', moneda: 'PEN', subtotal: 50, estado: 'anulada', aplica_retencion: true, monto_retencion: 2 },
    { id: 'f3', empresa_id: 'e', sociedad_id: 's2', cuenta_id: 'd', tipo_documento: 'factura', fecha_emision: '2026-10-03', moneda: 'PEN', subtotal: 200 },
    { id: 'f4', empresa_id: 'e', sociedad_id: 's1', cuenta_id: 'c', tipo_documento: 'nota', fecha_emision: '2026-10-03', moneda: 'PEN', subtotal: 400 },
  ];
  const args = { facturas, cuentas: [{ id: 'c', razon_social: 'Cliente A' }], periodo: '2026-10', empresaId: 'e', sociedadIds: ['s1'], multisociedad: true, moneda: 'PEN' };
  assert.deepEqual(calcularRetenciones(args), [{ cliente: 'Cliente A', comprobante: 'F1', monto: 3 }]);
  assert.deepEqual(calcularFacturacionPorCliente(args), [{ nombre: 'Cliente A', monto: 100, cantidad: 1 }]);
});

test('crea serie desde resultados del servicio por moneda', () => {
  const servicio = Array.from({ length: 6 }, (_, index) => ({ periodo: `2026-${String(index + 5).padStart(2, '0')}`, er: { ingresos: { total: { PEN: 100 + index, USD: 10 } }, costoVentas: { total: { PEN: 20 } }, gastosOp: { total: { PEN: 5 } }, gastosFin: { total: { PEN: 2 } } }, utilidadBruta: { PEN: 80 + index }, resultadoOp: { PEN: 75 + index }, resultadoNeto: { PEN: 73 + index } }));
  const rows = serieResultados(servicio, 'PEN');
  assert.equal(rows.length, 6);
  assert.equal(rows[0].ingresos, 100);
  assert.equal(rows[0].resultadoNeto, 73);
  assert.equal(serieResultados([{ periodo: '2026-10', er: { ingresos: { total: { PEN: 100, USD: 10 } } } }], 'USD')[0].ingresos, 10);
});

test('prepara filas CSV para las cinco pestañas y fechas dd/mm/aaaa', () => {
  const data = { tablaResultados: [['Ingresos', 100, '100.0', 80, 20]], cxc: { vencidas: [{ cuenta_id: 'c', numero: 'F1', fecha_vencimiento: '2026-10-01', mora: 11, saldo: 30 }] }, cxp: { urgentes: [{ id: 'p', proveedor: 'P', concepto: 'Renta', fecha_vencimiento: '2026-10-04', dias: -8, saldo: 10 }] }, semanas: [{ inicio: '2026-10-05', fin: '2026-10-11', ingresos: 20, egresos: 7, neto: 13, acumulado: 13 }], cliente: () => 'Cliente A', proveedor: () => 'Proveedor P' };
  assert.deepEqual(filasCSVFinanciero('resultados', data).rows[0], data.tablaResultados[0]);
  assert.deepEqual(filasCSVFinanciero('cobranza', data).rows[0], ['Cliente A', 'F1', '01/10/2026', 11, 30]);
  assert.deepEqual(filasCSVFinanciero('pagos', data).rows[0], ['Proveedor P', 'Renta', '04/10/2026', 'Vencida 8 d', 10]);
  assert.deepEqual(filasCSVFinanciero('flujo', data).rows[0], ['05/10/2026 - 11/10/2026', 20, 7, 13, 13]);
  data.presupuestoRows = filasPresupuestoFinanciero({ empresaId: 'e', periodo: '2026-10', presupuestos: [{ id: 'b', empresa_id: 'e', periodo: '2026-10', nombre: 'Base' }], partidas: [{ presupuesto_id: 'b', categoria: 'Materiales', descripcion: 'Tubería', moneda: '$', monto_presupuestado: 42 }] });
  assert.deepEqual(filasCSVFinanciero('presupuesto', data).rows, [['Base', 'Materiales', 'Tubería', 'USD', 42]]);
  assert.equal(formatDateFinanciero('2026-10-12'), '12/10/2026');
});
