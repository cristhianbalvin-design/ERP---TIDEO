import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, x-client-info, apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return json({ error: "Header X-Api-Key requerido" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Valida el key y obtiene empresa_id sin necesitar sesión de usuario.
  const { data: empresaId, error: valError } = await supabase.rpc("validar_api_key", {
    key_plain: apiKey,
    permiso: "leads:write",
  });

  if (valError || !empresaId) {
    return json({ error: "API key inválido o sin permiso leads:write" }, 403);
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const { nombre_contacto, nombre_empresa, email, telefono, cargo, fuente, notas, campana_id: campanaIdRaw } = body;

  if (!nombre_contacto && !nombre_empresa) {
    return json({ error: "Se requiere al menos nombre_contacto o nombre_empresa" }, 400);
  }

  // Validar campana_id si viene en el body — si no es válida o no está activa, insertar con null
  let campanaId: string | null = null;
  if (campanaIdRaw) {
    const { data: campana } = await supabase
      .from("campanas")
      .select("id")
      .eq("id", campanaIdRaw)
      .eq("empresa_id", empresaId)
      .eq("estado", "activa")
      .maybeSingle();
    campanaId = campana?.id ?? null;
  }

  const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      id: leadId,
      empresa_id: empresaId,
      nombre_contacto: nombre_contacto ?? "",
      empresa_nombre: nombre_empresa ?? "",
      email: email ?? null,
      telefono: telefono ?? null,
      cargo: cargo ?? null,
      fuente: fuente ?? "api",
      necesidad: notas ?? null,
      estado: "nuevo",
      campana_id: campanaId,
      registrado_desde: "api",
    })
    .select("id")
    .single();

  if (insertError) {
    return json({ error: `Error al crear lead: ${insertError.message}` }, 500);
  }

  return json({ success: true, lead_id: lead.id }, 201);
});
