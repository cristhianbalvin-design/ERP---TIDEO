import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ESTADO = {
  completada: { label: 'Completada', color: '#16a34a' },
  omitida: { label: 'Omitida', color: '#f59e0b' },
};
const PLANIFICADA = { label: 'Parada planificada', color: '#2563eb' };

const icono = color => {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.35)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
};

function AjustarVista({ puntos }) {
  const map = useMap();
  useEffect(() => {
    if (!puntos.length) return;
    map.fitBounds(puntos.map(p => [p.lat, p.lng]), { padding: [28, 28], maxZoom: 16 });
  }, [map, puntos]);
  return null;
}

function EnfocarParada({ punto }) {
  const map = useMap();
  useEffect(() => {
    if (!punto) return;
    map.flyTo([punto.lat, punto.lng], Math.max(map.getZoom(), 16), { duration: 0.7 });
  }, [map, punto]);
  return null;
}

export function RutaParadasMapa({ paradas = [], selectedStopId = null }) {
  const puntos = useMemo(() => paradas.flatMap(parada => {
    const puntosParada = [];
    const latEntrega = Number(parada.latitud_entrega);
    const lngEntrega = Number(parada.longitud_entrega);
    const latPlanificada = Number(parada.latitud_parada);
    const lngPlanificada = Number(parada.longitud_parada);
    if (['completada', 'omitida'].includes(parada.estado) && Number.isFinite(latEntrega) && Number.isFinite(lngEntrega)) {
      puntosParada.push({ ...parada, lat: latEntrega, lng: lngEntrega, tipoPunto: 'entrega', color: ESTADO[parada.estado]?.color || '#64748b' });
    }
    if (Number.isFinite(latPlanificada) && Number.isFinite(lngPlanificada)) {
      puntosParada.push({ ...parada, lat: latPlanificada, lng: lngPlanificada, tipoPunto: 'planificada', color: PLANIFICADA.color });
    }
    return puntosParada;
  }), [paradas]);
  const puntoSeleccionado = useMemo(() => {
    const parada = paradas.find(item => item.id === selectedStopId);
    if (!parada) return null;
    const latEntrega = Number(parada.latitud_entrega);
    const lngEntrega = Number(parada.longitud_entrega);
    if (parada.latitud_entrega != null && parada.longitud_entrega != null && Number.isFinite(latEntrega) && Number.isFinite(lngEntrega)) return { lat: latEntrega, lng: lngEntrega };
    const latPlanificada = Number(parada.latitud_parada);
    const lngPlanificada = Number(parada.longitud_parada);
    return Number.isFinite(latPlanificada) && Number.isFinite(lngPlanificada)
      ? { lat: latPlanificada, lng: lngPlanificada }
      : null;
  }, [paradas, selectedStopId]);

  if (!puntos.length) {
    return (
      <div className="card" style={{ minHeight: 220, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⌖</div>
          <strong>Sin coordenadas de paradas</strong>
          <div className="text-muted" style={{ marginTop: 4 }}>Las paradas planificadas o completadas aparecerán aquí cuando tengan GPS.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <div>
          <h3 style={{ marginBottom: 3 }}>Mapa de paradas</h3>
          <div className="text-muted">{puntos.length} punto{puntos.length === 1 ? '' : 's'} con coordenadas GPS</div>
        </div>
        <div className="row" style={{ gap: 10, fontSize: 11 }}>
          {[...Object.entries(ESTADO).map(([key, value]) => [key, value]), ['planificada', PLANIFICADA]].map(([key, value]) => <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: value.color }} />{value.label}</span>)}
        </div>
      </div>
      <div style={{ height: 330 }}>
        <MapContainer center={[puntos[0].lat, puntos[0].lng]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <AjustarVista puntos={puntos} />
          <EnfocarParada punto={puntoSeleccionado} />
          {puntos.map((punto, index) => (
            <Marker key={`${punto.id || index}-${punto.tipoPunto}`} position={[punto.lat, punto.lng]} icon={icono(punto.color)}>
              <Popup>
                <strong>Parada {punto.secuencia || index + 1}</strong><br />
                {punto.tipoPunto === 'planificada' ? PLANIFICADA.label : ESTADO[punto.estado]?.label || punto.estado}<br />
                <span>{punto.tipo_documento === 'libre' ? `Parada libre: ${(punto.descripcion_libre || 'Sin descripcion').slice(0, 80)}` : punto.tipo_documento === 'guia_remision' ? 'Guía de remisión' : 'Tránsito OC'}</span><br />
                <span>{punto.lat.toFixed(6)}, {punto.lng.toFixed(6)}</span>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
