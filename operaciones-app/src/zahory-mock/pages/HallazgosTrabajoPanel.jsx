import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/shell.jsx';
import {
  actualizarDiagnosticoHallazgo,
  actualizarDiagnosticoMedicion,
  crearDiagnosticoHallazgo,
  crearDiagnosticoMedicion,
  crearEnlaceDiagnosticoHallazgoLinea,
  guardarComponenteCatalogoHallazgo,
  listarComponentesDiagnostico,
  obtenerActivoRecepcionDiagnostico,
  reemplazarZonasHallazgo,
  crearTipoDanoDiagnostico,
  usuarioPuedeEditarMaestros,
  eliminarDiagnosticoHallazgo,
  eliminarDiagnosticoMedicion,
  eliminarEnlaceDiagnosticoHallazgoLinea,
  listarCatalogosHallazgos,
} from '../../services/diagnosticoTecnicoService.js';
import { listarFotosHallazgos, subirFotoHallazgo } from '../../services/diagnosticoHallazgoFotosService.js';
import HallazgoFotos from './HallazgoFotos.jsx';
import { asignarComponenteActivo, usuarioPuedeEditarRecepcionActivosCliente } from '../../services/recepcionesActivosClienteService.js';
import { getIncompleteHallazgos } from './hallazgosValidation.js';
import { buscarTiposDano, resultadoMedicion } from './dibujoHallazgoLogic.js';
import { agruparTiposDano, markupDibujoHallazgo } from './diagnosticoFase2Ui.js';

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
  mediciones: (row.mediciones || []).map(item => ({ ...item, _dirty: Boolean(item._dirty) })),
  lineas: (row.lineas || []).map(item => ({ ...item, _dirty: Boolean(item._dirty) })),
});

function SelectField({ label, value, options, disabled, onChange, allowInactive = false, requiredKey }) {
  return <div className="field">
    <label>{label}</label>
    <select data-required-field={requiredKey} className="select" aria-label={label} value={value || ''} disabled={disabled} onChange={event => onChange(event.target.value || null)}>
      <option value="">Seleccionar...</option>
      {options.map(option => <option key={option.codigo} value={option.codigo}>{option.etiqueta}{allowInactive && option.inactivo ? ' (inactivo)' : ''}</option>)}
    </select>
  </div>;
}

function ChoiceButtons({ label, value, options, disabled, onChange, hint, requiredKey }) {
  const danger = label === 'Condición del componente' && ['falla_funcional', 'fuera_de_tolerancia'].includes(value);
  const layoutClass = label === 'Acción recomendada' ? ' hallazgo-action-field' : '';
  return <div className={`field hallazgo-choice-field${layoutClass}`}>
    <label>{label}{hint && <span className="hallazgo-label-note"> · {hint}</span>}</label>
    <div className="hallazgo-choice-buttons">{options.map(([code, text], index) => <button key={code} data-required-field={index === 0 ? requiredKey : undefined} type="button" className={`${value === code ? 'hallazgo-choice is-selected' : 'hallazgo-choice'}${danger && value === code ? ' is-danger' : ''}`} disabled={disabled} onClick={() => onChange(code)}>{text}</button>)}</div>
  </div>;
}

function MeasurementTable({ item, catalogs, canEdit, update, remove }) {
  const add = () => update({ mediciones: [...(item.mediciones || []), emptyMeasurement()] });
  const patch = (measurement, changes) => update({ mediciones: (item.mediciones || []).map(row => row === measurement ? { ...row, ...changes, _dirty: true } : row) });
  return <section className="hallazgo-section hallazgo-measurements">
    <div className="hallazgo-section-head"><div><h4>Mediciones</h4><span className="hint">El resultado sugiere la condición; el técnico la confirma.</span></div>{canEdit && <button type="button" className="btn btn-secondary" onClick={add}>+ Medición</button>}</div>
    {!item.mediciones?.length ? <p className="muted">Sin mediciones.</p> : <div className="table-wrap"><table className="table hallazgo-measurement-table"><thead><tr><th>Parámetro</th><th>Unidad</th><th>Nominal</th><th>Mín.</th><th>Máx.</th><th>Medido</th><th>Resultado</th><th>Sugerencia</th><th /></tr></thead><tbody>
      {item.mediciones.map(measurement => { const result = measurement.medida_id ? resultadoMedicion(measurement) : null; return <tr key={measurement.id || measurement._key}>
        <td><input className="input" value={measurement.parametro || ''} disabled={!canEdit} onChange={event => patch(measurement, { parametro: event.target.value })} />{measurement.medida_id && <small className="dx-measure-linked">Medida de catálogo{measurement.cota ? ` · cota ${measurement.cota}` : ''}</small>}{measurement.referencia && <details className="dx-measure-reference"><summary>Referencia típica</summary><p>{measurement.referencia}</p></details>}</td>
        <td><select className="select" value={measurement.unidad || ''} disabled={!canEdit} onChange={event => patch(measurement, { unidad: event.target.value })}><option value="">—</option>{(catalogs.unidad_medicion || []).map(option => <option key={option.codigo} value={option.codigo}>{option.etiqueta}</option>)}</select></td>
        {['nominal', 'minimo', 'maximo', 'medido'].map(field => <td key={field}><input className="input" type="number" step="any" value={measurement[field] ?? ''} disabled={!canEdit} onChange={event => patch(measurement, { [field]: event.target.value })} /></td>)}
        <td><span className={`badge ${result === 'fuera' || measurement.resultado_calculado === 'fuera_de_rango' ? 'priority-p1' : 'priority-p4'}`}>{result === 'fuera' ? 'Fuera de tolerancia' : result === 'dentro' ? 'Dentro de rango' : RESULT_LABELS[measurement.resultado_calculado] || 'Pendiente'}</span></td>
        <td><div className="hallazgo-suggestion-cell"><span className="badge slate">{measurement.condicion_sugerida ? CONDITION_LABELS[measurement.condicion_sugerida] || measurement.condicion_sugerida : 'Pendiente'}</span>{canEdit && measurement.condicion_sugerida && measurement.condicion_sugerida !== item.condicion && <button type="button" className="btn btn-ghost" onClick={() => update({ condicion: measurement.condicion_sugerida })}>Aplicar sugerencia</button>}</div></td>
        <td>{canEdit && <button type="button" className="btn btn-ghost" aria-label="Eliminar medición" onClick={() => remove(measurement)}>Eliminar</button>}</td>
      </tr>; })}
    </tbody></table></div>}
  </section>;
}

function ObservationField({ item, disabled, onChange }) {
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState('');
  useEffect(() => {
    setSupported(Boolean(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)));
    return () => recognitionRef.current?.stop?.();
  }, []);
  const stop = () => {
    recognitionRef.current?.stop?.();
    setListening(false);
  };
  const toggleDictation = () => {
    if (listening) { stop(); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setSupported(false); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'es-PE';
    recognition.interimResults = true;
    recognition.continuous = true;
    let insertAt = textareaRef.current?.selectionStart ?? String(item.observacion || '').length;
    let triedFallback = false;
    recognition.onstart = () => { setListening(true); setSpeechMessage(''); };
    recognition.onresult = event => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalText += phrase;
        else interimText += phrase;
      }
      if (finalText) {
        const current = textareaRef.current?.value ?? String(item.observacion || '');
        const separator = insertAt > 0 && !/\s$/.test(current.slice(0, insertAt)) ? ' ' : '';
        const next = `${current.slice(0, insertAt)}${separator}${finalText}${current.slice(insertAt)}`.slice(0, 1000);
        insertAt = Math.min(next.length, insertAt + separator.length + finalText.length);
        onChange(next);
        requestAnimationFrame(() => { textareaRef.current?.focus({ preventScroll: true }); textareaRef.current?.setSelectionRange(insertAt, insertAt); });
      }
      setSpeechMessage(interimText ? `Escuchando: ${interimText}` : '');
    };
    recognition.onerror = event => {
      if (event.error === 'language-not-supported' && !triedFallback) {
        triedFallback = true;
        recognition.lang = 'es-ES';
        try { recognition.start(); return; } catch { /* Se muestra el mensaje genérico abajo. */ }
      }
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Permiso de micrófono denegado. Habilita el micrófono en el navegador e inténtalo de nuevo.'
        : 'No se pudo iniciar el dictado. Revisa el micrófono e inténtalo de nuevo.';
      setSpeechMessage(message);
      setListening(false);
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    try { recognition.start(); }
    catch { setListening(false); setSpeechMessage('No se pudo iniciar el dictado. Revisa el micrófono e inténtalo de nuevo.'); }
  };
  return <div className="field hallazgo-observation-field">
    <label htmlFor={`hallazgo-observaciones-${item._key}`}>Observaciones</label>
    <textarea ref={textareaRef} id={`hallazgo-observaciones-${item._key}`} className="input" rows={3} maxLength={1000} value={item.observacion || ''} disabled={disabled} onChange={event => onChange(event.target.value)} onBlur={stop} />
    <div className="hallazgo-observation-tools">
      {supported && <button type="button" className={`hallazgo-dictation-button${listening ? ' is-listening' : ''}`} aria-label="Dictar observaciones" aria-pressed={listening} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={toggleDictation}><Icon name="mic" size={16} />{listening ? 'Detener dictado' : 'Dictar'}</button>}
      {!supported && <span className="hint">Tu navegador no admite dictado; usa el dictado del sistema (Windows: tecla Windows + H)</span>}
      {speechMessage && <span role="status">{speechMessage}</span>}
    </div>
  </div>;
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
    {!item.lineas?.length ? <p className="muted">Sin tareas relacionadas.</p> : <div className="table-wrap"><table className="table hallazgo-task-table"><thead><tr><th>Tarea</th><th>Cargo · mano de obra</th><th>H-hombre</th><th>Activo · máquina</th><th>H-máquina</th><th>Materiales</th><th /></tr></thead><tbody>{item.lineas.map(link => { const line = lines.find(candidate => candidate.id === link.linea_id); const task = tipos.find(tipo => tipo.id === line?.tarea_id); const cargo = cargos.find(row => row.id === line?.cargo_id); const activo = activos.find(row => row.id === line?.activo_id); const materials = line?.materiales || []; return <tr key={link.id || link._key}><td><strong>{task?.nombre || line?.tarea_id || 'Tarea no disponible'}</strong></td><td>{cargo?.nombre || 'Sin cargo'}</td><td>{line?.horas_mano_obra || 0}</td><td>{activo?.nombre || activo?.codigo || line?.activo_id || 'Sin máquina'}</td><td>{line?.horas_maquina || 0}</td><td>{materials.length ? <ul className="hallazgo-linked-materials">{materials.map(material => <li key={material.id || material._key}>{material.descripcion || material.nombre || 'Material'} · {material.cantidad ?? '—'} {material.unidad || ''}</li>)}</ul> : 'Sin repuestos en las tareas ligadas'}</td><td>{canEdit && <button type="button" className="btn btn-ghost" aria-label="Quitar tarea" onClick={() => remove(link)}>Quitar</button>}</td></tr>; })}</tbody></table></div>}
  </section>;
}

function ComponentField({ item, componentType, components, disabled, onSelect, onTextChange }) {
  return <div className="field dx-hallazgo-component">
    <label>{componentType === 'maquinaria_completa' ? 'Componente o parte *' : 'Tipo de componente *'}</label>
    <select data-required-field="component" className="select" value={item.componente_catalogo_id || ''} disabled={disabled} onChange={event => onSelect(event.target.value)}>
      <option value="">Seleccionar componente…</option>
      {components.map(component => <option key={component.id} value={component.id}>{component.nombre}</option>)}
      <option value="otro">Otro · texto libre</option>
    </select>
    {!item.componente_catalogo_id && item.componente_parte && <input className="input" aria-label="Componente o parte" value={item.componente_parte === 'Otro' ? '' : item.componente_parte} disabled={disabled} onChange={event => onTextChange(event.target.value)} placeholder="Describe el componente" />}
  </div>;
}

function DibujoHallazgoVista({ component, markup, onZone, disabled, onVisibilityChange }) {
  const drawingRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const show = () => drawingRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    window.addEventListener('dx-show-hallazgo-drawing', show);
    return () => window.removeEventListener('dx-show-hallazgo-drawing', show);
  }, []);
  useEffect(() => {
    const node = drawingRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => { setVisible(entry.isIntersecting); onVisibilityChange?.(entry.isIntersecting); }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [component?.id, markup]);
  const image = <div className="dx-drawing-canvas" role="group" aria-label={`Dibujo de ${component?.nombre}`} dangerouslySetInnerHTML={{ __html: markup }} onClick={event => { if (!disabled) onZone(event); if (sheetOpen) setSheetOpen(false); }} />;
  return <>
    <div ref={drawingRef}>{image}</div>
    {!visible && <button type="button" className="dx-floating-drawing" onClick={() => setSheetOpen(true)}>Ver dibujo</button>}
    {sheetOpen && <div className="dx-drawing-sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSheetOpen(false); }}><section className="dx-drawing-sheet" role="dialog" aria-modal="true" aria-label={`Dibujo de ${component?.nombre}`}><header><strong>Dibujo · {component?.nombre}</strong><button type="button" aria-label="Cerrar dibujo" onClick={() => setSheetOpen(false)}>×</button></header>{image}</section></div>}
  </>;
}

export function HallazgosTrabajoPanel({ empresaId, diagnostico, lines = [], familias = [], tipos = [], cargos = [], activos = [], extraFamilyIds = [], onExtraFamilyIdsChange, onCreateFamily, onRemoveFamilyLines, canEdit, readOnly, onRegisterSave, onRegisterGoToIncomplete, onRegisterAddHallazgo, onRegisterAddOtro, onRegisterBackToList, onDirtyChange, onDirtySummary, onSavingChange, onError, onNotice, onFotosChange, onItemsChange, onViewChange, onDrawingVisibilityChange }) {
  const [items, setItems] = useState(() => (diagnostico?.hallazgos || []).map(normalize));
  const [deletedItems, setDeletedItems] = useState([]);
  const [deletedMediciones, setDeletedMediciones] = useState([]);
  const [deletedLineas, setDeletedLineas] = useState([]);
  const [catalogs, setCatalogs] = useState({ tipo_dano: [], causa_probable: [], unidad_medicion: [] });
  const [catalogError, setCatalogError] = useState('');
  const [componentes, setComponentes] = useState([]);
  const [activoRecepcion, setActivoRecepcion] = useState(null);
  const [busquedaDano, setBusquedaDano] = useState('');
  const [tipoDanoAbierto, setTipoDanoAbierto] = useState(null);
  const [puedeEditarMaestros, setPuedeEditarMaestros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [familyToAdd, setFamilyToAdd] = useState('');
  const [newFamilyName, setNewFamilyName] = useState('');
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [createFamilyError, setCreateFamilyError] = useState('');
  const [sessionFamilyIds, setSessionFamilyIds] = useState([]);
  const [fotosPorHallazgo, setFotosPorHallazgo] = useState({});
  const [fotosPendientes, setFotosPendientes] = useState([]);
  const fotosPendientesRef = useRef([]);
  const [fotosLoadError, setFotosLoadError] = useState('');
  const fotosMapRef = useRef({});
  const fotosChangeRef = useRef(onFotosChange);
  const itemsChangeRef = useRef(onItemsChange);
  fotosChangeRef.current = onFotosChange;
  itemsChangeRef.current = onItemsChange;
  const groupHeaderRefs = useRef(new Map());
  const itemCardRefs = useRef(new Map());
  const pendingGroupFocus = useRef(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState(null);
  const [pendingDeleteFamilyId, setPendingDeleteFamilyId] = useState(null);
  const [view, setView] = useState('lista');
  const [activeKey, setActiveKey] = useState(null);
  const [corregirTipo, setCorregirTipo] = useState(false);
  const [tipoActivoGuardando, setTipoActivoGuardando] = useState(false);
  const [permisoEditarRecepcion, setPermisoEditarRecepcion] = useState(false);
  const [componentePorAsignar, setComponentePorAsignar] = useState('');

  const changeView = useCallback((nextView, itemKey = null) => {
    setView(nextView);
    if (itemKey) setActiveKey(itemKey);
    onViewChange?.(nextView, itemKey);
    if (nextView === 'editor' && typeof window !== 'undefined') {
      const scrollTop = () => {
        const workCard = typeof document !== 'undefined' ? document.querySelector?.('.dx-work-card') : null;
        if (workCard?.scrollTo) workCard.scrollTo({ top: 0, behavior: 'smooth' });
        else window.scrollTo?.({ top: 0, behavior: 'smooth' });
      };
      if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(scrollTop);
      else scrollTop();
    }
  }, [onViewChange]);

  const updatePendingFotos = next => {
    const urlsToKeep = new Set(next.map(row => row.previewUrl));
    fotosPendientesRef.current.forEach(row => { if (!urlsToKeep.has(row.previewUrl)) URL.revokeObjectURL(row.previewUrl); });
    fotosPendientesRef.current = next;
    setFotosPendientes(next);
  };

  const changePendingForHallazgo = (hallazgoKey, hallazgoFotos) => {
    const next = [...fotosPendientesRef.current.filter(row => row.hallazgoKey !== hallazgoKey), ...hallazgoFotos.map(row => ({ ...row, hallazgoKey }))];
    updatePendingFotos(next);
  };

  useEffect(() => {
    setItems((diagnostico?.hallazgos || []).map(normalize));
    setDeletedItems([]); setDeletedMediciones([]); setDeletedLineas([]);
    updatePendingFotos([]);
    setExpandedKeys(new Set((diagnostico?.hallazgos || []).slice(0, 1).map(row => row.id).filter(Boolean)));
  }, [diagnostico?.id]);

  useEffect(() => () => {
    fotosPendientesRef.current.forEach(row => URL.revokeObjectURL(row.previewUrl));
    fotosPendientesRef.current = [];
  }, []);

  const persistedHallazgoIds = items.map(item => item.id).filter(Boolean).sort().join('|');
  useEffect(() => {
    let active = true;
    const ids = persistedHallazgoIds ? persistedHallazgoIds.split('|') : [];
    if (!empresaId || !ids.length) {
      fotosMapRef.current = {}; setFotosPorHallazgo({}); setFotosLoadError(''); fotosChangeRef.current?.({});
      return undefined;
    }
    setFotosLoadError('');
    listarFotosHallazgos(empresaId, ids).then(rows => {
      if (!active) return;
      const map = {};
      ids.forEach(id => { map[id] = []; });
      rows.forEach(row => { (map[row.hallazgo_id] ||= []).push(row); });
      fotosMapRef.current = map; setFotosPorHallazgo(map); fotosChangeRef.current?.(map);
    }).catch(error => { if (active) setFotosLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [empresaId, persistedHallazgoIds]);

  const changeHallazgoFotos = (hallazgoId, fotos) => {
    const next = { ...fotosMapRef.current, [hallazgoId]: fotos };
    fotosMapRef.current = next; setFotosPorHallazgo(next); fotosChangeRef.current?.(next);
  };

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

  useEffect(() => {
    let active = true;
    if (!empresaId) return () => { active = false; };
    usuarioPuedeEditarRecepcionActivosCliente(empresaId).then(value => {
      if (active) setPermisoEditarRecepcion(value);
    }).catch(() => { if (active) setPermisoEditarRecepcion(false); });
    return () => { active = false; };
  }, [empresaId]);

  useEffect(() => {
    let active = true;
    if (!empresaId || !diagnostico?.id) return () => { active = false; };
    Promise.all([listarComponentesDiagnostico(empresaId, diagnostico.id), obtenerActivoRecepcionDiagnostico(empresaId, diagnostico.id)])
      .then(([rows, activo]) => { if (active) { setComponentes(rows || []); setActivoRecepcion(activo); } })
      .catch(error => { if (active) setCatalogError(errorMessage(error)); });
    return () => { active = false; };
  }, [empresaId, diagnostico?.id]);

  useEffect(() => {
    let active = true;
    if (!empresaId) return () => { active = false; };
    usuarioPuedeEditarMaestros(empresaId).then(value => { if (active) setPuedeEditarMaestros(value); }).catch(() => { if (active) setPuedeEditarMaestros(false); });
    return () => { active = false; };
  }, [empresaId]);

  const dirty = items.some(item => item._dirty || item.mediciones?.some(row => row._dirty) || item.lineas?.some(row => row._dirty)) || deletedItems.length > 0 || deletedMediciones.length > 0 || deletedLineas.length > 0 || fotosPendientes.length > 0;
  useEffect(() => { itemsChangeRef.current?.(items); }, [items]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const dirtyHallazgos = items.filter(item => item._dirty).length + deletedItems.length;
  const dirtyTasks = items.flatMap(item => item.lineas || []).filter(link => link._dirty).length + deletedLineas.length;
  const dirtyFotos = fotosPendientes.length;
  const dirtyChanges = dirtyHallazgos + dirtyTasks + items.flatMap(item => item.mediciones || []).filter(row => row._dirty).length + deletedMediciones.length + dirtyFotos;
  useEffect(() => { onDirtySummary?.({ hallazgos: dirtyHallazgos, tareas: dirtyTasks, fotos: dirtyFotos, cambios: dirtyChanges }); }, [dirtyHallazgos, dirtyTasks, dirtyFotos, dirtyChanges, onDirtySummary]);
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
  const addHallazgo = familyOrId => {
    const family = typeof familyOrId === 'object' ? familyOrId : familias.find(row => row.id === familyOrId);
    if (!family || !canEdit || readOnly) return;
    const inherited = activoRecepcion?.tipo_activo !== 'maquinaria_completa' ? componentes.find(row => row.id === activoRecepcion?.componente_catalogo_id) : null;
    const next = normalize({ familia_trabajo_id: family.id, componente_parte: inherited?.nombre || '', componente_catalogo_id: inherited?.id || null, condicion: 'conforme', riesgo: 'monitorear', matriz_version: 1, accion_recomendada: 'monitorear', atribuible_a: 'desgaste_normal', incluir_en_informe: true, mediciones: [], zonas: [], lineas: [], _dirty: true });
    setItems(current => [...current, next]);
    setExpandedKeys(current => new Set([...current, keyFor(next)]));
    changeView('editor', keyFor(next));
  };
  const addDamageSibling = item => {
    if (!canEdit || readOnly) return;
    const next = normalize({ familia_trabajo_id: item.familia_trabajo_id, componente_parte: item.componente_parte, componente_catalogo_id: item.componente_catalogo_id || null, condicion: 'conforme', riesgo: 'monitorear', matriz_version: 1, accion_recomendada: 'monitorear', atribuible_a: 'desgaste_normal', incluir_en_informe: true, mediciones: [], zonas: [], lineas: [], _dirty: true });
    setItems(current => [...current, next]);
    setExpandedKeys(current => new Set([...current, keyFor(next)]));
    changeView('editor', keyFor(next));
  };
  const createWork = async event => {
    event.preventDefault();
    const nombre = newFamilyName.trim();
    if (!nombre || !onCreateFamily || creatingFamily) return;
    setCreatingFamily(true); setCreateFamilyError('');
    try {
      const created = await onCreateFamily(nombre);
      setSessionFamilyIds(current => current.includes(created.id) ? current : [...current, created.id]);
      onExtraFamilyIdsChange?.(current => current.includes(created.id) ? current : [...current, created.id]);
      setCollapsedGroups(current => { const next = new Set(current); next.delete(created.id); return next; });
      setFamilyToAdd(''); setNewFamilyName('');
      addHallazgo(created);
    } catch (error) { setCreateFamilyError(error?.message || 'No se pudo crear el trabajo o componente.'); }
    finally { setCreatingFamily(false); }
  };
  const removeHallazgo = item => {
    updatePendingFotos(fotosPendientesRef.current.filter(row => row.hallazgoKey !== keyFor(item)));
    setItems(current => current.filter(row => keyFor(row) !== keyFor(item)));
    if (item.id) setDeletedItems(current => [...current, item]);
  };
  const removeEmptyFamily = group => {
    onRemoveFamilyLines?.(group.id);
    setSessionFamilyIds(current => current.filter(id => id !== group.id));
    onExtraFamilyIdsChange?.(current => current.filter(id => id !== group.id));
    setCollapsedGroups(current => { const next = new Set(current); next.delete(group.id); return next; });
    setPendingDeleteFamilyId(null);
  };

  const goToIncomplete = useCallback(() => {
    const first = getIncompleteHallazgos(items)[0];
    if (!first) return;
    const item = first.item;
    if (item.familia_trabajo_id) setCollapsedGroups(current => { const next = new Set(current); next.delete(item.familia_trabajo_id); return next; });
    setExpandedKeys(current => new Set([...current, keyFor(item)]));
    requestAnimationFrame(() => {
      const card = itemCardRefs.current.get(keyFor(item));
      card?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      const target = card?.querySelector?.(`[data-required-field="${first.missingFields[0]}"]`);
      ((target?.matches?.('input,select,button,textarea') ? target : target?.querySelector?.('input,select,button,textarea')) || card)?.focus?.({ preventScroll: true });
    });
  }, [items]);
  useEffect(() => { onRegisterGoToIncomplete?.(goToIncomplete); return () => onRegisterGoToIncomplete?.(null); }, [goToIncomplete, onRegisterGoToIncomplete]);

  const saveAll = useCallback(async () => {
    if (!canEdit || readOnly || saving || !diagnostico?.id) return;
    setSaving(true); onError?.('');
    const incomplete = getIncompleteHallazgos(items);
    if (incomplete.length) {
      setSaving(false);
      const message = `Hay ${incomplete.length} hallazgo${incomplete.length === 1 ? '' : 's'} incompleto${incomplete.length === 1 ? '' : 's'}. Complétalos o elimínalos.`;
      onError?.(message);
      return { ok: false, error: message };
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
        if (!current.id || !current.componente_catalogo_id) continue;
        const component = componentes.find(row => row.id === current.componente_catalogo_id);
        if (component && current._componentDirty) {
          const saved = await guardarComponenteCatalogoHallazgo(empresaId, diagnostico.id, current.id, component.id, component.nombre);
          persisted.set(keyFor(item), { ...current, ...saved, _componentDirty: false });
        }
        if (current._zonesDirty) {
          const zones = await reemplazarZonasHallazgo(empresaId, current.id, current.componente_catalogo_id, current.zonas || []);
          persisted.set(keyFor(item), { ...(persisted.get(keyFor(item)) || current), zonas, _zonesDirty: false });
        }
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
      const fotosConSubida = new Set();
      let fotosFallidas = 0;
      let primerErrorFoto = '';
      for (const item of items) {
        const current = persisted.get(keyFor(item)) || item;
        if (!current.id) continue;
        const pendientes = fotosPendientesRef.current.filter(row => row.hallazgoKey === keyFor(item));
        for (const pending of pendientes) {
          try {
            await subirFotoHallazgo({ empresaId, diagnosticoId: diagnostico.id, hallazgoId: current.id, archivo: pending.archivo, leyenda: '' });
            fotosConSubida.add(current.id);
            updatePendingFotos(fotosPendientesRef.current.filter(row => row.id !== pending.id));
          } catch (error) {
            fotosFallidas += 1;
            primerErrorFoto ||= errorMessage(error);
            updatePendingFotos(fotosPendientesRef.current.map(row => row.id === pending.id ? { ...row, error: errorMessage(error) } : row));
          }
        }
      }
      if (fotosConSubida.size) {
        try {
          const photos = await listarFotosHallazgos(empresaId, [...fotosConSubida]);
          const nextMap = { ...fotosMapRef.current };
          fotosConSubida.forEach(id => { nextMap[id] = photos.filter(row => row.hallazgo_id === id); });
          fotosMapRef.current = nextMap; setFotosPorHallazgo(nextMap); fotosChangeRef.current?.(nextMap);
        } catch (error) {
          onNotice?.(`Las fotos se subieron, pero no se pudo actualizar su vista previa: ${errorMessage(error)}`);
        }
      }
      setItems([...persisted.values()].map(normalize));
      setDeletedItems([]); setDeletedMediciones([]); setDeletedLineas([]);
      if (fotosFallidas) {
        const message = `${fotosFallidas === 1 ? 'No se pudo subir 1 foto' : `No se pudieron subir ${fotosFallidas} fotos`}${primerErrorFoto ? `: ${primerErrorFoto}` : '.'}`;
        onNotice?.(`Hallazgos guardados; ${fotosFallidas} foto${fotosFallidas === 1 ? '' : 's'} quedó${fotosFallidas === 1 ? '' : 'aron'} pendiente${fotosFallidas === 1 ? '' : 's'}.`);
        onError?.(message);
        return { ok: false, error: message };
      }
      if (invalidMediciones.length) {
        const firstInvalid = invalidMediciones[0];
      onError?.(`${firstInvalid.message} No se envió esa medición.`);
      onNotice?.(`Guardado parcial: se guardaron los hallazgos, pero no se guardaron ${invalidMediciones.length} medición${invalidMediciones.length === 1 ? '' : 'es'}.`);
      return { ok: false, error: `${firstInvalid.message} No se envió esa medición.` };
    } else {
      onNotice?.('Hallazgos guardados.');
      return { ok: true };
      }
    } catch (error) {
      setItems(items.filter(item => !deletedItems.some(deleted => keyFor(deleted) === keyFor(item))).map(item => persisted.has(keyFor(item)) ? normalize(persisted.get(keyFor(item))) : item));
      if (isPermissionError(error)) {
        const message = 'Este diagnóstico está emitido y es de solo lectura.';
        onError?.(message);
        return { ok: false, error: message };
      } else if (savingMeasurementNumber) {
        const message = `${savedHallazgoCount ? 'Guardado parcial: se guardaron los hallazgos, pero no se pudo guardar la medición.' : 'No se pudo guardar la medición.'} Revisa la medición ${savingMeasurementNumber}.`;
        onError?.(message);
        return { ok: false, error: message };
      } else {
        const message = `No se pudieron guardar todos los cambios: ${errorMessage(error)}`;
        onError?.(message);
        return { ok: false, error: message };
      }
    } finally { setSaving(false); }
  }, [canEdit, readOnly, saving, diagnostico?.id, empresaId, deletedItems, items, deletedMediciones, deletedLineas, onError, onNotice]);

  useEffect(() => { onRegisterSave?.(saveAll); return () => onRegisterSave?.(null); }, [onRegisterSave, saveAll]);

  const groups = useMemo(() => familias.filter(familia => lines.some(line => line.familia_trabajo_id === familia.id) || items.some(item => item.familia_trabajo_id === familia.id) || extraFamilyIds.includes(familia.id) || sessionFamilyIds.includes(familia.id)).map(familia => ({ ...familia, items: items.filter(item => item.familia_trabajo_id === familia.id), lines: lines.filter(line => line.familia_trabajo_id === familia.id) })), [familias, lines, items, extraFamilyIds, sessionFamilyIds]);
  useEffect(() => {
    onRegisterAddHallazgo?.(() => {
      if (groups.length === 1) addHallazgo(groups[0].id);
      else setFamilyToAdd('choose');
    });
    return () => onRegisterAddHallazgo?.(null);
  }, [onRegisterAddHallazgo, groups, addHallazgo]);
  useEffect(() => {
    onRegisterAddOtro?.(() => {
      const current = items.find(item => keyFor(item) === activeKey);
      if (current) addDamageSibling(current);
    });
    return () => onRegisterAddOtro?.(null);
  }, [onRegisterAddOtro, items, activeKey, addDamageSibling]);
  useEffect(() => {
    onRegisterBackToList?.(() => changeView('lista'));
    return () => onRegisterBackToList?.(null);
  }, [onRegisterBackToList, changeView]);
  const incompleteHallazgos = getIncompleteHallazgos(items);
  const incompleteKeys = new Set(incompleteHallazgos.map(row => keyFor(row.item)));
  const incompleteGroupIds = new Set(incompleteHallazgos.map(row => row.item.familia_trabajo_id).filter(Boolean));
  useEffect(() => {
    if (!incompleteGroupIds.size) return;
    setCollapsedGroups(current => {
      const next = new Set(current);
      incompleteGroupIds.forEach(id => next.delete(id));
      return next.size === current.size ? current : next;
    });
  }, [items]);
  useEffect(() => {
    if (!pendingGroupFocus.current) return;
    const header = groupHeaderRefs.current.get(pendingGroupFocus.current);
    if (header) {
      header.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      header.focus?.();
      pendingGroupFocus.current = null;
    }
  }, [groups]);
  const orphanItems = items.filter(item => !groups.some(group => group.id === item.familia_trabajo_id));
  const count = items.length;
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
    const selectedComponent = componentes.find(component => component.id === item.componente_catalogo_id);
    const inheritedComponent = activoRecepcion?.tipo_activo !== 'maquinaria_completa' && activoRecepcion?.componente_catalogo_id ? componentes.find(component => component.id === activoRecepcion.componente_catalogo_id) : null;
    const drawingSvg = selectedComponent?.svg || selectedComponent?.dibujo_svg || '';
    const damageOptions = buscarTiposDano(catalogs.tipo_dano, busquedaDano).items;
    const damageExact = buscarTiposDano(catalogs.tipo_dano, busquedaDano).exacta;
    const drawingMarkup = drawingSvg ? markupDibujoHallazgo(drawingSvg, item.zonas || []) : '';
    const expanded = expandedKeys.has(keyFor(item));
    const toggle = () => setExpandedKeys(current => { const next = new Set(current); if (next.has(keyFor(item))) next.delete(keyFor(item)); else next.add(keyFor(item)); return next; });
    const itemName = item.componente_parte?.trim() || 'sin nombre';
    const requestDelete = () => item.id ? setPendingDeleteKey(keyFor(item)) : removeHallazgo(item);
    const markDrawingZone = event => {
      const zone = event.target.closest?.('[data-z]');
      const zoneId = zone?.getAttribute('data-z');
      if (!zoneId) return;
      const definition = selectedComponent?.zonas?.find(row => row.id === zoneId);
      if ((item.zonas || []).some(row => (row.zona_id || row.id) === zoneId)) return;
      const nextZones = [...(item.zonas || []), { zona_id: zoneId, nombre: definition?.nombre, orden: (item.zonas || []).length + 1, nota: '' }];
      const additions = (definition?.medidas || []).filter(measure => !(item.mediciones || []).some(row => row.medida_id === measure.id)).map(measure => ({ _key: `med-${Date.now()}-${Math.random()}`, parametro: measure.nombre, unidad: 'mm', nominal: '', minimo: '', maximo: '', medido: '', zona_id: zoneId, medida_id: measure.id, cota: measure.cota, referencia: measure.referencia, _new: true, _dirty: true }));
      updateItem(item, { zonas: nextZones, _zonesDirty: true, mediciones: [...(item.mediciones || []), ...additions] });
    };
    return <article className={`hallazgos-card${view === 'editor' ? ' dx-hallazgo-editor-card' : ''}`} key={keyFor(item)} ref={node => { if (node) itemCardRefs.current.set(keyFor(item), node); else itemCardRefs.current.delete(keyFor(item)); }} tabIndex={-1}>
      <div className="hallazgos-card-head"><button type="button" className="hallazgo-summary-toggle" aria-expanded={expanded} onClick={toggle}><span className={`badge condition-${item.condicion || 'sin-dato'}`}>{CONDITION_LABELS[item.condicion] || 'Sin condición'}</span><span className="hallazgo-summary-title"><span className="hallazgo-kicker">{selectedFamily?.nombre || 'Trabajo no disponible'}</span><strong>{item.componente_parte || 'Nuevo hallazgo'}</strong></span></button><div className="hallazgo-card-actions">{incompleteKeys.has(keyFor(item)) && <span className="hallazgo-incomplete-badge">Incompleto</span>}<span className={`badge priority-${effective.toLowerCase()}`}>{effective} · {RISK_LABELS[item.riesgo] || 'Sin riesgo'}</span>{canEdit && <button type="button" className="dx-sibling-action" onClick={() => addDamageSibling(item)}>＋ Otro daño</button>}{canEdit && <button type="button" className="hallazgo-delete-button" aria-label={`Eliminar hallazgo ${itemName}`} title="Eliminar hallazgo" onClick={requestDelete}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg><span className="sr-only">Eliminar hallazgo</span></button>}</div></div>
      {pendingDeleteKey === keyFor(item) && <div className="hallazgo-delete-confirm" role="alertdialog" aria-label="Confirmar eliminación del hallazgo"><span>¿Eliminar este hallazgo? Se eliminarán también sus mediciones y fotos.</span><div><button type="button" className="hallazgo-delete-confirm-action" onClick={() => { removeHallazgo(item); setPendingDeleteKey(null); }}>Eliminar</button><button type="button" onClick={() => setPendingDeleteKey(null)}>Cancelar</button></div></div>}
      {view === 'editor' && keyFor(item) === activeKey && <>
      {activoRecepcion?.tipo_activo !== 'maquinaria_completa' && inheritedComponent ? (
        <div className="dx-component-lock"><span>Componente del activo</span><strong>{inheritedComponent.nombre}</strong><small>Heredado de {activoRecepcion.nombre || activoRecepcion.codigo || 'el activo recibido'} {permisoEditarRecepcion && <>· <button type="button" onClick={() => { setComponentePorAsignar(inheritedComponent.id); setCorregirTipo(true); }}>Corregir tipo</button></>}</small></div>
      ) : (
        <ComponentField item={item} componentType={activoRecepcion?.tipo_activo} components={componentes} disabled={!canEdit} onSelect={value => { const component = componentes.find(row => row.id === value); const linked = item.mediciones.filter(measure => measure.medida_id); setDeletedMediciones(current => [...current, ...linked.filter(measure => measure.id)]); updateItem(item, { componente_catalogo_id: component?.id || null, componente_parte: value === 'otro' ? 'Otro' : component?.nombre || '', zonas: [], mediciones: item.mediciones.filter(measure => !measure.medida_id), _componentDirty: true, _zonesDirty: true }); }} onTextChange={value => updateItem(item, { componente_parte: value, componente_catalogo_id: null })} />
      )}
      {corregirTipo && <div className="dx-component-correction-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCorregirTipo(false); }}><section className="dx-component-correction" role="dialog" aria-modal="true" aria-label="Corregir tipo"><h4>Corregir tipo de componente</h4><p>Actualiza el componente asignado al activo recibido.</p><label htmlFor="dx-componente-correcto">Tipo de componente</label><select id="dx-componente-correcto" className="select" value={componentePorAsignar} onChange={event => setComponentePorAsignar(event.target.value)}>{componentes.map(component => <option key={component.id} value={component.id}>{component.nombre}</option>)}</select><div><button type="button" className="btn btn-secondary" onClick={() => setCorregirTipo(false)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={tipoActivoGuardando || !componentePorAsignar} onClick={async () => { const component = componentes.find(row => row.id === componentePorAsignar); if (!component || !activoRecepcion?.id) return; setTipoActivoGuardando(true); try { await asignarComponenteActivo(empresaId, activoRecepcion.id, component.id); setActivoRecepcion(current => ({ ...current, tipo_activo: 'componente', componente_catalogo_id: component.id })); setItems(current => current.map(row => row.id === item.id || keyFor(row) === keyFor(item) ? { ...row, componente_catalogo_id: component.id, componente_parte: component.nombre, zonas: [], mediciones: (row.mediciones || []).filter(measure => !measure.medida_id), _dirty: true, _componentDirty: true, _zonesDirty: true } : row)); setCorregirTipo(false); onNotice?.('Tipo del activo corregido. El dibujo se actualizó.'); } catch (error) { onError?.(errorMessage(error)); } finally { setTipoActivoGuardando(false); } }}>{tipoActivoGuardando ? 'Guardando…' : 'Guardar tipo'}</button></div></section></div>}
      {drawingSvg && <section className="dx-hallazgo-drawing"><div className="dx-drawing-title"><div><span className="hallazgo-section-label">DIBUJO DEL COMPONENTE</span><h4>{selectedComponent?.nombre}</h4></div><small>Toca una zona dañada para marcarla</small></div><DibujoHallazgoVista component={selectedComponent} markup={drawingMarkup} onZone={markDrawingZone} disabled={!canEdit} onVisibilityChange={onDrawingVisibilityChange} />{(item.zonas || []).length > 0 && <div className="dx-zone-chips">{(item.zonas || []).map((zone, index) => <span key={zone.zona_id || zone.id}><b>{index + 1}</b>{selectedComponent.zonas?.find(row => row.id === (zone.zona_id || zone.id))?.nombre || zone.nombre}<input aria-label={`Nota del pin ${index + 1}`} value={zone.nota || ''} disabled={!canEdit} placeholder="Nota (opcional)" onChange={event => updateItem(item, { zonas: item.zonas.map(row => (row.zona_id || row.id) === (zone.zona_id || zone.id) ? { ...row, nota: event.target.value } : row), _zonesDirty: true })} /><button type="button" aria-label={`Quitar ${zone.nombre || 'zona'}`} disabled={!canEdit} onClick={() => { const zoneId = zone.zona_id || zone.id; setDeletedMediciones(current => [...current, ...item.mediciones.filter(measure => measure.zona_id === zoneId && measure.id)]); updateItem(item, { zonas: item.zonas.filter(row => (row.zona_id || row.id) !== zoneId).map((row, order) => ({ ...row, orden: order + 1 })), _zonesDirty: true, mediciones: item.mediciones.filter(measure => measure.zona_id !== zoneId) }); }}>×</button></span>)}</div>}</section>}
      <div className="hallazgo-grid">
        {!inheritedComponent && !item.componente_catalogo_id && <div className="field"><label>Componente / parte *</label><input data-required-field="component-text" className="input" aria-label="Componente / parte" value={item.componente_parte || ''} disabled={!canEdit} onChange={event => updateItem(item, { componente_parte: event.target.value })} /></div>}
        <div className="field dx-tipo-dano"><label>{CATALOG_LABELS.tipo_dano}</label><input data-required-field="damage" className="input" role="combobox" aria-expanded={tipoDanoAbierto === keyFor(item)} aria-label="Tipo de daño" value={tipoDanoAbierto === keyFor(item) ? busquedaDano : catalogs.tipo_dano.find(row => row.codigo === item.tipo_dano_codigo)?.etiqueta || ''} disabled={!canEdit} placeholder="Buscar tipo de daño…" onFocus={() => { setBusquedaDano(''); setTipoDanoAbierto(keyFor(item)); }} onChange={event => setBusquedaDano(event.target.value)} onBlur={() => window.setTimeout(() => setTipoDanoAbierto(null), 120)} />{tipoDanoAbierto === keyFor(item) && <div className="dx-tipo-dano-menu">{agruparTiposDano(damageOptions).map(group => <div key={group.id}><small>{group.label}</small>{group.items.map(option => <button type="button" key={`${group.id}-${option.codigo}`} onMouseDown={event => event.preventDefault()} onClick={() => { updateItem(item, { tipo_dano_codigo: option.codigo }); setTipoDanoAbierto(null); }}>{option.etiqueta}</button>)}</div>)}{!damageExact && busquedaDano.trim() && <p className="dx-tipo-dano-similar">Parecidos: {damageOptions.slice(0, 3).map(option => option.etiqueta).join(' · ') || 'sin coincidencias'}</p>}{!damageExact && canEdit && puedeEditarMaestros && busquedaDano.trim() && <button type="button" className="dx-tipo-dano-create" onMouseDown={event => event.preventDefault()} onClick={async () => { try { const result = await crearTipoDanoDiagnostico(empresaId, busquedaDano.trim()); const rows = result.catalog.filter(row => row.catalogo === 'tipo_dano'); setCatalogs(current => ({ ...current, tipo_dano: rows })); updateItem(item, { tipo_dano_codigo: result.valor.codigo }); setTipoDanoAbierto(null); } catch (error) { onError?.(errorMessage(error)); } }}>＋ Crear «{busquedaDano.trim()}»</button>}</div>}</div>
        <SelectField label={CATALOG_LABELS.causa_probable} requiredKey="cause" value={item.causa_probable_codigo} options={[...catalogs.causa_probable, ...(item.causa_probable_codigo && !catalogs.causa_probable.some(row => row.codigo === item.causa_probable_codigo) ? [{ codigo: item.causa_probable_codigo, etiqueta: item.causa_probable_codigo, inactivo: true }] : [])]} allowInactive onChange={value => updateItem(item, { causa_probable_codigo: value })} disabled={!canEdit} />
        <ChoiceButtons label="Condición del componente" requiredKey="condition" value={item.condicion} options={Object.entries(CONDITION_LABELS)} disabled={!canEdit} onChange={value => updateItem(item, { condicion: value })} />
        <ChoiceButtons label="Riesgo si no se atiende" requiredKey="risk" value={item.riesgo} options={Object.entries(RISK_LABELS)} disabled={!canEdit} onChange={value => updateItem(item, { riesgo: value })} />
        <div className="field hallazgo-priority-field"><label>PRIORIDAD AUTOMÁTICA</label><strong className={`hallazgo-priority-large priority-${calculated.toLowerCase()}`}>{calculated}</strong><span className="hint">Condición × riesgo. Se puede subir, con motivo.</span></div>
        <div className="field"><label>Override de prioridad</label><select className="select" value={item.prioridad_override || ''} disabled={!canEdit} onChange={event => updateItem(item, { prioridad_override: event.target.value || null })}><option value="">Sin override</option>{options.map(priority => <option key={priority} value={priority}>{priority}</option>)}</select></div>
        {item.prioridad_override && <div className="field"><label>Motivo del override *</label><input data-required-field="override_reason" className="input" value={item.prioridad_override_motivo || ''} disabled={!canEdit} onChange={event => updateItem(item, { prioridad_override_motivo: event.target.value })} /></div>}
        <ChoiceButtons label="Acción recomendada" requiredKey="action" value={item.accion_recomendada} options={ACTIONS} disabled={!canEdit} onChange={value => updateItem(item, { accion_recomendada: value })} />
        <ChoiceButtons label="Atribuible a" hint="para garantía y cargo" requiredKey="attribution" value={item.atribuible_a} options={ATTRIBUTIONS} disabled={!canEdit} onChange={value => updateItem(item, { atribuible_a: value })} />
        <ObservationField item={item} disabled={!canEdit} onChange={value => updateItem(item, { observacion: value.slice(0, 1000) })} />
      </div>
      <div className="hallazgo-matrix"><div><strong>PRIORIDAD AUTOMÁTICA · MATRIZ v{item.matriz_version || 1}</strong><span>La prioridad oficial se confirma en el servidor.</span></div><div className="hallazgo-matrix-grid"><span /><span>Monit.</span><span>Próx.</span><span>Antes</span><span>Inmed.</span>{Object.entries(CONDITION_LABELS).flatMap(([condition, conditionLabel]) => [<span key={`${condition}-label`}>{conditionLabel}</span>, ...Object.entries(RISK_LABELS).map(([risk], index) => <span key={`${condition}-${risk}`} className={`matrix-cell ${condition === item.condicion && risk === item.riesgo ? 'is-active' : ''}`}>{MATRIX[condition][risk]}</span>)])}</div>{item.prioridad_override && <small>Override: {item.prioridad_override} {item.prioridad_override_motivo ? `· ${item.prioridad_override_motivo}` : '· falta motivo'}</small>}</div>
      <MeasurementTable item={item} catalogs={catalogs} canEdit={canEdit} update={changes => updateItem(item, changes)} remove={measurement => removeMeasurement(item, measurement)} />
      <HallazgoFotos empresaId={empresaId} diagnosticoId={diagnostico?.id} hallazgo={item} fotos={fotosPorHallazgo[item.id] || []} fotosPendientes={fotosPendientes.filter(row => row.hallazgoKey === keyFor(item))} readOnly={readOnly} onFotosChange={fotos => changeHallazgoFotos(item.id, fotos)} onFotosPendientesChange={fotos => changePendingForHallazgo(keyFor(item), fotos)} />
      </>}
    </article>;
  };

  return <section className={`hallazgos-panel${view === 'editor' ? ' is-editor-view' : ' is-list-view'}`} aria-label="Hallazgos del trabajo">
    <div className="hallazgos-summary"><div><span className="hallazgo-section-label">RESUMEN</span><h3>Hallazgos del trabajo</h3></div><div className="hallazgos-summary-metrics"><strong>{count} hallazgo{count === 1 ? '' : 's'}</strong>{PRIORITIES.map(priority => <span key={priority} className={`badge priority-${priority.toLowerCase()}`}>{priority} · {priorities[priority] || 0}</span>)}</div></div>
    {incompleteHallazgos.length > 0 && <div className="hallazgos-incomplete-notice" role="status"><span>Hay {incompleteHallazgos.length} hallazgo{incompleteHallazgos.length === 1 ? '' : 's'} incompleto{incompleteHallazgos.length === 1 ? '' : 's'}. Complétalos o elimínalos.</span><button type="button" onClick={goToIncomplete}>Ir al hallazgo</button></div>}
    {catalogError && <div className="alert alert-error">No se cargaron los catálogos de hallazgos: {catalogError}</div>}
    {fotosLoadError && <div className="dx-foto-error" role="status">No se pudieron cargar las fotos de los hallazgos: {fotosLoadError}</div>}
    {view === 'lista' && groups.map(group => <section className="dx-findings-list-group" key={group.id} aria-label={`Hallazgos de ${group.nombre}`}><h4>{group.nombre}</h4>{group.items.map(item => { const component = componentes.find(row => row.id === item.componente_catalogo_id); const svg = component?.svg || component?.dibujo_svg || ''; const mini = svg ? markupDibujoHallazgo(svg, item.zonas || []) : ''; return <article className="dx-finding-list-row" key={keyFor(item)}><button type="button" className="dx-finding-list-open" onClick={() => changeView('editor', keyFor(item))}><span className="dx-finding-thumbnail" aria-hidden="true">{mini ? <span dangerouslySetInnerHTML={{ __html: mini }} /> : <span className="dx-finding-thumbnail-empty">⌁</span>}</span><span className="dx-finding-list-name"><strong>{item.componente_parte || 'Nuevo hallazgo'}</strong><small>{catalogs.tipo_dano.find(row => row.codigo === item.tipo_dano_codigo)?.etiqueta || 'Tipo de daño pendiente'} · {CONDITION_LABELS[item.condicion] || 'Sin condición'}</small></span></button><button type="button" className="btn btn-secondary" onClick={() => changeView('editor', keyFor(item))}>Editar</button>{canEdit && <button type="button" className="btn btn-secondary" onClick={() => addDamageSibling(item)}>＋ Otro daño</button>}</article>; })}{canEdit && <button type="button" className="dx-list-add-damage" onClick={() => addHallazgo(group.id)}>＋ Otro daño</button>}</section>)}
    {view === 'lista' && orphanItems.length > 0 && <section className="dx-findings-list-group"><h4>Sin trabajo asignado</h4>{orphanItems.map(item => <article className="dx-finding-list-row" key={keyFor(item)}><strong>{item.componente_parte || 'Nuevo hallazgo'}</strong><button type="button" className="btn btn-secondary" onClick={() => changeView('editor', keyFor(item))}>Editar</button></article>)}</section>}
    {view === 'editor' && (() => { const current = items.find(item => keyFor(item) === activeKey); return current ? renderItem(current) : <div className="alert alert-warning">El hallazgo seleccionado ya no está disponible.</div>; })()}
    {view === 'lista' && canEdit && !readOnly && <div className="hallazgos-add-family">
      {familyToAdd ? <div className="hallazgos-add-work-options"><select autoFocus className="select" aria-label="Elegir trabajo o componente" value="" onChange={event => { const id = event.target.value; if (!id) return; pendingGroupFocus.current = id; const existing = groups.find(group => group.id === id); if (existing) setCollapsedGroups(current => { const next = new Set(current); next.delete(id); return next; }); else { setSessionFamilyIds(current => current.includes(id) ? current : [...current, id]); onExtraFamilyIdsChange?.(current => current.includes(id) ? current : [...current, id]); setCollapsedGroups(current => { const next = new Set(current); next.delete(id); return next; }); } setFamilyToAdd(''); }}><option value="">Elegir existente...</option>{familias.map(familia => <option value={familia.id} key={familia.id}>{familia.nombre}</option>)}</select>
        <form onSubmit={createWork}><input className="input" aria-label="Crear trabajo o componente" value={newFamilyName} onChange={event => setNewFamilyName(event.target.value)} placeholder="Nombre del nuevo trabajo o componente" /><button type="submit" disabled={creatingFamily || !newFamilyName.trim() || !onCreateFamily}>{creatingFamily ? 'Creando\u2026' : '+ Crear trabajo o componente'}</button></form>
        <button type="button" className="hallazgos-add-cancel" onClick={() => { setFamilyToAdd(''); setCreateFamilyError(''); }}>Cancelar</button>{createFamilyError && <span role="alert">{createFamilyError}</span>}
      </div> : <button type="button" onClick={() => setFamilyToAdd('choose')}>+ Agregar trabajo o componente</button>}
      <small>Cada hallazgo va dentro de un trabajo o componente. Si no est&#xE1; en la lista, lo creas ah&#xED; mismo.</small>
    </div>}
    {!groups.length && !orphanItems.length && <div className="hallazgos-empty"><strong>A&#xFA;n no hay hallazgos.</strong><span>Agrega un trabajo o componente para registrar hallazgos.</span></div>}
    {saving && <div className="hallazgos-saving">Guardando hallazgos, mediciones y tareas relacionadas…</div>}
  </section>;
}
