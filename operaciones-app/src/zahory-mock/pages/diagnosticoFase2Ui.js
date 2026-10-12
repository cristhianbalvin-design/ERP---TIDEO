import { medirBboxZonas, normalizeSvgViewport, posicionarPines, sanitizarSvgCatalogo } from './dibujoHallazgoLogic.js';

export const GRUPOS_TIPOS_DANO = [
  { id: 'frecuentes', label: 'Los más usados', codes: ['desgaste', 'fuga', 'corrosion', 'fisura_grieta', 'rotura'] },
  { id: 'superficie', label: 'Desgaste y superficie', codes: ['desgaste', 'desgaste_abrasivo', 'desgaste_adhesivo', 'erosion', 'cavitacion', 'fretting', 'descascarado', 'estrias', 'rayado', 'picadura', 'desprendimiento_cromo', 'oxidacion', 'corrosion', 'contaminacion'] },
  { id: 'geometria', label: 'Geometría', codes: ['deformacion', 'ovalizacion', 'conicidad', 'excentricidad', 'curvatura', 'torsion', 'alabeo', 'holgura_excesiva', 'juego_axial', 'desalineacion'] },
  { id: 'materiales', label: 'Material y fatiga', codes: ['fisura_grieta', 'fatiga', 'porosidad', 'soldadura_defectuosa', 'reparacion_previa', 'sobrecalentamiento', 'quemado'] },
  { id: 'roscas', label: 'Roscas y fijaciones', codes: ['rosca_danada', 'rosca_barrida', 'chavetero_danado', 'pernos_flojos', 'golpe_abolladura', 'rotura', 'pieza_faltante'] },
  { id: 'sellado', label: 'Sellado y fluidos', codes: ['sello_danado', 'fuga', 'fuga_interna', 'aceite_degradado', 'falta_lubricacion', 'contaminacion'] },
  { id: 'mecanico', label: 'Mecánico', codes: ['rodamiento_danado', 'diente_roto', 'atascamiento', 'ruido_vibracion', 'golpe_abolladura', 'rotura'] },
];

export const grupoTipoDano = codigo => GRUPOS_TIPOS_DANO.find(grupo => grupo.id !== 'frecuentes' && grupo.codes.includes(codigo))?.id || 'mecanico';

export function agruparTiposDano(items = []) {
  const groups = new Map(GRUPOS_TIPOS_DANO.filter(group => group.id !== 'frecuentes').map(group => [group.id, { ...group, items: [] }]));
  for (const item of items) groups.get(grupoTipoDano(item.codigo)).items.push(item);
  const frequent = GRUPOS_TIPOS_DANO[0];
  return [{ ...frequent, items: items.filter(item => frequent.codes.includes(item.codigo)) }, ...groups.values()].filter(group => group.items.length);
}

export function markupDibujoHallazgo(svg, zonasMarcadas = [], bboxPorZona = {}, mediciones = []) {
  if (!svg) return '';
  const safeSvg = normalizeSvgViewport(sanitizarSvgCatalogo(svg));
  if (!Object.keys(bboxPorZona).length) {
    try { bboxPorZona = medirBboxZonas(safeSvg); } catch { bboxPorZona = {}; }
  }
  const selected = new Set(zonasMarcadas.map(zone => zone.zona_id || zone.id));
  const cotasMarcadas = new Set(mediciones.map(measure => measure.cota).filter(Boolean));
  const pins = posicionarPines(zonasMarcadas.map((zone, index) => ({ ...zone, orden: index + 1, bbox: bboxPorZona[zone.zona_id || zone.id] || {} })));
  let output = safeSvg.replace(/(<[^>]+data-z=["']([^"']+)["'][^>]*)(>)/gi, (all, open, id, close) => {
    const classText = open.match(/\bclass=["']([^"']*)["']/i)?.[1] || '';
    const classes = [...classText.split(/\s+/).filter(Boolean).filter(name => name !== 'is-marked'), ...(selected.has(id) ? ['is-marked'] : [])];
    const selfClosing = /\/\s*$/.test(open);
    const base = open.replace(/\s*\/\s*$/, '').replace(/\s+class=["'][^"']*["']/i, '');
    return `${base} class="${classes.join(' ')}"${selfClosing ? ' /' : ''}${close}`;
  });
  output = output.replace(/(<[^>]+data-cota=["']([^"']+)["'][^>]*)(>)/gi, (all, open, id, close) => {
    const classes = open.match(/\bclass=["']([^"']*)["']/i)?.[1]?.split(/\s+/).filter(Boolean) || [];
    if (cotasMarcadas.has(id)) classes.push('c-on');
    const cleanOpen = open.replace(/\s+class=["'][^"']*["']/i, '');
    const selfClosing = /\/\s*$/.test(open);
    const base = cleanOpen.replace(/\s*\/\s*$/, '');
    return `${base} class="${[...new Set(classes)].join(' ')}"${selfClosing ? ' /' : ''}${close}`;
  });
  const marker = pins.map(pin => `<g class="dx-hallazgo-pin" transform="translate(${pin.cx} ${pin.cy})"><circle r="12"/><text y=".5">${pin.orden}</text></g>`).join('');
  return output.replace(/<svg\b([^>]*)>/i, (_all, attrs) => {
    const originalClasses = attrs.match(/\bclass=["']([^"']*)["']/i)?.[1]?.split(/\s+/).filter(Boolean) || [];
    const cleanAttrs = attrs.replace(/\s+class=["'][^"']*["']/i, '');
    const preserveAspectRatio = /\bpreserveAspectRatio=/i.test(cleanAttrs) ? '' : ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${cleanAttrs}${preserveAspectRatio} class="${[...new Set([...originalClasses, 'dx-hallazgo-svg'])].join(' ')}">`;
  }).replace(/<\/svg\s*>/i, `${marker}</svg>`);
}
