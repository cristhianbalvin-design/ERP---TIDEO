import { getSupabaseClient } from '../lib/supabaseClient.js';

export const PERFIL_SOCIEDAD = Object.freeze({
  SIN_MULTISOCIEDAD: 'sin_multisociedad',
  GRUPO: 'grupo',
  MULTISOCIEDAD: 'multisociedad',
  SOCIEDAD: 'sociedad',
});

export function normalizarSlugTideo(valor, { maximo = 20, quitarSufijoLegal = false } = {}) {
  let slug = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (quitarSufijoLegal) {
    slug = slug.replace(/-(s-a-c|sac|s-a|sa|s-r-l|srl|e-i-r-l|eirl)$/i, '');
  }

  return slug.slice(0, Math.max(Number(maximo) || 20, 1)).replace(/-+$/g, '');
}

export function generarCodigoSociedadBase(nombre) {
  return normalizarSlugTideo(nombre, { maximo: 30, quitarSufijoLegal: true }) || 'sociedad';
}

function siguienteCodigoSociedad(base, existentes) {
  if (!existentes.has(base)) return base;
  let sufijo = 2;
  while (existentes.has(`${base}-${sufijo}`)) sufijo += 1;
  return `${base}-${sufijo}`;
}

export async function crearSociedad(datos = {}) {
  const empresaId = String(datos.empresa_id || '').trim();
  const razonSocial = String(datos.razon_social || '').trim();
  const nombre = String(datos.nombre || datos.nombre_comercial || razonSocial).trim();
  const ruc = String(datos.ruc || '').trim();

  if (!empresaId) throw new Error('La sociedad requiere empresa_id.');
  if (!razonSocial) throw new Error('La razón social de la sociedad es obligatoria.');
  if (!nombre) throw new Error('El nombre de la sociedad es obligatorio.');
  if (!ruc) throw new Error('El RUC de la sociedad es obligatorio.');

  const supabase = await getSupabaseClient();
  const { data: existentes, error: codigosError } = await supabase
    .from('sociedades')
    .select('codigo')
    .eq('empresa_id', empresaId);
  if (codigosError) throw codigosError;

  const codigos = new Set((existentes || []).map(item => item.codigo).filter(Boolean));
  const base = generarCodigoSociedadBase(datos.codigo || razonSocial || nombre);
  let codigo = siguienteCodigoSociedad(base, codigos);

  for (let intento = 0; intento < 20; intento += 1) {
    const payload = {
      empresa_id: empresaId,
      codigo,
      nombre,
      razon_social: razonSocial,
      ruc,
      activa: datos.activa !== false,
      direccion_fiscal: datos.direccion_fiscal || null,
      logo_url: datos.logo_url || null,
      firma_url: datos.firma_url || null,
      regimen_laboral: datos.regimen_laboral || null,
      pct_quincena_1: datos.pct_quincena_1 == null || datos.pct_quincena_1 === ''
        ? null
        : Number(datos.pct_quincena_1),
      es_principal: Boolean(datos.es_principal),
    };

    const { data, error } = await supabase
      .from('sociedades')
      .insert(payload)
      .select('id, empresa_id, codigo, nombre, razon_social, ruc, activa, created_at, updated_at, direccion_fiscal, logo_url, firma_url, regimen_laboral, pct_quincena_1, es_principal')
      .single();

    if (!error) return data;
    const colisionCodigo = error.code === '23505'
      && /sociedades_empresa_codigo_key|empresa_id.*codigo/i.test(error.message || '');
    if (!colisionCodigo) throw error;

    codigos.add(codigo);
    codigo = siguienteCodigoSociedad(base, codigos);
  }

  throw new Error('No fue posible generar un código único para la sociedad.');
}

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
      .select('id, empresa_id, codigo, nombre, razon_social, ruc, direccion_fiscal, logo_url, firma_url, regimen_laboral, pct_quincena_1, activa, es_principal')
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
