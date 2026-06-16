import { getSupabaseClient } from '../lib/supabaseClient.js';

const BUCKET = 'documentos-privados';
// Signed URLs para documentos privados: 10 minutos (600s).
// La renovación automática ocurre en el previsualizador del frontend.
const SIGNED_URL_TTL = 600;

// STUB — el estado de vencimiento lo calcula el motor BD (calcular_habilitaciones_personal).
// Esta función se mantiene para no romper posibles importaciones externas,
// pero NO debe usarse para tomar decisiones de estado en el frontend.
export function calcularEstadoVencimiento(_fechaVencimiento) {
  // Intencionalmente vacío: usar el campo `estado` que devuelve el motor BD.
  return null;
}

export function normalizar(doc = {}) {
  // Preserva los campos del documento; el campo estado viene del motor BD, no se recalcula aquí.
  return { ...doc };
}

// ── Consultas ─────────────────────────────────────────────────────────────────

export async function getDocumentosPersona(empresaId, personalId) {
  if (!empresaId || !personalId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId)
    .order('tipo_doc')
    .order('version', { ascending: false });
  if (error) { console.error('Error getDocumentosPersona:', error); return []; }
  return (data || []).map(normalizar);
}

// Todos los documentos activos de la empresa (para el panel RRHH con alertas)
export async function getDocumentosActivos(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .or('activo.eq.true,estado_validacion.eq.pendiente')
    .order('fecha_vencimiento', { ascending: true });
  if (error) { console.error('Error getDocumentosActivos:', error); return []; }
  return (data || []).map(normalizar);
}

// Documentos pendientes de validación
export async function getDocumentosPendientes(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('estado_validacion', 'pendiente')
    .order('creado_en', { ascending: false });
  if (error) { console.error('Error getDocumentosPendientes:', error); return []; }
  return (data || []).map(normalizar);
}

// ── Upload a Storage + registro en tabla ──────────────────────────────────────

export async function subirDocumento({
  empresaId,
  personalId,
  personalTipo,
  tipoDoc,
  tipoDocumentoId,
  file,
  fechaEmision,
  fechaVencimiento,
  notas,
  subidoDesde = 'backoffice',
  condicionesLaborales,
  contratoReferenciaId,
  adendaCambios,
  fechaVigenciaCambio,
  seccionDocumental,
  contratoPeriodoId,
}) {
  const supabase = await getSupabaseClient();

  // 1. Subir archivo al bucket
  const ext = file.name.split('.').pop();
  const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDoc}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) throw uploadError;

  // 2. Obtener URL firmada (válida 10 minutos — se renueva en el previsualizador)
  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (urlError) throw urlError;

  // 3. Registrar en tabla via RPC (archiva versión anterior + crea nueva)
  const { data, error: rpcError } = await supabase.rpc('subir_documento_personal', {
    p_empresa_id:        empresaId,
    p_personal_id:       personalId,
    p_personal_tipo:     personalTipo,
    p_tipo_doc:          tipoDoc,
    p_nombre_archivo:    file.name,
    p_archivo_url:       urlData.signedUrl,
    p_fecha_emision:     fechaEmision || null,
    p_fecha_vencimiento: fechaVencimiento || null,
    p_notas:             notas || null,
    p_subido_desde:      subidoDesde,
    p_tipo_documento_id: tipoDocumentoId || null,
    p_condiciones_laborales: condicionesLaborales || {},
    p_contrato_referencia_id: contratoReferenciaId || null,
    p_adenda_cambios: adendaCambios || {},
    p_fecha_vigencia_cambio: fechaVigenciaCambio || null,
    p_seccion_documental: seccionDocumental || null,
    p_contrato_periodo_id: contratoPeriodoId || null,
  });

  if (rpcError) throw rpcError;
  return normalizar(data);
}

// ── Validación por RRHH ───────────────────────────────────────────────────────

export async function validarDocumento(documentoId, decision, motivoRechazo = null) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('validar_documento_personal', {
    p_documento_id:   documentoId,
    p_decision:       decision,
    p_motivo_rechazo: motivoRechazo,
  });
  if (error) throw error;
  return normalizar(data);
}

// ── Corrección de metadatos sin nueva versión ─────────────────────────────────

export async function corregirDocumento({
  documentoId,
  file,
  fechaEmision,
  fechaVencimiento,
  condicionesLaborales,
  notas,
  empresaId,
  personalId,
  personalTipo,
  tipoDoc,
}) {
  const supabase = await getSupabaseClient();

  let archivoUrl = null;
  let nombreArchivo = null;

  if (file) {
    const ext = file.name.split('.').pop();
    const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDoc}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (urlError) throw urlError;
    archivoUrl = urlData.signedUrl;
    nombreArchivo = file.name;
  }

  const { data, error } = await supabase.rpc('corregir_documento_personal', {
    p_documento_id:          documentoId,
    p_fecha_emision:         fechaEmision || null,
    p_fecha_vencimiento:     fechaVencimiento || null,
    p_condiciones_laborales: condicionesLaborales || null,
    p_notas:                 notas || null,
    p_archivo_url:           archivoUrl,
    p_nombre_archivo:        nombreArchivo,
  });
  if (error) throw error;
  return normalizar(data);
}

// ── Nuevo período contractual ─────────────────────────────────────────────────

export async function nuevoContrato({
  empresaId, personalId, personalTipo, tipoDoc, tipoDocumentoId,
  file, fechaEmision, fechaVencimiento, notas, condicionesLaborales,
  periodoIdAnterior,
}) {
  const supabase = await getSupabaseClient();

  let archivoUrl = null;
  let nombreArchivo = null;

  if (file) {
    const ext = file.name.split('.').pop();
    const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDocumentoId || tipoDoc}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (urlError) throw urlError;
    archivoUrl = urlData.signedUrl;
    nombreArchivo = file.name;
  }

  const { data, error } = await supabase.rpc('nuevo_contrato_periodo', {
    p_empresa_id:            empresaId,
    p_personal_id:           personalId,
    p_personal_tipo:         personalTipo,
    p_tipo_doc:              tipoDoc,
    p_nombre_archivo:        nombreArchivo,
    p_archivo_url:           archivoUrl,
    p_fecha_emision:         fechaEmision || null,
    p_fecha_vencimiento:     fechaVencimiento || null,
    p_notas:                 notas || null,
    p_condiciones_laborales: condicionesLaborales || null,
    p_tipo_documento_id:     tipoDocumentoId || null,
    p_periodo_id_anterior:   periodoIdAnterior || null,
  });
  if (error) throw error;
  return normalizar(data);
}

// ── URL firmada renovada ──────────────────────────────────────────────────────

// Extrae el storage path desde una URL firmada de Supabase.
// Formato: .../storage/v1/object/sign/<bucket>/<path>?token=...
function pathFromSignedUrl(url) {
  if (!url) return null;
  try {
    const { pathname } = new URL(url);
    const prefix = `/storage/v1/object/sign/${BUCKET}/`;
    if (pathname.startsWith(prefix)) return decodeURIComponent(pathname.slice(prefix.length));
  } catch {}
  return null;
}

// Acepta un storage path directo o una URL firmada expirada.
export async function renovarUrlDocumento(storagePathOrUrl) {
  const path = (storagePathOrUrl && storagePathOrUrl.startsWith('http'))
    ? pathFromSignedUrl(storagePathOrUrl)
    : storagePathOrUrl;
  if (!path) throw new Error('No se pudo determinar el path del documento');
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

// ── Tipos de documento por perfil ─────────────────────────────────────────────

export const TIPOS_DOC_OPERATIVO = [
  { key: 'sctr',              label: 'SCTR',                   requiereVencimiento: true  },
  { key: 'medico',            label: 'Examen Médico',          requiereVencimiento: true  },
  { key: 'epp',               label: 'Entrega de EPP',         requiereVencimiento: false },
  { key: 'licencia_conducir', label: 'Licencia de Conducir',   requiereVencimiento: true  },
  { key: 'carnet_minero',     label: 'Carnet Minero',          requiereVencimiento: true  },
  { key: 'cert_altura',       label: 'Cert. Trabajo en Altura',requiereVencimiento: true  },
  { key: 'dni',               label: 'DNI',                    requiereVencimiento: false },
  { key: 'contrato',          label: 'Contrato',               requiereVencimiento: true  },
  { key: 'adenda',            label: 'Adenda',                 requiereVencimiento: false },
  { key: 'otro',              label: 'Otro',                   requiereVencimiento: false },
];

export const TIPOS_DOC_ADMIN = [
  { key: 'dni',      label: 'DNI',        requiereVencimiento: false },
  { key: 'contrato', label: 'Contrato',   requiereVencimiento: true  },
  { key: 'adenda',   label: 'Adenda',     requiereVencimiento: false },
  { key: 'sctr',     label: 'SCTR',       requiereVencimiento: true  },
  { key: 'medico',   label: 'Examen Médico', requiereVencimiento: true },
  { key: 'otro',     label: 'Otro',       requiereVencimiento: false },
];

export const BADGE_VENCIMIENTO = {
  vigente:         'badge-green',
  por_vencer:      'badge-orange',
  vencido:         'badge-red',
  sin_vencimiento: 'badge-gray',
};

export const LABEL_VENCIMIENTO = {
  vigente:         'Vigente',
  por_vencer:      'Por vencer',
  vencido:         'Vencido',
  sin_vencimiento: 'Sin vencimiento',
};

export const BADGE_VALIDACION = {
  pendiente: 'badge-orange',
  aprobado:  'badge-green',
  rechazado: 'badge-red',
};

// ── Firma del trabajador ──────────────────────────────────────────────────────

export const BADGE_FIRMA = {
  no_requiere:          '',
  pendiente_trabajador: 'badge-orange',
  firmado_trabajador:   'badge-cyan',
  no_aplica:            'badge-gray',
};

export const LABEL_FIRMA = {
  no_requiere:          '',
  pendiente_trabajador: 'Esperando firma del trabajador',
  firmado_trabajador:   'Firmado por trabajador',
  no_aplica:            '',
};

export async function enviarDocumentoAFirma({ documentoId, empresaId, workerAuthUserId, mensaje }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .update({
      estado_firma: 'pendiente_trabajador',
      enviado_a_firma_en: new Date().toISOString(),
      enviado_a_firma_mensaje: mensaje || null,
    })
    .eq('id', documentoId)
    .select()
    .single();
  if (error) throw error;
  if (workerAuthUserId) {
    await supabase.from('notificaciones_sistema').insert({
      empresa_id: empresaId,
      user_id: workerAuthUserId,
      tipo: 'documento_pendiente_firma',
      title: 'Documento pendiente de firma',
      texto: mensaje || 'RRHH ha enviado un documento para tu firma. Revisa el tab "Firma y consentimiento" en Mi portal.',
      prioridad: 'alta',
      leida: false,
    });
  }
  return normalizar(data);
}

export async function cancelarEnvioFirma({ documentoId }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .update({ estado_firma: 'no_requiere', enviado_a_firma_en: null, enviado_a_firma_mensaje: null })
    .eq('id', documentoId)
    .select()
    .single();
  if (error) throw error;
  return normalizar(data);
}

export async function reenviarNotificacionFirma({ documentoId, empresaId, workerAuthUserId }) {
  const supabase = await getSupabaseClient();
  if (workerAuthUserId) {
    await supabase.from('notificaciones_sistema').insert({
      empresa_id: empresaId,
      user_id: workerAuthUserId,
      tipo: 'documento_pendiente_firma',
      title: 'Recordatorio: Documento pendiente de firma',
      texto: 'Tienes un documento pendiente de firma en Mi portal, tab "Firma y consentimiento".',
      prioridad: 'alta',
      leida: false,
    });
  }
}

export async function vincularDocumentoFirmado({ nuevoDocId, documentoEnviadoAFirmaId, empresaId, nombreColaborador }) {
  const supabase = await getSupabaseClient();
  if (nuevoDocId) {
    await supabase.from('personal_documentos')
      .update({ estado_firma: 'firmado_trabajador', documento_enviado_a_firma_id: documentoEnviadoAFirmaId || null })
      .eq('id', nuevoDocId);
  }
  if (documentoEnviadoAFirmaId) {
    await supabase.from('personal_documentos')
      .update({ estado_firma: 'firmado_trabajador' })
      .eq('id', documentoEnviadoAFirmaId);
  }
  await supabase.from('notificaciones_sistema').insert({
    empresa_id: empresaId,
    tipo: 'documento_firmado_trabajador',
    title: 'Documento firmado cargado',
    texto: `${nombreColaborador || 'El colaborador'} ha cargado su documento firmado. Pendiente de validacion RRHH.`,
    prioridad: 'media',
    leida: false,
  });
}
