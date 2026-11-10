// Verifica el manual de Aria: cada ficha apunta a una pantalla del catálogo, su huella coincide con el código
// actual de sus componentes y la sincronización con Supabase está regenerada.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFichas, renderSync, syncPath } from './generar-manual-pantallas.mjs';
import { huellas } from './manual/huella.mjs';
import { leerCatalogo } from './manual/catalogo.mjs';

export function verify({ fichas, catalogo, calcular = huellas, sync, esperado }) {
  const errores = [];
  const avisos = [];
  const porClave = new Map(catalogo.pantallas.map(p => [p.clave, p]));
  for (const ficha of fichas) {
    for (const clave of ficha.catalogo) {
      const pantalla = porClave.get(clave);
      if (!pantalla) { errores.push(`${ficha.clave}: la entrada de catálogo ${clave} no existe en catalogo/pantallas.json`); continue; }
      if (ficha.tipo === 'pantalla' && pantalla.permiso !== ficha.pantalla) errores.push(`${ficha.clave}: el permiso de pantalla (${ficha.pantalla}) no coincide con el del catálogo (${pantalla.permiso})`);
    }
    let actuales;
    try { actuales = calcular(ficha.componentes); }
    catch (error) { errores.push(`${ficha.clave}: ${error.message}`); continue; }
    const cambiados = ficha.componentes.filter((_, i) => actuales[i] !== ficha.huella[i]);
    if (cambiados.length) avisos.push(`${ficha.clave}: ficha desactualizada; cambió el código de ${cambiados.join(', ')}. Revisa la ficha (node scripts/manual/extraer.mjs ayuda a ver qué cambió), corrígela si hace falta y ejecuta node scripts/generar-manual-pantallas.mjs --actualizar-huellas y node scripts/generar-manual-pantallas.mjs. El PR no pasa hasta hacerlo.`);
  }
  if (sync !== undefined && esperado !== undefined && sync.replace(/\r\n/g, '\n') !== esperado.replace(/\r\n/g, '\n')) {
    errores.push('docs/manual-pantallas/_sincronizar.sql no coincide con las fichas; ejecuta node scripts/generar-manual-pantallas.mjs');
  }
  return { errores, avisos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const fichas = await readFichas();
    let sync = '';
    try { sync = await readFile(syncPath, 'utf8'); } catch { sync = ''; }
    const { errores, avisos } = verify({ fichas, catalogo: leerCatalogo(), sync, esperado: renderSync(fichas) });
    for (const aviso of avisos) process.stderr.write(`AVISO ${aviso}\n`);
    for (const error of errores) process.stderr.write(`ERROR ${error}\n`);
    if (errores.length || (avisos.length && !process.argv.includes('--solo-avisar'))) process.exitCode = 1;
    else process.stdout.write(`Manual vigente: ${fichas.length} fichas al día con su código y su sincronización.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
