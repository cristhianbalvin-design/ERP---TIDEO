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
