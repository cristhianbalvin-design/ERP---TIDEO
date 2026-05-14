export const ROLE_CATEGORIES = [
  { value: 'admin', label: 'Administracion del tenant' },
  { value: 'comercial', label: 'Comercial / Ventas' },
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'rrhh', label: 'RRHH' },
  { value: 'compras', label: 'Compras' },
  { value: 'logistica', label: 'Logistica' },
  { value: 'customer_success', label: 'Customer Success' },
  { value: 'otro', label: 'Otro' },
];

export const HIERARCHY_LEVELS = [
  { value: 'direccion', label: 'Direccion / gerencia' },
  { value: 'jefatura', label: 'Jefatura' },
  { value: 'supervisor', label: 'Supervisor / coordinador' },
  { value: 'asesor', label: 'Asesor / analista' },
  { value: 'operativo', label: 'Operativo' },
  { value: 'soporte', label: 'Soporte' },
];

const LEVEL_RANK = {
  direccion: 50,
  jefatura: 40,
  supervisor: 30,
  asesor: 20,
  operativo: 10,
  soporte: 10,
};

export function getRoleForUser(user, roles = {}) {
  return roles?.[user?.rol] || null;
}

export function getPrimaryAssignment(user) {
  const asignaciones = Array.isArray(user?.asignaciones) ? user.asignaciones : [];
  return asignaciones.find(a => a?.principal) || asignaciones[0] || null;
}

export function getUserCategory(user, roles = {}) {
  return getPrimaryAssignment(user)?.categoria || user?.rol_categoria || getRoleForUser(user, roles)?.categoria || 'otro';
}

export function getUserHierarchyLevel(user, roles = {}) {
  return getPrimaryAssignment(user)?.nivel_jerarquico || user?.nivel_jerarquico || getRoleForUser(user, roles)?.nivel_jerarquico || 'operativo';
}

export function isActiveUser(user) {
  return ['activo', 'activa'].includes(String(user?.estado || 'Activo').toLowerCase());
}

export function isTenantAdmin(user, roles = {}) {
  const role = getRoleForUser(user, roles);
  return Boolean(role?.es_superadmin || role?.es_admin_empresa || user?.es_superadmin || user?.es_admin_empresa);
}

export function hasTeamScope(user, roles = {}) {
  if (isTenantAdmin(user, roles)) return true;
  return ['direccion', 'jefatura', 'supervisor'].includes(getUserHierarchyLevel(user, roles));
}

export function hasTenantScope(user, roles = {}) {
  if (isTenantAdmin(user, roles)) return true;
  return getUserHierarchyLevel(user, roles) === 'direccion';
}

export function userMatchesCategory(user, categories = [], roles = {}) {
  if (!categories?.length) return true;
  const category = getUserCategory(user, roles);
  if (categories.includes(category)) return true;
  const asignaciones = Array.isArray(user?.asignaciones) ? user.asignaciones : [];
  if (asignaciones.some(a => a?.activo !== false && categories.includes(a?.categoria))) return true;
  if (categories.includes('admin') && isTenantAdmin(user, roles)) return true;
  return false;
}

export function getAssignableUsers({ users = [], roles = {}, categories = [], includeAdmins = true, empresaId = null }) {
  const allowed = includeAdmins ? [...new Set([...categories, 'admin'])] : categories;
  return users
    .filter(user => isActiveUser(user))
    .filter(user => !empresaId || !user.empresa_id || user.empresa_id === empresaId)
    .filter(user => userMatchesCategory(user, allowed, roles))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

export function getPotentialManagers({ users = [], roles = {}, empresaId = null, excludeUserId = null, category = null }) {
  return users
    .filter(user => isActiveUser(user))
    .filter(user => !empresaId || !user.empresa_id || user.empresa_id === empresaId)
    .filter(user => !excludeUserId || user.id !== excludeUserId)
    .filter(user => !category || getUserCategory(user, roles) === category || isTenantAdmin(user, roles))
    .filter(user => hasTeamScope(user, roles))
    .sort((a, b) => {
      const rankDiff = (LEVEL_RANK[getUserHierarchyLevel(b, roles)] || 0) - (LEVEL_RANK[getUserHierarchyLevel(a, roles)] || 0);
      if (rankDiff) return rankDiff;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
}

export function canUserSeeOwner({ viewer, ownerUserId, ownerName, users = [], roles = {} }) {
  if (!viewer) return true;
  if (hasTenantScope(viewer, roles)) return true;
  if (ownerUserId && ownerUserId === viewer.id) return true;
  if (!ownerUserId && ownerName && String(ownerName).trim() === String(viewer.nombre || '').trim()) return true;
  if (!hasTeamScope(viewer, roles)) return false;

  const byId = new Map(users.map(user => [user.id, user]));
  const owner = ownerUserId
    ? byId.get(ownerUserId)
    : users.find(user => String(user.nombre || '').trim() === String(ownerName || '').trim());
  const ownerAssignments = Array.isArray(owner?.asignaciones) ? owner.asignaciones : [];
  if (ownerAssignments.some(a => a?.jefe_user_id === viewer.id)) return true;
  let current = owner;
  while (current?.jefe_user_id) {
    if (current.jefe_user_id === viewer.id) return true;
    current = byId.get(current.jefe_user_id);
  }
  return false;
}
