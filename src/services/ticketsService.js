import { getSupabaseClient } from '../lib/supabaseClient.js';

const SLA_HOURS_BY_PRIORITY = {
  critica: 4,
  alta: 24,
  media: 48,
  baja: 72,
};

export function calcularFechaLimiteSla(prioridad, baseDate = new Date()) {
  const hours = SLA_HOURS_BY_PRIORITY[prioridad] || SLA_HOURS_BY_PRIORITY.media;
  return new Date(baseDate.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function cleanTicketPayload(ticket = {}, { includeId = false } = {}) {
  const payload = {
    titulo: String(ticket.titulo || '').trim(),
    descripcion: ticket.descripcion?.trim?.() || null,
    tipo: ticket.tipo || 'consulta',
    canal_entrada: ticket.canal_entrada || 'backoffice',
    estado: ticket.estado || 'abierto',
    prioridad: ticket.prioridad || 'media',
    cuenta_id: ticket.cuenta_id || null,
    cuenta_nombre: ticket.cuenta_nombre || null,
    responsable_id: ticket.responsable_id || null,
    responsable_nombre: ticket.responsable_nombre || null,
  };

  if (ticket.creado_por !== undefined) payload.creado_por = ticket.creado_por || null;
  if (includeId && ticket.id) payload.id = ticket.id;
  return payload;
}

async function getTicketById(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tickets_con_sla')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function cargarTickets(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tickets_con_sla')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('creado_en', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function crearTicket(empresaId, ticket) {
  const supabase = await getSupabaseClient();
  const payload = cleanTicketPayload(ticket, { includeId: true });
  const creadoEn = new Date();
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      ...payload,
      empresa_id: empresaId,
      creado_en: creadoEn.toISOString(),
      fecha_limite_sla: calcularFechaLimiteSla(payload.prioridad, creadoEn),
    })
    .select('id')
    .single();

  if (error) throw error;
  return getTicketById(data.id);
}

export async function cambiarEstadoTicket(ticketId, estado) {
  const supabase = await getSupabaseClient();
  const patch = { estado, actualizado_en: new Date().toISOString() };
  if (['resuelto', 'cerrado'].includes(estado)) {
    patch.fecha_resolucion = new Date().toISOString();
  }
  if (['abierto', 'en_proceso', 'qc'].includes(estado)) {
    patch.fecha_resolucion = null;
  }

  const { data, error } = await supabase
    .from('tickets')
    .update(patch)
    .eq('id', ticketId)
    .select('id')
    .single();

  if (error) throw error;
  return getTicketById(data.id);
}

export async function actualizarTicket(ticketId, ticket) {
  const supabase = await getSupabaseClient();
  const payload = cleanTicketPayload(ticket);
  const { data, error } = await supabase
    .from('tickets')
    .update({ ...payload, actualizado_en: new Date().toISOString() })
    .eq('id', ticketId)
    .select('id')
    .single();

  if (error) throw error;
  return getTicketById(data.id);
}

export async function eliminarTicket(ticketId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', ticketId);

  if (error) throw error;
  return true;
}

const BUCKET_TICKET_EVIDENCIAS = 'ticket-evidencias';

export async function subirImagenEvidencia(empresaId, ticketId, file) {
  if (!file) return null;
  const supabase = await getSupabaseClient();
  const timestamp = Date.now();
  const nombreSeguro = String(file.name || 'imagen').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${empresaId}/${ticketId}/${timestamp}_${nombreSeguro}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_TICKET_EVIDENCIAS)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET_TICKET_EVIDENCIAS).getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function cargarComentariosTicket(ticketId) {
  if (!ticketId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('ticket_comentarios')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('creado_en', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function agregarComentarioTicket(empresaId, ticketId, { tipo, contenido, imagen_url = null, usuario_id = null, usuario_nombre }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('ticket_comentarios')
    .insert({
      empresa_id: empresaId,
      ticket_id: ticketId,
      tipo,
      contenido: String(contenido || '').trim(),
      imagen_url: imagen_url || null,
      usuario_id: usuario_id || null,
      usuario_nombre: usuario_nombre || 'Usuario',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function actualizarQcEstado(ticketId, qcEstado) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tickets')
    .update({ qc_estado: qcEstado, actualizado_en: new Date().toISOString() })
    .eq('id', ticketId)
    .select('id')
    .single();

  if (error) throw error;
  return getTicketById(data.id);
}

export async function reabrirTicket(ticketId, empresaId, motivo, usuarioId, usuarioNombre) {
  const supabase = await getSupabaseClient();
  const ahora = new Date().toISOString();

  const { data: currentData, error: fetchError } = await supabase
    .from('tickets')
    .select('veces_reabierto')
    .eq('id', ticketId)
    .single();

  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from('tickets')
    .update({
      estado: 'qc',
      qc_estado: 'en_revision',
      fecha_resolucion: null,
      reabierto_en: ahora,
      veces_reabierto: (currentData?.veces_reabierto || 0) + 1,
      actualizado_en: ahora,
    })
    .eq('id', ticketId);

  if (updateError) throw updateError;

  const { error: commentError } = await supabase
    .from('ticket_comentarios')
    .insert({
      empresa_id: empresaId,
      ticket_id: ticketId,
      tipo: 'reapertura',
      contenido: String(motivo || '').trim(),
      imagen_url: null,
      usuario_id: usuarioId || null,
      usuario_nombre: usuarioNombre || 'Usuario',
    });

  if (commentError) throw commentError;

  return getTicketById(ticketId);
}
