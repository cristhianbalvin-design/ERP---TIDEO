import { getSupabaseClient } from '../lib/supabaseClient.js';

export const PERFIL_SOCIEDAD = Object.freeze({
  SIN_MULTISOCIEDAD: 'sin_multisociedad',
  GRUPO: 'grupo',
  MULTISOCIEDAD: 'multisociedad',
  SOCIEDAD: 'sociedad',
});

const sociedadIdsDeAsignaciones = (asignaciones, tipos = [PERFIL_SOCIEDAD.SOCIEDAD]) => [
  ...new Set(
    asignaciones
      .filter(a => tipos.includes(a.alcance_tipo))
      .flatMap(a => Array.isArray(a.sociedades_ids) ? a.sociedades_ids : [])
      .filter(Boolean)
  ),
];

export function resolverSociedadesIdsAlcance(perfil, asignaciones = []) {
  const activas = asignaciones.filter(a => a?.activo !== false);
  if (perfil === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return null;
  if (perfil === PERFIL_SOCIEDAD.GRUPO) {
    const asignacionesGrupo = activas.filter(a => a.alcance_tipo === PERFIL_SOCIEDAD.GRUPO);
    if (!asignacionesGrupo.length) return null;
    if (asignacionesGrupo.some(a => a.sociedades_ids == null)) return null;
    return sociedadIdsDeAsignaciones(asignacionesGrupo, [PERFIL_SOCIEDAD.GRUPO]);
  }
  return sociedadIdsDeAsignaciones(activas, [PERFIL_SOCIEDAD.SOCIEDAD]);
}

export function resolverPerfilSociedad(multisociedadHabilitado, asignaciones = []) {
  if (!multisociedadHabilitado) return PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD;

  const activas = asignaciones.filter(a => a?.activo !== false);
  if (activas.some(a => a.alcance_tipo === PERFIL_SOCIEDAD.GRUPO)) {
    return PERFIL_SOCIEDAD.GRUPO;
  }
  if (activas.some(a => a.alcance_tipo === PERFIL_SOCIEDAD.SOCIEDAD)) {
    return sociedadIdsDeAsignaciones(activas).length > 1
      ? PERFIL_SOCIEDAD.MULTISOCIEDAD
      : PERFIL_SOCIEDAD.SOCIEDAD;
  }

  // Compatibilidad: una asignacion historica de tenant/area/etc. no debe perder
  // acceso cuando el tenant habilite por primera vez multisociedades.
  return PERFIL_SOCIEDAD.GRUPO;
}

export function filtrarSociedadesDisponibles(sociedades = [], perfil, asignaciones = []) {
  if (perfil === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return [];
  const idsAlcance = resolverSociedadesIdsAlcance(perfil, asignaciones);
  if (idsAlcance == null) return sociedades;
  const permitidas = new Set(idsAlcance);
  return sociedades.filter(sociedad => permitidas.has(sociedad.id));
}

export function filtrarRegistrosPorAlcanceSociedad(registros = [], perfil, sociedadesIdsAlcance = null) {
  if (perfil === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD) return registros;
  if (perfil === PERFIL_SOCIEDAD.GRUPO && sociedadesIdsAlcance == null) return registros;
  const permitidas = new Set(Array.isArray(sociedadesIdsAlcance) ? sociedadesIdsAlcance : []);
  return registros.filter(registro => registro?.sociedad_id && permitidas.has(registro.sociedad_id));
}

export function resolverSociedadActiva(sociedades = [], sociedadPreferidaId = null) {
  return sociedades.find(sociedad => sociedad.id === sociedadPreferidaId) || sociedades[0] || null;
}

export function sociedadIdParaPersistir(empresa, sociedadId) {
  if (!empresa?.multisociedad_habilitado) return null;
  if (!sociedadId) throw new Error('Selecciona una sociedad antes de continuar.');
  return sociedadId;
}

export async function cargarContextoSociedades({ empresa, userId, sociedadPreferidaId = null }) {
  if (!empresa?.multisociedad_habilitado) {
    return {
      perfilSociedad: PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD,
      sociedadesIdsAlcance: null,
      sociedadActiva: null,
      sociedadesDisponibles: [],
    };
  }

  if (!userId) throw new Error('No se puede cargar sociedades sin un usuario autenticado.');

  const supabase = await getSupabaseClient();
  const [{ data: asignaciones, error: asignacionesError }, { data: sociedades, error: sociedadesError }] = await Promise.all([
    supabase
      .from('usuarios_asignaciones')
      .select('alcance_tipo, sociedades_ids, principal, activo')
      .eq('empresa_id', empresa.id)
      .eq('user_id', userId)
      .eq('activo', true),
    supabase
      .from('sociedades')
      .select('id, empresa_id, codigo, nombre, razon_social, ruc, direccion_fiscal, logo_url, firma_url, activa')
      .eq('empresa_id', empresa.id)
      .eq('activa', true)
      .order('nombre'),
  ]);

  if (asignacionesError) throw asignacionesError;
  if (sociedadesError) throw sociedadesError;

  const perfilSociedad = resolverPerfilSociedad(true, asignaciones || []);
  const sociedadesIdsAlcance = resolverSociedadesIdsAlcance(perfilSociedad, asignaciones || []);
  const sociedadesDisponibles = filtrarSociedadesDisponibles(
    sociedades || [],
    perfilSociedad,
    asignaciones || []
  );

  return {
    perfilSociedad,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
    sociedadActiva: resolverSociedadActiva(sociedadesDisponibles, sociedadPreferidaId),
  };
}
