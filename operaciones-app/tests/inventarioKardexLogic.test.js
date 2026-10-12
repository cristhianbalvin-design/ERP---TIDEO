import { describe, expect, it } from 'vitest';
import { calcularStockMaterial, cantidadConSigno, claseTipoMovimiento, consolidarStockPorMaterial, esTransferencia, etiquetaMotivoKardex, etiquetaTipoMovimiento, etiquetaValorizacion, resolverEtiquetaUbicacionAlmacen } from '../src/zahory-mock/pages/inventarioKardexLogic.js';

describe('lógica de Inventario & Kardex', () => {
  it('resta reservado y físico en cuarentena y merma del disponible', () => {
    const material = { costo_promedio: 2 };
    const filas = [
      { fisico: 10, reservado: 2, uso: 'almacenaje' },
      { fisico: 4, reservado: 0, uso: 'cuarentena' },
      { fisico: 3, reservado: 0, uso: 'merma' },
    ];
    expect(calcularStockMaterial(material, filas)).toMatchObject({ fisico: 17, reservado: 2, noDisponible: 7, disponible: 8 });
  });

  it('marca bajo reorden con stock de seguridad y usa stock mínimo como respaldo', () => {
    const material = { punto_reorden: null, stock_minimo: 7, stock_seguridad: 3 };
    expect(calcularStockMaterial(material, [{ fisico: 10, reservado: 0, uso: 'almacenaje' }])).toMatchObject({ reorden: 10, estado: 'bajo' });
    expect(calcularStockMaterial({ punto_reorden: 0, stock_minimo: 7, stock_seguridad: 3 }, [{ fisico: 10, uso: 'almacenaje' }]).reorden).toBe(10);
  });

  it('marca agotado cuando el disponible queda en cero', () => {
    expect(calcularStockMaterial({ punto_reorden: 10 }, [{ fisico: 5, reservado: 2, uso: 'cuarentena' }]).estado).toBe('agotado');
  });

  it('valoriza el inventario con el físico y costo promedio', () => {
    expect(calcularStockMaterial({ costo_promedio: 12.5 }, [{ fisico: 4, reservado: 2, uso: 'almacenaje' }]).valor).toBe(50);
    expect(calcularStockMaterial({ moneda: 'USD', costo_promedio: 12.5, costo_promedio_usd: 2 }, [{ fisico: 4, uso: 'almacenaje' }])).toMatchObject({ costoPromedio: 2, moneda: 'USD', valor: 8 });
  });

  it.each([
    ['entrada', 1, 'Entrada'],
    ['salida', -1, 'Salida'],
    ['transferencia_entrada', 1, 'Transf. entrada'],
    ['transferencia_salida', -1, 'Transf. salida'],
    ['ajuste', 1, 'Ajuste'],
    ['transferencia_entrada', 1, 'Transf. entrada'],
  ])('aplica signo y etiqueta a %s', (tipo, esperado, etiqueta) => {
    expect(cantidadConSigno({ tipo, cantidad: 5 })).toBe(esperado * 5);
    expect(etiquetaTipoMovimiento(tipo)).toBe(etiqueta);
    expect(claseTipoMovimiento(tipo)).toBeTruthy();
  });

  it('conserva anulados sin valorización y etiqueta como Anulado', () => {
    expect(etiquetaValorizacion({ anulado: true, valorizacion_estado: 'pendiente_factura' })).toBe('Anulado');
    expect(cantidadConSigno({ tipo: 'entrada', cantidad: 3, anulado: true })).toBe(3);
  });

  it('etiqueta el motivo de despacho de repuestos a taller', () => {
    expect(etiquetaMotivoKardex('despacho_taller')).toBe('Despacho a taller');
    expect(etiquetaTipoMovimiento('despacho_taller')).toBe('Despacho a taller');
  });

  it('identifica ambos asientos de transferencia', () => {
    expect(esTransferencia({ tipo: 'transferencia_salida' })).toBe(true);
    expect(esTransferencia({ tipo: 'transferencia_entrada' })).toBe(true);
    expect(esTransferencia({ tipo: 'entrada' })).toBe(false);
  });

  it('etiqueta los motivos nuevos y conserva ambas liberaciones como pares de transferencia', () => {
    expect(etiquetaMotivoKardex('liberacion_cuarentena')).toBe('Liberación de cuarentena');
    expect(etiquetaMotivoKardex('reversa_despacho')).toBe('Reversa de despacho');
    expect(esTransferencia({ tipo: 'transferencia_salida', referencia_tipo: 'transferencia', motivo: 'liberacion_cuarentena' })).toBe(true);
    expect(esTransferencia({ tipo: 'transferencia_entrada', referencia_tipo: 'transferencia', motivo: 'liberacion_cuarentena' })).toBe(true);
  });

  it('resuelve etiquetas legibles de ubicaciones y almacenes con id como fallback', () => {
    const datos = {
      ubicaciones: [{ id: 'u1', codigo: 'R-01', nombre: 'Rack principal' }],
      almacenes: [{ id: 'a1', codigo: 'ALM-01', nombre: 'Almacén Norte' }],
      stock: [{ ubicacion_id: 'u2', ubicaciones: { codigo: 'CUA-01', nombre: 'Cuarentena' }, almacen_id: 'a2', almacenes: { nombre: 'Almacén Sur' } }],
    };
    expect(resolverEtiquetaUbicacionAlmacen('u1', 'ubicacion', datos)).toBe('R-01 · Rack principal');
    expect(resolverEtiquetaUbicacionAlmacen('u2', 'ubicacion', datos)).toBe('CUA-01 · Cuarentena');
    expect(resolverEtiquetaUbicacionAlmacen('a1', 'almacen', datos)).toBe('ALM-01 · Almacén Norte');
    expect(resolverEtiquetaUbicacionAlmacen('a2', 'almacen', datos)).toBe('Almacén Sur');
    expect(resolverEtiquetaUbicacionAlmacen('u-no-encontrada', 'ubicacion', datos)).toBe('u-no-encontrada');
  });

  it('consolida varias filas de stock por material y conserva el detalle', () => {
    const resultado = consolidarStockPorMaterial([
      { id: 's1', material_id: 'm1', fisico: 3, reservado: 1, almacen_id: 'a1', materiales: { id: 'm1', codigo: 'M-1', descripcion: 'Filtro', costo_promedio: 5 } },
      { id: 's2', material_id: 'm1', fisico: 7, reservado: 2, almacen_id: 'a2', materiales: { id: 'm1', codigo: 'M-1', descripcion: 'Filtro', costo_promedio: 5 } },
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].filas).toHaveLength(2);
    expect(calcularStockMaterial(resultado[0])).toMatchObject({ fisico: 10, reservado: 3, valor: 50 });
  });

  it('incluye materiales con fila de stock en cero y excluye materiales sin fila', () => {
    const resultado = consolidarStockPorMaterial([
      { id: 's1', material_id: 'm0', fisico: 0, materiales: { id: 'm0', codigo: 'M-0', descripcion: 'Sin saldo' } },
    ], [{ id: 'm-sin-stock', descripcion: 'No debe aparecer' }]);
    expect(resultado.map(material => material.id)).toEqual(['m0']);
    expect(calcularStockMaterial(resultado[0]).estado).toBe('agotado');
  });
});
