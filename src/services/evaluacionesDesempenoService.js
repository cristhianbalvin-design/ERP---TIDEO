import { getSupabaseClient } from '../lib/supabaseClient.js';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

export const DEFAULT_EVALUACION_CONFIG = {
  eval_peso_autoevaluacion: 30,
  eval_peso_jefe: 70,
  eval_peso_competencias: 50,
  eval_peso_objetivos: 50,
  eval_escala_min: 1,
  eval_escala_max: 5,
  eval_escala_labels: {
    1: 'Insatisfactorio',
    2: 'Por mejorar',
    3: 'Satisfactorio',
    4: 'Destacado',
    5: 'Sobresaliente',
  },
};

export function clasificarScore(score) {
  const value = Number(score || 0);
  if (value >= 90) return { label: 'Sobresaliente', badge: 'badge-green' };
  if (value >= 75) return { label: 'Destacado', badge: 'badge-cyan' };
  if (value >= 60) return { label: 'Satisfactorio', badge: 'badge-gray' };
  if (value >= 45) return { label: 'Por mejorar', badge: 'badge-orange' };
  return { label: 'Insatisfactorio', badge: 'badge-red' };
}

export function normalizarPuntajeCompetencia(puntaje, competencia = {}) {
  const min = Number(competencia.escala_min ?? DEFAULT_EVALUACION_CONFIG.eval_escala_min);
  const max = Number(competencia.escala_max ?? DEFAULT_EVALUACION_CONFIG.eval_escala_max);
  if (max <= min) return 0;
  return clamp(((Number(puntaje || 0) - min) / (max - min)) * 100);
}

export function calcularScoreCompetencias(competencias = [], respuestas = []) {
  if (!competencias.length) return 0;
  const byCompetencia = new Map(respuestas.map(r => [String(r.competencia_id), r]));
  const scores = competencias.map(c => {
    const resp = byCompetencia.get(String(c.id));
    return normalizarPuntajeCompetencia(resp?.puntaje, c);
  });
  return round2(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

export function calcularPorcentajeObjetivo(resultado, meta) {
  const metaNum = Number(meta || 0);
  if (metaNum <= 0) return 0;
  return round2((Number(resultado || 0) / metaNum) * 100);
}

export function calcularScoreObjetivos(objetivos = [], respuestas = []) {
  if (!objetivos.length) return 100;
  const byObjetivo = new Map(respuestas.map(r => [String(r.objetivo_id), r]));
  const scores = objetivos.map(o => clamp(byObjetivo.get(String(o.id))?.porcentaje_cumplimiento || 0));
  return round2(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

export function calcularScoreEvaluador(plantilla = {}, competencias = [], objetivos = [], respuestasCompetencias = [], respuestasObjetivos = []) {
  const scoreCompetencias = calcularScoreCompetencias(competencias, respuestasCompetencias);
  const scoreObjetivos = calcularScoreObjetivos(objetivos, respuestasObjetivos);
  const pesoCompetencias = objetivos.length ? Number(plantilla.peso_competencias ?? 50) : 100;
  const pesoObjetivos = objetivos.length ? Number(plantilla.peso_objetivos ?? 50) : 0;
  return round2((scoreCompetencias * pesoCompetencias + scoreObjetivos * pesoObjetivos) / 100);
}

export function calcularScoreFinal(plantilla = {}, scoreAuto = 0, scoreJefe = 0) {
  const pesoAuto = Number(plantilla.peso_autoevaluacion ?? 30);
  const pesoJefe = Number(plantilla.peso_jefe ?? 70);
  return round2((Number(scoreAuto || 0) * pesoAuto + Number(scoreJefe || 0) * pesoJefe) / 100);
}

const orderByEmpresa = async (table, empresaId, orderBy = 'created_at', ascending = false) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('empresa_id', empresaId)
    .order(orderBy, { ascending });
  if (error) throw error;
  return data || [];
};

export async function cargarEvaluacionesDesempeno(empresaId) {
  if (!empresaId) {
    return {
      plantillas: [],
      competencias: [],
      objetivos: [],
      evaluaciones: [],
      respuestasCompetencias: [],
      respuestasObjetivos: [],
    };
  }
  const [
    plantillas,
    competencias,
    objetivos,
    evaluaciones,
    respuestasCompetencias,
    respuestasObjetivos,
  ] = await Promise.all([
    orderByEmpresa('desempeno_plantillas', empresaId, 'created_at', false),
    orderByEmpresa('desempeno_competencias', empresaId, 'orden', true),
    orderByEmpresa('desempeno_objetivos', empresaId, 'orden', true),
    orderByEmpresa('desempeno_evaluaciones', empresaId, 'updated_at', false),
    orderByEmpresa('desempeno_respuestas_competencias', empresaId, 'respondido_en', false),
    orderByEmpresa('desempeno_respuestas_objetivos', empresaId, 'respondido_en', false),
  ]);
  return { plantillas, competencias, objetivos, evaluaciones, respuestasCompetencias, respuestasObjetivos };
}

export async function crearPlantillaCompleta(empresaId, payload, creadoPor = null) {
  const supabase = await getSupabaseClient();
  const plantillaRow = {
    empresa_id: empresaId,
    nombre: payload.nombre,
    descripcion: payload.descripcion || null,
    periodo: payload.periodo,
    estado: payload.estado || 'activa',
    peso_autoevaluacion: Number(payload.peso_autoevaluacion ?? 30),
    peso_jefe: Number(payload.peso_jefe ?? 70),
    peso_competencias: Number(payload.peso_competencias ?? 50),
    peso_objetivos: Number(payload.peso_objetivos ?? 50),
    fecha_inicio: payload.fecha_inicio || null,
    fecha_limite_autoevaluacion: payload.fecha_limite_autoevaluacion || null,
    fecha_limite_jefe: payload.fecha_limite_jefe || null,
    creado_por: creadoPor,
  };

  const { data: plantilla, error: plantillaError } = await supabase
    .from('desempeno_plantillas')
    .insert(plantillaRow)
    .select('*')
    .single();
  if (plantillaError) throw plantillaError;

  const competenciasRows = (payload.competencias || []).map((c, index) => ({
    empresa_id: empresaId,
    plantilla_id: plantilla.id,
    nombre: c.nombre,
    descripcion: c.descripcion || null,
    escala_min: Number(c.escala_min ?? payload.escala_min ?? 1),
    escala_max: Number(c.escala_max ?? payload.escala_max ?? 5),
    orden: index + 1,
  }));
  const objetivosRows = (payload.objetivos || []).map((o, index) => ({
    empresa_id: empresaId,
    plantilla_id: plantilla.id,
    nombre: o.nombre,
    descripcion: o.descripcion || null,
    unidad_medida: o.unidad_medida || 'numero',
    meta_numerica: Number(o.meta_numerica || 0),
    orden: index + 1,
  }));

  const [{ data: competencias, error: compError }, { data: objetivos, error: objError }] = await Promise.all([
    competenciasRows.length
      ? supabase.from('desempeno_competencias').insert(competenciasRows).select('*')
      : Promise.resolve({ data: [], error: null }),
    objetivosRows.length
      ? supabase.from('desempeno_objetivos').insert(objetivosRows).select('*')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (compError) throw compError;
  if (objError) throw objError;

  const evaluacionesRows = payload.estado === 'borrador'
    ? []
    : (payload.colaboradores || []).map(c => ({
        empresa_id: empresaId,
        plantilla_id: plantilla.id,
        evaluado_id: c.evaluado_id,
        evaluado_nombre: c.evaluado_nombre,
        evaluado_tipo: c.evaluado_tipo,
        jefe_id: c.jefe_id || null,
        jefe_nombre: c.jefe_nombre || null,
        estado: 'pendiente',
        creado_por: creadoPor,
      }));

  const { data: evaluaciones, error: evalError } = evaluacionesRows.length
    ? await supabase.from('desempeno_evaluaciones').insert(evaluacionesRows).select('*')
    : { data: [], error: null };
  if (evalError) throw evalError;

  return { plantilla, competencias: competencias || [], objetivos: objetivos || [], evaluaciones: evaluaciones || [] };
}

export async function actualizarPlantilla(plantillaId, patch) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('desempeno_plantillas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', plantillaId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarEvaluacion(evaluacionId, patch) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('desempeno_evaluaciones')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', evaluacionId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertRespuestasCompetencias(empresaId, evaluacionId, tipoEvaluador, respuestas = [], respondidoPor = null) {
  if (!respuestas.length) return [];
  const supabase = await getSupabaseClient();
  const now = new Date().toISOString();
  const rows = respuestas.map(r => ({
    empresa_id: empresaId,
    evaluacion_id: evaluacionId,
    competencia_id: r.competencia_id,
    tipo_evaluador: tipoEvaluador,
    puntaje: Number(r.puntaje || 0),
    comentario: r.comentario || null,
    respondido_por: respondidoPor,
    respondido_en: now,
    updated_at: now,
  }));
  const { data, error } = await supabase
    .from('desempeno_respuestas_competencias')
    .upsert(rows, { onConflict: 'evaluacion_id,competencia_id,tipo_evaluador' })
    .select('*');
  if (error) throw error;
  return data || [];
}

export async function upsertRespuestasObjetivos(empresaId, evaluacionId, tipoEvaluador, respuestas = [], respondidoPor = null) {
  if (!respuestas.length) return [];
  const supabase = await getSupabaseClient();
  const now = new Date().toISOString();
  const rows = respuestas.map(r => ({
    empresa_id: empresaId,
    evaluacion_id: evaluacionId,
    objetivo_id: r.objetivo_id,
    tipo_evaluador: tipoEvaluador,
    resultado_real: Number(r.resultado_real || 0),
    porcentaje_cumplimiento: Number(r.porcentaje_cumplimiento || 0),
    comentario: r.comentario || null,
    respondido_por: respondidoPor,
    respondido_en: now,
    updated_at: now,
  }));
  const { data, error } = await supabase
    .from('desempeno_respuestas_objetivos')
    .upsert(rows, { onConflict: 'evaluacion_id,objetivo_id,tipo_evaluador' })
    .select('*');
  if (error) throw error;
  return data || [];
}
