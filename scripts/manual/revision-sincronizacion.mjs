// Revisión de las sincronizaciones con Supabase (catálogo de pantallas y manual de Aria).
//
// Problema que evita: una rama creada antes de un cambio del catálogo o del manual regenera su
// _sincronizar.sql y, al aplicarlo, devuelve la base a un contenido viejo.
//
// Cómo lo evita:
// - catalogo/sincronizacion.json guarda un número de revisión común a las dos sincronizaciones.
// - Cada _sincronizar.sql abre su transacción llamando a public.aria_sincronizacion_autorizar(objeto,
//   revisión, huella). La base rechaza una revisión menor que la aplicada, o la misma revisión con
//   otro contenido; y sus tablas solo aceptan escrituras dentro de una sincronización autorizada.
// - La verificación compara con origin/main: si el contenido cambió, la revisión debe ser mayor.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const revisionPath = path.join(raiz, 'catalogo/sincronizacion.json');
export const OBJETOS = {
  catalogo: 'catalogo/_sincronizar.sql',
  manual: 'docs/manual-pantallas/_sincronizar.sql',
};

export function leerRevision(root = raiz) {
  const archivo = path.join(root, 'catalogo/sincronizacion.json');
  if (!existsSync(archivo)) throw new Error('falta catalogo/sincronizacion.json (revisión de las sincronizaciones)');
  const { revision } = JSON.parse(readFileSync(archivo, 'utf8'));
  if (!Number.isInteger(revision) || revision < 1) throw new Error('catalogo/sincronizacion.json: "revision" debe ser un entero mayor que 0');
  return revision;
}

// Huella del contenido que se sincroniza (sin la línea de autorización, que la contiene).
export const huellaContenido = cuerpo => createHash('sha256').update(cuerpo.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16);

export function lineaAutorizacion(objeto, revision, cuerpo) {
  if (!(objeto in OBJETOS)) throw new Error(`objeto de sincronización desconocido: ${objeto}`);
  return `SELECT public.aria_sincronizacion_autorizar('${objeto}', ${revision}, '${huellaContenido(cuerpo)}');`;
}

const PATRON = /SELECT public\.aria_sincronizacion_autorizar\('([a-z]+)', (\d+), '([0-9a-f]{16})'\);/;

export function leerAutorizacion(sql) {
  const m = (sql ?? '').match(PATRON);
  return m ? { objeto: m[1], revision: Number(m[2]), huella: m[3] } : null;
}

// Regla pura: si el contenido difiere del de la base de comparación, la revisión debe ser mayor.
export function compararConBase(objeto, local, base) {
  if (!local) return [`${OBJETOS[objeto]} no tiene la línea de autorización; regenéralo`];
  if (!base || local.huella === base.huella) return [];
  if (local.revision > base.revision) return [];
  return [`${OBJETOS[objeto]}: el contenido cambió respecto de la rama base pero la revisión (${local.revision}) no es mayor que la de la base (${base.revision}). `
    + `Si tu rama está atrasada, trae origin/main (git fetch + git rebase origin/main) y regenera; si cambiaste el catálogo o el manual, sube "revision" en catalogo/sincronizacion.json a ${base.revision + 1} y regenera.`];
}

function leerDeGit(ref, relativo, root) {
  try {
    return execFileSync('git', ['show', `${ref}:${relativo}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

// Compara los _sincronizar.sql del árbol con los de la rama base (por defecto origin/main).
export function verificarRevisionContraBase(root = raiz, ref = process.env.CATALOGO_BASE_REF || 'origin/main') {
  const errores = [];
  const avisos = [];
  for (const [objeto, relativo] of Object.entries(OBJETOS)) {
    const local = leerAutorizacion(existsSync(path.join(root, relativo)) ? readFileSync(path.join(root, relativo), 'utf8') : '');
    const textoBase = leerDeGit(ref, relativo, root);
    if (textoBase === null) { avisos.push(`no se pudo leer ${ref}:${relativo}; no se comparó la revisión de ${objeto}`); continue; }
    errores.push(...compararConBase(objeto, local, leerAutorizacion(textoBase)));
  }
  return { errores, avisos };
}
