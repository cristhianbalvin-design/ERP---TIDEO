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

const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();

const estadoToMembership = (estado: string) => {
  const value = estado.trim().toLowerCase();
  if (value === "activo" || value === "activa") return "activo";
  if (value === "invitado" || value === "invitada") return "invitado";
  if (value === "suspendido" || value === "suspendida") return "suspendido";
  if (value === "inactivo" || value === "inactiva") return "inactivo";
  return "activo";
};

const estadoToProfile = (estado: string) => {
  const value = estadoToMembership(estado);
  const labels: Record<string, string> = {
    activo: "Activo",
    invitado: "Invitado",
    suspendido: "Suspendido",
    inactivo: "Inactivo",
  };
  return labels[value] || "Activo";
};

const allowedCampoModulos = new Set(["tecnico", "logistica", "vendedor", "compras", "supervisor", "gerencia", "asistencia"]);
const legacyPerfilToModulo = (perfil: string | null) => {
  const value = String(perfil || "").toLowerCase();
  if (value.includes("vendedor")) return "vendedor";
  if (value.includes("compra")) return "compras";
  if (value.includes("supervisor")) return "supervisor";
  if (value.includes("gerencia")) return "gerencia";
  if (value.includes("logistica")) return "logistica";
  if (value.includes("asistencia")) return "asistencia";
  return "tecnico";
};
const moduloToPerfil = (modulo: string | null) => {
  const map: Record<string, string> = {
    tecnico: "Tecnico",
    logistica: "Logistica",
    vendedor: "Vendedor",
    compras: "Compras",
    supervisor: "Supervisor",
    gerencia: "Gerencia",
    asistencia: "Asistencia",
  };
  return modulo ? (map[modulo] || "Tecnico") : null;
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
  const nombre = String(payload.nombre || "").trim();
  const email = normalizeEmail(payload.email);
  const rolId = String(payload.rol || "").trim();
  const accesoCampo = Boolean(payload.acceso_campo);
  const campoModulos = accesoCampo
    ? [...new Set((Array.isArray(payload.campo_modulos) ? payload.campo_modulos : [legacyPerfilToModulo(String(payload.perfil_campo || "Tecnico"))])
      .map((m) => String(m || "").trim().toLowerCase())
      .filter((m) => allowedCampoModulos.has(m)))]
    : [];
  const perfilCampo = accesoCampo ? moduloToPerfil(campoModulos[0] || legacyPerfilToModulo(String(payload.perfil_campo || "Tecnico"))) : null;
  const estadoPerfil = estadoToProfile(String(payload.estado || "Activo"));
  const estadoMembership = estadoToMembership(estadoPerfil);

  if (!userId || !empresaId || !nombre || !email || !rolId) {
    return jsonResponse({ success: false, error: "Usuario, empresa, nombre, email y rol son obligatorios." }, 400);
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("usuarios_empresas")
    .select("empresa_id, estado, roles!inner(id, empresa_id, es_admin_empresa, es_superadmin)")
    .eq("user_id", caller.id)
    .eq("estado", "activo");

  if (membershipError) return jsonResponse({ success: false, error: membershipError.message }, 500);

  const callerIsSuperadmin = (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return role?.es_superadmin;
  });

  const canManage = callerIsSuperadmin || (memberships || []).some((membership) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
    return membership.empresa_id === empresaId && role?.es_admin_empresa;
  });

  if (!canManage) {
    return jsonResponse({ success: false, error: "No tienes permiso para editar usuarios en este tenant." }, 403);
  }

  const { data: currentMembership, error: currentMembershipError } = await adminClient
    .from("usuarios_empresas")
    .select("user_id, empresa_id, rol_id, estado")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (currentMembershipError) return jsonResponse({ success: false, error: currentMembershipError.message }, 500);
  if (!currentMembership) return jsonResponse({ success: false, error: "El usuario no pertenece a este tenant." }, 404);

  const { data: roleRow, error: roleError } = await adminClient
    .from("roles")
    .select("id, empresa_id, es_superadmin, activo")
    .eq("id", rolId)
    .maybeSingle();

  if (roleError) return jsonResponse({ success: false, error: roleError.message }, 500);
  if (!roleRow?.id || !roleRow.activo) return jsonResponse({ success: false, error: "El rol seleccionado no existe o esta inactivo." }, 400);
  if (roleRow.empresa_id !== empresaId && !(callerIsSuperadmin && roleRow.es_superadmin)) {
    return jsonResponse({ success: false, error: "El rol seleccionado no pertenece a este tenant." }, 400);
  }
  if (roleRow.es_superadmin && !callerIsSuperadmin) {
    return jsonResponse({ success: false, error: "No puedes asignar un rol de superadmin a un usuario." }, 403);
  }

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    user_metadata: { nombre },
  });
  if (authUpdateError) return jsonResponse({ success: false, error: authUpdateError.message }, 400);

  const { error: membershipUpdateError } = await adminClient
    .from("usuarios_empresas")
    .update({
      rol_id: rolId,
      acceso_campo: accesoCampo,
      perfil_campo: perfilCampo,
      campo_modulos: campoModulos,
      estado: estadoMembership,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("empresa_id", empresaId);

  if (membershipUpdateError) return jsonResponse({ success: false, error: membershipUpdateError.message }, 500);

  const profile = {
    id: userId,
    empresa_id: empresaId,
    nombre,
    email,
    rol: rolId,
    campo: accesoCampo,
    campo_perfil: perfilCampo,
    estado: estadoPerfil,
    updated_at: new Date().toISOString(),
  };

  const { data: savedUser, error: saveError } = await adminClient
    .from("usuarios")
    .upsert([profile], { onConflict: "id" })
    .select()
    .single();

  if (saveError) return jsonResponse({ success: false, error: saveError.message }, 500);

  return jsonResponse({
    success: true,
    user: {
      ...(savedUser || profile),
      campoPerfil: perfilCampo,
      campoModulos,
    },
  });
});
