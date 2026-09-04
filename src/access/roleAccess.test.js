import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleDePermisos, puedeVerPantalla, tieneAccesoTotal } from './roleAccess.js';

const permisosLogistica = [
  { pantalla: 'app_administrativo', puede_ver: true },
  { pantalla: 'app_operativo', puede_ver: true },
  { pantalla: 'inventario', puede_ver: true, puede_ver_costos: true },
  { pantalla: 'solpe', puede_ver: true },
  { pantalla: 'remision', puede_ver: true },
  { pantalla: 'dashboard', puede_ver: false, puede_ver_finanzas: true },
];

test('un rol no administrador solo puede ver sus pantallas marcadas', () => {
  const role = buildRoleDePermisos({
    id: 'rol_almacen',
    nombre: 'ASISTENTE DE ALMACEN',
    es_admin_empresa: false,
    es_superadmin: false,
  }, permisosLogistica);

  assert.equal(tieneAccesoTotal(role), false);
  assert.equal(puedeVerPantalla(role, 'inventario'), true);
  assert.equal(puedeVerPantalla(role, 'solpe'), true);
  assert.equal(puedeVerPantalla(role, 'remision'), true);
  assert.equal(puedeVerPantalla(role, 'dashboard'), false);
  assert.equal(puedeVerPantalla(role, 'rrhh_admin'), false);
  assert.equal(puedeVerPantalla(role, 'roles'), false);
});

test('permisos transversales no habilitan la visualizacion de pantallas', () => {
  const role = buildRoleDePermisos({ es_admin_empresa: false }, [{
    pantalla: 'dashboard',
    puede_ver: false,
    puede_ver_costos: true,
    puede_ver_finanzas: true,
    permisos_extra: { puede_ver_precios: true },
  }]);

  assert.equal(role.permisos.ver_costos, true);
  assert.equal(role.permisos.ver_finanzas, true);
  assert.equal(role.permisos.ver_precios, true);
  assert.equal(puedeVerPantalla(role, 'dashboard'), false);
});

test('metadatos ausentes o no booleanos nunca conceden acceso total', () => {
  for (const rol of [null, {}, { es_admin_empresa: null }, { es_admin_empresa: 'true' }]) {
    const role = buildRoleDePermisos(rol, []);
    assert.equal(tieneAccesoTotal(role), false);
    assert.equal(puedeVerPantalla(role, 'dashboard'), false);
  }
});

test('solo un booleano true del servidor concede acceso administrativo total', () => {
  const role = buildRoleDePermisos({ es_admin_empresa: true, es_superadmin: false }, []);
  assert.equal(tieneAccesoTotal(role), true);
  assert.equal(puedeVerPantalla(role, 'dashboard'), true);
  assert.equal(puedeVerPantalla(role, 'rrhh_admin'), true);
});

test('mi portal y accesos alternativos conservan su comportamiento explicito', () => {
  const role = buildRoleDePermisos({ es_admin_empresa: false }, [
    { pantalla: 'servicios', puede_ver: true },
  ]);
  assert.equal(puedeVerPantalla(role, 'mi_portal'), true);
  assert.equal(puedeVerPantalla(role, 'maestros', ['maestros', 'servicios']), true);
});
