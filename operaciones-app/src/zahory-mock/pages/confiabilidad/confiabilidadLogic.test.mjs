import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatoHoras,
  formatoPorcentaje,
  puntajeBacklog,
  prioridadBacklog,
  CICLOS_BACKLOG,
  transicionesBacklog,
  transicionBacklogValida,
  semaforoPm,
  nivelSos,
  condicionSos,
  estadoEquipo,
  etiquetaConfiabilidad,
} from './confiabilidadLogic.js';

test('formatea horas y porcentajes sin confundir cero con ausencia de datos', () => {
  assert.equal(formatoHoras(0), '0 h');
  assert.equal(formatoPorcentaje(0), '0 %');
  assert.equal(formatoHoras(12.5), '12.5 h');
  assert.equal(formatoPorcentaje(99.25), '99.25 %');
  for (const valor of [null, undefined, '', NaN, Infinity]) {
    assert.equal(formatoHoras(valor), 'Sin dato');
    assert.equal(formatoPorcentaje(valor), 'Sin dato');
  }
});

test('calcula el puntaje y los límites de prioridad', () => {
  assert.equal(puntajeBacklog(5, 4), 20);
  assert.equal(puntajeBacklog(0, 4), null);
  assert.equal(puntajeBacklog(null, 4), null);
  for (const [p, esperado] of [
    [25, 'emergencia'],
    [20, 'emergencia'],
    [19, 'urgente'],
    [12, 'urgente'],
    [11, 'programable'],
    [6, 'programable'],
    [5, 'baja'],
    [null, null],
  ])
    assert.equal(prioridadBacklog(p), esperado);
});

test('expone ciclos y exige motivo para descartar', () => {
  assert.equal(CICLOS_BACKLOG.length, 7);
  assert.equal(transicionBacklogValida('nuevo', 'evaluado'), true);
  assert.equal(transicionBacklogValida('nuevo', 'cerrado'), true);
  assert.equal(transicionBacklogValida('nuevo', 'descartado'), false);
  assert.equal(transicionBacklogValida('nuevo', 'descartado', 'Duplicado'), true);
  assert.deepEqual(transicionesBacklog('desconocido'), []);
});

test('PM toma el peor criterio y respeta el umbral inclusivo', () => {
  assert.equal(
    semaforoPm({ horas_restantes: 10, intervalo_horas: 100, dias_restantes: 30, intervalo_dias: 100 }),
    'por_vencer',
  );
  assert.equal(
    semaforoPm({ horas_restantes: 20, intervalo_horas: 100, dias_restantes: 0, intervalo_dias: 100 }),
    'vencido',
  );
  assert.equal(semaforoPm({ horas_restantes: 11, intervalo_horas: 100 }), 'al_dia');
  assert.equal(semaforoPm({}), 'sin_lectura');
});

test('SOS evalúa máximo, rango y peor condición', () => {
  const max = { tipo: 'max', alerta: 10, critico: 20 };
  assert.equal(nivelSos(9, max), 'normal');
  assert.equal(nivelSos(10, max), 'alerta');
  assert.equal(nivelSos(20, max), 'critico');
  const rango = { tipo: 'rango', minimo: 10, maximo: 20, alerta: 10, critico: 20 };
  assert.equal(nivelSos(10, rango), 'normal');
  assert.equal(nivelSos(22, rango), 'alerta');
  assert.equal(nivelSos(24, rango), 'critico');
  assert.equal(nivelSos(null, max), null);
  assert.equal(condicionSos(['normal', 'alerta', 'critico']), 'critico');
  assert.equal(condicionSos([]), null);
});

test('interpreta estados y etiquetas sin perder valores ausentes', () => {
  assert.equal(estadoEquipo(['al_dia', 'vencido']), 'critico');
  assert.equal(estadoEquipo(['por_vencer']), 'alerta');
  assert.equal(estadoEquipo([]), 'ok');
  assert.equal(etiquetaConfiabilidad('segmento', 'flota'), 'Flota');
  assert.equal(etiquetaConfiabilidad('ciclo', 'pendiente_recursos'), 'Pendiente de recursos');
  assert.equal(etiquetaConfiabilidad('fuente', 'diagnostico'), 'Diagnóstico');
  assert.equal(etiquetaConfiabilidad('sistema', 'hidraulico'), 'Hidráulico');
  assert.equal(etiquetaConfiabilidad('sistema', null), 'Sin dato');
});
