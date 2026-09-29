import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMPTY = { ruc: "", proveedor: "", descripcion_compra: "", num_factura: "", fecha_emision: "", monto_sin_igv: null, igv: null, monto_total: null };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { imageBase64, mediaType = "image/jpeg" } = await req.json();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${imageBase64}` },
          },
          {
            type: "text",
            text: `Analiza esta factura de proveedor peruana. El EMISOR es quien emite y cobra (el proveedor que vende), y el RECEPTOR es quien recibe y paga (el cliente que compra). Toma el RUC y la razón social del bloque del EMISOR, normalmente ubicado arriba junto al recuadro de FACTURA y la serie-número. Nunca tomes el RUC que aparece junto a "Señor(es)", "Cliente" o cualquier otro bloque del RECEPTOR, aunque esté más cerca del bloque de totales. Si el documento es un Registro de Comprobante Físico por Contingencia u otro formato con dos bloques de RUC, verifica que el RUC devuelto corresponda al mismo bloque visual que la razón social del proveedor. Si existe ambigüedad o no puedes confirmar cuál es el bloque emisor, devuelve "ruc": "" y "proveedor": "" en vez de adivinar. Extrae los datos del EMISOR: su RUC va en "ruc" y su razón social va en "proveedor". NO uses los datos del RECEPTOR. Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "ruc": "",
  "proveedor": "",
  "descripcion_compra": "",
  "num_factura": "",
  "fecha_emision": "",
  "monto_sin_igv": null,
  "igv": null,
  "monto_total": null
}
Reglas: fecha en formato YYYY-MM-DD, montos como números decimales, campos no legibles como null o cadena vacía.`,
          },
          {
            type: "text",
            text: "descripcion_compra debe resumir brevemente lo comprado o sus items; si no es legible, devuelve una cadena vacia.",
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ success: false, data: EMPTY }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let data = EMPTY;
  try {
    data = { ...EMPTY, ...JSON.parse(raw.replace(/```json|```/g, "").trim()) };
  } catch {
    data = EMPTY;
  }

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
