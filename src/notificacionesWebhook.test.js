import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { extraerEstadosWhatsApp, textoErrorWhatsApp, verificarFirmaWhatsApp } from '../supabase/functions/_shared/notificacionesWebhook.js';

test('extrae estados de entrega del payload oficial de WhatsApp', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [
      { id: 'wamid.HBgLM...', status: 'sent', timestamp: '1735740000', recipient_id: '51987654321' },
      { id: 'wamid.HBgLM...', status: 'delivered', timestamp: '1735740300', recipient_id: '51987654321' },
      { id: 'wamid.HBgLM...', status: 'read', timestamp: '1735740600', recipient_id: '51987654321' },
      { id: 'wamid.failed', status: 'failed', timestamp: '1735740900', errors: [{ code: 131047, title: 'Re-engagement message', message: 'More than 24 hours' }] },
    ] } }] }],
  };
  assert.deepEqual(extraerEstadosWhatsApp(payload), [
    { id: 'wamid.HBgLM...', estado: 'sent', momento: '2025-01-01T14:00:00.000Z', error: null },
    { id: 'wamid.HBgLM...', estado: 'delivered', momento: '2025-01-01T14:05:00.000Z', error: null },
    { id: 'wamid.HBgLM...', estado: 'read', momento: '2025-01-01T14:10:00.000Z', error: null },
    { id: 'wamid.failed', estado: 'failed', momento: '2025-01-01T14:15:00.000Z', error: '131047 · Re-engagement message · More than 24 hours' },
  ]);
});

test('ignora mensajes entrantes y estructuras que no contienen estados', () => {
  const payload = { entry: [{ changes: [{ field: 'messages', value: {
    messages: [{ id: 'wamid.incoming', from: '51987654321', text: { body: 'Hola' } }],
  } }] }] };
  assert.deepEqual(extraerEstadosWhatsApp(payload), []);
  assert.deepEqual(extraerEstadosWhatsApp('no es JSON'), []);
});

test('arma el texto del primer error con máximo de 500 caracteres', () => {
  assert.equal(textoErrorWhatsApp({ errors: [{ code: 131047, title: 'No entregado', message: 'Ventana vencida' }] }), '131047 · No entregado · Ventana vencida');
  assert.equal(textoErrorWhatsApp({ errors: [{ message: 'x'.repeat(600) }] }).length, 500);
  assert.equal(textoErrorWhatsApp({ errors: [] }), '');
});

test('valida X-Hub-Signature-256 con HMAC-SHA256 del cuerpo crudo', async () => {
  const cuerpo = '{"object":"whatsapp_business_account"}';
  const secreto = 'secret-ejemplo';
  const digest = createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex');
  assert.equal(await verificarFirmaWhatsApp(cuerpo, `sha256=${digest}`, secreto), true);
  assert.equal(await verificarFirmaWhatsApp(cuerpo, `sha256=${'0'.repeat(64)}`, secreto), false);
  assert.equal(await verificarFirmaWhatsApp(`${cuerpo} `, `sha256=${digest}`, secreto), false);
  assert.equal(await verificarFirmaWhatsApp(cuerpo, `sha256=${digest}`, ''), false);
});
