import { getSupabaseClient } from '../lib/supabaseClient.js';
import { SOCIEDAD_TODAS_ID } from './sociedadesService.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarSociedadIdCatalogo(sociedadId) {
  if (sociedadId === SOCIEDAD_TODAS_ID) {
    throw new Error('Selecciona una sociedad concreta; "todas" no es válida para el catálogo de componentes.');
  }
  if (sociedadId !== null && (typeof sociedadId !== 'string' || !UUID_RE.test(sociedadId))) {
    throw new Error('El identificador de sociedad debe ser un UUID válido o null.');
  }
}

const rpc = async (name, params, sociedadId) => {
  validarSociedadIdCatalogo(sociedadId);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
};

export const catalogoComponentesService = {
  listar: (empresaId, sociedadId = null) => rpc('catalogo_componentes_listar', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
  }, sociedadId),
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
  }, sociedadId),
  restablecer: (empresaId, sociedadId, componenteId, zonaId, medidaId) => rpc('catalogo_componentes_restablecer_override', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
    p_componente_id: componenteId,
    p_zona_id: zonaId,
    p_medida_id: medidaId,
  }, sociedadId),
  cambiarEstado: (empresaId, sociedadId, componenteId, activo) => rpc('catalogo_componentes_cambiar_estado', {
    p_empresa_id: empresaId,
    p_sociedad_id: sociedadId,
    p_componente_id: componenteId,
    p_activo: activo,
  }, sociedadId),
};
