import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularIntervaloAsistencia, resolverEstadoMarcacionMovil } from './asistenciaTiempo.js';

test('infiere salida del día siguiente aunque el turno no esté marcado como nocturno', () => {
  const resultado = calcularIntervaloAsistencia({
    fecha: '2026-09-30',
    horaEntrada: '08:00',
    horaSalida: '00:30',
    turno: { hora_entrada: '08:00', hora_salida: '17:00', cruza_medianoche: false },
    refrigerioMinutos: 0,
  });

  assert.equal(resultado.fecha_salida, '2026-10-01');
  assert.equal(resultado.salida_dia, 1);
  assert.equal(resultado.horas_trabajadas_min, 990);
  assert.equal(resultado.horas_extra_min, 450);
});

test('mantiene el mismo día cuando la salida no cruza medianoche', () => {
  const resultado = calcularIntervaloAsistencia({
    fecha: '2026-09-30',
    horaEntrada: '08:00',
    horaSalida: '23:59',
    turno: { hora_entrada: '08:00', hora_salida: '17:00', cruza_medianoche: false },
    refrigerioMinutos: 0,
  });

  assert.equal(resultado.fecha_salida, '2026-09-30');
  assert.equal(resultado.horas_trabajadas_min, 959);
  assert.equal(resultado.horas_extra_min, 419);
});

test('calcula correctamente un turno nocturno programado', () => {
  const resultado = calcularIntervaloAsistencia({
    fecha: '2026-09-30',
    horaEntrada: '22:00',
    horaSalida: '06:00',
    turno: { hora_entrada: '22:00', hora_salida: '06:00', cruza_medianoche: true },
    refrigerioMinutos: 0,
  });

  assert.equal(resultado.fecha_salida, '2026-10-01');
  assert.equal(resultado.horas_trabajadas_min, 480);
  assert.equal(resultado.horas_extra_min, 0);
});

test('muestra entrada nueva aunque ayer haya una jornada normal ya cerrada', () => {
  const estado = resolverEstadoMarcacionMovil({
    today: '2026-10-06', yesterday: '2026-10-05',
    turno: { hora_entrada: '08:00', hora_salida: '17:30', cruza_medianoche: false },
    registros: [{ fecha: '2026-10-05', hora_entrada: '07:58', hora_salida: '18:11' }],
  });
  assert.equal(estado.modo, 'entrada');
});

test('muestra salida solo para una entrada abierta del día actual', () => {
  const registro = { fecha: '2026-10-06', hora_entrada: '08:01', hora_salida: null };
  const estado = resolverEstadoMarcacionMovil({
    today: '2026-10-06', yesterday: '2026-10-05', turno: {}, registros: [registro],
  });
  assert.equal(estado.modo, 'salida');
  assert.equal(estado.asistenciaAbierta, registro);
});

test('mantiene salida pendiente de ayer solo en un turno nocturno', () => {
  const registro = { fecha: '2026-10-05', hora_entrada: '22:00', hora_salida: null };
  const estado = resolverEstadoMarcacionMovil({
    today: '2026-10-06', yesterday: '2026-10-05',
    turno: { hora_entrada: '22:00', hora_salida: '06:00', cruza_medianoche: true }, registros: [registro],
  });
  assert.equal(estado.modo, 'salida');
  assert.equal(estado.asistenciaAbierta, registro);
});

test('una falta o permiso no activa una salida ficticia', () => {
  for (const estadoAsistencia of ['falta', 'permiso_sin_goce']) {
    const estado = resolverEstadoMarcacionMovil({
      today: '2026-10-06', yesterday: '2026-10-05', turno: {},
      registros: [{ fecha: '2026-10-06', estado: estadoAsistencia, hora_entrada: null, hora_salida: null }],
    });
    assert.equal(estado.modo, 'entrada');
  }
});
