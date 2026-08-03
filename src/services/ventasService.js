import { getSupabaseClient } from '../lib/supabaseClient.js';
import { reservarStock, liberarReserva } from './inventarioService.js';

const mkId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

const IGV_PCT = 0.18;

function calcularTotalesOV(lineas, moneda = 'PEN') {
  const subtotal = lineas.reduce((s, l) => {
    const neto = Number(l.precio_unitario || 0) * (1 - Number(l.descuento_pct || 0) / 100);
    return s + neto * Number(l.cantidad || 0);
  }, 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    igv: Math.round(subtotal * IGV_PCT * 100) / 100,
    total: Math.round(subtotal * (1 + IGV_PCT) * 100) / 100,
  };
}

// ─── Correlativo OV ───────────────────────────────────────────────────────────
async function siguienteNumeroOV(supabase, empresaId, sociedadId = null) {
  let query = supabase
    .from('correlativos_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('tipo_documento', 'orden_venta')
    .eq('serie', 'OV');
  query = sociedadId ? query.eq('sociedad_id', sociedadId) : query.is('sociedad_id', null);
  const { data: existing } = await query.maybeSingle();

  const ultimo = Number(existing?.ultimo_numero ?? 0);
  const siguiente = ultimo + 1;

  if (existing) {
    await supabase.from('correlativos_documentos')
      .update({ ultimo_numero: siguiente, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('correlativos_documentos').insert({
      id: mkId('cor'), empresa_id: empresaId,
      tipo_documento: 'orden_venta', serie: 'OV',
      sociedad_id: sociedadId,
      ultimo_numero: siguiente, updated_at: new Date().toISOString(),
    });
  }

  return `OV-${new Date().getFullYear()}-${String(siguiente).padStart(4, '0')}`;
}

// ─── Catálogo de venta ────────────────────────────────────────────────────────

export async function getCatalogoVenta(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('catalogo_venta')
    .select('*, materiales(id, codigo, descripcion, costo_promedio, unidad)')
    .eq('empresa_id', empresaId).eq('activo', true)
    .order('descripcion', { ascending: true });
  if (error) { console.error('getCatalogoVenta:', error); return []; }
  return data || [];
}

export async function crearProductoCatalogo(empresaId, form) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('catalogo_venta').insert({
    id: mkId('cat'),
    empresa_id: empresaId,
    material_id: form.material_id || null,
    codigo: form.codigo,
    descripcion: form.descripcion,
    unidad: form.unidad || 'NIU',
    precio_lista: Number(form.precio_lista || 0),
    precio_lista_usd: Number(form.precio_lista_usd || 0),
    moneda: form.moneda || 'PEN',
    descuento_maximo_pct: Number(form.descuento_maximo_pct || 0),
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarProductoCatalogo(productoId, cambios) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('catalogo_venta').update({
    ...cambios, updated_at: new Date().toISOString(),
  }).eq('id', productoId).select().single();
  if (error) throw error;
  return data;
}

// ─── Órdenes de Venta ─────────────────────────────────────────────────────────

export async function getOrdenesVenta(empresaId, { estado } = {}) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('ordenes_venta').select('*')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false });
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) { console.error('getOrdenesVenta:', error); return []; }

  const ids = (data || []).map(o => o.id);
  let lineasMap = {};
  if (ids.length) {
    const { data: lineas } = await supabase.from('ordenes_venta_lineas').select('*')
      .in('orden_venta_id', ids).order('orden', { ascending: true });
    for (const l of lineas || []) {
      if (!lineasMap[l.orden_venta_id]) lineasMap[l.orden_venta_id] = [];
      lineasMap[l.orden_venta_id].push(l);
    }
  }
  return (data || []).map(o => ({ ...o, lineas: lineasMap[o.id] || [] }));
}

export async function crearOrdenVenta(empresaId, form, usuarioId) {
  if (!empresaId) throw new Error('Sin empresa activa');
  const supabase = await getSupabaseClient();

  const { lineas: lineasForm = [], ...ovDatos } = form;
  if (!lineasForm.length) throw new Error('La OV debe tener al menos un ítem');

  const numero = await siguienteNumeroOV(supabase, empresaId, ovDatos.sociedad_id || null);
  const totales = calcularTotalesOV(lineasForm, ovDatos.moneda);

  const ovId = mkId('ov');
  const { data: ov, error } = await supabase.from('ordenes_venta').insert({
    id: ovId,
    empresa_id: empresaId,
    sociedad_id: ovDatos.sociedad_id || null,
    numero,
    cuenta_id: ovDatos.cuenta_id || null,
    cliente_nombre: ovDatos.cliente_nombre || '',
    cliente_ruc_dni: ovDatos.cliente_ruc_dni || null,
    cliente_direccion: ovDatos.cliente_direccion || null,
    moneda: ovDatos.moneda || 'PEN',
    condicion_pago: ovDatos.condicion_pago || '30_dias',
    fecha_emision: ovDatos.fecha_emision || new Date().toISOString().slice(0, 10),
    fecha_entrega: ovDatos.fecha_entrega || null,
    almacen_despacho_id: ovDatos.almacen_despacho_id || null,
    ...totales,
    estado: 'pendiente',
    observaciones: ovDatos.observaciones || null,
    created_by: usuarioId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;

  const lineasInsert = lineasForm.map((l, i) => {
    const neto = Number(l.precio_unitario || 0) * (1 - Number(l.descuento_pct || 0) / 100);
    return {
      id: mkId('ovl'),
      empresa_id: empresaId,
      orden_venta_id: ovId,
      material_id: l.material_id || null,
      catalogo_item_id: l.catalogo_item_id || null,
      descripcion: l.descripcion,
      codigo: l.codigo || null,
      unidad: l.unidad || 'NIU',
      precio_unitario: Number(l.precio_unitario || 0),
      precio_unitario_usd: Number(l.precio_unitario_usd || 0),
      descuento_pct: Number(l.descuento_pct || 0),
      precio_neto: Math.round(neto * 10000) / 10000,
      cantidad: Number(l.cantidad || 1),
      cantidad_despachada: 0,
      subtotal: Math.round(neto * Number(l.cantidad || 1) * 100) / 100,
      lote: l.lote || null,
      serie: l.serie || null,
      orden: i + 1,
    };
  });
  await supabase.from('ordenes_venta_lineas').insert(lineasInsert);

  return { ...ov, lineas: lineasInsert };
}

// ─── Confirmar OV: reserva stock en almacén de despacho ───────────────────────
// estado: pendiente → parcialmente_despachada (se hace al crear la guía)
// Este método solo actualiza estado y reserva stock.
export async function confirmarOrdenVenta(ovId, usuarioId) {
  const supabase = await getSupabaseClient();
  const { data: ov, error } = await supabase.from('ordenes_venta').select('*').eq('id', ovId).single();
  if (error || !ov) throw new Error('OV no encontrada');
  if (ov.estado !== 'pendiente') throw new Error(`La OV ya está en estado "${ov.estado}"`);
  if (!ov.almacen_despacho_id) throw new Error('La OV no tiene almacén de despacho asignado');

  const { data: lineas } = await supabase.from('ordenes_venta_lineas').select('*').eq('orden_venta_id', ovId);
  const erroresReserva = [];
  for (const l of lineas || []) {
    if (!l.material_id) continue;
    try {
      await reservarStock(ov.empresa_id, l.material_id, ov.almacen_despacho_id, Number(l.cantidad), ovId);
    } catch (err) {
      erroresReserva.push(`${l.descripcion}: ${err.message}`);
    }
  }

  await supabase.from('ordenes_venta').update({
    estado: 'confirmada',
    updated_at: new Date().toISOString(),
  }).eq('id', ovId);

  return { ok: true, erroresReserva };
}

export async function actualizarOrdenVenta(ovId, cambios, usuarioId) {
  const supabase = await getSupabaseClient();
  const { lineas: lineasForm, ...datos } = cambios;

  if (lineasForm !== undefined) {
    const totales = calcularTotalesOV(lineasForm, datos.moneda || 'PEN');
    Object.assign(datos, totales);
  }

  const { data, error } = await supabase.from('ordenes_venta').update({
    ...datos,
    updated_at: new Date().toISOString(),
  }).eq('id', ovId).select().single();
  if (error) throw error;

  if (lineasForm !== undefined) {
    await supabase.from('ordenes_venta_lineas').delete().eq('orden_venta_id', ovId);
    if (lineasForm.length) {
      const lineasInsert = lineasForm.map((l, i) => {
        const neto = Number(l.precio_unitario || 0) * (1 - Number(l.descuento_pct || 0) / 100);
        return {
          id: mkId('ovl'),
          empresa_id: data.empresa_id,
          orden_venta_id: ovId,
          material_id: l.material_id || null,
          catalogo_item_id: l.catalogo_item_id || null,
          descripcion: l.descripcion,
          codigo: l.codigo || null,
          unidad: l.unidad || 'NIU',
          precio_unitario: Number(l.precio_unitario || 0),
          descuento_pct: Number(l.descuento_pct || 0),
          precio_neto: Math.round(neto * 10000) / 10000,
          cantidad: Number(l.cantidad || 1),
          cantidad_despachada: 0,
          subtotal: Math.round(neto * Number(l.cantidad || 1) * 100) / 100,
          lote: l.lote || null,
          serie: l.serie || null,
          orden: i + 1,
        };
      });
      await supabase.from('ordenes_venta_lineas').insert(lineasInsert);
    }
  }

  const { data: lineas } = await supabase.from('ordenes_venta_lineas').select('*')
    .eq('orden_venta_id', ovId).order('orden', { ascending: true });
  return { ...data, lineas: lineas || [] };
}

// ─── Anular OV: libera reservas de stock ─────────────────────────────────────
export async function anularOrdenVenta(ovId, motivo, usuarioId) {
  if (!motivo) throw new Error('El motivo de anulación es obligatorio');
  const supabase = await getSupabaseClient();
  const { data: ov } = await supabase.from('ordenes_venta').select('*').eq('id', ovId).single();
  if (!ov) throw new Error('OV no encontrada');
  if (ov.estado === 'anulada') throw new Error('La OV ya está anulada');

  // Liberar reservas si estaban activas
  if (ov.almacen_despacho_id && ['confirmada', 'parcialmente_despachada'].includes(ov.estado)) {
    const { data: lineas } = await supabase.from('ordenes_venta_lineas').select('*').eq('orden_venta_id', ovId);
    for (const l of lineas || []) {
      if (!l.material_id) continue;
      const pendiente = Number(l.cantidad) - Number(l.cantidad_despachada || 0);
      if (pendiente > 0) {
        await liberarReserva(ov.empresa_id, l.material_id, ov.almacen_despacho_id, pendiente).catch(() => {});
      }
    }
  }

  const { data, error } = await supabase.from('ordenes_venta').update({
    estado: 'anulada',
    anulado: true,
    anulado_motivo: motivo,
    anulado_por: usuarioId || null,
    anulado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', ovId).select().single();
  if (error) throw error;
  return data;
}
