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
