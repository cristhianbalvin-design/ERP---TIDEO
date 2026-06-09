export const normalizarClaveComision = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

export const normalizarEmailComision = value => String(value || '').trim().toLowerCase();

const mismoId = (a, b) => {
  const va = String(a || '').trim();
  const vb = String(b || '').trim();
  return Boolean(va && vb && va === vb);
};

const mismoTexto = (a, b) => {
  const va = normalizarClaveComision(a);
  const vb = normalizarClaveComision(b);
  return Boolean(va && vb && va === vb);
};

const mismoEmail = (a, b) => {
  const va = normalizarEmailComision(a);
  const vb = normalizarEmailComision(b);
  return Boolean(va && vb && va === vb);
};

export function resolverUsuarioComision({ oportunidad = {}, usuarios = [], authUser = null, usarAuthComoFallback = false } = {}) {
  const responsableId = oportunidad?.responsable_id || oportunidad?.vendedor_id;
  const responsableNombre = oportunidad?.responsable || oportunidad?.vendedor || oportunidad?.asignado_a;
  const authEmail = authUser?.email;

  return (usuarios || []).find(u =>
    mismoId(u.id, responsableId) ||
    mismoId(u.auth_user_id, responsableId) ||
    mismoTexto(u.nombre, responsableNombre) ||
    mismoEmail(u.email, responsableNombre)
  ) || (usarAuthComoFallback && authUser ? {
    id: authUser.id,
    auth_user_id: authUser.id,
    email: authEmail,
    nombre: authUser.user_metadata?.nombre || authUser.user_metadata?.full_name || authEmail,
  } : null);
}

export function resolverVendedorComision({
  oportunidad = {},
  usuarios = [],
  personalAdmin = [],
  authUser = null,
  usuarioActual = null,
  usarAuthComoFallback = false,
} = {}) {
  const responsableId = oportunidad?.responsable_id || oportunidad?.vendedor_id;
  const responsableNombre = oportunidad?.responsable || oportunidad?.vendedor || oportunidad?.asignado_a;
  const usuario = resolverUsuarioComision({ oportunidad, usuarios, authUser, usarAuthComoFallback });
  const authEmail = authUser?.email || usuarioActual?.email;
  const authNombre = usuarioActual?.nombre || authUser?.user_metadata?.nombre || authUser?.user_metadata?.full_name;

  return (personalAdmin || []).find(p =>
    mismoId(p.id, responsableId) ||
    mismoId(p.auth_user_id, responsableId) ||
    (usuario?.auth_user_id && mismoId(p.auth_user_id, usuario.auth_user_id)) ||
    (usuario?.id && mismoId(p.auth_user_id, usuario.id)) ||
    (usuario?.email && mismoEmail(p.email, usuario.email)) ||
    mismoTexto(p.nombre, responsableNombre) ||
    mismoTexto(p.nombre_completo, responsableNombre) ||
    mismoEmail(p.email, responsableNombre) ||
    (usarAuthComoFallback && (
      mismoId(p.auth_user_id, authUser?.id) ||
      mismoEmail(p.email, authEmail) ||
      mismoTexto(p.nombre, authNombre) ||
      mismoTexto(p.nombre_completo, authNombre)
    ))
  ) || null;
}

export function porcentajeBaseComision(vendedor) {
  return vendedor?.porcentaje_comision !== null && vendedor?.porcentaje_comision !== undefined
    ? Number(vendedor.porcentaje_comision)
    : null;
}
