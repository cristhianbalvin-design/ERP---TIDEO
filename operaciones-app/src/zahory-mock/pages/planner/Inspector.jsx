import { calcularPronostico, esOtPlanificable } from './plannerEngine.js';

const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

const MENSAJE_OT_CERRADA =
  'Esta OT está cerrada. Reábrela desde la Bandeja de OTs para volver a planificarla.';

export function Inspector({ ot, recurso, recursos, onPlanificar }) {
  if (!ot && !recurso) return <InspectorVacio />;
  if (recurso) return <InspectorRecurso recurso={recurso} />;
  return (
    <InspectorOT
      ot={ot}
      recursos={recursos}
      onPlanificar={onPlanificar}
    />
  );
}

function InspectorVacio() {
  return (
    <aside className="dx-ui-card dx-planner-inspector">
      <div className="dx-ui-toolbar"><h2>Inspector</h2></div>
      <div className="dx-ui-empty">Selecciona una OT o un recurso para ver sus detalles.</div>
    </aside>
  );
}

function InspectorRecurso({ recurso }) {
  const asignaciones = recurso.asignaciones || [];
  const horas = asignaciones.reduce((total, item) => (
    total + (Number(item.horas_estimadas) || 8)
  ), 0);
  const tipo = recurso.tipo === 'maquina' ? 'Máquina de taller' : 'Personal';
  return (
    <aside className="dx-ui-card dx-planner-inspector">
      <div className="dx-ui-toolbar"><h2>Recurso</h2></div>
      <div className="dx-planner-inspector-body">
        <span className="dx-ui-eyebrow">{tipo}</span>
        <h3>{recurso.nombre}</h3>
        <p>{recurso.especialidad || recurso.cargo || 'Recurso disponible'}</p>
        <dl>
          <dt>Asignaciones</dt><dd>{asignaciones.length}</dd>
          <dt>Horas programadas</dt><dd>{horas} h</dd>
        </dl>
        {asignaciones.map(item => (
          <p className="dx-planner-task" key={item.id}>
            OT {item.ot?.numero || item.ot_id} · {fecha(item.fecha)}
            {' '}<b>{item.horas_estimadas || 8} h</b>
          </p>
        ))}
      </div>
    </aside>
  );
}

function InspectorOT({ ot, recursos, onPlanificar }) {
  if (!esOtPlanificable(ot)) {
    return (
      <aside className="dx-ui-card dx-planner-inspector">
        <p className="dx-planner-note">{MENSAJE_OT_CERRADA}</p>
      </aside>
    );
  }
  const pronostico = calcularPronostico(ot, recursos);
  const tareas = ot.ot_tareas || [];
  return (
    <aside className="dx-ui-card dx-planner-inspector">
      <div className="dx-ui-toolbar"><h2>Inspector</h2></div>
      <div className="dx-planner-inspector-body">
        <span className="dx-ui-eyebrow">Orden de trabajo</span>
        <h3>OT {ot.numero || ot.id}</h3>
        <p>{ot.descripcion || ot.servicio || 'Sin descripción registrada.'}</p>
        <dl>
          <dt>Orden de servicio</dt><dd>{ot.orden_servicio?.numero || 'Sin OS'}</dd>
          <dt>Compromiso OS</dt>
          <dd>{fecha(ot.orden_servicio?.fecha_fin || ot.fecha_programada)}</dd>
          <dt>Horas estimadas</dt><dd>{pronostico.totalHoras} h</dd>
          <dt>Horas reales</dt><dd>{pronostico.horasReales} h</dd>
          <dt>Horas pendientes</dt><dd>{pronostico.horasPendientes} h</dd>
          <dt>Capacidad diaria</dt><dd>{pronostico.capacidadDia} h</dd>
          <dt>Cuello de botella</dt><dd>{pronostico.cuello}</dd>
        </dl>
        <div className="dx-planner-range">
          <b>P50</b><span>{fecha(pronostico.p50.fechaFin)}</span>
          <b>Conservadora (+25 %)</b>
          <span>{fecha(pronostico.conservadora.fechaFin)}</span>
        </div>
        <h4>Tareas ({tareas.length})</h4>
        {tareas.map(tarea => (
          <p className="dx-planner-task" key={tarea.id}>
            {tarea.titulo || tarea.descripcion || 'Tarea'}
            {' '}<b>{Number(tarea.horas_reales) || 0} / {Number(tarea.horas_estimadas) || 0} h</b>
          </p>
        ))}
        <button
          className="dx-btn primary"
          disabled={!onPlanificar}
          onClick={() => onPlanificar(ot)}
        >
          Planificar esta OT
        </button>
      </div>
    </aside>
  );
}
