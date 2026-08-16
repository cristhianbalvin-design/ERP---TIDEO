import type { SupabaseClient } from "@supabase/supabase-js";

export type RolePermissionAction = "ver" | "crear" | "editar" | "anular";
export type UserPermissionAction = "ver" | "crear" | "editar" | "anular";

type PermissionResult = {
  allowed: boolean;
  error?: string;
};

const denied = (error: string): PermissionResult => ({ allowed: false, error });

export const assertRolePermission = async (
  userClient: SupabaseClient,
  empresaId: string,
  accion: RolePermissionAction,
): Promise<PermissionResult> => {
  const { data, error } = await userClient.rpc("actor_puede_gestionar_roles", {
    p_empresa_id: empresaId,
    p_accion: accion,
  });

  if (error || data !== true) {
    return denied("No tienes permiso para esta operacion de roles.");
  }

  return { allowed: true };
};

export const assertUserPermission = async (
  userClient: SupabaseClient,
  empresaId: string,
  accion: UserPermissionAction,
): Promise<PermissionResult> => {
  const { data, error } = await userClient.rpc("usuario_puede", {
    target_empresa_id: empresaId,
    target_pantalla: "usuarios",
    target_accion: accion,
  });

  if (error || data !== true) {
    return denied("No tienes permiso para esta operacion de usuarios.");
  }

  return { allowed: true };
};

export const assertRoleAssignment = async (
  userClient: SupabaseClient,
  empresaId: string,
  rolId: string,
  accionUsuario: Extract<UserPermissionAction, "crear" | "editar">,
): Promise<PermissionResult> => {
  const { data, error } = await userClient.rpc("actor_puede_asignar_rol", {
    p_empresa_id: empresaId,
    p_rol_id: rolId,
    p_accion_usuario: accionUsuario,
  });

  if (error || data !== true) {
    return denied("No tienes permiso para asignar este rol.");
  }

  return { allowed: true };
};

export const assertRoleIsNotProtected = async (
  userClient: SupabaseClient,
  rolId: string,
): Promise<PermissionResult> => {
  const { data, error } = await userClient.rpc("rol_es_protegido", {
    p_rol_id: rolId,
  });

  if (error) {
    return denied("No se pudo validar la proteccion del rol.");
  }

  if (data === true) {
    return denied("No puedes eliminar un rol protegido.");
  }

  return { allowed: true };
};
