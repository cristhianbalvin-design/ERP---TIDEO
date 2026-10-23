import { resolverFamiliaTrabajo } from './plannerAffinity.js';

export function WizardStepDemanda({ ot, tareas }) {
  const groups = new Map();
  tareas.forEach(task => {
    const familyName = task.familia_trabajo?.nombre
      || resolverFamiliaTrabajo(task.familia_trabajo_id, ot.familiasTrabajo)?.nombre;
    const family = familyName || 'Sin trabajo definido';
    const activity = task.actividad?.nombre || 'Sin actividad definida';
    if (!groups.has(family)) groups.set(family, new Map());
    const activities = groups.get(family);
    if (!activities.has(activity)) activities.set(activity, []);
    activities.get(activity).push(task);
  });
  return <section className="dx-planner-step">
    <h2>Esto es lo que hay que hacer</h2>
    <p className="dx-planner-lead">La OT hereda el árbol del diagnóstico. Las horas se
      corrigen en la hoja de costeo; el Planner programa las horas pendientes.</p>
    {groups.size ? <div className="dx-planner-tree">
      {[...groups].map(([family, activities]) => <article className="dx-planner-work"
        key={family}>
        <header><small>Trabajo</small><b>{family}</b></header>
        {[...activities].map(([activity, rows]) => <section className="dx-planner-activity"
          key={activity}>
          <h3><small>Actividad</small>{activity}</h3>
          <ul className="dx-planner-task-list">{rows.map(task => <li key={task.id}>
            <span><b>{task.titulo || task.descripcion || 'Tarea sin nombre'}</b>
              <small>{task.cargo?.nombre || 'Cargo sin definir'}</small></span>
            <b>{Number(task.horas_estimadas) || 0} h estimadas ·
              {' '}{Number(task.horas_reales) || 0} h reales</b>
          </li>)}</ul>
        </section>)}
      </article>)}
    </div> : <p className="dx-planner-note">La OT todavía no tiene tareas heredadas.</p>}
  </section>;
}
