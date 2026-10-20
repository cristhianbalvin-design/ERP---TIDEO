// Firma pública, por enlace, de un acta móvil que quedó con conformidad pendiente.
// - accion "info": datos del acta, fotos y firma del técnico con enlaces temporales (el bucket es privado).
// - accion "firmar": guarda la firma del cliente, registra la conformidad (firmar_conformidad_acta), genera el
//   PDF firmado (PDF original + página anexa) y lo envía por correo al cliente con copia a la empresa.
// No requiere sesión: el token del enlace (uuid, vence a los 7 días) es la credencial.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { getSupabaseServiceRoleKey } from "../_shared/supabaseKeys.ts";
import { extraerIpCliente, sha256Hex } from "../_shared/contratoFirma.js";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_APP_URL") || "").replace(/\/$/, "");
const BUCKET = "actas-conformidad";
const MAX_FIRMA_BYTES = 400 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin || APP_URL,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  },
});

const escapar = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
const textoPdf = (v: unknown) => String(v ?? "").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[^\x20-\xFF]/g, "?");
const mascara = (correo: string) => {
  const [n, d] = correo.split("@");
  return d ? `${n.slice(0, 1)}***@${d}` : correo;
};
const fechaLima = (v: unknown, conHora = true) => {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "America/Lima" }).format(d);
};
const aBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const correoValido = (v: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || "").trim());
const mensajeRpc = (msg: string) => {
  const m = msg.match(/ACTA_ENLACE_[A-Z_]+:\s*(.*)$/s);
  return m ? m[1] : "No se pudo registrar la conformidad. Vuelve a intentarlo.";
};

serve(async (req) => {
  const rawOrigin = req.headers.get("Origin") || "";
  const origin = origenPermitido(rawOrigin);
  if (rawOrigin && !origin) return json({ ok: false, error: "Origen no permitido." }, 403, "");
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return json({ ok: false, error: "El servicio no está disponible." }, 503, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let input: Record<string, any>;
  try { input = await req.json(); } catch { return json({ ok: false, error: "Solicitud inválida." }, 400, origin); }
  const token = String(input.token || "");
  const accion = String(input.accion || "info");
  if (!UUID.test(token)) return json({ ok: true, estado: "invalido" }, 200, origin);

  const { data: cierre } = await admin.from("cierres_tecnicos")
    .select("id,empresa_id,orden_trabajo_id,modalidad_acta,acta_bloqueada,acta_numero,acta_snapshot,acta_pdf_path,acta_pdf_sha256,acta_pdf_firmado_path,correo_cliente,conformidad_resultado,conformidad_observaciones,conformidad_nombre,conformidad_fecha,token_conformidad_expira_en")
    .eq("token_conformidad", token).maybeSingle();
  if (!cierre) return json({ ok: true, estado: "invalido" }, 200, origin);
  if (cierre.modalidad_acta !== "acta_movil" || !cierre.acta_bloqueada) return json({ ok: true, estado: "legacy" }, 200, origin);

  const s = (cierre.acta_snapshot || {}) as Record<string, any>;
  const firmar = async (path: string | null, segundos = 900) => {
    if (!path) return null;
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, segundos);
    return data?.signedUrl || null;
  };
  const emisor = { razon_social: s.emisor?.razon_social || "", ruc: s.emisor?.ruc || "", direccion: s.emisor?.direccion || "", logo_url: s.emisor?.logo_url || null };

  if (cierre.conformidad_fecha) {
    return json({
      ok: true, estado: "firmada", emisor, acta_numero: cierre.acta_numero, firmado_en: cierre.conformidad_fecha,
      resultado: cierre.conformidad_resultado, pdf_url: await firmar(cierre.acta_pdf_firmado_path || cierre.acta_pdf_path, 3600),
    }, 200, origin);
  }
  if (cierre.token_conformidad_expira_en && new Date(cierre.token_conformidad_expira_en) <= new Date()) {
    return json({ ok: true, estado: "vencido", emisor, acta_numero: cierre.acta_numero }, 200, origin);
  }

  if (accion === "info") {
    const tecnico = (s.firmas || []).find((f: any) => f.rol === "tecnico") || {};
    const fotos = await Promise.all((s.evidencias || []).map(async (e: any) => ({ tipo: e.tipo, tomada_en: e.tomada_en || null, url: await firmar(e.path) })));
    return json({
      ok: true, estado: "pendiente", emisor,
      acta_numero: cierre.acta_numero, emitida_en: s.emitida_en || null, expira_en: cierre.token_conformidad_expira_en,
      ot: { numero: s.ot?.numero || "", servicio: s.ot?.servicio || s.ot?.descripcion || "", direccion: s.ot?.direccion_ejecucion || "" },
      cliente: { nombre: s.cliente?.nombre || "" },
      trabajo: { descripcion: s.trabajo?.descripcion || "", horas: s.trabajo?.horas ?? null, fecha_cierre: s.trabajo?.fecha_cierre || null, tareas: (s.trabajo?.tareas || []).map((t: any) => t.titulo || t.descripcion).filter(Boolean) },
      motivo: s.conformidad?.observaciones || cierre.conformidad_observaciones || "",
      tecnico: { nombre: tecnico.nombre || "", cargo: tecnico.cargo || "", firma_url: await firmar(tecnico.path) },
      fotos,
      correo_mask: correoValido(cierre.correo_cliente) ? mascara(String(cierre.correo_cliente).toLowerCase()) : null,
    }, 200, origin);
  }

  if (accion !== "firmar") return json({ ok: false, error: "Acción no válida." }, 400, origin);

  // 1. Firma del cliente (PNG en data URL) → bucket privado.
  const m = String(input.firma || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return json({ ok: false, error: "Falta tu firma." }, 400, origin);
  const firmaBytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  const esPng = firmaBytes.length > 8 && firmaBytes[0] === 0x89 && firmaBytes[1] === 0x50 && firmaBytes[2] === 0x4e && firmaBytes[3] === 0x47;
  if (!esPng || firmaBytes.length > MAX_FIRMA_BYTES) return json({ ok: false, error: "La firma no es válida. Vuelve a firmar." }, 400, origin);
  const firmaSha = await sha256Hex(firmaBytes);
  const carpeta = `${cierre.empresa_id}/${cierre.orden_trabajo_id}/enlace-${crypto.randomUUID()}`;
  const firmaPath = `${carpeta}/firma-cliente.png`;
  const subida = await admin.storage.from(BUCKET).upload(firmaPath, firmaBytes, { contentType: "image/png", upsert: false });
  if (subida.error) return json({ ok: false, error: "No se pudo guardar tu firma. Vuelve a intentarlo." }, 500, origin);

  const ip = extraerIpCliente(req.headers);
  const dispositivo = (input.dispositivo && typeof input.dispositivo === "object") ? input.dispositivo : {};
  const { data: registro, error: rpcError } = await admin.rpc("firmar_conformidad_acta", {
    p_token: token,
    p_datos: {
      resultado: input.resultado, observaciones: input.observaciones, nombre: input.nombre, documento: input.documento,
      cargo: input.cargo, firma_path: firmaPath, firma_sha256: firmaSha, ip, dispositivo,
    },
  });
  if (rpcError || !registro?.ok) {
    await admin.storage.from(BUCKET).remove([firmaPath]);
    return json({ ok: false, error: mensajeRpc(rpcError?.message || "") }, 409, origin);
  }
  const firmadoEn = registro.firmado_en;
  const resultado = registro.resultado as string;

  // 2. PDF firmado: PDF original + página anexa "Conformidad del cliente".
  let pdfFirmadoPath: string | null = null;
  let pdfBytesFinal: Uint8Array | null = null;
  try {
    let pdf: PDFDocument;
    let shaOriginal = cierre.acta_pdf_sha256 || "";
    if (cierre.acta_pdf_path) {
      const { data: original } = await admin.storage.from(BUCKET).download(cierre.acta_pdf_path);
      if (!original) throw new Error("pdf_original");
      const bytes = new Uint8Array(await original.arrayBuffer());
      shaOriginal = await sha256Hex(bytes);
      pdf = await PDFDocument.load(bytes);
    } else {
      pdf = await PDFDocument.create();
    }
    const page = pdf.addPage([595.28, 841.89]);
    const fuente = await pdf.embedFont(StandardFonts.Helvetica);
    const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.10, 0.17, 0.29), gris = rgb(0.42, 0.45, 0.50), linea = rgb(0.89, 0.91, 0.92);
    let y = 790;
    const texto = (t: unknown, x: number, yy: number, size = 10, f = fuente, color = navy) => page.drawText(textoPdf(t), { x, y: yy, size, font: f, color });
    const ajustar = (t: string, max: number, size: number) => {
      const palabras = textoPdf(t).split(/\s+/).filter(Boolean); const out: string[] = []; let l = "";
      for (const p of palabras) { const c = l ? `${l} ${p}` : p; if (fuente.widthOfTextAtSize(c, size) > max && l) { out.push(l); l = p; } else l = c; }
      if (l) out.push(l); return out;
    };
    texto(emisor.razon_social, 48, y, 11, negrita); texto(emisor.ruc ? `RUC ${emisor.ruc}` : "", 48, y - 14, 9, fuente, gris);
    y -= 52;
    texto("CONFORMIDAD DEL CLIENTE", 48, y, 16, negrita);
    texto(`Anexo al acta ${cierre.acta_numero} · OT ${s.ot?.numero || ""}`, 48, y - 18, 10, fuente, gris);
    y -= 44;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: linea });
    y -= 22;
    const filas: Array<[string, string]> = [
      ["Resultado", resultado === "observaciones" ? "Conforme con observaciones" : "Conforme"],
      ["Firmante", String(input.nombre || "").trim()],
      ["Documento", String(input.documento || "").trim().toUpperCase()],
      ["Cargo", String(input.cargo || "").trim() || "-"],
      ["Fecha y hora", `${fechaLima(firmadoEn)} (hora de Lima)`],
      ["IP", ip],
      ["Canal", "Enlace enviado por correo"],
    ];
    for (const [k, v] of filas) { texto(k, 48, y, 9, negrita, gris); texto(v, 170, y, 10); y -= 18; }
    if (resultado === "observaciones") {
      y -= 4; texto("Observaciones", 48, y, 9, negrita, gris);
      for (const l of ajustar(String(input.observaciones || ""), 377, 10)) { texto(l, 170, y, 10); y -= 14; }
      y -= 4;
    }
    y -= 14;
    texto("Firma del cliente", 48, y, 9, negrita, gris);
    const png = await pdf.embedPng(firmaBytes);
    const escala = Math.min(260 / png.width, 110 / png.height);
    const w = png.width * escala, h = png.height * escala;
    page.drawRectangle({ x: 168, y: y - h - 12, width: w + 4, height: h + 8, borderColor: linea, borderWidth: 1 });
    page.drawImage(png, { x: 170, y: y - h - 8, width: w, height: h });
    y -= h + 40;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: linea });
    y -= 18;
    texto("Huella SHA-256 del acta original", 48, y, 8, negrita, gris);
    texto(shaOriginal || "-", 48, y - 12, 7, fuente, gris);
    texto(`Huella SHA-256 de la firma: ${firmaSha}`, 48, y - 26, 7, fuente, gris);
    texto("Generado con OPERA by Tideo Tech & Strategy", 48, 40, 8, fuente, gris);
    pdfBytesFinal = await pdf.save();
    const pdfSha = await sha256Hex(pdfBytesFinal);
    pdfFirmadoPath = `${carpeta}/acta-firmada.pdf`;
    const up = await admin.storage.from(BUCKET).upload(pdfFirmadoPath, pdfBytesFinal, { contentType: "application/pdf", upsert: false });
    if (up.error) throw up.error;
    const { error: regError } = await admin.rpc("registrar_pdf_firmado_acta", { p_cierre_id: cierre.id, p_path: pdfFirmadoPath, p_sha256: pdfSha });
    if (regError) throw regError;
  } catch (e) {
    console.error("acta-conformidad-firmar: PDF firmado", e);
    pdfFirmadoPath = null;
  }

  // 3. Correo al cliente con copia a la empresa (responsable comercial de la OS y técnico de la OT).
  const destino = String(cierre.correo_cliente || "").trim().toLowerCase();
  let correoEnviado = false;
  const resend = Deno.env.get("RESEND_API_KEY");
  if (resend && correoValido(destino) && pdfBytesFinal && pdfFirmadoPath) {
    const copias = new Set<string>();
    const { data: ot } = await admin.from("ordenes_trabajo").select("os_cliente_id,tecnico_responsable_id").eq("id", cierre.orden_trabajo_id).maybeSingle();
    if (ot?.tecnico_responsable_id) {
      const { data: tec } = await admin.from("personal_operativo").select("email,email_personal").eq("id", ot.tecnico_responsable_id).eq("empresa_id", cierre.empresa_id).maybeSingle();
      const c = String(tec?.email || tec?.email_personal || "").trim().toLowerCase(); if (correoValido(c)) copias.add(c);
    }
    if (ot?.os_cliente_id) {
      const { data: os } = await admin.from("os_clientes").select("responsable_comercial_id").eq("id", ot.os_cliente_id).maybeSingle();
      if (os?.responsable_comercial_id) {
        const { data: u } = await admin.from("usuarios").select("email").eq("id", os.responsable_comercial_id).eq("empresa_id", cierre.empresa_id).maybeSingle();
        const c = String(u?.email || "").trim().toLowerCase(); if (correoValido(c)) copias.add(c);
      }
    }
    copias.delete(destino);
    const resultadoTexto = resultado === "observaciones" ? "Conforme con observaciones" : "Conforme";
    const html = `<div style="font-family:Arial,sans-serif;color:#1F2937;font-size:14px;line-height:1.5">`
      + `<p>Hola ${escapar(String(input.nombre || "").trim())},</p>`
      + `<p>Registramos tu conformidad del acta <b>${escapar(cierre.acta_numero)}</b> del servicio <b>${escapar(s.ot?.servicio || "")}</b> (OT ${escapar(s.ot?.numero || "")}).</p>`
      + `<p>Resultado: <b>${resultadoTexto}</b>${resultado === "observaciones" ? ` — ${escapar(input.observaciones)}` : ""}</p>`
      + `<p>Firmada el ${escapar(fechaLima(firmadoEn))} (hora de Lima). Adjuntamos el acta firmada.</p>`
      + `<p style="color:#6B7280;font-size:12px">${escapar(emisor.razon_social)}${emisor.razon_social ? " · " : ""}Enviado con OPERA by Tideo Tech &amp; Strategy</p></div>`;
    let detalle: Record<string, unknown> = {};
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM") || "TIDEO <notificaciones@tideo.tech>",
          to: [destino], ...(copias.size ? { cc: [...copias] } : {}),
          subject: `Acta de conformidad firmada ${cierre.acta_numero} · OT ${s.ot?.numero || ""}`,
          html,
          attachments: [{ filename: `Acta-${String(cierre.acta_numero).replace(/[^A-Za-z0-9-]/g, "-")}-firmada.pdf`, content: aBase64(pdfBytesFinal) }],
        }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      correoEnviado = r.ok;
      detalle = { proveedor: "resend", status: r.status, id: (cuerpo as any)?.id || null, tipo: "pdf_firmado", copias: copias.size };
    } catch {
      detalle = { proveedor: "resend", status: null, tipo: "pdf_firmado", error: "error_red" };
    }
    await admin.from("cierres_tecnicos").update({
      correo_estado: correoEnviado ? "enviado" : "error",
      correo_enviado_en: correoEnviado ? new Date().toISOString() : null,
      correo_detalle: { ...detalle, destino_mask: mascara(destino), por: "cliente_enlace", en: new Date().toISOString() },
    }).eq("id", cierre.id);
  }

  return json({
    ok: true, estado: "firmada", emisor, acta_numero: cierre.acta_numero, firmado_en: firmadoEn, resultado,
    pdf_url: await firmar(pdfFirmadoPath || cierre.acta_pdf_path, 3600),
    correo_enviado: correoEnviado, correo_mask: correoValido(destino) ? mascara(destino) : null,
  }, 200, origin);
});
