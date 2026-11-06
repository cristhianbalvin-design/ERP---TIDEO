import { getSupabaseClient } from '../lib/supabaseClient.js';

const COLUMNAS_BANDEJA = [
  'id,numero,estado,descripcion,fecha_apertura,fecha_compromiso,moneda,costo_estimado,costo_real,avance_pct,sociedad_id,',
  'os:os_clientes(id,numero,nombre),',
  'cuenta:cuentas(id,razon_social,nombre_comercial),',
  'activo:activos(id,codigo,nombre),',
  'operaciones:of_operaciones(id,bahia_id)',
].join('');

function filtrarSociedad(query, sociedadId, sociedadesIdsAlcance) {
  if (sociedadId) return query.eq('sociedad_id', sociedadId);
  if (Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
    return query.in('sociedad_id', sociedadesIdsAlcance);
  }
  return query;
}

export function normalizarFilaBandejaOF(fila) {
  const operaciones = fila.operaciones || [];
  const activo = fila.activo;
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    descripcion: fila.descripcion || '',
    fecha_apertura: fila.fecha_apertura,
    fecha_compromiso: fila.fecha_compromiso,
    moneda: fila.moneda || 'PEN',
    costo_estimado: Number(fila.costo_estimado) || 0,
    costo_real: Number(fila.costo_real) || 0,
    avance_pct: Math.max(0, Math.min(100, Number(fila.avance_pct) || 0)),
    os_id: fila.os?.id || null,
    os_numero: fila.os?.numero || '',
    cliente: fila.cuenta?.nombre_comercial || fila.cuenta?.razon_social || '',
    componente: activo
      ? [activo.codigo !== activo.nombre ? activo.codigo : null, activo.nombre].filter(Boolean).join(' · ')
      : (fila.descripcion || ''),
    operaciones_total: operaciones.length,
    operaciones_sin_bahia: operaciones.filter(op => !op.bahia_id).length,
  };
}

// Todas las OF de la empresa (y de la sociedad o alcance activo), de la más reciente a la más antigua.
export async function listarOrdenesFabricacion({ empresaId, sociedadId, sociedadesIdsAlcance }) {
  if (!empresaId) return [];
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    let query = getSupabaseClient().from('ordenes_fabricacion')
      .select(COLUMNAS_BANDEJA)
      .eq('empresa_id', empresaId);
    query = filtrarSociedad(query, sociedadId, sociedadesIdsAlcance)
      .order('fecha_apertura', { ascending: false })
      .order('numero', { ascending: false })
      .range(desde, desde + 999);
    const { data, error } = await query;
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas.map(normalizarFilaBandejaOF);
}

// OS de fabricación o mixtas (no anuladas ni cerradas) que pueden originar una OF.
export async function listarOSElegiblesOF(empresaId) {
  if (!empresaId) return [];
  const { data, error } = await getSupabaseClient().rpc('os_elegibles_para_of', { p_empresa_id: empresaId });
  if (error) throw error;
  return data || [];
}

// Lo que crear_of_desde_os copiará de la hoja (misma regla de selección, solo lectura).
export async function vistaPreviaOF(osId) {
  const { data, error } = await getSupabaseClient().rpc('vista_previa_of_desde_os', { p_os_id: osId });
  if (error) throw error;
  return data;
}

// Crea la OF en borrador. Devuelve { id, numero }.
export async function crearOFDesdeOS(osId, copiarHoja) {
  const sb = getSupabaseClient();
  const { data: id, error } = await sb.rpc('crear_of_desde_os', { p_os_id: osId, p_copiar_hoja: copiarHoja });
  if (error) throw error;
  const { data: of } = await sb.from('ordenes_fabricacion').select('id,numero').eq('id', id).maybeSingle();
  return { id, numero: of?.numero || '' };
}

const COLUMNAS_FICHA = [
  'id,numero,estado,descripcion,fecha_apertura,fecha_compromiso,moneda,costo_estimado,costo_real,avance_pct,created_at,',
  'os:os_clientes(id,numero,nombre,tipo_ejecucion),',
  'cuenta:cuentas(id,razon_social,nombre_comercial),',
  'activo:activos(id,codigo,nombre),',
  'hoja:hojas_costeo(id,numero),',
  'operaciones:of_operaciones(id,secuencia,titulo,horas_estimadas,horas_maquina,horas_reales,costo_estimado,estado,avance_pct,',
  'trabajo:familia_trabajo(nombre),',
  'actividad:tipos_servicio_interno!of_operaciones_actividad_id_fkey(nombre),',
  'cargo:cargos_empresa(nombre),',
  'equipo:activos(codigo,nombre),',
  'bahia:planner_bahias(nombre)),',
  'materiales:of_materiales(id,descripcion,unidad,cantidad_plan,cantidad_real,costo_unitario,origen,no_planificado,operacion_id)',
].join('');

const nombreActivo = a => (a ? [a.codigo !== a.nombre ? a.codigo : null, a.nombre].filter(Boolean).join(' · ') : '');

export function normalizarFichaOF(fila) {
  const operaciones = [...(fila.operaciones || [])]
    .sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0))
    .map(op => ({
      id: op.id,
      linea_id: op.id,
      secuencia: op.secuencia,
      trabajo: op.trabajo?.nombre || '',
      actividad: op.actividad?.nombre || '',
      tarea: op.titulo,
      cargo: op.cargo?.nombre || '',
      horas: Number(op.horas_estimadas) || 0,
      horas_maquina: Number(op.horas_maquina) || 0,
      horas_reales: Number(op.horas_reales) || 0,
      costo: Number(op.costo_estimado) || 0,
      equipo: nombreActivo(op.equipo),
      bahia: op.bahia?.nombre || '',
      estado: op.estado,
      avance_pct: Number(op.avance_pct) || 0,
    }));
  const materiales = (fila.materiales || []).map(m => ({
    id: m.id,
    descripcion: m.descripcion || 'Material',
    unidad: m.unidad || '',
    cantidad: Number(m.cantidad_plan) || 0,
    cantidad_real: m.cantidad_real == null ? null : Number(m.cantidad_real),
    costo_unitario: Number(m.costo_unitario) || 0,
    subtotal: Math.round((Number(m.cantidad_plan) || 0) * (Number(m.costo_unitario) || 0) * 100) / 100,
    origen: m.origen,
    no_planificado: Boolean(m.no_planificado),
  }));
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    descripcion: fila.descripcion || '',
    fecha_apertura: fila.fecha_apertura,
    fecha_compromiso: fila.fecha_compromiso,
    moneda: fila.moneda || 'PEN',
    costo_estimado: Number(fila.costo_estimado) || 0,
    costo_real: Number(fila.costo_real) || 0,
    avance_pct: Math.max(0, Math.min(100, Number(fila.avance_pct) || 0)),
    os: fila.os || null,
    cliente: fila.cuenta?.nombre_comercial || fila.cuenta?.razon_social || '',
    componente: nombreActivo(fila.activo),
    hoja: fila.hoja || null,
    operaciones,
    materiales,
  };
}

// Ficha de una OF con su ruta y sus materiales (solo lectura en F2).
export async function obtenerOF(id) {
  const { data, error } = await getSupabaseClient().from('ordenes_fabricacion')
    .select(COLUMNAS_FICHA).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizarFichaOF(data) : null;
}
