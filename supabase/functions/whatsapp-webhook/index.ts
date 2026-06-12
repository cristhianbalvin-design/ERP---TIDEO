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
  if (req.method === "GET") return json({ ok: true });

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const statuses = body?.statuses || body?.entry?.flatMap((e: any) =>
      e?.changes?.flatMap((c: any) => c?.value?.statuses || []) || []
    ) || [];

    let actualizados = 0;
    for (const status of statuses) {
      const providerId = status.id || status.message_id;
      const clientRef = status.client_reference_id || status.metadata?.client_reference_id;
      const estado = status.status === "delivered" ? "entregado"
        : status.status === "sent" ? "enviado"
        : status.status === "failed" ? "fallido"
        : null;
      if (!estado) continue;

      let query = supabase.from("whatsapp_envios").update({
        estado,
        proveedor_respuesta: status,
        ultimo_error: estado === "fallido" ? JSON.stringify(status.errors || status).slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      });
      query = clientRef ? query.eq("id", clientRef) : query.eq("proveedor_message_id", providerId);
      const { error } = await query;
      if (!error) actualizados += 1;
    }

    return json({ ok: true, actualizados });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
