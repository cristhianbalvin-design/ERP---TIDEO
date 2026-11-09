import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPorUnidad, atrasado, fechaLima, horaLima, duracionTexto, esperasViaje, pedidoDesdeGuia, pedidoDesdeTransito,
  resumenInspeccion, resumenParadas, siguienteHito, sumarDias, totalGastos, validarConstancia,
  validarPedido, ventanaTexto, viajesDelDia,
} from './transporteLogistica.js';

test('siguiente hito sigue el orden comercial', () => {
  assert.equal(siguienteHito([]).key, 'salida_base');
  assert.equal(siguienteHito([{ hito: 'salida_base' }, { hito: 'llegada_carga' }]).key, 'fin_carga');
  const todos = ['salida_base', 'llegada_carga', 'fin_carga', 'llegada_destino', 'fin_descarga', 'entregado'].map(hito => ({ hito }));
  assert.equal(siguienteHito(todos), null);
});

test('esperas de carga y descarga en minutos', () => {
  const hitos = [
    { hito: 'llegada_carga', ocurrido_at: '2026-11-08T10:58:00Z' },
    { hito: 'fin_carga', ocurrido_at: '2026-11-08T13:25:00Z' },
    { hito: 'llegada_destino', ocurrido_at: '2026-11-09T16:30:00Z' },
  ];
  assert.deepEqual(esperasViaje(hitos), { carga: 147, descarga: null });
  assert.equal(duracionTexto(147), '2 h 27');
  assert.equal(duracionTexto(35), '35 min');
  assert.equal(duracionTexto(null), '');
});

test('constancia de logística: nombre y firma; foto opcional', () => {
  assert.deepEqual(validarConstancia({ tipoViaje: 'logistica', datos: { recibe_nombre: 'María', firma: true } }), {});
  const e = validarConstancia({ tipoViaje: 'logistica', datos: { recibe_nombre: ' ', firma: false } });
  assert.ok(e.recibe_nombre && e.firma);
});

test('constancia comercial exige DNI, foto, bultos, estado y km en destino', () => {
  const base = { recibe_nombre: 'Jorge', firma: true, recibe_dni: '41827365', foto: true, bultos_recibidos: 6, novedad: 'conforme', km: 184652 };
  assert.deepEqual(validarConstancia({ tipoViaje: 'comercial', tipoParada: 'destino', datos: base }), {});
  const e = validarConstancia({ tipoViaje: 'comercial', tipoParada: 'destino', datos: { ...base, recibe_dni: '12', foto: false, novedad: 'danio', km: '' } });
  assert.ok(e.recibe_dni && e.foto && e.observaciones && e.km);
  assert.equal(validarConstancia({ tipoViaje: 'comercial', tipoParada: 'entrega', datos: { ...base, km: '' } }).km, undefined);
});

test('resúmenes de paradas, inspección y gastos', () => {
  assert.deepEqual(resumenParadas([{ estado: 'completada' }, { estado: 'omitida' }, { estado: 'pendiente' }]),
    { total: 3, hechas: 1, omitidas: 1, pendientes: 1 });
  assert.deepEqual(resumenInspeccion([{ ok: false, critico: true }, { ok: false }, { ok: true, critico: true }]),
    { criticos: 1, observados: 1 });
  assert.equal(totalGastos([{ monto: 620 }, { monto: '120.10' }, { monto: 48.5 }]), 788.6);
});

test('pedidos sugeridos desde el tránsito de la OC y desde la guía', () => {
  const p = pedidoDesdeTransito({ transito: { id: 't1', fecha_estimada_llegada: '2026-08-29' }, orden: { codigo: 'OC-2026-004125' }, proveedor: { razon_social: 'Repuestos Mineros', direccion: 'Av. Argentina 2450' } });
  assert.equal(p.accion, 'recoger');
  assert.equal(p.titulo, 'Recoger OC-2026-004125 en Repuestos Mineros');
  assert.equal(p.direccion, 'Av. Argentina 2450');
  const g = pedidoDesdeGuia({ id: 'g1', numero_completo: 'T001-00000001', destinatario_razon_social: 'Minera Huaytapallana', llegada_direccion: 'Campamento km 4' });
  assert.equal(g.accion, 'entregar');
  assert.equal(g.lugar_nombre, 'Minera Huaytapallana');
  assert.equal(g.origen, 'almacen');
});

test('validación del pedido y ventana horaria', () => {
  assert.deepEqual(validarPedido({ titulo: 'x', lugar_nombre: 'y', fecha_requerida: '2026-11-10' }), {});
  assert.ok(validarPedido({ titulo: 'x', lugar_nombre: 'y', fecha_requerida: '2026-11-10', ventana_inicio: '12:00', ventana_fin: '09:00' }).ventana_fin);
  assert.equal(ventanaTexto('09:00:00', '12:00:00'), '09:00–12:00');
  assert.equal(ventanaTexto('', ''), '');
});

test('viajes del día incluyen los que siguen en curso y excluyen cancelados', () => {
  const viajes = [
    { id: 1, fecha_programada: '2026-11-10T03:00:00+00:00', estado: 'programado' },
    { id: 2, fecha_programada: '2026-11-08', estado: 'en_ruta' },
    { id: 3, fecha_programada: '2026-11-08', estado: 'entregado' },
    { id: 4, fecha_programada: '2026-11-09', estado: 'cancelado' },
    { id: 5, fecha_programada: '2026-11-10', estado: 'programado' },
  ];
  assert.deepEqual(viajesDelDia(viajes, '2026-11-09').map(v => v.id), [1, 2]);
  assert.equal(atrasado({ estado: 'programado', fecha_programada: '2026-08-31' }, '2026-11-09'), true);
  assert.equal(atrasado({ estado: 'en_ruta', fecha_programada: '2026-08-31' }, '2026-11-09'), false);
  assert.equal(sumarDias('2026-11-30', 1), '2026-12-01');
  assert.equal(fechaLima('2026-11-10T03:00:00+00:00'), '2026-11-09');
  assert.equal(horaLima('2026-11-09T13:00:00+00:00'), '08:00');
  assert.equal(horaLima('2026-11-09'), '');
});

test('agrupa por unidad con los viajes sin unidad al final', () => {
  const grupos = agruparPorUnidad([
    { id: 'a', vehiculo_id: null, fecha_programada: '2026-11-09T10:00:00Z' },
    { id: 'b', vehiculo_id: 'v2', vehiculo: { placa: 'D4K-872' }, fecha_programada: '2026-11-09T19:00:00Z' },
    { id: 'c', vehiculo_id: 'v1', vehiculo: { placa: 'BXR-812' }, fecha_programada: '2026-11-09T11:30:00Z' },
    { id: 'd', vehiculo_id: 'v2', vehiculo: { placa: 'D4K-872' }, fecha_programada: '2026-11-09T13:00:00Z' },
  ]);
  assert.deepEqual(grupos.map(g => g.key), ['v1', 'v2', '__sin__']);
  assert.deepEqual(grupos[1].viajes.map(v => v.id), ['d', 'b']);
});
