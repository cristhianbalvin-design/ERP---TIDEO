import { useState } from 'react';
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
  disabled,
}) {
  const [machineWarnings, setMachineWarnings] = useState({});
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
          Responsable
          <select
            disabled={disabled}
            value={assignment.responsableId || assignment.personaIds[0] || ''}
            onChange={event => changeAssignment(task.id, {
              responsableId: event.target.value,
              personaIds: [...new Set([
                ...assignment.personaIds.filter(id => id !== assignment.responsableId),
                ...(event.target.value ? [event.target.value] : []),
              ])],
            })}
          >
            <option value="">Automático</option>
            {datos.personas.map(person => (
              <option key={person.id} value={person.id}>{person.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Personas
          <select
            multiple
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
            value={assignment.puestoId}
            onChange={event => {
              const puestoId = event.target.value;
              const position = positions.find(item => item.id === puestoId);
              const validMachineIds = new Set(datos.maquinas.filter(machine => (
                machine.estado === 'disponible'
                  && (!position || machine.bahia_id === position.bahia_id)
              )).map(machine => machine.id));
              const maquinaIds = assignment.maquinaIds.filter(id => validMachineIds.has(id));
              const removed = maquinaIds.length !== assignment.maquinaIds.length;
              setMachineWarnings(current => ({
                ...current,
                [task.id]: removed
                  ? 'Se quitaron máquinas que no pertenecen a este puesto o no están disponibles.'
                  : '',
              }));
              changeAssignment(task.id, { puestoId, maquinaIds });
            }}
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
            disabled={disabled}
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
        {machineWarnings[task.id] && <p className="dx-planner-field-note" role="status">
          {machineWarnings[task.id]}
        </p>}
        <label>
          Horas por máquina
          <input
            type="number"
            disabled={disabled}
            min="1"
            max="24"
            value={assignment.horasMaquina}
            onChange={event => changeAssignment(task.id, {
              horasMaquina: Number(event.target.value),
            })}
          />
        </label>
        <label>
          No empezar antes de
          <input type="date" disabled={disabled} value={assignment.fechaNoAntes || ''}
            onChange={event => changeAssignment(task.id, { fechaNoAntes: event.target.value })} />
        </label>
      </fieldset>
    );
  });
}
