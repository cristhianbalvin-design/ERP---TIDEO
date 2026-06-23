import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

const id = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;

export const RECLUTAMIENTO_ETAPAS = [
  { key: 'postulado', label: 'Postulado', color: 'var(--cyan)' },
  { key: 'entrevista', label: 'Entrevista', color: 'var(--purple)' },
  { key: 'evaluacion', label: 'Evaluacion', color: 'var(--orange)' },
  { key: 'seleccionado', label: 'Seleccionado', color: 'var(--green)' },
  { key: 'contratado', label: 'Contratado', color: 'var(--navy)' },
  { key: 'descartado', label: 'Descartado', color: 'var(--danger)' },
];

const normalizeVacante = (v = {}) => ({
  ...v,
  posiciones: Number(v.posiciones || 1),
  posiciones_cubiertas: Number(v.posiciones_cubiertas || 0),
  public_token: v.public_token || v.token_publico || null,
  estado: v.estado || 'abierta',
});

const normalizeCandidato = (c = {}) => ({
  ...c,
  dni: c.dni || c.documento || '',
  nombre: c.nombre || '',
});

const normalizeCandidatura = (c = {}) => ({
  ...c,
  etapa: c.etapa || 'postulado',
  fuente: c.fuente || 'interno',
  notas_evaluacion: c.notas_evaluacion || c.notas || '',
});

export const reclutamientoService = {
  async getVacantes(empresaId) {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_vacantes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_apertura', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeVacante);
  },

  async crearVacante(empresaId, payload) {
    const supabase = await getSupabaseClient();
    const row = {
      ...payload,
      id: payload.id || id('vac'),
      empresa_id: empresaId,
      estado: payload.estado || 'abierta',
      posiciones_cubiertas: 0,
      public_token: payload.public_token || id('postula'),
    };
    const { data, error } = await supabase.from('rrhh_vacantes').insert([row]).select().single();
    if (error) throw error;
    return normalizeVacante(data);
  },

  async actualizarVacante(vacanteId, cambios) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_vacantes')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', vacanteId)
      .select()
      .single();
    if (error) throw error;
    return normalizeVacante(data);
  },

  async getCandidatos(empresaId) {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_candidatos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeCandidato);
  },

  async getCandidaturas(empresaId) {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_candidaturas')
      .select('*, candidato:rrhh_candidatos(*), historial:rrhh_candidatura_historial(*)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeCandidatura);
  },

  async crearCandidatoYCandidatura(empresaId, payload) {
    const supabase = await getSupabaseClient();
    let cvPath = payload.cv_path || null;
    let cvUrl = payload.cv_url || null;

    if (payload.file) {
      if (payload.file.size > 5 * 1024 * 1024) throw new Error('El CV no debe superar 5 MB.');
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(payload.file.type)) throw new Error('Solo se aceptan PDF o imagen.');
      cvPath = `${empresaId}/reclutamiento/${payload.vacante_id}/${Date.now()}_${payload.file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('documentos-privados').upload(cvPath, payload.file, { contentType: payload.file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: signed } = await supabase.storage.from('documentos-privados').createSignedUrl(cvPath, 600);
      cvUrl = signed?.signedUrl || null;
    }

    const candidatoId = payload.candidato_id || id('cand');
    const candidaturaId = payload.id || id('candit');
    const candidatoRow = {
      id: candidatoId,
      empresa_id: empresaId,
      nombre: payload.nombre,
      dni: payload.dni,
      telefono: payload.telefono || null,
      email: payload.email || null,
      cv_url: cvUrl,
      cv_path: cvPath,
      alerta_historial: payload.alerta_historial || {},
    };
    const { data: candidato, error: candError } = await supabase
      .from('rrhh_candidatos')
      .upsert([candidatoRow], { onConflict: 'empresa_id,dni' })
      .select()
      .single();
    if (candError) throw candError;

    const candidaturaRow = {
      id: candidaturaId,
      empresa_id: empresaId,
      vacante_id: payload.vacante_id,
      candidato_id: candidato?.id || candidatoId,
      etapa: payload.etapa || 'postulado',
      fuente: payload.fuente || 'interno',
      notas_evaluacion: payload.notas_evaluacion || '',
      descarte_motivo: payload.descarte_motivo || null,
    };
    const { data, error } = await supabase
      .from('rrhh_candidaturas')
      .insert([candidaturaRow])
      .select('*, candidato:rrhh_candidatos(*)')
      .single();
    if (error) throw error;
    return normalizeCandidatura(data);
  },

  async moverCandidatura(candidaturaId, etapa, params = {}) {
    const supabase = await getSupabaseClient();
    if (etapa === 'descartado' && !String(params.descarte_motivo || '').trim()) {
      throw new Error('El descarte requiere motivo.');
    }
    const { data, error } = await supabase.rpc('mover_candidatura_rrhh', {
      p_candidatura_id: candidaturaId,
      p_etapa: etapa,
      p_motivo: params.descarte_motivo || params.motivo || null,
      p_notas: params.notas_evaluacion || null,
      p_personal_id: params.personal_id || null,
      p_personal_tipo: params.personal_tipo || null,
    });
    if (error) throw error;
    return normalizeCandidatura(data);
  },

  async invitarCandidato(empresaId, candidatoId, vacanteId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_candidaturas')
      .insert([{ id: id('candit'), empresa_id: empresaId, candidato_id: candidatoId, vacante_id: vacanteId, etapa: 'postulado', fuente: 'banco_talentos' }])
      .select('*, candidato:rrhh_candidatos(*)')
      .single();
    if (error) throw error;
    return normalizeCandidatura(data);
  },

  async getPublicVacante(token) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_vacantes')
      .select('id, empresa_id, cargo, area, sede, descripcion, posiciones, posiciones_cubiertas, estado, public_token')
      .eq('public_token', token)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeVacante(data) : null;
  },

  async crearPostulacionPublica(vacante, payload) {
    if (!vacante?.id || vacante.estado !== 'abierta') throw new Error('La vacante ya no recibe postulaciones.');
    if (payload.file && payload.file.size > 5 * 1024 * 1024) throw new Error('El CV no debe superar 5 MB.');
    if (payload.file && !['application/pdf', 'image/jpeg', 'image/png'].includes(payload.file.type)) throw new Error('Solo se aceptan PDF o imagen.');
    const supabase = await getSupabaseClient();
    let cvPath = null;
    let cvUrl = null;
    if (payload.file) {
      cvPath = `${vacante.empresa_id}/reclutamiento/${vacante.id}/${Date.now()}_${payload.file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('documentos-privados').upload(cvPath, payload.file, { contentType: payload.file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message || 'Error subiendo el archivo CV.');
      const { data: signed } = await supabase.storage.from('documentos-privados').createSignedUrl(cvPath, 600);
      cvUrl = signed?.signedUrl || null;
    }
    
    const { data, error } = await supabase.rpc('registrar_postulacion_publica', {
      p_empresa_id: vacante.empresa_id,
      p_vacante_id: vacante.id,
      p_nombre: payload.nombre,
      p_dni: payload.dni,
      p_telefono: payload.telefono || null,
      p_email: payload.email || null,
      p_cv_url: cvUrl,
      p_cv_path: cvPath,
      p_fuente: 'portal_publico'
    });
    
    if (error) throw new Error(error.message || 'No se pudo registrar la postulacion.');
    return data;
  },
};

export function crearVacanteMock(empresaId, payload = {}) {
  return normalizeVacante({
    id: id('vac'),
    empresa_id: empresaId,
    cargo: payload.cargo || 'Tecnico de Campo',
    area: payload.area || 'Operaciones',
    sede: payload.sede || 'Lima',
    descripcion: payload.descripcion || '',
    posiciones: Number(payload.posiciones || 1),
    posiciones_cubiertas: 0,
    fecha_apertura: payload.fecha_apertura || new Date().toISOString().slice(0, 10),
    estado: 'abierta',
    public_token: id('postula'),
  });
}

export function crearCandidaturaMock(empresaId, payload = {}) {
  const candidato = normalizeCandidato({
    id: payload.candidato_id || id('cand'),
    empresa_id: empresaId,
    nombre: payload.nombre,
    dni: payload.dni,
    telefono: payload.telefono || '',
    email: payload.email || '',
    cv_url: payload.cv_url || null,
    alerta_historial: payload.alerta_historial || {},
  });
  return normalizeCandidatura({
    id: id('candit'),
    empresa_id: empresaId,
    vacante_id: payload.vacante_id,
    candidato_id: candidato.id,
    candidato,
    etapa: payload.etapa || 'postulado',
    fuente: payload.fuente || 'interno',
    notas_evaluacion: payload.notas_evaluacion || '',
    historial: [{ etapa_hasta: payload.etapa || 'postulado', fecha: new Date().toISOString(), usuario: 'Demo' }],
  });
}
