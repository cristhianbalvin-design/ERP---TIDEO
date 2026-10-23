// Lógica pura del gemelo digital del almacén: plano -> posiciones, stock por posición,
// validaciones del editor, ruta de picking e historial. Sin dependencias de React ni three.
import { signoMovimiento } from '../inventarioKardexLogic.js';

export const MOD_W = 2.2;
export const NIV_H = 1.1;
export const RACK_D = 1.1;
export const PISO_PASO = 2.2;
export const USOS = {
  almacenaje: ['Almacenaje', '#5B3A8C'],
  recepcion: ['Recepción', '#00ACC1'],
  despacho: ['Despacho', '#14633A'],
  cuarentena: ['Cuarentena / observados', '#E08A00'],
  merma: ['Merma / baja', '#9B2C2C'],
};
export const LADOS = { N: 'Norte', S: 'Sur', O: 'Oeste', E: 'Este' };
export const ESTADOS = {
  ocupado: ['Con stock', 'is-cyan'],
  reservado: ['Reservado para OT', 'is-violet'],
  cuarentena: ['Cuarentena', 'is-amber'],
  reorden: ['Bajo reorden', 'is-red'],
  vacio: ['Vacía', 'is-gray'],
};
export const VAR_ESTADO = { vacio: '--dx-gem-vacio', ocupado: '--dx-gem-ocupado', reservado: '--dx-gem-reservado', cuarentena: '--dx-gem-cuarentena', reorden: '--dx-gem-reorden' };

const numero = valor => Number(valor ?? 0) || 0;
export const pad2 = n => String(n).padStart(2, '0');
export const snap = v => Math.round(v * 2) / 2;
export const clonar = o => JSON.parse(JSON.stringify(o));

export function planoVacio() {
  return { ancho: 30, largo: 20, pasilloMin: 2.4, puertas: [{ id: 'p1', lado: 'N', pos: 12, ancho: 6 }], zonas: [], racks: [] };
}

export function normalizarPlano(layout) {
  const base = planoVacio();
  if (!layout || typeof layout !== 'object') return base;
  return {
    ancho: numero(layout.ancho) || base.ancho,
    largo: numero(layout.largo) || base.largo,
    pasilloMin: numero(layout.pasilloMin) || base.pasilloMin,
    puertas: Array.isArray(layout.puertas) ? layout.puertas.map(p => ({ id: p.id, lado: LADOS[p.lado] ? p.lado : 'N', pos: numero(p.pos), ancho: numero(p.ancho) || 3 })) : [],
    zonas: Array.isArray(layout.zonas) ? layout.zonas.map(z => ({ id: z.id, cod: String(z.cod || ''), nombre: String(z.nombre || z.cod || ''), uso: USOS[z.uso] ? z.uso : 'almacenaje', x: numero(z.x), y: numero(z.y), w: numero(z.w) || 1, h: numero(z.h) || 1, piso: Math.max(0, Math.round(numero(z.piso))) })) : [],
    racks: Array.isArray(layout.racks) ? layout.racks.map(r => ({ id: r.id, cod: String(r.cod || ''), x: numero(r.x), y: numero(r.y), mod: Math.max(1, Math.round(numero(r.mod) || 1)), niv: Math.max(1, Math.round(numero(r.niv) || 1)), rot: numero(r.rot) === 90 ? 90 : 0 })) : [],
  };
}

export const huellaRack = r => (r.rot ? { x: r.x, y: r.y, w: RACK_D, h: r.mod * MOD_W } : { x: r.x, y: r.y, w: r.mod * MOD_W, h: RACK_D });
export const capPiso = z => Math.max(0, Math.floor((z.w - 0.4) / PISO_PASO)) * Math.max(0, Math.floor((z.h - 1.4) / PISO_PASO));
const cruza = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

/** Zona cuyo rectángulo contiene el centro del rack (misma regla que la RPC). */
export function zonaDeRack(L, r) {
  const f = huellaRack(r), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  return L.zonas.find(z => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) || null;
}

/** Posiciones (con geometría) que genera el plano; mismos códigos que crea wms_guardar_plano_almacen. */
export function posicionesDelPlano(L) {
  const out = [];
  L.racks.forEach(r => {
    const zona = zonaDeRack(L, r);
    const uso = zona?.uso || 'almacenaje';
    for (let m = 1; m <= r.mod; m++) for (let n = 1; n <= r.niv; n++) {
      const a = (m - 0.5) * MOD_W;
      out.push({
        cod: `${String(r.cod).toUpperCase()}-${pad2(m)}-${n}`, rackId: r.id, grupo: `Rack ${r.cod}`, m, n, uso,
        x: r.rot ? r.x + RACK_D / 2 : r.x + a, z: r.rot ? r.y + a : r.y + RACK_D / 2, y: (n - 1) * NIV_H + 0.55,
        w: r.rot ? RACK_D * 0.8 : MOD_W * 0.86, d: r.rot ? MOD_W * 0.86 : RACK_D * 0.8, h: NIV_H * 0.7,
      });
    }
  });
  L.zonas.forEach(z => {
    const cols = Math.max(1, Math.floor((z.w - 0.4) / PISO_PASO));
    for (let i = 0; i < z.piso; i++) {
      const c = i % cols, f = Math.floor(i / cols);
      out.push({ cod: `${String(z.cod).toUpperCase()}-${pad2(i + 1)}`, zonaId: z.id, grupo: z.nombre, uso: z.uso, x: z.x + 0.2 + (c + 0.5) * PISO_PASO, z: z.y + 1.2 + (f + 0.5) * PISO_PASO, y: 0.5, w: 1.5, d: 1.5, h: 1 });
    }
  });
  return out;
}

const reordenMaterial = material => numero(material?.punto_reorden || material?.stock_minimo) + numero(material?.stock_seguridad);

/**
 * Arma el inventario por código de ubicación a partir de filas de stock (con materiales) del almacén.
 * Devuelve { porCodigo: Map(cod -> items[]), fueraDelPlano, bajoReorden: Set(material_id) }.
 */
export function inventarioPorCodigo({ ubicaciones = [], stock = [], ultimos = [], movimientos = [], hoy = new Date() }, codigosPlano = new Set()) {
  const codigoDe = new Map(ubicaciones.map(u => [u.id, u]));
  const ultimoDe = new Map(ultimos.map(m => [`${m.ubicacion_id}|${m.material_id}`, m]));
  const movsDe = new Map();
  movimientos.forEach(m => { const k = `${m.ubicacion_id}|${m.material_id}`; if (!movsDe.has(k)) movsDe.set(k, []); movsDe.get(k).push(m); });
  // reorden por material dentro del almacén (misma regla que Inventario & Kardex)
  const totales = new Map();
  stock.forEach(s => {
    const t = totales.get(s.material_id) || { fisico: 0, reservado: 0, noDisp: 0, material: s.materiales };
    const uso = codigoDe.get(s.ubicacion_id)?.uso;
    t.fisico += numero(s.fisico); t.reservado += numero(s.reservado);
    if (uso === 'cuarentena' || uso === 'merma') t.noDisp += numero(s.fisico);
    totales.set(s.material_id, t);
  });
  const bajoReorden = new Set();
  totales.forEach((t, id) => { const r = reordenMaterial(t.material); const disp = Math.max(t.fisico - t.reservado - t.noDisp, 0); if (r > 0 && disp <= r) bajoReorden.add(id); });

  const porCodigo = new Map();
  const fuera = { filas: 0, unidades: 0, ubicaciones: new Set() };
  const agrupado = new Map();
  stock.forEach(s => {
    if (numero(s.fisico) <= 0 && numero(s.reservado) <= 0) return;
    const u = codigoDe.get(s.ubicacion_id);
    const cod = u?.codigo;
    if (!cod || !codigosPlano.has(cod)) { fuera.filas += 1; fuera.unidades += numero(s.fisico); fuera.ubicaciones.add(u?.es_general ? 'General' : (cod || 'Sin ubicación')); return; }
    const k = `${cod}|${s.material_id}`;
    let it = agrupado.get(k);
    if (!it) {
      const mat = s.materiales || {};
      const ult = ultimoDe.get(`${s.ubicacion_id}|${s.material_id}`);
      const fecha = ult?.fecha ? new Date(ult.fecha) : null;
      it = {
        materialId: s.material_id, codigo: mat.codigo || s.material_id, desc: mat.descripcion || 'Material', um: mat.unidad || '',
        costo: numero(mat.costo_promedio), fisico: 0, reservado: 0, reorden: reordenMaterial(mat), bajoReorden: bajoReorden.has(s.material_id),
        dias: fecha ? Math.max(0, Math.floor((hoy - fecha) / 86400000)) : null, ultimo: ult ? textoMovimiento(ult) : '', ultimaFecha: ult?.fecha || null,
        movs: (movsDe.get(`${s.ubicacion_id}|${s.material_id}`) || []).map(m => ({ fecha: new Date(m.fecha), delta: Math.abs(numero(m.cantidad)) * signoMovimiento(m) })),
      };
      agrupado.set(k, it);
      if (!porCodigo.has(cod)) porCodigo.set(cod, []);
      porCodigo.get(cod).push(it);
    }
    it.fisico += numero(s.fisico); it.reservado += numero(s.reservado);
  });
  return { porCodigo, fueraDelPlano: { ...fuera, ubicaciones: [...fuera.ubicaciones] }, bajoReorden };
}

const MOTIVOS = { recepcion_oc: 'Recepción de OC', despacho_taller: 'Despacho a taller', transferencia: 'Transferencia', ajuste: 'Ajuste' };
export function textoMovimiento(m) {
  const tipo = { entrada: 'Entrada', salida: 'Salida', transferencia_entrada: 'Transferencia', transferencia_salida: 'Transferencia', ajuste: 'Ajuste', despacho_taller: 'Despacho a taller' }[m.tipo] || MOTIVOS[m.referencia_tipo] || 'Movimiento';
  return [tipo, m.nro_documento].filter(Boolean).join(' ');
}

/** Ítems de una posición en un día del historial (0 = hoy, -n = hace n días). */
export function itemsEnDia(items = [], dia = 0, hoy = new Date()) {
  if (!dia) return items.filter(i => i.fisico > 0 || i.reservado > 0);
  const corte = new Date(hoy.getTime() + dia * 86400000);
  return items.map(i => {
    const despues = (i.movs || []).filter(m => m.fecha > corte).reduce((a, m) => a + m.delta, 0);
    const fisico = Math.max(0, i.fisico - despues);
    const dias = i.ultimaFecha ? (new Date(i.ultimaFecha) > corte ? null : i.dias + dia) : null;
    return { ...i, fisico, reservado: Math.min(i.reservado, fisico), dias };
  }).filter(i => i.fisico > 0);
}

export function estadoPosicion(p, items) {
  if (!items.length) return 'vacio';
  if (p.uso === 'cuarentena' || p.uso === 'merma') return 'cuarentena';
  if (items.some(i => i.bajoReorden)) return 'reorden';
  if (items.some(i => i.reservado > 0)) return 'reservado';
  return 'ocupado';
}
export const valorItems = items => items.reduce((a, i) => a + i.fisico * i.costo, 0);
export const diasItems = items => { const d = items.map(i => i.dias).filter(v => v !== null && v !== undefined); return d.length ? Math.max(0, Math.min(...d)) : null; };

/** Validaciones del borrador del plano. */
export function revisarPlano(B) {
  const out = [], codsR = {}, codsZ = {};
  const fuera = f => f.x < -0.01 || f.y < -0.01 || f.x + f.w > B.ancho + 0.01 || f.y + f.h > B.largo + 0.01;
  B.racks.forEach(r => {
    (codsR[String(r.cod).toUpperCase()] ||= []).push(r);
    if (!/^[A-Z0-9]{1,3}$/i.test(String(r.cod))) out.push({ n: 'err', t: `El rack «${r.cod || '(vacío)'}» necesita un código de 1 a 3 letras o números.`, s: { t: 'rack', id: r.id } });
    if (fuera(huellaRack(r))) out.push({ n: 'err', t: `Rack ${r.cod} queda fuera del plano.`, s: { t: 'rack', id: r.id } });
  });
  B.zonas.forEach(z => {
    (codsZ[String(z.cod).toUpperCase()] ||= []).push(z);
    if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/i.test(String(z.cod))) out.push({ n: 'err', t: `La zona «${z.nombre}» necesita un código de hasta 12 letras, números o guiones.`, s: { t: 'zona', id: z.id } });
    if (String(z.cod).toUpperCase() === 'PLANTA') out.push({ n: 'err', t: 'El código PLANTA está reservado.', s: { t: 'zona', id: z.id } });
    if (fuera(z)) out.push({ n: 'err', t: `Zona ${z.nombre} queda fuera del plano.`, s: { t: 'zona', id: z.id } });
    if (z.piso > capPiso(z)) out.push({ n: 'err', t: `Zona ${z.nombre}: caben ${capPiso(z)} posiciones de piso y pediste ${z.piso}.`, s: { t: 'zona', id: z.id } });
  });
  Object.entries(codsR).forEach(([c, l]) => { if (l.length > 1) out.push({ n: 'err', t: `Hay ${l.length} racks con el código ${c}.`, s: { t: 'rack', id: l[1].id } }); });
  Object.entries(codsZ).forEach(([c, l]) => { if (l.length > 1) out.push({ n: 'err', t: `Hay ${l.length} zonas con el código ${c}.`, s: { t: 'zona', id: l[1].id } }); });
  // códigos de posición repetidos entre racks y pisos (p. ej. zona «A» con piso y rack «A»)
  const vistos = new Map();
  posicionesDelPlano(B).forEach(p => { if (vistos.has(p.cod) && vistos.get(p.cod) !== (p.rackId || p.zonaId)) out.push({ n: 'err', t: `El código ${p.cod} se repite entre un rack y una zona.`, s: p.rackId ? { t: 'rack', id: p.rackId } : { t: 'zona', id: p.zonaId } }); vistos.set(p.cod, p.rackId || p.zonaId); });
  B.zonas.forEach(z => { if (codsR[String(z.cod).toUpperCase()]) out.push({ n: 'err', t: `La zona ${z.cod} y el rack ${z.cod} comparten código.`, s: { t: 'zona', id: z.id } }); });
  for (let i = 0; i < B.racks.length; i++) for (let j = i + 1; j < B.racks.length; j++) {
    const a = B.racks[i], b = B.racks[j], fa = huellaRack(a), fb = huellaRack(b);
    if (cruza(fa, fb)) { out.push({ n: 'err', t: `Los racks ${a.cod} y ${b.cod} se superponen.`, s: { t: 'rack', id: b.id } }); continue; }
    if (a.rot === b.rot) {
      const sx = Math.min(fa.x + fa.w, fb.x + fb.w) - Math.max(fa.x, fb.x), sy = Math.min(fa.y + fa.h, fb.y + fb.h) - Math.max(fa.y, fb.y);
      const gap = a.rot ? (sy > 0 ? Math.max(fa.x, fb.x) - Math.min(fa.x + fa.w, fb.x + fb.w) : null) : (sx > 0 ? Math.max(fa.y, fb.y) - Math.min(fa.y + fa.h, fb.y + fb.h) : null);
      if (gap !== null && gap > 0 && gap < B.pasilloMin - 0.01) out.push({ n: 'warn', t: `Pasillo entre ${a.cod} y ${b.cod}: ${gap.toFixed(1).replace('.', ',')} m (mínimo ${String(B.pasilloMin).replace('.', ',')} m).`, s: { t: 'rack', id: b.id } });
    }
  }
  B.racks.forEach(r => {
    const f = huellaRack(r);
    B.zonas.filter(z => z.uso !== 'almacenaje').forEach(z => { if (cruza(f, z)) out.push({ n: 'warn', t: `Rack ${r.cod} está dentro de la zona ${z.nombre}.`, s: { t: 'rack', id: r.id } }); });
    B.puertas.forEach(p => {
      const fr = { N: { x: p.pos, y: 0, w: p.ancho, h: 1.5 }, S: { x: p.pos, y: B.largo - 1.5, w: p.ancho, h: 1.5 }, O: { x: 0, y: p.pos, w: 1.5, h: p.ancho }, E: { x: B.ancho - 1.5, y: p.pos, w: 1.5, h: p.ancho } }[p.lado];
      if (cruza(f, fr)) out.push({ n: 'warn', t: `Rack ${r.cod} bloquea la puerta ${LADOS[p.lado].toLowerCase()}.`, s: { t: 'rack', id: r.id } });
    });
  });
  B.puertas.forEach(p => { const lim = p.lado === 'N' || p.lado === 'S' ? B.ancho : B.largo; if (p.pos < 0 || p.pos + p.ancho > lim + 0.01) out.push({ n: 'err', t: `La puerta ${LADOS[p.lado].toLowerCase()} se sale del muro.`, s: { t: 'puerta', id: p.id } }); });
  if (!B.puertas.length) out.push({ n: 'warn', t: 'El plano no tiene puertas: no se podrán calcular rutas.', s: { t: 'plano' } });
  return out;
}

/** Diferencia de ubicaciones entre el plano guardado y el borrador. */
export function diferenciaUbicaciones(guardado, borrador, conStock = new Set()) {
  const antes = new Set(posicionesDelPlano(guardado).map(p => p.cod));
  const ahora = new Set(posicionesDelPlano(borrador).map(p => p.cod));
  const nuevas = [...ahora].filter(c => !antes.has(c));
  const quitadas = [...antes].filter(c => !ahora.has(c));
  return { nuevas, quitadas, quitadasConStock: quitadas.filter(c => conStock.has(c)), total: ahora.size };
}

/** Recorrido aproximado desde la primera puerta hasta una posición, por los pasillos. */
export function rutaDesdePuerta(L, p) {
  const pu = L.puertas[0]; if (!pu || !p) return null;
  const c = pu.pos + pu.ancho / 2;
  const ini = { N: [c, -0.6], S: [c, L.largo + 0.6], O: [-0.6, c], E: [L.ancho + 0.6, c] }[pu.lado];
  const dentro = { N: [c, 0.8], S: [c, L.largo - 0.8], O: [0.8, c], E: [L.ancho - 0.8, c] }[pu.lado];
  const pts = [ini, dentro];
  const r = L.racks.find(x => x.id === p.rackId);
  if (r) {
    const f = huellaRack(r);
    if (!r.rot) { const zA = f.y - 0.7, xC = f.x - 1.1; pts.push([xC, dentro[1]], [xC, zA], [p.x, zA]); }
    else { const xA = f.x - 0.7, zC = f.y - 1.1; pts.push([dentro[0], zC], [xA, zC], [xA, p.z]); }
  } else pts.push([p.x, dentro[1]], [p.x, p.z - 0.9]);
  let d = 0; for (let i = 1; i < pts.length; i++) d += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  return { pts, d, puerta: `puerta ${LADOS[pu.lado].toLowerCase()}` };
}

/** Siguiente código libre de rack (A, B, …, Z, AA…). */
export function siguienteCodigoRack(racks) {
  const usados = new Set(racks.map(r => String(r.cod).toUpperCase()));
  for (let k = 0; k < 26 * 27; k++) { const c = k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(64 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26)); if (!usados.has(c)) return c; }
  return 'R' + racks.length;
}
