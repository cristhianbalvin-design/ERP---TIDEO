import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarDiasAnticipacion, normalizarDiasVencidoMax, validarUmbralMinutos, normalizarHoraEnvio, construirMatrizDestinatarios,
  reglaTieneCambios, etiquetaEstadoEnvio, normalizarCorreosAdicionales, normalizarTelefonoWhatsApp, normalizarTelefonosAdicionales,
  etiquetaRolDestinatario, etiquetaCanalEnvio, etiquetaRolConfig, etiquetaModuloNotificacion, rolesSeleccionados, alternarRol,
} from './services/notificacionesConfigService.js';

test('resuelve selecciones guardadas y automáticas de roles por evento', () => {
  const roles = [
    { id: 'admin', es_admin: true, auto_rrhh: false, auto_operaciones: false },
    { id: 'rrhh', auto_rrhh: true, auto_operaciones: true },
    { id: 'tecnico', auto_rrhh: false, auto_operaciones: true },
  ];
  assert.deepEqual(rolesSeleccionados({ roles_rrhh: ['rrhh'] }, 'roles_rrhh', roles), ['rrhh']);
  assert.deepEqual(rolesSeleccionados({ roles_rrhh: [] }, 'roles_rrhh', roles), []);
  assert.deepEqual(rolesSeleccionados({}, 'roles_rrhh', roles), ['admin', 'rrhh']);
  assert.deepEqual(rolesSeleccionados({}, 'roles_operaciones', roles), ['admin', 'rrhh', 'tecnico']);
});

test('alternarRol agrega o quita ids y devuelve una lista ordenada sin duplicados', () => {
  assert.deepEqual(alternarRol(['b', 'a', 'a'], 'c'), ['a', 'b', 'c']);
  assert.deepEqual(alternarRol(['b', 'a', 'a'], 'a'), ['b']);
});

test('normaliza horas de envío en tramos de 15 minutos', () => {
  assert.equal(normalizarHoraEnvio('9:30'), '09:30');
  assert.equal(normalizarHoraEnvio('09:30'), '09:30');
  assert.equal(normalizarHoraEnvio('09:30:00'), '09:30');
  assert.equal(normalizarHoraEnvio('23:45'), '23:45');
  for (const value of ['09:20', '24:00', '', null, undefined]) assert.equal(normalizarHoraEnvio(value), null);
});

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

test('conserva el nuevo rol operaciones en la matriz de destinatarios', () => {
  assert.deepEqual(construirMatrizDestinatarios({ operaciones: { campana: true, correo: true } }, ['operaciones'], ['campana', 'correo']), {
    operaciones: { campana: true, correo: true }, correos_adicionales: [],
  });
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

test('conserva roles_rrhh en el payload de destinatarios cuando está presente', () => {
  assert.deepEqual(construirMatrizDestinatarios({ rrhh: { correo: true }, roles_rrhh: ['rol-b', 'rol-a', 'rol-a'] }, ['rrhh'], ['correo']), {
    rrhh: { correo: true }, correos_adicionales: [], roles_rrhh: ['rol-a', 'rol-b'],
  });
});

test('normaliza y valida teléfonos adicionales para WhatsApp', () => {
  assert.deepEqual(normalizarTelefonoWhatsApp(['987 654 321', '+1 2025550123']), ['51987654321', '12025550123']);
  assert.equal(normalizarTelefonoWhatsApp('+1 (202) 555-0123'), '12025550123');
  assert.throws(() => normalizarTelefonoWhatsApp('123456789'), /Teléfono no válido/);
  assert.throws(() => normalizarTelefonoWhatsApp(['987654321', '51987654321']), /ya está agregado/);
  assert.throws(() => normalizarTelefonoWhatsApp(Array.from({ length: 11 }, (_, i) => `9${String(i).padStart(8, '0')}`)), /hasta 10/);
});

test('incluye WhatsApp y teléfonos normalizados solo cuando el canal está soportado', () => {
  assert.deepEqual(construirMatrizDestinatarios({ rrhh: { whatsapp: true }, telefonos_adicionales: ['987654321'] }, ['rrhh'], ['whatsapp']), {
    rrhh: { whatsapp: true }, correos_adicionales: [], telefonos_adicionales: ['51987654321'],
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

test('traduce etiquetas de rol y módulo para operaciones', () => {
  assert.equal(etiquetaRolDestinatario('operaciones'), 'Operaciones');
  assert.deepEqual(etiquetaRolConfig('operaciones', 'ot_creadas_resumen'), ['Operaciones', 'Administradores y roles con acceso a OTs y Partes Diarios']);
  assert.deepEqual(etiquetaRolConfig('jefe', 'partes_no_llenados'), ['Jefe directo del técnico', 'Solo las OTs de su equipo']);
  assert.deepEqual(etiquetaRolConfig('rrhh', 'tardanza_resumen_diario'), ['RRHH y administradores', 'Resumen de toda la empresa']);
  assert.equal(etiquetaModuloNotificacion('operaciones'), 'Operaciones');
  assert.equal(etiquetaModuloNotificacion('asistencia'), 'Asistencia');
  assert.equal(etiquetaModuloNotificacion('rrhh'), 'RRHH');
});

test('etiqueta estados del historial y omisión por falta de correo', () => {
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'enviado' }), { etiqueta: 'Enviado', variante: 'on' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'pendiente' }), { etiqueta: 'Pendiente', variante: 'warn' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'enviando', intentos: 1 }), { etiqueta: 'Reintentando', variante: 'warn' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'error' }), { etiqueta: 'Error', variante: 'err' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'omitido', motivo: 'sin_correo', destinatario_email: null }), { etiqueta: 'Omitido · sin correo', variante: 'off' });
  assert.deepEqual(etiquetaEstadoEnvio({ estado: 'simulado' }), { etiqueta: 'Simulado (sin credenciales)', variante: 'off' });
  assert.equal(etiquetaCanalEnvio('whatsapp'), 'WhatsApp');
});

test('trata los teléfonos adicionales ausentes en reglas antiguas como una lista vacía', () => {
  const eventoAntiguo = { destinatarios: { rrhh: { whatsapp: true } } };
  assert.deepEqual(normalizarTelefonosAdicionales(eventoAntiguo.destinatarios?.telefonos_adicionales), []);
  assert.deepEqual(construirMatrizDestinatarios(eventoAntiguo.destinatarios, ['rrhh'], ['whatsapp']), {
    rrhh: { whatsapp: true }, correos_adicionales: [], telefonos_adicionales: [],
  });
  assert.deepEqual(normalizarTelefonosAdicionales(null), []);
  assert.deepEqual(normalizarTelefonosAdicionales('987654321'), []);
});
