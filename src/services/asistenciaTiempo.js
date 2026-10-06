const MINUTOS_DIA = 24 * 60;

export function horaAMinutos(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function sumarDiasIso(fecha, dias) {
  if (!fecha) return fecha;
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

export function diferenciaDiasIso(inicio, fin) {
  if (!inicio || !fin) return 0;
  const a = new Date(`${inicio}T00:00:00Z`);
  const b = new Date(`${fin}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * La fecha de la asistencia representa el inicio de la jornada. Para registros
 * históricos que aún no tienen fecha_salida, se conserva la semántica anterior:
 * una salida menor que la entrada, o un turno configurado nocturno, termina al
 * día siguiente.
 */
export function resolverFechaSalida({ fecha, horaEntrada, horaSalida, fechaSalida = null, turno = null } = {}) {
  if (!fecha || !horaSalida) return fechaSalida || fecha;
  if (fechaSalida) return fechaSalida;
  const entradaMin = horaAMinutos(horaEntrada);
  const salidaMin = horaAMinutos(horaSalida);
  if (entradaMin == null || salidaMin == null) return fecha;
  return turno?.cruza_medianoche || salidaMin < entradaMin ? sumarDiasIso(fecha, 1) : fecha;
}

export function calcularIntervaloAsistencia({
  fecha,
  horaEntrada,
  horaSalida,
  fechaSalida = null,
  turno = null,
  refrigerioMinutos = 0,
} = {}) {
  const entradaMin = horaAMinutos(horaEntrada);
  const salidaMin = horaAMinutos(horaSalida);
  if (!fecha || entradaMin == null || salidaMin == null) {
    return { fecha_salida: fechaSalida || fecha || null, salida_dia: 0, horas_trabajadas_min: 0, horas_extra_min: 0 };
  }

  const fechaSalidaReal = resolverFechaSalida({ fecha, horaEntrada, horaSalida, fechaSalida, turno });
  const salidaDia = fecha
    ? Math.max(0, diferenciaDiasIso(fecha, fechaSalidaReal))
    : (turno?.cruza_medianoche || salidaMin < entradaMin ? 1 : 0);
  const salidaAbsolutaMin = (salidaDia * MINUTOS_DIA) + salidaMin;
  const entradaAbsolutaMin = entradaMin;

  let turnoSalidaMin = horaAMinutos(turno?.hora_salida);
  if (turnoSalidaMin == null) turnoSalidaMin = salidaMin;
  if (turno?.cruza_medianoche) turnoSalidaMin += MINUTOS_DIA;

  const refrigerio = Math.max(0, Number(refrigerioMinutos) || 0);
  return {
    fecha_salida: fechaSalidaReal,
    salida_dia: salidaDia,
    horas_trabajadas_min: Math.max(0, salidaAbsolutaMin - entradaAbsolutaMin - refrigerio),
    horas_extra_min: Math.max(0, salidaAbsolutaMin - turnoSalidaMin),
  };
}

// Determina el estado del reloj móvil sin confundir la jornada anterior con la
// jornada actual. La única excepción es un turno que realmente puede cruzar
// medianoche y cuya entrada de ayer siga abierta.
export function turnoPuedeCruzarMedianoche(turno = {}) {
  if (turno?.cruza_medianoche) return true;
  const entradaMin = horaAMinutos(turno?.hora_entrada);
  const salidaMin = horaAMinutos(turno?.hora_salida);
  return entradaMin != null && salidaMin != null && salidaMin <= entradaMin;
}

export function resolverEstadoMarcacionMovil({ registros = [], today, yesterday, turno = {} }) {
  const registrosHoy = registros.filter(r => r?.fecha === today);
  const entradaAbiertaHoy = registrosHoy.find(r => Boolean(r?.hora_entrada) && !r?.hora_salida);
  if (entradaAbiertaHoy) return { modo: 'salida', asistenciaAbierta: entradaAbiertaHoy };

  const jornadaCompletadaHoy = registrosHoy.find(r => Boolean(r?.hora_entrada) && Boolean(r?.hora_salida));
  if (jornadaCompletadaHoy) return { modo: 'completado', asistenciaAbierta: null };

  const entradaAbiertaAyer = registros.find(r => r?.fecha === yesterday && Boolean(r?.hora_entrada) && !r?.hora_salida);
  if (entradaAbiertaAyer && turnoPuedeCruzarMedianoche(turno)) {
    return { modo: 'salida', asistenciaAbierta: entradaAbiertaAyer };
  }

  // Faltas, permisos y cualquier fila sin entrada válida no representan una
  // jornada abierta. La persona debe poder marcar su entrada del día.
  return { modo: 'entrada', asistenciaAbierta: null };
}
