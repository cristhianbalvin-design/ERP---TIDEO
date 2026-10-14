import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { calcularEncuadre, colorUtilizacion, crearLayout, mapearEscena } from '../src/zahory-mock/pages/planner/gemelo3d/sceneModel.js';
import { generarDatosEjemplo } from '../src/zahory-mock/pages/planner/gemelo3d/exampleData.js';
import { crearModeloMaquina, FAMILIAS_CONSTRUCTOR, resolverConstructor } from '../src/zahory-mock/pages/planner/gemelo3d/machineBuilders.js';
import { crearEscena, detectarTemaOscuro, observarTemaEscena } from '../src/zahory-mock/pages/planner/gemelo3d/scene.js';
import { GemeloView } from '../src/zahory-mock/pages/planner/gemelo3d/GemeloView.jsx';
import { construirModelo, resolverSeleccionTablero } from '../src/zahory-mock/pages/planner/PlannerPage.jsx';
import { PlannerVistas } from '../src/zahory-mock/pages/planner/PlannerShell.jsx';

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

  it('encuadra talleres pequeños y grandes con el centro de sus límites', () => {
    const small = crearLayout(datos.bahias, datos.puestos);
    const bays = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, activa: true }));
    const posts = bays.flatMap(bay => [0, 1, 2].map(slot => ({ id: `${bay.id}p${slot}`, bahia_id: bay.id, activo: true })));
    const large = crearLayout(bays, posts);
    const close = calcularEncuadre(small.limites, 1.6);
    const wide = calcularEncuadre(large.limites, 1.6);
    expect(close.distance).toBeGreaterThan(0);
    expect(wide.distance).toBeGreaterThan(close.distance);
    expect(wide.x).toBeCloseTo((large.limites.minX + large.limites.maxX) / 2);
    expect(wide.z).toBeCloseTo((large.limites.minZ + large.limites.maxZ) / 2);
  });

  it('genera ejemplos repetibles con ocupación verde, ámbar y roja', () => {
    const first = generarDatosEjemplo('2026-10-14');
    expect(generarDatosEjemplo('2026-10-14')).toEqual(first);
    expect(first.bahias).toHaveLength(10);
    expect(first.maquinas.length).toBeGreaterThanOrEqual(25);
    expect(first.personas.length).toBeGreaterThanOrEqual(12);
    const colors = new Set(mapearEscena(first, '2026-10-14').bahias.map(bay => colorUtilizacion(bay.utilizacion)));
    expect(colors).toEqual(new Set(['green', 'amber', 'red']));
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

  it('lleva al Tablero la OT real canónica que corresponde a la OT resumida de la escena 3D', () => {
    const otReal = { id: 'ot1', numero: 'OT-1', orden_servicio: { id: 'os1' }, ot_tareas: [{ id: 'tarea1' }] };
    const otEscena = { id: 'ot1', numero: 'OT-1' };
    const seleccionada = resolverSeleccionTablero(otEscena, [otReal]);
    expect(seleccionada).toBe(otReal);
    expect(seleccionada).toHaveProperty('orden_servicio.id', 'os1');

    const datosTablero = { ots: [seleccionada], personas: [], maquinas: [], asignaciones: [], equipos: [], puestos: [], bahias: [], ocupaciones: [] };
    let tablero;
    act(() => {
      tablero = create(createElement(PlannerVistas, {
        vista: 'tablero', datos: datosTablero, modelo: construirModelo(datosTablero),
        seleccion: { ot: seleccionada }, permiteEscritura: false,
      }));
    });
    expect(tablero.root.findAllByType('h2').some(nodo => nodo.children.join('').includes('Tablero de recursos'))).toBe(true);
    tablero.unmount();
    expect(resolverSeleccionTablero(otEscena, [])).toBeNull();
  });

  it('detecta tema oscuro en documentElement, body, contenedor, atributo y host del Shadow DOM', () => {
    const node = ({ darkClass = false, darkAttribute = false, parentDark = false, hostDark = false } = {}) => ({
      matches: selector => selector.includes('.dark') && darkClass,
      getAttribute: name => name === 'data-theme' && darkAttribute ? 'dark' : null,
      classList: { contains: name => name === 'dark' && darkClass },
      closest: () => parentDark ? { classList: { contains: name => name === 'dark' } } : null,
      getRootNode: () => ({ host: hostDark ? { getAttribute: () => 'dark' } : null }),
    });
    expect(detectarTemaOscuro(node({ darkClass: true }), {})).toBe(true);
    expect(detectarTemaOscuro(node(), { documentElement: node({ darkClass: true }) })).toBe(true);
    expect(detectarTemaOscuro(node(), { body: node({ darkClass: true }) })).toBe(true);
    expect(detectarTemaOscuro(node({ parentDark: true }), {})).toBe(true);
    expect(detectarTemaOscuro(node({ darkAttribute: true }), {})).toBe(true);
    expect(detectarTemaOscuro(node({ hostDark: true }), {})).toBe(true);
    expect(detectarTemaOscuro(node(), {})).toBe(false);
  });

  it('observa cambios de tema en el contenedor, documentElement y body', () => {
    const targets = [];
    class ObserverMock {
      constructor(callback) { this.callback = callback; }
      observe(target, options) { targets.push({ target, options }); }
      disconnect() { this.disconnected = true; }
    }
    const root = {};
    const html = {};
    const body = {};
    const stop = observarTemaEscena(root, () => {}, { documentElement: html, body }, ObserverMock);
    expect(targets.map(item => item.target)).toEqual([root, html, body]);
    expect(targets[1].options.attributeFilter).toEqual(['data-theme', 'class']);
    stop();
  });

  it('mantiene el realce del objeto elegido y restaura materiales al cerrar la selección', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/zahory-mock/pages/planner/gemelo3d/scene.js'), 'utf8');
    expect(source).toMatch(/setSelection\(selection\)[\s\S]*?selectedTargets\.forEach[\s\S]*?selectedTargets = \[\]/);
    expect(source).toMatch(/material\.emissive\.set\(tokens\['--dx-ui-cyan'\]\); material\.emissiveIntensity = \.55/);
    expect(source).toMatch(/if \(!selection\) \{ render\(\); return; \}/);
  });

  it('mantiene la leyenda y el HUD utilizables con detalle en cualquier ancho', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/zahory-mock/styles/zahory.css'), 'utf8');
    expect(css).toMatch(/\.dx-planner-3d-detail\s*\{[^}]*position:relative/);
    expect(css).toMatch(/\.dx-planner-3d-hud\s*\{[^}]*bottom:12px/);
    expect(css).toMatch(/\.dx-planner-3d-legend\s*\{[^}]*z-index:3/);
  });

  it('desactiva el salto desde las OTs de ejemplo y explica que no existen en el taller', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/zahory-mock/pages/planner/gemelo3d/GemeloView.jsx'), 'utf8');
    expect(source).toContain('disabled={ejemploActivo}');
    expect(source).toContain('Ejemplo: esta OT no existe en tu taller');
  });
});
