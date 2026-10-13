export const MAX_TEXTO_CARACTERES = 4000;
export const MAX_CONTEXTO_CARACTERES = 2000;

export function validarEntradaRedaccion(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'El cuerpo de la solicitud no es válido.' };
  const input = body as Record<string, unknown>;
  if (typeof input.diagnostico_id !== 'string' || !/^dt_[0-9a-f]{32}$/i.test(input.diagnostico_id)) return { error: 'El identificador del diagnóstico no es válido.' };
  if (typeof input.texto !== 'string' || !input.texto.trim()) return { error: 'Escribe un texto para mejorar.' };
  if (input.texto.length > MAX_TEXTO_CARACTERES) return { error: `El texto supera el máximo de ${MAX_TEXTO_CARACTERES} caracteres.` };
  if (input.contexto != null && (typeof input.contexto !== 'string' || input.contexto.length > MAX_CONTEXTO_CARACTERES)) return { error: `El contexto supera el máximo de ${MAX_CONTEXTO_CARACTERES} caracteres o no es válido.` };
  return { value: { diagnostico_id: input.diagnostico_id, texto: input.texto, contexto: typeof input.contexto === 'string' ? input.contexto.trim() : '' } };
}

export function sanearTextoMejorado(value: unknown) {
  return String(value ?? '').replace(/```[\s\S]*?\n|```/g, '').trim();
}
