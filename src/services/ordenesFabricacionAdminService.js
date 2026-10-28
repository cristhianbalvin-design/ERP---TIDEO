import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

// Órdenes de Fabricación de una OS (solo lectura) para la ficha de la OS en el admin.
export async function listarOFDeOS(osId) {
  if (!osId || !isSupabaseConfigured()) return [];
  const sb = await getSupabaseClient();
  const { data, error } = await sb.from('ordenes_fabricacion')
    .select('id,numero,estado,descripcion,fecha_compromiso,moneda,costo_estimado,costo_real,avance_pct')
    .eq('os_cliente_id', osId)
    .order('numero');
  if (error) throw error;
  return data || [];
}

export const ETIQUETA_ESTADO_OF = {
  borrador: 'Borrador',
  en_ingenieria: 'En ingeniería',
  aprobada: 'Aprobada',
  en_produccion: 'En producción',
  en_calidad: 'En calidad',
  lista_entrega: 'Lista para entrega',
  entregada: 'Entregada',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
};

export function urlOperaciones(ruta, params = {}) {
  const base = (import.meta.env?.VITE_OPERATIONS_APP_URL || '/operaciones/').replace(/\/?$/, '/');
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `${base}#/${ruta}${query ? `?${query}` : ''}`;
}
