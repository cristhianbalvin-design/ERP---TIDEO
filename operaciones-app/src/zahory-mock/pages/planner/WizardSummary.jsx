const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

export function WizardSummary({ ot, forecast, taskPlans, lastP50, lastConservative, commitment }) {
  return (
    <aside className="dx-planner-wizard-summary">
      <h3>Resumen de la OT</h3>
      {ot ? (
        <>
          <b>OT {ot.numero || ot.id}</b>
          <span>{ot.descripcion || ot.servicio}</span>
          <strong>{forecast?.totalHoras || 0} h estimadas</strong>
          <dl>
            <dt>Orden de servicio</dt><dd>{ot.orden_servicio?.numero || 'Sin OS'}</dd>
            <dt>Probable P50</dt><dd>{fecha(lastP50)}</dd>
            <dt>Conservadora</dt><dd>{fecha(lastConservative)}</dd>
            <dt>Compromiso OS</dt><dd>{fecha(commitment)}</dd>
          </dl>
          {taskPlans.map(plan => (
            <p key={plan.tarea.id}>
              {plan.tarea.titulo || plan.tarea.descripcion || 'Tarea'} · {plan.horasPendientes} h ·
              {' '}{fecha(plan.p50.fechaFin)}
            </p>
          ))}
        </>
      ) : <p>Elige una OT para ver su resumen.</p>}
    </aside>
  );
}
