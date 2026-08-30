import { getSupabaseClient } from '../lib/supabaseClient.js';

const requireEmpresaId = (empresaId) => {
  if (!empresaId) throw new Error('No hay una empresa activa para cargar el organigrama.');
};

const throwIfError = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

const mergeById = (...lists) => {
  const byId = new Map();
  lists.flat().filter(Boolean).forEach(item => byId.set(item.id, item));
  return [...byId.values()];
};

// Fuente de datos y comandos del Organigrama v2. Todas las lecturas llevan el
// filtro explícito de tenant, además del aislamiento que ya aplica RLS.
export const organigramaV2Service = {
  async getDatos(empresaId) {
    requireEmpresaId(empresaId);
    const supabase = await getSupabaseClient();

    const [
      unidadesResult,
      colocacionesResult,
      posicionesResult,
      ocupacionesResult,
      relacionesMatricialesResult,
      layoutResult,
      cargosResult,
      nivelesResult,
      rolesResult,
      personalOperativoResult,
      personalAdministrativoResult,
      empresaResult,
    ] = await Promise.all([
      supabase
        .from('unidades_organizacionales')
        .select('id, empresa_id, codigo, nombre, unidad_padre_id, estado')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true }),
      supabase
        .from('cargo_colocaciones')
        .select(`
          id, empresa_id, sociedad_id, unidad_organizacional_id, cargo_id,
          nivel_jerarquico_id, rol_id, cantidad_posiciones, estado,
          reporta_a_cargo_colocacion_id, campo_habilitado, campo_modulos, created_at, updated_at,
          cargo:cargos_empresa(id, codigo, nombre, categoria_nivel),
          nivel:niveles_jerarquicos(id, codigo, nombre, orden),
          rol:roles(id, nombre, categoria, nivel_jerarquico)
        `)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: true }),
      supabase
        .from('posiciones')
        .select(`
          id, empresa_id, cargo_colocacion_id, cargo_id,
          unidad_organizacional_id, estado, activa, created_at, updated_at
        `)
        .eq('empresa_id', empresaId)
        .eq('activa', true),
      supabase
        .from('posiciones_usuarios')
        .select('id, empresa_id, posicion_id, user_id, fecha_inicio, fecha_fin')
        .eq('empresa_id', empresaId)
        .is('fecha_fin', null),
      supabase
        .from('posicion_relaciones_matriciales')
        .select('id, empresa_id, sociedad_id, posicion_subordinada_id, posicion_jefe_id, estado, created_at, updated_at')
        .eq('empresa_id', empresaId)
        .eq('estado', 'activo'),
      supabase
        .from('organigrama_v2_layout')
        .select('id, empresa_id, tipo_nodo, nodo_id, x, y, updated_at')
        .eq('empresa_id', empresaId),
      supabase
        .from('cargos_empresa')
        .select('id, empresa_id, codigo, nombre, categoria_nivel, estado')
        .eq('empresa_id', empresaId)
        .eq('estado', 'activo')
        .order('nombre', { ascending: true }),
      supabase
        .from('niveles_jerarquicos')
        .select('id, empresa_id, codigo, nombre, orden, estado')
        .eq('empresa_id', empresaId)
        .eq('estado', 'activo')
        .order('orden', { ascending: true }),
      supabase
        .from('roles')
        .select('id, empresa_id, nombre, categoria, nivel_jerarquico')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true }),
      supabase
        .from('personal_operativo')
        .select('id, empresa_id, auth_user_id, nombre')
        .eq('empresa_id', empresaId),
      supabase
        .from('personal_administrativo')
        .select('id, empresa_id, auth_user_id, nombre')
        .eq('empresa_id', empresaId),
      supabase
        .from('empresas')
        .select('id, organigrama_v2_habilitado')
        .eq('id', empresaId)
        .maybeSingle(),
    ]);

    const ocupantePorUsuarioId = new Map(
      mergeById(throwIfError(personalOperativoResult), throwIfError(personalAdministrativoResult))
        .map(persona => [persona.auth_user_id, persona]),
    );

    return {
      empresa: throwIfError(empresaResult),
      unidadesOrganizacionales: throwIfError(unidadesResult),
      cargoColocaciones: throwIfError(colocacionesResult),
      posiciones: throwIfError(posicionesResult),
      posicionesVinculadas: throwIfError(posicionesResult).filter(posicion => posicion.cargo_colocacion_id),
      ocupacionesActivas: throwIfError(ocupacionesResult).map(ocupacion => ({
        ...ocupacion,
        ocupante: ocupantePorUsuarioId.get(ocupacion.user_id) || null,
      })),
      // Relaciones visuales nuevas. Las asignaciones adicionales de la migración 301
      // no son relaciones de reporte y deliberadamente no se cargan aquí.
      relacionesMatriciales: throwIfError(relacionesMatricialesResult),
      layout: throwIfError(layoutResult),
      catalogos: {
        cargos: throwIfError(cargosResult),
        niveles: throwIfError(nivelesResult),
        roles: throwIfError(rolesResult),
      },
    };
  },

  async crearOActualizarCargoColocacion({
    id = null,
    empresaId,
    sociedadId = null,
    unidadOrganizacionalId,
    cargoId,
    nivelJerarquicoId,
    rolId,
    cantidadPosiciones,
    estado = 'activo',
    reportaACargoColocacionId = null,
    campoHabilitado = false,
    campoModulos = [],
  }) {
    requireEmpresaId(empresaId);
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('crear_o_actualizar_cargo_colocacion', {
      p_id: id,
      p_empresa_id: empresaId,
      p_sociedad_id: sociedadId,
      p_unidad_organizacional_id: unidadOrganizacionalId,
      p_cargo_id: cargoId,
      p_nivel_jerarquico_id: nivelJerarquicoId,
      p_rol_id: rolId,
      p_cantidad_posiciones: cantidadPosiciones,
      p_estado: estado,
      p_reporta_a_cargo_colocacion_id: reportaACargoColocacionId,
      p_campo_habilitado: Boolean(campoHabilitado),
      p_campo_modulos: Array.isArray(campoModulos) ? campoModulos : [],
    });
    if (error) throw error;
    return data;
  },

  async generarPosicionesDesdeColocacion(cargoColocacionId) {
    if (!cargoColocacionId) throw new Error('Selecciona una cargo-colocación.');
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('generar_posiciones_desde_colocacion', {
      p_cargo_colocacion_id: cargoColocacionId,
    });
    if (error) throw error;
    return data;
  },

  async crearRelacionMatricial({ empresaId, posicionSubordinadaId, posicionJefeId, sociedadId = null }) {
    requireEmpresaId(empresaId);
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('crear_relacion_matricial', {
      p_empresa_id: empresaId,
      p_posicion_subordinada_id: posicionSubordinadaId,
      p_posicion_jefe_id: posicionJefeId,
      p_sociedad_id: sociedadId,
    });
    if (error) throw error;
    return data;
  },

  async eliminarRelacionMatricial(id) {
    if (!id) throw new Error('Falta la relación matricial a eliminar.');
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('eliminar_relacion_matricial', { p_id: id });
    if (error) throw error;
    return data;
  },

  async eliminarUnidadOrganizacional(id) {
    if (!id) throw new Error('Falta la unidad organizacional a eliminar.');
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('eliminar_unidad_organizacional', { p_id: id });
    if (error) throw error;
    return data;
  },

  async eliminarCargoColocacion(id) {
    if (!id) throw new Error('Falta la cargo-colocación a eliminar.');
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('eliminar_cargo_colocacion', { p_id: id });
    if (error) throw error;
    return data;
  },

  async guardarPosicionNodo({ empresaId, tipoNodo, nodoId, x, y }) {
    requireEmpresaId(empresaId);
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('guardar_posicion_nodo_organigrama', {
      p_empresa_id: empresaId,
      p_tipo_nodo: tipoNodo,
      p_nodo_id: nodoId,
      p_x: x,
      p_y: y,
    });
    if (error) throw error;
    return data;
  },
};
