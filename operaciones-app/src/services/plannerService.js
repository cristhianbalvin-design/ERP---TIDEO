import { getSupabaseClient } from '../lib/supabaseClient.js';
import { validarOtPlanificable } from '../zahory-mock/pages/planner/plannerEngine.js';

const CAMPOS = {
  bahias: 'id,empresa_id,sociedad_id,codigo,nombre,categoria,orden,activa',
  puestos: 'id,empresa_id,bahia_id,codigo,nombre,capacidad,orden,activo',
  maquinas: 'id,empresa_id,sociedad_id,tipo_clave,codigo,nombre,bahia_id,puesto_id,horas_dia,estado',
  tipos: 'id,empresa_id,clave,nombre,familia,base_3d,descripcion,orden,activo',
  ocupaciones: 'id,empresa_id,sociedad_id,ot_id,puesto_id,fecha_desde,fecha_hasta,estado',
  personas: 'id,empresa_id,nombre,codigo,cargo,especialidad,especialidad2,estado',
  asignaciones: [
    'id,empresa_id,sociedad_id,ot_id,tecnico_id,fecha,estado,puesto_id,tarea_id,',
    'horas_estimadas,motivo_reprogramacion',
  ].join(''),
  equipos: 'id,empresa_id,sociedad_id,ot_id,maquina_id,tarea_id,fecha,horas_estimadas,estado,motivo_reprogramacion',
};

function filtrarSociedad(query, sociedadId, sociedadesIdsAlcance) {
  if (sociedadId) return query.eq('sociedad_id', sociedadId);
  if (Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
    return query.in('sociedad_id', sociedadesIdsAlcance);
  }
  return query;
}

function baseQuery(tabla, campos, empresaId, sociedadId, sociedadesIdsAlcance) {
  let query = getSupabaseClient().from(tabla).select(campos).eq('empresa_id', empresaId);
  if (campos.includes('sociedad_id')) query = filtrarSociedad(query, sociedadId, sociedadesIdsAlcance);
  return query;
}

async function leer(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function cargarPlanner({ empresaId, sociedadId, sociedadesIdsAlcance }) {
  if (!empresaId) throw new Error('No hay una empresa activa para cargar el Planner.');
  const sb = getSupabaseClient();
  const camposOT = [
    'id,numero,estado,descripcion,servicio,fecha_programada,sociedad_id,os_cliente_id,equipo_id,',
    'ot_tareas(id,ot_id,titulo,descripcion,orden,horas_estimadas,horas_reales,',
    'familia_trabajo_id,actividad_id,cargo_id,activo_id,horas_maquina)',
  ].join('');
  let ordenesQuery = sb.from('ordenes_trabajo')
    .select(camposOT)
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  ordenesQuery = filtrarSociedad(ordenesQuery, sociedadId, sociedadesIdsAlcance);
  const consultas = await Promise.all([
    leer(baseQuery('planner_bahias', CAMPOS.bahias, empresaId, sociedadId, sociedadesIdsAlcance)
      .eq('activa', true).order('orden')),
    leer(sb.from('planner_puestos').select(CAMPOS.puestos)
      .eq('empresa_id', empresaId).eq('activo', true).order('orden')),
    leer(baseQuery('planner_maquinas_taller', CAMPOS.maquinas, empresaId, sociedadId, sociedadesIdsAlcance)
      .order('nombre')),
    leer(baseQuery('planner_maquina_tipos', CAMPOS.tipos, empresaId, null)
      .eq('activo', true).order('orden')),
    leer(baseQuery('planner_ocupaciones', CAMPOS.ocupaciones, empresaId, sociedadId, sociedadesIdsAlcance)
      .neq('estado', 'cancelado')),
    leer(baseQuery('personal_operativo', CAMPOS.personas, empresaId, sociedadId, sociedadesIdsAlcance)
      .eq('estado', 'activo').order('nombre')),
    leer(baseQuery('planner_asignaciones', CAMPOS.asignaciones, empresaId, sociedadId, sociedadesIdsAlcance)
      .neq('estado', 'cancelado')),
    leer(baseQuery('planner_asignaciones_equipo', CAMPOS.equipos, empresaId, sociedadId, sociedadesIdsAlcance)
      .neq('estado', 'cancelado')),
    leer(ordenesQuery),
    leer(sb.from('familia_trabajo').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true)),
  ]);
  const [bahias, puestos, maquinas, tipos, ocupaciones, personas, asignaciones, equipos, ordenes,
    familiasTrabajo] = consultas;
  const osIds = [...new Set(ordenes.map(ot => ot.os_cliente_id).filter(Boolean))];
  let ordenesServicio = [];
  if (osIds.length) {
    const osQuery = sb.from('os_clientes')
      .select('id,numero,fecha_fin,fecha_inicio,estado,cuenta_id')
      .eq('empresa_id', empresaId)
      .in('id', osIds);
    ordenesServicio = await leer(osQuery);
  }
  const osPorId = new Map(ordenesServicio.map(os => [os.id, os]));
  const familiaPorId = new Map(familiasTrabajo.map(familia => [familia.id, familia]));
  const ots = ordenes.map(ot => ({
    ...ot,
    orden_servicio: osPorId.get(ot.os_cliente_id) || null,
    ot_tareas: (ot.ot_tareas || []).map(tarea => ({
      ...tarea,
      familia_trabajo: familiaPorId.get(tarea.familia_trabajo_id) || null,
    })),
  }));
  return {
    bahias, puestos, maquinas, tipos, ocupaciones, personas, asignaciones, equipos, ots,
    ordenesServicio, familiasTrabajo,
  };
}

export async function guardarBahia({ empresaId, sociedadId, id, ...valores }) {
  const sb = getSupabaseClient();
  const datos = {
    codigo: valores.codigo,
    nombre: valores.nombre,
    categoria: valores.categoria,
    orden: valores.orden,
    activa: valores.activa,
    empresa_id: empresaId,
    sociedad_id: sociedadId || null,
  };
  const q = id
    ? sb.from('planner_bahias').update(datos).eq('id', id).eq('empresa_id', empresaId)
    : sb.from('planner_bahias').insert(datos);
  const { data, error } = await q.select(CAMPOS.bahias).single();
  if (error) throw error;
  return data;
}

export async function guardarPuesto({ empresaId, id, ...valores }) {
  const sb = getSupabaseClient();
  const datos = {
    bahia_id: valores.bahia_id,
    codigo: valores.codigo,
    nombre: valores.nombre,
    capacidad: valores.capacidad,
    orden: valores.orden,
    activo: valores.activo,
    empresa_id: empresaId,
  };
  const q = id
    ? sb.from('planner_puestos').update(datos).eq('id', id).eq('empresa_id', empresaId)
    : sb.from('planner_puestos').insert(datos);
  const { data, error } = await q.select(CAMPOS.puestos).single();
  if (error) throw error;
  return data;
}

export async function agregarMaquina({
  empresaId,
  sociedadId,
  tipo,
  bahiaId,
  puestoId = null,
  codigo = null,
  nombre,
  horasDia = 8,
}) {
  const { data, error } = await getSupabaseClient().from('planner_maquinas_taller').insert({
    empresa_id: empresaId, sociedad_id: sociedadId || null, tipo_clave: tipo.clave, nombre: nombre || tipo.nombre,
    codigo, bahia_id: bahiaId, puesto_id: puestoId, horas_dia: horasDia,
  }).select(CAMPOS.maquinas).single();
  if (error) throw error;
  return data;
}

export async function actualizarTipoMaquina({ empresaId, id, nombre, descripcion, activo }) {
  const { data, error } = await getSupabaseClient().from('planner_maquina_tipos')
    .update({ nombre, descripcion, activo }).eq('empresa_id', empresaId).eq('id', id)
    .select(CAMPOS.tipos).single();
  if (error) throw error;
  return data;
}

export async function actualizarMaquina({ empresaId, sociedadId, id, bahiaId, puestoId, horasDia, estado }) {
  let query = getSupabaseClient().from('planner_maquinas_taller')
    .update({ bahia_id: bahiaId, puesto_id: puestoId || null, horas_dia: horasDia, estado })
    .eq('empresa_id', empresaId).eq('id', id);
  if (sociedadId) query = query.eq('sociedad_id', sociedadId);
  const { data, error } = await query.select(CAMPOS.maquinas).single();
  if (error) throw error;
  return data;
}

export async function cambiarTipoMaquina({ empresaId, id, tipoClave, nombre }) {
  const { data, error } = await getSupabaseClient().from('planner_maquinas_taller')
    .update({ tipo_clave: tipoClave, nombre }).eq('empresa_id', empresaId).eq('id', id)
    .select(CAMPOS.maquinas).single();
  if (error) throw error;
  return data;
}

export async function desactivarBahia({ empresaId, id }) {
  const { data, error } = await getSupabaseClient().from('planner_bahias').update({ activa: false })
    .eq('empresa_id', empresaId).eq('id', id).select(CAMPOS.bahias).single();
  if (error) throw error;
  return data;
}

export async function desactivarPuesto({ empresaId, id }) {
  const { data, error } = await getSupabaseClient().from('planner_puestos').update({ activo: false })
    .eq('empresa_id', empresaId).eq('id', id).select(CAMPOS.puestos).single();
  if (error) throw error;
  return data;
}

const TABLAS_ASIGNACION = new Set([
  'planner_asignaciones',
  'planner_asignaciones_equipo',
]);

export function mensajeErrorPlanner(error) {
  const detalle = String(error?.message || error || '');
  const capacidad = detalle.match(/El puesto supera su capacidad el (\d{4}-\d{2}-\d{2})/i);
  if (capacidad) {
    return `El puesto no tiene capacidad disponible el ${capacidad[1]}. Ajusta la planificaci\u00f3n.`;
  }
  if (/La OT est\u00e1 (?:anulada|cerrada|cerrado_conforme|valorizada)/i.test(detalle)) {
    return 'Esta OT est\u00e1 cerrada. Re\u00e1brela desde la Bandeja de OTs para volver a planificarla.';
  }
  if (/asignaci\u00f3n no encontrada|no programada|sin acceso/i.test(detalle)) {
    return 'No se encontr\u00f3 una asignaci\u00f3n programada disponible para mover.';
  }
  if (/tipo de asignaci\u00f3n no v\u00e1lido/i.test(detalle)) {
    return 'El tipo de asignaci\u00f3n no es v\u00e1lido.';
  }
  if (/[áéíóúñ]/i.test(detalle)) return detalle;
  return 'No se pudo completar la operación del Planner. Recarga los datos y vuelve a intentarlo.';
}

function validarTablaAsignacion(tabla) {
  if (!TABLAS_ASIGNACION.has(tabla)) {
    throw new Error('El tipo de asignaci\u00f3n no es v\u00e1lido.');
  }
}

export async function actualizarFechaAsignacion({ tabla = 'planner_asignaciones', id, fecha }) {
  validarTablaAsignacion(tabla);
  const { data, error } = await getSupabaseClient().rpc('planner_mover_fecha_asignacion', {
    p_tabla: tabla,
    p_id: id,
    p_fecha: fecha,
  });
  if (error) throw new Error(mensajeErrorPlanner(error));
  return data;
}

export async function restaurarTareaAsignacion({ tabla = 'planner_asignaciones', id, tareaId }) {
  validarTablaAsignacion(tabla);
  const { data, error } = await getSupabaseClient().from(tabla).update({ tarea_id: tareaId || null })
    .eq('id', id).eq('estado', 'programado').select('*').single();
  if (error) throw error;
  return data;
}

export async function asignarPersona({ empresaId, sociedadId, ot, tecnicoId, puestoId, tareaId, fecha, horas }) {
  validarOtPlanificable(ot);
  const { data, error } = await getSupabaseClient().from('planner_asignaciones').insert({
    empresa_id: empresaId, sociedad_id: sociedadId || null, ot_id: ot.id, tecnico_id: tecnicoId,
    puesto_id: puestoId || null, tarea_id: tareaId || null, fecha, horas_estimadas: horas, estado: 'programado',
  }).select(CAMPOS.asignaciones).single();
  if (error) throw error;
  return data;
}

export async function asignarEquipo({ empresaId, sociedadId, ot, maquinaId, tareaId, fecha, horas }) {
  validarOtPlanificable(ot);
  const { data, error } = await getSupabaseClient().from('planner_asignaciones_equipo').insert({
    empresa_id: empresaId, sociedad_id: sociedadId || null, ot_id: ot.id, maquina_id: maquinaId,
    tarea_id: tareaId || null, fecha, horas_estimadas: horas, estado: 'programado',
  }).select(CAMPOS.equipos).single();
  if (error) throw error;
  return data;
}

export async function sincronizarOcupacionesOT({ otId }) {
  const { error } = await getSupabaseClient().rpc('planner_sincronizar_ocupaciones_ot', {
    p_ot_id: otId,
  });
  if (error) throw new Error(mensajeErrorPlanner(error));
}

export async function moverAsignacion({ asignacionId, otDestino, motivo }) {
  const { data, error } = await getSupabaseClient().rpc('planner_mover_asignacion', {
    p_asignacion_id: asignacionId, p_ot_destino: otDestino, p_motivo: motivo || null,
  });
  if (error) throw error;
  return data;
}

export async function moverAsignacionEquipo({ asignacionId, otDestino, motivo }) {
  const { data, error } = await getSupabaseClient().rpc('planner_mover_asignacion_equipo', {
    p_asignacion_id: asignacionId, p_ot_destino: otDestino, p_motivo: motivo || null,
  });
  if (error) throw error;
  return data;
}

export async function heredarTareasOT(otId) {
  const { data, error } = await getSupabaseClient().rpc('planner_heredar_tareas_ot', { p_ot_id: otId });
  if (error) throw error;
  return data;
}
