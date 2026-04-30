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
    'costo_hora_real', 'costo_hora_extra', 'acceso_campo', 'perfil_campo',
    'docs', 'estado'
  ]);

  return Object.entries(cambios).reduce((row, [key, value]) => {
    const target = map[key] || key;
    if (!allowed.has(target)) return row;
    row[target] = ['sueldo_base', 'costo_hora_real', 'costo_hora_extra'].includes(target)
      ? Number(value || 0)
      : value;
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

  // ─── Personal Administrativo ──────────────────────────────────
  getPersonalAdmin: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching personal_administrativo:', error); return []; }
    return data;
  },
  crearPersonalAdmin: async (empresaId, persona) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').insert([{ ...persona, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarPersonalAdmin: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
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
