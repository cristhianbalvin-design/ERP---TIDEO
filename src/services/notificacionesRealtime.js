export function mapNotificacionSistema(row) {
  return {
    id: row.id,
    text: row.mensaje || row.texto,
    title: row.titulo || '',
    message: row.mensaje || row.texto,
    read: Boolean(row.leida),
    time: new Date(row.created_at || row.creada_en).toLocaleDateString('es-PE'),
    tipo: row.tipo,
    priority: row.prioridad || 'media',
    referenceType: row.referencia_tipo,
    referenceId: row.referencia_id,
    referencePayload: row.referencia_payload || {},
    _db: true,
  };
}

export function mergeNotificacionesSistema(current = [], rows = []) {
  const mapped = rows.map(mapNotificacionSistema);
  const byId = new Map(mapped.map(item => [item.id, item]));
  const merged = [...mapped];
  for (const item of current) {
    if (item._db && byId.has(item.id)) continue;
    if (item._db) byId.set(item.id, item);
    merged.push(item);
  }
  return merged;
}

export function applyNotificacionSistemaEvent(current = [], row) {
  const notification = mapNotificacionSistema(row);
  const index = current.findIndex(item => item.id === notification.id);
  if (index < 0) return [notification, ...current];
  return current.map((item, itemIndex) => itemIndex === index ? { ...item, ...notification } : item);
}
