import React, { useEffect } from 'react';
import { useApp } from '../context.jsx';
import { resolverSociedadUnicaId } from '../services/sociedadesService.js';

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

export function SociedadReadOnlyField({ sociedadId, label = 'Sociedad', style }) {
  const { empresa, sociedadesDisponibles = [] } = useApp();
  if (!empresa?.multisociedad_habilitado) return null;

  const sociedad = sociedadesDisponibles.find(item => item.id === sociedadId);
  const texto = sociedad
    ? `${sociedad.codigo ? `${sociedad.codigo} - ` : ''}${sociedad.nombre}`
    : 'Se hereda del CECO/CEBE seleccionado';

  return (
    <div className="input-group" style={style} data-multisociedad-readonly="true">
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
