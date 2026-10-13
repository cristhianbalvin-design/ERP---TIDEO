import { describe, expect, it } from 'vitest';
import { etiquetaEstadoLinea, tonoEstadoLinea, estadoAgregadoOT, etiquetaConteoLineas, etiquetaEstadoOT, validarCantidadReserva, validarLiberacion, textoUbicacionOrigen, mapearErrorReserva, puedeOperarLinea } from '../src/zahory-mock/pages/reservasRepuestosLogic.js';

describe('reservasRepuestosLogic', () => {
  it('etiqueta y tono traducen estados de reserva', () => {
    expect(etiquetaEstadoLinea('despachado_parcial')).toBe('Despachado parcial');
    expect(etiquetaEstadoLinea('reservado_parcial_solpe', { reservado: 0 })).toBe('Sin stock · SOLPE en curso');
    expect(etiquetaEstadoLinea('reservado_parcial_solpe', { reservado: 1 })).toBe('Reservado parcial + SOLPE');
    expect(etiquetaEstadoLinea('reservado_parcial_solpe')).toBe('Reservado parcial + SOLPE');
    expect(tonoEstadoLinea('reservado_parcial_solpe')).toBe('is-amber');
    expect(etiquetaEstadoLinea('liberado')).toBe('Liberado');
    expect(etiquetaEstadoLinea('despachado_liberado')).toBe('Despachado y liberado');
    expect(tonoEstadoLinea('despachado_liberado')).toBe('is-cyan');
  });
  it('OT reservada con pendiente cero no se etiqueta como reserva pendiente', () => {
    expect(estadoAgregadoOT({ lineas: [{ estado: 'reservado', cantidad_estimada: 2, reservado: 2, pendiente: 0 }] })).toEqual({ texto: 'Reservado', tono: 'is-green' });
  });
  it('agrega líneas completamente devueltas como despachadas y liberadas', () => {
    expect(estadoAgregadoOT({ lineas: [{ estado: 'despachado_liberado', pendiente: 0, despachado: 1, liberado: 1 }] })).toEqual({ texto: 'Despachado y liberado', tono: 'is-cyan' });
  });
  it('conteo pluraliza línea', () => { expect(etiquetaConteoLineas(1)).toBe('1 línea'); expect(etiquetaConteoLineas(2)).toBe('2 líneas'); });
  it('traduce estados operativos de OT', () => { expect(etiquetaEstadoOT('ejecucion')).toBe('Ejecución'); });
  it('valida cantidad positiva, límite, decimales y motivo', () => {
    expect(validarCantidadReserva(0, 2)).toBe('La cantidad debe ser mayor a cero.');
    expect(validarCantidadReserva(2.01, 2)).toContain('pendientes');
    expect(validarCantidadReserva(2.01, 2, 'despachados')).toBe('La cantidad no puede superar 2 despachados.');
    expect(validarCantidadReserva(1.234, 2)).toMatch(/2 decimales/);
    expect(validarCantidadReserva(1.25, 2)).toBe('');
    expect(validarLiberacion({ cantidad: 1, pendiente: 2, motivo: '' })).toMatch(/motivo/);
  });
  it('presenta ubicación con código y nombre', () => { expect(textoUbicacionOrigen({ almacen_codigo: 'ALM', almacen_nombre: 'Principal', ubicacion_codigo: 'A1', ubicacion_nombre: 'Pasillo 1' })).toBe('ALM · Principal · A1 · Pasillo 1'); });
  it('traduce errores del RPC', () => {
    expect(mapearErrorReserva({ code: '42501' })).toMatch(/permiso/);
    expect(mapearErrorReserva({ code: '23514' })).toMatch(/estado/);
    expect(mapearErrorReserva({ code: '40001' })).toMatch(/Actualiza la OT/);
  });
  it('permite acción solo con permiso RPC, estado operativo y cantidad pendiente', () => {
    const ot = { estado: 'programada' }, linea = { pendiente: 1 };
    expect(puedeOperarLinea({ despachar: true }, 'despachar', ot, linea)).toBe(true);
    expect(puedeOperarLinea({}, 'despachar', ot, linea)).toBe(false);
    expect(puedeOperarLinea({ liberar: true }, 'liberar', { estado: 'cerrada' }, linea)).toBe(false);
    expect(puedeOperarLinea({ liberar: true }, 'liberar', ot, { pendiente: 0 })).toBe(false);
    expect(puedeOperarLinea({ despachar: true }, 'revertir', ot, { despachado: 2 })).toBe(true);
    expect(puedeOperarLinea({ despachar: true }, 'revertir', ot, { estado: 'anulado', despachado: 2 })).toBe(true);
    expect(puedeOperarLinea({ despachar: true }, 'revertir', { estado: 'cerrada' }, { despachado: 2 })).toBe(false);
    expect(puedeOperarLinea({ despachar: true }, 'revertir', ot, { despachado: 0 })).toBe(false);
  });
});
