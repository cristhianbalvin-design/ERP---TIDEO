import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarCatalogo, calcularCobertura, renderCatalogoSync, bloquesCatalogoSync, leerCatalogo, generarTodo } from './catalogo.mjs';
import { inventario, pantallasPermisos } from './inventario-codigo.mjs';
import { codigoComponente, huellaComponente } from './huella.mjs';

const permisos = [{ clave: 'caja' }, { clave: 'cxp' }];
const base = () => ({
  permisos_adicionales: [{ clave: 'transporte_comercial' }],
  equivalencias_permisos: { 'Caja Chica': 'caja' },
  pantallas: [
    { clave: 'admin/caja', app: 'admin', modulo: 'Administración', titulo: 'Caja Chica', ruta: 'caja', alias: [], componente: 'src/a.jsx#Caja', permiso: 'caja', tipo: 'menu', estado: 'activa' },
    { clave: 'operaciones/flota', app: 'operaciones', modulo: 'Flota', titulo: 'Panel', ruta: 'flota', alias: ['panel'], componente: 'src/b.jsx#Flota', permiso: 'transporte_comercial', tipo: 'menu', estado: 'activa' },
  ],
});
const inv = [
  { app: 'admin', ruta: 'caja', alias: [], componente: 'src/a.jsx#Caja', etiqueta: 'Caja Chica' },
  { app: 'operaciones', ruta: 'flota', alias: ['panel'], componente: 'src/b.jsx#Flota', etiqueta: 'Panel' },
];

test('catálogo consistente con el código no reporta errores', () => {
  assert.deepEqual(verificarCatalogo(base(), inv, permisos), []);
});

test('una pantalla nueva en el código sin entrada en el catálogo es un error', () => {
  const errores = verificarCatalogo(base(), [...inv, { app: 'admin', ruta: 'nueva', alias: [], componente: 'src/c.jsx#Nueva', etiqueta: 'Nueva' }], permisos);
  assert.match(errores.join('\n'), /admin\/nueva: la pantalla existe en el código .* pero no está en catalogo\/pantallas\.json/);
});

test('detecta pantallas retiradas, componente movido, alias, tipo y permiso inválido', () => {
  const c = base();
  c.pantallas[0].componente = 'src/viejo.jsx#Caja';
  c.pantallas[0].tipo = 'subpantalla';
  c.pantallas[1].alias = [];
  c.pantallas[1].permiso = 'no_existe';
  c.pantallas.push({ clave: 'admin/retirada', app: 'admin', modulo: 'X', titulo: 'X', ruta: 'retirada', alias: [], componente: 'x', permiso: null, tipo: 'menu', estado: 'activa' });
  const texto = verificarCatalogo(c, inv, permisos).join('\n');
  assert.match(texto, /admin\/caja: el componente cambió/);
  assert.match(texto, /admin\/caja: el tipo debe ser menu/);
  assert.match(texto, /operaciones\/flota: los alias del código \(panel\)/);
  assert.match(texto, /permiso no_existe no existe/);
  assert.match(texto, /admin\/retirada: está en el catálogo pero ya no existe en el código/);
});

test('detecta claves mal formadas, estados inválidos y equivalencias rotas', () => {
  const c = base();
  c.pantallas[0].clave = 'admin/otra';
  c.pantallas[1].estado = 'borrador';
  c.equivalencias_permisos['Algo'] = 'sin_permiso';
  const texto = verificarCatalogo(c, inv, permisos).join('\n');
  assert.match(texto, /la clave debe ser "admin\/caja"/);
  assert.match(texto, /estado inválido borrador/);
  assert.match(texto, /equivalencia "Algo" apunta a un permiso inexistente/);
});

test('cobertura cruza fichas, procesos y herramientas por permiso', () => {
  const c = base();
  const herramientas = [
    { nombre: 'asistente_buscar_caja_chica', tipo: 'lectura', permisos: ['caja'] },
    { nombre: 'asistente_preparar_egreso_caja_chica', tipo: 'registro', permisos: ['caja'] },
  ];
  const fichas = [
    { clave: 'caja', tipo: 'pantalla', catalogo: ['admin/caja'], pasos: [] },
    { clave: 'proceso_caja', tipo: 'proceso', catalogo: [], pasos: [{ pantalla: 'caja' }] },
  ];
  const [caja, flota] = calcularCobertura(c, herramientas, fichas);
  assert.deepEqual(caja, { clave: 'admin/caja', fichas: ['caja'], procesos: ['proceso_caja'], herramientas_lectura: ['asistente_buscar_caja_chica'], herramientas_registro: ['asistente_preparar_egreso_caja_chica'], nivel: 'completa' });
  assert.equal(flota.nivel, 'sin_cobertura');
});

test('la sincronización del catálogo es idempotente y verifica conteos', () => {
  const c = base();
  const cobertura = calcularCobertura(c, [], []);
  const sql = renderCatalogoSync(c, cobertura);
  assert.match(sql, /^-- Generado por scripts\/manual\/catalogo\.mjs/);
  assert.match(sql, /ON CONFLICT \(clave\) DO UPDATE/);
  assert.match(sql, /se esperaban 2 pantallas/);
  assert.equal(bloquesCatalogoSync(c, cobertura).length, 3);
  assert.doesNotMatch(sql, /src\/a\.jsx/, 'los componentes internos no viajan a la base');
});

test('el catálogo real del repo coincide con el código y con sus archivos generados', () => {
  assert.deepEqual(verificarCatalogo(leerCatalogo(), inventario(), pantallasPermisos()), []);
  assert.ok(generarTodo().cobertura.includes('# Cobertura de Aria por pantalla'));
});

test('la huella de un componente incluye las declaraciones locales que usa y es estable', () => {
  const codigo = codigoComponente('src/pages_fin.jsx#Tesoreria');
  assert.match(codigo, /function TransferenciaPanel|const TransferenciaPanel/);
  assert.equal(huellaComponente('src/pages_fin.jsx#Tesoreria'), huellaComponente('src/pages_fin.jsx#Tesoreria'));
  assert.match(huellaComponente('src/pages_fin.jsx#Tesoreria'), /^[0-9a-f]{10}$/);
  assert.throws(() => codigoComponente('src/pages_fin.jsx#NoExiste'), /no se encontró/);
});
