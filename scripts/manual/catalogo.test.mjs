import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarCatalogo, verificarEstados, calcularCobertura, renderCatalogoSync, bloquesCatalogoSync, leerCatalogo, generarTodo } from './catalogo.mjs';
import { inventario, pantallasPermisos } from './inventario-codigo.mjs';
import { codigoComponente, huellaComponente } from './huella.mjs';
import { clasificarOrigen, origenDatos } from './origen-datos.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Mini proyecto en disco para probar el detector de origen de datos.
const proyectoTemporal = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'catalogo-origen-'));
  mkdirSync(path.join(root, 'src/services'), { recursive: true });
  const escribir = (rel, txt) => writeFileSync(path.join(root, rel), txt, 'utf8');
  escribir('src/data.js', 'export const MOCK = { ventas: [{ id: 1 }] };\n');
  escribir('src/services/ventasService.js', "export const listarVentas = () => supabase.from('ventas').select();\n");
  escribir('src/real.jsx', "import { listarVentas } from './services/ventasService.js';\nexport function Real() { listarVentas(); return <div/>; }\n");
  escribir('src/maqueta.jsx', "import { MOCK } from './data.js';\nconst RESUMEN = MOCK.ventas.length;\nexport function Maqueta() { return <div>{RESUMEN}</div>; }\n");
  escribir('src/fijo.jsx', "export function Fijo() { const planes = [{ nombre: 'A' }]; return <div>{planes.length}</div>; }\n");
  escribir('src/mixto.jsx', "import { MOCK } from './data.js';\nimport { listarVentas } from './services/ventasService.js';\nexport function Mixto() { listarVentas(); return <div>{MOCK.ventas.length}</div>; }\n");
  escribir('src/padre.jsx', "import { Maqueta } from './maqueta.jsx';\nexport function Padre() { return <section><Maqueta/></section>; }\n");
  return root;
};

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

test('el detector distingue datos reales, mock, fijos y mixtos, también en componentes hijos', () => {
  const root = proyectoTemporal();
  assert.equal(clasificarOrigen(origenDatos('src/real.jsx#Real', root)), 'real');
  assert.equal(clasificarOrigen(origenDatos('src/maqueta.jsx#Maqueta', root)), 'mock');
  assert.equal(clasificarOrigen(origenDatos('src/fijo.jsx#Fijo', root)), 'sin_datos');
  assert.equal(clasificarOrigen(origenDatos('src/mixto.jsx#Mixto', root)), 'mixto');
  assert.equal(clasificarOrigen(origenDatos('src/padre.jsx#Padre', root)), 'mock');
});

test('el estado del catálogo debe coincidir con el origen de datos del código', () => {
  const root = proyectoTemporal();
  const pantalla = (ruta, componente, estado) => ({ clave: `admin/${ruta}`, app: 'admin', ruta, componente, estado });
  const errores = verificarEstados({ pantallas: [
    pantalla('real', 'src/real.jsx#Real', 'activa'),
    pantalla('mixto', 'src/mixto.jsx#Mixto', 'activa'),
    pantalla('maqueta_ok', 'src/maqueta.jsx#Maqueta', 'maqueta'),
    pantalla('falsa_activa', 'src/maqueta.jsx#Maqueta', 'activa'),
    pantalla('fija_activa', 'src/fijo.jsx#Fijo', 'activa'),
    pantalla('falsa_maqueta', 'src/real.jsx#Real', 'maqueta'),
    pantalla('puente', 'src/maqueta.jsx#Maqueta', 'puente'),
  ] }, root).join('\n');
  assert.match(errores, /admin\/falsa_activa: está como "activa" pero no lee datos reales \(solo mock: MOCK\)/);
  assert.match(errores, /admin\/fija_activa: .*datos fijos en el código/);
  assert.match(errores, /admin\/falsa_maqueta: está como "maqueta" pero ya lee solo datos reales/);
  assert.doesNotMatch(errores, /admin\/(real|mixto|maqueta_ok|puente):/);
});
