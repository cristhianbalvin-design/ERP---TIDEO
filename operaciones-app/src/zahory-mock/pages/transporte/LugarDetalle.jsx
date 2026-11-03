import React from 'react';
import { TIPOS_LUGAR } from './LugarEditorModal.jsx';

function InfoItem({ label, children }) {
  return <div><dt>{label}</dt><dd>{children || 'Sin dato'}</dd></div>;
}

export function LugarDetalle({ lugar, cuentaNombre, viajesMes, rutasCount, onEdit, canEdit }) {
  if (!lugar) {
    return <article className="dx-ui-card dx-transporte-lugares-detail">
      <div className="dx-ui-empty">Selecciona un lugar para ver el detalle.</div>
    </article>;
  }
  const tipo = TIPOS_LUGAR[lugar.tipo] || 'Otro';
  const coordinates = lugar.latitud != null && lugar.longitud != null;
  const mapsUrl = coordinates
    ? `https://www.google.com/maps?q=${lugar.latitud},${lugar.longitud}` : '';
  const location = [lugar.distrito, lugar.provincia].filter(Boolean).join(' / ');

  return (
    <article className="dx-ui-card dx-transporte-lugares-detail">
      <header className="dx-transporte-lugares-detail-head">
        <div>
          <div className="dx-ui-eyebrow">{tipo} · {cuentaNombre || 'General'}</div>
          <h2>{lugar.nombre}</h2>
          <p>{lugar.direccion || 'Sin dirección registrada'}{location ? ` · ${location}` : ''}</p>
        </div>
        {canEdit && <button type="button" className="dx-btn" onClick={onEdit}>Editar</button>}
      </header>

      <section className="dx-transporte-lugares-map" aria-label="Ubicación en el mapa">
        <strong>Ubicación</strong>
        {coordinates ? <>
          <span>{lugar.latitud}, {lugar.longitud}</span>
          <a href={mapsUrl} target="_blank" rel="noreferrer">Ver en mapa ↗</a>
        </> : <span>Sin coordenadas</span>}
      </section>

      <dl className="dx-transporte-lugares-info">
        <InfoItem label="Dirección">{lugar.direccion}</InfoItem>
        <InfoItem label="Referencia">{lugar.referencia}</InfoItem>
        <InfoItem label="Distrito / provincia">{location}</InfoItem>
        <InfoItem label="Departamento">{lugar.departamento}</InfoItem>
        <InfoItem label="Ubigeo">{lugar.ubigeo}</InfoItem>
        <InfoItem label="Horario">{lugar.horario_atencion}</InfoItem>
        <InfoItem label="Contacto">{lugar.contacto_nombre}</InfoItem>
        <InfoItem label="Teléfono">{lugar.contacto_telefono}</InfoItem>
        <InfoItem label="Requisitos de acceso">{lugar.requisitos_acceso}</InfoItem>
        <InfoItem label="Restricciones">{lugar.restricciones}</InfoItem>
      </dl>

      <footer className="dx-transporte-lugares-usage">
        <strong>Se usa en</strong>
        <span>Rutas: {rutasCount}</span>
        <span>Viajes del mes: {viajesMes}</span>
      </footer>
    </article>
  );
}
