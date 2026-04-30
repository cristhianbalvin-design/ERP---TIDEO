// TIDEO ERP — plannerService.js
// Servicio para Planner de Recursos v2: planner_asignaciones + cuadrillas
import { getSupabaseClient } from '../lib/supabaseClient.js';

function isoDate(d) {
  return d instanceof Date ? d.toISOString().split('T')[0] : d;
}

// ─── ASIGNACIONES ─────────────────────────────────────────────────────────────

/**
 * Carga todas las asignaciones del planner para un rango de fechas.
 * Incluye datos de OT y técnico para renderizar la grilla sin joins extra.
 */
export async function getAsignaciones(empresaId, fechaInicio, fechaFin) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('planner_asignaciones')
    .select(`
      *,
      hora_inicio_estimada,
      hora_fin_estimada,
      ordenes_trabajo (
        id,
        numero
      )
    `)
    .eq('empresa_id', empresaId)
    .gte('fecha', isoDate(fechaInicio))
    .lte('fecha', isoDate(fechaFin))
    .neq('estado', 'cancelado')
    .order('fecha', { ascending: true });

  if (error) {
    console.error('Error al obtener asignaciones:', error);
    throw error;
  }
  return data || [];
}

/**
 * Detecta conflictos: técnicos que ya tienen asignación activa en los días indicados.
 * Retorna map: { "tecnicoId__fecha": [{ asig_id, ot_numero, ot_descripcion }] }
 */
export async function detectarConflictos(tecnicoIds, fechas, empresaId) {
  if (!tecnicoIds.length || !fechas.length) return {};
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('planner_asignaciones')
    .select('id, tecnico_id, fecha, ot:ordenes_trabajo(numero, descripcion, servicio)')
    .eq('empresa_id', empresaId)
    .in('tecnico_id', tecnicoIds)
    .in('fecha', fechas)
    .neq('estado', 'cancelado');

  if (error) throw error;

  const map = {};
  (data || []).forEach(a => {
    const key = `${a.tecnico_id}__${a.fecha}`;
    if (!map[key]) map[key] = [];
    map[key].push({ asig_id: a.id, ot_numero: a.ot?.numero, ot_descripcion: a.ot?.descripcion || a.ot?.servicio });
  });
  return map;
}

/**
 * Genera todas las asignaciones técnico×día para un rango de fechas.
 * Usa upsert con on_conflict=ignore para no duplicar si ya existen.
 * Retorna las filas creadas y las que ya existían (conflicto).
 */
export async function crearAsignacionesRango({ otId, tecnicoIds, fechaInicio, fechaFin, empresaId, horaInicio = null, horaFin = null, cuadrillaOrigenId = null, createdBy = null }) {
  const supabase = await getSupabaseClient();
  const dias = [];
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    dias.push(isoDate(new Date(d)));
  }

  const rows = [];
  for (const tecnicoId of tecnicoIds) {
    for (const fecha of dias) {
      rows.push({
        empresa_id: empresaId,
        ot_id: otId,
        tecnico_id: tecnicoId,
        fecha,
        hora_inicio_estimada: horaInicio || null,
        hora_fin_estimada: horaFin || null,
        estado: 'programado',
        cuadrilla_origen_id: cuadrillaOrigenId || null,
        created_by: createdBy || null,
      });
    }
  }

  if (!rows.length) return [];
  const { data, error } = await supabase
    .from('planner_asignaciones')
    .upsert(rows, { onConflict: 'empresa_id,ot_id,tecnico_id,fecha', ignoreDuplicates: false })
    .select();

  if (error) throw error;
  return data || [];
}

export async function agregarTecnicoDia({ otId, tecnicoId, fecha, empresaId, horaInicio = null, horaFin = null, cuadrillaOrigenId = null, createdBy = null }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('planner_asignaciones')
    .upsert({
      empresa_id: empresaId,
      ot_id: otId,
      tecnico_id: tecnicoId,
      fecha,
      hora_inicio_estimada: horaInicio || null,
      hora_fin_estimada: horaFin || null,
      estado: 'programado',
      cuadrilla_origen_id: cuadrillaOrigenId,
      created_by: createdBy
    }, { onConflict: 'empresa_id,ot_id,tecnico_id,fecha' })
    .select();

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Cancela una asignación específica (no la elimina, la marca como cancelada).
 */
export async function quitarTecnicoDia(asignacionId, motivo = '') {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('planner_asignaciones')
    .update({
      estado: 'cancelado',
      motivo_reprogramacion: motivo || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', asignacionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── CUADRILLAS ───────────────────────────────────────────────────────────────

/**
 * Carga todas las cuadrillas activas con sus miembros expandidos.
 */
export async function getCuadrillas(empresaId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(`
      *,
      cuadrilla_miembros (
        id,
        tecnico_id
      )
    `)
    .eq('empresa_id', empresaId)
    .eq('activa', true);

  if (error) {
    console.error('Error al obtener cuadrillas:', error);
    throw error;
  }
  return data;
}

/**
 * Crea una nueva cuadrilla y sus miembros.
 */
export async function crearCuadrilla({ nombre, especialidadPrincipal, tecnicoIds, empresaId }) {
  const supabase = await getSupabaseClient();

  const { data: cuadrilla, error: errC } = await supabase
    .from('cuadrillas')
    .insert({ empresa_id: empresaId, nombre, especialidad_principal: especialidadPrincipal || null })
    .select()
    .single();

  if (errC) throw errC;

  if (tecnicoIds?.length) {
    const miembros = tecnicoIds.map(tid => ({ cuadrilla_id: cuadrilla.id, tecnico_id: tid }));
    const { error: errM } = await supabase.from('cuadrilla_miembros').insert(miembros);
    if (errM) throw errM;
  }

  return cuadrilla;
}

/**
 * Actualiza los miembros de una cuadrilla (reemplaza todos).
 */
export async function actualizarMiembrosCuadrilla(cuadrillaId, tecnicoIds) {
  const supabase = await getSupabaseClient();
  // Eliminar miembros actuales
  await supabase.from('cuadrilla_miembros').delete().eq('cuadrilla_id', cuadrillaId);
  if (tecnicoIds?.length) {
    const miembros = tecnicoIds.map(tid => ({ cuadrilla_id: cuadrillaId, tecnico_id: tid }));
    const { error } = await supabase.from('cuadrilla_miembros').insert(miembros);
    if (error) throw error;
  }
}
