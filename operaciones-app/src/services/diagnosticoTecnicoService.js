import { getSupabaseClient } from '../lib/supabaseClient.js';

const DIAGNOSTICO_COLUMNS = 'id,empresa_id,tipo,oportunidad_id,recepcion_id,activo_id,estado,elaborado_por,emitido_por,emitido_en,created_at,updated_at';
const LINEA_COLUMNS = 'id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,hallazgo,cargo_id,horas_mano_obra,activo_id,horas_maquina,orden,created_at,updated_at';
const MATERIAL_COLUMNS = 'id,empresa_id,linea_id,material_id,descripcion,cantidad,unidad,orden,created_at';
const FAMILIA_COLUMNS = 'id,empresa_id,nombre,activo';
const TIPO_SERVICIO_COLUMNS = 'id,empresa_id,codigo,nombre,clasificacion,estado';
const CARGO_COLUMNS = 'id,codigo,nombre,tipo,estado';
const ACTIVO_COLUMNS = 'id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id';

const requireEmpresa = empresaId => {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
};

const requireTipo = tipo => {
  if (!['fabricacion', 'mantenimiento'].includes(tipo)) {
    throw new Error('El tipo de diagnóstico no es válido.');
  }
};

const requireId = (value, message) => {
  if (!value) throw new Error(message);
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
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
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

  const lineaIds = (lineas || []).map(linea => linea.id);
  let materiales = [];
  if (lineaIds.length) {
    const { data, error } = await supabase
      .from('diagnostico_tecnico_linea_materiales')
      .select(MATERIAL_COLUMNS)
      .eq('empresa_id', empresaId)
      .in('linea_id', lineaIds)
      .order('orden')
      .order('created_at');
    if (error) throw error;
    materiales = data || [];
  }

  const materialesPorLinea = new Map();
  materiales.forEach(material => {
    const actuales = materialesPorLinea.get(material.linea_id) || [];
    actuales.push(material);
    materialesPorLinea.set(material.linea_id, actuales);
  });

  return {
    ...diagnostico,
    lineas: (lineas || []).map(linea => ({
      ...linea,
      materiales: materialesPorLinea.get(linea.id) || [],
    })),
  };
}

export async function crearDiagnosticoTecnico(empresaId, usuarioId, datos) {
  requireEmpresa(empresaId);
  requireTipo(datos?.tipo);
  requireId(usuarioId, 'No se pudo identificar al usuario autenticado.');
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

export async function listarFamiliasTrabajo(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('familia_trabajo')
    .select(FAMILIA_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function listarTiposServicioInterno(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('tipos_servicio_interno')
    .select(TIPO_SERVICIO_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function listarCargosEmpresa(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('cargos_empresa')
    .select(CARGO_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function listarActivosPropios(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('activos')
    .select(ACTIVO_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('propietario_tipo', 'propio')
    .is('cliente_propietario_id', null)
    .neq('estado', 'dado_baja')
    .order('codigo');
  if (error) throw error;
  return data || [];
}

export async function buscarOCrearFamiliaTrabajo(empresaId, nombre) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient().rpc('buscar_o_crear_familia_trabajo', {
    p_empresa_id: empresaId,
    p_nombre: nombre,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function buscarOCrearTipoServicioInterno(empresaId, nombre) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient().rpc('buscar_o_crear_tipo_servicio_interno', {
    p_empresa_id: empresaId,
    p_nombre: nombre,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function obtenerDiagnosticoLinea(empresaId, lineaId) {
  requireEmpresa(empresaId);
  requireId(lineaId, 'Falta la línea del diagnóstico.');
  const supabase = getSupabaseClient();
  const { data: linea, error: lineaError } = await supabase
    .from('diagnostico_tecnico_lineas')
    .select(LINEA_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('id', lineaId)
    .single();
  if (lineaError) throw lineaError;
  const { data: materiales, error: materialesError } = await supabase
    .from('diagnostico_tecnico_linea_materiales')
    .select(MATERIAL_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('linea_id', lineaId)
    .order('orden')
    .order('created_at');
  if (materialesError) throw materialesError;
  return { ...linea, materiales: materiales || [] };
}

const linePayload = (empresaId, diagnosticoId, linea) => ({
  empresa_id: empresaId,
  diagnostico_id: diagnosticoId,
  familia_trabajo_id: linea.familia_trabajo_id,
  actividad_id: linea.actividad_id || null,
  tarea_id: linea.tarea_id,
  hallazgo: linea.hallazgo || null,
  cargo_id: linea.cargo_id || null,
  horas_mano_obra: Number(linea.horas_mano_obra) || 0,
  activo_id: linea.activo_id || null,
  horas_maquina: linea.activo_id ? Number(linea.horas_maquina) || 0 : 0,
  orden: Number(linea.orden) || 0,
});

const materialPayload = (empresaId, lineaId, material, orden) => ({
  empresa_id: empresaId,
  linea_id: lineaId,
  material_id: null,
  descripcion: String(material.descripcion || '').trim() || null,
  cantidad: Number(material.cantidad),
  unidad: String(material.unidad || 'und').trim() || 'und',
  orden,
});

export async function guardarDiagnosticoLinea(empresaId, diagnosticoId, linea) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  requireId(linea?.familia_trabajo_id, 'Selecciona un trabajo.');
  requireId(linea?.tarea_id, 'Selecciona o crea una tarea.');
  const supabase = getSupabaseClient();
  const payload = linePayload(empresaId, diagnosticoId, linea);
  let query = supabase.from('diagnostico_tecnico_lineas');
  let data;
  let error;
  if (linea.id) {
    ({ data, error } = await query
      .update(payload)
      .eq('id', linea.id)
      .eq('empresa_id', empresaId)
      .eq('diagnostico_id', diagnosticoId)
      .select(LINEA_COLUMNS)
      .single());
  } else {
    ({ data, error } = await query
      .insert(payload)
      .select(LINEA_COLUMNS)
      .single());
  }
  if (error) throw getError(error);
  return data;
}

export async function sincronizarMaterialesLinea(empresaId, lineaId, anteriores = [], actuales = []) {
  requireEmpresa(empresaId);
  requireId(lineaId, 'Falta la línea del diagnóstico.');
  const supabase = getSupabaseClient();
  const actualesConOrden = actuales.map((material, index) => ({ ...material, orden: index }));
  const idsActuales = new Set(actualesConOrden.filter(material => material.id).map(material => material.id));
  for (const material of anteriores) {
    if (!idsActuales.has(material.id)) {
      const { error } = await supabase
        .from('diagnostico_tecnico_linea_materiales')
        .delete()
        .eq('id', material.id)
        .eq('empresa_id', empresaId)
        .eq('linea_id', lineaId);
      if (error) throw getError(error);
    }
  }
  for (const material of actualesConOrden) {
    const payload = materialPayload(empresaId, lineaId, material, material.orden);
    if (material.id) {
      const { error } = await supabase
        .from('diagnostico_tecnico_linea_materiales')
        .update(payload)
        .eq('id', material.id)
        .eq('empresa_id', empresaId)
        .eq('linea_id', lineaId);
      if (error) throw getError(error);
    } else {
      const { error } = await supabase
        .from('diagnostico_tecnico_linea_materiales')
        .insert(payload);
      if (error) throw getError(error);
    }
  }
}

export async function eliminarDiagnosticoLinea(empresaId, diagnosticoId, lineaId) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  requireId(lineaId, 'Falta la línea del diagnóstico.');
  const { error } = await getSupabaseClient()
    .from('diagnostico_tecnico_lineas')
    .delete()
    .eq('id', lineaId)
    .eq('empresa_id', empresaId)
    .eq('diagnostico_id', diagnosticoId);
  if (error) throw getError(error);
}
