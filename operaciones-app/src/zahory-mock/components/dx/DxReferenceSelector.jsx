import React, { useMemo, useState } from 'react';
import { filtrarBusquedaInteligente } from './busquedaInteligente.js';

export function DxReferenceSelector({
  label,
  options = [],
  value,
  onChange,
  getLabel = item => item?.nombre || item?.id || '',
  loading = false,
  placeholder = 'Buscar…',
  optionalLabel = 'Sin asignar',
}) {
  const [query, setQuery] = useState('');
  const selected = options.find(item => item.id === value) || null;
  const matches = useMemo(
    () => filtrarBusquedaInteligente(options, query).slice(0, 8),
    [options, query],
  );

  function clearSelection() {
    onChange(null);
    setQuery('');
  }

  function selectItem(item) {
    onChange(item.id);
    setQuery('');
  }

  return (
    <div className="dx-ui-reference">
      <label>{label}</label>
      {selected ? (
        <div className="dx-ui-reference-selected">
          <span>{getLabel(selected)}</span>
          <button type="button" onClick={clearSelection} aria-label={`Limpiar ${label}`}>
            Limpiar
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={label}
          />
          {loading ? (
            <small>Cargando…</small>
          ) : (
            <div className="dx-ui-reference-options">
              {optionalLabel && (
                <button type="button" onClick={() => onChange(null)}>
                  {optionalLabel}
                </button>
              )}
              {matches.map(item => (
                <button type="button" key={item.id} onClick={() => selectItem(item)}>
                  {getLabel(item)}
                </button>
              ))}
              {query && !matches.length && <small>Sin resultados</small>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
