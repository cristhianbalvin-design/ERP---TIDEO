import { getSupabaseClient } from '../lib/supabaseClient.js';

const DIAGNOSTICO_COLUMNS = 'id,empresa_id,tipo,oportunidad_id,recepcion_id,activo_id,estado,elaborado_por,emitido_por,emitido_en,created_at,updated_at';
const LINEA_COLUMNS = 'id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,hallazgo,cargo_id,horas_mano_obra,activo_id,horas_maquina,orden,created_at,updated_at';

const requireEmpresa = empresaId => {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
};

const requireTipo = tipo => {
  if (!['fabricacion', 'mantenimiento'].includes(tipo)) {
    throw new Error('El tipo de diagnóstico no es válido.');
  }
};

const getError = error => error || new Error('No se pudo completar la operación.');

export async function usuarioPuedeDiagnostico(empresaId, accion) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient().rpc('usuario_puede', {
    target_empresa_id: empresaId,
    target_pantalla: 'diagnostico_tecnico',
    target_accion: accion,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function listarDiagnosticosTecnicos(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('diagnosticos_tecnicos')
    .select(DIAGNOSTICO_COLUMNS)
    .eq('empresa_id', empresaId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerDiagnosticoTecnico(empresaId, diagnosticoId) {
  requireEmpresa(empresaId);
  if (!diagnosticoId) throw new Error('Falta el diagnóstico técnico.');
  const supabase = getSupabaseClient();
  const [{ data: diagnostico, error: diagnosticoError }, { data: lineas, error: lineasError }] = await Promise.all([
    supabase
      .from('diagnosticos_tecnicos')
      .select(DIAGNOSTICO_COLUMNS)
      .eq('empresa_id', empresaId)
      .eq('id', diagnosticoId)
      .single(),
    supabase
      .from('diagnostico_tecnico_lineas')
      .select(LINEA_COLUMNS)
      .eq('empresa_id', empresaId)
      .eq('diagnostico_id', diagnosticoId)
      .order('orden')
      .order('created_at'),
  ]);
  if (diagnosticoError) throw diagnosticoError;
  if (lineasError) throw lineasError;
  return { ...diagnostico, lineas: lineas || [] };
}

export async function crearDiagnosticoTecnico(empresaId, usuarioId, datos) {
  requireEmpresa(empresaId);
  requireTipo(datos?.tipo);
  if (!usuarioId) throw new Error('No se pudo identificar al usuario autenticado.');
  if (datos.tipo === 'fabricacion' && !datos.oportunidad_id) {
    throw new Error('Selecciona una oportunidad para el diagnóstico de fabricación.');
  }
  if (datos.tipo === 'mantenimiento' && !datos.recepcion_id) {
    throw new Error('Selecciona una recepción para el diagnóstico de mantenimiento.');
  }

  const payload = {
    empresa_id: empresaId,
    tipo: datos.tipo,
    oportunidad_id: datos.tipo === 'fabricacion' ? datos.oportunidad_id : null,
    recepcion_id: datos.tipo === 'mantenimiento' ? datos.recepcion_id : null,
    elaborado_por: usuarioId,
    estado: 'borrador',
  };
  const { data, error } = await getSupabaseClient()
    .from('diagnosticos_tecnicos')
    .insert(payload)
    .select(DIAGNOSTICO_COLUMNS)
    .single();
  if (error) throw getError(error);
  return data;
}

export async function listarReferenciasDiagnostico(empresaId, tipo, busqueda = '') {
  requireEmpresa(empresaId);
  requireTipo(tipo);
  const { data, error } = await getSupabaseClient().rpc('listar_referencias_diagnostico', {
    p_empresa_id: empresaId,
    p_tipo: tipo,
    p_busqueda: String(busqueda || '').trim() || null,
  });
  if (error) throw error;
  return data || [];
}

export async function resolverReferenciasDiagnostico(empresaId, tipo, ids) {
  requireEmpresa(empresaId);
  requireTipo(tipo);
  const { data, error } = await getSupabaseClient().rpc('resolver_referencias_diagnostico', {
    p_empresa_id: empresaId,
    p_tipo: tipo,
    p_ids: ids,
  });
  if (error) throw error;
  return data || [];
}
