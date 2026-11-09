export const fechaVisible = (fecha) => fecha.split('-').reverse().join('/');
export const ratio = (numerador, denominador) =>
  Number(denominador) ? (100 * Number(numerador)) / Number(denominador) : null;
export const porcentaje = (n) =>
  n == null || !Number.isFinite(Number(n)) ? 'Sin dato' : `${Number(n).toFixed(1)} %`;
export const numero = (n) => Number(n || 0).toLocaleString('es-PE');
export const plural = (n, uno, varios) => (Number(n) === 1 ? uno : varios);
export const nombre = (s) =>
  String(s || 'Sin dato')
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
export const ETIQUETAS = {
  estado: {
    ejecucion: 'En ejecución',
    programada: 'Programada',
    cerrada: 'Cerrada',
    borrador: 'Borrador',
    pausada: 'Pausada',
    cancelada: 'Cancelada',
    por_programar: 'Por programar',
  },
  tipo: {
    Preventivo_PM: 'Preventivo',
    Correctivo: 'Correctivo',
    Overhaul: 'Overhaul',
    Acondicionamiento: 'Acondicionamiento',
    Reclamo_Rework: 'Retrabajo',
  },
};
export const mes = (s) => {
  const [a, m] = s.split('-');
  return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('es-PE', {
    month: 'short',
    year: 'numeric',
  });
};
