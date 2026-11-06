import { describe, expect, it } from 'vitest';
import {
  cantidadSugerida, coberturaMeses, estadoStock, filtrarCola, itemsSolpe, lineaPorEscaneo, normalizarPedido, ordenarPicking,
  previsualizarLiquidacion, rangoMesAnterior, requiereAprobacion, resumenCola, resumenConteo, resumenMinimos, validarGuia,
  validarParametros, validarPreparado,
} from '../src/zahory-mock/pages/wms/wmsMultiLogic.js';

describe('despachos', () => {
  const ot = {
    id: 'ot1', canal: 'ot', numero: 'OT-1', destino: 'Taller', estado: 'reservada',
    lineas: [
      { linea_id: 'l1', codigo: 'B', descripcion: 'Filtro', pendiente: 2, ubicacion: 'B-01' },
      { linea_id: 'l1', codigo: 'B', descripcion: 'Filtro', pendiente: 3, ubicacion: 'A-02' },
      { linea_id: 'l2', codigo: 'A', descripcion: 'Aceite', pendiente: 1, ubicacion: 'A-01' },
    ],
  };
  it('agrupa las reservas de OT por línea y ordena la ruta de picking por ubicación', () => {
    const p = normalizarPedido(ot);
    expect(p.lineas).toHaveLength(2);
    expect(p.lineas.map(l => l.linea_id)).toEqual(['l2', 'l1']);
    expect(p.lineas[1]).toMatchObject({ pendiente: 5, ubicacion: 'B-01, A-02' });
  });
  it('en venta lo listo es lo reservado y calcula el faltante', () => {
    const p = normalizarPedido({ id: 'd1', canal: 'venta', lineas: [{ linea_id: 'x', codigo: 'M', cantidad: 20, reservada: 12, despachada: 0 }] });
    expect(p.lineas[0]).toMatchObject({ pendiente: 12, faltante: 8, solicitada: 20 });
    expect(resumenCola([p, normalizarPedido(ot)])).toMatchObject({ total: 2, venta: 1, ot: 1, parciales: 1 });
  });
  it('ordenarPicking deja al final lo que no tiene ubicación', () => {
    expect(ordenarPicking([{ codigo: 'Z' }, { codigo: 'Y', ubicacion: 'C-10' }, { codigo: 'X', ubicacion: 'C-2' }]).map(l => l.codigo)).toEqual(['X', 'Y', 'Z']);
  });
  it('filtra por canal y texto, incluido el material', () => {
    const cola = [normalizarPedido(ot), normalizarPedido({ id: 'd', canal: 'custodia', numero: 'CUS-1', destino: 'Retiro', lineas: [] })];
    expect(filtrarCola(cola, { canal: 'custodia' })).toHaveLength(1);
    expect(filtrarCola(cola, { texto: 'aceite' }).map(p => p.id)).toEqual(['ot1']);
  });
  it('valida cantidades preparadas contra lo listo', () => {
    const p = normalizarPedido(ot);
    expect(validarPreparado(p, {}).error).toMatch(/al menos una/);
    expect(validarPreparado(p, { l1: '6' }).error).toMatch(/solo hay 5/);
    expect(validarPreparado(p, { l1: '2,5', l2: '' })).toEqual({ lineas: [{ linea_id: 'l1', cantidad: 2.5 }], error: '' });
  });
  it('exige los datos de la guía según la modalidad', () => {
    expect(validarGuia({ modalidad: 'remitente' })).toMatch(/punto de llegada.*fecha.*peso.*placa.*DNI/);
    expect(validarGuia({ modalidad: 'transportista', llegada_direccion: 'Av 1', fecha_inicio_traslado: '2026-10-27', peso_bruto_total: '10' })).toMatch(/RUC/);
    expect(validarGuia({ modalidad: 'remitente', llegada_direccion: 'Av 1', fecha_inicio_traslado: '2026-10-27', peso_bruto_total: 3, vehiculo_placa: 'ABC-123', conductor_dni: '12345678' })).toBe('');
  });
  it('el escaneo encuentra la línea por código de material o de ubicación', () => {
    const p = normalizarPedido(ot);
    expect(lineaPorEscaneo(p, 'a')?.linea_id).toBe('l2');
    expect(lineaPorEscaneo(p, 'A-02')?.linea_id).toBe('l1');
    expect(lineaPorEscaneo(p, 'nada')).toBeNull();
  });
});

describe('mínimos y reposición', () => {
  const fila = extra => ({ disponible: 10, stock_minimo: 5, punto_reorden: 12, stock_maximo: 40, consumo_mes: 4, costo_promedio: 2, ...extra });
  it('clasifica el estado del stock', () => {
    expect(estadoStock(fila({ disponible: 0 })).id).toBe('quiebre');
    expect(estadoStock(fila({ disponible: 3 })).id).toBe('bajo_minimo');
    expect(estadoStock(fila()).id).toBe('reordenar');
    expect(estadoStock(fila({ disponible: 20 })).id).toBe('ok');
    expect(estadoStock(fila({ stock_minimo: 0, punto_reorden: 0 })).id).toBe('sin_parametro');
  });
  it('sugiere reponer hasta el máximo (o 2× el reorden) solo cuando hace falta', () => {
    expect(cantidadSugerida(fila())).toBe(30);
    expect(cantidadSugerida(fila({ stock_maximo: 0 }))).toBe(14);
    expect(cantidadSugerida(fila({ disponible: 20 }))).toBe(0);
    expect(coberturaMeses(fila())).toBe(2.5);
    expect(coberturaMeses(fila({ consumo_mes: 0 }))).toBeNull();
  });
  it('resume alertas y valor sugerido, y arma los ítems de la SOLPE', () => {
    const filas = [fila(), fila({ disponible: 0, material_id: 'm2' }), fila({ disponible: 50 })];
    expect(resumenMinimos(filas)).toMatchObject({ reordenar: 1, quiebre: 1, ok: 1, valor_sugerido: 140 });
    expect(itemsSolpe(filas).map(i => i.cantidad)).toEqual([30, 40]);
  });
  it('valida los parámetros', () => {
    expect(validarParametros({ stock_minimo: -1 })).toMatch(/negativos/);
    expect(validarParametros({ stock_minimo: 50, stock_maximo: 10 })).toMatch(/superar/);
    expect(validarParametros({ stock_minimo: 8, punto_reorden: 5 })).toMatch(/reorden/);
    expect(validarParametros({ stock_minimo: 5, punto_reorden: 8, stock_maximo: 20 })).toBe('');
  });
});

describe('conteos', () => {
  const items = [
    { teorico: 10, fisico: 10, costo: 5 },
    { teorico: 4, fisico: 3, costo: 100 },
    { teorico: 2, fisico: 4, costo: 1 },
    { teorico: 7, fisico: null, costo: 1 },
  ];
  it('calcula exactitud, faltante, sobrante y pendientes', () => {
    expect(resumenConteo(items)).toMatchObject({ total: 4, contadas: 3, pendientes: 1, exactitud: 33.3, faltante: 100, sobrante: 2, valor: 102 });
  });
  it('requiere aprobación cuando el valor de diferencias supera el umbral', () => {
    expect(requiereAprobacion(items, 500)).toBe(false);
    expect(requiereAprobacion(items, 100)).toBe(true);
  });
});

describe('custodia', () => {
  it('previsualiza la liquidación', () => {
    expect(previsualizarLiquidacion({ posiciones_dia: 31, movimientos: 4, tarifa_posicion_dia: 2.5, tarifa_movimiento: 10 })).toEqual({ almacenaje: 77.5, movimientos: 40, total: 117.5 });
  });
  it('propone el mes anterior completo', () => {
    expect(rangoMesAnterior(new Date(2026, 0, 15))).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoMesAnterior(new Date(2026, 2, 3))).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });
});

describe('menú según módulos WMS', () => {
  it('oculta las entradas cuyo módulo está apagado y deja el resto', async () => {
    const { filtrarNavegacionPorModulos } = await import('../src/zahory-mock/navegacionModulos.js');
    const nav = [{ id: 'z', groups: [{ id: 'g', items: [{ id: 'a' }, { id: 'c', modulo: 'custodia' }, { id: 'k', modulo: 'conteos' }] }] }];
    const r = filtrarNavegacionPorModulos(nav, { custodia: false, conteos: true });
    expect(r[0].groups[0].items.map(i => i.id)).toEqual(['a', 'k']);
  });
});
