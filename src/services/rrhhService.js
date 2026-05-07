import { getSupabaseClient } from '../lib/supabaseClient.js';

const normalizarPersonalOperativo = (p = {}) => ({
  ...p,
  documento: p.documento || p.dni || '',
  sede: p.sede || '',
  costo: Number(p.costo ?? p.costo_hora_real ?? 0),
  costo_hora_real: Number(p.costo_hora_real ?? p.costo ?? 0),
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
});

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
  supervisor: persona.supervisor || null,
  fecha_ingreso: persona.fecha_ingreso || null,
  sueldo_base: Number(persona.sueldo_base || 0),
  moneda: persona.moneda || 'PEN',
  sistema_pensionario: persona.sistema_pensionario || null,
  tipo_contrato: persona.tipo_contrato || 'Planilla',
  afp_nombre: persona.afp_nombre || null,
  tiene_hijos: persona.tiene_hijos ?? false,
  regimen_laboral: persona.regimen_laboral || null,
  cuota_prestamo_mes: Number(persona.cuota_prestamo_mes || 0),
  descuento_judicial: Number(persona.descuento_judicial || 0),
  costo_hora_real: Number(persona.costo_hora_real ?? persona.costo ?? 0),
  costo_hora_extra: Number(persona.costo_hora_extra ?? persona.costo_extra ?? 0),
  acceso_campo: persona.acceso_campo ?? true,
  perfil_campo: persona.perfil_campo || 'Tecnico',
  docs: persona.docs || { sctr: 'pendiente', medico: 'pendiente', epp: 'pendiente', licencia: 'pendiente' },
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
    'area', 'turno_id', 'telefono', 'email', 'sede', 'supervisor',
    'fecha_ingreso', 'sueldo_base', 'moneda', 'sistema_pensionario',
    'tipo_contrato', 'afp_nombre', 'tiene_hijos', 'regimen_laboral',
    'cuota_prestamo_mes', 'descuento_judicial',
    'costo_hora_real', 'costo_hora_extra', 'acceso_campo', 'perfil_campo',
    'docs', 'estado'
  ]);

  return Object.entries(cambios).reduce((row, [key, value]) => {
    const target = map[key] || key;
    if (!allowed.has(target)) return row;
    row[target] = ['sueldo_base', 'costo_hora_real', 'costo_hora_extra', 'cuota_prestamo_mes', 'descuento_judicial'].includes(target)
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
  tipo_contrato: p.tipo_contrato || 'Planilla',
  modalidad: p.modalidad || 'Presencial',
  sede: p.sede || '',
  turno_id: p.turno_id || 'tur_005',
  dias_vacaciones_total: Number(p.dias_vacaciones_total ?? p.vacaciones_pendientes ?? 30),
  dias_vacaciones_usados: Number(p.dias_vacaciones_usados ?? 0),
  dias_vacaciones_disponibles: Number(p.dias_vacaciones_disponibles ?? p.vacaciones_pendientes ?? 0),
  documentos: p.documentos || [],
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
  estado: persona.estado || 'activo',
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
    'sueldo_base', 'remuneracion', 'moneda', 'sistema_pensionario', 'modalidad',
    'vacaciones_pendientes', 'dias_vacaciones_total', 'dias_vacaciones_usados',
    'dias_vacaciones_disponibles', 'contacto_emergencia', 'relacion_emergencia',
    'telefono_emergencia', 'nivel_estudios', 'especialidad', 'institucion',
    'documentos', 'estado'
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
      'dias_vacaciones_total', 'dias_vacaciones_usados', 'dias_vacaciones_disponibles'
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
      .from('personal_administrativo').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
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
    return data;
  },
  crearTurno: async (empresaId, turno) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('turnos').insert([{ ...turno, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
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
    return data;
  },
  registrarAsistencia: async (empresaId, registro) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('registros_asistencia').insert([{ ...registro, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarAsistencia: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('registros_asistencia').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
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
};
