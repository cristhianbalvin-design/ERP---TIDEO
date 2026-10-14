const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

export function WizardSummary({ ot, forecast, taskPlans, lastP50, lastConservative, startDate }) {
  const commitment = ot.orden_servicio?.fecha_fin;
  const late = Boolean(lastConservative && commitment && lastConservative > commitment);
  const unassigned = taskPlans.filter(plan => plan.horasPendientes > 0
    && !plan.assignment.personaIds?.length && !plan.assignment.maquinaIds?.length);
  const noCapacity = taskPlans.filter(plan => plan.horasPendientes > 0
    && plan.p50.horasPendientes > 0);
  const checks = [
    [!unassigned.length, unassigned.length
      ? `${unassigned.length} tareas pendientes no tienen persona ni máquina.`
      : 'Todas las tareas pendientes tienen recursos asignados.'],
    [!noCapacity.length, noCapacity.length
      ? `${noCapacity.length} tareas no caben en el horizonte calculado.`
      : 'Las tareas caben en el horizonte calculado.'],
    [!late, late ? 'La entrega conservadora supera el compromiso.'
      : 'La entrega conservadora no supera el compromiso informado.'],
  ];
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(`${startDate}T12:00:00`);
    day.setDate(day.getDate() + index);
    return day.toISOString().slice(0, 10);
  });
  return <section className="dx-planner-step">
    <h2>Así queda el plan</h2>
    <p className="dx-planner-lead">Revisa fechas e impacto antes de confirmar. El plan se
      guarda solo cuando confirmes.</p>
    <article className="dx-planner-box">
      <h3>Entrega de OT {ot.numero || ot.id}</h3>
      <div className="dx-planner-pills">
        <span className={`dx-planner-status ${late ? 'is-risk' : 'is-safe'}`}>
          {late ? 'Riesgo de atraso' : 'A tiempo estimado'}</span>
        <span className="dx-ui-pill">P50 · {fecha(lastP50)}</span>
        <span className="dx-ui-pill">Conservadora (+25%) · {fecha(lastConservative)}</span>
      </div>
      <dl className="dx-planner-confirm">
        <dt>Compromiso OS</dt><dd>{fecha(commitment)}</dd>
        <dt>Horas pendientes</dt><dd>{forecast?.horasPendientes || 0} h</dd>
      </dl>
    </article>
    <article className="dx-planner-box">
      <h3>Cronograma de tareas por día</h3>
      <div className="dx-planner-calendar-scroll" role="region"
        aria-label="Cronograma de los próximos 14 días" tabIndex="0">
        <div className="dx-planner-calendar">
          <div className="dx-planner-calendar-row is-head">
            <b>Tarea</b>{days.map(day => <span key={day}>{fecha(day)}</span>)}
          </div>
          {taskPlans.map(plan => <div className="dx-planner-calendar-row"
            key={plan.tarea.id}>
            <b>{plan.tarea.titulo || plan.tarea.descripcion || 'Tarea'}</b>
            {days.map(day => {
              const hours = plan.p50.fechas.find(item => item.fecha === day)?.horas;
              return <span className={hours ? 'has-hours' : ''} key={day}>
                {hours ? `${hours} h` : ''}
              </span>;
            })}
          </div>)}
        </div>
      </div>
    </article>
    <article className="dx-planner-box">
      <h3>Efecto en las demás OT</h3>
      <p>El motor actual no simula cambios en las fechas de las demás OT.</p>
    </article>
    <article className="dx-planner-box">
      <h3>Comprobaciones</h3>
      <ul className="dx-planner-checks">{checks.map(([ok, label]) => <li
        className={ok ? 'is-ok' : 'is-no'} key={label}>
        <b aria-hidden="true">{ok ? '✓' : '!'}</b>{label}
      </li>)}</ul>
    </article>
  </section>;
}
