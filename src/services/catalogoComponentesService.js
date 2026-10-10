import { getSupabaseClient } from '../lib/supabaseClient.js';

const rpc = async (name, params) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
};

export const catalogoComponentesService = {
  listar: (empresaId, sociedadId = null) => rpc('catalogo_componentes_listar', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
  }),
  guardarOverride: (empresaId, sociedadId, componenteId, zonaId, medidaId, medida) => rpc('catalogo_componentes_guardar_override', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
    p_componente_id: componenteId,
    p_zona_id: zonaId,
    p_medida_id: medidaId,
    p_nombre: medida.nombre,
    p_cota: typeof medida.cota === 'string' && medida.cota.trim() === '' ? null : medida.cota ?? null,
    p_desde: medida.desde,
    p_referencia: medida.referencia,
  }),
  restablecer: (empresaId, sociedadId, componenteId, zonaId, medidaId) => rpc('catalogo_componentes_restablecer_override', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
    p_componente_id: componenteId,
    p_zona_id: zonaId,
    p_medida_id: medidaId,
  }),
  cambiarEstado: (empresaId, sociedadId, componenteId, activo) => rpc('catalogo_componentes_cambiar_estado', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
    p_componente_id: componenteId,
    p_activo: activo,
  }),
};
