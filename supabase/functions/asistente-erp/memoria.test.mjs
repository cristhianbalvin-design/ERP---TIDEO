// Pruebas de la memoria de conversación de Aria. Ejecutar: npm run test:aria-voz (Node) o deno test (Deno).
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosRecuerdo, extraDelTurno, leerRecuerdos, leerResumen, promptResumen, sistemaRecuerdos, sistemaResumen, vectorTexto } from './memoria.ts';

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

test('al archivar solo pide recuerdos con la memoria activa y lee máximo dos', () => {
  assert.doesNotMatch(promptResumen({}).at(0).content, /"recuerdos"/);
  assert.match(promptResumen({}, true).at(0).content, /"recuerdos".*Nunca incluyas montos/);
  assert.deepEqual(leerRecuerdos('```json\n{"titulo": "T", "recuerdos": ["Sueles usar el  CECO 1010.", 5, "corto", "Prefieres respuestas cortas.", "Tercero que sobra."]}\n```'),
    ['Sueles usar el CECO 1010.', 'Prefieres respuestas cortas.']);
  assert.deepEqual(leerRecuerdos('{"titulo": "T"}'), []);
  assert.deepEqual(leerRecuerdos('no es json'), []);
  assert.deepEqual(leerResumen('{"titulo": "T", "resumen": "R", "recuerdos": ["Sueles usar el CECO 1010."]}'), { titulo: 'T', resumen: 'R' });
});

test('los recuerdos entran como datos que no respaldan cifras', () => {
  assert.equal(sistemaRecuerdos([]), null);
  assert.equal(sistemaRecuerdos(null), null);
  assert.equal(sistemaRecuerdos([{ texto: '   ' }, { id: 'x' }]), null);
  const texto = sistemaRecuerdos([{ id: 'a', texto: 'Trabajas con Taller Ate.' }, { texto: 'Prefieres respuestas cortas.' }]);
  assert.match(texto, /^Lo que recuerdas de esta persona/);
  assert.match(texto, /no respaldan cifras/);
  assert.match(texto, /\n- Trabajas con Taller Ate\.\n- Prefieres respuestas cortas\.$/);
});

test('el embedding viaja como texto solo con 1536 números', () => {
  assert.equal(vectorTexto(null), null);
  assert.equal(vectorTexto([1, 2, 3]), null);
  assert.equal(vectorTexto(Array(1536).fill('x')), null);
  const vector = vectorTexto(Array(1536).fill(0.5));
  assert.ok(vector.startsWith('[0.5,0.5,') && vector.endsWith(',0.5]'));
});

test('los avisos de recuerdo conservan id, texto y tipo, y viajan en el extra del turno', () => {
  assert.deepEqual(avisosRecuerdo([{ id: 'a', texto: 'Uno', tipo: 'automatico', estado: 'guardado' }, { id: 'b', texto: 'Dos' }, { texto: 'sin id' }, null]),
    [{ id: 'a', texto: 'Uno', tipo: 'automatico' }, { id: 'b', texto: 'Dos', tipo: 'explicito' }]);
  assert.deepEqual(avisosRecuerdo('x'), []);
  assert.deepEqual(extraDelTurno(['a'], null, null, [{ id: 'a', texto: 'Uno', tipo: 'explicito' }]), { herramientas: ['a'], recuerdos: [{ id: 'a', texto: 'Uno', tipo: 'explicito' }] });
  assert.deepEqual(extraDelTurno(['a'], null, null, []), { herramientas: ['a'] });
});
