import { getSupabaseClient } from '../lib/supabaseClient.js';
import { registrarMovimiento, anularMovimiento } from './inventarioService.js';
import { obtenerEstadoMultisociedad, validarSociedadActivaParaEscritura } from './sociedadEscrituraService.js';

const mkId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

// ─── Motivos SUNAT (tabla oficial) ───────────────────────────────────────────
export const MOTIVOS_TRASLADO = [
  { codigo: '01', nombre: 'Venta' },
  { codigo: '02', nombre: 'Compra' },
  { codigo: '03', nombre: 'Traslado entre establecimientos de la misma empresa' },
  { codigo: '04', nombre: 'Traslado en consignación' },
  { codigo: '05', nombre: 'Devolución' },
  { codigo: '13', nombre: 'Traslado para transformación' },
  { codigo: '17', nombre: 'Traslado de bienes para su distribución' },
  { codigo: '18', nombre: 'Traslado de bienes destinados a la producción' },
  { codigo: '99', nombre: 'Otros' },
];

// Campos SUNAT obligatorios según modalidad
export const CAMPOS_OBLIGATORIOS_GR = {
  comunes: ['fecha_emision', 'fecha_inicio_traslado', 'motivo_traslado', 'modalidad',
            'partida_direccion', 'llegada_direccion', 'destinatario_ruc_dni',
            'destinatario_razon_social', 'peso_bruto_total'],
  remitente: ['transportista_ruc', 'transportista_razon_social', 'vehiculo_placa', 'conductor_dni'],
  transportista: ['transportista_ruc', 'transportista_razon_social', 'transportista_nro_mtc'],
};

// ─── Correlativo (atómico: read-then-upsert; suficiente para uso no concurrente) ──
async function siguienteCorrelativo(supabase, empresaId, tipoDocumento, serie = 'T001', sociedadId = null) {
  let query = supabase
    .from('correlativos_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('tipo_documento', tipoDocumento)
    .eq('serie', serie);
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
      tipo_documento: tipoDocumento, serie,
      sociedad_id: sociedadId,
      ultimo_numero: siguiente,
      updated_at: new Date().toISOString(),
    });
  }

  return { numero: siguiente, numero_completo: `${serie}-${String(siguiente).padStart(8, '0')}` };
}

// ─── Validar campos obligatorios SUNAT ────────────────────────────────────────
export function validarGuiaParaEmitir(guia, multisociedadHabilitado = false) {
  const faltantes = [];
  for (const campo of CAMPOS_OBLIGATORIOS_GR.comunes) {
    if (!guia[campo] && guia[campo] !== 0) faltantes.push(campo);
  }
  const extra = guia.modalidad === 'transportista'
    ? CAMPOS_OBLIGATORIOS_GR.transportista
    : CAMPOS_OBLIGATORIOS_GR.remitente;
  for (const campo of extra) {
    if (!guia[campo]) faltantes.push(campo);
  }
  if (!guia.lineas?.length && !guia.items?.length) faltantes.push('lineas (al menos 1 ítem)');
  if (multisociedadHabilitado && !guia.sociedad_origen_id) faltantes.push('sociedad_origen_id');
  return faltantes;
}

async function validarStockOrigenGuia(supabase, empresaId, almacenId, sociedadId, lineas) {
  if (!almacenId) throw new Error('Selecciona el almacén origen de la guía.');
  if (!lineas.length || lineas.some(linea => !linea.material_id)) {
    throw new Error('Cada línea del traslado debe estar vinculada a un material para validar su stock societario.');
  }

  const materialIds = [...new Set(lineas.map(linea => linea.material_id))];
  const { data: stocks, error } = await supabase
    .from('stock')
    .select('material_id,lote,serie,disponible')
    .eq('empresa_id', empresaId)
    .eq('almacen_id', almacenId)
    .eq('sociedad_id', sociedadId)
    .in('material_id', materialIds);
  if (error) throw error;

  for (const linea of lineas) {
    const candidatos = (stocks || []).filter(stock =>
      stock.material_id === linea.material_id
      && (!linea.lote || stock.lote === linea.lote)
      && (!linea.serie || stock.serie === linea.serie)
    );
    const disponible = candidatos.reduce((total, stock) => total + Number(stock.disponible || 0), 0);
    if (disponible < Number(linea.cantidad || 0)) {
      throw new Error(`El stock origen de ${linea.descripcion || linea.material_id} no pertenece a la sociedad o es insuficiente.`);
    }
  }
}

async function resolverSociedadesGuia(supabase, empresaId, form, lineas) {
  const multisociedadHabilitado = await obtenerEstadoMultisociedad(supabase, empresaId);
  if (!multisociedadHabilitado) {
    return {
      sociedadOrigenId: form.sociedad_origen_id || null,
      sociedadDestinoId: form.sociedad_destino_id || null,
    };
  }

  let sociedadOrigenId = null;
  let sociedadDestinoId = form.sociedad_destino_id || null;
  const tipoOrigen = form.tipo_origen || 'traslado_interno';

  if (tipoOrigen === 'despacho_venta' && form.orden_venta_id) {
    const { data: ov, error } = await supabase
      .from('ordenes_venta')
      .select('id,sociedad_id')
      .eq('id', form.orden_venta_id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (error) throw error;
    if (!ov) throw new Error('La Orden de Venta vinculada no pertenece al tenant.');
    if (form.sociedad_origen_id && form.sociedad_origen_id !== ov.sociedad_id) {
      throw new Error('La sociedad informada no coincide con la Orden de Venta vinculada.');
    }
    sociedadOrigenId = ov.sociedad_id;
  } else if (tipoOrigen === 'despacho_servicio') {
    if (!form.ot_id) throw new Error('Selecciona una OT real para el despacho de servicio.');
    const { data: ot, error: otError } = await supabase
      .from('ordenes_trabajo')
      .select('id')
      .eq('id', form.ot_id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (otError) throw otError;
    if (!ot) throw new Error('La OT seleccionada no pertenece al tenant.');
    const { data: sociedadOt, error: sociedadOtError } = await supabase.rpc('obtener_sociedad_de_ot', { p_ot_id: ot.id });
    if (sociedadOtError) throw sociedadOtError;
    if (form.sociedad_origen_id && form.sociedad_origen_id !== sociedadOt) {
      throw new Error('La sociedad informada no coincide con la sociedad derivada de la OT.');
    }
    sociedadOrigenId = sociedadOt || null;
  } else {
    sociedadOrigenId = form.sociedad_origen_id || null;
  }

  sociedadOrigenId = (await validarSociedadActivaParaEscritura(
    supabase,
    empresaId,
    sociedadOrigenId,
    tipoOrigen === 'despacho_servicio'
      ? 'La OT seleccionada no tiene sociedad derivable.'
      : 'Selecciona una sociedad concreta para la guía.',
  )).sociedadId;

  if (tipoOrigen === 'traslado_interno') {
    sociedadDestinoId = sociedadOrigenId;
    await validarStockOrigenGuia(supabase, empresaId, form.almacen_origen_id, sociedadOrigenId, lineas);
  } else if (tipoOrigen === 'transferencia_intercompania') {
    sociedadDestinoId = (await validarSociedadActivaParaEscritura(
      supabase, empresaId, sociedadDestinoId, 'Selecciona la sociedad destino de la transferencia intercompañía.',
    )).sociedadId;
    if (sociedadDestinoId === sociedadOrigenId) {
      throw new Error('La transferencia intercompañía requiere sociedades diferentes.');
    }
  } else if (sociedadDestinoId) {
    sociedadDestinoId = (await validarSociedadActivaParaEscritura(
      supabase, empresaId, sociedadDestinoId, 'La sociedad destino no es válida.',
    )).sociedadId;
  }

  return { sociedadOrigenId, sociedadDestinoId };
}

// ─── CRUD Guías ───────────────────────────────────────────────────────────────

export async function getGuias(empresaId, { estado, tipo_origen, desde, hasta } = {}) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('guias_remision').select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  if (estado) q = q.eq('estado', estado);
  if (tipo_origen) q = q.eq('tipo_origen', tipo_origen);
  if (desde) q = q.gte('fecha_emision', desde);
  if (hasta) q = q.lte('fecha_emision', hasta);
  const { data, error } = await q;
  if (error) { console.error('getGuias:', error); return []; }

  // Cargar líneas por separado
  const ids = (data || []).map(g => g.id);
  let lineasMap = {};
  if (ids.length) {
    const { data: lineas } = await supabase.from('guias_remision_lineas').select('*')
      .in('guia_id', ids).order('orden', { ascending: true });
    for (const l of lineas || []) {
      if (!lineasMap[l.guia_id]) lineasMap[l.guia_id] = [];
      lineasMap[l.guia_id].push(l);
    }
  }
  return (data || []).map(g => ({ ...g, lineas: lineasMap[g.id] || [] }));
}

export async function getGuia(guiaId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('guias_remision').select('*').eq('id', guiaId).single();
  if (error) throw error;
  const { data: lineas } = await supabase.from('guias_remision_lineas').select('*')
    .eq('guia_id', guiaId).order('orden', { ascending: true });
  return { ...data, lineas: lineas || [] };
}

export async function crearGuia(empresaId, form, usuarioId) {
  if (!empresaId) throw new Error('Sin empresa activa');
  const supabase = await getSupabaseClient();

  const serie = form.serie || 'T001';
  const guiaId = mkId('gr');
  const { lineas: lineasForm = [], ...guiaDatos } = form;
  const { sociedadOrigenId, sociedadDestinoId } = await resolverSociedadesGuia(supabase, empresaId, guiaDatos, lineasForm);
  const { numero, numero_completo } = await siguienteCorrelativo(supabase, empresaId, 'guia_remision', serie, sociedadOrigenId);

  const { data: guia, error } = await supabase.from('guias_remision').insert({
    id: guiaId,
    empresa_id: empresaId,
    serie,
    numero,
    numero_completo,
    fecha_emision: guiaDatos.fecha_emision || new Date().toISOString().slice(0, 10),
    fecha_inicio_traslado: guiaDatos.fecha_inicio_traslado || new Date().toISOString().slice(0, 10),
    tipo_origen: guiaDatos.tipo_origen || 'traslado_interno',
    motivo_traslado: guiaDatos.motivo_traslado || '03',
    modalidad: guiaDatos.modalidad || 'remitente',
    orden_venta_id: guiaDatos.orden_venta_id || null,
    ot_id: guiaDatos.ot_id || null,
    almacen_origen_id: guiaDatos.almacen_origen_id || null,
    sociedad_origen_id: sociedadOrigenId,
    sociedad_destino_id: sociedadDestinoId,
    partida_direccion: guiaDatos.partida_direccion || '',
    partida_ubigeo: guiaDatos.partida_ubigeo || null,
    llegada_direccion: guiaDatos.llegada_direccion || '',
    llegada_ubigeo: guiaDatos.llegada_ubigeo || null,
    destinatario_ruc_dni: guiaDatos.destinatario_ruc_dni || '',
    destinatario_razon_social: guiaDatos.destinatario_razon_social || '',
    peso_bruto_total: Number(guiaDatos.peso_bruto_total || 0),
    unidad_peso: guiaDatos.unidad_peso || 'KGM',
    transportista_id: guiaDatos.transportista_id || null,
    transportista_ruc: guiaDatos.transportista_ruc || null,
    transportista_razon_social: guiaDatos.transportista_razon_social || null,
    transportista_nro_mtc: guiaDatos.transportista_nro_mtc || null,
    vehiculo_id: guiaDatos.vehiculo_id || null,
    vehiculo_placa: guiaDatos.vehiculo_placa || null,
    vehiculo_cert_habilitacion: guiaDatos.vehiculo_cert_habilitacion || null,
    conductor_id: guiaDatos.conductor_id || null,
    conductor_nombre: guiaDatos.conductor_nombre || null,
    conductor_dni: guiaDatos.conductor_dni || null,
    conductor_brevete: guiaDatos.conductor_brevete || null,
    estado: 'borrador',
    kardex_salida_ids: [],
    created_by: usuarioId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;

  // Insertar líneas
  if (lineasForm.length) {
    const lineasInsert = lineasForm.map((l, i) => ({
      id: mkId('grl'),
      empresa_id: empresaId,
      guia_id: guiaId,
      material_id: l.material_id || null,
      descripcion: l.descripcion,
      codigo: l.codigo || null,
      unidad: l.unidad || 'NIU',
      cantidad: Number(l.cantidad || 1),
      peso_unitario: Number(l.peso_unitario || 0),
      peso_total: Number(l.cantidad || 1) * Number(l.peso_unitario || 0),
      precio_unitario: Number(l.precio_unitario || 0),
      valor_total: Number(l.cantidad || 1) * Number(l.precio_unitario || 0),
      moneda: l.moneda || 'PEN',
      lote: l.lote || null,
      serie: l.serie || null,
      orden: i + 1,
    }));
    await supabase.from('guias_remision_lineas').insert(lineasInsert);
  }

  return { ...guia, lineas: lineasForm };
}

export async function actualizarGuia(guiaId, cambios, usuarioId) {
  const supabase = await getSupabaseClient();
  const { lineas: lineasForm, ...datos } = cambios;

  const { data, error } = await supabase.from('guias_remision').update({
    ...datos,
    updated_by: usuarioId || null,
    updated_at: new Date().toISOString(),
  }).eq('id', guiaId).select().single();
  if (error) throw error;

  // Reemplazar líneas si se proveen
  if (lineasForm !== undefined) {
    await supabase.from('guias_remision_lineas').delete().eq('guia_id', guiaId);
    if (lineasForm.length) {
      const empresaId = data.empresa_id;
      const lineasInsert = lineasForm.map((l, i) => ({
        id: mkId('grl'),
        empresa_id: empresaId,
        guia_id: guiaId,
        material_id: l.material_id || null,
        descripcion: l.descripcion,
        codigo: l.codigo || null,
        unidad: l.unidad || 'NIU',
        cantidad: Number(l.cantidad || 1),
        peso_unitario: Number(l.peso_unitario || 0),
        peso_total: Number(l.cantidad || 1) * Number(l.peso_unitario || 0),
        precio_unitario: Number(l.precio_unitario || 0),
        valor_total: Number(l.cantidad || 1) * Number(l.precio_unitario || 0),
        moneda: l.moneda || 'PEN',
        lote: l.lote || null,
        serie: l.serie || null,
        orden: i + 1,
      }));
      await supabase.from('guias_remision_lineas').insert(lineasInsert);
    }
  }

  const { data: lineas } = await supabase.from('guias_remision_lineas').select('*')
    .eq('guia_id', guiaId).order('orden', { ascending: true });
  return { ...data, lineas: lineas || [] };
}

// ─── Emitir guía (borrador → emitida) ────────────────────────────────────────
// Valida todos los campos obligatorios SUNAT antes de cambiar estado.
export async function emitirGuia(guiaId, usuarioId) {
  const guia = await getGuia(guiaId);
  if (guia.estado !== 'borrador') throw new Error(`La guía ya está en estado "${guia.estado}"`);

  const supabase = await getSupabaseClient();
  const multisociedadHabilitado = await obtenerEstadoMultisociedad(supabase, guia.empresa_id);
  const faltantes = validarGuiaParaEmitir(guia, multisociedadHabilitado);
  if (faltantes.length) {
    throw new Error(`Faltan campos obligatorios SUNAT: ${faltantes.join(', ')}`);
  }

  return actualizarGuia(guiaId, { estado: 'emitida' }, usuarioId);
}

// ─── En tránsito (emitida → en_transito) ─────────────────────────────────────
export async function marcarEnTransito(guiaId, usuarioId) {
  const supabase = await getSupabaseClient();
  const { data: guia } = await supabase.from('guias_remision').select('estado').eq('id', guiaId).single();
  if (guia.estado !== 'emitida') throw new Error('Solo se puede marcar en tránsito una guía emitida');
  return actualizarGuia(guiaId, { estado: 'en_transito' }, usuarioId);
}

// ─── Confirmar entrega (en_transito → entregada) ──────────────────────────────
// Genera movimientos de salida en el WMS al costo promedio vigente.
export async function confirmarEntrega(guiaId, usuarioId) {
  const guia = await getGuia(guiaId);
  if (!['emitida', 'en_transito'].includes(guia.estado)) {
    throw new Error(`No se puede confirmar entrega en estado "${guia.estado}"`);
  }
  const supabase = await getSupabaseClient();
  if (await obtenerEstadoMultisociedad(supabase, guia.empresa_id)) {
    await validarSociedadActivaParaEscritura(
      supabase, guia.empresa_id, guia.sociedad_origen_id, 'La guía no tiene sociedad origen y no puede afectar inventario.',
    );
  }

  const kardexIds = [];
  if (guia.almacen_origen_id && guia.lineas?.length) {
    for (const linea of guia.lineas) {
      if (!linea.material_id) continue;
      try {
        const res = await registrarMovimiento(guia.empresa_id, {
          tipo: 'salida',
          motivo: guia.tipo_origen === 'traslado_interno' ? 'transferencia_guia' : 'despacho_guia',
          material_id: linea.material_id,
          almacen_id: guia.almacen_origen_id,
          cantidad: Number(linea.cantidad),
          lote: linea.lote || null,
          serie: linea.serie || null,
          referencia_tipo: 'guia_remision',
          referencia_id: guiaId,
          nro_documento: guia.numero_completo,
          observacion: `Despacho guía ${guia.numero_completo}`,
          usuario_id: usuarioId,
          sociedad_id: guia.sociedad_origen_id || null,
        });
        kardexIds.push(res.kardex_id);
      } catch (err) {
        console.error(`confirmarEntrega: error registrando salida para ${linea.material_id}:`, err.message);
      }
    }
  }

  // Sincronizar cantidad_despachada en OV vinculada
  if (guia.orden_venta_id && guia.lineas?.length) {
    await sincronizarDespachoOV(guia.orden_venta_id, guia.lineas, 'sumar');
  }

  return actualizarGuia(guiaId, {
    estado: 'entregada',
    kardex_salida_ids: kardexIds,
  }, usuarioId);
}

// ─── Sync OV: suma o resta cantidad_despachada y recalcula estado ─────────────
async function sincronizarDespachoOV(ovId, lineasGuia, operacion) {
  const supabase = await getSupabaseClient();

  for (const linea of lineasGuia) {
    if (!linea.material_id) continue;
    const { data: ovLineas } = await supabase
      .from('ordenes_venta_lineas')
      .select('id, cantidad, cantidad_despachada')
      .eq('orden_venta_id', ovId)
      .eq('material_id', linea.material_id)
      .limit(1);
    if (!ovLineas?.length) continue;
    const ovl = ovLineas[0];
    const actual = Number(ovl.cantidad_despachada || 0);
    const delta = Number(linea.cantidad);
    const nueva = operacion === 'sumar'
      ? actual + delta
      : Math.max(0, actual - delta);
    await supabase.from('ordenes_venta_lineas')
      .update({ cantidad_despachada: nueva })
      .eq('id', ovl.id);
  }

  const { data: todasLineas } = await supabase
    .from('ordenes_venta_lineas')
    .select('cantidad, cantidad_despachada')
    .eq('orden_venta_id', ovId);
  if (!todasLineas?.length) return;

  const todasCompletas = todasLineas.every(l => Number(l.cantidad_despachada || 0) >= Number(l.cantidad));
  const algunaDespachada = todasLineas.some(l => Number(l.cantidad_despachada || 0) > 0);
  const nuevoEstado = todasCompletas ? 'despachada'
    : algunaDespachada ? 'parcialmente_despachada'
    : 'confirmada';

  await supabase.from('ordenes_venta')
    .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', ovId);
}

// ─── Anular guía ──────────────────────────────────────────────────────────────
// Revierte movimientos de inventario si ya se generaron.
export async function anularGuia(guiaId, motivo, usuarioId) {
  if (!motivo) throw new Error('El motivo de anulación es obligatorio');
  const guia = await getGuia(guiaId);
  if (guia.estado === 'anulada') throw new Error('La guía ya está anulada');

  // Revertir kardex si la guía ya generó salidas
  const kardexIds = guia.kardex_salida_ids || [];
  for (const kidx of kardexIds) {
    try {
      await anularMovimiento(kidx, `anulacion_guia_${guiaId}: ${motivo}`, usuarioId);
    } catch (err) {
      console.error(`anularGuia: no se pudo revertir kardex ${kidx}:`, err.message);
    }
  }

  // Revertir cantidad_despachada en OV vinculada (solo si la guía había sido entregada)
  if (guia.orden_venta_id && guia.lineas?.length && guia.estado === 'entregada') {
    await sincronizarDespachoOV(guia.orden_venta_id, guia.lineas, 'restar');
  }

  return actualizarGuia(guiaId, {
    estado: 'anulada',
    anulado: true,
    anulado_motivo: motivo,
    anulado_por: usuarioId || null,
    anulado_at: new Date().toISOString(),
  }, usuarioId);
}

// ─── CRUD Transportistas ─────────────────────────────────────────────────────

export async function getTransportistas(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('transportistas').select(`
    *,
    vehiculos:vehiculos_transporte(id, placa, marca, modelo, tipo, activo),
    conductores:conductores_transporte(id, nombre, dni, brevete, activo)
  `).eq('empresa_id', empresaId).order('razon_social', { ascending: true });
  if (error) { console.error('getTransportistas:', error); return []; }
  return data || [];
}

export async function crearTransportista(empresaId, form) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('transportistas').insert({
    id: mkId('tra'), empresa_id: empresaId,
    ruc: form.ruc,
    razon_social: form.razon_social,
    nombre_comercial: form.nombre_comercial || null,
    tipo_operador: form.tipo_operador || 'tercero',
    nro_mtc: form.nro_mtc || null,
    direccion: form.direccion || null,
    telefono: form.telefono || null,
    email: form.email || null,
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarTransportista(transportistaId, cambios) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('transportistas').update({
    ...cambios,
    updated_at: new Date().toISOString(),
  }).eq('id', transportistaId).select().single();
  if (error) throw error;
  return data;
}

// ─── CRUD Vehículos ───────────────────────────────────────────────────────────

export async function getVehiculos(empresaId, transportistaId = null) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('vehiculos_transporte').select('*').eq('empresa_id', empresaId);
  if (transportistaId) q = q.eq('transportista_id', transportistaId);
  const { data } = await q.order('placa', { ascending: true });
  return data || [];
}

export async function crearVehiculo(empresaId, form) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('vehiculos_transporte').insert({
    id: mkId('veh'), empresa_id: empresaId,
    transportista_id: form.transportista_id || null,
    placa: form.placa,
    marca: form.marca || null,
    modelo: form.modelo || null,
    anio: form.anio ? Number(form.anio) : null,
    tipo: form.tipo || 'camion',
    nro_certificado_habilitacion: form.nro_certificado_habilitacion || null,
    activo: true,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

// ─── CRUD Conductores ─────────────────────────────────────────────────────────

export async function getConductores(empresaId, transportistaId = null) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let q = supabase.from('conductores_transporte').select('*').eq('empresa_id', empresaId);
  if (transportistaId) q = q.eq('transportista_id', transportistaId);
  const { data } = await q.order('nombre', { ascending: true });
  return data || [];
}

export async function crearConductor(empresaId, form) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('conductores_transporte').insert({
    id: mkId('con'), empresa_id: empresaId,
    transportista_id: form.transportista_id || null,
    nombre: form.nombre,
    dni: form.dni,
    brevete: form.brevete || null,
    categoria_brevete: form.categoria_brevete || null,
    vigencia_brevete: form.vigencia_brevete || null,
    activo: true,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}
