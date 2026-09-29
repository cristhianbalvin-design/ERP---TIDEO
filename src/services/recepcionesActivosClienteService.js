import { getSupabaseClient } from '../lib/supabaseClient.js';

const obtenerLecturaOpcional = datos => {
  if (datos?.lectura_valor === undefined || datos?.lectura_valor === null || String(datos.lectura_valor).trim() === '') return null;
  const valor = Number(datos.lectura_valor);
  if (!Number.isFinite(valor) || valor < 0) throw new Error('La lectura de ingreso debe ser un número no negativo.');
  const unidad = datos.lectura_unidad || 'horas';
  if (!['horas', 'km'].includes(unidad)) throw new Error('La unidad de lectura de ingreso no es válida.');
  return { valor, unidad };
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
  const lectura = obtenerLecturaOpcional(datos);
  const { data: activo, error: activoError } = await supabase
    .from('activos')
    .select('id,cliente_propietario_id')
    .eq('empresa_id', empresaId)
    .eq('id', datos.activo_id)
    .eq('propietario_tipo', 'cliente')
    .maybeSingle();
  if (activoError) throw activoError;
  if (!activo?.cliente_propietario_id) throw new Error('El activo no tiene un cliente propietario válido.');
  const { data: numeroCaso, error: numeroCasoError } = await supabase.rpc('abrir_o_heredar_numero_caso', {
    p_empresa_id: empresaId,
    p_padre_id: null,
    p_padre_tabla: null,
    p_cuenta_id: activo.cliente_propietario_id,
  });
  if (numeroCasoError) throw numeroCasoError;
  if (numeroCaso === null || numeroCaso === undefined) throw new Error('No se pudo abrir el número de caso para la recepción.');
  const numero = `RAC-${new Date().getFullYear()}-${String(numeroCaso).padStart(5, '0')}`;
  let ultimoError = null;
  for (let intento = 0; intento < 3; intento += 1) {
    const { data, error } = await supabase
      .from('recepciones_activos_cliente')
      .insert({
        empresa_id: empresaId,
        numero,
        numero_caso: numeroCaso,
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
    if (!error) {
      if (lectura) {
        const { error: lecturaError } = await supabase.rpc('registrar_lectura_activo', {
          p_empresa_id: empresaId,
          p_activo_id: datos.activo_id,
          p_valor: lectura.valor,
          p_unidad: lectura.unidad,
          p_origen: 'ingreso_recepcion',
          p_origen_id: data.id,
        });
        if (lecturaError) throw lecturaError;
      }
      return data;
    }
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
  const { data, error } = await supabase.rpc('marcar_recepcion_activo_cliente_cotizada', {
    p_empresa_id: empresaId,
    p_recepcion_id: recepcionId,
  });
  if (error) throw error;
  if (!data) throw new Error('La recepción ya no está pendiente de cotizar; no se creó la cotización vinculada.');
  return Array.isArray(data) ? data[0] : data;
};
