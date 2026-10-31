import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crearPayloadSugerenciaCategoriaEgreso,
  validarRespuestaSugerenciaCategoriaEgreso,
  sugerirCategoriaEgreso,
} from './sugerirCategoriaEgresoService.js';

test('el payload solo incluye empresa para autorización, descripción y tipo', () => {
  const payload = crearPayloadSugerenciaCategoriaEgreso({
    empresaId: 'empresa-1', descripcion: 'Compra de cable', tipoGasto: 'Materiales',
    proveedor: 'Privado', monto: 900, categorias: ['No viajan'],
  });
  assert.deepEqual(Object.keys(payload), ['empresa_id', 'descripcion', 'tipo_gasto']);
  assert.deepEqual(payload, { empresa_id: 'empresa-1', descripcion: 'Compra de cable', tipo_gasto: 'Materiales' });
});

test('acepta categoría activa exacta y razón breve', () => {
  assert.deepEqual(validarRespuestaSugerenciaCategoriaEgreso(
    { categoria: 'Materiales', razon: 'Describe compra de insumos.' }, ['Materiales', 'Servicios'],
  ), { categoria: 'Materiales', razon: 'Describe compra de insumos.' });
});

test('rechaza categoría inventada y respuesta de red inválida', () => {
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ categoria: 'Inventada', razon: 'x' }, ['Materiales']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso(null, ['Materiales']), null);
});

test('propaga de forma controlada errores de red de la invocación', async () => {
  const cliente = { functions: { invoke: async () => { throw new TypeError('Failed to fetch'); } } };
  await assert.rejects(
    sugerirCategoriaEgreso({ empresaId: 'e1', descripcion: 'cable', tipoGasto: 'Materiales', cliente }),
    /Failed to fetch/,
  );
});
