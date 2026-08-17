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
    tipo_servicio_interno_id: ot.tipo_servicio_interno_id || null,
    servicio: ot.tipo || 'General',
    descripcion: ot.descripcion || null,
    direccion_ejecucion: ot.direccion_ejecucion || ot.sede || null,
    fecha_programada: ot.fecha_programada || ot.fecha_inicio || null,
    tecnico_responsable_id: ot.tecnico_responsable_id || ot.responsable_id || null,
    estado: ot.estado || 'borrador',
    avance_pct: ot.avance || 0,
    costo_estimado: ot.costo_estimado ?? ot.costoEst ?? 0,
    costo_estimado_ot: ot.costo_estimado_ot ?? ot.costoEst ?? ot.costo_estimado ?? 0,
    costo_real: ot.costoReal || 0,
    est_mo: ot.est_mo ?? null,
    est_materiales: ot.est_materiales ?? null,
    est_terceros: ot.est_terceros ?? null,
    est_logistica: ot.est_logistica ?? null,
    est_detalle: ot.est_detalle || null,
    estimado_detalle: ot.estimado_detalle || ot.est_detalle || null,
    estimado_congelado_en: ot.estimado_congelado_en || null,
    real_detalle: ot.real_detalle || null,
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
  if (datos.tipo_servicio_interno_id !== undefined) row.tipo_servicio_interno_id = datos.tipo_servicio_interno_id || null;
  if (datos.os_cliente_id !== undefined) row.os_cliente_id = datos.os_cliente_id || null;
  if (datos.backlog_id !== undefined) row.backlog_id = datos.backlog_id || null;
  if (datos.tipo !== undefined || datos.servicio !== undefined) row.servicio = datos.tipo || datos.servicio || 'General';
  if (datos.descripcion !== undefined) row.descripcion = datos.descripcion || null;
  if (datos.sede !== undefined || datos.direccion_ejecucion !== undefined) row.direccion_ejecucion = datos.sede || datos.direccion_ejecucion || null;
  if (datos.fecha_inicio !== undefined || datos.fecha_programada !== undefined) row.fecha_programada = datos.fecha_inicio || datos.fecha_programada || null;
  if (datos.fecha_fin !== undefined) row.fecha_fin = datos.fecha_fin || null;
  if (datos.tecnico_responsable_id !== undefined) row.tecnico_responsable_id = datos.tecnico_responsable_id || null;
  if (datos.supervisor !== undefined) row.supervisor = datos.supervisor || null;
  if (datos.estado !== undefined) {
    row.estado = datos.estado || 'programada';
    const estadoNorm = String(row.estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (['ejecucion', 'en ejecucion', 'en_ejecucion'].includes(estadoNorm) && datos.estimado_congelado_en === undefined) {
      row.estimado_congelado_en = new Date().toISOString();
    }
  }
  if (datos.centro_costo_id !== undefined) row.centro_costo_id = datos.centro_costo_id || null;
  if (datos.centro_beneficio_id !== undefined) row.centro_beneficio_id = datos.centro_beneficio_id || null;
  if (datos.facturable !== undefined) row.facturable = Boolean(datos.facturable);
  if (datos.es_adicional !== undefined) row.es_adicional = Boolean(datos.es_adicional);
  if (datos.avance !== undefined) {
    row.avance_pct = datos.avance;
  }
  if (datos.avance_supervisor_pct !== undefined) row.avance_supervisor_pct = datos.avance_supervisor_pct;
  if (datos.avance_supervisor_nota !== undefined) row.avance_supervisor_nota = datos.avance_supervisor_nota || null;
  if (datos.avance_supervisor_en !== undefined) row.avance_supervisor_en = datos.avance_supervisor_en || null;
  if (datos.avance_supervisor_por !== undefined) row.avance_supervisor_por = datos.avance_supervisor_por || null;
  if (datos.costoReal !== undefined) {
    row.costo_real = datos.costoReal;
  }
  if (datos.costoEst !== undefined) row.costo_estimado = datos.costoEst;
  if (datos.costo_estimado !== undefined) row.costo_estimado = Number(datos.costo_estimado) || 0;
  if (datos.costo_estimado_ot !== undefined) row.costo_estimado_ot = datos.costo_estimado_ot !== '' ? (Number(datos.costo_estimado_ot) || 0) : null;
  if (datos.est_mo !== undefined) row.est_mo = datos.est_mo !== '' ? (Number(datos.est_mo) || null) : null;
  if (datos.est_materiales !== undefined) row.est_materiales = datos.est_materiales !== '' ? (Number(datos.est_materiales) || null) : null;
  if (datos.est_terceros !== undefined) row.est_terceros = datos.est_terceros !== '' ? (Number(datos.est_terceros) || null) : null;
  if (datos.est_logistica !== undefined) row.est_logistica = datos.est_logistica !== '' ? (Number(datos.est_logistica) || null) : null;
  if (datos.est_detalle !== undefined) row.est_detalle = datos.est_detalle;
  if (datos.estimado_detalle !== undefined) row.estimado_detalle = datos.estimado_detalle;
  if (datos.estimado_congelado_en !== undefined) row.estimado_congelado_en = datos.estimado_congelado_en;
  if (datos.real_detalle !== undefined) row.real_detalle = datos.real_detalle;
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

export async function upsertCostoOT(supabase, empresaId, otId, costos = {}) {
  const manoObra = Number(costos.mano_obra || 0);
  const materiales = Number(costos.materiales || 0);
  const terceros = Number(costos.servicios_terceros || 0);
  const logistica = Number(costos.logistica || 0);
  const otros = Number(costos.otros || 0);
  const row = {
    id: costos.id || `cot_${otId}`,
    empresa_id: empresaId,
    orden_trabajo_id: otId,
    mano_obra: manoObra,
    materiales,
    servicios_terceros: terceros,
    logistica,
    otros,
    total: manoObra + materiales + terceros + logistica + otros,
    moneda: costos.moneda || 'PEN',
    calculado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return supabase
    .from('costos_ot')
    .upsert(row, { onConflict: 'orden_trabajo_id' });
}

const toNumber = value => Number(value || 0) || 0;
const normalizeState = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const lineAmount = item => toNumber(item.subtotal ?? item.total ?? item.monto ?? (toNumber(item.cantidad) * toNumber(item.costo_unitario ?? item.costo_unit ?? item.precio_unitario)));
const sumLines = lines => (Array.isArray(lines) ? lines : []).reduce((sum, item) => sum + lineAmount(item), 0);
const getRate = person => toNumber(person?.tarifa_hora ?? person?.costo_hora_real ?? person?.costo ?? person?.costo_hora);

async function selectRows(supabase, table, empresaId, apply = q => q) {
  if (!supabase || !empresaId) return [];
  const result = await apply(supabase.from(table).select('*').eq('empresa_id', empresaId));
  if (result?.error) {
    console.warn(`[costos] ${table}:`, result.error.message);
    return [];
  }
  return result?.data || [];
}

export async function cargarTareasOT(supabase, otId, empresaId) {
  if (!supabase || !otId || !empresaId) return [];
  const tareas = await selectRows(supabase, 'ot_tareas', empresaId, q =>
    q.eq('ot_id', otId).order('orden', { ascending: true }).order('creado_en', { ascending: true })
  );
  const partes = await selectRows(supabase, 'partes_diarios', empresaId, q =>
    q.eq('orden_trabajo_id', otId).eq('estado', 'aprobado')
  );
  return tareas.map(t => {
    const vinculados = partes.filter(p => p.tarea_id === t.id);
    const horas = vinculados.reduce((s, p) => s + toNumber(p.horas_normales ?? p.horas), 0);
    const ultimo = [...vinculados].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0] || null;
    return {
      ...t,
      horas_reales: t.horas_reales ?? horas,
      ultima_actividad_fecha: ultimo?.fecha || null,
      ultimo_parte_numero: ultimo?.numero || ultimo?.id || null,
    };
  });
}

export async function cargarTareasPendientesTecnico(supabase, tecnicoId, empresaId) {
  if (!supabase || !tecnicoId || !empresaId) return [];
  const rows = await selectRows(supabase, 'ot_tareas', empresaId, q =>
    q.eq('tecnico_id', tecnicoId).eq('completada', false).order('actualizado_en', { ascending: false })
  );
  const otIds = [...new Set(rows.map(r => r.ot_id).filter(Boolean))];
  const ots = otIds.length
    ? await selectRows(supabase, 'ordenes_trabajo', empresaId, q => q.in('id', otIds))
    : [];
  return rows.map(t => ({ ...t, ot: ots.find(o => o.id === t.ot_id) || null }));
}

export async function crearTarea(supabase, datos, empresaId) {
  if (!supabase || !empresaId) return { data: null, error: null };
  const row = {
    id: datos.id,
    empresa_id: empresaId,
    ot_id: datos.ot_id,
    titulo: datos.titulo || datos.descripcion,
    descripcion: datos.descripcion || null,
    tecnico_id: datos.tecnico_id || null,
    tecnico_nombre: datos.tecnico_nombre || null,
    tecnico_tipo: datos.tecnico_tipo || null,
    estado: datos.estado || 'pendiente',
    horas_estimadas: datos.horas_estimadas !== '' ? (Number(datos.horas_estimadas) || null) : null,
    horas_reales: datos.horas_reales ?? 0,
    avance_pct: datos.avance_pct ?? 0,
    completada: Boolean(datos.completada),
    orden: Number(datos.orden || 0),
    creado_por: datos.creado_por || null,
  };
  return supabase.from('ot_tareas').insert(row).select('*').single();
}

export async function actualizarAvanceTarea(supabase, tareaId, avancePct, empresaId) {
  if (!supabase || !tareaId || !empresaId) return { data: null, error: null };
  return supabase
    .from('ot_tareas')
    .update({ avance_pct: Number(avancePct || 0), actualizado_en: new Date().toISOString() })
    .eq('id', tareaId)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
}

export async function completarTarea(supabase, tareaId, usuarioNombre, empresaId) {
  if (!supabase || !tareaId || !empresaId) return { data: null, error: null };
  const partes = await selectRows(supabase, 'partes_diarios', empresaId, q =>
    q.eq('tarea_id', tareaId).eq('estado', 'aprobado')
  );
  const horas = partes.reduce((s, p) => s + toNumber(p.horas_normales ?? p.horas), 0);
  return supabase
    .from('ot_tareas')
    .update({
      estado: 'completada',
      completada: true,
      completada_en: new Date().toISOString(),
      completada_por: usuarioNombre || null,
      horas_reales: horas,
    })
    .eq('id', tareaId)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
}

export async function reabrirTarea(supabase, tareaId, empresaId) {
  if (!supabase || !tareaId || !empresaId) return { data: null, error: null };
  return supabase
    .from('ot_tareas')
    .update({ estado: 'en_progreso', completada: false, completada_en: null, completada_por: null })
    .eq('id', tareaId)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
}

export async function actualizarAvanceSupervisor(supabase, otId, avanceNuevo, nota, usuarioNombre, empresaId) {
  if (!supabase || !otId || !empresaId) return { data: null, error: null };
  const { data: actual } = await supabase
    .from('ordenes_trabajo')
    .select('avance_supervisor_pct, avance_pct')
    .eq('id', otId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  const avanceAnterior = actual?.avance_supervisor_pct ?? actual?.avance_pct ?? null;
  const now = new Date().toISOString();
  const updatePayload = {
    avance_supervisor_pct: Number(avanceNuevo),
    avance_supervisor_nota: nota,
    avance_supervisor_en: now,
    avance_supervisor_por: usuarioNombre || null,
    avance_pct: Number(avanceNuevo),
    updated_at: now,
  };
  const otResult = await supabase
    .from('ordenes_trabajo')
    .update(updatePayload)
    .eq('id', otId)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
  if (otResult?.error) return otResult;
  await supabase.from('ot_avance_historial').insert({
    empresa_id: empresaId,
    ot_id: otId,
    avance_anterior: avanceAnterior,
    avance_nuevo: Number(avanceNuevo),
    nota,
    registrado_por: usuarioNombre || null,
  });
  return otResult;
}

export async function cargarHistorialAvance(supabase, otId, empresaId) {
  if (!supabase || !otId || !empresaId) return [];
  return selectRows(supabase, 'ot_avance_historial', empresaId, q =>
    q.eq('ot_id', otId).order('registrado_en', { ascending: false })
  );
}

export async function procesarCierreOTConTareas(supabase, otId, tareasPendientesIds, notaSnapshot, usuarioNombre, empresaId) {
  if (!supabase || !otId || !empresaId) return { data: null, error: null };
  const now = new Date().toISOString();
  if (tareasPendientesIds && tareasPendientesIds.length > 0) {
    await supabase.from('ot_tareas')
      .update({ estado: 'cerrada_sin_completar', actualizado_en: now })
      .in('id', tareasPendientesIds)
      .eq('empresa_id', empresaId);
  }
  await supabase.from('ot_avance_historial').insert({
    empresa_id: empresaId,
    ot_id: otId,
    avance_anterior: null,
    avance_nuevo: null,
    nota: `CIERRE CON TAREAS INCOMPLETAS: ${notaSnapshot}`,
    registrado_por: usuarioNombre || null,
    registrado_en: now
  });
  return { success: true };
}

export async function calcularCostoRealOT(supabase, otId, empresaId) {
  if (!supabase || !otId || !empresaId) {
    return { mo: 0, materiales: 0, terceros: 0, logistica: 0, total: 0 };
  }

  const [partes, operativos, administrativos, tareosAdmin, kardex, ordenesServicio, comprasGastos] = await Promise.all([
    selectRows(supabase, 'partes_diarios', empresaId, q => q.eq('orden_trabajo_id', otId).eq('estado', 'aprobado')),
    selectRows(supabase, 'personal_operativo', empresaId),
    selectRows(supabase, 'personal_administrativo', empresaId),
    selectRows(supabase, 'tareos_admin', empresaId, q => q.eq('ot_id', otId).eq('estado', 'enviado')),
    selectRows(supabase, 'kardex', empresaId, q => q.eq('referencia_id', otId)),
    selectRows(supabase, 'ordenes_servicio_interna', empresaId, q => q.eq('ot_id', otId)),
    selectRows(supabase, 'compras_gastos', empresaId, q => q.eq('ot_vinc_id', otId)),
  ]);

  const people = new Map([...operativos, ...administrativos].map(p => [p.id, p]));
  const moPartes = partes.reduce((sum, parte) => sum + toNumber(parte.horas_normales ?? parte.horas) * getRate(people.get(parte.tecnico_id)), 0);
  const moAdmin = tareosAdmin.reduce((sum, tareo) => sum + toNumber(tareo.horas) * getRate(people.get(tareo.personal_id)), 0);

  const materialesPartes = partes.reduce((sum, parte) => sum + sumLines(parte.materiales || parte.materiales_usados), 0);
  const materialesKardex = kardex.reduce((sum, mov) => {
    const isSalida = normalizeState(mov.tipo).includes('salida') || normalizeState(mov.referencia_tipo).includes('consumo');
    return isSalida ? sum + lineAmount(mov) : sum;
  }, 0);

  const tercerosPartes = partes.reduce((sum, parte) => sum + sumLines(parte.terceros_lineas), 0);
  const tercerosOSI = ordenesServicio
    .filter(os => ['cerrada', 'cerrado'].includes(normalizeState(os.estado)))
    .reduce((sum, os) => sum + toNumber(os.total), 0);

  const logisticaPartes = partes.reduce((sum, parte) => sum + sumLines(parte.logistica_lineas), 0);
  const logisticaCompras = comprasGastos.reduce((sum, gasto) => sum + toNumber(gasto.monto ?? gasto.total), 0);

  const mo = moPartes + moAdmin;
  const materiales = materialesPartes > 0 ? materialesPartes : materialesKardex;
  const terceros = tercerosPartes + tercerosOSI;
  const logistica = logisticaPartes + logisticaCompras;
  return { mo, materiales, terceros, logistica, total: mo + materiales + terceros + logistica };
}

export async function calcularCostosComprometidosOT(supabase, otId, empresaId) {
  if (!supabase || !otId || !empresaId) {
    return { os_abiertas: 0, oc_abiertas: 0, total: 0 };
  }

  const [ordenesServicio, ordenesCompra] = await Promise.all([
    selectRows(supabase, 'ordenes_servicio_interna', empresaId, q => q.eq('ot_id', otId)),
    selectRows(supabase, 'ordenes_compra', empresaId, q => q.eq('ot_id', otId)),
  ]);

  const os_abiertas = ordenesServicio
    .filter(os => !['cerrada', 'cerrado'].includes(normalizeState(os.estado)))
    .reduce((sum, os) => sum + toNumber(os.total), 0);
  const oc_abiertas = ordenesCompra
    .filter(oc => !['recibida', 'recibido', 'cerrada', 'cerrado'].includes(normalizeState(oc.estado)))
    .reduce((sum, oc) => sum + toNumber(oc.total), 0);
  return { os_abiertas, oc_abiertas, total: os_abiertas + oc_abiertas };
}

export async function calcularCostosOS(supabase, osId, empresaId) {
  if (!supabase || !osId || !empresaId) {
    return {
      ots: [],
      subtotal_estimado_ots: 0,
      subtotal_real_ots: 0,
      overhead_estimado: 0,
      overhead_real: 0,
      real_total: 0,
      estimado_total: 0,
      comprometido: { os_abiertas: 0, oc_abiertas: 0, total: 0 },
    };
  }

  const [osRows, ots, administrativos, tareosOverhead] = await Promise.all([
    selectRows(supabase, 'os_clientes', empresaId, q => q.eq('id', osId)),
    selectRows(supabase, 'ordenes_trabajo', empresaId, q => q.eq('os_cliente_id', osId)),
    selectRows(supabase, 'personal_administrativo', empresaId),
    selectRows(supabase, 'tareos_admin', empresaId, q => q.eq('os_id', osId).is('ot_id', null).eq('estado', 'enviado')),
  ]);
  const os = osRows[0] || {};
  const people = new Map(administrativos.map(p => [p.id, p]));

  const otsCosteadas = await Promise.all(ots.map(async ot => {
    const real = await calcularCostoRealOT(supabase, ot.id, empresaId);
    const comprometido = await calcularCostosComprometidosOT(supabase, ot.id, empresaId);
    return {
      ...ot,
      estimado_ot: toNumber(ot.costo_estimado_ot ?? ot.costo_estimado),
      real,
      comprometido,
    };
  }));

  const subtotal_estimado_ots = otsCosteadas.reduce((sum, ot) => sum + ot.estimado_ot, 0);
  const subtotal_real_ots = otsCosteadas.reduce((sum, ot) => sum + toNumber(ot.real?.total), 0);
  const overhead_estimado = normalizeState(os.overhead_modo) === 'porcentaje'
    ? subtotal_estimado_ots * toNumber(os.overhead_estimado_pct) / 100
    : toNumber(os.overhead_estimado_monto);
  const overhead_real = tareosOverhead.reduce((sum, t) => sum + toNumber(t.horas) * getRate(people.get(t.personal_id)), 0);
  const comprometido = otsCosteadas.reduce((acc, ot) => ({
    os_abiertas: acc.os_abiertas + toNumber(ot.comprometido?.os_abiertas),
    oc_abiertas: acc.oc_abiertas + toNumber(ot.comprometido?.oc_abiertas),
    total: acc.total + toNumber(ot.comprometido?.total),
  }), { os_abiertas: 0, oc_abiertas: 0, total: 0 });

  return {
    os,
    ots: otsCosteadas,
    subtotal_estimado_ots,
    subtotal_real_ots,
    overhead_estimado,
    overhead_real,
    estimado_total: subtotal_estimado_ots + overhead_estimado,
    real_total: subtotal_real_ots + overhead_real,
    comprometido,
  };
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
    tarea_id: parte.tarea_id || null,
    avance_tarea_reportado: parte.avance_tarea_reportado ?? null,
    avance_tarea_validado: parte.avance_tarea_validado ?? null,
    materiales: parte.materiales_usados || [],
    logistica_lineas: parte.logistica_lineas || [],
    terceros_lineas: parte.terceros_lineas || [],
    evidencias: parte.evidencias || [],
    estado: parte.estado || 'en_revision',
    datos_borrador: parte.estado === 'borrador' ? {
      tareas_trabajadas: parte.tareas_trabajadas || [],
      actividades_adicionales: parte.actividades_adicionales || [],
      tarea_id: parte.tarea_id || null,
      avance_tarea_reportado: parte.avance_tarea_reportado ?? null,
      tarea_completada_reportada: parte.tarea_completada_reportada || false,
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

export async function consumirInventario(supabase, empresaId, itemsADescontar, otId, sociedadId = null) {
  for (const item of itemsADescontar) {
    // 1. Insertar en kardex
    await supabase.from('kardex').insert({
      id: `kdx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      empresa_id: empresaId,
      sociedad_id: sociedadId,
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
    let stockQuery = supabase.from('stock')
      .select('id, disponible')
      .eq('empresa_id', empresaId)
      .eq('material_id', item.material_id);
    stockQuery = sociedadId ? stockQuery.eq('sociedad_id', sociedadId) : stockQuery.is('sociedad_id', null);
    const { data: stocks } = await stockQuery;
    
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

  const [otsR, partesR, backlogR, plannerR, cierresR, tareasR, avanceHistR] = await Promise.all([
    q('ordenes_trabajo').order('created_at', { ascending: false }),
    q('partes_diarios').order('created_at', { ascending: false }),
    q('backlog').order('created_at', { ascending: false }),
    q('planner_asignaciones').neq('estado', 'cancelado').order('fecha', { ascending: true }),
    q('cierres_tecnicos').order('created_at', { ascending: false }),
    q('ot_tareas').order('orden', { ascending: true }).order('creado_en', { ascending: true }),
    q('ot_avance_historial').order('registrado_en', { ascending: false }),
  ]);

  const tareasPorOt = (tareasR.data || []).reduce((acc, t) => {
    const lista = acc.get(t.ot_id) || [];
    lista.push({
      ...t,
      descripcion: t.descripcion || t.titulo,
      completado: Boolean(t.completada),
      responsable_id: t.tecnico_id,
    });
    acc.set(t.ot_id, lista);
    return acc;
  }, new Map());
  const avanceHistPorOt = (avanceHistR.data || []).reduce((acc, h) => {
    const lista = acc.get(h.ot_id) || [];
    lista.push(h);
    acc.set(h.ot_id, lista);
    return acc;
  }, new Map());

  const mapOT = (ot) => ({
    ...ot,
    estado: ot.estado === 'cerrado' ? 'cerrada' : ot.estado,
    avance: ot.avance_supervisor_pct ?? ot.avance_pct,
    costoEst: ot.costo_estimado_ot ?? ot.costo_estimado,
    costo_estimado_ot: ot.costo_estimado_ot,
    costoReal: ot.costo_real,
    realDetalle: ot.real_detalle,
    estimado_detalle: ot.estimado_detalle,
    tipo: ot.servicio,
    sede: ot.direccion_ejecucion,
    fecha_inicio: ot.fecha_programada,
    fecha_fin: ot.fecha_fin,
    facturable: ot.facturable,
    supervisor: ot.supervisor,
    responsable_id: ot.tecnico_responsable_id,
    cliente: ot.cuenta_id,
    es_adicional: ot.es_adicional || false,
    tareas: tareasPorOt.get(ot.id) || [],
    avance_historial: avanceHistPorOt.get(ot.id) || [],
  });

  const mapParte = (p) => ({
    ...p,
    ...(p.datos_borrador || {}),
    ot_id: p.orden_trabajo_id,
    tecnico_id: p.tecnico_id,
    tecnico: p.tecnico_nombre || p.tecnico_id,
    horas: p.horas_normales,
    avance_reportado: p.avance_pct,
    tarea_id: p.tarea_id,
    avance_tarea_reportado: p.avance_tarea_reportado,
    avance_tarea_validado: p.avance_tarea_validado,
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
    avanceHistorialOT: avanceHistR.data || [],
    errors: [otsR, partesR, backlogR, plannerR, cierresR, tareasR, avanceHistR]
      .filter(r => r.error)
      .map(r => r.error?.message),
  };
}
