import test from 'node:test';
import assert from 'node:assert/strict';
import { construirCuerpoWhatsApp } from '../supabase/functions/_shared/notificacionesWhatsapp.js';

test('construye el cuerpo de plantilla aprobado con dos parámetros de texto', () => {
  assert.deepEqual(construirCuerpoWhatsApp({ telefono: '51987654321', titulo: 'Contrato por vencer', mensaje: 'Vence en 7 días.' }), {
    messaging_product: 'whatsapp',
    to: '51987654321',
    type: 'template',
    template: {
      name: 'opera_alerta',
      language: { code: 'es' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'Contrato por vencer' },
          { type: 'text', text: 'Vence en 7 días.' },
        ],
      }],
    },
  });
});

test('sanea saltos de línea, tabulaciones y espacios consecutivos', () => {
  const body = construirCuerpoWhatsApp({ telefono: '1', titulo: 'Aviso\t importante\nERP', mensaje: 'Uno\n\tDos     Tres' });
  const [titulo, resumen] = body.template.components[0].parameters;
  assert.equal(titulo.text, 'Aviso  importante ERP');
  assert.equal(resumen.text, 'Uno Dos    Tres');
});

test('recorta título y resumen a los máximos admitidos', () => {
  const body = construirCuerpoWhatsApp({ telefono: '1', titulo: 'T'.repeat(70), mensaje: 'M'.repeat(950) });
  const [titulo, resumen] = body.template.components[0].parameters;
  assert.equal(titulo.text.length, 60);
  assert.equal(titulo.text.endsWith('…'), true);
  assert.equal(resumen.text.length, 900);
  assert.equal(resumen.text.endsWith('…'), true);
});

test('sustituye parámetros vacíos por texto no vacío y permite configurar plantilla e idioma', () => {
  const body = construirCuerpoWhatsApp({ telefono: '', titulo: ' \n\t ', mensaje: '' }, { template: 'mi_plantilla', language: 'es_PE' });
  assert.equal(body.to, '');
  assert.equal(body.template.name, 'mi_plantilla');
  assert.equal(body.template.language.code, 'es_PE');
  assert.deepEqual(body.template.components[0].parameters.map(parametro => parametro.text), ['Aviso', 'Sin detalles disponibles.']);
});
