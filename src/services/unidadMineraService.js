import { getSupabaseClient } from '../lib/supabaseClient.js';
import { getDataMode } from '../lib/dataMode.js';

const genId = () => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `umas_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

let mockAsignaciones = [];

// ── Pertenencia trabajador -> Unidad Minera (sedes.tipo = 'unidad_minera') ────
// Tabla independiente de rrhh_geocerca_asignaciones (geofencing/SAR) y de
// sede_id en personal_operativo/administrativo — no se toca ninguna de las dos.

export async function getUnidadMineraAsignaciones(empresaId) {
  if (!empresaId) return [];
  if (getDataMode() !== 'supabase') {
    return mockAsignaciones.filter(a => a.empresa_id === empresaId);
  }
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_asignaciones_um')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_inicio', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Crea un tramo de pertenencia a una Unidad Minera. La base rechaza tramos que
 * se superpongan con uno existente del mismo trabajador (exclusion constraint,
 * migración 333) y exige que sede_id apuntre a una sede con tipo='unidad_minera'.
 */
export async function crearUnidadMineraAsignacion(empresaId, params) {
  const row = {
    id: genId(),
    empresa_id: empresaId,
    personal_id: params.personalId,
    personal_tipo: params.personalTipo,
    sede_id: params.sedeId,
    fecha_inicio: params.fechaInicio,
    fecha_fin: params.fechaFin || null,
    motivo: params.motivo || null,
    creado_por: params.creadoPor || null,
  };

  if (getDataMode() !== 'supabase') {
    mockAsignaciones = [...mockAsignaciones, row];
    return row;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('personal_asignaciones_um').insert([row]).select().single();
  if (error) throw error;
  return data;
}

/**
 * Actualiza un tramo existente — usado para cerrar una vigencia (fecha_fin) al
 * reasignar o dar de baja a un trabajador de su Unidad Minera. No requiere
 * aprobación: esta tabla no alimenta nómina ni snapshots ya cerrados.
 */
export async function actualizarUnidadMineraAsignacion(empresaId, asignacionId, params) {
  const patch = { updated_at: new Date().toISOString() };
  if (params.fechaFin !== undefined) patch.fecha_fin = params.fechaFin;
  if (params.sedeId !== undefined) patch.sede_id = params.sedeId;
  if (params.fechaInicio !== undefined) patch.fecha_inicio = params.fechaInicio;
  if (params.motivo !== undefined) patch.motivo = params.motivo;

  if (getDataMode() !== 'supabase') {
    let actualizado = null;
    mockAsignaciones = mockAsignaciones.map(a => {
      if (a.id === asignacionId && a.empresa_id === empresaId) {
        actualizado = { ...a, ...patch };
        return actualizado;
      }
      return a;
    });
    return actualizado;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_asignaciones_um')
    .update(patch)
    .eq('id', asignacionId)
    .eq('empresa_id', empresaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
