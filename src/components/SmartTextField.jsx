import React, { useMemo, useRef, useState } from 'react';
import { I } from '../icons.jsx';
import { VARIABLES_COMERCIALES } from '../lib/textoComercial.js';

const norm = value => String(value || '').toLowerCase();

function buildItems(diccionario = []) {
  const variables = VARIABLES_COMERCIALES.map(v => ({
    kind: 'variable',
    label: v.label,
    group: v.grupo,
    value: v.token,
  }));
  const phrases = (diccionario || [])
    .filter(d => d.estado === 'activo')
    .map(d => ({
      kind: 'phrase',
      label: d.clave || d.texto,
      group: d.categoria || 'Diccionario',
      value: d.texto || '',
    }));
  return [...variables, ...phrases].filter(item => item.value);
}

export function SmartTextField({
  value,
  onChange,
  diccionario = [],
  multiline = true,
  rows = 3,
  placeholder = '',
  className = 'input',
  style,
  inputStyle,
  autoFocus,
  required,
  type = 'text',
}) {
  const rootRef = useRef(null);
  const fieldRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState('');

  const items = useMemo(() => buildItems(diccionario), [diccionario]);
  const visibleItems = useMemo(() => {
    const q = norm(query);
    const filtered = q
      ? items.filter(item => norm(`${item.group} ${item.label} ${item.value}`).includes(q))
      : items;
    return filtered.slice(0, 10);
  }, [items, query]);

  const currentValue = value ?? '';

  const openMenu = (kind = 'all') => {
    setQuery('');
    setMenu({ kind, slashStart: null, slashEnd: null });
  };

  const closeMenu = () => {
    setMenu(null);
    setQuery('');
  };

  const emitChange = next => {
    if (typeof onChange === 'function') onChange(next);
  };

  const insertItem = item => {
    const node = fieldRef.current;
    const text = String(currentValue || '');
    let start = node?.selectionStart ?? text.length;
    let end = node?.selectionEnd ?? text.length;

    if (menu?.slashStart != null) {
      start = menu.slashStart;
      end = menu.slashEnd ?? end;
    }

    const before = text.slice(0, start);
    const after = text.slice(end);
    const needsLeftSpace = before && !/[\s([{¿¡]$/.test(before);
    const needsRightSpace = after && !/^[\s.,;:)\]}!?]/.test(after);
    const insertion = `${needsLeftSpace ? ' ' : ''}${item.value}${needsRightSpace ? ' ' : ''}`;
    const next = `${before}${insertion}${after}`;
    const cursor = before.length + insertion.length;

    emitChange(next);
    closeMenu();
    window.setTimeout(() => {
      fieldRef.current?.focus();
      fieldRef.current?.setSelectionRange?.(cursor, cursor);
    }, 0);
  };

  const updateSlashMenu = event => {
    const next = event.target.value;
    const cursor = event.target.selectionStart ?? next.length;
    const beforeCursor = next.slice(0, cursor);
    const slashMatch = beforeCursor.match(/\/([^\s/]*)$/);

    if (slashMatch) {
      const q = slashMatch[1] || '';
      setQuery(q);
      setMenu({ kind: 'all', slashStart: cursor - slashMatch[0].length, slashEnd: cursor });
    } else if (menu?.slashStart != null) {
      closeMenu();
    }
  };

  const handleChange = event => {
    emitChange(event.target.value);
    updateSlashMenu(event);
  };

  const handleKeyDown = event => {
    if (!menu) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
    if (event.key === 'Enter' && visibleItems[0] && menu.slashStart != null) {
      event.preventDefault();
      insertItem(visibleItems[0]);
    }
  };

  const FieldTag = multiline ? 'textarea' : 'input';
  const typedProps = multiline ? { rows } : { type };
  const menuItems = menu?.kind === 'variable'
    ? visibleItems.filter(item => item.kind === 'variable')
    : menu?.kind === 'phrase'
      ? visibleItems.filter(item => item.kind === 'phrase')
      : visibleItems;

  return (
    <div ref={rootRef} className={`smart-text ${multiline ? 'is-multiline' : 'is-singleline'} ${focused ? 'is-focused' : ''}`} style={style}>
      <FieldTag
        {...typedProps}
        ref={fieldRef}
        className={className}
        value={currentValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => {
          if (rootRef.current?.contains(document.activeElement)) return;
          setFocused(false);
          closeMenu();
        }, 120)}
        placeholder={placeholder}
        style={{ resize: multiline ? 'vertical' : undefined, ...inputStyle }}
        autoFocus={autoFocus}
        required={required}
      />

      <div className="smart-text-toolbar" onMouseDown={event => event.preventDefault()}>
        <button type="button" className="smart-text-action" title="Insertar variable" onClick={() => openMenu('variable')}>
          {I.plus} Variable
        </button>
        <button type="button" className="smart-text-action" title="Insertar frase base" onClick={() => openMenu('phrase')}>
          {I.sparkles} Frase base
        </button>
      </div>

      {menu && (
        <div className="smart-text-menu" onMouseDown={event => event.preventDefault()}>
          <div className="smart-text-search">
            {I.search}
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar"
              autoFocus={menu.slashStart == null}
            />
          </div>
          <div className="smart-text-list">
            {menuItems.map(item => (
              <button
                type="button"
                className="smart-text-item"
                key={`${item.kind}-${item.group}-${item.label}-${item.value}`}
                onClick={() => insertItem(item)}
              >
                <span className={`smart-text-kind ${item.kind}`}>{item.kind === 'variable' ? '{}' : 'Aa'}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.group}</small>
                </span>
              </button>
            ))}
            {!menuItems.length && <div className="smart-text-empty">Sin resultados</div>}
          </div>
        </div>
      )}
    </div>
  );
}
