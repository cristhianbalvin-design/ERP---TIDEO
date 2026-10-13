export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 120;
export const AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/mpeg'];
export function validarAudio({ size, type }: { size: number; type: string }) {
  if (!Number.isFinite(size) || size <= 0) return { error: 'El audio está vacío.' };
  if (size > MAX_AUDIO_BYTES) return { error: 'El audio supera el máximo de 8 MB.' };
  const mime = String(type || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_MIME_TYPES.includes(mime)) return { error: 'Formato de audio no válido. Usa WebM, OGG, MP4, M4A, WAV o MPEG.' };
  return { value: { mime } };
}
export function validarIdioma(value: unknown) {
  if (value == null || value === '') return { value: 'es' };
  if (typeof value !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) return { error: 'El idioma no es válido.' };
  return { value: value.slice(0, 2).toLowerCase() };
}
export function validarDiagnosticoId(value: unknown) {
  return typeof value === 'string' && /^dt_[0-9a-f]{32}$/i.test(value);
}
