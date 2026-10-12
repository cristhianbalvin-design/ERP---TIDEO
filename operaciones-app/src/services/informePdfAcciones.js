import { obtenerInformeVigente } from './diagnosticoInformeService.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function abrirInformePdfDeRecepcion(recepcionId, ventana) {
  let objectUrl = null;
  try {
    const informe = await obtenerInformeVigente(recepcionId);
    const emitido = informe?.emitidos?.[0];
    if (!emitido) throw new Error('Esta recepci\u00f3n a\u00fan no tiene un informe emitido.');

    const snapshot = emitido.snapshot;
    let firma = snapshot?.emisor?.firma_url || null;
    if (snapshot?.emisor?.firma_bucket && snapshot?.emisor?.firma_storage_path) {
      try {
        const { data, error } = await getSupabaseClient()
          .storage.from(snapshot.emisor.firma_bucket)
          .createSignedUrl(snapshot.emisor.firma_storage_path, 600);
        if (!error && data?.signedUrl) firma = data.signedUrl;
      } catch { /* Keep the available URL if it cannot be renewed. */ }
    }

    const { generarPdfInforme } = await import('../zahory-mock/pages/InformePdf.jsx');
    const { blob, warnings = [] } = await generarPdfInforme({
      ...snapshot,
      emisor: { ...(snapshot?.emisor || {}), firma_url: firma },
    });
    objectUrl = URL.createObjectURL(blob);

    if (ventana && !ventana.closed) {
      ventana.location.href = objectUrl;
    } else {
      const recepcion = String(snapshot?.cabecera?.numero_recepcion || 'recepcion')
        .replace(/[<>:"\/\\|?*\u0000-\u001F]/g, '-')
        .trim() || 'recepcion';
      const version = String(emitido.version ?? '1')
        .replace(/[<>:"\/\\|?*\u0000-\u001F]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'Informe-diagnostico-' + recepcion + '-v' + version + '.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }

    return { version: emitido.version, warnings };
  } catch (error) {
    ventana?.close?.();
    throw error;
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}

export async function listarInformesEmitidosRecepcion(empresaId, recepcionIds) {
  if (!recepcionIds?.length) return {};

  const { data, error } = await getSupabaseClient()
    .from('diagnostico_informes')
    .select('recepcion_id,version,estado')
    .eq('empresa_id', empresaId)
    .eq('estado', 'emitido')
    .in('recepcion_id', recepcionIds);
  if (error) throw new Error(error.message || 'No se pudieron listar los informes emitidos.');

  const informes = {};
  for (const informe of data || []) {
    const versionActual = informes[informe.recepcion_id]?.version;
    if (versionActual == null || Number(informe.version) > Number(versionActual)) {
      informes[informe.recepcion_id] = { version: informe.version };
    }
  }
  return informes;
}
