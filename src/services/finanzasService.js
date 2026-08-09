import { getSupabaseClient } from '../lib/supabaseClient.js';
import { validarSociedadActivaParaEscritura } from './sociedadEscrituraService.js';

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

const numeroFin = value => Number(value || 0);
const redondear2 = value => Math.round(numeroFin(value) * 100) / 100;

const sumarCampoHoras = (rows, field = 'horas') =>
  (rows || []).reduce((sum, row) => sum + numeroFin(row?.[field] ?? row?.horas), 0);

const horasParteAprobado = parte => numeroFin(parte?.horas ?? parte?.horas_normales ?? parte?.horas_total);
const personaIdParte = parte => parte?.tecnico_id || parte?.personal_id || parte?.tecnico;

const queryRows = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const montoNetoCobrableCxC = cxc => {
  const netoSnapshot = numeroFin(cxc?.monto_neto_cobrable || cxc?.facturas?.monto_neto_cobrable);
  if (netoSnapshot > 0) return netoSnapshot;
  const total = numeroFin(cxc?.monto_total ?? cxc?.total);
  const retencion = numeroFin(cxc?.monto_retencion);
  return Math.max(0, total - retencion);
};

const saldoNetoCxC = cxc => {
  const estadoOriginal = String(cxc?.estado || '').toLowerCase();
  if (['anulada', 'cancelada'].includes(estadoOriginal)) return 0;
  if (cxc?.saldo != null) return Math.max(0, numeroFin(cxc.saldo));
  const netoSnapshot = numeroFin(cxc?.monto_neto_cobrable || cxc?.facturas?.monto_neto_cobrable);
  if (netoSnapshot > 0) return Math.max(0, netoSnapshot - numeroFin(cxc?.monto_pagado ?? cxc?.pagado));
  return Math.max(0, montoNetoCobrableCxC(cxc) - numeroFin(cxc?.monto_pagado ?? cxc?.pagado));
};

const normalizarCxC = cxc => {
  const montoNeto = montoNetoCobrableCxC(cxc);
  const saldoNeto = saldoNetoCxC(cxc);
  const pagado = numeroFin(cxc?.monto_pagado ?? cxc?.pagado);
  const estadoOriginal = String(cxc?.estado || '').toLowerCase();
  const estado = ['anulada', 'cancelada'].includes(estadoOriginal)
    ? estadoOriginal
    : (montoNeto > 0 && pagado >= montoNeto) || saldoNeto <= 0
      ? 'cobrada'
      : cxc?.estado;
  return {
    ...cxc,
    monto_neto_cobrable: montoNeto,
    saldo_neto_cobranza: saldoNeto,
    saldo: saldoNeto,
    estado,
  };
};

const movimientoEsCobroFactura = movimiento => {
  const tipo = String(movimiento?.tipo || '').toLowerCase();
  const vinculoTipo = String(movimiento?.vinculo_tipo || movimiento?.vinculado_tipo || '').toLowerCase();
  return tipo === 'ingreso' && (vinculoTipo === 'cxc' || movimiento?.cxc_id || movimiento?.factura_id);
};

const descripcionCobroUsaIdInterno = descripcion => {
  const value = String(descripcion || '').trim();
  return !value || /^cobro\s+(fac_|cxc_|[0-9a-f]{6,})/i.test(value);
};

const obtenerOrigenCobroMovimiento = async (supabase, movimiento = {}) => {
  const vinculoTipo = String(movimiento?.vinculo_tipo || movimiento?.vinculado_tipo || '').toLowerCase();
  const cxcId = movimiento?.cxc_id || (vinculoTipo === 'cxc' ? (movimiento?.vinculo_id || movimiento?.vinculado_id) : null);
  const facturaIdDirecto = movimiento?.factura_id || (vinculoTipo === 'factura' ? (movimiento?.vinculo_id || movimiento?.vinculado_id) : null);
  let cxc = null;
  let factura = null;

  if (cxcId) {
    const withRelation = await supabase
      .from('cxc')
      .select('id, moneda, factura_id, facturas(id, numero, moneda)')
      .eq('id', cxcId)
      .maybeSingle();
    if (!withRelation.error) {
      cxc = withRelation.data || null;
      factura = cxc?.facturas || null;
    } else {
      const fallback = await supabase
        .from('cxc')
        .select('id, moneda, factura_id')
        .eq('id', cxcId)
        .maybeSingle();
      if (!fallback.error) cxc = fallback.data || null;
    }
  }

  const facturaId = factura?.id || cxc?.factura_id || facturaIdDirecto;
  if (!factura && facturaId) {
    const facturaResult = await supabase
      .from('facturas')
      .select('id, numero, moneda')
      .eq('id', facturaId)
      .maybeSingle();
    if (!facturaResult.error) factura = facturaResult.data || null;
  }

  return { cxc, factura };
};

const normalizarMovimientoTesoreriaCobro = async (supabase, movimiento = {}) => {
  if (!movimientoEsCobroFactura(movimiento)) return movimiento;
  const { cxc, factura } = await obtenerOrigenCobroMovimiento(supabase, movimiento);
  const numeroFactura = factura?.numero || null;
  const monedaOrigen = cxc?.moneda || factura?.moneda || movimiento?.moneda || 'PEN';
  const descripcion = descripcionCobroUsaIdInterno(movimiento?.descripcion)
    ? `Cobro ${numeroFactura || 'factura'}`
    : movimiento.descripcion;
  return {
    ...movimiento,
    descripcion,
    moneda: monedaOrigen,
  };
};

const missingColumnFromError = error =>
  error?.message?.match(/column "([^"]+)" of relation/)?.[1]
  || error?.message?.match(/'([^']+)' column/)?.[1]
  || null;

const insertOneTolerante = async (supabase, table, payload) => {
  let p = { ...payload };
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase.from(table).insert(p).select().single();
    if (!error) return data;
    const col = missingColumnFromError(error);
    if (!col || !(col in p)) throw error;
    delete p[col];
  }
  const { data, error } = await supabase.from(table).insert(p).select().single();
  if (error) throw error;
  return data;
};

const updateOneTolerante = async (supabase, table, id, payload) => {
  let p = { ...payload };
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase.from(table).update(p).eq('id', id).select().single();
    if (!error) return data;
    const col = missingColumnFromError(error);
    if (!col || !(col in p)) throw error;
    delete p[col];
  }
  const { data, error } = await supabase.from(table).update(p).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const finanzasService = {
  async getReferenciaRheInterno({ empresaId, personalId, periodoInicio, periodoFin }) {
    if (!empresaId || !personalId || !periodoInicio || !periodoFin) {
      return {
        horasPartes: 0,
        horasTareos: 0,
        horasTotal: 0,
        existeRhePeriodo: false,
      };
    }

    const supabase = await getSupabaseClient();
    const [partesPeriodo, tareos, cxpRhe, recibos] = await Promise.all([
      queryRows(
        supabase
          .from('partes_diarios')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('estado', 'aprobado')
          .gte('fecha', periodoInicio)
          .lte('fecha', periodoFin)
      ),
      queryRows(
        supabase
          .from('tareos_admin')
          .select('id, fecha, personal_id, horas, estado')
          .eq('empresa_id', empresaId)
          .eq('personal_id', personalId)
          .eq('estado', 'enviado')
          .gte('fecha', periodoInicio)
          .lte('fecha', periodoFin)
      ),
      queryRows(
        supabase
          .from('cxp')
          .select('id, fecha_emision, fecha_vencimiento, tipo_comprobante, personal_id')
          .eq('empresa_id', empresaId)
          .eq('personal_id', personalId)
          .eq('tipo_comprobante', 'RHE')
          .lte('fecha_emision', periodoFin)
          .gte('fecha_vencimiento', periodoInicio)
      ).catch(err => {
        console.warn('[RHE referencia] cxp duplicado:', err.message);
        return [];
      }),
      queryRows(
        supabase
          .from('recibos_honorarios')
          .select('id, personal_id, periodo')
          .eq('empresa_id', empresaId)
          .eq('personal_id', personalId)
          .gte('periodo', periodoInicio.slice(0, 7))
          .lte('periodo', periodoFin.slice(0, 7))
      ).catch(err => {
        console.warn('[RHE referencia] recibos_honorarios:', err.message);
        return [];
      }),
    ]);

    const partes = partesPeriodo.filter(parte => personaIdParte(parte) === personalId);
    const horasPartes = redondear2(partes.reduce((sum, parte) => sum + horasParteAprobado(parte), 0));
    const horasTareos = redondear2(sumarCampoHoras(tareos, 'horas'));
    const horasTotal = redondear2(horasPartes + horasTareos);

    return {
      horasPartes,
      horasTareos,
      horasTotal,
      existeRhePeriodo: cxpRhe.length > 0 || recibos.length > 0,
    };
  },

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
      .select(`*, cuentas(id, razon_social, nombre_comercial, condicion_pago, responsable_id, responsable_comercial, moneda), facturas(id, numero, moneda, os_cliente_id, monto_neto_cobrable), os_clientes(id, numero, oportunidad_id, cuenta_id, moneda, responsable_comercial_id, responsable_comercial, monto_aprobado)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (!error) return (data || []).map(normalizarCxC);

    console.warn('[finanzas] getCxC: fallback sin referencias comerciales extendidas', error?.message || error);
    const fallback = await supabase
      .from('cxc')
      .select(`*, cuentas(id, razon_social, nombre_comercial, condicion_pago), facturas(id, numero), os_clientes(id, numero)`)
      .eq('empresa_id', empresaId)
      .order('fecha_vencimiento', { ascending: true });
    if (fallback.error) throw fallback.error;
    return (fallback.data || []).map(normalizarCxC);
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

  // ── Registrar Venta (pre-facturación) ────────────────────────────────────
  // Inserta la venta en estado borrador o confirmada.
  // NO genera CxC ni factura — eso ocurre al emitir el comprobante.
  async registrarVenta({ empresaId, usuarioId, datos }) {
    const supabase = await getSupabaseClient();

    const esCredito = datos.condicion_pago === 'credito';
    const estadoSeguro = ['borrador', 'confirmada'].includes(datos.estado) ? datos.estado : 'borrador';

    const ventaPayload = {
      empresa_id: empresaId,
      fecha: datos.fecha,
      cuenta_id: datos.cuenta_id || null,
      cliente_nombre_snapshot: datos.cliente_nombre_snapshot,
      concepto: datos.concepto,
      monto_total: Number(datos.monto_total),
      moneda: datos.moneda || 'PEN',
      estado: estadoSeguro,
      condicion_pago: datos.condicion_pago || 'contado',
      dias_credito: esCredito ? (Number(datos.dias_credito) || 30) : null,
      fecha_vencimiento_pago: esCredito ? (datos.fecha_vencimiento_pago || null) : null,
      creado_por: usuarioId || null,
    };

    const { data: venta, error } = await supabase
      .from('ventas')
      .insert(ventaPayload)
      .select()
      .single();
    if (error) throw error;
    return venta;
  },

  // ── Confirmar Venta (cerrar ciclo al emitir comprobante) ─────────────────
  // Llamada desde Facturación al confirmar la emisión.
  async confirmarVenta(ventaId, facturaId, cxcId = null) {
    const supabase = await getSupabaseClient();
    const updates = {
      estado: 'facturada',
      factura_id: facturaId,
      ...(cxcId ? { cxc_id: cxcId } : {}),
    };
    const { data, error } = await supabase
      .from('ventas')
      .update(updates)
      .eq('id', ventaId)
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
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      payload?.empresa_id,
      payload?.sociedad_id,
      'La sociedad es obligatoria para crear la cuenta bancaria.',
    );
    const { data, error } = await supabase
      .from('cuentas_bancarias')
      .insert({ ...payload, sociedad_id: sociedadId })
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

    const montoNeto = montoNetoCobrableCxC(currentCxC);
    const nuevoMontoPagado = Number(currentCxC.monto_pagado || 0) + Number(monto);
    const nuevoSaldo = Math.max(0, montoNeto - nuevoMontoPagado);
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
    return normalizarCxC(data);
  },

  async registrarMovimientoTesoreria(payload) {
    const supabase = await getSupabaseClient();
    const movimiento = await normalizarMovimientoTesoreriaCobro(supabase, payload);
    const { data, error } = await supabase
      .from('movimientos_tesoreria')
      .insert(movimiento)
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
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      payload?.empresa_id,
      payload?.sociedad_id,
      'La sociedad es obligatoria para crear la cuenta por pagar.',
    );
    const insert = async (p) => supabase.from('cxp').insert(p).select().single();
    let p = { ...payload, sociedad_id: sociedadId };
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

  async actualizarGasto(gastoId, campos) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('compras_gastos')
      .update(campos)
      .eq('id', gastoId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarCxP(cxpId, campos) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cxp')
      .update(campos)
      .eq('id', cxpId)
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

  async registrarGastoPagadoAutomatico({ cxp, pago, movimiento, gastoId }) {
    const supabase = await getSupabaseClient();
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      cxp?.empresa_id,
      cxp?.sociedad_id,
      'La sociedad es obligatoria para registrar el gasto pagado.',
    );
    const cxpValidada = { ...cxp, sociedad_id: sociedadId };
    const pagoValidado = { ...pago, sociedad_id: sociedadId };
    const payload = {
      cxp: cxpValidada,
      pago: pagoValidado,
      movimiento,
      gasto_id: gastoId || cxp?.gasto_id || movimiento?.gasto_id || null,
    };

    try {
      const { data, error } = await supabase.rpc('registrar_gasto_pagado_auto', { p_payload: payload });
      if (!error) return data || payload;
      if (!/registrar_gasto_pagado_auto|function.*not.*exist|schema cache/i.test(error.message || '')) throw error;
    } catch (error) {
      if (!/registrar_gasto_pagado_auto|function.*not.*exist|schema cache/i.test(error.message || '')) throw error;
    }

    const creados = { cxp: null, pago: null, movimiento: null };
    try {
      const cxpGuardada = await insertOneTolerante(supabase, 'cxp', cxpValidada);
      creados.cxp = cxpGuardada;
      const pagoGuardado = await insertOneTolerante(supabase, 'cxp_pagos', pagoValidado);
      creados.pago = pagoGuardado;
      const movNormalizado = await normalizarMovimientoTesoreriaCobro(supabase, movimiento);
      const movGuardado = await insertOneTolerante(supabase, 'movimientos_tesoreria', movNormalizado);
      creados.movimiento = movGuardado;
      if (gastoId) {
        await updateOneTolerante(supabase, 'compras_gastos', gastoId, {
          cxp_id: cxp.id,
          estado_pago: 'pagado',
        });
      }
      return { cxp: cxpGuardada, pago: pagoGuardado, movimiento: movGuardado };
    } catch (error) {
      if (creados.movimiento?.id) {
        await supabase.from('movimientos_tesoreria').delete().eq('id', creados.movimiento.id).catch(() => null);
      }
      if (creados.pago?.id) {
        await supabase.from('cxp_pagos').delete().eq('id', creados.pago.id).catch(() => null);
      }
      if (creados.cxp?.id) {
        await supabase.from('cxp').delete().eq('id', creados.cxp.id).catch(() => null);
      }
      if (gastoId) {
        await supabase.from('compras_gastos').update({ cxp_id: null, estado_pago: 'pendiente' }).eq('id', gastoId).catch(() => null);
      }
      throw error;
    }
  },

  async revertirGastoPagadoAutomatico(gastoId) {
    const supabase = await getSupabaseClient();
    try {
      const { data, error } = await supabase.rpc('revertir_gasto_pagado_auto', { p_gasto_id: gastoId });
      if (!error) return data || true;
      if (!/revertir_gasto_pagado_auto|function.*not.*exist|schema cache/i.test(error.message || '')) throw error;
    } catch (error) {
      if (!/revertir_gasto_pagado_auto|function.*not.*exist|schema cache/i.test(error.message || '')) throw error;
    }

    const { data: cxpRows, error: cxpError } = await supabase
      .from('cxp')
      .select('*')
      .eq('gasto_id', gastoId);
    if (cxpError) throw cxpError;
    const cxpAuto = (cxpRows || []).find(c => String(c.origen || '').toLowerCase() === 'auto_gasto');
    const cxpRel = cxpAuto || (cxpRows || [])[0] || null;
    if (cxpRel?.id) {
      await supabase.from('cxp_pagos').delete().eq('cxp_id', cxpRel.id);
    }
    await supabase.from('movimientos_tesoreria').delete().eq('gasto_id', gastoId).catch(() => null);
    if (cxpAuto?.id) {
      await updateOneTolerante(supabase, 'cxp', cxpAuto.id, {
        estado: 'por_pagar',
        monto_pagado: 0,
        saldo: Number(cxpAuto.monto_total || 0),
      });
    }
    await updateOneTolerante(supabase, 'compras_gastos', gastoId, {
      estado_pago: 'pendiente',
      ...(cxpAuto?.id ? { cxp_id: cxpAuto.id } : {}),
    });
    return true;
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

  async conciliarMovimiento(movimientoId, vinculadoTipo, vinculadoId, extra = {}) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_banco')
      .update({ conciliado: true, vinculado_tipo: vinculadoTipo, vinculado_id: vinculadoId, ...extra })
      .eq('id', movimientoId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deshacerConciliacionMovimiento(movimientoId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_banco')
      .update({ conciliado: false, vinculado_tipo: null, vinculado_id: null })
      .eq('id', movimientoId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarMovimientoTesoreria(id, updates) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_tesoreria')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarMovimientoTesoreriaPorVinculo(vinculoTipo, vinculoId, updates) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('movimientos_tesoreria')
      .update(updates)
      .eq('vinculo_tipo', vinculoTipo)
      .eq('vinculo_id', vinculoId)
      .neq('estado', 'anulado')
      .order('created_at', { ascending: false })
      .limit(1)
      .select();
    if (error) throw error;
    return data?.[0] || null;
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
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      payload?.empresa_id,
      payload?.sociedad_id,
      'La sociedad es obligatoria para registrar el egreso de caja chica.',
    );
    const { data, error } = await supabase
      .from('caja_chica')
      .insert({ ...payload, sociedad_id: sociedadId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async insertarCompraGasto(payload) {
    const supabase = await getSupabaseClient();
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      payload?.empresa_id,
      payload?.sociedad_id,
      'La sociedad es obligatoria para registrar el gasto.',
    );
    return insertOneTolerante(supabase, 'compras_gastos', {
      ...payload,
      sociedad_id: sociedadId,
    });
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

  // ── Tipos de Gasto Empresa ──────────────────────────────────────────

  async getTiposGasto(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tipos_gasto_empresa')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('orden');
    if (error) throw error;
    return data || [];
  },

  async insertarTipoGasto(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tipos_gasto_empresa')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarTipoGasto(id, updates) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tipos_gasto_empresa')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarTipoGasto(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('tipos_gasto_empresa')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Retención SUNAT ───────────────────────────────────────────────────

  calcularRetencionFactura(totalConIgv, tasa) {
    const base = Number(totalConIgv || 0);
    const pct = Number(tasa || 3);
    return Math.round(base * (pct / 100) * 100) / 100;
  },

  async getCondicionRetencionCliente(cuentaId, empresaId) {
    if (!cuentaId) return { aplica: false, tasa: 3.00 };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cuentas')
      .select('agente_retencion_sunat, tasa_retencion_sunat')
      .eq('id', cuentaId)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (error || !data) return { aplica: false, tasa: 3.00 };
    return {
      aplica: Boolean(data.agente_retencion_sunat),
      tasa: Number(data.tasa_retencion_sunat || 3),
    };
  },

  async getResumenRetencionesPeriodo(empresaId, anio, mes) {
    const supabase = await getSupabaseClient();
    const periodoStr = `${anio}-${String(mes).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from('facturas')
      .select('monto_retencion, cuenta_id')
      .eq('empresa_id', empresaId)
      .eq('aplica_retencion', true)
      .neq('estado', 'anulada')
      .gte('fecha_emision', `${periodoStr}-01`)
      .lte('fecha_emision', `${periodoStr}-31`);
    if (error) throw error;
    const rows = data || [];
    const totalRetenciones = rows.reduce((s, f) => s + Number(f.monto_retencion || 0), 0);
    const clientesDistintos = new Set(rows.map(f => f.cuenta_id)).size;
    return { totalRetenciones, clientesDistintos, facturas: rows.length };
  },
};
