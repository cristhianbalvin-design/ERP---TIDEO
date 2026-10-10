import { getSupabaseClient } from '../lib/supabaseClient.js';

export function seleccionarEmisorPersona(personas = [], personaId = null, identidadEmpresa = null) {
  const persona = (personas || []).find(item => String(item.id) === String(personaId));
  if (persona) return { fuente: 'persona', persona, nombre: persona.nombre, cargo: persona.cargo || '', firma: persona.firma || null };
  const firmante = String(identidadEmpresa?.firmante || '').trim();
  if (firmante) return { fuente: 'sociedad', persona: null, nombre: firmante, cargo: identidadEmpresa?.cargo_firmante || '', firma: identidadEmpresa?.firma_url || null };
  return { fuente: 'manual', persona: null, nombre: '', cargo: '', firma: null };
}

export function preseleccionarPersonaVinculada(personas = [], userId = null) {
  if (!userId) return null;
  return (personas || []).find(persona => persona.auth_user_id === userId)?.id || null;
}

export async function listarEmisoresConFirma(empresaId) {
  if (!empresaId) return [];
  const { data, error } = await getSupabaseClient().rpc('listar_personal_emisor_firma_informe', { p_empresa_id: empresaId });
  if (error) throw error;
  return (data || []).map(persona => ({
    ...persona,
    firma: null,
    etiqueta: [persona.nombre, persona.cargo].filter(Boolean).join(' · '),
  }));
}

export async function obtenerFirmaPersonaParaVista(persona) {
  if (!persona?.firma_bucket || !persona?.firma_storage_path) return persona?.firma_url || null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(persona.firma_bucket).createSignedUrl(persona.firma_storage_path, 600);
  if (error) return persona.firma_url || null;
  return data?.signedUrl || persona.firma_url || null;
}
