import { normalizarBusquedaTipoDano } from './dibujoHallazgoLogic.js';

const SINONIMOS_CAUSA = {
  desgaste_normal: ['uso', 'desgaste', 'fatiga por uso'],
  contaminacion_fluido: ['suciedad', 'particulas', 'aceite sucio', 'fluido contaminado', 'contaminacion'],
  sobrecarga_mala_operacion: ['sobrecarga', 'mal uso', 'operacion incorrecta', 'exceso de carga'],
  falta_mantenimiento: ['mantenimiento deficiente', 'sin mantenimiento', 'mantenimiento tardio'],
  lubricacion_deficiente: ['falta de lubricacion', 'sin lubricacion', 'lubricacion insuficiente'],
  instalacion_incorrecta: ['montaje incorrecto', 'mala instalacion', 'alineacion incorrecta'],
  defecto_fabricacion: ['defecto de fabrica', 'fabricacion defectuosa', 'material defectuoso'],
  impacto: ['golpe', 'colision', 'choque'],
  corrosion_ambiente: ['oxido', 'herrumbre', 'ambiente corrosivo'],
  fatiga: ['ciclos', 'esfuerzo repetido', 'fatiga del material'],
};

export function buscarCausasProbables(items = [], texto = '') {
  const query = normalizarBusquedaTipoDano(texto);
  const tokens = query.split(/\s+/).filter(Boolean);
  const ranked = items.map((item, order) => {
    const codigo = normalizarBusquedaTipoDano(item.codigo);
    const label = normalizarBusquedaTipoDano(item.etiqueta || item.nombre);
    const synonymText = (SINONIMOS_CAUSA[item.codigo] || []).map(normalizarBusquedaTipoDano).join(' ');
    const haystack = `${label} ${codigo.replace(/_/g, ' ')} ${synonymText}`;
    const allTokens = tokens.length > 0 && tokens.every(token => haystack.split(/\s+/).some(word => word.startsWith(token) || word.includes(token)));
    const rank = !query ? 0 : label === query || codigo.replace(/_/g, ' ') === query ? 0 : label.startsWith(query) ? 1 : allTokens ? 2 : haystack.includes(query) ? 3 : 99;
    return { item, order, rank };
  }).filter(row => row.rank < 99).sort((a, b) => a.rank - b.rank || a.order - b.order);
  return { items: ranked.map(row => row.item), exacta: ranked.some(row => row.rank === 0), parecidos: ranked.slice(0, 5).map(row => row.item) };
}

export function agruparCausasProbables(items = [], query = '') {
  return items.length ? [{ id: 'causas', label: query.trim() ? 'Resultados' : 'Los más usados', items }] : [];
}
