import { getSupabaseClient } from '../lib/supabaseClient.js';

// Envía la pregunta dictada a la Edge aria-transcribir y devuelve el texto para revisarlo antes de enviarlo a Aria.
export async function transcribirPreguntaAria({ empresaId, blob }) {
  const extension = blob?.type?.includes('mp4') ? 'mp4' : blob?.type?.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('empresa_id', empresaId);
  form.append('audio', blob, `pregunta.${extension}`);
  let respuesta;
  try {
    const supabase = await getSupabaseClient();
    respuesta = await supabase.functions.invoke('aria-transcribir', { body: form });
  } catch {
    throw Object.assign(new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.'), { status: 0 });
  }
  const { data, error } = respuesta;
  if (error) {
    let payload = data;
    try { if (!payload && error.context?.json) payload = await error.context.json(); } catch { /* respuesta sin JSON */ }
    const status = error.context?.status || error.status || 0;
    if (error.name === 'FunctionsFetchError') throw Object.assign(new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.'), { status: 0 });
    throw Object.assign(new Error(payload?.error || 'No pude entender la grabación. Inténtalo de nuevo.'), { status });
  }
  if (!data?.ok || !data.texto) throw Object.assign(new Error(data?.error || 'No pude entender la grabación. Inténtalo de nuevo.'), { status: 0 });
  return { texto: data.texto, restantes: Number.isFinite(data.transcripciones_restantes) ? data.transcripciones_restantes : null };
}
