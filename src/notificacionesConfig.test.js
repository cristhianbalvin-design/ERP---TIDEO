import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarDiasAnticipacion, validarUmbralMinutos, construirMatrizDestinatarios,
  reglaTieneCambios, etiquetaEstadoEnvio,
} from './services/notificacionesConfigService.js';

test('normaliza días únicos entre 1 y 180 en orden descendente', () => {
  assert.deepEqual(normalizarDiasAnticipacion([1, 180, 30]), [180, 30, 1]);
  assert.throws(() => normalizarDiasAnticipacion([0]), RangeError);
  assert.throws(() => normalizarDiasAnticipacion([181]), RangeError);
  assert.throws(() => normalizarDiasAnticipacion([5, 5]), RangeError);
  assert.throws(() => normalizarDiasAnticipacion([1, 2, 3, 4, 5, 6]), RangeError);
  assert.deepEqual(normalizarDiasAnticipacion([]), []);
});

test('valida umbral entero de 1 a 480 minutos', () => {
  assert.equal(validarUmbralMinutos(1), 1);
  assert.equal(validarUmbralMinutos('480'), 480);
  assert.throws(() => validarUmbralMinutos(0), RangeError);
  assert.throws(() => validarUmbralMinutos(481), RangeError);
  assert.throws(() => validarUmbralMinutos(1.5), RangeError);
});

test('construye la matriz limitada a roles y canales soportados', () => {
  assert.deepEqual(construirMatrizDestinatarios({
    rrhh: { correo: true, campana: false, sms: true },
    desconocido: { correo: true },
  }, ['rrhh'], ['correo', 'campana']), { rrhh: { correo: true, campana: false } });
});

test('detecta cambios respecto de la regla original', () => {
  const regla = { activo: true, parametros: { a: 1 }, destinatarios: {}, __original: { activo: true, parametros: { a: 1 }, destinatarios: {} } };
  assert.equal(reglaTieneCambios(regla), false);
  assert.equal(reglaTieneCambios({ ...regla, activo: false }), true);
});

test('etiqueta estados del historial y omisión por falta de correo', () => {
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'enviado' }), { etiqueta: 'Enviado', variante: 'on' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'pendiente' }), { etiqueta: 'Pendiente', variante: 'warn' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'enviando', intentos: 1 }), { etiqueta: 'Reintentando', variante: 'warn' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'error' }), { etiqueta: 'Error', variante: 'err' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'omitido', motivo: 'sin_correo', destinatario_email: null }), { etiqueta: 'Omitido · sin correo', variante: 'off' });
});
