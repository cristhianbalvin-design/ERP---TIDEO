import { esOtPlanificable } from './plannerEngine.js';

export const fechaLocalISO = (date = new Date()) => {
  const local = new Date(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function agruparPorOS(ots = []) {
  const grupos = new Map();
  for (const ot of ots) {
    const key = ot.os_cliente_id || 'sin-os';
    if (!grupos.has(key)) {
      grupos.set(key, { id: key, orden: ot.orden_servicio || null, ots: [] });
    }
    grupos.get(key).ots.push(ot);
  }
  return [...grupos.values()];
}

export function construirMapaCalor({
  asignaciones = [],
  equipos = [],
  personas = [],
  maquinas = [],
  inicio,
  dias = 10,
}) {
  const start = new Date(`${inicio || fechaLocalISO()}T12:00:00`);
  const resultado = [];
  personas.forEach(persona => agregarRecurso(
    resultado,
    persona,
    asignaciones,
    'persona',
    start,
    dias,
  ));
  maquinas
    .filter(maquina => maquina.estado !== 'baja')
    .forEach(maquina => agregarRecurso(resultado, maquina, equipos, 'maquina', start, dias));
  return resultado;
}

function agregarRecurso(resultado, recurso, asignaciones, tipo, inicio, cantidadDias) {
  const dias = Array.from({ length: cantidadDias }, (_, index) => {
    const fecha = sumarDias(inicio, index);
    const campoId = tipo === 'persona' ? 'tecnico_id' : 'maquina_id';
    const filas = asignaciones.filter(item => (
      item.fecha === fecha && item[campoId] === recurso.id
    ));
    const horas = filas.reduce((total, item) => (
      total + (Number(item.horas_estimadas) || 8)
    ), 0);
    const capacidad = tipo === 'persona' ? 8 : Number(recurso.horas_dia) || 8;
    return { fecha, horas, capacidad, porcentaje: horas / capacidad };
  });
  const especialidad = recurso.especialidad || recurso.cargo
    || (tipo === 'persona' ? 'Personal' : 'Máquina');
  resultado.push({ id: recurso.id, nombre: recurso.nombre, especialidad, tipo, dias });
}

function sumarDias(inicio, cantidad) {
  const fecha = new Date(inicio);
  fecha.setDate(fecha.getDate() + cantidad);
  return fechaLocalISO(fecha);
}

export function edicionBloqueada(ot, asignacion) {
  const estadosBloqueados = ['ejecutado', 'reprogramado', 'cancelado'];
  const estado = String(asignacion?.estado || '').toLowerCase();
  return !esOtPlanificable(ot) || estadosBloqueados.includes(estado);
}

export function fechaEnDias(fecha, dias) {
  const local = new Date(`${fecha}T12:00:00`);
  local.setDate(local.getDate() + dias);
  return fechaLocalISO(local);
}
