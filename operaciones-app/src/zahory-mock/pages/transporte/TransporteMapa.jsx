import React, { useEffect, useRef, useState } from 'react';
import leafletCss from 'leaflet/dist/leaflet.css?inline';

// Leaflet usa window al cargarse: se importa solo cuando se abre el mapa.
let leafletPromise = null;
const cargarLeaflet = () => (leafletPromise ||= import('leaflet').then(mod => mod.default || mod));

const DEFAULT_CENTER = [-12.6, -75.5];

export function TransporteMapa({ className = '', puntos = [], puntoNuevo = null,
  lugaresReferencia = [], soloLectura = false, alMarcar, alMover, leyenda = '',
  classNameMapa = '' }) {
  const [L, setL] = useState(null);
  const node = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const latest = useRef({ alMarcar, alMover, soloLectura });
  latest.current = { alMarcar, alMover, soloLectura, puntos, puntoNuevo, lugaresReferencia };
  useEffect(() => {
    let vigente = true;
    cargarLeaflet().then(lib => { if (vigente) setL(() => lib); }).catch(() => {});
    return () => { vigente = false; };
  }, []);
  useEffect(() => {
    if (!L || !node.current) return undefined;
    const instance = L.map(node.current, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, 6);
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap',
    }).addTo(instance);
    instance.on('click', event => {
      if (!latest.current.soloLectura) latest.current.alMarcar?.(event.latlng);
    });
    const observer = new ResizeObserver(() => {
      instance.invalidateSize();
      frame();
    });
    observer.observe(node.current);
    requestAnimationFrame(() => instance.invalidateSize());
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, [L]);
  function frame() {
    const instance = map.current;
    const view = latest.current;
    const coords = [...view.puntos.map(point => point.coords), ...(view.puntoNuevo ? [view.puntoNuevo] : [])]
      .filter(Boolean);
    if (coords.length === 1) instance.setView(coords[0], 10, { animate: false });
    else if (coords.length > 1) instance.fitBounds(coords, { paddingTopLeft: [40, 40],
      paddingBottomRight: [40, view.soloLectura ? Math.min(90, node.current.clientHeight * .2) : 90],
      maxZoom: 10, animate: false });
    else instance.setView(DEFAULT_CENTER, 6, { animate: false });
  }
  useEffect(() => {
    const instance = map.current;
    if (!L || !instance) return;
    layers.current?.remove();
    const group = L.layerGroup().addTo(instance);
    layers.current = group;
    const icon = (label, tone) => L.divIcon({ className: `dx-transporte-composer-marker is-${tone}`,
      html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    puntos.filter(item => item.coords).forEach(item => L.marker(item.coords, {
      icon: icon(item.label, item.label.toLowerCase()), title: item.title || item.label,
      interactive: false,
    }).addTo(group));
    if (puntos.length >= 2 && puntos[0].coords && puntos[1].coords) {
      L.polyline([puntos[0].coords, puntos[1].coords], { color: '#00ACC1', weight: 3,
        dashArray: '6 8' }).addTo(group);
    }
    lugaresReferencia.filter(item => item.coords).forEach(item => L.circleMarker(item.coords, {
      radius: 5, color: '#6B7280', fillColor: '#6B7280', fillOpacity: .8, weight: 1,
    }).bindTooltip(item.title || '').addTo(group));
    if (puntoNuevo) {
      const marker = L.marker(puntoNuevo, { icon: icon('+', 'new'), draggable: !soloLectura,
        interactive: !soloLectura }).addTo(group);
      if (!soloLectura) marker.on('dragend', event => latest.current.alMover?.(event.target.getLatLng()));
    }
    frame();
  }, [L, puntos, puntoNuevo?.[0], puntoNuevo?.[1], lugaresReferencia, soloLectura]);
  return <div className={`dx-transporte-map ${className}`}>
    <style>{leafletCss}</style><div ref={node} className={classNameMapa} />
    {leyenda && <div className="dx-transporte-map-legend">{leyenda}</div>}
  </div>;
}

export default TransporteMapa;
