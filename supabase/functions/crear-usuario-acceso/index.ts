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
    .select("id, es_superadmin, es_admin_empresa")
    .eq("id", rolInput)
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .maybeSingle();

  // Si no se encontro por ID exacto, buscar por nombre dentro del tenant
  if (!roleRow && !roleError) {
    const byName = await adminClient
      .from("roles")
      .select("id, es_superadmin, es_admin_empresa")
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

  return jsonResponse({
    success: true,
    alreadyExists,
    membershipOverwritten,
    user: savedUser || usuario,
  });
});
