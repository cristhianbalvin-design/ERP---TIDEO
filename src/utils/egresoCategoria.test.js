import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoriaAlSeleccionarTipo,
  categoriaEgresoValida,
  categoriaInicialEgreso,
  derivarCategoriasEgresoDesdeTipos,
  pasoInicialNuevoEgreso,
  resolverCategoriaEgreso,
} from './egresoCategoria.js';

test('todo egreso nuevo empieza en el paso 1 aunque llegue preconfigurado o con borrador', () => {
  assert.equal(pasoInicialNuevoEgreso({ preconfig: { paso: 2 }, draft: { paso: 3 } }), 1);
  assert.equal(pasoInicialNuevoEgreso({ preconfig: { paso: 3 } }), 1);
});

test('la edición existente conserva su paso actual', () => {
  assert.equal(pasoInicialNuevoEgreso({ registroEditar: { id: 'g-1' } }), 2);
});

test('la categoría inicial toma la del tipo precargado sin alterar el formulario', () => {
  assert.equal(categoriaInicialEgreso({ preconfig: { tipoSel: { categoria_er: 'Materiales' } } }), 'Materiales');
});

test('cambiar el tipo reinicia la categoría a la asociada al nuevo tipo', () => {
  assert.equal(categoriaAlSeleccionarTipo({ categoria_er: 'Gastos financieros' }), 'Gastos financieros');
  assert.equal(categoriaAlSeleccionarTipo({}), '');
});

test('la categoría vacía o espacios no pasa validación', () => {
  assert.equal(categoriaEgresoValida('Materiales'), true);
  assert.equal(categoriaEgresoValida('  '), false);
  assert.equal(categoriaEgresoValida(null), false);
});

test('al prellenar usa el nombre exacto del catálogo con coincidencia normalizada', () => {
  const catalogo = [{ nombre: 'Logística de oficina', es_capitalizacion: false }];
  assert.equal(categoriaAlSeleccionarTipo({ categoria_er: ' LOGISTICA   DE OFICINA ' }, catalogo), 'Logística de oficina');
  assert.equal(categoriaAlSeleccionarTipo({ categoria_er: 'otra categoría' }, catalogo), '');
});

test('el respaldo deriva categorías únicas de tipos y conserva la bandera de capitalización', () => {
  const tipos = [
    { categoria_er: 'Materiales', es_capitalizacion: true },
    { categoria_er: 'Materiales', es_capitalizacion: false },
    { categoria_er: 'Logística', es_capitalizacion: false },
  ];
  assert.deepEqual(derivarCategoriasEgresoDesdeTipos(tipos).map(({ nombre, es_capitalizacion }) => ({ nombre, es_capitalizacion })), [
    { nombre: 'Materiales', es_capitalizacion: true },
    { nombre: 'Logística', es_capitalizacion: false },
  ]);
  assert.equal(resolverCategoriaEgreso('Materiales', [], tipos), 'Materiales');
  assert.equal(resolverCategoriaEgreso('desconocida', [], tipos), '');
});
