import { getSupabaseClient } from '../lib/supabaseClient.js';

// Memoria de conversación de Aria (migración 681). Cada persona solo ve sus conversaciones (RLS).

async function llamar(funcion, args, mensaje = 'No pude cargar tus conversaciones.') {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(funcion, args);
  if (error) throw Object.assign(new Error(mensaje), { status: error.status || 0 });
  return data;
}

// Conversación de las últimas 24 horas para retomarla al abrir Aria (o null si no hay).
export const conversacionActual = empresaId => llamar('aria_conversacion_actual', { p_empresa_id: empresaId });
export const abrirConversacion = id => llamar('aria_conversacion_abrir', { p_conversacion_id: id });
export const listarConversaciones = (empresaId, texto) => llamar('aria_conversaciones_listar', { p_empresa_id: empresaId, p_texto: texto?.trim() || null, p_limite: 40 });

// Memoria de largo plazo (migración 683): lo que Aria recuerda de la persona. Solo ella lo ve y lo borra.
export const listarRecuerdos = (empresaId, texto) => llamar('aria_recuerdos_listar', { p_empresa_id: empresaId, p_texto: texto?.trim() || null }, 'No pude cargar tus recuerdos.');
export const borrarRecuerdo = id => llamar('aria_recuerdo_borrar', { p_recuerdo_id: id }, 'No pude borrar ese recuerdo. Inténtalo de nuevo.');
export const borrarTodosLosRecuerdos = empresaId => llamar('aria_recuerdos_borrar_todos', { p_empresa_id: empresaId }, 'No pude borrar tus recuerdos. Inténtalo de nuevo.');
export const pausarMemoria = (empresaId, pausada) => llamar('aria_memoria_pausar', { p_empresa_id: empresaId, p_pausada: Boolean(pausada) }, 'No pude cambiar la memoria. Inténtalo de nuevo.');

// Avisos de recuerdo que llegan con una respuesta ("Guardado en tu memoria" / "Aria recordó"). Solo textos simples.
export function avisosDeRecuerdo(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter(r => r && typeof r.id === 'string' && typeof r.texto === 'string' && r.texto.trim())
    .slice(0, 6)
    .map(r => ({ id: r.id, texto: r.texto.slice(0, 300), tipo: r.tipo === 'automatico' ? 'automatico' : 'explicito' }));
}

// "hoy, 12:10 a. m.", "ayer, 1:56 p. m." o "lun, 9 nov" (hora de Lima).
export function fechaRecuerdo(fecha, ahora = new Date()) {
  const f = new Date(fecha);
  if (Number.isNaN(f.getTime())) return 'Sin fecha';
  const dia = d => new Date(new Date(d).toLocaleString('en-US', { timeZone: 'America/Lima' })).setHours(0, 0, 0, 0);
  const dias = Math.round((dia(ahora) - dia(f)) / 86400000);
  const hora = f.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' });
  if (dias <= 0) return `hoy, ${hora}`;
  if (dias === 1) return `ayer, ${hora}`;
  return f.toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', ...(dias > 300 ? { year: 'numeric' } : {}) });
}

// Destino del botón "Ir a…": solo pantallas de Administración u Operaciones con una ruta simple.
export function destinoValido(destino) {
  if (!destino || (destino.app !== 'admin' && destino.app !== 'operaciones')) return null;
  if (typeof destino.ruta !== 'string' || !/^[a-z0-9_-]{1,60}$/i.test(destino.ruta) || typeof destino.titulo !== 'string') return null;
  return { app: destino.app, ruta: destino.ruta, titulo: destino.titulo.slice(0, 80), donde: typeof destino.donde === 'string' ? destino.donde.slice(0, 160) : '' };
}

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
      recuerdos: avisosDeRecuerdo(m.extra?.recuerdos),
      destino: destinoValido(m.extra?.destino),
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
