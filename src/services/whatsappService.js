import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

export const WHATSAPP_TIPOS_ALERTA = [
  ['contrato_por_vencer', 'Vencimiento de contrato'],
  ['doc_dni_por_vencer', 'Vencimiento de DNI'],
  ['doc_sctr_por_vencer', 'Vencimiento de SCTR'],
  ['doc_licencia_por_vencer', 'Vencimiento de licencia especializada'],
  ['sar_no_llegada', 'SAR no-llegada'],
];

export const WHATSAPP_TEMPLATES_DEFAULT = [
  {
    id: 'tpl_contrato_vencimiento',
    tipo_alerta: 'contrato_por_vencer',
    proveedor_template: 'contrato_vencimiento',
    variables: ['colaborador', 'documento', 'fecha_vencimiento', 'dias_restantes'],
    texto_sugerido: 'Hola {{colaborador}}, tu contrato vence el {{fecha_vencimiento}} (faltan {{dias_restantes}} dias). Coordina con RRHH.',
    estado: 'activo',
  },
  {
    id: 'tpl_dni_vencimiento',
    tipo_alerta: 'doc_dni_por_vencer',
    proveedor_template: 'dni_vencimiento',
    variables: ['colaborador', 'documento', 'fecha_vencimiento', 'dias_restantes'],
    texto_sugerido: 'Hola {{colaborador}}, tu DNI vence el {{fecha_vencimiento}}. Regulariza el documento con RRHH.',
    estado: 'activo',
  },
  {
    id: 'tpl_sctr_vencimiento',
    tipo_alerta: 'doc_sctr_por_vencer',
    proveedor_template: 'sctr_vencimiento',
    variables: ['colaborador', 'documento', 'fecha_vencimiento', 'dias_restantes'],
    texto_sugerido: 'Alerta DIFESMAQ: el SCTR de {{colaborador}} vence el {{fecha_vencimiento}}.',
    estado: 'activo',
  },
  {
    id: 'tpl_licencia_vencimiento',
    tipo_alerta: 'doc_licencia_por_vencer',
    proveedor_template: 'licencia_vencimiento',
    variables: ['colaborador', 'documento', 'fecha_vencimiento', 'dias_restantes'],
    texto_sugerido: 'La licencia {{documento}} de {{colaborador}} vence el {{fecha_vencimiento}}.',
    estado: 'activo',
  },
  {
    id: 'tpl_sar_no_llegada',
    tipo_alerta: 'sar_no_llegada',
    proveedor_template: 'sar_no_llegada',
    variables: ['colaborador', 'operacion', 'hora_limite', 'estado'],
    texto_sugerido: 'SAR: {{colaborador}} no registra llegada dentro de perimetro en {{operacion}} antes de {{hora_limite}}.',
    estado: 'activo',
  },
];

export const WHATSAPP_RUTAS_DEFAULT = WHATSAPP_TIPOS_ALERTA.map(([tipo]) => ({
  id: `ruta_${tipo}`,
  tipo_alerta: tipo,
  enviar_colaborador: true,
  enviar_jefe_area: true,
  enviar_rrhh: true,
  enviar_admin: false,
  requiere_opt_in_colaborador: true,
  internos_consentimiento_implicito: true,
  estado: 'activo',
}));

const generateId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;

export function whatsappProviderStatus(config = {}) {
  if (!config.whatsapp_habilitado) return 'apagado';
  if ((config.whatsapp_provider || 'simulado') === 'simulado') return 'simulado';
  return config.whatsapp_base_url && config.whatsapp_phone_number_id ? 'configurado' : 'sin_configurar';
}

export const whatsappService = {
  async listar(empresaId) {
    if (!isSupabaseConfigured() || !empresaId) {
      return { templates: [], rutas: [], logs: [] };
    }
    const supabase = await getSupabaseClient();
    const [templates, rutas, logs] = await Promise.all([
      supabase.from('whatsapp_plantillas').select('*').eq('empresa_id', empresaId).order('tipo_alerta'),
      supabase.from('whatsapp_matriz_destinatarios').select('*').eq('empresa_id', empresaId).order('tipo_alerta'),
      supabase.from('whatsapp_envios').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(200),
    ]);
    if (templates.error) throw templates.error;
    if (rutas.error) throw rutas.error;
    if (logs.error) throw logs.error;
    return { templates: templates.data || [], rutas: rutas.data || [], logs: logs.data || [] };
  },

  async guardarPlantilla(empresaId, plantilla) {
    if (!isSupabaseConfigured()) return { ...plantilla, id: plantilla.id || generateId('wpt'), empresa_id: empresaId };
    const supabase = await getSupabaseClient();
    const payload = {
      ...plantilla,
      id: plantilla.id?.startsWith('tpl_') ? undefined : plantilla.id,
      empresa_id: empresaId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('whatsapp_plantillas')
      .upsert(payload, { onConflict: 'empresa_id,tipo_alerta' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async guardarRuta(empresaId, ruta) {
    if (!isSupabaseConfigured()) return { ...ruta, id: ruta.id || generateId('wmr'), empresa_id: empresaId };
    const supabase = await getSupabaseClient();
    const payload = {
      ...ruta,
      id: ruta.id?.startsWith('ruta_') ? undefined : ruta.id,
      empresa_id: empresaId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('whatsapp_matriz_destinatarios')
      .upsert(payload, { onConflict: 'empresa_id,tipo_alerta' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async encolarSimulado(empresaId, envio) {
    const row = {
      ...envio,
      empresa_id: empresaId,
      estado: envio.estado || 'simulado',
      proveedor: 'simulado',
      created_at: new Date().toISOString(),
    };
    if (!isSupabaseConfigured()) return { ...row, id: generateId('wen') };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('whatsapp_envios').insert(row).select('*').single();
    if (error) throw error;
    return data;
  },
};
