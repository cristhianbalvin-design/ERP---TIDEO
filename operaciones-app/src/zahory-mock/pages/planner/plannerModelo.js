import { analizarCuellos, calcularPronostico, esOtPlanificable, resumirTareas } from './plannerEngine.js';
import { fechaEnDias, fechaLocalISO } from './plannerLogic.js';

// Modelo de presentación del Planner (mock v8): fechas hábiles, estado de cada OT,
// indicadores, alertas, capacidad semanal y carriles del tablero, a partir de datos reales.

export const CAP_DIA = 8;
export const DIAS_TABLERO = 15;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ESTADOS_ACTIVOS = new Set(['programado', 'ejecutado']);

export const hoyISO = () => fechaLocalISO(new Date());
const aFecha = iso => new Date(`${iso}T12:00:00`);
export const esHabil = iso => { const dia = aFecha(iso).getDay(); return dia > 0 && dia < 6; };
export const fmtDia = iso => (iso ? `${DIAS[aFecha(iso).getDay()]} ${aFecha(iso).getDate()} ${MESES[aFecha(iso).getMonth()]}` : 'Por calcular');
export const fmtCorto = iso => (iso ? `${aFecha(iso).getDate()} ${MESES[aFecha(iso).getMonth()]}` : '—');
export const diaSemana = iso => DIAS[aFecha(iso).getDay()];
export const horas = valor => `${(Math.round((Number(valor) || 0) * 10) / 10).toString().replace('.', ',')} h`;
export const numeroOT = ot => {
  const valor = String(ot?.numero || ot?.id || '');
  if (!valor) return 'OT';
  return /^OT[-\s]/i.test(valor) ? valor : `OT ${valor}`;
};

export function sumarHabiles(iso, cantidad) {
  let fecha = iso;
  let restantes = Math.abs(cantidad);
  const paso = cantidad < 0 ? -1 : 1;
  while (restantes > 0) {
    fecha = fechaEnDias(fecha, paso);
    if (esHabil(fecha)) restantes -= 1;
  }
  return fecha;
}

export function habilAnteriorOIgual(iso) {
  let fecha = iso;
  while (!esHabil(fecha)) fecha = fechaEnDias(fecha, -1);
  return fecha;
}

// Ventana del tablero: el día hábil anterior a hoy (índice 0) y los siguientes días hábiles.
export function ventanaHabil(hoy = hoyISO(), total = DIAS_TABLERO) {
  const inicio = sumarHabiles(esHabil(hoy) ? hoy : habilAnteriorOIgual(hoy), -1);
  const dias = [inicio];
  while (dias.length < total) dias.push(sumarHabiles(dias.at(-1), 1));
  return dias;
}

export function indiceHoy(dias, hoy = hoyISO()) {
  const exacto = dias.indexOf(hoy);
  if (exacto >= 0) return exacto;
  return Math.max(0, dias.findIndex(dia => dia > hoy));
}

// Cargos (especialidades) del personal y su color estable.
export const claveCargo = persona => String(persona?.cargo || persona?.especialidad || 'Sin cargo').trim();
export function listarCargos(personas = []) {
  return [...new Set(personas.map(claveCargo))].sort((a, b) => a.localeCompare(b, 'es'));
}
export function colorCargo(cargos, clave) {
  const indice = cargos.indexOf(clave);
  return `var(--dx-pl-sk${indice < 0 ? 0 : (indice % 6) + 1})`;
}

function asignacionesActivas(lista = [], otId) {
  return lista.filter(item => item.ot_id === otId && ESTADOS_ACTIVOS.has(item.estado));
}

export function infoOT(ot, datos, hoy = hoyISO()) {
  const tareas = resumirTareas(ot);
  const est = tareas.reduce((suma, item) => suma + item.horasEstimadas, 0);
  const real = tareas.reduce((suma, item) => suma + item.horasReales, 0);
  const pend = tareas.reduce((suma, item) => suma + item.horasPendientes, 0);
  const pct = est ? Math.min(100, Math.round((real / est) * 100)) : 0;
  const comp = ot.orden_servicio?.fecha_fin || null;
  const fechas = [...asignacionesActivas(datos.asignaciones, ot.id), ...asignacionesActivas(datos.equipos, ot.id)]
    .map(item => item.fecha).sort();
  const planificada = fechas.length > 0;
  let inicio = hoy;
  let end = null;
  let p90 = null;
  if (planificada) {
    inicio = fechas[0];
    end = fechas.at(-1);
    p90 = sumarHabiles(end, Math.ceil((pend * 0.25) / CAP_DIA));
  } else if (pend > 0) {
    const pronostico = calcularPronostico(ot, {
      personas: Math.max(1, datos.personas?.length || 0),
      maquinas: 1,
      horasMaquinaDia: CAP_DIA,
    }, aFecha(hoy));
    end = pronostico.p50.fechaFin;
    p90 = pronostico.conservadora.fechaFin;
  }
  let st = 'ok';
  let label = 'A tiempo';
  if (!esOtPlanificable(ot)) { st = 'done'; label = 'Cerrada'; }
  else if (comp && ((end && end > comp) || (comp < hoy && pend > 0) || (!end && comp < hoy))) { st = 'bad'; label = 'Atrasada'; }
  else if (!end) { st = 'none'; label = 'Sin horas'; }
  else if (comp && p90 > comp) { st = 'warn'; label = 'En riesgo'; }
  return { id: ot.id, ot, est, real, pend, pct, comp, end, p90, inicio, st, label, planificada, tareas };
}

// OT que el Planner muestra: las planificables y las cerradas que aún tienen asignaciones en la ventana.
export function otsVisibles(datos, dias) {
  const desde = dias[0];
  const hasta = dias.at(-1);
  return (datos.ots || []).filter(ot => esOtPlanificable(ot)
    || [...(datos.asignaciones || []), ...(datos.equipos || [])]
      .some(item => item.ot_id === ot.id && item.fecha >= desde && item.fecha <= hasta));
}

export function construirInfos(datos, hoy = hoyISO()) {
  const dias = ventanaHabil(hoy);
  const infos = new Map(otsVisibles(datos, dias).map(ot => [ot.id, infoOT(ot, datos, hoy)]));
  return { dias, infos };
}

const claveOS = ot => ot.os_cliente_id || 'sin-os';

export function metricas(datos, infos, hoy = hoyISO()) {
  const lista = [...infos.values()];
  const osTotal = new Set(lista.map(info => claveOS(info.ot)));
  const osRiesgo = new Set(lista.filter(info => info.st === 'bad' || info.st === 'warn').map(info => claveOS(info.ot)));
  const enRiesgo = lista.filter(info => info.st === 'bad' || info.st === 'warn').length;
  const abiertas = lista.filter(info => info.st !== 'done' && info.end);
  const ultima = abiertas.map(info => info.end).sort().at(-1) || null;
  const proximos = [];
  let cursor = esHabil(hoy) ? hoy : sumarHabiles(hoy, 1);
  while (proximos.length < 10) { proximos.push(cursor); cursor = sumarHabiles(cursor, 1); }
  const usadas = (datos.asignaciones || [])
    .filter(item => ESTADOS_ACTIVOS.has(item.estado) && proximos.includes(item.fecha))
    .reduce((suma, item) => suma + (Number(item.horas_estimadas) || CAP_DIA), 0);
  const capacidad = (datos.personas?.length || 0) * CAP_DIA * proximos.length;
  const cuellos = analizarCuellos(datos.ots || [], datos, aFecha(hoy));
  return {
    osRiesgo: osRiesgo.size,
    osTotal: osTotal.size,
    otRiesgo: enRiesgo,
    otTotal: lista.length,
    ultima,
    uso: capacidad ? Math.round((usadas / capacidad) * 100) : 0,
    personas: datos.personas?.length || 0,
    maquinas: (datos.maquinas || []).filter(maquina => maquina.estado !== 'baja').length,
    puestos: datos.puestos?.length || 0,
    cuellos,
    critico: cuellos.critico,
  };
}

export function ocupacionPuesto(datos, puestoId, fecha, excluirOt = null) {
  return (datos.ocupaciones || []).filter(item => item.puesto_id === puestoId
    && item.estado !== 'cancelado'
    && item.ot_id !== excluirOt
    && item.fecha_desde <= fecha && item.fecha_hasta >= fecha);
}

export function puestosSobreCapacidad(datos, dias) {
  const resultado = [];
  for (const puesto of datos.puestos || []) {
    for (const fecha of dias) {
      const lista = ocupacionPuesto(datos, puesto.id, fecha);
      if (lista.length > Math.max(1, Number(puesto.capacidad) || 1)) {
        resultado.push({ puesto, fecha, ots: lista.map(item => item.ot_id) });
        break;
      }
    }
  }
  return resultado;
}

export function nombrePuesto(datos, puesto) {
  if (!puesto) return 'Sin puesto';
  const bahia = (datos.bahias || []).find(item => item.id === puesto.bahia_id);
  const hermanos = (datos.puestos || []).filter(item => item.bahia_id === puesto.bahia_id).length;
  const propio = puesto.nombre || puesto.codigo || 'Puesto';
  if (!bahia) return propio;
  return hermanos > 1 ? `${bahia.nombre} · ${propio}` : bahia.nombre;
}

export function alertas(datos, infos, met, dias) {
  const lista = [];
  const ots = new Map((datos.ots || []).map(ot => [ot.id, ot]));
  for (const info of infos.values()) {
    if (info.st === 'bad') {
      lista.push({ sev: 'bad', otId: info.id, titulo: `Fuera de compromiso · ${numeroOT(info.ot)}`,
        mensaje: info.end
          ? `Se entregaría el ${fmtDia(info.end)} y el compromiso con el cliente es el ${fmtDia(info.comp)}.`
          : `El compromiso con el cliente era el ${fmtDia(info.comp)} y la OT aún no tiene horas ni fecha de entrega.` });
    } else if (info.st === 'warn') {
      lista.push({ sev: 'warn', otId: info.id, titulo: `En riesgo · ${numeroOT(info.ot)}`,
        mensaje: `Probable ${fmtDia(info.end)}. Si las horas reales superan lo estimado en 25 %, pasa al ${fmtDia(info.p90)} y rompe el compromiso del ${fmtDia(info.comp)}.` });
    }
  }
  for (const exceso of puestosSobreCapacidad(datos, dias)) {
    const nombre = nombrePuesto(datos, exceso.puesto);
    lista.push({ sev: 'bad', otId: exceso.ots[0], titulo: `Puesto sin espacio · ${nombre}`,
      mensaje: `${nombre} admite ${exceso.puesto.capacidad || 1} equipo${(exceso.puesto.capacidad || 1) > 1 ? 's' : ''} y el ${fmtDia(exceso.fecha)} tendría ${exceso.ots.length}: ${exceso.ots.map(id => numeroOT(ots.get(id))).join(', ')}.` });
  }
  for (const info of infos.values()) {
    for (const item of info.tareas) {
      if (item.horasEstimadas > 0 && item.horasReales > item.horasEstimadas) {
        lista.push({ sev: 'warn', otId: info.id, tareaId: item.tarea.id, titulo: `Horas sobre lo estimado · ${numeroOT(info.ot)}`,
          mensaje: `«${item.tarea.titulo || 'Tarea'}» lleva ${horas(item.horasReales)} reales sobre ${horas(item.horasEstimadas)} estimadas. Conviene revisar el diagnóstico.` });
      }
    }
  }
  if (met.critico) {
    lista.push({ sev: 'warn', otId: met.cuellos.esperas.find(item => item.recursoId === met.critico.id)?.otId || null,
      titulo: `Cuello de botella · ${met.critico.nombre}`,
      mensaje: `Acumula ${met.critico.diasEspera} días de espera entre las tareas que lo necesitan. Es el recurso que más retrasa entregas.` });
  }
  return lista;
}

// Capacidad semanal: cuatro semanas de cinco días hábiles desde el lunes de esta semana.
export function semanasCapacidad(hoy = hoyISO()) {
  let lunes = habilAnteriorOIgual(hoy);
  while (aFecha(lunes).getDay() !== 1) lunes = fechaEnDias(lunes, -1);
  return Array.from({ length: 4 }, (_, semana) => {
    const inicio = sumarHabiles(lunes, semana * 5);
    const dias = [inicio];
    while (dias.length < 5) dias.push(sumarHabiles(dias.at(-1), 1));
    return { inicio, fin: dias.at(-1), dias };
  });
}

function horasEn(lista, campo, id, dias) {
  return lista.filter(item => item[campo] === id && ESTADOS_ACTIVOS.has(item.estado) && dias.includes(item.fecha))
    .reduce((suma, item) => suma + (Number(item.horas_estimadas) || CAP_DIA), 0);
}

export function capacidadSemanal(datos, hoy = hoyISO()) {
  const semanas = semanasCapacidad(hoy);
  const cargos = listarCargos(datos.personas || []);
  const personal = cargos.map(cargo => {
    const personas = (datos.personas || []).filter(persona => claveCargo(persona) === cargo);
    return {
      id: cargo,
      nombre: cargo,
      detalle: `${personas.length} técnico${personas.length === 1 ? '' : 's'}`,
      celdas: semanas.map(semana => ({
        usadas: personas.reduce((suma, persona) => suma + horasEn(datos.asignaciones || [], 'tecnico_id', persona.id, semana.dias), 0),
        capacidad: personas.length * CAP_DIA * semana.dias.length,
      })),
    };
  });
  const maquinas = (datos.maquinas || []).filter(maquina => maquina.estado !== 'baja').map(maquina => {
    const horasDia = Number(maquina.horas_dia) || CAP_DIA;
    return {
      id: maquina.id,
      nombre: maquina.nombre,
      detalle: `${ubicacionMaquina(datos, maquina)} · ${horasDia} h por día`,
      celdas: semanas.map(semana => ({
        usadas: horasEn(datos.equipos || [], 'maquina_id', maquina.id, semana.dias),
        capacidad: horasDia * semana.dias.length,
      })),
    };
  });
  return { semanas, personal, maquinas };
}

export function ubicacionMaquina(datos, maquina) {
  const puesto = (datos.puestos || []).find(item => item.id === maquina.puesto_id);
  if (puesto) return nombrePuesto(datos, puesto);
  return (datos.bahias || []).find(item => item.id === maquina.bahia_id)?.nombre || 'Sin ubicación';
}

export const colorUso = proporcion => (proporcion >= 0.9 ? 'var(--dx-pl-bad)' : proporcion >= 0.75 ? 'var(--dx-pl-warn)' : 'var(--dx-pl-cyan)');

// Bloques del tablero: asignaciones contiguas de una misma tarea (u OT) en un recurso.
export function bloquesRecurso(lista, campo, recursoId, dias) {
  const porClave = new Map();
  for (const item of lista) {
    if (item[campo] !== recursoId || item.estado === 'cancelado') continue;
    const indice = dias.indexOf(item.fecha);
    if (indice < 0) continue;
    const clave = item.tarea_id || `ot:${item.ot_id}`;
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push({ ...item, indice });
  }
  const bloques = [];
  for (const [clave, filas] of porClave) {
    filas.sort((a, b) => a.indice - b.indice);
    let actual = null;
    for (const fila of filas) {
      if (actual && fila.indice <= actual.e + 1) {
        actual.e = Math.max(actual.e, fila.indice);
        actual.h += Number(fila.horas_estimadas) || CAP_DIA;
        actual.asignaciones.push(fila);
      } else {
        actual = { clave: `${clave}:${fila.indice}`, otId: fila.ot_id, tareaId: fila.tarea_id || null, s: fila.indice, e: fila.indice,
          h: Number(fila.horas_estimadas) || CAP_DIA, asignaciones: [fila] };
        bloques.push(actual);
      }
    }
  }
  return apilar(bloques);
}

export function apilar(bloques) {
  const ordenados = [...bloques].sort((a, b) => a.s - b.s);
  const finales = [];
  for (const bloque of ordenados) {
    let fila = 0;
    while (fila < finales.length && finales[fila] >= bloque.s) fila += 1;
    finales[fila] = bloque.e;
    bloque.fila = fila;
  }
  ordenados.forEach(bloque => { bloque.filas = Math.max(1, finales.length); });
  return ordenados;
}

export function tareaDe(datos, otId, tareaId) {
  const ot = (datos.ots || []).find(item => item.id === otId);
  return ot?.ot_tareas?.find(item => item.id === tareaId) || null;
}

// Resumen de una tarea con sus asignaciones reales.
export function resumenTarea(datos, ot, tarea) {
  const personas = (datos.asignaciones || []).filter(item => item.ot_id === ot.id && item.tarea_id === tarea.id && ESTADOS_ACTIVOS.has(item.estado));
  const equipos = (datos.equipos || []).filter(item => item.ot_id === ot.id && item.tarea_id === tarea.id && ESTADOS_ACTIVOS.has(item.estado));
  const fechas = [...personas, ...equipos].map(item => item.fecha).sort();
  const tecnicos = [...new Set(personas.map(item => item.tecnico_id))]
    .map(id => (datos.personas || []).find(persona => persona.id === id)).filter(Boolean);
  const maquinas = [...new Set(equipos.map(item => item.maquina_id))]
    .map(id => (datos.maquinas || []).find(maquina => maquina.id === id)).filter(Boolean);
  const est = Math.max(0, Number(tarea.horas_estimadas) || 0);
  const real = Math.max(0, Number(tarea.horas_reales) || 0);
  return {
    tarea, personas, equipos, tecnicos, maquinas, est, real,
    desde: fechas[0] || null, hasta: fechas.at(-1) || null,
    terminada: est > 0 && real >= est,
    sobre: est > 0 && real > est,
    cargo: tarea.cargo?.nombre || tecnicos[0]?.cargo || 'Sin cargo',
  };
}

// Árbol Trabajo › Actividad › Tarea de una OT.
export function arbolTareas(ot) {
  const grupos = [];
  for (const tarea of [...(ot?.ot_tareas || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0))) {
    const trabajo = tarea.familia_trabajo?.nombre || '';
    const actividad = tarea.actividad?.nombre || '';
    let grupo = grupos.find(item => item.trabajo === trabajo);
    if (!grupo) { grupo = { trabajo, actividades: [] }; grupos.push(grupo); }
    let act = grupo.actividades.find(item => item.actividad === actividad);
    if (!act) { act = { actividad, tareas: [] }; grupo.actividades.push(act); }
    act.tareas.push(tarea);
  }
  return grupos;
}

// Días hábiles de a hasta b (positivo si b es posterior).
export function diferenciaHabiles(a, b) {
  if (!a || !b || a === b) return 0;
  const signo = b > a ? 1 : -1;
  let cursor = a;
  let total = 0;
  while (cursor !== b && Math.abs(total) < 400) {
    cursor = fechaEnDias(cursor, signo);
    if (esHabil(cursor)) total += signo;
    if ((signo > 0 && cursor > b) || (signo < 0 && cursor < b)) break;
  }
  return total;
}

export function puestoDeOT(datos, otId) {
  const ocupacion = (datos.ocupaciones || []).find(item => item.ot_id === otId && item.estado !== 'cancelado');
  const id = ocupacion?.puesto_id
    || (datos.asignaciones || []).find(item => item.ot_id === otId && item.puesto_id && item.estado === 'programado')?.puesto_id;
  return (datos.puestos || []).find(item => item.id === id) || null;
}

export const normalizar = texto => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
