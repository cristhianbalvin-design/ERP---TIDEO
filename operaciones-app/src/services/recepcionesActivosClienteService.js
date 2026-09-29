import { getSupabaseClient } from '../lib/supabaseClient.js';

export const ESTADOS_CUSTODIA = Object.freeze([
  'recibido',
  'en_diagnostico',
  'en_reparacion',
  'listo_entrega',
  'entregado',
]);

const makeId = prefix => {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(randomId).replace(/-/g, '').slice(0, 18)}`;
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

const obtenerAnioOpcional = (valor, etiqueta) => {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const anio = Number(valor);
  const anioMaximo = new Date().getFullYear() + 1;
  if (!Number.isInteger(anio) || anio < 1800 || anio > anioMaximo) {
    throw new Error(`${etiqueta} debe ser un año entero entre 1800 y ${anioMaximo}.`);
  }
  return anio;
};

export async function listarActivosCliente(empresaId, sociedadId) {
  exigirEmpresaYSociedad(empresaId, sociedadId);
  const { data, error } = await getSupabaseClient()
    .from('activos')
    .select('id,empresa_id,codigo,nombre,marca,modelo,placa_serie,estado,propietario_tipo,cliente_propietario_id')
    .eq('empresa_id', empresaId)
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

export async function crearActivoCliente(empresaId, datos, usuarioId = null) {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');

  const nombre = String(datos?.nombre || '').trim();
  const clientePropietarioId = datos?.cliente_propietario_id;
  if (!nombre) throw new Error('El nombre es obligatorio para registrar el activo.');
  if (!clientePropietarioId) throw new Error('Selecciona el cliente propietario antes de registrar el activo.');

  const tipoActivo = datos?.tipo_activo || null;
  if (tipoActivo && !['componente', 'maquinaria_completa'].includes(tipoActivo)) {
    throw new Error('El tipo de activo no es válido.');
  }
  const marca = String(datos?.marca || '').trim();
  const modelo = String(datos?.modelo || '').trim();
  if (tipoActivo === 'maquinaria_completa' && !marca) {
    throw new Error('La marca es obligatoria para una maquinaria completa.');
  }
  if (tipoActivo === 'maquinaria_completa' && !modelo) {
    throw new Error('El modelo es obligatorio para una maquinaria completa.');
  }
  const anioFabricacion = obtenerAnioOpcional(datos?.['año_fabricacion'], 'El año de fabricación');
  const anioOverhaul = obtenerAnioOpcional(datos?.['año_overhaul'], 'El año de overhaul');

  const supabase = getSupabaseClient();
  const codigoOrigen = String(datos?.codigo_origen || '').trim() || null;
  let ultimoError = null;
  for (let intento = 0; intento < 3; intento += 1) {
    const { data: codigo, error: codigoError } = await supabase.rpc('siguiente_codigo_activo', {
      p_empresa_id: empresaId,
    });
    if (codigoError) throw codigoError;

    const payload = {
      id: makeId('act'),
      empresa_id: empresaId,
      created_by: usuarioId || null,
      codigo,
      codigo_origen: codigoOrigen,
      nombre,
      tipo_categoria: datos?.tipo_categoria || 'equipo',
      marca: marca || null,
      modelo: modelo || null,
      placa_serie: String(datos?.placa_serie || '').trim() || null,
      año_fabricacion: anioFabricacion,
      año_overhaul: anioOverhaul,
      estado: datos?.estado || 'operativo',
      observacion: String(datos?.observacion || '').trim() || null,
      propietario_tipo: 'cliente',
      cliente_propietario_id: clientePropietarioId,
      tipo_activo: tipoActivo,
    };

    const { data, error } = await supabase
      .from('activos')
      .insert([payload])
      .select()
      .single();
    if (!error) return data;
    ultimoError = error;
    if (error.code !== '23505') break;
  }

  throw ultimoError || new Error('No se pudo registrar el activo.');
}

export async function crearActivoClienteYRecepcion(empresaId, datos) {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
  if (!datos?.sociedad_id) throw new Error('Selecciona una sociedad operativa antes de registrar la recepción.');
  if (!datos?.cliente_propietario_id) throw new Error('Selecciona el cliente propietario antes de registrar el activo.');
  if (!datos?.almacen_id) throw new Error('Selecciona el almacén de custodia.');
  if (!datos?.fecha_ingreso) throw new Error('La fecha de ingreso es obligatoria.');

  const tipoActivo = obtenerTipoActivoOpcional(datos);
  if (!tipoActivo) throw new Error('Selecciona el tipo de activo antes de registrar.');
  const nombre = String(datos?.nombre || '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio para registrar el activo.');
  const marca = String(datos?.marca || '').trim();
  const modelo = String(datos?.modelo || '').trim();
  if (tipoActivo === 'maquinaria_completa' && !marca) throw new Error('La marca es obligatoria para una maquinaria completa.');
  if (tipoActivo === 'maquinaria_completa' && !modelo) throw new Error('El modelo es obligatorio para una maquinaria completa.');

  const anioFabricacion = obtenerAnioOpcional(datos?.['año_fabricacion'], 'El año de fabricación');
  const anioOverhaul = obtenerAnioOpcional(datos?.['año_overhaul'], 'El año de overhaul');
  const { data, error } = await getSupabaseClient().rpc('crear_activo_cliente_y_recepcion', {
    p_empresa_id: empresaId,
    p_sociedad_id: datos.sociedad_id,
    p_cliente_propietario_id: datos.cliente_propietario_id,
    p_nombre: nombre,
    p_tipo_activo: tipoActivo,
    p_codigo_origen: String(datos?.codigo_origen || '').trim() || null,
    p_marca: marca || null,
    p_modelo: modelo || null,
    p_placa_serie: String(datos?.placa_serie || '').trim() || null,
    p_anio_fabricacion: anioFabricacion,
    p_anio_overhaul: anioOverhaul,
    p_fecha_ingreso: datos.fecha_ingreso,
    p_hora_ingreso: datos.hora_ingreso || null,
    p_guia_ingreso: String(datos?.guia_ingreso || '').trim() || null,
    p_almacen_id: datos.almacen_id,
    p_observaciones: String(datos?.observaciones || '').trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function listarAlmacenes(empresaId, sociedadId) {
  exigirEmpresaYSociedad(empresaId, sociedadId);
  const { data, error } = await getSupabaseClient()
    .from('almacenes')
    .select('id,empresa_id,codigo,nombre,estado')
    .eq('empresa_id', empresaId)
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
  if (numeroCaso === null || numeroCaso === undefined) {
    throw new Error('No se pudo abrir el número de caso para la recepción.');
  }
  const numero = `RAC-${new Date().getFullYear()}-${String(numeroCaso).padStart(5, '0')}`;

  let ultimoError = null;
  for (let intento = 0; intento < 3; intento += 1) {
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
