import React, { useState } from 'react';

const lineId = line => line._key || line.id;
const labelOf = item => item?.nombre || 'No disponible';
const hours = value => Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function DiagnosticoTrabajoGrupo({ familia, lines, catalogs, canEdit, onChange, onDelete, onError, validationErrors, Selector, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const [expanded, setExpanded] = useState({});
  const selected = (options, id) => options.find(option => option.id === id) || (id ? { id, nombre: 'No disponible' } : null);
  const patch = (line, changes) => onChange(line, { ...line, ...changes });
  const activities = new Map();
  lines.forEach(line => {
    const activity = selected(catalogs.tipos, line.actividad_id);
    const key = line.actividad_id || '__sin_actividad__';
    if (!activities.has(key)) activities.set(key, { activity, lines: [] });
    activities.get(key).lines.push(line);
  });
  const hh = lines.reduce((sum, line) => sum + Number(line.horas_mano_obra || 0), 0);
  const hm = lines.reduce((sum, line) => sum + Number(line.horas_maquina || 0), 0);

  return <section className="dx-group dx-cascada-lines-group">
    <button type="button" className="dx-group-head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className={`dx-chevron${open ? ' is-open' : ''}`} aria-hidden="true">›</span>
      <span className="dx-group-heading"><span className="dx-group-name">{familia.nombre}</span><span className="dx-group-summary">{lines.length} líneas · {hours(hh)} h-hombre · {hours(hm)} h-máquina</span></span>
    </button>
    {open && <div className="dx-cascada-table-wrap">
      <table className="dx-cascada-lines-table">
        <thead><tr><th scope="col">Actividad</th><th scope="col">Tarea</th><th scope="col">Cargo</th><th scope="col">H-H</th><th scope="col">Equipo</th><th scope="col">H-equipo</th><th scope="col">Nivel de costo</th><th scope="col">Detalle</th></tr></thead>
        {[...activities.entries()].map(([activityId, group]) => <tbody key={activityId}>
          <tr className="dx-cascada-activity-heading"><th colSpan="8" scope="rowgroup">{labelOf(group.activity)}</th></tr>
          {group.lines.map(line => {
            const tarea = selected(catalogs.tipos, line.tarea_id);
            const activity = labelOf(group.activity);
            const taskLabel = line.tarea_id ? labelOf(tarea) : `Costo de ${activity}`;
            const key = lineId(line);
            const detailOpen = Boolean(expanded[key]);
            const materials = line.materiales || [];
            return <React.Fragment key={key}>
              <tr className={`dx-cascada-line${line._dirty ? ' is-dirty' : ''}`}>
                <td data-label="Actividad">{activity}</td>
                <td data-label="Tarea"><span className="dx-cascada-task-name">{taskLabel}</span>{line.tarea_id && tarea?.codigo && <small className="dx-cascada-task-code">{tarea.codigo}</small>}{line._saveError && <span className="dx-row-error" role="alert">{line._saveError}</span>}</td>
                <td data-label="Cargo"><Selector label={`Cargo de ${taskLabel}`} kind="cargo" value={selected(catalogs.cargos, line.cargo_id)} options={catalogs.cargos} disabled={!canEdit} placeholder="Seleccionar cargo" clearable onSelect={item => patch(line, { cargo_id: item?.id || null })} onError={onError} /></td>
                <td data-label="H-H"><label className="dx-cascada-number"><input aria-label={`Horas-hombre de ${taskLabel}`} type="number" min="0" step="0.01" value={line.horas_mano_obra ?? 0} disabled={!canEdit} onChange={event => patch(line, { horas_mano_obra: event.target.value })} /><span>h</span></label></td>
                <td data-label="Equipo"><Selector label={`Equipo de ${taskLabel}`} kind="activo" value={selected(catalogs.activos, line.activo_id)} options={catalogs.activos} disabled={!canEdit} placeholder="Sin equipo" clearable onSelect={item => patch(line, { activo_id: item?.id || null, horas_maquina: item?.id ? line.horas_maquina : 0 })} onError={onError} /></td>
                <td data-label="H-equipo"><label className={`dx-cascada-number${!line.activo_id ? ' is-disabled' : ''}`}><input aria-label={`Horas de equipo de ${taskLabel}`} type="number" min="0" step="0.01" value={line.horas_maquina ?? 0} disabled={!canEdit || !line.activo_id} onChange={event => patch(line, { horas_maquina: event.target.value })} /><span>h</span></label></td>
                <td data-label="Nivel de costo"><span className={`dx-cascada-level${line.tarea_id ? '' : ' is-activity'}`}>{line.tarea_id ? 'En la tarea' : 'En la actividad'}</span></td>
                <td data-label="Detalle"><div className="dx-cascada-detail-actions"><button type="button" className="dx-detail-button" aria-expanded={detailOpen} aria-label={`Detalle y materiales de ${taskLabel}`} onClick={() => setExpanded(value => ({ ...value, [key]: !value[key] }))}>{materials.length ? `Repuestos ${materials.length}` : 'Detalle'}</button>{canEdit && onDelete && <button type="button" className="dx-delete" aria-label={`Eliminar ${taskLabel}`} onClick={() => onDelete(line)}>×</button>}</div></td>
              </tr>
              {detailOpen && <tr className="dx-cascada-detail-row"><td colSpan="8"><div className="dx-detail">
                <div className="dx-field"><label htmlFor={`hallazgo-${key}`}>Hallazgo · {taskLabel}</label><textarea id={`hallazgo-${key}`} rows="3" value={line.hallazgo || ''} disabled={!canEdit} onChange={event => patch(line, { hallazgo: event.target.value })} /></div>
                <div className="dx-materials"><div className="dx-material-title">Repuestos de esta tarea</div>{materials.map((material, index) => <div className="dx-material" key={material.id || material._key}><input aria-label={`Descripción del repuesto ${index + 1} de ${taskLabel}`} value={material.descripcion || ''} disabled={!canEdit} onChange={event => patch(line, { materiales: materials.map((item, idx) => idx === index ? { ...item, descripcion: event.target.value } : item) })} /><input aria-label={`Cantidad del repuesto ${index + 1} de ${taskLabel}`} type="number" min="0.0001" step="0.0001" value={material.cantidad ?? 1} disabled={!canEdit} onChange={event => patch(line, { materiales: materials.map((item, idx) => idx === index ? { ...item, cantidad: event.target.value } : item) })} /><span>{material.unidad || 'und'}</span>{canEdit && <button type="button" onClick={() => patch(line, { materiales: materials.filter((_, idx) => idx !== index) })}>Quitar</button>}</div>)}{canEdit && <button type="button" className="dx-secondary" onClick={() => patch(line, { materiales: [...materials, { _key: `material-${Date.now()}-${Math.random()}`, descripcion: '', cantidad: 1, unidad: 'und', orden: materials.length }] })}>+ Agregar repuesto</button>}{validationErrors?.[key]?.map((message, index) => message && <div className="dx-row-error" role="alert" key={index}>Repuesto {index + 1}: {message}</div>)}</div>
              </div></td></tr>}
            </React.Fragment>;
          })}
        </tbody>)}
      </table>
    </div>}
  </section>;
}
