// F3b · Avance de la OF por partes. Las reglas viven en la base de datos (of_registrar_parte,
// of_revisar_parte); aquí solo la validación previa del formulario y los resúmenes de pantalla.

export const ESTADOS_AVANCE = ['aprobada', 'en_produccion'];
export const ESTADOS_PARTES = ['aprobada', 'en_produccion', 'en_calidad', 'lista_entrega', 'entregada', 'cerrada'];
export const ETIQUETA_PARTE = { en_revision: 'Por aprobar', aprobado: 'Aprobado', observado: 'Observado' };
export const CAMPOS_AVANCE = ['operacion_id', 'tecnico_id', 'fecha', 'horas', 'avance'];

const num = v => Number(String(v ?? '').trim().replace(',', '.'));
const dosDecimales = v => /^\d+([.,]\d{1,2})?$/.test(String(v ?? '').trim());
const r2 = n => Math.round(n * 100) / 100;

export function hoyISO(fecha = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

export const avanceVacio = () => ({ operacion_id: '', tecnico_id: '', fecha: hoyISO(), horas: '', avance: '', detalle: '' });

export function validarAvance(form, hoy = hoyISO()) {
  const e = {};
  if (!form.operacion_id) e.operacion_id = 'Elige la operación.';
  if (!form.tecnico_id) e.tecnico_id = 'Elige el técnico.';
  if (!form.fecha) e.fecha = 'Indica la fecha.';
  else if (form.fecha > hoy) e.fecha = 'La fecha no puede ser futura.';
  if (String(form.horas ?? '').trim() === '') e.horas = 'Indica las horas.';
  else if (!dosDecimales(form.horas)) e.horas = 'Usa un número con máximo 2 decimales.';
  else if (num(form.horas) <= 0 || num(form.horas) > 24) e.horas = 'Debe estar entre 0 y 24.';
  if (String(form.avance ?? '').trim() === '') e.avance = 'Indica el avance.';
  else if (!dosDecimales(form.avance) || num(form.avance) > 100) e.avance = 'De 0 a 100, con máximo 2 decimales.';
  return e;
}

export const datosAvance = form => ({
  operacion_id: form.operacion_id,
  tecnico_id: form.tecnico_id,
  fecha: form.fecha,
  horas: String(num(form.horas)),
  avance: String(num(form.avance)),
  detalle: String(form.detalle || '').trim(),
});

// Revisión: el avance validado y la observación obligatoria al observar o al cambiar lo reportado.
export function validarRevision(accion, form, parte) {
  const e = {};
  const obs = String(form.observacion || '').trim();
  if (accion === 'observar') {
    if (!obs) e.observacion = 'Indica qué hay que corregir.';
    return e;
  }
  if (String(form.avance ?? '').trim() === '' || !dosDecimales(form.avance) || num(form.avance) > 100) {
    e.avance = 'De 0 a 100, con máximo 2 decimales.';
  } else if (num(form.avance) !== Number(parte?.avance_reportado) && !obs) {
    e.observacion = 'Indica por qué cambias el avance reportado.';
  }
  return e;
}

// Ayuda bajo el selector de operación: estimado, horas acumuladas y avance actual.
export function textoOperacion(op) {
  if (!op) return '';
  return `Estimado: ${op.horas} h · lleva ${op.horas_reales} h · avance ${Math.round(op.avance_pct)} %`;
}

export function resumenProduccion(of, partes = []) {
  const ops = of?.operaciones || [];
  return {
    avance: Math.round(Number(of?.avance_pct) || 0),
    horasReales: r2(ops.reduce((s, o) => s + (o.horas_reales || 0), 0)),
    horasEstimadas: r2(ops.reduce((s, o) => s + (o.horas || 0), 0)),
    porAprobar: partes.filter(p => p.estado === 'en_revision').length,
    manoObra: r2(partes.filter(p => p.estado === 'aprobado').reduce((s, p) => s + (p.costo || 0), 0)),
    materiales: r2((of?.materiales || []).reduce((s, m) => s + (m.cantidad_real || 0) * (m.costo_unitario || 0), 0)),
  };
}

// F3c · Reserva WMS por material de stock: etiquetas de la columna «Reserva y despacho».
const cant = (n, unidad) => `${r2(n)} ${unidad || 'und'}`;
export function etiquetasReserva(reserva, unidad) {
  if (!reserva || !reserva.en_pedido) return [{ tono: 'gray', texto: 'Sin reserva' }];
  const t = [];
  if (reserva.despachada > 0) t.push({ tono: 'ok', texto: `Despachado ${cant(reserva.despachada, unidad)}` });
  if (reserva.reservada > 0) t.push({ tono: 'blue', texto: `Reservado ${cant(reserva.reservada, unidad)} · por despachar` });
  if (reserva.faltante > 0) t.push({ tono: 'warn', texto: `Falta ${cant(reserva.faltante, unidad)}${reserva.solpe ? ` · SOLPE ${reserva.solpe}` : ''}` });
  return t;
}

export function resumenReservas(reservas) {
  const lineas = (reservas?.lineas || []).filter(l => l.en_pedido);
  return {
    total: lineas.length,
    completas: lineas.filter(l => l.faltante <= 0).length,
    faltantes: lineas.filter(l => l.faltante > 0),
  };
}
