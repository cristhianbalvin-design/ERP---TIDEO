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
  if (callerError || !caller) return jsonResponse({ success: false, error: "Sesion invalida o expirada." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Solicitud invalida." }, 400);
  }

  const rolId = String(payload.rol_id || "").trim();
  if (!rolId) return jsonResponse({ success: false, error: "Rol obligatorio." }, 400);

  const { data: role, error: roleError } = await adminClient
    .from("roles")
    .select("*")
    .eq("id", rolId)
    .maybeSingle();

  if (roleError) return jsonResponse({ success: false, error: roleError.message }, 500);
  if (!role) return jsonResponse({ success: false, error: "El rol ya no existe." }, 404);
  if (role.es_superadmin) return jsonResponse({ success: false, error: "No puedes eliminar un rol superadmin." }, 400);

  const { data: callerMemberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, rol_id, estado")
    .eq("user_id", caller.id)
    .eq("estado", "activo");

  if (membershipError) return jsonResponse({ success: false, error: membershipError.message }, 500);

  const callerRoleIds = [...new Set((callerMemberships || []).map((m) => m.rol_id).filter(Boolean))];
  const { data: callerRoles, error: callerRolesError } = callerRoleIds.length
    ? await adminClient.from("roles").select("id, es_admin_empresa, es_superadmin").in("id", callerRoleIds)
    : { data: [], error: null };

  if (callerRolesError) return jsonResponse({ success: false, error: callerRolesError.message }, 500);

  const callerRolesById = new Map((callerRoles || []).map((callerRole) => [callerRole.id, callerRole]));

  const canManage = (callerMemberships || []).some((membership) => {
    const callerRole = callerRolesById.get(membership.rol_id);
    return callerRole?.es_superadmin || (membership.empresa_id === role.empresa_id && callerRole?.es_admin_empresa);
  });

  if (!canManage) return jsonResponse({ success: false, error: "No tienes permiso para eliminar este rol." }, 403);

  const { count: membershipCount, error: membershipCountError } = await adminClient
    .from("usuarios_empresas")
    .select("id", { count: "exact", head: true })
    .eq("rol_id", rolId)
    .eq("estado", "activo");

  if (membershipCountError) return jsonResponse({ success: false, error: membershipCountError.message }, 500);
  if ((membershipCount || 0) > 0) {
    return jsonResponse({ success: false, error: `No puedes eliminar este rol porque tiene ${membershipCount} usuario(s) asignado(s).` }, 400);
  }

  const { count: profileCount, error: profileCountError } = await adminClient
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("rol", rolId);

  if (profileCountError) return jsonResponse({ success: false, error: profileCountError.message }, 500);
  if ((profileCount || 0) > 0) {
    return jsonResponse({ success: false, error: `No puedes eliminar este rol porque tiene ${profileCount} perfil(es) de usuario asignado(s).` }, 400);
  }

  const { error: permisosError } = await adminClient.from("permisos_roles").delete().eq("rol_id", rolId);
  if (permisosError) return jsonResponse({ success: false, error: permisosError.message }, 500);

  const { error: deleteError } = await adminClient.from("roles").delete().eq("id", rolId);
  if (deleteError) return jsonResponse({ success: false, error: deleteError.message }, 500);

  return jsonResponse({ success: true });
});
