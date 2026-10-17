import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";
import { crearOtpFirma, distribuirTextoPdf, sha256Hex, extraerIpCliente } from "../_shared/contratoFirma.js";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_APP_URL") || "").replace(/\/$/, "");
const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || APP_URL, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Vary": "Origin" } });
const storagePath = (ref: string, bucket: string): string | null => {
  try { if (!ref.startsWith("http")) return ref; const url = new URL(ref); for (const kind of ["sign", "public"]) { const marker = `/storage/v1/object/${kind}/${bucket}/`; if (url.pathname.includes(marker)) return decodeURIComponent(url.pathname.split(marker)[1]); } } catch { /* URL inválida */ }
  return null;
};
const escapePdf = (v: unknown) => String(v ?? "").replace(/[^\x20-\xFF]/g, "?");

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (origin && APP_URL && new URL(APP_URL).origin !== origin) return json({ ok: false, error: "Origen no permitido." }, 403, APP_URL);
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405, origin);
  const url = Deno.env.get("SUPABASE_URL"); const anon = getSupabaseAnonKey(); const key = getSupabaseServiceRoleKey();
  if (!url || !anon || !key || !APP_URL) return json({ ok: false, error: "Configuración incompleta." }, 500, origin);
  const authorization = req.headers.get("Authorization") || "";
  const user = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await user.auth.getUser();
  if (authError || !auth.user) return json({ ok: false, error: "Sesión inválida." }, 401, origin);
  let input: Record<string, unknown>; try { input = await req.json(); } catch { return json({ ok: false, error: "Solicitud inválida." }, 400, origin); }
  const action = String(input.accion || ""); const id = String(input.id || "");
  if (action === "crear") {
    const documentoId = String(input.documento_id || ""); const firmanteId = String(input.firmante_id || "");
    if (!documentoId || !firmanteId) return json({ ok: false, error: "Datos incompletos." }, 400, origin);
    const { data: doc } = await user.from("personal_documentos").select("*").eq("id", documentoId).maybeSingle();
    if (!doc || doc.estado_firma === "firmado_trabajador") return json({ ok: false, error: "No se encontró un contrato disponible para firma." }, 404, origin);
    const bucket = doc.bucket || "documentos-privados"; const path = storagePath(String(doc.archivo_url || ""), bucket);
    if (!path) return json({ ok: false, error: "No se pudo acceder al PDF del contrato." }, 400, origin);
    const { data: firmante } = await user.from("contrato_firmantes_autorizados").select("id,empresa_id,sociedad_id,usuario_id,nombre,documento,cargo,activo").eq("id", firmanteId).maybeSingle();
    if (!firmante?.activo || firmante.empresa_id !== doc.empresa_id || (firmante.sociedad_id && firmante.sociedad_id !== doc.sociedad_id)) return json({ ok: false, error: "El firmante no está autorizado para este contrato." }, 403, origin);
    const { data: viva } = await admin.from("contrato_firma_empleador").select("id").eq("documento_id", doc.id).in("estado", ["pendiente", "otp_enviado", "firmado"]).maybeSingle();
    if (viva) return json({ ok: false, error: "Este contrato ya tiene una firma de empresa activa." }, 409, origin);
    const { data: pdf, error: downloadError } = await admin.storage.from(bucket).download(path);
    if (downloadError || !pdf) return json({ ok: false, error: "No se pudo leer el PDF del contrato." }, 500, origin);
    const pdfHash = await sha256Hex(new Uint8Array(await pdf.arrayBuffer())); const firmaId = crypto.randomUUID();
    const channels = Array.isArray(input.canales) ? input.canales.map(String).filter((c) => ["whatsapp", "email"].includes(c)) : ["whatsapp", "email"];
    const { error } = await admin.from("contrato_firma_empleador").insert({ id: firmaId, empresa_id: doc.empresa_id, sociedad_id: doc.sociedad_id || null, documento_id: doc.id, personal_id: doc.personal_id, personal_tipo: doc.personal_tipo, firmante_id: firmante.id, firmante_usuario_id: firmante.usuario_id, firmante_nombre: firmante.nombre, firmante_documento: firmante.documento, firmante_cargo: firmante.cargo, canales_trabajador: channels, pdf_bucket: bucket, pdf_path: path, pdf_sha256: pdfHash, estado: "pendiente", created_by: auth.user.id });
    if (error) return json({ ok: false, error: "No se pudo preparar la firma de la empresa." }, 409, origin);
    return json({ ok: true, id: firmaId, es_firmante: firmante.usuario_id === auth.user.id, firmante: firmante.nombre }, 200, origin);
  }
  const { data: firma } = await user.from("contrato_firma_empleador").select("*").eq("id", id).maybeSingle();
  if (!firma) return json({ ok: false, error: "No se encontró la firma." }, 404, origin);
  const soloFirmante = firma.firmante_usuario_id === auth.user.id;
  if (action === "info") {
    if (!soloFirmante) return json({ ok: false, error: "Solo el firmante autorizado puede firmar este contrato." }, 403, origin);
    const { data: signed, error } = await admin.storage.from(firma.pdf_bucket).createSignedUrl(firma.pdf_path, 300);
    if (error || !signed) return json({ ok: false, error: "No se pudo preparar el PDF para firma." }, 500, origin);
    return json({ ok: true, firma: { id: firma.id, documento_id: firma.documento_id, empresa_id: firma.empresa_id, estado: firma.estado, firmante_nombre: firma.firmante_nombre, firmante_documento: firma.firmante_documento, firmante_cargo: firma.firmante_cargo, canales_trabajador: firma.canales_trabajador, pdf_url: signed.signedUrl } }, 200, origin);
  }
  if (action === "enviar_otp") {
    if (!soloFirmante) return json({ ok: false, error: "Solo el firmante autorizado puede solicitar el código." }, 403, origin);
    const { data: firmanteActivo } = await admin.from("contrato_firmantes_autorizados").select("activo").eq("id", firma.firmante_id).maybeSingle();
    if (!firmanteActivo?.activo) return json({ ok: false, error: "El firmante autorizado fue desactivado y ya no puede firmar este contrato." }, 403, origin);
    const email = String(auth.user.email || "").trim(); const resend = Deno.env.get("RESEND_API_KEY");
    if (!email || !resend) return json({ ok: false, error: "No se pudo enviar el código al correo de la cuenta." }, 400, origin);
    const otp = crearOtpFirma(); const { data: registered, error } = await admin.rpc("registrar_otp_firma_empleador", { p_firma_id: firma.id, p_otp: otp });
    if (error || !registered?.ok) return json({ ok: false, error: "No se pudo generar un código de firma." }, 409, origin);
    const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "TIDEO <notificaciones@tideo.tech>", to: [email], subject: "Código para firmar como empresa", html: `<p>Tu código para firmar el contrato como representante de la empresa es:</p><p style="font-size:24px;font-weight:bold;letter-spacing:5px">${otp}</p><p>Vence en 10 minutos.</p>` }) });
    if (!sent.ok) return json({ ok: false, error: "No se pudo enviar el código al correo de la cuenta." }, 502, origin);
    return json({ ok: true }, 200, origin);
  }
  if (action === "firmar") {
    if (!soloFirmante || input.acepto !== true) return json({ ok: false, error: "Solo el firmante puede aceptar y firmar este contrato." }, 403, origin);
    const { data: firmanteActivo } = await admin.from("contrato_firmantes_autorizados").select("activo").eq("id", firma.firmante_id).maybeSingle();
    if (!firmanteActivo?.activo) return json({ ok: false, error: "El firmante autorizado fue desactivado y ya no puede firmar este contrato." }, 403, origin);
    const { data: verified, error: verifyError } = await admin.rpc("verificar_otp_firma_empleador", { p_firma_id: firma.id, p_otp: String(input.otp || "") });
    if (verifyError || !verified?.ok) return json({ ok: false, error: "El código no es válido o venció.", motivo: verified?.motivo }, 400, origin);
    const { data: original, error: downloadError } = await admin.storage.from(firma.pdf_bucket).download(firma.pdf_path);
    if (downloadError || !original) return json({ ok: false, error: "No se pudo leer el contrato." }, 500, origin);
    const originalBytes = new Uint8Array(await original.arrayBuffer()); const hash = await sha256Hex(originalBytes);
    if (hash !== firma.pdf_sha256) return json({ ok: false, error: "El contrato cambió después de iniciar la firma." }, 409, origin);
    const { data: doc } = await admin.from("personal_documentos").select("id,empresa_id,sociedad_id,personal_id,personal_tipo").eq("id", firma.documento_id).maybeSingle();
    if (!doc) return json({ ok: false, error: "No se encontró el contrato." }, 404, origin);
    const [sociedadRes, empresaRes] = doc.sociedad_id
      ? await Promise.all([admin.from("sociedades").select("razon_social,ruc").eq("id", doc.sociedad_id).maybeSingle(), admin.from("empresas").select("razon_social,ruc").eq("id", doc.empresa_id).maybeSingle()])
      : [null, await admin.from("empresas").select("razon_social,ruc").eq("id", doc.empresa_id).maybeSingle()];
    const empleador = sociedadRes?.data || empresaRes?.data || {}; const email = auth.user.email || ""; const fecha = new Date().toISOString(); const ip = extraerIpCliente(req.headers);
    const pdfDoc = await PDFDocument.load(originalBytes); let page = pdfDoc.addPage(); const font = await pdfDoc.embedFont(StandardFonts.Helvetica); const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const lines = ["CONSTANCIA DE FIRMA ELECTR\u00d3NICA DEL EMPLEADOR", `Empleador: ${empleador.razon_social || ""} \u00b7 RUC ${empleador.ruc || ""}`, `Representante: ${firma.firmante_nombre || ""}`, `Documento: ${firma.firmante_documento || ""} \u00b7 Cargo: ${firma.firmante_cargo || ""}`, `Correo de la cuenta: ${email}`, `Fecha y hora UTC: ${fecha}`, `Direcci\u00f3n IP: ${ip}`, `Huella del PDF original (SHA-256): ${hash}`, `Identificador de firma: ${firma.id}`, "Acepto suscribir este contrato mediante firma electr\u00f3nica simple, con mi sesi\u00f3n autenticada y el c\u00f3digo de un solo uso enviado al correo de mi cuenta."];
    let y = page.getHeight() - 60;
    const draw = (text: string, size: number, activeFont: typeof font) => {
      let localPage = 0;
      const safeText = escapePdf(text);
      const layout = distribuirTextoPdf({ texto: safeText, font: activeFont, size, maxWidth: page.getWidth() - 84, lineHeight: size * 1.5, startY: y, bottomY: 48, pageHeight: page.getHeight() });
      for (const row of layout.positioned) {
        while (row.page > localPage) { page = pdfDoc.addPage(); localPage += 1; }
        page.drawText(escapePdf(row.text), { x: 42, y: row.y, size, font: activeFont, color: rgb(0.08, 0.17, 0.32) });
      }
      y = layout.nextY;
    };
    draw(lines[0], 15, bold); y -= 12;
    for (const line of lines.slice(1)) draw(line, 10, font);
    const finalBytes = await pdfDoc.save(); const signedPath = `${doc.empresa_id}/personal/${doc.personal_id}/contratos-firmados/empresa-${firma.id}.pdf`; const finalHash = await sha256Hex(finalBytes);
    const { error: uploadError } = await admin.storage.from(firma.pdf_bucket).upload(signedPath, finalBytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return json({ ok: false, error: "No se pudo guardar el contrato firmado." }, 500, origin);
    const { error: finalizeError } = await admin.rpc("finalizar_firma_empleador", { p_firma_id: firma.id, p_pdf_firmado_path: signedPath, p_pdf_firmado_sha256: finalHash, p_ip: ip, p_user_agent: req.headers.get("user-agent") || "", p_evidencia: { correo: email, pdf_original_sha256: hash, empresa: empleador } });
    if (finalizeError) { await admin.storage.from(firma.pdf_bucket).remove([signedPath]); return json({ ok: false, error: "No se pudo completar la firma de la empresa." }, 409, origin); }
    return json({ ok: true, firmado_en: fecha, pdf_firmado_path: signedPath }, 200, origin);
  }
  if (action === "anular") {
    const { data: doc } = await user.from("personal_documentos").select("id,empresa_id,estado_firma").eq("id", firma.documento_id).maybeSingle();
    if (!doc) return json({ ok: false, error: "No tienes acceso al contrato." }, 403, origin);
    if (firma.estado === "firmado") {
      const { data: viva } = await admin.from("contrato_firma_solicitudes").select("id").eq("documento_id", doc.id).in("estado", ["pendiente", "otp_enviado", "firmado"]).maybeSingle();
      if (viva || doc.estado_firma === "firmado_trabajador") return json({ ok: false, error: "No se puede anular después de iniciar o completar la firma del trabajador." }, 409, origin);
    }
    if (firma.estado === "anulado") return json({ ok: true }, 200, origin);
    const { error } = await admin.from("contrato_firma_empleador").update({ estado: "anulado", updated_at: new Date().toISOString() }).eq("id", firma.id).in("estado", ["pendiente", "otp_enviado", "firmado"]);
    if (error) return json({ ok: false, error: "No se pudo anular la firma de la empresa." }, 409, origin);
    if (firma.estado === "firmado") {
      const { error: restoreError } = await admin.from("personal_documentos").update({ archivo_url: firma.pdf_path, bucket: firma.pdf_bucket, nombre_archivo: String((await admin.from("personal_documentos").select("nombre_archivo").eq("id", doc.id).maybeSingle()).data?.nombre_archivo || "Contrato.pdf").replace(/ \(firmado empresa\)\.pdf$/i, ".pdf") }).eq("id", doc.id).eq("empresa_id", doc.empresa_id);
      if (restoreError) return json({ ok: false, error: "La firma quedó anulada, pero no se pudo restaurar el contrato." }, 500, origin);
    }
    return json({ ok: true }, 200, origin);
  }
  return json({ ok: false, error: "Acción no válida." }, 400, origin);
});
