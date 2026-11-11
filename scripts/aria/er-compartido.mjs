// Copia a la Edge de Aria el cálculo del Estado de Resultados que usa la pantalla de Finanzas,
// para que Aria y la pantalla den las mismas cifras con el mismo código.
//   node scripts/aria/er-compartido.mjs            regenera las copias
//   node scripts/aria/er-compartido.mjs --verificar falla si una copia quedó desactualizada
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DESTINO = 'supabase/functions/asistente-erp/er';
export const FUENTES = [
  'src/services/estadoResultadosService.js',
  'src/services/cxpDistribucionCeco.js',
  'src/services/tipoCambioService.js',
  'src/lib/currency.js',
];
// La Edge no tiene el entorno del navegador: el cliente de Supabase y el modo de datos salen de er/entorno.js.
const REEMPLAZOS = [
  ["'../lib/currency.js'", "'./currency.js'"],
  ["'../lib/dataMode.js'", "'./entorno.js'"],
  ["'../lib/supabaseClient.js'", "'./entorno.js'"],
];

export function copiaDe(fuente) {
  let texto = readFileSync(path.join(raiz, fuente), 'utf8');
  for (const [de, a] of REEMPLAZOS) texto = texto.split(de).join(a);
  if (/from '\.\.\//.test(texto) || texto.includes('import.meta.env')) {
    throw new Error(`${fuente} tiene una dependencia nueva que la Edge no puede cargar; agrégala a scripts/aria/er-compartido.mjs`);
  }
  return `// GENERADO por scripts/aria/er-compartido.mjs desde ${fuente}. No editar: cambia la fuente y regenera.\n${texto}`;
}

export function desactualizadas() {
  return FUENTES.filter(fuente => {
    const destino = path.join(raiz, DESTINO, path.basename(fuente));
    try { return readFileSync(destino, 'utf8') !== copiaDe(fuente); } catch { return true; }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verificar')) {
    const mal = desactualizadas();
    if (mal.length) {
      console.error(`Copias desactualizadas en ${DESTINO}: ${mal.join(', ')}. Ejecuta: node scripts/aria/er-compartido.mjs`);
      process.exit(1);
    }
    console.log('Estado de Resultados de Aria al día con el de la pantalla.');
  } else {
    for (const fuente of FUENTES) writeFileSync(path.join(raiz, DESTINO, path.basename(fuente)), copiaDe(fuente), 'utf8');
    console.log(`Copiados ${FUENTES.length} archivos a ${DESTINO}`);
  }
}
