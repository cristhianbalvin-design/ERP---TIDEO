import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons.jsx';

export function ColumnFilter({ columns, visibleCols, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (key) => {
    if (visibleCols.includes(key)) {
      onChange(visibleCols.filter(c => c !== key));
    } else {
      onChange([...visibleCols, key]);
    }
  };

  const allVisible = visibleCols.length === columns.length;

  const toggleAll = () => {
    if (allVisible) {
      // Leave at least the first column if they uncheck all (optional, but good UX)
      onChange([columns[0].key]);
    } else {
      onChange(columns.map(c => c.key));
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button 
        type="button" 
        className="btn btn-secondary" 
        style={{ padding: '0 12px' }}
        onClick={() => setOpen(!open)} 
        title="Personalizar columnas"
      >
        {I.list} Columnas
      </button>
      
      {open && (
        <div 
          className="dropdown" 
          style={{
            position: 'absolute', 
            top: '100%', 
            right: 0, 
            marginTop: 4, 
            zIndex: 100, 
            minWidth: 220,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>Mostrar columnas</span>
            <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 6px' }} onClick={toggleAll}>
              {allVisible ? 'Ocultar todo' : 'Mostrar todo'}
            </button>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
            {columns.map(col => (
              <label 
                key={col.key} 
                className="dropdown-item row hover-row" 
                style={{ cursor: 'pointer', gap: 10, padding: '8px 16px', margin: 0, userSelect: 'none' }}
              >
                <input 
                  type="checkbox" 
                  checked={visibleCols.includes(col.key)} 
                  onChange={() => toggle(col.key)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
