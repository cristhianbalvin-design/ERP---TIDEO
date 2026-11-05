import test from 'node:test';
import assert from 'node:assert/strict';
import { alcanceSociedades, filtrarSociedades, nombreCliente, nombreProveedor, cajaCuentas, calcularDashboard, temasAtencion } from './dashboardGeneralMetrics.js';
const hoy = '2026-11-05';
test('separación de monedas, cuenta sin dato y detracciones fuera', () => {
  const cuentas = [{ id: 'a', estado: 'activo', moneda: 'PEN', saldo_inicial: 100 }, { id: 'd', estado: 'activo', moneda: 'PEN', saldo_inicial: 90, es_cuenta_detracciones: true }];
  assert.deepEqual(cajaCuentas(cuentas, [{ cuenta_bancaria_id: 'a', moneda: 'USD', monto: 5, monto_en_moneda_cuenta: 20, tipo: 'ingreso' }], 'PEN'), { caja: 120, detracciones: 90 });
  assert.equal(cajaCuentas(cuentas, [], 'USD').caja, null);
  assert.equal(calcularDashboard({ cxc: [{ saldo: 10, moneda: 'PEN' }, { saldo: 20, moneda: 'USD' }] }, 'PEN', hoy).totalCobrar, 10);
});
test('excluye CxP anulada y fecha incluye hoy y siete días', () => {
  const cxp = ['2026-11-04', '2026-11-05', '2026-11-12', '2026-11-13'].map(fecha_vencimiento => ({ saldo: 10, fecha_vencimiento }));
  cxp.push({ saldo: 100, estado: 'anulada', fecha_vencimiento: '2026-11-01' });
  const metricas = calcularDashboard({ cxp }, 'PEN', hoy);
  assert.equal(metricas.totalPagar, 40);
  assert.equal(metricas.pagosVencidos.length, 1);
  assert.equal(metricas.proximos.length, 2);
});
test('factura resta nota de crédito y separa monedas', () => {
  const facturas = [{ tipo_documento: 'factura', total: 100, fecha_emision: hoy }, { tipo_documento: 'nota_credito', total: 25, fecha_emision: hoy }, { tipo_documento: 'boleta', total: 50, fecha_emision: hoy, moneda: 'USD' }];
  assert.equal(calcularDashboard({ facturas }, 'PEN', hoy).meses[5].facturado, 75);
});
test('agrupa estados de OT sin perder otros', () => {
  const ots = ['programada', 'ejecucion', 'cerrada', 'cerrado_conforme', 'valorizada', 'pausada', 'anulada'].map(estado => ({ estado }));
  const metricas = calcularDashboard({ ots }, 'PEN', hoy);
  assert.deepEqual(metricas.otGrupos.map(item => item.cantidad), [1, 1, 2, 1, 1]);
  assert.equal(metricas.activos.length, 6);
});
test('orden de temas es crítico, atención y pendiente', () => {
  const data = { cxc: [{ saldo: 1, fecha_vencimiento: '2026-11-04' }], ots: [{ estado: 'programada', fecha_programada: '2026-11-04' }, { estado: 'cerrada' }], cotizaciones: [{ estado: 'enviada' }] };
  assert.deepEqual(temasAtencion(data, calcularDashboard(data, 'PEN', hoy), hoy).map(item => item.titulo), ['Cobranza vencida', 'OTs programadas con fecha pasada', 'OTs cerradas sin valorizar', 'Cotizaciones sin respuesta']);
});
test('consolidado incluye sociedades disponibles y sociedad individual filtra', () => {
  const disponibles = [{ id: 'a' }, { id: 'b' }];
  const filas = [{ sociedad_id: 'a' }, { sociedad_id: 'b' }, { sociedad_id: 'c' }];
  const consolidado = alcanceSociedades(true, '**todas**', disponibles);
  assert.deepEqual(consolidado, { mode: 'consolidado', sociedadIds: ['a', 'b'] });
  assert.equal(filtrarSociedades(filas, consolidado).length, 2);
  assert.deepEqual(filtrarSociedades(filas, alcanceSociedades(true, 'b', disponibles)), [filas[1]]);
  assert.equal(filtrarSociedades(filas, alcanceSociedades(false, null)).length, 3);
});
test('oportunidades sin sociedad permanecen en el alcance', () => {
  const oportunidades = [{ id: 'x', estado: 'abierta', monto_estimado: 100 }];
  const alcance = alcanceSociedades(true, 'a', [{ id: 'a' }]);
  const seleccion = filtrarSociedades(oportunidades, alcance, false);
  assert.equal(calcularDashboard({ oportunidades: seleccion }, 'PEN', hoy).cadena[0].valor, 100);
});
test('clientes se resuelven por cuenta y nunca muestran identificadores', () => {
  const cuentas = [{ id: 'cliente-1', nombre_comercial: 'Cliente' }];
  assert.equal(nombreCliente({ cliente: 'cliente-1' }, cuentas), 'Cliente');
  assert.equal(nombreCliente({ cuenta_id: 'desconocido' }, cuentas), 'Sin dato');
  const metricas = calcularDashboard({ cuentas, cxc: [{ cuenta_id: 'cliente-1', saldo: 10 }] }, 'PEN', hoy);
  assert.equal(metricas.deudores[0].nombre, 'Cliente');
});
test('detalles usan singular, plural y antigüedad', () => {
  const data = { cxc: [{ saldo: 1, fecha_vencimiento: '2026-01-01' }, { saldo: 1, fecha_vencimiento: '2026-11-01' }], solicitudesRRHH: [{ estado: 'enviada' }], cotizaciones: [{ estado: 'enviada', fecha_envio: '2026-11-04', subtotal: 20 }] };
  const temas = temasAtencion(data, calcularDashboard(data, 'PEN', hoy), hoy);
  assert.equal(temas.find(item => item.modulo === 'cxc').detalle, '2 comprobantes, 1 con más de 90 días');
  assert.equal(temas.find(item => item.modulo === 'solicitudes_rrhh').detalle, '1 solicitud');
  assert.equal(temas.find(item => item.modulo === 'cotizaciones').detalle, '1 cotización, con 1 día');
});
test('cese oculta proveedor y respeta límites de palabra', () => {
  assert.equal(nombreProveedor({ concepto: 'Pago por CESE', nombre_emisor: 'Privado' }), 'Liquidación por cese');
  assert.equal(nombreProveedor({ concepto: 'procesen', nombre_emisor: 'Visible' }), 'Visible');
});
test('por facturar normaliza $ a USD', () => {
  const osClientes = [{ moneda: '$', saldo_por_facturar: 42 }, { moneda: 'PEN', saldo_por_facturar: 100 }];
  assert.equal(calcularDashboard({ osClientes }, 'USD', hoy).cadena[4].valor, 42);
});
