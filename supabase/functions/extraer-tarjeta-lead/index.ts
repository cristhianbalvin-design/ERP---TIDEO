import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { imageBase64 } = await req.json();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
          },
          {
            type: "text",
            text: `Analiza esta tarjeta de presentación. Responde SOLO con JSON sin explicaciones:
{
  "nombre_contacto": "",
  "nombre_empresa": "",
  "razon_social": "",
  "ruc": "",
  "cargo": "",
  "telefono": "",
  "email": "",
  "industria": ""
}`
          }
        ]
      }]
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(JSON.stringify({ success: false, error: `OpenAI error ${res.status}: ${errText}` }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let data = {};
  try {
    data = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    // GPT respondio con texto no-JSON: devolver campos vacíos para que el form se complete manualmente
    data = { nombre_contacto: "", nombre_empresa: "", razon_social: "", ruc: "", cargo: "", telefono: "", email: "", industria: "" };
  }

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...cors, "Content-Type": "application/json" }
  });
});