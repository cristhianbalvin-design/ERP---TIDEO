const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

export function WizardSide({ ot, plans, forecast, p50, conservative }) {
  const commitment = ot?.orden_servicio?.fecha_fin;
  const late = Boolean(conservative && commitment && conservative > commitment);
  const warnings = [];
  if (late) warnings.push('La entrega conservadora supera el compromiso de la OS.');
  if (!commitment) warnings.push('La OS no tiene fecha de compromiso disponible.');
  if (!ot?.ot_tareas?.length) warnings.push('La OT todavía no tiene tareas heredadas.');
  if (plans.some(plan => plan.p50.horasPendientes > 0)) {
    warnings.push('Hay horas que no encuentran capacidad en el horizonte.');
  }
  if (plans.some(plan => plan.horasPendientes > 0
    && !plan.assignment.personaIds?.length && !plan.assignment.maquinaIds?.length)) {
    warnings.push('Asigna al menos una persona o máquina a cada tarea pendiente.');
  }
  return <aside className="dx-planner-wizard-side" aria-label="Impacto en vivo">
    <h2>Impacto en vivo</h2>
    {ot ? <>
      <b>OT {ot.numero || ot.id}</b>
      <span>{ot.equipo?.nombre || ot.equipo_nombre || 'Equipo no informado'}</span>
      <span className={`dx-planner-status ${late ? 'is-risk' : 'is-safe'}`}>
        {late ? 'Riesgo de atraso' : 'Dentro del compromiso'}</span>
      <strong>{forecast?.horasPendientes || 0} h pendientes</strong>
      <dl>
        <dt>Compromiso OS</dt><dd>{fecha(commitment)}</dd>
        <dt>Entrega P50</dt><dd>{fecha(p50)}</dd>
        <dt>Conservadora (+25%)</dt><dd>{fecha(conservative)}</dd>
      </dl>
      <ul>{plans.map(plan => <li key={plan.tarea.id}>
        {plan.tarea.titulo || plan.tarea.descripcion || 'Tarea'} ·
        {' '}{plan.horasPendientes} h · {fecha(plan.p50.fechaFin)}
      </li>)}</ul>
      {warnings.length > 0 && <ul className="dx-planner-alerts">
        {warnings.map(warning => <li key={warning}>{warning}</li>)}
      </ul>}
    </> : <p>Elige una OT para ver su compromiso, alertas y fechas previstas.</p>}
  </aside>;
}
