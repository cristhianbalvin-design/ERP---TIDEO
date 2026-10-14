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
  return { posicionesBahia, posicionesPuesto, ancho: Math.max(32, dimensiones[0] + dimensiones[1] + 22), profundidad: Math.max(32, Math.ceil(activas.length / 2) * 20) };
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
