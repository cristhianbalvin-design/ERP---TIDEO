const getSupabaseClient = async () => (await import('./lib/supabaseClient.js')).getSupabaseClient();
import { mensajeMotivoFirma } from '../supabase/functions/_shared/contratoFirma.js';

export const mapearMotivoFirma = mensajeMotivoFirma;

export function filtrarPlantillasPorModalidad(plantillas, modalidad) {
  const esperada = modalidad === 'honorarios' ? 'honorarios' : 'planilla';
  return (plantillas || []).filter(p => (p.tipos_documento_electronico?.modalidad_contractual || p.modalidad_contractual || 'planilla') === esperada);
}

export async function mensajeErrorFuncion(error, fallback) {
  let body = null;
  try { body = await error?.context?.json?.(); } catch { /* respuesta sin JSON */ }
  const mapped = body?.motivo ? mapearMotivoFirma(body.motivo, body.intentos_restantes) : null;
  const message = body?.error || mapped || fallback;
  const result = new Error(message);
  if (body?.motivo) result.motivo = body.motivo;
  if (body?.intentos_restantes != null) result.intentos_restantes = body.intentos_restantes;
  if (body?.canales) result.canales = body.canales;
  return result;
}

const llamarPublico = async (payload) => {
  const sb = await getSupabaseClient();
  const { data, error } = await sb.functions.invoke('contrato-firma-publico', { body: payload });
  if (error) throw await mensajeErrorFuncion(error, 'No se pudo completar la solicitud.');
  if (!data?.ok) throw new Error(data?.error || mapearMotivoFirma(data?.motivo));
  return data;
};

export const contratoFirmaService = {
  async firmaEmpresa(accion, payload = {}) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.functions.invoke('contrato-firma-empresa', { body: { accion, ...payload } });
    if (error) throw await mensajeErrorFuncion(error, 'No se pudo completar la firma de la empresa.');
    if (!data?.ok) throw Object.assign(new Error(data?.error || 'No se pudo completar la firma de la empresa.'), { motivo: data?.motivo });
    return data;
  },
  crearFirmaEmpresa: ({ documentoId, firmanteId, canales = ['whatsapp', 'email'] }) => contratoFirmaService.firmaEmpresa('crear', { documento_id: documentoId, firmante_id: firmanteId, canales }),
  infoFirmaEmpresa: id => contratoFirmaService.firmaEmpresa('info', { id }),
  enviarOtpEmpresa: id => contratoFirmaService.firmaEmpresa('enviar_otp', { id }),
  firmarComoEmpresa: ({ id, otp, acepto }) => contratoFirmaService.firmaEmpresa('firmar', { id, otp, acepto }),
  anularFirmaEmpresa: id => contratoFirmaService.firmaEmpresa('anular', { id }),
  async listarFirmasEmpleador(documentoIds) {
    if (!documentoIds?.length) return [];
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from('contrato_firma_empleador').select('id,empresa_id,sociedad_id,documento_id,personal_id,firmante_id,firmante_usuario_id,firmante_nombre,canales_trabajador,estado,firmado_en,pdf_firmado_path,created_at').in('documento_id', documentoIds).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listarFirmantesActivos(empresaId) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from('contrato_firmantes_autorizados').select('id,empresa_id,sociedad_id,usuario_id,nombre,documento,cargo,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
    if (error) throw error;
    return data || [];
  },
  async crearSolicitud({ documentoId, empresaId, canales = ['whatsapp', 'email'], reenviar = false }) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.functions.invoke('contrato-firma-enviar', { body: { accion: reenviar ? 'reenviar' : 'crear', documento_id: documentoId, empresa_id: empresaId, canales } });
    if (error) throw await mensajeErrorFuncion(error, 'No se pudo crear la solicitud de firma.');
    if (!data?.ok) throw Object.assign(new Error(data?.error || 'No se pudo crear la solicitud de firma.'), { motivo: data?.motivo, intentos_restantes: data?.intentos_restantes, canales: data?.canales });
    return data;
  },
  async anularSolicitud({ solicitudId, empresaId }) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.functions.invoke('contrato-firma-enviar', { body: { accion: 'anular', solicitud_id: solicitudId, empresa_id: empresaId } });
    if (error) throw await mensajeErrorFuncion(error, 'No se pudo anular la solicitud.');
    if (!data?.ok) throw Object.assign(new Error(data?.error || 'No se pudo anular la solicitud.'), { motivo: data?.motivo, intentos_restantes: data?.intentos_restantes, canales: data?.canales });
    return data;
  },
  info: token => llamarPublico({ accion: 'info', token }),
  enviarOtp: (token, canal) => llamarPublico({ accion: 'enviar_otp', token, canal }),
  firmar: (token, otp, canal, acepto = false) => llamarPublico({ accion: 'firmar', token, otp, canal, acepto }),
  async listarSolicitudes(documentoId) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from('contrato_firma_solicitudes')
      .select('id,empresa_id,personal_id,documento_id,canales,destino_email_mask,destino_telefono_mask,estado,expira_en,firmado_en,pdf_firmado_path,pdf_firmado_sha256,created_at')
      .eq('documento_id', documentoId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listarSolicitudesDocumentos(documentoIds) {
    if (!documentoIds?.length) return [];
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from('contrato_firma_solicitudes')
      .select('id,empresa_id,personal_id,documento_id,canales,destino_email_mask,destino_telefono_mask,estado,expira_en,firmado_en,pdf_firmado_path,pdf_firmado_sha256,created_at')
      .in('documento_id', documentoIds).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async obtenerPdfFirmado(path) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.storage.from('documentos-privados').createSignedUrl(path, 600);
    if (error) throw error;
    return data.signedUrl;
  },
};
