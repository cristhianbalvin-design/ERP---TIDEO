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

const findAuthUserByEmail = async (adminClient: ReturnType<typeof createClient>, email: string) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = (data?.users || []).find((user) => normalizeEmail(user.email) === email);
    if (found) return found;
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return null;
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

  if (existingPrincipal?.id) {
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

  const { error: deactivateError } = await adminClient
    .from("usuarios_asignaciones")
    .update({ activo: false, fecha_fin: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
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
    if (role.empresa_id !== params.empresaId && role.es_superadmin !== true) continue;
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
  const asignacionesPayload = payload.asignaciones || [];

  if (!nombre || !email || !password || !empresaId || !rolInput) {
    return jsonResponse({ success: false, error: "Nombre, email, password, empresa y rol son obligatorios." }, 400);
  }

  if (password.length < 6) {
    return jsonResponse({ success: false, error: "La contrasena temporal debe tener al menos 6 caracteres." }, 400);
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, estado, roles!inner(id, empresa_id, es_admin_empresa, es_superadmin)")
    .eq("user_id", caller.id)
    .eq("estado", "activo");

  if (membershipError) {
    return jsonResponse({ success: false, error: membershipError.message }, 500);
  }

  const callerIsSuperadmin = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return role?.es_superadmin;
  });

  const canManage = callerIsSuperadmin || (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return membership.empresa_id === empresaId && role?.es_admin_empresa;
  });

  if (!canManage) {
    return jsonResponse({ success: false, error: "No tienes permiso para crear usuarios en este tenant." }, 403);
  }

  // Resolver el rol por ID exacto dentro del tenant (no se aceptan roles de otros tenants)
  let { data: roleRow, error: roleError } = await adminClient
    .from("roles")
    .select("id, nombre, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa")
    .eq("id", rolInput)
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .maybeSingle();

  // Si no se encontro por ID exacto, buscar por nombre dentro del tenant
  if (!roleRow && !roleError) {
    const byName = await adminClient
      .from("roles")
      .select("id, nombre, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa")
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

  // Solo el superadmin puede asignar roles con es_superadmin=true
  if (roleRow.es_superadmin && !callerIsSuperadmin) {
    return jsonResponse({ success: false, error: "No puedes asignar un rol de superadmin a un usuario." }, 403);
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

  let alreadyExists = false;
  let membershipOverwritten = false;
  let uid: string | null = null;
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
    const existingUser = await findAuthUserByEmail(adminClient, email);
    uid = existingUser?.id || null;
  } else {
    uid = createdUser.user?.id || null;
  }

  if (!uid) return jsonResponse({ success: false, error: "No se pudo resolver el usuario Auth creado." }, 500);
  if (jefeUserId === uid) {
    return jsonResponse({ success: false, error: "Un usuario no puede ser su propio jefe directo." }, 400);
  }

  if (alreadyExists) {
    const { error: reactivateError } = await adminClient.auth.admin.updateUserById(uid, {
      password,
      email_confirm: true,
      user_metadata: { nombre },
      ban_duration: "none",
    });
    if (reactivateError) return jsonResponse({ success: false, error: reactivateError.message }, 400);
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

  const usuario = {
    id: uid,
    nombre,
    email,
    rol: roleRow.id,
    empresa_id: empresaId,
    estado: "Activo",
    must_change_password: true,
  };

  const { data: savedUser, error: saveError } = await adminClient
    .from("usuarios")
    .upsert([usuario])
    .select()
    .single();

  if (saveError) return jsonResponse({ success: false, error: saveError.message }, 500);

  let asignaciones: Record<string, unknown>[] = [];
  try {
    asignaciones = await saveFunctionalAssignments(adminClient, {
      empresaId,
      userId: uid,
      principalRole: roleRow,
      jefeUserId,
      extras: asignacionesPayload,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudieron guardar las asignaciones funcionales." }, 500);
  }

  return jsonResponse({
    success: true,
    alreadyExists,
    membershipOverwritten,
    user: {
      ...(savedUser || usuario),
      rol_nombre: roleRow.nombre,
      rol_categoria: roleRow.categoria,
      nivel_jerarquico: roleRow.nivel_jerarquico,
      jefe_user_id: jefeUserId,
      asignaciones,
    },
  });
});
