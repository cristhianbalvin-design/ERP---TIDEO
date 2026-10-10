import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverCatalogoComponentes, resolverMedidaComponente } from './catalogoComponentesLogic.js';

test('resuelve una medida base sin marcarla como personalizada', () => {
  const medida = { id: 'dint', nombre: 'Diámetro interior', cota: 'dint', desde: 'Tres puntos', referencia: 'H8' };
  assert.deepEqual(resolverMedidaComponente(medida), { ...medida, personalizado: false });
});

test('mantiene una cota ausente como campo vacío editable y no como texto null', () => {
  const medida = { id: 'axm', nombre: 'Espesor (juego axial)', cota: null, desde: 'Vista lateral' };
  const resuelta = resolverMedidaComponente(medida);
  assert.equal(resuelta.cota, '');
  assert.notEqual(resuelta.cota, 'null');
  assert.equal(resuelta.personalizado, false);
});

test('conserva una cota anulada en un override y la considera un cambio', () => {
  const medida = { id: 'dint', nombre: 'Interior', cota: 'dint' };
  const resuelta = resolverMedidaComponente(medida, { cota: null });
  assert.equal(resuelta.cota, '');
  assert.equal(resuelta.personalizado, true);
});

test('aplica solo los campos editados y mantiene los campos base restantes', () => {
  const medida = { id: 'dint', nombre: 'Diámetro interior', cota: 'dint', desde: 'Tres puntos', referencia: 'H8' };
  const resuelta = resolverMedidaComponente(medida, { nombre: 'Diámetro útil' });
  assert.equal(resuelta.nombre, 'Diámetro útil');
  assert.equal(resuelta.referencia, 'H8');
  assert.equal(resuelta.personalizado, true);
});

test('resuelve overrides por medida sin alterar las zonas ni las demás medidas', () => {
  const catalogo = resolverCatalogoComponentes([{ id: 'cil', zonas: [{ id: 'camisa', medidas: [
    { id: 'dint', nombre: 'Interior', cota: 'dint', override: { cota: 'd-int' } },
    { id: 'esp', nombre: 'Espesor', cota: 'esp' },
  ] }] }]);
  assert.equal(catalogo[0].activo, true);
  assert.equal(catalogo[0].zonas[0].medidas[0].cota, 'd-int');
  assert.equal(catalogo[0].zonas[0].medidas[0].personalizado, true);
  assert.equal(catalogo[0].zonas[0].medidas[1].personalizado, false);
});
