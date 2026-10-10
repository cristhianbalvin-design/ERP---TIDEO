import React, { useState } from 'react';

const lineId = line => line._key || line.id;
const labelOf = item => item?.nombre || 'No disponible';

export function DiagnosticoLineasTabla({ lines, catalogs, canEdit, onChange, onDelete, onError, validationErrors, Selector }) {
  const [expanded, setExpanded] = useState({});
  const selected = (options, id) => options.find(option => option.id === id) || (id ? { id, nombre: 'No disponible' } : null);
  const patch = (line, changes) => onChange(line, { ...line, ...changes });

  return <section className="dx-cascada-lines-group">
    <header className="dx-cascada-lines-head"><h3>Líneas del diagnóstico</h3><span>{lines.length} {lines.length === 1 ? 'línea' : 'líneas'}</span></header>
    <div className="dx-cascada-table-wrap">
      <table className="dx-cascada-lines-table">
        <thead><tr><th scope="col">Trabajo o componente</th><th scope="col">Actividad</th><th scope="col">Tarea</th><th scope="col">Cargo</th><th scope="col">Equipo</th><th scope="col">Nivel de costo</th><th scope="col" className="n">H-H</th><th scope="col" className="n">H-equipo</th><th scope="col"><span className="dx-sr-only">Detalle</span></th></tr></thead>
        <tbody>
          {lines.map(line => {
            const familia = selected(catalogs.familias, line.familia_trabajo_id);
            const activity = labelOf(selected(catalogs.tipos, line.actividad_id));
            const tarea = selected(catalogs.tipos, line.tarea_id);
            const taskLabel = line.tarea_id ? labelOf(tarea) : `Costo de ${activity}`;
            const key = lineId(line);
            const detailOpen = Boolean(expanded[key]);
            const materials = line.materiales || [];
            return <React.Fragment key={key}>
              <tr className={`dx-cascada-line${line._dirty ? ' is-dirty' : ''}`}>
                <td data-label="Trabajo o componente">{labelOf(familia)}</td>
                <td data-label="Actividad">{activity}</td>
                <td data-label="Tarea">{line.tarea_id ? <span className="dx-cascada-task-name">{taskLabel}</span> : <span className="dx-cascada-muted">Sin tareas</span>}{line.tarea_id && tarea?.codigo && <small className="dx-cascada-task-code">{tarea.codigo}</small>}{line._saveError && <span className="dx-row-error" role="alert">{line._saveError}</span>}</td>
                <td data-label="Cargo"><Selector label={`Cargo de ${taskLabel}`} kind="cargo" value={selected(catalogs.cargos, line.cargo_id)} options={catalogs.cargos} disabled={!canEdit} placeholder="Seleccionar cargo" clearable onSelect={item => patch(line, { cargo_id: item?.id || null })} onError={onError} /></td>
                <td data-label="Equipo"><Selector label={`Equipo de ${taskLabel}`} kind="activo" value={selected(catalogs.activos, line.activo_id)} options={catalogs.activos} disabled={!canEdit} placeholder="Sin equipo" clearable onSelect={item => patch(line, { activo_id: item?.id || null, horas_maquina: item?.id ? line.horas_maquina : 0 })} onError={onError} /></td>
                <td data-label="Nivel de costo"><span className={`dx-cascada-level${line.tarea_id ? '' : ' is-activity'}`}>{line.tarea_id ? 'En la tarea' : 'En la actividad'}</span></td>
                <td data-label="H-H" className="n"><label className="dx-cascada-number"><input aria-label={`Horas-hombre de ${taskLabel}`} type="number" min="0" step="0.01" value={line.horas_mano_obra ?? 0} disabled={!canEdit} onChange={event => patch(line, { horas_mano_obra: event.target.value })} /></label></td>
                <td data-label="H-equipo" className="n"><label className={`dx-cascada-number${!line.activo_id ? ' is-disabled' : ''}`}><input aria-label={`Horas de equipo de ${taskLabel}`} type="number" min="0" step="0.01" value={line.horas_maquina ?? 0} disabled={!canEdit || !line.activo_id} onChange={event => patch(line, { horas_maquina: event.target.value })} /></label></td>
                <td data-label="Detalle"><div className="dx-cascada-detail-actions"><button type="button" className="dx-detail-button" aria-expanded={detailOpen} aria-label={`Detalle y materiales de ${taskLabel}`} onClick={() => setExpanded(value => ({ ...value, [key]: !value[key] }))}>{materials.length ? `Repuestos ${materials.length}` : 'Detalle'}</button>{canEdit && onDelete && <button type="button" className="dx-delete" aria-label={`Eliminar ${taskLabel}`} onClick={() => onDelete(line)}>×</button>}</div></td>
              </tr>
              {detailOpen && <tr className="dx-cascada-detail-row"><td colSpan="9"><div className="dx-detail">
                <div className="dx-field"><label htmlFor={`hallazgo-${key}`}>Hallazgo · {taskLabel}</label><textarea id={`hallazgo-${key}`} rows="3" value={line.hallazgo || ''} disabled={!canEdit} onChange={event => patch(line, { hallazgo: event.target.value })} /></div>
                <div className="dx-materials"><div className="dx-material-title">Repuestos de esta tarea</div>{materials.map((material, index) => <div className="dx-material" key={material.id || material._key}><input aria-label={`Descripción del repuesto ${index + 1} de ${taskLabel}`} value={material.descripcion || ''} disabled={!canEdit} onChange={event => patch(line, { materiales: materials.map((item, idx) => idx === index ? { ...item, descripcion: event.target.value } : item) })} /><input aria-label={`Cantidad del repuesto ${index + 1} de ${taskLabel}`} type="number" min="0.0001" step="0.0001" value={material.cantidad ?? 1} disabled={!canEdit} onChange={event => patch(line, { materiales: materials.map((item, idx) => idx === index ? { ...item, cantidad: event.target.value } : item) })} /><span>{material.unidad || 'und'}</span>{canEdit && <button type="button" onClick={() => patch(line, { materiales: materials.filter((_, idx) => idx !== index) })}>Quitar</button>}</div>)}{canEdit && <button type="button" className="dx-secondary" onClick={() => patch(line, { materiales: [...materials, { _key: `material-${Date.now()}-${Math.random()}`, descripcion: '', cantidad: 1, unidad: 'und', orden: materials.length }] })}>+ Agregar repuesto</button>}{validationErrors?.[key]?.map((message, index) => message && <div className="dx-row-error" role="alert" key={index}>Repuesto {index + 1}: {message}</div>)}</div>
              </div></td></tr>}
            </React.Fragment>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}
