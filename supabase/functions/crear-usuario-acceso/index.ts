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
  const area = String(payload.area || "").trim();

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

  const canManage = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return role?.es_superadmin || (membership.empresa_id === empresaId && role?.es_admin_empresa);
  });

  if (!canManage) {
    return jsonResponse({ success: false, error: "No tienes permiso para crear usuarios en este tenant." }, 403);
  }

  const roleAliases: Record<string, string> = {
    admin: "admin",
    plataforma: "admin",
    superadmin: "admin",
    comercial: "comercial",
    vendedor: "vendedor",
    tecnico: "tecnico",
    finanzas: "finanzas",
  };

  let { data: roleRow, error: roleError } = await adminClient
    .from("roles")
    .select("id")
    .eq("id", rolInput)
    .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
    .eq("activo", true)
    .maybeSingle();

  if (!roleRow && !roleError) {
    const alias = roleAliases[rolInput.toLowerCase()];
    if (alias === "admin") {
      const fallbackAdmin = await adminClient
        .from("roles")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("es_admin_empresa", true)
        .eq("activo", true)
        .order("nombre", { ascending: true })
        .limit(1)
        .maybeSingle();
      roleRow = fallbackAdmin.data;
      roleError = fallbackAdmin.error;
    }
  }

  if (!roleRow && !roleError) {
    const alias = roleAliases[rolInput.toLowerCase()] || rolInput;
    const fallback = await adminClient
      .from("roles")
      .select("id")
      .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
      .ilike("nombre", `%${alias}%`)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    roleRow = fallback.data;
    roleError = fallback.error;
  }

  if (!roleRow && !roleError) {
    const firstTenantRole = await adminClient
      .from("roles")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("es_admin_empresa", { ascending: false })
      .order("nombre", { ascending: true })
      .limit(1)
      .maybeSingle();
    roleRow = firstTenantRole.data;
    roleError = firstTenantRole.error;
  }

  if (roleError) return jsonResponse({ success: false, error: roleError.message }, 500);
  if (!roleRow?.id) return jsonResponse({ success: false, error: "El rol seleccionado no existe para este tenant." }, 400);

  let alreadyExists = false;
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
  } else {
    uid = createdUser.user?.id || null;
  }

  const { data: linkedRows, error: linkError } = await userClient.rpc("vincular_usuario_a_empresa", {
    p_email: email,
    p_empresa_id: empresaId,
    p_rol_id: roleRow.id,
    p_acceso_campo: false,
    p_perfil_campo: null,
  });

  if (linkError) return jsonResponse({ success: false, error: linkError.message }, 400);
  uid = linkedRows?.[0]?.user_id || uid;
  if (!uid) return jsonResponse({ success: false, error: "No se pudo resolver el usuario Auth creado." }, 500);

  const usuario = {
    id: uid,
    nombre,
    email,
    rol: roleRow.id,
    area,
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
    user: savedUser || usuario,
  });
});
