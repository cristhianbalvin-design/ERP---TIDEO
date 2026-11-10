// Pruebas de los botones de opciones de Aria. Ejecutar: npm run test:aria-voz
import test from 'node:test';
import assert from 'node:assert/strict';
import { opcionesDeEgreso } from './opciones.ts';

test('fondos: un botón por fondo con responsable y saldo', () => {
  const o = opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['fondo'], fondos: [
    { nombre: 'Caja Chica Taller Ate', responsable: 'Martín Huamán', moneda: 'PEN', saldo: 5660 },
    { nombre: 'Caja USD', moneda: 'USD', saldo: 1250.5 }] });
  assert.equal(o.campo, 'fondo');
  assert.deepEqual(o.items[0], { etiqueta: 'Caja Chica Taller Ate', detalle: 'Martín Huamán · S/ 5,660.00', valor: 'Del fondo Caja Chica Taller Ate' });
  assert.equal(o.items[1].detalle, 'US$ 1,250.50');
});

test('categoría: primero las categorías y luego hasta 6 tipos parecidos', () => {
  const o = opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['categoria'], opciones: {
    tipos_parecidos: [{ tipo: 'EPP y guantes', categoria: 'SSOMA operativo' }], categorias: ['Costos indirectos de taller', 'SSOMA operativo'] } });
  assert.equal(o.titulo, 'Elige la categoría o un tipo de gasto');
  assert.deepEqual(o.items.map(i => i.valor), ['Categoría: Costos indirectos de taller', 'Categoría: SSOMA operativo', 'Tipo de gasto: EPP y guantes']);
  const muchos = opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['categoria'], opciones: {
    tipos_parecidos: Array.from({ length: 15 }, (_, i) => ({ tipo: `T${i}`, categoria: 'Materiales' })), categorias: Array.from({ length: 13 }, (_, i) => `C${i}`) } });
  assert.equal(muchos.items.length, 19);
  assert.equal(muchos.items[12].etiqueta, 'C12');
});

test('ceco con código y nombre; sin datos útiles no hay botones', () => {
  const o = opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['ceco'], cecos: [{ codigo: 'TAL-01', nombre: 'Taller Ate' }] });
  assert.deepEqual(o.items, [{ etiqueta: 'TAL-01 · Taller Ate', valor: 'CECO: TAL-01' }]);
  assert.equal(opcionesDeEgreso({ estado: 'listo', borrador: {} }), null);
  assert.equal(opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['monto'] }), null);
  assert.equal(opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['fondo'], fondos: [] }), null);
  assert.equal(opcionesDeEgreso(null), null);
});

test('máximo 20 botones', () => {
  const o = opcionesDeEgreso({ estado: 'faltan_datos', faltan: ['categoria'], opciones: { categorias: Array.from({ length: 30 }, (_, i) => `C${i}`) } });
  assert.equal(o.items.length, 20);
});
