import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFicha, renderSync, actualizarHuellas } from './generar-manual-pantallas.mjs';
import { verify } from './verificar-manual-pantallas.mjs';

const ficha = `clave: caja
tipo: pantalla
pantalla: caja
catalogo: admin/caja
titulo: Caja Chica
resumen: Controla fondos.
componentes: src/pages_fin.jsx#CajaChica
huella: 0123456789
paso: 1 | pantalla=caja | permiso=caja:editar | Registra una rendición.
`;
const catalogo = { pantallas: [{ clave: 'admin/caja', permiso: 'caja' }] };

test('lee cabecera, catálogo, componentes, huella y pasos', () => {
  const parsed = parseFicha(ficha);
  assert.equal(parsed.clave, 'caja');
  assert.deepEqual(parsed.catalogo, ['admin/caja']);
  assert.deepEqual(parsed.componentes, ['src/pages_fin.jsx#CajaChica']);
  assert.deepEqual(parsed.huella, ['0123456789']);
  assert.equal(parsed.pasos[0].permiso, 'editar');
  assert.equal(parsed.pasos[0].permisoPantalla, 'caja');
});

test('rechaza permisos no admitidos, campos desconocidos y huellas incompletas', () => {
  assert.throws(() => parseFicha(ficha.replace('caja:editar', 'caja:supervisar')), /permiso inválido/);
  assert.throws(() => parseFicha(ficha.replace('titulo:', 'revision: abc\ntitulo:')), /campo desconocido revision/);
  assert.throws(() => parseFicha(ficha.replace('huella: 0123456789', 'huella: 0123456789 9876543210')), /huella/);
  assert.throws(() => parseFicha(ficha.replace('catalogo: admin/caja\n', '')), /catalogo/);
});

test('la sincronización escapa comillas, no recrea tablas y verifica conteos', () => {
  const sql = renderSync([parseFicha(ficha.replace('Caja Chica', "Caja 'Chica"))]);
  assert.match(sql, /Caja ''Chica/);
  assert.match(sql, /ON CONFLICT \(clave\) DO UPDATE/);
  assert.match(sql, /DELETE FROM public\.asistente_manual_pasos WHERE ficha_clave IN \('caja'\)/);
  assert.doesNotMatch(sql, /CREATE TABLE/);
  assert.match(sql, /RAISE EXCEPTION 'Sincronización del manual: se esperaban 1 pasos'/);
  assert.match(sql, /COMMIT;\n$/);
});

test('verificación avisa la ficha desactualizada y el componente que cambió', () => {
  const { errores, avisos } = verify({ fichas: [parseFicha(ficha)], catalogo, calcular: () => ['aaaaaaaaaa'] });
  assert.deepEqual(errores, []);
  assert.match(avisos[0], /caja: ficha desactualizada; cambió el código de src\/pages_fin\.jsx#CajaChica/);
});

test('verificación pasa si la huella coincide y la sincronización está al día', () => {
  const parsed = parseFicha(ficha);
  const sql = renderSync([parsed]);
  assert.deepEqual(verify({ fichas: [parsed], catalogo, calcular: () => ['0123456789'], sync: sql, esperado: sql }), { errores: [], avisos: [] });
});

test('verificación detecta catálogo inexistente, permiso distinto y sincronización vieja', () => {
  const parsed = parseFicha(ficha);
  const r1 = verify({ fichas: [parsed], catalogo: { pantallas: [] }, calcular: () => ['0123456789'] });
  assert.match(r1.errores[0], /admin\/caja no existe/);
  const r2 = verify({ fichas: [parsed], catalogo: { pantallas: [{ clave: 'admin/caja', permiso: 'cxp' }] }, calcular: () => ['0123456789'] });
  assert.match(r2.errores[0], /no coincide con el del catálogo/);
  const r3 = verify({ fichas: [parsed], catalogo, calcular: () => ['0123456789'], sync: 'viejo', esperado: 'nuevo' });
  assert.match(r3.errores[0], /_sincronizar\.sql no coincide/);
});

test('actualizar huellas reescribe solo la línea huella', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'manual-'));
  await writeFile(path.join(dir, 'caja.txt'), ficha, 'utf8');
  const cambiadas = await actualizarHuellas(dir, () => ['fedcba9876']);
  assert.deepEqual(cambiadas, ['caja']);
  const texto = await readFile(path.join(dir, 'caja.txt'), 'utf8');
  assert.equal(texto, ficha.replace('huella: 0123456789', 'huella: fedcba9876'));
});
