import React, { useEffect, useMemo, useRef, useState } from 'react';

export function BuscadorCatalogo({ label, options = [], value, onSelect, search, sections, placeholder = 'Buscar…', disabled = false, allowCreate = false, createAction, className = '', requiredKey, clearable = false }) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [opensUp, setOpensUp] = useState(false);
  const selected = options.find(option => option.codigo === value);
  const results = useMemo(() => search ? search(options, query) : { items: options, exacta: false }, [options, query, search]);
  const groups = useMemo(() => sections ? sections(results.items, query) : [{ id: 'all', label: query.trim() ? 'Resultados' : 'Todos', items: results.items }], [results.items, query, sections]);
  const flat = groups.flatMap(group => group.items);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); inputRef.current?.focus({ preventScroll: true }); } };
    globalThis.document?.addEventListener?.('pointerdown', outside);
    globalThis.document?.addEventListener?.('keydown', escape);
    return () => { globalThis.document?.removeEventListener?.('pointerdown', outside); globalThis.document?.removeEventListener?.('keydown', escape); };
  }, [open]);
  const openMenu = event => {
    if (disabled) return;
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
    const rect = event?.currentTarget?.getBoundingClientRect?.() || { top: 0, bottom: 0 };
    const height = globalThis.window?.visualViewport?.height || globalThis.window?.innerHeight || 800;
    setOpensUp(height - rect.bottom < Math.min(320, height * .45) && rect.top > height - rect.bottom);
  };
  const select = option => { onSelect(option?.codigo || null, option || null); setQuery(''); setOpen(false); };
  const keyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); setOpen(false); inputRef.current?.focus?.({ preventScroll: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex(index => Math.max(0, Math.min(flat.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && open && flat.length) {
      event.preventDefault(); select(flat[activeIndex] || flat[0]);
    }
  };
  const renderGroups = () => groups.map(group => <div key={group.id}><small>{group.label}</small>{group.items.map(option => {
    const index = flat.indexOf(option);
    return <button id={`opcion-${requiredKey || 'catalogo'}-${option.codigo}`} type="button" role="option" aria-selected={index === activeIndex} key={`${group.id}-${option.codigo}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(option)}>{option.etiqueta}{option.inactivo ? ' (inactivo)' : ''}</button>;
  })}</div>);
  return <div ref={rootRef} className={`field dx-tipo-dano dx-buscador-catalogo ${className}`.trim()}>
    <label>{label}</label>
    <div className="dx-buscador-input-wrap">
      <input ref={inputRef} data-required-field={requiredKey} className="input" role="combobox" aria-label={label} aria-autocomplete="list" aria-controls={`catalogo-${requiredKey || label.replace(/\W/g, '-')}`} aria-expanded={open} aria-haspopup="listbox" aria-activedescendant={open && flat[activeIndex] ? `opcion-${requiredKey || 'catalogo'}-${flat[activeIndex].codigo}` : undefined} value={open ? query : selected?.etiqueta || value || ''} disabled={disabled} placeholder={placeholder} onFocus={openMenu} onClick={event => { if (!open) openMenu(event); }} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={keyDown} />
      {clearable && value && !disabled && <button className="dx-buscador-clear" type="button" aria-label={`Limpiar ${label}`} onMouseDown={event => event.preventDefault()} onClick={() => { select(null); inputRef.current?.focus({ preventScroll: true }); }}>×</button>}
    </div>
    {open && <div id={`catalogo-${requiredKey || label.replace(/\W/g, '-')}`} role="listbox" aria-label={label} className={`dx-tipo-dano-menu${opensUp ? ' is-up' : ''}`} onKeyDown={keyDown}>
      <header><strong>{label}</strong><button type="button" aria-label={`Cerrar ${label}`} onClick={() => setOpen(false)}>×</button></header>
      <input className="dx-tipo-dano-sheet-search" type="search" aria-label={`Buscar ${label}`} placeholder={placeholder} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={keyDown} />
      {renderGroups()}
      {!flat.length && <p className="dx-tipo-dano-similar">Sin coincidencias.</p>}
      {allowCreate && createAction?.(query, results, () => setOpen(false))}
    </div>}
  </div>;
}
