import { getSupabaseClient } from '../lib/supabaseClient.js';
import { eliminarAdjunto, STORAGE_BUCKETS, subirAdjunto } from '../../../src/services/storageService.js';

const supabase = () => getSupabaseClient();
const requireEmpresa = empresaId => { if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.'); };

export async function usuarioPuedeFlota(empresaId, pantalla, accion) {
  requireEmpresa(empresaId);
  const { data, error } = await supabase().rpc('usuario_puede', {
    target_empresa_id: empresaId, target_pantalla: pantalla, target_accion: accion,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function cargarFlota(empresaId, { incluirBaja = false, soloPropios = false } = {}) {
  requireEmpresa(empresaId);
  const db = supabase();
  let consultaActivos = db.from('activos')
    .select('id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id,horometro_actual,"año_fabricacion","año_overhaul",tipo_activo,tipo_categoria,ubicacion,fecha_alta')
    .eq('empresa_id', empresaId);
  if (!incluirBaja) consultaActivos = consultaActivos.neq('estado', 'dado_baja');
  if (soloPropios) consultaActivos = consultaActivos.eq('propietario_tipo', 'propio');
  // Tope razonable por consulta; la pantalla avisa si se alcanzan las 1000 filas.
  const { data: activos, error } = await consultaActivos.order('nombre').limit(1000);
  if (error) throw error;
  const ids = (activos || []).map(a => a.id);
  const contratos = ids.length ? await db.from('contratos_alquiler_equipos')
    .select('equipo_id,contratos_alquiler!inner(id,empresa_id,numero,estado,fecha_inicio,fecha_fin,cuenta_id)')
    .in('equipo_id', ids).eq('contratos_alquiler.empresa_id', empresaId) : { data: [], error: null };
  if (contratos.error) throw contratos.error;
  const hoy = new Date().toISOString().slice(0, 10);
  const contratosVigentes = (contratos.data || []).filter(row => {
    const c = row.contratos_alquiler;
    return ['vigente', 'suspendido'].includes(c.estado) && c.fecha_inicio <= hoy && c.fecha_fin >= hoy;
  });
  const cuentaIds = [...new Set([
    ...contratosVigentes.map(row => row.contratos_alquiler.cuenta_id),
    ...(activos || []).map(a => a.cliente_propietario_id),
  ].filter(Boolean))];
  const cuentas = cuentaIds.length ? await db.from('cuentas').select('id,nombre_comercial,razon_social').eq('empresa_id', empresaId).in('id', cuentaIds) : { data: [], error: null };
  if (cuentas.error) throw cuentas.error;
  const cuentaNombres = new Map((cuentas.data || []).map(c => [c.id, c.nombre_comercial || c.razon_social || '']));
  const contratosPorEquipo = new Map();
  for (const row of contratosVigentes) {
    const c = row.contratos_alquiler;
    const previous = contratosPorEquipo.get(row.equipo_id) || [];
    previous.push({ numero: c.numero, cliente: cuentaNombres.get(c.cuenta_id) || '' });
    contratosPorEquipo.set(row.equipo_id, previous);
  }
  return (activos || []).map(a => ({
    ...a,
    estado_flota: a.estado === 'dado_baja' ? 'Dado de baja' : a.estado === 'en_mantenimiento' ? 'En mantenimiento' : contratosPorEquipo.has(a.id) ? 'En contrato' : 'Disponible',
    contratos_busqueda: (contratosPorEquipo.get(a.id) || []).map(c => c.numero).join(' '),
    clientes_busqueda: (contratosPorEquipo.get(a.id) || []).map(c => c.cliente).join(' '),
    cliente_propietario_nombre: cuentaNombres.get(a.cliente_propietario_id) || '',
  }));
}

export async function registrarEquipo(empresaId, equipo) {
  const { data, error } = await supabase().rpc('registrar_equipo_flota', { p_empresa_id: empresaId, p_equipo: equipo });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function cargarContratos(empresaId) {
  requireEmpresa(empresaId);
  const db = supabase();
  const { data, error } = await db.from('contratos_alquiler')
    .select('id,empresa_id,sociedad_id,numero,cuenta_id,unidad_minera,objeto,fecha_inicio,fecha_fin,minimo_facturable,unidad_minimo_facturable,periodicidad_minimo_facturable,meta_dmr,moneda,estado,centro_costo_id,centro_beneficio_id,proyecto_id,representante_cliente,representante_empresa,created_at')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const rows = data || [];
  const cuentaIds = [...new Set(rows.map(r => r.cuenta_id).filter(Boolean))];
  const contractIds = rows.map(r => r.id);
  const equiposRes = contractIds.length ? await db.from('contratos_alquiler_equipos')
    .select('id,contrato_alquiler_id,equipo_id,tarifa_hora_override').in('contrato_alquiler_id', contractIds) : { data: [], error: null };
  if (equiposRes.error) throw equiposRes.error;
  const equipoIds = [...new Set((equiposRes.data || []).map(e => e.equipo_id))];
  const [cuentasRes, activosRes, tarifasRes] = await Promise.all([
    cuentaIds.length ? db.from('cuentas').select('id,nombre_comercial,razon_social').eq('empresa_id', empresaId).in('id', cuentaIds) : Promise.resolve({ data: [], error: null }),
    equipoIds.length ? db.from('activos').select('id,codigo,nombre,marca,modelo,placa_serie,"año_fabricacion","año_overhaul"').eq('empresa_id', empresaId).in('id', equipoIds) : Promise.resolve({ data: [], error: null }),
    equipoIds.length ? db.from('contratos_alquiler_equipo_tarifas').select('contrato_equipo_id,version,tarifa_hora,moneda,vigente_desde,motivo,created_at').in('contrato_equipo_id', (equiposRes.data || []).map(e => e.id)).order('version', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [cuentasRes, activosRes, tarifasRes]) if (result.error) throw result.error;
  const cuentas = new Map((cuentasRes.data || []).map(c => [c.id, c]));
  const activos = new Map((activosRes.data || []).map(a => [a.id, a]));
  const equiposByContract = new Map();
  for (const e of equiposRes.data || []) {
    const activo = activos.get(e.equipo_id) || {};
    const versiones = (tarifasRes.data || []).filter(v => v.contrato_equipo_id === e.id);
    const bucket = equiposByContract.get(e.contrato_alquiler_id) || [];
    bucket.push({ ...e, activo, versiones });
    equiposByContract.set(e.contrato_alquiler_id, bucket);
  }
  return rows.map(r => ({ ...r, cuenta: cuentas.get(r.cuenta_id), equipos: equiposByContract.get(r.id) || [] }));
}

export async function crearContrato(empresaId, contrato, equipos) {
  const { data, error } = await supabase().rpc('crear_contrato_alquiler_con_equipos', {
    p_empresa_id: empresaId, p_contrato: contrato, p_equipos: equipos,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function actualizarTarifa(equipoContratoId, tarifa, motivo, vigenteDesde) {
  const { data, error } = await supabase().rpc('actualizar_tarifa_equipo_contrato', {
    p_contrato_equipo_id: equipoContratoId, p_tarifa_hora: tarifa,
    p_motivo: motivo, p_vigente_desde: vigenteDesde,
  });
  if (error) throw error;
  return data;
}

export async function actualizarEstadoContrato(contratoId, estado) {
  const { data, error } = await supabase().from('contratos_alquiler').update({ estado }).eq('id', contratoId).select('id,estado').single();
  if (error) throw error;
  return data;
}

export async function cargarPasaporte(empresaId, activoId) {
  const db = supabase();
  const [activo, documentos, lecturas, contratos] = await Promise.all([
    db.from('activos').select('id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id,horometro_actual,"año_fabricacion","año_overhaul",tipo_activo,ubicacion,fecha_alta').eq('empresa_id', empresaId).eq('id', activoId).single(),
    db.from('activo_documentos').select('id,empresa_id,activo_id,tipo,nombre,storage_path,fecha_emision,fecha_vencimiento,notas,created_at').eq('empresa_id', empresaId).eq('activo_id', activoId).order('created_at', { ascending: false }),
    db.from('historial_lecturas_activo').select('fecha_lectura,valor,unidad,origen,created_at').eq('empresa_id', empresaId).eq('activo_id', activoId).order('fecha_lectura', { ascending: false }),
    db.from('contratos_alquiler_equipos').select('contratos_alquiler!inner(id,empresa_id,numero,estado,fecha_inicio,fecha_fin,moneda)').eq('equipo_id', activoId).eq('contratos_alquiler.empresa_id', empresaId),
  ]);
  for (const result of [activo, documentos, lecturas, contratos]) if (result.error) throw result.error;
  return { activo: activo.data, documentos: documentos.data || [], lecturas: lecturas.data || [], contratos: (contratos.data || []).map(r => r.contratos_alquiler) };
}

export async function guardarDocumentoEquipo({ empresaId, activoId, documento, file }) {
  let storagePath = null;
  if (file) {
    const uploaded = await subirAdjunto({ empresaId, entidadTipo: 'pasaporte_equipos', entidadId: activoId, file, categoria: documento.tipo, bucket: STORAGE_BUCKETS.DOCUMENTOS_GENERALES });
    storagePath = uploaded.storage_path;
  }
  const { data, error } = await supabase().from('activo_documentos').insert({
    empresa_id: empresaId, activo_id: activoId, ...documento, storage_path: storagePath,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function actualizarDocumentoEquipo(empresaId, id, cambios) {
  const { data, error } = await supabase().from('activo_documentos').update(cambios).eq('empresa_id', empresaId).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function eliminarDocumentoEquipo(empresaId, id) {
  const db = supabase();
  const { data: documento, error: consultaError } = await db.from('activo_documentos').select('id,storage_path').eq('empresa_id', empresaId).eq('id', id).single();
  if (consultaError) throw consultaError;
  if (documento?.storage_path) {
    const { data: adjunto, error: adjuntoQueryError } = await db.from('adjuntos').select('id,bucket,storage_path').eq('storage_path', documento.storage_path).maybeSingle();
    if (adjuntoQueryError) throw adjuntoQueryError;
    if (adjunto) {
      await eliminarAdjunto(adjunto);
    } else {
      const { error: storageError } = await db.storage.from(STORAGE_BUCKETS.DOCUMENTOS_GENERALES).remove([documento.storage_path]);
      if (storageError) throw storageError;
    }
  }
  const { error } = await db.from('activo_documentos').delete().eq('empresa_id', empresaId).eq('id', id);
  if (error) throw error;
}
