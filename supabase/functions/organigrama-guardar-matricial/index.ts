import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertRoleAssignment } from "../_shared/rolePermissions.ts";
import { resolveEffectiveSocietyScope } from "../_shared/sociedadScope.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const getPersonLabel = async (adminClient: SupabaseClient, userId: string) => {
  const [{ data: profile }, { data: legacyUser }, { data: operativo }, { data: administrativo }] = await Promise.all([
    adminClient.from("profiles").select("nombre, email").eq("user_id", userId).maybeSingle(),
    adminClient.from("usuarios").select("nombre, email").eq("id", userId).maybeSingle(),
    adminClient.from("personal_operativo").select("nombre").eq("auth_user_id", userId).limit(1).maybeSingle(),
    adminClient.from("personal_administrativo").select("nombre").eq("auth_user_id", userId).limit(1).maybeSingle(),
  ]);
  return profile?.nombre || legacyUser?.nombre || operativo?.nombre || administrativo?.nombre || userId;
};

const assertOrganigramaPermission = async (userClient: SupabaseClient, empresaId: string) => {
  const { data, error } = await userClient.rpc("usuario_puede", {
    target_empresa_id: empresaId,
    target_pantalla: "organigrama",
    target_accion: "editar",
  });
  if (error || data !== true) {
    throw new RequestError("No tienes permiso para editar el organigrama.", 403);
  }
};

const assertSocietyScope = async ({
  adminClient,
  empresaId,
  actorId,
  posiciones,
}: {
  adminClient: SupabaseClient;
  empresaId: string;
  actorId: string;
  posiciones: Array<{ id: string; cargo_colocacion_id: string | null }>;
}) => {
  const { data: empresa, error: empresaError } = await adminClient
    .from("empresas")
    .select("multisociedad_habilitado")
    .eq("id", empresaId)
    .maybeSingle();
  if (empresaError) throw empresaError;
  if (!empresa?.multisociedad_habilitado) return;

  const { data: actorAssignments, error: scopeError } = await adminClient
    .from("usuarios_asignaciones")
    .select("alcance_tipo, sociedades_ids")
    .eq("empresa_id", empresaId)
    .eq("user_id", actorId)
    .eq("activo", true);
  if (scopeError) throw scopeError;

  const allowedSocietyIds = resolveEffectiveSocietyScope(actorAssignments || []);
  if (allowedSocietyIds === null) return;

  const colocacionIds = posiciones.map(posicion => posicion.cargo_colocacion_id).filter(Boolean) as string[];
  if (colocacionIds.length !== posiciones.length) {
    throw new RequestError(
      "No puedes crear una relación matricial: ambas posiciones deben pertenecer a una cargo-colocación con sociedad definida.",
      403,
    );
  }

  const { data: colocaciones, error: colocacionesError } = await adminClient
    .from("cargo_colocaciones")
    .select("id, sociedad_id")
    .eq("empresa_id", empresaId)
    .in("id", colocacionIds);
  if (colocacionesError) throw colocacionesError;

  const sociedadByColocacionId = new Map((colocaciones || []).map(colocacion => [colocacion.id, colocacion.sociedad_id]));
  const allowed = new Set(allowedSocietyIds);
  const fueraDeAlcance = posiciones.some(posicion => {
    const sociedadId = sociedadByColocacionId.get(posicion.cargo_colocacion_id || "");
    return !sociedadId || !allowed.has(sociedadId);
  });

  if (fueraDeAlcance) {
    throw new RequestError(
      "No puedes crear una relación matricial fuera de tu alcance societario.",
      403,
    );
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Metodo no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Faltan variables de Supabase en la Edge Function." }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: callerData, error: callerError } = await userClient.auth.getUser();
    const actor = callerData?.user;
    if (callerError || !actor) throw new RequestError("Sesion invalida o expirada.", 401);

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      throw new RequestError("Solicitud invalida.");
    }

    const empresaId = String(payload.empresa_id || "").trim();
    const origenPosicionId = String(payload.origen_posicion_id || "").trim();
    const destinoPosicionId = String(payload.destino_posicion_id || "").trim();
    const rolId = String(payload.rol_id || "").trim();
    if (!empresaId || !origenPosicionId || !destinoPosicionId || !rolId) {
      throw new RequestError("Empresa, posición origen, posición destino y rol son obligatorios.");
    }
    if (origenPosicionId === destinoPosicionId) {
      throw new RequestError("La posición origen y destino de una relación matricial deben ser distintas.");
    }

    await assertOrganigramaPermission(userClient, empresaId);

    const { data: posiciones, error: posicionesError } = await adminClient
      .from("posiciones")
      .select("id, empresa_id, activa, cargo_colocacion_id, origen_asignacion_id")
      .eq("empresa_id", empresaId)
      .in("id", [origenPosicionId, destinoPosicionId]);
    if (posicionesError) throw posicionesError;
    if ((posiciones || []).length !== 2) {
      throw new RequestError("La posición origen o destino no pertenece al tenant indicado.");
    }

    const posicionById = new Map((posiciones || []).map(posicion => [posicion.id, posicion]));
    const origen = posicionById.get(origenPosicionId);
    const destino = posicionById.get(destinoPosicionId);
    if (!origen?.activa || !destino?.activa) {
      throw new RequestError("La posición origen y la posición destino deben estar activas.");
    }

    const { data: ocupantesOrigen, error: ocupantesError } = await adminClient
      .from("posiciones_usuarios")
      .select("user_id")
      .eq("empresa_id", empresaId)
      .eq("posicion_id", origenPosicionId)
      .is("fecha_fin", null);
    if (ocupantesError) throw ocupantesError;
    if ((ocupantesOrigen || []).length !== 1) {
      throw new RequestError("La posición origen debe tener exactamente un ocupante activo para crear una relación matricial.");
    }
    const usuarioOrigenId = ocupantesOrigen![0].user_id;

    const { data: membership, error: membershipError } = await adminClient
      .from("usuarios_empresas")
      .select("user_id")
      .eq("empresa_id", empresaId)
      .eq("user_id", usuarioOrigenId)
      .eq("estado", "activo")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new RequestError("El ocupante de la posición origen no tiene una membresía activa en este tenant.");

    await assertSocietyScope({
      adminClient,
      empresaId,
      actorId: actor.id,
      posiciones: [origen, destino],
    });

    const { data: rol, error: rolError } = await adminClient
      .from("roles")
      .select("id, empresa_id, activo, es_superadmin, categoria, nivel_jerarquico")
      .eq("id", rolId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (rolError) throw rolError;
    if (!rol?.id || !rol.activo) {
      throw new RequestError("El rol seleccionado no existe, está inactivo o no pertenece a este tenant.");
    }
    if (rol.es_superadmin) {
      throw new RequestError("No se puede crear una asignación matricial con el rol Superadmin TIDEO.", 403);
    }
    const rolePermission = await assertRoleAssignment(userClient, empresaId, rol.id, "editar");
    if (!rolePermission.allowed) throw new RequestError(rolePermission.error || "No tienes permiso para asignar este rol.", 403);

    if (destino.origen_asignacion_id) {
      const { data: asignacionDestino, error: asignacionDestinoError } = await adminClient
        .from("usuarios_asignaciones")
        .select("id, user_id, principal, activo")
        .eq("id", destino.origen_asignacion_id)
        .maybeSingle();
      if (asignacionDestinoError) throw asignacionDestinoError;
      if (
        asignacionDestino?.activo
        && asignacionDestino.principal === false
        && asignacionDestino.user_id !== usuarioOrigenId
      ) {
        const ocupanteActual = await getPersonLabel(adminClient, asignacionDestino.user_id);
        throw new RequestError(
          `La posición destino ya tiene una asignación matricial activa de ${ocupanteActual}. No se sobrescribió.`,
          409,
        );
      }
    }

    const { data: extrasActuales, error: extrasError } = await adminClient
      .from("usuarios_asignaciones")
      .select("id, rol_id, categoria, nivel_jerarquico")
      .eq("empresa_id", empresaId)
      .eq("user_id", usuarioOrigenId)
      .eq("principal", false)
      .eq("activo", true);
    if (extrasError) throw extrasError;

    const extraIds = (extrasActuales || []).map(extra => extra.id);
    const { data: posicionesExtras, error: posicionesExtrasError } = extraIds.length
      ? await adminClient
        .from("posiciones")
        .select("id, origen_asignacion_id")
        .eq("empresa_id", empresaId)
        .in("origen_asignacion_id", extraIds)
      : { data: [], error: null };
    if (posicionesExtrasError) throw posicionesExtrasError;

    const posicionPorAsignacionId = new Map((posicionesExtras || []).map(posicion => [posicion.origen_asignacion_id, posicion.id]));
    const extrasPorPosicionId = new Map<string, { rol_id: string; categoria: string; nivel_jerarquico: string; posicion_id: string }>();
    for (const extra of extrasActuales || []) {
      const posicionId = posicionPorAsignacionId.get(extra.id);
      if (!posicionId) {
        throw new RequestError(
          "No se puede guardar la relación matricial porque existe una asignación matricial activa sin posición vinculada. Corrige ese dato antes de continuar.",
          409,
        );
      }
      extrasPorPosicionId.set(posicionId, {
        rol_id: extra.rol_id,
        categoria: extra.categoria || "otro",
        nivel_jerarquico: extra.nivel_jerarquico || "operativo",
        posicion_id: posicionId,
      });
    }

    extrasPorPosicionId.set(destinoPosicionId, {
      rol_id: rol.id,
      categoria: rol.categoria || "otro",
      nivel_jerarquico: rol.nivel_jerarquico || "operativo",
      posicion_id: destinoPosicionId,
    });

    const extrasParaGuardar = [...extrasPorPosicionId.values()];
    const { error: rpcError } = await adminClient.rpc("posicion_guardar_asignaciones_extra", {
      p_empresa_id: empresaId,
      p_user_id: usuarioOrigenId,
      p_extras: extrasParaGuardar,
    });
    if (rpcError) throw rpcError;

    const { data: extrasActualizados, error: extrasActualizadosError } = await adminClient
      .from("usuarios_asignaciones")
      .select("id, rol_id, categoria, nivel_jerarquico")
      .eq("empresa_id", empresaId)
      .eq("user_id", usuarioOrigenId)
      .eq("principal", false)
      .eq("activo", true);
    if (extrasActualizadosError) throw extrasActualizadosError;

    const idsActualizados = (extrasActualizados || []).map(extra => extra.id);
    const { data: posicionesActualizadas, error: posicionesActualizadasError } = idsActualizados.length
      ? await adminClient
        .from("posiciones")
        .select("id, origen_asignacion_id, cargo_colocacion_id")
        .eq("empresa_id", empresaId)
        .in("origen_asignacion_id", idsActualizados)
      : { data: [], error: null };
    if (posicionesActualizadasError) throw posicionesActualizadasError;

    const posicionActualizadaPorAsignacionId = new Map(
      (posicionesActualizadas || []).map(posicion => [posicion.origen_asignacion_id, posicion]),
    );
    const asignaciones = (extrasActualizados || []).map(extra => ({
      ...extra,
      posicion: posicionActualizadaPorAsignacionId.get(extra.id) || null,
    }));

    return jsonResponse({
      success: true,
      user_id: usuarioOrigenId,
      asignaciones_matriciales: asignaciones,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : "No se pudo guardar la asignación matricial.";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
