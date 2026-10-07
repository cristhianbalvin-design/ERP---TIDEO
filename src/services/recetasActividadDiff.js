export function calcularDiffRecetaActividad(actuales = [], deseadas = []) {
  const actualPorTarea = new Map(actuales.map(fila => [fila.tarea_id, fila]));
  const deseadasNormalizadas = deseadas.map((fila, indice) => ({
    tarea_id: fila.tarea_id,
    cargo_id: fila.cargo_id || null,
    orden: indice + 1,
  }));
  const deseadaPorTarea = new Map(deseadasNormalizadas.map(fila => [fila.tarea_id, fila]));

  return {
    insertar: deseadasNormalizadas.filter(fila => !actualPorTarea.has(fila.tarea_id)),
    actualizar: deseadasNormalizadas.filter(fila => {
      const actual = actualPorTarea.get(fila.tarea_id);
      return actual && (Number(actual.orden) !== fila.orden || (actual.cargo_id || null) !== fila.cargo_id);
    }),
    eliminar: actuales.filter(fila => !deseadaPorTarea.has(fila.tarea_id)),
  };
}
