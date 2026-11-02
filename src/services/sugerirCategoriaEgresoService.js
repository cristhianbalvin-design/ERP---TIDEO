import { getSupabaseClient } from '../lib/supabaseClient.js';

export const MAX_DESCRIPCION_CATEGORIA_EGRESO = 1000;

export function crearPayloadSugerenciaCategoriaEgreso({ empresaId, descripcion, tipoGasto, cajaChica } = {}) {
  return {
    empresa_id: empresaId,
    descripcion: String(descripcion || '').slice(0, MAX_DESCRIPCION_CATEGORIA_EGRESO),
    tipo_gasto: String(tipoGasto || '').slice(0, 120),
    ...(typeof cajaChica === 'boolean' ? { caja_chica: cajaChica } : {}),
  };
}

export function validarRespuestaSugerenciaCategoriaEgreso(respuesta, tiposActivos = [], categoriasActivas = [], cajaChica = false) {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) return null;
  if (respuesta.tipo_gasto_id === null && respuesta.tipo_gasto === null && respuesta.categoria === null && respuesta.razon === null) {
    return { tipo_gasto_id: null, tipo_gasto: null, categoria: null, razon: null };
  }
  const tipo = tiposActivos.find(item => item?.id === respuesta.tipo_gasto_id && item?.nombre === respuesta.tipo_gasto && item?.activo !== false && (!cajaChica || item?.aplica_caja_chica === true));
  const categoria = respuesta.categoria;
  const razon = respuesta.razon;
  const nombres = categoriasActivas.map(item => typeof item === 'string' ? item : item?.nombre).filter(Boolean);
  if (!tipo || typeof categoria !== 'string' || categoria !== tipo.categoria_er || !nombres.includes(categoria)) return null;
  if (typeof razon !== 'string' || !razon.trim() || razon.length > 300) return null;
  return { tipo_gasto_id: tipo.id, tipo_gasto: tipo.nombre, categoria, razon: razon.trim() };
}

export async function sugerirCategoriaEgreso({ empresaId, descripcion, tipoGasto, cajaChica = false, tiposActivos = [], categoriasActivas = [], cliente }) {
  const supabase = cliente || await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('sugerir-categoria-egreso', {
    body: crearPayloadSugerenciaCategoriaEgreso({ empresaId, descripcion, tipoGasto, cajaChica }),
  });
  if (error) {
    const err = new Error('No se pudo obtener una sugerencia.');
    err.status = error.context?.status || error.status || 0;
    throw err;
  }
  const validada = validarRespuestaSugerenciaCategoriaEgreso(data, tiposActivos, categoriasActivas, cajaChica);
  if (!validada) throw new Error('La sugerencia recibida no es válida.');
  return validada;
}
