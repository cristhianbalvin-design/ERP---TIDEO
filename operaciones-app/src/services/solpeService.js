import { getSupabaseClient } from '../lib/supabaseClient.js';

const makeId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

// Mantiene el mismo contrato de persistencia que crearSOLPE del Admin.
export async function crearSolpeInterna({ empresaId, usuarioId, datos }) {
  const codigo = `SLP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const payload = {
    id: makeId('slp'),
    empresa_id: empresaId,
    codigo,
    descripcion: datos.descripcion || '',
    tipo: datos.tipo || 'bien',
    prioridad: datos.prioridad || 'normal',
    urgencia: datos.urgencia || datos.prioridad || 'normal',
    centro_costo_id: datos.centro_costo_id || null,
    origen: 'manual',
    material_id: null,
    cantidad_solicitada: null,
    items: datos.items || [],
    solicitante: datos.solicitante || null,
    ot_id: datos.ot_id || null,
    estado: 'solicitada',
    creado_por: usuarioId || null,
  };
  const { data, error } = await getSupabaseClient().from('solpe_interna').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function crearMaterialDesdeSolpe({ empresaId, usuarioId, datos }) {
  const supabase = getSupabaseClient();
  const { data: codigo, error: codigoError } = await supabase.rpc('generar_codigo_material', {
    p_subfamilia_id: datos.subfamilia_id,
    p_empresa_id: empresaId,
  });
  if (codigoError) throw codigoError;
  if (!codigo) throw new Error('No se pudo generar el código automático del material.');

  const payload = {
    id: makeId('mat'),
    empresa_id: empresaId,
    codigo,
    descripcion: String(datos.descripcion || '').trim(),
    unidad: String(datos.unidad || '').trim() || null,
    grupo_id: datos.grupo_id || null,
    familia_id: datos.familia_id || null,
    subfamilia_id: datos.subfamilia_id || null,
    nro_parte: String(datos.nro_parte || '').trim() || null,
    unidades_contenidas: Number(datos.unidades_contenidas) || 1,
    almacen_id: datos.almacen_id || null,
    ubicacion: String(datos.ubicacion || '').trim() || null,
    observacion: String(datos.observacion || '').trim() || null,
    precio_unitario: Number(datos.precio_unitario) || 0,
    stock_minimo: Number(datos.stock_minimo) || 0,
    punto_reorden: Number(datos.punto_reorden) || 0,
    stock_maximo: Number(datos.stock_maximo) || 0,
    stock_seguridad: Number(datos.stock_seguridad) || 0,
    estado: 'activo',
    creado_por: usuarioId || null,
  };
  const { data, error } = await supabase.from('materiales').insert([payload]).select().single();
  if (error) throw error;
  return data;
}
