import { getSupabaseClient } from '../lib/supabaseClient.js';
import { comprimirFotoActa, dataUrlABlob, nuevoId, sha256Hex } from './actaConformidadService.js';

const bucket = () => getSupabaseClient().storage.from('of-entregas');
const ruta = (empresaId, ofId, nombre) => `${empresaId}/${ofId}/${nombre}-${nuevoId()}`;
async function rpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) throw error;
  return data;
}
async function subir(path, blob, contentType) {
  const { error } = await bucket().upload(path, blob, { upsert: false, contentType });
  if (error) throw error;
}
export const cargarDatosEntrega = ofId => rpc('of_entrega_datos', { p_of_id: ofId });
export const cargarEntrega = ofId => rpc('of_entrega', { p_of_id: ofId });
export const entregarOF = (ofId, datos) => rpc('of_entregar', { p_of_id: ofId, p_datos: datos });
export async function subirFotoEntrega(empresaId, ofId, archivo) {
  const { blob, ancho, alto } = await comprimirFotoActa(archivo);
  const path = `${ruta(empresaId, ofId, 'foto')}.jpg`;
  await subir(path, blob, 'image/jpeg');
  return { path, sha256: await sha256Hex(blob), ancho, alto };
}
export async function subirFirmaEntrega(empresaId, ofId, dataUrl) {
  const blob = await dataUrlABlob(dataUrl);
  const path = `${ruta(empresaId, ofId, 'firma')}.png`;
  await subir(path, blob, 'image/png');
  return path;
}
export async function registrarPdfEntrega(empresaId, ofId, entregaId, blob) {
  const path = `${ruta(empresaId, ofId, 'acta')}.pdf`;
  const sha256 = await sha256Hex(blob);
  await subir(path, blob, 'application/pdf');
  await rpc('of_registrar_pdf_entrega', { p_entrega_id: entregaId, p_path: path, p_sha256: sha256 });
  return path;
}
export async function urlsFirmadasEntrega(paths, segundos = 3600) {
  const unicos = [...new Set((paths || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await bucket().createSignedUrls(unicos, segundos);
  if (error) throw error;
  return new Map((data || []).map(item => [item.path, item.signedUrl]));
}
