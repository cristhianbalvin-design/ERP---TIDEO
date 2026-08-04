import { strict as assert } from 'node:assert';
import {
  PERFIL_SOCIEDAD,
  debeMostrarSelectorSociedad,
  filtrarRegistrosPorAlcanceSociedad,
  resolverSociedadActiva,
  resolverSociedadUnicaId,
} from './src/services/sociedadesService.js';

const sociedadPrincipal = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Sociedad Principal',
};

assert.equal(resolverSociedadUnicaId([sociedadPrincipal]), sociedadPrincipal.id);
assert.equal(resolverSociedadUnicaId([]), null);
assert.equal(resolverSociedadUnicaId([sociedadPrincipal, { id: 'soc_2' }]), null);

assert.equal(resolverSociedadActiva([sociedadPrincipal])?.id, sociedadPrincipal.id);

assert.equal(debeMostrarSelectorSociedad({
  multisociedadHabilitado: true,
  perfilSociedad: PERFIL_SOCIEDAD.GRUPO,
  sociedadesDisponibles: [sociedadPrincipal],
}), false);

assert.equal(debeMostrarSelectorSociedad({
  multisociedadHabilitado: true,
  perfilSociedad: PERFIL_SOCIEDAD.GRUPO,
  sociedadesDisponibles: [sociedadPrincipal, { id: 'soc_2' }],
}), true);

const historicoBackfilleado = [
  { id: 'row_1', sociedad_id: sociedadPrincipal.id },
  { id: 'row_2', sociedad_id: sociedadPrincipal.id },
];

assert.deepEqual(
  filtrarRegistrosPorAlcanceSociedad(
    historicoBackfilleado,
    PERFIL_SOCIEDAD.GRUPO,
    null,
  ),
  historicoBackfilleado,
);

assert.deepEqual(
  filtrarRegistrosPorAlcanceSociedad(
    historicoBackfilleado,
    PERFIL_SOCIEDAD.SOCIEDAD,
    [sociedadPrincipal.id],
  ),
  historicoBackfilleado,
);

console.log('Sociedad unica: selector, sociedad activa y filtros verificados.');
