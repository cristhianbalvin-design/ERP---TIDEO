import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  actualizarDiagnosticoHallazgo,
  actualizarDiagnosticoMedicion,
  crearDiagnosticoHallazgo,
  crearDiagnosticoMedicion,
  crearEnlaceDiagnosticoHallazgoLinea,
  eliminarDiagnosticoHallazgo,
  eliminarDiagnosticoMedicion,
  eliminarEnlaceDiagnosticoHallazgoLinea,
  listarCatalogosHallazgos,
} from '../../services/diagnosticoTecnicoService.js';

const CATALOG_LABELS = {
  tipo_dano: 'Tipo de daño',
  causa_probable: 'Causa probable',
  unidad_medicion: 'Unidad',
};
const CONDITION_LABELS = {
  conforme: 'Conforme',
  desgaste_aceptable: 'Desgaste aceptable',
  fuera_de_tolerancia: 'Fuera de tolerancia',
  falla_funcional: 'Falla funcional',
};
const RISK_LABELS = {
  monitorear: 'Monitorear',
  proximo_mantenimiento: 'Próximo mantenimiento',
  antes_de_operar: 'Antes de operar',
  inmediato_por_seguridad: 'Inmediato por seguridad',
};
// Vista previa v1: la prioridad oficial siempre la calcula y persiste el servidor.
// Esta matriz local solo permite visualizar el efecto inmediato de condición × riesgo.
const MATRIX = {
  conforme: { monitorear: 'P4', proximo_mantenimiento: 'P4', antes_de_operar: 'P3', inmediato_por_seguridad: 'P2' },
  desgaste_aceptable: { monitorear: 'P4', proximo_mantenimiento: 'P3', antes_de_operar: 'P2', inmediato_por_seguridad: 'P1' },
  fuera_de_tolerancia: { monitorear: 'P3', proximo_mantenimiento: 'P2', antes_de_operar: 'P1', inmediato_por_seguridad: 'P1' },
  falla_funcional: { monitorear: 'P2', proximo_mantenimiento: 'P1', antes_de_operar: 'P1', inmediato_por_seguridad: 'P1' },
};
const PRIORITY_RANK = { P4: 1, P3: 2, P2: 3, P1: 4 };
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
const ACTIONS = [
  ['reutilizar', 'Reutilizar'], ['reparar', 'Reparar'], ['reemplazar', 'Reemplazar'],
  ['fabricar_nuevo', 'Fabricar nuevo'], ['monitorear', 'Monitorear'],
];
const ATTRIBUTIONS = [
  ['desgaste_normal', 'Desgaste normal'], ['operacion', 'Operación'],
  ['defecto_fabrica', 'Defecto de fábrica'], ['instalacion', 'Instalación'],
];
const RESULT_LABELS = {
  fuera_de_rango: 'Fuera de tolerancia',
  dentro_de_rango: 'Dentro de límite',
  sin_sugerencia: 'Sin sugerencia',
};
const emptyMeasurement = () => ({ _key: `medicion-${Date.now()}-${Math.random()}`, parametro: '', unidad: '', nominal: '', minimo: '', maximo: '', medido: '', _new: true, _dirty: true });
const keyFor = row => row._key || row.id;
const errorMessage = error => error?.message || 'No se pudo completar la operación.';
const isPermissionError = error => error?.code === '42501' || /solo lectura|emitido|permission denied/i.test(error?.message || '');
const measurementValidationMessage = (measurement, number) => {
  if (!String(measurement.parametro || '').trim()) return `Escribe el parámetro de la medición ${number}.`;
  if (!String(measurement.unidad || '').trim()) return `Elige la unidad de la medición ${number}.`;
  return '';
};

const normalize = row => ({
  ...row,
  _key: row._key || row.id || `hallazgo-${Date.now()}-${Math.random()}`,
  _dirty: Boolean(row._dirty),
  mediciones: (row.mediciones || []).map(item => ({ ...item, _dirty: false })),
  lineas: (row.lineas || []).map(item => ({ ...item, _dirty: false })),
});

function SelectField({ label, value, options, disabled, onChange, allowInactive = false }) {
  return <div className="field">
    <label>{label}</label>
    <select className="select" value={value || ''} disabled={disabled} onChange={event => onChange(event.target.value || null)}>
      <option value="">Seleccionar...</option>
      {options.map(option => <option key={option.codigo} value={option.codigo}>{option.etiqueta}{allowInactive && option.inactivo ? ' (inactivo)' : ''}</option>)}
    </select>
  </div>;
}

function ChoiceButtons({ label, value, options, disabled, onChange, hint }) {
  return <div className="field hallazgo-choice-field">
    <label>{label}{hint && <span className="hallazgo-label-note"> · {hint}</span>}</label>
    <div className="hallazgo-choice-buttons">{options.map(([code, text]) => <button key={code} type="button" className={value === code ? 'hallazgo-choice is-selected' : 'hallazgo-choice'} disabled={disabled} onClick={() => onChange(code)}>{text}</button>)}</div>
  </div>;
}

function MeasurementTable({ item, catalogs, canEdit, update, remove }) {
  const add = () => update({ mediciones: [...(item.mediciones || []), emptyMeasurement()] });
  const patch = (measurement, changes) => update({ mediciones: (item.mediciones || []).map(row => row === measurement ? { ...row, ...changes, _dirty: true } : row) });
  return <section className="hallazgo-section hallazgo-measurements">
    <div className="hallazgo-section-head"><div><h4>Mediciones</h4><span className="hint">El resultado sugiere la condición; el técnico la confirma.</span></div>{canEdit && <button type="button" className="btn btn-secondary" onClick={add}>+ Medición</button>}</div>
    {!item.mediciones?.length ? <p className="muted">Sin mediciones.</p> : <div className="table-wrap"><table className="table hallazgo-measurement-table"><thead><tr><th>Parámetro</th><th>Unidad</th><th>Nominal</th><th>Mín.</th><th>Máx.</th><th>Medido</th><th>Resultado</th><th>Sugerencia</th><th /></tr></thead><tbody>
      {item.mediciones.map(measurement => <tr key={measurement.id || measurement._key}>
        <td><input className="input" value={measurement.parametro || ''} disabled={!canEdit} onChange={event => patch(measurement, { parametro: event.target.value })} /></td>
        <td><select className="select" value={measurement.unidad || ''} disabled={!canEdit} onChange={event => patch(measurement, { unidad: event.target.value })}><option value="">—</option>{(catalogs.unidad_medicion || []).map(option => <option key={option.codigo} value={option.codigo}>{option.etiqueta}</option>)}</select></td>
        {['nominal', 'minimo', 'maximo', 'medido'].map(field => <td key={field}><input className="input" type="number" step="any" value={measurement[field] ?? ''} disabled={!canEdit} onChange={event => patch(measurement, { [field]: event.target.value })} /></td>)}
        <td><span className={`badge ${measurement.resultado_calculado === 'fuera_de_rango' ? 'priority-p1' : 'priority-p4'}`}>{RESULT_LABELS[measurement.resultado_calculado] || 'Pendiente'}</span></td>
        <td><div className="hallazgo-suggestion-cell"><span className="badge slate">{measurement.condicion_sugerida ? CONDITION_LABELS[measurement.condicion_sugerida] || measurement.condicion_sugerida : 'Pendiente'}</span>{canEdit && measurement.condicion_sugerida && measurement.condicion_sugerida !== item.condicion && <button type="button" className="btn btn-ghost" onClick={() => update({ condicion: measurement.condicion_sugerida })}>Aplicar sugerencia</button>}</div></td>
        <td>{canEdit && <button type="button" className="btn btn-ghost" aria-label="Eliminar medición" onClick={() => remove(measurement)}>Eliminar</button>}</td>
      </tr>)}
    </tbody></table></div>}
  </section>;
}

function TaskLinks({ item, lines, tipos, cargos, activos, canEdit, update, remove }) {
  const [query, setQuery] = useState('');
  const visible = lines.filter(line => {
    if (line.familia_trabajo_id !== item.familia_trabajo_id) return false;
    if (!query.trim()) return false;
    const task = tipos.find(tipo => tipo.id === line.tarea_id);
    const text = [task?.nombre, task?.codigo, line.hallazgo].filter(Boolean).join(' ').toLocaleLowerCase();
    return text.includes(query.toLocaleLowerCase());
  });
  const add = async line => {
    update({ lineas: [...(item.lineas || []), { _key: `enlace-${item._key}-${line.id}`, linea_id: line.id, _new: true, _dirty: true }] });
    setQuery('');
  };
  return <section className="hallazgo-section hallazgo-tasks">
    <div className="hallazgo-section-head"><div><h4>Tareas relacionadas</h4><span className="hint">Puedes repetir una tarea dentro del mismo trabajo.</span></div></div>
    {canEdit && <div className="hallazgo-task-search"><input className="input" aria-label="Buscar tarea" placeholder="Escribe para agregar una tarea a este hallazgo…" value={query} onChange={event => setQuery(event.target.value)} />{query && <div className="hallazgo-task-results">{visible.length ? visible.map(line => { const task = tipos.find(tipo => tipo.id === line.tarea_id); const cargo = cargos.find(row => row.id === line.cargo_id); return <button type="button" key={line.id} onClick={() => add(line)}><strong>{task?.nombre || 'Tarea sin nombre'}</strong><span>{cargo?.nombre || 'Sin cargo'} · {line.horas_mano_obra || 0} h hombre · {line.horas_maquina || 0} h máquina</span></button>; }) : <span className="muted">No hay tareas coincidentes.</span>}</div>}</div>}
    {!item.lineas?.length ? <p className="muted">Sin tareas relacionadas.</p> : <div className="table-wrap"><table className="table hallazgo-task-table"><thead><tr><th>Tarea</th><th>Cargo · mano de obra</th><th>H-hombre</th><th>Activo · máquina</th><th>H-máquina</th><th /></tr></thead><tbody>{item.lineas.map(link => { const line = lines.find(candidate => candidate.id === link.linea_id); const task = tipos.find(tipo => tipo.id === line?.tarea_id); const cargo = cargos.find(row => row.id === line?.cargo_id); const activo = activos.find(row => row.id === line?.activo_id); return <tr key={link.id || link._key}><td><strong>{task?.nombre || line?.tarea_id || 'Tarea no disponible'}</strong></td><td>{cargo?.nombre || 'Sin cargo'}</td><td>{line?.horas_mano_obra || 0}</td><td>{activo?.nombre || activo?.codigo || line?.activo_id || 'Sin máquina'}</td><td>{line?.horas_maquina || 0}</td><td>{canEdit && <button type="button" className="btn btn-ghost" aria-label="Quitar tarea" onClick={() => remove(link)}>Quitar</button>}</td></tr>; })}</tbody></table></div>}
  </section>;
}

export function HallazgosTrabajoPanel({ empresaId, diagnostico, lines = [], familias = [], tipos = [], cargos = [], activos = [], canEdit, readOnly, onRegisterSave, onDirtyChange, onDirtySummary, onSavingChange, onError, onNotice }) {
  const [items, setItems] = useState(() => (diagnostico?.hallazgos || []).map(normalize));
  const [deletedItems, setDeletedItems] = useState([]);
  const [deletedMediciones, setDeletedMediciones] = useState([]);
  const [deletedLineas, setDeletedLineas] = useState([]);
  const [catalogs, setCatalogs] = useState({ tipo_dano: [], causa_probable: [], unidad_medicion: [] });
  const [catalogError, setCatalogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  useEffect(() => {
    setItems((diagnostico?.hallazgos || []).map(normalize));
    setDeletedItems([]); setDeletedMediciones([]); setDeletedLineas([]);
    setExpandedKeys(new Set((diagnostico?.hallazgos || []).slice(0, 1).map(row => row.id).filter(Boolean)));
  }, [diagnostico?.id]);

  useEffect(() => {
    let active = true;
    if (!empresaId) return undefined;
    listarCatalogosHallazgos(empresaId).then(rows => {
      if (!active) return;
      const grouped = { tipo_dano: [], causa_probable: [], unidad_medicion: [] };
      rows.forEach(row => { if (grouped[row.catalogo]) grouped[row.catalogo].push(row); });
      setCatalogs(grouped);
    }).catch(error => { if (active) setCatalogError(errorMessage(error)); });
    return () => { active = false; };
  }, [empresaId]);

  const dirty = items.some(item => item._dirty || item.mediciones?.some(row => row._dirty) || item.lineas?.some(row => row._dirty)) || deletedItems.length > 0 || deletedMediciones.length > 0 || deletedLineas.length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const dirtyHallazgos = items.filter(item => item._dirty).length + deletedItems.length;
  const dirtyTasks = items.flatMap(item => item.lineas || []).filter(link => link._dirty).length + deletedLineas.length;
  useEffect(() => { onDirtySummary?.({ hallazgos: dirtyHallazgos, tareas: dirtyTasks }); }, [dirtyHallazgos, dirtyTasks, onDirtySummary]);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);

  const updateItem = useCallback((item, changes) => setItems(current => current.map(row => keyFor(row) === keyFor(item) ? { ...row, ...changes, _dirty: true } : row)), []);
  const removeMeasurement = (item, measurement) => {
    updateItem(item, { mediciones: item.mediciones.filter(row => row !== measurement) });
    if (measurement.id) setDeletedMediciones(current => [...current, measurement]);
  };
  const removeLink = (item, link) => {
    updateItem(item, { lineas: item.lineas.filter(row => row !== link) });
    if (link.id) setDeletedLineas(current => [...current, link]);
  };
  const addHallazgo = familiaId => {
    const family = familias.find(row => row.id === familiaId);
    if (!family || !canEdit || readOnly) return;
    const next = normalize({ familia_trabajo_id: family.id, componente_parte: '', condicion: 'conforme', riesgo: 'monitorear', matriz_version: 1, accion_recomendada: 'monitorear', atribuible_a: 'desgaste_normal', incluir_en_informe: true, mediciones: [], lineas: [], _dirty: true });
    setItems(current => [...current, next]);
    setExpandedKeys(current => new Set([...current, keyFor(next)]));
  };
  const removeHallazgo = item => {
    setItems(current => current.filter(row => keyFor(row) !== keyFor(item)));
    if (item.id) setDeletedItems(current => [...current, item]);
  };

  const saveAll = useCallback(async () => {
    if (!canEdit || readOnly || saving || !diagnostico?.id) return;
    setSaving(true); onError?.('');
    const invalid = items.find(item => !item.familia_trabajo_id || !item.componente_parte?.trim() || !item.tipo_dano_codigo || !item.causa_probable_codigo || !item.condicion || !item.riesgo || !item.accion_recomendada || !item.atribuible_a || (item.prioridad_override && !item.prioridad_override_motivo?.trim()));
    if (invalid) {
      setSaving(false);
      onError?.('Completa componente, daño, causa, condición, riesgo, acción, atribución y motivo si hay override.');
      return;
    }
    const invalidMediciones = items.flatMap(item => (item.mediciones || []).map((measurement, index) => ({
      measurement,
      message: measurementValidationMessage(measurement, index + 1),
    }))).filter(row => row.message);
    const invalidMeasurementKeys = new Set(invalidMediciones.map(row => keyFor(row.measurement)));
    const persisted = new Map();
    let savedHallazgoCount = 0;
    let savingMeasurementNumber = 0;
    try {
      for (const item of deletedItems) await eliminarDiagnosticoHallazgo(empresaId, item.id);
      for (const item of items) {
        if (!item._dirty) { if (item.id) persisted.set(keyFor(item), item); continue; }
        const saved = item.id
          ? await actualizarDiagnosticoHallazgo(empresaId, diagnostico.id, item)
          : await crearDiagnosticoHallazgo(empresaId, diagnostico.id, item);
        persisted.set(keyFor(item), { ...item, ...saved, _dirty: false });
        savedHallazgoCount += 1;
      }
      for (const item of items) {
        const current = persisted.get(keyFor(item)) || item;
        if (!current.id) continue;
        for (const [index, measurement] of (current.mediciones || []).entries()) {
          if (!measurement._dirty) continue;
          if (invalidMeasurementKeys.has(keyFor(measurement))) continue;
          savingMeasurementNumber = index + 1;
          const saved = measurement.id
            ? await actualizarDiagnosticoMedicion(empresaId, current.id, measurement)
            : await crearDiagnosticoMedicion(empresaId, current.id, measurement);
          const next = { ...current, mediciones: current.mediciones.map(row => row === measurement ? { ...row, ...saved, _dirty: false, _new: false } : row) };
          persisted.set(keyFor(item), next);
        }
      }
      for (const measurement of deletedMediciones) await eliminarDiagnosticoMedicion(empresaId, measurement.id);
      for (const item of items) {
        const current = persisted.get(keyFor(item)) || item;
        if (!current.id) continue;
        for (const link of current.lineas || []) {
          if (!link._dirty) continue;
          const saved = await crearEnlaceDiagnosticoHallazgoLinea(empresaId, current.id, link.linea_id);
          const next = { ...current, lineas: current.lineas.map(row => row === link ? { ...row, ...saved, _dirty: false, _new: false } : row) };
          persisted.set(keyFor(item), next);
        }
      }
      for (const link of deletedLineas) await eliminarEnlaceDiagnosticoHallazgoLinea(empresaId, link.id);
      setItems([...persisted.values()].map(normalize));
      setDeletedItems([]); setDeletedMediciones([]); setDeletedLineas([]);
      if (invalidMediciones.length) {
        const firstInvalid = invalidMediciones[0];
        onError?.(`${firstInvalid.message} No se envió esa medición.`);
        onNotice?.(`Guardado parcial: se guardaron los hallazgos, pero no se guardaron ${invalidMediciones.length} medición${invalidMediciones.length === 1 ? '' : 'es'}.`);
      } else {
        onNotice?.('Hallazgos guardados.');
      }
    } catch (error) {
      setItems(items.filter(item => !deletedItems.some(deleted => keyFor(deleted) === keyFor(item))).map(item => persisted.has(keyFor(item)) ? normalize(persisted.get(keyFor(item))) : item));
      if (isPermissionError(error)) {
        onError?.('Este diagnóstico está emitido y es de solo lectura.');
      } else if (savingMeasurementNumber) {
        onError?.(`${savedHallazgoCount ? 'Guardado parcial: se guardaron los hallazgos, pero no se pudo guardar la medición.' : 'No se pudo guardar la medición.'} Revisa la medición ${savingMeasurementNumber}.`);
      } else {
        onError?.(`No se pudieron guardar todos los cambios: ${errorMessage(error)}`);
      }
    } finally { setSaving(false); }
  }, [canEdit, readOnly, saving, diagnostico?.id, empresaId, deletedItems, items, deletedMediciones, deletedLineas, onError, onNotice]);

  useEffect(() => { onRegisterSave?.(saveAll); return () => onRegisterSave?.(null); }, [onRegisterSave, saveAll]);

  const groups = useMemo(() => familias.filter(familia => lines.some(line => line.familia_trabajo_id === familia.id)).map(familia => ({ ...familia, items: items.filter(item => item.familia_trabajo_id === familia.id) })), [familias, lines, items]);
  const orphanItems = items.filter(item => !groups.some(group => group.id === item.familia_trabajo_id));
  const count = items.length;
  const taskCount = new Set(items.flatMap(item => item.lineas || []).map(link => link.linea_id)).size;
  const manHours = items.flatMap(item => item.lineas || []).reduce((total, link) => total + Number(lines.find(line => line.id === link.linea_id)?.horas_mano_obra || 0), 0);
  const machineHours = items.flatMap(item => item.lineas || []).reduce((total, link) => total + Number(lines.find(line => line.id === link.linea_id)?.horas_maquina || 0), 0);
  const priorities = items.reduce((result, item) => {
    const calculated = MATRIX[item.condicion]?.[item.riesgo] || item.prioridad_calculada;
    const priority = item.prioridad_override || item.prioridad_efectiva || calculated;
    if (priority) result[priority] = (result[priority] || 0) + 1;
    return result;
  }, {});
  const renderItem = item => {
    const calculated = MATRIX[item.condicion]?.[item.riesgo] || item.prioridad_calculada || '—';
    const effective = item.prioridad_override || item.prioridad_efectiva || calculated;
    const options = PRIORITIES.filter(priority => PRIORITY_RANK[priority] >= PRIORITY_RANK[calculated]);
    const selectedFamily = familias.find(familia => familia.id === item.familia_trabajo_id);
    const expanded = expandedKeys.has(keyFor(item));
    const toggle = () => setExpandedKeys(current => { const next = new Set(current); if (next.has(keyFor(item))) next.delete(keyFor(item)); else next.add(keyFor(item)); return next; });
    return <article className="hallazgos-card" key={keyFor(item)}>
      <div className="hallazgos-card-head"><button type="button" className="hallazgo-summary-toggle" aria-expanded={expanded} onClick={toggle}><span className={`badge condition-${item.condicion || 'sin-dato'}`}>{CONDITION_LABELS[item.condicion] || 'Sin condición'}</span><span className="hallazgo-summary-title"><span className="hallazgo-kicker">{selectedFamily?.nombre || 'Trabajo no disponible'}</span><strong>{item.componente_parte || 'Nuevo hallazgo'}</strong></span></button><div className="hallazgo-card-actions"><span className={`badge priority-${effective.toLowerCase()}`}>{effective} · {RISK_LABELS[item.riesgo] || 'Sin riesgo'}</span>{canEdit && <button type="button" className="btn btn-danger" onClick={() => removeHallazgo(item)}>Eliminar hallazgo</button>}</div></div>
      {expanded && <>
      <div className="hallazgo-grid">
        <div className="field"><label>Componente / parte *</label><input className="input" value={item.componente_parte || ''} disabled={!canEdit} onChange={event => updateItem(item, { componente_parte: event.target.value })} /></div>
        <SelectField label={CATALOG_LABELS.tipo_dano} value={item.tipo_dano_codigo} options={[...catalogs.tipo_dano, ...(item.tipo_dano_codigo && !catalogs.tipo_dano.some(row => row.codigo === item.tipo_dano_codigo) ? [{ codigo: item.tipo_dano_codigo, etiqueta: item.tipo_dano_codigo, inactivo: true }] : [])]} allowInactive onChange={value => updateItem(item, { tipo_dano_codigo: value })} disabled={!canEdit} />
        <SelectField label={CATALOG_LABELS.causa_probable} value={item.causa_probable_codigo} options={[...catalogs.causa_probable, ...(item.causa_probable_codigo && !catalogs.causa_probable.some(row => row.codigo === item.causa_probable_codigo) ? [{ codigo: item.causa_probable_codigo, etiqueta: item.causa_probable_codigo, inactivo: true }] : [])]} allowInactive onChange={value => updateItem(item, { causa_probable_codigo: value })} disabled={!canEdit} />
        <ChoiceButtons label="Condición del componente" value={item.condicion} options={Object.entries(CONDITION_LABELS)} disabled={!canEdit} onChange={value => updateItem(item, { condicion: value })} />
        <ChoiceButtons label="Riesgo si no se atiende" value={item.riesgo} options={Object.entries(RISK_LABELS)} disabled={!canEdit} onChange={value => updateItem(item, { riesgo: value })} />
        <div className="field hallazgo-priority-field"><label>PRIORIDAD AUTOMÁTICA</label><strong className={`hallazgo-priority-large priority-${calculated.toLowerCase()}`}>{calculated}</strong><span className="hint">Condición × riesgo. Se puede subir, con motivo.</span></div>
        <div className="field"><label>Override de prioridad</label><select className="select" value={item.prioridad_override || ''} disabled={!canEdit} onChange={event => updateItem(item, { prioridad_override: event.target.value || null })}><option value="">Sin override</option>{options.map(priority => <option key={priority} value={priority}>{priority}</option>)}</select></div>
        {item.prioridad_override && <div className="field"><label>Motivo del override *</label><input className="input" value={item.prioridad_override_motivo || ''} disabled={!canEdit} onChange={event => updateItem(item, { prioridad_override_motivo: event.target.value })} /></div>}
        <ChoiceButtons label="Acción recomendada" value={item.accion_recomendada} options={ACTIONS} disabled={!canEdit} onChange={value => updateItem(item, { accion_recomendada: value })} />
        <ChoiceButtons label="Atribuible a" hint="para garantía y cargo" value={item.atribuible_a} options={ATTRIBUTIONS} disabled={!canEdit} onChange={value => updateItem(item, { atribuible_a: value })} />
        <div className="field hallazgo-full"><label>Observación</label><textarea className="input" rows="3" value={item.observacion || ''} disabled={!canEdit} onChange={event => updateItem(item, { observacion: event.target.value })} /></div>
      </div>
      <label className="hallazgo-report-check"><input type="checkbox" checked={item.incluir_en_informe !== false} disabled={!canEdit} onChange={event => updateItem(item, { incluir_en_informe: event.target.checked })} /> Incluir en informe</label>
      <div className="hallazgo-matrix"><div><strong>PRIORIDAD AUTOMÁTICA · MATRIZ v{item.matriz_version || 1}</strong><span>La prioridad oficial se confirma en el servidor.</span></div><div className="hallazgo-matrix-grid"><span /><span>Monit.</span><span>Próx.</span><span>Antes</span><span>Inmed.</span>{Object.entries(CONDITION_LABELS).flatMap(([condition, conditionLabel]) => [<span key={`${condition}-label`}>{conditionLabel}</span>, ...Object.entries(RISK_LABELS).map(([risk], index) => <span key={`${condition}-${risk}`} className={`matrix-cell ${condition === item.condicion && risk === item.riesgo ? 'is-active' : ''}`}>{MATRIX[condition][risk]}</span>)])}</div>{item.prioridad_override && <small>Override: {item.prioridad_override} {item.prioridad_override_motivo ? `· ${item.prioridad_override_motivo}` : '· falta motivo'}</small>}</div>
      <MeasurementTable item={item} catalogs={catalogs} canEdit={canEdit} update={changes => updateItem(item, changes)} remove={measurement => removeMeasurement(item, measurement)} />
      <TaskLinks item={item} lines={lines} tipos={tipos} cargos={cargos} activos={activos} canEdit={canEdit} update={changes => updateItem(item, changes)} remove={link => removeLink(item, link)} />
      </>}
    </article>;
  };

  return <section className="hallazgos-panel" aria-label="Hallazgos del trabajo">
    <div className="hallazgos-summary"><div><span className="hallazgo-section-label">RESUMEN</span><span className="hallazgo-kicker">Diagnóstico técnico</span><h3>Hallazgos del trabajo</h3><span className="hint">Componente, condición y tareas relacionadas</span></div><div className="hallazgos-summary-metrics"><strong>{count} hallazgo{count === 1 ? '' : 's'}</strong><span>{taskCount} tarea{taskCount === 1 ? '' : 's'}</span><span>{manHours} h hombre</span><span>{machineHours} h máquina</span>{PRIORITIES.map(priority => <span key={priority} className={`badge priority-${priority.toLowerCase()}`}>{priority} · {priorities[priority] || 0}</span>)}</div></div>
    {catalogError && <div className="alert alert-error">No se cargaron los catálogos de hallazgos: {catalogError}</div>}
    {groups.map(group => <section className="hallazgos-work-section" key={group.id}><div className="hallazgos-work-head"><h3>{group.nombre}</h3>{canEdit && <button type="button" className="btn btn-secondary" onClick={() => addHallazgo(group.id)}>+ Agregar hallazgo</button>}</div>{group.items.length ? group.items.map(renderItem) : <p className="muted">Sin hallazgos para este trabajo.</p>}</section>)}
    {orphanItems.map(renderItem)}
    {!groups.length && !orphanItems.length && <div className="hallazgos-empty"><strong>No hay trabajos disponibles para agregar hallazgos.</strong><span>Agrega primero una línea de trabajo al diagnóstico.</span></div>}
    {saving && <div className="hallazgos-saving">Guardando hallazgos, mediciones y tareas relacionadas…</div>}
  </section>;
}
