import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "reclutamiento-cv";
const TICKET_TTL_MS = 15 * 60 * 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo no permitido" }, 405);

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const publicToken = String(body?.public_token || "").trim();

    if (!publicToken || publicToken.length > 512) {
      return jsonResponse({ error: "Vacante no disponible" }, 404);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("crear-upload-cv-publico: faltan secretos de Supabase");
      return jsonResponse({ error: "Servicio temporalmente no disponible" }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: vacante, error: vacanteError } = await admin
      .from("rrhh_vacantes")
      .select("id, empresa_id")
      .eq("public_token", publicToken)
      .eq("estado", "abierta")
      .maybeSingle();

    if (vacanteError) {
      console.error("crear-upload-cv-publico: error resolviendo vacante", vacanteError.message);
      return jsonResponse({ error: "Servicio temporalmente no disponible" }, 503);
    }
    if (!vacante?.id || !vacante?.empresa_id) {
      return jsonResponse({ error: "Vacante no disponible" }, 404);
    }

    const ticketId = crypto.randomUUID();
    const objectId = crypto.randomUUID();
    const objectPath = `${vacante.empresa_id}/reclutamiento/${vacante.id}/${objectId}`;
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();

    // Generar la firma no crea el objeto. Solo se devuelve al cliente si el
    // ticket privado queda registrado correctamente.
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(objectPath, { upsert: false });

    if (signedError || !signed?.token || !signed?.signedUrl) {
      console.error(
        "crear-upload-cv-publico: no se pudo firmar la subida",
        signedError?.message || "respuesta incompleta",
      );
      return jsonResponse({ error: "No se pudo preparar la subida del CV" }, 503);
    }

    const { error: ticketError } = await admin
      .from("rrhh_postulacion_upload_tickets")
      .insert({
        id: ticketId,
        empresa_id: vacante.empresa_id,
        vacante_id: vacante.id,
        bucket_id: BUCKET,
        object_path: objectPath,
        expires_at: expiresAt,
      });

    if (ticketError) {
      console.error("crear-upload-cv-publico: no se pudo registrar ticket", ticketError.message);
      return jsonResponse({ error: "No se pudo preparar la subida del CV" }, 503);
    }

    return jsonResponse({
      ticket_id: ticketId,
      bucket: BUCKET,
      path: objectPath,
      signed_url: signed.signedUrl,
      upload_token: signed.token,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("crear-upload-cv-publico: error inesperado", error);
    return jsonResponse({ error: "No se pudo preparar la subida del CV" }, 500);
  }
});
