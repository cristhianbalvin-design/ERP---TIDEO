export const isPlatformRole = role => Boolean(role?.permisos?.plataforma);

export const canSeeEverything = role => Boolean(role?.permisos?.todo);

export const canViewScreen = (role, screenKey) => {
  if (!screenKey) return false;
  if (canSeeEverything(role)) return true;
  return Boolean(role?.permisos?.ver?.includes(screenKey));
};

export const canUseSpecialPermission = (role, permissionKey) => {
  if (!permissionKey) return false;
  if (canSeeEverything(role)) return true;
  return Boolean(role?.permisos?.[permissionKey]);
};

export const filterVisibleScreens = (items = [], role) => {
  if (canSeeEverything(role)) return items;
  return items.filter(item => canViewScreen(role, item.key));
};

export const requirePermission = (role, screenKey) => {
  if (!canViewScreen(role, screenKey)) {
    throw new Error(`No tienes permiso para ver ${screenKey}.`);
  }
  return true;
};
