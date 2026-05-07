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

export const maestrosService = {
  // Areas de empresa
  getAreas: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('areas_empresa').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching areas:', error); return []; }
    return data;
  },
  crearArea: async (empresaId, area) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: area.id || makeId('area'),
      empresa_id: empresaId,
      ...pick(area, ['codigo', 'nombre', 'tipo', 'responsable', 'detalle', 'estado']),
    };
    const { data, error } = await supabase.from('areas_empresa').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarArea: async (areaId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('areas_empresa').update(pick(payload, ['codigo', 'nombre', 'tipo', 'responsable', 'detalle', 'estado'])).eq('id', areaId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarArea: async (areaId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('areas_empresa').delete().eq('id', areaId);
    if (error) throw error;
  },

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
    const payload = {
      id: cargo.id || makeId('car'),
      empresa_id: empresaId,
      ...pick(cargo, ['codigo', 'nombre', 'tipo', 'detalle', 'estado']),
    };
    const { data, error } = await supabase.from('cargos_empresa').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarCargo: async (cargoId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('cargos_empresa').update(pick(payload, ['codigo', 'nombre', 'tipo', 'detalle', 'estado'])).eq('id', cargoId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarCargo: async (cargoId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('cargos_empresa').delete().eq('id', cargoId);
    if (error) throw error;
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
    const payload = {
      id: especialidad.id || makeId('esp'),
      empresa_id: empresaId,
      ...pick(especialidad, ['codigo', 'nombre', 'area', 'requiere_cert', 'estado']),
    };
    const { data, error } = await supabase.from('especialidades_tecnicas').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarEspecialidad: async (especialidadId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('especialidades_tecnicas').update(pick(payload, ['codigo', 'nombre', 'area', 'requiere_cert', 'estado'])).eq('id', especialidadId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarEspecialidad: async (especialidadId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('especialidades_tecnicas').delete().eq('id', especialidadId);
    if (error) throw error;
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
    const payload = {
      id: tipoServicio.id || makeId('tsi'),
      empresa_id: empresaId,
      ...pick(tipoServicio, ['codigo', 'nombre', 'clasificacion', 'facturable', 'estado']),
    };
    const { data, error } = await supabase.from('tipos_servicio_interno').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarTipoServicio: async (tipoServicioId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tipos_servicio_interno').update(pick(payload, ['codigo', 'nombre', 'clasificacion', 'facturable', 'estado'])).eq('id', tipoServicioId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarTipoServicio: async (tipoServicioId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('tipos_servicio_interno').delete().eq('id', tipoServicioId);
    if (error) throw error;
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
    const payload = {
      id: almacen.id || makeId('alm'),
      empresa_id: empresaId,
      ...pick(almacen, ['codigo', 'nombre', 'tipo', 'responsable', 'direccion', 'estado']),
    };
    const { data, error } = await supabase.from('almacenes').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarAlmacen: async (almacenId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('almacenes').update(pick(payload, ['codigo', 'nombre', 'tipo', 'responsable', 'direccion', 'estado'])).eq('id', almacenId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarAlmacen: async (almacenId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('almacenes').delete().eq('id', almacenId);
    if (error) throw error;
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
    const payload = {
      id: sede.id || makeId('sed'),
      empresa_id: empresaId,
      ...pick(sede, ['codigo', 'nombre', 'direccion', 'gps', 'estado']),
    };
    const { data, error } = await supabase.from('sedes').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarSede: async (sedeId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sedes').update(pick(payload, ['codigo', 'nombre', 'direccion', 'gps', 'estado'])).eq('id', sedeId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarSede: async (sedeId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('sedes').delete().eq('id', sedeId);
    if (error) throw error;
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
    const payload = {
      id: industria.id || makeId('ind'),
      empresa_id: empresaId,
      ...pick(industria, ['codigo', 'nombre', 'categoria', 'estado']),
    };
    const { data, error } = await supabase.from('industrias').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarIndustria: async (industriaId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('industrias').update(pick(payload, ['codigo', 'nombre', 'categoria', 'estado'])).eq('id', industriaId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarIndustria: async (industriaId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('industrias').delete().eq('id', industriaId);
    if (error) throw error;
  },
};
