import React, { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../components/shell.jsx';
import { ModalShell } from '../components/ModalShell.jsx';
import { HallazgosTrabajoPanel } from './HallazgosTrabajoPanel.jsx';
import { getIncompleteHallazgos } from './hallazgosValidation.js';
import { DiagnosticoEstadoPanel } from './DiagnosticoEstadoPanel.jsx';
import { DiagnosticoLineasTabla } from './DiagnosticoLineasTabla.jsx';
import { DiagnosticoAgregarTareasPanel } from './DiagnosticoAgregarTareasPanel.jsx';
import { DiagnosticoInformePanel } from './DiagnosticoInformePanel.jsx';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import {
  buscarOCrearFamiliaTrabajo,
  buscarOCrearTipoServicioInterno,
  crearDiagnosticoTecnico,
  emitirDiagnosticoTecnico,
  eliminarDiagnosticoLinea,
  guardarDiagnosticoLinea,
  listarActivosPropios,
  listarCargosEmpresa,
  listarCatalogosHallazgos,
  listarComponentesDiagnostico,
  listarCatalogoComponentesParaRecepcion,
  listarTecnicosDiagnostico,
  obtenerEquipoParaDiagnostico,
  asignarComponenteCatalogoActivo,
  actualizarDatosInicialesDiagnostico,
  listarDiagnosticosTecnicos,
  listarFamiliasTrabajo,
  listarPlantillasActividad,
  listarReferenciasDiagnostico,
  listarTiposServicioInterno,
  obtenerDiagnosticoLinea,
  obtenerDiagnosticoTecnico,
  guardarResumenDiagnostico,
  resolverReferenciasDiagnostico,
  sincronizarMaterialesLinea,
  usuarioPuedeDiagnostico,
} from '../../services/diagnosticoTecnicoService.js';
import { generarConclusionIA, obtenerOCrearBorrador, usuarioPuedeInforme } from '../../services/diagnosticoInformeService.js';
import { validarBorradorDiagnostico } from '../../services/validarBorradorDiagnostico.js';
import { sanitizarSvgCatalogo } from './dibujoHallazgoLogic.js';

const EMPTY_FORM = { tipo: '', referencia: null };
const EMPTY_LINE = {
  id: null,
  familia_trabajo_id: null,
  actividad_id: null,
  tarea_id: null,
  hallazgo: '',
  cargo_id: null,
  horas_mano_obra: 0,
  activo_id: null,
  horas_maquina: 0,
  orden: 0,
  materiales: [],
};

const errorMessage = error => error?.message || 'No se pudo completar la operación.';
const referenceLabel = reference => reference?.numero || 'Referencia no disponible';
const typeLabel = tipo => tipo === 'fabricacion' ? 'Fabricación' : 'Mantenimiento';
const statusLabel = estado => estado === 'emitido' ? 'Emitido' : 'Borrador';
const statusClass = estado => estado === 'emitido' ? 'badge green' : 'badge orange';
const materialKey = material => material.id || material._key;
const lineKey = line => line._key || line.id;
const normalizedText = value => String(value || '').trim().toLocaleLowerCase();
const normalizeListText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
const formatListDate = value => {
  if (!value) return { day: '—', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '—', time: '' };
  const today = new Date();
  const yesterday = new Date(today);
  today.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const dateDay = new Date(date);
  dateDay.setHours(0, 0, 0, 0);
  const day = dateDay.getTime() === today.getTime()
    ? 'Hoy'
    : dateDay.getTime() === yesterday.getTime()
      ? 'Ayer'
      : (() => {
        const parts = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric' }).formatToParts(date);
        const weekday = parts.find(part => part.type === 'weekday')?.value.replace(/[.,]/g, '') || '';
        const dateNumber = parts.find(part => part.type === 'day')?.value || '';
        const month = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][date.getMonth()];
        return `${weekday} ${dateNumber} ${month}`.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase());
      })();
  return { day, time: new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' }).format(date) };
};
const createName = value => String(value || '').trim().split(/\s+·\s+/)[0].trim();
const eventIsInside = (event, root) => {
  if (!root) return false;
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  return path.includes(root) || root.contains?.(event?.target);
};
const materialValidationError = material => {
  if (!String(material.descripcion || '').trim()) return 'La descripción es obligatoria.';
  const cantidad = Number(material.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 'La cantidad debe ser mayor que 0.';
  return '';
};
const SLOW_SAVE_WARNING = 'El guardado est\u00e1 tardando m\u00e1s de lo normal. No pulses Guardar de nuevo; cierra y reabre el diagn\u00f3stico para comprobar si la l\u00ednea se guard\u00f3.';
const dispatchDiagnosticoWorkMode = active => {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.dxDiagnosticoWorkMode = active ? 'true' : 'false';
  const detail = { active };
  const event = typeof CustomEvent === 'function' ? new CustomEvent('dx-diagnostico-work-mode', { detail }) : { type: 'dx-diagnostico-work-mode', detail };
  window.dispatchEvent(event);
};
const observeSaveStep = (step, operation, onSlow) => {
  const startedAt = Date.now();
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) onSlow(step, Date.now() - startedAt);
  }, 10000);
  return Promise.resolve()
    .then(operation)
    .finally(() => {
      settled = true;
      clearTimeout(timer);
    });
};
const prepararDetalle = detail => ({
  ...detail,
  _resumenGuardado: detail.resumen_diagnostico || '',
  _origenResumenGuardado: detail.resumen_origen || 'auto',
  lineas: (detail.lineas || []).map(line => ({
    ...line,
    _materialesIniciales: (line.materiales || []).map(material => ({ ...material })),
  })),
});

async function resolverReferenciasPorTipo(empresaId, tipo, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const resolved = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    resolved.push(...await resolverReferenciasDiagnostico(empresaId, tipo, uniqueIds.slice(offset, offset + 200)));
  }
  return resolved;
}

async function adjuntarReferencias(empresaId, rows) {
  const idsPorTipo = {
    mantenimiento: [...new Set(rows.filter(row => row.tipo === 'mantenimiento').map(row => row.recepcion_id).filter(Boolean))],
    fabricacion: [...new Set(rows.filter(row => row.tipo === 'fabricacion').map(row => row.oportunidad_id).filter(Boolean))],
  };
  const [mantenimiento, fabricacion] = await Promise.all([
    resolverReferenciasPorTipo(empresaId, 'mantenimiento', idsPorTipo.mantenimiento),
    resolverReferenciasPorTipo(empresaId, 'fabricacion', idsPorTipo.fabricacion),
  ]);
  const referencias = {
    mantenimiento: new Map(mantenimiento.map(reference => [reference.id, reference])),
    fabricacion: new Map(fabricacion.map(reference => [reference.id, reference])),
  };
  return rows.map(row => ({
    ...row,
    referencia: referencias[row.tipo].get(row.tipo === 'fabricacion' ? row.oportunidad_id : row.recepcion_id) || null,
  }));
}

function AccessState({ loading, title, error }) {
  return (
    <main className="ops-page" style={{ padding: 24 }}>
      <div className="card" style={{ maxWidth: 680, margin: '48px auto', textAlign: 'center', padding: 32 }}>
        {loading ? <>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <h2>Verificando permisos</h2>
        </> : <>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <h2>{title || 'No tienes acceso a esta pantalla'}</h2>
          {error && <div className="alert alert-error" style={{ textAlign: 'left', marginTop: 16 }}>{error}</div>}
        </>}
      </div>
    </main>
  );
}

function useComboboxMenuPosition(open, rootRef, onViewportChange) {
  const [menuStyle, setMenuStyle] = useState({});
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined' || typeof window.innerHeight !== 'number') {
      setMenuStyle({});
      return undefined;
    }
    const updatePosition = () => {
      const input = rootRef.current?.querySelector?.('input[role="combobox"]');
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const gap = 8;
      const maxHeight = 220;
      const below = Math.max(0, window.innerHeight - rect.bottom - gap);
      const above = Math.max(0, rect.top - gap);
      const opensUp = below < maxHeight && above > below;
      const available = opensUp ? above : below;
      setMenuStyle({
        position: 'fixed',
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        maxHeight: Math.max(80, Math.min(maxHeight, Math.round(available))),
        ...(opensUp
          ? { bottom: Math.max(gap, Math.round(window.innerHeight - rect.top + gap)) }
          : { top: Math.round(rect.bottom + gap) }),
      });
    };
    updatePosition();
    const closeOnViewportChange = event => {
      if (event?.type === 'scroll' && menuRef.current?.contains?.(event.target)) return;
      onViewportChange();
    };
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open, onViewportChange, rootRef]);

  return { menuRef, menuStyle };
}

export function ReferenceSelector({ tipo, value, search, references, loading, disabled, onSearch, onSelect }) {
  const isFabricacion = tipo === 'fabricacion';
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  const { menuRef, menuStyle } = useComboboxMenuPosition(open, rootRef, closeMenu);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const handleOutside = event => {
      if (!eventIsInside(event, rootRef.current)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const select = reference => {
    onSelect(reference);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="field diagnostico-combobox" style={{ gridColumn: '1 / -1' }}>
      <label>{isFabricacion ? 'Oportunidad' : 'Recepción de activo'}</label>
      <input
        className="input"
        role="combobox"
        aria-label={isFabricacion ? 'Oportunidad' : 'Recepción de activo'}
        value={search}
        disabled={disabled}
        placeholder={isFabricacion ? 'Buscar por nombre de oportunidad...' : 'Buscar por número, cliente o activo...'}
        onFocus={() => setOpen(true)}
        onBlur={event => {
          if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onChange={event => { setOpen(true); onSelect(null); onSearch(event.target.value); }}
      />
      {!disabled && open && <div ref={menuRef} className="diagnostico-combobox-menu" role="listbox" style={menuStyle} onMouseDown={event => event.preventDefault()}>
        {loading && <div className="muted" style={{ padding: 12 }}>Buscando referencias...</div>}
        {!loading && !references.length && <div className="muted" style={{ padding: 12 }}>Sin referencias encontradas.</div>}
        {!loading && references.map(reference => (
          <button
            type="button"
            key={reference.id}
            onClick={() => select(reference)}
            className={value?.id === reference.id ? 'diagnostico-combobox-option is-selected' : 'diagnostico-combobox-option'}
            style={{ display: 'block', width: '100%', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', padding: 10, cursor: 'pointer' }}
          >
            <strong>{referenceLabel(reference)}</strong>
            {reference.cliente && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{reference.cliente}</span>}
            {!isFabricacion && reference.activo && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{reference.activo}</span>}
          </button>
        ))}
      </div>}
      {disabled && !value && <div className="hint" style={{ marginTop: 6 }}>Referencia no disponible</div>}
    </div>
  );
}

function optionLabel(option, kind) {
  if (!option) return 'No disponible';
  if (kind === 'activo') return [option.codigo, option.nombre, option.marca, option.modelo, option.placa_serie].filter(Boolean).join(' · ') || 'No disponible';
  if (kind === 'tipo') return [option.nombre, option.codigo].filter(Boolean).join(' · ') || 'No disponible';
  if (kind === 'cargo') return option.nombre || option.codigo || 'No disponible';
  return option.nombre || 'No disponible';
}

export function CatalogSelector({ label, kind, value, options, disabled, placeholder, canCreate, clearable, onSelect, onCreate, onError }) {
  const [query, setQuery] = useState(value ? optionLabel(value, kind) : '');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  const { menuRef, menuStyle } = useComboboxMenuPosition(open, rootRef, closeMenu);

  useEffect(() => {
    setQuery(value ? optionLabel(value, kind) : '');
  }, [kind, value?.id]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const handleOutside = event => {
      if (!eventIsInside(event, rootRef.current)) {
        setOpen(false);
        setQuery(value ? optionLabel(value, kind) : '');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const normalizedQuery = normalizedText(query);
  const exactOption = options.some(option => [option.nombre, optionLabel(option, kind)].some(labelText => normalizedText(labelText) === normalizedQuery));
  const canOfferCreate = canCreate && Boolean(query.trim()) && !query.includes('·') && !exactOption && !(value?.id && value.nombre === 'No disponible');
  const selectedLabel = value ? optionLabel(value, kind) : '';
  const visible = normalizedQuery === normalizedText(selectedLabel)
    ? options
    : options.filter(option => optionLabel(option, kind).toLocaleLowerCase().includes(normalizedQuery));
  const restoreQuery = () => setQuery(value ? optionLabel(value, kind) : '');
  const closeWithoutSelection = () => {
    setOpen(false);
    restoreQuery();
  };
  const select = option => {
    onSelect(option);
    setQuery(option ? optionLabel(option, kind) : '');
    setOpen(false);
  };
  const create = async () => {
    const nombre = createName(query);
    if (!nombre || !onCreate) return;
    setCreating(true);
    try {
      const created = await onCreate(nombre);
      onSelect(created);
      setQuery(optionLabel(created, kind));
      setOpen(false);
    } catch (error) {
      onError(error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={rootRef} className="field diagnostico-combobox">
      <label>{label}</label>
      <div className="diagnostico-combobox-control">
        <input className="input" role="combobox" aria-label={label} value={query} disabled={disabled} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={event => {
          if (!rootRef.current?.contains(event.relatedTarget)) closeWithoutSelection();
        }} onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            closeWithoutSelection();
          }
        }} onChange={event => { setOpen(true); setQuery(event.target.value); }} />
        {clearable && !disabled && value && <button type="button" className="diagnostico-combobox-clear" aria-label={`Quitar ${label}`} onClick={() => select(null)}>×</button>}
      </div>
      {!disabled && open && <div ref={menuRef} className="diagnostico-combobox-menu" role="listbox" style={menuStyle} onMouseDown={event => event.preventDefault()}>
        {visible.map(option => (
          <button type="button" key={option.id} className={value?.id === option.id ? 'diagnostico-combobox-option is-selected' : 'diagnostico-combobox-option'} onClick={() => select(option)} style={{ display: 'block', width: '100%', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', padding: 8, cursor: 'pointer' }}>
            {optionLabel(option, kind)}
          </button>
        ))}
        {canOfferCreate && <button type="button" className="btn btn-secondary" onClick={create} disabled={creating} style={{ margin: 8, width: 'calc(100% - 16px)' }}>
          {creating ? 'Creando...' : `Buscar o crear “${query.trim()}”`}
        </button>}
        {!visible.length && !canOfferCreate && <div className="muted" style={{ padding: 8 }}>Sin coincidencias.</div>}
      </div>}
    </div>
  );
}

function LineEditor({ line, catalogs, canEdit, canCreateCatalog, saving, validationErrors, onChange, onSave, onDelete, onError, onActivitySelected }) {
  const selected = (options, id, kind) => options.find(option => option.id === id) || (id ? { id, nombre: 'No disponible' } : null);
  const patch = changes => onChange({ ...line, ...changes });
  const addMaterial = () => patch({
    materiales: [...(line.materiales || []), { _key: `material-${Date.now()}-${Math.random()}`, descripcion: '', cantidad: 1, unidad: 'und', orden: line.materiales?.length || 0 }],
  });
  const updateMaterial = (key, changes) => patch({ materiales: (line.materiales || []).map(material => materialKey(material) === key ? { ...material, ...changes } : material) });
  const removeMaterial = key => patch({ materiales: (line.materiales || []).filter(material => materialKey(material) !== key) });
  const activo = selected(catalogs.activos, line.activo_id, 'activo');

  return (
    <div className="card" style={{ marginTop: 14, border: '1px solid var(--border)' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong>{line.id ? 'Línea guardada' : 'Nueva línea'}</strong>
        {canEdit && <button type="button" className="btn btn-danger" onClick={onDelete}>{line.id ? 'Eliminar línea' : 'Quitar línea'}</button>}
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        <div className="diagnostico-line-grid">
          <CatalogSelector label="Trabajo *" kind="familia" value={selected(catalogs.familias, line.familia_trabajo_id, 'familia')} options={catalogs.familias} disabled={!canEdit} placeholder="Buscar trabajo..." canCreate={canEdit && canCreateCatalog} onSelect={item => patch({ familia_trabajo_id: item?.id || null })} onCreate={catalogs.crearFamilia} onError={onError} />
          <CatalogSelector label="Actividad (opcional)" kind="tipo" value={selected(catalogs.tipos, line.actividad_id, 'tipo')} options={catalogs.tipos} disabled={!canEdit} placeholder="Buscar actividad..." canCreate={canEdit && canCreateCatalog} clearable onSelect={item => { patch({ actividad_id: item?.id || null }); onActivitySelected?.(line.familia_trabajo_id, item); }} onCreate={catalogs.crearTipo} onError={onError} />
          <CatalogSelector label="Tarea *" kind="tipo" value={selected(catalogs.tipos, line.tarea_id, 'tipo')} options={catalogs.tipos} disabled={!canEdit} placeholder="Buscar tarea sin componente..." canCreate={canEdit && canCreateCatalog} onSelect={item => patch({ tarea_id: item?.id || null })} onCreate={catalogs.crearTipo} onError={onError} />
          <CatalogSelector label="Cargo" kind="cargo" value={selected(catalogs.cargos, line.cargo_id, 'cargo')} options={catalogs.cargos} disabled={!canEdit} placeholder="Buscar cargo..." clearable onSelect={item => patch({ cargo_id: item?.id || null })} onError={onError} />
        </div>
        <div className="diagnostico-line-grid diagnostico-line-grid-three">
          <div className="field"><label>Horas-hombre</label><input className="input" type="number" min="0" step="0.01" value={line.horas_mano_obra ?? 0} disabled={!canEdit} onChange={event => patch({ horas_mano_obra: event.target.value })} /></div>
          <CatalogSelector label="Activo propio" kind="activo" value={activo} options={catalogs.activos} disabled={!canEdit} placeholder="Buscar activo propio..." clearable onSelect={item => patch({ activo_id: item?.id || null, horas_maquina: item?.id ? line.horas_maquina : 0 })} onError={onError} />
          <div className="field"><label>Horas-máquina</label><input className="input" type="number" min="0" step="0.01" value={line.horas_maquina ?? 0} disabled={!canEdit || !line.activo_id} onChange={event => patch({ horas_maquina: event.target.value })} /></div>
        </div>
        <div className="field diagnostico-line-full"><label>Hallazgo</label><textarea className="input" rows="3" value={line.hallazgo || ''} disabled={!canEdit} onChange={event => patch({ hallazgo: event.target.value })} /></div>
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <strong>Repuestos</strong>
          {canEdit && <button type="button" className="btn btn-secondary" onClick={addMaterial}><Icon name="plus" size={14} /> Agregar repuesto</button>}
        </div>
        {(line.materiales || []).length === 0 ? <div className="muted">Sin repuestos.</div> : <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}><thead><tr><th>Descripción</th><th style={{ width: 120 }}>Cantidad</th><th style={{ width: 150 }}>Unidad</th><th style={{ width: 90 }} /></tr></thead>
            <tbody>{line.materiales.map((material, index) => <Fragment key={materialKey(material)}>
              <tr>
                <td><input className="input" value={material.descripcion || ''} disabled={!canEdit} onChange={event => updateMaterial(materialKey(material), { descripcion: event.target.value })} /></td>
                <td><input className="input" type="number" min="0.0001" step="0.0001" value={material.cantidad ?? 1} disabled={!canEdit} onChange={event => updateMaterial(materialKey(material), { cantidad: event.target.value })} /></td>
                <td><input className="input" value={material.unidad || 'und'} disabled={!canEdit} onChange={event => updateMaterial(materialKey(material), { unidad: event.target.value })} /></td>
                <td>{canEdit && <button type="button" className="btn btn-danger" onClick={() => removeMaterial(materialKey(material))}>Quitar</button>}</td>
              </tr>
              {validationErrors?.[index] && <tr><td colSpan="4"><div className="alert alert-error" style={{ margin: 0 }}>Repuesto {index + 1}: {validationErrors[index]}</div></td></tr>}
            </Fragment>)}</tbody>
          </table>
        </div>}
      </div>
      {canEdit && <div className="card-body" style={{ paddingTop: 0, display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar línea'}</button></div>}
    </div>
  );
}

export function DiagnosticoTecnicoPage({ routeParams = {} } = {}) {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const usuarioId = sesion.usuario?.id;
  const [access, setAccess] = useState({ loading: true, ver: false, crear: false, editar: false, aprobar: false, error: '' });
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [wizardStep, setWizardStep] = useState(1);
  const [datosIniciales, setDatosIniciales] = useState({ motivo: '', trabajos_evaluar: [], tecnico_id: '', fecha_inspeccion: new Date().toISOString().slice(0, 10), componente_catalogo_id: null, corregirComponente: false });
  const [datosInicialesGuardados, setDatosInicialesGuardados] = useState({ motivo: '', trabajos_evaluar: [], tecnico_id: '', fecha_inspeccion: '' });
  const [componentesInicio, setComponentesInicio] = useState([]);
  const [tecnicosInicio, setTecnicosInicio] = useState([]);
  const [familiasInicio, setFamiliasInicio] = useState([]);
  const [equipoInicio, setEquipoInicio] = useState(null);
  const [datosInicioError, setDatosInicioError] = useState('');
  const [search, setSearch] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [references, setReferences] = useState([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingLine, setSavingLine] = useState(null);
  const [error, setError] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [catalogs, setCatalogs] = useState({ familias: [], tipos: [], cargos: [], activos: [], hallazgos: { tipo_dano: [], causa_probable: [], unidad_medicion: [] } });
  const [extraFamilyIds, setExtraFamilyIds] = useState([]);
  const [taskPanel, setTaskPanel] = useState(false);
  const [taskPanelHasSelection, setTaskPanelHasSelection] = useState(false);
  const [informePanel, setInformePanel] = useState(false);
  const [workStep, setWorkStep] = useState(4);
  const [hallazgoView, setHallazgoView] = useState('lista');
  const [informeAccess, setInformeAccess] = useState({ ver: false, editar: false, aprobar: false });
  const [plantillasActividad, setPlantillasActividad] = useState([]);
  const [lineValidationErrors, setLineValidationErrors] = useState({});
  const [pendingLineDeletes, setPendingLineDeletes] = useState([]);
  const [slowSaveWarning, setSlowSaveWarning] = useState('');
  const [hallazgosDirty, setHallazgosDirty] = useState(false);
  const [hallazgosDirtySummary, setHallazgosDirtySummary] = useState({ hallazgos: 0, tareas: 0, cambios: 0 });
  const [hallazgosSaving, setHallazgosSaving] = useState(false);
  const [confirmarRegenerarResumen, setConfirmarRegenerarResumen] = useState(false);
  const [generandoResumenIA, setGenerandoResumenIA] = useState(false);
  const [errorResumenIA, setErrorResumenIA] = useState('');
  const openRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const modalSessionRef = useRef(0);
  const hallazgosSaveRef = useRef(null);
  const hallazgosAddRef = useRef(null);
  const hallazgosAddOtroRef = useRef(null);
  const hallazgosBackRef = useRef(null);
  const goToIncompleteHallazgoRef = useRef(null);
  const tableAnchorRef = useRef(null);
  const routeOpenIdRef = useRef('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const canCreate = access.ver && access.crear;
  const isReadOnly = selected?.estado === 'emitido';
  const canEditLines = access.editar && !isReadOnly && Boolean(sesion.permiteEscritura);
  const canSave = !selected && canCreate;
  const selectedReference = form.referencia;

  useEffect(() => {
    const active = Boolean(selected?.tipo === 'mantenimiento');
    dispatchDiagnosticoWorkMode(active);
    return () => dispatchDiagnosticoWorkMode(false);
  }, [selected?.id, selected?.tipo]);

  useEffect(() => {
    setHallazgoView('lista');
    setInformePanel(false);
    setWorkStep(4);
  }, [selected?.id]);

  const cargarLista = useCallback(async () => {
    if (!access.ver || !empresaId) return;
    const requestId = ++listRequestRef.current;
    setLoadingList(true);
    setReferenceError('');
    try {
      const rows = await listarDiagnosticosTecnicos(empresaId);
      if (requestId !== listRequestRef.current) return;
      try {
        const rowsWithReferences = await adjuntarReferencias(empresaId, rows);
        if (requestId !== listRequestRef.current) return;
        setDiagnosticos(rowsWithReferences);
      } catch (referenceLoadError) {
        if (requestId !== listRequestRef.current) return;
        setReferenceError(errorMessage(referenceLoadError));
        setDiagnosticos(rows.map(row => ({ ...row, referencia: null })));
      }
    } catch (loadError) {
      if (requestId === listRequestRef.current) setError(errorMessage(loadError));
    } finally {
      if (requestId === listRequestRef.current) setLoadingList(false);
    }
  }, [access.ver, empresaId]);

  useEffect(() => {
    let vigente = true;
    if (sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setAccess(current => ({ ...current, loading: true, error: '' }));
    (async () => {
      try {
        const ver = await usuarioPuedeDiagnostico(empresaId, 'ver');
        if (!vigente) return;
        if (!ver) {
          setAccess({ loading: false, ver: false, crear: false, editar: false, aprobar: false, error: '' });
          return;
        }
        const [crear, editar, aprobar, informeVer, informeEditar, informeAprobar] = await Promise.all([
          usuarioPuedeDiagnostico(empresaId, 'crear'),
          usuarioPuedeDiagnostico(empresaId, 'editar'),
          usuarioPuedeDiagnostico(empresaId, 'aprobar'),
          usuarioPuedeInforme(empresaId, 'ver'),
          usuarioPuedeInforme(empresaId, 'editar'),
          usuarioPuedeInforme(empresaId, 'aprobar'),
        ]);
        if (!vigente) return;
        setAccess({ loading: false, ver: true, crear, editar, aprobar, error: '' });
        setInformeAccess({ ver: informeVer, editar: informeEditar, aprobar: informeAprobar });
      } catch (permissionError) {
        if (vigente) setAccess({ loading: false, ver: false, crear: false, editar: false, aprobar: false, error: errorMessage(permissionError) });
      }
    })();
    return () => { vigente = false; };
  }, [empresaId, sesion.estado]);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  useEffect(() => {
    if (routeParams.nuevo === 'mantenimiento' && !selected && form.tipo !== 'mantenimiento' && access.ver) openNew('mantenimiento');
  }, [routeParams.nuevo, selected?.id, form.tipo, access.ver]);

  useEffect(() => {
    let vigente = true;
    if (form.tipo !== 'mantenimiento' || !access.ver || !empresaId) return () => { vigente = false; };
    listarTecnicosDiagnostico(empresaId).then(rows => { if (vigente) setTecnicosInicio(rows); }).catch(() => { if (vigente) setTecnicosInicio([]); });
    return () => { vigente = false; };
  }, [form.tipo, access.ver, empresaId]);

  useEffect(() => {
    let vigente = true;
    if (form.tipo !== 'mantenimiento' || !access.ver || !empresaId) return () => { vigente = false; };
    listarFamiliasTrabajo(empresaId).then(rows => { if (vigente) setFamiliasInicio(rows); }).catch(loadError => { if (vigente) setDatosInicioError(errorMessage(loadError)); });
    return () => { vigente = false; };
  }, [form.tipo, access.ver, empresaId]);

  useEffect(() => {
    let vigente = true;
    if (form.tipo !== 'mantenimiento' || !selectedReference?.id || !empresaId) { setEquipoInicio(null); setComponentesInicio([]); return () => { vigente = false; }; }
    Promise.all([
      obtenerEquipoParaDiagnostico(empresaId, selectedReference.id),
      listarCatalogoComponentesParaRecepcion(empresaId, selectedReference.sociedad_id || null),
    ]).then(([equipo, componentes]) => {
      if (!vigente) return;
      setEquipoInicio(equipo);
      setComponentesInicio(componentes || []);
      setDatosIniciales(current => ({ ...current, motivo: current.motivo || equipo.observaciones || '', componente_catalogo_id: equipo.componente?.id || null }));
    }).catch(loadError => { if (vigente) setDatosInicioError(errorMessage(loadError)); });
    return () => { vigente = false; };
  }, [form.tipo, selectedReference?.id, empresaId]);

  useEffect(() => {
    let vigente = true;
    if (!selected || !access.ver || !empresaId) return () => { vigente = false; };
    setLoadingCatalogs(true);
    setCatalogError('');
    Promise.all([listarFamiliasTrabajo(empresaId), listarTiposServicioInterno(empresaId), listarCargosEmpresa(empresaId), listarActivosPropios(empresaId), listarCatalogosHallazgos(empresaId), selected.tipo === 'mantenimiento' ? listarComponentesDiagnostico(empresaId, selected.id) : Promise.resolve([])])
      .then(([familias, tipos, cargos, activos, hallazgoRows, componentes]) => {
        if (!vigente) return;
        const hallazgos = { tipo_dano: [], causa_probable: [], unidad_medicion: [] };
        hallazgoRows.forEach(row => { if (hallazgos[row.catalogo]) hallazgos[row.catalogo].push(row); });
        setCatalogs({ familias, tipos, cargos, activos, hallazgos, componentes });
      })
      .catch(loadError => { if (vigente) setCatalogError(errorMessage(loadError)); })
      .finally(() => { if (vigente) setLoadingCatalogs(false); });
    return () => { vigente = false; };
  }, [access.ver, empresaId, selected?.id]);

  useEffect(() => {
    let vigente = true;
    if (!selected || !access.ver || !empresaId) return () => { vigente = false; };
    setPlantillasActividad([]);
    listarPlantillasActividad(empresaId).then(rows => { if (vigente) setPlantillasActividad(rows); }).catch(() => {});
    return () => { vigente = false; };
  }, [access.ver, empresaId, selected?.id]);

  useEffect(() => {
    let vigente = true;
    if (!access.ver || !empresaId || !form.tipo || selected?.estado === 'emitido') {
      setReferences([]);
      return () => { vigente = false; };
    }
    const timer = window.setTimeout(() => {
      setLoadingReferences(true);
      listarReferenciasDiagnostico(empresaId, form.tipo, search)
        .then(data => { if (vigente) setReferences(data); })
        .catch(loadError => { if (vigente) setError(errorMessage(loadError)); })
        .finally(() => { if (vigente) setLoadingReferences(false); });
    }, 300);
    return () => {
      vigente = false;
      window.clearTimeout(timer);
    };
  }, [access.ver, empresaId, form.tipo, search, selected?.estado]);

  const openNew = tipo => {
    openRequestRef.current += 1;
    setSelected(null);
    setPendingLineDeletes([]);
    setForm({ ...EMPTY_FORM, tipo });
    setDatosIniciales({ motivo: '', trabajos_evaluar: [], tecnico_id: '', fecha_inspeccion: new Date().toISOString().slice(0, 10), componente_catalogo_id: null, corregirComponente: false });
    setComponentesInicio([]);
    setDatosInicioError('');
    setEquipoInicio(null);
    setWizardStep(1);
    setSearch('');
    setReferenceError('');
    setCatalogError('');
    setNotice('');
    setHallazgosDirty(false);
    setHallazgosDirtySummary({ hallazgos: 0, tareas: 0 });
    setHallazgosSaving(false);
    hallazgosSaveRef.current = null;
    setError('');
    if (tipo === 'mantenimiento' && typeof window !== 'undefined' && window.location) window.location.hash = '/diagnostico-tecnico?nuevo=mantenimiento';
  };

  const openExisting = async diagnostico => {
    setInformePanel(false);
    const requestId = ++openRequestRef.current;
    setError('');
    setReferenceError('');
    setNotice('');
    setHallazgosDirty(false);
    setHallazgosDirtySummary({ hallazgos: 0, tareas: 0 });
    setHallazgosSaving(false);
    hallazgosSaveRef.current = null;
    try {
      const detail = prepararDetalle(await obtenerDiagnosticoTecnico(empresaId, diagnostico.id));
      if (requestId !== openRequestRef.current) return;
      const referenceId = detail.tipo === 'fabricacion' ? detail.oportunidad_id : detail.recepcion_id;
      let reference = null;
      try {
        const resolved = await resolverReferenciasPorTipo(empresaId, detail.tipo, [referenceId]);
        if (requestId !== openRequestRef.current) return;
        reference = resolved.find(candidate => candidate.id === referenceId) || null;
      } catch (referenceLoadError) {
        if (requestId === openRequestRef.current) setReferenceError(errorMessage(referenceLoadError));
      }
      if (requestId !== openRequestRef.current) return;
      setSelected(detail);
      const initialData = {
        motivo: detail.motivo || '',
        trabajos_evaluar: Array.isArray(detail.trabajos_evaluar) ? detail.trabajos_evaluar : [],
        tecnico_id: detail.tecnico_id || '',
        fecha_inspeccion: detail.fecha_inspeccion || '',
      };
      setDatosIniciales(current => ({ ...current, ...initialData, componente_catalogo_id: detail.componente_catalogo_id || null, corregirComponente: false }));
      setDatosInicialesGuardados(initialData);
      setWorkStep(detail.tipo === 'mantenimiento' ? 1 : 4);
      if (detail.tipo === 'mantenimiento' && typeof window !== 'undefined' && window.location?.hash !== undefined) {
        const query = new URLSearchParams(window.location?.hash?.split('?')[1] || '');
        if (query.get('trabajo') !== detail.id) {
          query.set('trabajo', detail.id);
          window.location.hash = `/diagnostico-tecnico?${query}`;
        }
      }
      setPendingLineDeletes([]);
      setForm({ tipo: detail.tipo, referencia: reference });
      setSearch('');
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  useEffect(() => {
    const id = routeParams.trabajo;
    if (!id || !access.ver || !empresaId || selected?.id === id || routeOpenIdRef.current === id) return;
    routeOpenIdRef.current = id;
    openExisting({ id }).finally(() => { if (routeOpenIdRef.current === id) routeOpenIdRef.current = ''; });
  }, [routeParams.trabajo, access.ver, empresaId, selected?.id]);

  const save = async event => {
    event.preventDefault();
    if (!sesion.permiteEscritura) {
      setError('La empresa operativa está en modo solo lectura; no se pueden guardar diagnósticos.');
      return;
    }
    if (!canSave) {
      setError('No tienes permiso para crear diagnósticos técnicos.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    setHallazgosDirty(false);
    setHallazgosDirtySummary({ hallazgos: 0, tareas: 0 });
    setHallazgosSaving(false);
    hallazgosSaveRef.current = null;
    const session = modalSessionRef.current;
    const isActive = () => mountedRef.current && modalSessionRef.current === session;
    try {
      const created = await crearDiagnosticoTecnico(empresaId, usuarioId, {
        tipo: form.tipo,
        oportunidad_id: form.tipo === 'fabricacion' ? selectedReference?.id : null,
        recepcion_id: form.tipo === 'mantenimiento' ? selectedReference?.id : null,
        motivo: datosIniciales.motivo,
        tecnico_id: datosIniciales.tecnico_id,
        fecha_inspeccion: datosIniciales.fecha_inspeccion,
        trabajos_evaluar: datosIniciales.trabajos_evaluar,
      });
      if (isActive()) setNotice('Diagnóstico guardado en borrador.');
      await cargarLista();
      if (!isActive()) return;
      await openExisting(created);
      setExtraFamilyIds(datosIniciales.trabajos_evaluar);
      setWizardStep(1);
      setWorkStep(4);
    } catch (saveError) {
      if (isActive()) setError(errorMessage(saveError));
    } finally {
      if (isActive()) {
        setSaving(false);
        setSlowSaveWarning('');
      }
    }
  };

  const patchLine = (line, changes) => {
    const key = lineKey(line);
    setSelected(current => ({ ...current, lineas: (current.lineas || []).map(item => lineKey(item) === key ? { ...changes, _dirty: true } : item) }));
  };

  const addLine = () => {
    if (!canEditLines) return;
    setSelected(current => ({ ...current, lineas: [...(current.lineas || []), { ...EMPTY_LINE, orden: current.lineas?.length || 0, _key: `line-${Date.now()}-${Math.random()}`, _dirty: true }] }));
  };

  const reloadPersistedLine = async (line, persistedId, runStep, isActive) => {
    const lineId = persistedId || line.id;
    if (!lineId) return;
    const persisted = prepararDetalle({ lineas: [await runStep('obtenerDiagnosticoLinea', () => obtenerDiagnosticoLinea(empresaId, lineId))] }).lineas[0];
    if (!isActive()) return;
    setSelected(current => ({
      ...current,
      lineas: (current.lineas || []).map(item => lineKey(item) === lineKey(line)
        ? { ...item, id: persisted.id, _materialesIniciales: persisted._materialesIniciales }
        : item),
    }));
  };

  const validateLine = line => (line.materiales || []).map(materialValidationError);

  const saveLine = async line => {
    if (!selected || !canEditLines) return;
    const key = lineKey(line);
    const session = modalSessionRef.current;
    const isActive = () => mountedRef.current && modalSessionRef.current === session;
    const runStep = (step, operation) => observeSaveStep(step, operation, (name, elapsedMs) => {
      console.warn(`[diagnostico_tecnico] ${name} pendiente ${elapsedMs} ms`);
      if (isActive()) setSlowSaveWarning(SLOW_SAVE_WARNING);
    });
    const validationErrors = validateLine(line);
    if (validationErrors.some(Boolean)) {
      setLineValidationErrors(current => ({ ...current, [key]: validationErrors }));
      setSelected(current => ({ ...current, lineas: current.lineas.map(item => lineKey(item) === key ? { ...item, _saveError: 'Corrige los repuestos marcados antes de guardar.' } : item) }));
      setError('Corrige los repuestos marcados antes de guardar la línea.');
      setNotice('');
      return;
    }
    setSavingLine(key);
    setError('');
    setNotice('');
    setSlowSaveWarning('');
    let saved = null;
    let phase = 'linea';
    try {
      saved = await runStep('guardarDiagnosticoLinea', () => guardarDiagnosticoLinea(empresaId, selected.id, line));
      phase = 'repuestos';
      if (isActive()) setSelected(current => ({
        ...current,
        lineas: (current.lineas || []).map(item => lineKey(item) === key
          ? { ...item, ...saved, id: saved.id, _dirty: true }
          : item),
      }));
      await runStep('sincronizarMaterialesLinea', () => sincronizarMaterialesLinea(empresaId, saved.id, line._materialesIniciales || [], line.materiales || []));
      phase = 'recarga';
      const refreshed = prepararDetalle({ lineas: [await runStep('obtenerDiagnosticoLinea', () => obtenerDiagnosticoLinea(empresaId, saved.id))] }).lineas[0];
      if (isActive()) setSelected(current => ({
        ...current,
        lineas: (current.lineas || []).map(item => lineKey(item) === key ? { ...refreshed, _saveError: '' } : item),
      }));
      if (isActive()) setLineValidationErrors(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (isActive()) setNotice('Línea guardada.');
      return true;
    } catch (saveError) {
      if (!isActive()) return;
      const originalError = errorMessage(saveError);
      if (saved?.id && phase === 'repuestos') {
        try {
          await reloadPersistedLine(line, saved.id, runStep, isActive);
          setError(`La línea se guardó, pero los repuestos no se guardaron: ${originalError}`);
        } catch (reloadError) {
          setError(`La línea se guardó, pero los repuestos no se guardaron: ${originalError}. No se pudo recargar la línea: ${errorMessage(reloadError)}`);
        }
      } else if (saved?.id && phase === 'recarga') {
        setError(`La línea y los repuestos se guardaron, pero no se pudo recargar la línea: ${originalError}`);
      } else {
        setError(`La línea no se guardó: ${originalError}`);
      }
      if (isActive()) setSelected(current => ({ ...current, lineas: current.lineas.map(item => lineKey(item) === key ? { ...item, _saveError: `No se guardó: ${originalError}` } : item) }));
      return false;
    } finally {
      if (isActive()) {
        setSavingLine(null);
        setSlowSaveWarning('');
      }
    }
  };

  const saveAllLines = async ({ includeDeletes = false } = {}) => {
    if (!selected || !canEditLines) return true;
    const dirtyLines = (selected.lineas || []).filter(line => line._dirty);
    let allSaved = true;
    for (const line of dirtyLines) {
      const saved = await saveLine(line);
      if (!saved) allSaved = false;
    }
    if (allSaved && includeDeletes) {
      for (const line of pendingLineDeletes) {
        try {
          await eliminarDiagnosticoLinea(empresaId, selected.id, line.id);
          setPendingLineDeletes(current => current.filter(item => lineKey(item) !== lineKey(line)));
        } catch (deleteError) {
          allSaved = false;
          setError(errorMessage(deleteError));
          break;
        }
      }
    }
    return allSaved;
  };

  const queueFamilyLineDeletes = familyId => {
    if (!selected || !canEditLines) return;
    const removed = (selected.lineas || []).filter(line => line.familia_trabajo_id === familyId);
    setPendingLineDeletes(current => [...current, ...removed.filter(line => line.id && !current.some(item => lineKey(item) === lineKey(line)))]);
    setSelected(current => current?.id === selected.id
      ? { ...current, lineas: (current.lineas || []).filter(line => line.familia_trabajo_id !== familyId) }
      : current);
  };

  const saveAll = async () => {
    if (!selected || !canEditLines || modalBusy) return false;
    setError('');
    setNotice('');
    const linesSaved = await saveAllLines({ includeDeletes: true });
    if (!linesSaved) {
      const hallazgosPendientes = selected.tipo === 'mantenimiento' && (hallazgosDirty || Number(hallazgosDirtySummary.cambios || 0) > 0);
      setError(hallazgosPendientes
        ? 'Falló el guardado de tareas; los hallazgos quedaron pendientes. Corrige las tareas con error antes de guardar hallazgos.'
        : 'Falló el guardado de tareas. Corrige las tareas con error antes de volver a guardar.');
      return false;
    }
    if (selected.tipo === 'mantenimiento' && hallazgosDirty) {
      const result = await hallazgosSaveRef.current?.();
      if (result && !result.ok) {
        setError(`Se guardaron las tareas pero fallaron los hallazgos: ${result.error}`);
        return false;
      }
    }
    if (summaryDirty) {
      try {
        const saved = await guardarResumenDiagnostico(empresaId, selected.id, resumenVisible, selected.resumen_origen || 'auto');
        setSelected(current => current?.id === selected.id ? { ...current, ...saved, _resumenGuardado: saved.resumen_diagnostico || '', _origenResumenGuardado: saved.resumen_origen } : current);
        setNotice('Cambios guardados.');
      } catch (saveError) { setError(errorMessage(saveError)); return false; }
    }
    return true;
  };

  const goInforme = async () => {
    if (!canEditLines) { setInformePanel(true); setWorkStep(5); return; }
    const saved = await saveAll();
    if (saved) { setInformePanel(true); setWorkStep(5); }
  };

  const initialDataDirty = Boolean(selected?.tipo === 'mantenimiento' && (
    datosIniciales.motivo !== datosInicialesGuardados.motivo
    || datosIniciales.tecnico_id !== datosInicialesGuardados.tecnico_id
    || datosIniciales.fecha_inspeccion !== datosInicialesGuardados.fecha_inspeccion
    || JSON.stringify(datosIniciales.trabajos_evaluar || []) !== JSON.stringify(datosInicialesGuardados.trabajos_evaluar || [])
  ));
  const saveInitialData = async () => {
    if (!selected || !canEditInitialData || !initialDataDirty) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await actualizarDatosInicialesDiagnostico(empresaId, selected.id, datosIniciales);
      const next = { motivo: saved.motivo || '', tecnico_id: saved.tecnico_id || '', fecha_inspeccion: saved.fecha_inspeccion || '', trabajos_evaluar: saved.trabajos_evaluar || [] };
      setDatosIniciales(current => ({ ...current, ...next }));
      setDatosInicialesGuardados(next);
      setSelected(current => current?.id === selected.id ? { ...current, ...next, tecnico_nombre: tecnicosInicio.find(row => row.id === next.tecnico_id)?.nombre || current.tecnico_nombre } : current);
      setNotice('Cambios guardados.');
    } catch (saveError) { setError(errorMessage(saveError)); }
    finally { setSaving(false); }
  };
  const selectInitialReference = reference => {
    if (selectedReference?.id && selectedReference.id !== reference.id && typeof window !== 'undefined'
      && !window.confirm('Si cambias de recepción, se perderán los datos iniciales que ingresaste. ¿Continuar?')) return;
    setForm(current => ({ ...current, referencia: reference }));
    setSearch(referenceLabel(reference));
    setDatosIniciales(current => ({ ...current, motivo: reference.observaciones || '', trabajos_evaluar: [], tecnico_id: '', fecha_inspeccion: new Date().toISOString().slice(0, 10), componente_catalogo_id: null, corregirComponente: false }));
  };

  const deleteLine = async line => {
    if (!selected || !canEditLines) return;
    const key = lineKey(line);
    if (!line.id) {
      setSelected(current => ({ ...current, lineas: (current.lineas || []).filter(item => lineKey(item) !== key) }));
      setLineValidationErrors(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setError('');
    setNotice('');
    try {
      await eliminarDiagnosticoLinea(empresaId, selected.id, line.id);
      setSelected(current => ({ ...current, lineas: (current.lineas || []).filter(item => lineKey(item) !== key) }));
      setLineValidationErrors(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setNotice('Línea eliminada.');
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  const crearFamilia = async nombre => {
    const created = await buscarOCrearFamiliaTrabajo(empresaId, nombre);
    setCatalogs(current => ({ ...current, familias: current.familias.some(item => item.id === created.id) ? current.familias : [...current.familias, created] }));
    return created;
  };

  const crearTipo = async (nombre, rol = null, familiaTrabajoId = null) => {
    const created = await buscarOCrearTipoServicioInterno(empresaId, nombre, rol, familiaTrabajoId);
    setCatalogs(current => ({ ...current, tipos: current.tipos.some(item => item.id === created.id) ? current.tipos : [...current.tipos, created] }));
    return created;
  };

  const sessionError = !sesion.empresaId
    ? 'No se pudo identificar la empresa operativa del usuario.'
    : sesion.error || `La sesión operativa no está lista (estado: ${sesion.estado}).`;

  const closeDetail = () => {
    openRequestRef.current += 1;
    modalSessionRef.current += 1;
    setSaving(false);
    setSavingLine(null);
    setSlowSaveWarning('');
    setSelected(null);
    if (typeof window !== 'undefined' && window.location?.hash) { const query = new URLSearchParams(window.location.hash.split('?')[1] || ''); if (query.has('trabajo') || query.has('nuevo')) window.location.hash = '/diagnostico-tecnico'; }
    setPendingLineDeletes([]);
    setInformePanel(false);
    setTaskPanel(false);
    setTaskPanelHasSelection(false);
    setForm(EMPTY_FORM);
    setSearch('');
    setError('');
    setReferenceError('');
    setCatalogError('');
    setNotice('');
    setHallazgosDirty(false);
    setHallazgosDirtySummary({ hallazgos: 0, tareas: 0 });
    setHallazgosSaving(false);
    hallazgosSaveRef.current = null;
  };
  const closeTaskPanel = () => { setTaskPanel(false); setTaskPanelHasSelection(false); };
  const toggleTaskPanel = () => {
    if (taskPanel) closeTaskPanel();
    else { setTaskPanelHasSelection(false); setTaskPanel(true); }
  };
  const appendCascadeLines = rows => {
    if (!selected || !canEditLines) return;
    setSelected(current => {
      const additions = rows.map((row, index) => ({
        ...EMPTY_LINE,
        ...row,
        id: null,
        _key: `line-${Date.now()}-${Math.random()}-${index}`,
        orden: Math.max(-1, ...(current.lineas || []).map(line => Number(line.orden) || 0)) + 1 + index,
        materiales: [],
        _materialesIniciales: [],
        _dirty: true,
      }));
      return { ...current, lineas: [...(current.lineas || []), ...additions] };
    });
  };
  const resumenVisible = selected?.resumen_diagnostico || '';
  const hallazgosIncompletosCount = getIncompleteHallazgos(selected?.hallazgos || []).length;
  const summaryDirty = Boolean(selected?.tipo === 'mantenimiento' && (
    (selected.resumen_origen || 'auto') !== (selected._origenResumenGuardado || 'auto')
    || resumenVisible !== (selected._resumenGuardado || '')
  ));
  const detailDirty = selected
    ? (selected.lineas || []).some(line => line._dirty) || pendingLineDeletes.length > 0 || (selected.tipo === 'mantenimiento' && hallazgosDirty) || summaryDirty
    : Boolean(form.referencia);
  const modalBusy = saving || Boolean(savingLine) || (selected?.tipo === 'mantenimiento' && hallazgosSaving);
  const canEditInitialData = canEditLines && selected?.datos_iniciales_migracion_disponible !== false;
  const cambiosSinGuardar = Boolean(selected && ((selected.lineas || []).some(line => line._dirty) || pendingLineDeletes.length > 0 || (selected.tipo === 'mantenimiento' && (hallazgosDirty || initialDataDirty)) || summaryDirty));
  const recargarEstadoDiagnostico = async resultado => {
    const diagnosticoId = selected?.id;
    if (!diagnosticoId) return;
    if (resultado?.estado) setSelected(current => current?.id === diagnosticoId ? { ...current, estado: resultado.estado } : current);
    const refreshed = prepararDetalle(await obtenerDiagnosticoTecnico(empresaId, diagnosticoId));
    setDiagnosticos(current => current.map(row => row.id === diagnosticoId
      ? {
          ...row,
          estado: refreshed.estado,
          ...(Object.prototype.hasOwnProperty.call(refreshed, 'emitido_en') ? { emitido_en: refreshed.emitido_en } : {}),
        }
      : row));
    setSelected(refreshed);
    return refreshed;
  };
  const modalOpen = Boolean(form.tipo || selected);
  const maintenancePage = selected?.tipo === 'mantenimiento' || form.tipo === 'mantenimiento';
  const cambiarResumen = (value, origen = 'editado') => setSelected(current => ({ ...current, resumen_diagnostico: value, resumen_origen: origen }));
  const guardarResumenParaInforme = async () => {
    if (!selected || selected.tipo !== 'mantenimiento' || !summaryDirty) return;
    const saved = await guardarResumenDiagnostico(empresaId, selected.id, resumenVisible, selected.resumen_origen || 'auto');
    setSelected(current => current?.id === selected.id ? { ...current, ...saved, _resumenGuardado: saved.resumen_diagnostico || '', _origenResumenGuardado: saved.resumen_origen } : current);
  };
  const generarResumenIA = async () => {
    if (!selected || !canEditLines || generandoResumenIA || !(selected.hallazgos || []).length) return;
    if (getIncompleteHallazgos(selected.hallazgos || []).length) {
      setErrorResumenIA('Completa o elimina los hallazgos incompletos.');
      return;
    }
    setGenerandoResumenIA(true); setErrorResumenIA(''); setConfirmarRegenerarResumen(false);
    try {
      const linesSaved = await saveAllLines();
      if (!linesSaved) throw new Error('No se pudieron guardar las tareas. Corrige los errores antes de generar el diagnóstico.');
      if (hallazgosDirty) {
        const result = await hallazgosSaveRef.current?.();
        if (result && !result.ok) throw new Error(result.error || 'No se pudieron guardar los hallazgos.');
      }
      const borrador = await obtenerOCrearBorrador(selected.recepcion_id, selected.id);
      validarBorradorDiagnostico(borrador, selected.id);
      const result = await generarConclusionIA(selected.id);
      cambiarResumen(result.conclusion, 'auto');
    } catch (generationError) { setErrorResumenIA(generationError.message || 'No se pudo generar el diagnóstico.'); }
    finally { setGenerandoResumenIA(false); }
  };
  const iniciarResumenManual = () => { cambiarResumen('', 'editado'); setErrorResumenIA(''); };
  const readOnlyReason = !sesion.permiteEscritura
    ? 'Selecciona una sociedad concreta en la barra superior para poder editar.'
    : !selected && !canCreate
      ? 'No tienes permiso para crear diagnósticos.'
      : selected && !access.editar
        ? 'No tienes permiso para editar diagnósticos.'
      : isReadOnly
        ? 'Este diagnóstico está emitido y es de solo lectura.'
        : '';

  if (sesion.estado !== 'listo' || !empresaId) return <AccessState title="No se puede abrir Diagnóstico Técnico" error={sessionError} />;
  if (access.loading) return <AccessState loading />;
  if (!access.ver) return <AccessState error={access.error} />;

  const detailTitle = selected ? `${typeLabel(selected.tipo)} · ${referenceLabel(form.referencia)}` : `Nuevo diagnóstico · ${typeLabel(form.tipo)}`;
  const initialStepValid = wizardStep === 1
    ? Boolean(selectedReference)
    : wizardStep === 2
      ? Boolean(equipoInicio && (equipoInicio.activo.tipo_activo === 'maquinaria_completa' || equipoInicio.componente || datosIniciales.componente_catalogo_id))
      : Boolean(selectedReference && datosIniciales.motivo.trim() && datosIniciales.trabajos_evaluar.length && datosIniciales.tecnico_id && datosIniciales.fecha_inspeccion);

  const lineasActuales = selected?.lineas || [];
  const familiasPorId = new Map(catalogs.familias.map(item => [item.id, item]));
  const gruposMap = new Map();
  lineasActuales.forEach(line => {
    const familia = familiasPorId.get(line.familia_trabajo_id) || { id: line.familia_trabajo_id || 'sin-familia', nombre: 'Trabajo no disponible' };
    if (!gruposMap.has(familia.id)) gruposMap.set(familia.id, { familia, lines: [] });
    gruposMap.get(familia.id).lines.push(line);
  });
  extraFamilyIds.forEach(id => {
    if (!gruposMap.has(id) && familiasPorId.has(id)) gruposMap.set(id, { familia: familiasPorId.get(id), lines: [] });
  });
  const grupos = [...gruposMap.values()];
  const totalHH = lineasActuales.reduce((sum, line) => sum + Number(line.horas_mano_obra || 0), 0);
  const totalHM = lineasActuales.reduce((sum, line) => sum + Number(line.horas_maquina || 0), 0);
  const dirtyLineCount = lineasActuales.filter(line => line._dirty).length + pendingLineDeletes.length;
  const cambiosCount = dirtyLineCount + (selected?.tipo === 'mantenimiento' ? Number(hallazgosDirtySummary.cambios || 0) + Number(initialDataDirty) : 0) + Number(summaryDirty);
  const normalizedListQuery = normalizeListText(listQuery.trim());
  const filteredDiagnosticos = diagnosticos.filter(row => !normalizedListQuery || normalizeListText([
    row.referencia?.numero,
    row.referencia?.cliente,
    row.referencia?.activo,
    typeLabel(row.tipo),
  ].join(' ')).includes(normalizedListQuery));
  const borradoresCount = diagnosticos.filter(row => row.estado !== 'emitido').length;
  const emitidosCount = diagnosticos.length - borradoresCount;

  return (
    <main className="ops-page" style={maintenancePage ? { padding: 0, width: '100%', height: 'calc(100dvh - 68px)', minHeight: 0, overflow: 'hidden' } : { padding: 24, width: '100%' }}>
      <div className={selected?.tipo === 'mantenimiento' ? 'dx-list-work-hidden' : ''} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="ops-eyebrow">Taller & Operaciones</div>
          <h1 style={{ margin: '4px 0 6px' }}>Diagnóstico Técnico</h1>
          <p className="muted" style={{ margin: 0 }}>Levantamiento técnico operativo.</p>
        </div>
        {canCreate && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => openNew('fabricacion')}><Icon name="plus" size={14} /> Fabricación</button>
          <button type="button" className="btn btn-secondary" onClick={() => openNew('mantenimiento')}><Icon name="plus" size={14} /> Mantenimiento</button>
        </div>}
      </div>

      {!modalOpen && <>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        {referenceError && <div className="alert alert-error" style={{ marginBottom: 12 }}>No se pudo resolver la referencia: {referenceError}</div>}
        {catalogError && <div className="alert alert-error" style={{ marginBottom: 12 }}>No se pudieron cargar los catálogos: {catalogError}</div>}
        {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      </>}

      {!modalOpen && !sesion.permiteEscritura && <div className="alert alert-warning" style={{ marginBottom: 12 }}>Selecciona una sociedad concreta en la barra superior para poder editar.</div>}

      <section className={`dx-ui dx-list${selected?.tipo === 'mantenimiento' ? ' dx-list-work-hidden' : ''}`} aria-label="Listado de diagnósticos">
        <div className="dx-ui-summary" aria-label="Resumen de diagnósticos">
          <div className="dx-ui-chip"><b>{diagnosticos.length}</b><span>diagnósticos</span></div>
          <div className="dx-ui-chip"><b>{borradoresCount}</b><span>borradores</span></div>
          <div className="dx-ui-chip"><b>{emitidosCount}</b><span>emitidos</span></div>
        </div>
        <div className="dx-ui-card">
          <div className="dx-ui-toolbar">
            <h2>Diagnósticos</h2>
            <span className="dx-ui-count">{filteredDiagnosticos.length} {filteredDiagnosticos.length === 1 ? 'resultado' : 'resultados'}</span>
            <label className="dx-ui-search">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
              <input value={listQuery} onChange={event => setListQuery(event.target.value)} placeholder="Buscar por referencia, cliente o activo…" aria-label="Buscar diagnósticos" />
            </label>
          </div>
          <div className="dx-ui-head dx-list-cols" aria-hidden="true"><span>Tipo</span><span>Referencia</span><span>Estado</span><span>Actualizado</span><span /></div>
          {loadingList ? <div className="dx-ui-empty">Cargando diagnósticos...</div> : !diagnosticos.length ? (
            <div className="dx-ui-empty">No hay diagnósticos registrados.</div>
          ) : !filteredDiagnosticos.length ? (
            <div className="dx-ui-empty">No hay diagnósticos que coincidan con la búsqueda.</div>
          ) : filteredDiagnosticos.map(row => {
            const referenceType = row.tipo === 'fabricacion' ? 'Oportunidad' : 'Recepción';
            const updated = formatListDate(row.updated_at);
            return <div className="dx-ui-row dx-list-cols dx-list-row" key={row.id} role="button" tabIndex={0} onClick={() => openExisting(row)} onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openExisting(row);
              }
            }}>
              <div className="dx-list-type">
                <span className={`dx-ui-icon ${row.tipo === 'fabricacion' ? 'is-cyan' : 'is-violet'}`} aria-hidden="true">{row.tipo === 'fabricacion' ? <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 16l6-6M12.5 3.5a3.5 3.5 0 004.4 4.4l-1.4 1.4-2.8-2.8 1.4-1.4M9 10l5 5 2-2-5-5" /></svg> : <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="3" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>}</span>
                <span>{typeLabel(row.tipo)}</span>
              </div>
              <div className="dx-list-reference">
                <span className="dx-list-ref-line"><span>{referenceType} ·</span> <b>{referenceLabel(row.referencia)}</b></span>
                {(row.referencia?.cliente || row.referencia?.activo) && <span className="dx-list-ref-sub">{[row.referencia?.cliente, row.referencia?.activo].filter(Boolean).join(' · ')}</span>}
              </div>
              <div className="dx-list-state"><span className={`dx-ui-pill ${row.estado === 'emitido' ? 'is-green' : 'is-amber'}`}><i />{statusLabel(row.estado)}</span></div>
              <div className="dx-list-updated"><span>{updated.day}</span>{updated.time && <small>{updated.time}</small>}</div>
              <svg className="dx-ui-arrow" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
            </div>;
          })}
        </div>
      </section>

      {(form.tipo || selected) && <ModalShell
        open
        key={!maintenancePage ? selected?.id || `nuevo-${form.tipo}` : undefined}
        fullPage={maintenancePage}
        pageMode={maintenancePage}
        variant={maintenancePage || selected ? 'dx-modal' : undefined}
        width={selected ? 1160 : 1040}
        titleClassName={selected ? 'dx-modal-title' : ''}
        subtitleClassName={selected ? 'dx-modal-subtitle' : ''}
        statusClassName={selected ? 'dx-modal-status' : ''}
        closeClassName={selected ? 'dx-modal-close' : ''}
        title={detailTitle}
        subtitle={selected ? `${selected.tipo === 'fabricacion' ? 'Oportunidad' : 'Recepción'}: ${referenceLabel(form.referencia)}` : 'Completa la referencia para crear un borrador.'}
        status={<span className={statusClass(selected?.estado)}>{statusLabel(selected?.estado)}</span>}
        dirty={detailDirty || initialDataDirty || (taskPanel && taskPanelHasSelection)}
        busy={modalBusy}
        onClose={closeDetail}
        pageHeader={maintenancePage ? requestClose => {
          if (!selected) return <><header className="dx-work-identity"><div className="dx-work-identity-title"><button type="button" className="dx-work-back-link" onClick={requestClose}>← Diagnósticos</button><h1>Nuevo diagnóstico · Mantenimiento</h1></div><div className="dx-work-identity-status">{selectedReference?.numero && <strong>{selectedReference.numero}</strong>}<span className="dx-ui-pill is-amber"><i />Borrador</span></div></header><div className="dx-work-page-head"><nav className="dx-work-steps" aria-label="Pasos del diagnóstico">{['Recepción','Equipo','Datos','Hallazgos (0)','Informe'].map((label, index) => <button key={label} type="button" className={wizardStep === index + 1 ? 'is-current' : wizardStep > index + 1 ? 'is-done' : ''} aria-current={wizardStep === index + 1 ? 'step' : undefined} disabled={index > 2 || index + 1 > wizardStep} onClick={() => setWizardStep(index + 1)}><i>{wizardStep > index + 1 ? '✓' : index + 1}</i><span>{label}</span></button>)}</nav></div></>;
          const reference = form.referencia || {};
          const title = `${String(reference.activo || selected.hallazgos?.[0]?.componente_parte || 'Equipo').toLocaleUpperCase('es')} · ${reference.cliente || 'Cliente'}`;
          const motivo = selected.motivo || reference.motivo || reference.observaciones || reference.observacion || reference.descripcion || reference.detalle || '—';
          const tecnico = selected.tecnico_nombre || reference.tecnico_asignado || reference.tecnico_nombre || reference.tecnico || '—';
          const fecha = selected.fecha_inspeccion ? new Date(`${selected.fecha_inspeccion}T12:00:00`).toLocaleDateString('es-PE') : reference.fecha_ingreso ? new Date(reference.fecha_ingreso).toLocaleDateString('es-PE') : '—';
          const componente = selected.componente_nombre || reference.componente_nombre || reference.tipo_componente || selected.hallazgos?.[0]?.componente_parte || '—';
          return <><header className="dx-work-identity"><div className="dx-work-identity-title"><button type="button" className="dx-work-back-link" onClick={requestClose}>← Diagnósticos</button><h1>{title}</h1></div><div className="dx-work-identity-status"><strong>{reference.numero || referenceLabel(reference)}</strong><span className={`dx-ui-pill ${selected.estado === 'emitido' ? 'is-green' : 'is-amber'}`}><i />{statusLabel(selected.estado)}</span></div><div className="dx-work-meta"><span><b>Motivo</b> {motivo}</span><span><b>Técnico</b> {tecnico} · {fecha}</span><span><b>Componente</b> {componente}</span></div></header><div className="dx-work-page-head"><nav className="dx-work-steps" aria-label="Pasos del diagnóstico"><button type="button" className={workStep === 1 ? 'is-current' : workStep > 1 ? 'is-done' : ''} aria-current={workStep === 1 ? 'step' : undefined} onClick={() => setWorkStep(1)}><i>{workStep > 1 ? '✓' : '1'}</i><span>Recepción</span></button><button type="button" className={workStep === 2 ? 'is-current' : workStep > 2 ? 'is-done' : ''} aria-current={workStep === 2 ? 'step' : undefined} onClick={() => setWorkStep(2)}><i>{workStep > 2 ? '✓' : '2'}</i><span>Equipo</span></button><button type="button" className={workStep === 3 ? 'is-current' : ''} aria-current={workStep === 3 ? 'step' : undefined} onClick={() => setWorkStep(3)}><i>3</i><span>Datos</span></button></nav></div></>;
        } : null}
        footer={requestClose => selected?.tipo === 'mantenimiento' ? <>
          <div className="dx-work-footer-status">
            {cambiosSinGuardar ? <div className="dx-dirty-count"><i />{cambiosCount} cambio{cambiosCount === 1 ? '' : 's'} sin guardar</div> : <span role="status">{notice || 'Borrador guardado'}</span>}
            {error && <div className="alert alert-error">{error}</div>}
          </div>
          {!informePanel && workStep <= 3 ? <><span className="dx-work-footer-status">{initialDataDirty ? 'Datos iniciales sin guardar' : selected.datos_iniciales_migracion_disponible === false ? 'Datos iniciales: —' : 'Datos del diagnóstico'}</span>{canEditInitialData && <button type="button" className="btn btn-primary dx-action-44" onClick={saveInitialData} disabled={!initialDataDirty || modalBusy}>{modalBusy ? 'Guardando…' : 'Guardar cambios'}</button>}<span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" onClick={() => setWorkStep(4)}>Ir a hallazgos</button></> : !informePanel && hallazgoView === 'lista' ? <><button type="button" className="btn btn-secondary dx-action-44" disabled={!canEditLines || modalBusy} onClick={() => hallazgosAddRef.current?.()}>＋ Agregar hallazgo</button><span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" onClick={goInforme} disabled={modalBusy}>Siguiente: informe</button></> : !informePanel ? <><button type="button" className="btn btn-secondary dx-action-44" onClick={() => { setWorkStep(4); hallazgosBackRef.current?.(); }}>← Volver a hallazgos</button><button type="button" className="btn btn-secondary dx-action-44" onClick={() => window.dispatchEvent(new CustomEvent('dx-show-hallazgo-drawing'))}>Ver dibujo</button><span className="dx-work-spacer" /><button type="button" className="btn btn-secondary dx-action-44" disabled={!canEditLines || modalBusy} onClick={() => hallazgosAddOtroRef.current?.()}>＋ Otro daño en este componente</button><button type="button" className="btn btn-primary dx-action-44" disabled={!canEditLines || modalBusy} onClick={async () => { const result = await hallazgosSaveRef.current?.(); if (result?.ok) setNotice('Hallazgo guardado.'); }}>{modalBusy ? 'Guardando…' : 'Guardar hallazgo'}</button></> : <><button type="button" className="btn btn-secondary dx-action-44" onClick={() => { setInformePanel(false); setWorkStep(4); hallazgosBackRef.current?.(); }}>← Volver a hallazgos</button><span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" onClick={event => event.currentTarget.getRootNode()?.querySelector('.dx-informe-emitir')?.click()}>Emitir informe</button></>}
        </> : <>
          <div style={{ flex: 1 }}>
            {selected && cambiosCount > 0 && <div className="dx-dirty-count"><i />{cambiosCount} cambio{cambiosCount === 1 ? '' : 's'} sin guardar{selected.tipo === 'mantenimiento' && Number(hallazgosDirtySummary.fotos || 0) > 0 ? ` · ${hallazgosDirtySummary.fotos} foto${hallazgosDirtySummary.fotos === 1 ? '' : 's'} pendiente${hallazgosDirtySummary.fotos === 1 ? '' : 's'}` : ''}</div>}
            {slowSaveWarning && <div className="alert alert-warning" style={{ margin: 0 }}>{slowSaveWarning}</div>}
            {error && <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>}
            {referenceError && <div className="alert alert-error" style={{ margin: '8px 0 0' }}>No se pudo resolver la referencia: {referenceError}</div>}
            {catalogError && <div className="alert alert-error" style={{ margin: '8px 0 0' }}>No se pudieron cargar los catálogos: {catalogError}</div>}
            {notice && <div className="alert alert-success" style={{ margin: '8px 0 0' }}>{notice}</div>}
          </div>
          <button type="button" className="btn btn-secondary" onClick={requestClose}>Cerrar</button>
          {selected && canEditLines && <>
            {!cambiosSinGuardar && !modalBusy && <span className="dx-save-status" role="status">Sin cambios por guardar</span>}
            <button type="button" className="btn btn-primary dx-save" onClick={saveAll} disabled={!cambiosSinGuardar || modalBusy} title={!cambiosSinGuardar && !modalBusy ? 'No hay cambios por guardar' : undefined}>{modalBusy ? 'Guardando...' : 'Guardar todo'}</button>
          </>}
          {!selected && canSave && (form.tipo === 'mantenimiento' ? <div className="dx-wizard-footer"><button type="button" className="btn btn-secondary" onClick={requestClose}>← Diagnósticos</button>{wizardStep > 1 && <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(step => step - 1)}>← Anterior</button>}<span className="dx-work-spacer" /><button className="btn btn-primary" type="submit" form="diagnostico-cabecera-form" disabled={saving || !initialStepValid || !sesion.permiteEscritura}>{saving ? 'Creando…' : wizardStep === 3 ? 'Crear borrador y continuar' : 'Siguiente'}</button></div> : <button className="btn btn-primary" type="submit" form="diagnostico-cabecera-form" disabled={saving || !initialStepValid || !sesion.permiteEscritura}>{saving ? 'Guardando...' : 'Guardar'}</button>)}
        </>}
      >
        {readOnlyReason && <div className="alert alert-warning diagnostico-readonly-alert">{readOnlyReason}</div>}
        {!selected && <div className="dx-initial-flow"><form id="diagnostico-cabecera-form" onSubmit={event => { if (form.tipo === 'mantenimiento' && wizardStep < 3) { event.preventDefault(); setWizardStep(step => Math.min(3, step + 1)); return; } save(event); }}>
          {form.tipo === 'mantenimiento' ? wizardStep === 1 ? <div className="dx-initial-step">
            <section className="dx-initial-card"><div className="field"><label>Buscar por número, cliente o activo…</label><input className="input" role="combobox" aria-label="Buscar por número, cliente o activo" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por número, cliente o activo…" /></div></section>
            <section className="dx-initial-list" role="radiogroup" aria-label="Recepciones disponibles">{loadingReferences ? <p className="muted">Buscando recepciones…</p> : references.length ? references.map(reference => { const borradores = diagnosticos.filter(row => row.tipo === 'mantenimiento' && row.recepcion_id === reference.id && row.estado === 'borrador'); return <button key={reference.id} type="button" role="radio" aria-checked={selectedReference?.id === reference.id} className={`dx-initial-receipt${selectedReference?.id === reference.id ? ' is-selected' : ''}`} onClick={() => selectInitialReference(reference)}><i className="dx-initial-radio"/><span className="dx-initial-receipt-copy"><strong>{reference.activo || 'Equipo sin nombre'}</strong><small>{reference.numero || referenceLabel(reference)} · {reference.cliente || 'Cliente'}{reference.fecha_ingreso ? ` · ingreso ${new Date(reference.fecha_ingreso).toLocaleDateString('es-PE')}` : ''}</small></span>{borradores.length > 0 && <span className="dx-ui-pill is-amber">{borradores.length} borradores</span>}<span className="dx-ui-pill">{reference.estado || 'Recibido'}</span></button>; }) : <p className="muted">No hay recepciones que coincidan.</p>}</section>
            {selectedReference && (() => { const borradores = diagnosticos.filter(row => row.tipo === 'mantenimiento' && row.recepcion_id === selectedReference.id && row.estado === 'borrador'); return borradores.length ? <div className="dx-initial-warning">Esta recepción ya tiene {borradores.length} diagnósticos en borrador. Puedes abrir uno de ellos en vez de crear otro. {borradores.map(row => <button key={row.id} type="button" onClick={() => openExisting(row)}>Abrir borrador</button>)}</div> : null; })()}
          </div> : wizardStep === 2 ? <div className="dx-initial-step">
            {equipoInicio && <section className="dx-initial-card"><h2>Equipo recibido</h2><dl className="dx-work-reception-grid"><div><dt>Equipo</dt><dd>{equipoInicio.activo.nombre || equipoInicio.activo.codigo}</dd></div><div><dt>Cliente</dt><dd>{selectedReference?.cliente || '—'}</dd></div><div><dt>Marca / modelo</dt><dd>{[equipoInicio.activo.marca, equipoInicio.activo.modelo].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Serie</dt><dd>{equipoInicio.activo.placa_serie || '—'}</dd></div><div><dt>Recepción</dt><dd>{selectedReference?.numero || referenceLabel(selectedReference)}</dd></div></dl></section>}
            {equipoInicio?.activo.tipo_activo === 'maquinaria_completa' ? <section className="dx-initial-card"><span className="dx-ui-pill">Máquina completa</span><p>No hace falta elegir un tipo ahora: en cada hallazgo eliges qué componente evalúas.</p></section> : <section className="dx-initial-card"><h2>Tipo de componente</h2>{equipoInicio?.componente && !datosIniciales.corregirComponente ? <><span className="dx-ui-pill">Viene de la recepción</span><div className="dx-initial-component"><div className="dx-initial-thumb" dangerouslySetInnerHTML={{ __html: sanitizarSvgCatalogo(equipoInicio.componente.svg || '') }}/><strong>{equipoInicio.componente.nombre}</strong><button type="button" className="btn btn-secondary" onClick={() => setDatosIniciales(current => ({ ...current, corregirComponente: true }))}>Corregir tipo</button></div></> : <><p className="dx-initial-warning">{equipoInicio?.componente ? 'Elige el tipo correcto.' : 'Este equipo todavía no tiene tipo de componente. Se guarda en el equipo y las próximas recepciones y diagnósticos ya lo traen.'}</p><div className="dx-initial-component-grid">{componentesInicio.map(componente => <button type="button" key={componente.id} aria-pressed={datosIniciales.componente_catalogo_id === componente.id} className={datosIniciales.componente_catalogo_id === componente.id ? 'is-selected' : ''} onClick={async () => { setDatosIniciales(current => ({ ...current, componente_catalogo_id: componente.id })); try { await asignarComponenteCatalogoActivo(empresaId, equipoInicio.activo.id, componente.id); setEquipoInicio(current => current ? { ...current, componente } : current); setDatosIniciales(current => ({ ...current, corregirComponente: false })); } catch (saveError) { setDatosInicioError(errorMessage(saveError)); } }}><div className="dx-initial-thumb" dangerouslySetInnerHTML={{ __html: sanitizarSvgCatalogo(componente.svg || '') }}/><strong>{componente.nombre}</strong></button>)}<button type="button" onClick={async () => { setDatosIniciales(current => ({ ...current, componente_catalogo_id: 'otro' })); try { await asignarComponenteCatalogoActivo(empresaId, equipoInicio.activo.id, null); setEquipoInicio(current => current ? { ...current, componente: null } : current); setDatosIniciales(current => ({ ...current, corregirComponente: false })); } catch (saveError) { setDatosInicioError(errorMessage(saveError)); } }}>Otro tipo · sin dibujo</button></div></>}</section>}
          </div> : <div className="dx-initial-step">
            <section className="dx-initial-card"><div className="field"><label>Motivo o falla reportada por el cliente *</label><textarea className="input" rows="4" value={datosIniciales.motivo} onChange={event => setDatosIniciales(current => ({ ...current, motivo: event.target.value }))}/></div></section>
            <section className="dx-initial-card"><strong>Trabajos a evaluar *</strong><div className="dx-initial-chips">{familiasInicio.map(familia => <button key={familia.id} type="button" aria-pressed={datosIniciales.trabajos_evaluar.includes(familia.id)} onClick={() => setDatosIniciales(current => ({ ...current, trabajos_evaluar: current.trabajos_evaluar.includes(familia.id) ? current.trabajos_evaluar.filter(id => id !== familia.id) : [...current.trabajos_evaluar, familia.id] }))}>{familia.nombre}</button>)}</div><small>Puedes marcar varios. Cada hallazgo se asocia a uno de ellos.</small></section>
            <section className="dx-initial-card dx-initial-grid"><div className="field"><label>Técnico responsable *</label><select className="input" value={datosIniciales.tecnico_id} onChange={event => setDatosIniciales(current => ({ ...current, tecnico_id: event.target.value }))}><option value="">Elige…</option>{tecnicosInicio.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>)}</select></div><div className="field"><label>Fecha de inspección</label><input className="input" type="date" value={datosIniciales.fecha_inspeccion} onChange={event => setDatosIniciales(current => ({ ...current, fecha_inspeccion: event.target.value }))}/></div></section>
          </div> : <div className="dx-initial-step"><div className="card-body dx-wizard-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}><div className="field"><label>Tipo</label><input className="input" value={typeLabel(form.tipo)} disabled /></div><ReferenceSelector tipo={form.tipo} value={selectedReference} search={search} references={references} loading={loadingReferences} disabled={false} onSearch={setSearch} onSelect={reference => { setForm(current => ({ ...current, referencia: reference })); setSearch(referenceLabel(reference)); }} /></div></div>}
          {datosInicioError && <div className="alert alert-error" role="alert">{datosInicioError}</div>}
        </form></div>}
        {selected && <div className={`dx-scope${selected.tipo === 'mantenimiento' && informePanel ? ' dx-work-editing-report' : ''}`}>
          {selected.tipo === 'mantenimiento' && <div className="dx-work-page-head"><nav className="dx-work-steps" aria-label="Pasos del diagnóstico">
            {[1, 2, 3].map((step, index) => <button key={step} className={workStep === step ? 'is-current' : workStep > step ? 'is-done' : ''} type="button" aria-current={workStep === step ? 'step' : undefined} onClick={() => { setWorkStep(step); setInformePanel(false); }}><i>{workStep > step ? '✓' : step}</i><span>{step} · {['Recepción', 'Equipo', 'Datos'][index]}</span></button>)}
            <button className={workStep === 4 ? 'is-current' : workStep > 4 ? 'is-done' : ''} type="button" aria-current={workStep === 4 ? 'step' : undefined} onClick={() => { setWorkStep(4); setInformePanel(false); }}><i>4</i><span>Hallazgos ({selected.hallazgos?.length || 0})</span></button>
            <button className={workStep === 5 ? 'is-current' : ''} type="button" aria-current={workStep === 5 ? 'step' : undefined} onClick={() => { if (!informePanel) goInforme(); }}><i>5</i><span>Informe</span></button>
          </nav></div>}
          {access.ver && <DiagnosticoEstadoPanel empresaId={empresaId} diagnostico={selected} puedeAprobar={access.aprobar} permiteEscritura={Boolean(sesion.permiteEscritura)} cambiosSinGuardar={cambiosSinGuardar} onCambioCompleto={recargarEstadoDiagnostico} informeAction={informeAccess.ver && selected.tipo === 'mantenimiento' ? <button type="button" className="btn btn-secondary" onClick={() => { setInformePanel(true); setWorkStep(5); }}>Informe al cliente</button> : null} />}
          {!access.ver && informeAccess.ver && selected.tipo === 'mantenimiento' && <div className="dx-inf-open-row"><button type="button" className="btn btn-secondary" onClick={() => { setInformePanel(true); setWorkStep(5); }}>Informe al cliente</button></div>}
          <div className="dx-summary" style={selected.tipo === 'mantenimiento' && (informePanel || hallazgoView === 'editor') ? { display: 'none' } : undefined}>
            <div className="dx-summary-chips"><span><b>{grupos.length}</b> trabajos</span><span><b>{lineasActuales.length}</b> tareas</span><span><b>{totalHH.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</b> horas-hombre</span><span><b>{totalHM.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</b> horas-máquina</span></div>
          </div>
          {selected.tipo === 'mantenimiento' && workStep <= 3 && !informePanel && <div className="dx-initial-flow dx-existing-initial-flow">
            {workStep === 1 && <section className="dx-initial-card"><h2>Equipo recibido</h2><dl className="dx-work-reception-grid"><div><dt>Equipo</dt><dd>{form.referencia?.activo || selected.activo_nombre || '—'}</dd></div><div><dt>Cliente</dt><dd>{form.referencia?.cliente || '—'}</dd></div><div><dt>Marca / modelo</dt><dd>{[form.referencia?.marca, form.referencia?.modelo].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Serie</dt><dd>{form.referencia?.numero_serie || form.referencia?.placa_serie || '—'}</dd></div><div><dt>Recepción</dt><dd>{form.referencia?.numero || '—'}</dd></div><div><dt>Fecha de ingreso</dt><dd>{form.referencia?.fecha_ingreso ? new Date(form.referencia.fecha_ingreso).toLocaleDateString('es-PE') : '—'}</dd></div></dl></section>}
            {workStep === 2 && <><section className="dx-initial-card"><h2>Equipo recibido</h2><dl className="dx-work-reception-grid"><div><dt>Equipo</dt><dd>{form.referencia?.activo || selected.activo_nombre || '—'}</dd></div><div><dt>Cliente</dt><dd>{form.referencia?.cliente || '—'}</dd></div><div><dt>Marca / modelo</dt><dd>{[form.referencia?.marca, form.referencia?.modelo].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Serie</dt><dd>{form.referencia?.numero_serie || form.referencia?.placa_serie || '—'}</dd></div></dl></section><section className="dx-initial-card"><h2>Tipo de componente</h2>{selected.componente_nombre ? <div className="dx-initial-component"><div className="dx-initial-thumb" dangerouslySetInnerHTML={{ __html: sanitizarSvgCatalogo(selected.componente_svg || '') }} /><strong>{selected.componente_nombre}</strong></div> : <p>—</p>}</section></>}
            {workStep === 3 && <><section className="dx-initial-card"><div className="field"><label>Motivo o falla reportada por el cliente</label><textarea className="input" rows="4" value={datosIniciales.motivo} disabled={!canEditInitialData} onChange={event => setDatosIniciales(current => ({ ...current, motivo: event.target.value }))} placeholder="—" /></div></section><section className="dx-initial-card"><strong>Trabajos a evaluar</strong><div className="dx-initial-chips">{familiasInicio.map(familia => <button key={familia.id} type="button" aria-pressed={datosIniciales.trabajos_evaluar.includes(familia.id)} disabled={!canEditInitialData} onClick={() => setDatosIniciales(current => ({ ...current, trabajos_evaluar: current.trabajos_evaluar.includes(familia.id) ? current.trabajos_evaluar.filter(id => id !== familia.id) : [...current.trabajos_evaluar, familia.id] }))}>{familia.nombre}</button>)}{!familiasInicio.length && <span>—</span>}</div></section><section className="dx-initial-card dx-initial-grid"><div className="field"><label>Técnico responsable</label><select className="input" value={datosIniciales.tecnico_id} disabled={!canEditInitialData} onChange={event => setDatosIniciales(current => ({ ...current, tecnico_id: event.target.value }))}><option value="">{selected.tecnico_nombre || '—'}</option>{tecnicosInicio.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>)}</select></div><div className="field"><label>Fecha de inspección</label><input className="input" type="date" value={datosIniciales.fecha_inspeccion} disabled={!canEditInitialData} onChange={event => setDatosIniciales(current => ({ ...current, fecha_inspeccion: event.target.value }))} /></div></section></>}
          </div>}
          <div className={`${selected.tipo === 'fabricacion' ? 'dx-body dx-body-fabricacion' : 'dx-body'}${selected.tipo === 'mantenimiento' && (informePanel || workStep <= 3) ? ' dx-work-hidden' : ''}${selected.tipo === 'mantenimiento' && hallazgoView === 'editor' ? ' dx-hallazgo-editor-mode' : ''}`} data-active-work-step={selected.tipo === 'mantenimiento' ? (workStep <= 3 ? 'summary' : 'findings') : undefined}>
            {selected.tipo === 'mantenimiento' && form.referencia?.activo && <div className="dx-muted">Activo: {form.referencia.activo}</div>}
            {selected.tipo === 'mantenimiento' ? <>
              <section className="dx-diagnostico-resumen-section dx-work-reception-summary" aria-labelledby="dx-recepcion-title">
                <header className="dx-diagnostico-resumen-heading"><span>✓</span><div><h3 id="dx-recepcion-title">Recepción del equipo</h3><p>Datos registrados al recibir el activo.</p></div></header>
                <dl className="dx-work-reception-grid">
                  <div><dt>Activo</dt><dd>{form.referencia?.activo || 'Sin activo registrado'}</dd></div>
                  <div><dt>Cliente</dt><dd>{form.referencia?.cliente || 'Sin cliente registrado'}</dd></div>
                  <div><dt>Recepción</dt><dd>{form.referencia?.numero || referenceLabel(form.referencia)}</dd></div>
                  <div><dt>Fecha de ingreso</dt><dd>{form.referencia?.fecha_ingreso ? new Date(form.referencia.fecha_ingreso).toLocaleDateString('es-PE') : 'Fecha pendiente'}</dd></div>
                  <div><dt>Número de serie</dt><dd>{form.referencia?.numero_serie || 'Sin número de serie'}</dd></div>
                  <div><dt>Técnico asignado</dt><dd>{form.referencia?.tecnico_asignado || form.referencia?.tecnico_nombre || form.referencia?.tecnico || 'Sin técnico asignado'}</dd></div>
                  <div className="is-wide"><dt>Motivo / observaciones</dt><dd>{form.referencia?.motivo || form.referencia?.observaciones || form.referencia?.observacion || form.referencia?.descripcion || form.referencia?.detalle || 'Sin observaciones registradas'}</dd></div>
                </dl>
              </section>
              <section className="dx-diagnostico-resumen-section" aria-labelledby="dx-hallazgos-title">
                <header className="dx-diagnostico-resumen-heading"><span>1</span><div><h3 id="dx-hallazgos-title">Hallazgos</h3><p>Registra las condiciones encontradas y las acciones recomendadas.</p></div></header>
                <div className="dx-hallazgos">
                  <HallazgosTrabajoPanel empresaId={empresaId} diagnostico={selected} lines={selected.lineas || []} familias={catalogs.familias} tipos={catalogs.tipos} cargos={catalogs.cargos} activos={catalogs.activos} extraFamilyIds={extraFamilyIds} onExtraFamilyIdsChange={setExtraFamilyIds} onCreateFamily={crearFamilia} onRemoveFamilyLines={queueFamilyLineDeletes} canEdit={canEditLines} readOnly={isReadOnly} onRegisterSave={saveFunction => { hallazgosSaveRef.current = saveFunction; }} onRegisterAddHallazgo={add => { hallazgosAddRef.current = add; }} onRegisterAddOtro={add => { hallazgosAddOtroRef.current = add; }} onRegisterBackToList={back => { hallazgosBackRef.current = back; }} onViewChange={view => { setHallazgoView(view); setWorkStep(4); setInformePanel(false); }} onRegisterGoToIncomplete={goTo => { goToIncompleteHallazgoRef.current = goTo; }} onDirtyChange={setHallazgosDirty} onDirtySummary={setHallazgosDirtySummary} onItemsChange={items => setSelected(current => current?.id === selected.id ? { ...current, hallazgos: items } : current)} onSavingChange={setHallazgosSaving} onError={message => setError(message || '')} onNotice={setNotice} />
                </div>
              </section>
              <section className="dx-diagnostico-resumen-section" aria-labelledby="dx-diagnostico-resumen-title">
                <header className="dx-diagnostico-resumen-heading"><span>2</span><div><h3 id="dx-diagnostico-resumen-title">Diagn&#xF3;stico</h3><p>Resumen de los hallazgos y sus acciones recomendadas. Es el mismo texto del informe al cliente.</p></div></header>
                {resumenVisible || selected.resumen_origen === 'editado' ? <div className="dx-diagnostico-resumen-card">
                  <textarea aria-label="Diagn&#xF3;stico" value={resumenVisible} disabled={!canEditLines || generandoResumenIA} onChange={event => cambiarResumen(event.target.value)} />
                  <div className="dx-diagnostico-resumen-meta"><div><strong className={selected.resumen_origen === 'editado' ? 'is-edited' : 'is-auto'}>{selected.resumen_origen === 'editado' ? 'Editado' : 'Generado con IA'}</strong><small>{selected.resumen_origen === 'editado' ? 'Si generas de nuevo se reemplaza tu texto (se pide confirmación).' : 'Puedes editarlo. No cambia solo si cambian los hallazgos.'}</small></div>{canEditLines && <button type="button" className="dx-diagnostico-resumen-regenerate" onClick={() => selected.resumen_origen === 'editado' && resumenVisible.trim() ? setConfirmarRegenerarResumen(true) : generarResumenIA()} disabled={generandoResumenIA || !(selected.hallazgos || []).length || hallazgosIncompletosCount > 0} aria-busy={generandoResumenIA}>{generandoResumenIA ? 'Generando…' : 'Generar de nuevo con IA'}</button>}</div>
                  {hallazgosIncompletosCount > 0 && <div className="dx-diagnostico-resumen-blocked">Completa o elimina los hallazgos incompletos. <button type="button" onClick={() => goToIncompleteHallazgoRef.current?.()}>Ir al hallazgo</button></div>}{confirmarRegenerarResumen && <div className="dx-diagnostico-resumen-confirm" role="dialog" aria-modal="true" aria-label="Confirmar generación del diagnóstico"><span>Se reemplazará tu texto editado. ¿Deseas continuar?</span><div><button type="button" onClick={generarResumenIA}>Generar de nuevo</button><button type="button" onClick={() => setConfirmarRegenerarResumen(false)}>Cancelar</button></div></div>}
                  {errorResumenIA && <div className="dx-diagnostico-resumen-error" role="alert">{errorResumenIA}</div>}
                  <div className="dx-diagnostico-resumen-report"><span aria-hidden="true">✓</span> Este texto también aparece en el Informe al cliente</div>
                </div> : <div className="dx-diagnostico-resumen-empty"><p>Aún no hay diagnóstico. La IA lo redacta a partir de los hallazgos y sus acciones recomendadas, y luego puedes editarlo.</p><div><button type="button" className="dx-diagnostico-resumen-primary" onClick={generarResumenIA} disabled={!canEditLines || generandoResumenIA || !(selected.hallazgos || []).length || hallazgosIncompletosCount > 0} aria-busy={generandoResumenIA}>{generandoResumenIA ? 'Generando…' : 'Generar conclusión IA'}</button><button type="button" className="dx-diagnostico-resumen-regenerate" onClick={iniciarResumenManual} disabled={!canEditLines}>Escribir yo mismo</button></div>{hallazgosIncompletosCount > 0 && <div className="dx-diagnostico-resumen-blocked">Completa o elimina los hallazgos incompletos. <button type="button" onClick={() => goToIncompleteHallazgoRef.current?.()}>Ir al hallazgo</button></div>}{!(selected.hallazgos || []).length && <small>Registra al menos un hallazgo</small>}{errorResumenIA && <div className="dx-diagnostico-resumen-error" role="alert">{errorResumenIA}</div>}</div>}
              </section>
              <section className="dx-diagnostico-resumen-section" aria-labelledby="dx-trabajos-realizar-title">
                <header className="dx-diagnostico-resumen-heading"><span>3</span><div><h3 id="dx-trabajos-realizar-title">Trabajos a realizar</h3><p>Define las tareas, recursos y tiempos para atender los hallazgos.</p></div>{canEditLines && <button type="button" className="dx-diagnostico-resumen-add" aria-expanded={Boolean(taskPanel)} onClick={toggleTaskPanel}>{taskPanel ? 'Cerrar panel' : 'Agregar trabajos'}</button>}</header>
                <div className="dx-info">Cada tarea lleva sus propias horas: <b>horas-hombre</b> (trabajo del cargo elegido) y <b>horas-máquina</b> (uso del activo propio, si aplica).</div>
                {taskPanel && <DiagnosticoAgregarTareasPanel familias={catalogs.familias} tipos={catalogs.tipos} cargos={catalogs.cargos} activos={catalogs.activos} plantillas={plantillasActividad} tipoDiagnostico={selected.tipo} lineas={selected.lineas || []} onClose={closeTaskPanel} onSelectionChange={setTaskPanelHasSelection} onAdd={(rows, duplicates = 0) => { appendCascadeLines(rows); setNotice(`${rows.length ? `Se agregaron ${rows.length} tarea${rows.length === 1 ? '' : 's'}` : 'No se agregaron tareas'}${duplicates ? `; ${duplicates} duplicada${duplicates === 1 ? '' : 's'} omitida${duplicates === 1 ? '' : 's'}` : ''}.`); window.requestAnimationFrame(() => (tableAnchorRef.current?.focus({ preventScroll: true }), tableAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))); }} onCreateFamily={crearFamilia} onCreateType={crearTipo} />}
                <div ref={tableAnchorRef} className="dx-agregar-inline-table-anchor" tabIndex="-1" aria-label="Líneas del diagnóstico">
                  {loadingCatalogs ? <div className="dx-empty">Cargando catálogos...</div> : catalogError ? <div className="dx-empty" role="alert">No se pudieron cargar los catálogos: {catalogError}</div> : !grupos.length ? <div className="dx-empty">Aún no hay trabajos</div> : <DiagnosticoLineasTabla lines={grupos.flatMap(group => group.lines)} catalogs={catalogs} canEdit={canEditLines} Selector={CatalogSelector} onDelete={deleteLine} validationErrors={lineValidationErrors} onChange={(line, changes) => { if (!line) { setSelected(current => ({ ...current, lineas: [...(current.lineas || []), changes] })); return; } patchLine(line, changes); const key = lineKey(line); setLineValidationErrors(current => { const next = { ...current }; delete next[key]; return next; }); }} onError={lineError => setError(errorMessage(lineError))} />}
                </div>
              </section>
            </> : <>
              <section className="dx-diagnostico-resumen-section" aria-labelledby="dx-trabajos-fabricacion-title"><header className="dx-diagnostico-resumen-heading is-unumbered"><div><h3 id="dx-trabajos-fabricacion-title">Trabajos a realizar</h3><p>Define las tareas, recursos y tiempos para este trabajo.</p></div>{canEditLines && <button type="button" className="dx-diagnostico-resumen-add" aria-expanded={Boolean(taskPanel)} onClick={toggleTaskPanel}>{taskPanel ? 'Cerrar panel' : 'Agregar tareas'}</button>}</header>
              {taskPanel && <DiagnosticoAgregarTareasPanel familias={catalogs.familias} tipos={catalogs.tipos} cargos={catalogs.cargos} activos={catalogs.activos} plantillas={plantillasActividad} tipoDiagnostico={selected.tipo} lineas={selected.lineas || []} onClose={closeTaskPanel} onSelectionChange={setTaskPanelHasSelection} onAdd={(rows, duplicates = 0) => { appendCascadeLines(rows); setNotice(`${rows.length ? `Se agregaron ${rows.length} tarea${rows.length === 1 ? '' : 's'}` : 'No se agregaron tareas'}${duplicates ? `; ${duplicates} duplicada${duplicates === 1 ? '' : 's'} omitida${duplicates === 1 ? '' : 's'}` : ''}.`); window.requestAnimationFrame(() => (tableAnchorRef.current?.focus({ preventScroll: true }), tableAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))); }} onCreateFamily={crearFamilia} onCreateType={crearTipo} />}
              <div ref={tableAnchorRef} className="dx-agregar-inline-table-anchor" tabIndex="-1" aria-label="Líneas del diagnóstico">
                {loadingCatalogs ? <div className="dx-empty">Cargando catálogos...</div> : catalogError ? <div className="dx-empty" role="alert">No se pudieron cargar los catálogos: {catalogError}</div> : !grupos.length ? <div className="dx-empty">Aún no hay trabajos</div> : <DiagnosticoLineasTabla lines={grupos.flatMap(group => group.lines)} catalogs={catalogs} canEdit={canEditLines} Selector={CatalogSelector} onDelete={deleteLine} validationErrors={lineValidationErrors} onChange={(line, changes) => { if (!line) { setSelected(current => ({ ...current, lineas: [...(current.lineas || []), changes] })); return; } patchLine(line, changes); const key = lineKey(line); setLineValidationErrors(current => { const next = { ...current }; delete next[key]; return next; }); }} onError={lineError => setError(errorMessage(lineError))} />}
              </div></section>
            </>}
            {isReadOnly && <div className="muted" style={{ marginTop: 12 }}>Los diagnósticos emitidos son de solo lectura.</div>}
          </div>
          {informePanel && <>
          <section className="dx-diagnostico-resumen-section dx-report-diagnosis-card" aria-labelledby="dx-report-diagnosis-title">
            <header className="dx-diagnostico-resumen-heading"><span>2</span><div><h3 id="dx-report-diagnosis-title">Diagnóstico</h3><p>Redacta y guarda el diagnóstico antes de emitir el informe al cliente.</p></div></header>
            <div className="dx-diagnostico-resumen-card">
              <textarea aria-label="Diagnóstico" value={resumenVisible} disabled={!canEditLines || generandoResumenIA} onChange={event => cambiarResumen(event.target.value)} placeholder="Describe la evaluación, causa y conclusión técnica…" />
              <div className="dx-diagnostico-resumen-meta"><div><strong className={selected.resumen_origen === 'editado' ? 'is-edited' : 'is-auto'}>{selected.resumen_origen === 'editado' ? 'Editado' : 'Generado con IA'}</strong><small>Este texto se incluirá en el informe al cliente.</small></div><div>{canEditLines && <button type="button" className="dx-diagnostico-resumen-regenerate" onClick={() => selected.resumen_origen === 'editado' && resumenVisible.trim() ? setConfirmarRegenerarResumen(true) : generarResumenIA()} disabled={generandoResumenIA || !(selected.hallazgos || []).length || hallazgosIncompletosCount > 0} aria-busy={generandoResumenIA}>{generandoResumenIA ? 'Generando…' : 'Generar con IA'}</button>}<button type="button" className="dx-diagnostico-resumen-regenerate" onClick={guardarResumenParaInforme} disabled={!canEditLines || !summaryDirty}>Guardar diagnóstico</button></div></div>
              {errorResumenIA && <div className="dx-diagnostico-resumen-error" role="alert">{errorResumenIA}</div>}
            </div>
          </section>
          <DiagnosticoInformePanel diagnostico={{ ...selected, resumen_diagnostico: resumenVisible }} catalogos={{ ...catalogs, tipos_dano: catalogs.hallazgos.tipo_dano, causas_probables: catalogs.hallazgos.causa_probable }} cabecera={{ recepcion_id: form.referencia?.id || selected.recepcion_id, numero_recepcion: form.referencia?.numero || null, fecha_recepcion: form.referencia?.fecha_ingreso || null, activo_nombre: form.referencia?.activo || null, cliente_razon_social: form.referencia?.cliente || null, numero_serie: form.referencia?.numero_serie || null, horometro: null }} puedeVer={informeAccess.ver} puedeEditar={informeAccess.editar && access.editar && Boolean(sesion.permiteEscritura)} puedeEmitirDiagnostico={access.aprobar && Boolean(sesion.permiteEscritura)} firmaUrl={sesion.sociedadActiva?.firma_url || null} onEmitirDiagnostico={async () => {
            const resultado = await emitirDiagnosticoTecnico(selected.id);
            try { await recargarEstadoDiagnostico(resultado); } catch { /* La emisión ya terminó; se vuelve a cargar al completar el flujo. */ }
            return resultado;
          }} onRecargarDiagnostico={() => recargarEstadoDiagnostico()} cambiosSinGuardar={cambiosSinGuardar} resumenPendiente={summaryDirty} onResumenChange={(value, origen) => cambiarResumen(value, origen)} onGuardarResumen={guardarResumenParaInforme} onGuardarDiagnosticoPendiente={async () => {
            const linesSaved = await saveAllLines();
            if (!linesSaved) throw new Error('No se pudieron guardar las tareas. Corrige los errores antes de generar la conclusión.');
            if (hallazgosDirty) {
              const result = await hallazgosSaveRef.current?.();
              if (!result?.ok) throw new Error(result?.error || 'No se pudieron guardar los hallazgos.');
            }
            if (summaryDirty) await guardarResumenParaInforme();
          }} onClose={() => { setInformePanel(false); setWorkStep(4); }} />
          </>}
        </div>}
      </ModalShell>}
    </main>
  );
}
