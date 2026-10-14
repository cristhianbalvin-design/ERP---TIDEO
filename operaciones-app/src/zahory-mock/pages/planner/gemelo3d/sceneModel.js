export const CATEGORIAS_BAHIA = ['general', 'pesada', 'sold', 'crom', 'mec', 'hidr'];

export function crearLayout(bahias = [], puestos = []) {
  const activas = bahias.filter(item => item.activa !== false);
  const posicionesBahia = {};
  const posicionesPuesto = {};
  const columnas = [[], []];
  activas.forEach((bahia, index) => columnas[index % 2].push(bahia));
  const dimensiones = columnas.map(columna => Math.max(12, ...columna.map(bahia => {
    const count = puestos.filter(item => item.bahia_id === bahia.id && item.activo !== false).length;
    return count * 7 + 3;
  })));
  const centros = [-11 - dimensiones[0] / 2, 11 + dimensiones[1] / 2];
  columnas.forEach((columna, column) => columna.forEach((bahia, row) => {
    const x = centros[column];
    const z = (row - (columna.length - 1) / 2) * 18;
    const propios = puestos.filter(item => item.bahia_id === bahia.id && item.activo !== false);
    posicionesBahia[bahia.id] = { x, z, width: Math.max(12, propios.length * 7 + 3), depth: 14 };
    propios.forEach((puesto, index) => {
      posicionesPuesto[puesto.id] = { x: x - (propios.length - 1) * 3.5 + index * 7, z, width: 6, depth: 9 };
    });
  }));
  const posiciones = Object.values(posicionesBahia);
  const limites = posiciones.reduce((bounds, pos) => ({
    minX: Math.min(bounds.minX, pos.x - pos.width / 2), maxX: Math.max(bounds.maxX, pos.x + pos.width / 2),
    minZ: Math.min(bounds.minZ, pos.z - pos.depth / 2), maxZ: Math.max(bounds.maxZ, pos.z + pos.depth / 2),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  if (!posiciones.length) Object.assign(limites, { minX: -16, maxX: 16, minZ: -16, maxZ: 16 });
  return { posicionesBahia, posicionesPuesto, limites, ancho: Math.max(32, limites.maxX - limites.minX + 28), profundidad: Math.max(32, limites.maxZ - limites.minZ + 20) };
}

export function calcularEncuadre(limites, aspect = 1, fov = 36) {
  const width = Math.max(16, limites.maxX - limites.minX);
  const depth = Math.max(16, limites.maxZ - limites.minZ);
  const center = { x: (limites.minX + limites.maxX) / 2, z: (limites.minZ + limites.maxZ) / 2 };
  const horizontalFov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * Math.max(.55, aspect));
  const distance = Math.min(180, Math.max(24, Math.max(width / (2 * Math.tan(horizontalFov / 2)), depth / (2 * Math.tan(fov * Math.PI / 360))) * 1.32));
  return { ...center, distance, minDistance: Math.max(12, Math.min(24, distance * .42)), maxDistance: Math.min(240, Math.max(90, distance * 2.4)), azimuth: .48, elevation: .72 };
}

export function mapearEscena(datos, fecha) {
  const ots = new Map((datos.ots || []).map(ot => [ot.id, ot]));
  const bahias = (datos.bahias || []).map(bahia => {
    const puestos = (datos.puestos || []).filter(puesto => puesto.bahia_id === bahia.id && puesto.activo !== false);
    const ids = new Set(puestos.map(puesto => puesto.id));
    const asignaciones = (datos.asignaciones || []).filter(item => item.fecha === fecha && item.estado !== 'cancelado' && ids.has(item.puesto_id));
    const capacidad = puestos.reduce((total, puesto) => total + Number(puesto.capacidad || 1) * 8, 0);
    const horas = asignaciones.reduce((total, item) => total + Number(item.horas_estimadas || 8), 0);
    return { ...bahia, puestos, asignaciones, horas, capacidad, utilizacion: capacidad ? horas / capacidad : 0,
      ots: [...new Set(asignaciones.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean) };
  });
  const personas = (datos.personas || []).map(persona => {
    const asignaciones = (datos.asignaciones || []).filter(item => item.tecnico_id === persona.id && item.fecha === fecha && item.estado !== 'cancelado');
    return { ...persona, asignaciones, horas: asignaciones.reduce((sum, item) => sum + Number(item.horas_estimadas || 8), 0),
      ots: [...new Set(asignaciones.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean) };
  });
  const maquinas = (datos.maquinas || []).map(maquina => {
    const tipo = (datos.tipos || []).find(item => item.clave === maquina.tipo_clave);
    const asignaciones = (datos.equipos || []).filter(item => item.maquina_id === maquina.id && item.fecha === fecha && item.estado !== 'cancelado');
    const puesto = (datos.puestos || []).find(item => item.id === maquina.puesto_id);
    return { ...maquina, tipo, bahia_id: puesto?.bahia_id || maquina.bahia_id, asignaciones,
      ots: [...new Set(asignaciones.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean) };
  });
  return { fecha, bahias, personas, maquinas, puestos: datos.puestos || [], ots: [...ots.values()] };
}

export function colorUtilizacion(value) {
  return value >= 0.9 ? 'red' : value >= 0.75 ? 'amber' : 'green';
}
