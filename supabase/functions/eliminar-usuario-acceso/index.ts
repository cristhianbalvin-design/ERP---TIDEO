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

  const canManage = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return role?.es_superadmin || (membership.empresa_id === empresaId && role?.es_admin_empresa);
  });

  if (!canManage) {
    return jsonResponse({ success: false, error: "No tienes permiso para eliminar usuarios en este tenant." }, 403);
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

  return jsonResponse({ success: true });
});
