import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();
const PLATFORM_SUPERADMIN_EMAIL = "cristhianbalvin@gmail.com";

const isMissingTable = (error: unknown) => {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || "").toLowerCase();
  return err?.code === "42P01" || err?.code === "PGRST205" || message.includes("could not find the table");
};

const fetchPlatformAdminFlag = async (
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  email: string | undefined | null,
) => {
  if (normalizeEmail(email) !== PLATFORM_SUPERADMIN_EMAIL) return false;
  const { data, error } = await adminClient
    .from("platform_admins")
    .select("user_id, nivel, estado")
    .eq("user_id", userId)
    .eq("nivel", "superadmin")
    .eq("estado", "activo")
    .maybeSingle();
  if (error && isMissingTable(error)) return false;
  if (error) throw error;
  return Boolean(data?.user_id);
};

const upsertGlobalProfile = async (
  adminClient: ReturnType<typeof createClient>,
  profile: {
    user_id: string;
    email: string;
    nombre: string;
    estado_global: string;
  },
) => {
  const { error } = await adminClient
    .from("profiles")
    .upsert([{
      user_id: profile.user_id,
      email: profile.email,
      nombre: profile.nombre,
      estado_global: profile.estado_global,
    }], { onConflict: "user_id" });
  if (error && isMissingTable(error)) return;
  if (error) throw error;
};

const estadoToMembership = (estado: string) => {
  const value = estado.trim().toLowerCase();
  if (value === "activo" || value === "activa") return "activo";
  if (value === "invitado" || value === "invitada") return "invitado";
  if (value === "suspendido" || value === "suspendida") return "suspendido";
  if (value === "inactivo" || value === "inactiva") return "inactivo";
  return "activo";
};

const estadoToProfile = (estado: string) => {
  const value = estadoToMembership(estado);
  const labels: Record<string, string> = {
    activo: "Activo",
    invitado: "Invitado",
    suspendido: "Suspendido",
    inactivo: "Inactivo",
  };
  return labels[value] || "Activo";
};

const allowedCampoModulos = new Set(["tecnico", "logistica", "vendedor", "compras", "supervisor", "gerencia", "asistencia", "administrativo", "mi_espacio", "empleado"]);
const legacyPerfilToModulo = (perfil: string | null) => {
  const value = String(perfil || "").toLowerCase();
  if (value.includes("vendedor")) return "vendedor";
  if (value.includes("compra")) return "compras";
  if (value.includes("supervisor")) return "supervisor";
  if (value.includes("gerencia")) return "gerencia";
  if (value.includes("logistica")) return "logistica";
  if (value.includes("asistencia")) return "asistencia";
  if (value.includes("admin")) return "administrativo";
  return "tecnico";
};
const moduloToPerfil = (modulo: string | null) => {
  const map: Record<string, string> = {
    tecnico: "Tecnico",
    logistica: "Logistica",
    vendedor: "Vendedor",
    compras: "Compras",
    supervisor: "Supervisor",
    gerencia: "Gerencia",
    asistencia: "Asistencia",
    administrativo: "Administrativo",
    mi_espacio: "Mi espacio",
    empleado: "Empleado",
  };
  return modulo ? (map[modulo] || "Tecnico") : null;
};

const allowedScopes = new Set(["tenant", "area", "equipo", "sede", "proyecto", "centro_costo", "custom"]);

const normalizeAssignments = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      rol_id: String(item?.rol_id || item?.rol || "").trim(),
      jefe_user_id: String(item?.jefe_user_id || "").trim() || null,
      alcance_tipo: allowedScopes.has(String(item?.alcance_tipo || "").trim())
        ? String(item?.alcance_tipo || "").trim()
        : "tenant",
      alcance_id: String(item?.alcance_id || "").trim() || null,
    }))
    .filter((item) => item.rol_id);

const saveFunctionalAssignments = async (
  adminClient: ReturnType<typeof createClient>,
  params: {
    empresaId: string;
    userId: string;
    principalRole: Record<string, unknown>;
    jefeUserId: string | null;
    extras: unknown;
  },
) => {
  const now = new Date().toISOString();
  const baseRow = {
    empresa_id: params.empresaId,
    user_id: params.userId,
    rol_id: String(params.principalRole.id),
    categoria: String(params.principalRole.categoria || "otro"),
    nivel_jerarquico: String(params.principalRole.nivel_jerarquico || "operativo"),
    jefe_user_id: params.jefeUserId,
    alcance_tipo: "tenant",
    alcance_id: null,
    principal: true,
    activo: true,
    fecha_fin: null,
    updated_at: now,
  };

  const { data: existingPrincipal, error: principalLookupError } = await adminClient
    .from("usuarios_asignaciones")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("user_id", params.userId)
    .eq("principal", true)
    .maybeSingle();
  if (principalLookupError && principalLookupError.code === "42P01") return [];
  if (principalLookupError) throw principalLookupError;

  if (existingPrincipal?.id) {
    const { error } = await adminClient.from("usuarios_asignaciones").update(baseRow).eq("id", existingPrincipal.id);
    if (error) throw error;
  } else {
    const { error } = await adminClient.from("usuarios_asignaciones").insert([baseRow]);
    if (error) throw error;
  }

  const { error: deactivateError } = await adminClient
    .from("usuarios_asignaciones")
    .update({ activo: false, fecha_fin: now.slice(0, 10), updated_at: now })
    .eq("empresa_id", params.empresaId)
    .eq("user_id", params.userId)
    .eq("principal", false)
    .eq("activo", true);
  if (deactivateError) throw deactivateError;

  const extras = normalizeAssignments(params.extras);
  const jefeIds = [...new Set(extras.map((item) => item.jefe_user_id).filter(Boolean) as string[])];
  if (jefeIds.includes(params.userId)) throw new Error("Un usuario no puede ser su propio jefe funcional.");
  if (jefeIds.length) {
    const { data: jefeRows, error: jefeRowsError } = await adminClient
      .from("usuarios_empresas")
      .select("user_id")
      .eq("empresa_id", params.empresaId)
      .eq("estado", "activo")
      .in("user_id", jefeIds);
    if (jefeRowsError) throw jefeRowsError;
    const found = new Set((jefeRows || []).map((row) => row.user_id));
    if (jefeIds.some((id) => !found.has(id))) {
      throw new Error("Todo jefe funcional debe pertenecer al mismo tenant y estar activo.");
    }
  }
  const extraRoleIds = [...new Set(extras.map((item) => item.rol_id))];
  let rolesById = new Map<string, Record<string, unknown>>();
  if (extraRoleIds.length) {
    const { data: extraRoles, error: extraRolesError } = await adminClient
      .from("roles")
      .select("id, nombre, categoria, nivel_jerarquico, empresa_id, es_superadmin")
      .in("id", extraRoleIds)
      .eq("activo", true);
    if (extraRolesError) throw extraRolesError;
    rolesById = new Map((extraRoles || []).map((role) => [role.id, role]));
  }

  const rows: Record<string, unknown>[] = [];
  for (const item of extras) {
    const role = rolesById.get(item.rol_id);
    if (!role) continue;
    if (role.empresa_id !== params.empresaId || role.es_superadmin === true) continue;
    if (item.jefe_user_id === params.userId) continue;
    rows.push({
      empresa_id: params.empresaId,
      user_id: params.userId,
      rol_id: item.rol_id,
      categoria: String(role.categoria || "otro"),
      nivel_jerarquico: String(role.nivel_jerarquico || "operativo"),
      jefe_user_id: item.jefe_user_id,
      alcance_tipo: item.alcance_tipo,
      alcance_id: item.alcance_tipo === "tenant" ? null : item.alcance_id,
      principal: false,
      activo: true,
    });
  }

  if (rows.length) {
    const { error } = await adminClient.from("usuarios_asignaciones").insert(rows);
    if (error) throw error;
  }

  const { data: saved, error: savedError } = await adminClient
    .from("usuarios_asignaciones")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("user_id", params.userId)
    .eq("activo", true)
    .order("principal", { ascending: false });
  if (savedError) throw savedError;
  return saved || [];
};

const syncAsistenciaMovilFlag = async (
  adminClient: ReturnType<typeof createClient>,
  params: {
    empresaId: string;
    email: string;
    habilitar: boolean;
  },
) => {
  const normalizedEmail = normalizeEmail(params.email);
  if (!params.empresaId || !normalizedEmail) return;

  const updateTable = async (table: "personal_operativo" | "personal_administrativo") => {
    const { data: rows, error: lookupError } = await adminClient
      .from(table)
      .select("id, turno_id")
      .eq("empresa_id", params.empresaId)
      .ilike("email", normalizedEmail);
    if (lookupError) throw lookupError;
    if (!rows?.length) return;

    const now = new Date().toISOString();
    const trueIds = params.habilitar ? rows.filter((row) => Boolean(row.turno_id)).map((row) => row.id) : [];
    const falseIds = params.habilitar
      ? rows.filter((row) => !row.turno_id).map((row) => row.id)
      : rows.map((row) => row.id);

    if (trueIds.length) {
      const { error } = await adminClient
        .from(table)
        .update({ acceso_asistencia_movil: true, updated_at: now })
        .in("id", trueIds);
      if (error) throw error;
    }
    if (falseIds.length) {
      const { error } = await adminClient
        .from(table)
        .update({ acceso_asistencia_movil: false, updated_at: now })
        .in("id", falseIds);
      if (error) throw error;
    }
  };

  await updateTable("personal_operativo");
  await updateTable("personal_administrativo");
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

  const { data: callerData, error: callerError } = await userClient.auth.getUser();
  const caller = callerData?.user;
  if (callerError || !caller) return jsonResponse({ success: false, error: "Sesion invalida o expirada." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Solicitud invalida." }, 400);
  }

  const userId = String(payload.user_id || "").trim();
  const empresaId = String(payload.empresa_id || "").trim();
  const nombre = String(payload.nombre || "").trim();
  const email = normalizeEmail(payload.email);
  const rolId = String(payload.rol || "").trim();
  const jefeUserIdRaw = String(payload.jefe_user_id || "").trim();
  const jefeUserId = jefeUserIdRaw || null;
  const asignacionesPayload = payload.asignaciones || [];
  const accesoCampo = Boolean(payload.acceso_campo);
  const campoModulos = accesoCampo
    ? [...new Set((Array.isArray(payload.campo_modulos) ? payload.campo_modulos : [legacyPerfilToModulo(String(payload.perfil_campo || "Tecnico"))])
      .map((m) => String(m || "").trim().toLowerCase())
      .filter((m) => allowedCampoModulos.has(m)))]
    : [];
  const perfilCampo = accesoCampo ? moduloToPerfil(campoModulos[0] || legacyPerfilToModulo(String(payload.perfil_campo || "Tecnico"))) : null;
  const estadoPerfil = estadoToProfile(String(payload.estado || "Activo"));
  const estadoMembership = estadoToMembership(estadoPerfil);

  if (!userId || !empresaId || !nombre || !email || !rolId) {
    return jsonResponse({ success: false, error: "Usuario, empresa, nombre, email y rol son obligatorios." }, 400);
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, estado, roles!inner(id, empresa_id, es_admin_empresa, es_superadmin)")
    .eq("user_id", caller.id)
    .eq("estado", "activo");

  if (membershipError) return jsonResponse({ success: false, error: membershipError.message }, 500);

  const callerEmpresaIds = [...new Set((memberships || []).map((m) => m.empresa_id).filter(Boolean))];
  const { data: callerEmpresasRows } = callerEmpresaIds.length
    ? await adminClient.from("empresas").select("id, es_plataforma").in("id", callerEmpresaIds)
    : { data: [] as { id: string; es_plataforma: boolean }[] };
  const callerEmpresasById = new Map((callerEmpresasRows || []).map((e) => [e.id, e]));

  const { data: targetEmpresa, error: targetEmpresaError } = await adminClient
    .from("empresas")
    .select("id, es_plataforma")
    .eq("id", empresaId)
    .maybeSingle();
  if (targetEmpresaError) return jsonResponse({ success: false, error: targetEmpresaError.message }, 500);
  if (!targetEmpresa?.id) return jsonResponse({ success: false, error: "El tenant seleccionado no existe." }, 400);

  if (email === PLATFORM_SUPERADMIN_EMAIL && !targetEmpresa.es_plataforma) {
    return jsonResponse({ success: false, error: "El Superadmin TIDEO solo puede pertenecer al tenant plataforma." }, 403);
  }

  let callerIsPlatformAdmin = false;
  try {
    callerIsPlatformAdmin = await fetchPlatformAdminFlag(adminClient, caller.id, caller.email);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo validar el administrador de plataforma." }, 500);
  }

  const callerHasPlatformSuperadminMembership = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    const empresa = callerEmpresasById.get(membership.empresa_id);
    return role?.es_superadmin && empresa?.es_plataforma && normalizeEmail(caller.email) === PLATFORM_SUPERADMIN_EMAIL;
  });
  const callerIsPlatformSuperadmin = callerIsPlatformAdmin || callerHasPlatformSuperadminMembership;

  const canManage = callerIsPlatformSuperadmin || (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return membership.empresa_id === empresaId && role?.es_admin_empresa;
  });

  if (!canManage) {
    return jsonResponse({ success: false, error: "No tienes permiso para editar usuarios en este tenant." }, 403);
  }

  const { data: currentMembership, error: currentMembershipError } = await adminClient
    .from("usuarios_empresas")
    .select("user_id, empresa_id, rol_id, estado")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (currentMembershipError) return jsonResponse({ success: false, error: currentMembershipError.message }, 500);

  const { data: roleRow, error: roleError } = await adminClient
    .from("roles")
    .select("id, empresa_id, es_superadmin, categoria, nivel_jerarquico, activo")
    .eq("id", rolId)
    .maybeSingle();

  if (roleError) return jsonResponse({ success: false, error: roleError.message }, 500);
  if (!roleRow?.id || !roleRow.activo) return jsonResponse({ success: false, error: "El rol seleccionado no existe o esta inactivo." }, 400);
  if (roleRow.empresa_id !== empresaId) {
    return jsonResponse({ success: false, error: "El rol seleccionado no pertenece a este tenant." }, 400);
  }
  if (roleRow.es_superadmin && !(callerIsPlatformSuperadmin && targetEmpresa.es_plataforma && email === PLATFORM_SUPERADMIN_EMAIL)) {
    return jsonResponse({ success: false, error: "El rol Superadmin TIDEO solo corresponde al usuario de plataforma autorizado." }, 403);
  }

  if (jefeUserId === userId) {
    return jsonResponse({ success: false, error: "Un usuario no puede ser su propio jefe directo." }, 400);
  }

  if (jefeUserId) {
    const { data: jefeMembership, error: jefeError } = await adminClient
      .from("usuarios_empresas")
      .select("user_id, empresa_id, estado")
      .eq("user_id", jefeUserId)
      .eq("empresa_id", empresaId)
      .eq("estado", "activo")
      .maybeSingle();
    if (jefeError) return jsonResponse({ success: false, error: jefeError.message }, 500);
    if (!jefeMembership) return jsonResponse({ success: false, error: "El jefe directo debe pertenecer al mismo tenant y estar activo." }, 400);
  }

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    user_metadata: { nombre },
  });
  if (authUpdateError) return jsonResponse({ success: false, error: authUpdateError.message }, 400);

  try {
    await upsertGlobalProfile(adminClient, {
      user_id: userId,
      email,
      nombre,
      estado_global: estadoMembership === "suspendido" || estadoMembership === "inactivo" ? estadoMembership : "activo",
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo guardar el perfil global." }, 500);
  }

  const { error: membershipUpdateError } = await adminClient
    .from("usuarios_empresas")
    .upsert([{
      user_id: userId,
      empresa_id: empresaId,
      rol_id: rolId,
      jefe_user_id: jefeUserId,
      acceso_campo: accesoCampo,
      perfil_campo: perfilCampo,
      campo_modulos: campoModulos,
      estado: estadoMembership,
      updated_at: new Date().toISOString(),
    }], { onConflict: "user_id,empresa_id" });

  if (membershipUpdateError) return jsonResponse({ success: false, error: membershipUpdateError.message }, 500);

  const profile = {
    id: userId,
    empresa_id: empresaId,
    nombre,
    email,
    rol: rolId,
    campo: accesoCampo,
    campo_perfil: perfilCampo,
    estado: estadoPerfil,
    updated_at: new Date().toISOString(),
  };

  const { data: existingLegacyProfile, error: existingLegacyProfileError } = await adminClient
    .from("usuarios")
    .select("id, empresa_id")
    .eq("id", userId)
    .maybeSingle();
  if (existingLegacyProfileError) return jsonResponse({ success: false, error: existingLegacyProfileError.message }, 500);

  let savedUser: Record<string, unknown> | null = profile;
  if (!existingLegacyProfile || existingLegacyProfile.empresa_id === empresaId) {
    const { data, error: saveError } = await adminClient
      .from("usuarios")
      .upsert([profile], { onConflict: "id" })
      .select()
      .single();

    if (saveError) return jsonResponse({ success: false, error: saveError.message }, 500);
    savedUser = data || profile;
  } else {
    const { error: updateLegacyError } = await adminClient
      .from("usuarios")
      .update({ nombre, email, estado: estadoPerfil, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateLegacyError) return jsonResponse({ success: false, error: updateLegacyError.message }, 500);
    savedUser = profile;
  }

  let asignaciones: Record<string, unknown>[] = [];
  try {
    asignaciones = await saveFunctionalAssignments(adminClient, {
      empresaId,
      userId,
      principalRole: roleRow,
      jefeUserId,
      extras: asignacionesPayload,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudieron guardar las asignaciones funcionales." }, 500);
  }

  try {
    await syncAsistenciaMovilFlag(adminClient, {
      empresaId,
      email,
      habilitar: accesoCampo && campoModulos.includes("asistencia"),
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo sincronizar el acceso de asistencia movil." }, 500);
  }

  return jsonResponse({
    success: true,
    user: {
      ...(savedUser || profile),
      campoPerfil: perfilCampo,
      campoModulos,
      jefe_user_id: jefeUserId,
      asignaciones,
    },
  });
});
