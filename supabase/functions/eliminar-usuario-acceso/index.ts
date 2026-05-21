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

  if (!userId || !empresaId) {
    return jsonResponse({ success: false, error: "Usuario y empresa son obligatorios." }, 400);
  }

  if (userId === caller.id) {
    return jsonResponse({ success: false, error: "No puedes eliminar tu propio acceso desde esta pantalla." }, 400);
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

  const canManage = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return membership.empresa_id === empresaId && role?.es_admin_empresa;
  }) || callerIsPlatformSuperadmin;

  if (!canManage) {
    return jsonResponse({ success: false, error: "No tienes permiso para eliminar usuarios en este tenant." }, 403);
  }

  const { data: targetMembership, error: targetMembershipError } = await adminClient
    .from("usuarios_empresas")
    .select("rol_id, roles!inner(id, nombre, es_superadmin)")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (targetMembershipError) {
    return jsonResponse({ success: false, error: targetMembershipError.message }, 500);
  }

  const targetRole = targetMembership
    ? (Array.isArray(targetMembership.roles) ? targetMembership.roles[0] : targetMembership.roles)
    : null;

  if (targetRole?.es_superadmin || targetMembership?.rol_id === "rol_tideo_super") {
    return jsonResponse({ success: false, error: "El Superadmin TIDEO no se puede eliminar." }, 403);
  }

  const { error: profileError } = await adminClient
    .from("usuarios")
    .delete()
    .eq("id", userId)
    .eq("empresa_id", empresaId);

  if (profileError) return jsonResponse({ success: false, error: profileError.message }, 500);

  const { error: membershipUpdateError } = await adminClient
    .from("usuarios_empresas")
    .update({ estado: "inactivo", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("empresa_id", empresaId);

  if (membershipUpdateError) {
    return jsonResponse({ success: false, error: membershipUpdateError.message }, 500);
  }

  // Si el usuario ya no tiene ningún tenant activo, deshabilitar la cuenta Auth
  // para que no pueda seguir haciendo login.
  const { count: remainingCount } = await adminClient
    .from("usuarios_empresas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("estado", "activo");

  const authDisabled = (remainingCount ?? 1) === 0;

  if (authDisabled) {
    // ban_duration largo deshabilita la cuenta sin perder el historial de auditoría.
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
  }

  const { error: globalProfileError } = await adminClient
    .from("profiles")
    .update({ estado_global: authDisabled ? "inactivo" : "activo", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (globalProfileError && !isMissingTable(globalProfileError)) {
    return jsonResponse({ success: false, error: globalProfileError.message }, 500);
  }

  return jsonResponse({ success: true, authDisabled });
});
