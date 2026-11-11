// Pruebas de la memoria de conversación de Aria. Ejecutar: npm run test:aria-voz (Node) o deno test (Deno).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extraDelTurno, leerResumen, promptResumen, sistemaResumen } from './memoria.ts';

test('el resumen previo entra como sistema con la advertencia de cifras', () => {
  assert.equal(sistemaResumen(''), null);
  assert.equal(sistemaResumen(null), null);
  assert.match(sistemaResumen('Revisó CxP vencidas.'), /las cifras pueden haber cambiado.*Revisó CxP vencidas\./);
});

test('el prompt incluye resumen previo, mensajes a incorporar y recientes', () => {
  const [sistema, usuario] = promptResumen({ resumen_previo: 'Habló de caja chica.', por_resumir: [{ rol: 'user', contenido: 'cuánto hay en bancos' }], recientes: [{ rol: 'assistant', contenido: 'Hay S/ 10.00' }] });
  assert.equal(sistema.role, 'system');
  assert.match(sistema.content, /"titulo"/);
  assert.match(usuario.content, /Resumen previo:\nHabló de caja chica\./);
  assert.match(usuario.content, /Persona: cuánto hay en bancos/);
  assert.match(usuario.content, /Aria: Hay S\/ 10\.00/);
});

test('lee el JSON del modelo aunque venga en bloque de código y recorta', () => {
  assert.deepEqual(leerResumen('```json\n{"titulo": "Egreso de guantes para taller.", "resumen": "Borrador sin confirmar."}\n```'),
    { titulo: 'Egreso de guantes para taller', resumen: 'Borrador sin confirmar.' });
  assert.equal(leerResumen('no es json'), null);
  assert.equal(leerResumen('{"titulo": "", "resumen": ""}'), null);
  assert.equal(leerResumen('{"titulo": "' + 'x'.repeat(200) + '"}').titulo.length, 80);
});

test('extra del turno guarda herramientas sin repetir, botones y borrador', () => {
  assert.deepEqual(extraDelTurno(['a', 'a', 'b'], null, null), { herramientas: ['a', 'b'] });
  assert.deepEqual(extraDelTurno([], { campo: 'fondo' }, { id: 'x' }), { herramientas: [], opciones: { campo: 'fondo' }, borrador: { id: 'x' } });
});
