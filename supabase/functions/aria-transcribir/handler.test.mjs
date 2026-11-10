// Pruebas de la Edge aria-transcribir. Ejecutar: npm run test:aria-voz
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, createHandler, esEcoDelPrompt, validarAudio, validarEmpresaId, MAX_AUDIO_BYTES } from './handler.ts';

const ORIGEN = 'https://erp.tideo.tech';
const env = extra => name => ({ OPENAI_API_KEY: 'test', ...extra })[name];
const supa = ({ user = { id: 'u1' }, cuota = { puede_continuar: true, restante: 59 }, rpcError = null } = {}) => {
  const llamadas = [];
  return { llamadas, cliente: { auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no' } }) }, rpc: async (fn, args) => { llamadas.push({ fn, args }); return { data: cuota, error: rpcError }; } } };
};
const openai = (respuesta = { ok: true, json: { text: '¿Cuánto hay en bancos?' } }) => {
  const llamadas = [];
  const fn = async (url, init) => { llamadas.push({ url, init }); if (respuesta.lanzar) throw respuesta.lanzar; return { ok: respuesta.ok, json: async () => respuesta.json }; };
  return { llamadas, fn };
};
const solicitud = ({ token = 'tok', empresa = 'emp_2000000000', audio = new File([new Uint8Array(2000)], 'pregunta.webm', { type: 'audio/webm;codecs=opus' }), origin = ORIGEN, method = 'POST' } = {}) => {
  const form = new FormData();
  if (empresa !== undefined) form.append('empresa_id', empresa);
  if (audio) form.append('audio', audio);
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://x.supabase.co/functions/v1/aria-transcribir', { method, headers, ...(method === 'POST' ? { body: form } : {}) });
};
const ejecutar = async (opciones = {}) => {
  const s = supa(opciones.supa);
  const o = openai(opciones.openai);
  const handler = createHandler({ env: env(opciones.env), createSupabase: () => s.cliente, fetch: o.fn, timeoutMs: opciones.timeoutMs });
  const res = await handler(solicitud(opciones.req));
  const cuerpo = res.status === 204 ? null : await res.json();
  return { res, cuerpo, s, o };
};

test('OPTIONS responde CORS solo para orígenes permitidos', async () => {
  const handler = createHandler({ env: env(), createSupabase: () => supa().cliente, fetch: openai().fn });
  const ok = await handler(solicitud({ method: 'OPTIONS' }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGEN);
  const otro = await handler(solicitud({ method: 'OPTIONS', origin: 'https://malicioso.example' }));
  assert.equal(otro.headers.get('Access-Control-Allow-Origin'), null);
});

test('ASISTENTE_ORIGENES_EXTRA agrega previews https válidos y descarta el resto', () => {
  const o = allowedOrigins('https://preview.vercel.app, http://inseguro.example, basura');
  assert.ok(o.has('https://preview.vercel.app'));
  assert.ok(!o.has('http://inseguro.example'));
  assert.equal(o.size, 2);
});

test('sin sesión devuelve 401 y no transcribe', async () => {
  const { res, o } = await ejecutar({ req: { token: null } });
  assert.equal(res.status, 401);
  assert.equal(o.llamadas.length, 0);
});

test('sesión inválida devuelve 401', async () => {
  const { res, s, o } = await ejecutar({ supa: { user: null } });
  assert.equal(res.status, 401);
  assert.equal(s.llamadas.length, 0);
  assert.equal(o.llamadas.length, 0);
});

test('empresa o audio no válidos devuelven 400', async () => {
  assert.equal((await ejecutar({ req: { empresa: "x'; drop" } })).res.status, 400);
  assert.equal((await ejecutar({ req: { audio: null } })).res.status, 400);
  const texto = new File(['hola'], 'a.txt', { type: 'text/plain' });
  assert.equal((await ejecutar({ req: { audio: texto } })).res.status, 400);
});

test('sin acceso a la empresa devuelve 403 y no llama a OpenAI', async () => {
  const { res, o } = await ejecutar({ supa: { cuota: null, rpcError: { message: 'El usuario no pertenece a la empresa' } } });
  assert.equal(res.status, 403);
  assert.equal(o.llamadas.length, 0);
});

test('límite diario alcanzado devuelve 429 y no llama a OpenAI', async () => {
  const { res, cuerpo, o } = await ejecutar({ supa: { cuota: { puede_continuar: false, restante: 0 } } });
  assert.equal(res.status, 429);
  assert.equal(cuerpo.transcripciones_restantes, 0);
  assert.equal(o.llamadas.length, 0);
});

test('transcribe, registra el uso y devuelve el texto con lo que queda', async () => {
  const { res, cuerpo, s, o } = await ejecutar();
  assert.equal(res.status, 200);
  assert.deepEqual(cuerpo, { ok: true, texto: '¿Cuánto hay en bancos?', transcripciones_restantes: 59 });
  assert.equal(s.llamadas[0].fn, 'aria_registrar_transcripcion');
  assert.deepEqual(s.llamadas[0].args, { p_empresa_id: 'emp_2000000000', p_bytes: 2000 });
  const enviado = o.llamadas[0].init.body;
  assert.equal(enviado.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(enviado.get('language'), 'es');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGEN);
});

test('respuesta vacía o eco del prompt se reporta como sin voz (422)', async () => {
  assert.equal((await ejecutar({ openai: { ok: true, json: { text: '' } } })).res.status, 422);
  const eco = 'Transcribe fielmente en español peruano una consulta hablada a un sistema ERP.';
  assert.equal((await ejecutar({ openai: { ok: true, json: { text: eco } } })).res.status, 422);
});

test('fallos de OpenAI devuelven 502 y el tiempo agotado 504', async () => {
  assert.equal((await ejecutar({ openai: { ok: false, json: {} } })).res.status, 502);
  const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
  assert.equal((await ejecutar({ openai: { lanzar: abort } })).res.status, 504);
  assert.equal((await ejecutar({ openai: { lanzar: new TypeError('red') } })).res.status, 502);
});

test('sin OPENAI_API_KEY devuelve 502 sin registrar uso', async () => {
  const { res, s } = await ejecutar({ env: { OPENAI_API_KEY: undefined } });
  assert.equal(res.status, 502);
  assert.equal(s.llamadas.length, 0);
});

test('validaciones puras', () => {
  assert.ok('error' in validarAudio({ size: 0, type: 'audio/webm' }));
  assert.ok('error' in validarAudio({ size: MAX_AUDIO_BYTES + 1, type: 'audio/webm' }));
  assert.deepEqual(validarAudio({ size: 10, type: 'audio/mp4' }), { value: { mime: 'audio/mp4' } });
  assert.ok(validarEmpresaId('emp20609996464'));
  assert.ok(!validarEmpresaId(''));
  assert.ok(esEcoDelPrompt('   '));
  assert.ok(!esEcoDelPrompt('¿Qué SOLPE faltan aprobar en tesorería?'));
});
