import { getSupabaseClient } from '../lib/supabaseClient.js';

// Toda pantalla con clave de permiso viaja como contexto: el manual la usa para ordenar sus fichas.
const esPantallaValida = pantalla => typeof pantalla === 'string' && /^[a-z][a-z0-9_]{1,59}$/.test(pantalla);

export async function consultarAsistenteErp({ empresaId, sociedadId, pregunta, historial, contexto, conversacionId }) {
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
  // Con conversación guardada, la Edge lee el historial de la base; el del navegador queda solo como respaldo.
  body.conversacion_id = conversacionId || null;
  if ((contexto?.tipo && contexto?.id) || esPantallaValida(contexto?.pantalla)) body.contexto = {
    ...(contexto?.tipo && contexto?.id ? { modulo: contexto.modulo, tipo: contexto.tipo, id: contexto.id } : {}),
    ...(esPantallaValida(contexto?.pantalla) ? { pantalla: contexto.pantalla } : {}),
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

// Egreso de caja chica preparado por Aria: solo la persona lo confirma desde la tarjeta.
function mensajeErrorEgreso(error) {
  const texto = String(error?.message || '');
  const legible = texto.includes(': ') ? texto.split(': ').slice(1).join(': ') : '';
  return legible || 'No se pudo registrar el egreso. Inténtalo de nuevo.';
}

export async function obtenerGastoIdBorrador(borradorId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('asistente_borradores').select('payload').eq('id', borradorId).single();
  if (error) throw new Error('No se encontró el borrador.');
  return data?.payload?.gasto_id || null;
}

export async function confirmarBorradorEgreso({ borradorId, comprobanteUrl, numComprobante }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('asistente_confirmar_borrador', {
    p_borrador_id: borradorId,
    p_comprobante_url: comprobanteUrl || null,
    p_num_comprobante: numComprobante || null,
  });
  if (error) throw new Error(mensajeErrorEgreso(error));
  return data;
}

export async function cancelarBorradorEgreso(borradorId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('asistente_cancelar_borrador', { p_borrador_id: borradorId });
  if (error) throw new Error('No se pudo cancelar el borrador.');
  return data;
}
