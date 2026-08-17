import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { assertRoleAssignment, assertUserPermission } from "../_shared/rolePermissions.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();
const PLATFORM_SUPERADMIN_EMAIL = "cristhianbalvin@gmail.com";

const isPlatformSuperadmin = async (
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  callerEmail: string | undefined,
) => {
  if (normalizeEmail(callerEmail) !== PLATFORM_SUPERADMIN_EMAIL) return false;
  const { data, error } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", callerId)
    .eq("nivel", "superadmin")
    .eq("estado", "activo")
    .maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error;
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
  if (callerError || !caller) return jsonResponse({ success: false, error: "Sesion invalida o expirada." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Solicitud invalida." }, 400);
  }

  const userId = String(payload.user_id || "").trim();
  const empresaId = String(payload.empresa_id || "").trim();
  const rolId = String(payload.rol || "").trim();
  if (!userId || !empresaId || !rolId) {
    return jsonResponse({ success: false, error: "Usuario, empresa y rol son obligatorios." }, 400);
  }

  const userPermission = await assertUserPermission(userClient, empresaId, "editar");
  if (!userPermission.allowed) return jsonResponse({ success: false, error: userPermission.error }, 403);

  const { data: targetMembership, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("rol_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) return jsonResponse({ success: false, error: membershipError.message }, 500);
  if (!targetMembership) return jsonResponse({ success: false, error: "El usuario no pertenece al tenant seleccionado." }, 400);

  const { data: role, error: roleError } = await adminClient
    .from("roles")
    .select("id, empresa_id, activo, es_superadmin")
    .eq("id", rolId)
    .maybeSingle();
  if (roleError) return jsonResponse({ success: false, error: roleError.message }, 500);
  if (!role?.id || !role.activo || role.empresa_id !== empresaId) {
    return jsonResponse({ success: false, error: "El rol seleccionado no existe, esta inactivo o no pertenece al tenant." }, 400);
  }

  if (targetMembership.rol_id !== rolId) {
    const rolePermission = await assertRoleAssignment(userClient, empresaId, rolId, "editar");
    if (!rolePermission.allowed) return jsonResponse({ success: false, error: rolePermission.error }, 403);
  }

  if (role.es_superadmin) {
    const [{ data: targetEmpresa, error: empresaError }, { data: targetUser, error: targetUserError }] = await Promise.all([
      adminClient.from("empresas").select("es_plataforma").eq("id", empresaId).maybeSingle(),
      adminClient.auth.admin.getUserById(userId),
    ]);
    if (empresaError) return jsonResponse({ success: false, error: empresaError.message }, 500);
    if (targetUserError) return jsonResponse({ success: false, error: targetUserError.message }, 500);
    let callerIsPlatformSuperadmin = false;
    try {
      callerIsPlatformSuperadmin = await isPlatformSuperadmin(adminClient, caller.id, caller.email);
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : "No se pudo validar el Superadmin de plataforma." }, 500);
    }
    if (!(callerIsPlatformSuperadmin && targetEmpresa?.es_plataforma && normalizeEmail(targetUser?.user?.email) === PLATFORM_SUPERADMIN_EMAIL)) {
      return jsonResponse({ success: false, error: "El rol Superadmin TIDEO solo corresponde al usuario de plataforma autorizado." }, 403);
    }
  }

  const { data, error } = await adminClient.rpc("reasignar_rol_usuario", {
    p_empresa_id: empresaId,
    p_user_id: userId,
    p_rol_id: rolId,
    p_actor_id: caller.id,
  });
  if (error) return jsonResponse({ success: false, error: error.message }, 400);

  return jsonResponse({ success: true, reasignacion: data });
});
