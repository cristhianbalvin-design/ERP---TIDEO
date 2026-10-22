import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarDiasAnticipacion, normalizarDiasVencidoMax, validarUmbralMinutos, construirMatrizDestinatarios,
  reglaTieneCambios, etiquetaEstadoEnvio, normalizarCorreosAdicionales, etiquetaRolDestinatario,
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

test('normaliza y valida el rango de contratos vencidos entre 1 y 365 días', () => {
  assert.equal(normalizarDiasVencidoMax(1), 1);
  assert.equal(normalizarDiasVencidoMax('365'), 365);
  assert.throws(() => normalizarDiasVencidoMax(0), /1 y 365 días/);
  assert.throws(() => normalizarDiasVencidoMax(366), /1 y 365 días/);
  assert.throws(() => normalizarDiasVencidoMax(1.5), /1 y 365 días/);
});

test('construye la matriz limitada a roles y canales soportados', () => {
  assert.deepEqual(construirMatrizDestinatarios({
    rrhh: { correo: true, campana: false, sms: true },
    desconocido: { correo: true },
  }, ['rrhh'], ['correo', 'campana']), { rrhh: { correo: true, campana: false }, correos_adicionales: [] });
});

test('normaliza y valida correos adicionales, incluyendo duplicados y máximo', () => {
  assert.deepEqual(normalizarCorreosAdicionales(['  Ana@Example.com  ', 'b@x.com']), ['ana@example.com', 'b@x.com']);
  assert.throws(() => normalizarCorreosAdicionales(['correo-inválido']), /correo válido/i);
  assert.throws(() => normalizarCorreosAdicionales(['Ana@x.com', 'ana@x.com']), /ya está agregado/i);
  assert.throws(() => normalizarCorreosAdicionales(Array.from({ length: 11 }, (_, i) => `u${i}@x.com`)), /hasta 10/i);
});

test('conserva correos adicionales en el payload de destinatarios', () => {
  assert.deepEqual(construirMatrizDestinatarios({ rrhh: { correo: true }, correos_adicionales: ['A@x.com'] }, ['rrhh'], ['correo']), {
    rrhh: { correo: true }, correos_adicionales: ['a@x.com'],
  });
});

test('detecta cambios respecto de la regla original', () => {
  const regla = { activo: true, parametros: { a: 1 }, destinatarios: {}, __original: { activo: true, parametros: { a: 1 }, destinatarios: {} } };
  assert.equal(reglaTieneCambios(regla), false);
  assert.equal(reglaTieneCambios({ ...regla, activo: false }), true);
  assert.equal(reglaTieneCambios({ ...regla, destinatarios: { correos_adicionales: ['uno@x.com'] } }), true);
});

test('traduce etiquetas de rol del historial', () => {
  assert.equal(etiquetaRolDestinatario('rrhh'), 'RRHH');
  assert.equal(etiquetaRolDestinatario('jefe'), 'Jefe directo');
  assert.equal(etiquetaRolDestinatario('colaborador'), 'Colaborador');
  assert.equal(etiquetaRolDestinatario('correo_adicional'), 'Correo adicional');
});

test('etiqueta estados del historial y omisión por falta de correo', () => {
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'enviado' }), { etiqueta: 'Enviado', variante: 'on' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'pendiente' }), { etiqueta: 'Pendiente', variante: 'warn' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'enviando', intentos: 1 }), { etiqueta: 'Reintentando', variante: 'warn' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'error' }), { etiqueta: 'Error', variante: 'err' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'omitido', motivo: 'sin_correo', destinatario_email: null }), { etiqueta: 'Omitido · sin correo', variante: 'off' });
});
