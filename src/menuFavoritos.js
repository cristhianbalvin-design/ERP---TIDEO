const clave = id => `tideo_menu_usuario_${String(id)}`;
const limpiar = value => Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string' && x))] : [];
export function leerMenuUsuario(id, storage) {
  try { const data = JSON.parse((storage || localStorage).getItem(clave(id)) || '{}'); return { favoritos: limpiar(data?.favoritos), recientes: limpiar(data?.recientes).slice(0, 6) }; }
  catch { return { favoritos: [], recientes: [] }; }
}
export function guardarMenuUsuario(id, data, storage) { try { (storage || localStorage).setItem(clave(id), JSON.stringify(data)); } catch {} }
export function alternarFavorito(data, key) { const favoritos = limpiar(data.favoritos); return { ...data, favoritos: favoritos.includes(key) ? favoritos.filter(x => x !== key) : [...favoritos, key] }; }
export function agregarReciente(data, key) { return { ...data, recientes: [key, ...limpiar(data.recientes).filter(x => x !== key)].slice(0, 6) }; }
