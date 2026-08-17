/**
 * Resuelve accesos desde la empresa y el objeto de permisos ya cargados en sesión.
 * Los escenarios forzados solo existen para pruebas de desarrollo.
 */
const SCENARIOS = {
  ambas: { administrativa: true, operativa: true },
  administrativa: { administrativa: true, operativa: false },
  operativa: { administrativa: false, operativa: true },
};

function getDevelopmentScenario() {
  if (!import.meta.env.DEV) return null;
  const fromUrl = new URLSearchParams(window.location.search).get('access');
  const candidate = fromUrl || import.meta.env.VITE_APP_ACCESS_SCENARIO;
  return SCENARIOS[candidate] ? candidate : null;
}

export function getApplicationAccess({ empresa, role }) {
  const developmentScenario = getDevelopmentScenario();
  if (developmentScenario) return { ...SCENARIOS[developmentScenario] };

  const permisos = role?.permisos || {};
  const accesoTotal = Boolean(permisos.todo);
  const pantallasConVista = new Set(permisos.ver || []);
  const modulosCampo = Array.isArray(permisos.campo_modulos) ? permisos.campo_modulos : [];
  const puedeAdministrar = accesoTotal || pantallasConVista.has('app_administrativo');
  const puedeOperar = accesoTotal || pantallasConVista.has('app_operativo');
  const puedeMarcarAsistencia = Boolean(permisos.acceso_campo) && modulosCampo.includes('asistencia');

  return {
    administrativa: puedeAdministrar,
    operativa: Boolean(empresa?.modulo_operativo_habilitado) && puedeOperar,
    asistencia: puedeMarcarAsistencia,
  };
}
