import { isSupabaseMode } from '../lib/dataMode.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

export const STORAGE_BUCKETS = {
  DOCUMENTOS_PRIVADOS: 'documentos-privados',
  DOCUMENTOS_GENERALES: 'documentos-generales',
  EMPRESA_ASSETS: 'empresa-assets',
  LOGOS_CUENTAS: 'logos-cuentas',
  COTIZACIONES_SUSTENTO: 'cotizaciones-sustento',
  CONFORMIDADES_OT: 'conformidades-ot',
};

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const PUBLIC_BUCKETS = new Set([
  STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  STORAGE_BUCKETS.EMPRESA_ASSETS,
  STORAGE_BUCKETS.LOGOS_CUENTAS,
  STORAGE_BUCKETS.COTIZACIONES_SUSTENTO,
  STORAGE_BUCKETS.CONFORMIDADES_OT,
]);

const ENTITY_BUCKET_MAP = {
  cuentas: STORAGE_BUCKETS.LOGOS_CUENTAS,
  empresa_config: STORAGE_BUCKETS.EMPRESA_ASSETS,
  cotizaciones: STORAGE_BUCKETS.COTIZACIONES_SUSTENTO,
  cierres_tecnicos: STORAGE_BUCKETS.CONFORMIDADES_OT,
  partes_diarios: STORAGE_BUCKETS.CONFORMIDADES_OT,
  ordenes_trabajo: STORAGE_BUCKETS.CONFORMIDADES_OT,
  tickets: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  documentos_proveedor: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  compras_gastos: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  recepciones: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  movimientos_tesoreria: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  pagos_financiamiento: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  tabla_amortizacion: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  facturas: STORAGE_BUCKETS.DOCUMENTOS_GENERALES,
  cxp: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
  personal_administrativo: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
  personal_operativo: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
  recibos_honorarios: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
  periodos_nomina: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
  detalle_nomina: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.zip',
]);

const storageUri = (bucket, path) => `storage://${bucket}/${path}`;

const randomId = () => (
  globalThis.crypto?.randomUUID?.() || `file_${Date.now()}_${Math.random().toString(36).slice(2)}`
);

const cleanSegment = value => String(value || '')
  .trim()
  .replace(/[\\/]+/g, '-')
  .replace(/\s+/g, '-');

const fileExtension = fileName => {
  const value = String(fileName || '').toLowerCase();
  const dot = value.lastIndexOf('.');
  return dot >= 0 ? value.slice(dot) : '';
};

export function formatoTamano(bytes = 0) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function bucketParaEntidad(entidadTipo) {
  return ENTITY_BUCKET_MAP[entidadTipo] || STORAGE_BUCKETS.DOCUMENTOS_GENERALES;
}

export function esBucketPublico(bucket) {
  return PUBLIC_BUCKETS.has(bucket);
}

export function validarArchivo(file) {
  if (!file) return { ok: false, error: 'Selecciona un archivo.' };
  if (Number(file.size || 0) > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: 'El archivo excede el limite de 20 MB.' };
  }

  const mime = String(file.type || '').toLowerCase();
  const extension = fileExtension(file.name);
  const mimePermitido = mime && ALLOWED_MIME_TYPES.has(mime);
  const extensionPermitida = ALLOWED_EXTENSIONS.has(extension);

  if (!mimePermitido && !extensionPermitida) {
    return { ok: false, error: 'Tipo de archivo no permitido.' };
  }

  return { ok: true };
}

export function construirRutaAdjunto({ empresaId, entidadTipo, entidadId }) {
  if (!empresaId || !entidadTipo || !entidadId) {
    throw new Error('empresaId, entidadTipo y entidadId son obligatorios para construir la ruta.');
  }

  return [
    String(empresaId).trim(),
    cleanSegment(entidadTipo),
    cleanSegment(entidadId),
    randomId(),
  ].join('/');
}

function mockAdjunto({ empresaId, entidadTipo, entidadId, file, categoria, descripcion, bucket }) {
  const now = new Date().toISOString();
  const path = construirRutaAdjunto({ empresaId: empresaId || 'emp_mock', entidadTipo, entidadId });
  return {
    id: randomId(),
    empresa_id: empresaId || 'emp_mock',
    entidad_tipo: entidadTipo,
    entidad_id: entidadId,
    categoria: categoria || null,
    nombre_original: file?.name || 'archivo_mock.pdf',
    bucket,
    storage_path: path,
    url: storageUri(bucket, path),
    mime_type: file?.type || 'application/pdf',
    tamano_bytes: Number(file?.size || 0),
    descripcion: descripcion || null,
    subido_por: null,
    subido_en: now,
    actualizado_en: now,
  };
}

export async function subirAdjunto({
  empresaId,
  entidadTipo,
  entidadId,
  file,
  categoria = 'adjunto',
  descripcion = null,
  subidoPor = null,
  bucket: forcedBucket,
  onProgress,
}) {
  const validation = validarArchivo(file);
  if (!validation.ok) throw new Error(validation.error);

  const bucket = forcedBucket || bucketParaEntidad(entidadTipo);

  if (!isSupabaseMode()) {
    onProgress?.(100);
    return mockAdjunto({ empresaId, entidadTipo, entidadId, file, categoria, descripcion, bucket });
  }

  const supabase = await getSupabaseClient();
  const path = construirRutaAdjunto({ empresaId, entidadTipo, entidadId });
  const contentType = file.type || 'application/octet-stream';

  onProgress?.(20);
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false });

  if (uploadError) throw uploadError;

  onProgress?.(65);
  const publicUrl = esBucketPublico(bucket)
    ? supabase.storage.from(bucket).getPublicUrl(path)?.data?.publicUrl
    : null;

  const row = {
    empresa_id: empresaId,
    entidad_tipo: entidadTipo,
    entidad_id: String(entidadId),
    categoria: categoria || null,
    nombre_original: file.name,
    bucket,
    storage_path: path,
    url: publicUrl || storageUri(bucket, path),
    mime_type: file.type || null,
    tamano_bytes: Number(file.size || 0),
    descripcion: descripcion || null,
    subido_por: subidoPor || null,
  };

  const { data, error } = await supabase
    .from('adjuntos')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    await supabase.storage.from(bucket).remove([path]).catch(() => {});
    throw error;
  }

  onProgress?.(100);
  return data;
}

export async function cargarAdjuntos({ empresaId, entidadTipo, entidadId }) {
  if (!isSupabaseMode()) return [];
  if (!empresaId || !entidadTipo || !entidadId) return [];

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('adjuntos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('entidad_tipo', entidadTipo)
    .eq('entidad_id', String(entidadId))
    .order('subido_en', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function cargarAdjuntoPorId(adjuntoId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('adjuntos')
    .select('*')
    .eq('id', adjuntoId)
    .single();

  if (error) throw error;
  return data;
}

export async function obtenerUrlAdjunto(adjunto, expiresIn = 600) {
  if (!adjunto) return '';
  if (!isSupabaseMode()) return adjunto.url || '';

  const row = typeof adjunto === 'string' ? await cargarAdjuntoPorId(adjunto) : adjunto;
  if (esBucketPublico(row.bucket) && row.url && !row.url.startsWith('storage://')) {
    return row.url;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(row.bucket)
    .createSignedUrl(row.storage_path, expiresIn);

  if (error) throw error;
  return data?.signedUrl || '';
}

export async function eliminarAdjunto(adjunto) {
  if (!adjunto) return true;
  if (!isSupabaseMode()) return true;

  const row = typeof adjunto === 'string' ? await cargarAdjuntoPorId(adjunto) : adjunto;
  const supabase = await getSupabaseClient();

  if (row.bucket && row.storage_path) {
    const { error: removeError } = await supabase.storage
      .from(row.bucket)
      .remove([row.storage_path]);
    if (removeError) throw removeError;
  }

  const { error } = await supabase
    .from('adjuntos')
    .delete()
    .eq('id', row.id);

  if (error) throw error;
  return true;
}
