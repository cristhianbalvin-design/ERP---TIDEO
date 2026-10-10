export const CAMPOS_OVERRIDE_COMPONENTE = Object.freeze(['nombre', 'cota', 'desde', 'referencia']);

export function resolverMedidaComponente(medida, override = null) {
  const base = medida || {};
  const cambios = override || {};
  const valores = Object.fromEntries(CAMPOS_OVERRIDE_COMPONENTE.map(campo => [
    campo,
    cambios[campo] ?? base[campo] ?? '',
  ]));
  const personalizado = Boolean(override) && CAMPOS_OVERRIDE_COMPONENTE.some(campo => (
    (override[campo] ?? base[campo] ?? '') !== (base[campo] ?? '')
  ));
  return { ...base, ...valores, personalizado };
}

export function resolverCatalogoComponentes(componentes = []) {
  return componentes.map(componente => ({
    ...componente,
    activo: componente.activo !== false,
    zonas: (componente.zonas || []).map(zona => ({
      ...zona,
      medidas: (zona.medidas || []).map(medida => resolverMedidaComponente(medida, medida.override)),
    })),
  }));
}
