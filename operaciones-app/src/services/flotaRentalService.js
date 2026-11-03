import { getSupabaseClient } from '../lib/supabaseClient.js';
import { comprimirFotoActa, dataUrlABlob, nuevoId, sha256Hex } from './actaConformidadService.js';

// PR B · Flota & Alquileres: actas de despacho/retorno, certificaciones y garantías.
// Todas las escrituras pasan por RPC (migración 653); las lecturas usan RLS.

export const BUCKET_FLOTA = 'flota-rental';
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const TIPOS_DOC = /^(application\/pdf|image\/(jpeg|png|webp))$/i;

const db = () => getSupabaseClient();
const requerirEmpresa = empresaId => { if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.'); };
const fallo = error => new Error(error?.message || 'Ocurrió un error inesperado.');
const datos = ({ data, error }) => { if (error) throw fallo(error); return data; };
const rpc = async (fn, args) => datos(await db().rpc(fn, args));

export const hoyLocal = () => {
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  return ahora.toISOString().slice(0, 10);
};

export const ahoraLocalInput = () => {
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  return ahora.toISOString().slice(0, 16);
};

export const formatoFecha = valor => {
  if (!valor) return 'Sin dato';
  const fecha = String(valor).length <= 10 ? new Date(`${valor}T12:00:00`) : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Sin dato';
  return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatoFechaHora = valor => {
  if (!valor) return 'Sin dato';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Sin dato';
  return fecha.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const formatoMonto = (monto, moneda) => {
  if (monto == null || monto === '') return 'Sin dato';
  const valor = Math.round(Number(monto) * 100) / 100;
  return `${moneda || ''} ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
};

export const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Permisos ----------
export async function permisosPantalla(empresaId, pantalla, acciones = ['ver', 'crear', 'editar', 'anular']) {
  requerirEmpresa(empresaId);
  const valores = await Promise.all(acciones.map(accion => db().rpc('usuario_puede', {
    target_empresa_id: empresaId, target_pantalla: pantalla, target_accion: accion,
  }).then(({ data, error }) => !error && Boolean(data)).catch(() => false)));
  return Object.fromEntries(acciones.map((accion, i) => [accion, valores[i]]));
}

// ---------- Equipos y contratos ----------
export async function cargarEquiposPropios(empresaId) {
  requerirEmpresa(empresaId);
  return datos(await db().from('activos')
    .select('id,codigo,nombre,marca,modelo,tipo_categoria,horometro_actual,estado')
    .eq('empresa_id', empresaId).eq('propietario_tipo', 'propio').neq('estado', 'dado_baja')
    .order('codigo').limit(1000)) || [];
}

export async function cargarEstadoEquipos(empresaId) {
  requerirEmpresa(empresaId);
  const filas = await rpc('flota_estado_equipos', { p_empresa_id: empresaId });
  return new Map((filas || []).map(fila => [fila.activo_id, fila]));
}

export async function cargarRequisitos(empresaId, activoId, fecha) {
  return rpc('flota_requisitos_despacho', { p_empresa_id: empresaId, p_activo_id: activoId, p_fecha: fecha || hoyLocal() });
}

// Equipos asignados a contratos, con datos del contrato y del cliente.
export async function cargarEquiposDeContratos(empresaId) {
  requerirEmpresa(empresaId);
  const filas = datos(await db().from('contratos_alquiler_equipos')
    .select('id,equipo_id,activo:activos(id,codigo,nombre,horometro_actual,estado),contrato:contratos_alquiler!inner(id,empresa_id,numero,estado,fecha_inicio,fecha_fin,cuenta_id,moneda)')
    .eq('contrato.empresa_id', empresaId).limit(2000)) || [];
  const cuentaIds = [...new Set(filas.map(f => f.contrato?.cuenta_id).filter(Boolean))];
  const cuentas = cuentaIds.length ? datos(await db().from('cuentas').select('id,nombre_comercial,razon_social').eq('empresa_id', empresaId).in('id', cuentaIds)) : [];
  const nombre = new Map((cuentas || []).map(c => [c.id, c.nombre_comercial || c.razon_social || '']));
  return filas.map(f => ({ ...f, cliente: nombre.get(f.contrato?.cuenta_id) || '' }));
}

export async function cargarContratos(empresaId) {
  requerirEmpresa(empresaId);
  return datos(await db().from('contratos_alquiler').select('id,numero,estado,fecha_inicio,fecha_fin,moneda')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(1000)) || [];
}

export async function cargarGuias(empresaId) {
  requerirEmpresa(empresaId);
  return datos(await db().from('guias_remision').select('id,numero_completo,fecha_emision,destinatario_razon_social,anulado')
    .eq('empresa_id', empresaId).or('anulado.is.null,anulado.eq.false')
    .order('fecha_emision', { ascending: false }).limit(300)) || [];
}

// ---------- Archivos (bucket privado flota-rental) ----------
async function subir(path, blob, contentType) {
  const { error } = await db().storage.from(BUCKET_FLOTA).upload(path, blob, { upsert: false, contentType });
  if (error) throw fallo(error);
}

export async function subirFotoActa({ empresaId, carpeta, archivo }) {
  const { blob } = await comprimirFotoActa(archivo);
  const sha256 = await sha256Hex(blob);
  const storage_path = `${empresaId}/actas/${carpeta}/foto-${nuevoId()}.jpg`;
  await subir(storage_path, blob, 'image/jpeg');
  return { tipo: 'foto', storage_path, sha256, local: URL.createObjectURL(blob) };
}

export async function subirFirmaActa({ empresaId, carpeta, rol, dataUrl }) {
  const blob = await dataUrlABlob(dataUrl);
  const sha256 = await sha256Hex(blob);
  const storage_path = `${empresaId}/actas/${carpeta}/firma-${rol}-${nuevoId()}.png`;
  await subir(storage_path, blob, 'image/png');
  return { storage_path, sha256 };
}

export async function subirDocumento({ empresaId, carpeta, archivo }) {
  if (!archivo) return null;
  if (!TIPOS_DOC.test(archivo.type || '')) throw new Error('Adjunta un PDF o una imagen JPEG, PNG o WEBP.');
  if (archivo.size > MAX_DOC_BYTES) throw new Error('El archivo supera los 10 MB.');
  const seguro = String(archivo.name || 'documento').normalize('NFD').replace(/[^\w.-]+/g, '-').slice(-80);
  const storage_path = `${empresaId}/${carpeta}/${nuevoId()}-${seguro}`;
  await subir(storage_path, archivo, archivo.type);
  return storage_path;
}

// Borra un archivo subido que no llegó a registrarse (el servidor impide borrar los registrados).
export async function descartarArchivo(path) {
  if (!path) return;
  await db().storage.from(BUCKET_FLOTA).remove([path]).catch(() => {});
}

export async function urlsFirmadas(paths, segundos = 3600) {
  const unicos = [...new Set((paths || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await db().storage.from(BUCKET_FLOTA).createSignedUrls(unicos, segundos);
  if (error) throw fallo(error);
  return new Map((data || []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl]));
}

// ---------- Trazabilidad ----------
export async function cargarEventos(empresaId, entidad, entidadId) {
  return datos(await db().from('flota_eventos').select('id,accion,detalle,created_at')
    .eq('empresa_id', empresaId).eq('entidad', entidad).eq('entidad_id', String(entidadId))
    .order('created_at', { ascending: false }).limit(100)) || [];
}

// ---------- Catálogos ----------
export async function cargarSugeridos(empresaId, catalogo) {
  return rpc('flota_cargar_catalogo_sugerido', { p_empresa_id: empresaId, p_catalogo: catalogo });
}

export async function cargarChecklist(empresaId) {
  return datos(await db().from('flota_checklist_items').select('id,tipo_acta,texto,orden,activo')
    .eq('empresa_id', empresaId).order('orden').order('texto')) || [];
}

export async function guardarChecklistItem(empresaId, item) {
  return rpc('flota_guardar_checklist_item', { p_empresa_id: empresaId, p_item: item });
}

export async function cargarTiposCertificacion(empresaId) {
  return datos(await db().from('flota_certificacion_tipos')
    .select('id,nombre,descripcion,obligatoria,aplica_categorias,requiere_adjunto,dias_alerta,activo,version')
    .eq('empresa_id', empresaId).order('nombre')) || [];
}

export async function guardarTipoCertificacion(empresaId, tipo) {
  return rpc('flota_guardar_certificacion_tipo', { p_empresa_id: empresaId, p_tipo: tipo });
}

export async function cargarTiposGarantia(empresaId) {
  return datos(await db().from('flota_garantia_tipos')
    .select('id,nombre,categoria,descripcion,requiere_monto,dias_alerta,activo,version')
    .eq('empresa_id', empresaId).order('nombre')) || [];
}

export async function guardarTipoGarantia(empresaId, tipo) {
  return rpc('flota_guardar_garantia_tipo', { p_empresa_id: empresaId, p_tipo: tipo });
}

// ---------- Actas ----------
export async function cargarActas(empresaId) {
  requerirEmpresa(empresaId);
  const filas = datos(await db().from('actas_rental')
    .select('*,contrato:contratos_alquiler(id,numero,cuenta_id,estado),activo:activos(id,codigo,nombre,horometro_actual),guia:guias_remision(id,numero_completo)')
    .eq('empresa_id', empresaId).order('fecha_movimiento', { ascending: false }).limit(1000)) || [];
  const cuentaIds = [...new Set(filas.map(f => f.contrato?.cuenta_id).filter(Boolean))];
  const cuentas = cuentaIds.length ? datos(await db().from('cuentas').select('id,nombre_comercial,razon_social').eq('empresa_id', empresaId).in('id', cuentaIds)) : [];
  const nombre = new Map((cuentas || []).map(c => [c.id, c.nombre_comercial || c.razon_social || '']));
  return filas.map(f => ({ ...f, cliente: nombre.get(f.contrato?.cuenta_id) || '' }));
}

export async function cargarDetalleActa(empresaId, actaId) {
  const [evidencias, firmas, eventos] = await Promise.all([
    db().from('acta_rental_evidencias').select('id,tipo,storage_path,descripcion,created_at').eq('acta_id', actaId).order('created_at'),
    db().from('acta_rental_firmas').select('id,rol,nombre,documento,storage_path,firmado_at').eq('acta_id', actaId).order('firmado_at'),
    cargarEventos(empresaId, 'acta', actaId),
  ]);
  const ev = datos(evidencias) || [];
  const fi = datos(firmas) || [];
  const urls = await urlsFirmadas([...ev.map(e => e.storage_path), ...fi.map(f => f.storage_path)]).catch(() => new Map());
  return { evidencias: ev.map(e => ({ ...e, url: urls.get(e.storage_path) })), firmas: fi.map(f => ({ ...f, url: urls.get(f.storage_path) })), eventos };
}

export async function guardarActa(empresaId, acta, confirmar) {
  return rpc('flota_guardar_acta', { p_empresa_id: empresaId, p_acta: acta, p_confirmar: Boolean(confirmar) });
}

export async function anularActa(actaId, motivo) {
  return rpc('flota_anular_acta', { p_acta_id: actaId, p_motivo: motivo });
}

// ---------- Certificaciones ----------
export async function cargarCertificaciones(empresaId) {
  requerirEmpresa(empresaId);
  return datos(await db().from('activo_certificaciones')
    .select('*,tipo:flota_certificacion_tipos(id,nombre,obligatoria,requiere_adjunto,dias_alerta),activo:activos(id,codigo,nombre,tipo_categoria)')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(2000)) || [];
}

export async function registrarCertificacion(empresaId, cert) {
  return rpc('flota_registrar_certificacion', { p_empresa_id: empresaId, p_cert: cert });
}

export async function actualizarCertificacion(id, cambios) {
  return rpc('flota_actualizar_certificacion', { p_id: id, p_cambios: cambios });
}

export async function anularCertificacion(id, motivo) {
  return rpc('flota_anular_certificacion', { p_id: id, p_motivo: motivo });
}

export async function cargarAlertas(empresaId) {
  return rpc('flota_alertas_vencimiento', { p_empresa_id: empresaId });
}

// ---------- Garantías ----------
export async function cargarGarantias(empresaId) {
  requerirEmpresa(empresaId);
  const [garantias, reclamos] = await Promise.all([
    db().from('garantias_flota')
      .select('*,tipo:flota_garantia_tipos(id,nombre,categoria,requiere_monto,dias_alerta),activo:activos(id,codigo,nombre),contrato:contratos_alquiler(id,numero)')
      .eq('empresa_id', empresaId).order('fecha_fin').limit(2000),
    db().from('garantia_reclamos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(5000),
  ]);
  const recs = datos(reclamos) || [];
  return (datos(garantias) || []).map(g => ({ ...g, reclamos: recs.filter(r => r.garantia_id === g.id) }));
}

export async function guardarGarantia(empresaId, garantia) {
  return rpc('flota_guardar_garantia', { p_empresa_id: empresaId, p_garantia: garantia });
}

export async function cambiarEstadoGarantia(id, estado, motivo) {
  return rpc('flota_cambiar_estado_garantia', { p_id: id, p_estado: estado, p_motivo: motivo });
}

export async function registrarReclamo(garantiaId, reclamo) {
  return rpc('flota_registrar_reclamo', { p_garantia_id: garantiaId, p_reclamo: reclamo });
}

export async function actualizarReclamo(reclamoId, estado, resolucion) {
  return rpc('flota_actualizar_reclamo', { p_reclamo_id: reclamoId, p_estado: estado, p_resolucion: resolucion || null });
}

// Clave compartida para abrir el asistente de actas desde el Panel de Flota.
export const PRESELECCION_ACTA = 'opera.flota.acta.preseleccion';
export function guardarPreseleccionActa(valor) {
  try { sessionStorage.setItem(PRESELECCION_ACTA, JSON.stringify(valor)); } catch { /* opcional */ }
}
export function tomarPreseleccionActa() {
  try {
    const raw = sessionStorage.getItem(PRESELECCION_ACTA);
    sessionStorage.removeItem(PRESELECCION_ACTA);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
