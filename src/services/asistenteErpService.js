import { getSupabaseClient } from '../lib/supabaseClient.js';

const PANTALLAS_MANUAL = new Set(['tesoreria', 'caja', 'compras_gastos']);

export async function consultarAsistenteErp({ empresaId, sociedadId, pregunta, historial, contexto }) {
  const supabase = await getSupabaseClient();
  const body = {
    empresa_id: empresaId,
    pregunta: String(pregunta || '').slice(0, 1000),
    historial: (historial || []).slice(-10).map(mensaje => ({
      role: mensaje.role,
      content: String(mensaje.content || '').slice(0, 2000),
    })),
  };
  if (sociedadId) body.sociedad_id = sociedadId;
  if ((contexto?.tipo && contexto?.id) || PANTALLAS_MANUAL.has(contexto?.pantalla)) body.contexto = {
    ...(contexto?.tipo && contexto?.id ? { modulo: contexto.modulo, tipo: contexto.tipo, id: contexto.id } : {}),
    ...(PANTALLAS_MANUAL.has(contexto?.pantalla) ? { pantalla: contexto.pantalla } : {}),
  };
  const { data, error } = await supabase.functions.invoke('asistente-erp', { body });
  if (error) {
    const status = error.context?.status || error.status || 0;
    const err = new Error('No se pudo completar la consulta.');
    err.status = status;
    throw err;
  }
  return data;
}

export function mensajeErrorAsistente(status) {
  if (status === 400) return 'No pude procesar la pregunta. Revísala e inténtalo de nuevo.';
  if (status === 401 || status === 403) return 'No tienes acceso para realizar esta consulta.';
  if (status === 429) return 'Llegaste al límite de preguntas de hoy. Se renueva mañana a las 00:00 (hora de Lima).';
  if (status === 502 || status === 504) return 'El asistente no está disponible en este momento. Inténtalo de nuevo.';
  return 'No pude completar la consulta. Inténtalo de nuevo en un momento.';
}
