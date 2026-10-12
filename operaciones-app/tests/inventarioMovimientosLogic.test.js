import { describe, expect, it } from 'vitest';
import { advertenciaDestinoTransferencia, calcularDiferenciaAjuste, etiquetaMotivoMovimiento, listarDestinosTransferencia, mapearErrorMovimiento, motivoNoAnulable, movimientoAnulable, MOTIVOS_MOVIMIENTO, validarMovimiento, validarTransferencia } from '../src/zahory-mock/pages/inventarioMovimientosLogic.js';

const material = { id: 'm1', tipo_control: 'lote', unidad: 'und' };
const fila = { id: 's1', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u1', lote: 'L-1', fisico: 8, disponible: 7, reservado: 1, sociedad_id: 'soc1', ubicaciones: { uso: 'almacenaje' } };

describe('inventarioMovimientosLogic', () => {
  it('expone motivos del servidor por acción y calcula diferencia de conteo', () => {
    expect(Object.keys(MOTIVOS_MOVIMIENTO.entrada)).toEqual(['saldo_inicial', 'ajuste_positivo', 'devolucion_ot', 'compra_directa_sin_oc']);
    expect(calcularDiferenciaAjuste('4', 8)).toBe(-4);
  });

  it('muestra etiquetas conocidas y un respaldo legible para motivos de lectura', () => {
    expect(etiquetaMotivoMovimiento('ajuste_positivo')).toBe('Ajuste positivo');
    expect(etiquetaMotivoMovimiento('recepcion_oc')).toBe('Recepción de OC');
    expect(etiquetaMotivoMovimiento('despacho_taller')).toBe('Despacho a taller');
    expect(etiquetaMotivoMovimiento('motivo_desconocido')).toBe('Motivo desconocido');
  });

  it('valida costo, documento y control de lote para entradas', () => {
    const base = { accion: 'entrada', motivo: 'compra_directa_sin_oc', almacen_id: 'a1', ubicacion_id: 'u1', cantidad: '2', moneda: 'PEN' };
    expect(validarMovimiento(base, { material, ubicacion: { uso: 'almacenaje' } })).toMatchObject({ lote: expect.any(String), costo_unitario: expect.any(String), nro_documento: expect.any(String) });
    expect(validarMovimiento({ ...base, lote: 'L-2', costo_unitario: '3.5', nro_documento: 'F-1' }, { material, ubicacion: { uso: 'almacenaje' } })).toEqual({});
  });

  it('valida salida contra disponible y exige observación', () => {
    const base = { accion: 'salida', motivo: 'merma', almacen_id: 'a1', ubicacion_id: 'u1', stock_id: 's1', cantidad: '7', lote: 'L-1' };
    expect(validarMovimiento(base, { material, stock: [fila] })).toMatchObject({ observacion: expect.any(String) });
    expect(validarMovimiento({ ...base, cantidad: '7.1', observacion: 'Rotura' }, { material, stock: [fila] }).cantidad).toContain('Solo hay 7');
  });

  it('valida conteo físico, reservas, observación y uso de ubicación', () => {
    const base = { accion: 'ajuste', motivo: 'ajuste_conteo', almacen_id: 'a1', ubicacion_id: 'u1', stock_id: 's1', conteo: '0', observacion: 'Conteo físico' };
    expect(validarMovimiento(base, { material, stock: [fila] }).conteo).toContain('reservados');
    expect(validarMovimiento({ ...base, conteo: '8' }, { material, stock: [fila] }).conteo).toContain('Sin diferencia');
    expect(validarMovimiento({ ...base, conteo: '5' }, { material, stock: [{ ...fila, ubicaciones: { uso: 'cuarentena' } }] }).motivo).toBeUndefined();
    expect(validarMovimiento({ ...base, motivo: 'ajuste_manual', conteo: '5' }, { material, stock: [{ ...fila, ubicaciones: { uso: 'cuarentena' } }] }).motivo).toContain('Ajuste por conteo');
  });

  it('decide elegibilidad de anulación y explica el bloqueo', () => {
    expect(movimientoAnulable({ motivo: 'saldo_inicial', referencia_tipo: 'manual' })).toBe(true);
    expect(movimientoAnulable({ motivo: 'saldo_inicial', referencia_tipo: 'saldo_inicial' })).toBe(true);
    expect(movimientoAnulable({ motivo: 'ajuste_conteo', referencia_tipo: 'conteo_fisico' })).toBe(true);
    expect(movimientoAnulable({ motivo: 'devolucion_proveedor', referencia_tipo: 'manual' })).toBe(true);
    expect(movimientoAnulable({ motivo: 'devolucion_proveedor', referencia_tipo: 'devolucion_proveedor' })).toBe(false);
    expect(movimientoAnulable({ motivo: 'devolucion_proveedor', referencia_tipo: 'recepcion_oc' })).toBe(false);
    expect(motivoNoAnulable({ motivo: 'recepcion_oc', referencia_tipo: 'recepcion_oc' })).toContain('Recepciones');
    expect(motivoNoAnulable({ motivo: 'consumo_ot', referencia_tipo: 'ot' })).toContain('OT');
    expect(movimientoAnulable({ motivo: 'despacho_taller', referencia_tipo: 'ot' })).toBe(false);
    expect(motivoNoAnulable({ motivo: 'despacho_taller', referencia_tipo: 'ot' })).toContain('se corrige desde la OT');
    expect(motivoNoAnulable({ motivo: 'transferencia_entrada', referencia_tipo: 'transferencia' })).toContain('transferencia');
    expect(motivoNoAnulable({ motivo: 'anulacion', referencia_tipo: 'anulacion' })).toContain('no se puede anular');
    expect(motivoNoAnulable({ motivo: 'saldo_inicial' }, false)).toContain('Tu rol');
    expect(motivoNoAnulable({ motivo: 'ajuste_manual', anulado: true })).toContain('ya fue anulado');
  });

  it('muestra los mensajes de negocio del servidor sin texto técnico', () => {
    expect(mapearErrorMovimiento(new Error('El stock disponible es insuficiente.'))).toBe('El stock disponible es insuficiente.');
    expect(mapearErrorMovimiento(new Error('SOCIEDAD_OBLIGATORIA'))).toContain('Selecciona una sociedad');
  });

  it('valida transferencias con coma decimal, disponible, destinos y serie', () => {
    const origen = { ...fila, disponible: 7 };
    const forma = { cantidad: '2,5', almacen_destino_id: 'a1', ubicacion_destino_id: 'u2' };
    expect(validarTransferencia(forma, { material, stockOrigen: origen, ubicacionDestino: { id: 'u2', almacen_id: 'a1', uso: 'almacenaje' } })).toEqual({});
    expect(validarTransferencia({ ...forma, cantidad: '7,1' }, { material, stockOrigen: origen, ubicacionDestino: { id: 'u2' } }).cantidad).toContain('1 reservados');
    expect(validarTransferencia({ ...forma, cantidad: '0' }, { material, stockOrigen: origen, ubicacionDestino: { id: 'u2' } }).cantidad).toContain('mayor a cero');
    expect(validarTransferencia({ cantidad: '2', almacen_destino_id: 'a1', ubicacion_destino_id: 'u1' }, { material: { ...material, tipo_control: 'serie' }, stockOrigen: origen, ubicacionDestino: { id: 'u1' } }).cantidad).toContain('cantidad debe ser 1');
    expect(validarTransferencia({ cantidad: '1', almacen_destino_id: 'a1', ubicacion_destino_id: 'u1' }, { material, stockOrigen: origen, ubicacionDestino: { id: 'u1', almacen_id: 'a1' } }).ubicacion_destino_id).toContain('distinto');
    expect(validarTransferencia({ cantidad: '1' }, { material, stockOrigen: origen })).toMatchObject({ almacen_destino_id: expect.any(String), ubicacion_destino_id: expect.any(String) });
  });

  it('bloquea transferir desde cuarentena o merma y advierte sin bloquear hacia ellas', () => {
    const origen = { ...fila, ubicaciones: { uso: 'cuarentena' } };
    const errores = validarTransferencia({ cantidad: '1', almacen_destino_id: 'a1', ubicacion_destino_id: 'u2' }, { material, stockOrigen: origen, ubicacionDestino: { id: 'u2', almacen_id: 'a1', uso: 'merma' } });
    expect(errores.stock_origen_id).toContain('Liberar');
    expect(errores.ubicacion_destino_id).toBeUndefined();
    expect(advertenciaDestinoTransferencia({ uso: 'merma' })).toContain('no queda disponible');
    expect(advertenciaDestinoTransferencia({ uso: 'almacenaje' })).toBe('');
  });

  it('lista ubicaciones activas excluyendo la ubicación de origen', () => {
    const ubicaciones = [{ id: 'u1', almacen_id: 'a1' }, { id: 'u2', almacen_id: 'a1', activo: false }, { id: 'u3', almacen_id: 'a2' }];
    expect(listarDestinosTransferencia(ubicaciones, { almacen_id: 'a1', ubicacion_id: 'u1' }).map(item => item.id)).toEqual(['u3']);
  });
});
