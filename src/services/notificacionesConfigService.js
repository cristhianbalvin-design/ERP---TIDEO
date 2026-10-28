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

export async function listarTelefonosUsuariosNotificaciones(empresaId) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_telefonos_usuarios', { p_empresa_id: empresaId });
}

export async function listarRolesEmpresaNotificaciones(empresaId) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_roles_empresa', { p_empresa_id: empresaId });
}

export async function guardarTelefonoUsuarioNotificaciones(empresaId, userId, telefono) {
  const sb = await getSupabaseClient();
  return sb.rpc('notif_telefono_usuario_guardar', { p_empresa_id: empresaId, p_user_id: userId, p_telefono: telefono });
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

export function normalizarHoraEnvio(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})(?::00)?$/);
  if (!match) return null;
  const hora = Number(match[1]);
  const minutos = Number(match[2]);
  if (hora > 23 || minutos > 59 || minutos % 15 !== 0) return null;
  return `${String(hora).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

export function normalizarDiasVencidoMax(value) {
  const dias = Number(value);
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new RangeError('El rango debe ser un entero entre 1 y 365 días.');
  return dias;
}

export function normalizarCorreosAdicionales(value) {
  const correos = Array.isArray(value) ? value.map(correo => String(correo).trim().toLowerCase()).filter(Boolean) : [];
  if (correos.length > 10) throw new RangeError('Puedes agregar hasta 10 correos adicionales por evento.');
  if (correos.some(correo => !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(correo))) {
    throw new RangeError('Ingresa un correo válido.');
  }
  if (new Set(correos).size !== correos.length) throw new RangeError('Ese correo ya está agregado.');
  return correos;
}

export function normalizarTelefonoWhatsApp(value) {
  const telefonos = Array.isArray(value) ? value : [value];
  const normalizados = telefonos.map(telefono => {
    const entrada = String(telefono ?? '').trim();
    if (!entrada) return '';
    if (!/^\+?[\d\s().-]+$/.test(entrada)) throw new RangeError('Teléfono no válido. Usa un celular peruano de 9 dígitos que empiece con 9 o el formato internacional con +.');
    const digitos = entrada.replace(/\D/g, '');
    if (/^9\d{8}$/.test(digitos)) return `51${digitos}`;
    if (/^519\d{8}$/.test(digitos)) return digitos;
    if (entrada.startsWith('+') && digitos.length >= 10 && digitos.length <= 15) return digitos;
    throw new RangeError('Teléfono no válido. Usa un celular peruano de 9 dígitos que empiece con 9 o el formato internacional con +.');
  }).filter(Boolean);
  if (normalizados.length > 10) throw new RangeError('Puedes agregar hasta 10 teléfonos adicionales por evento.');
  if (new Set(normalizados).size !== normalizados.length) throw new RangeError('Ese teléfono ya está agregado.');
  return Array.isArray(value) ? normalizados : (normalizados[0] || '');
}

export function normalizarTelefonosAdicionales(value) {
  return normalizarTelefonoWhatsApp(Array.isArray(value) ? value : []);
}

export function etiquetaRolDestinatario(rol) {
  return ({ rrhh: 'RRHH', jefe: 'Jefe directo', colaborador: 'Colaborador', operaciones: 'Operaciones', correo_adicional: 'Correo adicional' })[rol] || String(rol || '');
}

export function etiquetaRolConfig(rol, evento) {
  if (rol === 'operaciones') return ['Operaciones', 'Administradores y roles con acceso a OTs y Partes Diarios'];
  if (rol === 'jefe' && evento === 'partes_no_llenados') return ['Jefe directo del técnico', 'Solo las OTs de su equipo'];
  return ({
    rrhh: ['RRHH y administradores', evento === 'tardanza_resumen_diario' ? 'Resumen de toda la empresa' : 'Todos los usuarios con rol RRHH o administrador'],
    jefe: ['Jefe directo', evento === 'tardanza_resumen_diario' ? 'Solo las tardanzas de su equipo' : 'Según el organigrama del colaborador'],
    colaborador: ['Colaborador', 'Solo si tiene usuario en el ERP'],
  })[rol] || null;
}

export function etiquetaModuloNotificacion(modulo) {
  return ({ rrhh: 'RRHH', asistencia: 'Asistencia', operaciones: 'Operaciones' })[modulo] || 'Asistencia';
}

export function etiquetaCanalEnvio(canal) {
  return ({ whatsapp: 'WhatsApp', correo: 'Correo', campana: 'Campana' })[canal] || String(canal || '');
}

export function construirMatrizDestinatarios(destinatarios = {}, rolesSoportados = [], canalesSoportados = []) {
  const roles = new Set(rolesSoportados.filter(rol => ['rrhh', 'jefe', 'colaborador', 'operaciones'].includes(rol)));
  const canales = new Set(canalesSoportados.filter(canal => ['campana', 'correo', 'whatsapp'].includes(canal)));
  const matriz = {};
  for (const [rol, canalesRol] of Object.entries(destinatarios || {})) {
    if (!roles.has(rol) || !canalesRol || typeof canalesRol !== 'object') continue;
    const fila = {};
    for (const [canal, habilitado] of Object.entries(canalesRol)) {
      if (canales.has(canal)) fila[canal] = Boolean(habilitado);
    }
    if (Object.keys(fila).length) matriz[rol] = fila;
  }
  matriz.correos_adicionales = normalizarCorreosAdicionales(destinatarios?.correos_adicionales);
  if (canales.has('whatsapp')) matriz.telefonos_adicionales = normalizarTelefonosAdicionales(destinatarios?.telefonos_adicionales);
  for (const clave of ['roles_rrhh', 'roles_operaciones']) {
    if (Array.isArray(destinatarios?.[clave])) matriz[clave] = [...new Set(destinatarios[clave].map(String))].sort((a, b) => a.localeCompare(b));
  }
  return matriz;
}

export function rolesSeleccionados(destinatarios = {}, clave, roles = []) {
  if (Array.isArray(destinatarios?.[clave])) return [...new Set(destinatarios[clave].map(String))].sort((a, b) => a.localeCompare(b));
  const propiedadAuto = clave === 'roles_rrhh' ? 'auto_rrhh' : clave === 'roles_operaciones' ? 'auto_operaciones' : null;
  return propiedadAuto ? roles.filter(rol => rol.es_admin || rol[propiedadAuto]).map(rol => String(rol.id)).sort((a, b) => a.localeCompare(b)) : [];
}

export function alternarRol(lista = [], id) {
  const seleccionados = new Set((Array.isArray(lista) ? lista : []).map(String));
  const rolId = String(id);
  if (seleccionados.has(rolId)) seleccionados.delete(rolId);
  else seleccionados.add(rolId);
  return [...seleccionados].sort((a, b) => a.localeCompare(b));
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
  if (estado === 'simulado') return { etiqueta: 'Simulado (sin credenciales)', variante: 'off' };
  if (['pendiente', 'enviando'].includes(estado) && Number(envio.intentos) > 0) return { etiqueta: 'Reintentando', variante: 'warn' };
  if (estado === 'pendiente') return { etiqueta: 'Pendiente', variante: 'warn' };
  if (estado === 'enviando') return { etiqueta: 'Enviando', variante: 'warn' };
  if (estado === 'error') return { etiqueta: 'Error', variante: 'err' };
  if (estado === 'omitido') return { etiqueta: envio.motivo === 'sin_correo' || envio.motivo_omitido === 'sin_correo' || envio.ultimo_error === 'sin_correo' ? 'Omitido · sin correo' : 'Omitido', variante: 'off' };
  return { etiqueta: String(estado || 'Desconocido'), variante: 'off' };
}
