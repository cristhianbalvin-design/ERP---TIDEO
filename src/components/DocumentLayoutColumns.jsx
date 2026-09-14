import React from 'react';

const newColumnId = () => globalThis.crypto?.randomUUID?.() || `layout-column-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// El contenido de una tabla también usa una propiedad "columnas". El wrapper
// de layout se distingue porque cada sección contiene contenido_json propio.
export const hasLayoutColumns = value => Array.isArray(value?.columnas)
  && value.columnas.some(column => column && typeof column === 'object' && Object.hasOwn(column, 'contenido_json'));

export const normalizeLayoutColumns = (value, normalizeContent) => {
  const source = hasLayoutColumns(value)
    ? value.columnas.slice(0, 3)
    : [{ id:'legacy-column-1', contenido_json:value }];
  const count = Math.max(1, source.length);
  return source.map((column, index) => ({
    id:column?.id || `column-${index + 1}`,
    ancho:`${100 / count}%`,
    contenido_json:normalizeContent(column?.contenido_json),
  }));
};

export function LayoutColumnsEditor({ value, normalizeContent, disabled, onColumnsChange, renderColumn, renderHeader = null, columnLabel = 'Columna', className = 'document-section-columns', columnClassName = 'document-section-column' }) {
  const columns = normalizeLayoutColumns(value, normalizeContent);
  const updateColumns = next => onColumnsChange?.(normalizeLayoutColumns({ columnas:next }, normalizeContent));
  const addColumn = () => {
    if (columns.length >= 3) return;
    updateColumns([...columns, { id:newColumnId(), contenido_json:normalizeContent(null) }]);
  };
  const removeColumn = id => {
    if (columns.length <= 1) return;
    updateColumns(columns.filter(column => column.id !== id));
  };
  return <>
    {renderHeader ? renderHeader({ addColumn, canAddColumn:columns.length < 3 }) : !disabled && <button type="button" className="btn btn-ghost" onClick={addColumn} disabled={columns.length >= 3} style={{padding:'3px 8px'}}>+ Agregar columna</button>}
    <div className={className} style={{gridTemplateColumns:columns.map(column => column.ancho).join(' ')}}>{columns.map((column, index) => <div key={column.id} className={columnClassName}>
      <div className="row" style={{justifyContent:'space-between', gap:6, marginBottom:6}}>
        <div className="text-muted" style={{fontSize:12}}>{columnLabel} {index + 1}</div>
        {!disabled && <button type="button" className="btn btn-ghost" aria-label={`Eliminar ${columnLabel.toLowerCase()} ${index + 1}`} onClick={() => removeColumn(column.id)} disabled={columns.length <= 1} style={{padding:'1px 6px', minWidth:0}}>×</button>}
      </div>
      {renderColumn?.(column, nextContent => updateColumns(columns.map(item => item.id === column.id ? { ...item, contenido_json:nextContent } : item)))}
    </div>)}</div>
  </>;
}
