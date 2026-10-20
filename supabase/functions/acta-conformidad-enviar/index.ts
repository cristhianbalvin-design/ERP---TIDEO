// Envía al cliente el acta de conformidad emitida desde el móvil.
// - Conforme / con observaciones: adjunta el PDF registrado del acta.
// - Conformidad pendiente: envía el enlace público para firmar (vence a los 7 días).
// Requiere sesión (verify_jwt) y que el usuario tenga permiso de cierre o sea el técnico responsable de la OT.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_APP_URL") || "").replace(/\/$/, "");
const BUCKET = "actas-conformidad";

// La autorización la da el JWT; el CORS solo acepta la app y los previews de Vercel.
const origenPermitido = (origin: string) => {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    if (APP_URL && url.origin === new URL(APP_URL).origin) return url.origin;
    if (url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) return url.origin;
  } catch { /* origen inválido */ }
  return "";
};

const json = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || APP_URL,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  },
});

const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
const mascara = (correo: string) => {
  const [nombre, dominio] = correo.split("@");
  return dominio ? `${nombre.slice(0, 1)}***@${dominio}` : correo;
};
const fechaLima = (valor: unknown, conHora = true) => {
  if (!valor) return "";
  const d = new Date(String(valor));
  if (Number.isNaN(d.getTime())) return String(valor);
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "America/Lima" }).format(d);
};
const aBase64 = (bytes: Uint8Array) => {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
};

serve(async (req) => {
  const origin = origenPermitido(req.headers.get("Origin") || "");
  if (req.headers.get("Origin") && !origin) return json({ ok: false, error: "Origen no permitido." }, 403, "");
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anon = getSupabaseAnonKey();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !anon || !serviceKey) return json({ ok: false, error: "Configuración incompleta." }, 500, origin);

  const user = createClient(supabaseUrl, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await user.auth.getUser();
  if (authError || !auth.user) return json({ ok: false, error: "Sesión inválida." }, 401, origin);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ ok: false, error: "Solicitud inválida." }, 400, origin); }
  const empresaId = String(input.empresa_id || "");
  const cierreId = String(input.cierre_id || "");
  if (!empresaId || !cierreId) return json({ ok: false, error: "Datos incompletos." }, 400, origin);

  const membresia = await user.rpc("usuario_tiene_empresa", { target_empresa_id: empresaId });
  if (membresia.error || membresia.data !== true) return json({ ok: false, error: "No tienes acceso a esta empresa." }, 403, origin);

  const { data: cierre, error: cierreError } = await admin
    .from("cierres_tecnicos")
    .select("id,empresa_id,orden_trabajo_id,modalidad_acta,acta_bloqueada,acta_numero,acta_snapshot,acta_pdf_path,correo_cliente,conformidad_resultado,token_conformidad,token_conformidad_expira_en")
    .eq("id", cierreId).eq("empresa_id", empresaId).maybeSingle();
  if (cierreError || !cierre || cierre.modalidad_acta !== "acta_movil" || !cierre.acta_bloqueada) return json({ ok: false, error: "No se encontró el acta." }, 404, origin);

  const [permisoCierre, esTecnico] = await Promise.all([
    user.rpc("usuario_puede", { target_empresa_id: empresaId, target_pantalla: "cierre", target_accion: "crear" }),
    user.rpc("usuario_es_tecnico_responsable_ot", { p_empresa_id: empresaId, p_orden_trabajo_id: cierre.orden_trabajo_id }),
  ]);
  if (permisoCierre.data !== true && esTecnico.data !== true) return json({ ok: false, error: "No tienes permiso para enviar esta acta." }, 403, origin);

  const destino = String(cierre.correo_cliente || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) return json({ ok: false, error: "El acta no tiene un correo válido del cliente." }, 409, origin);

  const resend = Deno.env.get("RESEND_API_KEY");
  if (!resend) return json({ ok: false, error: "El proveedor de correo no está configurado." }, 503, origin);

  const s = (cierre.acta_snapshot || {}) as Record<string, any>;
  const pendiente = cierre.conformidad_resultado === "pendiente";
  const empresa = escapar(s.emisor?.razon_social || "");
  const numero = escapar(cierre.acta_numero);
  const ot = escapar(s.ot?.numero || "");
  const servicio = escapar(s.ot?.servicio || s.ot?.descripcion || "");
  const resultadoTexto = cierre.conformidad_resultado === "observaciones" ? "Conforme con observaciones" : pendiente ? "Conformidad pendiente" : "Conforme";

  const attachments: Array<{ filename: string; content: string }> = [];
  let cuerpo = "";
  if (pendiente) {
    if (!cierre.token_conformidad || !APP_URL) return json({ ok: false, error: "El acta no tiene un enlace de firma vigente." }, 409, origin);
    if (cierre.token_conformidad_expira_en && new Date(cierre.token_conformidad_expira_en) <= new Date()) return json({ ok: false, error: "El enlace de firma del acta venció." }, 409, origin);
    const enlace = `${APP_URL}/#conformidad-ot/${cierre.token_conformidad}`;
    cuerpo = `<p>Se cerró el servicio <b>${servicio}</b> (OT ${ot}) y queda pendiente su conformidad.</p>`
      + (s.conformidad?.observaciones ? `<p>Motivo registrado: ${escapar(s.conformidad.observaciones)}</p>` : "")
      + `<p><a href="${enlace}">Revisar el trabajo y dar conformidad</a></p>`
      + `<p>El enlace vence el ${escapar(fechaLima(cierre.token_conformidad_expira_en, false))}.</p>`;
  } else {
    if (!cierre.acta_pdf_path) return json({ ok: false, error: "El PDF del acta aún no está guardado." }, 409, origin);
    const descarga = await admin.storage.from(BUCKET).download(cierre.acta_pdf_path);
    if (descarga.error || !descarga.data) return json({ ok: false, error: "No se pudo leer el PDF del acta." }, 500, origin);
    attachments.push({ filename: `Acta-${String(cierre.acta_numero || "conformidad").replace(/[^A-Za-z0-9-]/g, "-")}.pdf`, content: aBase64(new Uint8Array(await descarga.data.arrayBuffer())) });
    cuerpo = `<p>Adjuntamos el acta de conformidad <b>${numero}</b> del servicio <b>${servicio}</b> (OT ${ot}).</p>`
      + `<p>Resultado: <b>${escapar(resultadoTexto)}</b>${s.conformidad?.observaciones ? ` — ${escapar(s.conformidad.observaciones)}` : ""}</p>`
      + `<p>Emitida el ${escapar(fechaLima(s.emitida_en))} (hora de Lima).</p>`;
  }

  const html = `<div style="font-family:Arial,sans-serif;color:#1F2937;font-size:14px;line-height:1.5">`
    + `<p>Hola${s.firmas?.find?.((f: any) => f.rol === "cliente")?.nombre ? ` ${escapar(s.firmas.find((f: any) => f.rol === "cliente").nombre)}` : ""},</p>`
    + cuerpo
    + `<p style="color:#6B7280;font-size:12px">${empresa}${empresa ? " · " : ""}Enviado con OPERA by Tideo Tech &amp; Strategy</p></div>`;

  let enviado = false;
  let detalle: Record<string, unknown> = {};
  try {
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "TIDEO <notificaciones@tideo.tech>",
        to: [destino],
        subject: pendiente ? `Conformidad pendiente · OT ${s.ot?.numero || ""}` : `Acta de conformidad ${cierre.acta_numero} · OT ${s.ot?.numero || ""}`,
        html,
        ...(attachments.length ? { attachments } : {}),
      }),
    });
    const cuerpoRespuesta = await respuesta.json().catch(() => ({}));
    enviado = respuesta.ok;
    detalle = { proveedor: "resend", status: respuesta.status, id: (cuerpoRespuesta as any)?.id || null, tipo: pendiente ? "enlace" : "pdf" };
  } catch {
    detalle = { proveedor: "resend", status: null, tipo: pendiente ? "enlace" : "pdf", error: "error_red" };
  }

  await admin.from("cierres_tecnicos").update({
    correo_estado: enviado ? "enviado" : "error",
    correo_enviado_en: enviado ? new Date().toISOString() : null,
    correo_detalle: { ...detalle, destino_mask: mascara(destino), por: auth.user.id, en: new Date().toISOString() },
  }).eq("id", cierre.id);

  if (!enviado) return json({ ok: false, error: "El proveedor de correo rechazó el envío. Vuelve a intentarlo." }, 502, origin);
  return json({ ok: true, destino_mask: mascara(destino), tipo: pendiente ? "enlace" : "pdf" }, 200, origin);
});
