// Lógica pura del acta de conformidad móvil (sin React ni Supabase).
// Las mismas reglas las vuelve a validar la RPC cerrar_ot_con_acta en el servidor.

export const PASOS_ACTA = ['Resumen', 'Fotos', 'Conformidad', 'Firma técnico', 'Firma cliente', 'Revisión'];
export const PASO_REVISION = PASOS_ACTA.length - 1;
export const MAX_FOTOS_ACTA = 6;
export const RESULTADOS_ACTA = ['conforme', 'observaciones', 'pendiente'];

const ESTADOS_PARTE_FINALIZADOS = new Set(['aprobado', 'rechazado']);
const ESTADOS_TAREA_CERRADA = new Set(['completada', 'cerrada_sin_completar']);

const texto = valor => String(valor ?? '').trim();

export const correoValido = valor => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto(valor));
export const documentoValido = valor => /^[0-9A-Za-z-]{6,15}$/.test(texto(valor));

export function resumenPartes(partes = []) {
  const estado = parte => String(parte?.estado || '').toLowerCase();
  const aprobados = partes.filter(parte => estado(parte) === 'aprobado');
  const pendientes = partes.filter(parte => !ESTADOS_PARTE_FINALIZADOS.has(estado(parte)));
  const horas = aprobados.reduce((total, parte) => total + Number(parte.horas_normales || 0) + Number(parte.horas_extra || 0), 0);
  const fechas = aprobados.map(parte => parte.fecha).filter(Boolean).sort();
  return { aprobados, pendientes, horas: Math.round(horas * 100) / 100, fechaInicio: fechas[0] || null, fechaFin: fechas[fechas.length - 1] || null };
}

// Misma regla que cerrar_ot_con_acta: técnico responsable, al menos un parte aprobado y ninguno pendiente.
export function reglaCierreOT(partes = [], ot = null) {
  const { aprobados, pendientes } = resumenPartes(partes);
  if (ot && !ot.tecnico_responsable_id) return { bloqueada: true, tono: 'gray', mensaje: 'Sin técnico responsable', accion: 'Asigna un técnico responsable a la OT antes de emitir el acta.' };
  if (pendientes.length) return { bloqueada: true, tono: 'amber', mensaje: `${pendientes.length} parte${pendientes.length === 1 ? '' : 's'} por aprobar`, accion: 'Aprueba sus partes diarios antes de emitir el acta.' };
  if (!aprobados.length) return { bloqueada: true, tono: 'gray', mensaje: 'Sin partes aprobados', accion: 'Aprueba sus partes diarios antes de emitir el acta.' };
  return { bloqueada: false, tono: 'green', mensaje: 'Lista para acta', accion: '' };
}

export const tareaCompleta = tarea => Boolean(tarea?.completada) || String(tarea?.estado || '').toLowerCase() === 'completada';

export function tareasIncompletas(tareas = []) {
  return tareas
    .filter(tarea => !tarea?.completada && !ESTADOS_TAREA_CERRADA.has(String(tarea?.estado || '').toLowerCase()))
    .map(tarea => ({ id: tarea.id }));
}

export const tipoCobroOT = (ot, os) => ot?.tipo_cobro || os?.tipo_cobro || 'puntual';
export const etiquetaTipoCobro = tipo => (tipo === 'recurrente_mensual' ? 'Recurrente mensual' : 'Servicio puntual');

export function contarFotos(fotos = []) {
  const antes = fotos.filter(foto => foto.tipo === 'antes').length;
  const despues = fotos.filter(foto => foto.tipo === 'despues').length;
  return { antes, despues, total: antes + despues };
}

// Devuelve el motivo por el que el paso no está completo, o '' si está listo.
export function faltantePaso(paso, estado) {
  const resultado = estado?.resultado || 'conforme';
  const cliente = estado?.cliente || {};
  if (paso === 0) {
    if (estado?.reglaCierre?.bloqueada) return estado.reglaCierre.accion || 'La OT necesita partes aprobados y ninguno pendiente.';
    if (!texto(estado?.descripcion)) return 'Describe el trabajo realizado.';
  }
  if (paso === 1) {
    if (estado?.subiendoFotos) return 'Espera a que terminen de subir las fotos.';
    const { antes, despues, total } = contarFotos(estado?.fotos);
    if (!antes || !despues) return 'Falta al menos una foto de antes y una de después.';
    if (total > MAX_FOTOS_ACTA) return `El acta admite hasta ${MAX_FOTOS_ACTA} fotos.`;
  }
  if (paso === 2) {
    if (!RESULTADOS_ACTA.includes(resultado)) return 'Elige el resultado de la conformidad.';
    if (resultado !== 'conforme' && !texto(estado?.observaciones)) return resultado === 'pendiente' ? 'Indica el motivo.' : 'Escribe las observaciones.';
  }
  if (paso === 3 && !estado?.firmaTecnico) return 'Falta la firma del técnico.';
  if (paso === 4) {
    if (resultado !== 'pendiente') {
      if (texto(cliente.nombre).length < 3) return 'Falta el nombre del cliente.';
      if (!documentoValido(cliente.documento)) return 'Revisa el documento del cliente.';
    }
    if (!correoValido(cliente.correo)) return 'Revisa el correo del cliente.';
    if (resultado !== 'pendiente' && !estado?.firmaCliente) return 'Falta la firma del cliente.';
  }
  return '';
}

export function primerPasoIncompleto(estado, hasta = PASO_REVISION) {
  for (let paso = 0; paso < hasta; paso += 1) {
    if (faltantePaso(paso, estado)) return paso;
  }
  return -1;
}

export const pasoBloqueado = (paso, estado) => primerPasoIncompleto(estado, paso) !== -1;

// Arma p_datos de cerrar_ot_con_acta. Las firmas ya deben estar subidas.
export function construirDatosActa(estado, { tareas = [], firmaTecnico, firmaCliente } = {}) {
  const resultado = estado.resultado || 'conforme';
  const cliente = estado.cliente || {};
  return {
    resultado,
    descripcion_trabajo: texto(estado.descripcion),
    observaciones: texto(estado.observaciones) || null,
    correo_cliente: texto(cliente.correo).toLowerCase(),
    tareas_incompletas: tareasIncompletas(tareas),
    evidencias: (estado.fotos || []).map(foto => ({
      tipo: foto.tipo,
      path: foto.path,
      sha256: foto.sha256,
      tomada_en: foto.tomada_en || null,
      geo: foto.geo || null,
    })),
    firma_tecnico: firmaTecnico,
    firma_cliente: resultado === 'pendiente' ? null : {
      nombre: texto(cliente.nombre),
      documento: texto(cliente.documento).toUpperCase(),
      cargo: texto(cliente.cargo) || null,
      ...firmaCliente,
    },
  };
}

// Datos del dispositivo que firma; la IP y la hora oficial las registra el servidor.
export function datosDispositivo(entorno = globalThis) {
  const nav = entorno?.navigator || {};
  const pantalla = entorno?.screen || {};
  let zona = null;
  try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { zona = null; }
  return {
    user_agent: String(nav.userAgent || '').slice(0, 400) || null,
    plataforma: nav.userAgentData?.platform || nav.platform || null,
    movil: typeof nav.userAgentData?.mobile === 'boolean' ? nav.userAgentData.mobile : null,
    idioma: nav.language || null,
    zona_horaria: zona,
    pantalla: pantalla.width && pantalla.height ? `${pantalla.width}x${pantalla.height}` : null,
    densidad: Number(entorno?.devicePixelRatio) || null,
    tactil: Number(nav.maxTouchPoints) > 0,
    hora_dispositivo: new Date().toISOString(),
  };
}

export function enmascararCorreo(valor) {
  const correo = texto(valor);
  if (!correo.includes('@')) return correo;
  const [nombre, dominio] = correo.split('@');
  return `${nombre.slice(0, 1)}***@${dominio}`;
}

// Borrador local: solo textos y rutas de fotos ya subidas. Las firmas no se guardan:
// si el asistente se retoma, se vuelve a firmar en ese momento.
export const claveBorradorActa = (empresaId, otId) => `opera.acta.borrador.${empresaId}.${otId}`;

export function serializarBorrador(estado) {
  return JSON.stringify({
    version: 1,
    borradorId: estado.borradorId,
    descripcion: estado.descripcion || '',
    resultado: estado.resultado || 'conforme',
    observaciones: estado.observaciones || '',
    cliente: { nombre: estado.cliente?.nombre || '', documento: estado.cliente?.documento || '', cargo: estado.cliente?.cargo || '', correo: estado.cliente?.correo || '' },
    fotos: (estado.fotos || []).map(({ tipo, path, sha256, tomada_en, geo }) => ({ tipo, path, sha256, tomada_en, geo })),
    guardado_en: new Date().toISOString(),
  });
}

export function leerBorrador(texto) {
  try {
    const data = JSON.parse(texto || '');
    if (!data || data.version !== 1 || !data.borradorId) return null;
    return {
      borradorId: String(data.borradorId),
      descripcion: String(data.descripcion || ''),
      resultado: RESULTADOS_ACTA.includes(data.resultado) ? data.resultado : 'conforme',
      observaciones: String(data.observaciones || ''),
      cliente: { nombre: '', documento: '', cargo: '', correo: '', ...(data.cliente || {}) },
      fotos: Array.isArray(data.fotos) ? data.fotos.filter(foto => foto?.path && foto?.sha256 && ['antes', 'despues'].includes(foto.tipo)) : [],
    };
  } catch {
    return null;
  }
}

export function mensajeErrorActa(error) {
  const mensaje = String(error?.message || error || '');
  const codigo = mensaje.match(/^(ACTA_[A-Z_]+):\s*(.*)$/s);
  if (codigo) return codigo[2] || mensaje;
  if (/row-level security|permission denied|not authorized/i.test(mensaje)) return 'No tienes permiso para esta acción.';
  if (/Failed to fetch|NetworkError|network/i.test(mensaje)) return 'Sin conexión. Revisa la señal y vuelve a intentarlo.';
  return mensaje || 'No se pudo completar la operación.';
}

export const formatoFecha = valor => {
  if (!valor) return '—';
  const soloFecha = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fecha = soloFecha ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3])) : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', ...(soloFecha ? {} : { timeZone: 'America/Lima' }) }).format(fecha);
};

export const formatoFechaHora = valor => {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(fecha);
};
