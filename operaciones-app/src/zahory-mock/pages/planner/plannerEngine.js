export const ESTADOS_OT_CERRADOS = new Set([
  'anulada',
  'cerrada',
  'cerrado_conforme',
  'valorizada',
]);

const isoDate = date => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

function localDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }
  return new Date(value);
}

function laborDate(date, laborDays) {
  return laborDays.includes(date.getDay());
}

export function esOtPlanificable(ot) {
  return Boolean(ot?.id) && !ESTADOS_OT_CERRADOS.has(String(ot.estado || '').toLowerCase());
}

export function validarOtPlanificable(ot) {
  if (!esOtPlanificable(ot)) {
    throw new Error('La OT está cerrada y no admite nuevas asignaciones.');
  }
  return true;
}

export function distribuirHorasPorCapacidad(
  horas,
  capacidadDiaria,
  fechaInicio = new Date(),
  diasLaborables = [1, 2, 3, 4, 5],
) {
  let restantes = Math.max(0, Number(horas) || 0);
  const capacidad = Math.max(0.01, Number(capacidadDiaria) || 8);
  const fecha = localDate(fechaInicio);
  const fechas = [];

  while (restantes > 0 && fechas.length < 3660) {
    if (laborDate(fecha, diasLaborables)) {
      const usadas = Math.min(capacidad, restantes);
      fechas.push({ fecha: isoDate(fecha), horas: usadas });
      restantes -= usadas;
    }
    fecha.setDate(fecha.getDate() + 1);
  }

  return {
    fechas,
    horasPendientes: restantes,
    fechaFin: fechas.at(-1)?.fecha || null,
  };
}

function totalPendiente(tarea) {
  const estimadas = Math.max(0, Number(tarea.horas_estimadas) || 0);
  const reales = Math.max(0, Number(tarea.horas_reales) || 0);
  return Math.max(0, estimadas - reales);
}

export function resumirTareas(ot) {
  return (ot?.ot_tareas || []).map(tarea => ({
    tarea,
    horasEstimadas: Math.max(0, Number(tarea.horas_estimadas) || 0),
    horasReales: Math.max(0, Number(tarea.horas_reales) || 0),
    horasPendientes: totalPendiente(tarea),
  }));
}

function capForTask(assignment, resources) {
  const people = (assignment?.personaIds || [])
    .map(id => resources.personas.find(persona => persona.id === id))
    .filter(Boolean);
  const machines = (assignment?.maquinaIds || [])
    .map(id => resources.maquinas.find(maquina => maquina.id === id))
    .filter(Boolean);
  const personHours = Math.max(1, Number(assignment?.horasPersona) || 8);
  const machineHours = Math.max(1, Number(assignment?.horasMaquina) || 8);
  const personCap = people.length * personHours;
  const machineCap = machines.length * machineHours;
  const capacities = [personCap, machineCap].filter(value => value > 0);
  return capacities.length ? Math.min(...capacities) : 8;
}

function bookedHours(rows, resourceField, resourceId, date) {
  return (rows || [])
    .filter(row => row[resourceField] === resourceId && row.fecha === date && row.estado !== 'cancelado')
    .reduce((sum, row) => sum + (Number(row.horas_estimadas) || 8), 0);
}

function availableCapacity(assignment, resources, date) {
  const selectedPeople = assignment.personaIds || [];
  const selectedMachines = assignment.maquinaIds || [];
  const peopleCapacity = selectedPeople.reduce((sum, id) => {
    const person = resources.personas.find(item => item.id === id);
    const daily = Math.min(Number(assignment.horasPersona) || 8, Number(person?.horas_dia) || 8);
    return sum + Math.max(0, daily - bookedHours(resources.asignaciones, 'tecnico_id', id, date));
  }, 0);
  const machineCapacity = selectedMachines.reduce((sum, id) => {
    const machine = resources.maquinas.find(item => item.id === id);
    const daily = Math.min(Number(assignment.horasMaquina) || 8, Number(machine?.horas_dia) || 8);
    return sum + Math.max(0, daily - bookedHours(resources.equipos, 'maquina_id', id, date));
  }, 0);
  const capacities = [];
  if (selectedPeople.length) capacities.push(peopleCapacity);
  if (selectedMachines.length) capacities.push(machineCapacity);
  let available = capacities.length ? Math.min(...capacities) : 8;

  if (assignment.puestoId) {
    const position = resources.puestos.find(item => item.id === assignment.puestoId);
    const occupied = (resources.ocupaciones || []).filter(item => item.puesto_id === assignment.puestoId
      && item.estado !== 'cancelado'
      && item.ot_id !== resources.otId
      && item.fecha_desde <= date
      && item.fecha_hasta >= date).length;
    if (occupied >= Math.max(1, Number(position?.capacidad) || 1)) available = 0;
  }
  return available;
}

function distribuirPorRecursos(horas, assignment, resources, fechaInicio) {
  let restantes = Math.max(0, Number(horas) || 0);
  const cursor = localDate(fechaInicio);
  const fechas = [];
  let guard = 0;
  while (restantes > 0 && guard < 3660) {
    const date = isoDate(cursor);
    if (laborDate(cursor, [1, 2, 3, 4, 5])) {
      const capacity = availableCapacity(assignment, resources, date);
      if (capacity > 0) {
        const used = Math.min(capacity, restantes);
        fechas.push({ fecha: date, horas: used });
        restantes -= used;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return { fechas, horasPendientes: restantes, fechaFin: fechas.at(-1)?.fecha || null };
}

export function planificarTareas(ot, assignments = {}, resources = {}, fechaInicio = new Date()) {
  const contexto = {
    personas: resources.personas || [],
    maquinas: resources.maquinas || [],
    puestos: resources.puestos || [],
    asignaciones: resources.asignaciones || [],
    equipos: resources.equipos || [],
    ocupaciones: resources.ocupaciones || [],
    otId: ot?.id,
  };
  const cursor = localDate(fechaInicio);
  const resultado = [];

  for (const item of resumirTareas(ot)) {
    const taskAssignment = assignments[item.tarea.id] || {};
    const assignment = {
      ...taskAssignment,
      puestoId: taskAssignment.puestoId || assignments.__puestoOt?.value || '',
    };
    const capacidad = capForTask(assignment, contexto);
    const cursorDate = isoDate(cursor);
    const start = assignment.fechaNoAntes > cursorDate
      ? assignment.fechaNoAntes : cursorDate;
    const p50 = distribuirPorRecursos(item.horasPendientes, assignment, contexto, start);
    const conservadora = distribuirPorRecursos(item.horasPendientes * 1.25, assignment, contexto, start);
    resultado.push({
      ...item,
      assignment,
      capacidad,
      p50,
      conservadora,
      fechaDesde: start,
      fechaHasta: conservadora.fechaFin || start,
    });
    if (p50.fechaFin) {
      cursor.setTime(localDate(p50.fechaFin).getTime());
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return resultado;
}

export function calcularPronostico(ot, recursos = {}, fechaInicio = new Date()) {
  const tareas = resumirTareas(ot);
  const totalHoras = tareas.reduce((sum, item) => sum + item.horasEstimadas, 0);
  const horasReales = tareas.reduce((sum, item) => sum + item.horasReales, 0);
  const horasPendientes = tareas.reduce((sum, item) => sum + item.horasPendientes, 0);
  const capacidadPersona = Math.max(1, Number(recursos.personas) || 1) * 8;
  const capacidadMaquina = Math.max(1, Number(recursos.maquinas) || 1)
    * Math.max(1, Number(recursos.horasMaquinaDia) || 8);
  const capacidadDia = Math.min(capacidadPersona, capacidadMaquina);
  const p50 = distribuirHorasPorCapacidad(horasPendientes, capacidadDia, fechaInicio);
  const conservadora = distribuirHorasPorCapacidad(horasPendientes * 1.25, capacidadDia, fechaInicio);

  return {
    totalHoras,
    horasReales,
    horasPendientes,
    capacidadPersona,
    capacidadMaquina,
    capacidadDia,
    cuello: capacidadPersona <= capacidadMaquina ? 'personas' : 'máquinas',
    p50,
    conservadora,
  };
}

export function detectarCuelloDeBotella(recursos, demandaHoras = 0) {
  const personas = Math.max(0, Number(recursos?.horasPersonaDisponibles) || 0);
  const maquinas = Math.max(0, Number(recursos?.horasMaquinaDisponibles) || 0);
  const capacidad = Math.min(personas, maquinas);
  if (capacidad < demandaHoras) {
    return {
      tipo: personas <= maquinas ? 'personas' : 'máquinas',
      horasFaltantes: demandaHoras - capacidad,
    };
  }
  if (!personas) return { tipo: 'personas', horasFaltantes: demandaHoras };
  if (!maquinas) return { tipo: 'máquinas', horasFaltantes: demandaHoras };
  return null;
}

function workingDaysBetween(start, end) {
  const cursor = localDate(start);
  const last = localDate(end);
  let days = 0;
  while (cursor <= last) {
    if (cursor.getDay() > 0 && cursor.getDay() < 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function analizarCuellos(ots = [], data = {}, fechaInicio = new Date()) {
  const recursos = [
    ...(data.personas || []).map(persona => ({ ...persona, tipo: 'persona' })),
    ...(data.maquinas || []).filter(maquina => maquina.estado !== 'baja')
      .map(maquina => ({ ...maquina, tipo: 'maquina' })),
    ...(data.puestos || []).map(puesto => ({ ...puesto, tipo: 'puesto' })),
  ];
  const acumulado = new Map();
  const esperas = [];
  const inicio = isoDate(localDate(fechaInicio));

  for (const ot of ots.filter(esOtPlanificable)) {
    const tarea = (ot.ot_tareas || []).find(item => totalPendiente(item) > 0);
    if (!tarea) continue;
    const people = (data.asignaciones || []).filter(item => item.ot_id === ot.id);
    const machines = (data.equipos || []).filter(item => item.ot_id === ot.id);
    const resourceIds = new Set([
      ...people.map(item => item.tecnico_id),
      ...machines.map(item => item.maquina_id),
    ]);
    const occupation = (data.ocupaciones || [])
      .filter(item => item.estado !== 'cancelado' && item.fecha_hasta >= inicio)
      .sort((a, b) => b.fecha_hasta.localeCompare(a.fecha_hasta))[0];
    const resource = recursos.find(item => resourceIds.has(item.id))
      || recursos.find(item => item.tipo === 'puesto' && item.id === occupation?.puesto_id);
    if (!resource) continue;

    const fechaDisponible = occupation?.fecha_hasta >= inicio
      ? occupation.fecha_hasta
      : inicio;
    const diasEspera = workingDaysBetween(inicio, fechaDisponible);
    if (!diasEspera) continue;
    const key = `${resource.tipo}:${resource.id}`;
    acumulado.set(key, (acumulado.get(key) || 0) + diasEspera);
    esperas.push({
      otId: ot.id,
      otNumero: ot.numero || ot.id,
      tareaId: tarea.id,
      recursoId: resource.id,
      recurso: resource.nombre || resource.codigo || resource.id,
      tipo: resource.tipo,
      causa: resource.tipo === 'puesto' ? `Puesto ${resource.nombre || resource.codigo}`
        : `${resource.tipo === 'persona' ? 'Persona' : 'Máquina'} ${resource.nombre || resource.codigo}`,
      diasEspera,
      fechaDisponible,
    });
  }

  const impacto = [...acumulado.entries()].map(([key, dias]) => {
    const [tipo, id] = key.split(':');
    const recurso = recursos.find(item => item.id === id && item.tipo === tipo);
    return { id, tipo, nombre: recurso?.nombre || recurso?.codigo || id, diasEspera: dias };
  }).sort((a, b) => b.diasEspera - a.diasEspera);

  return { esperas, impacto, critico: impacto[0] || null };
}

export function detectarCuelloPorEspera(ocupaciones, fechaInicio = new Date(), puestoId = null) {
  const start = isoDate(localDate(fechaInicio));
  const candidates = (ocupaciones || [])
    .filter(item => item.estado !== 'cancelado' && (!puestoId || item.puesto_id === puestoId))
    .filter(item => item.fecha_hasta >= start)
    .map(item => ({
      puestoId: item.puesto_id,
      fechaDisponible: item.fecha_hasta,
      diasEspera: workingDaysBetween(start, item.fecha_hasta),
    }));
  return candidates.sort((a, b) => b.diasEspera - a.diasEspera)[0] || null;
}

export function validarCapacidadPuesto(ocupaciones, puestoId, fechaDesde, fechaHasta, capacidad = 1, otId = null) {
  const start = localDate(fechaDesde);
  const end = localDate(fechaHasta);
  const active = (ocupaciones || []).filter(item => item.estado !== 'cancelado'
    && item.puesto_id === puestoId && item.ot_id !== otId);
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = isoDate(cursor);
    const simultaneous = active.filter(item => item.fecha_desde <= date && item.fecha_hasta >= date).length;
    if (simultaneous >= Math.max(1, Number(capacidad) || 1)) {
      return { valido: false, fecha: date, ocupaciones: simultaneous };
    }
  }
  return { valido: true, fecha: null, ocupaciones: 0 };
}

export function simularUrgencia(ots, otUrgente, recursos, fechaInicio = new Date(), data = {}) {
  const general = analizarCuellos((ots || []).filter(ot => ot.id !== otUrgente?.id), data, fechaInicio);
  // La OT urgente no espera a nadie; solo cuenta el cuello de botella si es un recurso que también necesita la OT urgente.
  const propios = new Set([
    ...(data.asignaciones || []).filter(item => item.ot_id === otUrgente?.id).map(item => item.tecnico_id),
    ...(data.equipos || []).filter(item => item.ot_id === otUrgente?.id).map(item => item.maquina_id),
    ...(data.ocupaciones || []).filter(item => item.ot_id === otUrgente?.id && item.estado !== 'cancelado').map(item => item.puesto_id),
  ]);
  const impacto = { ...general, critico: general.impacto.find(item => propios.has(item.id)) || null };
  const horasUrgentes = resumirTareas(otUrgente)
    .reduce((sum, item) => sum + item.horasPendientes, 0);
  const capacity = Math.max(1, Math.min(
    Number(recursos.horasPersonaDisponibles) || 0,
    Number(recursos.horasMaquinaDisponibles) || 0,
  ));
  const esperaDias = Math.max(impacto.critico?.diasEspera || 0, Math.ceil(horasUrgentes / capacity));
  const desplazadas = (ots || []).filter(esOtPlanificable).map(ot => {
    const pronostico = calcularPronostico(ot, recursos, fechaInicio);
    const fechaConUrgencia = distribuirHorasPorCapacidad(
      pronostico.horasPendientes + horasUrgentes,
      capacity,
      fechaInicio,
    ).fechaFin;
    return {
      otId: ot.id,
      fechaOriginal: pronostico.p50.fechaFin,
      fechaConUrgencia,
      diasDesplazada: pronostico.p50.fechaFin && fechaConUrgencia
        ? workingDaysBetween(pronostico.p50.fechaFin, fechaConUrgencia)
        : 0,
      causa: impacto.critico ? `${impacto.critico.tipo}: ${impacto.critico.nombre}` : 'Capacidad del taller',
    };
  });

  return { horasUrgentes, esperaDias, impacto, desplazadas };
}
