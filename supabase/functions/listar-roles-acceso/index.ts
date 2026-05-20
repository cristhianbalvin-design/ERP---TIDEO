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

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const empresaId = String(payload.empresa_id || "").trim();

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, estado, roles!inner(id, es_admin_empresa, es_superadmin)")
    .eq("user_id", caller.id)
    .eq("estado", "activo");

  if (membershipError) return jsonResponse({ success: false, error: membershipError.message }, 500);

  // Cargar es_plataforma de las empresas del caller
  const callerEmpresaIds = [...new Set((memberships || []).map((m) => m.empresa_id).filter(Boolean))];
  const { data: callerEmpresasRows } = callerEmpresaIds.length
    ? await adminClient.from("empresas").select("id, es_plataforma").in("id", callerEmpresaIds)
    : { data: [] as { id: string; es_plataforma: boolean }[] };
  const callerEmpresasById = new Map((callerEmpresasRows || []).map((e) => [e.id, e]));

  const isPlatformAdmin = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    const empresa = callerEmpresasById.get(membership.empresa_id);
    return (role?.es_superadmin || role?.es_admin_empresa) && empresa?.es_plataforma;
  });

  const isSuperadmin = isPlatformAdmin || (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return role?.es_superadmin;
  });

  const manageableEmpresaIds = new Set<string>();
  for (const membership of memberships || []) {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    if (role?.es_superadmin || role?.es_admin_empresa) manageableEmpresaIds.add(membership.empresa_id);
  }

  if (empresaId && !isSuperadmin && !manageableEmpresaIds.has(empresaId)) {
    return jsonResponse({ success: false, error: "No tienes permiso para listar roles de este tenant." }, 403);
  }

  let query = adminClient
    .from("roles")
    .select("*")
    .eq("activo", true)
    .order("empresa_id", { ascending: true })
    .order("nombre", { ascending: true });

  if (empresaId === "emp_tideo") {
    query = query.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
  } else if (empresaId) {
    query = query.eq("empresa_id", empresaId);
  } else if (!isSuperadmin && manageableEmpresaIds.size) {
    query = query.in("empresa_id", [...manageableEmpresaIds]);
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
