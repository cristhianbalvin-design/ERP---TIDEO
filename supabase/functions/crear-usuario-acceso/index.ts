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

const normalizeEmail = (email: unknown) =>
  String(email || "").trim().toLowerCase();
const PLATFORM_SUPERADMIN_EMAIL = "cristhianbalvin@gmail.com";

const isMissingTable = (error: unknown) => {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || "").toLowerCase();
  return err?.code === "42P01" || err?.code === "PGRST205" || message.includes("could not find the table");
};

const getAuthUserById = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user || null;
};

const findAuthUserByEmail = async (adminClient: ReturnType<typeof createClient>, email: string) => {
  const { data: profileMatch, error: profileMatchError } = await adminClient
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (profileMatchError && !isMissingTable(profileMatchError)) throw profileMatchError;
  if (profileMatch?.user_id) {
    const user = await getAuthUserById(adminClient, String(profileMatch.user_id));
    if (user) return user;
  }

  const { data: legacyMatches, error: legacyMatchError } = await adminClient
    .from("usuarios")
    .select("id")
    .ilike("email", email)
    .limit(1);
  if (legacyMatchError) throw legacyMatchError;
  const legacyMatch = legacyMatches?.[0];
  if (legacyMatch?.id) {
    const user = await getAuthUserById(adminClient, String(legacyMatch.id));
    if (user) return user;
  }

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = (data?.users || []).find((user) => normalizeEmail(user.email) === email);
    if (found) return found;
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return null;
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

const fetchGlobalProfile = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data, error } = await adminClient
    .from("profiles")
    .select("user_id, email, nombre, must_change_password")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && isMissingTable(error)) return null;
  if (error) throw error;
  return data || null;
};

const upsertGlobalProfile = async (
  adminClient: ReturnType<typeof createClient>,
  profile: {
    user_id: string;
    email: string;
    nombre: string;
    must_change_password: boolean;
  },
) => {
  const { error } = await adminClient
    .from("profiles")
    .upsert([{
      user_id: profile.user_id,
      email: profile.email,
      nombre: profile.nombre,
      estado_global: "activo",
      must_change_password: profile.must_change_password,
    }], { onConflict: "user_id" });
  if (error && isMissingTable(error)) return;
  if (error) throw error;
};

const normalizeAssignments = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      rol_id: String(item?.rol_id || item?.rol || "").trim(),
      posicion_id: String(item?.posicion_id || "").trim(),
    }))
    .filter((item) => item.rol_id && item.posicion_id);

const saveFunctionalAssignments = async (
  adminClient: ReturnType<typeof createClient>,
  params: {
    empresaId: string;
    userId: string;
    principalRole: Record<string, unknown>;
    jefeUserId: string | null;
    posicionId: string | null;
    extras: unknown;
  },
) => {
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
    updated_at: new Date().toISOString(),
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

  if (params.posicionId) {
    // El jefe_user_id se deriva server-side dentro del RPC a partir de reporta_a_posicion_id;
    // el detach+asignacion de posiciones_usuarios ocurre en la misma transaccion para no dejar
    // ventanas de inconsistencia frente al trigger legado de sincronizacion.
    const { error: posicionRpcError } = await adminClient.rpc("posicion_guardar_asignacion_principal", {
      p_asignacion_id: existingPrincipal?.id || null,
      p_empresa_id: params.empresaId,
      p_user_id: params.userId,
      p_rol_id: baseRow.rol_id,
      p_categoria: baseRow.categoria,
      p_nivel_jerarquico: baseRow.nivel_jerarquico,
      p_posicion_id: params.posicionId,
    });
    if (posicionRpcError) throw posicionRpcError;
  } else if (existingPrincipal?.id) {
    const { error } = await adminClient
      .from("usuarios_asignaciones")
      .update(baseRow)
      .eq("id", existingPrincipal.id);
    if (error) throw error;
  } else {
    const { error } = await adminClient
      .from("usuarios_asignaciones")
      .insert([baseRow]);
    if (error) throw error;
  }

  // La desactivacion de las asignaciones no-principales viejas ahora ocurre DENTRO de
  // posicion_guardar_asignaciones_extra (abajo), con un detach previo de la posicion vinculada
  // para que el trigger legado no la cierre por accidente. Hacerlo aca (antes, sin detach)
  // volvia a introducir exactamente el ruido historico que ese RPC esta disenado para evitar.
  const extras = normalizeAssignments(params.extras);
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

  const extraPosicionIds = [...new Set(extras.map((item) => item.posicion_id))];
  let posicionesValidas = new Set<string>();
  if (extraPosicionIds.length) {
    const { data: posicionesRows, error: posicionesError } = await adminClient
      .from("posiciones")
      .select("id, empresa_id")
      .in("id", extraPosicionIds);
    if (posicionesError) throw posicionesError;
    posicionesValidas = new Set((posicionesRows || []).filter((p) => p.empresa_id === params.empresaId).map((p) => p.id));
  }

  const extrasPayload = extras
    .map((item) => {
      const role = rolesById.get(item.rol_id);
      if (!role || role.empresa_id !== params.empresaId || role.es_superadmin === true) return null;
      if (!posicionesValidas.has(item.posicion_id)) return null;
      return {
        rol_id: item.rol_id,
        categoria: String(role.categoria || "otro"),
        nivel_jerarquico: String(role.nivel_jerarquico || "operativo"),
        posicion_id: item.posicion_id,
      };
    })
    .filter(Boolean);

  const { error: extrasRpcError } = await adminClient.rpc("posicion_guardar_asignaciones_extra", {
    p_empresa_id: params.empresaId,
    p_user_id: params.userId,
    p_extras: extrasPayload,
  });
  if (extrasRpcError) throw extrasRpcError;

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
  if (callerError || !caller) {
    return jsonResponse({ success: false, error: "Sesion invalida o expirada." }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Solicitud invalida." }, 400);
  }

  const nombre = String(payload.nombre || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const empresaId = String(payload.empresa_id || "").trim();
  const rolInput = String(payload.rol || "").trim();
  const jefeUserId = String(payload.jefe_user_id || "").trim() || null;
  const posicionId = String(payload.posicion_id || "").trim() || null;
  const asignacionesPayload = payload.asignaciones || [];

  if (!nombre || !email || !empresaId || !rolInput) {
    return jsonResponse({ success: false, error: "Nombre, email, empresa y rol son obligatorios." }, 400);
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, estado, roles!inner(id, empresa_id, es_admin_empresa, es_superadmin)")
    .eq("user_id", caller.id)
    .eq("estado", "activo");

  if (membershipError) {
    return jsonResponse({ success: false, error: membershipError.message }, 500);
  }

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
    return jsonResponse({ success: false, error: "No tienes permiso para crear usuarios en este tenant." }, 403);
  }

  // Resolver el rol por ID exacto dentro del tenant (no se aceptan roles de otros tenants)
  let { data: roleRow, error: roleError } = await adminClient
    .from("roles")
    .select("id, empresa_id, nombre, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa")
    .eq("id", rolInput)
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .maybeSingle();

  // Si no se encontro por ID exacto, buscar por nombre dentro del tenant
  if (!roleRow && !roleError) {
    const byName = await adminClient
      .from("roles")
      .select("id, empresa_id, nombre, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa")
      .eq("empresa_id", empresaId)
      .ilike("nombre", `%${rolInput}%`)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    roleRow = byName.data;
    roleError = byName.error;
  }

  if (roleError) return jsonResponse({ success: false, error: roleError.message }, 500);
  if (!roleRow?.id) return jsonResponse({ success: false, error: "El rol seleccionado no existe para este tenant." }, 400);

  if (roleRow.es_superadmin) {
    return jsonResponse({ success: false, error: "El rol Superadmin TIDEO no se asigna desde gestion de usuarios." }, 403);
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

  if (posicionId) {
    const { data: posicionRow, error: posicionError } = await adminClient
      .from("posiciones")
      .select("id")
      .eq("id", posicionId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (posicionError) return jsonResponse({ success: false, error: posicionError.message }, 500);
    if (!posicionRow?.id) return jsonResponse({ success: false, error: "La posicion seleccionada no existe para este tenant." }, 400);
  }

  let alreadyExists = false;
  let membershipOverwritten = false;
  let uid: string | null = null;

  let existingAuthUser;
  try {
    existingAuthUser = await findAuthUserByEmail(adminClient, email);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo validar si el usuario ya existe." }, 500);
  }

  if (existingAuthUser?.id) {
    alreadyExists = true;
    uid = existingAuthUser.id;
    const { error: reactivateError } = await adminClient.auth.admin.updateUserById(uid, {
      email_confirm: true,
      user_metadata: { ...(existingAuthUser.user_metadata || {}), nombre },
      ban_duration: "none",
    });
    if (reactivateError) return jsonResponse({ success: false, error: reactivateError.message }, 400);
  } else {
    if (!password) {
      return jsonResponse({ success: false, error: "La contrasena temporal es obligatoria solo para usuarios nuevos." }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ success: false, error: "La contrasena temporal debe tener al menos 6 caracteres." }, 400);
    }

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });

    if (createError) {
      const message = createError.message?.toLowerCase() || "";
      alreadyExists = message.includes("already") || message.includes("registered") || message.includes("exists");
      if (!alreadyExists) return jsonResponse({ success: false, error: createError.message }, 400);
      const racedExistingUser = await findAuthUserByEmail(adminClient, email);
      uid = racedExistingUser?.id || null;
      if (uid) {
        const { error: reactivateError } = await adminClient.auth.admin.updateUserById(uid, {
          email_confirm: true,
          user_metadata: { ...(racedExistingUser?.user_metadata || {}), nombre },
          ban_duration: "none",
        });
        if (reactivateError) return jsonResponse({ success: false, error: reactivateError.message }, 400);
      }
    } else {
      uid = createdUser.user?.id || null;
    }
  }

  if (!uid) return jsonResponse({ success: false, error: "No se pudo resolver el usuario Auth creado." }, 500);
  if (jefeUserId === uid) {
    return jsonResponse({ success: false, error: "Un usuario no puede ser su propio jefe directo." }, 400);
  }

  // Detectar si ya existe una membresía activa para este usuario en este tenant
  const { data: existingMembership } = await adminClient
    .from("usuarios_empresas")
    .select("rol_id, estado")
    .eq("user_id", uid)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (existingMembership?.estado === "activo") {
    membershipOverwritten = true;
  }

  const { error: linkError } = await adminClient
    .from("usuarios_empresas")
    .upsert([{
      user_id: uid,
      empresa_id: empresaId,
      rol_id: roleRow.id,
      jefe_user_id: jefeUserId,
      acceso_campo: false,
      perfil_campo: null,
      campo_modulos: [],
      estado: "activo",
    }], { onConflict: "user_id,empresa_id" });

  if (linkError) return jsonResponse({ success: false, error: linkError.message }, 500);

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from("usuarios")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (existingProfileError) return jsonResponse({ success: false, error: existingProfileError.message }, 500);

  let existingGlobalProfile: Record<string, unknown> | null = null;
  try {
    existingGlobalProfile = await fetchGlobalProfile(adminClient, uid);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo leer el perfil global." }, 500);
  }

  const mustChangePassword = alreadyExists
    ? Boolean(existingGlobalProfile?.must_change_password ?? existingProfile?.must_change_password)
    : true;

  try {
    await upsertGlobalProfile(adminClient, {
      user_id: uid,
      email,
      nombre,
      must_change_password: mustChangePassword,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo guardar el perfil global." }, 500);
  }

  const usuario = {
    id: uid,
    nombre,
    email,
    rol: roleRow.id,
    empresa_id: empresaId,
    estado: "Activo",
    must_change_password: mustChangePassword,
  };

  let savedUser: Record<string, unknown> | null = usuario;
  if (!alreadyExists || !existingProfile || existingProfile.empresa_id === empresaId) {
    const { data, error: saveError } = await adminClient
      .from("usuarios")
      .upsert([usuario])
      .select()
      .single();

    if (saveError) return jsonResponse({ success: false, error: saveError.message }, 500);
    savedUser = data || usuario;
  } else {
    const { error: profileUpdateError } = await adminClient
      .from("usuarios")
      .update({ nombre, email, updated_at: new Date().toISOString() })
      .eq("id", uid);

    if (profileUpdateError) return jsonResponse({ success: false, error: profileUpdateError.message }, 500);
    savedUser = {
      ...existingProfile,
      nombre,
      email,
      rol: roleRow.id,
      empresa_id: empresaId,
      estado: "Activo",
      must_change_password: mustChangePassword,
    };
  }

  let asignaciones: Record<string, unknown>[] = [];
  try {
    asignaciones = await saveFunctionalAssignments(adminClient, {
      empresaId,
      userId: uid,
      principalRole: roleRow,
      jefeUserId,
      posicionId,
      extras: asignacionesPayload,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudieron guardar las asignaciones funcionales." }, 500);
  }

  const principalAsignacion = asignaciones.find((a) => a.principal) || null;

  return jsonResponse({
    success: true,
    alreadyExists,
    membershipOverwritten,
    user: {
      ...(savedUser || usuario),
      rol_nombre: roleRow.nombre,
      rol_categoria: roleRow.categoria,
      nivel_jerarquico: roleRow.nivel_jerarquico,
      jefe_user_id: (principalAsignacion?.jefe_user_id as string | null | undefined) ?? jefeUserId,
      asignaciones,
    },
  });
});
