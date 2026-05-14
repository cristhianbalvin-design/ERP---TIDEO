import { getSupabaseClient } from '../lib/supabaseClient.js';

async function hashKey(keyPlain) {
  const data = new TextEncoder().encode(keyPlain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generarApiKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = 'tdk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await hashKey(raw);
  return { raw, hash };
}

export const apiKeysService = {
  async listar() {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, empresa_id, descripcion, permisos, activo, creado_en, ultimo_uso_en, empresas(nombre_comercial, razon_social)')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async crear(empresaId, descripcion, permisos, creadoPor, activo = true) {
    const { raw, hash } = await generarApiKey();
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('api_keys')
      .insert({ empresa_id: empresaId, key_hash: hash, descripcion, permisos, activo, creado_por: creadoPor })
      .select('id, empresa_id, descripcion, permisos, activo, creado_en, ultimo_uso_en')
      .single();
    if (error) throw error;
    return { ...data, rawKey: raw };
  },

  async actualizarPermisos(id, permisos) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('api_keys')
      .update({ permisos })
      .eq('id', id)
      .select('id, descripcion, permisos, activo')
      .single();
    if (error) throw error;
    return data;
  },

  async revocar(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('api_keys')
      .update({ activo: false })
      .eq('id', id);
    if (error) throw error;
  },
};
