import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";
import { enmascararEmail, enmascararTelefono, sha256Hex, crearTokenFirma } from "../_shared/contratoFirma.js";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_APP_URL") || "").replace(/\/$/, "");
const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || APP_URL, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Vary": "Origin" } });
const storagePath = (ref: string, bucket: string): string | null => {
  try {
    if (!ref.startsWith("http")) return ref;
    const url = new URL(ref); const marker = `/storage/v1/object/sign/${bucket}/`;
    if (url.pathname.includes(marker)) return decodeURIComponent(url.pathname.split(marker)[1]);
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    if (url.pathname.includes(publicMarker)) return decodeURIComponent(url.pathname.split(publicMarker)[1]);
  } catch { /* referencia inválida */ }
  return null;
};

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (origin && APP_URL && new URL(APP_URL).origin !== origin) return json({ ok: false, error: "Origen no permitido." }, 403, APP_URL);
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405, origin);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"); const anon = getSupabaseAnonKey(); const serviceKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !anon || !serviceKey || !APP_URL) return json({ ok: false, error: "Configuración incompleta." }, 500, origin);
  const authorization = req.headers.get("Authorization") || "";
  const user = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await user.auth.getUser();
  if (authError || !auth.user) return json({ ok: false, error: "Sesión inválida." }, 401, origin);
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ ok: false, error: "Solicitud inválida." }, 400, origin); }
  const action = String(input.accion || "crear");
  const docId = String(input.documento_id || ""); const empresaId = String(input.empresa_id || "");
  const membership = await user.rpc("usuario_tiene_empresa", { target_empresa_id: empresaId });
  if (!empresaId || membership.error || membership.data !== true) return json({ ok: false, error: "No tienes acceso a esta empresa." }, 403, origin);
  const permission = await user.rpc("usuario_puede", { target_empresa_id: empresaId, target_pantalla: "rrhh_admin", target_accion: "editar" });
  if (permission.error || permission.data !== true) return json({ ok: false, error: "No tienes permiso para gestionar firmas de contratos." }, 403, origin);
  if (action === "anular") {
    const solicitudId = String(input.solicitud_id || "");
    const { data: solicitud, error } = await user.from("contrato_firma_solicitudes").select("id,empresa_id,estado,documento_id").eq("id", solicitudId).eq("empresa_id", empresaId).maybeSingle();
    if (error || !solicitud || !["pendiente", "otp_enviado"].includes(solicitud.estado)) return json({ ok: false, error: "No se pudo anular la solicitud." }, 409, origin);
    const { data: doc, error: visibleError } = await user.from("personal_documentos").select("id,estado_firma,firma_solicitud_id").eq("id", solicitud.documento_id).eq("empresa_id", empresaId).maybeSingle();
    if (visibleError || !doc) return json({ ok: false, error: "No se pudo encontrar o anular esta solicitud." }, 404, origin);
    const { error: docError, data: docRows } = await admin.from("personal_documentos").update({ estado_firma: "no_requiere", firma_solicitud_id: null }).eq("id", doc.id).eq("firma_solicitud_id", solicitudId).select("id");
    if (docError || !docRows?.length) return json({ ok: false, error: "No se pudo actualizar el documento; la solicitud sigue activa." }, 500, origin);
    const { error: updateError, data: updatedRows } = await admin.from("contrato_firma_solicitudes").update({ estado: "anulado", updated_at: new Date().toISOString() }).eq("id", solicitudId).eq("estado", solicitud.estado).select("id");
    if (updateError || !updatedRows?.length) {
      const rollback = await admin.from("personal_documentos").update({ estado_firma: doc.estado_firma, firma_solicitud_id: solicitudId }).eq("id", doc.id).is("firma_solicitud_id", null);
      if (rollback.error) return json({ ok: false, error: "Falló la anulación y la reversión; se requiere revisión de Recursos Humanos." }, 500, origin);
      return json({ ok: false, error: "No se pudo anular la solicitud; el documento fue restaurado." }, 500, origin);
    }
    return json({ ok: true }, 200, origin);
  }
  if (!docId || !["crear", "reenviar"].includes(action)) return json({ ok: false, error: "Datos incompletos." }, 400, origin);

  const { data: doc, error: docError } = await user.from("personal_documentos").select("*").eq("id", docId).eq("empresa_id", empresaId).maybeSingle();
  if (docError || !doc) return json({ ok: false, error: "No se encontró el contrato." }, 404, origin);
  if (doc.contrato_referencia_id) return json({ ok: false, error: "Las adendas no pueden enviarse a firma como renovaciones." }, 400, origin);
  const bucket = doc.bucket || "documentos-privados"; const path = storagePath(String(doc.archivo_url || ""), bucket);
  const { data: firmaEmpresa } = await admin.from("contrato_firma_empleador").select("id,estado,pdf_firmado_path").eq("documento_id", docId).eq("estado", "firmado").maybeSingle();
  const firmaEmpresaVigente = !!firmaEmpresa && !!path && firmaEmpresa.pdf_firmado_path === path;
  if (!doc.contrato_periodo_predecesor_id && !firmaEmpresaVigente) return json({ ok: false, error: "El contrato de ingreso o primigenio no es una renovación firmable." }, 400, origin);
  if (!doc.contrato_periodo_id || doc.estado_firma === "firmado_trabajador") return json({ ok: false, error: "El documento no cumple las condiciones para una renovación firmable." }, 400, origin);
  if (!firmaEmpresaVigente) return json({ ok: false, error: "El contrato debe estar firmado primero por la empresa." }, 409, origin);
  const { data: viva } = await admin.from("contrato_firma_solicitudes").select("id,estado").eq("documento_id", docId).in("estado", ["pendiente", "otp_enviado"]).maybeSingle();
  if (action === "crear" && viva) return json({ ok: false, error: "Este contrato ya tiene una solicitud de firma activa." }, 409, origin);
  if (action === "reenviar" && !viva) return json({ ok: false, error: "No hay una solicitud activa para reenviar." }, 409, origin);
  if (!path) return json({ ok: false, error: "No se pudo acceder al PDF del contrato." }, 400, origin);
  const download = await admin.storage.from(bucket).download(path);
  if (download.error || !download.data) return json({ ok: false, error: "No se pudo leer el PDF del contrato." }, 500, origin);
  const bytes = new Uint8Array(await download.data.arrayBuffer()); const pdfHash = await sha256Hex(bytes);
  const personalTable = doc.personal_tipo === "operativo" ? "personal_operativo" : "personal_administrativo";
  const { data: persona, error: personaError } = await admin.from(personalTable).select("*").eq("id", doc.personal_id).eq("empresa_id", empresaId).maybeSingle();
  if (personaError || !persona) return json({ ok: false, error: "No se encontraron los datos del trabajador." }, 404, origin);
  const email = String(persona.email_personal || persona.email || "").trim() || null;
  const telefono = String(persona.celular_whatsapp || persona.celular_personal || persona.telefono_personal || persona.telefono || "").replace(/\D/g, "") || null;
  const channels = Array.isArray(input.canales) ? input.canales.map(String).filter((c) => ["whatsapp", "email"].includes(c)) : ["whatsapp", "email"];
  const token = crearTokenFirma(); const tokenHash = await sha256Hex(token); const solicitudId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const rollbackReenvio = async () => {
    const { error: cancelError } = await admin.from("contrato_firma_solicitudes").update({ estado: "anulado", canales: [], updated_at: new Date().toISOString() }).eq("id", solicitudId);
    const { error: priorError } = await admin.from("contrato_firma_solicitudes").update({ estado: viva!.estado, updated_at: new Date().toISOString() }).eq("id", viva!.id).eq("estado", "anulado");
    const { error: docRestoreError } = await admin.from("personal_documentos").update({ estado_firma: doc.estado_firma, firma_solicitud_id: doc.firma_solicitud_id }).eq("id", doc.id).eq("empresa_id", empresaId);
    return !cancelError && !priorError && !docRestoreError;
  };
  if (action === "reenviar" && viva) {
    const { error: priorError, data: priorRows } = await admin.from("contrato_firma_solicitudes").update({ estado: "anulado", updated_at: new Date().toISOString() }).eq("id", viva.id).eq("estado", viva.estado).select("id");
    if (priorError || !priorRows?.length) return json({ ok: false, error: "No se pudo anular la solicitud previa para reenviar." }, 409, origin);
  }
  const insert = await admin.from("contrato_firma_solicitudes").insert({ id: solicitudId, empresa_id: empresaId, sociedad_id: doc.sociedad_id || null, personal_id: doc.personal_id, personal_tipo: doc.personal_tipo, documento_id: doc.id, pdf_bucket: bucket, pdf_path: path, pdf_sha256: pdfHash, token_hash: tokenHash, canales: channels, destino_email_mask: enmascararEmail(email), destino_telefono_mask: enmascararTelefono(telefono), expira_en: expiresAt, created_by: auth.user.id, estado: "pendiente" });
  if (insert.error) {
    if (action === "reenviar" && !await rollbackReenvio()) return json({ ok: false, error: "Falló la reversión del reenvío; se requiere revisión de Recursos Humanos." }, 500, origin);
    return json({ ok: false, error: "No se pudo crear la solicitud de firma." }, 409, origin);
  }
  const { error: markError } = await admin.from("personal_documentos").update({ estado_firma: "pendiente_trabajador", firma_solicitud_id: solicitudId }).eq("id", doc.id).eq("empresa_id", empresaId);
  if (markError) {
    if (action === "reenviar") {
      if (!await rollbackReenvio()) return json({ ok: false, error: "Falló la reversión del reenvío; se requiere revisión de Recursos Humanos." }, 500, origin);
    } else await admin.from("contrato_firma_solicitudes").delete().eq("id", solicitudId);
    return json({ ok: false, error: "No se pudo preparar el contrato." }, 500, origin);
  }
  const link = `${APP_URL}/#firmar/${token}`;
  const canales: Record<string, unknown> = {};
  if (channels.includes("email")) {
    const resend = Deno.env.get("RESEND_API_KEY");
    if (!email) canales.email = { enviado: false, motivo: "sin_correo" };
    else if (!resend) canales.email = { enviado: false, motivo: "proveedor_no_configurado" };
    else {
      try { const nombreSeguro = String(persona.nombre || "").replace(/[&<>"']/g, ""); const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "TIDEO <notificaciones@tideo.tech>", to: [email], subject: "Firma de renovación de contrato", html: `<p>Hola ${nombreSeguro},</p><p>Revisa y firma tu renovación de contrato en el enlace personal:</p><p><a href="${link}">Revisar contrato y firmar</a></p><p>El enlace vence el ${new Date(expiresAt).toLocaleDateString("es-PE")}.</p>` }) }); canales.email = { enviado: result.ok, motivo: result.ok ? null : "error_proveedor" }; }
      catch { canales.email = { enviado: false, motivo: "error_proveedor" }; }
    }
  }
  if (channels.includes("whatsapp")) {
    const { data: matrix } = await admin.from("whatsapp_matriz_destinatarios").select("*").eq("empresa_id", empresaId).eq("tipo_alerta", "firma_contrato_enlace").eq("estado", "activo").maybeSingle();
    const { data: cfg } = await admin.from("empresa_config").select("whatsapp_habilitado,whatsapp_provider,whatsapp_base_url,whatsapp_phone_number_id").eq("empresa_id", empresaId).maybeSingle();
    const { data: tpl } = await admin.from("whatsapp_plantillas").select("id,proveedor_template").eq("empresa_id", empresaId).eq("tipo_alerta", "firma_contrato_enlace").eq("estado", "activo").maybeSingle();
    if (!telefono) canales.whatsapp = { enviado: false, motivo: "sin_telefono" };
    else if (matrix?.requiere_opt_in_colaborador !== false && !persona.whatsapp_opt_in) canales.whatsapp = { enviado: false, motivo: "sin_opt_in" };
    else if (!matrix?.enviar_colaborador) canales.whatsapp = { enviado: false, motivo: "no_habilitado_en_matriz" };
    else if (!cfg?.whatsapp_habilitado || !tpl?.proveedor_template) canales.whatsapp = { enviado: false, motivo: "proveedor_o_plantilla_no_configurados" };
    else {
      const { error } = await admin.from("whatsapp_envios").insert({ empresa_id: empresaId, tipo_alerta: "firma_contrato_enlace", destinatario_tipo: "colaborador", destinatario_user_id: persona.auth_user_id || null, personal_id: persona.id, personal_tipo: doc.personal_tipo, telefono, plantilla_id: tpl.id, proveedor: cfg.whatsapp_provider || "simulado", proveedor_template: tpl.proveedor_template, variables: { colaborador: persona.nombre || "", enlace: link }, referencia_tipo: "contrato_firma_solicitud", referencia_id: solicitudId, estado: cfg.whatsapp_provider === "simulado" ? "simulado" : "encolado", intentos: 0 });
      canales.whatsapp = { enviado: !error, motivo: error ? "error_al_encolar" : "encolado" };
    }
  }
  if (!channels.length) canales.seleccion = { enviado: false, motivo: "sin_canales_seleccionados" };
  const canalesDisponibles = Object.entries(canales).filter(([, result]) => (result as { enviado?: boolean })?.enviado).map(([name]) => name);
  if (!canalesDisponibles.length) {
    const rollbackOk = action === "reenviar"
      ? await rollbackReenvio()
      : !(await admin.from("contrato_firma_solicitudes").update({ estado: "anulado", canales: [], updated_at: new Date().toISOString() }).eq("id", solicitudId)).error && !(await admin.from("personal_documentos").update({ estado_firma: "no_requiere", firma_solicitud_id: null }).eq("id", doc.id).eq("firma_solicitud_id", solicitudId)).error;
    if (!rollbackOk) return json({ ok: false, error: "No se pudo entregar el enlace y falló la reversión; se requiere revisión de Recursos Humanos.", canales }, 500, origin);
    return json({ ok: false, error: "No se pudo entregar el enlace por ningún canal. Revisa el detalle por canal y vuelve a intentarlo.", canales }, 502, origin);
  }
  const { error: channelsError } = await admin.from("contrato_firma_solicitudes").update({ canales: canalesDisponibles, updated_at: new Date().toISOString() }).eq("id", solicitudId);
  if (channelsError) {
    const rollbackOk = action === "reenviar"
      ? await rollbackReenvio()
      : !(await admin.from("contrato_firma_solicitudes").update({ estado: "anulado", canales: [], updated_at: new Date().toISOString() }).eq("id", solicitudId)).error && !(await admin.from("personal_documentos").update({ estado_firma: "no_requiere", firma_solicitud_id: null }).eq("id", doc.id).eq("firma_solicitud_id", solicitudId)).error;
    if (!rollbackOk) return json({ ok: false, error: "No se pudieron guardar los canales y falló la reversión; se requiere revisión de Recursos Humanos.", canales }, 500, origin);
    return json({ ok: false, error: "No se pudo guardar los canales de entrega; la solicitud fue anulada y el documento restaurado.", canales }, 500, origin);
  }
  return json({ ok: true, solicitud_id: solicitudId, expira_en: expiresAt, canales }, 200, origin);
});
