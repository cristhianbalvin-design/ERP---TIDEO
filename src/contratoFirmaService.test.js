import test from 'node:test';
import assert from 'node:assert/strict';
import { crearOtpFirma, crearTokenFirma, distribuirTextoPdf, extraerIpCliente, mensajeMotivoFirma, sha256Hex } from '../supabase/functions/_shared/contratoFirma.js';
import { mensajeErrorFuncion } from './contratoFirmaService.js';

test('genera token aleatorio base64url y OTP de seis dígitos', () => {
  assert.match(crearTokenFirma(), /^[A-Za-z0-9_-]{43}$/);
  assert.match(crearOtpFirma(), /^\d{6}$/);
});

test('calcula SHA-256 y prioriza la IP de Cloudflare sobre X-Forwarded-For', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(extraerIpCliente(new Headers({ 'cf-connecting-ip': '198.51.100.8', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '198.51.100.8');
  assert.equal(extraerIpCliente(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9');
});

test('propaga el cuerpo de error no 2xx y sus metadatos', async () => {
  const error = { context: { json: async () => ({ error: 'El código no coincide. Te quedan 2 intentos.', motivo: 'codigo_incorrecto', intentos_restantes: 2 }) } };
  const result = await mensajeErrorFuncion(error, 'genérico');
  assert.equal(result.message, 'El código no coincide. Te quedan 2 intentos.');
  assert.equal(result.motivo, 'codigo_incorrecto');
  assert.equal(result.intentos_restantes, 2);
});

test('envuelve el texto con el ancho de fuente y pagina al alcanzar el margen inferior', () => {
  const font = { widthOfTextAtSize: text => text.length * 5 };
  const result = distribuirTextoPdf({ texto: 'uno dos tres cuatro', font, size: 10, maxWidth: 40, lineHeight: 12, startY: 30, bottomY: 10, pageHeight: 100 });
  assert.deepEqual(result.lines, ['uno dos', 'tres', 'cuatro']);
  assert.deepEqual(result.positioned.map(line => line.page), [0, 0, 1]);
});

test('parte la huella SHA-256 con el ancho real y conserva tildes WinAnsi', () => {
  const font = { widthOfTextAtSize: (text, size) => text.length * size / 2 };
  const hash = 'a'.repeat(64);
  const wrappedHash = distribuirTextoPdf({ texto: hash, font, size: 10, maxWidth: 100, lineHeight: 15, startY: 700, bottomY: 48, pageHeight: 842 });
  assert.equal(wrappedHash.lines.join('').length, 64);
  assert.ok(wrappedHash.lines.length > 1);
  const accented = distribuirTextoPdf({ texto: 'Dirección IP · renovación electrónica', font, size: 10, maxWidth: 500, lineHeight: 15, startY: 700, bottomY: 48, pageHeight: 842 });
  assert.equal(accented.lines.join(' '), 'Dirección IP · renovación electrónica');
});

test('mapea estados terminales de firma a mensajes claros', () => {
  assert.match(mensajeMotivoFirma('expirado'), /venció/);
  assert.match(mensajeMotivoFirma('anulado'), /anulada/);
  assert.match(mensajeMotivoFirma('firmado'), /firmado/);
});

test('indica intentos restantes y no expone motivos internos desconocidos', () => {
  assert.match(mensajeMotivoFirma('codigo_incorrecto', 3), /3 intentos/);
  assert.match(mensajeMotivoFirma('motivo_interno'), /No se pudo completar/);
});
