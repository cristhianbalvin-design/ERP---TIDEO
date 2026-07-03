import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const COLOR_POR_ESTADO = {
  fuera: '#f97316',
  no_marcado: '#ef4444',
  sin_ubicacion: '#9ca3af',
};
const COLOR_DEFAULT = '#22c55e';

function iconoPunto(estado, activo) {
  const color = COLOR_POR_ESTADO[estado] || COLOR_DEFAULT;
  const size = activo ? 18 : 11;
  const anillo = activo ? 'box-shadow:0 0 0 3px rgba(6,182,212,.55),0 1px 6px rgba(0,0,0,.35);' : 'box-shadow:0 1px 6px rgba(0,0,0,.35);';
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;${anillo}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Separa puntos con coordenadas casi idénticas (mismo punto de marcación) en un pequeño círculo
// alrededor del centroide, para que no queden apilados uno encima de otro en el mapa.
function separarSolapados(puntos) {
  const grupos = new Map();
  puntos.forEach(p => {
    const key = `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  });
  const resultado = [];
  grupos.forEach(grupo => {
    if (grupo.length === 1) {
      resultado.push({ ...grupo[0], latDisplay: Number(grupo[0].lat), lngDisplay: Number(grupo[0].lng) });
      return;
    }
    const radioGrados = 0.00004;
    const factorLng = Math.cos((Number(grupo[0].lat) * Math.PI) / 180) || 1;
    grupo.forEach((p, i) => {
      const angulo = (2 * Math.PI * i) / grupo.length;
      resultado.push({
        ...p,
        latDisplay: Number(p.lat) + radioGrados * Math.cos(angulo),
        lngDisplay: Number(p.lng) + (radioGrados * Math.sin(angulo)) / factorLng,
      });
    });
  });
  return resultado;
}

function AjustarVista({ lat, lng, radio, mostrarRadio, puntos }) {
  const map = useMap();
  const anteriorRef = useRef(null);

  useEffect(() => {
    const idsPuntos = puntos.map(p => p.id).join(',');
    const key = `${lat},${lng},${radio},${mostrarRadio},${idsPuntos}`;
    if (anteriorRef.current === key) return;
    anteriorRef.current = key;
    const puntosBounds = puntos.map(p => [p.latDisplay, p.lngDisplay]);
    if (mostrarRadio) {
      const radioM = Math.max(radio || 250, 50);
      const dLat = radioM / 111320;
      const dLng = radioM / ((111320 * Math.cos((lat * Math.PI) / 180)) || 111320);
      puntosBounds.push([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]);
    } else {
      puntosBounds.push([lat, lng]);
    }
    map.fitBounds(puntosBounds, { maxZoom: 18, padding: [24, 24] });
  }, [lat, lng, radio, mostrarRadio, puntos, map]);

  return null;
}

function CentrarEnSeleccion({ punto }) {
  const map = useMap();

  useEffect(() => {
    if (!punto) return;
    map.flyTo([punto.latDisplay, punto.lngDisplay], Math.max(map.getZoom(), 17));
  }, [punto, map]);

  return null;
}

export function GeoMiniMapa({ lat, lng, radio = 250, puntos = [], seleccionado = null, onSeleccionar, mostrarRadio = true, altura = 220 }) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return <div className="card" style={{ padding: 16, minHeight: 180, display: 'grid', placeItems: 'center' }}><span className="text-muted">Ingresa coordenadas para ver el mapa.</span></div>;
  }
  const radioNum = Number(radio) || 250;
  const puntosValidos = puntos.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  const puntosDisplay = separarSolapados(puntosValidos);
  const puntoSeleccionado = seleccionado != null ? puntosDisplay.find(p => p.id === seleccionado) : null;

  return (
    <div style={{ position: 'relative', height: altura, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer center={[latNum, lngNum]} zoom={16} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {mostrarRadio && <Circle center={[latNum, lngNum]} radius={radioNum} pathOptions={{ color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.12, weight: 2 }} />}
        <AjustarVista lat={latNum} lng={lngNum} radio={radioNum} mostrarRadio={mostrarRadio} puntos={puntosDisplay} />
        {puntosDisplay.map((p, i) => (
          <Marker
            key={p.id || i}
            position={[p.latDisplay, p.lngDisplay]}
            icon={iconoPunto(p.estado, seleccionado != null && seleccionado === p.id)}
            eventHandlers={onSeleccionar ? { click: () => onSeleccionar(p.id) } : undefined}
          />
        ))}
        <CentrarEnSeleccion punto={puntoSeleccionado} />
      </MapContainer>
      {mostrarRadio && <div className="badge badge-cyan" style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 1000 }}>Radio {radio} m</div>}
    </div>
  );
}
