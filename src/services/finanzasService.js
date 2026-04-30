import { getSupabaseClient } from '../lib/supabaseClient.js';

export const finanzasService = {
  async getValorizaciones(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('valorizaciones')
      .select(`*, os_clientes(id, numero, cuenta_id)`)
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return data;
  },

  async crearValorizacion(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('valorizaciones')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getFacturas(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('facturas')
      .select(`*, cuentas(id, razon_social), valorizaciones(id, numero)`)
      .eq('empresa_id', empresaId)
      .order('fecha_emision', { ascending: false });
    if (error) throw error;
    return data;
  },

  async emitirFactura(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('facturas')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    if (payload.valorizacion_id) {
      await supabase
        .from('valorizaciones')
        .update({ estado: 'facturada' })
        .eq('id', payload.valorizacion_id);
    }
    return data;
  },

  async getCxC(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxc')
      .select(`*, cuentas(id, razon_social), facturas(id, numero)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (error) throw error;
    return data;
  },

  async generarCxC(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxc')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async registrarCobroCxC(cxcId, monto) {
    const supabase = await getSupabaseClient();
    const { data: currentCxC, error: getError } = await supabase
      .from('cxc')
      .select('*')
      .eq('id', cxcId)
      .single();
    if (getError) throw getError;

    const nuevoMontoPagado = Number(currentCxC.monto_pagado) + Number(monto);
    const nuevoSaldo = Number(currentCxC.monto_total) - nuevoMontoPagado;
    const nuevoEstado = nuevoSaldo <= 0 ? 'cobrada' : 'cobro_parcial';

    const { data, error } = await supabase
      .from('cxc')
      .update({ monto_pagado: nuevoMontoPagado, saldo: nuevoSaldo, estado: nuevoEstado })
      .eq('id', cxcId)
      .select()
      .single();
    if (error) throw error;

    if (nuevoEstado === 'cobrada') {
      await supabase
        .from('facturas')
        .update({ estado: 'pagada' })
        .eq('id', currentCxC.factura_id);
    }
    return data;
  },

  async registrarMovimientoTesoreria(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_tesoreria')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getCxP(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxp')
      .select(`*, proveedores(id, razon_social)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (error) throw error;
    return data;
  },

  async generarCxP(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxp')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async registrarPagoCxP(cxpId, monto) {
    const supabase = await getSupabaseClient();
    const { data: currentCxP, error: getError } = await supabase
      .from('cxp')
      .select('*')
      .eq('id', cxpId)
      .single();
    if (getError) throw getError;

    const nuevoMontoPagado = Number(currentCxP.monto_pagado) + Number(monto);
    const nuevoSaldo = Number(currentCxP.monto_total) - nuevoMontoPagado;
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'pago_parcial';

    const { data, error } = await supabase
      .from('cxp')
      .update({ monto_pagado: nuevoMontoPagado, saldo: nuevoSaldo, estado: nuevoEstado })
      .eq('id', cxpId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getMovimientosBanco(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_banco')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return data;
  },

  async conciliarMovimiento(movimientoId, vinculadoTipo, vinculadoId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_banco')
      .update({ conciliado: true, vinculado_tipo: vinculadoTipo, vinculado_id: vinculadoId })
      .eq('id', movimientoId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
