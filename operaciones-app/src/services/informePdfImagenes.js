import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function blobADataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}

async function descargarComoDataUri(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo descargar la imagen.');
  return blobADataUri(await response.blob());
}

async function obtenerDimensiones(blob) {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const dimensiones = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dimensiones;
  } catch {
    return null;
  }
}

export async function prepararImagenesInforme(snapshot) {
  const warnings = [];
  const fotos = {};
  const dimensionesFotos = {};
  const rutas = [...new Set((snapshot?.hallazgos || [])
    .flatMap(hallazgo => hallazgo?.fotos || [])
    .map(foto => foto?.ruta_storage)
    .filter(Boolean))];

  if (rutas.length) {
    try {
      const { data, error } = await getSupabaseClient()
        .storage.from('diagnostico-fotos').createSignedUrls(rutas, 600);
      if (error) throw error;
      const signedByPath = new Map((data || []).map(item => [item.path, item.signedUrl]));
      await Promise.all(rutas.map(async ruta => {
        try {
          const signedUrl = signedByPath.get(ruta);
          if (!signedUrl) throw new Error('No hay URL firmada.');
          const response = await fetch(signedUrl);
          if (!response.ok) throw new Error('No se pudo descargar la imagen.');
          const blob = await response.blob();
          const [uri, dimensiones] = await Promise.all([blobADataUri(blob), obtenerDimensiones(blob)]);
          if (uri) {
            fotos[ruta] = uri;
            if (dimensiones) dimensionesFotos[ruta] = dimensiones;
          }
          else throw new Error('La imagen está vacía.');
        } catch {
          warnings.push('No se pudo cargar una foto.');
        }
      }));
    } catch {
      rutas.forEach(() => warnings.push('No se pudo cargar una foto.'));
    }
  }

  let logo = null;
  if (snapshot?.empresa?.logo_url) {
    try { logo = await descargarComoDataUri(snapshot.empresa.logo_url); } catch { logo = null; }
  }
  let firma = null;
  if (snapshot?.emisor?.firma_url) {
    try { firma = await descargarComoDataUri(snapshot.emisor.firma_url); } catch { firma = null; }
  }
  return { logo, firma, fotos, dimensionesFotos, warnings };
}
