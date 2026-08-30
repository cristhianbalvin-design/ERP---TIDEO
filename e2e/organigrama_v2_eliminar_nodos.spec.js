import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readEnvFile = file => {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]));
};

const appEnv = readEnvFile(path.join(rootDir, '.env.local'));
const e2eEnv = readEnvFile(path.join(rootDir, '.env.e2e.local'));
const supabaseUrl = process.env.E2E_SUPABASE_URL || appEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY || appEnv.VITE_SUPABASE_ANON_KEY;
const editorEmail = process.env.E2E_ORGANIGRAMA_EDITOR_EMAIL || e2eEnv.E2E_ORGANIGRAMA_EDITOR_EMAIL;
const editorPassword = process.env.E2E_ORGANIGRAMA_EDITOR_PASSWORD || e2eEnv.E2E_ORGANIGRAMA_EDITOR_PASSWORD;
const empresaId = 'emp_2000000000';
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let accessToken;
let editorUserId;
let base;
let session;
let uiFixture;
const unidadesCreadas = [];
const colocacionesCreadas = [];

const required = (value, label) => {
  if (!value) throw new Error(`Falta ${label}.`);
  return value;
};

const headers = () => ({
  apikey: required(supabaseAnonKey, 'VITE_SUPABASE_ANON_KEY'),
  authorization: `Bearer ${required(accessToken, 'access token de E2E')}`,
  'content-type': 'application/json',
});

const rpc = async (request, name, payload, expectedStatus = 200) => {
  const response = await request.post(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/rest/v1/rpc/${name}`, { headers: headers(), data: payload });
  expect(response.status(), `${name}: ${await response.text()}`).toBe(expectedStatus);
  return response;
};

const get = async (request, table, query) => {
  const response = await request.get(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/rest/v1/${table}?${query}`, { headers: headers() });
  expect(response.ok(), `${table}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const insert = async (request, table, data) => {
  const response = await request.post(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/rest/v1/${table}`, {
    headers: { ...headers(), Prefer: 'return=representation' }, data,
  });
  expect(response.ok(), `${table}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const remove = async (request, table, query) => {
  const response = await request.delete(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/rest/v1/${table}?${query}`, { headers: headers() });
  expect(response.ok(), `${table}: ${await response.text()}`).toBeTruthy();
};

const crearUO = async (request, label) => {
  const id = `uo_e2e_delete_${suffix}_${label}`;
  await insert(request, 'unidades_organizacionales', {
    id, empresa_id: empresaId, codigo: `E2E-DEL-${suffix}-${label}`.slice(0, 50), nombre: `E2E eliminación ${suffix} ${label}`, estado: 'activo',
  });
  unidadesCreadas.push(id);
  return id;
};

const crearColocacion = async (request, { unidadId, id, estado = 'activo', nivelId = base.nivelOperativoId, rolId = base.rolOperativoId, cargoId = base.cargoId, cantidad = 1 }) => {
  await rpc(request, 'crear_o_actualizar_cargo_colocacion', {
    p_id: id, p_empresa_id: empresaId, p_sociedad_id: null, p_unidad_organizacional_id: unidadId,
    p_cargo_id: cargoId, p_nivel_jerarquico_id: nivelId, p_rol_id: rolId, p_cantidad_posiciones: cantidad,
    p_estado: estado, p_reporta_a_cargo_colocacion_id: null,
  });
  colocacionesCreadas.push(id);
  await rpc(request, 'generar_posiciones_desde_colocacion', { p_cargo_colocacion_id: id });
  return (await get(request, 'posiciones', `select=id&empresa_id=eq.${empresaId}&cargo_colocacion_id=eq.${id}&activa=eq.true`)).map(item => item.id);
};

const limpiarColocacion = async (request, id) => {
  const posiciones = await get(request, 'posiciones', `select=id&empresa_id=eq.${empresaId}&cargo_colocacion_id=eq.${id}`);
  for (const posicion of posiciones) {
    await remove(request, 'posiciones_usuarios', `empresa_id=eq.${empresaId}&posicion_id=eq.${posicion.id}`);
    await remove(request, 'posicion_relaciones_matriciales', `empresa_id=eq.${empresaId}&or=(posicion_subordinada_id.eq.${posicion.id},posicion_jefe_id.eq.${posicion.id})`);
    await remove(request, 'posiciones', `id=eq.${posicion.id}&empresa_id=eq.${empresaId}`);
  }
  await remove(request, 'cargo_colocaciones', `id=eq.${id}&empresa_id=eq.${empresaId}`);
};

test.describe.serial('Eliminar nodos del organigrama v2 — PRUEBA solamente', () => {
  test.beforeAll(async ({ request }) => {
    const login = await request.post(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
      headers: { apikey: required(supabaseAnonKey, 'VITE_SUPABASE_ANON_KEY'), 'content-type': 'application/json' },
      data: { email: required(editorEmail, 'E2E_ORGANIGRAMA_EDITOR_EMAIL'), password: required(editorPassword, 'E2E_ORGANIGRAMA_EDITOR_PASSWORD') },
    });
    expect(login.ok()).toBeTruthy();
    session = await login.json();
    accessToken = session.access_token;
    editorUserId = session.user.id;

    const [colocacion] = await get(request, 'cargo_colocaciones', `select=cargo_id,nivel_jerarquico_id,rol_id&empresa_id=eq.${empresaId}&estado=eq.activo&limit=1`);
    expect(colocacion).toBeTruthy();
    base = { cargoId: colocacion.cargo_id, nivelOperativoId: colocacion.nivel_jerarquico_id, rolOperativoId: colocacion.rol_id };

    const [direccion, operativo] = await Promise.all([
      get(request, 'cargo_colocaciones', `select=cargo_id,nivel_jerarquico_id,rol_id&empresa_id=eq.${empresaId}&nivel_jerarquico_id=eq.nj_emp_2000000000_direccion&limit=1`),
      get(request, 'cargo_colocaciones', `select=cargo_id,nivel_jerarquico_id,rol_id&empresa_id=eq.${empresaId}&nivel_jerarquico_id=eq.nj_emp_2000000000_operativo&limit=1`),
    ]);
    expect(direccion[0]).toBeTruthy();
    expect(operativo[0]).toBeTruthy();
    base = { ...base, direccion: direccion[0], operativo: operativo[0] };
    [uiFixture] = await get(request, 'cargo_colocaciones', `select=id,unidad_organizacional_id&empresa_id=eq.${empresaId}&estado=eq.activo&limit=1`);
    expect(uiFixture).toBeTruthy();
  });

  test('rechaza UO con hija y elimina UO sin dependientes', async ({ request }) => {
    const padre = await crearUO(request, 'padre');
    const hija = await crearUO(request, 'hija');
    const patch = await request.patch(`${supabaseUrl}/rest/v1/unidades_organizacionales?id=eq.${hija}`, { headers: headers(), data: { unidad_padre_id: padre } });
    expect(patch.ok(), await patch.text()).toBeTruthy();

    const rechazada = await rpc(request, 'eliminar_unidad_organizacional', { p_id: padre }, 400);
    await expect(rechazada.text()).resolves.toMatch(/tiene 1 unidad\(es\) hija\(s\).*E2E eliminación/i);

    const vacia = await crearUO(request, 'vacia');
    await rpc(request, 'eliminar_unidad_organizacional', { p_id: vacia });
    expect(await get(request, 'unidades_organizacionales', `select=id&id=eq.${vacia}&empresa_id=eq.${empresaId}`)).toEqual([]);

    await request.patch(`${supabaseUrl}/rest/v1/unidades_organizacionales?id=eq.${hija}`, { headers: headers(), data: { unidad_padre_id: null } });
    await remove(request, 'unidades_organizacionales', `id=in.(${padre},${hija})&empresa_id=eq.${empresaId}`);
  });

  test('rechaza UO con cargo inactivo y posición histórica', async ({ request }) => {
    const unidadId = await crearUO(request, 'historia');
    const colocacionId = `ccol_e2e_delete_${suffix}_historia`;
    const [posicionId] = await crearColocacion(request, { unidadId, id: colocacionId, estado: 'inactivo' });
    await insert(request, 'posiciones_usuarios', { empresa_id: empresaId, posicion_id: posicionId, user_id: editorUserId, fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02' });
    const rechazada = await rpc(request, 'eliminar_unidad_organizacional', { p_id: unidadId }, 400);
    await expect(rechazada.text()).resolves.toMatch(/cargo\(s\) inactivo\(s\) o posiciones históricas asociadas/i);
    await limpiarColocacion(request, colocacionId);
    await remove(request, 'unidades_organizacionales', `id=eq.${unidadId}&empresa_id=eq.${empresaId}`);
  });

  test('rechaza cargo con posición ocupada y elimina cargo vacante con sus posiciones', async ({ request }) => {
    const unidadOcupada = await crearUO(request, 'ocupada');
    const colocacionOcupada = `ccol_e2e_delete_${suffix}_ocupada`;
    const [posicionOcupada] = await crearColocacion(request, { unidadId: unidadOcupada, id: colocacionOcupada });
    await insert(request, 'posiciones_usuarios', { empresa_id: empresaId, posicion_id: posicionOcupada, user_id: editorUserId, fecha_inicio: '2026-01-01' });
    const rechazada = await rpc(request, 'eliminar_cargo_colocacion', { p_id: colocacionOcupada }, 400);
    await expect(rechazada.text()).resolves.toMatch(/1 posición\(es\) ocupada\(s\) por:/i);
    await limpiarColocacion(request, colocacionOcupada);
    await remove(request, 'unidades_organizacionales', `id=eq.${unidadOcupada}&empresa_id=eq.${empresaId}`);

    const unidadVacante = await crearUO(request, 'vacante');
    const colocacionVacante = `ccol_e2e_delete_${suffix}_vacante`;
    const posiciones = await crearColocacion(request, { unidadId: unidadVacante, id: colocacionVacante, cantidad: 2 });
    expect(posiciones).toHaveLength(2);
    await rpc(request, 'eliminar_cargo_colocacion', { p_id: colocacionVacante });
    expect(await get(request, 'cargo_colocaciones', `select=id&id=eq.${colocacionVacante}&empresa_id=eq.${empresaId}`)).toEqual([]);
    expect(await get(request, 'posiciones', `select=id&cargo_colocacion_id=eq.${colocacionVacante}&empresa_id=eq.${empresaId}`)).toEqual([]);
    await remove(request, 'unidades_organizacionales', `id=eq.${unidadVacante}&empresa_id=eq.${empresaId}`);
  });

  test('rechaza cargo usado como jefe en una relación matricial activa', async ({ request }) => {
    const unidadJefe = await crearUO(request, 'matriz-jefe');
    const unidadSubordinada = await crearUO(request, 'matriz-sub');
    const jefeId = `ccol_e2e_delete_${suffix}_jefe`;
    const subordinadaId = `ccol_e2e_delete_${suffix}_sub`;
    const [posicionJefe] = await crearColocacion(request, {
      unidadId: unidadJefe, id: jefeId,
      cargoId: base.direccion.cargo_id, nivelId: base.direccion.nivel_jerarquico_id, rolId: base.direccion.rol_id,
    });
    const [posicionSubordinada] = await crearColocacion(request, {
      unidadId: unidadSubordinada, id: subordinadaId,
      cargoId: base.operativo.cargo_id, nivelId: base.operativo.nivel_jerarquico_id, rolId: base.operativo.rol_id,
    });
    await rpc(request, 'crear_relacion_matricial', { p_empresa_id: empresaId, p_posicion_subordinada_id: posicionSubordinada, p_posicion_jefe_id: posicionJefe, p_sociedad_id: null });
    const rechazada = await rpc(request, 'eliminar_cargo_colocacion', { p_id: jefeId }, 400);
    await expect(rechazada.text()).resolves.toMatch(/1 relación\(es\) matricial\(es\) activa\(s\) con:/i);

    const [relacion] = await get(request, 'posicion_relaciones_matriciales', `select=id&empresa_id=eq.${empresaId}&posicion_subordinada_id=eq.${posicionSubordinada}&posicion_jefe_id=eq.${posicionJefe}&estado=eq.activo`);
    await rpc(request, 'eliminar_relacion_matricial', { p_id: relacion.id });
    await rpc(request, 'eliminar_cargo_colocacion', { p_id: jefeId });
    await rpc(request, 'eliminar_cargo_colocacion', { p_id: subordinadaId });
    await remove(request, 'unidades_organizacionales', `id=in.(${unidadJefe},${unidadSubordinada})&empresa_id=eq.${empresaId}`);
  });

  test('muestra ambas confirmaciones de eliminación en el lienzo sin mutar datos', async ({ page }) => {
    const ref = new URL(required(supabaseUrl, 'VITE_SUPABASE_URL')).hostname.split('.')[0];
    await page.addInitScript(({ key, authSession }) => localStorage.setItem(key, JSON.stringify(authSession)), {
      key: `sb-${ref}-auth-token`, authSession: session,
    });
    await page.goto(`/?ov2preview=1&empresa=${empresaId}`);
    await page.getByRole('button', { name: 'Administración' }).click();

    let mensajeUo = '';
    page.once('dialog', dialog => { mensajeUo = dialog.message(); return dialog.dismiss(); });
    await page.getByTestId(`ov2-delete-uo-${uiFixture.unidad_organizacional_id}`).evaluate(button => button.click());
    await expect.poll(() => mensajeUo).toMatch(/Eliminar la UO/i);

    await page.getByTestId(`ov2-node-ccol-${uiFixture.id}`).evaluate(node => node.click());
    await expect(page.getByTestId('ov2-edit-delete')).toBeVisible();
    let mensajeCargo = '';
    page.once('dialog', dialog => { mensajeCargo = dialog.message(); return dialog.dismiss(); });
    await page.getByTestId('ov2-edit-delete').evaluate(button => button.click());
    await expect.poll(() => mensajeCargo).toMatch(/Eliminar el cargo/i);
  });

  test.afterAll(async ({ request }) => {
    for (const id of colocacionesCreadas) {
      await limpiarColocacion(request, id).catch(() => {});
    }
    for (const id of unidadesCreadas) {
      await remove(request, 'unidades_organizacionales', `id=eq.${id}&empresa_id=eq.${empresaId}`).catch(() => {});
    }
  });
});
