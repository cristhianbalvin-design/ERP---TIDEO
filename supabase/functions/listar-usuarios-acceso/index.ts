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

const profileColumns = [
  "user_id",
  "email",
  "nombre",
  "telefono",
  "avatar_url",
  "estado_global",
  "must_change_password",
  "ultimo_login",
].join(",");

const legacyProfileColumns = [
  "id",
  "empresa_id",
  "nombre",
  "email",
  "rol",
  "area",
  "cargo",
  "telefono",
  "sede",
  "campo",
  "campo_perfil",
  "estado",
  "must_change_password",
  "ultimo_login",
].join(",");

const estadoMap: Record<string, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  invitado: "Invitado",
  inactivo: "Inactivo",
};

const isMissingTable = (error: unknown) => {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || "").toLowerCase();
  return err?.code === "42P01" || err?.code === "PGRST205" || message.includes("could not find the table");
};

const asRole = (membership: Record<string, unknown>) => {
  const role = membership.roles;
  return Array.isArray(role) ? role[0] : role;
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const fetchRolesIntoMap = async (
  adminClient: ReturnType<typeof createClient>,
  rolesById: Map<string, Record<string, unknown>>,
  roleIds: string[],
) => {
  const missing = unique(roleIds).filter((id) => !rolesById.has(id));
  if (!missing.length) return;

  const { data, error } = await adminClient
    .from("roles")
    .select("id, nombre, es_admin_empresa, es_superadmin, categoria, nivel_jerarquico")
    .in("id", missing);
  if (error) throw error;
  for (const role of data || []) rolesById.set(String(role.id), role);
};

const fetchAuthFallbacks = async (
  adminClient: ReturnType<typeof createClient>,
  userIds: string[],
) => {
  const authById = new Map<string, Record<string, unknown>>();
  await Promise.all(unique(userIds).map(async (userId) => {
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (!error && data?.user) authById.set(userId, data.user as unknown as Record<string, unknown>);
  }));
  return authById;
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

const fetchGlobalProfiles = async (
  adminClient: ReturnType<typeof createClient>,
  userIds: string[],
) => {
  const profilesByUserId = new Map<string, Record<string, unknown>>();
  const ids = unique(userIds);
  if (!ids.length) return { profilesByUserId, available: true };

  const { data, error } = await adminClient
    .from("profiles")
    .select(profileColumns)
    .in("user_id", ids);

  if (error && isMissingTable(error)) return { profilesByUserId, available: false };
  if (error) throw error;

  for (const profile of data || []) {
    profilesByUserId.set(String(profile.user_id), {
      ...profile,
      id: profile.user_id,
    });
  }
  return { profilesByUserId, available: true };
};

const fetchLegacyProfiles = async (
  adminClient: ReturnType<typeof createClient>,
  params: {
    scopeAllEmpresas: boolean;
    scopeEmpresaIds: string[];
    missingUserIds: string[];
  },
) => {
  const legacyByUserId = new Map<string, Record<string, unknown>>();
  const scopedLegacy: Record<string, unknown>[] = [];

  let scopedQuery = adminClient
    .from("usuarios")
    .select(legacyProfileColumns)
    .order("nombre", { ascending: true });
  if (!params.scopeAllEmpresas) scopedQuery = scopedQuery.in("empresa_id", params.scopeEmpresaIds);

  const { data: scopedRows, error: scopedError } = await scopedQuery;
  if (scopedError) throw scopedError;
  for (const row of scopedRows || []) {
    scopedLegacy.push(row);
    legacyByUserId.set(String(row.id), row);
  }

  const ids = unique(params.missingUserIds).filter((id) => !legacyByUserId.has(id));
  if (ids.length) {
    const { data: fallbackRows, error: fallbackError } = await adminClient
      .from("usuarios")
      .select(legacyProfileColumns)
      .in("id", ids);
    if (fallbackError) throw fallbackError;
    for (const row of fallbackRows || []) legacyByUserId.set(String(row.id), row);
  }

  return { legacyByUserId, scopedLegacy };
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

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const empresaId = String(payload.empresa_id || "").trim();

  try {
    const { data: callerMemberships, error: callerMembershipError } = await adminClient
      .from("usuarios_empresas")
      .select("user_id, empresa_id, rol_id, jefe_user_id, acceso_campo, perfil_campo, campo_modulos, estado, roles!inner(id, es_admin_empresa, es_superadmin)")
      .eq("user_id", caller.id)
      .eq("estado", "activo");
    if (callerMembershipError) throw callerMembershipError;

    const { data: callerLegacyProfile, error: callerLegacyProfileError } = await adminClient
      .from("usuarios")
      .select("id, empresa_id, rol")
      .eq("id", caller.id)
      .maybeSingle();
    if (callerLegacyProfileError) throw callerLegacyProfileError;

    const rolesById = new Map<string, Record<string, unknown>>();
    for (const membership of callerMemberships || []) {
      const role = asRole(membership);
      if (role?.id) rolesById.set(String(role.id), role as Record<string, unknown>);
    }
    await fetchRolesIntoMap(adminClient, rolesById, [callerLegacyProfile?.rol].filter(Boolean) as string[]);

    const callerEmpresaIds = unique((callerMemberships || []).map((m) => String(m.empresa_id || "")));
    const { data: callerEmpresasRows, error: callerEmpresasError } = callerEmpresaIds.length
      ? await adminClient.from("empresas").select("id, es_plataforma").in("id", callerEmpresaIds)
      : { data: [], error: null };
    if (callerEmpresasError) throw callerEmpresasError;

    const callerEmpresasById = new Map((callerEmpresasRows || []).map((empresa) => [empresa.id, empresa]));
    const platformEmpresaIds = new Set((callerEmpresasRows || []).filter((empresa) => empresa.es_plataforma).map((empresa) => empresa.id));

    const isPlatformAdmin = await fetchPlatformAdminFlag(adminClient, caller.id, caller.email);
    const hasPlatformSuperadminMembership = (callerMemberships || []).some((membership) => {
      const role = rolesById.get(String(membership.rol_id));
      const empresa = callerEmpresasById.get(membership.empresa_id);
      return role?.es_superadmin === true && empresa?.es_plataforma === true && normalizeEmail(caller.email) === PLATFORM_SUPERADMIN_EMAIL;
    });
    const isPlatformSuperadmin = isPlatformAdmin || hasPlatformSuperadminMembership;

    const manageableEmpresaIds = new Set<string>();
    for (const membership of callerMemberships || []) {
      const role = rolesById.get(String(membership.rol_id));
      if (role?.es_admin_empresa === true) manageableEmpresaIds.add(String(membership.empresa_id));
    }
    if (callerLegacyProfile?.empresa_id) {
      const profileRole = rolesById.get(String(callerLegacyProfile.rol));
      if (profileRole?.es_admin_empresa === true) manageableEmpresaIds.add(String(callerLegacyProfile.empresa_id));
    }

    const isMemberOfEmpresa = Boolean(empresaId) && (
      (callerMemberships || []).some((m) => m.empresa_id === empresaId) ||
      callerLegacyProfile?.empresa_id === empresaId
    );
    if (empresaId && !isPlatformSuperadmin && !manageableEmpresaIds.has(empresaId) && !isMemberOfEmpresa) {
      return jsonResponse({ success: false, error: "No tienes permiso para listar usuarios de este tenant." }, 403);
    }

    const scopeAllEmpresas = isPlatformSuperadmin && (!empresaId || platformEmpresaIds.has(empresaId));
    const scopeEmpresaIds = scopeAllEmpresas
      ? []
      : empresaId
        ? [empresaId]
        : isPlatformSuperadmin
          ? []
          : [...manageableEmpresaIds];

    if (!scopeAllEmpresas && !scopeEmpresaIds.length) {
      return jsonResponse({ success: true, usuarios: [] });
    }

    let membershipsQuery = adminClient
      .from("usuarios_empresas")
      // Usuarios incluye también inactivos/suspendidos: no pueden acceder ni ocupar una
      // posición, pero deben seguir siendo consultables y filtrables en Administración.
      .select("user_id, empresa_id, rol_id, jefe_user_id, acceso_campo, perfil_campo, campo_modulos, estado");
    if (!scopeAllEmpresas) membershipsQuery = membershipsQuery.in("empresa_id", scopeEmpresaIds);
    const { data: memberships, error: membershipsError } = await membershipsQuery;
    if (membershipsError) throw membershipsError;

    const membershipUserIds = unique((memberships || []).map((membership) => String(membership.user_id || "")));
    const { profilesByUserId } = await fetchGlobalProfiles(adminClient, membershipUserIds);

    const { legacyByUserId, scopedLegacy } = await fetchLegacyProfiles(adminClient, {
      scopeAllEmpresas,
      scopeEmpresaIds,
      missingUserIds: membershipUserIds.filter((id) => !profilesByUserId.has(id)),
    });

    let assignmentsQuery = adminClient
      .from("usuarios_asignaciones")
      .select("*")
      .eq("activo", true)
      .order("principal", { ascending: false })
      .order("created_at", { ascending: true });
    if (!scopeAllEmpresas) assignmentsQuery = assignmentsQuery.in("empresa_id", scopeEmpresaIds);
    const { data: assignmentsRaw, error: assignmentsError } = await assignmentsQuery;
    if (assignmentsError && !isMissingTable(assignmentsError)) throw assignmentsError;
    const assignments = assignmentsRaw || [];

    await fetchRolesIntoMap(adminClient, rolesById, [
      ...(memberships || []).map((membership) => String(membership.rol_id || "")),
      ...scopedLegacy.map((profile) => String(profile.rol || "")),
      ...assignments.map((assignment) => String(assignment.rol_id || "")),
    ]);

    const assignmentsByKey = new Map<string, Record<string, unknown>[]>();
    for (const assignment of assignments) {
      const role = rolesById.get(String(assignment.rol_id));
      const key = `${assignment.user_id}:${assignment.empresa_id}`;
      const item = {
        ...assignment,
        rol_nombre: role?.nombre || assignment.rol_id,
        rol_categoria: role?.categoria || assignment.categoria,
      };
      const list = assignmentsByKey.get(key) || [];
      list.push(item);
      assignmentsByKey.set(key, list);
    }

    const missingAuthIds = membershipUserIds.filter((id) => !profilesByUserId.has(id) && !legacyByUserId.has(id));
    const authById = missingAuthIds.length ? await fetchAuthFallbacks(adminClient, missingAuthIds) : new Map<string, Record<string, unknown>>();

    const rows = new Map<string, Record<string, unknown>>();
    for (const membership of memberships || []) {
      const userId = String(membership.user_id);
      const empresaKey = String(membership.empresa_id);
      const key = `${userId}:${empresaKey}`;
      const profile = profilesByUserId.get(userId) || legacyByUserId.get(userId);
      const legacy = legacyByUserId.get(userId);
      const authUser = authById.get(userId);
      // Una membresía puede sobrevivir a una cuenta/perfil eliminado. No representa a una
      // persona administrable: se conserva en la base para auditoría, pero no se muestra
      // como un supuesto usuario usando el UUID como nombre.
      if (!profile && !legacy && !authUser) continue;
      const metadata = (authUser?.user_metadata || {}) as Record<string, unknown>;
      const email = profile?.email || legacy?.email || authUser?.email || "";
      const role = rolesById.get(String(membership.rol_id));
      const asignaciones = assignmentsByKey.get(key) || [];
      const principal = asignaciones.find((assignment) => assignment.principal) || asignaciones[0] || null;
      const campoModulos = Array.isArray(membership.campo_modulos) ? membership.campo_modulos : [];

      rows.set(key, {
        id: userId,
        user_id: userId,
        empresa_id: empresaKey,
        nombre: profile?.nombre || legacy?.nombre || metadata.nombre || String(email).split("@")[0] || userId,
        email,
        telefono: profile?.telefono || legacy?.telefono || "",
        avatar_url: profile?.avatar_url || null,
        rol: membership.rol_id,
        rol_nombre: role?.nombre || membership.rol_id,
        rol_categoria: principal?.categoria || role?.categoria || null,
        nivel_jerarquico: principal?.nivel_jerarquico || role?.nivel_jerarquico || null,
        jefe_user_id: principal?.jefe_user_id || membership.jefe_user_id || null,
        asignaciones,
        area: legacy?.area || "",
        cargo: legacy?.cargo || "",
        sede: legacy?.sede || "",
        campo: membership.acceso_campo === true,
        campoPerfil: membership.perfil_campo || null,
        campo_perfil: membership.perfil_campo || null,
        campoModulos,
        campo_modulos: campoModulos,
        must_change_password: profile?.must_change_password ?? legacy?.must_change_password ?? false,
        ultimo_login: profile?.ultimo_login || legacy?.ultimo_login || null,
        estado: estadoMap[String(membership.estado)] ?? membership.estado,
      });
    }

    // Compatibilidad: muestra perfiles legacy del tenant aunque aun no tengan membresia activa.
    // La autorizacion real sigue saliendo de usuarios_empresas.
    for (const legacy of scopedLegacy) {
      const key = `${legacy.id}:${legacy.empresa_id}`;
      if (rows.has(key)) continue;
      const role = rolesById.get(String(legacy.rol));
      rows.set(key, {
        ...legacy,
        user_id: legacy.id,
        rol_nombre: role?.nombre || legacy.rol,
        rol_categoria: role?.categoria || null,
        nivel_jerarquico: role?.nivel_jerarquico || null,
        jefe_user_id: null,
        asignaciones: [],
        campoPerfil: legacy.campo_perfil || null,
        campoModulos: [],
        campo_modulos: [],
        estado: legacy.estado || "Activo",
      });
    }

    if (isPlatformSuperadmin) {
      for (const [key, user] of [...rows.entries()]) {
        const userEmpresaId = String(user.empresa_id || "");
        if (user.id === caller.id && !platformEmpresaIds.has(userEmpresaId)) rows.delete(key);
      }
    }

    const isAdminOfThisEmpresa = isPlatformSuperadmin || (empresaId ? manageableEmpresaIds.has(empresaId) : false);
    if (!isAdminOfThisEmpresa && isMemberOfEmpresa) {
      const callerRow = rows.get(`${caller.id}:${empresaId}`) ?? [...rows.values()].find((user) => user.id === caller.id);
      const callerLevel = String(callerRow?.nivel_jerarquico || "");
      if (callerLevel !== "direccion") {
        const reportsByJefe = new Map<string, string[]>();
        for (const user of rows.values()) {
          const jefeId = user.jefe_user_id as string | null;
          if (!jefeId) continue;
          const list = reportsByJefe.get(jefeId) || [];
          list.push(String(user.id));
          reportsByJefe.set(jefeId, list);
        }

        const visible = new Set<string>([caller.id]);
        const queue = [caller.id];
        while (queue.length) {
          const current = queue.shift()!;
          for (const reportId of reportsByJefe.get(current) || []) {
            if (visible.has(reportId)) continue;
            visible.add(reportId);
            queue.push(reportId);
          }
        }

        for (const [key, user] of [...rows.entries()]) {
          if (!visible.has(String(user.id))) rows.delete(key);
        }
      }
    }

    const usuarios = [...rows.values()].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" })
    );

    return jsonResponse({ success: true, usuarios });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron listar usuarios.";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
