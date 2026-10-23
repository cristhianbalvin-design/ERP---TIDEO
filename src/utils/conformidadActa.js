// Reglas de la firma del cliente por enlace (acta móvil con conformidad pendiente).
// La base de datos vuelve a validar todo en firmar_conformidad_acta.

export const documentoValido = valor => /^[0-9A-Za-z-]{6,15}$/.test(String(valor ?? '').trim());

// Devuelve el primer motivo que impide firmar, o '' si el formulario está completo.
export function faltanteConformidad({ resultado, observaciones, nombre, documento, firma }) {
  if (!['conforme', 'observaciones'].includes(resultado)) return 'Elige si das conformidad o conformidad con observaciones.';
  if (resultado === 'observaciones' && !String(observaciones ?? '').trim()) return 'Escribe tus observaciones.';
  if (String(nombre ?? '').trim().length < 3) return 'Escribe tu nombre completo.';
  if (!documentoValido(documento)) return 'Revisa tu documento (6 a 15 caracteres, sin espacios).';
  if (!firma) return 'Falta tu firma.';
  return '';
}

export function payloadFirma(token, form, dispositivo) {
  return {
    accion: 'firmar',
    token,
    resultado: form.resultado,
    observaciones: form.resultado === 'observaciones' ? String(form.observaciones || '').trim() : null,
    nombre: String(form.nombre || '').trim(),
    documento: String(form.documento || '').trim().toUpperCase(),
    cargo: String(form.cargo || '').trim() || null,
    firma: form.firma,
    dispositivo,
  };
}

export function datosDispositivoCliente(entorno = globalThis) {
  const nav = entorno?.navigator || {};
  const pantalla = entorno?.screen || {};
  let zona = null;
  try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { zona = null; }
  return {
    user_agent: String(nav.userAgent || '').slice(0, 400) || null,
    plataforma: nav.userAgentData?.platform || nav.platform || null,
    idioma: nav.language || null,
    zona_horaria: zona,
    pantalla: pantalla.width && pantalla.height ? `${pantalla.width}x${pantalla.height}` : null,
    tactil: Number(nav.maxTouchPoints) > 0,
    hora_dispositivo: new Date().toISOString(),
  };
}

export const ESTADOS_ENLACE = ['cargando', 'pendiente', 'firmada', 'vencido', 'invalido', 'legacy', 'error'];
export const estadoEnlace = respuesta => (ESTADOS_ENLACE.includes(respuesta?.estado) ? respuesta.estado : 'error');

export const formatoFechaHora = valor => {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(fecha);
};

export const formatoFecha = valor => {
  if (!valor) return '';
  const solo = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }).format(fecha);
};

export const iniciales = nombre => String(nombre || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'AC';
