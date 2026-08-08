import type { SupabaseClient } from "@supabase/supabase-js";

type AssignmentScopeRow = {
  alcance_tipo?: string | null;
  sociedades_ids?: string[] | null;
};

export type GrantedSocietyScope = {
  provided: boolean;
  alcanceTipo: "grupo" | null;
  sociedadesIds: string[] | null;
};

const uniqueIds = (value: unknown) => [
  ...new Set(
    (Array.isArray(value) ? value : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  ),
];

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

export const resolveEffectiveSocietyScope = (assignments: AssignmentScopeRow[] = []) => {
  const groupAssignments = assignments.filter((row) => row.alcance_tipo === "grupo");
  if (groupAssignments.length) {
    if (groupAssignments.some((row) => row.sociedades_ids == null)) return null;
    return uniqueIds(groupAssignments.flatMap((row) => row.sociedades_ids || []));
  }

  const societyAssignments = assignments.filter((row) => row.alcance_tipo === "sociedad");
  if (societyAssignments.length) {
    return uniqueIds(societyAssignments.flatMap((row) => row.sociedades_ids || []));
  }

  // Tipos historicos tenant/area/etc. conservan acceso irrestricto.
  return null;
};

const loadCallerScope = async (
  adminClient: SupabaseClient,
  empresaId: string,
  callerId: string,
) => {
  const { data, error } = await adminClient
    .from("usuarios_asignaciones")
    .select("alcance_tipo, sociedades_ids")
    .eq("empresa_id", empresaId)
    .eq("user_id", callerId)
    .eq("activo", true);
  if (error) throw error;
  return resolveEffectiveSocietyScope((data || []) as AssignmentScopeRow[]);
};

export const normalizeGrantedSocietyScope = async ({
  adminClient,
  payload,
  empresaId,
  callerId,
  callerIsPlatformSuperadmin,
  multisociedadHabilitado,
  defaultToAllWhenMissing,
}: {
  adminClient: SupabaseClient;
  payload: Record<string, unknown>;
  empresaId: string;
  callerId: string;
  callerIsPlatformSuperadmin: boolean;
  multisociedadHabilitado: boolean;
  defaultToAllWhenMissing: boolean;
}): Promise<GrantedSocietyScope> => {
  if (!multisociedadHabilitado) {
    return { provided: false, alcanceTipo: null, sociedadesIds: null };
  }

  const scopeProvided = hasOwn(payload, "alcance_tipo") || hasOwn(payload, "sociedades_ids");
  if (!scopeProvided && !defaultToAllWhenMissing) {
    // Compatibilidad con clientes antiguos: una edicion sin campos de alcance
    // preserva la asignacion principal existente.
    return { provided: false, alcanceTipo: null, sociedadesIds: null };
  }

  const alcanceTipo = scopeProvided ? String(payload.alcance_tipo || "grupo").trim() : "grupo";
  if (alcanceTipo !== "grupo") {
    throw new Error("El alcance societario configurable debe guardarse como grupo.");
  }

  let requestedIds = payload.sociedades_ids == null ? null : uniqueIds(payload.sociedades_ids);

  if (requestedIds !== null && requestedIds.length === 0) {
    throw new Error("El alcance de sociedades especificas requiere al menos una sociedad.");
  }

  if (requestedIds?.length) {
    const { data: societyRows, error: societyError } = await adminClient
      .from("sociedades")
      .select("id, nombre")
      .eq("empresa_id", empresaId)
      .in("id", requestedIds);
    if (societyError) throw societyError;

    const validIds = new Set((societyRows || []).map((row) => String(row.id)));
    const invalidIds = requestedIds.filter((id) => !validIds.has(id));
    if (invalidIds.length) {
      throw new Error(`Las sociedades ${invalidIds.join(", ")} no pertenecen al tenant.`);
    }
  }

  if (!callerIsPlatformSuperadmin) {
    const callerScope = await loadCallerScope(adminClient, empresaId, callerId);
    if (callerScope !== null) {
      if (requestedIds === null) {
        if (!callerScope.length) {
          throw new Error("No puedes conceder acceso societario porque tu alcance no contiene sociedades.");
        }
        // Para un administrador restringido, "todas" significa todas las que
        // puede administrar y siempre se persiste como lista explicita.
        requestedIds = callerScope;
      }

      const callerIds = new Set(callerScope);
      const outsideIds = requestedIds.filter((id) => !callerIds.has(id));
      if (outsideIds.length) {
        const { data: outsideRows } = await adminClient
          .from("sociedades")
          .select("id, nombre")
          .eq("empresa_id", empresaId)
          .in("id", outsideIds);
        const namesById = new Map((outsideRows || []).map((row) => [String(row.id), String(row.nombre || row.id)]));
        const labels = outsideIds.map((id) => namesById.get(id) || id);
        throw new Error(`No puedes conceder sociedades fuera de tu alcance: ${labels.join(", ")}.`);
      }
    }
  }

  return {
    provided: true,
    alcanceTipo: "grupo",
    sociedadesIds: requestedIds,
  };
};
