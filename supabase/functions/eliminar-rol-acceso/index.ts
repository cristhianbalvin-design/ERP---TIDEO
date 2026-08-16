import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { assertRoleIsNotProtected, assertRolePermission } from "../_shared/rolePermissions.ts";

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

  const rolePermission = await assertRolePermission(userClient, role.empresa_id, "anular");
  if (!rolePermission.allowed) {
    return jsonResponse({ success: false, error: rolePermission.error }, 403);
  }

  const protectedRole = await assertRoleIsNotProtected(userClient, rolId);
  if (!protectedRole.allowed) {
    return jsonResponse({ success: false, error: protectedRole.error }, 403);
  }

  const { count: membershipCount, error: membershipCountError } = await adminClient
    .from("usuarios_empresas")
    .select("id", { count: "exact", head: true })
    .eq("rol_id", rolId)
    .eq("estado", "activo");

  if (membershipCountError) return jsonResponse({ success: false, error: membershipCountError.message }, 500);

  const { count: asignacionesCount, error: asignacionesCountError } = await adminClient
    .from("usuarios_asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("rol_id", rolId)
    .eq("activo", true);

  if (asignacionesCountError) return jsonResponse({ success: false, error: asignacionesCountError.message }, 500);

  const { count: profileCount, error: profileCountError } = await adminClient
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("rol", rolId);

  if (profileCountError) return jsonResponse({ success: false, error: profileCountError.message }, 500);

  if ((membershipCount || 0) > 0 || (asignacionesCount || 0) > 0 || (profileCount || 0) > 0) {
    return jsonResponse({
      success: false,
      error: "No puedes eliminar este rol porque tiene usuarios asignados. Reasignalos primero.",
    }, 409);
  }

  // Limpiar registros inactivos de ambas tablas para evitar que los FK bloqueen la eliminación
  await adminClient.from("usuarios_empresas").delete().eq("rol_id", rolId);
  await adminClient.from("usuarios_asignaciones").delete().eq("rol_id", rolId);

  const { error: permisosError } = await adminClient.from("permisos_roles").delete().eq("rol_id", rolId);
  if (permisosError) return jsonResponse({ success: false, error: permisosError.message }, 500);

  const { error: deleteError } = await adminClient.from("roles").delete().eq("id", rolId);
  if (deleteError) {
    const message = /usuarios_empresas_rol_id_fkey|foreign key constraint/i.test(deleteError.message)
      ? "No puedes eliminar este rol porque tiene usuarios asignados. Reasigna o elimina esas asignaciones primero."
      : deleteError.message;
    return jsonResponse({ success: false, error: message }, 500);
  }

  return jsonResponse({
    success: true,
    deleted_memberships: membershipCount || 0,
    updated_profiles: profileCount || 0,
  });
});
