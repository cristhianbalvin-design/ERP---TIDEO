import { getSupabaseClient } from '../lib/supabaseClient.js';

export const CONDICION_PAGO_DEFECTO_CXC = '30 días';

export const diasPorCondicion = {
  contado: 0,
  anticipado: 0,
  '15 días': 15,
  '30 días': 30,
  '45 días': 45,
  '60 días': 60,
  '90 días': 90,
};

const stripAccents = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normalizarCondicionPagoCxC = (condicion) => {
  const raw = String(condicion || '').trim();
  if (!raw) return null;

  const value = stripAccents(raw).toLowerCase();
  if (['por definir', 'sin condicion', 'sin condiciones', 'n/a', 'na', 'ninguna'].includes(value)) return null;
  if (value === '0' || value === 'contado') return 'contado';
  if (value.includes('anticip')) return 'anticipado';

  const dias = Number(value.match(/(\d+)/)?.[1] || NaN);
  if ([15, 30, 45, 60, 90].includes(dias)) return `${dias} días`;

  return null;
};

export const resolverCondicionPagoCxC = ({ condicionCliente, condicionFallback } = {}) => {
  const condicionNormalizada = normalizarCondicionPagoCxC(condicionCliente);
  const fallbackNormalizado = normalizarCondicionPagoCxC(condicionFallback) || CONDICION_PAGO_DEFECTO_CXC;
  const condicion_pago = condicionNormalizada || fallbackNormalizado;
  const dias = diasPorCondicion[condicion_pago] ?? diasPorCondicion[CONDICION_PAGO_DEFECTO_CXC];

  return {
    condicion_pago,
    dias,
    usoFallback: !condicionNormalizada,
  };
};

export const calcularFechaVencimientoCxC = (fechaEmision, condicionPago, condicionFallback = CONDICION_PAGO_DEFECTO_CXC) => {
  const base = fechaEmision || new Date().toISOString().split('T')[0];
  const { dias } = resolverCondicionPagoCxC({ condicionCliente: condicionPago, condicionFallback });
  const fecha = new Date(`${base}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return base;
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().split('T')[0];
};

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
    const insert = async (p) => supabase.from('valorizaciones').insert(p).select().single();
    let p = { ...payload };
    for (let i = 0; i < 8; i++) {
      const { data, error } = await insert(p);
      if (!error) return data;
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1] || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    const { data, error } = await insert(p);
    if (error) throw error;
    return data;
  },

  async actualizarValorizacion(id, updates) {
    const supabase = await getSupabaseClient();
    const updateFn = async (p) => supabase.from('valorizaciones').update(p).eq('id', id).select().single();
    let p = { ...updates };
    for (let i = 0; i < 8; i++) {
      const { data, error } = await updateFn(p);
      if (!error) return data;
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1] || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    const { data, error } = await updateFn(p);
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
    const insert = async (p) => supabase.from('facturas').insert(p).select().single();
    let p = { ...payload };
    let finalData = null;
    
    for (let i = 0; i < 8; i++) {
      const { data, error } = await insert(p);
      if (!error) { finalData = data; break; }
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1] || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    if (!finalData) {
      const { data, error } = await insert(p);
      if (error) throw error;
      finalData = data;
    }

    if (payload.valorizacion_id) {
      await supabase
        .from('valorizaciones')
        .update({ estado: 'facturada' })
        .eq('id', payload.valorizacion_id);
    }
    return finalData;
  },

  async actualizarFactura(id, updates) {
    const supabase = await getSupabaseClient();
    const updateFn = async (p) => supabase.from('facturas').update(p).eq('id', id).select().single();
    let p = { ...updates };
    for (let i = 0; i < 8; i++) {
      const { data, error } = await updateFn(p);
      if (!error) return data;
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1] || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    const { data, error } = await updateFn(p);
    if (error) throw error;
    return data;
  },

  async getCxC(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxc')
      .select(`*, cuentas(id, razon_social, nombre_comercial, condicion_pago, responsable_id, responsable_comercial, moneda), facturas(id, numero, moneda, os_cliente_id), os_clientes(id, numero, oportunidad_id, cuenta_id, moneda, responsable_comercial_id, responsable_comercial, monto_aprobado)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (!error) return data;

    console.warn('[finanzas] getCxC: fallback sin referencias comerciales extendidas', error?.message || error);
    const fallback = await supabase
      .from('cxc')
      .select(`*, cuentas(id, razon_social, nombre_comercial, condicion_pago), facturas(id, numero), os_clientes(id, numero)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (fallback.error) throw fallback.error;
    return fallback.data;
  },

  async getVentas(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getCuentasVentas(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cuentas')
      .select('id, nombre_comercial, razon_social, condicion_pago, moneda, estado')
      .eq('empresa_id', empresaId)
      .order('nombre_comercial', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async crearVenta(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ventas')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarEstadoVenta(id, estado) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ventas')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async generarCxC(payload) {
    const supabase = await getSupabaseClient();
    const {
      fecha_vencimiento_manual: fechaVencimientoManual,
      fecha_vencimiento_resuelta: fechaVencimientoResuelta,
      omitir_aviso_condicion_pago: _omitirAvisoCondicionPago,
      ...payloadDb
    } = payload || {};
    const insert = async (p) => supabase.from('cxc').insert(p).select().single();
    let p = { ...payloadDb };

    if (!fechaVencimientoManual && !fechaVencimientoResuelta && p.empresa_id && p.cuenta_id) {
      let condicionCliente = p.condicion_pago;
      let condicionFallback = CONDICION_PAGO_DEFECTO_CXC;

      const cuentaResult = await supabase
        .from('cuentas')
        .select('condicion_pago')
        .eq('empresa_id', p.empresa_id)
        .eq('id', p.cuenta_id)
        .maybeSingle();
      if (!cuentaResult.error && cuentaResult.data?.condicion_pago) {
        condicionCliente = cuentaResult.data.condicion_pago;
      }

      const configResult = await supabase
        .from('empresa_config')
        .select('*')
        .eq('empresa_id', p.empresa_id)
        .maybeSingle();
      if (!configResult.error && configResult.data?.condicion_pago_defecto) {
        condicionFallback = configResult.data.condicion_pago_defecto;
      }

      const resuelta = resolverCondicionPagoCxC({ condicionCliente, condicionFallback });
      p.condicion_pago = resuelta.condicion_pago;
      p.fecha_vencimiento = calcularFechaVencimientoCxC(p.fecha_emision, resuelta.condicion_pago, condicionFallback);
    } else if (!p.fecha_vencimiento) {
      p.fecha_vencimiento = calcularFechaVencimientoCxC(p.fecha_emision, p.condicion_pago);
    }

    for (let i = 0; i < 8; i++) {
      const { data, error } = await insert(p);
      if (!error) return data;
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1] || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    const { data, error } = await insert(p);
    if (error) throw error;
    return data;
  },

  async actualizarVencimientoCxC(id, fechaVencimiento) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxc')
      .update({ fecha_vencimiento: fechaVencimiento, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarCxC(id, updates) {
    const supabase = await getSupabaseClient();
    const updateFn = async (p) => supabase.from('cxc').update(p).eq('id', id).select().single();
    let p = { ...updates };
    for (let i = 0; i < 8; i++) {
      const { data, error } = await updateFn(p);
      if (!error) return data;
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1] || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    const { data, error } = await updateFn(p);
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
    const insert = async (p) => supabase.from('comisiones').insert(p).select().single();
    let p = { ...payload };
    for (let i = 0; i < 12; i++) {
      const { data, error } = await insert(p);
      if (!error) return data;
      const col = error.message?.match(/column "([^"]+)" of relation/)?.[1]
        || error.message?.match(/'([^']+)' column/)?.[1];
      if (!col || !(col in p)) throw error;
      delete p[col];
    }
    const { data, error } = await insert(p);
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

  async getCajaChica(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('caja_chica')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async insertarCajaChica(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('caja_chica')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async anularCajaChica(id, anuladoPor) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('caja_chica')
      .update({ estado: 'anulado', responsable_nombre: anuladoPor })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
