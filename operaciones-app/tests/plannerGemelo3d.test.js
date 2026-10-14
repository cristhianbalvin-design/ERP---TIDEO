import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { colorUtilizacion, crearLayout, mapearEscena } from '../src/zahory-mock/pages/planner/gemelo3d/sceneModel.js';
import { crearModeloMaquina, FAMILIAS_CONSTRUCTOR, resolverConstructor } from '../src/zahory-mock/pages/planner/gemelo3d/machineBuilders.js';
import { crearEscena } from '../src/zahory-mock/pages/planner/gemelo3d/scene.js';
import { GemeloView } from '../src/zahory-mock/pages/planner/gemelo3d/GemeloView.jsx';

const datos = {
  bahias: [{ id: 'b1', nombre: 'Mecánica', categoria: 'mec', activa: true }, { id: 'b2', nombre: 'Soldadura', activa: true }],
  puestos: [{ id: 'p1', bahia_id: 'b1', capacidad: 1, activo: true }],
  asignaciones: [{ id: 'a1', tecnico_id: 't1', puesto_id: 'p1', fecha: '2026-10-14', ot_id: 'ot1', horas_estimadas: 6, estado: 'programado' }],
  personas: [{ id: 't1', nombre: 'Técnica', cargo: 'Mecánica' }],
  maquinas: [{ id: 'm1', tipo_clave: 'lathe', puesto_id: 'p1', estado: 'disponible' }],
  tipos: [{ clave: 'lathe', nombre: 'Torno', base_3d: 'lathe' }],
  equipos: [], ots: [{ id: 'ot1', numero: 'OT-1' }],
};

describe('modelo del Gemelo 3D', () => {
  it('distribuye bahías en dos columnas y dispone los puestos bajo su bahía', () => {
    const layout = crearLayout(datos.bahias, datos.puestos);
    expect(layout.posicionesBahia.b1.x).not.toBe(layout.posicionesBahia.b2.x);
    expect(layout.posicionesPuesto.p1.z).toBe(layout.posicionesBahia.b1.z);
  });

  it('mapea la carga de la fecha, persona, OT y ubicación de máquina', () => {
    const scene = mapearEscena(datos, '2026-10-14');
    expect(scene.bahias[0]).toMatchObject({ horas: 6, capacidad: 8, utilizacion: .75 });
    expect(scene.bahias[0].ots[0].numero).toBe('OT-1');
    expect(scene.personas[0].horas).toBe(6);
    expect(scene.maquinas[0].bahia_id).toBe('b1');
  });

  it('aplica los umbrales aprobados de utilización', () => {
    expect(colorUtilizacion(.74)).toBe('green');
    expect(colorUtilizacion(.75)).toBe('amber');
    expect(colorUtilizacion(.9)).toBe('red');
  });

  it('resuelve todos los tipos del catálogo y conserva un modelo genérico desconocido', () => {
    const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261013140000_planner_taller_base.sql'), 'utf8');
    const catalog = [...migration.matchAll(/^\('([^']+)','[^']*','[^']+','([^']+)'/gm)];
    expect(catalog).toHaveLength(67);
    expect(FAMILIAS_CONSTRUCTOR).toHaveLength(22);
    for (const [, clave, base] of catalog) expect(resolverConstructor({ clave, base_3d: base })).not.toBe('generic');
    expect(resolverConstructor({ clave: 'nuevo', base_3d: 'desconocido' })).toBe('generic');
    class Group { constructor() { this.children = []; this.userData = {}; } add(child) { this.children.push(child); } }
    class Shape { constructor() { this.position = { set() {} }; } }
    const THREE = { Group, Mesh: Shape, BoxGeometry: Shape, CylinderGeometry: Shape, MeshStandardMaterial: Shape };
    expect(crearModeloMaquina(THREE, { base_3d: 'nuevo-futuro' }).userData.constructorMaquina).toBe('generic');
  });

  it('activa el mensaje de respaldo cuando WebGL no crea el renderer', () => {
    const onError = vi.fn();
    const THREE = { WebGLRenderer: class { constructor() { throw new Error('WebGL no disponible'); } } };
    expect(crearEscena(THREE, null, {}, {}, {}, { onError })).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('muestra el mensaje de respaldo en la vista si falla la inicialización de Three', async () => {
    let view;
    await act(async () => {
      view = create(createElement(GemeloView, { datos, importarThree: () => Promise.reject(new Error('WebGL no disponible')) }));
      await Promise.resolve();
    });
    expect(view.root.findByProps({ className: 'dx-planner-3d-fallback' }).children.join(''))
      .toBe('Tu navegador no pudo iniciar la vista 3D. El tablero muestra el mismo plan.');
    view.unmount();
  });
});
