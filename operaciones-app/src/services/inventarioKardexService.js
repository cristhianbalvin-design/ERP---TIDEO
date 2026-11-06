import { getSupabaseClient } from '../lib/supabaseClient.js';

const aplicarSociedad = (consulta, { sociedadId, vistaConsolidada, sociedadesIdsAlcance } = {}) => {
  if (sociedadId && !vistaConsolidada) return consulta.eq('sociedad_id', sociedadId);
  if ((vistaConsolidada || !sociedadId) && Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
    return consulta.in('sociedad_id', sociedadesIdsAlcance);
  }
  return consulta;
};

const seleccionarKardex = (supabase, { empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, limiteKardex, materialId }) => {
  let consulta = supabase.from('kardex')
    .select('id,empresa_id,sociedad_id,material_id,almacen_id,ubicacion_id,tipo,motivo,cantidad,costo_unitario,costo_unitario_usd,moneda,saldo_cantidad,referencia_tipo,referencia_id,nro_documento,anulado,anulado_motivo,observacion,vencimiento,created_by,valorizacion_estado,precio_unitario_provisional,precio_unitario_real,created_at,fecha,lote,serie,materiales(id,codigo,descripcion,unidad,familia,moneda),almacenes(codigo,nombre)')
    .eq('empresa_id', empresaId);
  if (materialId) consulta = consulta.eq('material_id', materialId);
  consulta = consulta.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limiteKardex + 1);
  return aplicarSociedad(consulta, { sociedadId, vistaConsolidada, sociedadesIdsAlcance });
};

async function consultarKardexPorMaterial(opciones) {
  const { limiteKardex = 200 } = opciones;
  const supabase = getSupabaseClient();
  const consulta = seleccionarKardex(supabase, { ...opciones, limiteKardex });
  const { data, error } = await consulta;
  if (error) throw error;
  const movimientos = data || [];
  const kardexParcial = movimientos.length > limiteKardex;
  const kardex = movimientos.slice(0, limiteKardex);
  return { kardex, kardexParcial, limiteKardex };
}

export function cargarKardexPorMaterial({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, materialId, limiteKardex = 200 }) {
  return consultarKardexPorMaterial({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, materialId, limiteKardex });
}

export async function cargarInventarioKardex({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, limiteKardex = 200 }) {
  const supabase = getSupabaseClient();
  const [almacenesResultado, ubicacionesResultado] = await Promise.all([
    supabase.from('almacenes').select('id,empresa_id,codigo,nombre,estado').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre'),
    supabase.from('ubicaciones').select('id,empresa_id,almacen_id,codigo,nombre,uso,propietario_cuenta_id').eq('empresa_id', empresaId),
  ]);
  if (almacenesResultado.error) throw almacenesResultado.error;
  if (ubicacionesResultado.error) throw ubicacionesResultado.error;

  const stock = [];
  for (let inicio = 0; ; inicio += 1000) {
    let consulta = supabase.from('stock')
      .select('id,empresa_id,sociedad_id,material_id,almacen_id,ubicacion_id,lote,serie,vencimiento,fisico,disponible,reservado,materiales(id,codigo,descripcion,unidad,familia,costo_promedio,costo_promedio_usd,moneda,stock_minimo,punto_reorden,stock_seguridad,tipo_control),almacenes(id,codigo,nombre)')
      .eq('empresa_id', empresaId).order('material_id').range(inicio, inicio + 999);
    consulta = aplicarSociedad(consulta, { sociedadId, vistaConsolidada, sociedadesIdsAlcance });
    const { data, error } = await consulta;
    if (error) throw error;
    const pagina = data || [];
    stock.push(...pagina);
    if (pagina.length < 1000) break;
  }

  const ubicacionesPorId = new Map((ubicacionesResultado.data || []).map(fila => [fila.id, fila]));
  const stockConUbicacion = stock.map(fila => ({ ...fila, ubicaciones: ubicacionesPorId.get(fila.ubicacion_id) || null }));

  const consultaKardex = seleccionarKardex(supabase, { empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, limiteKardex });
  const { data: filasKardex, error: errorKardex } = await consultaKardex;
  if (errorKardex) throw errorKardex;
  const movimientos = filasKardex || [];
  const kardexParcial = movimientos.length > limiteKardex;
  const kardex = movimientos.slice(0, limiteKardex).map(fila => ({ ...fila, ubicaciones: ubicacionesPorId.get(fila.ubicacion_id) || null }));
  return { almacenes: almacenesResultado.data || [], ubicaciones: ubicacionesResultado.data || [], stock: stockConUbicacion, kardex, kardexParcial, limiteKardex };
}
