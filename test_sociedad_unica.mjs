import { strict as assert } from 'node:assert';
import {
  PERFIL_SOCIEDAD,
  SOCIEDAD_TODAS_ID,
  debeMostrarSelectorSociedad,
  filtrarRegistrosPorAlcanceSociedad,
  resolverFiltroSociedadesVista,
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

const sociedadSecundaria = { id: '22222222-2222-2222-2222-222222222222', nombre: 'Sociedad Secundaria' };
const sociedadesGrupo = [sociedadPrincipal, sociedadSecundaria];

assert.equal(resolverSociedadActiva(sociedadesGrupo)?.id, SOCIEDAD_TODAS_ID);
assert.equal(resolverSociedadActiva(sociedadesGrupo, SOCIEDAD_TODAS_ID)?.id, SOCIEDAD_TODAS_ID);
assert.equal(resolverSociedadActiva(sociedadesGrupo, sociedadSecundaria.id)?.id, sociedadSecundaria.id);
assert.equal(resolverSociedadActiva([sociedadPrincipal], SOCIEDAD_TODAS_ID)?.id, sociedadPrincipal.id);

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
  resolverFiltroSociedadesVista({ multisociedadHabilitado: false }),
  { sinFiltro: true, sociedadesIds: [], permiteEscritura: true, sociedadIdEscritura: null },
);

assert.deepEqual(
  resolverFiltroSociedadesVista({
    multisociedadHabilitado: true,
    perfilSociedad: PERFIL_SOCIEDAD.GRUPO,
    sociedadActiva: sociedadPrincipal,
    sociedadesIdsAlcance: null,
    sociedadesDisponibles: [sociedadPrincipal],
  }),
  { sinFiltro: false, sociedadesIds: [sociedadPrincipal.id], permiteEscritura: true, sociedadIdEscritura: sociedadPrincipal.id },
);

assert.deepEqual(
  resolverFiltroSociedadesVista({
    multisociedadHabilitado: true,
    perfilSociedad: PERFIL_SOCIEDAD.GRUPO,
    sociedadActiva: { id: SOCIEDAD_TODAS_ID },
    sociedadesIdsAlcance: null,
    sociedadesDisponibles: sociedadesGrupo,
  }),
  { sinFiltro: true, sociedadesIds: [], permiteEscritura: false, sociedadIdEscritura: null },
);

assert.deepEqual(
  resolverFiltroSociedadesVista({
    multisociedadHabilitado: true,
    perfilSociedad: PERFIL_SOCIEDAD.MULTISOCIEDAD,
    sociedadActiva: { id: SOCIEDAD_TODAS_ID },
    sociedadesIdsAlcance: [sociedadPrincipal.id, sociedadSecundaria.id],
    sociedadesDisponibles: sociedadesGrupo,
  }),
  { sinFiltro: false, sociedadesIds: [sociedadPrincipal.id, sociedadSecundaria.id], permiteEscritura: false, sociedadIdEscritura: null },
);

assert.deepEqual(
  resolverFiltroSociedadesVista({
    multisociedadHabilitado: true,
    perfilSociedad: PERFIL_SOCIEDAD.MULTISOCIEDAD,
    sociedadActiva: sociedadSecundaria,
    sociedadesIdsAlcance: [sociedadPrincipal.id, sociedadSecundaria.id],
    sociedadesDisponibles: sociedadesGrupo,
  }),
  { sinFiltro: false, sociedadesIds: [sociedadSecundaria.id], permiteEscritura: true, sociedadIdEscritura: sociedadSecundaria.id },
);

assert.deepEqual(
  resolverFiltroSociedadesVista({
    multisociedadHabilitado: true,
    perfilSociedad: PERFIL_SOCIEDAD.SOCIEDAD,
    sociedadActiva: sociedadSecundaria,
    sociedadesIdsAlcance: [sociedadPrincipal.id],
    sociedadesDisponibles: sociedadesGrupo,
  }),
  { sinFiltro: false, sociedadesIds: [], permiteEscritura: false, sociedadIdEscritura: null },
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
