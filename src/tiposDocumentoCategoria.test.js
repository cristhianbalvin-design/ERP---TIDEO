import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIAS_TIPO_DOCUMENTO,
  normalizarCategoriaTipoDocumento,
  sugerirCategoriaTipoDocumento,
} from './services/tiposDocumentoService.js';

test('expone categorías de tipo de documento en el orden del formulario', () => {
  assert.deepEqual(CATEGORIAS_TIPO_DOCUMENTO, [
    'Contractual',
    'Identificación',
    'Seguridad y Salud',
    'Capacitación',
    'Otros',
  ]);
});

test('sugiere Contractual para nombres que contienen contrato o adenda', () => {
  assert.equal(sugerirCategoriaTipoDocumento('Contrato laboral'), 'Contractual');
  assert.equal(sugerirCategoriaTipoDocumento('Primera ADENDA'), 'Contractual');
  assert.equal(sugerirCategoriaTipoDocumento('DNI'), null);
});

test('normaliza categorías vacías o desconocidas a Otros al editar', () => {
  assert.equal(normalizarCategoriaTipoDocumento(''), 'Otros');
  assert.equal(normalizarCategoriaTipoDocumento(null), 'Otros');
  assert.equal(normalizarCategoriaTipoDocumento('Legado'), 'Otros');
  assert.equal(normalizarCategoriaTipoDocumento('Capacitación'), 'Capacitación');
});
