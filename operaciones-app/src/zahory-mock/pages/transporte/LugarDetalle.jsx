import React from 'react';
import { TIPOS_LUGAR } from './LugarEditorModal.jsx';

function InfoItem({ label, children, className = '' }) {
  return <div className={className}><dt>{label}</dt><dd>{children || <span className="dx-transporte-no-data">Sin dato</span>}</dd></div>;
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
        <InfoItem label="Direcci?n" className="is-wide">{lugar.direccion}</InfoItem>
        <InfoItem label="Referencia" className="is-wide">{lugar.referencia}</InfoItem>
        <InfoItem label="Horario">{lugar.horario_atencion}</InfoItem>
        <InfoItem label="Contacto">{lugar.contacto_nombre}</InfoItem>
        <InfoItem label="Tel?fono">{lugar.contacto_telefono}</InfoItem>
        <InfoItem label="Requisitos">{lugar.requisitos_acceso}</InfoItem>
        <InfoItem label="Restricci?n">{lugar.restricciones}</InfoItem>
        <InfoItem label="Distrito / provincia / departamento">
          {[lugar.distrito, lugar.provincia, lugar.departamento].filter(Boolean).join(' / ')}
        </InfoItem>
        <InfoItem label="Ubigeo">{lugar.ubigeo}</InfoItem>
      </dl>

      <footer className="dx-transporte-lugares-usage">
        <strong>Se usa en</strong>
        <span>Rutas: {rutasCount}</span>
        <span>Viajes del mes: {viajesMes}</span>
      </footer>
    </article>
  );
}
