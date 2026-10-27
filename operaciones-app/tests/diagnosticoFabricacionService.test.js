import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => { throw new Error('sin red en pruebas'); } }));

import {
  TIPOS_CARACTERISTICA,
  faltantesPieza,
  mensajeErrorFabricacion,
  normalizarCaracteristica,
  normalizarPieza,
  resumenFabricacion,
  siguienteNumeroCaracteristica,
} from '../src/services/diagnosticoFabricacionService.js';

describe('diagnosticoFabricacionService · lógica', () => {
  it('ofrece los tipos de característica que acepta la base', () => {
    expect(TIPOS_CARACTERISTICA.map(item => item.id)).toEqual(expect.arrayContaining(['cota', 'rosca', 'acabado', 'tratamiento', 'material', 'otro']));
  });

  it('numera la siguiente característica después del mayor número', () => {
    expect(siguienteNumeroCaracteristica()).toBe(1);
    expect(siguienteNumeroCaracteristica([{ numero: 1 }, { numero: 4 }, { numero: '2' }])).toBe(5);
  });

  it('normaliza piezas y ordena sus características por número', () => {
    const pieza = normalizarPieza({ id: 'p1', cantidad: '3', caracteristicas: [
      { numero: '2', pos_x: '10.5', pos_y: '20', critica: 0 },
      { numero: '1', pos_x: '1', pos_y: '2', critica: 1 },
    ] });
    expect(pieza.cantidad).toBe(3);
    expect(pieza.material).toBeNull();
    expect(pieza.caracteristicas.map(item => item.numero)).toEqual([1, 2]);
    expect(pieza.caracteristicas[0].critica).toBe(true);
    expect(normalizarCaracteristica({ numero: '7', pos_x: '0', pos_y: '100', critica: null })).toMatchObject({ numero: 7, pos_x: 0, pos_y: 100, critica: false });
  });

  it('indica lo que falta para emitir, igual que la base', () => {
    expect(faltantesPieza({})).toEqual(['material', 'plano']);
    expect(faltantesPieza({ material_id: 'm1' })).toEqual(['plano']);
    expect(faltantesPieza({ material_id: 'm1', plano_origen: 'catalogo' })).toEqual([]);
  });

  it('resume piezas, unidades, características críticas e incompletas', () => {
    expect(resumenFabricacion([
      { cantidad: 2, material_id: 'm1', plano_origen: 'subido', caracteristicas: [{ critica: true }, { critica: false }] },
      { cantidad: 5, caracteristicas: [{ critica: true }] },
    ])).toEqual({ piezas: 2, unidades: 7, caracteristicas: 3, criticas: 2, incompletas: 1 });
  });

  it('traduce los errores de la base a mensajes claros', () => {
    expect(mensajeErrorFabricacion(new Error('El diagnóstico está emitido'))).toMatch(/emitido/);
    expect(mensajeErrorFabricacion({ message: 'duplicate key value violates unique constraint' })).toBe('Ya existe una característica con ese número en la pieza.');
    expect(mensajeErrorFabricacion({})).toBe('No se pudo completar la operación.');
  });
});

describe('textoTolerancia', () => {
  it('muestra la tolerancia con signo menos y más', async () => {
    const { textoTolerancia } = await import('../src/zahory-mock/pages/DiagnosticoFabricacionPasos.jsx');
    expect(textoTolerancia({ tolerancia_menos: '0.02', tolerancia_mas: '0.05' })).toBe('−0.02 / +0.05');
    expect(textoTolerancia({ tolerancia_menos: '-0.1', tolerancia_mas: null })).toBe('−0.1');
    expect(textoTolerancia({})).toBe('');
  });
});
