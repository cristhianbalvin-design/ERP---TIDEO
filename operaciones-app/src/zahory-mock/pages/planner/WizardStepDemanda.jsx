import { resolverFamiliaTrabajo } from './plannerAffinity.js';

export function WizardStepDemanda({ ot, tareas }) {
  const groups = new Map();
  tareas.forEach(task => {
    const familyName = task.familia_trabajo?.nombre
      || resolverFamiliaTrabajo(task.familia_trabajo_id, ot.familiasTrabajo)?.nombre;
    const family = familyName || (task.familia_trabajo_id
      ? `Trabajo (ID): ${task.familia_trabajo_id}` : 'Trabajo no informado');
    const activity = task.actividad?.nombre || task.actividad?.titulo
      || task.actividad_nombre || (task.actividad_id
        ? `Actividad (ID): ${task.actividad_id}` : task.cargo?.nombre || task.cargo
          || 'Actividad no informada');
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
              <small>{task.cargo?.nombre || task.cargo || 'Cargo no informado'}</small></span>
            <b>{Number(task.horas_estimadas) || 0} h estimadas ·
              {' '}{Number(task.horas_reales) || 0} h reales</b>
          </li>)}</ul>
        </section>)}
      </article>)}
    </div> : <p className="dx-planner-note">La OT todavía no tiene tareas heredadas.</p>}
    <article className="dx-planner-box">
      <h3>De dónde viene la demanda</h3>
      <p>La vista usa los campos disponibles en ot_tareas: familia_trabajo_id,
        actividad_id, cargo_id, titulo, descripcion, horas_estimadas y horas_reales.</p>
      <p>La carga del Planner resuelve el nombre de familia. ot_tareas no incluye nombres
        de actividad ni de cargo, así que se muestran sus IDs o “no informado”.</p>
    </article>
  </section>;
}
