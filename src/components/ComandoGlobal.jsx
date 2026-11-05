import React, { useMemo, useState, useEffect } from 'react';
import { Command } from 'cmdk';

export default function ComandoGlobal({ open, onOpenChange, items, favoritos, recientes, score, onSelect, onAria }) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  const results = useMemo(() => query.trim()
    ? items.map(item => ({ item, score: score(query, item) }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'es'))
      .map(result => result.item)
    : [], [query, items, score]);
  const byKeys = keys => keys.map(key => items.find(item => item.key === key)).filter(Boolean);
  const group = (title, list) => list.length > 0 && (
    <Command.Group heading={title}>
      {list.map(item => (
        <Command.Item key={item.key} value={title + item.key} onSelect={() => onSelect(item)}>
          {item.icon}<span>{item.label}</span><small>{item.seccion}</small>
        </Command.Item>
      ))}
    </Command.Group>
  );
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Buscar pantallas"
      shouldFilter={false}
      className="dx-nav-command"
      overlayClassName="dx-nav-command-overlay"
      contentClassName="dx-nav-command-content"
    >
      <Command.Input value={query} onValueChange={setQuery} placeholder="Buscar pantalla..." aria-label="Buscar pantallas" />
      <Command.List>
        {query.trim() ? (
          <>
            {group('Resultados', results)}
            {!results.length && <div className="dx-nav-empty">No encontramos pantallas.</div>}
            <Command.Group>
              <Command.Item value="preguntar-aria" onSelect={onAria}>Preguntar a Aria: {query}</Command.Item>
            </Command.Group>
          </>
        ) : (
          <>
            {group('Favoritos', byKeys(favoritos))}
            {group('Recientes', byKeys(recientes))}
            {!byKeys(favoritos).length && !byKeys(recientes).length && (
              <div className="dx-nav-empty">Busca una pantalla o añade favoritos.</div>
            )}
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
