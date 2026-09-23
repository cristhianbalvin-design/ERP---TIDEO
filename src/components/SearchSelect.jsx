import React, { useEffect, useRef, useState } from 'react';

export function SearchSelect({ value, onChange, options = [], placeholder = 'Seleccionar...', staticOption = null, className = '', style = {} }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);
  const selected = value && value !== ''
    ? (staticOption?.id === value ? staticOption : options.find(o => o.id === value))
    : null;
  const normalizarBusqueda = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = normalizarBusqueda(query.trim());
  const filtered = q ? options.filter(o => normalizarBusqueda(o.searchText || o.label).includes(q)) : options;

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const pick = id => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <div
        className={`select ${className}`}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ color: selected ? 'inherit' : 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 10, marginLeft: 6, flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.2)', marginTop: 2 }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <input ref={inputRef} className="input" style={{ fontSize: 13, padding: '4px 8px' }} placeholder="Escribir para filtrar..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }} onClick={e => e.stopPropagation()} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && !staticOption && <div style={{ padding: '8px 12px', color: 'var(--fg-muted)', fontSize: 13 }}>Sin resultados</div>}
            {filtered.map(o => (
              <div key={o.id} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: o.id === value ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent' }}
                onMouseDown={e => { e.preventDefault(); pick(o.id); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = o.id === value ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent'; }}
              >{o.label}</div>
            ))}
            {staticOption && (
              <div style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none', color: 'var(--fg-muted)', background: staticOption.id === value ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent' }}
                onMouseDown={e => { e.preventDefault(); pick(staticOption.id); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = staticOption.id === value ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent'; }}
              >{staticOption.label}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
