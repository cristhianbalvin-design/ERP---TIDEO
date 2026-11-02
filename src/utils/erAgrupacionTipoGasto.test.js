import assert from 'node:assert/strict';
import { agruparDetallesPorTipoGasto } from './erAgrupacionTipoGasto.js';

const details = [
  { id: '1', subcategoria: 'Movilidad', amount: 25, currency: 'PEN' },
  { id: '2', subcategoria: 'Movilidad', amount: 10, currency: 'USD' },
  { id: '3', subcategoria: 'Alimentación', amount: 40, currency: 'PEN' },
  { id: '4', subcategoria: null, amount: 5, currency: 'PEN' },
  { id: '5', subcategoria: '  ', amount: 2, currency: 'USD' },
];

const grupos = agruparDetallesPorTipoGasto(details);
assert.deepEqual(grupos.map(grupo => grupo.tipoGasto), ['Movilidad', 'Alimentación', 'Sin tipo de gasto']);
assert.deepEqual(grupos[0].totals, { PEN: 25, USD: 10 });
assert.deepEqual(grupos[0].details.map(detail => detail.id), ['1', '2']);
assert.deepEqual(grupos[2].totals, { PEN: 5, USD: 2 });

const sumasDetalle = details.reduce((totals, detail) => {
  const moneda = detail.currency;
  totals[moneda] = (totals[moneda] || 0) + detail.amount;
  return totals;
}, {});
const sumasGrupo = grupos.reduce((totals, grupo) => {
  for (const [moneda, importe] of Object.entries(grupo.totals)) totals[moneda] = (totals[moneda] || 0) + importe;
  return totals;
}, {});
assert.deepEqual(sumasGrupo, sumasDetalle);
assert.deepEqual(agruparDetallesPorTipoGasto([]), []);
console.log('OK erAgrupacionTipoGasto: agrupación, sin tipo, suma total y monedas');
