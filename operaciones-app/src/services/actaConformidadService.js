import { getSupabaseClient } from '../lib/supabaseClient.js';
import { mensajeErrorActa } from '../zahory-mock/pages/actaConformidadLogic.js';

export const BUCKET_ACTAS = 'actas-conformidad';
const MAX_BYTES_FOTO = 1572864;
const LADO_MAX_FOTO = 1600;

const errorActa = error => new Error(mensajeErrorActa(error));

const requerir = (valor, mensaje) => {
  if (!valor) throw new Error(mensaje);
};

export async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const nuevoId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const rutaBase = (empresaId, otId, carpeta) => `${empresaId}/${otId}/${carpeta}`;

const aBlob = (canvas, tipo, calidad) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la imagen.'))), tipo, calidad);
});

// Reduce la foto a 1600 px por lado y menos de 1.5 MB, en JPEG.
export async function comprimirFotoActa(archivo) {
  if (!archivo || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(archivo.type || '')) {
    throw new Error('Selecciona una foto JPEG, PNG o WEBP.');
  }
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la foto.'));
      img.src = url;
    });
    const ancho0 = imagen.naturalWidth || imagen.width;
    const alto0 = imagen.naturalHeight || imagen.height;
    if (!ancho0 || !alto0) throw new Error('La foto no tiene dimensiones válidas.');
    const escala = Math.min(1, LADO_MAX_FOTO / Math.max(ancho0, alto0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(ancho0 * escala));
    canvas.height = Math.max(1, Math.round(alto0 * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la foto.');
    ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    for (let calidad = 0.82; calidad >= 0.3; calidad -= 0.1) {
      const blob = await aBlob(canvas, 'image/jpeg', calidad);
      if (blob.size <= MAX_BYTES_FOTO) return { blob, ancho: canvas.width, alto: canvas.height };
    }
    throw new Error('No se pudo reducir la foto por debajo de 1.5 MB.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Ubicación del dispositivo; si no hay permiso o tarda, devuelve null y el acta sigue.
export function obtenerUbicacion({ timeoutMs = 8000 } = {}) {
  const geo = globalThis.navigator?.geolocation;
  if (!geo?.getCurrentPosition) return Promise.resolve(null);
  return new Promise(resolve => {
    let resuelto = false;
    const terminar = valor => { if (!resuelto) { resuelto = true; resolve(valor); } };
    const timer = setTimeout(() => terminar(null), timeoutMs + 500);
    geo.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        terminar({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), precision_m: Math.round(pos.coords.accuracy || 0) || null });
      },
      () => { clearTimeout(timer); terminar(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

async function subir(ruta, blob, contentType) {
  const { error } = await getSupabaseClient().storage.from(BUCKET_ACTAS).upload(ruta, blob, { upsert: false, contentType });
  if (error) throw errorActa(error);
}

export async function subirFotoActa({ empresaId, otId, borradorId, tipo, archivo, geo = null }) {
  requerir(empresaId && otId && borradorId, 'Faltan los datos de la OT.');
  if (!['antes', 'despues'].includes(tipo)) throw new Error('Tipo de foto no válido.');
  const { blob, ancho, alto } = await comprimirFotoActa(archivo);
  const sha256 = await sha256Hex(blob);
  const path = `${rutaBase(empresaId, otId, borradorId)}/${tipo}-${nuevoId()}.jpg`;
  await subir(path, blob, 'image/jpeg');
  return { tipo, path, sha256, tomada_en: new Date().toISOString(), geo, ancho, alto, tamano: blob.size };
}

// Quita una foto del borrador. Las fotos de un acta emitida quedan congeladas por política.
export async function quitarFotoBorrador(path) {
  if (!path) return;
  const { error } = await getSupabaseClient().storage.from(BUCKET_ACTAS).remove([path]);
  if (error) throw errorActa(error);
}

export async function dataUrlABlob(dataUrl) {
  const respuesta = await fetch(dataUrl);
  return respuesta.blob();
}

export async function subirFirmaActa({ empresaId, otId, borradorId, rol, dataUrl, dispositivo, geo }) {
  requerir(dataUrl, 'Falta la firma.');
  const blob = await dataUrlABlob(dataUrl);
  const sha256 = await sha256Hex(blob);
  const path = `${rutaBase(empresaId, otId, borradorId)}/firma-${rol}-${nuevoId()}.png`;
  await subir(path, blob, 'image/png');
  return { path, sha256, dispositivo, geo: geo || null };
}

export async function urlsFirmadasActa(paths, segundos = 3600) {
  const unicos = [...new Set((paths || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await getSupabaseClient().storage.from(BUCKET_ACTAS).createSignedUrls(unicos, segundos);
  if (error) throw errorActa(error);
  return new Map((data || []).map(item => [item.path, item.signedUrl]));
}

export async function emitirActa({ empresaId, otId, datos }) {
  const { data, error } = await getSupabaseClient().rpc('cerrar_ot_con_acta', {
    p_empresa_id: empresaId,
    p_orden_trabajo_id: otId,
    p_datos: datos,
  });
  if (error) throw errorActa(error);
  if (!data?.cierre_id) throw new Error('El servidor no devolvió el acta emitida.');
  return data;
}

export async function guardarPdfActa({ empresaId, otId, cierreId, numero, blob }) {
  const sha256 = await sha256Hex(blob);
  const nombre = String(numero || 'acta').replace(/[^A-Za-z0-9-]/g, '-');
  const path = `${rutaBase(empresaId, otId, cierreId)}/${nombre}.pdf`;
  const supabase = getSupabaseClient();
  const { error: subidaError } = await supabase.storage.from(BUCKET_ACTAS).upload(path, blob, { upsert: false, contentType: 'application/pdf' });
  // Si un reintento ya lo subió, se registra igual: la RPC compara la huella.
  if (subidaError && !/exists|duplicate/i.test(subidaError.message || '')) throw errorActa(subidaError);
  const { data, error } = await supabase.rpc('registrar_pdf_acta', { p_empresa_id: empresaId, p_cierre_id: cierreId, p_path: path, p_sha256: sha256 });
  if (error) throw errorActa(error);
  return { path, sha256, ...data };
}

export async function enviarCorreoActa({ empresaId, cierreId }) {
  const { data, error } = await getSupabaseClient().functions.invoke('acta-conformidad-enviar', {
    body: { empresa_id: empresaId, cierre_id: cierreId },
  });
  if (error) {
    let detalle = '';
    try { detalle = (await error.context?.json?.())?.error || ''; } catch { detalle = ''; }
    throw new Error(detalle || 'No se pudo enviar el correo del acta.');
  }
  if (!data?.ok) throw new Error(data?.error || 'No se pudo enviar el correo del acta.');
  return data;
}

// Datos de apoyo del asistente: cliente, OS, contacto y técnico. Cada consulta es opcional:
// si RLS no la permite, el asistente sigue con lo que tenga (la RPC usa los datos del servidor).
export async function cargarContextoActa({ empresaId, ot }) {
  const supabase = getSupabaseClient();
  const resultado = { cliente: null, os: null, correoContacto: '', contactoNombre: '', contactoCargo: '', tecnico: null };
  const seguro = async consulta => {
    try {
      const { data, error } = await consulta;
      return error ? null : data;
    } catch {
      return null;
    }
  };
  const [cuenta, os, tecnico] = await Promise.all([
    ot.cuenta_id ? seguro(supabase.from('cuentas').select('id,razon_social,nombre_comercial,ruc,email').eq('id', ot.cuenta_id).maybeSingle()) : null,
    ot.os_cliente_id ? seguro(supabase.from('os_clientes').select('id,numero,tipo_cobro,contacto_id,cuenta_id').eq('id', ot.os_cliente_id).eq('empresa_id', empresaId).maybeSingle()) : null,
    ot.tecnico_responsable_id ? seguro(supabase.from('personal_operativo').select('id,nombre,documento,cargo').eq('id', ot.tecnico_responsable_id).eq('empresa_id', empresaId).maybeSingle()) : null,
  ]);
  resultado.cliente = cuenta;
  resultado.os = os;
  resultado.tecnico = tecnico;
  let contacto = null;
  if (os?.contacto_id) contacto = await seguro(supabase.from('contactos').select('nombre,cargo,email').eq('id', os.contacto_id).maybeSingle());
  if (!contacto?.email && (ot.cuenta_id || os?.cuenta_id)) {
    const lista = await seguro(supabase.from('contactos').select('nombre,cargo,email,es_principal').eq('cuenta_id', ot.cuenta_id || os.cuenta_id).not('email', 'is', null).order('es_principal', { ascending: false }).limit(1));
    contacto = lista?.[0] || contacto;
  }
  resultado.correoContacto = contacto?.email || cuenta?.email || '';
  resultado.contactoNombre = contacto?.nombre || '';
  resultado.contactoCargo = contacto?.cargo || '';
  return resultado;
}

export async function descargarComoDataUrl(url) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error('No se pudo descargar la imagen.');
  const blob = await respuesta.blob();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(typeof lector.result === 'string' ? lector.result : null);
    lector.onerror = () => reject(lector.error || new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(blob);
  });
}
