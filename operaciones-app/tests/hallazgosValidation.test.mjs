import test from 'node:test';
import assert from 'node:assert/strict';
import { getIncompleteHallazgos, missingHallazgoFields } from '../src/zahory-mock/pages/hallazgosValidation.js';

const complete = {
  familia_trabajo_id: 'family-1', componente_parte: 'Eje', tipo_dano_codigo: 'desgaste',
  causa_probable_codigo: 'fatiga', condicion: 'conforme', riesgo: 'monitorear',
  accion_recomendada: 'reparar', atribuible_a: 'operacion',
};

test('la validación identifica todos los campos obligatorios faltantes en orden de formulario', () => {
  assert.deepEqual(missingHallazgoFields({}), [
    'family', 'component', 'damage', 'cause', 'condition', 'risk', 'action', 'attribution',
  ]);
});

test('el conteo incluye solo hallazgos incompletos y conserva el primero para navegar', () => {
  const rows = getIncompleteHallazgos([{ ...complete, componente_parte: '  ' }, complete, { ...complete, prioridad_override: 'P1' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].missingFields[0], 'component');
  assert.equal(rows[1].index, 2);
  assert.deepEqual(rows[1].missingFields, ['override_reason']);
});

test('un hallazgo completo no genera faltantes', () => {
  assert.deepEqual(getIncompleteHallazgos([complete]), []);
});
