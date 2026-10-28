import { getSupabaseClient } from '../lib/supabaseClient.js';

const RUTAS_COLUMNAS = [
  'id',
  'empresa_id',
  'codigo',
  'nombre',
  'origen_nombre',
  'origen_direccion',
  'origen_ubigeo',
  'origen_latitud',
  'origen_longitud',
  'destino_nombre',
  'destino_direccion',
  'destino_ubigeo',
  'destino_latitud',
  'destino_longitud',
  'distancia_km',
  'duracion_estimada_horas',
  'tipo_carga_habitual',
  'peajes_estimados',
  'moneda_peajes',
  'notas',
  'estado',
  'created_by',
  'created_at',
  'updated_at',
];

export const RUTAS_COLUMNS = RUTAS_COLUMNAS.join(',');

const errorAmigable = error => {
  if (error?.code === '23505') {
    return new Error('Ya existe una ruta con ese código en esta empresa.');
  }
  if (error?.code === '42501') {
    return new Error('No tienes permiso para realizar esta acción en Transporte Comercial.');
  }
  if (error?.code === '23514' && /viaje|ruta/i.test(error?.message || '')) {
    return new Error('Las tarifas por viaje deben tener una ruta asociada.');
  }
  return error;
};

const lanzar = error => {
  if (error) throw errorAmigable(error);
};

export async function consultarPermisosTransporte(empresaId) {
  const supabase = getSupabaseClient();
  const acciones = ['ver', 'crear', 'editar'];
  const resultados = await Promise.all(
    acciones.map(accion => supabase.rpc('usuario_puede', {
      target_empresa_id: empresaId,
      target_pantalla: 'transporte_comercial',
      target_accion: accion,
    })),
  );

  resultados.forEach(resultado => lanzar(resultado.error));
  return Object.fromEntries(
    acciones.map((accion, index) => [accion, Boolean(resultados[index].data)]),
  );
}

export async function listarRutas(empresaId) {
  const { data, error } = await getSupabaseClient()
    .from('transporte_rutas')
    .select(RUTAS_COLUMNS)
    .eq('empresa_id', empresaId)
    .order('codigo');

  lanzar(error);
  return data || [];
}

export async function obtenerRuta(empresaId, rutaId) {
  const { data, error } = await getSupabaseClient()
    .from('transporte_rutas')
    .select(RUTAS_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('id', rutaId)
    .maybeSingle();

  lanzar(error);
  return data || null;
}

const conUsuario = async payload => {
  const { data, error } = await getSupabaseClient().auth.getUser();
  lanzar(error);
  return { ...payload, created_by: data?.user?.id || null };
};

export async function crearRuta(empresaId, payload) {
  const body = await conUsuario({ ...payload, empresa_id: empresaId });
  const { data, error } = await getSupabaseClient()
    .from('transporte_rutas')
    .insert(body)
    .select(RUTAS_COLUMNS)
    .single();

  lanzar(error);
  return data;
}

export async function actualizarRuta(empresaId, rutaId, payload) {
  const { data, error } = await getSupabaseClient()
    .from('transporte_rutas')
    .update(payload)
    .eq('empresa_id', empresaId)
    .eq('id', rutaId)
    .select(RUTAS_COLUMNS)
    .single();

  lanzar(error);
  return data;
}

export async function cambiarEstadoRuta(empresaId, rutaId, estado) {
  return actualizarRuta(empresaId, rutaId, { estado });
}
