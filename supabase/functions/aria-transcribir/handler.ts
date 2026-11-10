// Lógica de la Edge aria-transcribir: convierte en texto la pregunta que la persona le dicta a Aria.
// Sin dependencias de Deno para poder probarla con Node (handler.test.mjs).
// Exige sesión, que la persona pertenezca a la empresa y respeta el límite de 60 transcripciones al
// día (función aria_registrar_transcripcion, migración 674). No guarda el audio ni el texto.

export const ALLOWED_ORIGIN = 'https://erp.tideo.tech';
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/mpeg'];
export const OPENAI_TIMEOUT_MS = 30_000;
export const PROMPT = 'Transcribe fielmente en español peruano una consulta hablada a un sistema ERP. Vocabulario: tesorería, bancos, caja chica, cuentas por cobrar, cuentas por pagar, CxC, CxP, detracción, factura, boleta, proveedor, cliente, cotización, SOLPE, orden de compra, OC, orden de trabajo, OT, orden de fabricación, OF, almacén, kardex, repuestos, parte diario, hoja de ruta, viaje, centro de costo, soles, dólares. Conserva códigos, cifras y unidades. No añadas palabras que no se escuchen.';

type EnvReader = (name: string) => string | undefined;
type RpcResult = { data: unknown; error: unknown };
export type SupabaseLike = {
  auth: { getUser: (token: string) => Promise<{ data: { user: unknown } | null; error: unknown }> };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
};
export type HandlerDeps = {
  env: EnvReader;
  createSupabase: (token: string) => SupabaseLike;
  fetch: typeof fetch;
  timeoutMs?: number;
};

export function allowedOrigins(extra: string | undefined): Set<string> {
  const allowed = new Set([ALLOWED_ORIGIN]);
  for (const entry of (extra ?? '').split(',')) {
    const value = entry.trim();
    if (!value || allowed.size >= 6) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.origin === value) allowed.add(value);
    } catch { /* Las entradas no válidas se ignoran. */ }
  }
  return allowed;
}

export function corsHeaders(origin: string | null, origins: Set<string>): Record<string, string> {
  return {
    ...(origin !== null && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' } : {}),
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export function validarAudio({ size, type }: { size: number; type: string }): { value: { mime: string } } | { error: string } {
  if (!Number.isFinite(size) || size <= 0) return { error: 'La grabación está vacía.' };
  if (size > MAX_AUDIO_BYTES) return { error: 'La grabación supera el máximo permitido. Graba hasta 60 segundos.' };
  const mime = String(type || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_MIME_TYPES.includes(mime)) return { error: 'Formato de audio no válido.' };
  return { value: { mime } };
}

export const validarEmpresaId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(value);

const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Sin voz en el audio, el modelo puede devolver el propio prompt (o parte de él) como "transcripción".
export function esEcoDelPrompt(texto: string, prompt: string = PROMPT): boolean {
  const t = normalizar(texto);
  if (!t) return true;
  if (/transcribe fielmente|consulta hablada a un sistema|conserva codigos|no anadas palabras/.test(t)) return true;
  const palabrasPrompt = new Set(normalizar(prompt).split(' ').filter(p => p.length > 3));
  const palabras = t.split(' ').filter(p => p.length > 3);
  if (palabras.length < 8) return false;
  return palabras.filter(p => palabrasPrompt.has(p)).length / palabras.length >= 0.8;
}

export function createHandler(deps: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const origins = allowedOrigins(deps.env('ASISTENTE_ORIGENES_EXTRA'));
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: corsHeaders(origin, origins) });
    const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => reply(status, { ok: false, error, ...extra });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, origins) });
    if (req.method !== 'POST') return fail(405, 'Método no permitido.');
    const token = (req.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) return fail(401, 'Inicia sesión para continuar.');
    const openAiKey = deps.env('OPENAI_API_KEY');
    if (!openAiKey) return fail(502, 'El dictado no está disponible en este momento.');
    if (Number(req.headers.get('content-length') || 0) > MAX_AUDIO_BYTES + 64 * 1024) return fail(400, 'La grabación supera el máximo permitido. Graba hasta 60 segundos.');
    let form: FormData;
    try { form = await req.formData(); } catch { return fail(400, 'La grabación no es válida.'); }
    const empresaId = form.get('empresa_id');
    const file = form.get('audio');
    if (!validarEmpresaId(empresaId)) return fail(400, 'La empresa no es válida.');
    if (!(file instanceof File)) return fail(400, 'Adjunta la grabación.');
    const audio = validarAudio({ size: file.size, type: file.type });
    if ('error' in audio) return fail(400, audio.error);

    let supabase: SupabaseLike;
    try { supabase = deps.createSupabase(token); } catch { return fail(502, 'El dictado no está disponible en este momento.'); }
    let user: unknown = null;
    try { const { data, error } = await supabase.auth.getUser(token); if (!error) user = data?.user; } catch { /* sesión inválida */ }
    if (!user) return fail(401, 'Inicia sesión para continuar.');
    let cuota: { puede_continuar?: boolean; restante?: number } | null = null;
    try {
      const { data, error } = await supabase.rpc('aria_registrar_transcripcion', { p_empresa_id: empresaId, p_bytes: file.size });
      if (!error) cuota = (Array.isArray(data) ? data[0] : data) as typeof cuota;
    } catch { /* se trata abajo */ }
    if (!cuota) return fail(403, 'No tienes acceso a esta empresa.');
    if (cuota.puede_continuar !== true) return fail(429, 'Llegaste al límite de 60 dictados de hoy. Puedes seguir escribiendo tus preguntas.', { transcripciones_restantes: 0 });
    const restantes = Number.isFinite(Number(cuota.restante)) ? Number(cuota.restante) : undefined;

    const body = new FormData();
    body.append('file', file, file.name || `pregunta.${audio.value.mime.split('/')[1]}`);
    body.append('model', deps.env('OPENAI_MODEL_TRANSCRIPCION') || 'gpt-4o-mini-transcribe');
    body.append('language', 'es');
    body.append('temperature', '0');
    body.append('prompt', PROMPT);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? OPENAI_TIMEOUT_MS);
    try {
      const response = await deps.fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${openAiKey}` }, body });
      if (!response.ok) return fail(502, 'No se pudo entender la grabación. Inténtalo de nuevo.');
      const result = await response.json();
      const texto = String(result?.text || '').trim();
      if (!texto || esEcoDelPrompt(texto)) return fail(422, 'No se escuchó tu voz. Habla más cerca del micrófono e inténtalo de nuevo.');
      return reply(200, { ok: true, texto: texto.slice(0, 1000), ...(restantes !== undefined ? { transcripciones_restantes: restantes } : {}) });
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return fail(504, 'El dictado tardó demasiado. Inténtalo de nuevo.');
      return fail(502, 'No se pudo conectar con el servicio de dictado.');
    } finally { clearTimeout(timeout); }
  };
}
