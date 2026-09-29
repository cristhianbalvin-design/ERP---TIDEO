import { isSupabaseMode } from '../lib/dataMode.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { cargarAdjuntos, obtenerUrlAdjunto } from './storageService.js';

export const CATEGORIA_FIRMA_RUBRICA = 'firma_rubrica';

const ENTIDAD_TIPO_POR_PERSONAL_TIPO = {
  administrativo: 'personal_administrativo',
  operativo: 'personal_operativo',
  personal_administrativo: 'personal_administrativo',
  personal_operativo: 'personal_operativo',
};

export function entidadTipoDesdePersonalTipo(personalTipo) {
  return ENTIDAD_TIPO_POR_PERSONAL_TIPO[personalTipo] || null;
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  if (typeof FileReader === 'undefined') {
    if (blob?.arrayBuffer) {
      blob.arrayBuffer().then(buf => {
        const base64 = Buffer.from(buf).toString('base64');
        const type = blob.type || 'image/jpeg';
        resolve(`data:${type};base64,${base64}`);
      }).catch(reject);
      return;
    }
    resolve(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// Devuelve el adjunto de firma/rúbrica más reciente (con su URL de acceso) para un colaborador, o null si no tiene.
export async function obtenerFirmaVigente({ empresaId, personalId, personalTipo }) {
  if (!empresaId || !personalId) return null;

  const entidadPrincipal = entidadTipoDesdePersonalTipo(personalTipo);
  const entidades = entidadPrincipal
    ? [entidadPrincipal, entidadPrincipal === 'personal_administrativo' ? 'personal_operativo' : 'personal_administrativo']
    : ['personal_administrativo', 'personal_operativo'];

  for (const entidadTipo of entidades) {
    try {
      const adjuntos = await cargarAdjuntos({ empresaId, entidadTipo, entidadId: personalId });
      const firma = adjuntos?.find(a => a.categoria === CATEGORIA_FIRMA_RUBRICA);
      if (firma) {
        let url = '';
        try {
          url = await obtenerUrlAdjunto(firma);
        } catch {
          url = firma.url || '';
        }
        return { ...firma, url };
      }
    } catch {
      // Intentar con la siguiente entidad
    }
  }

  return null;
}

// Obtiene la firma lista para incrustar en un documento PDF (preferentemente en base64 dataUrl)
export async function obtenerFirmaParaDocumento({ empresaId, personalId, personalTipo, persona = null }) {
  if (persona?.firma_rubrica_url && String(persona.firma_rubrica_url).startsWith('data:')) {
    return persona.firma_rubrica_url;
  }

  const firma = await obtenerFirmaVigente({ empresaId, personalId, personalTipo });
  if (firma) {
    if (firma.bucket && firma.storage_path && isSupabaseMode()) {
      try {
        const supabase = await getSupabaseClient();
        const { data: blob, error } = await supabase.storage.from(firma.bucket).download(firma.storage_path);
        if (!error && blob) {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl) return dataUrl;
        }
      } catch {
        // Continuar con otros fallbacks
      }
    }

    if (firma.url) {
      if (firma.url.startsWith('data:')) return firma.url;
      try {
        const res = await fetch(firma.url);
        if (res.ok) {
          const blob = await res.blob();
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl) return dataUrl;
        }
      } catch {
        // Fallback a URL directa
      }
      return firma.url;
    }
  }

  const fallback = persona?.firma_rubrica_url || persona?.firma_url || null;
  if (fallback) {
    if (String(fallback).startsWith('data:')) return fallback;
    try {
      const res = await fetch(fallback);
      if (res.ok) {
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) return dataUrl;
      }
    } catch {
      // Usar fallback directo
    }
    return fallback;
  }

  return null;
}

