// Lógica pura de «Mis OTs»: grupos por fecha, búsqueda sin tildes y textos de horario.

export const GRUPOS_MIS_OTS = [
  { id: 'atrasadas', titulo: 'Atrasadas', ayuda: 'programadas antes de hoy', vacio: 'No tienes OTs atrasadas.' },
  { id: 'hoy', titulo: 'Hoy', ayuda: '', vacio: 'No tienes OTs programadas para hoy.' },
  { id: 'proximas', titulo: 'Próximas', ayuda: 'después de hoy', vacio: 'No tienes OTs programadas más adelante.' },
];

// Sin fecha programada la OT se trata como «Hoy»: es trabajo pendiente del técnico.
export function grupoMisOT(fechaProgramada, hoyISO) {
  if (!fechaProgramada) return 'hoy';
  const fecha = String(fechaProgramada).slice(0, 10);
  if (fecha < hoyISO) return 'atrasadas';
  if (fecha > hoyISO) return 'proximas';
  return 'hoy';
}

export function diasDeAtraso(fechaProgramada, hoyISO) {
  if (!fechaProgramada) return 0;
  const a = Date.UTC(...String(fechaProgramada).slice(0, 10).split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(...hoyISO.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function normalizarBusqueda(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function coincideBusqueda(ot, consulta) {
  const q = normalizarBusqueda(consulta);
  if (!q) return true;
  const texto = normalizarBusqueda([ot.numero, ot.servicio, ot.descripcion, ot.clienteNombre, ot.lugarNombre].join(' '));
  return q.split(/\s+/).every(parte => texto.includes(parte));
}

const hora = valor => (valor ? String(valor).slice(0, 5) : '');

export function textoHorario(inicio, fin) {
  const a = hora(inicio);
  const b = hora(fin);
  if (a && b) return `${a} – ${b}`;
  return a || b || 'Sin hora estimada';
}

export function fechaCorta(fechaISO) {
  if (!fechaISO) return 'Sin fecha';
  const [y, m, d] = String(fechaISO).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function resumenMisOTs(ots, hoyISO) {
  const resumen = { atrasadas: 0, hoy: 0, proximas: 0, ejecucion: 0 };
  for (const ot of ots) {
    resumen[grupoMisOT(ot.fecha_programada, hoyISO)] += 1;
    if (ot.estado === 'ejecucion') resumen.ejecucion += 1;
  }
  return resumen;
}

// filtro: 'todas' | 'atrasadas' | 'hoy' | 'proximas' | 'ejecucion'
export function filtrarMisOTs(ots, { filtro = 'todas', consulta = '' } = {}, hoyISO) {
  return ots.filter(ot => {
    if (filtro === 'ejecucion' && ot.estado !== 'ejecucion') return false;
    if (filtro !== 'todas' && filtro !== 'ejecucion' && grupoMisOT(ot.fecha_programada, hoyISO) !== filtro) return false;
    return coincideBusqueda(ot, consulta);
  });
}

// El lugar puede venir como id de sede (sed_…) o como texto libre («Taller»).
export function nombreLugar(direccion, sedesPorId) {
  if (!direccion) return 'Sin lugar';
  return sedesPorId?.[direccion]?.nombre || direccion;
}
