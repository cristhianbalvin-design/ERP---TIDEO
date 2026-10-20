import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function listarNotificacionesConfig(empresaId) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_config_listar', { p_empresa_id: empresaId });
}

export async function guardarNotificacionConfig({ empresaId, evento, activo, parametros, destinatarios }) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_config_guardar', {
    p_empresa_id: empresaId, p_evento: evento, p_activo: activo,
    p_parametros: parametros, p_destinatarios: destinatarios,
  });
}

export async function listarEnviosNotificaciones(empresaId, limite = 100) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_envios_listar', { p_empresa_id: empresaId, p_limite: limite });
}

export async function ejecutarNotificacionesAhora(empresaId) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_ejecutar_ahora', { p_empresa_id: empresaId });
}

export function normalizarDiasAnticipacion(value) {
  const dias = Array.isArray(value) ? value.map(Number) : [];
  if (dias.length > 5) throw new RangeError('Se permiten como máximo 5 avisos.');
  if (dias.some(dia => !Number.isInteger(dia) || dia < 1 || dia > 180)) throw new RangeError('Cada aviso debe ser un entero entre 1 y 180 días.');
  if (new Set(dias).size !== dias.length) throw new RangeError('Los días de anticipación no se pueden repetir.');
  return dias.sort((a, b) => b - a);
}

export function validarUmbralMinutos(value) {
  const umbral = Number(value);
  if (!Number.isInteger(umbral) || umbral < 1 || umbral > 480) throw new RangeError('El umbral debe ser un entero entre 1 y 480 minutos.');
  return umbral;
}

export function construirMatrizDestinatarios(destinatarios = {}, rolesSoportados = [], canalesSoportados = []) {
  const roles = new Set(rolesSoportados.filter(rol => ['rrhh', 'jefe', 'colaborador'].includes(rol)));
  const canales = new Set(canalesSoportados.filter(canal => ['campana', 'correo'].includes(canal)));
  const matriz = {};
  for (const [rol, canalesRol] of Object.entries(destinatarios || {})) {
    if (!roles.has(rol) || !canalesRol || typeof canalesRol !== 'object') continue;
    const fila = {};
    for (const [canal, habilitado] of Object.entries(canalesRol)) {
      if (canales.has(canal)) fila[canal] = Boolean(habilitado);
    }
    if (Object.keys(fila).length) matriz[rol] = fila;
  }
  return matriz;
}

export function reglaTieneCambios(regla) {
  const original = regla?.__original;
  if (!original) return true;
  const actual = { activo: regla.activo, parametros: regla.parametros, destinatarios: regla.destinatarios };
  return JSON.stringify(actual) !== JSON.stringify(original);
}

export function etiquetaEstadoEnvio(envio = {}) {
  const estado = envio.estado;
  if (estado === 'enviado') return { etiqueta: 'Enviado', variante: 'on' };
  if (['pendiente', 'enviando'].includes(estado) && Number(envio.intentos) > 0) return { etiqueta: 'Reintentando', variante: 'warn' };
  if (estado === 'pendiente') return { etiqueta: 'Pendiente', variante: 'warn' };
  if (estado === 'enviando') return { etiqueta: 'Enviando', variante: 'warn' };
  if (estado === 'error') return { etiqueta: 'Error', variante: 'err' };
  if (estado === 'omitido') return { etiqueta: envio.motivo === 'sin_correo' || envio.motivo_omitido === 'sin_correo' || envio.ultimo_error === 'sin_correo' ? 'Omitido · sin correo' : 'Omitido', variante: 'off' };
  return { etiqueta: String(estado || 'Desconocido'), variante: 'off' };
}
