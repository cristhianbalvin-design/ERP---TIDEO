import { getSupabaseClient } from '../lib/supabaseClient.js';
import { hoyLima } from '../lib/transporteLogistica.js';

export const hoyPeru = hoyLima;

export async function listarSpotCatalogoVigente(fecha = hoyPeru()) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('spot_catalogo')
    .select('id,codigo,descripcion,anexo,porcentaje,monto_minimo,umbral_operador,vigencia_desde,vigencia_hasta')
    .lte('vigencia_desde', fecha)
    .or(`vigencia_hasta.is.null,vigencia_hasta.gte.${fecha}`)
    .order('codigo');
  if (error) throw error;
  return data || [];
}

export const spotLabel = spot => spot
  ? `${spot.codigo} · ${spot.descripcion || 'Sin descripción'} · ${Number(spot.porcentaje || 0).toFixed(2)}%`
  : 'Sin detracción';
