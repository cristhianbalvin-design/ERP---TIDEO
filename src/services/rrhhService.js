import { getSupabaseClient } from '../lib/supabaseClient.js';

const generateTextId = (prefix) => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
};

const hhmm = (value) => {
  if (!value) return value;
  return String(value).slice(0, 5);
};

const normalizarTurno = (t = {}) => ({
  ...t,
  codigo: t.codigo || t.id,
  dias_laborables: Array.isArray(t.dias_laborables) ? t.dias_laborables : [],
  dias_variables: t.dias_variables ?? (Array.isArray(t.dias_laborables) && t.dias_laborables.length === 0),
  refrigerio_minutos: Number(t.refrigerio_minutos ?? t.minutos_refrigerio ?? 0),
  minutos_refrigerio: Number(t.minutos_refrigerio ?? t.refrigerio_minutos ?? 0),
});

const toTurnoRow = (empresaId, turno = {}) => {
  return {
    id: turno.id,
    empresa_id: empresaId,
    nombre: turno.nombre,
    hora_entrada: turno.hora_entrada,
    hora_salida: turno.hora_salida,
    tolerancia_minutos: Number(turno.tolerancia_minutos || 0),
    cruza_medianoche: Boolean(turno.cruza_medianoche),
    dias_laborables: turno.dias_variables ? [] : (turno.dias_laborables || []),
    minutos_refrigerio: Number(turno.minutos_refrigerio ?? turno.refrigerio_minutos ?? 0),
    horas_efectivas: Number(turno.horas_efectivas || 0),
    estado: turno.estado || 'activo',
  };
};

const normalizarAsistencia = (r = {}) => {
  const horasExtraMin = r.horas_extra_min ?? (r.horas_extra !== null && r.horas_extra !== undefined ? Math.round(Number(r.horas_extra || 0) * 60) : 0);
  const esFalta = r.es_falta ?? ['falta', 'falta_justificada'].includes(r.estado);
  const justificada = r.justificada ?? r.estado === 'falta_justificada';

  return {
    ...r,
    hora_entrada: hhmm(r.hora_entrada),
    hora_salida: hhmm(r.hora_salida),
    horas_trabajadas_min: Number(r.horas_trabajadas_min || 0),
    tardanza_min: Number(r.tardanza_min ?? r.tardanza_minutos ?? 0),
    horas_extra_min: Number(horasExtraMin || 0),
    es_falta: Boolean(esFalta),
    justificada: Boolean(justificada),
    motivo_falta: r.motivo_falta || r.justificacion || null,
    notas: r.notas || null,
    refrigerio_tomado_minutos: Number(r.refrigerio_tomado_minutos || 0),
  };
};

const inferirTrabajadorTipo = (registro = {}) => {
  if (registro.trabajador_tipo) return registro.trabajador_tipo;
  const id = String(registro.trabajador_id || '').toLowerCase();
  if (id.startsWith('per_') || id.startsWith('pad_') || id.startsWith('adm')) return 'administrativo';
  return 'operativo';
};

const toAsistenciaRow = (empresaId, registro = {}, { includeId = true } = {}) => {
  const tardanzaMin = Number(registro.tardanza_min ?? registro.tardanza_minutos ?? 0);
  const horasExtraMin = Number(registro.horas_extra_min ?? 0);
  const row = {
    empresa_id: empresaId,
    trabajador_tipo: inferirTrabajadorTipo(registro),
    trabajador_id: registro.trabajador_id,
    turno_id: registro.turno_id || null,
    fecha: registro.fecha,
    hora_entrada: registro.hora_entrada || null,
    hora_salida: registro.hora_salida || null,
    tardanza_minutos: tardanzaMin,
    tardanza_min: tardanzaMin,
    horas_extra: Number((horasExtraMin / 60).toFixed(2)),
    horas_extra_min: horasExtraMin,
    horas_trabajadas_min: Number(registro.horas_trabajadas_min || 0),
    estado: registro.estado || 'completo',
    justificacion: registro.motivo_falta || registro.justificacion || null,
    es_falta: Boolean(registro.es_falta),
    justificada: Boolean(registro.justificada),
    motivo_falta: registro.motivo_falta || null,
    notas: registro.notas || null,
    origen_registro: registro.origen_registro || 'backoffice',
    latitud: registro.latitud ?? null,
    longitud: registro.longitud ?? null,
    latitud_salida: registro.latitud_salida ?? null,
    longitud_salida: registro.longitud_salida ?? null,
    refrigerio_tomado_minutos: Number(registro.refrigerio_tomado_minutos || 0),
    regimen_jornada: registro.regimen_jornada || 'general',
    ciclo_minero_id: registro.ciclo_minero_id || null,
  };
  if (includeId) row.id = registro.id || generateTextId('asis');
  return row;
};

const normalizarPersonalOperativo = (p = {}) => ({
  ...p,
  documento: p.documento || p.dni || '',
  sede: p.sede || '',
  supervisor_id: p.supervisor_id || null,
  supervisor: p.supervisor || '',
  metodo_pago: p.metodo_pago || 'mensual',
  monto_mensual: Number(p.monto_mensual ?? p.sueldo_base ?? 0),
  horas_base_mes: Number(p.horas_base_mes ?? 160) || 160,
  tarifa_hora: Number(p.tarifa_hora ?? p.costo_hora_real ?? p.costo ?? 0),
  costo: Number(p.tarifa_hora ?? p.costo ?? p.costo_hora_real ?? 0),
  costo_hora_real: Number(p.tarifa_hora ?? p.costo_hora_real ?? p.costo ?? 0),
  costo_hora_extra: Number(p.costo_hora_extra ?? p.costo_extra ?? 0),
  acceso_campo: p.acceso_campo ?? true,
  perfil_campo: p.perfil_campo || 'Tecnico',
  tipo_contrato: p.tipo_contrato || 'Planilla',
  afp_nombre: p.afp_nombre || null,
  tiene_hijos: Boolean(p.tiene_hijos),
  regimen_laboral: p.regimen_laboral || null,
  cuota_prestamo_mes: Number(p.cuota_prestamo_mes || 0),
  descuento_judicial: Number(p.descuento_judicial || 0),
  docs: p.docs || { sctr: 'pendiente', medico: 'pendiente', epp: 'pendiente', licencia: 'pendiente' },
  centro_costo_id: p.centro_costo_id || null,
  dias_vacaciones_disponibles: Number(p.dias_vacaciones_disponibles ?? 0),
  fecha_inicio_contrato: p.fecha_inicio_contrato || p.fecha_ingreso || null,
  fecha_fin_contrato: p.fecha_fin_contrato || null,
});

const calcularTarifaHora = (montoMensual, horasBaseMes) => {
  const monto = Number(montoMensual || 0);
  const horas = Number(horasBaseMes || 160) || 160;
  return Math.round((horas > 0 ? monto / horas : 0) * 100) / 100;
};

const toPersonalOperativoRow = (empresaId, persona = {}) => ({
  id: persona.id,
  empresa_id: empresaId,
  codigo: persona.codigo || persona.id,
  nombre: persona.nombre,
  documento: persona.documento || persona.dni || null,
  cargo: persona.cargo || 'Tecnico de Campo',
  especialidad: persona.especialidad || 'General',
  especialidad2: persona.especialidad2 || null,
  area: persona.area || 'Operaciones',
  turno_id: persona.turno_id || null,
  telefono: persona.telefono || null,
  email: persona.email || null,
  sede: persona.sede || null,
  supervisor_id: persona.supervisor_id || null,
  supervisor: persona.supervisor || null,
  fecha_ingreso: persona.fecha_ingreso || null,
  sueldo_base: Number(persona.sueldo_base || 0),
  moneda: persona.moneda || 'PEN',
  sistema_pensionario: persona.sistema_pensionario || null,
  metodo_pago: persona.metodo_pago || 'mensual',
  monto_mensual: Number(persona.monto_mensual ?? persona.sueldo_base ?? 0),
  horas_base_mes: Number(persona.horas_base_mes || 160),
  tarifa_hora: calcularTarifaHora(persona.monto_mensual ?? persona.sueldo_base, persona.horas_base_mes),
  tipo_contrato: persona.tipo_contrato || 'Planilla',
  afp_nombre: persona.afp_nombre || null,
  tiene_hijos: persona.tiene_hijos ?? false,
  regimen_laboral: persona.regimen_laboral || null,
  cuota_prestamo_mes: Number(persona.cuota_prestamo_mes || 0),
  descuento_judicial: Number(persona.descuento_judicial || 0),
  costo_hora_real: Number(persona.tarifa_hora ?? calcularTarifaHora(persona.monto_mensual ?? persona.sueldo_base, persona.horas_base_mes) ?? persona.costo_hora_real ?? persona.costo ?? 0),
  costo_hora_extra: Number(persona.costo_hora_extra ?? persona.costo_extra ?? 0),
  ruc_colaborador: persona.ruc_colaborador || null,
  retencion_ir: Number(persona.retencion_ir ?? 8),
  suspension_retenciones: persona.suspension_retenciones ?? false,
  vencimiento_suspension: persona.vencimiento_suspension || null,
  acceso_campo: persona.acceso_campo ?? true,
  perfil_campo: persona.perfil_campo || 'Tecnico',
  docs: persona.docs || { sctr: 'pendiente', medico: 'pendiente', epp: 'pendiente', licencia: 'pendiente' },
  centro_costo_id: persona.centro_costo_id || null,
  estado: persona.estado || 'disponible',
});

const toPersonalOperativoUpdate = (cambios = {}) => {
  const map = {
    dni: 'documento',
    costo: 'costo_hora_real',
    costo_extra: 'costo_hora_extra',
  };
  const allowed = new Set([
    'codigo', 'nombre', 'documento', 'cargo', 'especialidad', 'especialidad2',
    'area', 'turno_id', 'telefono', 'email', 'sede', 'supervisor_id', 'supervisor',
    'fecha_ingreso', 'sueldo_base', 'moneda', 'sistema_pensionario',
    'metodo_pago', 'monto_mensual', 'horas_base_mes', 'tarifa_hora',
    'tipo_contrato', 'afp_nombre', 'tiene_hijos', 'regimen_laboral',
    'cuota_prestamo_mes', 'descuento_judicial',
    'costo_hora_real', 'costo_hora_extra',
    'ruc_colaborador', 'retencion_ir', 'suspension_retenciones', 'vencimiento_suspension',
    'acceso_campo', 'perfil_campo',
    'docs', 'estado', 'centro_costo_id'
  ]);

  return Object.entries(cambios).reduce((row, [key, value]) => {
    const target = map[key] || key;
    if (!allowed.has(target)) return row;
    row[target] = ['sueldo_base', 'monto_mensual', 'horas_base_mes', 'tarifa_hora', 'costo_hora_real', 'costo_hora_extra', 'cuota_prestamo_mes', 'descuento_judicial'].includes(target)
      ? Number(value || 0)
      : value;
    return row;
  }, {});
};

const normalizarPersonalAdmin = (p = {}) => ({
  ...p,
  dni: p.dni || p.documento || '',
  documento: p.documento || p.dni || '',
  fecha_inicio_contrato: p.fecha_inicio_contrato || p.fecha_ingreso || '',
  remuneracion: Number(p.remuneracion ?? p.sueldo_base ?? 0),
  sueldo_base: Number(p.sueldo_base ?? p.remuneracion ?? 0),
  metodo_pago: p.metodo_pago || 'mensual',
  monto_mensual: Number(p.monto_mensual ?? p.remuneracion ?? p.sueldo_base ?? 0),
  horas_base_mes: Number(p.horas_base_mes ?? 160) || 160,
  tarifa_hora: Number(p.tarifa_hora ?? p.costo_hora_real ?? p.costo ?? 0),
  tipo_contrato: p.tipo_contrato || 'Planilla',
  modalidad: p.modalidad || 'Presencial',
  sede: p.sede || '',
  turno_id: p.turno_id || 'tur_005',
  dias_vacaciones_total: Number(p.dias_vacaciones_total ?? p.vacaciones_pendientes ?? 30),
  dias_vacaciones_usados: Number(p.dias_vacaciones_usados ?? 0),
  dias_vacaciones_disponibles: Number(p.dias_vacaciones_disponibles ?? p.vacaciones_pendientes ?? 0),
  documentos: p.documentos || [],
  centro_costo_id: p.centro_costo_id || null,
  auth_user_id: p.auth_user_id || null,
  tiene_comisiones: Boolean(p.tiene_comisiones),
  porcentaje_comision: p.porcentaje_comision != null ? Number(p.porcentaje_comision) : null,
  modalidad_comision: p.modalidad_comision || null,
  ruc_vendedor: p.ruc_vendedor || null,
  retencion_ir_comision: p.retencion_ir_comision != null ? Number(p.retencion_ir_comision) : 8,
  suspension_retenciones: Boolean(p.suspension_retenciones),
  vencimiento_suspension: p.vencimiento_suspension || null,
});

const toPersonalAdminRow = (empresaId, persona = {}) => ({
  id: persona.id,
  empresa_id: empresaId,
  codigo: persona.codigo || persona.id,
  nombre: persona.nombre,
  documento: persona.documento || persona.dni || null,
  dni: persona.dni || persona.documento || null,
  fecha_nacimiento: persona.fecha_nacimiento || null,
  direccion: persona.direccion || null,
  cargo: persona.cargo || 'Por definir',
  area: persona.area || 'Administracion',
  telefono: persona.telefono || null,
  email: persona.email || null,
  supervisor: persona.supervisor || null,
  sede: persona.sede || null,
  turno_id: persona.turno_id || null,
  tipo_contrato: persona.tipo_contrato || persona.modalidad || 'Planilla',
  fecha_ingreso: persona.fecha_ingreso || persona.fecha_inicio || persona.fecha_inicio_contrato || null,
  fecha_inicio_contrato: persona.fecha_inicio_contrato || persona.fecha_inicio || persona.fecha_ingreso || null,
  fecha_fin_contrato: persona.fecha_fin_contrato || persona.fecha_fin || null,
  sueldo_base: Number(persona.sueldo_base ?? persona.remuneracion ?? 0),
  remuneracion: Number(persona.remuneracion ?? persona.sueldo_base ?? 0),
  moneda: persona.moneda || 'PEN',
  metodo_pago: persona.metodo_pago || 'mensual',
  monto_mensual: Number(persona.monto_mensual ?? persona.remuneracion ?? persona.sueldo_base ?? 0),
  horas_base_mes: Number(persona.horas_base_mes || 160),
  tarifa_hora: calcularTarifaHora(persona.monto_mensual ?? persona.remuneracion ?? persona.sueldo_base, persona.horas_base_mes),
  sistema_pensionario: persona.sistema_pensionario || null,
  modalidad: persona.modalidad_visual || persona.modalidad_trabajo || 'Presencial',
  vacaciones_pendientes: Number(persona.vacaciones_pendientes ?? persona.dias_vacaciones_disponibles ?? persona.dias_vacaciones ?? 0),
  dias_vacaciones_total: Number(persona.dias_vacaciones_total ?? persona.dias_vacaciones ?? 30),
  dias_vacaciones_usados: Number(persona.dias_vacaciones_usados ?? 0),
  dias_vacaciones_disponibles: Number(persona.dias_vacaciones_disponibles ?? persona.dias_vacaciones ?? 0),
  contacto_emergencia: persona.contacto_emergencia || null,
  relacion_emergencia: persona.relacion_emergencia || null,
  telefono_emergencia: persona.telefono_emergencia || null,
  nivel_estudios: persona.nivel_estudios || null,
  especialidad: persona.especialidad || null,
  institucion: persona.institucion || null,
  documentos: persona.documentos || [],
  centro_costo_id: persona.centro_costo_id || null,
  auth_user_id: persona.auth_user_id || null,
  estado: persona.estado || 'activo',
  tiene_comisiones: Boolean(persona.tiene_comisiones),
  porcentaje_comision: persona.porcentaje_comision != null ? Number(persona.porcentaje_comision) : null,
  modalidad_comision: persona.modalidad_comision || null,
  ruc_vendedor: persona.ruc_vendedor || null,
  ruc_colaborador: persona.ruc_colaborador || null,
  retencion_ir_comision: persona.retencion_ir_comision != null ? Number(persona.retencion_ir_comision) : 8,
  suspension_retenciones: Boolean(persona.suspension_retenciones),
  vencimiento_suspension: persona.vencimiento_suspension || null,
});

const toPersonalAdminUpdate = (cambios = {}) => {
  const map = {
    fecha_inicio: 'fecha_inicio_contrato',
    fecha_fin: 'fecha_fin_contrato',
  };
  const allowed = new Set([
    'codigo', 'nombre', 'documento', 'dni', 'fecha_nacimiento', 'direccion',
    'cargo', 'area', 'telefono', 'email', 'supervisor', 'sede', 'turno_id',
    'tipo_contrato', 'fecha_ingreso', 'fecha_inicio_contrato', 'fecha_fin_contrato',
    'sueldo_base', 'remuneracion', 'moneda', 'metodo_pago', 'monto_mensual',
    'horas_base_mes', 'tarifa_hora', 'sistema_pensionario', 'modalidad',
    'vacaciones_pendientes', 'dias_vacaciones_total', 'dias_vacaciones_usados',
    'dias_vacaciones_disponibles', 'contacto_emergencia', 'relacion_emergencia',
    'telefono_emergencia', 'nivel_estudios', 'especialidad', 'institucion',
    'documentos', 'estado', 'centro_costo_id',
    'auth_user_id', 'tiene_comisiones', 'porcentaje_comision',
    'modalidad_comision', 'ruc_vendedor', 'ruc_colaborador', 'retencion_ir_comision',
    'suspension_retenciones', 'vencimiento_suspension'
  ]);

  return Object.entries(cambios).reduce((row, [key, value]) => {
    const target = map[key] || key;
    if (!allowed.has(target)) return row;
    if (['fecha_nacimiento', 'fecha_ingreso', 'fecha_inicio_contrato', 'fecha_fin_contrato'].includes(target)) {
      row[target] = value || null;
      return row;
    }
    row[target] = [
      'sueldo_base', 'remuneracion', 'vacaciones_pendientes',
      'dias_vacaciones_total', 'dias_vacaciones_usados', 'dias_vacaciones_disponibles',
      'porcentaje_comision', 'retencion_ir_comision', 'monto_mensual', 'horas_base_mes',
      'tarifa_hora'
    ].includes(target) ? Number(value || 0) : value;
    return row;
  }, {});
};

export const rrhhService = {

  // ─── Personal Operativo ───────────────────────────────────────
  getPersonalOperativo: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching personal_operativo:', error); return []; }
    return (data || []).map(normalizarPersonalOperativo);
  },
  crearPersonalOperativo: async (empresaId, persona) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').insert([toPersonalOperativoRow(empresaId, persona)]).select().single();
    if (error) throw error;
    return normalizarPersonalOperativo(data);
  },
  actualizarPersonalOperativo: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const row = toPersonalOperativoUpdate(cambios);
    const { data, error } = await supabase
      .from('personal_operativo').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return normalizarPersonalOperativo(data);
  },
  eliminarPersonalOperativo: async (id) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('personal_operativo').delete().eq('id', id);
    if (error) throw error;
    return id;
  },

  // ─── Personal Administrativo ──────────────────────────────────
  getPersonalAdmin: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true });
    if (error) { console.error('Error fetching personal_administrativo:', error); return []; }
    return (data || []).map(normalizarPersonalAdmin);
  },
  crearPersonalAdmin: async (empresaId, persona) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').insert([toPersonalAdminRow(empresaId, persona)]).select().single();
    if (error) throw error;
    return normalizarPersonalAdmin(data);
  },
  actualizarPersonalAdmin: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const row = toPersonalAdminUpdate(cambios);
    const { data, error } = await supabase
      .from('personal_administrativo').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return normalizarPersonalAdmin(data);
  },
  eliminarPersonalAdmin: async (id) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('personal_administrativo').delete().eq('id', id);
    if (error) throw error;
    return id;
  },

  // ─── Turnos ──────────────────────────────────────────────────
  getTurnos: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('turnos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching turnos:', error); return []; }
    return (data || []).map(normalizarTurno);
  },
  crearTurno: async (empresaId, turno) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('turnos').insert([toTurnoRow(empresaId, turno)]).select().single();
    if (error) throw error;
    return normalizarTurno(data);
  },
  actualizarTurno: async (empresaId, id, turno) => {
    const supabase = await getSupabaseClient();
    const { id: _id, ...row } = toTurnoRow(empresaId, turno);
    const { data, error } = await supabase
      .from('turnos').update(row).eq('id', id).select().single();
    if (error) throw error;
    return normalizarTurno(data);
  },
  eliminarTurno: async (id) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('turnos').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Registros de Asistencia ──────────────────────────────────
  getAsistencia: async (empresaId, fechaInicio, fechaFin) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('registros_asistencia').select('*').eq('empresa_id', empresaId);
    if (fechaInicio) query = query.gte('fecha', fechaInicio);
    if (fechaFin) query = query.lte('fecha', fechaFin);
    const { data, error } = await query.order('fecha', { ascending: false });
    if (error) { console.error('Error fetching asistencia:', error); return []; }
    return (data || []).map(normalizarAsistencia);
  },
  registrarAsistencia: async (empresaId, registro) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('registros_asistencia').insert([toAsistenciaRow(empresaId, registro)]).select().single();
    if (error) throw error;
    return normalizarAsistencia(data);
  },
  actualizarAsistencia: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const empresaId = cambios.empresa_id;
    const row = empresaId
      ? toAsistenciaRow(empresaId, cambios, { includeId: false })
      : { ...cambios };
    delete row.id;
    const { data, error } = await supabase
      .from('registros_asistencia').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return normalizarAsistencia(data);
  },

  // ─── Ciclos Mineros ───────────────────────────────────────────
  getCiclosMineros: async (empresaId, personalId = null) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    let query = supabase.from('asistencia_ciclos_mineros').select('*').eq('empresa_id', empresaId);
    if (personalId) query = query.eq('personal_id', personalId);
    const { data, error } = await query.order('fecha_inicio_ciclo', { ascending: false });
    if (error) { console.error('Error fetching ciclos mineros:', error); return []; }
    return data || [];
  },
  crearCicloMinero: async (empresaId, ciclo, registrosDiarios = []) => {
    const supabase = await getSupabaseClient();
    const id = generateTextId('ciclo');
    const row = { ...ciclo, id, empresa_id: empresaId };
    const { data, error } = await supabase.from('asistencia_ciclos_mineros').insert([row]).select().single();
    if (error) throw error;

    if (registrosDiarios && registrosDiarios.length > 0) {
      const inserts = registrosDiarios.map(r => toAsistenciaRow(empresaId, { ...r, ciclo_minero_id: id, regimen_jornada: row.regimen_jornada }));
      const { error: errAsis } = await supabase.from('registros_asistencia').insert(inserts);
      if (errAsis) console.error('Error insertando registros diarios del ciclo:', errAsis);
    }
    return data;
  },
  actualizarCicloMinero: async (id, cambios, registrosDiarios = []) => {
    const supabase = await getSupabaseClient();
    const { empresa_id, ...row } = cambios;
    const { data, error } = await supabase.from('asistencia_ciclos_mineros')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    if (registrosDiarios && registrosDiarios.length > 0) {
      // Borrar registros existentes del ciclo
      await supabase.from('registros_asistencia').delete().eq('ciclo_minero_id', id);
      // Insertar nuevos
      const inserts = registrosDiarios.map(r => toAsistenciaRow(data.empresa_id, { ...r, ciclo_minero_id: id, regimen_jornada: data.regimen_jornada }));
      const { error: errAsis } = await supabase.from('registros_asistencia').insert(inserts);
      if (errAsis) console.error('Error insertando registros diarios del ciclo actualizados:', errAsis);
    }
    return data;
  },

  // ─── Períodos de Nómina ───────────────────────────────────────
  getPeriodosNomina: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina').select('*').eq('empresa_id', empresaId).order('fecha_inicio', { ascending: false });
    if (error) { console.error('Error fetching periodos_nomina:', error); return []; }
    return data;
  },
  crearPeriodoNomina: async (empresaId, periodo) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina').insert([{ ...periodo, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  cerrarPeriodoNomina: async (id, cerradoPor) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina')
      .update({ estado: 'cerrado', cerrado_por: cerradoPor, cerrado_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Préstamos al Personal ────────────────────────────────────
  getPrestamosPersonal: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('prestamos_personal').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching prestamos_personal:', error); return []; }
    return data;
  },
  crearPrestamoPersonal: async (empresaId, prestamo) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('prestamos_personal').insert([{ ...prestamo, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  getPrestamoPagos: async (empresaId, prestamoId) => {
    if (!empresaId || !prestamoId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('prestamo_pagos').select('*')
      .eq('empresa_id', empresaId).eq('prestamo_id', prestamoId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching prestamo_pagos:', error); return []; }
    return data;
  },

  // Registra un pago de cuota. Actualiza saldo/cuotas_pagadas en el préstamo.
  // Si se completan todas las cuotas, marca el préstamo 'cancelado' y pone
  // cuota_prestamo_mes = 0 en el registro del trabajador.
  pagarCuotaPrestamo: async (empresaId, prestamoId, { monto, concepto = 'manual', periodo_id = null }) => {
    const supabase = await getSupabaseClient();

    const { data: prestamo, error: fetchErr } = await supabase
      .from('prestamos_personal').select('*').eq('id', prestamoId).eq('empresa_id', empresaId).single();
    if (fetchErr) throw fetchErr;
    if (prestamo.estado === 'cancelado') throw new Error('El préstamo ya está cancelado');

    const nuevasCuotas = prestamo.cuotas_pagadas + 1;
    const nuevoSaldo = Math.max(0, Number(prestamo.saldo || 0) - Number(monto));
    const cancelado = nuevasCuotas >= prestamo.cuotas;

    const { data: prestamoActualizado, error: updErr } = await supabase
      .from('prestamos_personal')
      .update({ cuotas_pagadas: nuevasCuotas, saldo: nuevoSaldo, estado: cancelado ? 'cancelado' : 'vigente', updated_at: new Date().toISOString() })
      .eq('id', prestamoId).select().single();
    if (updErr) throw updErr;

    const { data: pago, error: pagoErr } = await supabase
      .from('prestamo_pagos')
      .insert([{ empresa_id: empresaId, prestamo_id: prestamoId, fecha: new Date().toISOString().split('T')[0], monto: Number(monto), concepto, periodo_id }])
      .select().single();
    if (pagoErr) throw pagoErr;

    if (cancelado && prestamo.trabajador_id) {
      const tabla = prestamo.trabajador_tipo === 'admin' ? 'personal_administrativo' : 'personal_operativo';
      await supabase.from(tabla)
        .update({ cuota_prestamo_mes: 0, updated_at: new Date().toISOString() })
        .eq('id', prestamo.trabajador_id);
    }

    return { prestamo: prestamoActualizado, pago };
  },

  cancelarPrestamo: async (empresaId, prestamoId) => {
    const supabase = await getSupabaseClient();

    const { data: prestamo, error: fetchErr } = await supabase
      .from('prestamos_personal').select('*').eq('id', prestamoId).eq('empresa_id', empresaId).single();
    if (fetchErr) throw fetchErr;

    const { data, error } = await supabase
      .from('prestamos_personal')
      .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
      .eq('id', prestamoId).select().single();
    if (error) throw error;

    if (prestamo.descontar_nomina && prestamo.trabajador_id) {
      const tabla = prestamo.trabajador_tipo === 'admin' ? 'personal_administrativo' : 'personal_operativo';
      await supabase.from(tabla)
        .update({ cuota_prestamo_mes: 0, updated_at: new Date().toISOString() })
        .eq('id', prestamo.trabajador_id);
    }

    return data;
  },
};
