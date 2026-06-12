import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { empresa_id: empresaId, limit = 25, simulate_status = false } = await req.json().catch(() => ({}));
    if (!empresaId) return json({ ok: false, error: "empresa_id_requerido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg, error: cfgError } = await supabase
      .from("empresa_config")
      .select("whatsapp_habilitado, whatsapp_provider, whatsapp_base_url, whatsapp_phone_number_id, whatsapp_api_key_ref, whatsapp_reintentos_max")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (cfgError) throw cfgError;
    if (!cfg?.whatsapp_habilitado) return json({ ok: true, procesados: 0, estado: "apagado" });

    if (simulate_status) {
      const { data: simulated } = await supabase
        .from("whatsapp_envios")
        .update({ estado: "entregado", updated_at: new Date().toISOString(), proveedor_respuesta: { simulated: true, delivered: true } })
        .eq("empresa_id", empresaId)
        .in("estado", ["simulado", "enviado"])
        .select("id");
      return json({ ok: true, simulados_entregados: simulated?.length || 0 });
    }

    const provider = cfg.whatsapp_provider || "simulado";
    const { data: rows, error } = await supabase
      .from("whatsapp_envios")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("estado", provider === "simulado" ? "simulado" : "encolado")
      .lt("intentos", cfg.whatsapp_reintentos_max || 3)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    let procesados = 0;
    for (const row of rows || []) {
      if (provider === "simulado") {
        await supabase.from("whatsapp_envios").update({
          estado: "entregado",
          intentos: Number(row.intentos || 0) + 1,
          proveedor_respuesta: { simulated: true, template: row.proveedor_template, variables: row.variables },
          proveedor_message_id: `sim_${row.id}`,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        procesados += 1;
        continue;
      }

      const apiKeyName = cfg.whatsapp_api_key_ref || "WHATSAPP_API_KEY";
      const apiKey = Deno.env.get(apiKeyName);
      if (!cfg.whatsapp_base_url || !cfg.whatsapp_phone_number_id || !apiKey) {
        await supabase.from("whatsapp_envios").update({
          estado: "fallido",
          ultimo_error: "proveedor_sin_configurar",
          intentos: Number(row.intentos || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        continue;
      }

      const response = await fetch(cfg.whatsapp_base_url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: cfg.whatsapp_phone_number_id,
          to: row.telefono,
          template: row.proveedor_template,
          variables: row.variables,
          client_reference_id: row.id,
        }),
      });
      const providerBody = await response.json().catch(() => ({}));
      await supabase.from("whatsapp_envios").update({
        estado: response.ok ? "enviado" : "fallido",
        intentos: Number(row.intentos || 0) + 1,
        proveedor_message_id: providerBody?.messages?.[0]?.id || providerBody?.id || null,
        proveedor_respuesta: providerBody,
        ultimo_error: response.ok ? null : JSON.stringify(providerBody).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      procesados += 1;
    }

    return json({ ok: true, procesados, provider });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
