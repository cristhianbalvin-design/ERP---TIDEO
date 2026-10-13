import { maquinaAfin } from './plannerAffinity.js';

const asignacionVacia = {
  personaIds: [],
  maquinaIds: [],
  puestoId: '',
  horasPersona: 8,
  horasMaquina: 8,
};

export function WizardResourceTasks({
  tasks,
  assignments,
  datos,
  positions,
  affinityPositions,
  changeAssignment,
}) {
  return tasks.map(task => {
    const assignment = { ...asignacionVacia, ...assignments[task.id] };
    const positionsForTask = affinityPositions(task);
    const selectedPosition = positions.find(position => position.id === assignment.puestoId);
    const baseMachines = datos.maquinas.filter(machine => (
      machine.estado === 'disponible'
        && (!selectedPosition || machine.bahia_id === selectedPosition.bahia_id)
    ));
    const machineOptions = [...baseMachines].sort((left, right) => {
      const leftType = datos.tipos.find(type => type.clave === left.tipo_clave);
      const rightType = datos.tipos.find(type => type.clave === right.tipo_clave);
      const position = selectedPosition || positionsForTask[0];
      const leftMatch = maquinaAfin(
        { ...left, familia: leftType?.familia },
        position,
        task,
        datos.familiasTrabajo,
      );
      const rightMatch = maquinaAfin(
        { ...right, familia: rightType?.familia },
        position,
        task,
        datos.familiasTrabajo,
      );
      return Number(rightMatch) - Number(leftMatch);
    });
    return (
      <fieldset className="dx-planner-task-assignment" key={task.id}>
        <legend>{task.titulo || task.descripcion || 'Tarea'} · {Number(task.horas_estimadas) || 0} h</legend>
        <label>
          Personas
          <select
            multiple
            value={assignment.personaIds}
            onChange={event => changeAssignment(task.id, {
              personaIds: [...event.target.selectedOptions].map(option => option.value),
            })}
          >
            {datos.personas.map(person => (
              <option key={person.id} value={person.id}>
                {person.nombre} · {person.especialidad || person.cargo || 'Personal'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horas por persona
          <input
            type="number"
            min="1"
            max="24"
            value={assignment.horasPersona}
            onChange={event => changeAssignment(task.id, {
              horasPersona: Number(event.target.value),
            })}
          />
        </label>
        <label>
          Puesto · categoría afín sugerida primero
          <select
            value={assignment.puestoId}
            onChange={event => changeAssignment(task.id, {
              puestoId: event.target.value,
              maquinaIds: [],
            })}
          >
            <option value="">Sin puesto</option>
            {positionsForTask.map(position => (
              <option key={position.id} value={position.id}>
                {position.bahia?.nombre} · {position.nombre || position.codigo}
                {' '}· capacidad {position.capacidad}
              </option>
            ))}
          </select>
        </label>
        <label>
          Máquinas
          <select
            multiple
            value={assignment.maquinaIds}
            onChange={event => changeAssignment(task.id, {
              maquinaIds: [...event.target.selectedOptions].map(option => option.value),
            })}
          >
            {machineOptions.map(machine => (
              <option key={machine.id} value={machine.id}>
                {machine.nombre} · {datos.bahias.find(bay => bay.id === machine.bahia_id)?.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horas por máquina
          <input
            type="number"
            min="1"
            max="24"
            value={assignment.horasMaquina}
            onChange={event => changeAssignment(task.id, {
              horasMaquina: Number(event.target.value),
            })}
          />
        </label>
      </fieldset>
    );
  });
}
