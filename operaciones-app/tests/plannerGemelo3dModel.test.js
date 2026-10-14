import { describe, expect, it } from 'vitest';
import { calcularDestinosPersonal, calcularDistanciaZoom, calcularParedDias, calcularVectorPaneo, crearDetalleSeleccion, etiquetaComponenteCliente, etiquetaEquipoCliente, etiquetaEstadoOT, etiquetaMaquina, limitarPaneo, mapearEscena, resolverIlustracionOT } from '../src/zahory-mock/pages/planner/gemelo3d/sceneModel.js';
import { generarDatosEjemplo } from '../src/zahory-mock/pages/planner/gemelo3d/exampleData.js';

describe('modelo extendido del Gemelo 3D', () => {
  it('calcula el paneo relativo a la cámara en cuatro direcciones y limita el encuadre', () => {
    expect(calcularVectorPaneo(0, 'arriba', 2)).toEqual({ x: 0, z: -2 });
    expect(calcularVectorPaneo(0, 'abajo', 2)).toEqual({ x: 0, z: 2 });
    expect(calcularVectorPaneo(0, 'derecha', 2)).toEqual({ x: 2, z: 0 });
    expect(calcularVectorPaneo(0, 'izquierda', 2)).toEqual({ x: -2, z: 0 });
    expect(calcularVectorPaneo(Math.PI / 2, 'arriba', 1).x).toBeCloseTo(-1);
    expect(limitarPaneo(1000, -1000, { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }))
      .toEqual({ x: 22, z: -44 });
  });

  it('limita el paso del zoom entre las distancias mínima y máxima', () => {
    expect(calcularDistanciaZoom(50, 8, 20, 80)).toBe(42);
    expect(calcularDistanciaZoom(21, 8, 20, 80)).toBe(20);
    expect(calcularDistanciaZoom(79, -8, 20, 80)).toBe(80);
  });

  it('calcula pared de diez días por capacidad disponible y umbrales aprobados', () => {
    const datos = { personas: [{ id: 't1' }, { id: 't2' }], asignaciones: [{ fecha: '2026-10-14', tecnico_id: 't1', horas_estimadas: 12 }] };
    expect(calcularParedDias(datos, ['2026-10-14', '2026-10-15'])).toEqual([
      { fecha: '2026-10-14', horas: 12, capacidad: 16, utilizacion: .75, color: 'amber' },
      { fecha: '2026-10-15', horas: 0, capacidad: 16, utilizacion: 0, color: 'green' },
    ]);
  });

  it('calcula los destinos entre bahía y zona de espera', () => {
    const bahias = [{ id: 'b1', puestos: [{ id: 'p1' }] }];
    const layout = { posicionesBahia: { b1: { x: 4, z: 7 } } };
    const destinos = calcularDestinosPersonal([{ id: 't1', asignaciones: [{ puesto_id: 'p1' }] }, { id: 't2', asignaciones: [] }], bahias, layout);
    expect(destinos[0]).toMatchObject({ x: 4, z: 7, espera: false });
    expect(destinos[1]).toMatchObject({ x: 0, z: 0, espera: true });
  });

  it('mapea OT sin tipo real a ilustración genérica y produce detalles por tipo', () => {
    const ot = { id: 'ot1', numero: 'OT-1', descripcion: 'Reparación', equipo_id: 'eq1' };
    expect(resolverIlustracionOT(ot)).toEqual({ equipo: 'generico', componente: 'generico', equipoGenerico: true, componenteGenerico: true });
    const scene = mapearEscena({ ots: [ot], personas: [], bahias: [], puestos: [], maquinas: [], asignaciones: [{ ot_id: 'ot1', fecha: '2026-10-14', estado: 'programado' }] }, '2026-10-14');
    expect(scene.equipoPorOt.ot1.equipoGenerico).toBe(true);
    expect(crearDetalleSeleccion('ot', ot, scene)).toMatchObject({ tipo: 'ot', equipo: 'Ilustración genérica', componente: 'Ilustración genérica' });
    expect(crearDetalleSeleccion('persona', { nombre: 'Ana', cargo: 'Mecánica', horas: 6 }, scene)).toMatchObject({ tipo: 'persona', cargo: 'Mecánica', horas: 6 });
    expect(crearDetalleSeleccion('maquina', { nombre: 'Torno', asignaciones: [] }, scene)).toMatchObject({ uso: 'Libre' });
  });

  it('traduce códigos del catálogo CAT7 y MCAT y oculta claves desconocidas', () => {
    const scene = mapearEscena({
      ots: [{ id: 'ot1', numero: 'OT-1', equipo_tipo: 'exc', componente_tipo: 'piston' }],
      personas: [], bahias: [], puestos: [], maquinas: [],
      asignaciones: [{ ot_id: 'ot1', fecha: '2026-10-14', estado: 'programado' }],
    }, '2026-10-14');
    expect(crearDetalleSeleccion('ot', scene.ots[0], scene)).toMatchObject({
      equipo: 'Excavadora', componente: 'Pistón',
    });
    expect(etiquetaEquipoCliente('interno')).toBe('Ilustración genérica');
    expect(etiquetaComponenteCliente('interno')).toBe('Ilustración genérica');
    expect(etiquetaMaquina('lathe')).toBe('Torno convencional');
    expect(etiquetaMaquina('futura')).toBe('Ilustración genérica');
    expect(etiquetaEstadoOT('en_proceso')).toBe('En proceso');
    expect(etiquetaEstadoOT('programado')).toBe('Programada');
    expect(etiquetaEstadoOT('interno')).toBe('Interno');
    expect(etiquetaEstadoOT('')).toBe('No informado');
  });

  it('usa el estado de la asignación al crear el detalle de OT', () => {
    const scene = mapearEscena({
      ots: [{ id: 'ot1', numero: 'OT-1' }], personas: [], bahias: [], puestos: [], maquinas: [],
      asignaciones: [{ ot_id: 'ot1', fecha: '2026-10-14', estado: 'programado' }],
    }, '2026-10-14');
    expect(crearDetalleSeleccion('ot', scene.ots[0], scene).estado).toBe('programado');
  });

  it('mantiene datos de ejemplo deterministas con ausencia y OT de varios tipos', () => {
    const first = generarDatosEjemplo('2026-10-14');
    expect(generarDatosEjemplo('2026-10-14')).toEqual(first);
    expect(first.ausencias.length).toBeGreaterThan(0);
    expect(new Set(first.ots.map(item => item.equipo_tipo).filter(Boolean)).size).toBeGreaterThan(3);
    expect(new Set(first.ots.map(item => item.componente_tipo).filter(Boolean)).size).toBeGreaterThan(3);
  });
});
