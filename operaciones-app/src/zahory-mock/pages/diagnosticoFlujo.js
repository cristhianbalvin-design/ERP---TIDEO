export const PASOS_MANTENIMIENTO = [
  'Recepci\u00f3n',
  'Equipo',
  'Datos',
  'Hallazgos',
  'Trabajos a realizar',
  'Diagn\u00f3stico e informe',
];

export const PASOS_FABRICACION = [
  'Oportunidad',
  'Trabajos a realizar',
  'Emitir y costear',
];

// Fabricación y Mantenimiento comparten el flujo: origen → trabajos → emisión.
// Mantenimiento agrega Equipo, Datos y Hallazgos antes de los trabajos y el informe al final.
export const pasosDiagnostico = tipo => tipo === 'fabricacion' ? PASOS_FABRICACION : PASOS_MANTENIMIENTO;
export const pasoTrabajos = tipo => tipo === 'fabricacion' ? 2 : 5;
export const pasoFinal = tipo => tipo === 'fabricacion' ? 3 : 6;
export const pasosDeCreacion = tipo => tipo === 'fabricacion' ? 1 : 3;

export function datosInicialesValidos(referencia, datos = {}) {
  return Boolean(
    referencia?.id
    && String(datos.motivo || '').trim()
    && datos.tecnico_id
    && datos.fecha_inspeccion
  );
}

export function agruparLineasPorTrabajo(lineas = [], familias = []) {
  const nombres = new Map(familias.map(familia => [familia.id, familia]));
  const grupos = new Map();
  lineas.forEach(linea => {
    const id = linea.familia_trabajo_id || 'sin-familia';
    if (!grupos.has(id)) grupos.set(id, { familia: nombres.get(id) || { id, nombre: 'Trabajo no disponible' }, lines: [] });
    grupos.get(id).lines.push(linea);
  });
  return [...grupos.values()];
}

export function trabajosSinTareas(grupos = []) {
  return grupos.filter(grupo => (grupo.lines || []).length === 0);
}

const PRIORITY_RANK = { P4: 1, P3: 2, P2: 3, P1: 4 };
export function ordenarHallazgosPorPrioridad(hallazgos = [], matriz = {}) {
  return hallazgos.slice().sort((left, right) => {
    const prioridad = item => item.prioridad_override || item.prioridad_efectiva || matriz[item.condicion]?.[item.riesgo] || item.prioridad_calculada || 'P4';
    return (PRIORITY_RANK[prioridad(right)] || 0) - (PRIORITY_RANK[prioridad(left)] || 0);
  });
}
