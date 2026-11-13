import { getSupabaseClient } from '../lib/supabaseClient.js';

export const BUCKET_CONFIABILIDAD = 'confiabilidad';
const db = () => getSupabaseClient();
const datos = ({ data, error }, mensaje) => {
  if (error) throw new Error(`${mensaje}: ${error.message || 'error desconocido'}`);
  return data;
};
const rpc = async (nombre, args) => datos(await db().rpc(nombre, args), 'No se pudo completar la operación');
const lista = async (consulta, mensaje) => datos(await consulta, mensaje) || [];
// Con sociedad elegida se incluyen también los registros sin sociedad (activos y datos de toda la empresa).
const filtroSociedad = (consulta, sociedadId) =>
  sociedadId ? consulta.or(`sociedad_id.is.null,sociedad_id.eq.${sociedadId}`) : consulta;

export const segmentoActivo = (activoId) => rpc('conf_segmento_activo', { p_activo_id: activoId });
export async function listarActivosPorSegmento(empresaId, segmento = 'todos') {
  const activos = await rpc('conf_activos_segmentados', { p_empresa_id: empresaId });
  return (activos || []).filter((a) => segmento === 'todos' || a.segmento === segmento);
}
export const listarOtAbiertas = (empresaId, sociedadId = null) =>
  lista(
    filtroSociedad(
      db()
        .from('ordenes_trabajo')
        .select('id,numero,equipo_id,estado,tipo_trabajo')
        .eq('empresa_id', empresaId)
        .not('estado', 'in', '(cerrada,anulada,anulado)'),
      sociedadId,
    ).order('numero'),
    'No se pudieron cargar las órdenes',
  );
export const listarFallas = (empresaId, sociedadId = null) =>
  lista(
    filtroSociedad(db().from('conf_eventos_falla').select('*').eq('empresa_id', empresaId), sociedadId).order(
      'fecha_inicio',
      { ascending: false },
    ),
    'No se pudieron cargar las fallas',
  );
export const registrarFalla = (empresaId, activoId, fechaInicio, fechaFin, sistema, modoFalla, descripcion) =>
  rpc('conf_registrar_falla', {
    p_empresa_id: empresaId,
    p_activo_id: activoId,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
    p_sistema: sistema,
    p_modo_falla: modoFalla,
    p_descripcion: descripcion,
  });
export const cerrarFalla = (id, fechaFin) => rpc('conf_cerrar_falla', { p_id: id, p_fecha_fin: fechaFin });
export const vincularFallaOt = (id, otId) => rpc('conf_vincular_falla_ot', { p_id: id, p_ot_id: otId || null });
export const anularFalla = (id, motivo) => rpc('conf_anular_falla', { p_id: id, p_motivo: motivo });
export const listarBacklog = (empresaId, sociedadId = null) =>
  lista(
    filtroSociedad(
      db()
        .from('backlog')
        .select('*,activo:activos!backlog_activo_id_fkey(id,codigo,nombre),ot:ordenes_trabajo!backlog_ot_id_fkey(id,numero,estado)')
        .eq('empresa_id', empresaId),
      sociedadId,
    ).order('created_at', { ascending: false }),
    'No se pudo cargar el backlog',
  );
export const guardarBacklog = (payload) => rpc('conf_backlog_guardar', { p_payload: payload });
export const cambiarCicloBacklog = (id, ciclo, motivo = null) =>
  rpc('conf_backlog_cambiar_ciclo', { p_id: id, p_ciclo: ciclo, p_motivo: motivo });
export const listarPlanesPm = (empresaId) =>
  lista(
    db().from('conf_pm_planes').select('*').eq('empresa_id', empresaId).order('nombre'),
    'No se pudieron cargar los planes PM',
  );
export const estadoPm = (empresaId, sociedadId = null) =>
  rpc('conf_pm_estado', { p_empresa_id: empresaId, p_sociedad_id: sociedadId });
export const guardarPlanPm = (payload) => rpc('conf_pm_guardar_plan', { p_payload: payload });
export const registrarEjecucionPm = (programaId, fecha, horometro, observacion = null) =>
  rpc('conf_pm_registrar_ejecucion', {
    p_programa_id: programaId,
    p_fecha: fecha,
    p_horometro: horometro,
    p_observacion: observacion,
  });
export const listarMuestrasSos = (empresaId, sociedadId = null) =>
  lista(
    filtroSociedad(
      db().from('conf_sos_muestras').select('*,resultados:conf_sos_resultados(*)').eq('empresa_id', empresaId),
      sociedadId,
    ).order('fecha_muestra', { ascending: false }),
    'No se pudieron cargar las muestras',
  );
export const limitesSosVigentes = (empresaId, sistema = null) =>
  rpc('conf_sos_limites_vigentes', { p_empresa_id: empresaId, p_sistema: sistema });
export const guardarMuestraSos = (payload) => rpc('conf_sos_guardar_muestra', { p_payload: payload });
export const guardarResultadosSos = (muestraId, resultados, recomendacion, fechaResultado, informePath) =>
  rpc('conf_sos_guardar_resultados', {
    p_muestra_id: muestraId,
    p_resultados: resultados,
    p_recomendacion: recomendacion,
    p_fecha_resultado: fechaResultado,
    p_informe_path: informePath,
  });
export const marcarMuestraRevisada = (id) => rpc('conf_sos_marcar_revisada', { p_id: id });
export const guardarLimiteSos = (payload) => rpc('conf_sos_guardar_limite', { p_payload: payload });
export async function subirInformeSos(empresaId, muestraId, archivo) {
  if (!empresaId || !muestraId || !archivo) throw new Error('La empresa, la muestra y el informe son obligatorios.');
  const nombre = String(archivo.name || 'informe').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${empresaId}/sos/${muestraId}/${globalThis.crypto.randomUUID()}-${nombre}`;
  datos(
    await db()
      .storage.from(BUCKET_CONFIABILIDAD)
      .upload(path, archivo, { upsert: false, contentType: archivo.type || 'application/octet-stream' }),
    'No se pudo subir el informe',
  );
  return path;
}
export async function urlInformeSos(path, segundos = 3600) {
  if (!path) throw new Error('No hay un informe disponible.');
  return datos(
    await db().storage.from(BUCKET_CONFIABILIDAD).createSignedUrl(path, segundos),
    'No se pudo abrir el informe',
  ).signedUrl;
}
const parametrosPeriodo = (empresaId, sociedadId, desde, hasta, segmento) => ({
  p_empresa_id: empresaId,
  p_sociedad_id: sociedadId || null,
  p_desde: desde,
  p_hasta: hasta,
  p_segmento: segmento || 'todos',
});
export const cargarDisponibilidad = (empresaId, sociedadId, desde, hasta, segmento) =>
  rpc('conf_disponibilidad', parametrosPeriodo(empresaId, sociedadId, desde, hasta, segmento));
export const cargarKpis = (empresaId, sociedadId, desde, hasta, segmento) =>
  rpc('conf_kpis', parametrosPeriodo(empresaId, sociedadId, desde, hasta, segmento));
