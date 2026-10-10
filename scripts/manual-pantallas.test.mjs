import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFicha, renderMigration } from './generar-manual-pantallas.mjs';
import { verify } from './verificar-manual-pantallas.mjs';

const ficha = `clave: caja
tipo: pantalla
pantalla: caja
titulo: Caja Chica
resumen: Controla fondos.
fuentes: src/pages_fin.jsx
revision: abcdef0
paso: 1 | pantalla=caja | permiso=caja:editar | Registra una rendición.
`;

test('lee cabecera, permiso y pasos ordenados', () => {
  const parsed = parseFicha(ficha);
  assert.equal(parsed.clave, 'caja');
  assert.equal(parsed.pasos[0].permiso, 'editar');
  assert.equal(parsed.pasos[0].permisoPantalla, 'caja');
  assert.equal(parsed.pasos[0].orden, 1);
});

test('rechaza permisos no admitidos', () => {
  assert.throws(() => parseFicha(ficha.replace('caja:editar', 'caja:supervisar')), /permiso inválido/);
});

test('la migración escapa comillas y contiene límites de RPC', () => {
  const parsed = parseFicha(ficha.replace('Caja Chica', "Caja 'Chica"));
  const sql = renderMigration([parsed]);
  assert.match(sql, /Caja ''Chica/);
  assert.match(sql, /SECURITY INVOKER SET search_path=public/);
  assert.match(sql, /ROLLBACK;/);
});

test('verificación avisa qué ficha quedó desactualizada y detecta seed distinto', async () => {
  const parsed = parseFicha(ficha);
  const errors = await verify({
    fichas: [parsed], currentHead: 'head', changedSince: () => ['src/pages_fin.jsx'], dirtyFiles: [],
    migration: 'distinta', generated: 'esperada', resolveRevision: x => x, isAncestor: () => {},
  });
  assert.match(errors[0], /caja: revisar ficha/);
  assert.match(errors[1], /no coincide/);
});

test('verificación pasa si fuentes no cambiaron y el seed coincide', async () => {
  const parsed = parseFicha(ficha);
  const errors = await verify({
    fichas: [parsed], currentHead: 'head', changedSince: () => [], dirtyFiles: [], migration: 'ok', generated: 'ok', resolveRevision: x => x, isAncestor: () => {},
  });
  assert.deepEqual(errors, []);
});
