import { getSupabaseClient } from '../lib/supabaseClient.js';

export const ESTADOS_CUSTODIA = Object.freeze([
  'recibido',
  'en_diagnostico',
  'en_reparacion',
  'listo_entrega',
  'entregado',
]);

const nextNumero = async (supabase, empresaId) => {
  const year = new Date().getFullYear();
  const prefix = `RAC-${year}-`;
  const { data, error } = await supabase
    .from('recepciones_activos_cliente')
    .select('numero')
    .eq('empresa_id', empresaId)
    .like('numero', `${prefix}%`);
  if (error) throw error;

  const maximo = (data || []).reduce((max, row) => {
    const numero = Number(String(row.numero || '').slice(prefix.length));
    return Number.isFinite(numero) ? Math.max(max, numero) : max;
  }, 0);
  return `${prefix}${String(maximo + 1).padStart(4, '0')}`;
};

const exigirEmpresaYSociedad = (empresaId, sociedadId) => {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
  if (!sociedadId) throw new Error('Selecciona una sociedad operativa antes de continuar.');
};

const obtenerLecturaOpcional = datos => {
  if (datos?.lectura_valor === undefined || datos?.lectura_valor === null || String(datos.lectura_valor).trim() === '') return null;
  const valor = Number(datos.lectura_valor);
  if (!Number.isFinite(valor) || valor < 0) throw new Error('La lectura de ingreso debe ser un número no negativo.');
  const unidad = datos.lectura_unidad || 'horas';
  if (!['horas', 'km'].includes(unidad)) throw new Error('La unidad de lectura de ingreso no es válida.');
  return { valor, unidad };
};

const obtenerTipoActivoOpcional = datos => {
  const tipoActivo = datos?.tipo_activo || null;
  if (tipoActivo && !['componente', 'maquinaria_completa'].includes(tipoActivo)) {
    throw new Error('El tipo de activo no es válido.');
  }
  return tipoActivo;
};

export async function listarActivosCliente(empresaId, sociedadId) {
  exigirEmpresaYSociedad(empresaId, sociedadId);
  const { data, error } = await getSupabaseClient()
    .from('activos')
    .select('id,empresa_id,sociedad_id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id')
    .eq('empresa_id', empresaId)
    .eq('sociedad_id', sociedadId)
    .eq('propietario_tipo', 'cliente')
    .neq('estado', 'dado_baja')
    .order('codigo');
  if (error) throw error;
  return data || [];
}

export async function listarClientes(empresaId) {
  if (!empresaId) return [];
  const { data, error } = await getSupabaseClient()
    .from('cuentas')
    .select('id,empresa_id,razon_social,nombre_comercial,ruc,estado')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .order('nombre_comercial');
  if (error) throw error;
  return data || [];
}

export async function listarAlmacenes(empresaId, sociedadId) {
  exigirEmpresaYSociedad(empresaId, sociedadId);
  const { data, error } = await getSupabaseClient()
    .from('almacenes')
    .select('id,empresa_id,sociedad_id,codigo,nombre,estado')
    .eq('empresa_id', empresaId)
    .eq('sociedad_id', sociedadId)
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function listarRecepciones(empresaId, sociedadId) {
  exigirEmpresaYSociedad(empresaId, sociedadId);
  const { data, error } = await getSupabaseClient()
    .from('recepciones_activos_cliente')
    .select('id,empresa_id,sociedad_id,activo_id,numero,numero_caso,fecha_ingreso,hora_ingreso,guia_ingreso,estado,estado_custodia,almacen_id,observaciones,created_at')
    .eq('empresa_id', empresaId)
    .eq('sociedad_id', sociedadId)
    .order('fecha_ingreso', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function crearRecepcion(empresaId, datos) {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
  if (!datos?.sociedad_id) throw new Error('Selecciona una sociedad operativa antes de registrar la recepción.');
  if (!datos?.activo_id) throw new Error('Selecciona el activo del cliente.');
  if (!datos?.fecha_ingreso) throw new Error('La fecha de ingreso es obligatoria.');
  if (!datos?.almacen_id) throw new Error('Selecciona el almacén de custodia.');
  const lectura = obtenerLecturaOpcional(datos);
  const tipoActivo = obtenerTipoActivoOpcional(datos);

  const supabase = getSupabaseClient();
  const { data: activo, error: activoError } = await supabase
    .from('activos')
    .select('id,cliente_propietario_id')
    .eq('empresa_id', empresaId)
    .eq('sociedad_id', datos.sociedad_id)
    .eq('id', datos.activo_id)
    .eq('propietario_tipo', 'cliente')
    .maybeSingle();
  if (activoError) throw activoError;
  if (!activo) throw new Error('El activo no existe, no pertenece a la sociedad activa o no es de un cliente.');

  if (tipoActivo) {
    const { error: tipoActivoError } = await supabase
      .from('activos')
      .update({ tipo_activo: tipoActivo })
      .eq('id', datos.activo_id)
      .eq('empresa_id', empresaId);
    if (tipoActivoError) throw tipoActivoError;
  }

  // No existe un trigger de recepción que abra el caso: se replica la llamada
  // que ya usa el servicio administrativo, antes del INSERT.
  const { data: numeroCaso, error: numeroCasoError } = await supabase.rpc('abrir_o_heredar_numero_caso', {
    p_empresa_id: empresaId,
    p_padre_id: null,
    p_padre_tabla: null,
    p_cuenta_id: activo.cliente_propietario_id || null,
  });
  if (numeroCasoError) throw numeroCasoError;

  let ultimoError = null;
  for (let intento = 0; intento < 3; intento += 1) {
    const numero = await nextNumero(supabase, empresaId);
    const { data, error } = await supabase
      .from('recepciones_activos_cliente')
      .insert({
        empresa_id: empresaId,
        sociedad_id: datos.sociedad_id,
        numero,
        numero_caso: numeroCaso ?? null,
        activo_id: datos.activo_id,
        fecha_ingreso: datos.fecha_ingreso,
        hora_ingreso: datos.hora_ingreso || null,
        guia_ingreso: String(datos.guia_ingreso || '').trim() || null,
        estado: 'pendiente_cotizar',
        almacen_id: datos.almacen_id,
        observaciones: String(datos.observaciones || '').trim() || null,
        // estado_custodia usa el default 'recibido' de producción.
      })
      .select()
      .single();
    if (!error) {
      if (lectura) {
        const { error: lecturaError } = await supabase.rpc('registrar_lectura_activo', {
          p_empresa_id: empresaId,
          p_activo_id: datos.activo_id,
          p_valor: lectura.valor,
          p_unidad: lectura.unidad,
          p_origen: 'ingreso_recepcion',
          p_origen_id: data.id,
        });
        if (lecturaError) throw lecturaError;
      }
      return data;
    }
    ultimoError = error;
    if (error.code !== '23505') break;
  }

  throw ultimoError || new Error('No se pudo registrar la recepción.');
}

export async function actualizarEstadoCustodia(empresaId, recepcionId, nuevoEstado) {
  if (!empresaId || !recepcionId) throw new Error('Faltan datos para actualizar la recepción.');
  if (!ESTADOS_CUSTODIA.includes(nuevoEstado)) {
    throw new Error(`Estado de custodia no permitido: ${nuevoEstado || 'vacío'}.`);
  }

  const { data, error } = await getSupabaseClient()
    .from('recepciones_activos_cliente')
    .update({ estado_custodia: nuevoEstado })
    .eq('empresa_id', empresaId)
    .eq('id', recepcionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
