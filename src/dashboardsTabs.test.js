import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleDePermisos } from './access/roleAccess.js';
import { getVisibleDashboardTabs, normalizeDashboardRoute, resolveDashboardTab } from './dashboardsTabs.js';

const rol = (nombre, ver) => buildRoleDePermisos({ nombre, es_admin_empresa: false }, ver.map(pantalla => ({ pantalla, puede_ver: true })));

test('permisos visibles por rol', () => {
  assert.deepEqual(getVisibleDashboardTabs(buildRoleDePermisos({ nombre: 'Super Administrador', es_admin_empresa: true }, [])).map(tab => tab.key), ['dashboard', 'bi_comercial', 'bi_operativo', 'bi_financiero']);
  assert.deepEqual(getVisibleDashboardTabs(rol('Finanzas', ['dashboard', 'bi_financiero'])).map(tab => tab.key), ['dashboard', 'bi_financiero']);
  assert.deepEqual(getVisibleDashboardTabs(rol('Jefe Comercial', ['dashboard'])).map(tab => tab.key), ['dashboard']);
  assert.deepEqual(getVisibleDashboardTabs(rol('Técnico de Campo', ['ot'])), []);
});

test('la pestaña inicial respeta la pestaña solicitada y cae en la primera permitida', () => {
  const finanzas = rol('Finanzas', ['dashboard', 'bi_financiero']);
  assert.equal(resolveDashboardTab(finanzas, '').key, 'dashboard');
  assert.equal(resolveDashboardTab(finanzas, 'financiero').key, 'bi_financiero');
  assert.equal(resolveDashboardTab(rol('Operaciones y Finanzas', ['bi_operativo', 'bi_financiero']), '').key, 'bi_operativo');
  assert.equal(resolveDashboardTab(rol('Jefe Comercial', ['dashboard']), 'financiero').key, 'dashboard');
});

test('normaliza rutas actuales, aliases y valores inválidos', () => {
  assert.deepEqual(normalizeDashboardRoute('bi_comercial'), { pagina: 'dashboard', pestana: 'comercial' });
  assert.deepEqual(normalizeDashboardRoute('bi_operativo'), { pagina: 'dashboard', pestana: 'operativo' });
  assert.deepEqual(normalizeDashboardRoute('bi_financiero'), { pagina: 'dashboard', pestana: 'financiero' });
  assert.deepEqual(normalizeDashboardRoute('dashboard'), { pagina: 'dashboard', pestana: '' });
  assert.deepEqual(normalizeDashboardRoute('#/dashboard/comercial'), { pagina: 'dashboard', pestana: 'comercial' });
  assert.deepEqual(normalizeDashboardRoute('dashboard/no-existe'), { pagina: 'dashboard', pestana: '' });
  assert.deepEqual(normalizeDashboardRoute('ruta-invalida'), { pagina: 'ruta-invalida', pestana: null });
});
