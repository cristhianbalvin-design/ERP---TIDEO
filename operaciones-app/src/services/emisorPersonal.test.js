import test from 'node:test';
import assert from 'node:assert/strict';
import { preseleccionarPersonaVinculada, seleccionarEmisorPersona } from './emisorPersonal.js';

const personas = [
  { id: 'op-1', nombre: 'Ana Pérez', cargo: 'Técnica', auth_user_id: 'user-1', firma: { id: 'f-1' } },
  { id: 'ad-2', nombre: 'Luis Rojas', cargo: 'Jefe', auth_user_id: 'user-2', firma: { id: 'f-2' } },
];

test('preselecciona la persona vinculada al usuario autenticado', () => {
  assert.equal(preseleccionarPersonaVinculada(personas, 'user-2'), 'ad-2');
  assert.equal(preseleccionarPersonaVinculada(personas, 'sin-vinculo'), null);
});

test('la persona elegida reemplaza el firmante de la sociedad', () => {
  assert.deepEqual(seleccionarEmisorPersona(personas, 'op-1', { firmante: 'Sociedad', cargo_firmante: 'Representante' }), {
    fuente: 'persona', persona: personas[0], nombre: 'Ana Pérez', cargo: 'Técnica', firma: { id: 'f-1' },
  });
});

test('usa firmante de sociedad y, en último caso, entrada manual', () => {
  assert.deepEqual(seleccionarEmisorPersona([], null, { firmante: 'Firmante social', cargo_firmante: 'Gerente', firma_url: '/firma.png' }), {
    fuente: 'sociedad', persona: null, nombre: 'Firmante social', cargo: 'Gerente', firma: '/firma.png',
  });
  assert.deepEqual(seleccionarEmisorPersona([], null, null), { fuente: 'manual', persona: null, nombre: '', cargo: '', firma: null });
});
