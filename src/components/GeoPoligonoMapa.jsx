import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { I } from '../icons.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

function ControlDibujoPoligono({ poligonoGeojson, onChange }) {
  const map = useMap();

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    if (poligonoGeojson) {
      const layer = L.geoJSON(poligonoGeojson).getLayers()[0];
      if (layer) {
        drawnItems.addLayer(layer);
        map.fitBounds(layer.getBounds(), { maxZoom: 18 });
      }
    }

    const control = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: false },
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        rectangle: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    });
    map.addControl(control);

    const alCrear = e => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      onChange(e.layer.toGeoJSON().geometry);
    };
    const alEditar = () => {
      const layer = drawnItems.getLayers()[0];
      onChange(layer ? layer.toGeoJSON().geometry : null);
    };
    const alBorrar = () => onChange(null);

    map.on(L.Draw.Event.CREATED, alCrear);
    map.on(L.Draw.Event.EDITED, alEditar);
    map.on(L.Draw.Event.DELETED, alBorrar);

    return () => {
      map.off(L.Draw.Event.CREATED, alCrear);
      map.off(L.Draw.Event.EDITED, alEditar);
      map.off(L.Draw.Event.DELETED, alBorrar);
      map.removeControl(control);
      map.removeLayer(drawnItems);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

function RecentrarMapa({ centro }) {
  const map = useMap();
  const anteriorRef = useRef(null);

  useEffect(() => {
    if (!centro || !Number.isFinite(Number(centro.lat)) || !Number.isFinite(Number(centro.lng))) return;
    const key = `${centro.lat},${centro.lng}`;
    if (anteriorRef.current === key) return;
    anteriorRef.current = key;
    map.flyTo([Number(centro.lat), Number(centro.lng)], Math.max(map.getZoom(), 16));
  }, [centro, map]);

  return null;
}

function BotonMiUbicacion() {
  const map = useMap();
  const [buscando, setBuscando] = useState(false);

  const irAMiUbicacion = () => {
    if (!navigator.geolocation) return;
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 18);
        setBuscando(false);
      },
      () => setBuscando(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <button
      type="button"
      onClick={irAMiUbicacion}
      title="Ir a mi ubicación"
      disabled={buscando}
      style={{
        position: 'absolute', top: 10, right: 10, zIndex: 1000,
        width: 34, height: 34, borderRadius: 4, border: '2px solid rgba(0,0,0,0.2)',
        background: '#fff', color: buscando ? 'var(--fg-muted)' : '#333', cursor: buscando ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
    >
      <span style={{ width: 18, height: 18 }}>{I.target}</span>
    </button>
  );
}

export function GeoPoligonoMapa({ centro, poligonoGeojson, onChange }) {
  const centroValido = centro && Number.isFinite(Number(centro.lat)) && Number.isFinite(Number(centro.lng))
    ? [Number(centro.lat), Number(centro.lng)]
    : [-12.0464, -77.0428];

  return (
    <div style={{ height: 320, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer center={centroValido} zoom={17} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <ControlDibujoPoligono poligonoGeojson={poligonoGeojson} onChange={onChange} />
        <RecentrarMapa centro={centro} />
        <BotonMiUbicacion />
      </MapContainer>
    </div>
  );
}
