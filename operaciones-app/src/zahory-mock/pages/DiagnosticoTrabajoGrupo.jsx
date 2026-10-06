import React, { useMemo, useState } from 'react';

const lineId = line => line._key || line.id;
const labelOf = item => item?.nombre || 'No disponible';
const hours = value => Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function DiagnosticoTrabajoGrupo({ familia, lines, catalogs, canEdit, onChange, onDelete, onError, validationErrors, Selector, initialOpen = false, onOpenTaskPanel }) {
  const [open, setOpen] = useState(initialOpen);
  const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState('');
  const selected = (options, id) => options.find(option => option.id === id) || (id ? { id, nombre: 'No disponible' } : null);
  const patch = (line, changes) => onChange(line, { ...line, ...changes });
  const activityCounts = lines.reduce((counts, line) => {
    if (line.actividad_id) counts.set(line.actividad_id, (counts.get(line.actividad_id) || 0) + 1);
    return counts;
  }, new Map());
  const activityIds = [...activityCounts.keys()];
  const mostCommonActivityId = [...activityCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const activities = activityIds.map(id => selected(catalogs.tipos, id)?.nombre).filter(Boolean);
  const hh = lines.reduce((sum, line) => sum + Number(line.horas_mano_obra || 0), 0);
  const hm = lines.reduce((sum, line) => sum + Number(line.horas_maquina || 0), 0);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? catalogs.tipos.filter(item => `${item.nombre || ''} ${item.codigo || ''}`.toLocaleLowerCase().includes(needle)) : [];
  }, [catalogs.tipos, query]);
  const addFromSearch = item => {
    if (!item || !canEdit) return;
    onChange(null, { id: null, _key: `line-${Date.now()}-${Math.random()}`, familia_trabajo_id: familia.id, actividad_id: null, tarea_id: item.id, hallazgo: '', cargo_id: null, horas_mano_obra: 0, activo_id: null, horas_maquina: 0, orden: lines.length, materiales: [], _materialesIniciales: [], _dirty: true });
    setQuery('');
  };
  const openPanel = mode => onOpenTaskPanel?.({ familia, lines, actividadId: mostCommonActivityId, mode });

  return <section className="dx-group">
    <div className="dx-group-toolbar"><button type="button" className="dx-group-head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className={`dx-chevron${open ? ' is-open' : ''}`} aria-hidden="true">›</span>
      <span className="dx-group-heading"><span className="dx-group-name">{familia.nombre}</span><span className="dx-tags">{activities.length ? activities.map(name => <span className="dx-tag" key={name}>Actividad: {name}</span>) : <span className="dx-tag is-muted">Sin actividad</span>}</span><span className="dx-group-summary">{lines.length} tareas · {hours(hh)} h-hombre · {hours(hm)} h-máquina</span></span>
    </button>{canEdit && <div className="dx-group-panel-actions"><button type="button" onClick={() => openPanel('todas')}>Agregar tareas</button><button type="button" onClick={() => openPanel('actividad')}>Aplicar actividad</button></div>}</div>
    {open && <>
      <div className="dx-columns dx-band"><span /><span>MANO DE OBRA</span><span>MAQUINA</span><span /></div>
      <div className="dx-columns dx-labels"><span>Tarea</span><span>Cargo</span><span>Horas-hombre</span><span>Activo propio</span><span>Horas-máquina</span><span>Detalle</span></div>
      {lines.map(line => {
        const tarea = selected(catalogs.tipos, line.tarea_id);
        const key = lineId(line);
        const detailOpen = Boolean(expanded[key]);
        const materials = line.materiales || [];
        return <React.Fragment key={key}>
          <div className={`dx-columns dx-row${line._dirty ? ' is-dirty' : ''}`}>
            <div className="dx-task"><b>{labelOf(tarea)}</b><small>{tarea?.codigo || ''}</small></div>
            <Selector label={`Cargo de ${labelOf(tarea)}`} kind="cargo" value={selected(catalogs.cargos, line.cargo_id)} options={catalogs.cargos} disabled={!canEdit} placeholder="Seleccionar cargo" clearable onSelect={item => patch(line, { cargo_id: item?.id || null })} onError={onError} />
            <label className="dx-number"><input aria-label={`Horas-hombre de ${labelOf(tarea)}`} type="number" min="0" step="0.01" value={line.horas_mano_obra ?? 0} disabled={!canEdit} onChange={event => patch(line, { horas_mano_obra: event.target.value })} /><span>h</span></label>
            <Selector label={`Activo propio de ${labelOf(tarea)}`} kind="activo" value={selected(catalogs.activos, line.activo_id)} options={catalogs.activos} disabled={!canEdit} placeholder="Sin máquina" clearable onSelect={item => patch(line, { activo_id: item?.id || null, horas_maquina: item?.id ? line.horas_maquina : 0 })} onError={onError} />
            <label className={`dx-number${!line.activo_id ? ' is-disabled' : ''}`}><input aria-label={`Horas-máquina de ${labelOf(tarea)}`} type="number" min="0" step="0.01" value={line.horas_maquina ?? 0} disabled={!canEdit || !line.activo_id} onChange={event => patch(line, { horas_maquina: event.target.value })} /><span>h</span></label>
            <div className="dx-detail-actions"><button type="button" className="dx-detail-button" aria-label={`Notas y repuestos de ${labelOf(tarea)}`} onClick={() => setExpanded(value => ({ ...value, [key]: !value[key] }))}>{materials.length ? `Repuestos ${materials.length}` : 'Notas'}</button>{canEdit && onDelete && <button type="button" className="dx-delete" aria-label={`Eliminar ${labelOf(tarea)}`} onClick={() => onDelete(line)}>×</button>}</div>
            {line._saveError && <div className="dx-row-error" role="alert">{line._saveError}</div>}
          </div>
          {detailOpen && <div className="dx-detail">
            <div className="dx-field"><label htmlFor={`hallazgo-${key}`}>Hallazgo · {labelOf(tarea)}</label><textarea id={`hallazgo-${key}`} rows="3" value={line.hallazgo || ''} disabled={!canEdit} onChange={event => patch(line, { hallazgo: event.target.value })} /></div>
            <div className="dx-materials"><div className="dx-material-title">Repuestos de esta tarea</div>{materials.map((material, index) => <div className="dx-material" key={material.id || material._key}><input aria-label={`Descripción del repuesto ${index + 1} de ${labelOf(tarea)}`} value={material.descripcion || ''} disabled={!canEdit} onChange={event => patch(line, { materiales: materials.map((item, idx) => idx === index ? { ...item, descripcion: event.target.value } : item) })} /><input aria-label={`Cantidad del repuesto ${index + 1} de ${labelOf(tarea)}`} type="number" min="0.0001" step="0.0001" value={material.cantidad ?? 1} disabled={!canEdit} onChange={event => patch(line, { materiales: materials.map((item, idx) => idx === index ? { ...item, cantidad: event.target.value } : item) })} /><span>{material.unidad || 'und'}</span>{canEdit && <button type="button" onClick={() => patch(line, { materiales: materials.filter((_, idx) => idx !== index) })}>Quitar</button>}</div>)}{canEdit && <button type="button" className="dx-secondary" onClick={() => patch(line, { materiales: [...materials, { _key: `material-${Date.now()}-${Math.random()}`, descripcion: '', cantidad: 1, unidad: 'und', orden: materials.length }] })}>+ Agregar repuesto</button>}{validationErrors?.[key]?.map((message, index) => message && <div className="dx-row-error" role="alert" key={index}>Repuesto {index + 1}: {message}</div>)}</div>
          </div>}
        </React.Fragment>;
      })}
      {canEdit && <div className="dx-quick-add"><input aria-label="Buscar y añadir una tarea" placeholder="Escribe para buscar y añadir una tarea (nombre o código)…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches[0]) { event.preventDefault(); addFromSearch(matches[0]); } }} /><span>Enter añade la primera coincidencia</span>{query && matches.length > 0 && <div className="dx-search-results" role="listbox">{matches.slice(0, 8).map(item => <button type="button" key={item.id} onClick={() => addFromSearch(item)}>{item.nombre} <small>{item.codigo}</small></button>)}</div>}</div>}
    </>}
  </section>;
}
