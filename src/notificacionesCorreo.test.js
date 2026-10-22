import test from 'node:test';
import assert from 'node:assert/strict';
import { construirCorreoNotificacion } from '../supabase/functions/_shared/notificacionesCorreo.js';

test('arma asunto y tabla de tardanzas ordenada por minutos', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'tardanza_resumen_diario',
    mensaje: 'Revisa el resumen.',
    payload: {
      fecha: '2026-10-20', umbral_minutos: 5, total: 2, alcance: 'equipo',
      items: [
        { nombre: 'Ana', hora_entrada: '09:10', minutos: 10 },
        { nombre: 'Luis', hora_entrada: '09:06', minutos: 6 },
      ],
    },
  });
  assert.equal(correo.asunto, 'Tardanzas del 20/10/2026 · 2 colaboradores');
  assert.match(correo.html, /Ana[\s\S]*10[\s\S]*Luis[\s\S]*6/);
  assert.match(correo.html, /tu equipo/);
  assert.match(correo.texto, /Umbral: 5 minutos/);
});

test('incluye el recuadro de datos del contrato por vencer', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_por_vencer', titulo: 'Aviso', mensaje: 'Renovar pronto.',
    payload: { nombre: 'Ana', tipo_documento: 'Contrato', fecha_vencimiento: '2026-12-31', dias_restantes: 12 },
  });
  assert.equal(correo.asunto, 'Contrato por vencer · Ana · 31/12/2026');
  for (const text of ['Colaborador', 'Documento', 'Vence', 'Días restantes', 'Contrato', '12']) assert.ok(correo.html.includes(text));
  assert.ok(correo.html.includes('Renovar pronto.'));
});

test('escapa todos los valores dinámicos HTML', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_por_vencer', mensaje: '<b>Alerta</b>',
    payload: { nombre: '<script>alert(1)</script>', tipo_documento: 'DNI <img>', fecha_vencimiento: '2026-10-21' },
  });
  assert.ok(!correo.html.includes('<script>'));
  assert.ok(correo.html.includes('&lt;script&gt;'));
  assert.ok(correo.html.includes('&lt;b&gt;Alerta&lt;/b&gt;'));
});

test('arma resumen de contratos por vencer en orden ascendente y resalta hasta 7 días', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_por_vencer', mensaje: 'Revisa estos contratos.',
    payload: {
      resumen: true, fecha: '2026-10-21', total: 3,
      items: [
        { nombre: 'Ana', tipo_documento: 'Contrato', fecha_vencimiento: '2026-10-30', dias_restantes: 9 },
        { nombre: 'Luis', tipo_documento: 'Adenda', fecha_vencimiento: '2026-10-25', dias_restantes: 4 },
        { nombre: 'Mia', tipo_documento: 'Contrato', fecha_vencimiento: '2026-10-28', dias_restantes: 7 },
      ],
    },
  });
  assert.equal(correo.asunto, 'Contratos por vencer · 3 colaboradores · 21/10/2026');
  assert.match(correo.html, /<h1[^>]*>Contratos por vencer<\/h1><p>Revisa estos contratos\.<\/p>/);
  assert.ok(correo.html.indexOf('Luis') < correo.html.indexOf('Mia'));
  assert.ok(correo.html.indexOf('Mia') < correo.html.indexOf('Ana'));
  assert.equal((correo.html.match(/color:#9B1C1C;/g) || []).length, 8);
  assert.match(correo.html, /<th align="left" style="padding:10px">Colaborador<\/th>[\s\S]*Documento[\s\S]*Vence[\s\S]*Días/);
  assert.match(correo.texto, /Colaborador \| Documento \| Vence \| Días\nLuis \| Adenda \| 25\/10\/2026 \| 4\nMia \| Contrato \| 28\/10\/2026 \| 7\nAna \| Contrato \| 30\/10\/2026 \| 9/);
});

test('usa singular para un contrato en el resumen', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_por_vencer', mensaje: 'Un contrato vence pronto.',
    payload: { fecha: '2026-11-01', total: 1, items: [{ nombre: 'Eva', tipo_documento: 'Contrato', fecha_vencimiento: '2026-11-08', dias_restantes: 8 }] },
  });
  assert.equal(correo.asunto, 'Contratos por vencer · 1 colaborador · 01/11/2026');
});

test('escapa el nombre HTML dentro del resumen de contratos', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_por_vencer', mensaje: 'Revisa el resumen.',
    payload: { fecha: '2026-11-01', total: 1, items: [{ nombre: '<img src=x onerror=alert(1)>', tipo_documento: 'Contrato', fecha_vencimiento: '2026-11-08', dias_restantes: 8 }] },
  });
  assert.ok(!correo.html.includes('<img src=x'));
  assert.ok(correo.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('mantiene el correo antiguo de contrato individual sin items', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_por_vencer', titulo: 'Aviso', mensaje: 'Renovar pronto.',
    payload: { nombre: 'Ana', tipo_documento: 'Contrato', fecha_vencimiento: '2026-12-31', dias_restantes: 12 },
  });
  assert.equal(correo.asunto, 'Contrato por vencer · Ana · 31/12/2026');
  assert.ok(correo.html.includes('<h1 style="margin:0 0 16px;color:#1A2B4A;font-size:22px">Contrato por vencer</h1>'));
  for (const text of ['Colaborador', 'Documento', 'Vence', 'Contrato', '12', 'Renovar pronto.']) assert.ok(correo.html.includes(text));
});

test('evento desconocido usa título y mensaje', () => {
  const correo = construirCorreoNotificacion({ evento_codigo: 'otro', titulo: 'Aviso especial', mensaje: 'Detalle general' });
  assert.equal(correo.asunto, 'Aviso especial');
  assert.ok(correo.html.includes('Detalle general'));
});

test('usa la URL pública por defecto', () => {
  const correo = construirCorreoNotificacion({ titulo: 'Aviso', mensaje: 'Hola' });
  assert.ok(correo.html.includes('href="https://erp.tideo.tech"'));
  assert.ok(correo.texto.includes('https://erp.tideo.tech'));
});

test('arma resumen de documentos por vencer con orden, columnas y escape', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'documento_por_vencer', mensaje: 'Revisa los documentos <urgentes>.',
    payload: {
      fecha: '2026-10-21', total: 2,
      items: [
        { nombre: 'Ana', tipo_documento: 'Licencia', fecha_vencimiento: '2026-10-30', dias_restantes: 9 },
        { nombre: '<Luis>', tipo_documento: 'DNI & permiso', fecha_vencimiento: '2026-10-25', dias_restantes: 4 },
      ],
    },
  });
  assert.equal(correo.asunto, 'Documentos por vencer · 2 documentos · 21/10/2026');
  assert.match(correo.html, /<h1[^>]*>Documentos por vencer<\/h1>/);
  assert.match(correo.html, /Colaborador<\/th>[\s\S]*Documento<\/th>[\s\S]*Vence<\/th>[\s\S]*Días<\/th>/);
  assert.ok(correo.html.indexOf('&lt;Luis&gt;') < correo.html.indexOf('Ana'));
  assert.ok(correo.html.includes('DNI &amp; permiso'));
  assert.ok(correo.html.includes('&lt;urgentes&gt;'));
  assert.match(correo.texto, /Colaborador \| Documento \| Vence \| Días\n<Luis> \| DNI & permiso \| 25\/10\/2026 \| 4/);
  assert.equal((correo.html.match(/color:#9B1C1C;/g) || []).length, 4);
});

test('arma resumen de contratos vencidos por días descendentes y alerta todas las filas', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'contrato_vencido', mensaje: 'Contratos que requieren renovación.',
    payload: {
      fecha: '2026-10-21', total: 2,
      items: [
        { nombre: 'Ana', tipo_documento: 'Contrato', fecha_vencimiento: '2026-10-10', dias_vencido: 11 },
        { nombre: 'Luis', tipo_documento: 'Contrato & adenda', fecha_vencimiento: '2026-10-15', dias_vencido: 6 },
      ],
    },
  });
  assert.equal(correo.asunto, 'Contratos vencidos sin renovar · 2 colaboradores · 21/10/2026');
  assert.match(correo.html, /<h1[^>]*>Contratos vencidos sin renovar<\/h1>/);
  assert.match(correo.html, /Colaborador<\/th>[\s\S]*Documento<\/th>[\s\S]*Venció<\/th>[\s\S]*Días vencido<\/th>/);
  assert.ok(correo.html.indexOf('Ana') < correo.html.indexOf('Luis'));
  assert.ok(correo.html.includes('Contrato &amp; adenda'));
  assert.equal((correo.html.match(/color:#9B1C1C;/g) || []).length, 8);
  assert.match(correo.texto, /11\nLuis \| Contrato & adenda \| 15\/10\/2026 \| 6/);
});

test('usa singular en el resumen diario de documentos', () => {
  const correo = construirCorreoNotificacion({
    evento_codigo: 'documento_por_vencer', mensaje: 'Un documento vence.',
    payload: { fecha: '2026-11-01', total: 1, items: [{ nombre: 'Eva', tipo_documento: 'Certificado', fecha_vencimiento: '2026-11-08', dias_restantes: 7 }] },
  });
  assert.equal(correo.asunto, 'Documentos por vencer · 1 documento · 01/11/2026');
});
