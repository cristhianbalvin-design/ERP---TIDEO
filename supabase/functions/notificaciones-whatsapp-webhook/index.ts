import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";
import { compararConstanteTiempo, extraerEstadosWhatsApp, verificarFirmaWhatsApp } from "../_shared/notificacionesWebhook.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode") || "";
    const token = url.searchParams.get("hub.verify_token") || "";
    const challenge = url.searchParams.get("hub.challenge") || "";
    const secreto = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "";
    if (mode === "subscribe" && secreto && compararConstanteTiempo(token, secreto)) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ ok: false, error: "metodo_no_permitido" }, 405);
  const cuerpo = await req.text();
  const secreto = Deno.env.get("WHATSAPP_APP_SECRET") || "";
  const firma = req.headers.get("X-Hub-Signature-256") || "";
  if (!secreto || !await verificarFirmaWhatsApp(cuerpo, firma, secreto)) {
    return json({ ok: false, error: "firma_invalida" }, 401);
  }

  let payload: unknown;
  try { payload = JSON.parse(cuerpo); } catch {
    console.error("notificaciones-whatsapp-webhook: cuerpo JSON inválido");
    return json({ ok: false, procesados: 0, actualizados: 0, errores: 1 });
  }
  const estados = extraerEstadosWhatsApp(payload);
  const serviceKey = getSupabaseServiceRoleKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    console.error("notificaciones-whatsapp-webhook: Supabase no configurado");
    return json({ ok: false, procesados: estados.length, actualizados: 0, errores: estados.length });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const resultados = await Promise.all(estados.map(async (estado) => {
    try {
      const { data, error } = await supabase.rpc("notif_registrar_estado_whatsapp", {
        p_proveedor_id: estado.id,
        p_estado: estado.estado,
        p_momento: estado.momento,
        p_error: estado.error,
      });
      if (error) {
        console.error("notificaciones-whatsapp-webhook: error al registrar estado", error.message);
        return { actualizados: 0, error: true };
      }
      return { actualizados: Number(data) || 0, error: false };
    } catch (error) {
      console.error("notificaciones-whatsapp-webhook: error al registrar estado", error instanceof Error ? error.message : String(error));
      return { actualizados: 0, error: true };
    }
  }));
  const actualizados = resultados.reduce((total, resultado) => total + resultado.actualizados, 0);
  const errores = resultados.filter(resultado => resultado.error).length;
  return json({ ok: errores === 0, procesados: estados.length, actualizados, errores });
});
