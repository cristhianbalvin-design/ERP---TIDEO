import test from 'node:test';
import assert from 'node:assert/strict';
import { BORRADOR_OTRO_DIAGNOSTICO_ERROR, validarBorradorDiagnostico } from '../src/services/validarBorradorDiagnostico.js';

test('acepta el borrador asociado al diagnóstico seleccionado', () => {
  const borrador = { id: 'informe-1', estado: 'borrador', diagnostico_id: 'diag-1' };
  assert.equal(validarBorradorDiagnostico(borrador, 'diag-1'), borrador);
});

test('rechaza un borrador asociado a otro diagnóstico de la recepción', () => {
  assert.throws(
    () => validarBorradorDiagnostico({ id: 'informe-1', diagnostico_id: 'diag-anterior' }, 'diag-1'),
    { message: BORRADOR_OTRO_DIAGNOSTICO_ERROR },
  );
});
