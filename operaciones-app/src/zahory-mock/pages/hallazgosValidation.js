export const REQUIRED_HALLAZGO_FIELDS = [
  ['familia_trabajo_id', 'family'],
  ['componente_parte', 'component'],
  ['tipo_dano_codigo', 'damage'],
  ['causa_probable_codigo', 'cause'],
  ['condicion', 'condition'],
  ['riesgo', 'risk'],
  ['accion_recomendada', 'action'],
  ['atribuible_a', 'attribution'],
];

export function missingHallazgoFields(item = {}) {
  return REQUIRED_HALLAZGO_FIELDS
    .filter(([field]) => !String(item[field] ?? '').trim())
    .map(([, key]) => key)
    .concat(item.prioridad_override && !String(item.prioridad_override_motivo || '').trim() ? ['override_reason'] : []);
}

export function getIncompleteHallazgos(items = []) {
  return items.map((item, index) => ({ item, index, missingFields: missingHallazgoFields(item) }))
    .filter(row => row.missingFields.length > 0);
}
