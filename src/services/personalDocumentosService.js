import { getSupabaseClient } from '../lib/supabaseClient.js';

const BUCKET = 'documentos-privados';

// Calcula el estado de vencimiento en el cliente (mismo criterio que la función SQL)
export function calcularEstadoVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return 'sin_vencimiento';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  const diff = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'vencido';
  if (diff <= 30) return 'por_vencer';
  return 'vigente';
}

export function normalizar(doc = {}) {
  return {
    ...doc,
    estado_vencimiento: calcularEstadoVencimiento(doc.fecha_vencimiento),
  };
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
    .eq('activo', true)
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
    .eq('activo', true)
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
  file,
  fechaEmision,
  fechaVencimiento,
  notas,
  subidoDesde = 'backoffice',
}) {
  const supabase = await getSupabaseClient();

  // 1. Subir archivo al bucket
  const ext = file.name.split('.').pop();
  const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDoc}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) throw uploadError;

  // 2. Obtener URL firmada (válida 1 año — renovable al mostrar)
  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

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

// ── URL firmada renovada ──────────────────────────────────────────────────────

export async function renovarUrlDocumento(storagePath) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
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
  { key: 'otro',              label: 'Otro',                   requiereVencimiento: false },
];

export const TIPOS_DOC_ADMIN = [
  { key: 'dni',      label: 'DNI',        requiereVencimiento: false },
  { key: 'contrato', label: 'Contrato',   requiereVencimiento: true  },
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
