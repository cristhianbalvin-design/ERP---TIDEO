import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { rrhhService } from './rrhhService.js';

export const GEO_CONSENT_VERSION = 'gap15-2026-06-12';
export const GEO_OFFLINE_QUEUE_KEY = 'tideo_geo_asistencia_offline_v1';

export const GEO_CONFIG_DEFAULT = {
  asistencia_movil_ubicacion_habilitada: false,
  asistencia_movil_consentimiento_requerido: true,
  asistencia_movil_consentimiento_texto: 'Autorizo el uso puntual de mi ubicacion exclusivamente al marcar asistencia, para validar presencia en operacion y fines de seguridad SAR. No se realiza rastreo continuo ni en segundo plano.',
  geofencing_modo: 'flexible',
  geofencing_permitir_sin_gps: true,
  geofencing_precision_baja_m: 80,
  sar_habilitado: false,
  sar_hora_limite: '09:00',
  sar_gracia_minutos: 15,
};

const generateId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;

export function parseGps(value) {
  if (!value) return null;
  const parts = String(value).split(',').map(v => Number(String(v).trim()));
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return { lat: parts[0], lng: parts[1] };
}

export function distanciaMetros(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const r = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function evaluarGeofenceLocal({ trabajador, geocercas = [], asignaciones = [], fix, fecha = new Date().toISOString().slice(0, 10), config = {} }) {
  if (!fix?.lat || !fix?.lng) {
    return { estado: 'sin_ubicacion', motivo: fix?.motivo || 'gps_no_disponible' };
  }
  const activas = geocercas.filter(g => {
    if (g.estado && g.estado !== 'activo') return false;
    if (g.vigencia_desde && g.vigencia_desde > fecha) return false;
    if (g.vigencia_hasta && g.vigencia_hasta < fecha) return false;
    const asignada = asignaciones.some(a => {
      if (a.estado && a.estado !== 'activo') return false;
      if (a.geocerca_id !== g.id) return false;
      if (a.personal_id && a.personal_id === trabajador?.id) return true;
      if (a.sede_id && (a.sede_id === trabajador?.sede_id || a.sede_id === trabajador?.sede)) return true;
      return false;
    });
    return asignada;
  });
  if (!activas.length) return { estado: 'sin_geocerca', motivo: 'sin_geocerca_asignada' };
  const ordenadas = activas
    .map(g => ({ geocerca: g, distancia_m: distanciaMetros(fix, { lat: g.latitud ?? g.lat, lng: g.longitud ?? g.lng }) }))
    .filter(x => x.distancia_m != null)
    .sort((a, b) => a.distancia_m - b.distancia_m);
  const best = ordenadas[0];
  if (!best) return { estado: 'sin_geocerca', motivo: 'coordenadas_invalidas' };
  const precision = Number(fix.precision_m || fix.accuracy || 0);
  const radio = Number(best.geocerca.radio_m || 0);
  const dentro = best.distancia_m <= radio + precision;
  if (dentro) return { estado: 'dentro', geocerca_id: best.geocerca.id, geocerca_nombre: best.geocerca.nombre, distancia_m: Math.round(best.distancia_m), radio_m: radio };
  return {
    estado: (config.geofencing_modo || 'flexible') === 'estricto' ? 'rechazable' : 'fuera',
    geocerca_id: best.geocerca.id,
    geocerca_nombre: best.geocerca.nombre,
    distancia_m: Math.round(best.distancia_m),
    radio_m: radio,
  };
}

export function getGeoQueue() {
  try {
    const raw = localStorage.getItem(GEO_OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setGeoQueue(items) {
  try { localStorage.setItem(GEO_OFFLINE_QUEUE_KEY, JSON.stringify(items || [])); } catch {}
}

export function enqueueGeoMark(payload) {
  const item = { id: generateId('geooff'), created_at: new Date().toISOString(), payload };
  const next = [...getGeoQueue(), item].slice(-50);
  setGeoQueue(next);
  return item;
}

export async function syncGeoQueue({ onSynced } = {}) {
  const queue = getGeoQueue();
  if (!queue.length || !navigator.onLine) return { synced: 0, failed: 0 };
  const remaining = [];
  let synced = 0;
  for (const item of queue) {
    try {
      const { empresaId, registro, updateId } = item.payload;
      const saved = updateId
        ? await rrhhService.actualizarAsistencia(updateId, { ...registro, offline_sincronizado_en: new Date().toISOString() })
        : await rrhhService.registrarAsistencia(empresaId, { ...registro, offline_sincronizado_en: new Date().toISOString() });
      synced += 1;
      onSynced?.(saved, item);
    } catch {
      remaining.push(item);
    }
  }
  setGeoQueue(remaining);
  return { synced, failed: remaining.length };
}

export const geofencingService = {
  async listar(empresaId) {
    if (!isSupabaseConfigured() || !empresaId) return { geocercas: [], asignaciones: [], consentimientos: [] };
    const supabase = await getSupabaseClient();
    const [geos, asignaciones, consentimientos] = await Promise.all([
      supabase.from('rrhh_geocercas').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('rrhh_geocerca_asignaciones').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('rrhh_ubicacion_consentimientos').select('*').eq('empresa_id', empresaId).order('aceptado_en', { ascending: false }),
    ]);
    if (geos.error) throw geos.error;
    if (asignaciones.error) throw asignaciones.error;
    if (consentimientos.error) throw consentimientos.error;
    return { geocercas: geos.data || [], asignaciones: asignaciones.data || [], consentimientos: consentimientos.data || [] };
  },

  async guardarGeocerca(empresaId, geocerca) {
    if (!isSupabaseConfigured()) return { ...geocerca, id: geocerca.id || generateId('geo'), empresa_id: empresaId };
    const supabase = await getSupabaseClient();
    const payload = { ...geocerca, empresa_id: empresaId, updated_at: new Date().toISOString() };
    const query = geocerca.id
      ? supabase.from('rrhh_geocercas').update(payload).eq('id', geocerca.id)
      : supabase.from('rrhh_geocercas').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data;
  },

  async guardarAsignacion(empresaId, asignacion) {
    if (!isSupabaseConfigured()) return { ...asignacion, id: asignacion.id || generateId('gea'), empresa_id: empresaId };
    const supabase = await getSupabaseClient();
    const payload = { ...asignacion, empresa_id: empresaId, updated_at: new Date().toISOString() };
    const query = asignacion.id
      ? supabase.from('rrhh_geocerca_asignaciones').update(payload).eq('id', asignacion.id)
      : supabase.from('rrhh_geocerca_asignaciones').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data;
  },

  async registrarConsentimiento(empresaId, payload) {
    const row = { ...payload, empresa_id: empresaId, version: payload.version || GEO_CONSENT_VERSION };
    if (!isSupabaseConfigured()) return { ...row, id: generateId('gco'), aceptado_en: new Date().toISOString() };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rrhh_ubicacion_consentimientos')
      .upsert(row, { onConflict: 'empresa_id,personal_id,version' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async evaluarSar(empresaId, fecha) {
    if (!isSupabaseConfigured()) return 0;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('evaluar_sar_no_llegada', { p_empresa_id: empresaId, p_fecha: fecha });
    if (error) throw error;
    return data || 0;
  },
};
