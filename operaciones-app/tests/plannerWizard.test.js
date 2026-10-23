import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Wizard } from '../src/zahory-mock/pages/planner/Wizard.jsx';
import { WizardStepper } from '../src/zahory-mock/pages/planner/WizardStepper.jsx';
import { WizardSteps } from '../src/zahory-mock/pages/planner/WizardSteps.jsx';
import { WizardStepDemanda } from '../src/zahory-mock/pages/planner/WizardStepDemanda.jsx';
import { WizardResourceTasks } from '../src/zahory-mock/pages/planner/WizardResourceTasks.jsx';
import { WizardSide } from '../src/zahory-mock/pages/planner/WizardSide.jsx';
import { WizardSummary } from '../src/zahory-mock/pages/planner/WizardSummary.jsx';

const tarea = {
  id: 'T-1',
  titulo: 'Revisar bomba',
  horas_estimadas: 8,
  horas_reales: 2,
  familia_trabajo: { nombre: 'Mecánica' },
  actividad_id: 'ACT-1',
  actividad: { id: 'ACT-1', nombre: 'Inspección' },
  cargo: { id: 'CARGO-1', nombre: 'Técnico mecánico' },
};
const ot = {
  id: 'OT-1',
  numero: '1001',
  estado: 'abierta',
  os_cliente_id: 'OS-1',
  orden_servicio: { numero: 'OS-1', fecha_fin: '2026-11-20' },
  ot_tareas: [tarea],
};
const datos = {
  ots: [ot],
  bahias: [],
  puestos: [],
  maquinas: [],
  tipos: [],
  personas: [],
  asignaciones: [],
  equipos: [],
  ocupaciones: [],
  familiasTrabajo: [],
};
const recursos = { personas: 1, maquinas: 1, horasMaquinaDia: 8 };

function wizard(props = {}) {
  return createElement(Wizard, {
    datos,
    recursos,
    initialOT: null,
    busy: false,
    onClose: vi.fn(),
    onInherit: vi.fn().mockResolvedValue(true),
    onSave: vi.fn().mockResolvedValue(true),
    ...props,
  });
}

describe('vista del asistente de planificación', () => {
  it('muestra cuatro pasos y marca el paso actual', () => {
    const html = renderToStaticMarkup(createElement(WizardStepper, {
      steps: ['Elegir OT', 'Demanda heredada', 'Recursos', 'Impacto y confirmar'],
      current: 3,
    }));
    expect((html.match(/<li/g) || []).length).toBe(4);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('class="is-done"');
    expect(html).toContain('class="is-pending"');
    expect(html).toContain('Demanda heredada');
  });

  it('conserva máquinas válidas al cambiar puesto y avisa las descartadas', () => {
    const puestos = [
      { id: 'P-A', bahia_id: 'B-A', nombre: 'Puesto A' },
      { id: 'P-B', bahia_id: 'B-B', nombre: 'Puesto B' },
    ];
    const maquinaDatos = {
      ...datos,
      puestos,
      bahias: [{ id: 'B-A', nombre: 'Bahía A' }, { id: 'B-B', nombre: 'Bahía B' }],
      maquinas: [
        { id: 'M-A', nombre: 'Máquina A', estado: 'disponible', bahia_id: 'B-A' },
        { id: 'M-B', nombre: 'Máquina B', estado: 'disponible', bahia_id: 'B-B' },
      ],
    };
    const changeAssignment = vi.fn();
    const assignment = { puestoId: 'P-B', maquinaIds: ['M-A', 'M-B'] };
    let renderer;
    act(() => { renderer = create(createElement(WizardResourceTasks, {
      tasks: [tarea], assignments: { [tarea.id]: assignment }, datos: maquinaDatos,
      positions: puestos, affinityPositions: () => puestos, changeAssignment, disabled: false,
    })); });
    const puesto = renderer.root.findAllByType('select')[2];
    act(() => puesto.props.onChange({ target: { value: 'P-A' } }));
    expect(changeAssignment).toHaveBeenCalledWith('T-1', {
      puestoId: 'P-A', maquinaIds: ['M-A'],
    });
    expect(renderer.root.findByProps({ role: 'status' }).children.join(''))
      .toContain('Se quitaron máquinas');
    renderer.unmount();
  });

  it('usa estado neutro sin compromiso en impacto y resumen', () => {
    const otSinCompromiso = { ...ot, orden_servicio: {} };
    const side = renderToStaticMarkup(createElement(WizardSide, {
      ot: otSinCompromiso, plans: [], forecast: null, p50: null, conservative: null,
    }));
    expect(side).toContain('is-neutral');
    expect(side).toContain('Sin fecha de compromiso');
    expect(side).not.toContain('Dentro del compromiso');

    const summary = renderToStaticMarkup(createElement(WizardSummary, {
      ot: otSinCompromiso, forecast: null, taskPlans: [], lastP50: null,
      lastConservative: null, startDate: '2026-10-14',
    }));
    expect(summary).toContain('is-neutral');
    expect(summary).toContain('Sin fecha de compromiso');
    expect(summary).not.toContain('A tiempo estimado');
  });

  it('deshabilita Siguiente si no se eligió una OT', () => {
    const html = renderToStaticMarkup(wizard());
    expect(html).toContain('disabled=""');
    expect(html).toContain('Siguiente');
  });

  it('solo guarda al llegar al último paso y confirmar', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    let renderer;
    await act(async () => { renderer = create(wizard({ onSave })); });
    const radio = renderer.root.findByProps({ role: 'radio' });
    await act(async () => radio.props.onClick());
    for (let current = 0; current < 3; current += 1) {
      await act(async () => renderer.root.findByType('form').props.onSubmit({
        preventDefault: vi.fn(),
      }));
    }
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => renderer.root.findByType('form').props.onSubmit({
      preventDefault: vi.fn(),
    }));
    expect(onSave).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });

  it('mantiene la vista y el error visible cuando falla el guardado', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    let renderer;
    await act(async () => { renderer = create(wizard({ initialOT: ot, onSave })); });
    for (let current = 0; current < 3; current += 1) {
      await act(async () => renderer.root.findByType('form').props.onSubmit({
        preventDefault: vi.fn(),
      }));
    }
    await act(async () => renderer.root.findByType('form').props.onSubmit({
      preventDefault: vi.fn(),
    }));
    expect(renderer.root.findByProps({ role: 'alert' }).children.join(''))
      .toContain('No se guardó el plan');
    expect(renderer.root.findByProps({ 'aria-labelledby': 'planner-wizard-title' })).toBeTruthy();
    renderer.unmount();
  });

  it('muestra el árbol heredado de trabajo, actividad, tarea y horas', () => {
    const html = renderToStaticMarkup(createElement(WizardSteps, {
      step: 2,
      datos,
      ot,
      otId: ot.id,
      setOtId: vi.fn(),
      related: [ot],
      tareas: ot.ot_tareas,
      plans: [],
      forecast: null,
      lastP50: null,
      lastConservative: null,
      startDate: '2026-10-14',
      setStartDate: vi.fn(),
      assignments: {},
      updateAssignment: vi.fn(),
      puestos: [],
      positionOptions: () => [],
      busy: false,
    }));
    expect(html).toContain('Mecánica');
    expect(html).toContain('Inspección');
    expect(html).toContain('Técnico mecánico');
    expect(html).not.toContain('ACT-1');
    expect(html).toContain('Revisar bomba');
    expect(html).toContain('8 h estimadas');
    expect(html).toContain('2 h reales');
  });

  it('usa nombres resueltos y fallbacks neutros sin mostrar identificadores', () => {
    const ids = ['FAM-PRIVATE', 'ACT-PRIVATE', 'CARGO-PRIVATE'];
    const html = renderToStaticMarkup(createElement(WizardStepDemanda, {
      ot: {},
      tareas: [{
        id: 'T-PRIVATE',
        familia_trabajo_id: ids[0],
        actividad_id: ids[1],
        cargo_id: ids[2],
        titulo: 'Tarea',
      }],
    }));
    expect(html).toContain('Sin trabajo definido');
    expect(html).toContain('Sin actividad definida');
    expect(html).toContain('Cargo sin definir');
    ids.forEach(id => expect(html).not.toContain(id));
  });

  it('deshabilita los controles en modo de solo lectura', () => {
    const html = renderToStaticMarkup(wizard({ initialOT: ot, busy: true }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('Cancelar');
  });
});
