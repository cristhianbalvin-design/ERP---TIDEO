import React from 'react';

export function DxBuscador({
  value,
  onChange,
  placeholder = 'Buscar…',
  label = 'Buscar registros',
}) {
  return (
    <label className="dx-ui-search">
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      <button
        type="button"
        aria-label="Limpiar búsqueda"
        onClick={() => onChange('')}
        disabled={!value}
      >
        ×
      </button>
    </label>
  );
}
