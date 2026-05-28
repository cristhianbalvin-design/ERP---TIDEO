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
    centro_costo_id: req.centro_costo_id || null,
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
    est_mo: ot.est_mo ?? null,
    est_materiales: ot.est_materiales ?? null,
    est_terceros: ot.est_terceros ?? null,
    est_logistica: ot.est_logistica ?? null,
    est_detalle: ot.est_detalle || null,
    centro_costo_id: ot.centro_costo_id || null,
    centro_beneficio_id: ot.centro_beneficio_id || null,
    es_adicional: ot.es_adicional || false,
    participantes_admin: ot.participantes_admin || [],
  };

  const insert = async (payload) => supabase.from('ordenes_trabajo').insert(payload);
  let payload = { ...row };
  for (let i = 0; i < 5; i += 1) {
    const result = await insert(payload);
    if (!result?.error) return result;
    const msg = result.error.message || '';
    const missingColumn = msg.match(/column "([^"]+)" of relation/)?.[1] || msg.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || !(missingColumn in payload)) return result;
    delete payload[missingColumn];
    if (Object.keys(payload).length === 0) return result;
  }
  return insert(payload);
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
    p_centro_costo_id: ot.centro_costo_id || null,
    p_centro_beneficio_id: ot.centro_beneficio_id || null,
  });
}

export async function actualizarOT(supabase, otId, datos) {
  const row = {};

  if (datos.cuenta_id !== undefined) row.cuenta_id = datos.cuenta_id || null;
  if (datos.os_cliente_id !== undefined) row.os_cliente_id = datos.os_cliente_id || null;
  if (datos.backlog_id !== undefined) row.backlog_id = datos.backlog_id || null;
  if (datos.tipo !== undefined || datos.servicio !== undefined) row.servicio = datos.tipo || datos.servicio || 'General';
  if (datos.descripcion !== undefined) row.descripcion = datos.descripcion || null;
  if (datos.sede !== undefined || datos.direccion_ejecucion !== undefined) row.direccion_ejecucion = datos.sede || datos.direccion_ejecucion || null;
  if (datos.fecha_inicio !== undefined || datos.fecha_programada !== undefined) row.fecha_programada = datos.fecha_inicio || datos.fecha_programada || null;
  if (datos.fecha_fin !== undefined) row.fecha_fin = datos.fecha_fin || null;
  if (datos.tecnico_responsable_id !== undefined) row.tecnico_responsable_id = datos.tecnico_responsable_id || null;
  if (datos.supervisor !== undefined) row.supervisor = datos.supervisor || null;
  if (datos.estado !== undefined) row.estado = datos.estado || 'programada';
  if (datos.centro_costo_id !== undefined) row.centro_costo_id = datos.centro_costo_id || null;
  if (datos.centro_beneficio_id !== undefined) row.centro_beneficio_id = datos.centro_beneficio_id || null;
  if (datos.facturable !== undefined) row.facturable = Boolean(datos.facturable);
  if (datos.es_adicional !== undefined) row.es_adicional = Boolean(datos.es_adicional);
  if (datos.avance !== undefined) {
    row.avance_pct = datos.avance;
  }
  if (datos.costoReal !== undefined) {
    row.costo_real = datos.costoReal;
  }
  if (datos.costoEst !== undefined) row.costo_estimado = datos.costoEst;
  if (datos.est_mo !== undefined) row.est_mo = datos.est_mo !== '' ? (Number(datos.est_mo) || null) : null;
  if (datos.est_materiales !== undefined) row.est_materiales = datos.est_materiales !== '' ? (Number(datos.est_materiales) || null) : null;
  if (datos.est_terceros !== undefined) row.est_terceros = datos.est_terceros !== '' ? (Number(datos.est_terceros) || null) : null;
  if (datos.est_logistica !== undefined) row.est_logistica = datos.est_logistica !== '' ? (Number(datos.est_logistica) || null) : null;
  if (datos.est_detalle !== undefined) row.est_detalle = datos.est_detalle;
  if (datos.participantes_admin !== undefined) row.participantes_admin = datos.participantes_admin;
  row.updated_at = new Date().toISOString();
  if (!Object.keys(row).length) return;

  const update = async (payload) => supabase.from('ordenes_trabajo').update(payload).eq('id', otId);
  let payload = { ...row };

  for (let i = 0; i < 5; i += 1) {
    const result = await update(payload);
    if (!result?.error) return result;

    const missingColumn = result.error.message?.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || !(missingColumn in payload)) return result;

    delete payload[missingColumn];
    if (Object.keys(payload).length === 0) return result;
  }

  return update(payload);
}

export async function eliminarOT(supabase, otId) {
  return supabase.from('ordenes_trabajo').delete().eq('id', otId);
}

export async function subirConformidadOT(supabase, empresaId, cierreId, file) {
  const path = `${empresaId}/${cierreId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from('conformidades-ot').upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('conformidades-ot').getPublicUrl(path);
  return { nombre: file.name, url: urlData.publicUrl };
}

export async function persistirParteDiario(supabase, empresaId, parte) {
  const row = {
    id: parte.id,
    empresa_id: empresaId,
    orden_trabajo_id: parte.ot_id,
    tecnico_id: parte.tecnico_id || null,
    tecnico_nombre: parte.tecnico || null,
    fecha: parte.fecha || new Date().toISOString().split('T')[0],
    horas_normales: parte.horas || 0,
    numero: parte.numero || null,
    actividad: parte.actividad || parte.descripcion || null,
    avance_pct: parte.avance_reportado || 0,
    materiales: parte.materiales_usados || [],
    logistica_lineas: parte.logistica_lineas || [],
    terceros_lineas: parte.terceros_lineas || [],
    evidencias: parte.evidencias || [],
    estado: parte.estado || 'en_revision',
    datos_borrador: parte.estado === 'borrador' ? {
      tareas_trabajadas: parte.tareas_trabajadas || [],
      actividades_adicionales: parte.actividades_adicionales || [],
      avance_ajustado_manual: parte.avance_ajustado_manual || false,
      avance_global: parte.avance_global || parte.avance_reportado || 0,
      observaciones: parte.observaciones || '',
      es_restriccion: parte.es_restriccion || false,
    } : null,
  };

  const insert = async (payload) => supabase.from('partes_diarios').insert(payload);
  let payload = { ...row };

  for (let i = 0; i < 5; i += 1) {
    const result = await insert(payload);
    if (!result?.error) return result;

    const msg = result.error.message || '';
    const missingColumn = msg.match(/column "([^"]+)" of relation/)?.[1]
      || msg.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || !(missingColumn in payload)) return result;

    delete payload[missingColumn];
    if (Object.keys(payload).length === 0) return result;
  }

  return insert(payload);
}

export async function actualizarParteDiario(supabase, parteId, datos) {
  const doUpdate = async (payload) =>
    supabase.from('partes_diarios').update(payload).eq('id', parteId).select('id');

  let payload = { ...datos };
  for (let i = 0; i < 5; i++) {
    const result = await doUpdate(payload);
    if (!result?.error) {
      if (!result.data?.length) {
        return { ...result, error: { message: 'No se actualizó ningún registro. Verifica permisos (RLS).' } };
      }
      return result;
    }
    const msg = result.error.message || '';
    const missingColumn =
      msg.match(/column "([^"]+)" of relation/)?.[1] ||
      msg.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || !(missingColumn in payload)) return result;
    delete payload[missingColumn];
    if (Object.keys(payload).length === 0) return result;
  }
  return doUpdate(payload);
}

export async function persistirCierreTecnico(supabase, empresaId, cierre) {
  const row = {
    id: cierre.id,
    empresa_id: empresaId,
    orden_trabajo_id: cierre.ot_id,
    fecha_cierre: cierre.fecha_fin_real || cierre.fecha || new Date().toISOString().split('T')[0],
    resultado: cierre.resultado || 'conforme',
    observaciones: cierre.observaciones || null,
    conformidad_cliente: cierre.conformidad_cliente || null,
    evidencias: cierre.evidencias || [],
    cerrado_por: cierre.cerrado_por || null,
    estado: 'cerrado',
    descripcion_trabajo: cierre.descripcion_trabajo || null,
    fecha_inicio_real: cierre.fecha_inicio_real || null,
    horas_total: cierre.horas_total || 0,
    avance_final: cierre.avance_final ?? 100,
    costo_terceros: cierre.costo_terceros || 0,
    costo_logistica: cierre.costo_logistica || 0,
    token_conformidad: cierre.token_conformidad || null,
    conformidad_archivo_url: cierre.conformidad_archivo_url || null,
    conformidad_archivo_nombre: cierre.conformidad_archivo_nombre || null,
  };

  const insert = async (payload) => supabase.from('cierres_tecnicos').insert(payload);
  let payload = { ...row };
  for (let i = 0; i < 5; i += 1) {
    const result = await insert(payload);
    if (!result?.error) return result;
    const msg = result.error.message || '';
    const missingColumn = msg.match(/column "([^"]+)" of relation/)?.[1] || msg.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || !(missingColumn in payload)) return result;
    delete payload[missingColumn];
    if (Object.keys(payload).length === 0) return result;
  }
  return insert(payload);
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

  const [otsR, partesR, backlogR, plannerR, cierresR] = await Promise.all([
    q('ordenes_trabajo').order('created_at', { ascending: false }),
    q('partes_diarios').order('created_at', { ascending: false }),
    q('backlog').order('created_at', { ascending: false }),
    q('planner_asignaciones').neq('estado', 'cancelado').order('fecha', { ascending: true }),
    q('cierres_tecnicos').order('created_at', { ascending: false }),
  ]);

  const mapOT = (ot) => ({
    ...ot,
    estado: ot.estado === 'cerrado' ? 'cerrada' : ot.estado,
    avance: ot.avance_pct,
    costoEst: ot.costo_estimado,
    costoReal: ot.costo_real,
    tipo: ot.servicio,
    sede: ot.direccion_ejecucion,
    fecha_inicio: ot.fecha_programada,
    fecha_fin: ot.fecha_fin,
    facturable: ot.facturable,
    supervisor: ot.supervisor,
    responsable_id: ot.tecnico_responsable_id,
    cliente: ot.cuenta_id,
    es_adicional: ot.es_adicional || false,
  });

  const mapParte = (p) => ({
    ...p,
    ...(p.datos_borrador || {}),
    ot_id: p.orden_trabajo_id,
    tecnico_id: p.tecnico_id,
    tecnico: p.tecnico_nombre || p.tecnico_id,
    horas: p.horas_normales,
    avance_reportado: p.avance_pct,
    actividades: p.actividad,
    materiales_usados: p.materiales || [],
    logistica_lineas: p.logistica_lineas || [],
    terceros_lineas: p.terceros_lineas || [],
  });

  const mapCierre = (c) => ({
    ...c,
    ot_id: c.orden_trabajo_id,
    fecha: c.fecha_cierre,
  });

  return {
    ots: (otsR.data || []).map(mapOT),
    partes: (partesR.data || []).map(mapParte),
    backlog: backlogR.data || [],
    plannerAsignaciones: plannerR.data || [],
    cierresTecnicos: (cierresR.data || []).map(mapCierre),
    errors: [otsR, partesR, backlogR, plannerR, cierresR]
      .filter(r => r.error)
      .map(r => r.error?.message),
  };
}
