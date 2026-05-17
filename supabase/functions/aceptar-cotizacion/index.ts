import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { token, nombre, dni, ip } = await req.json();
    if (!token || !nombre || !dni) {
      return new Response(JSON.stringify({ ok: false, error: "campos_incompletos" }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Registrar aceptación vía RPC (actualiza cotizacion + oportunidad)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "registrar_aceptacion_cotizacion",
      { p_token: token, p_nombre: nombre, p_dni: dni, p_ip: ip || "desconocida" },
    );

    if (rpcError || !rpcData?.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: rpcData?.error || rpcError?.message }),
        { headers: { ...cors, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Cargar configuración de empresa para el email
    const { data: cfg } = await supabase
      .from("empresa_config")
      .select("razon_social, email_comercial")
      .eq("empresa_id", rpcData.empresa_id)
      .single();

    // Cargar vendedor de la oportunidad (responsable_id → usuarios.email)
    let vendedorEmail: string | null = null;
    if (rpcData.oportunidad_id) {
      const { data: opp } = await supabase
        .from("oportunidades")
        .select("responsable_id")
        .eq("id", rpcData.oportunidad_id)
        .single();
      if (opp?.responsable_id) {
        const { data: usr } = await supabase
          .from("usuarios")
          .select("email")
          .eq("user_id", opp.responsable_id)
          .single();
        vendedorEmail = usr?.email || null;
      }
    }
    // Fallback: notificar al email comercial de la empresa
    const destino = vendedorEmail || cfg?.email_comercial || null;

    // Enviar email de notificación via Resend (requiere RESEND_API_KEY en Supabase)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && destino) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: cfg?.email_comercial || "notificaciones@tideo.tech",
          to: [destino],
          subject: `${nombre} aceptó la cotización ${rpcData.numero}`,
          html: `
            <p>Hola,</p>
            <p><strong>${nombre}</strong> ha aceptado la cotización <strong>${rpcData.numero}</strong> digitalmente.</p>
            ${rpcData.oportunidad_id ? "<p>La oportunidad vinculada ha sido marcada automáticamente como <strong>Ganada</strong>.</p>" : ""}
            <p>Ingresa al ERP TIDEO para ver los detalles de aceptación.</p>
            <br><p style="color:#888;font-size:12px">${cfg?.razon_social || ""}</p>
          `,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 500,
    });
  }
});
