import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationPath, readFichas, renderMigration } from './generar-manual-pantallas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export async function verify({ fichas, currentHead, changedSince, dirtyFiles = [], migration, generated, resolveRevision, isAncestor } = {}) {
  const errors = [];
  for (const ficha of fichas) {
    let revision;
    try { revision = resolveRevision ? resolveRevision(ficha.revision) : git('rev-parse', '--verify', `${ficha.revision}^{commit}`).trim(); }
    catch { errors.push(`${ficha.clave}: revisión ${ficha.revision} no existe`); continue; }
    const head = currentHead ?? git('rev-parse', 'HEAD').trim();
    try { if (isAncestor) isAncestor(revision, head); else git('merge-base', '--is-ancestor', revision, head); }
    catch { errors.push(`${ficha.clave}: la revisión ${ficha.revision} no es ancestro del HEAD actual`); continue; }
    const sources = new Set(ficha.fuentes);
    const changed = changedSince ? changedSince(ficha.revision, head) : git('diff', '--name-only', `${revision}..${head}`, '--', ...ficha.fuentes).split(/\r?\n/).filter(Boolean);
    const dirty = dirtyFiles.filter(file => sources.has(file));
    const stale = [...new Set([...changed, ...dirty])].filter(file => sources.has(file));
    if (stale.length) errors.push(`${ficha.clave}: revisar ficha; cambiaron fuentes: ${stale.join(', ')}. Actualiza revision tras revisarla.`);
  }
  const expected = generated ?? renderMigration(fichas);
  const actual = migration ?? await readFile(migrationPath, 'utf8');
  const normalizeClosure = sql => sql.replace(/(^|\r?\n)(?:ROLLBACK|COMMIT);[ \t]*(?:\r?\n)*$/, '$1ROLLBACK;');
  if (normalizeClosure(actual) !== normalizeClosure(expected)) errors.push('La migración 617 no coincide con las fichas actuales; ejecuta scripts/generar-manual-pantallas.mjs y revisa el diff.');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const fichas = await readFichas();
    const dirtyFiles = git('diff', '--name-only').split(/\r?\n/).filter(Boolean);
    const errors = await verify({ fichas, dirtyFiles });
    if (errors.length) { process.stderr.write(`${errors.join('\n')}\n`); process.exitCode = 1; }
    else process.stdout.write(`Manual vigente: ${fichas.length} fichas y migración sincronizada.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
