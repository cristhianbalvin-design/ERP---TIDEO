import React, { useMemo } from 'react';

// Información derivada de la posición: no es editable aquí porque la fuente de
// verdad es la cargo_colocación elegida en el selector de posición.
export function PosicionOrganigramaInfo({
  posicionId,
  posiciones = [],
  unidadesOrganizacionales = [],
  style,
}) {
  const unidadNombre = useMemo(() => {
    if (!posicionId) return 'Seleccione una posición';
    const posicion = posiciones.find(item => item.id === posicionId);
    if (!posicion?.unidad_organizacional_id) return 'Sin unidad organizacional';
    return unidadesOrganizacionales.find(item => item.id === posicion.unidad_organizacional_id)?.nombre || 'Unidad no disponible';
  }, [posicionId, posiciones, unidadesOrganizacionales]);

  return (
    <div className="input-group" style={style}>
      <label>Unidad organizacional</label>
      <input className="input" value={unidadNombre} disabled aria-label="Unidad organizacional de la posición" />
    </div>
  );
}
