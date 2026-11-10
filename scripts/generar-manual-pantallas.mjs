// Manual de pantallas de Aria: lee las fichas de docs/manual-pantallas y genera la sincronización con Supabase.
// Uso:
//   node scripts/generar-manual-pantallas.mjs                     -> regenera docs/manual-pantallas/_sincronizar.sql
//   node scripts/generar-manual-pantallas.mjs --actualizar-huellas -> tras revisar una ficha, guarda la huella actual de sus componentes
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { huellas } from './manual/huella.mjs';
import { leerRevision, lineaAutorizacion } from './manual/revision-sincronizacion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const docsDir = path.join(root, 'docs/manual-pantallas');
export const syncPath = path.join(docsDir, '_sincronizar.sql');
const ACCIONES = ['ver', 'crear', 'editar', 'aprobar', 'anular', 'exportar'];
const OPCIONALES = ['catalogo', 'pantalla_recorrido', 'captura', 'ejemplo'];

export async function readFichas(dir = docsDir) {
  const names = (await readdir(dir)).filter(name => name.endsWith('.txt')).sort();
  return Promise.all(names.map(async name => ({ ...parseFicha(await readFile(path.join(dir, name), 'utf8'), name), archivo: name })));
}

export function parseFicha(source, file = 'ficha.txt') {
  const fields = {};
  const steps = [];
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const step = line.match(/^paso:\s*(\d+)\s*\|\s*pantalla=([a-z0-9_]+)\s*\|\s*permiso=([^|]+)\s*\|\s*(.+)$/);
    if (step) {
      const permission = step[3].trim();
      const [permisoPantalla, permisoAccion] = permission === 'ninguno' ? [null, null] : permission.split(':');
      steps.push({ orden: Number(step[1]), pantalla: step[2], permisoPantalla, permiso: permisoAccion, texto: step[4].trim() });
      continue;
    }
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!pair) throw new Error(`${file}: línea no reconocida: ${line}`);
    if (fields[pair[1]] !== undefined) throw new Error(`${file}: campo duplicado ${pair[1]}`);
    fields[pair[1]] = pair[2];
  }
  for (const required of ['clave', 'tipo', 'pantalla', 'titulo', 'resumen', 'componentes', 'huella']) {
    if (!fields[required]) throw new Error(`${file}: falta ${required}`);
  }
  for (const campo of Object.keys(fields)) {
    if (!['clave', 'tipo', 'pantalla', 'titulo', 'resumen', 'componentes', 'huella', ...OPCIONALES].includes(campo)) throw new Error(`${file}: campo desconocido ${campo}`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(fields.clave) || !['pantalla', 'proceso'].includes(fields.tipo)) throw new Error(`${file}: clave o tipo inválido`);
  if (fields.tipo === 'pantalla' && fields.pantalla === 'ninguna') throw new Error(`${file}: ficha de pantalla sin pantalla`);
  if (fields.tipo === 'pantalla' && !fields.catalogo) throw new Error(`${file}: una ficha de pantalla debe indicar su entrada del catálogo (catalogo:)`);
  const componentes = fields.componentes.split(',').map(x => x.trim()).filter(Boolean);
  const huella = fields.huella.split(/\s+/).filter(Boolean);
  if (!componentes.length) throw new Error(`${file}: componentes vacío`);
  if (huella.length !== componentes.length || huella.some(h => !/^[0-9a-f]{10}$/.test(h) && h !== 'pendiente')) throw new Error(`${file}: huella debe tener un hash de 10 caracteres por componente`);
  if (!steps.length || steps.some((step, index) => step.orden !== index + 1 || !step.texto || step.texto.length > 1000)) throw new Error(`${file}: pasos inválidos`);
  for (const step of steps) {
    if (step.permiso && (!/^[a-z][a-z0-9_]*$/.test(step.permisoPantalla) || !ACCIONES.slice(1).includes(step.permiso))) throw new Error(`${file}: permiso inválido ${step.permisoPantalla}:${step.permiso}`);
  }
  return {
    ...fields,
    pantalla: fields.pantalla === 'ninguna' ? null : fields.pantalla,
    catalogo: fields.catalogo ? fields.catalogo.split(',').map(x => x.trim()).filter(Boolean) : [],
    componentes, huella, pasos: steps,
  };
}

const q = value => `'${String(value).replaceAll("'", "''")}'`;
const nullable = value => value == null ? 'NULL' : q(value);

// Sincronización idempotente de las fichas con las tablas de Aria (no recrea tablas ni funciones).
export function renderSync(fichas, revision = leerRevision()) {
  const claves = fichas.map(f => q(f.clave)).join(',');
  const pasosTotal = fichas.reduce((n, f) => n + f.pasos.length, 0);
  const filas = fichas.flatMap(ficha => {
    const cabecera = `INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES (${q(ficha.clave)},${q(ficha.tipo)},${nullable(ficha.pantalla)},${q(ficha.titulo)},${q(ficha.resumen)},${q(JSON.stringify(ficha.componentes))}::jsonb,${q(ficha.huella.join(' '))})\n  ON CONFLICT (clave) DO UPDATE SET tipo=EXCLUDED.tipo, pantalla_key=EXCLUDED.pantalla_key, titulo=EXCLUDED.titulo, resumen=EXCLUDED.resumen, fuentes=EXCLUDED.fuentes, revision=EXCLUDED.revision;`;
    const pasos = ficha.pasos.map(step => `INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES (${q(ficha.clave)},${step.orden},${q(step.pantalla)},${nullable(step.permisoPantalla)},${nullable(step.permiso)},${q(step.texto)});`);
    return [cabecera, ...pasos];
  });
  const cuerpo = `DELETE FROM public.asistente_manual_pasos WHERE ficha_clave IN (${claves});
${filas.join('\n')}
DO $verificacion$
BEGIN
  IF (SELECT count(*) FROM public.asistente_manual_fichas WHERE clave IN (${claves})) <> ${fichas.length} THEN
    RAISE EXCEPTION 'Sincronización del manual: se esperaban ${fichas.length} fichas';
  END IF;
  IF (SELECT count(*) FROM public.asistente_manual_pasos WHERE ficha_clave IN (${claves})) <> ${pasosTotal} THEN
    RAISE EXCEPTION 'Sincronización del manual: se esperaban ${pasosTotal} pasos';
  END IF;
END
$verificacion$;`;
  return `-- Generado por scripts/generar-manual-pantallas.mjs a partir de docs/manual-pantallas/*.txt. No editar a mano.
-- Sincroniza las fichas del manual de Aria con Supabase (proyecto ERP - Tideo). Idempotente.
-- La primera instrucción rechaza el archivo si la base ya tiene una revisión más nueva (catalogo/sincronizacion.json).
BEGIN;
${lineaAutorizacion('manual', revision, cuerpo)}
${cuerpo}
COMMIT;
`;
}

export async function actualizarHuellas(dir = docsDir, calcular = huellas) {
  const actualizadas = [];
  for (const ficha of await readFichas(dir)) {
    const nuevas = calcular(ficha.componentes);
    if (nuevas.join(' ') === ficha.huella.join(' ')) continue;
    const ruta = path.join(dir, ficha.archivo);
    const texto = await readFile(ruta, 'utf8');
    await writeFile(ruta, texto.replace(/^huella:.*$/m, `huella: ${nuevas.join(' ')}`), 'utf8');
    actualizadas.push(ficha.clave);
  }
  return actualizadas;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--actualizar-huellas')) {
    const cambiadas = await actualizarHuellas();
    process.stdout.write(cambiadas.length ? `Huellas actualizadas: ${cambiadas.join(', ')}\n` : 'Todas las huellas ya estaban al día.\n');
  }
  await writeFile(syncPath, renderSync(await readFichas()), 'utf8');
  process.stdout.write(`Generado ${path.relative(root, syncPath)}\n`);
}
