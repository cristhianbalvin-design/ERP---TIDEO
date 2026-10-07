/**
 * Devuelve, en el orden de la receta, las tareas que aún faltan para una
 * actividad de fabricación dentro de un trabajo.
 */
export function proponerLineasRecetaActividad(tipo, actividad, plantillas = [], lineasActuales = []) {
  const actividadId = typeof actividad === 'object' ? actividad?.id : actividad;
  if (tipo !== 'fabricacion' || !actividadId) return [];

  const existentes = new Set(lineasActuales
    .filter(linea => linea.actividad_id === actividadId && linea.tarea_id)
    .map(linea => linea.tarea_id));

  return plantillas
    .filter(plantilla => plantilla.actividad_id === actividadId && plantilla.tarea_id && !existentes.has(plantilla.tarea_id))
    .map((plantilla, indice) => ({ ...plantilla, _ordenReceta: Number.isFinite(Number(plantilla.orden)) ? Number(plantilla.orden) : indice }))
    .sort((a, b) => a._ordenReceta - b._ordenReceta)
    .map(({ _ordenReceta, ...plantilla }) => ({
      actividad_id: actividadId,
      tarea_id: plantilla.tarea_id,
      cargo_id: plantilla.cargo_id || null,
      orden: plantilla.orden,
    }));
}
