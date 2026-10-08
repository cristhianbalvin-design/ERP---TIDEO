import { getSupabaseClient } from '../lib/supabaseClient.js';

const COLUMNAS_ACTIVIDAD = 'id,codigo,nombre,estado';
const COLUMNAS_CARGO = 'id,codigo,nombre,estado';
const COLUMNAS_RECETA = 'empresa_id,actividad_id,tarea_id,cargo_id,orden';

export const recetasActividadService = {
  async listarActividades(empresaId) {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const [{ data: actividades, error: errorActividades }, { data: filasReceta, error: errorReceta }] = await Promise.all([
      supabase.from('tipos_servicio_interno').select(COLUMNAS_ACTIVIDAD).eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre'),
      supabase.from('plantillas_actividad').select('actividad_id').eq('empresa_id', empresaId),
    ]);
    if (errorActividades) throw errorActividades;
    if (errorReceta) throw errorReceta;
    const cantidades = new Map();
    (filasReceta || []).forEach(fila => cantidades.set(fila.actividad_id, (cantidades.get(fila.actividad_id) || 0) + 1));
    return (actividades || []).map(actividad => ({ ...actividad, cantidad_tareas: cantidades.get(actividad.id) || 0 }));
  },

  async listarCargosActivos(empresaId) {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('cargos_empresa').select(COLUMNAS_CARGO).eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre');
    if (error) throw error;
    return data || [];
  },

  async listarTareasReceta(empresaId, actividadId) {
    if (!empresaId || !actividadId) return [];
    const supabase = await getSupabaseClient();
    const { data: filas, error } = await supabase.from('plantillas_actividad').select(COLUMNAS_RECETA).eq('empresa_id', empresaId).eq('actividad_id', actividadId).order('orden').order('tarea_id');
    if (error) throw error;
    const tareaIds = [...new Set((filas || []).map(fila => fila.tarea_id))];
    if (!tareaIds.length) return [];
    const { data: tareas, error: errorTareas } = await supabase.from('tipos_servicio_interno').select(COLUMNAS_ACTIVIDAD).eq('empresa_id', empresaId).in('id', tareaIds);
    if (errorTareas) throw errorTareas;
    const tareasPorId = new Map((tareas || []).map(tarea => [tarea.id, tarea]));
    return (filas || []).map(fila => ({ ...fila, tarea: tareasPorId.get(fila.tarea_id) || null }));
  },

  async guardarReceta(empresaId, actividadId, actuales, deseadas) {
    if (!empresaId || !actividadId) throw new Error('Selecciona una empresa y una actividad para guardar la receta.');
    const supabase = await getSupabaseClient();
    const payload = (deseadas || []).map((fila, indice) => ({
      tarea_id: fila.tarea_id,
      cargo_id: fila.cargo_id || null,
      orden: indice + 1,
    }));
    const { data, error } = await supabase.rpc('reemplazar_receta_actividad', {
      p_empresa_id: empresaId,
      p_actividad_id: actividadId,
      p_filas: payload,
    });
    if (error) throw error;
    return data;
  },
};

export function mensajeErrorRecetaActividad(error) {
  const codigo = String(error?.code || '').toUpperCase();
  const detalle = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  if (codigo === '42501' || /row-level security|permission denied|permisos?/i.test(detalle)) return 'No tienes permiso para modificar recetas.';
  if (codigo === '23505' || /unique constraint|duplicate key/i.test(detalle)) return 'La receta ya contiene esa tarea. Actualiza la lista e inténtalo nuevamente.';
  if (/autorrefer|actividad.*tarea|tarea.*actividad/i.test(detalle)) return 'Una actividad no puede agregarse como tarea de su propia receta.';
  if (codigo === '23514' || /tenant|misma empresa/i.test(detalle)) return 'La actividad y las tareas deben pertenecer a la misma empresa.';
  return 'No se pudo guardar la receta. Revisa la información e inténtalo nuevamente.';
}
