// Asigna cantidades de forma determinista sin modificar las filas recibidas.
const ordenarStock = (a, b) => {
  const fechaA = a.vencimiento ? Date.parse(a.vencimiento) : Infinity;
  const fechaB = b.vencimiento ? Date.parse(b.vencimiento) : Infinity;
  const av = Number.isFinite(fechaA) ? fechaA : Infinity;
  const bv = Number.isFinite(fechaB) ? fechaB : Infinity;
  if (av !== bv) return av - bv;
  const disponible = Number(b.disponible || 0) - Number(a.disponible || 0);
  if (disponible) return disponible;
  const idA = String(a.id ?? '');
  const idB = String(b.id ?? '');
  return idA < idB ? -1 : idA > idB ? 1 : 0;
};

export function repartirStock(filas, cantidad, ubicacionId = null) {
  let faltante = Math.max(0, Number(cantidad) || 0);
  const candidatas = (filas || [])
    .filter(fila => (!ubicacionId || fila.ubicacion_id === ubicacionId) && Number(fila.disponible) > 0)
    .slice().sort(ordenarStock);
  const asignaciones = [];
  for (const fila of candidatas) {
    if (faltante <= 0) break;
    const asignada = Math.min(faltante, Number(fila.disponible));
    if (asignada > 0) asignaciones.push({ fila, cantidad: asignada });
    faltante -= asignada;
  }
  return { asignaciones, faltante };
}

export function repartirLiberacionReserva(filas, cantidad, ubicacionId = null) {
  let faltante = Math.max(0, Number(cantidad) || 0);
  const candidatas = (filas || [])
    .filter(fila => (!ubicacionId || fila.ubicacion_id === ubicacionId) && Number(fila.reservado) > 0)
    .slice().sort(ordenarStock);
  const asignaciones = [];
  for (const fila of candidatas) {
    if (faltante <= 0) break;
    const asignada = Math.min(faltante, Number(fila.reservado));
    if (asignada > 0) asignaciones.push({ fila, cantidad: asignada });
    faltante -= asignada;
  }
  return { asignaciones, faltante };
}
