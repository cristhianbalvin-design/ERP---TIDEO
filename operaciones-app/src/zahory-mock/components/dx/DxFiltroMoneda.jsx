import React from 'react';

const OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'PEN', label: 'PEN (S/)' },
  { value: 'USD', label: 'USD (US$)' },
];

export function DxFiltroMoneda({ value, onChange }) {
  return (
    <div className="dx-ui-segment" role="group" aria-label="Filtrar por moneda">
      {OPTIONS.map(option => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          className={value === option.value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
