export const CATEGORIAS_BAHIA = ['general', 'pesada', 'sold', 'crom', 'mec', 'hidr'];
export const ETIQUETAS_EQUIPO_CLIENTE = { exc: 'Excavadora', carg: 'Cargador frontal', volq: 'Camión volquete', cuch: 'Cuchara', comp: 'Compresor de aire', cil: 'Cilindro hidráulico' };
export const ETIQUETAS_COMPONENTE_CLIENTE = { cil: 'Cilindro', eje: 'Eje', bomba: 'Bomba', reductor: 'Reductor', buje: 'Buje', piston: 'Pistón', horq: 'Horquilla' };
export const ETIQUETAS_MAQUINA = {
  lathe: 'Torno convencional', cnc: 'Torno CNC', vlathe: 'Torno vertical (carrusel)', mill: 'Fresadora universal', vmc: 'Centro de mecanizado vertical', hmc: 'Centro de mecanizado horizontal', bore: 'Mandrinadora', drill: 'Taladro de columna', radial: 'Taladro radial', shaper: 'Limadora / cepillo', gear: 'Talladora de engranajes', broach: 'Brochadora', honing: 'Máquina de bruñido (honing)', edm: 'Electroerosión (EDM)', grind: 'Rectificadora plana', cgrind: 'Rectificadora cilíndrica', crank: 'Rectificadora de cigüeñales', vgrind: 'Rectificadora de asientos de válvulas', toolg: 'Afiladora de herramientas', polish: 'Pulidora de vástagos', lap: 'Lapeadora', saw: 'Sierra de cinta', cutoff: 'Sierra circular de corte', plasma: 'Corte por plasma / oxicorte', laser: 'Corte láser', wjet: 'Corte por chorro de agua', shear: 'Cizalla de guillotina', press: 'Prensa hidráulica', pressm: 'Prensa mecánica', bpress: 'Prensa de bujes y rodamientos', straight: 'Prensa enderezadora', brake: 'Plegadora', roll: 'Roladora de planchas', weld: 'Equipo de soldadura (MIG/TIG/SMAW)', sarc: 'Soldadura por arco sumergido', hardf: 'Equipo de recargue duro', wpos: 'Posicionador de soldadura', spray: 'Metalizado / termorociado', furn: 'Horno de tratamiento térmico', stress: 'Horno de alivio de tensiones', varn: 'Horno de barnizado', chrome: 'Tanque de cromado', plat: 'Línea de niquelado / galvanizado', blast: 'Cabina de granallado / arenado', paint: 'Cabina de pintura', wash: 'Lavadora industrial de piezas', usonic: 'Limpieza ultrasónica', crane: 'Grúa puente', gantry: 'Pórtico móvil', jib: 'Grúa pluma', hoist: 'Polipasto', fork: 'Montacargas', stand: 'Caballetes y soportes de componentes', bench: 'Banco de pruebas hidráulico', pump: 'Banco de pruebas de bombas', cyl: 'Banco de pruebas de cilindros', inj: 'Banco de inyectores', dyno: 'Dinamómetro', motorb: 'Banco de pruebas de motores eléctricos', bal: 'Balanceadora dinámica', cmm: 'Máquina de medición (CMM)', laserA: 'Alineación láser', hardt: 'Durómetro', compr: 'Compresor de aire', gen: 'Generador eléctrico', vacuum: 'Bomba de vacío', rewind: 'Bobinadora',
};
export const ETIQUETAS_ESTADO_OT = { programado: 'Programado', en_proceso: 'En proceso', pendiente: 'Pendiente', cancelado: 'Cancelado', finalizado: 'Finalizado', cerrado: 'Cerrado', completado: 'Completado' };
export const ETIQUETAS_ESPECIALIDAD = { mec: 'Mecánico diésel', sold: 'Soldador', hid: 'Hidráulico', ele: 'Electricista', tor: 'Operador de torno' };
export const etiquetaEquipoCliente = value => ETIQUETAS_EQUIPO_CLIENTE[value] || 'Ilustración genérica';
export const etiquetaComponenteCliente = value => ETIQUETAS_COMPONENTE_CLIENTE[value] || 'Ilustración genérica';
export const etiquetaMaquina = value => ETIQUETAS_MAQUINA[value] || 'Ilustración genérica';
export const etiquetaEstadoOT = value => ETIQUETAS_ESTADO_OT[value] || 'No informado';
export const etiquetaEspecialidad = value => ETIQUETAS_ESPECIALIDAD[value] || (value && !/^[a-z0-9_-]+$/i.test(value) ? value : 'Personal');

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

export function mapearEscena(datos, fecha, fechaInicio = fecha) {
  const ots = new Map((datos.ots || []).map(ot => [ot.id, ot]));
  const bahias = (datos.bahias || []).map(bahia => {
    const puestos = (datos.puestos || []).filter(puesto => puesto.bahia_id === bahia.id && puesto.activo !== false);
    const ids = new Set(puestos.map(puesto => puesto.id));
    const asignaciones = (datos.asignaciones || []).filter(item => item.fecha === fecha && item.estado !== 'cancelado' && ids.has(item.puesto_id));
    const capacidad = puestos.reduce((total, puesto) => total + Number(puesto.capacidad || 1) * 8, 0);
    const horas = asignaciones.reduce((total, item) => total + Number(item.horas_estimadas || 8), 0);
    const otsDia = [...new Set(asignaciones.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean);
    return { ...bahia, puestos, asignaciones, horas, capacidad, utilizacion: capacidad ? horas / capacidad : 0,
      conflicto: puestos.some(puesto => new Set(asignaciones.filter(item => item.puesto_id === puesto.id).map(item => item.ot_id)).size > Number(puesto.capacidad || 1)),
      ots: otsDia };
  });
  const personas = (datos.personas || []).map(persona => {
    const asignaciones = (datos.asignaciones || []).filter(item => item.tecnico_id === persona.id && item.fecha === fecha && item.estado !== 'cancelado');
    const ausente = (datos.ausencias || []).some(item => item.tecnico_id === persona.id && item.fecha === fecha);
    return { ...persona, estado: ausente ? 'ausente' : persona.estado, ausente, asignaciones, horas: asignaciones.reduce((sum, item) => sum + Number(item.horas_estimadas || 8), 0),
      ots: [...new Set(asignaciones.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean) };
  });
  const maquinas = (datos.maquinas || []).map(maquina => {
    const tipo = (datos.tipos || []).find(item => item.clave === maquina.tipo_clave);
    const asignaciones = (datos.equipos || []).filter(item => item.maquina_id === maquina.id && item.fecha === fecha && item.estado !== 'cancelado');
    const puesto = (datos.puestos || []).find(item => item.id === maquina.puesto_id);
    return { ...maquina, tipo, bahia_id: puesto?.bahia_id || maquina.bahia_id, asignaciones,
      ots: [...new Set(asignaciones.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean) };
  });
  const asignacionesOt = (datos.asignaciones || []).filter(item => item.fecha === fecha && item.estado !== 'cancelado');
  const otsActivas = [...new Set(asignacionesOt.map(item => item.ot_id))].map(id => ots.get(id)).filter(Boolean);
  const base = new Date(`${fechaInicio}T12:00:00`);
  const fechas = Array.from({ length: 10 }, (_, index) => { const day = new Date(base); day.setDate(day.getDate() + index); return day.toISOString().slice(0, 10); });
  return { fecha, bahias, personas, maquinas, puestos: datos.puestos || [], ots: otsActivas,
    asignaciones: asignacionesOt, asignacionesTotales: (datos.asignaciones || []).filter(item => item.estado !== 'cancelado'), ocupaciones: datos.ocupaciones || [],
    equipoPorOt: Object.fromEntries(otsActivas.map(ot => [ot.id, resolverIlustracionOT(ot)])),
    paredDias: calcularParedDias(datos, fechas) };
}

// El servicio Planner solo incluye equipo_id en la OT; no trae tipo del equipo ni componente.
export function resolverIlustracionOT(ot = {}) {
  const equipo = ot.tipo_equipo || ot.equipo?.tipo || ot.equipo_tipo || null;
  const componente = ot.componente_tipo || ot.componente?.tipo || ot.componente_clave || null;
  return { equipo: equipo || 'generico', componente: componente || 'generico',
    equipoGenerico: !equipo, componenteGenerico: !componente };
}

export function calcularParedDias(datos, fechas, horasDia = 8) {
  return (fechas || []).map(fecha => {
    const personas = datos?.personas || [];
    const ocupados = (datos?.asignaciones || []).filter(item => item.fecha === fecha && item.estado !== 'cancelado');
    const ausentes = new Set((datos?.ausencias || []).filter(item => item.fecha === fecha).map(item => item.tecnico_id));
    const capacidad = personas.filter(persona => persona.estado !== 'ausente' && !ausentes.has(persona.id)).length * horasDia;
    const horas = ocupados.reduce((sum, item) => sum + Number(item.horas_estimadas || horasDia), 0);
    return { fecha, horas, capacidad, utilizacion: capacidad ? horas / capacidad : 0, color: colorUtilizacion(capacidad ? horas / capacidad : 0) };
  });
}

export function calcularDestinosPersonal(personas = [], bahias = [], layout = {}) {
  return personas.map((persona, index) => {
    const assignment = persona.asignaciones?.[0];
    const bahia = bahias.find(item => item.puestos.some(puesto => puesto.id === assignment?.puesto_id));
    const pos = bahia ? layout.posicionesBahia?.[bahia.id] : null;
    return { persona, bahia, x: pos?.x ?? 0, z: pos?.z ?? 0, espera: !assignment,
      ausente: persona.estado === 'ausente' || persona.ausente === true,
      xOffset: ((index % 3) - 1) * 1.5, zOffset: Math.floor(index / 3) * 1.6 };
  });
}

export function crearDetalleSeleccion(tipo, dato, escena = {}) {
  if (!dato) return null;
  if (tipo === 'ot' || tipo === 'componente' || tipo === 'equipo') {
    const ot = dato.ot || dato;
    const bahia = dato.bahia || escena.bahias?.find(item => item.ots.some(itemOt => itemOt.id === ot.id));
    const tareas = ot.ot_tareas || [];
    const personas = (escena.personas || []).filter(persona => persona.ots?.some(item => item.id === ot.id));
    const ilustracion = resolverIlustracionOT(ot);
    return { tipo: 'ot', ot, trabajo: tareas.map(tarea => tarea.familia_trabajo?.nombre || tarea.titulo).filter(Boolean).join(', ') || ot.descripcion || ot.servicio || 'Trabajo no informado',
      equipo: etiquetaEquipoCliente(ilustracion.equipo),
      componente: etiquetaComponenteCliente(ilustracion.componente),
      bahia, fechas: [...new Set((escena.asignacionesTotales || escena.asignaciones || []).filter(item => item.ot_id === ot.id).map(item => item.fecha))],
      personas, horas: (escena.asignaciones || []).filter(item => item.ot_id === ot.id).reduce((sum, item) => sum + Number(item.horas_estimadas || 0), 0),
      conflicto: Boolean(bahia?.conflicto) };
  }
  if (tipo === 'persona') return { tipo, persona: dato, cargo: etiquetaEspecialidad(dato.cargo || dato.especialidad), horas: dato.horas || 0, ots: dato.ots || [] };
  if (tipo === 'maquina') return { tipo, maquina: dato, uso: dato.asignaciones?.length ? 'En uso' : 'Libre' };
  if (tipo === 'bahia') return { tipo, bahia: dato, ots: dato.ots || [], personas: (escena.personas || []).filter(persona => persona.asignaciones?.some(item => dato.puestos.some(puesto => puesto.id === item.puesto_id))) };
  if (tipo === 'dia') return { tipo, dia: dato };
  return { tipo, dato };
}

export function colorUtilizacion(value) {
  return value >= 0.9 ? 'red' : value >= 0.75 ? 'amber' : 'green';
}
