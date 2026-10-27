import { getSupabaseClient } from '../lib/supabaseClient.js';
import { catalogoComponentesService } from '../../../src/services/catalogoComponentesService.js';

// Diagnóstico de fabricación (migración 653): piezas, plano por pieza y características (pines).
const BUCKET = 'diagnostico-planos';
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_PLANO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PIEZA_COLUMNS = 'id,empresa_id,diagnostico_id,orden,nombre,cantidad,material_id,observaciones,plano_origen,plano_ruta,plano_imagen_ruta,plano_nombre_original,plano_mime,plano_pagina,plano_ancho,plano_alto,componente_catalogo_id,created_at,updated_at';
const CARACTERISTICA_COLUMNS = 'id,empresa_id,pieza_id,numero,nombre,tipo,nominal,tolerancia_menos,tolerancia_mas,unidad,critica,pos_x,pos_y,created_at,updated_at';
const MATERIAL_COLUMNS = 'id,codigo,descripcion,unidad';

export const TIPOS_CARACTERISTICA = [
  { id: 'cota', etiqueta: 'Cota' },
  { id: 'rosca', etiqueta: 'Rosca' },
  { id: 'acabado', etiqueta: 'Acabado' },
  { id: 'tratamiento', etiqueta: 'Tratamiento térmico' },
  { id: 'material', etiqueta: 'Material' },
  { id: 'otro', etiqueta: 'Otro' },
];

const requireEmpresa = empresaId => { if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.'); };
const requireId = (value, message) => { if (!value) throw new Error(message); };

export function mensajeErrorFabricacion(error) {
  const mensaje = String(error?.message || '');
  if (/emitido/i.test(mensaje)) return 'El diagnóstico está emitido: ya no se pueden cambiar piezas, planos ni características.';
  if (/diagnostico_fabricacion_caracteristicas_numero_uq|duplicate key/i.test(mensaje)) return 'Ya existe una característica con ese número en la pieza.';
  if (/material/i.test(mensaje) && /cat[aá]logo/i.test(mensaje)) return 'El material debe ser del catálogo de la empresa.';
  return mensaje || 'No se pudo completar la operación.';
}
const toError = error => new Error(mensajeErrorFabricacion(error));

const numero = value => (value === '' || value === null || value === undefined ? null : Number(value));

export function normalizarPieza(row) {
  return {
    ...row,
    cantidad: Number(row.cantidad || 0),
    material: row.material || null,
    caracteristicas: (row.caracteristicas || []).map(normalizarCaracteristica).sort((a, b) => a.numero - b.numero),
  };
}

export function normalizarCaracteristica(row) {
  return { ...row, numero: Number(row.numero), pos_x: Number(row.pos_x), pos_y: Number(row.pos_y), critica: Boolean(row.critica) };
}

export function siguienteNumeroCaracteristica(caracteristicas = []) {
  return caracteristicas.reduce((max, item) => Math.max(max, Number(item.numero) || 0), 0) + 1;
}

// Qué le falta a una pieza para poder emitir (lo mismo que valida emitir_diagnostico_tecnico).
export function faltantesPieza(pieza) {
  const faltan = [];
  if (!pieza?.material_id) faltan.push('material');
  if (!pieza?.plano_origen) faltan.push('plano');
  return faltan;
}

export function resumenFabricacion(piezas = []) {
  const caracteristicas = piezas.flatMap(pieza => pieza.caracteristicas || []);
  return {
    piezas: piezas.length,
    unidades: piezas.reduce((sum, pieza) => sum + Number(pieza.cantidad || 0), 0),
    caracteristicas: caracteristicas.length,
    criticas: caracteristicas.filter(item => item.critica).length,
    incompletas: piezas.filter(pieza => faltantesPieza(pieza).length).length,
  };
}

export async function listarPiezasFabricacion(empresaId, diagnosticoId) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const supabase = getSupabaseClient();
  const { data: piezas, error } = await supabase
    .from('diagnostico_fabricacion_piezas')
    .select(PIEZA_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('diagnostico_id', diagnosticoId)
    .order('orden')
    .order('created_at');
  if (error) throw toError(error);
  const filas = piezas || [];
  if (!filas.length) return [];
  const ids = filas.map(pieza => pieza.id);
  const materialIds = [...new Set(filas.map(pieza => pieza.material_id).filter(Boolean))];
  const [caracteristicasResult, materialesResult] = await Promise.all([
    supabase.from('diagnostico_fabricacion_caracteristicas').select(CARACTERISTICA_COLUMNS).eq('empresa_id', empresaId).in('pieza_id', ids).order('numero'),
    materialIds.length
      ? supabase.from('materiales').select(MATERIAL_COLUMNS).eq('empresa_id', empresaId).in('id', materialIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (caracteristicasResult.error) throw toError(caracteristicasResult.error);
  if (materialesResult.error) throw toError(materialesResult.error);
  const materialPorId = new Map((materialesResult.data || []).map(material => [material.id, material]));
  return filas.map(pieza => normalizarPieza({
    ...pieza,
    material: materialPorId.get(pieza.material_id) || null,
    caracteristicas: (caracteristicasResult.data || []).filter(item => item.pieza_id === pieza.id),
  }));
}

export async function crearPiezaFabricacion(empresaId, diagnosticoId, datos) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const nombre = String(datos?.nombre || '').trim();
  if (!nombre) throw new Error('Escribe el nombre de la pieza.');
  const cantidad = numero(datos?.cantidad) ?? 1;
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor que cero.');
  const { data, error } = await getSupabaseClient().from('diagnostico_fabricacion_piezas').insert({
    empresa_id: empresaId,
    diagnostico_id: diagnosticoId,
    orden: Number(datos?.orden) || 1,
    nombre,
    cantidad,
    material_id: datos?.material_id || null,
    observaciones: String(datos?.observaciones || '').trim() || null,
  }).select(PIEZA_COLUMNS).single();
  if (error) throw toError(error);
  return normalizarPieza({ ...data, caracteristicas: [] });
}

export async function actualizarPiezaFabricacion(empresaId, piezaId, datos) {
  requireEmpresa(empresaId);
  requireId(piezaId, 'Falta la pieza.');
  const cambios = {};
  if (Object.prototype.hasOwnProperty.call(datos, 'nombre')) {
    const nombre = String(datos.nombre || '').trim();
    if (!nombre) throw new Error('Escribe el nombre de la pieza.');
    cambios.nombre = nombre;
  }
  if (Object.prototype.hasOwnProperty.call(datos, 'cantidad')) {
    const cantidad = numero(datos.cantidad);
    if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor que cero.');
    cambios.cantidad = cantidad;
  }
  if (Object.prototype.hasOwnProperty.call(datos, 'material_id')) cambios.material_id = datos.material_id || null;
  if (Object.prototype.hasOwnProperty.call(datos, 'observaciones')) cambios.observaciones = String(datos.observaciones || '').trim() || null;
  const { data, error } = await getSupabaseClient().from('diagnostico_fabricacion_piezas')
    .update(cambios).eq('empresa_id', empresaId).eq('id', piezaId).select(PIEZA_COLUMNS).single();
  if (error) throw toError(error);
  return data;
}

export async function eliminarPiezaFabricacion(empresaId, pieza) {
  requireEmpresa(empresaId);
  requireId(pieza?.id, 'Falta la pieza.');
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('diagnostico_fabricacion_piezas').delete().eq('empresa_id', empresaId).eq('id', pieza.id);
  if (error) throw toError(error);
  const rutas = [...new Set([pieza.plano_ruta, pieza.plano_imagen_ruta].filter(Boolean))];
  if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas).catch(() => {});
}

export async function buscarMaterialesCatalogo(empresaId, texto = '') {
  requireEmpresa(empresaId);
  const consulta = String(texto || '').trim().replace(/[%_,()]/g, ' ');
  let query = getSupabaseClient().from('materiales').select(MATERIAL_COLUMNS)
    .eq('empresa_id', empresaId).eq('estado', 'activo').order('descripcion').limit(20);
  if (consulta) query = query.or(`codigo.ilike.%${consulta}%,descripcion.ilike.%${consulta}%`);
  const { data, error } = await query;
  if (error) throw toError(error);
  return data || [];
}

export async function listarDibujosCatalogo(empresaId) {
  requireEmpresa(empresaId);
  const filas = await catalogoComponentesService.listar(empresaId, null);
  return (filas || []).filter(row => row.activo !== false && row.svg);
}

const extension = (nombre, mime) => {
  const desdeNombre = String(nombre || '').split('.').pop();
  if (desdeNombre && desdeNombre.length <= 5 && desdeNombre !== nombre) return desdeNombre.toLowerCase();
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime] || 'bin';
};

const nuevoId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const leerDimensiones = archivo => new Promise((resolve, reject) => {
  if (typeof Image === 'undefined' || !URL?.createObjectURL) { resolve({ ancho: null, alto: null }); return; }
  const url = URL.createObjectURL(archivo);
  const imagen = new Image();
  imagen.onload = () => { resolve({ ancho: imagen.naturalWidth || null, alto: imagen.naturalHeight || null }); URL.revokeObjectURL?.(url); };
  imagen.onerror = () => { URL.revokeObjectURL?.(url); reject(new Error('No se pudo leer la imagen del plano.')); };
  imagen.src = url;
});

// Convierte una página del PDF en JPEG para poner los pines encima. pdf.js se carga solo al usarlo.
export async function renderizarPaginaPdf(archivo, pagina = 1) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const documento = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const total = documento.numPages;
  const numeroPagina = Math.min(Math.max(1, Number(pagina) || 1), total);
  const page = await documento.getPage(numeroPagina);
  const base = page.getViewport({ scale: 1 });
  const escala = Math.min(3, 2000 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const contexto = canvas.getContext('2d');
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: contexto, viewport }).promise;
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo convertir el PDF.')), 'image/jpeg', 0.88));
  await documento.destroy?.();
  return { blob, ancho: canvas.width, alto: canvas.height, pagina: numeroPagina, paginas: total };
}

export async function subirPlanoPieza(empresaId, diagnosticoId, pieza, archivo, { pagina = 1 } = {}) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  requireId(pieza?.id, 'Falta la pieza.');
  if (!archivo || !MIME_PLANO.includes(archivo.type)) throw new Error('Sube una imagen (JPG, PNG o WEBP) o un PDF.');
  if (archivo.size > MAX_BYTES) throw new Error('El plano no puede pesar más de 10 MB.');
  const supabase = getSupabaseClient();
  const bucket = supabase.storage.from(BUCKET);
  const carpeta = `${empresaId}/${diagnosticoId}/${pieza.id}`;
  const base = nuevoId();
  const rutaOriginal = `${carpeta}/${base}.${extension(archivo.name, archivo.type)}`;
  let imagen = { blob: archivo, ancho: null, alto: null, pagina: null };
  if (archivo.type === 'application/pdf') imagen = await renderizarPaginaPdf(archivo, pagina);
  else Object.assign(imagen, await leerDimensiones(archivo));
  const rutaImagen = archivo.type === 'application/pdf' ? `${carpeta}/${base}-p${imagen.pagina}.jpg` : rutaOriginal;
  const subidas = [];
  const subir = async (ruta, cuerpo, tipo) => {
    const { error } = await bucket.upload(ruta, cuerpo, { contentType: tipo, upsert: false });
    if (error) throw toError(error);
    subidas.push(ruta);
  };
  try {
    await subir(rutaOriginal, archivo, archivo.type);
    if (rutaImagen !== rutaOriginal) await subir(rutaImagen, imagen.blob, 'image/jpeg');
    const { data, error } = await supabase.from('diagnostico_fabricacion_piezas').update({
      plano_origen: 'subido',
      plano_ruta: rutaOriginal,
      plano_imagen_ruta: rutaImagen,
      plano_nombre_original: archivo.name || null,
      plano_mime: archivo.type,
      plano_pagina: imagen.pagina,
      plano_ancho: imagen.ancho,
      plano_alto: imagen.alto,
      componente_catalogo_id: null,
    }).eq('empresa_id', empresaId).eq('id', pieza.id).select(PIEZA_COLUMNS).single();
    if (error) throw toError(error);
    const anteriores = [...new Set([pieza.plano_ruta, pieza.plano_imagen_ruta].filter(ruta => ruta && !subidas.includes(ruta)))];
    if (anteriores.length) await bucket.remove(anteriores).catch(() => {});
    return data;
  } catch (uploadError) {
    if (subidas.length) await bucket.remove(subidas).catch(() => {});
    throw uploadError;
  }
}

export async function usarDibujoCatalogoPieza(empresaId, pieza, componenteId) {
  requireEmpresa(empresaId);
  requireId(pieza?.id, 'Falta la pieza.');
  requireId(componenteId, 'Elige un dibujo del catálogo.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('diagnostico_fabricacion_piezas').update({
    plano_origen: 'catalogo',
    componente_catalogo_id: componenteId,
    plano_ruta: null,
    plano_imagen_ruta: null,
    plano_nombre_original: null,
    plano_mime: null,
    plano_pagina: null,
    plano_ancho: null,
    plano_alto: null,
  }).eq('empresa_id', empresaId).eq('id', pieza.id).select(PIEZA_COLUMNS).single();
  if (error) throw toError(error);
  const anteriores = [...new Set([pieza.plano_ruta, pieza.plano_imagen_ruta].filter(Boolean))];
  if (anteriores.length) await supabase.storage.from(BUCKET).remove(anteriores).catch(() => {});
  return data;
}

export async function firmarRutasPlanos(rutas = []) {
  const unicas = [...new Set((rutas || []).filter(Boolean))];
  if (!unicas.length) return new Map();
  const { data, error } = await getSupabaseClient().storage.from(BUCKET).createSignedUrls(unicas, 3600);
  if (error) throw toError(error);
  return new Map((data || []).filter(item => item?.signedUrl).map(item => [item.path, item.signedUrl]));
}

export async function guardarCaracteristica(empresaId, piezaId, caracteristica) {
  requireEmpresa(empresaId);
  requireId(piezaId, 'Falta la pieza.');
  const nombre = String(caracteristica?.nombre || '').trim();
  if (!nombre) throw new Error('Escribe el nombre de la característica.');
  const fila = {
    numero: Number(caracteristica.numero),
    nombre,
    tipo: caracteristica.tipo || 'cota',
    nominal: String(caracteristica.nominal ?? '').trim() || null,
    tolerancia_menos: String(caracteristica.tolerancia_menos ?? '').trim() || null,
    tolerancia_mas: String(caracteristica.tolerancia_mas ?? '').trim() || null,
    unidad: String(caracteristica.unidad ?? '').trim() || null,
    critica: Boolean(caracteristica.critica),
    pos_x: Math.min(100, Math.max(0, Math.round(Number(caracteristica.pos_x) * 100) / 100)),
    pos_y: Math.min(100, Math.max(0, Math.round(Number(caracteristica.pos_y) * 100) / 100)),
  };
  const tabla = getSupabaseClient().from('diagnostico_fabricacion_caracteristicas');
  const { data, error } = caracteristica.id
    ? await tabla.update(fila).eq('empresa_id', empresaId).eq('id', caracteristica.id).select(CARACTERISTICA_COLUMNS).single()
    : await tabla.insert({ ...fila, empresa_id: empresaId, pieza_id: piezaId }).select(CARACTERISTICA_COLUMNS).single();
  if (error) throw toError(error);
  return normalizarCaracteristica(data);
}

export async function eliminarCaracteristica(empresaId, caracteristicaId) {
  requireEmpresa(empresaId);
  requireId(caracteristicaId, 'Falta la característica.');
  const { error } = await getSupabaseClient().from('diagnostico_fabricacion_caracteristicas').delete().eq('empresa_id', empresaId).eq('id', caracteristicaId);
  if (error) throw toError(error);
}

export async function guardarReferenciaCliente(empresaId, diagnosticoId, referencia) {
  requireEmpresa(empresaId);
  requireId(diagnosticoId, 'Falta el diagnóstico técnico.');
  const { data, error } = await getSupabaseClient().from('diagnosticos_tecnicos')
    .update({ referencia_cliente: String(referencia || '').trim() || null })
    .eq('empresa_id', empresaId).eq('id', diagnosticoId).eq('estado', 'borrador')
    .select('id,referencia_cliente').single();
  if (error) throw toError(error);
  return data;
}
