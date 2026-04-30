import { getSupabaseClient } from '../lib/supabaseClient.js';

export const maestrosService = {
  // Cargos
  getCargos: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('cargos_empresa').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching cargos:', error); return []; }
    return data;
  },
  crearCargo: async (empresaId, cargo) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('cargos_empresa').insert([{ ...cargo, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  // Especialidades
  getEspecialidades: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('especialidades_tecnicas').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching especialidades:', error); return []; }
    return data;
  },
  crearEspecialidad: async (empresaId, especialidad) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('especialidades_tecnicas').insert([{ ...especialidad, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  // Tipos de Servicio
  getTiposServicio: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tipos_servicio_interno').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching tipos servicio:', error); return []; }
    return data;
  },
  crearTipoServicio: async (empresaId, tipoServicio) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tipos_servicio_interno').insert([{ ...tipoServicio, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  // Almacenes
  getAlmacenes: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('almacenes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching almacenes:', error); return []; }
    return data;
  },
  crearAlmacen: async (empresaId, almacen) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('almacenes').insert([{ ...almacen, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  // Sedes
  getSedes: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sedes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching sedes:', error); return []; }
    return data;
  },
  crearSede: async (empresaId, sede) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sedes').insert([{ ...sede, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  // Industrias
  getIndustrias: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('industrias').select('*').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre', { ascending: true });
    if (error) { console.error('Error fetching industrias:', error); return []; }
    return data;
  },
  crearIndustria: async (empresaId, industria) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('industrias').insert([{ ...industria, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
};
