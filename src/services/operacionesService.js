import { isSupabaseMode } from '../lib/dataMode.js';

export async function persistirBacklog(supabase, empresaId, req) {
  const row = {
    id: req.id,
    empresa_id: empresaId,
    os_cliente_id: req.os_cliente_id || null,
    cuenta_id: req.cuenta_id || null,
    descripcion: req.descripcion,
    prioridad: req.prioridad || 'media',
    estado: req.estado || 'pendiente',
    fecha_requerida: req.fecha_requerida || null,
    centro_costo: req.centro_costo || null,
  };
  return supabase.from('backlog').insert(row);
}

export async function actualizarBacklog(supabase, backlogId, datos) {
  return supabase.from('backlog').update(datos).eq('id', backlogId);
}

export async function persistirOT(supabase, empresaId, ot) {
  const row = {
    id: ot.id,
    empresa_id: empresaId,
    os_cliente_id: ot.os_cliente_id || null,
    backlog_id: ot.backlog_id || null,
    numero: ot.numero,
    cuenta_id: ot.cuenta_id || ot.cliente || null,
    servicio: ot.tipo || 'General',
    descripcion: ot.descripcion || null,
    direccion_ejecucion: ot.direccion_ejecucion || ot.sede || null,
    fecha_programada: ot.fecha_programada || ot.fecha_inicio || null,
    tecnico_responsable_id: ot.tecnico_responsable_id || ot.responsable_id || null,
    estado: ot.estado || 'borrador',
    avance_pct: ot.avance || 0,
    costo_estimado: ot.costoEst || 0,
    costo_real: ot.costoReal || 0,
  };
  return supabase.from('ordenes_trabajo').insert(row);
}

export async function crearOTDesdeOSRpc(supabase, empresaId, osClienteId, ot) {
  return supabase.rpc('crear_ot_desde_os_cliente', {
    p_empresa_id: empresaId,
    p_os_cliente_id: osClienteId,
    p_ot_id: ot.id,
    p_numero: ot.numero,
    p_servicio: ot.tipo || ot.servicio || 'Servicio cliente',
    p_descripcion: ot.descripcion || null,
    p_direccion_ejecucion: ot.direccion_ejecucion || ot.sede || null,
    p_fecha_programada: ot.fecha_programada || ot.fecha_inicio || null,
    p_tecnico_responsable_id: ot.tecnico_responsable_id || ot.responsable_id || null,
    p_estado: ot.estado || 'programada',
    p_costo_estimado: ot.costoEst ?? ot.costo_estimado ?? 0,
  });
}

export async function actualizarOT(supabase, otId, datos) {
  const row = { ...datos };
  if (datos.avance !== undefined) {
    row.avance_pct = datos.avance;
    delete row.avance;
  }
  if (datos.costoReal !== undefined) {
    row.costo_real = datos.costoReal;
    delete row.costoReal;
  }
  if (!Object.keys(row).length) return;
  return supabase.from('ordenes_trabajo').update(row).eq('id', otId);
}

export async function persistirParteDiario(supabase, empresaId, parte) {
  const row = {
    id: parte.id,
    empresa_id: empresaId,
    orden_trabajo_id: parte.ot_id,
    tecnico_id: parte.tecnico_id || parte.tecnico || null,
    fecha: parte.fecha || new Date().toISOString().split('T')[0],
    horas_normales: parte.horas || 0,
    actividad: parte.actividad || parte.descripcion || null,
    avance_pct: parte.avance_reportado || 0,
    materiales: parte.materiales_usados || [],
    evidencias: parte.evidencias || [],
    estado: parte.estado || 'en_revision',
  };
  return supabase.from('partes_diarios').insert(row);
}

export async function actualizarParteDiario(supabase, parteId, datos) {
  return supabase.from('partes_diarios').update(datos).eq('id', parteId);
}

export async function persistirCierreTecnico(supabase, empresaId, cierre) {
  const row = {
    id: cierre.id,
    empresa_id: empresaId,
    orden_trabajo_id: cierre.ot_id,
    fecha_cierre: cierre.fecha || new Date().toISOString().split('T')[0],
    resultado: cierre.resultado || 'conforme',
    observaciones: cierre.observaciones || null,
    conformidad_cliente: cierre.conformidad_cliente || null,
    evidencias: cierre.evidencias || [],
    cerrado_por: cierre.cerrado_por || null,
    estado: 'cerrado'
  };
  return supabase.from('cierres_tecnicos').insert(row);
}

export async function consumirInventario(supabase, empresaId, itemsADescontar, otId) {
  for (const item of itemsADescontar) {
    // 1. Insertar en kardex
    await supabase.from('kardex').insert({
      id: `kdx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      empresa_id: empresaId,
      material_id: item.material_id, // Usamos id del material real, o codigo temporal si es mock
      almacen_id: item.almacen_id || null,
      tipo: 'salida',
      cantidad: item.cantidad,
      referencia_tipo: 'Consumo OT',
      referencia_id: otId,
      observacion: `Consumo para OT ${otId}`
    });

    // 2. Actualizar stock (esto idealmente lo haria un trigger o rpc)
    // Primero intentamos buscar el stock
    const { data: stocks } = await supabase.from('stock')
      .select('id, disponible')
      .eq('empresa_id', empresaId)
      .eq('material_id', item.material_id);
    
    if (stocks && stocks.length > 0) {
      const stock = stocks[0];
      await supabase.from('stock')
        .update({ disponible: Math.max(0, stock.disponible - item.cantidad) })
        .eq('id', stock.id);
    }
  }
}

export async function loadOpsFromSupabase(supabase, empresaId) {
  if (!isSupabaseMode() || !supabase || !empresaId) return null;

  const q = table => supabase.from(table).select('*').eq('empresa_id', empresaId);

  const [otsR, partesR, backlogR] = await Promise.all([
    q('ordenes_trabajo').order('created_at', { ascending: false }),
    q('partes_diarios').order('created_at', { ascending: false }),
    q('backlog').order('created_at', { ascending: false }),
  ]);

  const mapOT = (ot) => ({
    ...ot,
    avance: ot.avance_pct,
    costoEst: ot.costo_estimado,
    costoReal: ot.costo_real,
    tipo: ot.servicio,
    sede: ot.direccion_ejecucion,
    fecha_inicio: ot.fecha_programada,
    responsable_id: ot.tecnico_responsable_id,
    cliente: ot.cuenta_id
  });

  const mapParte = (p) => ({
    ...p,
    ot_id: p.orden_trabajo_id,
    tecnico: p.tecnico_id,
    horas: p.horas_normales,
    avance_reportado: p.avance_pct,
    actividades: p.actividad,
    materiales_usados: p.materiales || []
  });

  return {
    ots: (otsR.data || []).map(mapOT),
    partes: (partesR.data || []).map(mapParte),
    backlog: backlogR.data || [],
    errors: [otsR, partesR, backlogR]
      .filter(r => r.error)
      .map(r => r.error?.message),
  };
}
