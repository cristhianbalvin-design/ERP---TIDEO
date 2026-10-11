import { getSupabaseClient } from '../lib/supabaseClient.js';
import { catalogoComponentesService } from '../../../src/services/catalogoComponentesService.js';

const DIAGNOSTICO_COLUMNS = 'id,empresa_id,tipo,oportunidad_id,recepcion_id,activo_id,estado,resumen_diagnostico,resumen_origen,elaborado_por,emitido_por,emitido_en,created_at,updated_at';
const LINEA_COLUMNS = 'id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,hallazgo,cargo_id,horas_mano_obra,activo_id,horas_maquina,orden,created_at,updated_at';
const MATERIAL_COLUMNS = 'id,empresa_id,linea_id,material_id,descripcion,cantidad,unidad,orden,created_at';
const FAMILIA_COLUMNS = 'id,empresa_id,nombre,activo';
const TIPO_SERVICIO_COLUMNS = 'id,empresa_id,codigo,nombre,clasificacion,estado,rol,familia_trabajo_id';
const CARGO_COLUMNS = 'id,codigo,nombre,tipo,estado';
const ACTIVO_COLUMNS = 'id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id';
const HALLAZGO_COLUMNS = 'id,empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,componente_catalogo_id,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,matriz_version,prioridad_calculada,prioridad_override,prioridad_override_motivo,prioridad_efectiva,accion_recomendada,atribuible_a,observacion,incluir_en_informe,created_by,created_at,updated_at';
const MEDICION_COLUMNS = 'id,empresa_id,hallazgo_id,parametro,unidad,nominal,minimo,maximo,medido,zona_id,medida_id,cota,resultado_calculado,condicion_sugerida,created_by,created_at,updated_at';
const ZONA_HALLAZGO_COLUMNS = 'id,empresa_id,hallazgo_id,componente_id,zona_id,orden,nota,creado_en';
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
  let zonasHallazgos = [];
  let enlaces = [];
  if (hallazgoIds.length) {
    const [{ data: medicionesData, error: medicionesError }, { data: enlacesData, error: enlacesError }, { data: zonasData, error: zonasError }] = await Promise.all([
      supabase.from('diagnostico_tecnico_hallazgo_mediciones').select(MEDICION_COLUMNS).eq('empresa_id', empresaId).in('hallazgo_id', hallazgoIds).order('created_at'),
      supabase.from('diagnostico_tecnico_hallazgo_lineas').select(HALLAZGO_LINEA_COLUMNS).eq('empresa_id', empresaId).in('hallazgo_id', hallazgoIds).order('created_at'),
      supabase.from('diagnostico_tecnico_hallazgo_zonas').select(ZONA_HALLAZGO_COLUMNS).eq('empresa_id', empresaId).in('hallazgo_id', hallazgoIds).order('orden'),
    ]);
    if (medicionesError) throw medicionesError;
    if (enlacesError) throw enlacesError;
    if (zonasError) throw zonasError;
    mediciones = medicionesData || [];
    enlaces = enlacesData || [];
    zonasHallazgos = zonasData || [];
  }
  const medicionesPorHallazgo = new Map();
  mediciones.forEach(medicion => medicionesPorHallazgo.set(medicion.hallazgo_id, [...(medicionesPorHallazgo.get(medicion.hallazgo_id) || []), medicion]));
  const enlacesPorHallazgo = new Map();
  enlaces.forEach(enlace => enlacesPorHallazgo.set(enlace.hallazgo_id, [...(enlacesPorHallazgo.get(enlace.hallazgo_id) || []), enlace]));
  const zonasPorHallazgo = new Map();
  zonasHallazgos.forEach(zona => zonasPorHallazgo.set(zona.hallazgo_id, [...(zonasPorHallazgo.get(zona.hallazgo_id) || []), zona]));

  return {
    ...diagnostico,
    lineas: (lineas || []).map(linea => ({
      ...linea,
      materiales: materialesPorLinea.get(linea.id) || [],
    })),
    hallazgos: (hallazgos || []).map(hallazgo => ({
      ...hallazgo,
      mediciones: medicionesPorHallazgo.get(hallazgo.id) || [],
      zonas: zonasPorHallazgo.get(hallazgo.id) || [],
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
  componente_catalogo_id: hallazgo.componente_catalogo_id || null,
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
  let payload = hallazgoPayload(empresaId, diagnosticoId, hallazgo);
  if (!payload.componente_catalogo_id) {
    const supabase = getSupabaseClient();
    const { data: diag, error: diagError } = await supabase.from('diagnosticos_tecnicos').select('recepcion_id').eq('empresa_id', empresaId).eq('id', diagnosticoId).single();
    if (diagError) throw new Error(diagError.message || 'No se pudo obtener el activo de la recepción.');
    if (diag?.recepcion_id) {
      const { data: recepcion, error: recepcionError } = await supabase.from('recepciones_activos_cliente').select('activo_id').eq('empresa_id', empresaId).eq('id', diag.recepcion_id).single();
      if (recepcionError) throw new Error(recepcionError.message || 'No se pudo obtener el activo de la recepción.');
      if (recepcion?.activo_id) {
        const { data: activo, error: activoError } = await supabase.from('activos').select('componente_catalogo_id,tipo_activo').eq('empresa_id', empresaId).eq('id', recepcion.activo_id).maybeSingle();
        if (activoError) throw new Error(activoError.message || 'No se pudo obtener el componente del activo.');
        if (activo?.tipo_activo !== 'maquinaria_completa' && activo?.componente_catalogo_id) {
          const { data: componente, error: componenteError } = await supabase.from('catalogo_componentes').select('id,nombre').eq('id', activo.componente_catalogo_id).single();
          if (componenteError) throw new Error(componenteError.message || 'No se pudo obtener el nombre del componente.');
          payload = { ...payload, componente_catalogo_id: componente.id, componente_parte: componente.nombre };
        }
      }
    }
  }
  const { data, error } = await getSupabaseClient()
    .from('diagnostico_tecnico_hallazgos')
    .insert(payload)
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
  parametro: String(medicion.parametro || medicion.nombre || '').trim(),
  unidad: medicion.unidad || (medicion.medida_id ? 'mm' : null),
  nominal: medicion.nominal === '' || medicion.nominal == null ? null : Number(medicion.nominal),
  minimo: medicion.minimo === '' || medicion.minimo == null ? null : Number(medicion.minimo),
  maximo: medicion.maximo === '' || medicion.maximo == null ? null : Number(medicion.maximo),
  medido: medicion.medido === '' || medicion.medido == null ? null : Number(medicion.medido),
  zona_id: medicion.zona_id || null,
  medida_id: medicion.medida_id || null,
  cota: medicion.cota || null,
});

export async function guardarComponenteCatalogoHallazgo(empresaId, diagnosticoId, hallazgoId, componenteId, nombre = null) {
  requireEmpresa(empresaId); requireId(diagnosticoId, 'Falta el diagnóstico técnico.'); requireId(hallazgoId, 'Falta el hallazgo técnico.');
  if (componenteId) {
    const supabase = getSupabaseClient();
    const { data: diagnostico, error: diagnosticoError } = await supabase.from('diagnosticos_tecnicos').select('recepcion_id').eq('empresa_id', empresaId).eq('id', diagnosticoId).single();
    if (diagnosticoError) throw new Error(diagnosticoError.message || 'No se pudo obtener la recepción del diagnóstico.');
    const { data: recepcion, error: recepcionError } = await supabase.from('recepciones_activos_cliente').select('activo_id').eq('empresa_id', empresaId).eq('id', diagnostico.recepcion_id).single();
    if (recepcionError) throw new Error(recepcionError.message || 'No se pudo obtener el activo de la recepción.');
    const { data: activo, error: activoError } = await supabase.from('activos').select('tipo_activo').eq('empresa_id', empresaId).eq('id', recepcion.activo_id).single();
    if (activoError) throw new Error(activoError.message || 'No se pudo obtener el tipo de activo.');
    if (activo.tipo_activo !== 'maquinaria_completa') await asignarComponenteCatalogoActivo(empresaId, recepcion.activo_id, componenteId);
  }
  const update = { componente_catalogo_id: componenteId || null };
  if (componenteId && nombre) update.componente_parte = String(nombre).trim();
  const { data, error } = await getSupabaseClient().from('diagnostico_tecnico_hallazgos').update(update).eq('empresa_id', empresaId).eq('diagnostico_id', diagnosticoId).eq('id', hallazgoId).select(HALLAZGO_COLUMNS).single();
  if (error) throw new Error(error.message || 'No se pudo guardar el componente del hallazgo.');
  return data;
}

export async function reemplazarZonasHallazgo(empresaId, hallazgoId, componenteId, zonas = []) {
  requireEmpresa(empresaId); requireId(hallazgoId, 'Falta el hallazgo técnico.'); requireId(componenteId, 'Selecciona un componente de catálogo.');
  const payload = zonas.map((zona, index) => ({ zona_id: zona.zona_id || zona.id, orden: index + 1, nota: String(zona.nota || '').trim() || null }));
  const { data, error } = await getSupabaseClient().rpc('reemplazar_zonas_hallazgo_diagnostico', { p_empresa_id: empresaId, p_hallazgo_id: hallazgoId, p_componente_id: componenteId, p_zonas: payload });
  if (error) throw new Error(error.message || 'No se pudieron guardar las zonas del hallazgo.');
  return data || [];
}

export async function guardarMedicionLigada(empresaId, hallazgoId, medicion) {
  requireEmpresa(empresaId); requireId(hallazgoId, 'Falta el hallazgo técnico.');
  return medicion.id ? actualizarDiagnosticoMedicion(empresaId, hallazgoId, medicion) : crearDiagnosticoMedicion(empresaId, hallazgoId, medicion);
}

export async function asignarComponenteCatalogoActivo(empresaId, activoId, componenteId) {
  requireEmpresa(empresaId); requireId(activoId, 'Falta el activo.');
  const { data, error } = await getSupabaseClient().rpc('asignar_componente_catalogo_activo', { p_empresa_id: empresaId, p_activo_id: activoId, p_componente_id: componenteId || null });
  if (error) throw new Error(error.message || 'No se pudo guardar el componente del activo.');
  return data;
}

export async function crearTipoDanoDiagnostico(empresaId, etiqueta) {
  requireEmpresa(empresaId);
  const { data, error } = await getSupabaseClient().rpc('crear_tipo_dano_diagnostico', { p_empresa_id: empresaId, p_etiqueta: etiqueta });
  if (error) throw new Error(error.message || 'No se pudo crear el tipo de daño.');
  const fila = Array.isArray(data) ? data[0] : data;
  const catalogo = await listarCatalogosHallazgos(empresaId);
  return { valor: fila, catalogo };
}

export async function listarComponentesDiagnostico(empresaId, diagnosticoId) {
  requireEmpresa(empresaId); requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const supabase = getSupabaseClient();
  const { data: diag, error: diagError } = await supabase.from('diagnosticos_tecnicos').select('recepcion_id').eq('empresa_id', empresaId).eq('id', diagnosticoId).single();
  if (diagError) throw new Error(diagError.message || 'No se pudo obtener la recepción del diagnóstico.');
  const { data: recepcion, error: recepcionError } = await supabase.from('recepciones_activos_cliente').select('sociedad_id').eq('empresa_id', empresaId).eq('id', diag.recepcion_id).single();
  if (recepcionError) throw new Error(recepcionError.message || 'No se pudo obtener la sociedad de la recepción.');
  return catalogoComponentesService.listar(empresaId, recepcion.sociedad_id || null);
}

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
