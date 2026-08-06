import React, { useEffect } from 'react';
import { useApp } from '../context.jsx';
import { resolverSociedadUnicaId, SOCIEDAD_TODAS_ID } from '../services/sociedadesService.js';

export function SociedadFormField({ value = '', onChange, label = 'Sociedad', style }) {
  const { empresa, sociedadesDisponibles = [] } = useApp();
  const sociedadUnicaId = empresa?.multisociedad_habilitado
    ? resolverSociedadUnicaId(sociedadesDisponibles)
    : null;

  useEffect(() => {
    if (sociedadUnicaId && value !== sociedadUnicaId) {
      onChange?.(sociedadUnicaId);
    }
  }, [onChange, sociedadUnicaId, value]);

  if (!empresa?.multisociedad_habilitado) return null;
  if (sociedadUnicaId) return null;

  return (
    <div className="input-group" style={style} data-multisociedad-field="true">
      <label>{label} *</label>
      <select
        className="select"
        value={value || ''}
        onChange={event => onChange?.(event.target.value)}
        required
      >
        <option value="">Seleccionar sociedad...</option>
        {sociedadesDisponibles.map(sociedad => (
          <option key={sociedad.id} value={sociedad.id}>
            {sociedad.codigo ? `${sociedad.codigo} - ` : ''}{sociedad.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SociedadReadOnlyField({ sociedadId, label = 'Sociedad destino', style, emptyMessage, conflictMessage }) {
  const { empresa, sociedadesDisponibles = [], sociedadActiva } = useApp();
  if (!empresa?.multisociedad_habilitado) return null;
  const sociedadActivaId = typeof sociedadActiva === 'string' ? sociedadActiva : sociedadActiva?.id;
  if (sociedadActivaId !== SOCIEDAD_TODAS_ID) return null;

  const sociedad = sociedadesDisponibles.find(item => item.id === sociedadId);
  if (conflictMessage) {
    return <div className="alert alert-danger" style={style} data-multisociedad-readonly="conflict">{conflictMessage}</div>;
  }
  if (!sociedad) {
    return (
      <div className="alert alert-warning" style={style} data-multisociedad-readonly="empty">
        {emptyMessage || 'No se pudo resolver la sociedad destino. El registro quedará sin sociedad si continúas.'}
      </div>
    );
  }

  const texto = `${sociedad.codigo ? `${sociedad.codigo} - ` : ''}${sociedad.nombre}`;

  return (
    <div className="input-group" style={style} data-multisociedad-readonly="resolved">
      <label>{label}</label>
      <input className="input" value={texto} readOnly aria-readonly="true" />
    </div>
  );
}

export function SociedadBadge({ sociedadId, style }) {
  const { perfilSociedad, sociedadesDisponibles = [] } = useApp();
  if (perfilSociedad === 'sin_multisociedad') return null;
  const sociedad = sociedadesDisponibles.find(item => item.id === sociedadId);
  const texto = sociedad
    ? `${sociedad.codigo ? `${sociedad.codigo} - ` : ''}${sociedad.nombre}`
    : 'Sin sociedad';
  return <span className="badge badge-purple" style={style} data-sociedad-badge="true">{texto}</span>;
}
