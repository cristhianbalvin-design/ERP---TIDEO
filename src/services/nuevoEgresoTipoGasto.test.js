import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/NuevoEgreso.jsx', import.meta.url), 'utf8');

function extraerCxpRecord(branchStart) {
  const recordStart = source.indexOf('const cxpRecord = {', branchStart);
  assert.notEqual(recordStart, -1, 'debe existir un cxpRecord en la rama');
  const recordEnd = source.indexOf('\n        };', recordStart);
  assert.notEqual(recordEnd, -1, 'debe cerrarse el cxpRecord');
  return source.slice(recordStart, recordEnd);
}

test('ambas ramas del wizard guardan el tipo de gasto recortado o null en la CxP', () => {
  const paidStart = source.indexOf("const tcPago = await getTipoCambioPorFecha(fechaPago, sb)");
  const pendingStart = source.indexOf('} else if (!form.ya_pagado) {');
  assert.notEqual(paidStart, -1, 'debe existir la rama de egreso pagado');
  assert.notEqual(pendingStart, -1, 'debe existir la rama de egreso pendiente');

  const expectedField = /tipo_gasto:\s*tipoSel\?\.nombre\?\.trim\(\) \|\| null,/;
  assert.match(extraerCxpRecord(paidStart), expectedField);
  assert.match(extraerCxpRecord(pendingStart), expectedField);
});

test('la creación del gasto guarda subcategoria sin depender de si ya fue pagado', () => {
  const gastoBaseStart = source.indexOf('const gastoBase = {');
  const gastoPayloadStart = source.indexOf('const gastoPayload = {', gastoBaseStart);
  assert.notEqual(gastoBaseStart, -1, 'debe existir el gastoBase de creación');
  assert.notEqual(gastoPayloadStart, -1, 'debe existir el gastoPayload de creación');

  const gastoBase = source.slice(gastoBaseStart, gastoPayloadStart);
  const gastoPayloadEnd = source.indexOf('\n        };', gastoPayloadStart);
  assert.notEqual(gastoPayloadEnd, -1, 'debe cerrarse el gastoPayload');
  const gastoPayload = source.slice(gastoPayloadStart, gastoPayloadEnd);
  const expectedField = /subcategoria:\s*tipoSel\?\.nombre\s*\|\|\s*null,/;

  assert.match(gastoBase, expectedField);
  assert.match(gastoPayload, expectedField);
  assert.doesNotMatch(gastoBase, /ya_pagado[\s\S]{0,100}subcategoria|subcategoria[\s\S]{0,100}ya_pagado/);
  assert.doesNotMatch(gastoPayload, /ya_pagado[\s\S]{0,100}subcategoria|subcategoria[\s\S]{0,100}ya_pagado/);
});

test('la creación excluye del ER solo los tipos no gasto y marca su CxP pendiente', () => {
  const gastoBaseStart = source.indexOf('const gastoBase = {');
  const gastoPayloadStart = source.indexOf('const gastoPayload = {', gastoBaseStart);
  const gastoBase = source.slice(gastoBaseStart, gastoPayloadStart);
  const gastoPayloadEnd = source.indexOf('\n        };', gastoPayloadStart);
  const gastoPayload = source.slice(gastoPayloadStart, gastoPayloadEnd);
  const pendingStart = source.indexOf('} else if (!form.ya_pagado) {');
  const pendingCxp = extraerCxpRecord(pendingStart);
  const paidStart = source.indexOf('const tcPago = await getTipoCambioPorFecha(fechaPago, sb)');
  const paidCxp = extraerCxpRecord(paidStart);

  assert.match(gastoBase, /tipoSel\?\.es_no_gasto\s*\?\s*\{\s*excluir_de_er:\s*true\s*\}\s*:\s*\{\s*\}/);
  assert.match(gastoPayload, /tipoSel\?\.es_no_gasto\s*\?\s*\{\s*excluir_de_er:\s*true\s*\}\s*:\s*\{\s*\}/);
  assert.match(pendingCxp, /tipoSel\?\.es_no_gasto\s*\?\s*\{\s*no_devengar_er:\s*true\s*\}\s*:\s*\{\s*\}/);
  assert.match(paidCxp, /no_devengar_er:\s*true/);
  assert.match(gastoPayload, /excluir_de_er/);
  assert.match(source, /\.select\('\*'\)/);
  assert.match(source, /es_no_gasto:\s*false/);
});
