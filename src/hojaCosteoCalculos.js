const n = value => Number(value || 0);

export function calcularCostosPorTarea({ lineas = [], activos = [], materiales = [], tarifas = {}, costosActivos = {} } = {}) {
  const grupos = new Map();
  lineas.forEach(linea => {
    const tarifa = n(linea.costo_hora_snapshot ?? tarifas[linea.cargo_id]);
    // El subtotal guardado manda: evita diferencias de céntimos por el costo/hora redondeado del snapshot.
    const subtotalManoObra = linea.subtotal != null && linea.subtotal !== '' ? n(linea.subtotal) : n(linea.horas) * tarifa;
    const activo = activos.filter(item => item.linea_mano_obra_id === linea.id || (!item.linea_mano_obra_id && item.tarea_id === linea.tarea_id));
    const subtotalMaquina = activo.reduce((suma, item) => suma + (item.depreciacion_asignada != null
      ? n(item.depreciacion_asignada)
      : n(item.horas_uso_estimadas) * n(item.costo_hora_equipo ?? costosActivos[item.activo_id])), 0);
    const subtotalMateriales = materiales.filter(item => item.linea_mano_obra_id === linea.id || (!item.linea_mano_obra_id && item.tarea_id === linea.tarea_id)).reduce((suma, item) => suma + n(item.subtotal), 0);
    const actividadId = linea.actividad_receta_id || linea.actividad_id || '';
    const key = `${linea.familia_trabajo_id || ''}:${actividadId}`;
    const tarea = { ...linea, subtotal_mano_obra: subtotalManoObra, subtotal_maquina: subtotalMaquina, subtotal_materiales: subtotalMateriales, subtotal: subtotalManoObra + subtotalMaquina + subtotalMateriales };
    if (!grupos.has(key)) grupos.set(key, { familia_trabajo_id: linea.familia_trabajo_id, actividad_id: actividadId, tareas: [], subtotal: 0 });
    const grupo = grupos.get(key);
    grupo.tareas.push(tarea);
    grupo.subtotal += tarea.subtotal;
  });
  return [...grupos.values()];
}

export function agruparMaterialesPorTrabajo({ lineas = [], materiales = [], familias = [], actividades = [], tareas = [] } = {}) {
  const grupos = new Map();
  materiales.forEach(linea => {
    const lineaTarea = lineas.find(item => item.id === linea.linea_mano_obra_id);
    const familiaId = lineaTarea?.familia_trabajo_id || linea.familia_trabajo_id || '';
    const actividadId = lineaTarea?.actividad_receta_id || lineaTarea?.actividad_id || linea.actividad_receta_id || linea.actividad_id || '';
    const tareaId = lineaTarea?.tarea_id || linea.tarea_id || '';
    const key = `${familiaId}:${actividadId}:${tareaId}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        familia_trabajo_id: familiaId || null,
        actividad_id: actividadId || null,
        tarea_id: tareaId || null,
        ruta: rutaMaterial(linea, lineaTarea, familias, actividades, tareas),
        subtotal: 0,
        lineas: [],
      });
    }
    const grupo = grupos.get(key);
    grupo.lineas.push(linea);
    grupo.subtotal += n(linea.subtotal != null ? linea.subtotal : n(linea.cantidad) * n(linea.costo_unitario_snapshot));
  });
  return [...grupos.values()];
}

export function calcularPrecio({ costoTotal = 0, gastoPct = 0, margenPct = 0 } = {}) {
  const divisor = 1 - (n(gastoPct) + n(margenPct));
  const sinIgv = divisor > 0 ? n(costoTotal) / divisor : null;
  return { divisor, sinIgv, conIgv: sinIgv == null ? null : sinIgv * 1.18 };
}

export function rutaMaterial(linea, lineaTarea, familias = [], actividades = [], tareas = []) {
  const familiaId = lineaTarea?.familia_trabajo_id || linea.familia_trabajo_id;
  const actividadId = lineaTarea?.actividad_receta_id || lineaTarea?.actividad_id || linea.actividad_receta_id || linea.actividad_id;
  const tareaId = lineaTarea?.tarea_id || linea.tarea_id;
  return [familias.find(row => row.id === familiaId)?.nombre, actividades.find(row => row.id === actividadId)?.nombre, tareas.find(row => row.id === tareaId)?.nombre].filter(Boolean);
}
