import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularManoObraNoAsignada,
  costoPlanillaFila,
  cxpCanDevengarEr,
  esCategoriaInversionCajaChica,
  filtrarCajaChicaSinGastoVinculado,
  filtrarComprasGastosParaEr,
  partesPlanillaFila,
} from './estadoResultadosService.js';

test('un gasto excluido no entra al ER y un gasto normal sí entra', () => {
  const gastos = [
    { id: 'excluido', monto: 25, excluir_de_er: true, estado: 'registrado' },
    { id: 'normal', monto: 40, excluir_de_er: false, estado: 'registrado' },
  ];
  assert.deepEqual(filtrarComprasGastosParaEr(gastos).map(g => g.id), ['normal']);
});

test('una CxP pendiente con no_devengar_er no se devenga en el ER', () => {
  const cxp = { estado: 'por_pagar', monto_total: 70, moneda: 'PEN', no_devengar_er: true };
  assert.equal(cxpCanDevengarEr(cxp), false);
});

test('caja_chica con gasto_id se omite para evitar duplicar el gasto vinculado', () => {
  const filas = [
    { id: 'vinculada', gasto_id: 'gasto-1' },
    { id: 'sin-gasto', gasto_id: null },
  ];
  assert.deepEqual(filtrarCajaChicaSinGastoVinculado(filas).map(f => f.id), ['sin-gasto']);
});

test('identifica categorías de inversión por tipo_sistema aunque tengan otro nombre', () => {
  const config = [{ nombre: 'Activos capitalizables', tipo_sistema: 'inversiones' }];
  assert.equal(esCategoriaInversionCajaChica('Activos capitalizables', config), true);
  assert.equal(esCategoriaInversionCajaChica('Gastos de oficina', config), false);
});

test('conserva categorías que no resuelven como inversiones en ER', () => {
  assert.equal(esCategoriaInversionCajaChica('Categoría sin configuración', []), false);
});


test('mano de obra no asignada conserva la diferencia positiva', () => {
  const calculo = calcularManoObraNoAsignada({ filasPlanilla: [{ importe: 100, moneda: 'PEN' }], costosOt: [{ mano_obra: 40, moneda: 'PEN' }], monedaCalculo: 'PEN' });
  assert.equal(calculo.filas[0].importe, 60);
  assert.equal(calculo.otherCurrenciesWarning, false);
});

test('mano de obra absorbida totalmente no agrega filas', () => {
  const calculo = calcularManoObraNoAsignada({ filasPlanilla: [{ importe: 100, moneda: 'PEN' }], costosOt: [{ mano_obra: 120, moneda: 'PEN' }], monedaCalculo: 'PEN' });
  assert.deepEqual(calculo.filas, []);
});

test('mano de obra en monedas mezcladas sin tasa se compara por moneda', () => {
  const calculo = calcularManoObraNoAsignada({ filasPlanilla: [{ importe: 100, moneda: 'PEN' }, { importe: 50, moneda: 'USD' }], costosOt: [{ mano_obra: 40, moneda: 'PEN' }, { mano_obra: 20, moneda: 'USD' }], monedaCalculo: 'PEN' });
  assert.deepEqual(calculo.filas.map(fila => fila.importe), [60, 30]);
  assert.equal(calculo.otherCurrenciesWarning, true);
});


test('costo de planilla usa el costo real de la empresa cuando es positivo', () => {
  assert.equal(costoPlanillaFila({ costo_real_empresa: 1500, remuneracion_bruta: 1000, essalud: 90 }), 1500);
});

test('costo de planilla usa la remuneración bruta y cargas cuando el costo real es nulo o cero', () => {
  const fila = { remuneracion_bruta: 1000, essalud: 90, cts: 80, gratificacion: 70, vacaciones: 60 };
  assert.equal(costoPlanillaFila({ ...fila, costo_real_empresa: null }), 1300);
  assert.equal(costoPlanillaFila({ ...fila, costo_real_empresa: 0 }), 1300);
});

test('los descuentos del trabajador no reducen el costo de planilla', () => {
  const fila = { remuneracion_bruta: 1000, essalud: 90, neto: 700, descuento_afp: 200, retencion_renta: 100 };
  assert.equal(costoPlanillaFila(fila), 1090);
});

test('las remuneraciones y cargas suman el costo de planilla de cada fila', () => {
  const fila = { remuneracion_bruta: 1000, essalud: 90, cts: 80, gratificacion: 70, vacaciones: 60 };
  for (const costo_real_empresa of [1500, null, 0]) {
    const actual = { ...fila, costo_real_empresa };
    const partes = partesPlanillaFila(actual);
    assert.equal(partes.cargas, 300);
    assert.equal(partes.remuneraciones + partes.cargas, costoPlanillaFila(actual));
  }
});

test('las remuneraciones no son negativas cuando las cargas superan el costo real', () => {
  assert.deepEqual(partesPlanillaFila({ costo_real_empresa: 50, essalud: 90 }), { remuneraciones: 0, cargas: 90 });
});
