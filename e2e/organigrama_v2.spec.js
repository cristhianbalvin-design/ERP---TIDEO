import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotsDir = path.join(rootDir, 'e2e', 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const readEnvFile = file => {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map(line => line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]),
  );
};

const appEnv = readEnvFile(path.join(rootDir, '.env.local'));
const e2eEnv = readEnvFile(path.join(rootDir, '.env.e2e.local'));
const supabaseUrl = process.env.E2E_SUPABASE_URL || appEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY || appEnv.VITE_SUPABASE_ANON_KEY;
const editorEmail = process.env.E2E_ORGANIGRAMA_EDITOR_EMAIL || e2eEnv.E2E_ORGANIGRAMA_EDITOR_EMAIL;
const editorPassword = process.env.E2E_ORGANIGRAMA_EDITOR_PASSWORD || e2eEnv.E2E_ORGANIGRAMA_EDITOR_PASSWORD;

const EMPRESA_PRUEBA = 'emp_2000000000';
const fixtures = {
  direccion: {
    id: 'ccol_e2e_ov2_direccion',
    unidadId: 'uo_1bcf378cb0b04e71bb',
    cargoId: 'car_dfe1d0ea283949429a',
    nivelId: 'nj_emp_2000000000_direccion',
    rolId: 'rol_emp_2000000000_admin',
  },
  jefatura: {
    id: 'ccol_e2e_ov2_jefatura',
    unidadId: 'uo_33933309841343c7b7',
    cargoId: 'car_39272d1472d141a582',
    nivelId: 'nj_emp_2000000000_jefatura',
    rolId: 'rol_emp_2000000000_comercial_jefe',
  },
  operativo: {
    id: 'ccol_e2e_ov2_operativo',
    unidadId: 'uo_932d7de86b924946a1',
    cargoId: 'car_3a7fe2a8003d4d1c82',
    nivelId: 'nj_emp_2000000000_operativo',
    rolId: 'rol_emp_2000000000_ops_tecnico',
  },
};

let accessToken;
let session;
let fixturePositions = {};
let createPair;
let matrizId;
let destinoReasignacionUo;

const required = (value, label) => {
  if (!value) throw new Error(`Falta ${label}; configúralo en .env.e2e.local o en el entorno.`);
  return value;
};

const authHeaders = () => ({
  apikey: required(supabaseAnonKey, 'VITE_SUPABASE_ANON_KEY'),
  authorization: `Bearer ${required(accessToken, 'access token de E2E')}`,
  'content-type': 'application/json',
});

const rpc = async (request, name, payload) => {
  const response = await request.post(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/rest/v1/rpc/${name}`, { headers: authHeaders(), data: payload });
  if (!response.ok()) throw new Error(`${name}: ${response.status()} ${await response.text()}`);
  return response.json();
};

const rest = async (request, table, query) => {
  const response = await request.get(`${required(supabaseUrl, 'VITE_SUPABASE_URL')}/rest/v1/${table}?${query}`, { headers: authHeaders() });
  if (!response.ok()) throw new Error(`${table}: ${response.status()} ${await response.text()}`);
  return response.json();
};

const ensureFixture = async (request, fixture) => {
  await rpc(request, 'crear_o_actualizar_cargo_colocacion', {
    p_id: fixture.id,
    p_empresa_id: EMPRESA_PRUEBA,
    p_sociedad_id: null,
    p_unidad_organizacional_id: fixture.unidadId,
    p_cargo_id: fixture.cargoId,
    p_nivel_jerarquico_id: fixture.nivelId,
    p_rol_id: fixture.rolId,
    p_cantidad_posiciones: 1,
    p_estado: 'activo',
    p_reporta_a_cargo_colocacion_id: null,
  });
  await rpc(request, 'generar_posiciones_desde_colocacion', { p_cargo_colocacion_id: fixture.id });
};

const openPreview = async page => {
  await page.goto(`/?ov2preview=1&empresa=${EMPRESA_PRUEBA}`);
  await page.getByRole('button', { name: 'Administración' }).click();
  await expect(page.getByRole('heading', { name: 'Organigrama v2' })).toBeVisible();
  await expect(page.getByTestId(`ov2-node-ccol-${fixtures.direccion.id}`)).toBeVisible();
};

const screenshot = (page, name) => page.screenshot({ path: path.join(screenshotsDir, `${name}.png`), fullPage: true });

const dragNode = async (page, testId, deltaX, deltaY) => {
  await page.locator('.react-flow__controls-fitview').click({ force: true });
  await page.waitForTimeout(120);
  const card = page.getByTestId(testId);
  const node = page.locator('.react-flow__node').filter({ has: card }).first();
  const box = await card.boundingBox();
  const startX = box.x + 12;
  const startY = box.y + 12;
  if (!box) throw new Error(`No se encontró la tarjeta arrastrable para ${testId}.`);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await expect(node).toHaveClass(/dragging/);
  await page.waitForTimeout(80);
  await page.mouse.up();
};

const connect = async (page, sourceTestId, targetTestId, { sourceHandle, targetHandle }, { force = true } = {}) => {
  await page.locator('.react-flow__controls-fitview').click({ force: true });
  await page.waitForTimeout(120);
  const source = page.getByTestId(sourceTestId).locator(`[data-handleid="${sourceHandle}"]`);
  const target = page.getByTestId(targetTestId).locator(`[data-handleid="${targetHandle}"]`);
  await source.dragTo(target, { force });
};

const connectUntil = async (page, sourceTestId, targetTestId, handles, expected, options) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await connect(page, sourceTestId, targetTestId, handles, options);
    if (await expected.isVisible({ timeout: 3_000 }).catch(() => false)) return;
  }
  await expect(expected).toBeVisible();
};

const transformOf = style => style?.match(/transform:\s*([^;]+);/)?.[1] || '';

const nodePosition = async (page, testId) => page
  .locator('.react-flow__node')
  .filter({ has: page.getByTestId(testId) })
  .first()
  .evaluate(element => {
    const match = element.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (!match) throw new Error(`No se pudo leer la posición React Flow: ${element.style.transform}`);
    return { x: Number(match[1]), y: Number(match[2]) };
  });

test.describe.serial('Organigrama v2 — PRUEBA solamente', () => {
  test.beforeAll(async ({ request }) => {
    required(supabaseUrl, 'VITE_SUPABASE_URL');
    required(supabaseAnonKey, 'VITE_SUPABASE_ANON_KEY');
    const login = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: supabaseAnonKey, 'content-type': 'application/json' },
      data: { email: required(editorEmail, 'E2E_ORGANIGRAMA_EDITOR_EMAIL'), password: required(editorPassword, 'E2E_ORGANIGRAMA_EDITOR_PASSWORD') },
    });
    expect(login.ok()).toBeTruthy();
    session = await login.json();
    accessToken = session.access_token;

    await Promise.all(Object.values(fixtures).map(fixture => ensureFixture(request, fixture)));
    const posiciones = await rest(request, 'posiciones', `select=id,cargo_colocacion_id&empresa_id=eq.${EMPRESA_PRUEBA}&activa=eq.true&cargo_colocacion_id=in.(${Object.values(fixtures).map(fixture => fixture.id).join(',')})`);
    fixturePositions = Object.fromEntries(Object.values(fixtures).map(fixture => [fixture.id, posiciones.find(posicion => posicion.cargo_colocacion_id === fixture.id)?.id]));
    expect(Object.values(fixturePositions).every(Boolean)).toBeTruthy();

    await Promise.all([
      [fixtures.direccion.id, 380, 120],
      [fixtures.jefatura.id, 380, 330],
      [fixtures.operativo.id, 380, 540],
    ].map(([nodoId, x, y]) => rpc(request, 'guardar_posicion_nodo_organigrama', {
      p_empresa_id: EMPRESA_PRUEBA,
      p_tipo_nodo: 'cargo_colocacion',
      p_nodo_id: nodoId,
      p_x: x,
      p_y: y,
    })));

    const matriz = await rpc(request, 'crear_relacion_matricial', {
      p_empresa_id: EMPRESA_PRUEBA,
      p_posicion_subordinada_id: fixturePositions[fixtures.operativo.id],
      p_posicion_jefe_id: fixturePositions[fixtures.direccion.id],
      p_sociedad_id: null,
    });
    matrizId = matriz.id;

    const [unidades, cargos, colocaciones] = await Promise.all([
      rest(request, 'unidades_organizacionales', `select=id&empresa_id=eq.${EMPRESA_PRUEBA}&estado=eq.activo`),
      rest(request, 'cargos_empresa', `select=id&empresa_id=eq.${EMPRESA_PRUEBA}&estado=eq.activo`),
      rest(request, 'cargo_colocaciones', `select=id,unidad_organizacional_id,cargo_id,nivel_jerarquico_id&empresa_id=eq.${EMPRESA_PRUEBA}&estado=eq.activo`),
    ]);
    createPair = unidades
      .flatMap(unidad => cargos.map(cargo => ({ unidadId: unidad.id, cargoId: cargo.id })))
      .find(pair => !colocaciones.some(colocacion => colocacion.unidad_organizacional_id === pair.unidadId && colocacion.cargo_id === pair.cargoId));
    expect(createPair).toBeTruthy();

    destinoReasignacionUo = unidades.find(unidad => (
      unidad.id !== fixtures.direccion.unidadId
      && !colocaciones.some(colocacion => (
        colocacion.unidad_organizacional_id === unidad.id
        && colocacion.cargo_id === fixtures.direccion.cargoId
        && colocacion.nivel_jerarquico_id === fixtures.direccion.nivelId
      ))
    ));
    expect(destinoReasignacionUo).toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    const ref = new URL(required(supabaseUrl, 'VITE_SUPABASE_URL')).hostname.split('.')[0];
    await page.addInitScript(({ key, authSession }) => localStorage.setItem(key, JSON.stringify(authSession)), {
      key: `sb-${ref}-auth-token`,
      authSession: session,
    });
    await openPreview(page);
  });

  test('0. muestra cursor de arrastre y encuadra el árbol al entrar', async ({ page }) => {
    const card = page.getByTestId(`ov2-node-ccol-${fixtures.direccion.id}`);
    const box = await card.boundingBox();
    if (!box) throw new Error('No se encontró la tarjeta de prueba para validar el cursor.');

    expect(await card.evaluate(element => getComputedStyle(element).cursor)).toBe('grab');

    const viewportTransform = await page.locator('.react-flow__viewport').getAttribute('style');
    expect(transformOf(viewportTransform)).not.toBe('');
    await expect(card).toBeVisible();
    await screenshot(page, '00-cursor-y-encuadre-inicial');
  });

  test('1. persiste la posición visual tras arrastrar y recargar', async ({ page }) => {
    const card = page.getByTestId(`ov2-node-ccol-${fixtures.direccion.id}`);
    const wrapper = page.locator('.react-flow__node').filter({ has: card }).first();
    const before = await wrapper.getAttribute('style');
    for (const [deltaX, deltaY] of [[150, 65], [-135, 72], [110, -80]]) {
      await dragNode(page, `ov2-node-ccol-${fixtures.direccion.id}`, deltaX, deltaY);
      if (await page.getByText('Posición visual guardada.').isVisible().catch(() => false)) break;
    }
    await expect(page.getByText('Posición visual guardada.')).toBeVisible();
    await screenshot(page, '01-layout-guardado');

    await page.reload();
    await page.getByRole('button', { name: 'Administración' }).click();
    await expect(card).toBeVisible();
    const afterReload = await page.locator('.react-flow__node').filter({ has: card }).first().getAttribute('style');
    expect(transformOf(afterReload)).not.toBe(transformOf(before));
    await screenshot(page, '01-layout-recargado');
  });

  test('1b. conserva la posición al cambiar modos de conexión sin recargar', async ({ page }) => {
    const testId = `ov2-node-ccol-${fixtures.direccion.id}`;
    await dragNode(page, testId, 125, 70);
    await expect(page.getByText('Posición visual guardada.')).toBeVisible();
    const afterDrag = await nodePosition(page, testId);

    for (const mode of [/Jerarquía/, /Matricial/, /Todos/]) {
      await page.getByRole('button', { name: mode }).click();
      await expect.poll(() => nodePosition(page, testId)).toEqual(afterDrag);
    }
  });

  test('2. crea jerarquía y muestra el error de ciclo', async ({ page }) => {
    await connectUntil(page, `ov2-node-ccol-${fixtures.jefatura.id}`, `ov2-node-ccol-${fixtures.direccion.id}`, { sourceHandle: 'jerarquia-source', targetHandle: 'jerarquia-target' }, page.getByText('reporta a'), { force: false });
    await connectUntil(page, `ov2-node-ccol-${fixtures.direccion.id}`, `ov2-node-ccol-${fixtures.jefatura.id}`, { sourceHandle: 'jerarquia-source', targetHandle: 'jerarquia-target' }, page.locator('.alert-danger'), { force: false });
    await expect(page.locator('.alert-danger')).toContainText(/generaria un ciclo/i);
    await screenshot(page, '02-jerarquia-y-ciclo');
  });

  test('3. rechaza una relación matricial con rango inválido', async ({ page }) => {
    await connectUntil(page, `ov2-node-pos-${fixturePositions[fixtures.direccion.id]}`, `ov2-node-pos-${fixturePositions[fixtures.jefatura.id]}`, { sourceHandle: 'matricial-source', targetHandle: 'matricial-target' }, page.locator('.alert-danger'));
    await expect(page.locator('.alert-danger')).toContainText(/rango estrictamente superior/i);
    await screenshot(page, '03-matricial-rango-invalido');
  });

  test('4. confirma antes de eliminar una relación matricial existente', async ({ page }) => {
    const edge = page.getByTestId(`rf__edge-matricial:${matrizId}`);
    await expect(edge.getByText('matricial')).toBeVisible();
    let confirmationMessage = '';
    page.once('dialog', confirmation => {
      expect(confirmation.type()).toBe('confirm');
      confirmationMessage = confirmation.message();
      confirmation.dismiss();
    });
    await edge.locator('.react-flow__edge-textbg').click({ force: true });
    expect(confirmationMessage).toMatch(/eliminar esta relación matricial/i);
    await screenshot(page, '04-confirmacion-eliminar-matricial');
  });

  test('5. crea una cargo-colocación con dos posiciones vacantes', async ({ page }) => {
    const before = await page.locator('[data-testid^="ov2-node-pos-"]').count();
    await page.getByTestId(`ov2-create-colocacion-${createPair.unidadId}`).click();
    await page.getByTestId('ov2-create-cargo').selectOption(createPair.cargoId);
    await page.getByTestId('ov2-create-nivel').selectOption('nj_emp_2000000000_operativo');
    await page.getByTestId('ov2-create-rol').selectOption('rol_emp_2000000000_ops_tecnico');
    await page.getByTestId('ov2-create-cantidad').fill('2');
    await page.getByTestId('ov2-create-submit').click();
    await expect(page.getByText(/Cargo-colocación creada .* posiciones generadas:/)).toBeVisible();
    await expect.poll(() => page.locator('[data-testid^="ov2-node-pos-"]').count()).toBeGreaterThanOrEqual(before + 2);
    await screenshot(page, '05-alta-colocacion-dos-sillas');
  });

  test('6. edita cantidad y rol, mostrando la advertencia sobre ocupantes', async ({ page }) => {
    await page.getByTestId(`ov2-node-ccol-${fixtures.jefatura.id}`).click();
    await expect(page.getByText('Cambiar el rol de esta colocación no altera los roles vigentes de sus ocupantes.')).toBeVisible();
    await page.getByTestId('ov2-edit-rol').selectOption('rol_emp_2000000000_ops_jefe');
    await page.getByTestId('ov2-edit-cantidad').fill('2');
    await page.getByTestId('ov2-edit-submit').click();
    await expect(page.getByText(new RegExp(`Cargo-colocación ${fixtures.jefatura.id} actualizada.`))).toBeVisible();
    await screenshot(page, '06-edicion-colocacion');
  });

  test('7. conecta UO con cargo y propaga la nueva unidad a sus posiciones', async ({ page, request }) => {
    await connect(
      page,
      `ov2-node-uo-${destinoReasignacionUo.id}`,
      `ov2-node-ccol-${fixtures.direccion.id}`,
      { sourceHandle: 'uo-source', targetHandle: 'uo-target' },
      { force: false },
    );
    await expect(page.getByText(/se asignó a .*sus posiciones vinculadas se actualizaron/i)).toBeVisible();

    const colocaciones = await rest(request, 'cargo_colocaciones', `select=id,unidad_organizacional_id&id=eq.${fixtures.direccion.id}&empresa_id=eq.${EMPRESA_PRUEBA}`);
    expect(colocaciones).toEqual([{ id: fixtures.direccion.id, unidad_organizacional_id: destinoReasignacionUo.id }]);
    const posiciones = await rest(request, 'posiciones', `select=id,unidad_organizacional_id&empresa_id=eq.${EMPRESA_PRUEBA}&cargo_colocacion_id=eq.${fixtures.direccion.id}`);
    expect(posiciones.length).toBeGreaterThan(0);
    expect(posiciones.every(posicion => posicion.unidad_organizacional_id === destinoReasignacionUo.id)).toBeTruthy();
    await screenshot(page, '07-reasignacion-uo-propagada');
  });

  test('8. crea una nueva UO desde la barra del organigrama', async ({ page, request }) => {
    const codigo = `UO-E2E-${Date.now()}`;
    const nombre = `UO E2E ${Date.now()}`;
    await page.getByTestId('ov2-new-uo').click();
    await page.getByTestId('ov2-create-uo-nombre').fill(nombre);
    await page.getByTestId('ov2-create-uo-codigo').fill(codigo);
    await page.getByTestId('ov2-create-uo-submit').click();
    await expect(page.getByText(`Unidad organizacional ${nombre} creada.`)).toBeVisible();

    const unidades = await rest(request, 'unidades_organizacionales', `select=id,nombre,codigo&empresa_id=eq.${EMPRESA_PRUEBA}&codigo=eq.${encodeURIComponent(codigo)}`);
    expect(unidades).toEqual([{ id: expect.any(String), nombre, codigo }]);
    await screenshot(page, '08-alta-uo');
  });
});
