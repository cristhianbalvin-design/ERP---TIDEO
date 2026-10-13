import { getSupabaseClient } from '../lib/supabaseClient.js';

async function ejecutarRpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) {
    const fallo = new Error(error.message || 'No se pudo completar la acción de minas y proyectos.');
    fallo.code = error.code;
    throw fallo;
  }
  return data;
}

export function listarMinas({ empresa_id }) {
  return ejecutarRpc('wms_listar_minas', { p_empresa_id: empresa_id ?? null });
}

export function guardarMina({ empresa_id, id = null, cuenta_id, codigo, nombre, estado = 'activo' }) {
  return ejecutarRpc('wms_guardar_mina', {
    p_empresa_id: empresa_id ?? null, p_id: id ?? null, p_cuenta_id: cuenta_id ?? null,
    p_codigo: codigo ?? null, p_nombre: nombre ?? null, p_estado: estado ?? null,
  });
}

export function guardarProyectoMina({ empresa_id, mina_id, proyecto_id = null, codigo = null, nombre = null, estado = null }) {
  return ejecutarRpc('wms_guardar_proyecto_mina', {
    p_empresa_id: empresa_id ?? null, p_mina_id: mina_id ?? null, p_proyecto_id: proyecto_id ?? null,
    p_codigo: codigo ?? null, p_nombre: nombre ?? null, p_estado: estado ?? null,
  });
}

export function asignarAlmacenMina({ empresa_id, almacen_id, mina_id = null }) {
  return ejecutarRpc('wms_asignar_almacen_mina', {
    p_empresa_id: empresa_id ?? null, p_almacen_id: almacen_id ?? null, p_mina_id: mina_id ?? null,
  });
}

export function crearAlmacenPeriferico({ empresa_id, mina_id, codigo, nombre }) {
  return ejecutarRpc('wms_crear_almacen_periferico', {
    p_empresa_id: empresa_id ?? null, p_mina_id: mina_id ?? null, p_codigo: codigo ?? null, p_nombre: nombre ?? null,
  });
}

export function listarProyectosOT({ empresa_id }) {
  return ejecutarRpc('wms_listar_proyectos_ot', { p_empresa_id: empresa_id ?? null });
}
