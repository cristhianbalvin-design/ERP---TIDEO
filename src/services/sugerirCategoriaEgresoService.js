import { getSupabaseClient } from '../lib/supabaseClient.js';

export const MAX_DESCRIPCION_CATEGORIA_EGRESO = 1000;

export function crearPayloadSugerenciaCategoriaEgreso({ empresaId, descripcion, tipoGasto } = {}) {
  return {
    empresa_id: empresaId,
    descripcion: String(descripcion || '').slice(0, MAX_DESCRIPCION_CATEGORIA_EGRESO),
    tipo_gasto: String(tipoGasto || '').slice(0, 120),
  };
}

export function validarRespuestaSugerenciaCategoriaEgreso(respuesta, categoriasActivas = []) {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) return null;
  const categoria = respuesta.categoria;
  const razon = respuesta.razon;
  const nombres = categoriasActivas.map(item => typeof item === 'string' ? item : item?.nombre).filter(Boolean);
  if (typeof categoria !== 'string' || !nombres.includes(categoria)) return null;
  if (typeof razon !== 'string' || !razon.trim() || razon.length > 300) return null;
  return { categoria, razon: razon.trim() };
}

export async function sugerirCategoriaEgreso({ empresaId, descripcion, tipoGasto, categoriasActivas = [], cliente }) {
  const supabase = cliente || await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('sugerir-categoria-egreso', {
    body: crearPayloadSugerenciaCategoriaEgreso({ empresaId, descripcion, tipoGasto }),
  });
  if (error) {
    const err = new Error('No se pudo obtener una sugerencia.');
    err.status = error.context?.status || error.status || 0;
    throw err;
  }
  const validada = validarRespuestaSugerenciaCategoriaEgreso(data, categoriasActivas);
  if (!validada) throw new Error('La sugerencia recibida no es válida.');
  return validada;
}
