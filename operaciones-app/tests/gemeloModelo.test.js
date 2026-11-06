import { describe, expect, it } from 'vitest';
import {
  capPiso, diferenciaUbicaciones, estadoPosicion, inventarioPorCodigo, itemsEnDia, normalizarPlano, posicionesDelPlano,
  revisarPlano, rutaDesdePuerta, siguienteCodigoRack, zonaDeRack,
} from '../src/zahory-mock/pages/gemelo/gemeloModelo.js';
import { PLANO_EJEMPLO } from '../src/zahory-mock/pages/gemelo/gemeloEjemplo.js';

const plano = () => normalizarPlano(JSON.parse(JSON.stringify(PLANO_EJEMPLO)));

describe('gemeloModelo', () => {
  it('genera los mismos códigos de posición que la RPC (módulo-nivel y piso)', () => {
    const pos = posicionesDelPlano(plano());
    expect(pos).toHaveLength(4 * 24 + 3 + 5);
    expect(pos.map(p => p.cod)).toEqual(expect.arrayContaining(['A-01-1', 'A-06-4', 'D-03-2', 'CUA-01', 'CUA-03', 'PISO-05']));
    expect(pos.find(p => p.cod === 'CUA-02').uso).toBe('cuarentena');
  });

  it('ubica el rack en la zona que contiene su centro', () => {
    const L = plano();
    expect(zonaDeRack(L, L.racks[0])).toBeNull();
    L.racks[0].x = 24.5; L.racks[0].y = 12; L.racks[0].mod = 2;
    expect(zonaDeRack(L, L.racks[0]).cod).toBe('PISO');
  });

  it('calcula la capacidad de piso de una zona', () => {
    expect(capPiso({ w: 5, h: 6 })).toBe(4);
    expect(capPiso({ w: 6, h: 10 })).toBe(6);
  });

  it('el plano de ejemplo no tiene errores y detecta superposición, código repetido y pasillo angosto', () => {
    const L = plano();
    expect(revisarPlano(L).filter(i => i.n === 'err')).toEqual([]);
    L.racks[1].y = 3.8;
    expect(revisarPlano(L).some(i => i.n === 'err' && i.t.includes('se superponen'))).toBe(true);
    L.racks[1].y = 6; L.racks[1].cod = 'A';
    const issues = revisarPlano(L);
    expect(issues.some(i => i.t.includes('2 racks con el código A'))).toBe(true);
    expect(issues.some(i => i.n === 'warn' && i.t.includes('Pasillo'))).toBe(true);
  });

  it('detecta zonas fuera del plano y más posiciones de piso de las que caben', () => {
    const L = plano();
    L.ancho = 26; L.zonas[3].piso = 20;
    const t = revisarPlano(L).map(i => i.t).join(' | ');
    expect(t).toContain('Zona Piso queda fuera del plano');
    expect(t).toContain('caben');
  });

  it('calcula ubicaciones nuevas y quitadas, marcando las que tienen stock', () => {
    const antes = plano(); const despues = plano();
    despues.racks = despues.racks.filter(r => r.cod !== 'D');
    despues.racks.push({ id: 'n', cod: 'E', x: 8, y: 17, mod: 2, niv: 2, rot: 0 });
    const d = diferenciaUbicaciones(antes, despues, new Set(['D-01-1']));
    expect(d.nuevas).toHaveLength(4);
    expect(d.quitadas).toHaveLength(24);
    expect(d.quitadasConStock).toEqual(['D-01-1']);
  });

  it('arma el inventario por código, separa lo que está fuera del plano y marca bajo reorden por material', () => {
    const ubicaciones = [{ id: 'u1', codigo: 'A-01-1', uso: 'almacenaje' }, { id: 'u2', codigo: 'GEN', es_general: true }, { id: 'u3', codigo: 'CUA-01', uso: 'cuarentena' }];
    const mat = { codigo: 'M1', descripcion: 'Grasa', unidad: 'UND', costo_promedio: 10, punto_reorden: 8 };
    const stock = [
      { material_id: 'm1', ubicacion_id: 'u1', fisico: 5, reservado: 1, materiales: mat },
      { material_id: 'm1', ubicacion_id: 'u3', fisico: 4, reservado: 0, materiales: mat },
      { material_id: 'm1', ubicacion_id: 'u2', fisico: 2, reservado: 0, materiales: mat },
    ];
    const hoy = new Date('2026-10-23T12:00:00Z');
    const r = inventarioPorCodigo({ ubicaciones, stock, ultimos: [{ ubicacion_id: 'u1', material_id: 'm1', fecha: '2026-10-13T12:00:00Z', tipo: 'entrada' }], movimientos: [], hoy }, new Set(['A-01-1', 'CUA-01']));
    const it = r.porCodigo.get('A-01-1')[0];
    expect(it.fisico).toBe(5);
    expect(it.dias).toBe(10);
    expect(it.bajoReorden).toBe(true); // disponible 5+2-1 = 6 (cuarentena no cuenta) <= 8
    expect(r.fueraDelPlano).toMatchObject({ filas: 1, unidades: 2, ubicaciones: ['General'] });
    expect(estadoPosicion({ uso: 'cuarentena' }, r.porCodigo.get('CUA-01'))).toBe('cuarentena');
    expect(estadoPosicion({ uso: 'almacenaje' }, [])).toBe('vacio');
  });

  it('reconstruye la cantidad de días anteriores con los movimientos del kardex', () => {
    const hoy = new Date('2026-10-23T12:00:00Z');
    const items = [{ fisico: 10, reservado: 2, dias: 1, ultimaFecha: '2026-10-22T12:00:00Z', movs: [{ fecha: new Date('2026-10-22T12:00:00Z'), delta: 6 }, { fecha: new Date('2026-10-15T12:00:00Z'), delta: 4 }] }];
    expect(itemsEnDia(items, -3, hoy)[0].fisico).toBe(4);
    expect(itemsEnDia(items, -10, hoy)).toEqual([]);
    expect(itemsEnDia(items, 0, hoy)[0].fisico).toBe(10);
  });

  it('traza la ruta desde la primera puerta y sugiere el siguiente código de rack', () => {
    const L = plano();
    const p = posicionesDelPlano(L).find(x => x.cod === 'A-03-1');
    const r = rutaDesdePuerta(L, p);
    expect(r.puerta).toBe('puerta norte');
    expect(r.d).toBeGreaterThan(5);
    expect(rutaDesdePuerta({ ...L, puertas: [] }, p)).toBeNull();
    expect(siguienteCodigoRack(L.racks)).toBe('E');
  });
});
