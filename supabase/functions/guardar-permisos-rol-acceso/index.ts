import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const sameJson = (left: unknown, right: unknown) => stableJson(left || {}) === stableJson(right || {});

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
  if (callerError || !callerData?.user) return jsonResponse({ success: false, error: "Sesion invalida o expirada." }, 401);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "El cuerpo de la solicitud no es valido." }, 400);
  }

  const rolId = String(payload.rol_id || "").trim();
  const permisos = Array.isArray(payload.permisos) ? payload.permisos : null;
  if (!rolId || !permisos?.length) return jsonResponse({ success: false, error: "Rol y permisos son obligatorios." }, 400);

  // La RPC conserva toda la autorizacion centralizada en Postgres (rol protegido,
  // delegacion y alcance). Esta llamada por Edge garantiza que se envie el JWT que
  // acaba de validar el servidor, igual que el listado de Roles.
  const { data: savedRows, error: saveError } = await userClient.rpc("guardar_permisos_rol", {
    p_rol_id: rolId,
    p_permisos: permisos,
  });
  if (saveError) return jsonResponse({ success: false, error: saveError.message }, 400);
  if ((savedRows || []).length !== permisos.length) {
    return jsonResponse({ success: false, error: "La base no confirmo todas las filas del permiso." }, 409);
  }

  const { data: persistedRows, error: persistedError } = await adminClient
    .from("permisos_roles")
    .select("pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra")
    .eq("rol_id", rolId);
  if (persistedError) return jsonResponse({ success: false, error: persistedError.message }, 500);

  const persistedByScreen = new Map((persistedRows || []).map((row) => [row.pantalla, row]));
  const mismatch = permisos.find((permiso) => {
    const expected = permiso as Record<string, unknown>;
    const persisted = persistedByScreen.get(String(expected.pantalla || ""));
    return !persisted
      || Boolean(persisted.puede_ver) !== Boolean(expected.puede_ver)
      || Boolean(persisted.puede_crear) !== Boolean(expected.puede_crear)
      || Boolean(persisted.puede_editar) !== Boolean(expected.puede_editar)
      || Boolean(persisted.puede_anular) !== Boolean(expected.puede_anular)
      || Boolean(persisted.puede_aprobar) !== Boolean(expected.puede_aprobar)
      || Boolean(persisted.puede_exportar) !== Boolean(expected.puede_exportar)
      || Boolean(persisted.puede_ver_costos) !== Boolean(expected.puede_ver_costos)
      || Boolean(persisted.puede_ver_finanzas) !== Boolean(expected.puede_ver_finanzas)
      || !sameJson(persisted.permisos_extra, expected.permisos_extra);
  });
  if (mismatch) {
    return jsonResponse({ success: false, error: `La verificacion posterior no coincide para ${String((mismatch as Record<string, unknown>).pantalla || "una pantalla")}.` }, 409);
  }

  return jsonResponse({ success: true, permisos: persistedRows || [] });
});
