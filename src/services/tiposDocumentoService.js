import { getSupabaseClient } from '../lib/supabaseClient.js';

const makeId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

const pick = (source, keys) => keys.reduce((acc, key) => {
  if (source[key] !== undefined) acc[key] = source[key];
  return acc;
}, {});

export const tiposDocumentoService = {

  // ── Tipos de documento ─────────────────────────────────────────────────────

  getTiposDocumento: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tipos_documento_empresa')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });
    if (error) { console.error('Error fetching tipos_documento:', error); return []; }
    return data || [];
  },

  crearTipoDocumento: async (empresaId, tipo) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: tipo.id || makeId('tdoc'),
      empresa_id: empresaId,
      ...pick(tipo, ['codigo', 'nombre', 'ambito', 'exige_vencimiento', 'dias_alerta', 'es_habilitante', 'requiere_validacion', 'estado', 'orden']),
    };
    const { data, error } = await supabase
      .from('tipos_documento_empresa')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  actualizarTipoDocumento: async (id, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tipos_documento_empresa')
      .update(pick(payload, ['codigo', 'nombre', 'ambito', 'exige_vencimiento', 'dias_alerta', 'es_habilitante', 'requiere_validacion', 'estado', 'orden']))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  importarPlantilla: async (empresaId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('importar_plantilla_tipos_documento', {
      p_empresa_id: empresaId,
    });
    if (error) throw error;
  },

  // ── Requisitos cargo × tipo de documento ──────────────────────────────────

  getRequisitosCargo: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cargo_documento_requisito')
      .select('*, tipos_documento_empresa(nombre, ambito, exige_vencimiento, es_habilitante), cargos_empresa(nombre, tipo)')
      .eq('empresa_id', empresaId);
    if (error) { console.error('Error fetching requisitos_cargo:', error); return []; }
    return data || [];
  },

  upsertRequisitoCargo: async (empresaId, cargoId, tipoDocId, obligatorio) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: makeId('cdr'),
      empresa_id: empresaId,
      cargo_id: cargoId,
      tipo_documento_id: tipoDocId,
      obligatorio,
    };
    const { data, error } = await supabase
      .from('cargo_documento_requisito')
      .upsert([payload], { onConflict: 'empresa_id,cargo_id,tipo_documento_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  eliminarRequisitoCargo: async (id) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('cargo_documento_requisito')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
