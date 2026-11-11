import { getSupabaseClient } from '../lib/supabaseClient.js';

// Memoria de conversación de Aria (migración 681). Cada persona solo ve sus conversaciones (RLS).

async function llamar(funcion, args) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(funcion, args);
  if (error) throw Object.assign(new Error('No pude cargar tus conversaciones.'), { status: error.status || 0 });
  return data;
}

// Conversación de las últimas 24 horas para retomarla al abrir Aria (o null si no hay).
export const conversacionActual = empresaId => llamar('aria_conversacion_actual', { p_empresa_id: empresaId });
export const abrirConversacion = id => llamar('aria_conversacion_abrir', { p_conversacion_id: id });
export const listarConversaciones = (empresaId, texto) => llamar('aria_conversaciones_listar', { p_empresa_id: empresaId, p_texto: texto?.trim() || null, p_limite: 40 });

// Convierte los mensajes guardados al formato del panel. Los botones solo se conservan en el último mensaje.
export function mensajesDelPanel(guardados) {
  const lista = (Array.isArray(guardados) ? guardados : []).filter(m => (m?.rol === 'user' || m?.rol === 'assistant') && typeof m.contenido === 'string');
  return lista
    .map((m, index) => ({
      role: m.rol,
      content: m.contenido,
      herramientas: Array.isArray(m.extra?.herramientas) ? m.extra.herramientas : [],
      borrador: m.extra?.borrador?.id ? m.extra.borrador : null,
      opciones: index === lista.length - 1 ? m.extra?.opciones ?? null : null,
    }));
}

// Agrupa la lista por Hoy, Ayer, Esta semana y Anteriores (hora de Lima).
export function agruparPorFecha(conversaciones, ahora = new Date()) {
  const dia = fecha => new Date(new Date(fecha).toLocaleString('en-US', { timeZone: 'America/Lima' })).setHours(0, 0, 0, 0);
  const hoy = dia(ahora);
  const grupos = [];
  for (const c of conversaciones || []) {
    const dias = Math.round((hoy - dia(c.actualizado_en)) / 86400000);
    const nombre = dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : dias < 7 ? 'Esta semana' : 'Anteriores';
    const grupo = grupos.find(g => g.nombre === nombre) || (grupos.push({ nombre, items: [] }), grupos[grupos.length - 1]);
    grupo.items.push(c);
  }
  return grupos;
}

export function horaCorta(fecha, ahora = new Date()) {
  const f = new Date(fecha);
  const mismoDia = f.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) === ahora.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  return mismoDia
    ? f.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' })
    : f.toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' });
}

// "de hoy, 4:48 p. m." o "de ayer, 6:10 p. m." (solo se retoman conversaciones de las últimas 24 horas).
export function etiquetaRetomada(fecha, ahora = new Date()) {
  const f = new Date(fecha);
  const dia = d => d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  const hora = f.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' });
  return `${dia(f) === dia(ahora) ? 'de hoy' : 'de ayer'}, ${hora}`;
}
