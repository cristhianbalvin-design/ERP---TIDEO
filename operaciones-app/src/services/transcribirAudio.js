import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function transcribirAudio({ diagnosticoId, blob, idioma = 'es' }) {
  if (!diagnosticoId) throw new Error('Guarda el diagnóstico antes de transcribir el audio.');
  const form = new FormData();
  const extension = blob?.type?.includes('mp4') ? 'mp4' : blob?.type?.includes('ogg') ? 'ogg' : blob?.type?.includes('wav') ? 'wav' : 'webm';
  form.append('diagnostico_id', diagnosticoId);
  form.append('idioma', idioma);
  form.append('audio', blob, `grabacion.${extension}`);
  try {
    const { data, error } = await getSupabaseClient().functions.invoke('transcribir-audio', { body: form });
    if (error) {
      let payload = data;
      try { if (!payload && error.context?.json) payload = await error.context.json(); } catch { /* respuesta no JSON */ }
      const status = error.context?.status;
      if (error.name === 'FunctionsFetchError') throw new Error('Sin conexión. Conservé el audio para reintentar.');
      if (status === 401 || status === 403) throw new Error(payload?.error || 'No tienes permiso para transcribir este diagnóstico.');
      if (status === 504) throw new Error(payload?.error || 'La transcripción superó el tiempo límite. Reintenta.');
      throw new Error(payload?.error || 'No se pudo transcribir el audio.');
    }
    if (!data?.ok || !data.texto) throw new Error(data?.error || 'La transcripción llegó vacía.');
    return data.texto;
  } catch (error) {
    if (/fetch|network|failed to load|sin conexión/i.test(String(error?.message || ''))) throw new Error('Sin conexión. Conservé el audio para reintentar.');
    if (error?.message) throw error;
    throw new Error('Sin conexión. Conservé el audio para reintentar.');
  }
}
