import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularManoObraNoAsignada,
  cxpCanDevengarEr,
  esCategoriaInversionCajaChica,
  filtrarCajaChicaSinGastoVinculado,
  filtrarComprasGastosParaEr,
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
