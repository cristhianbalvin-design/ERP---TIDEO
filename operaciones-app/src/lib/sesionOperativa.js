import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';

// Intentional duplication of the pure society-resolution rules in
// src/services/sociedadesService.js. Operaciones is an independent Vite
// package, so importing that service would also import the administrative
// Supabase client. Keep this module synchronized with that source.
export const PERFIL_SOCIEDAD = Object.freeze({
  SIN_MULTISOCIEDAD: 'sin_multisociedad',
  GRUPO: 'grupo',
  MULTISOCIEDAD: 'multisociedad',
  SOCIEDAD: 'sociedad',
});

export const SOCIEDAD_TODAS_ID = '**todas**';
export const SOCIEDAD_TODAS = Object.freeze({
  id: SOCIEDAD_TODAS_ID,
  codigo: 'GRUPO',
  nombre: 'GRUPO - Vista consolidada',
  es_consolidada: true,
});

const CAMPOS_EMPRESA = 'id, razon_social, nombre_comercial, ruc, moneda_base, plan_id, estado, es_plataforma, multisociedad_habilitado, modulo_operativo_habilitado';
const CAMPOS_SOCIEDAD = 'id, empresa_id, codigo, nombre, razon_social, ruc, direccion_fiscal, logo_url, firma_url, regimen_laboral, pct_quincena_1, activa, es_principal';

const leerStorage = (storage, key) => {
  try { return storage?.getItem?.(key) || null; } catch { return null; }
};

const escribirStorage = (storage, key, value) => {
  try { storage?.setItem?.(key, value); } catch { /* storage is optional */ }
};

const empresaPermiteAcceso = estado => ['activa', 'activo', 'demo'].includes(String(estado || '').toLowerCase());

const sociedadIdsDeAsignaciones = (asignaciones, tipos = [PERFIL_SOCIEDAD.SOCIEDAD]) => [
  ...new Set(
    asignaciones
      .filter(asignacion => tipos.includes(asignacion.alcance_tipo))
      .flatMap(asignacion => Array.isArray(asignacion.sociedades_ids) ? asignacion.sociedades_ids : [])
      .filter(Boolean)
  ),
];

export function resolverSociedadesIdsAlcance(perfil, asignaciones = []) {
  const activas = asignaciones.filter(asignacion => asignacion?.activo !== false);
  if (perfil === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return null;
  if (perfil === PERFIL_SOCIEDAD.GRUPO) {
    const asignacionesGrupo = activas.filter(asignacion => asignacion.alcance_tipo === PERFIL_SOCIEDAD.GRUPO);
    if (!asignacionesGrupo.length) return null;
    if (asignacionesGrupo.some(asignacion => asignacion.sociedades_ids == null)) return null;
    return sociedadIdsDeAsignaciones(asignacionesGrupo, [PERFIL_SOCIEDAD.GRUPO]);
  }
  return sociedadIdsDeAsignaciones(activas, [PERFIL_SOCIEDAD.SOCIEDAD]);
}

export function resolverPerfilSociedad(multisociedadHabilitado, asignaciones = []) {
  if (!multisociedadHabilitado) return PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD;

  const activas = asignaciones.filter(asignacion => asignacion?.activo !== false);
  if (activas.some(asignacion => asignacion.alcance_tipo === PERFIL_SOCIEDAD.GRUPO)) return PERFIL_SOCIEDAD.GRUPO;
  if (activas.some(asignacion => asignacion.alcance_tipo === PERFIL_SOCIEDAD.SOCIEDAD)) {
    return sociedadIdsDeAsignaciones(activas).length > 1
      ? PERFIL_SOCIEDAD.MULTISOCIEDAD
      : PERFIL_SOCIEDAD.SOCIEDAD;
  }

  return PERFIL_SOCIEDAD.GRUPO;
}

export function filtrarSociedadesDisponibles(sociedades = [], perfil, asignaciones = []) {
  if (perfil === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return [];
  const idsAlcance = resolverSociedadesIdsAlcance(perfil, asignaciones);
  if (idsAlcance == null) return sociedades;
  const permitidas = new Set(idsAlcance);
  return sociedades.filter(sociedad => permitidas.has(sociedad.id));
}

export function resolverSociedadActiva(sociedades = [], sociedadPreferidaId = null) {
  if (sociedades.length === 0) return null;
  if (sociedades.length === 1) return sociedades[0];
  if (!sociedadPreferidaId || sociedadPreferidaId === SOCIEDAD_TODAS_ID) return SOCIEDAD_TODAS;
  return sociedades.find(sociedad => sociedad.id === sociedadPreferidaId) || SOCIEDAD_TODAS;
}

export function resolverFiltroSociedadesVista({
  multisociedadHabilitado = false,
  perfilSociedad = PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD,
  sociedadActiva = null,
  sociedadesIdsAlcance = null,
  sociedadesDisponibles = [],
} = {}) {
  const resolverResultado = ({ sinFiltro, sociedadesIds = [], sociedadIdEscritura = null }) => ({
    sinFiltro,
    sociedadesIds,
    permiteEscritura: !multisociedadHabilitado || Boolean(sociedadIdEscritura),
    sociedadIdEscritura,
  });

  if (!multisociedadHabilitado) return resolverResultado({ sinFiltro: true });
  if (perfilSociedad === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return resolverResultado({ sinFiltro: false });

  const sociedadActivaId = typeof sociedadActiva === 'string' ? sociedadActiva : sociedadActiva?.id;
  const disponibles = [...new Set(sociedadesDisponibles.map(sociedad => sociedad?.id).filter(Boolean))];
  const disponiblesSet = new Set(disponibles);
  const alcanceCompleto = perfilSociedad === PERFIL_SOCIEDAD.GRUPO && sociedadesIdsAlcance == null;
  const permitidas = Array.isArray(sociedadesIdsAlcance)
    ? [...new Set(sociedadesIdsAlcance.filter(id => disponiblesSet.has(id)))]
    : disponibles;
  const permitidasSet = new Set(permitidas);

  if (sociedadActivaId === SOCIEDAD_TODAS_ID) {
    return resolverResultado({ sinFiltro: alcanceCompleto, sociedadesIds: alcanceCompleto ? [] : permitidas });
  }
  if (!sociedadActivaId || !disponiblesSet.has(sociedadActivaId)) return resolverResultado({ sinFiltro: false });
  if (!alcanceCompleto && !permitidasSet.has(sociedadActivaId)) return resolverResultado({ sinFiltro: false });
  return resolverResultado({
    sinFiltro: false,
    sociedadesIds: [sociedadActivaId],
    sociedadIdEscritura: sociedadActivaId,
  });
}

export async function cargarContextoSociedadesOperativo({ supabase, empresa, userId, sociedadPreferidaId = null }) {
  if (!empresa?.multisociedad_habilitado) {
    return {
      perfilSociedad: PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD,
      sociedadesIdsAlcance: null,
      sociedadActiva: null,
      sociedadesDisponibles: [],
    };
  }
  if (!userId) throw new Error('No se puede cargar sociedades sin un usuario autenticado.');

  const [{ data: asignaciones, error: asignacionesError }, { data: sociedades, error: sociedadesError }] = await Promise.all([
    supabase
      .from('usuarios_asignaciones')
      .select('alcance_tipo, sociedades_ids, principal, activo')
      .eq('empresa_id', empresa.id)
      .eq('user_id', userId)
      .eq('activo', true),
    supabase
      .from('sociedades')
      .select(CAMPOS_SOCIEDAD)
      .eq('empresa_id', empresa.id)
      .eq('activa', true)
      .order('nombre'),
  ]);
  if (asignacionesError) throw asignacionesError;
  if (sociedadesError) throw sociedadesError;

  const perfilSociedad = resolverPerfilSociedad(true, asignaciones || []);
  const sociedadesIdsAlcance = resolverSociedadesIdsAlcance(perfilSociedad, asignaciones || []);
  const sociedadesDisponibles = filtrarSociedadesDisponibles(sociedades || [], perfilSociedad, asignaciones || []);
  return {
    perfilSociedad,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
    sociedadActiva: resolverSociedadActiva(sociedadesDisponibles, sociedadPreferidaId),
  };
}

const estadoBase = (overrides = {}) => ({
  usuario: null,
  empresa: null,
  empresaId: null,
  sociedadId: null,
  sociedadActiva: null,
  sociedadesDisponibles: [],
  perfilSociedad: PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD,
  sociedadesIdsAlcance: null,
  vistaConsolidada: false,
  permiteEscritura: false,
  cargando: false,
  error: null,
  estado: 'sin_sesion',
  ...overrides,
});

export async function cargarSesionOperativa({
  supabase = null,
  storage = globalThis.localStorage,
  esSolicitudActual = () => true,
} = {}) {
  const resultadoActual = resultado => (esSolicitudActual() ? resultado : null);

  try {
    if (!supabase && !isSupabaseConfigured()) {
      return resultadoActual(estadoBase({ estado: 'no_configurado', error: 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.' }));
    }

    const cliente = supabase || getSupabaseClient();
    const { data: sesionData, error: sesionError } = await cliente.auth.getSession();
    if (!esSolicitudActual()) return null;
    if (sesionError) throw sesionError;
    const usuario = sesionData?.session?.user || null;
    if (!usuario) return resultadoActual(estadoBase({ estado: 'sin_sesion' }));

    const { data: membresiasRpc, error: membresiasError } = await cliente.rpc('get_mis_membresias');
    if (!esSolicitudActual()) return null;
    if (membresiasError) throw membresiasError;
    if (!membresiasRpc?.length) return resultadoActual(estadoBase({ usuario, estado: 'sin_empresa' }));

    const empresaIds = [...new Set(membresiasRpc.map(membresia => membresia.empresa_id).filter(Boolean))];
    const rolIds = [...new Set(membresiasRpc.map(membresia => membresia.rol_id).filter(Boolean))];
    const empresasQuery = cliente.from('empresas').select(CAMPOS_EMPRESA).in('id', empresaIds);
    const rolesQuery = rolIds.length
      ? cliente.from('roles').select('id, nombre, es_admin_empresa, es_superadmin').in('id', rolIds)
      : Promise.resolve({ data: [], error: null });
    const [{ data: empresas, error: empresasError }, { data: roles, error: rolesError }] = await Promise.all([empresasQuery, rolesQuery]);
    if (!esSolicitudActual()) return null;
    if (empresasError) throw empresasError;
    if (rolesError) throw rolesError;

    const membresiasActivas = membresiasRpc
      .map(membresia => ({
        ...membresia,
        empresa: (empresas || []).find(empresa => empresa.id === membresia.empresa_id) || null,
        rol: (roles || []).find(rol => rol.id === membresia.rol_id) || null,
      }))
      .filter(membresia => empresaPermiteAcceso(membresia.empresa?.estado));

    if (!membresiasActivas.length) return resultadoActual(estadoBase({ usuario, estado: 'sin_empresa' }));

    const empresaPreferidaId = leerStorage(storage, 'last_empresa_id');
    const membresia = (empresaPreferidaId && membresiasActivas.find(item => item.empresa_id === empresaPreferidaId)) || membresiasActivas[0];
    const empresa = membresia.empresa;
    const { data: permisosRows, error: permisosError } = await cliente
      .from('permisos_roles')
      .select('*')
      .eq('rol_id', membresia.rol_id);
    if (!esSolicitudActual()) return null;
    if (permisosError) throw permisosError;

    const puedeVerConsolidado = Boolean(
      membresia.rol?.es_admin_empresa
      || membresia.rol?.es_superadmin
      || (permisosRows || []).some(permiso => permiso.permisos_extra?.ver_consolidado_grupo === true)
    );
    const sociedadPreferidaId = leerStorage(storage, `last_sociedad_id_${empresa.id}`);
    const contextoSociedad = await cargarContextoSociedadesOperativo({
      supabase: cliente,
      empresa,
      userId: usuario.id,
      sociedadPreferidaId,
    });
    if (!esSolicitudActual()) return null;
    const sociedadActiva = !puedeVerConsolidado && contextoSociedad.sociedadActiva?.id === SOCIEDAD_TODAS_ID
      ? (contextoSociedad.sociedadesDisponibles[0] || null)
      : contextoSociedad.sociedadActiva;
    if (!puedeVerConsolidado && sociedadActiva?.id) {
      escribirStorage(storage, `last_sociedad_id_${empresa.id}`, sociedadActiva.id);
    }
    const filtroSociedad = resolverFiltroSociedadesVista({
      multisociedadHabilitado: empresa.multisociedad_habilitado,
      perfilSociedad: contextoSociedad.perfilSociedad,
      sociedadActiva,
      sociedadesIdsAlcance: contextoSociedad.sociedadesIdsAlcance,
      sociedadesDisponibles: contextoSociedad.sociedadesDisponibles,
    });

    return resultadoActual(estadoBase({
      usuario,
      empresa,
      empresaId: empresa.id,
      sociedadId: filtroSociedad.sociedadIdEscritura,
      sociedadActiva,
      sociedadesDisponibles: contextoSociedad.sociedadesDisponibles,
      perfilSociedad: contextoSociedad.perfilSociedad,
      sociedadesIdsAlcance: contextoSociedad.sociedadesIdsAlcance,
      vistaConsolidada: sociedadActiva?.id === SOCIEDAD_TODAS_ID,
      permiteEscritura: filtroSociedad.permiteEscritura,
      estado: 'listo',
    }));
  } catch (error) {
    if (!esSolicitudActual()) return null;
    throw error;
  }
}

export function useSesionOperativa() {
  const requestIdRef = useRef(0);
  const [sesion, setSesion] = useState(() => estadoBase({
    cargando: isSupabaseConfigured(),
    estado: isSupabaseConfigured() ? 'cargando' : 'no_configurado',
    error: isSupabaseConfigured() ? null : 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
  }));

  const recargar = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const esSolicitudActual = () => requestId === requestIdRef.current;
    setSesion(actual => ({ ...actual, cargando: true, error: null, estado: 'cargando' }));
    try {
      const resultado = await cargarSesionOperativa({ esSolicitudActual });
      if (!resultado || !esSolicitudActual()) return null;
      setSesion(resultado);
      return resultado;
    } catch (error) {
      if (!esSolicitudActual()) return null;
      const resultado = estadoBase({
        cargando: false,
        estado: 'error',
        error: error?.message || 'No se pudo resolver la sesion operativa.',
      });
      setSesion(resultado);
      return resultado;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let vigente = true;
    const cargar = async () => {
      const resultado = await recargar();
      return vigente ? resultado : null;
    };
    cargar();

    const cliente = getSupabaseClient();
    const { data: listener } = cliente.auth.onAuthStateChange(() => { cargar(); });
    return () => {
      vigente = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, [recargar]);

  return { ...sesion, recargar };
}
