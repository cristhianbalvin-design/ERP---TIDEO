// Afinidad entre categoría de bahía, familia_trabajo (UUID) y familias del catálogo.
// Las tareas guardan el UUID real de familia_trabajo; el nombre se resuelve por catálogo.
export const AFINIDAD_PLANNER = {
  general: {
    trabajos: [],
    maquinas: ['mec', 'rect', 'corte', 'conf', 'sold', 'trat', 'izaje', 'prue', 'serv'],
  },
  pesada: {
    trabajos: ['pesad', 'reparación pesada', 'reparacion pesada'],
    maquinas: ['mec', 'rect', 'sold', 'trat', 'izaje', 'prue'],
  },
  sold: {
    trabajos: ['sold', 'soldadura', 'recargue'],
    maquinas: ['sold'],
  },
  crom: {
    trabajos: ['crom', 'tratamiento superficial', 'recubrimiento'],
    maquinas: ['trat', 'rect'],
  },
  mec: {
    trabajos: ['mecanizado', 'maestranza', 'torneado', 'fresado'],
    maquinas: ['mec', 'rect', 'corte', 'conf'],
  },
  hidr: {
    trabajos: ['hidrául', 'hidraul', 'prueba hidráulica', 'prueba hidraulica'],
    maquinas: ['prue', 'mec'],
  },
};

function normalizar(value) {
  return String(value || '').trim().toLocaleLowerCase('es-PE');
}

function coincideTrabajo(nombre, alias) {
  const valor = normalizar(nombre);
  return alias.some(termino => valor.includes(termino));
}

export function resolverFamiliaTrabajo(familiaId, familiasTrabajo = []) {
  return familiasTrabajo.find(familia => familia.id === familiaId) || null;
}

export function puntuarPuestoAfin(puesto, tarea, familiasTrabajo = []) {
  const regla = AFINIDAD_PLANNER[puesto?.bahia?.categoria] || AFINIDAD_PLANNER.general;
  if (!regla.trabajos.length) return false;
  const familia = resolverFamiliaTrabajo(tarea?.familia_trabajo_id, familiasTrabajo);
  return coincideTrabajo(familia?.nombre, regla.trabajos);
}

export function maquinaAfin(machine, puesto, tarea, familiasTrabajo = []) {
  const regla = AFINIDAD_PLANNER[puesto?.bahia?.categoria] || AFINIDAD_PLANNER.general;
  const familia = resolverFamiliaTrabajo(tarea?.familia_trabajo_id, familiasTrabajo);
  const trabajoCoincide = !regla.trabajos.length
    || coincideTrabajo(familia?.nombre, regla.trabajos);
  return trabajoCoincide && regla.maquinas.includes(machine?.familia);
}
