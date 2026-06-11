import { getSupabaseClient } from '../lib/supabaseClient.js';
import { registrarEntradaDesdeRecepcion, getStockCompleto, registrarSalidaDevolucion, anularMovimiento } from './inventarioService.js';

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ESTADOS_COMPLETADOS = new Set(['cerrada', 'recibida_total', 'aprobada']);

function _evolucion12Meses(gastos) {
  const now = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth(), label: MESES_CORTOS[d.getMonth()], monto: 0 });
  }
  gastos.forEach(g => {
    if (!g.fecha) return;
    const d = new Date(g.fecha.slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const entry = meses.find(m => m.anio === d.getFullYear() && m.mes === d.getMonth());
    if (entry) entry.monto += Number(g.monto) || 0;
  });
  return meses;
}

export function getSpendAnalysis({
  ordenesCompra = [],
  comprasGastos = [],
  proveedores = [],
  periodoDesde = null,
  periodoHasta = null,
  proveedoresFiltro = [],
  categoriasFiltro = [],
} = {}) {
  const ocs = ordenesCompra.filter(oc => {
    if (!ESTADOS_COMPLETADOS.has(oc.estado)) return false;
    const f = (oc.fecha_emision || oc.fecha || '').slice(0, 10);
    if (periodoDesde && f < periodoDesde) return false;
    if (periodoHasta && f > periodoHasta) return false;
    if (proveedoresFiltro.length && !proveedoresFiltro.includes(oc.proveedor_id)) return false;
    return true;
  });

  const gastos = comprasGastos.filter(g => {
    const f = (g.fecha || '').slice(0, 10);
    if (periodoDesde && f < periodoDesde) return false;
    if (periodoHasta && f > periodoHasta) return false;
    if (categoriasFiltro.length && !categoriasFiltro.includes(g.categoria)) return false;
    return true;
  });

  const gastoTotal = ocs.reduce((s, oc) => s + (Number(oc.total) || 0), 0);
  const provIds = [...new Set(ocs.map(oc => oc.proveedor_id).filter(Boolean))];

  const catMap = {};
  gastos.forEach(g => {
    const cat = g.categoria || 'Sin categoria';
    catMap[cat] = (catMap[cat] || 0) + (Number(g.monto) || 0);
  });
  const catTotal = Object.values(catMap).reduce((s, v) => s + v, 0);
  const gastoPorCategoria = Object.entries(catMap)
    .map(([nombre, monto]) => ({ nombre, monto, pct: catTotal > 0 ? (monto / catTotal) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto);

  const provMap = {};
  const provOCsCount = {};
  ocs.forEach(oc => {
    const id = oc.proveedor_id || 'desconocido';
    provMap[id] = (provMap[id] || 0) + (Number(oc.total) || 0);
    provOCsCount[id] = (provOCsCount[id] || 0) + 1;
  });
  const gastoPorProveedor = Object.entries(provMap)
    .map(([id, monto]) => ({
      id,
      nombre: proveedores.find(p => p.id === id)?.razon_social || id,
      nOCs: provOCsCount[id] || 0,
      monto,
      pct: gastoTotal > 0 ? (monto / gastoTotal) * 100 : 0,
    }))
    .sort((a, b) => b.monto - a.monto);

  const gastosTodosLos12 = comprasGastos.filter(g => {
    if (categoriasFiltro.length && !categoriasFiltro.includes(g.categoria)) return false;
    return true;
  });

  return {
    gastoTotal,
    nProveedoresActivos: provIds.length,
    categoriaMayor: gastoPorCategoria[0] || { nombre: '—', monto: 0 },
    proveedorMayor: gastoPorProveedor[0] || { nombre: '—', monto: 0 },
    gastoPorCategoria,
    gastoPorProveedor,
    evolucionMensual: _evolucion12Meses(gastosTodosLos12),
  };
}

const todayIsoDate = () => new Date().toISOString().split('T')[0];

export function calcularLeadTimeDias(fechaEmision, fechaRecepcion = todayIsoDate()) {
  if (!fechaEmision || !fechaRecepcion) return null;
  const inicio = new Date(`${String(fechaEmision).slice(0, 10)}T00:00:00`);
  const fin = new Date(`${String(fechaRecepcion).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
  return Math.round((fin - inicio) / 86400000);
}

export const comprasService = {

  // ─── Proveedores ──────────────────────────────────────────────
  getProveedores: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedores').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching proveedores:', error); return []; }
    return data;
  },
  crearProveedor: async (empresaId, proveedor) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedores').insert([{ ...proveedor, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarProveedor: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedores').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  getEvaluacionesProveedor: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('evaluaciones_proveedor')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (error) { console.error('Error fetching evaluaciones proveedor:', error); return []; }
    return data;
  },
  registrarEvaluacionProveedor: async (empresaId, evaluacion) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('evaluaciones_proveedor')
      .insert([{ ...evaluacion, empresa_id: empresaId }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── SOLPE ────────────────────────────────────────────────────
  getSolpes: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('solpe_interna').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching solpes:', error); return []; }
    return data;
  },
  crearSolpe: async (empresaId, solpe) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('solpe_interna').insert([{ ...solpe, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  aprobarSolpe: async (id, aprobador_id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('solpe_interna')
      .update({ estado: 'aprobada', aprobada_por: aprobador_id, aprobada_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Procesos de Compra ───────────────────────────────────────
  getProcesosCompra: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('procesos_compra').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching procesos compra:', error); return []; }
    return data;
  },
  crearProcesoCompra: async (empresaId, proceso) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('procesos_compra').insert([{ ...proceso, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarProcesoCompra: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('procesos_compra').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Órdenes de Compra ────────────────────────────────────────
  getOrdenesCompra: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching ordenes compra:', error); return []; }
    return data;
  },
  getPrecioHistoricoProveedor: async (empresaId, proveedorId, materialId) => {
    if (!empresaId || !proveedorId || !materialId) return null;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('vista_precio_historico_proveedor')
      .select('empresa_id, proveedor_id, material_id, precio_unitario, fecha_emision, numero_oc, estado, orden_compra_id, linea')
      .eq('empresa_id', empresaId)
      .eq('proveedor_id', proveedorId)
      .eq('material_id', materialId)
      .order('fecha_emision', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Error fetching precio historico proveedor:', error);
      return null;
    }
    return data || null;
  },
  crearOrdenCompra: async (empresaId, oc) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra').insert([{ ...oc, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarOrdenCompra: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  cerrarOrdenCompraPorRecepcion: async (id, { fechaRecepcion = todayIsoDate(), fechaEmision } = {}) => {
    const cambios = {
      estado: 'cerrada',
      porcentaje_recibido: 100,
      fecha_recepcion_real: fechaRecepcion,
      lead_time_dias: calcularLeadTimeDias(fechaEmision, fechaRecepcion)
    };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  calcularLeadTimeDias,

  // ─── Órdenes de Servicio (OSI) ────────────────────────────────
  getOrdenesServicio: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_servicio_interna').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching ordenes servicio:', error); return []; }
    return data;
  },
  crearOrdenServicio: async (empresaId, os) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_servicio_interna').insert([{ ...os, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarOrdenServicio: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_servicio_interna').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Recepciones ─────────────────────────────────────────────
  getRecepciones: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('recepciones').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching recepciones:', error); return []; }
    return data;
  },
  crearRecepcion: async (empresaId, recepcion) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('recepciones').insert([{ ...recepcion, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  getInventario: async (empresaId) => {
    return getStockCompleto(empresaId);
  },

  // Delega al motor WMS. Mantiene la firma para compatibilidad con context.jsx.
  registrarEntradaInventario: async (empresaId, item, referencia, usuarioId) => {
    return registrarEntradaDesdeRecepcion(empresaId, item, referencia, usuarioId);
  },

};

// ─── Correlativos para devoluciones (DEV-0001) ────────────────────────────────
const mkId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

async function siguienteCorrelativoDev(supabase, empresaId) {
  const { data: existing } = await supabase
    .from('correlativos_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('tipo_documento', 'devolucion_proveedor')
    .eq('serie', 'DEV')
    .maybeSingle();

  const siguiente = Number(existing?.ultimo_numero ?? 0) + 1;

  if (existing) {
    await supabase.from('correlativos_documentos')
      .update({ ultimo_numero: siguiente, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('correlativos_documentos').insert({
      id: mkId('cor'), empresa_id: empresaId,
      tipo_documento: 'devolucion_proveedor', serie: 'DEV',
      ultimo_numero: siguiente,
      updated_at: new Date().toISOString(),
    });
  }
  return `DEV-${String(siguiente).padStart(4, '0')}`;
}

// ─── CRUD devoluciones ────────────────────────────────────────────────────────

export const devolucionesService = {

  getDevolucionesProveedor: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('devoluciones_proveedor')
      .select('*, devoluciones_proveedor_lineas(*)')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });
    if (error) { console.error('getDevolucionesProveedor:', error); return []; }
    return data || [];
  },

  crearDevolucion: async (empresaId, { recepcion_id, proveedor_id, oc_id, fecha, motivo, descripcion_motivo, lineas = [] }, usuarioId) => {
    const supabase = await getSupabaseClient();
    const numero_devolucion = await siguienteCorrelativoDev(supabase, empresaId);
    const devId = mkId('dev');

    const { data: dev, error: devErr } = await supabase
      .from('devoluciones_proveedor')
      .insert({
        id: devId,
        empresa_id: empresaId,
        recepcion_id,
        proveedor_id,
        oc_id: oc_id || null,
        numero_devolucion,
        fecha: fecha || new Date().toISOString().split('T')[0],
        motivo,
        descripcion_motivo: descripcion_motivo || null,
        estado: 'borrador',
        kardex_salida_ids: [],
        creado_por: usuarioId || null,
      })
      .select()
      .single();
    if (devErr) throw devErr;

    if (lineas.length > 0) {
      const lineasData = lineas.map(l => ({
        id: mkId('dvl'),
        empresa_id: empresaId,
        devolucion_id: devId,
        material_id: l.material_id || null,
        descripcion: l.descripcion,
        cantidad_devuelta: Number(l.cantidad_devuelta),
        precio_unitario: Number(l.precio_unitario || 0),
        lote: l.lote || null,
        serie: l.serie || null,
        motivo_linea: l.motivo_linea || null,
        almacen_id: l.almacen_id || null,
      }));
      const { error: linErr } = await supabase.from('devoluciones_proveedor_lineas').insert(lineasData);
      if (linErr) throw linErr;
      dev.devoluciones_proveedor_lineas = lineasData;
    } else {
      dev.devoluciones_proveedor_lineas = [];
    }

    return dev;
  },

  // borrador → enviada: ejecuta WMS salidas y guarda kardex_salida_ids
  enviarDevolucion: async (empresaId, devolucionId, usuarioId) => {
    const supabase = await getSupabaseClient();
    const { data: dev, error: getErr } = await supabase
      .from('devoluciones_proveedor')
      .select('*, devoluciones_proveedor_lineas(*)')
      .eq('id', devolucionId)
      .eq('empresa_id', empresaId)
      .single();
    if (getErr || !dev) throw new Error('Devolución no encontrada');
    if (dev.estado !== 'borrador') throw new Error(`No se puede enviar una devolución en estado "${dev.estado}"`);

    const lineas = dev.devoluciones_proveedor_lineas || [];
    if (!lineas.length) throw new Error('La devolución no tiene líneas');

    const kardexIds = [];
    for (const linea of lineas) {
      if (!linea.material_id) continue;
      // Auto-resolver almacen si no fue guardado en la línea
      let almacenId = linea.almacen_id;
      if (!almacenId) {
        const { data: stockRows } = await supabase.from('stock')
          .select('almacen_id, disponible')
          .eq('empresa_id', empresaId)
          .eq('material_id', linea.material_id)
          .gte('disponible', linea.cantidad_devuelta)
          .limit(1);
        almacenId = stockRows?.[0]?.almacen_id;
      }
      if (!almacenId) continue;
      const res = await registrarSalidaDevolucion(empresaId, {
        material_id: linea.material_id,
        almacen_id: almacenId,
        cantidad: Number(linea.cantidad_devuelta),
        lote: linea.lote || null,
        serie: linea.serie || null,
        referencia_tipo: 'devolucion_proveedor',
        referencia_id: devolucionId,
        nro_documento: dev.numero_devolucion,
        proveedor_id: dev.proveedor_id,
        observacion: `Devolución ${dev.numero_devolucion}`,
      }, usuarioId);
      kardexIds.push(res.kardex_id);
    }

    const { data: updated, error: upErr } = await supabase
      .from('devoluciones_proveedor')
      .update({ estado: 'enviada', kardex_salida_ids: kardexIds, actualizado_en: new Date().toISOString() })
      .eq('id', devolucionId)
      .select()
      .single();
    if (upErr) throw upErr;
    return updated;
  },

  // enviada → aceptada (solo estado, sin movimientos)
  aceptarDevolucion: async (empresaId, devolucionId) => {
    const supabase = await getSupabaseClient();
    const { data: dev } = await supabase.from('devoluciones_proveedor').select('estado').eq('id', devolucionId).single();
    if (dev?.estado !== 'enviada') throw new Error(`Solo se puede aceptar una devolución enviada`);
    const { data, error } = await supabase
      .from('devoluciones_proveedor')
      .update({ estado: 'aceptada', actualizado_en: new Date().toISOString() })
      .eq('id', devolucionId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // aceptada → nota_credito_recibida: crea CxP ajuste negativo y vincula
  registrarNotaCredito: async (empresaId, devolucionId, { cxp_origen_id, monto_nc, moneda = 'PEN', numero_nc, fecha_nc }, usuarioId) => {
    const supabase = await getSupabaseClient();
    const { data: dev } = await supabase
      .from('devoluciones_proveedor')
      .select('*, devoluciones_proveedor_lineas(*)')
      .eq('id', devolucionId)
      .eq('empresa_id', empresaId)
      .single();
    if (!dev) throw new Error('Devolución no encontrada');
    if (dev.estado !== 'aceptada') throw new Error('Solo se puede registrar NC en una devolución aceptada');

    const montoAjuste = Math.abs(Number(monto_nc));
    const cxpAjusteId = mkId('cxp');

    // Crear CxP de tipo ajuste (nota de crédito) con monto negativo
    const { error: cxpErr } = await supabase.from('cxp').insert({
      id: cxpAjusteId,
      empresa_id: empresaId,
      proveedor_id: dev.proveedor_id,
      tipo_comprobante: 'nota_credito',
      numero_comprobante: numero_nc || dev.numero_devolucion,
      fecha_emision: fecha_nc || new Date().toISOString().split('T')[0],
      fecha_vencimiento: fecha_nc || new Date().toISOString().split('T')[0],
      monto_total: -montoAjuste,
      monto_pagado: 0,
      saldo: -montoAjuste,
      moneda,
      estado: 'pendiente_pago',
      origen: 'nc_devolucion',
      recepcion_id: dev.recepcion_id,
      referencia_id: devolucionId,
      referencia_tipo: 'devolucion_proveedor',
      descripcion: `Nota de crédito por devolución ${dev.numero_devolucion}`,
      creado_por: usuarioId || null,
    });
    if (cxpErr) throw cxpErr;

    // Si hay CxP origen, reducir su saldo
    if (cxp_origen_id) {
      const { data: cxpOrigen } = await supabase.from('cxp').select('saldo, monto_pagado, monto_total').eq('id', cxp_origen_id).single();
      if (cxpOrigen) {
        const nuevoSaldo = Math.max(0, Number(cxpOrigen.saldo) - montoAjuste);
        const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'pendiente_pago';
        await supabase.from('cxp').update({
          saldo: nuevoSaldo,
          monto_pagado: Number(cxpOrigen.monto_pagado) + montoAjuste,
          estado: nuevoEstado,
          updated_at: new Date().toISOString(),
        }).eq('id', cxp_origen_id);
      }
    }

    const { data: updated, error: upErr } = await supabase
      .from('devoluciones_proveedor')
      .update({ estado: 'nota_credito_recibida', cxp_ajuste_id: cxpAjusteId, actualizado_en: new Date().toISOString() })
      .eq('id', devolucionId)
      .select()
      .single();
    if (upErr) throw upErr;
    return { devolucion: updated, cxp_ajuste_id: cxpAjusteId };
  },

  // Anular devolución: si es borrador → elimina lógicamente; si es enviada → revierte WMS
  anularDevolucion: async (empresaId, devolucionId, motivo_anulacion, usuarioId) => {
    const supabase = await getSupabaseClient();
    const { data: dev, error: getErr } = await supabase
      .from('devoluciones_proveedor')
      .select('estado, kardex_salida_ids, numero_devolucion')
      .eq('id', devolucionId)
      .eq('empresa_id', empresaId)
      .single();
    if (getErr || !dev) throw new Error('Devolución no encontrada');
    if (['nota_credito_recibida', 'anulada'].includes(dev.estado)) {
      throw new Error(`Una devolución en estado "${dev.estado}" no puede anularse`);
    }

    // Si fue enviada, revertir cada movimiento WMS
    if (dev.estado === 'enviada') {
      const ids = Array.isArray(dev.kardex_salida_ids) ? dev.kardex_salida_ids : [];
      for (const kardexId of ids) {
        try {
          await anularMovimiento(kardexId, `Anulación devolución ${dev.numero_devolucion}: ${motivo_anulacion}`, usuarioId);
        } catch (e) {
          console.error('anularDevolucion kardex:', kardexId, e.message);
        }
      }
    }

    const { data: updated, error: upErr } = await supabase
      .from('devoluciones_proveedor')
      .update({ estado: 'anulada', motivo_anulacion, actualizado_en: new Date().toISOString() })
      .eq('id', devolucionId)
      .select()
      .single();
    if (upErr) throw upErr;
    return updated;
  },
};
