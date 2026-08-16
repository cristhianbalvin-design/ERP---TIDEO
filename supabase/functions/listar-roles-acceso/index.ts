import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { assertRolePermission } from "../_shared/rolePermissions.ts";

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

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const empresaId = String(payload.empresa_id || "").trim();
  if (!empresaId) return jsonResponse({ success: false, error: "Empresa obligatoria." }, 400);

  const rolePermission = await assertRolePermission(userClient, empresaId, "ver");
  if (!rolePermission.allowed) {
    return jsonResponse({ success: false, error: rolePermission.error }, 403);
  }

  let query = adminClient
    .from("roles")
    .select("*")
    .eq("activo", true)
    .order("empresa_id", { ascending: true })
    .order("nombre", { ascending: true });

  if (empresaId === "emp_tideo") {
    query = query.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
  } else {
    query = query.eq("empresa_id", empresaId);
  }

  const { data: roles, error: rolesError } = await query;
  if (rolesError) return jsonResponse({ success: false, error: rolesError.message }, 500);

  const roleIds = (roles || []).map((role) => role.id);
  const { data: permisos, error: permisosError } = roleIds.length
    ? await adminClient.from("permisos_roles").select("*").in("rol_id", roleIds)
    : { data: [], error: null };

  if (permisosError) return jsonResponse({ success: false, error: permisosError.message }, 500);

  const { data: assignedRows, error: assignedError } = roleIds.length
    ? await adminClient.from("usuarios_empresas").select("rol_id").in("rol_id", roleIds).eq("estado", "activo")
    : { data: [], error: null };

  if (assignedError) return jsonResponse({ success: false, error: assignedError.message }, 500);

  const assignedCounts = new Map<string, number>();
  for (const row of assignedRows || []) {
    assignedCounts.set(row.rol_id, (assignedCounts.get(row.rol_id) || 0) + 1);
  }

  const rolesWithCounts = (roles || []).map((role) => ({
    ...role,
    assigned_count: assignedCounts.get(role.id) || 0,
  }));

  return jsonResponse({ success: true, roles: rolesWithCounts, permisos: permisos || [] });
});
