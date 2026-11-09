import React, { useEffect, useRef, useState } from 'react';
import leafletCss from 'leaflet/dist/leaflet.css?inline';

// Leaflet usa window al cargarse: se importa solo cuando se muestra el mapa.
let leafletPromise = null;
const cargarLeaflet = () => (leafletPromise ||= import('leaflet').then(mod => mod.default || mod));
const CENTRO = [-12.6, -75.5];
const COLOR_RUTA = '#00ACC1';
const COLOR_AVANCE = '#7C4DFF';

// rutas: [{ id, puntos: [{ coords:[lat,lng], etiqueta, tono:'a'|'b'|'n' }], posicion:[lat,lng],
//   marca:'texto', alerta:boolean, enVivo:boolean }]
export function TransporteMapaRutas({ rutas = [], className = '', aviso = '', zoomMaximo = 11 }) {
  const [L, setL] = useState(null);
  const nodo = useRef(null);
  const mapa = useRef(null);
  const capa = useRef(null);
  const encuadre = useRef(() => {});
  useEffect(() => {
    let vigente = true;
    cargarLeaflet().then(lib => { if (vigente) setL(() => lib); }).catch(() => {});
    return () => { vigente = false; };
  }, []);
  useEffect(() => {
    if (!L || !nodo.current) return undefined;
    const instancia = L.map(nodo.current, { scrollWheelZoom: false }).setView(CENTRO, 6);
    mapa.current = instancia;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(instancia);
    const observer = new ResizeObserver(() => { instancia.invalidateSize(); encuadre.current(); });
    observer.observe(nodo.current);
    return () => { observer.disconnect(); instancia.remove(); mapa.current = null; };
  }, [L]);
  useEffect(() => {
    const instancia = mapa.current;
    if (!L || !instancia) return;
    capa.current?.remove();
    const grupo = L.layerGroup().addTo(instancia);
    capa.current = grupo;
    const coords = [];
    rutas.forEach(ruta => {
      const puntos = ruta.puntos.filter(punto => punto.coords);
      const linea = puntos.map(punto => punto.coords);
      coords.push(...linea);
      if (linea.length > 1) {
        L.polyline(linea, { color: COLOR_RUTA, weight: 4, opacity: .85, dashArray: ruta.enVivo ? null : '8 8' }).addTo(grupo);
      }
      if (ruta.posicion && linea.length) {
        L.polyline([linea[0], ruta.posicion], { color: COLOR_AVANCE, weight: 5 }).addTo(grupo);
        L.circleMarker(ruta.posicion, { radius: 6, color: '#FFFFFF', weight: 2, fillColor: ruta.alerta ? '#D97706' : '#1A2B4A', fillOpacity: 1 }).addTo(grupo);
        if (ruta.marca) {
          L.marker(ruta.posicion, { interactive: false, icon: L.divIcon({ className: `dx-tms-map-tag${ruta.alerta ? ' is-alert' : ''}`,
            html: `<span>${ruta.alerta ? '⚑ ' : ''}${ruta.marca}</span>`, iconSize: [96, 26], iconAnchor: [48, 36] }) }).addTo(grupo);
        }
        coords.push(ruta.posicion);
      }
      puntos.forEach(punto => {
        if (!punto.etiqueta) {
          L.circleMarker(punto.coords, { radius: 5, color: COLOR_RUTA, weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(grupo);
          return;
        }
        L.marker(punto.coords, { interactive: false, icon: L.divIcon({ className: `dx-transporte-composer-marker is-${punto.tono || 'n'}`,
          html: `<span>${punto.etiqueta}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(grupo);
      });
    });
    encuadre.current = () => {
      if (!mapa.current) return;
      if (coords.length > 1) mapa.current.fitBounds(coords, { padding: [34, 34], maxZoom: zoomMaximo, animate: false });
      else if (coords.length === 1) mapa.current.setView(coords[0], 10, { animate: false });
      else mapa.current.setView(CENTRO, 5, { animate: false });
    };
    encuadre.current();
  }, [L, rutas, zoomMaximo]);
  return <div className={`dx-tms-map ${className}`}>
    <style>{leafletCss}</style><div ref={nodo} className="dx-tms-map-canvas" />
    {aviso && <div className="dx-tms-map-aviso">{aviso}</div>}
  </div>;
}

export default TransporteMapaRutas;
