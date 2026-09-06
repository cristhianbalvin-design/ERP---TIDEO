import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, Calendly-Webhook-Signature",
};

// Función para verificar la firma de Calendly
function verifyCalendlySignature(
  webhookSignature: string,
  bodyText: string,
  secret: string
): boolean {
  try {
    const [tPart, v1Part] = webhookSignature.split(",");
    const t = tPart.split("t=")[1];
    const signature = v1Part.split("v1=")[1];

    const data = t + "." + bodyText;
    const expectedSignature = createHmac("sha256", secret)
      .update(data)
      .digest("hex");

    return expectedSignature === signature;
  } catch (error) {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookSignature = req.headers.get("Calendly-Webhook-Signature");
    const webhookSecret = Deno.env.get("CALENDLY_WEBHOOK_SECRET");

    if (!webhookSignature || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing signature or secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Leemos el texto para la firma
    const bodyText = await req.text();
    
    // Verificamos la firma
    if (!verifyCalendlySignature(webhookSignature, bodyText, webhookSecret)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(bodyText);

    if (body.event !== "invitee.created") {
      return new Response(JSON.stringify({ message: "Ignored event type" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = body.payload;
    const scheduled_event = payload.scheduled_event;
    
    const name = payload.name;
    const email = payload.email;
    const start_time = scheduled_event.start_time;
    const end_time = scheduled_event.end_time;
    const tracking = scheduled_event.tracking || {};
    const salesforce_uuid = tracking.salesforce_uuid;
    const utm_source = tracking.utm_source;
    const event_uri = scheduled_event.uri;
    
    let duration_minutes = 30; // Valor por defecto si no podemos deducirlo
    if (start_time && end_time) {
      const diffMs = new Date(end_time).getTime() - new Date(start_time).getTime();
      if (diffMs > 0) {
        duration_minutes = Math.round(diffMs / 60000);
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Obtener el empresa_id de TIDEO Tech & Strategy desde variable de entorno
    const empresaId = Deno.env.get("TIDEO_EMPRESA_ID");
    
    if (!empresaId) {
      console.error("Falta la variable de entorno TIDEO_EMPRESA_ID");
      return new Response(JSON.stringify({ error: "Configuración incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event_uri) {
      const { data: existingEvent } = await supabase
        .from("agenda_comercial")
        .select("id")
        .eq("calendly_event_uri", event_uri)
        .maybeSingle();
        
      if (existingEvent) {
        console.log("Evento ya procesado:", event_uri);
        return new Response(JSON.stringify({ success: true, message: "Evento ya procesado" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let leadId = salesforce_uuid;

    // 2. Si existe salesforce_uuid, intentamos actualizar el lead
    if (leadId) {
      const { data: updated, error: updateError } = await supabase
        .from("leads")
        .update({ modificado_en: new Date().toISOString() })
        .eq("id", leadId)
        .eq("empresa_id", empresaId)
        .select("id");
        
      if (updateError || !updated || updated.length === 0) {
        console.warn("salesforce_uuid inválido o lead inexistente. Se creará uno nuevo.");
        leadId = null; // Forzar creación
      }
    }

    // 3. Si no había salesforce_uuid (o era inválido), creamos el lead.
    if (!leadId) {
      const { data: newLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          empresa_id: empresaId,
          nombre_contacto: name,
          empresa_nombre: "Por definir",
          email: email,
          fuente: utm_source || "calendly_directo",
          estado: "nuevo"
        })
        .select("id")
        .single();
      
      if (insertError) {
        console.error("Error al crear prospecto:", insertError);
        return new Response(JSON.stringify({ error: "Error creando prospecto" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      leadId = newLead.id;
    }

    // 4. Insertar en agenda_comercial
    // Usamos el formato esperado por persistirAgendaEvento
    const startDate = new Date(start_time);
    
    // Convertir a zona horaria America/Lima
    const fecha = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'America/Lima', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).format(startDate); // Formato YYYY-MM-DD
    
    const hora = new Intl.DateTimeFormat('en-GB', { 
      timeZone: 'America/Lima', 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    }).format(startDate); // Formato HH:MM

    const eventoAgenda = {
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      titulo: `Reunión Calendly: ${name}`,
      tipo: "reunion",
      lead_id: leadId,
      vendedor: "Por asignar",
      registrado_por: "Por asignar",
      fecha: fecha,
      hora: hora,
      duracion_minutos: duration_minutes,
      estado: "programado",
      calendly_event_uri: event_uri,
      notas: `Agendado vía Calendly. URI: ${event_uri}`
    };

    const { error: agendaError } = await supabase
      .from("agenda_comercial")
      .insert(eventoAgenda);

    if (agendaError) {
      console.error("Error al insertar en agenda_comercial:", agendaError);
      return new Response(JSON.stringify({ error: "Error creando evento" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, lead_id: leadId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error procesando webhook:", error);
    return new Response(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/*
====================================================================================
TAREA 3: DOCUMENTACIÓN - FLUJO META LEAD ADS (PARA FUTURA IMPLEMENTACIÓN)
====================================================================================
Cuando un lead ingrese a través de un formulario nativo de Meta (Lead Ads):
1. El webhook `leadgen` de Meta será recibido por otra Edge Function (ej. api-meta-leads).
2. Esa función guardará el lead vía `api-prospectos` (o insertando directamente si está en el mismo repo).
3. El ID (`id`) que devuelve esa creación en la tabla de `leads` debe utilizarse como
   parámetro `salesforce_uuid` en la URL de agendamiento de Calendly que se le muestre
   al usuario en la página de agradecimiento de Meta o en el correo de confirmación.
   Ejemplo de URL a generar:
   https://calendly.com/tideo/30min?salesforce_uuid={id_del_lead_creado}

4. Al agendar mediante ese enlace, Calendly incluirá el `salesforce_uuid` en el payload
   del evento `invitee.created` que recibe esta función (`api-reservas`).
5. La lógica actual de esta función (línea ~80) detectará que `leadId` ya existe 
   (porque viene como `salesforce_uuid`), evitando crear un prospecto duplicado y 
   simplemente actualizará el existente y lo vinculará correctamente al evento 
   en `agenda_comercial`.

Nota: Esto requiere configurar una App en Meta for Developers con permisos de Webhooks
y acceso a Leads Access.
====================================================================================
*/
