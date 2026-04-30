import { getSupabaseClient } from '../lib/supabaseClient.js';

export const rrhhService = {

  // ─── Personal Operativo ───────────────────────────────────────
  getPersonalOperativo: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching personal_operativo:', error); return []; }
    return data;
  },
  crearPersonalOperativo: async (empresaId, persona) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').insert([{ ...persona, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarPersonalOperativo: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
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
