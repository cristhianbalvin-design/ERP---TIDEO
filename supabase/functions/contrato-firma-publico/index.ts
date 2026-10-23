import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";
import { crearOtpFirma, distribuirTextoPdf, extraerIpCliente, mensajeMotivoFirma, sha256Hex } from "../_shared/contratoFirma.js";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_APP_URL") || "").replace(/\/$/, "");
const corsHeaders = (origin: string) => ({ "Access-Control-Allow-Origin": APP_URL && origin === new URL(APP_URL).origin ? origin : APP_URL, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const json = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const generic = "No se pudo encontrar o procesar esta solicitud. Verifica el enlace o contacta con Recursos Humanos.";

async function cargarSolicitud(admin: ReturnType<typeof createClient>, token: string) {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const { data } = await admin.from("contrato_firma_solicitudes").select("*").eq("token_hash", hash).maybeSingle();
  return data || null;
}
async function cargarPdf(admin: ReturnType<typeof createClient>, solicitud: any) {
  const { data, error } = await admin.storage.from(solicitud.pdf_bucket).download(solicitud.pdf_path);
  if (error || !data) throw new Error("pdf");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (await sha256Hex(bytes) !== solicitud.pdf_sha256) throw new Error("hash");
  return bytes;
}
async function destinos(admin: ReturnType<typeof createClient>, s: any) {
  const table = s.personal_tipo === "operativo" ? "personal_operativo" : "personal_administrativo";
  const { data } = await admin.from(table).select("*").eq("id", s.personal_id).eq("empresa_id", s.empresa_id).maybeSingle();
  return data;
}
const escapePdf = (v: unknown) => String(v ?? "").replace(/[^\x20-\xFF]/g, "?");

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (APP_URL && origin && origin !== new URL(APP_URL).origin) return json({ ok: false, error: generic }, 403, origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, error: generic }, 405, origin);
  const url = Deno.env.get("SUPABASE_URL"); const key = getSupabaseServiceRoleKey();
  if (!url || !key || !APP_URL) return json({ ok: false, error: "El servicio no está disponible." }, 503, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let input: any;
  try { input = await req.json(); } catch { return json({ ok: false, error: generic }, 400, origin); }
  const token = String(input.token || ""); const action = String(input.accion || "info");
  const s = await cargarSolicitud(admin, token);
  if (!s) return json({ ok: false, error: generic }, 404, origin);
  if (s.estado === "pendiente" || s.estado === "otp_enviado") {
    if (new Date(s.expira_en).getTime() <= Date.now()) {
      await admin.from("contrato_firma_solicitudes").update({ estado: "expirado", updated_at: new Date().toISOString() }).eq("id", s.id);
      s.estado = "expirado";
    }
  }
  if (action === "info") {
    const { data: empresa } = await admin.from("empresas").select("razon_social,nombre_comercial").eq("id", s.empresa_id).maybeSingle();
    const empresaNombre = empresa?.razon_social || empresa?.nombre_comercial || "EMPRESA";
    if (["firmado", "anulado", "expirado"].includes(s.estado)) {
      let pdfFirmadoUrl: string | null = null;
      if (s.estado === "firmado" && s.pdf_firmado_path) {
        const { data } = await admin.storage.from(s.pdf_bucket).createSignedUrl(s.pdf_firmado_path, 3600);
        pdfFirmadoUrl = data?.signedUrl || null;
      }
      return json({ ok: true, estado: s.estado, canales: s.canales, expira_en: s.expira_en, destino_email_mask: s.destino_email_mask, destino_telefono_mask: s.destino_telefono_mask, pdf_firmado_url: pdfFirmadoUrl, empresa_nombre: empresaNombre }, 200, origin);
    }
    try {
      const { data: pdf, error } = await admin.storage.from(s.pdf_bucket).createSignedUrl(s.pdf_path, 300);
      if (error || !pdf?.signedUrl) throw error;
      return json({ ok: true, estado: s.estado, canales: s.canales, expira_en: s.expira_en, destino_email_mask: s.destino_email_mask, destino_telefono_mask: s.destino_telefono_mask, pdf_url: pdf.signedUrl, nombre_archivo: "Contrato de renovación", empresa_nombre: empresaNombre }, 200, origin);
    } catch { return json({ ok: false, error: generic }, 404, origin); }
  }
  if (["firmado", "anulado", "expirado"].includes(s.estado)) return json({ ok: false, estado: s.estado, error: mensajeMotivoFirma(s.estado) }, 409, origin);
  const persona = await destinos(admin, s);
  if (!persona) return json({ ok: false, error: generic }, 404, origin);

  if (action === "enviar_otp") {
    const canal = String(input.canal || "");
    if (!s.canales?.includes(canal) || !["whatsapp", "email"].includes(canal)) return json({ ok: false, error: "Ese canal no está disponible para esta solicitud." }, 400, origin);
    if (canal === "email" && (!String(persona.email_personal || persona.email || "") || !Deno.env.get("RESEND_API_KEY"))) return json({ ok: false, error: "No se puede enviar el código por correo. Contacta con Recursos Humanos." }, 400, origin);
    if (canal === "whatsapp") {
      const phone = String(persona.celular_whatsapp || persona.celular_personal || persona.telefono_personal || persona.telefono || "").replace(/\D/g, "");
      const { data: matrix } = await admin.from("whatsapp_matriz_destinatarios").select("*").eq("empresa_id", s.empresa_id).eq("tipo_alerta", "firma_contrato_otp").eq("estado", "activo").maybeSingle();
      const { data: cfg } = await admin.from("empresa_config").select("whatsapp_habilitado").eq("empresa_id", s.empresa_id).maybeSingle();
      const { data: tpl } = await admin.from("whatsapp_plantillas").select("id,proveedor_template").eq("empresa_id", s.empresa_id).eq("tipo_alerta", "firma_contrato_otp").eq("estado", "activo").maybeSingle();
      if (!phone || (matrix?.requiere_opt_in_colaborador !== false && !persona.whatsapp_opt_in) || !matrix?.enviar_colaborador || !cfg?.whatsapp_habilitado || !tpl?.proveedor_template) return json({ ok: false, error: "No se puede enviar el código por WhatsApp. Contacta con Recursos Humanos." }, 400, origin);
    }
    const otp = crearOtpFirma();
    const { data: registered, error: rpcError } = await admin.rpc("registrar_otp_firma", { p_solicitud_id: s.id, p_otp: `${otp}:${canal}` });
    if (rpcError || !registered?.ok) return json({ ok: false, error: mensajeMotivoFirma(registered?.motivo || "no_existe") }, 409, origin);
    let sent = false;
    if (canal === "email") {
      const email = String(persona.email_personal || persona.email || ""); const resend = Deno.env.get("RESEND_API_KEY");
      if (!email || !resend) return json({ ok: false, error: !email ? "No hay correo personal registrado." : "El envío de correo no está configurado." }, 400, origin);
      const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "TIDEO <notificaciones@tideo.tech>", to: [email], subject: "Código para firmar tu contrato", html: `<p>Tu código de firma es <strong>${otp}</strong>.</p><p>Vence en 10 minutos. No compartas este código.</p>` }) });
      sent = result.ok;
    } else {
      const phone = String(persona.celular_whatsapp || persona.celular_personal || persona.telefono_personal || persona.telefono || "").replace(/\D/g, "");
      const { data: matrix } = await admin.from("whatsapp_matriz_destinatarios").select("*").eq("empresa_id", s.empresa_id).eq("tipo_alerta", "firma_contrato_otp").eq("estado", "activo").maybeSingle();
      const { data: cfg } = await admin.from("empresa_config").select("whatsapp_habilitado,whatsapp_provider").eq("empresa_id", s.empresa_id).maybeSingle();
      const { data: tpl } = await admin.from("whatsapp_plantillas").select("proveedor_template").eq("empresa_id", s.empresa_id).eq("tipo_alerta", "firma_contrato_otp").eq("estado", "activo").maybeSingle();
      if (!phone || !persona.whatsapp_opt_in || !matrix?.enviar_colaborador || !cfg?.whatsapp_habilitado || !tpl?.proveedor_template) return json({ ok: false, error: "No se puede enviar por WhatsApp. Contacta con Recursos Humanos." }, 400, origin);
      const { data: template } = await admin.from("whatsapp_plantillas").select("id").eq("empresa_id", s.empresa_id).eq("tipo_alerta", "firma_contrato_otp").eq("estado", "activo").maybeSingle();
      const envioNro = 3 - Number(registered.envios_restantes ?? 2);
      const { error } = await admin.from("whatsapp_envios").insert({ empresa_id: s.empresa_id, tipo_alerta: "firma_contrato_otp", destinatario_tipo: "colaborador", destinatario_user_id: persona.auth_user_id || null, personal_id: s.personal_id, personal_tipo: s.personal_tipo, telefono: phone, plantilla_id: template?.id || null, proveedor: cfg.whatsapp_provider || "simulado", proveedor_template: tpl.proveedor_template, variables: { colaborador: persona.nombre || "", codigo: otp }, referencia_tipo: "contrato_firma_solicitud", referencia_id: `${s.id}:${envioNro}`, estado: cfg.whatsapp_provider === "simulado" ? "simulado" : "encolado", intentos: 0 });
      sent = !error;
    }
    if (!sent) return json({ ok: false, error: "No se pudo enviar el código. Intenta nuevamente o contacta con Recursos Humanos." }, 502, origin);
    return json({ ok: true, expira_en: registered.otp_expira_en, envios_restantes: registered.envios_restantes }, 200, origin);
  }
  if (action !== "firmar") return json({ ok: false, error: generic }, 400, origin);
  if (input.acepto !== true) return json({ ok: false, error: "Debes aceptar expresamente el contrato para firmar." }, 400, origin);
  if (!s.canales?.includes(String(input.canal || ""))) return json({ ok: false, error: "Solicita un código por un canal habilitado para esta solicitud." }, 400, origin);
  const otp = String(input.otp || "");
  if (!/^\d{6}$/.test(otp)) return json({ ok: false, error: "Ingresa el código de seis dígitos." }, 400, origin);
  const verified = await admin.rpc("verificar_otp_firma", { p_solicitud_id: s.id, p_otp: `${otp}:${String(input.canal || "")}` });
  if (verified.error || !verified.data?.ok) return json({ ok: false, error: mensajeMotivoFirma(verified.data?.motivo || "sin_otp_vigente", verified.data?.intentos_restantes) }, 400, origin);
  const canalesInvitacion = [...(s.canales || [])];
  const { error: canalError } = await admin.from("contrato_firma_solicitudes").update({ canales: [String(input.canal)], updated_at: new Date().toISOString() }).eq("id", s.id);
  if (canalError) return json({ ok: false, error: "No se pudo guardar el canal verificado. Solicita otro código." }, 500, origin);
  let uploadedPath: string | null = null;
  try {
    const original = await cargarPdf(admin, s);
    const pdf = await PDFDocument.load(original); let page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const width = page.getWidth() - 96; let y = page.getHeight() - 64;
    const draw = (text: string, size = 10, isBold = false) => {
      const activeFont = isBold ? bold : font;
      const layout = distribuirTextoPdf({ texto: text, font: activeFont, size, maxWidth: width, lineHeight: size * 1.5, startY: y, bottomY: 48, pageHeight: page.getHeight() });
      let localPage = 0;
      for (const row of layout.positioned) {
        while (row.page > localPage) { page = pdf.addPage(); localPage += 1; }
        page.drawText(escapePdf(row.text), { x: 48, y: row.y, size, font: activeFont, color: rgb(0.12, 0.17, 0.25) });
      }
      for (let i = 0; i < localPage; i += 1) y = page.getHeight() - 64;
      y = layout.nextY;
    };
    draw("CONSTANCIA DE FIRMA ELECTRÓNICA", 15, true); y -= 10;
    draw(`Trabajador: ${persona.nombre || ""}`, 11); draw(`Documento de identidad: ${persona.documento || persona.dni || ""}`);
    draw(`Fecha y hora UTC: ${new Date().toISOString()}`); draw(`Dirección IP: ${extraerIpCliente(req.headers)}`);
    draw(`Canal OTP: ${String(input.canal || "no indicado")}`); draw(`Huella SHA-256 del contrato original: ${s.pdf_sha256}`);
    draw(`Identificador de solicitud: ${s.id}`); y -= 14;
    draw("El trabajador declara su aceptación mediante firma electrónica simple realizada desde un enlace personal y verificación de identidad con código de un solo uso (OTP).", 10);
    const signed = await pdf.save(); const signedHash = await sha256Hex(signed);
    uploadedPath = `${s.empresa_id}/personal/${s.personal_id}/contratos-firmados/${s.id}.pdf`;
    const upload = await admin.storage.from(s.pdf_bucket).upload(uploadedPath, signed, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw new Error("upload");
    const evidence = { metodo: "enlace_otp", canal: String(input.canal || ""), canales_invitacion: canalesInvitacion, hash_original: s.pdf_sha256, solicitud_id: s.id, aceptacion_expresa: true };
    const final = await admin.rpc("finalizar_firma_contrato", { p_solicitud_id: s.id, p_pdf_firmado_path: uploadedPath, p_pdf_firmado_sha256: signedHash, p_ip: extraerIpCliente(req.headers), p_user_agent: (req.headers.get("user-agent") || "").slice(0, 500), p_evidencia: evidence });
    if (final.error || !final.data?.ok) throw new Error("finalize");
    const { data: file } = await admin.storage.from(s.pdf_bucket).createSignedUrl(uploadedPath, 3600);
    return json({ ok: true, firmado_en: final.data.firmado_en, pdf_url: file?.signedUrl || null }, 200, origin);
  } catch {
    if (uploadedPath) await admin.storage.from(s.pdf_bucket).remove([uploadedPath]);
    return json({ ok: false, error: "No se pudo finalizar la firma. Contacta con Recursos Humanos." }, 500, origin);
  }
});
