import { getSupabaseClient } from '../lib/supabaseClient.js';
import { normalizarCodigoImportacion } from '../utils/cecoCebeImport.js';
import {
  obtenerEstadoMultisociedad,
  validarSociedadActivaParaEscritura,
} from './sociedadEscrituraService.js';

const makeId = (prefix) => {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(randomPart).replace(/-/g, '').slice(0, 18)}`;
};

const pick = (source, keys) => keys.reduce((acc, key) => {
  if (source[key] !== undefined) acc[key] = source[key];
  return acc;
}, {});

const validarFilasSocietariasMaestro = async ({ supabase, empresaId, filas, entidad }) => {
  const multisociedadHabilitado = await obtenerEstadoMultisociedad(supabase, empresaId);
  if (!multisociedadHabilitado) {
    return (filas || []).map(fila => ({ ...fila, sociedad_id: null }));
  }

  const filaSinSociedad = (filas || []).find(fila => !fila?.sociedad_id);
  if (filaSinSociedad) {
    const referencia = filaSinSociedad?.codigo ? ` "${filaSinSociedad.codigo}"` : '';
    throw new Error(`La sociedad es obligatoria para importar el ${entidad}${referencia}.`);
  }

  const sociedadesIds = [...new Set((filas || []).map(fila => fila.sociedad_id))];
  if (!sociedadesIds.length) return [];

  const { data: sociedades, error } = await supabase
    .from('sociedades')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .in('id', sociedadesIds);
  if (error) throw error;

  const sociedadesValidas = new Set((sociedades || []).map(sociedad => sociedad.id));
  const sociedadInvalida = sociedadesIds.find(sociedadId => !sociedadesValidas.has(sociedadId));
  if (sociedadInvalida) {
    throw new Error('La sociedad indicada no pertenece al tenant o está inactiva.');
  }

  return (filas || []).map(fila => ({ ...fila, sociedad_id: fila.sociedad_id }));
};

export const importarMaestroSinSobrescribir = async ({
  supabase,
  tabla,
  empresaId,
  filas,
  prefijoId,
  campos,
}) => {
  const { data: existentes, error: errorExistentes } = await supabase
    .from(tabla)
    .select('codigo')
    .eq('empresa_id', empresaId);
  if (errorExistentes) throw errorExistentes;

  const codigosExistentes = new Set((existentes || []).map(item => normalizarCodigoImportacion(item.codigo)));
  const conteoArchivo = new Map();
  (filas || []).forEach(fila => {
    const codigo = normalizarCodigoImportacion(fila?.codigo);
    conteoArchivo.set(codigo, (conteoArchivo.get(codigo) || 0) + 1);
  });

  const insertados = [];
  const rechazados = [];
  for (let index = 0; index < (filas || []).length; index += 1) {
    const fila = filas[index];
    const codigo = normalizarCodigoImportacion(fila?.codigo);
    const filaExcel = fila?._fila || index + 2;
    if (!codigo) {
      rechazados.push({ fila: filaExcel, codigo, motivo: 'Código obligatorio.' });
      continue;
    }
    if ((conteoArchivo.get(codigo) || 0) > 1) {
      rechazados.push({ fila: filaExcel, codigo, motivo: `Código duplicado en el archivo: "${codigo}".` });
      continue;
    }
    if (codigosExistentes.has(codigo)) {
      rechazados.push({ fila: filaExcel, codigo, motivo: `Código duplicado: "${codigo}" ya existe en este tenant.` });
      continue;
    }

    const payload = {
      id: fila.id || makeId(prefijoId),
      empresa_id: empresaId,
      ...pick({ ...fila, codigo }, campos),
    };
    const { data, error } = await supabase.from(tabla).insert([payload]).select().single();
    if (error) {
      const motivo = error.code === '23505'
        ? `Código duplicado: "${codigo}" ya existe en este tenant.`
        : error.message || 'La fila no pudo insertarse.';
      rechazados.push({ fila: filaExcel, codigo, motivo, codigo_sql: error.code || null });
      continue;
    }
    insertados.push(data);
    codigosExistentes.add(codigo);
  }

  return { insertados, rechazados };
};

export const maestrosService = {
  // Areas de empresa
  getAreas: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('areas_empresa').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching areas:', error); return []; }
    return data;
  },
  // Cargos
  getCargos: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('cargos_empresa').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching cargos:', error); return []; }
    return data;
  },
  crearCargo: async (empresaId, cargo) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: cargo.id || makeId('car'),
      empresa_id: empresaId,
      codigo: cargo.codigo || `CAR-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(cargo, ['nombre', 'tipo', 'detalle', 'estado', 'modo_gestion']),
    };
    const { data, error } = await supabase.from('cargos_empresa').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarCargo: async (cargoId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('cargos_empresa').update(pick(payload, ['codigo', 'nombre', 'tipo', 'detalle', 'estado', 'modo_gestion'])).eq('id', cargoId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarCargo: async (cargoId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('cargos_empresa').delete().eq('id', cargoId);
    if (error) throw error;
  },
  fusionarCargos: async (origenId, destinoId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('fusionar_cargos', {
      p_cargo_origen_id: origenId,
      p_cargo_destino_id: destinoId,
    });
    if (error) throw error;
  },

  // Especialidades
  getEspecialidades: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('especialidades_tecnicas').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching especialidades:', error); return []; }
    return data;
  },
  crearEspecialidad: async (empresaId, especialidad) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: especialidad.id || makeId('esp'),
      empresa_id: empresaId,
      codigo: especialidad.codigo || `ESP-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(especialidad, ['nombre', 'area', 'requiere_cert', 'estado']),
    };
    const { data, error } = await supabase.from('especialidades_tecnicas').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarEspecialidad: async (especialidadId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('especialidades_tecnicas').update(pick(payload, ['codigo', 'nombre', 'area', 'requiere_cert', 'estado'])).eq('id', especialidadId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarEspecialidad: async (especialidadId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('especialidades_tecnicas').delete().eq('id', especialidadId);
    if (error) throw error;
  },

  // Niveles Jerarquicos
  getNivelesJerarquicos: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('niveles_jerarquicos').select('*').eq('empresa_id', empresaId).order('orden', { ascending: true });
    if (error) { console.error('Error fetching niveles jerarquicos:', error); return []; }
    return data;
  },
  crearNivelJerarquico: async (empresaId, nivel) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: nivel.id || makeId('nvj'),
      empresa_id: empresaId,
      ...pick(nivel, ['codigo', 'nombre', 'alcance', 'orden', 'estado']),
    };
    const { data, error } = await supabase.from('niveles_jerarquicos').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarNivelJerarquico: async (nivelId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('niveles_jerarquicos').update(pick(payload, ['codigo', 'nombre', 'alcance', 'orden', 'estado'])).eq('id', nivelId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarNivelJerarquico: async (nivelId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('niveles_jerarquicos').delete().eq('id', nivelId);
    if (error) throw error;
  },

  // Tipos de Servicio
  getTiposServicio: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tipos_servicio_interno').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching tipos servicio:', error); return []; }
    return data;
  },
  crearTipoServicio: async (empresaId, tipoServicio) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: tipoServicio.id || makeId('tsi'),
      empresa_id: empresaId,
      codigo: tipoServicio.codigo || `TSI-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(tipoServicio, ['nombre', 'clasificacion', 'facturable', 'estado']),
    };
    const { data, error } = await supabase.from('tipos_servicio_interno').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarTipoServicio: async (tipoServicioId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tipos_servicio_interno').update(pick(payload, ['codigo', 'nombre', 'clasificacion', 'facturable', 'estado'])).eq('id', tipoServicioId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarTipoServicio: async (tipoServicioId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('tipos_servicio_interno').delete().eq('id', tipoServicioId);
    if (error) throw error;
  },

  // Almacenes
  getAlmacenes: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('almacenes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching almacenes:', error); return []; }
    return data;
  },
  crearAlmacen: async (empresaId, almacen) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: almacen.id || makeId('alm'),
      empresa_id: empresaId,
      codigo: almacen.codigo || `ALM-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(almacen, ['nombre', 'tipo', 'responsable', 'direccion', 'estado']),
    };
    const { data, error } = await supabase.from('almacenes').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarAlmacen: async (almacenId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('almacenes').update(pick(payload, ['codigo', 'nombre', 'tipo', 'responsable', 'direccion', 'estado'])).eq('id', almacenId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarAlmacen: async (almacenId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('almacenes').delete().eq('id', almacenId);
    if (error) throw error;
  },

  // Sedes
  getSedes: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sedes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching sedes:', error); return []; }
    return data;
  },
  crearSede: async (empresaId, sede) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: sede.id || makeId('sed'),
      empresa_id: empresaId,
      codigo: sede.codigo || `SED-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(sede, ['nombre', 'direccion', 'gps', 'estado', 'tipo']),
    };
    const { data, error } = await supabase.from('sedes').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarSede: async (sedeId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sedes').update(pick(payload, ['codigo', 'nombre', 'direccion', 'gps', 'estado', 'tipo'])).eq('id', sedeId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarSede: async (sedeId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('sedes').delete().eq('id', sedeId);
    if (error) throw error;
  },

  // Industrias
  getIndustrias: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('industrias').select('*').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre', { ascending: true });
    if (error) { console.error('Error fetching industrias:', error); return []; }
    return data;
  },
  crearIndustria: async (empresaId, industria) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: industria.id || makeId('ind'),
      empresa_id: empresaId,
      codigo: industria.codigo || `IND-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      ...pick(industria, ['nombre', 'categoria', 'estado']),
    };
    const { data, error } = await supabase.from('industrias').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarIndustria: async (industriaId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('industrias').update(pick(payload, ['codigo', 'nombre', 'categoria', 'estado'])).eq('id', industriaId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarIndustria: async (industriaId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('industrias').delete().eq('id', industriaId);
    if (error) throw error;
  },

  // Servicios (Catálogo)
  getMonedasImpuestosUnidades: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('monedas_impuestos_unidades').select('*').eq('empresa_id', empresaId).order('tipo', { ascending: true }).order('codigo', { ascending: true });
    if (error) { console.error('Error fetching monedas/impuestos/unidades:', error); return []; }
    return data;
  },
  crearMonedaImpuestoUnidad: async (empresaId, item) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: item.id || makeId('miu'),
      empresa_id: empresaId,
      ...pick(item, ['tipo', 'codigo', 'nombre', 'detalle', 'estado']),
    };
    const { data, error } = await supabase.from('monedas_impuestos_unidades').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarMonedaImpuestoUnidad: async (itemId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('monedas_impuestos_unidades').update(pick(payload, ['tipo', 'codigo', 'nombre', 'detalle', 'estado'])).eq('id', itemId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarMonedaImpuestoUnidad: async (itemId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('monedas_impuestos_unidades').delete().eq('id', itemId);
    if (error) throw error;
  },

  getCentrosBeneficio: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('centros_beneficio').select('*').eq('empresa_id', empresaId).order('codigo', { ascending: true });
    if (error) { console.error('Error fetching CEBE:', error); return []; }
    return data;
  },
  crearCentroBeneficio: async (empresaId, cebe) => {
    const supabase = await getSupabaseClient();
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      empresaId,
      cebe?.sociedad_id,
      'La sociedad es obligatoria para crear el CEBE.',
    );
    const payload = {
      id: cebe.id || makeId('cebe'),
      empresa_id: empresaId,
      ...pick(cebe, ['codigo', 'nombre', 'tipo', 'cargo_financiero_dbs', 'modelo_negocio', 'responsable_id', 'responsable_nombre', 'cuenta_id', 'sociedad_id', 'meta_ingresos', 'fecha_inicio', 'fecha_fin', 'descripcion', 'estado']),
      sociedad_id: sociedadId,
    };
    const { data, error } = await supabase.from('centros_beneficio').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarCentroBeneficio: async (cebeId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('centros_beneficio').update(pick(payload, ['codigo', 'nombre', 'tipo', 'cargo_financiero_dbs', 'modelo_negocio', 'responsable_id', 'responsable_nombre', 'cuenta_id', 'sociedad_id', 'meta_ingresos', 'fecha_inicio', 'fecha_fin', 'descripcion', 'estado'])).eq('id', cebeId).select().single();
    if (error) throw error;
    return data;
  },
  importarCentrosBeneficio: async (empresaId, cebes) => {
    const supabase = await getSupabaseClient();
    const filasValidadas = await validarFilasSocietariasMaestro({
      supabase,
      empresaId,
      filas: cebes,
      entidad: 'CEBE',
    });
    return importarMaestroSinSobrescribir({
      supabase,
      tabla: 'centros_beneficio',
      empresaId,
      filas: filasValidadas,
      prefijoId: 'cebe',
      campos: ['codigo', 'nombre', 'tipo', 'cargo_financiero_dbs', 'modelo_negocio', 'responsable_id', 'responsable_nombre', 'cuenta_id', 'sociedad_id', 'meta_ingresos', 'fecha_inicio', 'fecha_fin', 'descripcion', 'estado'],
    });
  },
  getCentrosCosto: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('centros_costo').select('*').eq('empresa_id', empresaId).order('codigo', { ascending: true });
    if (error) { console.error('Error fetching CECO:', error); return []; }
    return data;
  },
  crearCentroCosto: async (empresaId, ceco) => {
    const supabase = await getSupabaseClient();
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      empresaId,
      ceco?.sociedad_id,
      'La sociedad es obligatoria para crear el CECO.',
    );
    const payload = {
      id: ceco.id || makeId('ceco'),
      empresa_id: empresaId,
      ...pick(ceco, ['codigo', 'nombre', 'tipo', 'responsable_id', 'responsable_nombre', 'cebe_id', 'sociedad_id', 'sede_padre', 'especialidad', 'presupuesto_mensual', 'fecha_inicio', 'fecha_fin', 'descripcion', 'estado']),
      sociedad_id: sociedadId,
    };
    const { data, error } = await supabase.from('centros_costo').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarCentroCosto: async (cecoId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('centros_costo').update(pick(payload, ['codigo', 'nombre', 'tipo', 'responsable_id', 'responsable_nombre', 'cebe_id', 'sociedad_id', 'sede_padre', 'especialidad', 'presupuesto_mensual', 'fecha_inicio', 'fecha_fin', 'descripcion', 'estado'])).eq('id', cecoId).select().single();
    if (error) throw error;
    return data;
  },
  importarCentrosCosto: async (empresaId, cecos) => {
    const supabase = await getSupabaseClient();
    const filasValidadas = await validarFilasSocietariasMaestro({
      supabase,
      empresaId,
      filas: cecos,
      entidad: 'CECO',
    });
    return importarMaestroSinSobrescribir({
      supabase,
      tabla: 'centros_costo',
      empresaId,
      filas: filasValidadas,
      prefijoId: 'ceco',
      campos: ['codigo', 'nombre', 'tipo', 'responsable_id', 'responsable_nombre', 'cebe_id', 'sociedad_id', 'sede_padre', 'especialidad', 'presupuesto_mensual', 'fecha_inicio', 'fecha_fin', 'descripcion', 'estado'],
    });
  },

  getServicios: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('servicios').select('*').eq('empresa_id', empresaId).order('codigo', { ascending: true });
    if (error) { console.error('Error fetching servicios:', error); return []; }
    return data;
  },
  crearServicio: async (empresaId, servicio) => {
    const supabase = await getSupabaseClient();
    const payload = {
      id: servicio.id || makeId('srv'),
      empresa_id: empresaId,
      ...pick(servicio, ['codigo', 'familia', 'descripcion', 'unidad', 'moneda', 'costo', 'precio', 'margen', 'estado', 'facturable', 'precio_incluido', 'detalle', 'entregables', 'notas_internas']),
    };
    const { data, error } = await supabase.from('servicios').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarServicio: async (servicioId, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('servicios').update(pick(payload, ['codigo', 'familia', 'descripcion', 'unidad', 'moneda', 'costo', 'precio', 'margen', 'estado', 'facturable', 'precio_incluido', 'detalle', 'entregables', 'notas_internas'])).eq('id', servicioId).select().single();
    if (error) throw error;
    return data;
  },
  eliminarServicio: async (servicioId) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('servicios').delete().eq('id', servicioId);
    if (error) throw error;
  },
  importarServiciosMasivo: async (empresaId, servicios) => {
    const supabase = await getSupabaseClient();
    const payload = servicios.map(s => ({
      id: s.id || makeId('srv'),
      empresa_id: empresaId,
      ...pick(s, ['codigo', 'familia', 'descripcion', 'unidad', 'moneda', 'costo', 'precio', 'margen', 'estado', 'facturable', 'precio_incluido', 'detalle', 'entregables', 'notas_internas']),
    }));
    const { data, error } = await supabase.from('servicios').upsert(payload, { onConflict: 'empresa_id, codigo' }).select();
    if (error) throw error;
    return data;
  },
};
