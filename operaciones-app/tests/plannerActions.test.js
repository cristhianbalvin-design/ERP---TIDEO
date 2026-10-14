import { act, create } from 'react-test-renderer';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlannerPage } from '../src/zahory-mock/pages/planner/PlannerPage.jsx';
import { PlannerHeader } from '../src/zahory-mock/pages/planner/PlannerShell.jsx';
import { Configurator } from '../src/zahory-mock/pages/planner/Configurator.jsx';
import { usePlannerActions } from '../src/zahory-mock/pages/planner/usePlannerActions.js';
import { sincronizarOcupacionesOT } from '../src/services/plannerService.js';

vi.mock('../src/services/plannerService.js', async importOriginal => ({
  ...await importOriginal(),
  sincronizarOcupacionesOT: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({
  useSesionOperativa: () => ({
    empresaId: 'E-1',
    sociedadId: null,
    permiteEscritura: false,
    vistaConsolidada: true,
    cargando: true,
  }),
}));

describe('Planner en vista consolidada', () => {
  it('muestra el aviso y deshabilita las acciones para escribir', () => {
    const pagina = renderToStaticMarkup(createElement(PlannerPage));
    expect(pagina).toContain(
      'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
    );
    expect(pagina).toContain('role="status"');
    const cabecera = renderToStaticMarkup(createElement(PlannerHeader, {
      vista: 'panel',
      permiteEscritura: false,
      onChangeVista: vi.fn(),
      onSimulate: vi.fn(),
      onPlanificar: vi.fn(),
    }));
    expect(cabecera.match(/disabled=""/g).length).toBeGreaterThanOrEqual(3);
    const configurador = renderToStaticMarkup(createElement(Configurator, {
      datos: { bahias: [], puestos: [], maquinas: [], tipos: [] },
      permiteEscritura: false,
      busy: false,
      onSave: vi.fn(),
    }));
    expect(configurador).toContain('<input required="" disabled=""');
    expect(configurador).toContain('<select disabled=""');
    expect(configurador).toContain('disabled=""');
  });

  it('bloquea GRUPO y deja visible el aviso al guardar desde el asistente', async () => {
    const setters = Object.fromEntries([
      'setGuardando', 'setError', 'setAviso', 'setUndo', 'setWizard', 'setVista',
      'setSeleccion', 'setSimulacion',
    ].map(nombre => [nombre, vi.fn()]));
    const captura = {};
    function PruebaHook() {
      captura.acciones = usePlannerActions({
        sesion: { empresaId: 'E-1', sociedadId: null, permiteEscritura: false },
        datos: { ots: [] },
        ots: [],
        recursos: {},
        undo: null,
        seleccion: {},
        simulacion: null,
        cargar: vi.fn().mockResolvedValue(undefined),
        ...setters,
      });
      return null;
    }
    let renderer;
    await act(async () => {
      renderer = create(createElement(PruebaHook));
    });
    await act(async () => {
      await expect(captura.acciones.guardarConfig('puesto', {})).resolves.toBe(false);
    });
    expect(setters.setError).toHaveBeenLastCalledWith(
      'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
    );
    await act(async () => {
      await expect(captura.acciones.guardarWizard({ ot: { id: 'OT-1' }, taskPlans: [] }))
        .resolves.toBe(false);
    });
    expect(setters.setError).toHaveBeenLastCalledWith(
      'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
    );
    renderer.unmount();
  });
});

describe('resultado de acciones del Planner', () => {
  function montarHook({ ots = [], simulacion = null } = {}) {
    const captura = {};
    function PruebaHook() {
      const [wizard, setWizard] = useState({ ot: { id: 'OT-1' } });
      const [vista, setVista] = useState('tablero');
      const [seleccion, setSeleccion] = useState({});
      const [simActual, setSimulacion] = useState(simulacion);
      const setError = vi.fn();
      captura.acciones = usePlannerActions({
        sesion: { empresaId: 'E-1', sociedadId: 'S-1', permiteEscritura: true },
        datos: { ots, asignaciones: [], equipos: [] },
        ots,
        recursos: { personas: 1, maquinas: 1 },
        undo: null,
        seleccion: {},
        simulacion: simActual,
        cargar: vi.fn().mockResolvedValue(undefined),
        setGuardando: vi.fn(),
        setError,
        setAviso: vi.fn(),
        setUndo: vi.fn(),
        setWizard,
        setVista,
        setSeleccion,
        setSimulacion,
      });
      captura.estado = { wizard, vista, seleccion, simulacion: simActual };
      captura.setError = setError;
      return createElement('span', null, wizard ? 'Wizard abierto' : 'Wizard cerrado');
    }
    let renderer;
    act(() => { renderer = create(createElement(PruebaHook)); });
    return { captura, renderer };
  }

  const taskPlans = [{
    horasPendientes: 1,
    tarea: { id: 'T-1', titulo: 'Trabajo' },
    assignment: { personaIds: ['P-1'], maquinaIds: [] },
    p50: { fechas: [] },
  }];

  it('mantiene abierto el asistente si guardarWizard falla y lo cierra si tiene éxito', async () => {
    const { captura, renderer } = montarHook();
    sincronizarOcupacionesOT.mockRejectedValueOnce(new Error('falló el guardado'));
    await act(async () => {
      await expect(captura.acciones.guardarWizard({
        ot: { id: 'OT-1' }, taskPlans,
      })).resolves.toBe(false);
    });
    expect(renderer.root.findByType('span').children).toEqual(['Wizard abierto']);
    expect(captura.setError).toHaveBeenLastCalledWith('falló el guardado');

    sincronizarOcupacionesOT.mockResolvedValue(undefined);
    await act(async () => {
      await expect(captura.acciones.guardarWizard({
        ot: { id: 'OT-1' }, taskPlans,
      })).resolves.toBe(true);
    });
    expect(renderer.root.findByType('span').children).toEqual(['Wizard cerrado']);
    expect(captura.estado.vista).toBe('panel');
    renderer.unmount();
  });

  it('conserva la vista y simulación si falla aplicarSimulacion; avanza si tiene éxito', async () => {
    const simulacion = {
      urgente: { id: 'OT-1' },
      resultado: { esperaDias: 2 },
    };
    const { captura } = montarHook({ ots: [{ id: 'OT-1' }], simulacion });
    sincronizarOcupacionesOT.mockRejectedValueOnce(new Error('falló la aplicación'));
    await act(async () => {
      await expect(captura.acciones.aplicarSimulacion()).resolves.toBe(false);
    });
    expect(captura.estado.vista).toBe('tablero');
    expect(captura.estado.simulacion).toEqual(simulacion);
    expect(captura.setError).toHaveBeenLastCalledWith('falló la aplicación');

    sincronizarOcupacionesOT.mockResolvedValue(undefined);
    await act(async () => {
      await expect(captura.acciones.aplicarSimulacion()).resolves.toBe(true);
    });
    expect(captura.estado.vista).toBe('panel');
    expect(captura.estado.simulacion).toBe(null);
  });
});

describe('categoría de bahía', () => {
  it('conserva la categoría elegida en el submit de nueva bahía', async () => {
    const onSave = vi.fn();
    const datos = { bahias: [], puestos: [], maquinas: [], tipos: [] };
    let renderer;
    await act(async () => {
      renderer = create(createElement(Configurator, {
        datos,
        permiteEscritura: true,
        busy: false,
        onSave,
      }));
    });
    const categoria = renderer.root.findAllByType('select')[0];
    await act(async () => categoria.props.onChange({ target: { value: 'mec' } }));
    const formularioBahia = renderer.root.findAllByType('form')[0];
    await act(async () => formularioBahia.props.onSubmit({ preventDefault: vi.fn() }));
    expect(onSave).toHaveBeenCalledWith('bahia', {
      codigo: '',
      nombre: '',
      categoria: 'mec',
      orden: 0,
    });
    renderer.unmount();
  });
});
