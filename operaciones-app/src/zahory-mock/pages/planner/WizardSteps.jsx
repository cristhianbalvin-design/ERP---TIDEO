import { esOtPlanificable } from './plannerEngine.js';
import { WizardResourceTasks } from './WizardResourceTasks.jsx';
import { WizardSummary } from './WizardSummary.jsx';
import { WizardStepDemanda } from './WizardStepDemanda.jsx';

const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

export function WizardSteps({ step, datos, ot, otId, setOtId, related, tareas, plans,
  forecast, lastP50, lastConservative, startDate, setStartDate, assignments,
  updateAssignment, puestos, positionOptions, busy }) {
  if (step === 1) {
    const ordenes = datos.ots.filter(esOtPlanificable);
    return <section className="dx-planner-step">
      <h2>¿Qué orden vas a planificar?</h2>
      <p className="dx-planner-lead">Elige una OT nacida de una orden de servicio. Las horas
        provienen del diagnóstico.</p>
      <div className="dx-planner-picks" role="radiogroup" aria-label="OT por planificar">
        <span className="dx-planner-pick-label">Por planificar ({ordenes.length})</span>
        {ordenes.map(item => <button type="button" role="radio" key={item.id}
          aria-checked={otId === item.id} className={`dx-planner-pick${otId === item.id
            ? ' is-selected' : ''}`} disabled={busy} onClick={() => setOtId(item.id)}>
          <span className="dx-planner-radio" aria-hidden="true" />
          <span className="dx-planner-pick-copy">
            <b>OT {item.numero || item.id} · {item.equipo?.nombre || item.equipo_nombre
              || 'Equipo no informado'}</b>
            <small>{item.servicio || item.descripcion || 'Trabajo no informado'} · OS
              {' '}{item.orden_servicio?.numero || item.os_cliente_id || 'sin OS'}
              {cliente(item) ? ` · ${cliente(item)}` : ''}</small>
          </span>
          <span className="dx-ui-pill is-amber">Compromiso
            {' '}{fecha(item.orden_servicio?.fecha_fin)}</span>
        </button>)}
      </div>
      {ot && <article className="dx-planner-box">
        <h3>Contexto de la orden de servicio</h3>
        <p>OS <b>{ot.orden_servicio?.numero || ot.os_cliente_id || 'Sin OS'}</b>
          {' '}de <b>{cliente(ot) || 'cliente no informado'}</b> tiene
          {' '}{related.length} OT relacionadas y un compromiso de
          {' '}<b>{fecha(ot.orden_servicio?.fecha_fin)}</b>. Cada OT conserva sus tareas y
          partes diarios.</p>
        <ul>{related.map(item => <li key={item.id}>OT {item.numero || item.id} ·
          {' '}{item.equipo?.nombre || item.equipo_nombre || 'Equipo no informado'}
          {item.id === ot.id ? ' · Esta OT' : ''}</li>)}</ul>
      </article>}
    </section>;
  }
  if (step === 2) return <WizardStepDemanda ot={ot} tareas={tareas} />;
  if (step === 3) return <section className="dx-planner-step">
    <h2>Asigna personas, máquinas y puesto</h2>
    <p className="dx-planner-lead">La propuesta se recalcula con tus cambios. El puesto
      cubre el tiempo desde que el equipo ingresa hasta que termina la OT.</p>
    <article className="dx-planner-resource-card">
      <h3>Equipo: {ot.equipo?.nombre || ot.equipo_nombre || 'Equipo no informado'}</h3>
      <div className="dx-planner-fields">
        <label>Puesto<select disabled={busy} value={assignments.__puestoOt || ''}
          onChange={event => updateAssignment('__puestoOt', { value: event.target.value })}>
          <option value="">Sugerencia automática</option>
          {puestos.map(puesto => <option key={puesto.id} value={puesto.id}>
            {puesto.bahia?.nombre || 'Bahía'} · {puesto.nombre || puesto.codigo}
          </option>)}
        </select></label>
        <label>Ingresa al taller<input type="date" disabled={busy} value={startDate}
          onChange={event => setStartDate(event.target.value)} /></label>
      </div>
    </article>
    <WizardResourceTasks tasks={tareas} assignments={assignments} datos={datos}
      positions={datos.puestos} affinityPositions={positionOptions}
      changeAssignment={updateAssignment} disabled={busy} />
  </section>;
  return <WizardSummary ot={ot} forecast={forecast} taskPlans={plans}
    lastP50={lastP50} lastConservative={lastConservative} startDate={startDate} />;
}

function cliente(item) {
  return item.cliente?.nombre || item.cliente || item.orden_servicio?.cliente?.nombre
    || item.orden_servicio?.cliente || item.orden_servicio?.cuenta?.nombre || '';
}
