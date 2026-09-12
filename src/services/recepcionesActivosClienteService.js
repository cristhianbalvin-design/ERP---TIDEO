import { getSupabaseClient } from '../lib/supabaseClient.js';

const nextNumero = async (supabase, empresaId) => {
  const year = new Date().getFullYear();
  const prefix = `RAC-${year}-`;
  const { data, error } = await supabase
    .from('recepciones_activos_cliente')
    .select('numero')
    .eq('empresa_id', empresaId)
    .like('numero', `${prefix}%`);
  if (error) throw error;
  const maximo = (data || []).reduce((max, row) => {
    const numero = Number(String(row.numero || '').slice(prefix.length));
    return Number.isFinite(numero) ? Math.max(max, numero) : max;
  }, 0);
  return `${prefix}${String(maximo + 1).padStart(4, '0')}`;
};

export const listarRecepcionesActivosCliente = async (empresaId, { pendientes = false } = {}) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('recepciones_activos_cliente')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_ingreso', { ascending: false })
    .order('created_at', { ascending: false });
  if (pendientes) query = query.eq('estado', 'pendiente_cotizar');
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const obtenerRecepcionActivoCliente = async (empresaId, recepcionId) => {
  if (!empresaId || !recepcionId) return null;
  const supabase = await getSupabaseClient();
  const { data: recepcion, error: recepcionError } = await supabase
    .from('recepciones_activos_cliente')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', recepcionId)
    .maybeSingle();
  if (recepcionError) throw recepcionError;
  if (!recepcion) return null;
  const { data: activo, error: activoError } = await supabase
    .from('activos')
    .select('id,empresa_id,codigo,nombre,marca,modelo,placa_serie,estado,cliente_propietario_id')
    .eq('empresa_id', empresaId)
    .eq('id', recepcion.activo_id)
    .maybeSingle();
  if (activoError) throw activoError;
  return { ...recepcion, activo: activo || null };
};

export const crearRecepcionActivoCliente = async (empresaId, datos) => {
  const supabase = await getSupabaseClient();
  let ultimoError = null;
  for (let intento = 0; intento < 3; intento += 1) {
    const numero = await nextNumero(supabase, empresaId);
    const { data, error } = await supabase
      .from('recepciones_activos_cliente')
      .insert({
        empresa_id: empresaId,
        numero,
        activo_id: datos.activo_id,
        fecha_ingreso: datos.fecha_ingreso,
        hora_ingreso: datos.hora_ingreso || null,
        guia_ingreso: datos.guia_ingreso?.trim() || null,
        estado: 'pendiente_cotizar',
        observaciones: datos.observaciones?.trim() || null,
        sociedad_id: datos.sociedad_id || null,
      })
      .select()
      .single();
    if (!error) return data;
    ultimoError = error;
    if (error.code !== '23505') break;
  }
  throw ultimoError || new Error('No se pudo generar el número de recepción.');
};

export const devolverRecepcionActivoCliente = async (empresaId, recepcionId, datos) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('recepciones_activos_cliente')
    .update({
      estado: 'devuelto_sin_cotizar',
      fecha_devolucion: datos.fecha_devolucion,
      guia_devolucion: datos.guia_devolucion?.trim() || null,
    })
    .eq('empresa_id', empresaId)
    .eq('id', recepcionId)
    .eq('estado', 'pendiente_cotizar')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La recepción ya no está pendiente de cotizar; no puede devolverse desde este flujo.');
  return data;
};

export const marcarRecepcionActivoClienteCotizada = async (empresaId, recepcionId) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('recepciones_activos_cliente')
    .update({ estado: 'cotizado' })
    .eq('empresa_id', empresaId)
    .eq('id', recepcionId)
    .eq('estado', 'pendiente_cotizar')
    .select('id,estado')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La recepción ya no está pendiente de cotizar; no se creó la cotización vinculada.');
  return data;
};
