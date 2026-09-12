import { getSupabaseClient } from '../lib/supabaseClient.js';

// Fuente única para decidir si un tenant puede ofrecer Cotización Especial.
export const listarPlantillasCotizacionPublicadas = async empresaId => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('plantillas_documento_bloques')
    .select('id,nombre_interno,version,tipo_documento_id,sociedad_id,tipos_documento_electronico!inner(id,nombre,codigo,categoria_base,motor_contenido)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'publicada')
    .eq('tipos_documento_electronico.categoria_base', 'cotizacion')
    .order('nombre_interno');
  if (error) throw error;
  return (data || []).map(plantilla => ({
    ...plantilla,
    tipo_documento: plantilla.tipos_documento_electronico,
    etiqueta: plantilla.nombre_interno || plantilla.tipos_documento_electronico?.nombre || 'Plantilla de cotización',
  }));
};
