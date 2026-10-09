import { getSupabaseClient } from '../lib/supabaseClient.js';

const DIAGNOSTICO_COLUMNS = 'id,empresa_id,tipo,oportunidad_id,recepcion_id,activo_id,estado,resumen_diagnostico,resumen_origen,elaborado_por,emitido_por,emitido_en,created_at,updated_at';
const LINEA_COLUMNS = 'id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,hallazgo,cargo_id,horas_mano_obra,activo_id,horas_maquina,orden,created_at,updated_at';
const MATERIAL_COLUMNS = 'id,empresa_id,linea_id,material_id,descripcion,cantidad,unidad,orden,created_at';
const FAMILIA_COLUMNS = 'id,empresa_id,nombre,activo';
const TIPO_SERVICIO_COLUMNS = 'id,empresa_id,codigo,nombre,clasificacion,estado,rol,familia_trabajo_id';
const CARGO_COLUMNS = 'id,codigo,nombre,tipo,estado';
const ACTIVO_COLUMNS = 'id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id';
const HALLAZGO_COLUMNS = 'id,empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,matriz_version,prioridad_calculada,prioridad_override,prioridad_override_motivo,prioridad_efectiva,accion_recomendada,atribuible_a,observacion,incluir_en_informe,created_by,created_at,updated_at';
const MEDICION_COLUMNS = 'id,empresa_id,hallazgo_id,parametro,unidad,nominal,minimo,maximo,medido,resultado_calculado,condicion_sugerida,created_by,created_at,updated_at';
const HALLAZGO_LINEA_COLUMNS = 'id,empresa_id,hallazgo_id,linea_id,created_by,created_at';
const DIAGNOSTICO_CATALOGO_COLUMNS = 'id,empresa_id,catalogo,codigo,etiqueta,orden,activo,default_id';

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

const projectRpcRow = (data, columns) => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return row;
  return columns.split(',').reduce((projected, column) => {
    if (Object.prototype.hasOwnProperty.call(row, column)) projected[column] = row[column];
    return projected;
  }, {});
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

const mensajeErrorEstado = (error, accion) => {
  const codigo = error?.code;
  if (codigo === '42501') return `No tienes permiso para ${accion} el diagnóstico.`;
  if (codigo === 'P0002') return 'El diagnóstico ya no existe.';
  if (codigo === '22023' && error?.message) return error.message;
  return error?.message || 'No se pudo completar el cambio de estado.';
};

export async function emitirDiagnosticoTecnico(diagnosticoId) {
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const { data, error } = await getSupabaseClient().rpc('emitir_diagnostico_tecnico', { p_id: diagnosticoId });
  if (error) throw new Error(mensajeErrorEstado(error, 'emitir'));
  return projectRpcRow(data, 'id,estado,emitido_por,emitido_en');
}

export async function reabrirDiagnosticoTecnico(diagnosticoId, motivo) {
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const { data, error } = await getSupabaseClient().rpc('reabrir_diagnostico_tecnico', { p_id: diagnosticoId, p_motivo: motivo });
  if (error) throw new Error(mensajeErrorEstado(error, 'reabrir'));
  return projectRpcRow(data, 'id,estado,emitido_por,emitido_en');
}

export async function listarHistorialEstadosDiagnostico(empresaId, diagnosticoId) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const { data, error } = await getSupabaseClient()
    .from('diagnostico_tecnico_estado_historial')
    .select('id,empresa_id,diagnostico_id,estado_anterior,estado_nuevo,motivo,usuario_id,ocurrido_en')
    .eq('empresa_id', empresaId)
    .eq('diagnostico_id', diagnosticoId)
    .order('ocurrido_en', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    usuario_nombre: `Usuario ····${String(row.usuario_id || '').slice(-4) || '????'}`,
  }));
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

  const { data: hallazgos, error: hallazgosError } = await supabase
    .from('diagnostico_tecnico_hallazgos')
    .select(HALLAZGO_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('diagnostico_id', diagnosticoId)
    .order('created_at');
  if (hallazgosError) throw hallazgosError;

  const hallazgoIds = (hallazgos || []).map(hallazgo => hallazgo.id);
  let mediciones = [];
  let enlaces = [];
  if (hallazgoIds.length) {
    const [{ data: medicionesData, error: medicionesError }, { data: enlacesData, error: enlacesError }] = await Promise.all([
      supabase.from('diagnostico_tecnico_hallazgo_mediciones').select(MEDICION_COLUMNS).eq('empresa_id', empresaId).in('hallazgo_id', hallazgoIds).order('created_at'),
      supabase.from('diagnostico_tecnico_hallazgo_lineas').select(HALLAZGO_LINEA_COLUMNS).eq('empresa_id', empresaId).in('hallazgo_id', hallazgoIds).order('created_at'),
    ]);
    if (medicionesError) throw medicionesError;
    if (enlacesError) throw enlacesError;
    mediciones = medicionesData || [];
    enlaces = enlacesData || [];
  }
  const medicionesPorHallazgo = new Map();
  mediciones.forEach(medicion => medicionesPorHallazgo.set(medicion.hallazgo_id, [...(medicionesPorHallazgo.get(medicion.hallazgo_id) || []), medicion]));
  const enlacesPorHallazgo = new Map();
  enlaces.forEach(enlace => enlacesPorHallazgo.set(enlace.hallazgo_id, [...(enlacesPorHallazgo.get(enlace.hallazgo_id) || []), enlace]));

  return {
    ...diagnostico,
    lineas: (lineas || []).map(linea => ({
      ...linea,
      materiales: materialesPorLinea.get(linea.id) || [],
    })),
    hallazgos: (hallazgos || []).map(hallazgo => ({
      ...hallazgo,
      mediciones: medicionesPorHallazgo.get(hallazgo.id) || [],
      lineas: enlacesPorHallazgo.get(hallazgo.id) || [],
    })),
  };
}

export async function guardarResumenDiagnostico(empresaId, diagnosticoId, resumen, origen) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  if (!['auto', 'editado'].includes(origen)) throw new Error('El origen del resumen no es válido.');
  const { data, error } = await getSupabaseClient()
    .from('diagnosticos_tecnicos')
    .update({ resumen_diagnostico: resumen || null, resumen_origen: origen })
    .eq('empresa_id', empresaId)
    .eq('id', diagnosticoId)
    .eq('estado', 'borrador')
    .select('id,resumen_diagnostico,resumen_origen')
    .single();
  if (error) throw getError(error);
  return data;
}

export async function listarCatalogosHallazgos(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('diagnostico_catalogo_valores')
    .select(DIAGNOSTICO_CATALOGO_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('catalogo')
    .order('orden');
  if (error) throw error;
  return data || [];
}

const hallazgoPayload = (empresaId, diagnosticoId, hallazgo) => ({
  empresa_id: empresaId,
  diagnostico_id: diagnosticoId,
  familia_trabajo_id: hallazgo.familia_trabajo_id,
  componente_parte: String(hallazgo.componente_parte || '').trim(),
  tipo_dano_codigo: hallazgo.tipo_dano_codigo,
  causa_probable_codigo: hallazgo.causa_probable_codigo,
  condicion: hallazgo.condicion,
  riesgo: hallazgo.riesgo,
  matriz_version: Number(hallazgo.matriz_version) || 1,
  prioridad_override: hallazgo.prioridad_override || null,
  prioridad_override_motivo: hallazgo.prioridad_override_motivo || null,
  accion_recomendada: hallazgo.accion_recomendada,
  atribuible_a: hallazgo.atribuible_a,
  observacion: hallazgo.observacion || null,
  incluir_en_informe: hallazgo.incluir_en_informe !== false,
});

export async function crearDiagnosticoHallazgo(empresaId, diagnosticoId, hallazgo) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const { data, error } = await getSupabaseClient()
    .from('diagnostico_tecnico_hallazgos')
    .insert(hallazgoPayload(empresaId, diagnosticoId, hallazgo))
    .select(HALLAZGO_COLUMNS)
    .single();
  if (error) throw getError(error);
  return data;
}

export async function actualizarDiagnosticoHallazgo(empresaId, diagnosticoId, hallazgo) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  requireId(hallazgo?.id, 'Falta el hallazgo técnico.');
  const { data, error } = await getSupabaseClient()
    .from('diagnostico_tecnico_hallazgos')
    .update(hallazgoPayload(empresaId, diagnosticoId, hallazgo))
    .eq('id', hallazgo.id)
    .eq('empresa_id', empresaId)
    .eq('diagnostico_id', diagnosticoId)
    .select(HALLAZGO_COLUMNS)
    .single();
  if (error) throw getError(error);
  return data;
}

export async function eliminarDiagnosticoHallazgo(empresaId, hallazgoId) {
  requireEmpresa(empresaId);
  requireId(hallazgoId, 'Falta el hallazgo técnico.');
  const { error } = await getSupabaseClient()
    .from('diagnostico_tecnico_hallazgos')
    .delete()
    .eq('id', hallazgoId)
    .eq('empresa_id', empresaId);
  if (error) throw getError(error);
}

const medicionPayload = (empresaId, hallazgoId, medicion) => ({
  empresa_id: empresaId,
  hallazgo_id: hallazgoId,
  parametro: String(medicion.parametro || '').trim(),
  unidad: medicion.unidad,
  nominal: medicion.nominal === '' || medicion.nominal == null ? null : Number(medicion.nominal),
  minimo: medicion.minimo === '' || medicion.minimo == null ? null : Number(medicion.minimo),
  maximo: medicion.maximo === '' || medicion.maximo == null ? null : Number(medicion.maximo),
  medido: medicion.medido === '' || medicion.medido == null ? null : Number(medicion.medido),
});

export async function crearDiagnosticoMedicion(empresaId, hallazgoId, medicion) {
  requireEmpresa(empresaId);
  requireId(hallazgoId, 'Falta el hallazgo técnico.');
  const { data, error } = await getSupabaseClient().from('diagnostico_tecnico_hallazgo_mediciones').insert(medicionPayload(empresaId, hallazgoId, medicion)).select(MEDICION_COLUMNS).single();
  if (error) throw getError(error);
  return data;
}

export async function actualizarDiagnosticoMedicion(empresaId, hallazgoId, medicion) {
  requireEmpresa(empresaId);
  requireId(medicion?.id, 'Falta la medición técnica.');
  const { data, error } = await getSupabaseClient().from('diagnostico_tecnico_hallazgo_mediciones').update(medicionPayload(empresaId, hallazgoId, medicion)).eq('id', medicion.id).eq('empresa_id', empresaId).eq('hallazgo_id', hallazgoId).select(MEDICION_COLUMNS).single();
  if (error) throw getError(error);
  return data;
}

export async function eliminarDiagnosticoMedicion(empresaId, medicionId) {
  requireEmpresa(empresaId);
  requireId(medicionId, 'Falta la medición técnica.');
  const { error } = await getSupabaseClient().from('diagnostico_tecnico_hallazgo_mediciones').delete().eq('id', medicionId).eq('empresa_id', empresaId);
  if (error) throw getError(error);
}

export async function crearEnlaceDiagnosticoHallazgoLinea(empresaId, hallazgoId, lineaId) {
  requireEmpresa(empresaId);
  requireId(hallazgoId, 'Falta el hallazgo técnico.');
  requireId(lineaId, 'Falta la línea técnica.');
  const { data, error } = await getSupabaseClient().from('diagnostico_tecnico_hallazgo_lineas').insert({ empresa_id: empresaId, hallazgo_id: hallazgoId, linea_id: lineaId }).select(HALLAZGO_LINEA_COLUMNS).single();
  if (error) throw getError(error);
  return data;
}

export async function eliminarEnlaceDiagnosticoHallazgoLinea(empresaId, enlaceId) {
  requireEmpresa(empresaId);
  requireId(enlaceId, 'Falta el enlace del hallazgo.');
  const { error } = await getSupabaseClient().from('diagnostico_tecnico_hallazgo_lineas').delete().eq('id', enlaceId).eq('empresa_id', empresaId);
  if (error) throw getError(error);
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
  const references = data || [];
  if (tipo !== 'mantenimiento' || !references.length) return references;
  const { data: receipts, error: receiptError } = await getSupabaseClient()
    .from('recepciones_activos_cliente')
    .select('id,fecha_ingreso')
    .eq('empresa_id', empresaId)
    .in('id', references.map(reference => reference.id));
  if (receiptError) return references;
  const dates = new Map((receipts || []).map(receipt => [receipt.id, receipt.fecha_ingreso]));
  return references.map(reference => ({ ...reference, fecha_ingreso: dates.get(reference.id) || null }));
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

export async function listarPlantillasActividad(empresaId) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient()
    .from('plantillas_actividad')
    .select('actividad_id,tarea_id,cargo_id,orden,horas,activo_id,horas_maquina')
    .eq('empresa_id', empresaId)
    .order('actividad_id')
    .order('orden');
  if (error) throw error;
  return data || [];
}

export async function listarUsoTareasPorEmpresa(empresaId) {
  requireEmpresa(empresaId);
  const frecuencias = {};
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    // La consulta conserva el aislamiento de empresa y respeta las políticas RLS del cliente.
    const { data, error } = await getSupabaseClient()
      .from('diagnostico_tecnico_lineas')
      .select('tarea_id')
      .eq('empresa_id', empresaId)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    rows.forEach(({ tarea_id: tareaId }) => {
      if (tareaId) frecuencias[tareaId] = (frecuencias[tareaId] || 0) + 1;
    });
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return frecuencias;
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
  return projectRpcRow(data, FAMILIA_COLUMNS);
}

export async function buscarOCrearTipoServicioInterno(empresaId, nombre, rol = null, familiaTrabajoId = null) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient().rpc('buscar_o_crear_tipo_servicio_interno', {
    p_empresa_id: empresaId,
    p_nombre: nombre,
    p_rol: rol,
    ...(familiaTrabajoId ? { p_familia_trabajo_id: familiaTrabajoId } : {}),
  });
  if (error) throw error;
  return projectRpcRow(data, TIPO_SERVICIO_COLUMNS);
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
  tarea_id: linea.tarea_id || null,
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
  if (!linea?.actividad_id && !linea?.tarea_id) throw new Error('Selecciona una actividad o una tarea.');
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
