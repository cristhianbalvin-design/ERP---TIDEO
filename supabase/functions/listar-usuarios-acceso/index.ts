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

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const empresaId = String(payload.empresa_id || "").trim();

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado")
    .eq("estado", "activo");

  if (membershipError) return jsonResponse({ success: false, error: membershipError.message }, 500);

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("usuarios")
    .select("id, empresa_id, rol")
    .eq("id", caller.id)
    .maybeSingle();

  if (callerProfileError) return jsonResponse({ success: false, error: callerProfileError.message }, 500);

  const roleIds = [...new Set([
    ...(memberships || []).map((m) => m.rol_id).filter(Boolean),
    callerProfile?.rol,
  ].filter(Boolean))];
  const { data: rolesRows, error: rolesError } = roleIds.length
    ? await adminClient.from("roles").select("id, nombre, es_admin_empresa, es_superadmin").in("id", roleIds)
    : { data: [], error: null };

  if (rolesError) return jsonResponse({ success: false, error: rolesError.message }, 500);

  const rolesById = new Map((rolesRows || []).map((role) => [role.id, role]));

  const callerMemberships = (memberships || []).filter((m) => m.user_id === caller.id);
  const isSuperadmin = callerMemberships.some((m) => {
    const role = rolesById.get(m.rol_id);
    return role?.es_superadmin;
  }) || Boolean(callerProfile?.rol && rolesById.get(callerProfile.rol)?.es_superadmin);

  const manageableEmpresaIds = new Set<string>();
  for (const membership of callerMemberships) {
    const role = rolesById.get(membership.rol_id);
    if (role?.es_superadmin || role?.es_admin_empresa) manageableEmpresaIds.add(membership.empresa_id);
  }
  if (callerProfile?.empresa_id) {
    const profileRole = rolesById.get(callerProfile.rol);
    if (profileRole?.es_superadmin || profileRole?.es_admin_empresa) manageableEmpresaIds.add(callerProfile.empresa_id);
  }

  if (empresaId && empresaId !== "emp_tideo" && !isSuperadmin && !manageableEmpresaIds.has(empresaId)) {
    return jsonResponse({ success: false, error: "No tienes permiso para listar usuarios de este tenant." }, 403);
  }

  const scopeEmpresaIds = empresaId && empresaId !== "emp_tideo"
    ? [empresaId]
    : isSuperadmin
      ? [...new Set([
          ...(memberships || []).map((m) => m.empresa_id),
          ...(callerProfile?.empresa_id ? [callerProfile.empresa_id] : []),
          "emp_tideo",
        ])]
      : [...manageableEmpresaIds];

  let profilesQuery = adminClient.from("usuarios").select("*").order("nombre", { ascending: true });
  if (!(empresaId === "emp_tideo" && isSuperadmin) && scopeEmpresaIds.length) {
    profilesQuery = profilesQuery.in("empresa_id", scopeEmpresaIds);
  }
  const { data: profiles, error: profilesError } = await profilesQuery;
  if (profilesError) return jsonResponse({ success: false, error: profilesError.message }, 500);

  const { data: authUsersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authById = new Map((authUsersData?.users || []).map((u) => [u.id, u]));

  const estadoMap: Record<string, string> = {
    activo: "Activo",
    suspendido: "Suspendido",
    invitado: "Invitado",
    inactivo: "Inactivo",
  };
  const membershipsByKey = new Map((memberships || []).map((membership) => [`${membership.user_id}:${membership.empresa_id}`, membership]));

  const rows = new Map<string, Record<string, unknown>>();
  for (const profile of profiles || []) {
    const key = `${profile.id}:${profile.empresa_id}`;
    const membership = membershipsByKey.get(key);
    const role = membership ? rolesById.get(membership.rol_id) : null;
    rows.set(key, {
      ...profile,
      rol: membership?.rol_id || profile.rol,
      rol_nombre: role?.nombre || profile.rol_nombre || profile.rol,
      campo: membership?.acceso_campo ?? profile.campo,
      campoPerfil: membership?.perfil_campo ?? profile.campo_perfil,
      estado: membership?.estado ? (estadoMap[membership.estado] ?? membership.estado) : profile.estado,
    });
  }

  for (const membership of memberships || []) {
    if (!scopeEmpresaIds.includes(membership.empresa_id)) continue;
    const key = `${membership.user_id}:${membership.empresa_id}`;
    if (rows.has(key)) continue;
    const authUser = authById.get(membership.user_id);
    const role = rolesById.get(membership.rol_id);
    rows.set(key, {
      id: membership.user_id,
      empresa_id: membership.empresa_id,
      nombre: authUser?.user_metadata?.nombre || authUser?.email?.split("@")[0] || membership.user_id,
      email: authUser?.email || "",
      rol: membership.rol_id,
      rol_nombre: role?.nombre || membership.rol_id,
      area: "",
      campo: membership.acceso_campo,
      campoPerfil: membership.perfil_campo,
      estado: estadoMap[membership.estado] ?? membership.estado,
    });
  }

  return jsonResponse({ success: true, usuarios: [...rows.values()] });
});
