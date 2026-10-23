// Datos de ejemplo para conocer el gemelo sin plano ni stock propio (no se guardan).
import { posicionesDelPlano } from './gemeloModelo.js';

export const PLANO_EJEMPLO = {
  ancho: 30, largo: 20, pasilloMin: 2.4,
  puertas: [{ id: 'p1', lado: 'N', pos: 9, ancho: 6 }],
  zonas: [
    { id: 'z1', cod: 'REC', nombre: 'Recepción', uso: 'recepcion', x: 0, y: 0, w: 6, h: 6, piso: 0 },
    { id: 'z2', cod: 'DES', nombre: 'Despacho', uso: 'despacho', x: 24, y: 0, w: 6, h: 6, piso: 0 },
    { id: 'z3', cod: 'CUA', nombre: 'Cuarentena', uso: 'cuarentena', x: 0, y: 14, w: 5, h: 6, piso: 3 },
    { id: 'z4', cod: 'PISO', nombre: 'Piso', uso: 'almacenaje', x: 24, y: 10, w: 6, h: 10, piso: 5 },
  ],
  racks: [
    { id: 'r1', cod: 'A', x: 8, y: 3.5, mod: 6, niv: 4, rot: 0 }, { id: 'r2', cod: 'B', x: 8, y: 7, mod: 6, niv: 4, rot: 0 },
    { id: 'r3', cod: 'C', x: 8, y: 10.5, mod: 6, niv: 4, rot: 0 }, { id: 'r4', cod: 'D', x: 8, y: 14, mod: 6, niv: 4, rot: 0 },
  ],
};

const MATS = [
  ['QUI-LUB-044', 'Grasa de litio multipropósito NLGI 2', 'UND', 22], ['G01030101', 'Tubo delgado', 'm', 8.5], ['EMB-ETI-004', 'Etiqueta térmica 100x100 mm', 'ROL', 14],
  ['ELE-CAB-015', 'Cable vulcanizado 3x10 AWG', 'MET', 6.2], ['EMB-CAJ-003', 'Caja cartón 40x40x40 cm', 'UND', 3.1], ['ELE-CAB-032', 'Cable apantallado 4x18 AWG', 'MET', 4.8],
  ['EPP-PRO-001', 'Casco de seguridad jockey blanco', 'UND', 18], ['MEC-ROD-102', 'Rodamiento rígido de bolas 6204', 'UND', 12.5], ['HER-MAN-012', 'Llave mixta 1/2"', 'UND', 9.9],
  ['EMB-STR-001', 'Stretch film 20" x 1200 ft', 'ROL', 21], ['FIJ-PER-315', 'Perno Allen M8x30', 'UND', 0.6], ['HID-BOM-024', 'Bomba hidráulica caudal fijo', 'UND', 1450],
  ['ELE-MOT-002', 'Motor eléctrico 2 HP 220 V', 'UND', 890], ['ELE-MOT-001', 'Motor eléctrico 5 HP 440 V', 'UND', 1620], ['REP-4412-HYD', 'Filtro hidráulico', 'UND', 376.6], ['INS-LCK-001', 'Traba roscas', 'UND', 35],
];
const MOVS = ['Recepción OC-26-018', 'Despacho a taller OT-26-0838', 'Transferencia', 'Ajuste de conteo'];

/** Inventario de ejemplo con la misma forma que inventarioPorCodigo().porCodigo. */
export function inventarioEjemplo(hoy = new Date()) {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const porCodigo = new Map();
  const add = (cod, mi, fisico, reservado = 0, bajo = false) => {
    const m = MATS[mi]; const dias = Math.floor(rnd() * rnd() * 120); const ingreso = dias + Math.floor(rnd() * 25);
    const item = { materialId: m[0], codigo: m[0], desc: m[1], um: m[2], costo: m[3], fisico, reservado, reorden: bajo ? fisico + 5 : 0, bajoReorden: bajo, dias,
      ultimo: MOVS[Math.floor(rnd() * MOVS.length)], ultimaFecha: new Date(hoy.getTime() - dias * 86400000).toISOString(),
      movs: ingreso <= 14 ? [{ fecha: new Date(hoy.getTime() - ingreso * 86400000), delta: fisico }] : [] };
    if (!porCodigo.has(cod)) porCodigo.set(cod, []);
    porCodigo.get(cod).push(item);
  };
  add('A-01-1', 0, 60, 0, true); add('A-01-2', 0, 41); add('A-02-1', 1, 96, 1); add('A-03-2', 3, 35, 4, true); add('A-04-1', 5, 32); add('A-05-3', 6, 25);
  add('B-01-1', 7, 10, 0, true); add('B-01-2', 8, 8, 3); add('B-02-3', 10, 2, 2, true); add('B-03-1', 2, 40); add('B-04-2', 4, 34); add('B-05-4', 9, 2, 0, true);
  add('C-01-1', 14, 3, 1, true); add('C-02-2', 15, 12); add('C-03-1', 7, 4); add('C-04-3', 2, 18); add('C-06-1', 8, 6);
  add('D-01-1', 4, 20); add('D-02-2', 9, 7); add('D-03-3', 6, 12); add('D-05-1', 15, 3, 0, true);
  add('PISO-01', 11, 1); add('PISO-02', 12, 1, 1); add('PISO-03', 13, 1);
  add('CUA-01', 14, 2); add('CUA-02', 0, 2); add('CUA-03', 10, 15);
  posicionesDelPlano(PLANO_EJEMPLO).filter(p => p.rackId && !porCodigo.has(p.cod)).forEach(p => { if (rnd() < 0.45) add(p.cod, Math.floor(rnd() * 11), Math.ceil(rnd() * 30)); });
  return { porCodigo, fueraDelPlano: { filas: 0, unidades: 0, ubicaciones: [] } };
}
