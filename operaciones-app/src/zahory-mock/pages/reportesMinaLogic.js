// Lógica pura de Reportes de mina (sin React ni Supabase) para poder probarla.

export const DURACION_TURNO = 12;

export const CONTADORES = [
  { id: 'motor', etiqueta: 'Motor' },
  { id: 'percusion', etiqueta: 'Percusión' },
  { id: 'electrico', etiqueta: 'Eléctrico' },
];

// grupo: ht (trabajadas), prev (mantenimiento), corr (correctivo/accidente), sb (stand-by)
export const CAMPOS_HORAS = [
  { id: 'trabajadas', etiqueta: 'Trabajadas', grupo: 'ht' },
  { id: 'prev_programado', etiqueta: 'Prev. programado', grupo: 'prev' },
  { id: 'preventivo', etiqueta: 'Preventivo', grupo: 'prev' },
  { id: 'correctivo', etiqueta: 'Correctivo', grupo: 'corr' },
  { id: 'accidente', etiqueta: 'Accidente / otro', grupo: 'corr' },
  { id: 'standby', etiqueta: 'Stand-by', grupo: 'sb' },
];

export const TIPOS_MANTENIMIENTO = [
  { id: 'prev_programado', etiqueta: 'Prev. programado' },
  { id: 'preventivo', etiqueta: 'Preventivo' },
  { id: 'correctivo', etiqueta: 'Correctivo' },
  { id: 'accidente', etiqueta: 'Accidente' },
];

export const ESTADOS_EQUIPO = [
  { id: 'operativo', etiqueta: 'Operativo', tono: 'g', pill: 'is-green' },
  { id: 'espera', etiqueta: 'En espera', tono: 'a', pill: 'is-amber' },
  { id: 'inoperativo', etiqueta: 'Inoperativo', tono: 'r', pill: 'is-red' },
  { id: 'retorno', etiqueta: 'Retorno a taller', tono: 'v', pill: 'is-violet' },
];

export const LUBRICANTES_BASE = [
  { tipo: 'Aceite 15W-40', unidad: 'GAL' },
  { tipo: 'Aceite hidráulico HD-10W', unidad: 'GAL' },
  { tipo: 'Refrigerante', unidad: 'GAL' },
  { tipo: 'Grasa', unidad: 'LB' },
];

export const PRIORIDADES_BACKLOG = [
  { id: 'baja', etiqueta: 'Baja', pill: 'is-gray' },
  { id: 'media', etiqueta: 'Media', pill: 'is-amber' },
  { id: 'alta', etiqueta: 'Alta', pill: 'is-red' },
  { id: 'critica', etiqueta: 'Crítica', pill: 'is-red' },
];

export const ESTADOS_REPORTE = {
  borrador: { etiqueta: 'Borrador', pill: 'is-gray' },
  en_revision: { etiqueta: 'En revisión', pill: 'is-amber' },
  observado: { etiqueta: 'Observado', pill: 'is-red' },
  aprobado: { etiqueta: 'Aprobado', pill: 'is-green' },
  rechazado: { etiqueta: 'Rechazado', pill: 'is-red' },
};

export const FILTROS_ESTADO = [
  { id: '', etiqueta: 'todos' },
  { id: 'en_revision', etiqueta: 'en revisión' },
  { id: 'observado', etiqueta: 'observados' },
  { id: 'aprobado', etiqueta: 'aprobados' },
  { id: 'borrador', etiqueta: 'borradores' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function aNumero(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(',', '.');
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : NaN;
}

export function formatoNumero(valor, decimales = 2) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return numero.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function etiquetaTurno(turno) {
  return turno === 'noche' ? 'Noche' : 'Día';
}

export function fechaCorta(fecha) {
  const partes = String(fecha || '').slice(0, 10).split('-');
  if (partes.length !== 3) return '—';
  const mes = MESES[Number(partes[1]) - 1];
  return mes ? `${Number(partes[2])} ${mes}` : '—';
}

export function fechaLarga(fecha) {
  const partes = String(fecha || '').slice(0, 10).split('-');
  if (partes.length !== 3) return '—';
  return `${fechaCorta(fecha)} ${partes[0]}`;
}

export function hoyISO(ahora = new Date()) {
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function diferenciaHorometro(inicial, final) {
  const ini = aNumero(inicial);
  const fin = aNumero(final);
  if (ini === null || fin === null || Number.isNaN(ini) || Number.isNaN(fin)) return null;
  return Math.round((fin - ini) * 100) / 100;
}

export function resumenHoras(horas = {}, duracion = DURACION_TURNO) {
  const valor = id => {
    const numero = aNumero(horas[id]);
    return numero === null || Number.isNaN(numero) ? 0 : numero;
  };
  const grupos = { ht: 0, prev: 0, corr: 0, sb: 0 };
  let total = 0;
  CAMPOS_HORAS.forEach(campo => {
    const numero = valor(campo.id);
    grupos[campo.grupo] += numero;
    total += numero;
  });
  total = Math.round(total * 100) / 100;
  const mantenimiento = grupos.prev + grupos.corr;
  const dm = Math.max(0, (duracion - mantenimiento) / duracion * 100);
  return {
    total,
    grupos,
    mantenimiento: Math.round(mantenimiento * 100) / 100,
    dm: Math.round(dm * 10) / 10,
    cuadra: Math.abs(total - duracion) < 0.001,
  };
}

export function horometrosValidos(horometros = {}) {
  return CONTADORES.every(contador => {
    const dif = diferenciaHorometro(horometros[contador.id]?.inicial, horometros[contador.id]?.final);
    return dif === null || dif >= 0;
  });
}

export function formNuevo({ ot = null, tecnico = null, fecha = hoyISO() } = {}) {
  const ultimo = ot?.ultimo_reporte?.horometros || {};
  const horometros = {};
  CONTADORES.forEach(contador => {
    const previo = ultimo[contador.id]?.final;
    const inicial = previo ?? (contador.id === 'motor' ? ot?.horometro_actual : null);
    horometros[contador.id] = { inicial: inicial === null || inicial === undefined ? '' : String(inicial), final: '' };
  });
  const horas = {};
  CAMPOS_HORAS.forEach(campo => { horas[campo.id] = ''; });
  return {
    id: null,
    numero: null,
    estado: 'nuevo',
    ot_id: ot?.id || '',
    tecnico_id: tecnico?.id || '',
    fecha,
    turno: 'dia',
    supervisor_cliente: '',
    horometros,
    horas,
    tipos_mantenimiento: [],
    estado_equipo: '',
    motivo_retorno: '',
    actividad: '',
    avance_pct: Number(ot?.avance_pct || 0),
    repuestos: [],
    lubricantes: LUBRICANTES_BASE.map(lub => ({ ...lub, cantidad: '' })),
    pedido: [],
    backlog: [],
    evidencias: [],
    comentarios: '',
    observacion_revision: '',
  };
}

export function formDesdeReporte(reporte = {}) {
  const datos = reporte.datos_mina || {};
  const base = formNuevo({ fecha: reporte.fecha || hoyISO() });
  const horometros = {};
  CONTADORES.forEach(contador => {
    const h = datos.horometros?.[contador.id] || {};
    horometros[contador.id] = {
      inicial: h.inicial === null || h.inicial === undefined ? '' : String(h.inicial),
      final: h.final === null || h.final === undefined ? '' : String(h.final),
    };
  });
  const horas = {};
  CAMPOS_HORAS.forEach(campo => {
    const v = datos.horas?.[campo.id];
    horas[campo.id] = v === null || v === undefined ? '' : String(v);
  });
  const lubricantesGuardados = Array.isArray(datos.lubricantes) ? datos.lubricantes : [];
  const lubricantes = LUBRICANTES_BASE.map(lub => {
    const guardado = lubricantesGuardados.find(item => item.tipo === lub.tipo);
    return { ...lub, cantidad: guardado ? String(guardado.cantidad) : '' };
  });
  lubricantesGuardados
    .filter(item => !LUBRICANTES_BASE.some(lub => lub.tipo === item.tipo))
    .forEach(item => lubricantes.push({ tipo: item.tipo, unidad: item.unidad, cantidad: String(item.cantidad) }));
  return {
    ...base,
    id: reporte.id || null,
    numero: reporte.numero || null,
    estado: reporte.estado || 'borrador',
    ot_id: reporte.ot_id || '',
    tecnico_id: reporte.tecnico_id || '',
    turno: datos.turno || 'dia',
    supervisor_cliente: datos.supervisor_cliente || '',
    horometros,
    horas,
    tipos_mantenimiento: Array.isArray(datos.tipos_mantenimiento) ? datos.tipos_mantenimiento : [],
    estado_equipo: datos.estado_equipo || '',
    motivo_retorno: datos.motivo_retorno || '',
    actividad: reporte.actividad || '',
    avance_pct: Number(reporte.avance_pct || 0),
    repuestos: (reporte.materiales || []).filter(m => m.tipo === 'repuesto').map(m => ({
      material_id: m.material_id, codigo: m.item_id, descripcion: m.descripcion, unidad: m.unidad,
      cantidad: String(m.cantidad ?? ''), costo_unitario: m.costo_unitario ?? 0,
    })),
    lubricantes,
    pedido: (datos.pedido || []).map(p => ({ ...p, cantidad: String(p.cantidad ?? '') })),
    backlog: (datos.backlog || []).map(b => ({ ...b })),
    evidencias: Array.isArray(reporte.evidencias) ? reporte.evidencias : [],
    comentarios: datos.comentarios || '',
  };
}

export function validarReporte(form, { enviar = false, duracion = DURACION_TURNO, requiereTecnico = false } = {}) {
  if (!form.ot_id) return 'Selecciona la orden de trabajo.';
  if (requiereTecnico && !form.tecnico_id) return 'Selecciona el técnico del reporte.';
  if (!form.fecha) return 'Ingresa la fecha del reporte.';
  for (const contador of CONTADORES) {
    const h = form.horometros?.[contador.id] || {};
    const ini = aNumero(h.inicial);
    const fin = aNumero(h.final);
    if (Number.isNaN(ini) || Number.isNaN(fin)) return `El horómetro ${contador.etiqueta.toLowerCase()} no es un número válido.`;
    if ((ini !== null && ini < 0) || (fin !== null && fin < 0)) return 'Los horómetros no pueden ser negativos.';
    if (ini !== null && fin !== null && fin < ini) return `El horómetro ${contador.etiqueta.toLowerCase()} final no puede ser menor que el inicial.`;
    if (enviar && contador.id === 'motor' && (ini === null || fin === null)) return 'Ingresa el horómetro de motor inicial y final.';
    if (enviar && (ini === null) !== (fin === null)) return `Completa el horómetro ${contador.etiqueta.toLowerCase()} inicial y final, o deja ambos vacíos.`;
  }
  for (const campo of CAMPOS_HORAS) {
    const valor = aNumero(form.horas?.[campo.id]);
    if (Number.isNaN(valor)) return `Las horas de ${campo.etiqueta.toLowerCase()} no son un número válido.`;
    if (valor !== null && (valor < 0 || valor > duracion)) return `Las horas de ${campo.etiqueta.toLowerCase()} deben estar entre 0 y ${duracion}.`;
  }
  const resumen = resumenHoras(form.horas, duracion);
  if (enviar && !resumen.cuadra) return `Las horas del turno deben sumar ${duracion} h (hoy suman ${formatoNumero(resumen.total)}).`;
  if (enviar && !form.estado_equipo) return 'Indica el estado del equipo al cierre.';
  if (enviar && form.estado_equipo === 'retorno' && !String(form.motivo_retorno || '').trim()) return 'Indica el motivo del retorno a taller.';
  if (enviar && !String(form.actividad || '').trim()) return 'Describe los trabajos realizados.';
  const lineas = [['repuestos', 'repuesto utilizado'], ['pedido', 'repuesto del pedido']];
  for (const [clave, nombre] of lineas) {
    const vistos = new Set();
    for (const linea of form[clave] || []) {
      if (!linea.material_id) return `Selecciona el material de cada ${nombre}.`;
      const cantidad = aNumero(linea.cantidad);
      if (cantidad === null || Number.isNaN(cantidad) || cantidad <= 0) return `La cantidad de ${linea.codigo || nombre} debe ser mayor a cero.`;
      if (clave === 'pedido' && Math.abs(cantidad * 100 - Math.round(cantidad * 100)) > 1e-8) return 'La cantidad pedida admite hasta 2 decimales.';
      if (vistos.has(linea.material_id)) return `No repitas ${linea.codigo || 'el mismo material'} en la lista.`;
      vistos.add(linea.material_id);
    }
  }
  for (const lub of form.lubricantes || []) {
    const cantidad = aNumero(lub.cantidad);
    if (Number.isNaN(cantidad) || (cantidad !== null && cantidad < 0)) return `La cantidad de ${lub.tipo} no es válida.`;
  }
  for (const item of form.backlog || []) {
    if (!String(item.descripcion || '').trim()) return 'Cada hallazgo del backlog necesita una descripción.';
  }
  return '';
}

export function armarPayload(form) {
  return {
    id: form.id || undefined,
    ot_id: form.ot_id,
    tecnico_id: form.tecnico_id || undefined,
    fecha: form.fecha,
    turno: form.turno,
    supervisor_cliente: form.supervisor_cliente,
    horometros: form.horometros,
    horas: form.horas,
    tipos_mantenimiento: form.tipos_mantenimiento,
    estado_equipo: form.estado_equipo || null,
    motivo_retorno: form.estado_equipo === 'retorno' ? form.motivo_retorno : null,
    actividad: form.actividad,
    avance_pct: Number(form.avance_pct || 0),
    repuestos: (form.repuestos || []).map(r => ({ material_id: r.material_id, cantidad: r.cantidad, unidad: r.unidad, costo_unitario: r.costo_unitario ?? 0 })),
    lubricantes: (form.lubricantes || []).map(l => ({ tipo: l.tipo, unidad: l.unidad, cantidad: l.cantidad })),
    pedido: (form.pedido || []).map(p => ({ material_id: p.material_id, cantidad: p.cantidad, urgente: Boolean(p.urgente) })),
    backlog: (form.backlog || []).map(b => ({ descripcion: b.descripcion, detalle: b.detalle || '', prioridad: b.prioridad || 'media' })),
    evidencias: form.evidencias || [],
    comentarios: form.comentarios,
  };
}

export function textoEquipo(item = {}) {
  const partes = [item.equipo_codigo, [item.equipo_marca, item.equipo_modelo].filter(Boolean).join(' ') || item.equipo_nombre].filter(Boolean);
  return partes.join(' · ') || 'Sin equipo';
}

export function contarPorEstado(reportes = []) {
  const conteo = { '': reportes.length };
  reportes.forEach(r => { conteo[r.estado] = (conteo[r.estado] || 0) + 1; });
  return conteo;
}

export function filtrarReportes(reportes = [], { estado = '', mina = '', turno = '', busqueda = '' } = {}) {
  const q = busqueda.trim().toLocaleLowerCase('es-PE');
  return reportes.filter(r => {
    if (estado && r.estado !== estado) return false;
    if (mina && r.mina_id !== mina) return false;
    if (turno && (r.datos_mina?.turno || 'dia') !== turno) return false;
    if (!q) return true;
    const texto = [r.numero, r.ot_numero, textoEquipo(r), r.tecnico_nombre, r.mina_nombre, r.proyecto_codigo]
      .filter(Boolean).join(' ').toLocaleLowerCase('es-PE');
    return texto.includes(q);
  });
}

export function minasDeReportes(reportes = []) {
  const mapa = new Map();
  reportes.forEach(r => { if (r.mina_id && !mapa.has(r.mina_id)) mapa.set(r.mina_id, r.mina_nombre || r.mina_id); });
  return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function puedeEditar(reporte, permisos = {}) {
  if (!reporte) return false;
  if (!['borrador', 'observado'].includes(reporte.estado)) return false;
  return Boolean(reporte.es_propio || permisos.editar);
}

export function mapearErrorReporte(error) {
  const mensaje = String(error?.message || error || '').trim();
  if (!mensaje) return 'No se pudo completar la acción. Intenta de nuevo.';
  if (/permiso/i.test(mensaje) && /partes/i.test(mensaje)) return 'Tu rol no tiene permiso para esta acción sobre reportes de mina.';
  if (/Failed to fetch|NetworkError/i.test(mensaje)) return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  return mensaje;
}
