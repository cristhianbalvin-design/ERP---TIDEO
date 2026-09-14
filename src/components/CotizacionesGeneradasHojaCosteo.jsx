import React, { useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

export async function listarCotizacionesGeneradasPorHojaCosteo(hojaCosteoId) {
  if (!hojaCosteoId || !isSupabaseConfigured()) return [];
  const supabase = await getSupabaseClient();
  const [estandarResult, especialResult] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('id,numero,estado')
      .eq('hoja_costeo_id', hojaCosteoId),
    supabase
      .from('cotizaciones_especiales')
      .select('id,numero,estado')
      .eq('hoja_costeo_id', hojaCosteoId),
  ]);

  if (estandarResult.error) throw estandarResult.error;
  if (especialResult.error) throw especialResult.error;

  return [
    ...(estandarResult.data || []).map(cotizacion => ({ ...cotizacion, tipo: 'estandar' })),
    ...(especialResult.data || []).map(cotizacion => ({ ...cotizacion, tipo: 'especial' })),
  ].sort((a, b) => String(a.numero || '').localeCompare(String(b.numero || ''), 'es'));
}

export async function listarHojasCosteoConCotizaciones(hojaCosteoIds = []) {
  const ids = [...new Set((hojaCosteoIds || []).filter(Boolean))];
  if (!ids.length || !isSupabaseConfigured()) return new Set();
  const supabase = await getSupabaseClient();
  const [estandarResult, especialResult] = await Promise.all([
    supabase.from('cotizaciones').select('hoja_costeo_id').in('hoja_costeo_id', ids),
    supabase.from('cotizaciones_especiales').select('hoja_costeo_id').in('hoja_costeo_id', ids),
  ]);

  if (estandarResult.error) throw estandarResult.error;
  if (especialResult.error) throw especialResult.error;

  return new Set([
    ...(estandarResult.data || []).map(cotizacion => cotizacion.hoja_costeo_id),
    ...(especialResult.data || []).map(cotizacion => cotizacion.hoja_costeo_id),
  ].filter(Boolean));
}

const etiquetaEstado = estado => String(estado || 'sin estado').replaceAll('_', ' ');

export function CotizacionesGeneradasHojaCosteo({ hojaCosteoId, navigate }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cargando, setCargando] = useState(Boolean(hojaCosteoId));
  const [error, setError] = useState('');

  useEffect(() => {
    let activa = true;
    if (!hojaCosteoId) {
      setCotizaciones([]);
      setCargando(false);
      return () => { activa = false; };
    }

    setCargando(true);
    setError('');
    listarCotizacionesGeneradasPorHojaCosteo(hojaCosteoId)
      .then(data => { if (activa) setCotizaciones(data); })
      .catch(err => {
        if (!activa) return;
        setCotizaciones([]);
        setError(err?.message || 'No se pudieron cargar las cotizaciones generadas.');
      })
      .finally(() => { if (activa) setCargando(false); });
    return () => { activa = false; };
  }, [hojaCosteoId]);

  const abrirCotizacion = cotizacion => {
    if (cotizacion.tipo === 'especial') {
      navigate('cotizaciones', { especial: 'detalle', especial_id: cotizacion.id });
      return;
    }
    navigate('cotizaciones', { detail: cotizacion.id });
  };

  return (
    <section className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: cargando || error || !cotizaciones.length ? 0 : 10 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 2 }}>Trazabilidad comercial</div>
          <div style={{ fontWeight: 700 }}>Cotizaciones generadas <span className="badge badge-gray" style={{ marginLeft: 5 }}>{cotizaciones.length}</span></div>
        </div>
      </div>

      {cargando && <div className="text-muted" style={{ fontSize: 13 }}>Cargando cotizaciones generadas…</div>}
      {!cargando && error && <div className="text-muted" style={{ fontSize: 13 }}>No se pudieron cargar las cotizaciones generadas.</div>}
      {!cargando && !error && !cotizaciones.length && <div className="text-muted" style={{ fontSize: 13 }}>Sin cotizaciones generadas todavía.</div>}
      {!cargando && !error && cotizaciones.length > 0 && (
        <div style={{ display: 'grid', gap: 7 }}>
          {cotizaciones.map(cotizacion => (
            <div key={`${cotizacion.tipo}-${cotizacion.id}`} className="row" style={{ justifyContent: 'space-between', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-subtle)' }}>
              <div className="row" style={{ gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                <span className={`badge ${cotizacion.tipo === 'especial' ? 'badge-purple' : 'badge-cyan'}`}>{cotizacion.tipo === 'especial' ? 'Especial' : 'Estándar'}</span>
                <strong className="mono">{cotizacion.numero || 'Sin número'}</strong>
                <span className="text-muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{etiquetaEstado(cotizacion.estado)}</span>
              </div>
              <button type="button" className="btn btn-secondary" style={{ padding: '5px 9px', fontSize: 12, flex: '0 0 auto' }} onClick={() => abrirCotizacion(cotizacion)}>Abrir</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
