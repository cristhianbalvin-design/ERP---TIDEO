import React, { useEffect, useMemo, useRef, useState } from 'react';

const MAX_RESULTS = 20;
const normalize = value => String(value || '').trim().toLocaleLowerCase();

export function DiagnosticoAgregarTareasPanel({ familia, tipos, plantillas, uso, plantillaError, usoError, actividadId, lineas, initialFocus = false, onClose, onAdd, onApplyTemplate }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('todas');
  const [selected, setSelected] = useState([]);
  const searchRef = useRef(null);
  const templatesRef = useRef(null);
  const selectedIds = useMemo(() => new Set(lineas.map(line => line.tarea_id)), [lineas]);
  const activityTemplate = plantillas.filter(row => row.actividad_id === actividadId);
  const activityIds = new Set(plantillas.map(row => row.actividad_id));
  const templates = useMemo(() => {
    const grouped = new Map();
    plantillas.forEach(row => {
      const group = grouped.get(row.actividad_id) || { actividad_id: row.actividad_id, tareas: [] };
      group.tareas.push(row);
      grouped.set(row.actividad_id, group);
    });
    return [...grouped.values()]
      .filter(group => group.tareas.length && tipos.some(tipo => tipo.id === group.actividad_id))
      .map(group => ({ ...group, nombre: tipos.find(tipo => tipo.id === group.actividad_id)?.nombre || 'Actividad' }));
  }, [plantillas, tipos]);
  const allTasks = tipos.filter(tipo => !activityIds.has(tipo.id));
  const filtered = allTasks.filter(tipo => {
    const textMatches = !normalize(query) || normalize(`${tipo.nombre} ${tipo.codigo}`).includes(normalize(query));
    if (!textMatches) return false;
    if (filter === 'usadas') return Number(uso[tipo.id] || 0) > 0;
    if (filter === 'actividad') return activityTemplate.some(row => row.tarea_id === tipo.id);
    if (filter === 'ya') return selectedIds.has(tipo.id);
    return true;
  }).sort((a, b) => filter === 'usadas'
    ? (Number(uso[b.id] || 0) - Number(uso[a.id] || 0)) || a.nombre.localeCompare(b.nombre, 'es')
    : a.nombre.localeCompare(b.nombre, 'es'));
  const visible = filtered.slice(0, MAX_RESULTS);
  const selectedTasks = selected.filter(id => !selectedIds.has(id));

  useEffect(() => {
    if (initialFocus) {
      templatesRef.current?.focus?.();
      templatesRef.current?.scrollIntoView?.({ block: 'start' });
    } else searchRef.current?.focus?.();
  }, [initialFocus]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const applyTemplate = template => {
    const rows = template.tareas.filter(row => !selectedIds.has(row.tarea_id));
    if (rows.length) onApplyTemplate(rows, template.actividad_id);
  };

  return <div className="dx-panel-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dx-panel" role="dialog" aria-modal="true" aria-labelledby="dx-panel-title" aria-describedby="dx-panel-subtitle">
      <header className="dx-panel-header">
        <div><h2 id="dx-panel-title">Agregar tareas</h2><p id="dx-panel-subtitle">Se añaden al trabajo {familia.nombre}</p></div>
        <button type="button" aria-label="Cerrar" className="dx-panel-close" onClick={onClose}>×</button>
      </header>
      {(plantillaError || usoError) && <div className="dx-panel-warnings" role="status">{plantillaError && <span>No se pudieron cargar plantillas</span>}{usoError && <span>No se pudieron cargar uso</span>}</div>}
      <main className="dx-panel-content">
        <section className="dx-panel-template-section" ref={templatesRef} tabIndex="-1">
          <h3>APLICAR UNA ACTIVIDAD COMPLETA</h3>
          {!templates.length ? <p className="dx-panel-muted">No hay actividades con tareas.</p> : templates.map(template => <article className="dx-panel-template" key={template.actividad_id}>
            <div><strong>{template.nombre}</strong><span>{template.tareas.length} tareas</span><small>sin horas, las ingresas tú</small></div>
            <button type="button" onClick={() => applyTemplate(template)}>Aplicar</button>
          </article>)}
        </section>
        <section className="dx-panel-catalog">
          <h3>TAREAS DEL CATÁLOGO</h3>
          <label className="dx-panel-search-label" htmlFor="dx-panel-search">Buscar tareas</label>
          <input id="dx-panel-search" ref={searchRef} className="dx-panel-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre o código" />
          <div className="dx-panel-pills" role="group" aria-label="Filtrar tareas">
            <button type="button" className={filter === 'todas' ? 'is-active' : ''} onClick={() => setFilter('todas')}>Todas</button>
            <button type="button" className={filter === 'usadas' ? 'is-active' : ''} onClick={() => setFilter('usadas')}>Más usadas</button>
            <button type="button" className={filter === 'actividad' ? 'is-active' : ''} disabled={!actividadId} onClick={() => setFilter('actividad')}>De la actividad</button>
            <button type="button" className={filter === 'ya' ? 'is-active' : ''} onClick={() => setFilter('ya')}>Ya en el diagnóstico</button>
          </div>
          <div className="dx-panel-results" aria-live="polite">
            {!visible.length ? <div className="dx-panel-empty">Sin coincidencias</div> : visible.map(tipo => {
              const already = selectedIds.has(tipo.id);
              const checked = already || selected.includes(tipo.id);
              return <label className={`dx-panel-row${checked && !already ? ' is-selected' : ''}${already ? ' is-existing' : ''}`} key={tipo.id}>
                <input type="checkbox" checked={checked} disabled={already} onChange={() => toggle(tipo.id)} aria-label={already ? `${tipo.nombre}, Ya agregada` : tipo.nombre} />
                <span className="dx-panel-task-name">{tipo.nombre}<small>{tipo.codigo || '—'}</small></span>
                <span className="dx-panel-usage">{already ? 'Ya agregada' : Number(uso[tipo.id] || 0) ? `Usada ${uso[tipo.id]} veces` : 'Sin uso previo'}</span>
              </label>;
            })}
          </div>
          {filtered.length > MAX_RESULTS && <p className="dx-panel-limit">Mostrando las primeras 20 de {filtered.length}, sigue escribiendo</p>}
        </section>
      </main>
      <footer className="dx-panel-footer"><span>{selectedTasks.length} seleccionadas</span><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="dx-panel-add" disabled={!selectedTasks.length} onClick={() => onAdd(selectedTasks)}>Agregar {selectedTasks.length} tareas</button></footer>
    </section>
  </div>;
}
