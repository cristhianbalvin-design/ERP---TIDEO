// Oculta las entradas cuyo modulo WMS (item.modulo) esta apagado para la empresa.
export function filtrarNavegacionPorModulos(navigation, modulos = {}) {
  const activo = item => !item?.modulo || modulos[item.modulo] !== false;
  return navigation.map(zone => {
    if (zone.type === 'flat') return { ...zone, items: zone.items.filter(activo) };
    return {
      ...zone,
      groups: (zone.groups || []).map(group => ({
        ...group,
        items: (group.items || []).filter(activo),
        areaItems: group.areaItems || [],
        tailItems: (group.tailItems || []).filter(activo),
      })),
    };
  });
}
