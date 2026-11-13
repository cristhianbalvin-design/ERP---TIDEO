// Mide si una ficha de pantalla del manual de Aria está completa, comparándola con el código de su pantalla.
//   node scripts/manual/completitud.mjs                 lista el estado de todas las fichas de pantalla
//   node scripts/manual/completitud.mjs --verificar     falla si una ficha nueva o modificada (frente a origin/main) está incompleta
//   node scripts/manual/completitud.mjs <clave-ficha>   detalle de una ficha: qué le falta
// Una ficha completa (CLAUDE.md §8): dice para qué sirve la pantalla, nombra sus botones, explica los permisos
// cuando hay acciones que dependen de ellos y dice qué revisar cuando algo no sale.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raiz } from './inventario-codigo.mjs';
import { extraerPantalla } from './extraer.mjs';

export const COBERTURA_MINIMA = 0.8;
export const PASOS_MINIMOS = 5;
const DIR = 'docs/manual-pantallas';

export const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Botones que no hace falta nombrar: genéricos de cualquier formulario o de navegación.
const GENERICOS = new Set(['cancelar', 'cerrar', 'guardar', 'aceptar', 'volver', 'atras', 'limpiar', 'si', 'no', 'ok', 'anterior', 'siguiente', 'continuar',
  'ver', 'ver mas', 'ver menos', 'ver todo', 'ver todos', 'ver detalle', 'detalle', 'editar', 'eliminar', 'quitar', 'buscar', 'filtrar', 'filtros', 'aplicar',
  'actualizar', 'reintentar', 'confirmar', 'listo', 'entendido', 'todos', 'todas', 'mas', 'menos', 'x', 'pdf', 'excel', 'exportar', 'imprimir', 'copiar', 'descargar', 'seleccionar', 'agregar', 'nuevo', 'nueva',
  'descartar', 'mostrar', 'ocultar', 'seguir editando', 'expandir', 'contraer', 'abrir', 'salir', 'omitir', 'deshacer', 'cambiar', 'subir', 'adjuntar']);

// Un botón con textos alternativos («Guardando… / Guardar cambios») cuenta como nombrado si la ficha dice cualquiera de ellos.
// Se descartan los textos de progreso («Guardando…») y los genéricos.
export function botonesPropios(botones, titulo = '') {
  const migas = normalizar(titulo);
  const vistos = new Map();
  for (const crudo of botones) {
    const conPermiso = / \(solo si /.test(crudo);
    const alternativas = crudo.replace(/ \(solo si .*$/, '').split(' / ')
      .filter(t => !/(…|\.\.\.)\s*$/.test(t.trim()) && !/^\s*([‹←<]|volver\b)/i.test(t) && !/[▾▼▲]/.test(t))
      .map(t => ({ texto: t.trim(), clave: normalizar(t) }))
      .filter(a => a.clave.length >= 3 && !GENERICOS.has(a.clave) && /[a-zñ]{3}/.test(a.clave) && a.clave.split(' ').length <= 6
        && a.clave !== migas && !/ [a-zñ]$/.test(a.clave));
    if (!alternativas.length) continue;
    const id = alternativas.map(a => a.clave).sort().join('|');
    vistos.set(id, { texto: alternativas[0].texto, claves: alternativas.map(a => a.clave), conPermiso: conPermiso || vistos.get(id)?.conPermiso === true });
  }
  return [...vistos.values()];
}

export function parseFicha(texto, archivo = '') {
  const campo = nombre => (texto.match(new RegExp(`^${nombre}: (.*)$`, 'm'))?.[1] ?? '').trim();
  return {
    archivo, clave: campo('clave'), tipo: campo('tipo'), titulo: campo('titulo'), resumen: campo('resumen'),
    componentes: campo('componentes').split(',').map(c => c.trim()).filter(Boolean),
    pasos: [...texto.matchAll(/^paso: \d+ \|[^|]*\|[^|]*\| (.*)$/gm)].map(m => m[1].trim()),
  };
}

// Evalúa una ficha contra los botones extraídos del código. Devuelve lo que falta (vacío = completa).
export function evaluarFicha(ficha, botones) {
  const cuerpo = normalizar(`${ficha.resumen} ${ficha.pasos.join(' ')}`);
  const propios = botonesPropios(botones, ficha.titulo);
  // Un texto con una palabra repetida por el diseño adaptable («Importar Excel Importar») se acepta por sus dos primeras palabras.
  const nombrado = clave => cuerpo.includes(clave) || (clave.split(' ').length > 2 && cuerpo.includes(clave.split(' ').slice(0, 2).join(' ')));
  const sinNombrar = propios.filter(b => !b.claves.some(nombrado));
  const cobertura = propios.length ? (propios.length - sinNombrar.length) / propios.length : 1;
  const faltas = [];
  if (ficha.pasos.length < PASOS_MINIMOS) faltas.push(`tiene ${ficha.pasos.length} pasos; una ficha completa tiene al menos ${PASOS_MINIMOS}`);
  if (!ficha.pasos.some(p => /^para qu[eé] sirve/i.test(p))) faltas.push('falta un paso que empiece con «Para qué sirve:» (el propósito de la pantalla en el negocio)');
  if (cobertura < COBERTURA_MINIMA) faltas.push(`nombra ${propios.length - sinNombrar.length} de ${propios.length} botones de la pantalla; faltan: ${sinNombrar.map(b => b.texto).join(' · ')}`);
  if (propios.some(b => b.conPermiso) && !/\bpermiso|\brol\b/.test(cuerpo)) faltas.push('la pantalla tiene acciones que dependen del permiso y la ficha no explica qué permiso hace falta');
  if (!/\bsi no\b|\bno deja\b|\bno aparece|\bno puedes|\bno se puede|\bno cuadra|\bno ves\b/.test(cuerpo)) faltas.push('falta decir qué revisar cuando algo no sale (un paso con «Si no…», «No deja…» o «No aparece…»)');
  return { faltas, cobertura, botones: propios.length };
}

export function leerFichasPantalla(root = raiz) {
  const dir = path.join(root, DIR);
  return readdirSync(dir).filter(f => f.endsWith('.txt')).sort()
    .map(f => parseFicha(readFileSync(path.join(dir, f), 'utf8'), f)).filter(f => f.tipo === 'pantalla');
}

export function evaluarTodas(root = raiz) {
  return leerFichasPantalla(root).map(ficha => {
    let botones = [];
    try { botones = extraerPantalla(ficha.componentes, root).botones; } catch { botones = []; }
    return { ficha, ...evaluarFicha(ficha, botones) };
  });
}

// Fichas nuevas o modificadas frente a la rama base: son las que el cambio en curso está tocando.
export function fichasCambiadas(root = raiz, ref = process.env.CATALOGO_BASE_REF || 'origin/main') {
  try {
    const salida = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', ref, '--', DIR], { cwd: root, encoding: 'utf8' });
    return salida.split('\n').map(l => l.trim()).filter(l => l.endsWith('.txt')).map(l => path.basename(l));
  } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const todas = evaluarTodas();
  if (args.includes('--verificar')) {
    const cambiadas = fichasCambiadas();
    if (cambiadas === null) { console.log('AVISO no se pudo comparar con la rama base; no se verificó la completitud de las fichas.'); process.exit(0); }
    const malas = todas.filter(r => cambiadas.includes(r.ficha.archivo) && r.faltas.length);
    for (const r of malas) console.error(`ERROR ${r.ficha.archivo}: ficha incompleta.\n  - ${r.faltas.join('\n  - ')}`);
    if (malas.length) {
      console.error(`\nEste cambio toca ${malas.length} ficha(s) que no están completas. Complétalas (CLAUDE.md §8, «Ficha completa»); npm run manual:extraer -- <clave del catálogo> lista botones, campos y mensajes de la pantalla.`);
      process.exit(1);
    }
    console.log(`Fichas tocadas por este cambio: ${cambiadas.length}, todas completas.`);
  } else if (args[0] && !args[0].startsWith('--')) {
    const r = todas.find(x => x.ficha.clave === args[0] || x.ficha.archivo === args[0] || x.ficha.archivo === `${args[0]}.txt`);
    if (!r) { console.error(`No existe la ficha ${args[0]}`); process.exit(1); }
    console.log(r.faltas.length ? `${r.ficha.archivo}: incompleta\n  - ${r.faltas.join('\n  - ')}` : `${r.ficha.archivo}: completa (${r.botones} botones, ${r.ficha.pasos.length} pasos)`);
  } else {
    const malas = todas.filter(r => r.faltas.length);
    for (const r of malas) console.log(`${r.ficha.archivo} (${r.ficha.pasos.length} pasos, ${Math.round(r.cobertura * 100)}% de ${r.botones} botones): ${r.faltas.length} falta(s)`);
    console.log(`\nFichas de pantalla: ${todas.length}. Completas: ${todas.length - malas.length}. Incompletas: ${malas.length}.`);
  }
}
