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

const PLATFORM_SUPERADMIN_EMAIL = "cristhianbalvin@gmail.com";
const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();

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

  const userId = String(payload.user_id || "").trim();
  const empresaId = String(payload.empresa_id || "").trim();
  const password = String(payload.password || "");

  if (!userId || !empresaId || !password) {
    return jsonResponse({ success: false, error: "Usuario, empresa y contrasena son obligatorios." }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ success: false, error: "La contrasena temporal debe tener al menos 6 caracteres." }, 400);
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, estado, roles!inner(id, es_admin_empresa, es_superadmin)")
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
    return jsonResponse({ success: false, error: "No tienes permiso para asignar contrasenas en este tenant." }, 403);
  }

  const { data: targetMembership, error: targetMembershipError } = await adminClient
    .from("usuarios_empresas")
    .select("user_id, empresa_id, estado")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (targetMembershipError) return jsonResponse({ success: false, error: targetMembershipError.message }, 500);
  if (!targetMembership?.user_id) {
    return jsonResponse({ success: false, error: "El usuario no pertenece a este tenant." }, 400);
  }

  const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (passwordError) return jsonResponse({ success: false, error: passwordError.message }, 400);

  const { error: legacyError } = await adminClient
    .from("usuarios")
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (legacyError) return jsonResponse({ success: false, error: legacyError.message }, 500);

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (profileError && !isMissingTable(profileError)) {
    return jsonResponse({ success: false, error: profileError.message }, 500);
  }

  return jsonResponse({ success: true });
});
