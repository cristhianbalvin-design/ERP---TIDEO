export const TIPO_CONTRATO_LABELS = {
  plazo_fijo: 'Plazo fijo',
  indefinido: 'Indefinido',
  por_obra: 'Por obra o servicio',
};

export const MODALIDAD_TRABAJO_LABELS = {
  presencial: 'Presencial',
  remoto: 'Remoto',
  hibrido: 'Híbrido',
};

export const REGIMEN_JORNADA_LABELS = {
  general: 'General (8h/día estándar)',
  minero_14x7: 'Minero 14×7',
  minero_20x10: 'Minero 20×10',
  minero_28x14: 'Minero 28×14',
  minero_2x1: 'Minero 2×1',
  ciclo_acumulativo: 'Ciclo acumulativo',
  suspension_perfecta: 'Suspensión perfecta',
};

// Etiqueta breve y uniforme para pantallas operativas. No reutiliza la etiqueta
// contractual de `general` (que incluye la jornada estándar) para que Reporte,
// Resumen, Asistencia y Nómina muestren exactamente el mismo régimen.
const REGIMEN_JORNADA_LABELS_CORTOS = {
  general: 'General',
  minero_14x7: 'Minero 14×7',
  minero_20x10: 'Minero 20×10',
  minero_28x14: 'Minero 28×14',
  minero_2x1: 'Minero 2×1',
  ciclo_acumulativo: 'Minero (ciclo acumulativo)',
  suspension_perfecta: 'Suspensión perfecta',
};

const formatearTramoRegimen = (valor) => {
  const original = String(valor || '').trim();
  if (!original) return '—';
  const clave = original.toLowerCase();
  if (REGIMEN_JORNADA_LABELS_CORTOS[clave]) return REGIMEN_JORNADA_LABELS_CORTOS[clave];
  if (clave === 'minero') return 'Minero';
  return original;
};

export const formatearRegimenLabel = (regimen) => {
  const valor = String(regimen || '').trim();
  if (!valor) return '—';
  const mixto = valor.match(/^mixto\s*\((.*)\)$/i);
  if (!mixto) return formatearTramoRegimen(valor);
  const tramos = mixto[1].split(/\s*(?:→|->)\s*/).filter(Boolean).map(formatearTramoRegimen);
  return `Mixto (${tramos.join(' → ')})`;
};

export const MODALIDAD_CONTRATO_LABELS = {
  planilla: 'Planilla',
  honorarios: 'Honorarios',
};

export const ESTADO_VALIDACION_LABELS = {
  pendiente: 'En revisión',
  aprobado: 'Vigente',
  rechazado: 'Rechazado',
};

export const ESTADO_DOCUMENTO_LABELS = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  falta: 'Falta',
  en_revision: 'En revisión',
  rechazado: 'Rechazado',
  incompleto: 'Incompleto',
};

export const labelOr = (map, value) => map[value] ?? value;

export const diasRestantesDoc = (fechaVencimiento) => {
  if (!fechaVencimiento) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaVencimiento + 'T00:00:00');
  return Math.ceil((vence - hoy) / 86400000);
};
