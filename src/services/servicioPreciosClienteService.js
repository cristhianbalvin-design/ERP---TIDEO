import { getSupabaseClient } from '../lib/supabaseClient.js';

const makeId = () => {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `spc_${String(random).replace(/-/g, '').slice(0, 18)}`;
};

const payloadFrom = (empresaId, value = {}) => ({
  id: value.id || makeId(),
  empresa_id: empresaId,
  servicio_id: value.servicio_id,
  cuenta_id: value.cuenta_id,
  precio: Number(value.precio),
  moneda: value.moneda,
  fecha_inicio: value.fecha_inicio || null,
  fecha_fin: value.fecha_fin || null,
  activo: value.activo ?? true,
});

const translateError = error => {
  if (!error) return error;
  if (error.code === '23P01') {
    return new Error('Ya existe un precio activo con vigencia superpuesta para este servicio y cliente. Corrige o desactiva el precio anterior.');
  }
  if (String(error.message || '').includes('SERVICIO_PRECIO_CLIENTE_SERVICIO_TENANT_INVALIDO')) {
    return new Error('El servicio no pertenece al tenant actual.');
  }
  if (String(error.message || '').includes('SERVICIO_PRECIO_CLIENTE_CUENTA_TENANT_INVALIDO')) {
    return new Error('El cliente no pertenece al tenant actual.');
  }
  return error;
};

export const servicioPreciosClienteService = {
  async listarPorCuenta(empresaId, cuentaId) {
    if (!empresaId || !cuentaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('servicio_precios_cliente')
      .select('*, servicios(id, codigo, descripcion, moneda, precio)')
      .eq('empresa_id', empresaId)
      .eq('cuenta_id', cuentaId)
      .order('activo', { ascending: false })
      .order('fecha_inicio', { ascending: false, nullsFirst: true });
    if (error) throw translateError(error);
    return data || [];
  },

  async crear(empresaId, value) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('servicio_precios_cliente')
      .insert(payloadFrom(empresaId, value))
      .select('*, servicios(id, codigo, descripcion, moneda, precio)')
      .single();
    if (error) throw translateError(error);
    return data;
  },

  async actualizar(id, value) {
    const supabase = await getSupabaseClient();
    const payload = {
      servicio_id: value.servicio_id,
      precio: Number(value.precio),
      moneda: value.moneda,
      fecha_inicio: value.fecha_inicio || null,
      fecha_fin: value.fecha_fin || null,
      activo: Boolean(value.activo),
    };
    const { data, error } = await supabase
      .from('servicio_precios_cliente')
      .update(payload)
      .eq('id', id)
      .select('*, servicios(id, codigo, descripcion, moneda, precio)')
      .single();
    if (error) throw translateError(error);
    return data;
  },

  async resolver(empresaId, cuentaId, servicioId, fecha) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('resolver_precio_servicio_cliente', {
      p_empresa_id: empresaId,
      p_cuenta_id: cuentaId,
      p_servicio_id: servicioId,
      p_fecha: fecha,
    });
    if (error) throw translateError(error);
    return data?.[0] || null;
  },
};
