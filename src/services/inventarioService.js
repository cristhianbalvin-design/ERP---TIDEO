import { getSupabaseClient } from '../lib/supabaseClient.js';
import { validarSociedadActivaParaEscritura } from './sociedadEscrituraService.js';

const mkId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

const normalizarFiltroSociedades = filtro => {
  if (!filtro || filtro.sinFiltro) return { sinFiltro: true, sociedadesIds: [], sinResultados: false };
  const sociedadesIds = [...new Set((filtro.sociedadesIds || []).filter(Boolean))];
  return { sinFiltro: false, sociedadesIds, sinResultados: sociedadesIds.length === 0 };
};

const aplicarFiltroSociedades = (query, filtro) => {
  const normalizado = normalizarFiltroSociedades(filtro);
  return normalizado.sinFiltro ? query : query.in('sociedad_id', normalizado.sociedadesIds);
};

// ─── Costo promedio ponderado ──────────────────────────────────────────────────
// Separable: este es el costeo por defecto. Una capa 3 puede inyectar otro.
function calcularNuevoCostoPromedio(stockActual, costoActual, cantidadNueva, costoNuevo) {
  if (cantidadNueva <= 0) return costoActual;
  const totalAntes = stockActual * costoActual;
  const totalNuevo = cantidadNueva * costoNuevo;
  const totalCant = stockActual + cantidadNueva;
  if (totalCant === 0) return 0;
  return (totalAntes + totalNuevo) / totalCant;
}

async function resolverSociedadDesdeOrigenInventario(supabase, empresaId, movimiento) {
  let sociedadDerivada = null;

  if (movimiento.orden_compra_id) {
    const { data, error } = await supabase.from('ordenes_compra')
      .select('sociedad_id').eq('id', movimiento.orden_compra_id).eq('empresa_id', empresaId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La Orden de Compra origen no pertenece al tenant.');
    sociedadDerivada = data.sociedad_id || null;
  } else if (movimiento.referencia_tipo === 'guia_remision' && movimiento.referencia_id) {
    const { data, error } = await supabase.from('guias_remision')
      .select('sociedad_origen_id').eq('id', movimiento.referencia_id).eq('empresa_id', empresaId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La guía origen no pertenece al tenant.');
    sociedadDerivada = data.sociedad_origen_id || null;
  } else if (['ot', 'orden_trabajo'].includes(movimiento.referencia_tipo) && movimiento.referencia_id) {
    const { data, error } = await supabase.rpc('obtener_sociedad_de_ot', { p_ot_id: movimiento.referencia_id });
    if (error) throw error;
    sociedadDerivada = data || null;
  } else if (movimiento.referencia_tipo === 'orden_venta' && movimiento.referencia_id) {
    const { data, error } = await supabase.from('ordenes_venta')
      .select('sociedad_id').eq('id', movimiento.referencia_id).eq('empresa_id', empresaId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La Orden de Venta origen no pertenece al tenant.');
    sociedadDerivada = data.sociedad_id || null;
  }

  if (movimiento.sociedad_id && sociedadDerivada && movimiento.sociedad_id !== sociedadDerivada) {
    throw new Error('La sociedad del movimiento no coincide con su documento de origen.');
  }
  return sociedadDerivada || movimiento.sociedad_id || null;
}

// ─── Resolución de almacén ────────────────────────────────────────────────────
async function resolverAlmacen(supabase, empresaId, almacenId, almacenCodigo) {
  if (almacenId) {
    const { data } = await supabase.from('almacenes').select('*').eq('id', almacenId).maybeSingle();
    if (data) return data;
  }
  const codigo = almacenCodigo || 'ALM-001';
  const { data: existente } = await supabase.from('almacenes').select('*')
    .eq('empresa_id', empresaId).eq('codigo', codigo).maybeSingle();
  if (existente) return existente;
  const { data, error } = await supabase.from('almacenes').insert({
    id: mkId('alm'), empresa_id: empresaId, codigo, nombre: 'Almacén Principal', estado: 'activo'
  }).select().single();
  if (error) throw error;
  return data;
}

// ─── Registrar movimiento (motor de bajo nivel) ────────────────────────────────
// Regla: inmutable. Correcciones = movimiento inverso o ajuste con motivo.
// Actualiza: kardex, stock (fisico/disponible/reservado), costo_promedio del material.
export async function registrarMovimiento(empresaId, {
  tipo,           // 'entrada' | 'salida' | 'ajuste' | 'transferencia_salida' | 'transferencia_entrada'
  motivo,         // subtipo semántico (saldo_inicial, compra_directa, consumo_ot, ajuste_positivo, etc.)
  material_id,
  almacen_id,
  cantidad,       // positivo siempre; tipo determina si suma o resta
  costo_unitario = 0,
  costo_unitario_usd = 0,
  moneda = 'PEN',
  lote = null,
  serie = null,
  vencimiento = null,
  referencia_tipo = null,
  referencia_id = null,
  nro_documento = null,
  proveedor_id = null,
  observacion = null,
  usuario_id = null,
  valorizacion_estado = null,
  orden_compra_id = null,
  orden_compra_item_idx = null,
  precio_unitario_provisional = null,
  precio_unitario_real = null,
  recepcion_id = null,
  sociedad_id = null,
}, { skipCostoPromedio = false } = {}) {
  const supabase = await getSupabaseClient();
  if (!empresaId || !material_id || !almacen_id || !cantidad || cantidad <= 0) {
    throw new Error('Faltan datos obligatorios: empresa, material, almacén y cantidad > 0');
  }
  const sociedadOrigenId = await resolverSociedadDesdeOrigenInventario(supabase, empresaId, {
    sociedad_id, referencia_tipo, referencia_id, orden_compra_id,
  });
  const { sociedadId: sociedadOperacionId } = await validarSociedadActivaParaEscritura(
    supabase,
    empresaId,
    sociedadOrigenId,
    'La sociedad del movimiento de inventario es obligatoria.',
  );

  // 1. Leer stock actual
  let stockQuery = supabase.from('stock').select('*')
    .eq('empresa_id', empresaId).eq('material_id', material_id).eq('almacen_id', almacen_id)
    .is('lote', lote).is('serie', serie);
  stockQuery = sociedadOperacionId ? stockQuery.eq('sociedad_id', sociedadOperacionId) : stockQuery.is('sociedad_id', null);
  const { data: stockRow } = await stockQuery.maybeSingle();

  const stockFisico = Number(stockRow?.fisico ?? stockRow?.disponible ?? 0);
  const stockDisponible = Number(stockRow?.disponible ?? 0);
  const stockReservado = Number(stockRow?.reservado ?? 0);

  // 2. Validar disponibilidad en salidas
  const esSalida = tipo === 'salida' || tipo === 'transferencia_salida';
  if (esSalida && cantidad > stockDisponible) {
    throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}, solicitado: ${cantidad}`);
  }

  // 3. Calcular nuevo costo promedio (solo en entradas)
  let material = null;
  let nuevoCostoPromedio = costo_unitario;
  if (!skipCostoPromedio) {
    const { data: mat } = await supabase.from('materiales').select('costo_promedio').eq('id', material_id).maybeSingle();
    material = mat;
    if (mat && (tipo === 'entrada' || tipo === 'transferencia_entrada')) {
      nuevoCostoPromedio = calcularNuevoCostoPromedio(stockFisico, Number(mat.costo_promedio ?? 0), cantidad, costo_unitario);
    } else if (mat) {
      nuevoCostoPromedio = Number(mat.costo_promedio ?? 0);
      costo_unitario = nuevoCostoPromedio; // salidas al promedio vigente
    }
  }

  // 4. Calcular nuevo saldo
  let nuevoFisico, nuevoDisponible;
  if (tipo === 'entrada' || tipo === 'transferencia_entrada') {
    nuevoFisico = stockFisico + cantidad;
    nuevoDisponible = stockDisponible + cantidad;
  } else if (esSalida) {
    nuevoFisico = Math.max(0, stockFisico - cantidad);
    nuevoDisponible = Math.max(0, stockDisponible - cantidad);
  } else {
    // ajuste: cantidad puede ser positiva o negativa pero se pasa como delta
    nuevoFisico = Math.max(0, stockFisico + cantidad);
    nuevoDisponible = Math.max(0, stockDisponible + cantidad);
  }

  // 5. Insertar kardex
  const kardexId = mkId('kdx');
  const kardexRow = {
    id: kardexId,
    empresa_id: empresaId,
    material_id,
    almacen_id,
    sociedad_id: sociedadOperacionId,
    tipo,
    motivo: motivo || tipo,
    cantidad,
    costo_unitario: Number(costo_unitario) || 0,
    costo_total: (Number(costo_unitario) || 0) * cantidad,
    costo_unitario_usd: Number(costo_unitario_usd) || 0,
    costo_total_usd: (Number(costo_unitario_usd) || 0) * cantidad,
    moneda,
    lote,
    serie,
    vencimiento,
    saldo_cantidad: nuevoFisico,
    referencia_tipo,
    referencia_id,
    nro_documento,
    proveedor_id,
    observacion,
    created_by: usuario_id || null,
    anulado: false,
  };
  if (valorizacion_estado) kardexRow.valorizacion_estado = valorizacion_estado;
  if (orden_compra_id) kardexRow.orden_compra_id = orden_compra_id;
  if (orden_compra_item_idx !== null && orden_compra_item_idx !== undefined) kardexRow.orden_compra_item_idx = orden_compra_item_idx;
  if (precio_unitario_provisional !== null && precio_unitario_provisional !== undefined) kardexRow.precio_unitario_provisional = Number(precio_unitario_provisional) || 0;
  if (precio_unitario_real !== null && precio_unitario_real !== undefined) kardexRow.precio_unitario_real = Number(precio_unitario_real) || 0;
  if (recepcion_id) kardexRow.recepcion_id = recepcion_id;

  const { error: kdxErr } = await supabase.from('kardex').insert(kardexRow);
  if (kdxErr) {
    // PostgREST error when migration 009 hasn't been applied yet
    if (kdxErr.message?.includes('column') || kdxErr.code === 'PGRST204') {
      throw new Error('La migración 009_wms_motor.sql no ha sido aplicada en Supabase. Aplícala en el SQL Editor antes de registrar movimientos de inventario.');
    }
    throw kdxErr;
  }

  // 6. Upsert stock
  if (stockRow) {
    const { error: stErr } = await supabase.from('stock').update({
      fisico: nuevoFisico,
      disponible: nuevoDisponible,
      reservado: stockReservado,
      updated_at: new Date().toISOString(),
    }).eq('id', stockRow.id);
    if (stErr) throw stErr;
  } else {
    const { error: stErr } = await supabase.from('stock').insert({
      empresa_id: empresaId,
      material_id,
      almacen_id,
      sociedad_id: sociedadOperacionId,
      fisico: nuevoFisico,
      disponible: nuevoDisponible,
      reservado: 0,
      lote,
      serie,
      vencimiento,
    });
    if (stErr) throw stErr;
  }

  // 7. Actualizar costo_promedio del material (solo en entradas)
  if (!skipCostoPromedio && (tipo === 'entrada' || tipo === 'transferencia_entrada')) {
    await supabase.from('materiales').update({
      costo_promedio: nuevoCostoPromedio,
      updated_at: new Date().toISOString(),
    }).eq('id', material_id);
  }

  return { kardex_id: kardexId, saldo: nuevoFisico, disponible: nuevoDisponible, costo_promedio: nuevoCostoPromedio };
}

// ─── Entrada manual ────────────────────────────────────────────────────────────
// motivos: 'saldo_inicial' | 'ajuste_positivo' | 'devolucion_ot' | 'compra_directa_sin_oc'
export async function registrarEntrada(empresaId, form, usuarioId) {
  const supabase = await getSupabaseClient();
  const {
    material_id, almacen_id, almacen_codigo, cantidad, costo_unitario = 0,
    costo_unitario_usd = 0, moneda = 'PEN', motivo = 'saldo_inicial',
    lote, serie, vencimiento, proveedor_id, nro_documento, observacion, sociedad_id = null,
  } = form;

  if (!material_id) throw new Error('Material requerido');
  if (!cantidad || Number(cantidad) <= 0) throw new Error('Cantidad debe ser mayor a cero');

  const almacen = await resolverAlmacen(supabase, empresaId, almacen_id, almacen_codigo);

  // Validación: artículo controlado por serie → cantidad = 1
  const { data: mat } = await supabase.from('materiales').select('tipo_control, descripcion').eq('id', material_id).maybeSingle();
  if (mat?.tipo_control === 'serie' && Number(cantidad) !== 1) {
    throw new Error('Artículos controlados por serie deben ingresarse de uno en uno');
  }
  if (mat?.tipo_control === 'lote' && !lote) {
    throw new Error('Este artículo requiere número de lote');
  }
  if (mat?.tipo_control === 'serie' && !serie) {
    throw new Error('Este artículo requiere número de serie');
  }

  return registrarMovimiento(empresaId, {
    tipo: 'entrada', motivo, material_id, almacen_id: almacen.id,
    cantidad: Number(cantidad), costo_unitario: Number(costo_unitario),
    costo_unitario_usd: Number(costo_unitario_usd), moneda,
    lote: lote || null, serie: serie || null, vencimiento: vencimiento || null,
    proveedor_id: proveedor_id || null, nro_documento: nro_documento || null,
    referencia_tipo: motivo, referencia_id: null, observacion: observacion || null,
    usuario_id: usuarioId,
    sociedad_id,
  });
}

// ─── Salida por devolución a proveedor ────────────────────────────────────────
// Wrapper semántico: fija motivo = 'devolucion_proveedor' y referencia_tipo correcto.
export async function registrarSalidaDevolucion(empresaId, form, usuarioId) {
  return registrarMovimiento(empresaId, {
    tipo: 'salida',
    motivo: 'devolucion_proveedor',
    material_id: form.material_id,
    almacen_id: form.almacen_id,
    cantidad: Number(form.cantidad),
    lote: form.lote || null,
    serie: form.serie || null,
    referencia_tipo: 'devolucion_proveedor',
    referencia_id: form.referencia_id || null,
    nro_documento: form.nro_documento || null,
    proveedor_id: form.proveedor_id || null,
    observacion: form.observacion || null,
    usuario_id: usuarioId,
    sociedad_id: form.sociedad_id || null,
  });
}

// ─── Salida / consumo ─────────────────────────────────────────────────────────
// motivos: 'consumo_ot' | 'despacho' | 'merma' | 'devolucion_proveedor'
export async function registrarSalida(empresaId, form, usuarioId) {
  const { material_id, almacen_id, cantidad, motivo = 'consumo_ot',
    referencia_tipo, referencia_id, lote, serie, observacion, sociedad_id = null } = form;
  if (!material_id) throw new Error('Material requerido');
  if (!cantidad || Number(cantidad) <= 0) throw new Error('Cantidad debe ser mayor a cero');
  return registrarMovimiento(empresaId, {
    tipo: 'salida', motivo, material_id, almacen_id,
    cantidad: Number(cantidad), lote: lote || null, serie: serie || null,
    referencia_tipo, referencia_id, observacion, usuario_id: usuarioId,
    sociedad_id,
  });
}

// ─── Transferencia entre almacenes ────────────────────────────────────────────
export async function registrarTransferencia(empresaId, form, usuarioId) {
  const { material_id, almacen_origen_id, almacen_destino_id, cantidad, lote, serie, observacion,
    sociedad_origen_id = null, sociedad_destino_id = null, tipo_origen = 'traslado_interno' } = form;
  if (!material_id) throw new Error('Material requerido');
  if (!almacen_origen_id || !almacen_destino_id) throw new Error('Almacén origen y destino requeridos');
  if (almacen_origen_id === almacen_destino_id) throw new Error('Origen y destino no pueden ser el mismo almacén');
  if (!cantidad || Number(cantidad) <= 0) throw new Error('Cantidad debe ser mayor a cero');
  const esEntreSociedades = sociedad_origen_id && sociedad_destino_id && sociedad_origen_id !== sociedad_destino_id;
  if (esEntreSociedades && tipo_origen !== 'transferencia_intercompania') {
    throw new Error('Una transferencia entre sociedades requiere una guía de transferencia intercompañía.');
  }

  const supabase = await getSupabaseClient();
  const { data: mat } = await supabase.from('materiales').select('costo_promedio').eq('id', material_id).maybeSingle();
  const costoPromedio = Number(mat?.costo_promedio ?? 0);

  // Salida del origen
  const salida = await registrarMovimiento(empresaId, {
    tipo: 'transferencia_salida', motivo: 'transferencia', material_id,
    almacen_id: almacen_origen_id, cantidad: Number(cantidad),
    costo_unitario: costoPromedio, lote: lote || null, serie: serie || null,
    referencia_tipo: 'transferencia', observacion, usuario_id: usuarioId,
    sociedad_id: sociedad_origen_id,
  }, { skipCostoPromedio: true });

  // Entrada al destino (conserva costo y lote/serie del origen)
  const entrada = await registrarMovimiento(empresaId, {
    tipo: 'transferencia_entrada', motivo: 'transferencia', material_id,
    almacen_id: almacen_destino_id, cantidad: Number(cantidad),
    costo_unitario: costoPromedio, lote: lote || null, serie: serie || null,
    referencia_tipo: 'transferencia', referencia_id: salida.kardex_id,
    observacion, usuario_id: usuarioId,
    sociedad_id: sociedad_destino_id || sociedad_origen_id,
  }, { skipCostoPromedio: true });

  return { salida, entrada };
}

// ─── Ajuste de inventario ─────────────────────────────────────────────────────
// delta positivo = ajuste positivo; delta negativo = ajuste negativo (merma/pérdida)
export async function registrarAjuste(empresaId, form, usuarioId) {
  const { material_id, almacen_id, cantidad_teorica, cantidad_fisica, motivo = 'ajuste_conteo', observacion, lote, serie, referencia_tipo = 'ajuste', referencia_id = null, sociedad_id = null } = form;
  const supabase = await getSupabaseClient();

  if (!material_id) throw new Error('Material requerido');
  if (cantidad_fisica === undefined || cantidad_fisica === null) throw new Error('Cantidad física requerida');

  const { data: mat } = await supabase.from('materiales').select('costo_promedio').eq('id', material_id).maybeSingle();
  const costoPromedio = Number(mat?.costo_promedio ?? 0);

  const delta = Number(cantidad_fisica) - Number(cantidad_teorica);
  if (delta === 0) return null; // Sin diferencia, no registra movimiento

  const tipo = delta > 0 ? 'entrada' : 'salida';
  const cantidad = Math.abs(delta);

  return registrarMovimiento(empresaId, {
    tipo, motivo, material_id, almacen_id,
    cantidad, costo_unitario: costoPromedio,
    lote: lote || null, serie: serie || null,
    referencia_tipo, referencia_id, observacion,
    usuario_id: usuarioId,
    sociedad_id,
  });
}

// ─── Reserva de stock ─────────────────────────────────────────────────────────
// Reduce disponible sin tocar físico. El consumo posterior convierte la reserva en salida.
export async function reservarStock(empresaId, material_id, almacen_id, cantidad, otId, sociedadId = null) {
  const supabase = await getSupabaseClient();
  const { sociedadId: sociedadOperacionId } = await validarSociedadActivaParaEscritura(
    supabase, empresaId, sociedadId, 'La sociedad de la reserva de stock es obligatoria.',
  );
  let query = supabase.from('stock').select('*')
    .eq('empresa_id', empresaId).eq('material_id', material_id).eq('almacen_id', almacen_id)
    .is('lote', null).is('serie', null);
  query = sociedadOperacionId ? query.eq('sociedad_id', sociedadOperacionId) : query.is('sociedad_id', null);
  const { data: stockRow } = await query.maybeSingle();

  if (!stockRow) throw new Error('No hay stock de este material en el almacén indicado');
  if (Number(stockRow.disponible) < cantidad) {
    throw new Error(`Stock insuficiente para reservar. Disponible: ${stockRow.disponible}`);
  }

  const { error } = await supabase.from('stock').update({
    disponible: Number(stockRow.disponible) - cantidad,
    reservado: Number(stockRow.reservado) + cantidad,
    updated_at: new Date().toISOString(),
  }).eq('id', stockRow.id);
  if (error) throw error;
  return true;
}

export async function liberarReserva(empresaId, material_id, almacen_id, cantidad, sociedadId = null) {
  const supabase = await getSupabaseClient();
  const { sociedadId: sociedadOperacionId } = await validarSociedadActivaParaEscritura(
    supabase, empresaId, sociedadId, 'La sociedad de la reserva de stock es obligatoria.',
  );
  let query = supabase.from('stock').select('*')
    .eq('empresa_id', empresaId).eq('material_id', material_id).eq('almacen_id', almacen_id)
    .is('lote', null).is('serie', null);
  query = sociedadOperacionId ? query.eq('sociedad_id', sociedadOperacionId) : query.is('sociedad_id', null);
  const { data: stockRow } = await query.maybeSingle();
  if (!stockRow) return;
  const liberado = Math.min(cantidad, Number(stockRow.reservado));
  const { error } = await supabase.from('stock').update({
    disponible: Number(stockRow.disponible) + liberado,
    reservado: Number(stockRow.reservado) - liberado,
    updated_at: new Date().toISOString(),
  }).eq('id', stockRow.id);
  if (error) throw error;
}

// ─── Anular movimiento ────────────────────────────────────────────────────────
// No se borra el kardex. Se marca anulado y se genera movimiento inverso.
export async function anularMovimiento(kardexId, motivo, usuarioId) {
  const supabase = await getSupabaseClient();
  const { data: kdx, error } = await supabase.from('kardex').select('*').eq('id', kardexId).single();
  if (error || !kdx) throw new Error('Movimiento no encontrado');
  if (kdx.anulado) throw new Error('El movimiento ya está anulado');

  await supabase.from('kardex').update({
    anulado: true,
    anulado_por: usuarioId,
    anulado_motivo: motivo,
    anulado_at: new Date().toISOString(),
  }).eq('id', kardexId);

  // Movimiento inverso para equilibrar el saldo
  const tipoInverso = kdx.tipo === 'entrada' ? 'salida' : 'entrada';
  await registrarMovimiento(kdx.empresa_id, {
    tipo: tipoInverso, motivo: `anulacion_${kdx.tipo}`,
    material_id: kdx.material_id, almacen_id: kdx.almacen_id,
    cantidad: kdx.cantidad, costo_unitario: kdx.costo_unitario,
    lote: kdx.lote, serie: kdx.serie,
    referencia_tipo: 'anulacion', referencia_id: kardexId,
    observacion: `Anulación de ${kardexId}: ${motivo}`,
    usuario_id: usuarioId,
    sociedad_id: kdx.sociedad_id || null,
  });
}

// ─── Conteo físico ────────────────────────────────────────────────────────────
export async function iniciarConteo(empresaId, { nombre, tipo = 'total', almacen_id, zona, sociedad_id = null }, usuarioId) {
  const supabase = await getSupabaseClient();
  const { sociedadId: sociedadOperacionId } = await validarSociedadActivaParaEscritura(
    supabase, empresaId, sociedad_id, 'La sociedad del conteo físico es obligatoria.',
  );
  const count = await supabase.from('inventario_conteos').select('id', { count: 'exact' }).eq('empresa_id', empresaId);
  const n = (count.count || 0) + 1;
  const codigo = `CNT-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;

  // Cargar stock teórico actual
  let q = supabase.from('stock')
    .select('material_id, almacen_id, fisico, lote, serie, vencimiento, materiales(id, codigo, descripcion, unidad, familia, tipo_control), almacenes(id, codigo, nombre)')
    .eq('empresa_id', empresaId);
  if (almacen_id) q = q.eq('almacen_id', almacen_id);
  q = sociedadOperacionId ? q.eq('sociedad_id', sociedadOperacionId) : q.is('sociedad_id', null);
  const { data: stocks } = await q;

  const items = (stocks || []).map(s => ({
    material_id: s.material_id,
    almacen_id: s.almacen_id,
    sku: s.materiales?.codigo || s.material_id,
    nombre: s.materiales?.descripcion || s.material_id,
    categoria: s.materiales?.familia || 'General',
    unidad: s.materiales?.unidad || 'und',
    almacen: s.almacenes?.nombre || s.almacenes?.codigo || s.almacen_id,
    tipo_control: s.materiales?.tipo_control || 'sin_control',
    teorico: Number(s.fisico ?? 0),
    fisico: null,
    diferencia: null,
    lote: s.lote,
    serie: s.serie,
    vencimiento: s.vencimiento,
  }));

  const { data, error } = await supabase.from('inventario_conteos').insert({
    id: mkId('cnt'), empresa_id: empresaId, sociedad_id: sociedadOperacionId, codigo, nombre, tipo, almacen_id: almacen_id || null,
    zona: zona || null, estado: 'en_proceso', items, ajustes_generados: false,
    creado_por: usuarioId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

export async function listarConteos(empresaId, limit = 50, filtroSociedades = null) {
  if (!empresaId) return [];
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('inventario_conteos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  q = aplicarFiltroSociedades(q, filtroSociedades).limit(limit);
  const { data, error } = await q;
  if (error) {
    console.error('listarConteos:', error);
    return [];
  }
  return data || [];
}

export async function guardarAvanceConteo(empresaId, conteoId, items, usuarioId) {
  if (!empresaId || !conteoId) throw new Error('Conteo requerido');
  const supabase = await getSupabaseClient();
  const { data: conteo, error: getErr } = await supabase.from('inventario_conteos')
    .select('id, estado, sociedad_id')
    .eq('empresa_id', empresaId)
    .eq('id', conteoId)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!conteo) throw new Error('Conteo no encontrado');
  if (conteo.estado === 'cerrado') throw new Error('El conteo cerrado es inmutable. Crea un nuevo conteo para corregir.');

  const { data, error } = await supabase.from('inventario_conteos').update({
    estado: 'en_proceso',
    items: items || [],
    updated_at: new Date().toISOString(),
  }).eq('empresa_id', empresaId).eq('id', conteoId).select().single();
  if (error) throw error;
  return data;
}

export async function cerrarConteo(empresaId, conteoId, itemsContados, usuarioId) {
  const supabase = await getSupabaseClient();
  const { data: conteo, error: getErr } = await supabase.from('inventario_conteos')
    .select('id, estado, sociedad_id')
    .eq('empresa_id', empresaId)
    .eq('id', conteoId)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!conteo) throw new Error('Conteo no encontrado');
  if (conteo.estado === 'cerrado') throw new Error('El conteo cerrado es inmutable. Crea un nuevo conteo para corregir.');
  if ((itemsContados || []).some(it => it.fisico === null || it.fisico === undefined || it.fisico === '')) {
    throw new Error('Todos los items deben tener cantidad fisica antes de cerrar el conteo');
  }

  const itemsConDif = itemsContados.map(it => ({
    ...it,
    diferencia: Number(it.fisico ?? 0) - Number(it.teorico ?? 0),
  }));

  // Generar ajustes automáticos por diferencia
  const resultados = [];
  for (const item of itemsConDif) {
    if (item.diferencia !== 0 && item.material_id && item.almacen_id) {
      try {
        const res = await registrarAjuste(empresaId, {
          material_id: item.material_id,
          almacen_id: item.almacen_id,
          cantidad_teorica: item.teorico,
          cantidad_fisica: item.fisico,
          motivo: 'ajuste_conteo',
          observacion: `Conteo físico ${conteoId}`,
          lote: item.lote || null,
          serie: item.serie || null,
          referencia_tipo: 'conteo_fisico',
          referencia_id: conteoId,
          sociedad_id: conteo.sociedad_id || null,
        }, usuarioId);
        resultados.push({ ...item, ajuste: res });
      } catch (_) {
        resultados.push({ ...item, error: _.message });
      }
    }
  }

  await supabase.from('inventario_conteos').update({
    estado: 'cerrado', items: itemsConDif, ajustes_generados: true,
    cerrado_por: usuarioId, cerrado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('empresa_id', empresaId).eq('id', conteoId);

  return resultados;
}

// ─── Consultas ─────────────────────────────────────────────────────────────────

const rangoPeriodoInventario = (periodo = 'trimestre') => {
  const hasta = new Date();
  const desde = new Date(hasta);
  if (periodo === 'mes') desde.setMonth(desde.getMonth() - 1);
  else if (periodo === 'anio') desde.setFullYear(desde.getFullYear() - 1);
  else desde.setMonth(desde.getMonth() - 3);
  return { desde, hasta };
};

const diasEntre = (a, b = new Date()) => {
  if (!a) return null;
  return Math.max(0, Math.floor((b - new Date(a)) / 86400000));
};

const materialAlmacenKey = (row) => `${row.sociedad_id || 'sin_sociedad'}::${row.material_id || 'sin_material'}::${row.almacen_id || 'sin_almacen'}`;

function normalizarMovimientoInventario(row) {
  const cantidad = Number(row.cantidad || 0);
  const costoUnitario = Number(row.costo_unitario || row.materiales?.costo_promedio || 0);
  const costoTotal = Number(row.costo_total || 0) || cantidad * costoUnitario;
  return {
    ...row,
    cantidad,
    costo_unitario: costoUnitario,
    costo_total: costoTotal,
    sku: row.materiales?.codigo || row.material_id,
    nombre: row.materiales?.descripcion || row.material_id,
    unidad: row.materiales?.unidad || 'und',
    categoria: row.materiales?.familia || 'General',
    almacen: row.almacenes?.nombre || row.almacenes?.codigo || row.almacen_id,
  };
}

export async function getAnaliticaInventario(empresaId, { periodo = 'trimestre', almacen_id = '', dias_sin_actividad = 90, filtroSociedades = null } = {}) {
  if (!empresaId) return { abc: [], rotacion: [], stockMuerto: [], meta: { movimientosPeriodo: 0 } };
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return { abc: [], rotacion: [], stockMuerto: [], meta: { movimientosPeriodo: 0 } };
  const supabase = await getSupabaseClient();
  const { desde, hasta } = rangoPeriodoInventario(periodo);

  let kardexQ = supabase.from('kardex')
    .select('id, empresa_id, sociedad_id, material_id, almacen_id, tipo, motivo, cantidad, costo_unitario, costo_total, created_at, anulado, materiales(id, codigo, descripcion, unidad, familia, costo_promedio), almacenes(id, codigo, nombre)')
    .eq('empresa_id', empresaId)
    .eq('anulado', false)
    .gte('created_at', desde.toISOString())
    .lte('created_at', hasta.toISOString());
  if (almacen_id) kardexQ = kardexQ.eq('almacen_id', almacen_id);
  kardexQ = aplicarFiltroSociedades(kardexQ, filtroSociedades);

  let stockQ = supabase.from('stock')
    .select('id, empresa_id, sociedad_id, material_id, almacen_id, fisico, disponible, lote, serie, updated_at, materiales(id, codigo, descripcion, unidad, familia, costo_promedio), almacenes(id, codigo, nombre)')
    .eq('empresa_id', empresaId);
  if (almacen_id) stockQ = stockQ.eq('almacen_id', almacen_id);
  stockQ = aplicarFiltroSociedades(stockQ, filtroSociedades);

  let historicoSalidasQ = supabase.from('kardex')
    .select('id, sociedad_id, material_id, almacen_id, tipo, created_at')
    .eq('empresa_id', empresaId)
    .eq('anulado', false)
    .in('tipo', ['salida', 'transferencia_salida'])
    .order('created_at', { ascending: false })
    .limit(5000);
  if (almacen_id) historicoSalidasQ = historicoSalidasQ.eq('almacen_id', almacen_id);
  historicoSalidasQ = aplicarFiltroSociedades(historicoSalidasQ, filtroSociedades);

  const [movRes, stockRes, salidasRes] = await Promise.all([kardexQ, stockQ, historicoSalidasQ]);
  if (movRes.error) throw movRes.error;
  if (stockRes.error) throw stockRes.error;
  if (salidasRes.error) throw salidasRes.error;

  const movimientos = (movRes.data || []).map(normalizarMovimientoInventario);
  const stocks = stockRes.data || [];
  const salidas = movimientos.filter(m => m.tipo === 'salida' || m.tipo === 'transferencia_salida');
  const entradas = movimientos.filter(m => m.tipo === 'entrada' || m.tipo === 'transferencia_entrada');

  const abcMap = new Map();
  for (const mov of salidas) {
    if (!mov.material_id) continue;
    const key = `${mov.sociedad_id || 'sin_sociedad'}::${mov.material_id}`;
    const current = abcMap.get(key) || { key, sociedad_id: mov.sociedad_id || null, material_id: mov.material_id, sku: mov.sku, nombre: mov.nombre, categoria: mov.categoria, unidad: mov.unidad, valor_salidas: 0, cantidad_salidas: 0 };
    current.valor_salidas += mov.costo_total;
    current.cantidad_salidas += mov.cantidad;
    abcMap.set(key, current);
  }
  const abcPorSociedad = new Map();
  for (const row of abcMap.values()) {
    const keySociedad = row.sociedad_id || 'sin_sociedad';
    const grupo = abcPorSociedad.get(keySociedad) || [];
    grupo.push(row);
    abcPorSociedad.set(keySociedad, grupo);
  }
  const abc = [...abcPorSociedad.values()].flatMap(grupo => {
    const ordenado = grupo.sort((a, b) => b.valor_salidas - a.valor_salidas);
    const totalSociedad = ordenado.reduce((s, r) => s + r.valor_salidas, 0);
    let acumuladoSociedad = 0;
    return ordenado.map((row, index) => {
      acumuladoSociedad += row.valor_salidas;
      const pctRank = ordenado.length ? (index + 1) / ordenado.length : 1;
      return {
        ...row,
        pct_total: totalSociedad ? row.valor_salidas / totalSociedad : 0,
        pct_acumulado: totalSociedad ? acumuladoSociedad / totalSociedad : 0,
        clase: pctRank <= 0.2 ? 'A' : pctRank <= 0.5 ? 'B' : 'C',
      };
    });
  });
  const totalSalidasValor = abc.reduce((s, r) => s + r.valor_salidas, 0);

  const stockActualMap = new Map();
  for (const row of stocks) {
    const key = materialAlmacenKey(row);
    const current = stockActualMap.get(key) || {
      sociedad_id: row.sociedad_id || null,
      material_id: row.material_id,
      almacen_id: row.almacen_id,
      sku: row.materiales?.codigo || row.material_id,
      nombre: row.materiales?.descripcion || row.material_id,
      unidad: row.materiales?.unidad || 'und',
      categoria: row.materiales?.familia || 'General',
      almacen: row.almacenes?.nombre || row.almacen_id,
      stock_actual: 0,
      costo_promedio: Number(row.materiales?.costo_promedio || 0),
    };
    current.stock_actual += Number(row.fisico ?? row.disponible ?? 0);
    stockActualMap.set(key, current);
  }

  const movimientosPorKey = new Map();
  for (const mov of movimientos) {
    const key = materialAlmacenKey(mov);
    const current = movimientosPorKey.get(key) || { sociedad_id: mov.sociedad_id || null, material_id: mov.material_id, almacen_id: mov.almacen_id, sku: mov.sku, nombre: mov.nombre, categoria: mov.categoria, unidad: mov.unidad, almacen: mov.almacen, salidas: 0, entradas: 0 };
    if (mov.tipo === 'salida' || mov.tipo === 'transferencia_salida') current.salidas += mov.cantidad;
    if (mov.tipo === 'entrada' || mov.tipo === 'transferencia_entrada') current.entradas += mov.cantidad;
    movimientosPorKey.set(key, current);
  }
  const rotacionKeys = new Set([...stockActualMap.keys(), ...movimientosPorKey.keys()]);
  const rotacion = [...rotacionKeys].map(key => {
    const stock = stockActualMap.get(key) || movimientosPorKey.get(key) || {};
    const movs = movimientosPorKey.get(key) || { salidas: 0, entradas: 0 };
    const stockFinal = Number(stock.stock_actual || 0);
    const stockInicialEstimado = Math.max(0, stockFinal - movs.entradas + movs.salidas);
    const stockPromedio = (stockInicialEstimado + stockFinal) / 2;
    const rot = stockPromedio > 0 ? movs.salidas / stockPromedio : (movs.salidas > 0 ? movs.salidas : 0);
    return {
      ...stock,
      key,
      salidas_periodo: movs.salidas,
      entradas_periodo: movs.entradas,
      stock_promedio: stockPromedio,
      rotacion: rot,
    };
  }).sort((a, b) => (b.rotacion || 0) - (a.rotacion || 0));

  const ultimaSalidaMap = new Map();
  for (const row of salidasRes.data || []) {
    const key = materialAlmacenKey(row);
    if (!ultimaSalidaMap.has(key)) ultimaSalidaMap.set(key, row.created_at);
  }
  const hoy = new Date();
  const stockMuerto = [...stockActualMap.values()]
    .map(row => {
      const key = materialAlmacenKey(row);
      const ultima = ultimaSalidaMap.get(key) || null;
      const dias = ultima ? diasEntre(ultima, hoy) : null;
      return {
        ...row,
        ultima_salida: ultima,
        dias_sin_actividad: dias,
        valor_inmovilizado: Number(row.stock_actual || 0) * Number(row.costo_promedio || 0),
      };
    })
    .filter(row => Number(row.stock_actual || 0) > 0 && (row.ultima_salida === null || Number(row.dias_sin_actividad || 0) >= Number(dias_sin_actividad || 90)))
    .sort((a, b) => b.valor_inmovilizado - a.valor_inmovilizado);

  return {
    abc,
    rotacion,
    stockMuerto,
    meta: {
      periodo,
      almacen_id,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      movimientosPeriodo: movimientos.length,
      salidasPeriodo: salidas.length,
      entradasPeriodo: entradas.length,
      totalSalidasValor,
      dias_sin_actividad: Number(dias_sin_actividad || 90),
      valorInmovilizado: stockMuerto.reduce((s, r) => s + Number(r.valor_inmovilizado || 0), 0),
    },
  };
}

export async function getKardex(empresaId, materialId, almacenId, limit = 50, filtroSociedades = null) {
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('kardex').select('*')
    .eq('empresa_id', empresaId).eq('material_id', materialId).eq('anulado', false);
  if (almacenId) q = q.eq('almacen_id', almacenId);
  q = aplicarFiltroSociedades(q, filtroSociedades).order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) { console.error('getKardex:', error); return []; }
  return data || [];
}

export async function getStockCompleto(empresaId, filtroSociedades = null) {
  if (!empresaId) return [];
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return [];
  const supabase = await getSupabaseClient();

  // Try full select (requires migration 009). Fall back to base columns if not yet applied.
  let data;
  const fullSelect = `*, materiales(id, codigo, descripcion, unidad, familia, costo_promedio, costo_promedio_usd, stock_minimo, stock_maximo, punto_reorden, stock_seguridad, tipo_control, codigo_barras), almacenes(id, codigo, nombre)`;
  const baseSelect = `*, materiales(id, codigo, descripcion, unidad, familia, costo_promedio, stock_minimo, stock_seguridad), almacenes(id, codigo, nombre)`;

  let fullQuery = supabase.from('stock').select(fullSelect).eq('empresa_id', empresaId);
  fullQuery = aplicarFiltroSociedades(fullQuery, filtroSociedades).order('updated_at', { ascending: false });
  const full = await fullQuery;
  if (full.error) {
    console.warn('getStockCompleto: columnas WMS no encontradas, usando select base (aplicar migración 009):', full.error.message);
    let baseQuery = supabase.from('stock').select(baseSelect).eq('empresa_id', empresaId);
    baseQuery = aplicarFiltroSociedades(baseQuery, filtroSociedades).order('updated_at', { ascending: false });
    const base = await baseQuery;
    if (base.error) { console.error('getStockCompleto:', base.error); return []; }
    data = base.data;
  } else {
    data = full.data;
  }

  return (data || []).map(row => ({
    id: row.id,
    empresa_id: row.empresa_id,
    sociedad_id: row.sociedad_id,
    material_id: row.material_id,
    almacen_id: row.almacen_id,
    sku: row.materiales?.codigo || row.material_id,
    nombre: row.materiales?.descripcion || row.material_id,
    categoria: row.materiales?.familia || 'General',
    unidad: row.materiales?.unidad || 'und',
    tipo_control: row.materiales?.tipo_control || 'sin_control',
    codigo_barras: row.materiales?.codigo_barras || null,
    fisico: Number(row.fisico ?? row.disponible ?? 0),
    disponible: Number(row.disponible ?? 0),
    reservado: Number(row.reservado ?? 0),
    stock_actual: Number(row.disponible ?? 0), // alias para compatibilidad
    costo_promedio: Number(row.materiales?.costo_promedio ?? 0),
    costo_promedio_usd: Number(row.materiales?.costo_promedio_usd ?? 0),
    stock_minimo: Number(row.materiales?.stock_minimo ?? 0),
    stock_maximo: Number(row.materiales?.stock_maximo ?? 0),
    punto_reorden: Number(row.materiales?.punto_reorden ?? 0),
    stock_seguridad: Number(row.materiales?.stock_seguridad ?? 0),
    punto_reorden_efectivo: Number(row.materiales?.punto_reorden ?? 0) + Number(row.materiales?.stock_seguridad ?? 0),
    almacen: row.almacenes?.nombre || row.almacenes?.codigo || row.almacen_id,
    lote: row.lote,
    serie: row.serie,
    vencimiento: row.vencimiento,
    updated_at: row.updated_at,
  }));
}

export async function getMaterialesBajoReorden(empresaId, filtroSociedades = null) {
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('stock')
    .select('*, materiales(codigo, descripcion, unidad, punto_reorden, stock_minimo, stock_seguridad), almacenes(nombre)')
    .eq('empresa_id', empresaId);
  q = aplicarFiltroSociedades(q, filtroSociedades);
  const { data } = await q;
  return (data || []).filter(s => {
    const puntoReorden = Number(s.materiales?.punto_reorden ?? s.materiales?.stock_minimo ?? 0);
    const stockSeguridad = Number(s.materiales?.stock_seguridad ?? 0);
    const reordenEfectivo = puntoReorden + stockSeguridad;
    return reordenEfectivo > 0 && Number(s.disponible ?? 0) <= reordenEfectivo;
  });
}

export async function getStockEnTransito(empresaId, filtroSociedades = null) {
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('ordenes_compra')
    .select('id, sociedad_id, codigo, proveedor_id, items, moneda, fecha_entrega_esperada')
    .eq('empresa_id', empresaId)
    .in('estado', ['emitida', 'aprobada', 'en_proceso']);
  q = aplicarFiltroSociedades(q, filtroSociedades);
  const { data } = await q;
  return (data || []).flatMap(oc =>
    (oc.items || []).map(item => ({
      oc_id: oc.id,
      sociedad_id: oc.sociedad_id || null,
      oc_codigo: oc.codigo,
      descripcion: item.descripcion,
      cantidad_pedida: item.cantidad,
      costo_unitario: item.precio_unitario || 0,
      moneda: oc.moneda,
      fecha_esperada: oc.fecha_entrega_esperada,
    }))
  );
}

// ─── Entrada de recepción (wired desde Compras) ───────────────────────────────
// Busca el material en el catálogo por código. Si no existe, lo crea.
// Actualiza costo_promedio ponderado correctamente.
// El costo_unitario recibido desde Compras representa valor del bien sin IGV.
export async function registrarEntradaDesdeRecepcion(empresaId, item, referencia, usuarioId) {
  const supabase = await getSupabaseClient();

  // Buscar material por código en catálogo
  const codigoMat = item.codigo || item.sku || null;
  let materialId = item.material_id || null;

  if (!materialId && codigoMat) {
    const { data } = await supabase.from('materiales').select('id').eq('empresa_id', empresaId).eq('codigo', codigoMat).maybeSingle();
    materialId = data?.id || null;
  }

  // Si no se encuentra, crear material básico en catálogo
  if (!materialId) {
    const { data: newMat, error } = await supabase.from('materiales').insert({
      id: mkId('mat'),
      empresa_id: empresaId,
      codigo: codigoMat || mkId('mat'),
      descripcion: item.descripcion || 'Material sin descripción',
      unidad: item.unidad || 'und',
      familia: item.familia || 'Compras',
      costo_promedio: Number(item.costo_unitario || item.precio_unitario || 0),
      moneda: item.moneda || 'PEN',
      tipo_control: 'sin_control',
      estado: 'activo',
    }).select('id').single();
    if (error) throw error;
    materialId = newMat.id;
  }

  // Resolver almacén
  const almacen = await resolverAlmacen(supabase, empresaId, item.almacen_id, item.almacen_codigo || 'ALM-001');

  return registrarMovimiento(empresaId, {
    tipo: 'entrada',
    motivo: referencia?.tipo === 'recepcion' ? 'recepcion_oc' : (referencia?.tipo || 'recepcion'),
    material_id: materialId,
    almacen_id: almacen.id,
    cantidad: Number(item.cantidad || item.recibido || 0),
    costo_unitario: Number(item.costo_unitario || item.precio_unitario || 0),
    costo_unitario_usd: Number(item.costo_unitario_usd || 0),
    moneda: item.moneda || 'PEN',
    lote: item.lote || null,
    serie: item.serie || null,
    vencimiento: item.vencimiento || null,
    proveedor_id: referencia?.proveedor_id || null,
    nro_documento: referencia?.nro_documento || null,
    referencia_tipo: referencia?.tipo || 'recepcion',
    referencia_id: referencia?.id || null,
    observacion: referencia?.observacion || null,
    usuario_id: usuarioId,
    sociedad_id: referencia?.sociedad_id ?? item.sociedad_id ?? null,
    valorizacion_estado: referencia?.valorizacion_estado || null,
    orden_compra_id: referencia?.orden_compra_id || referencia?.oc_id || null,
    orden_compra_item_idx: referencia?.orden_compra_item_idx ?? null,
    precio_unitario_provisional: referencia?.precio_unitario_provisional ?? null,
    precio_unitario_real: referencia?.precio_unitario_real ?? null,
    recepcion_id: referencia?.recepcion_id || null,
  });
}

// ─── Consumo desde OT (wired desde Operaciones) ───────────────────────────────
// Descuenta stock al costo promedio vigente y registra en kardex con created_by
export async function registrarEntradaOcPendienteFactura(empresaId, { orden_compra_id, proveedor_id = null, moneda = 'PEN', almacen_id = null, almacen_codigo = 'ALM-001', lineas = [] }, usuarioId) {
  if (!empresaId || !orden_compra_id) throw new Error('Empresa y OC son requeridas');
  const supabase = await getSupabaseClient();
  const { data: ordenCompra, error: ocError } = await supabase
    .from('ordenes_compra')
    .select('sociedad_id')
    .eq('id', orden_compra_id)
    .eq('empresa_id', empresaId)
    .single();
  if (ocError) throw ocError;
  const entradas = [];
  for (const linea of lineas || []) {
    const cantidad = Number(linea.cantidad_recibida ?? linea.cantidad ?? 0);
    if (!cantidad || cantidad <= 0) continue;
    const precioOC = Number(linea.precio_unitario_oc ?? linea.precio_unitario ?? linea.costo_unitario ?? 0);
    const entrada = await registrarEntradaDesdeRecepcion(empresaId, {
      codigo: linea.codigo || null,
      material_id: linea.material_id || null,
      descripcion: linea.descripcion,
      unidad: linea.unidad || 'und',
      cantidad,
      costo_unitario: precioOC,
      precio_unitario: precioOC,
      moneda,
      almacen_id,
      almacen_codigo,
    }, {
      tipo: 'oc_pendiente_factura',
      id: orden_compra_id,
      orden_compra_id,
      sociedad_id: ordenCompra?.sociedad_id || null,
      orden_compra_item_idx: linea.index ?? linea.orden_compra_item_idx ?? null,
      proveedor_id,
      valorizacion_estado: 'pendiente_factura',
      precio_unitario_provisional: precioOC,
      observacion: `Llegada fisica OC ${linea.oc_codigo || orden_compra_id} pendiente factura`,
    }, usuarioId);
    entradas.push({ ...entrada, orden_compra_id, orden_compra_item_idx: linea.index ?? linea.orden_compra_item_idx ?? null, cantidad, precio_unitario_provisional: precioOC });
  }
  if (!entradas.length) throw new Error('Ingresa al menos una cantidad recibida mayor a cero');
  return entradas;
}

export async function listarEntradasOcPendientesValorizacion(empresaId, ordenCompraId = null, filtroSociedades = null) {
  if (!empresaId) return [];
  if (normalizarFiltroSociedades(filtroSociedades).sinResultados) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('kardex')
    .select('id, empresa_id, sociedad_id, material_id, almacen_id, tipo, motivo, cantidad, costo_unitario, costo_total, moneda, referencia_tipo, referencia_id, orden_compra_id, orden_compra_item_idx, valorizacion_estado, precio_unitario_provisional, precio_unitario_real, recepcion_id, anulado, created_at')
    .eq('empresa_id', empresaId)
    .eq('anulado', false)
    .eq('valorizacion_estado', 'pendiente_factura')
    .order('created_at', { ascending: false });
  if (ordenCompraId) q = q.eq('orden_compra_id', ordenCompraId);
  q = aplicarFiltroSociedades(q, filtroSociedades);
  const { data, error } = await q;
  if (error) {
    if (error.message?.includes('column') || error.code === 'PGRST204') return [];
    throw error;
  }
  return data || [];
}

export async function ajustarValorizacionOcPendiente(empresaId, { orden_compra_id, recepcion_id = null, items = [] } = {}) {
  if (!empresaId || !orden_compra_id) return [];
  const supabase = await getSupabaseClient();
  const pendientes = await listarEntradasOcPendientesValorizacion(empresaId, orden_compra_id);
  if (!pendientes.length) return [];

  const ajustes = [];
  for (const item of items || []) {
    const idx = item.index ?? item.orden_compra_item_idx ?? null;
    const precioReal = Number(item.precio_unitario_factura ?? item.precio_unitario ?? 0);
    const matches = pendientes.filter(k => {
      if (idx !== null && idx !== undefined && k.orden_compra_item_idx !== null && k.orden_compra_item_idx !== undefined) {
        return Number(k.orden_compra_item_idx) === Number(idx);
      }
      return item.material_id && k.material_id === item.material_id;
    });
    for (const kdx of matches) {
      const cantidad = Number(kdx.cantidad || 0);
      const precioAnterior = Number(kdx.costo_unitario || kdx.precio_unitario_provisional || 0);
      if (!cantidad || !Number.isFinite(precioReal) || precioReal < 0) continue;

      const { error: updErr } = await supabase.from('kardex').update({
        costo_unitario: precioReal,
        costo_total: precioReal * cantidad,
        precio_unitario_real: precioReal,
        valorizacion_estado: 'definitivo',
        recepcion_id: recepcion_id || null,
        valorizado_at: new Date().toISOString(),
      }).eq('id', kdx.id);
      if (updErr) throw updErr;

      const { data: stocks, error: stockErr } = await supabase.from('stock')
        .select('fisico, disponible')
        .eq('empresa_id', empresaId)
        .eq('material_id', kdx.material_id);
      if (stockErr) throw stockErr;
      const stockFisico = (stocks || []).reduce((sum, row) => sum + Number(row.fisico ?? row.disponible ?? 0), 0);
      const { data: mat } = await supabase.from('materiales').select('costo_promedio').eq('id', kdx.material_id).maybeSingle();
      const costoActual = Number(mat?.costo_promedio ?? 0);
      const valorActual = stockFisico * costoActual;
      const deltaValor = cantidad * (precioReal - precioAnterior);
      const nuevoCostoPromedio = stockFisico > 0 ? Math.max(0, (valorActual + deltaValor) / stockFisico) : precioReal;
      await supabase.from('materiales').update({
        costo_promedio: nuevoCostoPromedio,
        updated_at: new Date().toISOString(),
      }).eq('id', kdx.material_id);

      ajustes.push({ kardex_id: kdx.id, material_id: kdx.material_id, cantidad, precio_anterior: precioAnterior, precio_real: precioReal, costo_promedio: nuevoCostoPromedio });
    }
  }
  return ajustes;
}

export async function registrarConsumoOT(supabase, empresaId, itemsADescontar, otId, usuarioId, sociedadId = null) {
  const { data: ot, error: otError } = await supabase.from('ordenes_trabajo')
    .select('id').eq('id', otId).eq('empresa_id', empresaId).maybeSingle();
  if (otError) throw otError;
  if (!ot) throw new Error('La OT de consumo no pertenece al tenant.');
  const { data: sociedadOt, error: sociedadOtError } = await supabase.rpc('obtener_sociedad_de_ot', { p_ot_id: otId });
  if (sociedadOtError) throw sociedadOtError;
  if (sociedadId && sociedadOt && sociedadId !== sociedadOt) {
    throw new Error('La sociedad del consumo no coincide con la sociedad derivada de la OT.');
  }
  const { sociedadId: sociedadOperacionId } = await validarSociedadActivaParaEscritura(
    supabase, empresaId, sociedadOt || sociedadId, 'La OT debe tener una sociedad derivable para consumir inventario.',
  );
  for (const item of itemsADescontar) {
    if (!item.material_id) continue;
    try {
      const { data: mat } = await supabase.from('materiales')
        .select('costo_promedio').eq('id', item.material_id).maybeSingle();
      const costoPromedio = Number(mat?.costo_promedio ?? 0);

      let stockQ = supabase.from('stock').select('id, disponible, fisico, reservado, almacen_id')
        .eq('empresa_id', empresaId).eq('material_id', item.material_id);
      stockQ = sociedadOperacionId ? stockQ.eq('sociedad_id', sociedadOperacionId) : stockQ.is('sociedad_id', null);
      if (item.lote != null) stockQ = stockQ.eq('lote', item.lote);
      if (item.serie != null) stockQ = stockQ.eq('serie', item.serie);
      const { data: stocks } = await stockQ;
      if (!stocks?.length) continue;

      const stock = stocks[0];
      const cantidadADescontar = Math.min(Number(item.cantidad), Number(stock.disponible));

      await supabase.from('kardex').insert({
        id: mkId('kdx'),
        empresa_id: empresaId,
        sociedad_id: sociedadOperacionId,
        material_id: item.material_id,
        almacen_id: item.almacen_id || stock.almacen_id || null,
        tipo: 'salida',
        motivo: 'consumo_ot',
        cantidad: cantidadADescontar,
        costo_unitario: costoPromedio,
        costo_total: costoPromedio * cantidadADescontar,
        moneda: 'PEN',
        lote: item.lote || null,
        serie: item.serie || null,
        vencimiento: item.vencimiento || null,
        referencia_tipo: 'ot',
        referencia_id: otId,
        observacion: `Consumo OT ${otId}`,
        created_by: usuarioId || null,
        anulado: false,
        saldo_cantidad: Math.max(0, Number(stock.fisico ?? stock.disponible) - cantidadADescontar),
      });

      await supabase.from('stock').update({
        fisico: Math.max(0, Number(stock.fisico ?? stock.disponible) - cantidadADescontar),
        disponible: Math.max(0, Number(stock.disponible) - cantidadADescontar),
        updated_at: new Date().toISOString(),
      }).eq('id', stock.id);
    } catch (_) {
      console.error('registrarConsumoOT item:', item.material_id, _.message);
    }
  }
}
