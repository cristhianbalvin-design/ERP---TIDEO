import { getSupabaseClient } from '../lib/supabaseClient.js';

const BUCKET = 'diagnostico-fotos';
const FOTO_COLUMNS = 'id,empresa_id,hallazgo_id,ruta_storage,nombre_original,mime_type,tamano_bytes,ancho,alto,leyenda,orden,excluir_del_informe,created_at,updated_at';
const MAX_FOTOS = 3;
const MAX_BYTES = 1572864;

const requireEmpresa = empresaId => {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
};

const mensajeTrigger = error => {
  const mensaje = String(error?.message || '');
  if (/m[aá]ximo tres fotos/i.test(mensaje)) return 'Un hallazgo admite como máximo tres fotos.';
  if (/informe emitido/i.test(mensaje)) return 'No se pueden modificar fotos: ya existe un informe emitido para esta recepción.';
  if (/solo se pueden modificar fotos de un diagn[oó]stico en borrador/i.test(mensaje)) return 'Solo se pueden modificar fotos de un diagnóstico en borrador.';
  return mensaje || 'No se pudo completar la operación.';
};

const getError = error => {
  if (!error) return new Error('No se pudo completar la operación.');
  const message = mensajeTrigger(error);
  return message === error.message ? error : new Error(message);
};

const toBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la foto.')), 'image/jpeg', quality);
});

async function comprimirImagen(archivo) {
  if (!archivo || !['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    throw new Error('Selecciona una imagen JPEG, PNG o WEBP.');
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !URL?.createObjectURL) {
    throw new Error('No se pudo preparar la imagen para subir.');
  }
  const objectUrl = URL.createObjectURL(archivo);
  try {
    const image = await new Promise((resolve, reject) => {
      const source = new Image();
      source.onload = () => resolve(source);
      source.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      source.src = objectUrl;
    });
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;
    if (!originalWidth || !originalHeight) throw new Error('La imagen no tiene dimensiones válidas.');
    const scale = Math.min(1, 1600 / Math.max(originalWidth, originalHeight));
    const ancho = Math.max(1, Math.round(originalWidth * scale));
    const alto = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen para subir.');
    context.drawImage(image, 0, 0, ancho, alto);
    for (let quality = 0.8; quality >= 0.1; quality = Math.round((quality - 0.1) * 10) / 10) {
      const blob = await toBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) return { blob, ancho, alto };
    }
    throw new Error('No se pudo comprimir la foto por debajo de 1.5 MB.');
  } finally {
    URL.revokeObjectURL?.(objectUrl);
  }
}

export async function listarFotosHallazgos(empresaId, hallazgoIds) {
  requireEmpresa(empresaId);
  const ids = [...new Set((hallazgoIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('diagnostico_tecnico_hallazgo_fotos')
    .select(FOTO_COLUMNS)
    .eq('empresa_id', empresaId)
    .in('hallazgo_id', ids)
    .order('orden', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw getError(error);
  const fotos = data || [];
  if (!fotos.length) return [];
  const { data: firmas, error: firmaError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(fotos.map(foto => foto.ruta_storage), 60 * 60);
  if (firmaError) throw getError(firmaError);
  const urls = new Map((firmas || []).map(firma => [firma.path, firma.signedUrl]));
  return fotos.map(foto => ({ ...foto, signedUrl: urls.get(foto.ruta_storage) || null }));
}

export async function subirFotoHallazgo({ empresaId, diagnosticoId, hallazgoId, archivo, leyenda = null }) {
  requireEmpresa(empresaId);
  if (!diagnosticoId) throw new Error('Falta el diagnóstico técnico.');
  if (!hallazgoId) throw new Error('Guarda el hallazgo antes de agregar fotos.');
  const supabase = getSupabaseClient();
  const { count, data: existentes, error: countError } = await supabase
    .from('diagnostico_tecnico_hallazgo_fotos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('hallazgo_id', hallazgoId);
  if (countError) throw getError(countError);
  const total = Number.isFinite(count) ? count : (existentes || []).length;
  if (total >= MAX_FOTOS) throw new Error('Un hallazgo admite como máximo tres fotos.');
  const { blob, ancho, alto } = await comprimirImagen(archivo);
  const rutaStorage = `${empresaId}/${diagnosticoId}/${hallazgoId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(rutaStorage, blob, {
    upsert: false,
    contentType: 'image/jpeg',
  });
  if (uploadError) throw getError(uploadError);
  const payload = {
    empresa_id: empresaId,
    hallazgo_id: hallazgoId,
    ruta_storage: rutaStorage,
    nombre_original: archivo.name || null,
    mime_type: 'image/jpeg',
    tamano_bytes: blob.size,
    ancho,
    alto,
    leyenda: String(leyenda || '').trim() || null,
    orden: total + 1,
  };
  const { data, error } = await supabase.from('diagnostico_tecnico_hallazgo_fotos').insert(payload).select(FOTO_COLUMNS).single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([rutaStorage]).catch(() => {});
    throw getError(error);
  }
  return data;
}

export async function borrarFotoHallazgo({ empresaId, id, rutaStorage }) {
  requireEmpresa(empresaId);
  if (!id) throw new Error('Falta la foto a eliminar.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('diagnostico_tecnico_hallazgo_fotos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .select('ruta_storage')
    .single();
  if (error) throw getError(error);
  const ruta = data?.ruta_storage || rutaStorage;
  if (!ruta) return { huerfana: false };
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([ruta]);
  return { huerfana: Boolean(storageError) };
}

export async function actualizarFotoHallazgo({ empresaId, id, leyenda, excluir_del_informe }) {
  requireEmpresa(empresaId);
  if (!id) throw new Error('Falta la foto a actualizar.');
  const { data, error } = await getSupabaseClient()
    .from('diagnostico_tecnico_hallazgo_fotos')
    .update({ leyenda: String(leyenda || '').trim() || null, excluir_del_informe: Boolean(excluir_del_informe) })
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .select(FOTO_COLUMNS)
    .single();
  if (error?.code === 'PGRST116') throw new Error('No se puede modificar esta foto en el estado actual del informe.');
  if (error) throw getError(error);
  if (!data) throw new Error('No se puede modificar esta foto en el estado actual del informe.');
  return data;
}
