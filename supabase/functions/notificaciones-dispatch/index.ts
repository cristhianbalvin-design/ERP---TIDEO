import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";
import { construirCorreoNotificacion } from "../_shared/notificacionesCorreo.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

function compararSeguro(actual: string, esperada: string): boolean {
  const longitud = Math.max(actual.length, esperada.length);
  let diferencia = actual.length ^ esperada.length;
  for (let i = 0; i < longitud; i += 1) {
    diferencia |= (actual.charCodeAt(i) || 0) ^ (esperada.charCodeAt(i) || 0);
  }
  return diferencia === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "metodo_no_permitido" }, 405);

  const serviceKey = getSupabaseServiceRoleKey();
  const authorization = req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  const bearer = match?.[1] || "";
  if (!serviceKey || !match || !compararSeguro(bearer, serviceKey)) {
    return json({ ok: false, error: "no_autorizado" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return json({ ok: false, error: "supabase_no_configurado" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let limit = 25;
  try {
    const body = await req.json();
    if (body && body.limit !== undefined) {
      const requested = Number(body.limit);
      if (Number.isFinite(requested)) limit = Math.min(100, Math.max(1, Math.floor(requested)));
    }
  } catch { /* cuerpo opcional o vacío */ }

  const { data: rows, error: claimError } = await supabase.rpc("notif_reclamar_correos", { p_limite: limit });
  if (claimError) return json({ ok: false, error: claimError.message, reclamados: 0, enviados: 0, fallidos: 0 }, 500);

  const reclamados = Array.isArray(rows) ? rows : [];
  let enviados = 0;
  let fallidos = 0;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://erp.tideo.tech";
  const from = Deno.env.get("RESEND_FROM") || "TIDEO <notificaciones@tideo.tech>";

  for (const row of reclamados) {
    let ok = false;
    let error = "resend_no_configurado";
    let proveedorId: string | null = null;
    if (apiKey) {
      try {
        const correo = construirCorreoNotificacion(row, appUrl);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [row.destinatario_email], subject: correo.asunto, html: correo.html, text: correo.texto }),
        });
        const result = await response.json().catch(() => ({}));
        ok = response.ok;
        proveedorId = typeof result?.id === "string" ? result.id : null;
        error = ok ? "" : String(result?.message || result?.error || `resend_http_${response.status}`).slice(0, 500);
      } catch (err) {
        error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      }
    }

    let markError: unknown = null;
    try {
      const result = await supabase.rpc("notif_marcar_envio", {
        p_id: row.id,
        p_ok: ok,
        p_error: ok ? null : error,
        p_proveedor_id: proveedorId,
      });
      markError = result.error;
    } catch (err) {
      markError = err;
    }
    if (markError || !ok) fallidos += 1;
    else enviados += 1;
  }

  return json({ ok: fallidos === 0, reclamados: reclamados.length, enviados, fallidos });
});
