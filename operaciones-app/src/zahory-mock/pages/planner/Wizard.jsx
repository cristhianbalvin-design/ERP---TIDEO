import { useMemo, useState } from 'react';
import { calcularPronostico, esOtPlanificable, planificarTareas } from './plannerEngine.js';
import { puntuarPuestoAfin } from './plannerAffinity.js';
import { WizardResourceTasks } from './WizardResourceTasks.jsx';
import { WizardSummary } from './WizardSummary.jsx';

const formatDate = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

const emptyAssignment = () => ({ personaIds: [], maquinaIds: [], puestoId: '', horasPersona: 8, horasMaquina: 8 });

export function Wizard({ datos, recursos, initialOT, onClose, onInherit, onSave, busy }) {
  const [step, setStep] = useState(1);
  const [otId, setOtId] = useState(initialOT?.id || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assignments, setAssignments] = useState({});
  const [error, setError] = useState('');
  const ot = datos.ots.find(item => item.id === otId);
  const positions = useMemo(() => datos.puestos.map(position => ({
    ...position,
    bahia: datos.bahias.find(bay => bay.id === position.bahia_id),
  })), [datos]);
  const tasks = ot?.ot_tareas || [];
  const taskPlans = useMemo(() => planificarTareas(ot, assignments, {
    personas: datos.personas,
    maquinas: datos.maquinas,
    puestos: datos.puestos,
    asignaciones: datos.asignaciones,
    equipos: datos.equipos,
    ocupaciones: datos.ocupaciones,
  }, startDate), [ot, assignments, datos, startDate]);
  const forecast = ot ? calcularPronostico(ot, recursos, startDate) : null;
  const lastP50 = taskPlans.at(-1)?.p50.fechaFin || forecast?.p50.fechaFin;
  const lastConservative = taskPlans.at(-1)?.conservadora.fechaFin || forecast?.conservadora.fechaFin;
  const osCommitment = ot?.orden_servicio?.fecha_fin;

  function changeAssignment(taskId, patchValue) {
    setAssignments(current => ({
      ...current,
      [taskId]: { ...emptyAssignment(), ...current[taskId], ...patchValue },
    }));
  }

  function affinityPositions(task) {
    return [...positions].sort((left, right) => {
      const leftMatch = puntuarPuestoAfin(left, task, datos.familiasTrabajo);
      const rightMatch = puntuarPuestoAfin(right, task, datos.familiasTrabajo);
      return Number(rightMatch) - Number(leftMatch);
    });
  }

  async function nextStep() {
    setError('');
    if (step === 1 && !ot) {
      setError('Selecciona una OT para continuar.');
      return;
    }
    if (step === 1 && !tasks.length) {
      const confirmed = window.confirm(
        'Esta OT no tiene tareas. ¿Ejecutar la herencia de tareas desde su OS antes de continuar?',
      );
      if (!confirmed) return;
      try {
        await onInherit(ot.id);
      } catch (inheritError) {
        setError(inheritError.message);
      }
      return;
    }
    setStep(current => Math.min(4, current + 1));
  }

  function submit(event) {
    event.preventDefault();
    if (step < 4) {
      nextStep();
      return;
    }
    onSave({ ot, assignments, taskPlans, startDate });
  }

  return (
    <div className="dx-planner-scrim" role="presentation">
      <section
        className="dx-planner-modal dx-ui-card dx-planner-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-wizard-title"
      >
        <div className="dx-ui-toolbar">
          <div>
            <span className="dx-ui-eyebrow">Planificación · Paso {step} de 4</span>
            <h2 id="planner-wizard-title">Planificar una OT</h2>
          </div>
          <button className="dx-planner-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="dx-planner-wizard-grid">
          <form onSubmit={submit}>
            <nav className="dx-planner-steps" aria-label="Pasos de planificación">
              {['Orden', 'Tareas', 'Recursos', 'Confirmar'].map((label, index) => (
                <button
                  type="button"
                  className={step === index + 1 ? 'is-current' : ''}
                  key={label}
                  onClick={() => index + 1 < step && setStep(index + 1)}
                >
                  {index + 1}. {label}
                </button>
              ))}
            </nav>

            {step === 1 && (
              <div className="dx-planner-step">
                <h3>1. Elige la orden de trabajo</h3>
                <p>La planificación programa las tareas heredadas de la orden de servicio.</p>
                <label>
                  Orden de trabajo
                  <select required value={otId} onChange={event => setOtId(event.target.value)}>
                    <option value="">Selecciona OT</option>
                    {datos.ots.filter(esOtPlanificable).map(item => (
                      <option key={item.id} value={item.id}>
                        OT {item.numero || item.id} · {item.descripcion || item.servicio || 'Orden de trabajo'}
                      </option>
                    ))}
                  </select>
                </label>
                {ot && !tasks.length && (
                  <p className="dx-planner-note">Esta OT no tiene tareas heredadas. Puedes heredarlas desde su OS.</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="dx-planner-step">
                <h3>2. Revisa las tareas heredadas</h3>
                <p>La tarea es la unidad de asignación y programación.</p>
                {tasks.length ? (
                  <ul className="dx-planner-task-list">
                    {tasks.map(task => (
                      <li key={task.id}>
                        <span>
                          <b>{task.titulo || task.descripcion || 'Tarea'}</b>
                          <small>{task.familia_trabajo_id || 'Sin familia'} · {task.horas_reales || 0} h reales</small>
                        </span>
                        <b>{Number(task.horas_estimadas) || 0} h estimadas</b>
                      </li>
                    ))}
                  </ul>
                ) : <p>Sin tareas heredadas.</p>}
              </div>
            )}

            {step === 3 && (
              <div className="dx-planner-step">
                <h3>3. Asigna recursos por tarea</h3>
                <label>
                  Fecha de inicio
                  <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
                </label>
                <WizardResourceTasks
                  tasks={tasks}
                  assignments={assignments}
                  datos={datos}
                  positions={positions}
                  affinityPositions={affinityPositions}
                  changeAssignment={changeAssignment}
                />
              </div>
            )}

            {step === 4 && (
              <div className="dx-planner-step">
                <h3>4. Confirma el plan</h3>
                <p>Las asignaciones se guardan enlazadas a cada tarea y el puesto ocupa el rango
                  calculado.</p>
                <dl className="dx-planner-confirm">
                  <dt>OT</dt><dd>{ot?.numero || ot?.id}</dd>
                  <dt>Tareas</dt><dd>{taskPlans.length}</dd>
                  <dt>Fecha probable P50</dt><dd>{formatDate(lastP50)}</dd>
                  <dt>Conservadora</dt><dd>{formatDate(lastConservative)}</dd>
                  <dt>Compromiso OS</dt><dd>{formatDate(osCommitment)}</dd>
                  <dt>Efecto en compromiso</dt>
                  <dd>{lastConservative && osCommitment && lastConservative > osCommitment
                    ? `Riesgo: ${formatDate(lastConservative)} supera el compromiso`
                    : 'Dentro del compromiso estimado'}</dd>
                </dl>
              </div>
            )}
            {error && <p role="alert" className="dx-planner-inline-error">{error}</p>}
            <footer>
              <button
                type="button"
                className="dx-btn"
                onClick={() => step > 1 ? setStep(step - 1) : onClose()}
              >
                {step > 1 ? 'Atrás' : 'Cancelar'}
              </button>
              <button type="submit" className="dx-btn primary" disabled={busy}>
                {step < 4 ? 'Continuar' : busy ? 'Guardando…' : 'Confirmar planificación'}
              </button>
            </footer>
          </form>

          <WizardSummary
            ot={ot}
            forecast={forecast}
            taskPlans={taskPlans}
            lastP50={lastP50}
            lastConservative={lastConservative}
            commitment={osCommitment}
          />
        </div>
      </section>
    </div>
  );
}
