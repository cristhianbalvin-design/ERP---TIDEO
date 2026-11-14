import { getSupabaseClient } from '../lib/supabaseClient.js';
import { comprimirFotoActa, nuevoId, sha256Hex } from './actaConformidadService.js';

async function rpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) throw error;
  return data;
}
export const listarGarantias = empresaId => rpc('of_garantias_listado', { p_empresa_id: empresaId });
export const registrarReclamo = (garantiaId, datos) => rpc('of_registrar_reclamo', { p_garantia_id: garantiaId, p_datos: datos });
export const evaluarReclamo = (reclamoId, evaluacion, observacion) => rpc('of_evaluar_reclamo', { p_reclamo_id: reclamoId, p_evaluacion: evaluacion, p_observacion: observacion });
export const crearOFGarantia = reclamoId => rpc('of_crear_of_garantia', { p_reclamo_id: reclamoId });
export const obtenerPasaporte = unidadId => rpc('of_pasaporte', { p_unidad_id: unidadId });
export const buscarPasaportes = (empresaId, texto) => rpc('of_pasaporte_buscar', { p_empresa_id: empresaId, p_texto: texto });
export async function subirFotoReclamo(empresaId, ofId, archivo) {
  const { blob, ancho, alto } = await comprimirFotoActa(archivo);
  const path = `${empresaId}/${ofId}/reclamo-${nuevoId()}.jpg`;
  const { error } = await getSupabaseClient().storage.from('of-entregas').upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
  if (error) throw error;
  return { path, sha256: await sha256Hex(blob), ancho, alto };
}
