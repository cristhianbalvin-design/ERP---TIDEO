import { getSupabaseClient } from '../lib/supabaseClient.js';

const makeId = (prefix) => {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(randomPart).replace(/-/g, '').slice(0, 18)}`;
};

const pick = (source, keys) => keys.reduce((acc, key) => {
  if (source[key] !== undefined) acc[key] = source[key];
  return acc;
}, {});

export const posicionesService = {
  getUnidadesOrganizacionales: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('unidades_organizacionales')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre', { ascending: true });
    if (error) { console.error('Error fetching unidades organizacionales:', error); return []; }
    return data;
  },
  getPosiciones: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('posiciones')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('activa', true);
    if (error) { console.error('Error fetching posiciones:', error); return []; }
    return data;
  },
  getPosicionesUsuarios: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('posiciones_usuarios')
      .select('*')
      .eq('empresa_id', empresaId);
    if (error) { console.error('Error fetching posiciones_usuarios:', error); return []; }
    return data;
  },

  crearUnidadOrganizacional: async (empresaId, unidad) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: unidad.id || makeId('uo'),
      empresa_id: empresaId,
      codigo: unidad.codigo || `UO-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(unidad, ['nombre', 'unidad_padre_id', 'ceco_id', 'estado', 'categoria']),
    };
    const { data, error } = await supabase.from('unidades_organizacionales').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarUnidadOrganizacional: async (unidadId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('unidades_organizacionales')
      .update(pick(payload, ['codigo', 'nombre', 'unidad_padre_id', 'ceco_id', 'estado', 'categoria']))
      .eq('id', unidadId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarUnidadOrganizacional: async (unidadId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('unidades_organizacionales')
      .delete()
      .eq('id', unidadId)
      .select('id')
      .single();
    if (error) throw error;
  },

  // Reasigna la unidad organizacional de UNA posicion puntual. No toca posiciones_usuarios
  // (el historico de ocupacion queda intacto) ni mueve en cascada a sus subordinados.
  actualizarUnidadDePosicion: async (posicionId, unidadOrganizacionalId) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('posiciones')
      .update({ unidad_organizacional_id: unidadOrganizacionalId })
      .eq('id', posicionId).select().single();
    if (error) throw error;
    return data;
  },

  reasignarPadreDePosicion: async (posicionId, posicionPadreId) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('reasignar_padre_posicion', {
      p_posicion_id: posicionId,
      p_reporta_a_posicion_id: posicionPadreId || null,
    });
    if (error) throw error;
    return data;
  },

  // Asigna/cambia el cargo de UNA posicion puntual (campana de backfill masivo). No toca
  // personal_operativo.cargo_id ni personal_administrativo.cargo_id -- son fuentes independientes.
  actualizarCargoDePosicion: async (posicionId, cargoId) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('posiciones')
      .update({ cargo_id: cargoId || null })
      .eq('id', posicionId).select().single();
    if (error) throw error;
    return data;
  },

  // Crea una posicion nueva (vacante hasta que alguien la ocupe via el flujo de alta/edicion
  // de usuario, que abre el registro correspondiente en posiciones_usuarios).
  crearPosicion: async (empresaId, posicion) => {
    const supabase = await getSupabaseClient();
    const payload = {
      empresa_id: empresaId,
      ...pick(posicion, ['unidad_organizacional_id', 'cargo_id', 'reporta_a_posicion_id']),
    };
    const { data, error } = await supabase.from('posiciones').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  archivarPosicion: async (posicionId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('posiciones')
      .update({ activa: false })
      .eq('id', posicionId);
    if (error) throw error;
    return true;
  },

  eliminarPosicion: async (posicionId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('posiciones')
      .delete()
      .eq('id', posicionId);
    if (error) throw error;
    return true;
  },
};
