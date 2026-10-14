import { useMemo, useState } from 'react';
import { calcularPronostico, esOtPlanificable, planificarTareas } from './plannerEngine.js';
import { puntuarPuestoAfin } from './plannerAffinity.js';
import { WizardStepper } from './WizardStepper.jsx';
import { WizardSteps } from './WizardSteps.jsx';
import { WizardSide } from './WizardSide.jsx';

const PASOS = ['Elegir OT', 'Demanda heredada', 'Recursos', 'Impacto y confirmar'];
const hoy = () => new Date().toISOString().slice(0, 10);

export function Wizard({ datos, recursos, initialOT, onClose, onInherit, onSave, busy }) {
  const [step, setStep] = useState(1);
  const [otId, setOtId] = useState(initialOT?.id || '');
  const [startDate, setStartDate] = useState(hoy);
  const [assignments, setAssignments] = useState({});
  const [error, setError] = useState('');
  const ot = datos.ots.find(item => item.id === otId);
  const tareas = ot?.ot_tareas || [];
  const puestos = useMemo(() => datos.puestos.map(puesto => ({
    ...puesto,
    bahia: datos.bahias.find(bahia => bahia.id === puesto.bahia_id),
  })), [datos]);
  const plans = useMemo(() => planificarTareas(ot, assignments, {
    personas: datos.personas,
    maquinas: datos.maquinas,
    puestos: datos.puestos,
    asignaciones: datos.asignaciones,
    equipos: datos.equipos,
    ocupaciones: datos.ocupaciones,
  }, startDate), [ot, assignments, datos, startDate]);
  const forecast = ot ? calcularPronostico(ot, recursos, startDate) : null;
  const lastP50 = plans.at(-1)?.p50.fechaFin || forecast?.p50.fechaFin;
  const lastConservative = plans.at(-1)?.conservadora.fechaFin
    || forecast?.conservadora.fechaFin;
  const related = ot ? datos.ots.filter(item => item.id === ot.id
    || (ot.os_cliente_id && item.os_cliente_id === ot.os_cliente_id)) : [];
  const positionOptions = task => [...puestos].sort((a, b) => (
    Number(puntuarPuestoAfin(b, task, datos.familiasTrabajo))
      - Number(puntuarPuestoAfin(a, task, datos.familiasTrabajo))
  ));

  function updateAssignment(taskId, changes) {
    setAssignments(current => ({ ...current, [taskId]: { ...current[taskId], ...changes } }));
  }

  async function next() {
    setError('');
    if (step === 1 && !ot) return;
    if (step === 1 && !tareas.length) {
      try {
        const inherited = await onInherit(ot.id);
        if (!inherited) setError('No se pudieron heredar las tareas de la orden de servicio.');
      } catch (inheritError) {
        setError(inheritError.message || 'No se pudieron heredar las tareas de la orden de servicio.');
      }
      return;
    }
    setStep(current => Math.min(4, current + 1));
  }

  async function submit(event) {
    event.preventDefault();
    if (step < 4) return next();
    setError('');
    const saved = await onSave({ ot, assignments, taskPlans: plans, startDate });
    if (!saved) setError('No se guardó el plan. Revisa el aviso y vuelve a intentar.');
  }

  return (
    <section className="dx-planner-wizard dx-ui-card" aria-labelledby="planner-wizard-title">
      <header className="dx-planner-wizard-head">
        <div>
          <span className="dx-ui-eyebrow">Planificación del taller</span>
          <h2 id="planner-wizard-title">Planificar OT</h2>
        </div>
        <button className="dx-btn" type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </header>
      <WizardStepper steps={PASOS} current={step} />
      <form className="dx-planner-wizard-form" onSubmit={submit}>
        <div className="dx-planner-wizard-content-grid">
          <WizardSteps step={step} datos={datos} ot={ot} otId={otId} setOtId={setOtId}
            related={related} tareas={tareas} plans={plans} forecast={forecast}
            lastP50={lastP50} lastConservative={lastConservative} startDate={startDate}
            setStartDate={setStartDate} assignments={assignments}
            updateAssignment={updateAssignment} puestos={puestos}
            positionOptions={positionOptions} busy={busy} />
          <WizardSide ot={ot} plans={plans} forecast={forecast} p50={lastP50}
            conservative={lastConservative} />
        </div>
        {error && <p role="alert" className="dx-planner-inline-error">{error}</p>}
        <footer className="dx-planner-wizard-footer">
          <button className="dx-btn" type="button" disabled={busy}
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}>
            {step > 1 ? 'Atrás' : 'Cancelar'}
          </button>
          <span className="dx-planner-wizard-hint">
            Paso {step} de 4 · no se guarda nada hasta confirmar
          </span>
          <button className="dx-btn primary" type="submit"
            disabled={busy || (step === 1 && !ot)}>
            {step < 4 ? 'Siguiente' : busy ? 'Guardando…' : 'Confirmar plan'}
          </button>
        </footer>
      </form>
    </section>
  );
}
