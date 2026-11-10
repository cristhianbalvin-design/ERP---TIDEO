// Catálogo canónico de pantallas de OPERA (catalogo/pantallas.json) y mapa de cobertura de Aria.
// Uso:
//   node scripts/manual/catalogo.mjs verificar   -> falla si una ruta del código no está en el catálogo (o al revés)
//   node scripts/manual/catalogo.mjs generar     -> regenera docs/manual/COBERTURA.md y catalogo/_sincronizar.sql
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventario, pantallasPermisos, raiz } from './inventario-codigo.mjs';
import { parseFicha } from '../generar-manual-pantallas.mjs';
import { clasificarOrigen, origenDatos } from './origen-datos.mjs';

export const catalogoPath = path.join(raiz, 'catalogo/pantallas.json');
export const coberturaPath = path.join(raiz, 'docs/manual/COBERTURA.md');
export const catalogoSyncPath = path.join(raiz, 'catalogo/_sincronizar.sql');
export const APPS = ['admin', 'operaciones', 'movil'];
export const TIPOS = ['menu', 'subpantalla'];
export const ESTADOS = ['activa', 'puente', 'placeholder', 'maqueta', 'legado'];
const NOMBRE_APP = { admin: 'Administración', operaciones: 'Operaciones', movil: 'Versión Móvil' };

export const leerCatalogo = (root = raiz) => JSON.parse(readFileSync(path.join(root, 'catalogo/pantallas.json'), 'utf8'));

export function verificarCatalogo(catalogo, inv, permisos, root = raiz) {
  const errores = [];
  const claves = new Set();
  const permisosValidos = new Set([...permisos.map(p => p.clave), ...(catalogo.permisos_adicionales ?? []).map(p => p.clave)]);
  const porApp = new Map(APPS.map(app => [app, new Map()]));
  for (const p of catalogo.pantallas ?? []) {
    const id = p.clave ?? '(sin clave)';
    if (claves.has(p.clave)) errores.push(`${id}: clave duplicada`);
    claves.add(p.clave);
    if (!APPS.includes(p.app)) errores.push(`${id}: app inválida ${p.app}`);
    if (p.clave !== `${p.app}/${p.ruta}`) errores.push(`${id}: la clave debe ser "${p.app}/${p.ruta}"`);
    if (!TIPOS.includes(p.tipo)) errores.push(`${id}: tipo inválido ${p.tipo}`);
    if (!ESTADOS.includes(p.estado)) errores.push(`${id}: estado inválido ${p.estado}`);
    if (!p.titulo || !p.modulo) errores.push(`${id}: falta título o módulo`);
    if (p.permiso !== null && !permisosValidos.has(p.permiso)) errores.push(`${id}: permiso ${p.permiso} no existe en src/data.js (pantallasPermisos) ni en permisos_adicionales`);
    for (const ruta of [p.ruta, ...(p.alias ?? [])]) {
      if (porApp.get(p.app)?.has(ruta)) errores.push(`${id}: la ruta ${ruta} ya está en ${porApp.get(p.app).get(ruta)}`);
      porApp.get(p.app)?.set(ruta, p.clave);
    }
  }
  for (const [valor, clave] of Object.entries(catalogo.equivalencias_permisos ?? {})) {
    if (!permisosValidos.has(clave)) errores.push(`equivalencia "${valor}" apunta a un permiso inexistente (${clave})`);
  }
  const enCodigo = new Map(APPS.map(app => [app, new Map()]));
  for (const e of inv) {
    enCodigo.get(e.app).set(e.ruta, e);
    const clave = porApp.get(e.app).get(e.ruta);
    if (!clave) { errores.push(`${e.app}/${e.ruta}: la pantalla existe en el código (${e.componente}) pero no está en catalogo/pantallas.json`); continue; }
    if (clave !== `${e.app}/${e.ruta}`) { errores.push(`${e.app}/${e.ruta}: es una pantalla propia en el código pero el catálogo la registra como alias de ${clave}`); continue; }
    const p = catalogo.pantallas.find(x => x.clave === clave);
    if (p.componente !== e.componente) errores.push(`${clave}: el componente cambió en el código (${e.componente}); el catálogo dice ${p.componente}`);
    const aliasCodigo = [...e.alias].sort().join(',');
    if ([...(p.alias ?? [])].sort().join(',') !== aliasCodigo) errores.push(`${clave}: los alias del código (${aliasCodigo || 'ninguno'}) no coinciden con el catálogo`);
    if ((e.etiqueta ? 'menu' : 'subpantalla') !== p.tipo) errores.push(`${clave}: el tipo debe ser ${e.etiqueta ? 'menu' : 'subpantalla'} según el menú del código`);
  }
  for (const p of catalogo.pantallas ?? []) {
    if (APPS.includes(p.app) && !enCodigo.get(p.app).has(p.ruta)) errores.push(`${p.clave}: está en el catálogo pero ya no existe en el código; quítala o márcala correctamente`);
  }
  errores.push(...verificarEstados(catalogo, root));
  return errores;
}

// El estado debe coincidir con el origen de datos que se lee del código (scripts/manual/origen-datos.mjs):
// - "activa" exige datos reales (Supabase, servicios o el contexto que los carga); si solo hay mock o datos fijos, es "maqueta".
// - "maqueta" no puede leer solo datos reales; si ya no usa mock, es "activa".
// Las pantallas "mixtas" (datos reales con algún respaldo ficticio) se aceptan como activas.
export function verificarEstados(catalogo, root = raiz) {
  const errores = [];
  for (const p of catalogo.pantallas ?? []) {
    if (!p.componente || !['activa', 'maqueta'].includes(p.estado)) continue;
    if (!existsSync(path.join(root, p.componente.split('#')[0]))) continue; // el resto de la verificación ya reporta componentes movidos
    const origen = origenDatos(p.componente, root);
    const tipo = clasificarOrigen(origen);
    if (p.estado === 'activa' && (tipo === 'mock' || tipo === 'sin_datos')) {
      errores.push(`${p.clave}: está como "activa" pero no lee datos reales (${tipo === 'mock' ? `solo mock: ${origen.fuentesMock.join(', ')}` : 'datos fijos en el código'}); márcala "maqueta"`);
    }
    if (p.estado === 'maqueta' && tipo === 'real') errores.push(`${p.clave}: está como "maqueta" pero ya lee solo datos reales; márcala "activa"`);
  }
  return errores;
}

const numeroMigracion = nombre => Number((nombre.match(/^(\d+)/) ?? [0, 0])[1]);

// Herramientas de Aria: última definición de cada función asistente_* en las migraciones y nombres expuestos en la Edge Function.
export function herramientasAria(root = raiz) {
  const dir = path.join(root, 'supabase/migrations');
  const archivos = readdirSync(dir).filter(f => f.endsWith('.sql')).sort((a, b) => numeroMigracion(a) - numeroMigracion(b) || a.localeCompare(b));
  const definiciones = new Map();
  for (const archivo of archivos) {
    const sql = readFileSync(path.join(dir, archivo), 'utf8');
    const re = /create\s+or\s+replace\s+function\s+(?:public\.)?(asistente_[a-z0-9_]+)\s*\(/gi;
    const inicios = [...sql.matchAll(re)];
    inicios.forEach((m, i) => {
      const fin = i + 1 < inicios.length ? inicios[i + 1].index : sql.length;
      definiciones.set(m[1].toLowerCase(), sql.slice(m.index, fin));
    });
  }
  const edge = readFileSync(path.join(root, 'supabase/functions/asistente-erp/index.ts'), 'utf8');
  const expuestas = new Set([...edge.matchAll(/name:\s*"(asistente_[a-z0-9_]+)"/g)].map(m => m[1]));
  const herramientas = [];
  for (const nombre of [...expuestas].sort()) {
    const cuerpo = definiciones.get(nombre) ?? '';
    const permisos = [...new Set([...cuerpo.matchAll(/(?:usuario_puede|asistente_autorizar)\s*\(\s*[a-z_]+\s*,\s*'([a-z_]+)'/gi)].map(m => m[1]))].sort();
    herramientas.push({ nombre, tipo: nombre.startsWith('asistente_preparar_') ? 'registro' : nombre === 'asistente_consultar_manual' ? 'manual' : 'lectura', permisos, definida: definiciones.has(nombre) });
  }
  return herramientas;
}

export function leerFichas(root = raiz) {
  const dir = path.join(root, 'docs/manual-pantallas');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.txt')).sort().map(f => parseFicha(readFileSync(path.join(dir, f), 'utf8'), f));
}

export function calcularCobertura(catalogo, herramientas, fichas) {
  return catalogo.pantallas.map(p => {
    const fichasPantalla = fichas.filter(f => f.tipo === 'pantalla' && f.catalogo.includes(p.clave)).map(f => f.clave);
    const procesos = fichas.filter(f => f.tipo === 'proceso' && (f.catalogo.includes(p.clave) || (p.app === 'admin' && p.permiso && f.pasos.some(s => s.pantalla === p.permiso)))).map(f => f.clave);
    const lectura = p.permiso ? herramientas.filter(h => h.tipo === 'lectura' && h.permisos.includes(p.permiso)).map(h => h.nombre) : [];
    const registro = p.permiso ? herramientas.filter(h => h.tipo === 'registro' && h.permisos.includes(p.permiso)).map(h => h.nombre) : [];
    const nivel = fichasPantalla.length && lectura.length ? 'completa' : (fichasPantalla.length || procesos.length || lectura.length) ? 'parcial' : 'sin_cobertura';
    return { clave: p.clave, fichas: fichasPantalla, procesos, herramientas_lectura: lectura, herramientas_registro: registro, nivel };
  });
}

export function renderCobertura(catalogo, cobertura, herramientas) {
  const porClave = new Map(cobertura.map(c => [c.clave, c]));
  const reales = catalogo.pantallas.filter(p => !['placeholder', 'legado'].includes(p.estado));
  const cuenta = (lista, fn) => lista.filter(fn).length;
  const pct = (a, b) => b ? `${Math.round(100 * a / b)} %` : '—';
  const lineas = [
    '# Cobertura de Aria por pantalla',
    '',
    'Generado por `node scripts/manual/catalogo.mjs generar` a partir de `catalogo/pantallas.json`, las fichas de `docs/manual-pantallas/` y las herramientas `asistente_*` de la Edge Function. No editar a mano.',
    '',
    '- **Ficha**: la pantalla tiene ficha propia en el manual (modo consultor).',
    '- **Procesos**: aparece en una ficha de proceso de punta a punta.',
    '- **Datos**: Aria puede consultar sus datos con una herramienta que exige el permiso de la pantalla.',
    '- **Registro**: Aria puede registrar datos de esa pantalla (borrador + Confirmar).',
    '- Las pantallas en estado `placeholder` o `legado` no cuentan para los porcentajes.',
    '',
    '## Resumen',
    '',
    '| App | Pantallas | Con ficha | Con datos | Con registro | Sin cobertura |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const app of [...APPS, null]) {
    const lista = reales.filter(p => !app || p.app === app);
    const c = lista.map(p => porClave.get(p.clave));
    lineas.push(`| ${app ? NOMBRE_APP[app] : '**Total**'} | ${lista.length} | ${cuenta(c, x => x.fichas.length)} (${pct(cuenta(c, x => x.fichas.length), lista.length)}) | ${cuenta(c, x => x.herramientas_lectura.length)} (${pct(cuenta(c, x => x.herramientas_lectura.length), lista.length)}) | ${cuenta(c, x => x.herramientas_registro.length)} | ${cuenta(c, x => x.nivel === 'sin_cobertura')} |`);
  }
  const sinPermiso = herramientas.filter(h => h.tipo !== 'manual' && !h.permisos.length);
  if (sinPermiso.length) lineas.push('', `Herramientas sin permiso de pantalla detectable (no se asignan a ninguna pantalla): ${sinPermiso.map(h => '`' + h.nombre + '`').join(', ')}.`);
  for (const app of APPS) {
    lineas.push('', `## ${NOMBRE_APP[app]}`, '', '| Módulo | Pantalla | Estado | Ficha | Procesos | Datos | Registro |', '|---|---|---|---|---|---|---|');
    for (const p of catalogo.pantallas.filter(x => x.app === app)) {
      const c = porClave.get(p.clave);
      const marca = lista => lista.length ? lista.map(x => x.replace(/^asistente_/, '')).join(', ') : '—';
      lineas.push(`| ${p.modulo} | ${p.titulo} (\`${p.ruta}\`) | ${p.estado} | ${marca(c.fichas)} | ${marca(c.procesos)} | ${c.herramientas_lectura.length || '—'} | ${marca(c.herramientas_registro)} |`);
    }
  }
  return `${lineas.join('\n')}\n`;
}

// Omite campos vacíos para que el bloque sea compacto; el SQL los completa con coalesce.
const compacto = fila => Object.fromEntries(Object.entries(fila).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)));
const dolar = texto => {
  let etiqueta = 'datos';
  while (texto.includes(`$${etiqueta}$`)) etiqueta += '_';
  return `$${etiqueta}$${texto}$${etiqueta}$`;
};

// Bloques autocontenidos (uno por tabla); cada uno se puede aplicar por separado y es idempotente.
export function bloquesCatalogoSync(catalogo, cobertura) {
  const pantallas = catalogo.pantallas.map(p => ({ clave: p.clave, app: p.app, modulo: p.modulo, titulo: p.titulo, ruta: p.ruta, alias: p.alias ?? [], permiso: p.permiso, tipo: p.tipo, estado: p.estado }));
  const equivalencias = [
    ...Object.entries(catalogo.equivalencias_permisos ?? {}).map(([valor, clave]) => ({ valor, clave_permiso: clave, origen: 'etiqueta_antigua', nota: null })),
    ...(catalogo.permisos_adicionales ?? []).map(p => ({ valor: p.clave, clave_permiso: p.clave, origen: 'adicional', nota: p.nota ?? null })),
  ];
  const pantallasSql = `-- Catálogo de pantallas (${pantallas.length})
WITH datos AS (SELECT * FROM jsonb_to_recordset(${dolar(JSON.stringify(pantallas.map(compacto)))}::jsonb)
  AS d(clave text, app text, modulo text, titulo text, ruta text, alias text[], permiso text, tipo text, estado text)),
borrados AS (DELETE FROM public.aria_catalogo_pantallas t WHERE NOT EXISTS (SELECT 1 FROM datos d WHERE d.clave = t.clave) RETURNING 1)
INSERT INTO public.aria_catalogo_pantallas (clave,app,modulo,titulo,ruta,alias,permiso,tipo,estado)
SELECT clave,app,modulo,titulo,ruta,coalesce(alias,'{}'),permiso,tipo,estado FROM datos
ON CONFLICT (clave) DO UPDATE SET app=EXCLUDED.app, modulo=EXCLUDED.modulo, titulo=EXCLUDED.titulo, ruta=EXCLUDED.ruta, alias=EXCLUDED.alias, permiso=EXCLUDED.permiso, tipo=EXCLUDED.tipo, estado=EXCLUDED.estado, actualizado_en=now();
DO $verificacion$ BEGIN
  IF (SELECT count(*) FROM public.aria_catalogo_pantallas) <> ${pantallas.length} THEN RAISE EXCEPTION 'Catálogo: se esperaban ${pantallas.length} pantallas'; END IF;
END $verificacion$;`;
  const equivalenciasSql = `-- Equivalencias de permisos (${equivalencias.length})
WITH datos AS (SELECT * FROM jsonb_to_recordset(${dolar(JSON.stringify(equivalencias))}::jsonb) AS d(valor text, clave_permiso text, origen text, nota text)),
borrados AS (DELETE FROM public.aria_permisos_equivalencias t WHERE NOT EXISTS (SELECT 1 FROM datos d WHERE d.valor = t.valor) RETURNING 1)
INSERT INTO public.aria_permisos_equivalencias (valor,clave_permiso,origen,nota) SELECT valor,clave_permiso,origen,nota FROM datos
ON CONFLICT (valor) DO UPDATE SET clave_permiso=EXCLUDED.clave_permiso, origen=EXCLUDED.origen, nota=EXCLUDED.nota;
DO $verificacion$ BEGIN
  IF (SELECT count(*) FROM public.aria_permisos_equivalencias) <> ${equivalencias.length} THEN RAISE EXCEPTION 'Catálogo: se esperaban ${equivalencias.length} equivalencias'; END IF;
END $verificacion$;`;
  const coberturaSql = `-- Cobertura de Aria (${cobertura.length})
WITH datos AS (SELECT * FROM jsonb_to_recordset(${dolar(JSON.stringify(cobertura.map(compacto)))}::jsonb)
  AS d(clave text, fichas text[], procesos text[], herramientas_lectura text[], herramientas_registro text[], nivel text)),
borrados AS (DELETE FROM public.aria_cobertura t WHERE NOT EXISTS (SELECT 1 FROM datos d WHERE d.clave = t.clave) RETURNING 1)
INSERT INTO public.aria_cobertura (clave,fichas,procesos,herramientas_lectura,herramientas_registro,nivel)
SELECT clave,coalesce(fichas,'{}'),coalesce(procesos,'{}'),coalesce(herramientas_lectura,'{}'),coalesce(herramientas_registro,'{}'),nivel FROM datos
ON CONFLICT (clave) DO UPDATE SET fichas=EXCLUDED.fichas, procesos=EXCLUDED.procesos, herramientas_lectura=EXCLUDED.herramientas_lectura, herramientas_registro=EXCLUDED.herramientas_registro, nivel=EXCLUDED.nivel, actualizado_en=now();
DO $verificacion$ BEGIN
  IF (SELECT count(*) FROM public.aria_cobertura) <> ${cobertura.length} THEN RAISE EXCEPTION 'Catálogo: se esperaban ${cobertura.length} filas de cobertura'; END IF;
END $verificacion$;`;
  return [pantallasSql, equivalenciasSql, coberturaSql];
}

export function renderCatalogoSync(catalogo, cobertura) {
  return `-- Generado por scripts/manual/catalogo.mjs a partir de catalogo/pantallas.json. No editar a mano.
-- Sincroniza el catálogo canónico de pantallas y la cobertura de Aria con Supabase (proyecto ERP - Tideo). Idempotente.
BEGIN;
${bloquesCatalogoSync(catalogo, cobertura).join('\n\n')}
COMMIT;
`;
}

export function generarTodo(root = raiz) {
  const catalogo = leerCatalogo(root);
  const herramientas = herramientasAria(root);
  const cobertura = calcularCobertura(catalogo, herramientas, leerFichas(root));
  return { cobertura: renderCobertura(catalogo, cobertura, herramientas), sync: renderCatalogoSync(catalogo, cobertura) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const accion = process.argv[2] ?? 'verificar';
  try {
    if (accion === 'generar') {
      const { cobertura, sync } = generarTodo();
      writeFileSync(coberturaPath, cobertura, 'utf8');
      writeFileSync(catalogoSyncPath, sync, 'utf8');
      process.stdout.write(`Generados ${path.relative(raiz, coberturaPath)} y ${path.relative(raiz, catalogoSyncPath)}\n`);
    } else {
      const catalogo = leerCatalogo();
      const errores = verificarCatalogo(catalogo, inventario(), pantallasPermisos());
      const { cobertura, sync } = generarTodo();
      const leer = ruta => existsSync(ruta) ? readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n') : '';
      if (leer(coberturaPath) !== cobertura) errores.push('docs/manual/COBERTURA.md no está al día; ejecuta node scripts/manual/catalogo.mjs generar');
      if (leer(catalogoSyncPath) !== sync) errores.push('catalogo/_sincronizar.sql no está al día; ejecuta node scripts/manual/catalogo.mjs generar');
      for (const error of errores) process.stderr.write(`ERROR ${error}\n`);
      if (errores.length) process.exitCode = 1;
      else process.stdout.write(`Catálogo vigente: ${catalogo.pantallas.length} pantallas, todas las rutas del código registradas.\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
