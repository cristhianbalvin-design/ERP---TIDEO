import { describe, expect, it } from 'vitest';
import {
  FORMATOS_ETIQUETA, contenidoQR, estadoDevolucion, estadoLote, estadoPrestamo, filasExcelValorizado, filtrarLotes, filtrarPrestamos,
  marcarSalePrimero, paginarEtiquetas, resumenDevoluciones, resumenLotes, resumenPrestamos, resumenValorizado, textoContador,
  validarCierreInspeccion, validarLineasDevolucion, validarPrestamo,
} from '../src/zahory-mock/pages/wms/wmsPr2Logic.js';

describe('vencimientos y lotes', () => {
  const lotes = [
    { stock_id: 's1', material_id: 'm1', almacen_id: 'a1', lote: 'L-1', dias: -7, vencimiento: '2026-10-20', disponible: 12, valor: 120, uso: 'almacenaje' },
    { stock_id: 's2', material_id: 'm1', almacen_id: 'a1', lote: 'L-2', dias: 14, vencimiento: '2026-11-10', disponible: 8, valor: 80, uso: 'almacenaje' },
    { stock_id: 's3', material_id: 'm1', almacen_id: 'a1', lote: 'L-3', dias: 80, vencimiento: '2027-01-15', disponible: 84, valor: 840, uso: 'almacenaje' },
    { stock_id: 's4', material_id: 'm2', almacen_id: 'a1', lote: 'C-1', dias: 200, vencimiento: '2027-05-15', disponible: 5, valor: 45, uso: 'almacenaje' },
    { stock_id: 's5', material_id: 'm2', almacen_id: 'a1', lote: 'C-0', dias: 5, vencimiento: '2026-11-01', disponible: 0, valor: 10, uso: 'almacenaje' },
  ];
  it('clasifica el estado con singular y plural', () => {
    expect(estadoLote(lotes[0])).toMatchObject({ id: 'vencido', label: 'Vencido hace 7 días' });
    expect(estadoLote({ dias: 1, vencimiento: 'x' }).label).toBe('Vence en 1 día');
    expect(estadoLote(lotes[2]).id).toBe('vence_90');
    expect(estadoLote({ dias: null, vencimiento: null }).id).toBe('sin_fecha');
    expect(estadoLote({ ...lotes[0], uso: 'cuarentena' }).id).toBe('cuarentena');
  });
  it('resume vencidos, por vencer y valor en riesgo', () => {
    expect(resumenLotes(lotes)).toEqual({ vencidos: 1, vence30: 2, vence90: 1, valorRiesgo: 1050 });
  });
  it('FEFO: sale primero el vigente con disponible que vence antes, por material', () => {
    const r = marcarSalePrimero(lotes);
    expect(r.filter(l => l.sale_primero).map(l => l.stock_id)).toEqual(['s2', 's4']);
  });
  it('filtra por vencer y vencidos', () => {
    expect(filtrarLotes(lotes, { filtro: 'por_vencer' }).map(l => l.stock_id)).toEqual(['s5', 's2', 's3']);
    expect(filtrarLotes(lotes, { filtro: 'vencidos' }).map(l => l.stock_id)).toEqual(['s1']);
    expect(filtrarLotes(lotes, { filtro: 'todos', texto: 'c-1' }).map(l => l.stock_id)).toEqual(['s4']);
  });
});

describe('devoluciones', () => {
  const guia = { lineas: [{ material_id: 'm1', cantidad: 6 }, { material_id: 'm1', cantidad: 4 }, { material_id: 'm2', cantidad: 2 }] };
  it('valida lo devuelto contra lo despachado (sumando líneas del mismo material)', () => {
    expect(validarLineasDevolucion(guia, { m1: '10', m2: '' })).toEqual({ lineas: [{ material_id: 'm1', cantidad: 10 }], errores: {} });
    expect(validarLineasDevolucion(guia, { m1: '11' }).errores.m1).toMatch(/Máximo 10/);
    expect(validarLineasDevolucion(guia, { m2: '0' }).errores.m2).toMatch(/mayor a cero/);
  });
  it('el cierre exige liberado + merma = devuelto en cada línea', () => {
    const dev = { lineas: [{ linea_id: 'l1', cantidad: 6 }, { linea_id: 'l2', cantidad: 2 }] };
    expect(validarCierreInspeccion(dev, {}).errores).toEqual({});
    const r = validarCierreInspeccion(dev, { l1: { liberar: '4', merma: '1' }, l2: { liberar: '0', merma: '2' } });
    expect(r.errores.l1).toMatch(/sumar 6/);
    expect(r.lineas[1]).toEqual({ linea_id: 'l2', liberar: 0, merma: 2 });
  });
  it('estados y resumen', () => {
    expect(estadoDevolucion({ estado: 'en_inspeccion' }).label).toBe('En inspección');
    expect(estadoDevolucion({ estado: 'cerrada', nc_estado: 'pendiente' }).label).toBe('Cerrada · NC pendiente');
    const r = resumenDevoluciones([
      { estado: 'en_inspeccion', nc_estado: 'no_aplica' }, { estado: 'cerrada', nc_estado: 'pendiente', cerrada_at: '2026-10-27T10:00:00Z' },
      { estado: 'cerrada', nc_estado: 'emitida', cerrada_at: '2026-09-01T10:00:00Z' },
    ], new Date(2026, 9, 27));
    expect(r).toEqual({ inspeccion: 1, ncPendiente: 1, cerradasMes: 1 });
  });
});

describe('préstamo de herramientas', () => {
  const prestamos = [
    { id: 'p1', estado: 'activo', pendiente: 2, dias_vencido: 2, codigo: 'HER-1', descripcion: 'Llave', personal: 'Juan' },
    { id: 'p2', estado: 'activo', pendiente: 1, dias_vencido: -3, codigo: 'HER-1', descripcion: 'Llave', personal: 'Andre' },
    { id: 'p3', estado: 'cerrado', pendiente: 0, danada: 1, codigo: 'HER-2', descripcion: 'Torquímetro', personal: 'Juan' },
  ];
  it('estado del préstamo', () => {
    expect(estadoPrestamo(prestamos[0])).toMatchObject({ id: 'vencido', label: 'Vencido 2 días' });
    expect(estadoPrestamo(prestamos[1]).label).toBe('En uso');
    expect(estadoPrestamo({ estado: 'activo', dias_vencido: 0 }).label).toBe('Devolver hoy');
    expect(estadoPrestamo(prestamos[2]).label).toBe('Cerrado · con daño');
  });
  it('resumen y filtros', () => {
    expect(resumenPrestamos(prestamos, [{ es_herramienta: true, disponible: 5 }, { es_herramienta: false, disponible: 9 }])).toEqual({ prestadas: 3, vencidos: 1, disponibles: 5 });
    expect(filtrarPrestamos(prestamos, { filtro: 'vencidos' }).map(p => p.id)).toEqual(['p1']);
    expect(filtrarPrestamos(prestamos, { filtro: 'devueltos' }).map(p => p.id)).toEqual(['p3']);
    expect(filtrarPrestamos(prestamos, { filtro: 'activos', texto: 'andre' }).map(p => p.id)).toEqual(['p2']);
  });
  it('valida el formulario de préstamo mostrando todos los errores', () => {
    expect(Object.keys(validarPrestamo({ cantidad: '' }))).toEqual(['stock_id', 'cantidad', 'personal_id', 'fecha_devolucion']);
    expect(validarPrestamo({ stock_id: 's', cantidad: '3', personal_id: 'p', fecha_devolucion: '2026-11-01' }, 2).cantidad).toMatch(/Solo hay 2/);
    expect(validarPrestamo({ stock_id: 's', cantidad: '1', personal_id: 'p', fecha_devolucion: '2026-11-01' }, 2)).toEqual({});
  });
});

describe('etiquetas', () => {
  it('expande copias y pagina según el formato', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ codigo: `A-${i}`, copias: i === 0 ? 20 : 1 }));
    const r = paginarEtiquetas(items, FORMATOS_ETIQUETA.a24);
    expect(r.total).toBe(29);
    expect(r.hojas.map(h => h.length)).toEqual([24, 5]);
    expect(paginarEtiquetas([{ codigo: 'X', copias: 0 }], FORMATOS_ETIQUETA.a8).total).toBe(0);
  });
  it('el QR lleva el código de barras del material o, si no tiene, su código', () => {
    expect(contenidoQR({ codigo: 'MAT-1', codigo_barras: '7750001' })).toBe('7750001');
    expect(contenidoQR({ codigo: 'A-01-1' })).toBe('A-01-1');
  });
});

describe('reporte valorizado y ABC', () => {
  const materiales = [
    { codigo: 'EMB', descripcion: 'Caja', clase: 'sin_movimiento', fisico: 34, costo_promedio: 391.33, valor: 13305.22, consumo_12m: 0, sin_salida_90: true, ultima_salida: null },
    { codigo: 'QUI', descripcion: 'Grasa', clase: 'A', fisico: 104, costo_promedio: 10, valor: 1040, consumo_12m: 100, sin_salida_90: false, ultima_salida: '2026-10-12T04:59:37Z' },
    { codigo: 'HER', descripcion: 'Llave', clase: 'B', fisico: 8, costo_promedio: 18, valor: 144, consumo_12m: 36, sin_salida_90: false },
  ];
  it('resume valor, clases y stock sin salidas', () => {
    const r = resumenValorizado(materiales);
    expect(r).toMatchObject({ valor: 14489.22, consumo: 136, sinSalida90: 13305.22, pctSinSalida: 92 });
    expect(r.clases.A).toEqual({ n: 1, consumo: 100, valor: 1040 });
    expect(r.clases.sin_movimiento.n).toBe(1);
  });
  it('arma filas legibles para Excel', () => {
    const [f] = filasExcelValorizado(materiales);
    expect(f).toMatchObject({ 'Código': 'EMB', 'Clase ABC': 'Sin movimiento', 'Valor (S/)': 13305.22, 'Última salida': 'Sin salidas' });
    expect(filasExcelValorizado(materiales)[1]['Última salida']).toBe('2026-10-12');
  });
  it('contadores con singular y plural', () => {
    expect(textoContador(1, 'material', 'materiales')).toBe('1 material');
    expect(textoContador(0, 'material', 'materiales')).toBe('0 materiales');
  });
});
