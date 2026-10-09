import React, { useEffect, useMemo, useRef, useState } from 'react';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
const num = value => Number(value) || 0;

export function DiagnosticoAgregarTareasPanel({ familias = [], tipos = [], cargos = [], activos = [], plantillas = [], tipoDiagnostico, lineas = [], onClose, onAdd, onCreateFamily, onCreateType }) {
  const [familiaId, setFamiliaId] = useState('');
  const [actividadId, setActividadId] = useState('');
  const [query, setQuery] = useState(['', '', '']);
  const [createStep, setCreateStep] = useState(0);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState({});
  const [soloActividad, setSoloActividad] = useState(false);
  const [soloLine, setSoloLine] = useState({ cargo_id: '', horas_mano_obra: 0, activo_id: '', horas_maquina: 0 });
  const [addNotice, setAddNotice] = useState('');
  const searchRefs = [useRef(null), useRef(null), useRef(null)];
  const dialogRef = useRef(null);
  const family = familias.find(item => item.id === familiaId);
  const actividad = tipos.find(item => item.id === actividadId);
  const activities = tipos.filter(item => item.rol === 'actividad');
  const tasks = tipos.filter(item => item.rol === 'tarea' || item.rol == null);
  const recipe = useMemo(() => plantillas.filter(row => row.actividad_id === actividadId && row.tarea_id).slice().sort((a, b) => num(a.orden) - num(b.orden)), [plantillas, actividadId]);
  const isFab = tipoDiagnostico === 'fabricacion';
  const lines = useMemo(() => {
    if (isFab && recipe.length) return recipe.map((row, index) => ({
      familia_trabajo_id: familiaId, actividad_id: actividadId, tarea_id: row.tarea_id,
      cargo_id: selected[row.tarea_id]?.cargo_id ?? row.cargo_id ?? '', horas_mano_obra: selected[row.tarea_id]?.horas_mano_obra ?? row.horas ?? 0,
      activo_id: selected[row.tarea_id]?.activo_id ?? row.activo_id ?? '', horas_maquina: selected[row.tarea_id]?.horas_maquina ?? row.horas_maquina ?? 0,
      _key: `receta-${row.tarea_id}-${index}`, _receta: row,
    }));
    return Object.values(selected);
  }, [isFab, recipe, familiaId, actividadId, selected]);
  const canAdd = Boolean(family && actividad && (soloActividad || lines.length));

  useEffect(() => {
    dialogRef.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose]);

  useEffect(() => {
    if (!addNotice) return undefined;
    const timeout = window.setTimeout(() => setAddNotice(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [addNotice]);

  const setSearch = (index, value) => setQuery(current => current.map((item, i) => i === index ? value : item));
  const matching = (rows, index, label) => rows.filter(row => normalize(`${label(row)} ${row.codigo || ''}`).includes(normalize(query[index])));
  const updateLine = (key, patch) => {
    const changes = { ...patch, ...(patch.activo_id === '' ? { horas_maquina: 0 } : {}) };
    if (key === 'solo') setSoloLine(current => ({ ...current, ...changes }));
    else setSelected(current => ({ ...current, [key]: { ...current[key], ...changes } }));
  };
  const toggleTask = task => setSelected(current => {
    const next = { ...current };
    if (next[task.id]) delete next[task.id];
    else {
      const suggested = recipe.find(row => row.tarea_id === task.id);
      next[task.id] = { familia_trabajo_id: familiaId, actividad_id: actividadId, tarea_id: task.id, cargo_id: suggested?.cargo_id || '', horas_mano_obra: suggested?.horas ?? 0, activo_id: suggested?.activo_id || '', horas_maquina: suggested?.horas_maquina ?? 0, _key: `line-${task.id}` };
    }
    return next;
  });

  const create = async () => {
    const name = createName.trim();
    if (!name) return;
    setBusy(true); setCreateError('');
    try {
      if (createStep === 1) {
        const item = await onCreateFamily(name);
        setFamiliaId(item.id); setActividadId('');
      } else {
        const item = await onCreateType(name, createStep === 2 ? 'actividad' : 'tarea');
        if (createStep === 2) setActividadId(item.id);
        else toggleTask({ ...item, rol: 'tarea' });
      }
      setCreateName(''); setCreateStep(0);
    } catch (error) { setCreateError(error?.message || 'No se pudo crear el registro.'); }
    finally { setBusy(false); }
  };

  const editFields = (line, key, showDeviation = false) => {
    const ref = line._receta;
    const changed = ref && (line.cargo_id !== (ref.cargo_id || '') || num(line.horas_mano_obra) !== num(ref.horas) || line.activo_id !== (ref.activo_id || '') || num(line.horas_maquina) !== num(ref.horas_maquina));
    return <>
      <div className="dx-cascada-fields">
        <label>Cargo<select aria-label="Cargo" value={line.cargo_id || ''} onChange={event => updateLine(key, { cargo_id: event.target.value })}><option value="">Sin cargo</option>{cargos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
        <label>H-H<input aria-label="Horas-hombre" type="number" min="0" step="0.25" value={line.horas_mano_obra ?? 0} onChange={event => updateLine(key, { horas_mano_obra: event.target.value })} /></label>
        <label>Equipo<select aria-label="Equipo" value={line.activo_id || ''} onChange={event => updateLine(key, { activo_id: event.target.value, ...(!event.target.value ? { horas_maquina: 0 } : {}) })}><option value="">Sin equipo</option>{activos.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select></label>
        <label>H-equipo<input aria-label="Horas de equipo" type="number" min="0" step="0.25" value={line.horas_maquina ?? 0} disabled={!line.activo_id} onChange={event => updateLine(key, { horas_maquina: event.target.value })} /></label>
      </div>
      {showDeviation && <span className={`dx-cascada-dev ${changed ? 'is-changed' : 'is-same'}`}>{changed ? 'Valores ajustados respecto a la receta' : 'Igual a la receta'}</span>}
    </>;
  };

  const creationBox = step => createStep !== step
    ? <div className="dx-cascada-create"><button type="button" onClick={() => { setCreateStep(step); setCreateName(''); setCreateError(''); }}>+ Crear {step === 1 ? 'trabajo o componente' : step === 2 ? 'actividad' : 'tarea'}</button></div>
    : <div className="dx-cascada-create"><form onSubmit={event => { event.preventDefault(); create(); }}><input autoFocus aria-label="Nombre" value={createName} onChange={event => setCreateName(event.target.value)} placeholder="Nombre" /><div><button className="dx-cascada-primary" disabled={busy || !createName.trim()}>{busy ? 'Creando…' : 'Crear'}</button><button type="button" onClick={() => setCreateStep(0)}>Cancelar</button></div>{createError && <span role="alert">{createError}</span>}</form></div>;
  const result = (rows, index, label, id, meta) => <div className="dx-cascada-list" role="listbox" aria-label={label}>
    {matching(rows, index, item => item.nombre).map(item => <button type="button" role="option" aria-selected={id === item.id} key={item.id} className={`dx-cascada-row${id === item.id ? ' is-selected' : ''}`} onClick={() => {
      if (index === 0) { setFamiliaId(item.id); setActividadId(''); setSelected({}); setSoloActividad(false); }
      else {
        setActividadId(item.id); setSoloActividad(false); setQuery(current => current.map((q, i) => i === 2 ? '' : q));
        const recipeRows = plantillas.filter(row => row.actividad_id === item.id && row.tarea_id).slice().sort((a, b) => num(a.orden) - num(b.orden));
        setSelected(isFab ? Object.fromEntries(recipeRows.map(row => [row.tarea_id, { familia_trabajo_id: familiaId, actividad_id: item.id, tarea_id: row.tarea_id, cargo_id: row.cargo_id || '', horas_mano_obra: row.horas ?? 0, activo_id: row.activo_id || '', horas_maquina: row.horas_maquina ?? 0, _key: row.tarea_id }])) : {});
      }
    }}><span>{item.nombre}<small>{meta(item)}</small></span><b aria-hidden="true">›</b></button>)}
    {!matching(rows, index, item => item.nombre).length && <div className="dx-cascada-empty">Sin coincidencias</div>}
  </div>;

  const taskOptions = tasks.filter(item => !isFab || !recipe.length || recipe.some(row => row.tarea_id === item.id));
  const suggested = new Set(recipe.map(row => row.tarea_id));
  const visibleTaskOptions = matching(taskOptions, 2, item => item.nombre);
  const suggestedTasks = visibleTaskOptions.filter(item => suggested.has(item.id));
  const catalogTasks = visibleTaskOptions.filter(item => !suggested.has(item.id));
  const add = () => {
    const prepared = soloActividad
      ? [{ familia_trabajo_id: familiaId, actividad_id: actividadId, tarea_id: null, ...soloLine }]
      : lines.map(line => ({ ...line, familia_trabajo_id: familiaId, actividad_id: actividadId, horas_mano_obra: num(line.horas_mano_obra), horas_maquina: line.activo_id ? num(line.horas_maquina) : 0, _key: undefined, _receta: undefined }));
    const isDuplicate = row => lineas.some(existing => existing.familia_trabajo_id === familiaId && existing.actividad_id === actividadId && existing.tarea_id === row.tarea_id);
    const additions = prepared.filter(row => !isDuplicate(row));
    const duplicateCount = prepared.length - additions.length;
    if (duplicateCount) setAddNotice(`Se omitieron ${duplicateCount} tarea${duplicateCount === 1 ? '' : 's'} ya agregada${duplicateCount === 1 ? '' : 's'} para este trabajo y actividad.`);
    if (additions.length) onAdd(additions);
    if (!duplicateCount) onClose();
  };

  return <div className="dx-cascada-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dx-cascada-panel" role="dialog" aria-modal="true" aria-labelledby="dx-cascada-title" tabIndex="-1" ref={dialogRef}>
      <header className="dx-cascada-head"><div><h2 id="dx-cascada-title">Agregar al diagnóstico</h2><p>{isFab ? 'Elige el trabajo, la actividad y ajusta las tareas de la receta.' : 'Elige el trabajo, la actividad y las tareas que se realizarán.'}</p></div><span className={`dx-cascada-pill${isFab ? '' : ' is-maintenance'}`}>{isFab ? 'Fabricación' : 'Mantenimiento y reparación'}</span><button type="button" className="dx-cascada-close" aria-label="Cerrar" onClick={onClose}>×</button></header>
      <div className="dx-cascada-steps" aria-label="Pasos"><span className={family ? 'is-done' : 'is-current'}>1 · {family?.nombre || 'Trabajo o componente'}</span><span className={actividad ? 'is-done' : family ? 'is-current' : ''}>2 · {actividad?.nombre || 'Actividad'}</span><span className={actividad ? 'is-current' : ''}>3 · Tarea</span></div>
      <div className="dx-cascada-cols">
        <section className="dx-cascada-col"><div className="dx-cascada-coltop"><h3>Trabajo o componente</h3><input ref={searchRefs[0]} type="search" aria-label="Buscar trabajo o componente" placeholder="Buscar" value={query[0]} onChange={event => setSearch(0, event.target.value)} /></div>{result(familias, 0, 'Trabajo o componente', familiaId, item => item.rol === 'componente' ? 'Componente' : 'Trabajo')}{creationBox(1)}</section>
        <section className="dx-cascada-col"><div className="dx-cascada-coltop"><h3>Actividad</h3><input ref={searchRefs[1]} type="search" aria-label="Buscar actividad" placeholder="Buscar" disabled={!family} value={query[1]} onChange={event => setSearch(1, event.target.value)} /></div>{family ? result(activities, 1, 'Actividad', actividadId, item => `${plantillas.filter(row => row.actividad_id === item.id && row.tarea_id).length} tareas en receta`) : <div className="dx-cascada-empty">Primero elige un trabajo o componente.</div>}{family && creationBox(2)}</section>
        <section className="dx-cascada-col"><div className="dx-cascada-coltop"><h3>Tarea</h3>{actividad && (!isFab || !recipe.length) && <input ref={searchRefs[2]} type="search" aria-label="Buscar tarea" placeholder="Buscar tarea" value={query[2]} onChange={event => setSearch(2, event.target.value)} />}</div>
          {!actividad ? <div className="dx-cascada-empty">Primero elige una actividad.</div> : <>
            {!isFab && <label className="dx-cascada-solo"><input type="checkbox" checked={soloActividad} onChange={event => { setSoloActividad(event.target.checked); if (event.target.checked) setSelected({}); }} /><span>Costear solo la actividad<small>Sin tareas. El costo queda en la actividad.</small></span></label>}
            {soloActividad ? editFields(soloLine, 'solo') : <div className="dx-cascada-list dx-cascada-tasks" role="group" aria-label="Tareas disponibles">
                {isFab && recipe.length ? <><p className="dx-cascada-note">Receta cargada. Ajustes aplican solo a este diagnóstico.</p>{recipe.map((row, index) => { const task = tasks.find(item => item.id === row.tarea_id); const line = lines[index]; if (!line) return null; return <div className="dx-cascada-task" key={`${row.tarea_id}-${index}`}><strong>{task?.nombre || 'Tarea del catálogo'}</strong>{editFields(line, row.tarea_id, true)}</div>; })}</>
                : <>{recipe.length > 0 && <p className="dx-cascada-note">Las tareas de receta aparecen como sugeridas.</p>}{suggestedTasks.length > 0 && <><h4 className="dx-cascada-task-group">Sugeridas</h4>{suggestedTasks.map(task => { const row = recipe.find(item => item.tarea_id === task.id); const line = selected[task.id]; return <div className="dx-cascada-task" key={task.id}><label className="dx-cascada-taskcheck"><input type="checkbox" checked={Boolean(line)} disabled={isFab && recipe.length > 0} onChange={() => toggleTask(task)} /><span>{task.nombre}<small>Sugerida por la receta</small></span></label>{line && editFields(line, task.id, Boolean(row))}</div>; })}</>}{catalogTasks.length > 0 && <><h4 className="dx-cascada-task-group">Catálogo</h4>{catalogTasks.map(task => { const row = recipe.find(item => item.tarea_id === task.id); const line = selected[task.id]; return <div className="dx-cascada-task" key={task.id}><label className="dx-cascada-taskcheck"><input type="checkbox" checked={Boolean(line)} disabled={isFab && recipe.length > 0} onChange={() => toggleTask(task)} /><span>{task.nombre}</span></label>{line && editFields(line, task.id, Boolean(row))}</div>; })}</>}{!taskOptions.length && <div className="dx-cascada-empty">No hay tareas en la receta.</div>}</>}
              </div>}
            {(!isFab || !recipe.length) && creationBox(3)}
          </>}
        </section>
      </div>
      {addNotice && <p className="dx-cascada-notice" role="status">{addNotice}</p>}
      <footer className="dx-cascada-foot"><span>{!family ? 'Elige un trabajo o componente para empezar' : !actividad ? 'Falta elegir la actividad' : soloActividad ? 'Costo en la actividad' : `${lines.length} tareas · ${lines.reduce((sum, row) => sum + num(row.horas_mano_obra), 0).toLocaleString('es-PE')} h-hombre`}</span><div><button type="button" onClick={() => { setFamiliaId(''); setActividadId(''); setSelected({}); setSoloActividad(false); setQuery(['', '', '']); }}>Limpiar</button><button type="button" className="dx-cascada-primary" disabled={!canAdd} onClick={add}>Agregar al diagnóstico</button></div></footer>
    </section>
  </div>;
}
