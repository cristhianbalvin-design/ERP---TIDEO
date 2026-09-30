import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ESTADO = {
  completada: { label: 'Completada', color: '#16a34a' },
  omitida: { label: 'Omitida', color: '#f59e0b' },
};

const icono = estado => {
  const color = ESTADO[estado]?.color || '#64748b';
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

export function RutaParadasMapa({ paradas = [] }) {
  const puntos = useMemo(() => paradas
    .filter(parada => ['completada', 'omitida'].includes(parada.estado))
    .map(parada => ({
      ...parada,
      lat: Number(parada.latitud_entrega),
      lng: Number(parada.longitud_entrega),
    }))
    .filter(parada => Number.isFinite(parada.lat) && Number.isFinite(parada.lng)), [paradas]);

  if (!puntos.length) {
    return (
      <div className="card" style={{ minHeight: 220, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⌖</div>
          <strong>Sin coordenadas de entrega</strong>
          <div className="text-muted" style={{ marginTop: 4 }}>Las paradas completadas u omitidas aparecerán aquí cuando tengan GPS.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <div>
          <h3 style={{ marginBottom: 3 }}>Mapa de entregas</h3>
          <div className="text-muted">{puntos.length} parada{puntos.length === 1 ? '' : 's'} con evidencia GPS</div>
        </div>
        <div className="row" style={{ gap: 10, fontSize: 11 }}>
          {Object.entries(ESTADO).map(([key, value]) => <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: value.color }} />{value.label}</span>)}
        </div>
      </div>
      <div style={{ height: 330 }}>
        <MapContainer center={[puntos[0].lat, puntos[0].lng]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <AjustarVista puntos={puntos} />
          {puntos.map((punto, index) => (
            <Marker key={punto.id || index} position={[punto.lat, punto.lng]} icon={icono(punto.estado)}>
              <Popup>
                <strong>Parada {punto.secuencia || index + 1}</strong><br />
                {ESTADO[punto.estado]?.label || punto.estado}<br />
                <span>{punto.tipo_documento === 'guia_remision' ? 'Guía de remisión' : 'Tránsito OC'}</span><br />
                <span>{punto.lat.toFixed(6)}, {punto.lng.toFixed(6)}</span>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
