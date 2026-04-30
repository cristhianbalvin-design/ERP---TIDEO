import { isSupabaseMode } from '../lib/dataMode.js';

const normalizarCuenta = c => ({
  ...c,
  nombre_comercial: c.nombre_comercial || c.razon_social,
  tamano: c.tamano || 'mediana',
  responsable_comercial: c.responsable_comercial || 'Por asignar',
  responsable_cs: c.responsable_cs || null,
  health_score: c.health_score ?? null,
  saldo_cxc: Number(c.saldo_cxc || 0),
  riesgo_churn: c.riesgo_churn || null,
  lead_origen: c.lead_origen || null,
  telefono: c.telefono || null,
  email: c.email || null,
  direccion: c.direccion || null,
});

const normalizarLead = l => ({
  ...l,
  nombre: l.nombre || l.nombre_contacto,
  empresa_contacto: l.empresa_contacto || l.empresa_nombre,
  cargo: l.cargo || null,
  urgencia: l.urgencia || 'media',
  dias_sin_actividad: Number(l.dias_sin_actividad || 0),
  campana: l.campana || null,
  registrado_desde: l.registrado_desde || 'backoffice',
  fecha_creacion: l.fecha_creacion || l.created_at?.slice(0, 10),
  responsable: l.responsable || 'Por asignar',
  convertido: l.convertido || false,
});

const normalizarContacto = c => ({
  ...c,
  principal: c.principal ?? c.es_principal ?? false,
  rol: c.rol || 'contacto',
});

const normalizarOportunidad = o => ({
  ...o,
  responsable: o.responsable || 'Por asignar',
  servicio_interes: o.servicio_interes || o.nombre,
  fuente: o.fuente || null,
  forecast_ponderado: Number(
    o.forecast_ponderado ?? (Number(o.monto_estimado || 0) * Number(o.probabilidad || 0) / 100)
  ),
  fecha_creacion: o.fecha_creacion || o.created_at?.slice(0, 10),
  notas: o.notas || null,
  competidor: o.competidor || null,
});

const normalizarAgendaEvento = e => ({
  ...e,
  hora: typeof e.hora === 'string' ? e.hora.slice(0, 5) : e.hora,
  duracion_minutos: Number(e.duracion_minutos || 60),
  vendedor: e.vendedor || e.registrado_por || 'Por asignar',
  registrado_por: e.registrado_por || e.vendedor || 'Por asignar',
  estado: e.estado || 'programado',
});

const normalizarActividad = a => ({
  ...a,
  hora: typeof a.hora === 'string' ? a.hora.slice(0, 5) : a.hora,
  responsable: a.responsable || 'Por asignar',
  descripcion: a.descripcion || a.asunto || 'Actividad comercial',
  estado: a.estado || (a.resultado ? 'completada' : 'pendiente'),
});

// ─── Write helpers ────────────────────────────────────────────────────────────

export async function persistirLead(supabase, empresaId, lead) {
  const row = {
    id: lead.id,
    empresa_id: empresaId,
    nombre_contacto: lead.nombre || lead.nombre_contacto || 'Sin nombre',
    empresa_nombre: lead.empresa_contacto || lead.empresa_nombre || 'Sin empresa',
    razon_social: lead.razon_social || null,
    ruc: lead.ruc || null,
    industria: lead.industria || null,
    telefono: lead.telefono || null,
    email: lead.email || null,
    fuente: lead.fuente || 'backoffice',
    cargo: lead.cargo || null,
    urgencia: lead.urgencia || 'media',
    registrado_desde: lead.registrado_desde || 'backoffice',
    responsable: lead.responsable || null,
    campana: lead.campana || null,
    dias_sin_actividad: lead.dias_sin_actividad ?? 0,
    fecha_creacion: lead.fecha_creacion || null,
    motivo_descarte: lead.motivo_descarte || null,
    necesidad: lead.necesidad || null,
    presupuesto_estimado: lead.presupuesto_estimado || null,
    moneda: lead.moneda || 'PEN',
    estado: lead.estado || 'nuevo',
    convertido: lead.convertido || false,
  };
  return supabase.from('leads').insert(row);
}

export async function actualizarLead(supabase, leadId, datos) {
  const allowed = ['estado', 'convertido', 'cuenta_id', 'motivo_descarte', 'dias_sin_actividad'];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  return supabase.from('leads').update(row).eq('id', leadId);
}

export async function persistirCuenta(supabase, empresaId, cuenta) {
  const row = {
    id: cuenta.id,
    empresa_id: empresaId,
    nombre_comercial: cuenta.nombre_comercial || cuenta.razon_social || 'Sin nombre',
    razon_social: cuenta.razon_social || null,
    ruc: cuenta.ruc || null,
    tipo: cuenta.tipo || 'prospecto',
    industria: cuenta.industria || null,
    tamano: cuenta.tamano || null,
    telefono: cuenta.telefono || null,
    email: cuenta.email || null,
    direccion: cuenta.direccion || null,
    responsable_comercial: cuenta.responsable_comercial || null,
    responsable_cs: cuenta.responsable_cs || null,
    fuente_origen: cuenta.fuente_origen || null,
    condicion_pago: cuenta.condicion_pago || null,
    limite_credito: cuenta.limite_credito || null,
    moneda: cuenta.moneda || 'PEN',
    riesgo_financiero: cuenta.riesgo_financiero || null,
    riesgo_churn: cuenta.riesgo_churn || null,
    health_score: cuenta.health_score ?? null,
    saldo_cxc: cuenta.saldo_cxc ?? 0,
    margen_acumulado: cuenta.margen_acumulado ?? null,
    fecha_ultima_compra: cuenta.fecha_ultima_compra || null,
    estado: cuenta.estado || 'activo',
  };
  return supabase.from('cuentas').insert(row);
}

export async function persistirContacto(supabase, empresaId, contacto) {
  const row = {
    id: contacto.id,
    empresa_id: empresaId,
    cuenta_id: contacto.cuenta_id || null,
    nombre: contacto.nombre || 'Sin nombre',
    cargo: contacto.cargo || null,
    telefono: contacto.telefono || null,
    email: contacto.email || null,
    es_principal: contacto.principal || contacto.es_principal || false,
    estado: contacto.estado || 'activo',
  };
  return supabase.from('contactos').insert(row);
}

export async function persistirOportunidad(supabase, empresaId, opp) {
  const row = {
    id: opp.id,
    empresa_id: empresaId,
    cuenta_id: opp.cuenta_id || null,
    lead_id: opp.lead_id || opp.lead_origen || null,
    contacto_id: opp.contacto_id || null,
    nombre: opp.nombre || 'Nueva oportunidad',
    servicio_interes: opp.servicio_interes || null,
    etapa: opp.etapa || 'calificacion',
    probabilidad: opp.probabilidad || 0,
    monto_estimado: opp.monto_estimado || 0,
    moneda: opp.moneda || 'PEN',
    fecha_cierre_estimada: opp.fecha_cierre_estimada || null,
    fecha_cierre_real: opp.fecha_cierre_real || null,
    fecha_creacion: opp.fecha_creacion || null,
    forecast_ponderado: opp.forecast_ponderado ?? (Number(opp.monto_estimado || 0) * Number(opp.probabilidad || 0) / 100),
    fuente: opp.fuente || null,
    responsable: opp.responsable || null,
    notas: opp.notas || null,
    competidor: opp.competidor || null,
    estado: opp.estado || 'abierta',
  };
  return supabase.from('oportunidades').insert(row);
}

export async function actualizarOportunidad(supabase, oppId, datos) {
  const allowed = ['etapa', 'estado', 'probabilidad', 'monto_estimado', 'fecha_cierre_estimada', 'fecha_cierre_real', 'motivo_perdida', 'forecast_ponderado', 'notas', 'competidor'];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  return supabase.from('oportunidades').update(row).eq('id', oppId);
}

export async function persistirCotizacion(supabase, empresaId, cot) {
  const row = {
    id: cot.id,
    empresa_id: empresaId,
    oportunidad_id: cot.oportunidad_id || null,
    cuenta_id: cot.cuenta_id || null,
    numero: cot.numero,
    version: cot.version || 1,
    estado: cot.estado || 'borrador',
    fecha: cot.fecha || null,
    items: cot.items || cot.partidas || [],
    subtotal: cot.subtotal || 0,
    descuento_global_pct: cot.descuento_global_pct || 0,
    descuento_global: cot.descuento_global || 0,
    base_imponible: cot.base_imponible ?? cot.subtotal ?? 0,
    igv_pct: cot.igv_pct || 18,
    igv: cot.igv || 0,
    total: cot.total || 0,
    moneda: cot.moneda || 'PEN',
    condicion_pago: cot.condicion_pago || null,
  };
  if (cot.hoja_costeo_id) row.hoja_costeo_id = cot.hoja_costeo_id;
  return supabase.from('cotizaciones').insert(row);
}

export async function actualizarCotizacion(supabase, cotId, datos) {
  const allowed = ['estado', 'total', 'version', 'items', 'subtotal', 'descuento_global', 'base_imponible', 'igv', 'hoja_costeo_id'];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  return supabase.from('cotizaciones').update(row).eq('id', cotId);
}

export async function persistirOSCliente(supabase, empresaId, osc) {
  const row = {
    id: osc.id,
    empresa_id: empresaId,
    cuenta_id: osc.cuenta_id || null,
    cotizacion_id: osc.cotizacion_id || null,
    oportunidad_id: osc.oportunidad_id || null,
    numero: osc.numero,
    numero_doc_cliente: osc.numero_doc_cliente || null,
    monto_aprobado: osc.monto_aprobado || 0,
    moneda: osc.moneda || 'PEN',
    condicion_pago: osc.condicion_pago || null,
    fecha_emision: osc.fecha_emision || null,
    fecha_inicio: osc.fecha_inicio || null,
    fecha_fin: osc.fecha_fin || null,
    sla: osc.sla || null,
    estado: osc.estado || 'en_ejecucion',
    saldo_por_ejecutar: osc.saldo_por_ejecutar || 0,
    saldo_por_valorizar: osc.saldo_por_valorizar || 0,
    saldo_por_facturar: osc.saldo_por_facturar || 0,
    anticipo_recibido: osc.anticipo_recibido || 0,
    monto_facturado: osc.monto_facturado || 0,
    monto_cobrado: osc.monto_cobrado || 0,
    ots_asociadas: osc.ots_asociadas || [],
  };
  return supabase.from('os_clientes').insert(row);
}

export async function actualizarOSCliente(supabase, oscId, datos) {
  const allowed = [
    'estado',
    'saldo_por_ejecutar',
    'saldo_por_valorizar',
    'saldo_por_facturar',
    'anticipo_recibido',
    'monto_facturado',
    'monto_cobrado',
    'ots_asociadas',
    'fecha_inicio',
    'fecha_fin',
    'sla',
    'condicion_pago',
    'numero_doc_cliente',
  ];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  return supabase.from('os_clientes').update(row).eq('id', oscId);
}

export async function persistirHojaCosteo(supabase, empresaId, hc) {
  const row = {
    id: hc.id,
    empresa_id: empresaId,
    numero: hc.numero,
    oportunidad_id: hc.oportunidad_id || null,
    cuenta_id: hc.cuenta_id || null,
    cotizacion_id: hc.cotizacion_id || null,
    version: hc.version || 1,
    historial_versiones: hc.historial_versiones || [],
    estado: hc.estado || 'borrador',
    responsable_costeo: hc.responsable_costeo || null,
    fecha: hc.fecha || null,
    margen_objetivo_pct: hc.margen_objetivo_pct || 35,
    notas: hc.notas || null,
    mano_obra: hc.mano_obra || [],
    materiales: hc.materiales || [],
    servicios_terceros: hc.servicios_terceros || [],
    logistica: hc.logistica || [],
    total_mano_obra: hc.total_mano_obra || 0,
    total_materiales: hc.total_materiales || 0,
    total_servicios_terceros: hc.total_servicios_terceros || 0,
    total_logistica: hc.total_logistica || 0,
    costo_total: hc.costo_total || 0,
    precio_sugerido_sin_igv: hc.precio_sugerido_sin_igv || 0,
    precio_sugerido_total: hc.precio_sugerido_total || 0,
  };
  return supabase.from('hojas_costeo').insert(row);
}

export async function crearHojaCosteoRpc(supabase, empresaId, hc) {
  return supabase.rpc('crear_hoja_costeo', {
    p_empresa_id: empresaId,
    p_id: hc.id,
    p_numero: hc.numero,
    p_oportunidad_id: hc.oportunidad_id || null,
    p_cuenta_id: hc.cuenta_id || null,
    p_responsable_costeo: hc.responsable_costeo || null,
    p_fecha: hc.fecha || null,
    p_margen_objetivo_pct: hc.margen_objetivo_pct || 35,
    p_notas: hc.notas || null,
    p_mano_obra: hc.mano_obra || [],
    p_materiales: hc.materiales || [],
    p_servicios_terceros: hc.servicios_terceros || [],
    p_logistica: hc.logistica || [],
    p_total_mano_obra: hc.total_mano_obra || 0,
    p_total_materiales: hc.total_materiales || 0,
    p_total_servicios_terceros: hc.total_servicios_terceros || 0,
    p_total_logistica: hc.total_logistica || 0,
    p_costo_total: hc.costo_total || 0,
    p_precio_sugerido_sin_igv: hc.precio_sugerido_sin_igv || 0,
    p_precio_sugerido_total: hc.precio_sugerido_total || 0,
  });
}

export async function aprobarHojaCosteoRpc(supabase, empresaId, hcId, cotizacion) {
  return supabase.rpc('aprobar_hoja_costeo_y_crear_cotizacion', {
    p_empresa_id: empresaId,
    p_hoja_costeo_id: hcId,
    p_cotizacion_id: cotizacion.id,
    p_numero: cotizacion.numero,
    p_moneda: cotizacion.moneda || 'PEN',
    p_validez: cotizacion.validez || '30 dias',
  });
}

export async function actualizarHojaCosteoSvc(supabase, hcId, datos) {
  const allowed = [
    'estado', 'responsable_costeo', 'notas', 'margen_objetivo_pct',
    'version', 'historial_versiones',
    'mano_obra', 'materiales', 'servicios_terceros', 'logistica',
    'total_mano_obra', 'total_materiales', 'total_servicios_terceros', 'total_logistica',
    'costo_total', 'precio_sugerido_sin_igv', 'precio_sugerido_total', 'cotizacion_id',
  ];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  return supabase.from('hojas_costeo').update(row).eq('id', hcId);
}

export async function persistirAgendaEvento(supabase, empresaId, evento) {
  const row = {
    id: evento.id,
    empresa_id: empresaId,
    titulo: evento.titulo || 'Nuevo evento',
    tipo: evento.tipo || 'reunion',
    cuenta_id: evento.cuenta_id || null,
    lead_id: evento.lead_id || null,
    oportunidad_id: evento.oportunidad_id || null,
    vendedor: evento.vendedor || evento.registrado_por || 'Por asignar',
    registrado_por: evento.registrado_por || evento.vendedor || 'Por asignar',
    fecha: evento.fecha,
    hora: evento.hora,
    duracion_minutos: evento.duracion_minutos || 60,
    estado: evento.estado || 'programado',
    notas: evento.notas || null,
    resultado: evento.resultado || null,
  };
  return supabase.from('agenda_comercial').insert(row);
}

export async function actualizarAgendaEventoSvc(supabase, eventoId, datos) {
  const allowed = [
    'titulo', 'tipo', 'cuenta_id', 'lead_id', 'oportunidad_id',
    'vendedor', 'registrado_por', 'fecha', 'hora', 'duracion_minutos',
    'estado', 'notas', 'resultado',
  ];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  row.updated_at = new Date().toISOString();
  return supabase.from('agenda_comercial').update(row).eq('id', eventoId);
}

export async function persistirActividadComercial(supabase, empresaId, actividad) {
  const row = {
    id: actividad.id,
    empresa_id: empresaId,
    tipo: actividad.tipo || 'tarea',
    vinculo_tipo: actividad.vinculo_tipo || null,
    vinculo_id: actividad.vinculo_id || null,
    cuenta_id: actividad.cuenta_id || null,
    contacto_id: actividad.contacto_id || null,
    oportunidad_id: actividad.oportunidad_id || (actividad.vinculo_tipo === 'oportunidad' ? actividad.vinculo_id : null),
    lead_id: actividad.lead_id || (actividad.vinculo_tipo === 'lead' ? actividad.vinculo_id : null),
    responsable: actividad.responsable || 'Por asignar',
    fecha: actividad.fecha,
    hora: actividad.hora || null,
    descripcion: actividad.descripcion || actividad.asunto || 'Actividad comercial',
    resultado: actividad.resultado || null,
    proxima_accion: actividad.proxima_accion || null,
    proxima_accion_fecha: actividad.proxima_accion_fecha || null,
    estado: actividad.estado || (actividad.resultado ? 'completada' : 'pendiente'),
  };
  return supabase.from('actividades_comerciales').insert(row);
}

export async function actualizarActividadComercial(supabase, actividadId, datos) {
  const allowed = [
    'tipo', 'vinculo_tipo', 'vinculo_id', 'cuenta_id', 'contacto_id',
    'oportunidad_id', 'lead_id', 'responsable', 'fecha', 'hora',
    'descripcion', 'resultado', 'proxima_accion', 'proxima_accion_fecha', 'estado',
  ];
  const row = Object.fromEntries(
    allowed.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])
  );
  if (!Object.keys(row).length) return;
  row.updated_at = new Date().toISOString();
  return supabase.from('actividades_comerciales').update(row).eq('id', actividadId);
}

// ─── Read ──────────────────────────────────────────────────────────────────────

export async function loadCrmFromSupabase(supabase, empresaId) {
  if (!isSupabaseMode() || !supabase || !empresaId) return null;

  const q = table => supabase.from(table).select('*').eq('empresa_id', empresaId);

  const [cuentasR, leadsR, contactosR, oppsR, hcR, cotR, oscR, agendaR, actR] = await Promise.all([
    q('cuentas').order('nombre_comercial'),
    q('leads').order('created_at', { ascending: false }),
    q('contactos').order('nombre'),
    q('oportunidades').order('created_at', { ascending: false }),
    q('hojas_costeo').order('created_at', { ascending: false }),
    q('cotizaciones').order('created_at', { ascending: false }),
    q('os_clientes').order('created_at', { ascending: false }),
    q('agenda_comercial').order('fecha', { ascending: true }),
    q('actividades_comerciales').order('fecha', { ascending: false }),
  ]);

  return {
    cuentas: (cuentasR.data || []).map(normalizarCuenta),
    leads: (leadsR.data || []).map(normalizarLead),
    contactos: (contactosR.data || []).map(normalizarContacto),
    oportunidades: (oppsR.data || []).map(normalizarOportunidad),
    hojasCosteo: hcR.data || [],
    cotizaciones: cotR.data || [],
    osClientes: oscR.data || [],
    agendaEventos: (agendaR.data || []).map(normalizarAgendaEvento),
    actividades: (actR.data || []).map(normalizarActividad),
    errors: [cuentasR, leadsR, contactosR, oppsR, hcR, cotR, oscR, agendaR, actR]
      .filter(r => r.error)
      .map(r => r.error?.message),
  };
}
