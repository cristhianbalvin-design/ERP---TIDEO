import React from 'react';

export function DxFechaExacta({ value, onChange, label = 'Vigentes en la fecha' }) {
  return (
    <label className="dx-ui-date">
      <span>{label}</span>
      <input
        type="date"
        value={value || ''}
        onChange={event => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label="Limpiar fecha"
        disabled={!value}
        onClick={() => onChange('')}
      >
        Limpiar
      </button>
    </label>
  );
}
