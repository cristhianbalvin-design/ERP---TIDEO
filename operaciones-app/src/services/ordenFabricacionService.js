import { getSupabaseClient } from '../lib/supabaseClient.js';

const COLUMNAS_BANDEJA = [
  'id,numero,estado,descripcion,fecha_apertura,fecha_compromiso,moneda,costo_estimado,costo_real,avance_pct,sociedad_id,',
  'os:os_clientes(id,numero,nombre),',
  'cuenta:cuentas(id,razon_social,nombre_comercial),',
  'activo:activos(id,codigo,nombre),',
  'operaciones:of_operaciones(id,bahia_id)',
].join('');

function filtrarSociedad(query, sociedadId, sociedadesIdsAlcance) {
  if (sociedadId) return query.eq('sociedad_id', sociedadId);
  if (Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
    return query.in('sociedad_id', sociedadesIdsAlcance);
  }
  return query;
}

export function normalizarFilaBandejaOF(fila) {
  const operaciones = fila.operaciones || [];
  const activo = fila.activo;
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    descripcion: fila.descripcion || '',
    fecha_apertura: fila.fecha_apertura,
    fecha_compromiso: fila.fecha_compromiso,
    moneda: fila.moneda || 'PEN',
    costo_estimado: Number(fila.costo_estimado) || 0,
    costo_real: Number(fila.costo_real) || 0,
    avance_pct: Math.max(0, Math.min(100, Number(fila.avance_pct) || 0)),
    os_id: fila.os?.id || null,
    os_numero: fila.os?.numero || '',
    cliente: fila.cuenta?.nombre_comercial || fila.cuenta?.razon_social || '',
    componente: activo ? [activo.codigo, activo.nombre].filter(Boolean).join(' · ') : (fila.descripcion || ''),
    operaciones_total: operaciones.length,
    operaciones_sin_bahia: operaciones.filter(op => !op.bahia_id).length,
  };
}

// Todas las OF de la empresa (y de la sociedad o alcance activo), de la más reciente a la más antigua.
export async function listarOrdenesFabricacion({ empresaId, sociedadId, sociedadesIdsAlcance }) {
  if (!empresaId) return [];
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    let query = getSupabaseClient().from('ordenes_fabricacion')
      .select(COLUMNAS_BANDEJA)
      .eq('empresa_id', empresaId);
    query = filtrarSociedad(query, sociedadId, sociedadesIdsAlcance)
      .order('fecha_apertura', { ascending: false })
      .order('numero', { ascending: false })
      .range(desde, desde + 999);
    const { data, error } = await query;
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas.map(normalizarFilaBandejaOF);
}
