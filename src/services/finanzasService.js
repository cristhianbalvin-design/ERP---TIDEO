import { getSupabaseClient } from '../lib/supabaseClient.js';

export const finanzasService = {
  async getValorizaciones(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('valorizaciones')
      .select(`*, os_clientes(id, numero, cuenta_id)`)
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (!error) return data;

    console.warn('[finanzas] getValorizaciones: fallback sin relacion os_clientes', error?.message || error);
    const fallback = await supabase
      .from('valorizaciones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (fallback.error) throw fallback.error;
    return fallback.data;
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

  async actualizarValorizacion(id, updates) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('valorizaciones')
      .update(updates)
      .eq('id', id)
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
      .select(`*, cuentas(id, razon_social), facturas(id, numero), os_clientes(id, numero)`)
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

  async getCobrosHistorial(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cobros_cxc')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data;
  },

  async registrarCobroDetalle(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cobros_cxc')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getGestionesCobranza(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('gestion_cobranza')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data;
  },

  async registrarGestion(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('gestion_cobranza')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getCuentasBancarias(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cuentas_bancarias')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return data;
  },

  async crearCuentaBancaria(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cuentas_bancarias')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarCuentaBancaria(id, updates) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cuentas_bancarias')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarCuentaBancaria(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('cuentas_bancarias')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getComisiones(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('comisiones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data;
  },

  async actualizarComision(id, updates) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('comisiones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async registrarComision(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('comisiones')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async crearReciboHonorarios(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('recibos_honorarios')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getRecibosHonorarios(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('recibos_honorarios')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });
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
      .select(`*, proveedores(id, razon_social), personal_administrativo(id, nombre)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getCxpPagos(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxp_pagos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_pago', { ascending: false });
    if (error) throw error;
    return data;
  },

  async insertarCxpPago(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxp_pagos')
      .insert(payload)
      .select()
      .single();
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
