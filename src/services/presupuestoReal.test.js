import test from 'node:test';
import assert from 'node:assert/strict';
import { crearResumenRealPresupuesto, crearTotalesConsolidadosReferencialesPEN, normalizarCategoriaPresupuesto, otCompatibleConPresupuesto } from './presupuestoReal.js';

const empresaId = 'empresa-1';
const partida = (categoria, moneda = 'PEN', monto_presupuestado = 100) => ({ id: `${categoria}-${moneda}`, categoria, moneda, monto_presupuestado });
const compra = (categoria, moneda, monto, extra = {}) => ({ empresa_id: empresaId, fecha: '2026-05-15', categoria, moneda, monto, ...extra });
const ot = (monto, extra = {}) => ({ empresa_id: empresaId, fecha_cierre: '2026-05-20', estado: 'cerrada', costo_real: monto, ...extra });
const resumen = opciones => crearResumenRealPresupuesto({ empresaId, periodo: '2026-05', ...opciones });

test('consolida PEN y USD con el tipo de cambio referencial y redondea a dos decimales', () => {
  const consolidados = crearTotalesConsolidadosReferencialesPEN({
    presupuestado: { PEN: 100.125, USD: 10.005 },
    real: { PEN: 50.555, USD: 2.335 },
    variacion: { PEN: -49.57, USD: -7.67 },
  }, 3.678);

  assert.deepEqual(consolidados, {
    presupuestado: 136.92,
    real: 59.14,
    variacion: -77.78,
  });
});

test('consolida solo PEN aunque no haya tipo de cambio si no existen montos USD', () => {
  assert.deepEqual(crearTotalesConsolidadosReferencialesPEN({
    presupuestado: { PEN: 100 },
    real: { PEN: 80 },
    variacion: { PEN: -20 },
  }, null), {
    presupuestado: 100,
    real: 80,
    variacion: -20,
  });
});

test('no consolida cuando hay montos USD y falta tipo de cambio', () => {
  assert.equal(crearTotalesConsolidadosReferencialesPEN({
    presupuestado: { PEN: 100, USD: 10 },
    real: { PEN: 80, USD: 0 },
    variacion: { PEN: -20, USD: -10 },
  }, null), null);
});

test('normaliza tildes, mayúsculas, espacios y Logística directa', () => {
  assert.equal(normalizarCategoriaPresupuesto('  LOGÍSTICA  '), 'logistica');
  assert.equal(normalizarCategoriaPresupuesto('Logistica'), 'logistica');
  assert.equal(normalizarCategoriaPresupuesto('Logística directa'), 'logistica');
  const resultado = resumen({
    partidas: [partida('Logística')],
    comprasGastos: [compra('  Logistica ', 'PEN', 40), compra('Logística directa', 'PEN', 60)],
  });
  assert.equal(resultado.porPartida[0].real, 100);
});

test('separa PEN y USD y no mezcla el real sin moneda correspondiente', () => {
  const resultado = resumen({
    partidas: [partida('Servicios', 'PEN', 100), partida('Servicios', 'USD', 50)],
    comprasGastos: [compra('Servicios', 'PEN', 20), compra('Servicios', 'USD', 10)],
  });
  assert.deepEqual(resultado.porPartida.map(r => r.real), [20, 10]);
  assert.deepEqual(resultado.totales.real, { PEN: 20, USD: 10 });
});

test('una partida USD sin real USD queda en cero', () => {
  const resultado = resumen({ partidas: [partida('Servicios', 'USD')], comprasGastos: [compra('Servicios', 'PEN', 30)] });
  assert.equal(resultado.porPartida[0].real, 0);
});

test('el real USD con partida solo PEN aparece sin partida', () => {
  const resultado = resumen({ partidas: [partida('Servicios', 'PEN')], comprasGastos: [compra('Servicios', 'USD', 30)] });
  assert.equal(resultado.sinPartida.length, 1);
  assert.deepEqual(resultado.sinPartida[0], {
    id: 'sin-partida:servicios:USD', categoria: 'Servicios', moneda: 'USD', esCxpSinCategoria: false,
    desglose: [{ tipo: 'compra', categoria: 'servicios', categoriaOriginal: 'Servicios', moneda: 'USD', fecha: '2026-05-15', descripcion: '—', proveedor: '—', monto: 30, documento: '—' }],
    real: 30, descripcion: 'Real sin partida presupuestal en esta moneda',
  });
});

test('el filtro CECO aplica igual al real y al desglose', () => {
  const resultado = resumen({
    partidas: [partida('Servicios')], efectivoCecos: ['ceco-a'],
    comprasGastos: [compra('Servicios', 'PEN', 20, { centro_costo_id: 'ceco-a' }), compra('Servicios', 'PEN', 80, { centro_costo_id: 'ceco-b' })],
  });
  assert.equal(resultado.porPartida[0].real, 20);
  assert.equal(resultado.porPartida[0].desglose.reduce((s, fila) => s + fila.monto, 0), 20);
});

test('el filtro CECO no excluye OT, pero sí compras y CxP', () => {
  const resultado = resumen({
    partidas: [partida('Mano de obra'), partida('Servicios')],
    efectivoCecos: ['ceco-a'],
    ots: [ot(100), ot(200, { centro_costo_id: 'ceco-b' })],
    comprasGastos: [
      compra('Servicios', 'PEN', 25, { centro_costo_id: 'ceco-a' }),
      compra('Servicios', 'PEN', 50, { centro_costo_id: 'ceco-b' }),
    ],
    filasCxp: [
      { categoriaEr: 'Servicios', moneda: 'PEN', monto: 30, fecha: '2026-05-16', centro_costo_id: 'ceco-a' },
      { categoriaEr: 'Servicios', moneda: 'PEN', monto: 60, fecha: '2026-05-16', centro_costo_id: 'ceco-b' },
    ],
  });
  assert.equal(resultado.porPartida[0].real, 300);
  assert.equal(resultado.porPartida[1].real, 55);
});

test('incluirRegistro para OT excluye solo el CECO distinto del presupuesto activo', () => {
  const presupuestoActivo = { centro_costo_id: 'ceco-a' };
  const resultado = resumen({
    partidas: [partida('Mano de obra')],
    ots: [ot(100), ot(200, { centro_costo_id: 'ceco-a' }), ot(300, { centro_costo_id: 'ceco-b' })],
    incluirRegistro: (registro, tipo) => tipo !== 'ot' || !presupuestoActivo.centro_costo_id || !registro.centro_costo_id || registro.centro_costo_id === presupuestoActivo.centro_costo_id,
  });
  assert.equal(resultado.porPartida[0].real, 300);
});

test('compra de categoría sin partida se ignora, pero CxP sin categoría se conserva por moneda', () => {
  const resultado = resumen({
    partidas: [partida('Servicios')], comprasGastos: [compra('Administrativos', 'PEN', 20)],
    filasCxp: [{ categoriaEr: 'Administrativos', moneda: 'USD', monto: 15, fecha: '2026-05-16' }],
  });
  assert.equal(resultado.sinPartida.length, 1);
  assert.equal(resultado.sinPartida[0].categoria, 'Compras por OC sin categoría');
  assert.equal(resultado.sinPartida[0].moneda, 'USD');
  assert.equal(resultado.sinPartida[0].real, 15);
});

test('una OT solo se excluye si declara un CECO distinto al del presupuesto', () => {
  const presupuesto = { centro_costo_id: 'c1' };
  assert.equal(otCompatibleConPresupuesto({ centro_costo_id: 'c1' }, presupuesto), true);
  assert.equal(otCompatibleConPresupuesto({}, presupuesto), true);
  assert.equal(otCompatibleConPresupuesto({ centro_costo_id: 'c2' }, presupuesto), false);
  assert.equal(otCompatibleConPresupuesto({ centro_costo_id: 'c2' }, { centro_costo_id: null }), true);
  assert.equal(otCompatibleConPresupuesto({ centro_costo_id: 'c2' }, null), true);
});
