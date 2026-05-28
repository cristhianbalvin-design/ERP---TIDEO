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

function cleanTicketPayload(ticket = {}) {
  return {
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
    creado_por: ticket.creado_por || null,
  };
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
  const payload = cleanTicketPayload(ticket);
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
  if (['abierto', 'en_proceso'].includes(estado)) {
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
