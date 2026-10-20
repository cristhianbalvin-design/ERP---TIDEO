import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAnonKey } from '../_shared/supabaseKeys.ts';
import { MAX_AUDIO_BYTES, esEcoDelPrompt, validarAudio, validarDiagnosticoId, validarIdioma } from './transcribirAudio.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => json(status, { ok: false, error });
const PROMPT = 'Transcribe fielmente en español técnico de mantenimiento industrial. Vocabulario del dominio: cilindro hidráulico, tapa, válvula hidráulica, bomba de engranajes, vástago, retén, camisa, overhaul, torque, pistón, sello, fuga, holgura, desgaste, presión, caudal, rodamiento, eje, acople y empaquetadura. Conserva códigos, cifras y unidades. No añadas ni completes palabras que no se escuchen.';

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');
  const token = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return fail(401, 'Inicia sesión para continuar.');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = getSupabaseAnonKey();
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!url || !anonKey || !openAiKey) return fail(502, 'El servicio de transcripción no está disponible.');
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) return fail(400, 'El audio supera el máximo de 8 MB.');
  let form: FormData;
  try { form = await req.formData(); } catch { return fail(400, 'El formulario de audio no es válido.'); }
  const diagnosticoId = form.get('diagnostico_id');
  const idioma = validarIdioma(form.get('idioma'));
  const file = form.get('audio');
  if (!validarDiagnosticoId(diagnosticoId)) return fail(400, 'El identificador del diagnóstico no es válido.');
  if ('error' in idioma) return fail(400, idioma.error);
  if (!(file instanceof File)) return fail(400, 'Adjunta un archivo de audio.');
  const audio = validarAudio({ size: file.size, type: file.type });
  if ('error' in audio) return fail(400, audio.error);

  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return fail(401, 'Inicia sesión para continuar.');
  const { data: diagnostico, error: diagnosticoError } = await supabase.from('diagnosticos_tecnicos').select('id,empresa_id').eq('id', diagnosticoId).maybeSingle();
  if (diagnosticoError || !diagnostico) return fail(404, 'No se encontró el diagnóstico.');
  for (const pantalla of ['diagnostico_tecnico', 'informe_diagnostico']) {
    const { data: allowed, error } = await supabase.rpc('usuario_puede', { target_empresa_id: diagnostico.empresa_id, target_pantalla: pantalla, target_accion: 'editar' });
    if (error || !allowed) return fail(403, 'No tienes permiso para editar el diagnóstico.');
  }
  const body = new FormData();
  body.append('file', file, file.name || `grabacion.${audio.value.mime.split('/')[1]}`);
  body.append('model', Deno.env.get('OPENAI_MODEL_TRANSCRIPCION') || 'gpt-4o-mini-transcribe');
  body.append('language', idioma.value);
  body.append('temperature', '0');
  body.append('prompt', PROMPT);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${openAiKey}` }, body });
    if (!response.ok) return fail(502, 'No se pudo transcribir el audio. Inténtalo de nuevo.');
    const result = await response.json();
    const texto = String(result.text || '').trim();
    if (!texto) return fail(502, 'La transcripción llegó vacía. Inténtalo de nuevo.');
    if (esEcoDelPrompt(texto, PROMPT)) return fail(422, 'No se detectó voz en la grabación. Habla más cerca del micrófono e inténtalo de nuevo.');
    return json(200, { ok: true, texto });
  } catch (error) {
    if (error?.name === 'AbortError') return fail(504, 'La transcripción tardó más de 30 segundos. Puedes reintentar.');
    return fail(502, 'No se pudo conectar con el servicio de transcripción.');
  } finally { clearTimeout(timeout); }
});
