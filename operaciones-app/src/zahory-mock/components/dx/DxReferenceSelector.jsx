import React, { useMemo, useRef, useState } from 'react';
import { filtrarBusquedaInteligente } from './busquedaInteligente.js';

export function DxReferenceSelector({
  label,
  options = [],
  value,
  onChange,
  getLabel = item => item?.nombre || item?.id || '',
  loading = false,
  placeholder = 'Buscar\u2026',
  optionalLabel = 'Sin asignar',
  name,
  id = name,
  error,
  required = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find(item => item.id === value) || null;
  const matches = useMemo(
    () => filtrarBusquedaInteligente(options, query).slice(0, 8),
    [options, query],
  );

  function clearSelection() {
    onChange(null);
    setQuery('');
    setOpen(false);
  }

  function selectItem(item) {
    onChange(item.id);
    setQuery('');
    setOpen(false);
  }

  function handleBlur(event) {
    if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div className="dx-ui-reference" ref={rootRef} onBlur={handleBlur}>
      <label htmlFor={id}>{label}{required && <span className="dx-ui-required"> *</span>}</label>
      {selected ? (
        <div
          id={id}
          className="dx-ui-reference-selected"
          aria-invalid={Boolean(error)}
          aria-required={required || undefined}
          aria-describedby={error ? `${name}-error` : undefined}
        >
          <span>{getLabel(selected)}</span>
          <button type="button" onClick={clearSelection} aria-label={`Limpiar ${label}`}>
            Limpiar
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            name={name}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={event => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={Boolean(error)}
            aria-required={required || undefined}
            aria-describedby={error ? `${name}-error` : undefined}
          />
          {open && (
            <div className="dx-ui-reference-options" role="listbox">
              {loading ? (
                <small>{'Cargando…'}</small>
              ) : (
                <>
                  {optionalLabel && (
                    <button type="button" role="option" onClick={clearSelection}>
                      {optionalLabel}
                    </button>
                  )}
                  {matches.map(item => (
                    <button type="button" role="option" key={item.id} onClick={() => selectItem(item)}>
                      {getLabel(item)}
                    </button>
                  ))}
                  {query && !matches.length && <small>Sin resultados</small>}
                </>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <small className="dx-ui-field-error" id={`${name}-error`} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
