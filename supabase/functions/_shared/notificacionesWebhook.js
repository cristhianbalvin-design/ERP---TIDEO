const ESTADOS_VALIDOS = new Set(['sent', 'delivered', 'read', 'failed']);

export function compararConstanteTiempo(actual, esperado) {
  const a = String(actual ?? '');
  const b = String(esperado ?? '');
  const longitud = Math.max(a.length, b.length);
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < longitud; i += 1) {
    diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferencia === 0;
}

export function extraerEstadosWhatsApp(body) {
  let payload = body;
  if (typeof body === 'string') {
    try { payload = JSON.parse(body); } catch { return []; }
  }
  const estados = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      for (const status of Array.isArray(change?.value?.statuses) ? change.value.statuses : []) {
        const id = typeof status?.id === 'string' ? status.id : '';
        const timestamp = Number(status?.timestamp);
        if (!id || !ESTADOS_VALIDOS.has(status?.status) || !Number.isFinite(timestamp)) continue;
        const momento = new Date(timestamp * 1000);
        if (!Number.isFinite(momento.getTime())) continue;
        estados.push({
          id,
          estado: status.status,
          momento: momento.toISOString(),
          error: status.status === 'failed' ? textoErrorWhatsApp(status) : null,
        });
      }
    }
  }
  return estados;
}

export function textoErrorWhatsApp(status) {
  const error = Array.isArray(status?.errors) ? status.errors[0] : null;
  if (!error) return '';
  const partes = [error.code, error.title, error.message]
    .filter(value => value !== null && value !== undefined && String(value).trim())
    .map(value => String(value).trim());
  return partes.join(' · ').slice(0, 500);
}

export async function verificarFirmaWhatsApp(cuerpo, encabezado, secreto) {
  if (!secreto || typeof encabezado !== 'string') return false;
  const match = encabezado.match(/^sha256=([0-9a-f]{64})$/i);
  if (!match) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(cuerpo)));
  const hexadecimal = [...firma].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return compararConstanteTiempo(hexadecimal, match[1].toLowerCase());
}
