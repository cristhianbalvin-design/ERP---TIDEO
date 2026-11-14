import { hoyISO } from './ofAvanceLogic.js';

export const SITUACIONES = { vigente: ['Vigente', 'green'], vence_pronto: ['Vence pronto', 'amber'], con_reclamo: ['Con reclamo', 'cyan'], vencida: ['Vencida', 'gray'], anulada: ['Anulada', 'red'] };
export const ESTADOS_RECLAMO = { abierto: ['Abierto', 'amber'], en_reparacion: ['En reparación', 'cyan'], cerrado: ['Cerrado', 'green'], rechazado: ['Rechazado', 'red'] };
export const etiquetaEvaluacion = valor => ({ pendiente: 'Pendiente de evaluar', procede: 'Procede', no_procede: 'No procede' })[valor] || valor || 'Sin dato';
export const etiquetaEstadoGarantia = valor => ({ vigente: 'Vigente', anulada: 'Anulada' })[valor] || valor || 'Sin dato';
export const etiquetaSituacion = valor => SITUACIONES[valor]?.[0] || valor || 'Sin dato';
export const tonoSituacion = valor => SITUACIONES[valor]?.[1] || 'gray';
export const etiquetaReclamo = valor => ESTADOS_RECLAMO[valor]?.[0] || valor || 'Sin dato';
export const tonoReclamo = valor => ESTADOS_RECLAMO[valor]?.[1] || 'gray';
export function filtrarGarantias(filas, texto, situacion) {
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terminos = normalizar(texto).trim().split(/\s+/).filter(Boolean);
  return (filas || []).filter(f => (!situacion || f.situacion === situacion) && terminos.every(t => normalizar([f.numero, f.serie, f.cliente, f.of_numero, f.descripcion, f.reclamo?.numero].join(' ')).includes(t)));
}
export function validarReclamo(f, garantia = {}, hoy = hoyISO()) {
  const e = {};
  if (!f.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) || Number.isNaN(Date.parse(f.fecha)) || new Date(`${f.fecha}T00:00:00Z`).toISOString().slice(0, 10) !== f.fecha) e.fecha = 'Indica una fecha válida.';
  else if (f.fecha > hoy) e.fecha = 'La fecha no puede ser futura.';
  else if (garantia.fecha_inicio && f.fecha < garantia.fecha_inicio) e.fecha = 'La fecha es anterior al inicio de la garantía.';
  else if (f.evaluacion === 'procede' && garantia.fecha_fin && f.fecha > garantia.fecha_fin) e.fecha = 'La garantía había vencido en esa fecha.';
  if (!['pendiente', 'procede', 'no_procede'].includes(f.evaluacion)) e.evaluacion = 'Elige una evaluación válida.';
  if (String(f.falla || '').trim().length < 5 || String(f.falla || '').trim().length > 2000) e.falla = 'Describe la falla con entre 5 y 2000 caracteres.';
  if (f.evaluacion === 'no_procede' && !String(f.observacion || '').trim()) e.observacion = 'Indica por qué no procede.';
  if ((f.fotos || []).length > 6) e.fotos = 'Agrega como máximo 6 fotos.';
  return e;
}
export const datosReclamo = (f, fotos, crearOf = false) => ({ fecha: f.fecha, falla: f.falla.trim(), evaluacion: f.evaluacion, observacion: f.observacion.trim(), fotos, crear_of: crearOf });
export function textoCostoPorMoneda(costos = {}) {
  const entradas = Object.entries(costos);
  return entradas.length ? entradas.map(([moneda, monto]) => `${moneda} ${Number(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' · ') : '0.00';
}
