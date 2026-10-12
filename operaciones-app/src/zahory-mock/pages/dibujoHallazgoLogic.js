const num = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export function resultadoMedicion({ minimo, maximo, medido } = {}) {
  const value = num(medido);
  const min = num(minimo);
  const max = num(maximo);
  if (value === null || (min === null && max === null)) return null;
  return (min !== null && value < min) || (max !== null && value > max) ? 'fuera' : 'dentro';
}

export function agruparMedicionesPorZona(zonas = [], definiciones = [], mediciones = []) {
  const medidasPorZona = new Map();
  for (const medida of mediciones) {
    medidasPorZona.set(medida.zona_id, [...(medidasPorZona.get(medida.zona_id) || []), medida]);
  }
  return zonas.map((zona, index) => {
    const zonaId = zona.zona_id || zona.id;
    const definicion = definiciones.find(item => item.id === zonaId);
    const actuales = medidasPorZona.get(zonaId) || [];
    const medidas = (definicion?.medidas || []).map(definida => actuales.find(item => item.medida_id === definida.id) || {
      _key: `missing:${zonaId}:${definida.id}`, zona_id: zonaId, medida_id: definida.id,
      parametro: definida.nombre, unidad: 'mm', cota: definida.cota, referencia: definida.referencia,
      nominal: '', minimo: '', maximo: '', medido: '',
    }).map(medida => ({ ...medida, resultado: resultadoMedicion(medida) || 'sin_evaluar' }));
    return { zonaId, nombre: definicion?.nombre || zona.nombre || zonaId, orden: zona.orden || index + 1, medidas,
      otras: actuales.filter(item => !item.medida_id) };
  });
}

export function posicionarPines(zonas = []) {
  const placed = [];
  const candidatesFor = box => {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const offsets = box.width >= 52
      ? [[-box.width * .25, -box.height * .25], [box.width * .25, -box.height * .25], [0, 0], [0, -box.height * .35], [0, box.height * .35], [-box.width * .25, 0], [box.width * .25, 0]]
      : [[0, 0], [0, -box.height * .35], [0, box.height * .35], [-box.width * .25, 0], [box.width * .25, 0]];
    return offsets.map(([dx, dy]) => ({ cx: cx + dx, cy: cy + dy }));
  };
  return zonas.map((zona, index) => {
    const box = zona.bbox || zona;
    const candidates = candidatesFor(box);
    const position = candidates.find(point => placed.every(other => Math.hypot(point.cx - other.cx, point.cy - other.cy) >= 26)) || candidates[0];
    placed.push(position);
    return { zona_id: zona.zona_id ?? zona.id, orden: zona.orden ?? index + 1, ...position };
  });
}

export function sanitizarSvgCatalogo(svgString = '') {
  return String(svgString)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*("(?:[a-z][a-z0-9+.-]*:|\/\/)[^\"]*"|'(?:[a-z][a-z0-9+.-]*:|\/\/)[^']*'|(?:[a-z][a-z0-9+.-]*:|\/\/)[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*("[^"]*url\s*\([^\"]*"|'[^']*url\s*\([^']*'|[^\s>]*url\s*\([^\s>]+)/gi, '');
}

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

const DRAWING_STYLE = '<style>svg{overflow:visible;font-family:Arial,sans-serif}[data-z]{fill:#e7edf5;stroke:#1d3557;stroke-width:1.6;stroke-linejoin:round}[data-z].alt{fill:#cfdae9}[data-z].pinned,[data-z].is-marked{fill:#fce5e5;stroke:#c62828;stroke-width:2.2;opacity:1}.cav,.part.hole{fill:#f5f7fa;stroke:#1d3557;stroke-width:1.2}.thin{fill:none;stroke:#1d3557;stroke-width:1.2}.cl{fill:none;stroke:#1d3557;stroke-width:.8;stroke-dasharray:14 4 3 4;opacity:.55}.lead{stroke:#0a9db0;stroke-width:.9;stroke-dasharray:2 3}.dimline{stroke:#0a9db0;stroke-width:1.2;fill:none}.dimbg{fill:#f5f7fa}.dimtxt{fill:#06646f;font-size:11.5px;font-weight:600}.lbl{fill:#5d6b82;font-size:11px;font-weight:600;letter-spacing:.04em}.dimdot{fill:#0a9db0}[data-cota]{opacity:.3}[data-cota].c-on{opacity:1}[data-cota].c-on .dimline{stroke-width:2.4}.dx-hallazgo-pin circle,.pin circle{fill:#c62828;stroke:#fff;stroke-width:2}.dx-hallazgo-pin text,.pin text{fill:#fff;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;text-anchor:middle;dominant-baseline:central}</style>';

export function normalizeSvgViewport(svg) {
  return String(svg).replace(/<svg\b([^>]*)>/i, (_all, originalAttrs) => {
    let attrs = originalAttrs;
    const viewBoxMatch = attrs.match(/\bviewBox=["']([^"']+)["']/i);
    const widthMatch = attrs.match(/\bwidth=["']([\d.]+)(?:px)?["']/i);
    const heightMatch = attrs.match(/\bheight=["']([\d.]+)(?:px)?["']/i);
    const viewBox = viewBoxMatch?.[1] || (widthMatch && heightMatch ? `0 0 ${widthMatch[1]} ${heightMatch[1]}` : '0 0 1200 600');
    const [, , , vbWidthRaw, vbHeightRaw] = viewBox.match(/^\s*([\d.+-]+)[ ,]+([\d.+-]+)[ ,]+([\d.+-]+)[ ,]+([\d.+-]+)\s*$/) || [];
    const vbWidth = Number(vbWidthRaw) || 1200;
    const vbHeight = Number(vbHeightRaw) || 600;
    if (!viewBoxMatch) attrs += ` viewBox="${viewBox}"`;
    if (!/\bwidth=/i.test(attrs)) attrs += ' width="1200"';
    if (!/\bheight=/i.test(attrs)) attrs += ` height="${Math.round(1200 * vbHeight / vbWidth)}"`;
    if (!/\bxmlns=/i.test(attrs)) attrs += ' xmlns="http://www.w3.org/2000/svg"';
    const classes = attrs.match(/\bclass=["']([^"']*)["']/i)?.[1]?.split(/\s+/).filter(Boolean) || [];
    attrs = attrs.replace(/\s+class=["'][^"']*["']/i, '');
    return `<svg${attrs} class="${[...new Set([...classes, 'dx-hallazgo-svg'])].join(' ')}">${DRAWING_STYLE}`;
  });
}

export function construirSvgInforme({ svg, zonasMarcadas = [], bboxPorZona = {}, cotasMedidas = [] } = {}) {
  const clean = sanitizarSvgCatalogo(svg);
  const pins = posicionarPines(zonasMarcadas.map(z => ({ ...z, bbox: bboxPorZona[z.zona_id] || z.bbox || {} })));
  const idSet = new Set(zonasMarcadas.map(z => z.zona_id));
  let output = normalizeSvgViewport(clean);
  output = output.replace(/(<[^>]+data-z=["']([^"']+)["'][^>]*)(>)/gi, (all, open, zoneId, close) => {
    const classes = [...(open.match(/\bclass=["']([^"']*)["']/i)?.[1]?.split(/\s+/).filter(Boolean) || []), ...(idSet.has(zoneId) ? ['pinned'] : [])];
    const selfClosing = /\/\s*$/.test(open);
    const base = open.replace(/\s*\/\s*$/, '').replace(/\s+class=["'][^"']*["']/i, '');
    return `${base} class="${escapeXml([...new Set(classes)].join(' '))}"${selfClosing ? ' /' : ''}${close}`;
  });
  const markedCotas = new Set(cotasMedidas.map(measure => measure.cota).filter(Boolean));
  output = output.replace(/(<[^>]+data-cota=["']([^"']+)["'][^>]*)(>)/gi, (all, open, cotaId, close) => {
    if (!markedCotas.has(cotaId)) return all;
    const classText = open.match(/\bclass=["']([^"']*)["']/i)?.[1] || '';
    const classes = [...new Set([...classText.split(/\s+/).filter(Boolean), 'c-on'])];
    const selfClosing = /\/\s*$/.test(open);
    const base = open.replace(/\s*\/\s*$/, '').replace(/\s+class=["'][^"']*["']/i, '');
    return `${base} class="${escapeXml(classes.join(' '))}"${selfClosing ? ' /' : ''}${close}`;
  });
  const markers = pins.map(pin => `<g class="pin" transform="translate(${pin.cx} ${pin.cy})"><circle r="10"/><text y=".5">${pin.orden}</text></g>`).join('');
  return output.replace(/<\/svg\s*>/i, `${markers}</svg>`);
}

// Requiere navegador: mide los elementos SVG marcados con data-z fuera de pantalla.
export function medirBboxZonas(svgString) {
  if (typeof document === 'undefined') throw new Error('La medición de zonas requiere un navegador.');
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;left:-100000px;top:-100000px;visibility:hidden';
  wrapper.innerHTML = sanitizarSvgCatalogo(svgString);
  document.body.appendChild(wrapper);
  try {
    return Object.fromEntries([...wrapper.querySelectorAll('[data-z]')].map(node => {
      const box = node.getBBox();
      return [node.getAttribute('data-z'), { x: box.x, y: box.y, width: box.width, height: box.height }];
    }));
  } finally { wrapper.remove(); }
}

export async function rasterizarSvgAPng(svgString, { ancho = 1200 } = {}) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('La rasterización requiere un navegador.');
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('No se pudo rasterizar el dibujo.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = Math.max(1, Math.round(ancho * image.height / image.width));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export function normalizarBusquedaTipoDano(texto = '') {
  return String(texto).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const SYNONYMS = {
  corrosion: ['oxido', 'herrumbre'], rayado: ['rayon', 'rayadura', 'ralladura', 'surco'], fuga: ['derrame', 'gotea', 'pierde aceite'],
  fisura_grieta: ['rajadura', 'rajado', 'quebradura'], golpe_abolladura: ['golpeado', 'abollado', 'impacto'], rotura: ['roto', 'quebrado'],
  desgaste: ['gastado'], sello_danado: ['reten', 'empaquetadura'], picadura: ['pitting', 'hoyos'], sobrecalentamiento: ['recalentado', 'temperatura'],
  holgura_excesiva: ['juego', 'flojo'], desprendimiento_cromo: ['cromo pelado', 'descascarado'],
};

export function buscarTiposDano(items = [], texto = '', { frecuentes = [] } = {}) {
  const query = normalizarBusquedaTipoDano(texto);
  const freq = new Set(frecuentes);
  const ranked = items.map(item => {
    const codigo = normalizarBusquedaTipoDano(item.codigo);
    const label = normalizarBusquedaTipoDano(item.etiqueta || item.nombre);
    const words = label.split(/\s+/);
    const synonyms = (SYNONYMS[item.codigo] || []).map(normalizarBusquedaTipoDano);
    const rank = !query ? 6 : label === query || codigo === query ? 0 : label.startsWith(query) ? 1 : words.some(w => w.startsWith(query)) ? 2 : label.includes(query) || codigo.includes(query) ? 3 : synonyms.some(s => s.includes(query) || query.includes(s)) ? 4 : 99;
    return { item, rank, frequent: freq.has(item.codigo) };
  }).filter(x => x.rank < 99).sort((a, b) => a.rank - b.rank || Number(b.frequent) - Number(a.frequent) || String(a.item.etiqueta).localeCompare(String(b.item.etiqueta), 'es'));
  const exacta = ranked.some(x => x.rank === 0);
  return { items: ranked.map(x => x.item), exacta, parecidos: ranked.slice(0, 5).map(x => x.item) };
}
