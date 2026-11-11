import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRealDePresupuesto } from './presupuestoRealPantalla.js';

const empresaId = 'empresa-1';
const periodo = '2026-10';
const partidas = [{ categoria: 'Materiales', monto_presupuestado: 1000, moneda: 'PEN' }, { categoria: 'Mano de obra', monto_presupuestado: 500, moneda: 'PEN' }];
const comprasGastos = [
  { empresa_id: empresaId, fecha: '2026-10-03', categoria: 'Materiales', moneda: 'PEN', monto: 400, sociedad_id: 's1' },
  { empresa_id: empresaId, fecha: '2026-10-04', categoria: 'Materiales', moneda: 'PEN', monto: 250, sociedad_id: 's2' },
];
const ots = [
  { empresa_id: empresaId, estado: 'cerrada', fecha_cierre: '2026-10-10', costo_real: 300, centro_costo_id: 'c1' },
  { empresa_id: empresaId, estado: 'cerrada', fecha_cierre: '2026-10-11', costo_real: 90, centro_costo_id: 'c2' },
];
const centrosCosto = [{ id: 'c1', sociedad_id: 's1' }, { id: 'c2', sociedad_id: 's2' }];

test('sin multisociedad el real suma todos los registros del periodo', () => {
  const r = crearRealDePresupuesto({ presupuesto: { id: 'p', sociedad_id: 's1' }, partidas, comprasGastos, ots, centrosCosto, empresaId, periodo, sinMultisociedad: true });
  assert.equal(r.totales.real.PEN, 1040);
});

test('con multisociedad solo cuenta la sociedad del presupuesto, y la de la OT sale de su centro de costo', () => {
  const r = crearRealDePresupuesto({ presupuesto: { id: 'p', sociedad_id: 's1' }, partidas, comprasGastos, ots, centrosCosto, empresaId, periodo, sinMultisociedad: false });
  assert.equal(r.porPartida.find(p => p.categoria === 'materiales').real, 400);
  assert.equal(r.porPartida.find(p => p.categoria === 'mano de obra').real, 300);
});

test('un presupuesto con centro de costo no toma OT de otro centro', () => {
  const r = crearRealDePresupuesto({ presupuesto: { id: 'p', centro_costo_id: 'c2' }, partidas, comprasGastos, ots, centrosCosto, empresaId, periodo, sinMultisociedad: true });
  assert.equal(r.porPartida.find(p => p.categoria === 'mano de obra').real, 90);
});
