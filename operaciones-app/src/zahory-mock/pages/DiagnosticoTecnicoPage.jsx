import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../components/shell.jsx';
import { ModalShell } from '../components/ModalShell.jsx';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import {
  buscarOCrearFamiliaTrabajo,
  buscarOCrearTipoServicioInterno,
  crearDiagnosticoTecnico,
  eliminarDiagnosticoLinea,
  guardarDiagnosticoLinea,
  listarActivosPropios,
  listarCargosEmpresa,
  listarDiagnosticosTecnicos,
  listarFamiliasTrabajo,
  listarReferenciasDiagnostico,
  listarTiposServicioInterno,
  obtenerDiagnosticoLinea,
  obtenerDiagnosticoTecnico,
  resolverReferenciasDiagnostico,
  sincronizarMaterialesLinea,
  usuarioPuedeDiagnostico,
} from '../../services/diagnosticoTecnicoService.js';

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

function LineEditor({ line, catalogs, canEdit, canCreateCatalog, saving, validationErrors, onChange, onSave, onDelete, onError }) {
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
          <CatalogSelector label="Actividad (opcional)" kind="tipo" value={selected(catalogs.tipos, line.actividad_id, 'tipo')} options={catalogs.tipos} disabled={!canEdit} placeholder="Buscar actividad..." canCreate={canEdit && canCreateCatalog} clearable onSelect={item => patch({ actividad_id: item?.id || null })} onCreate={catalogs.crearTipo} onError={onError} />
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

export function DiagnosticoTecnicoPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const usuarioId = sesion.usuario?.id;
  const [access, setAccess] = useState({ loading: true, ver: false, crear: false, editar: false, error: '' });
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
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
  const [catalogs, setCatalogs] = useState({ familias: [], tipos: [], cargos: [], activos: [] });
  const [lineValidationErrors, setLineValidationErrors] = useState({});
  const [slowSaveWarning, setSlowSaveWarning] = useState('');
  const openRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const modalSessionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const canCreate = access.ver && access.crear;
  const isReadOnly = selected?.estado === 'emitido';
  const canEditLines = access.editar && !isReadOnly && Boolean(sesion.permiteEscritura);
  const canSave = !selected && canCreate;
  const selectedReference = form.referencia;

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
          setAccess({ loading: false, ver: false, crear: false, editar: false, error: '' });
          return;
        }
        const [crear, editar] = await Promise.all([
          usuarioPuedeDiagnostico(empresaId, 'crear'),
          usuarioPuedeDiagnostico(empresaId, 'editar'),
        ]);
        if (!vigente) return;
        setAccess({ loading: false, ver: true, crear, editar, error: '' });
      } catch (permissionError) {
        if (vigente) setAccess({ loading: false, ver: false, crear: false, editar: false, error: errorMessage(permissionError) });
      }
    })();
    return () => { vigente = false; };
  }, [empresaId, sesion.estado]);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  useEffect(() => {
    let vigente = true;
    if (!selected || !access.ver || !empresaId) return () => { vigente = false; };
    setLoadingCatalogs(true);
    setCatalogError('');
    Promise.all([listarFamiliasTrabajo(empresaId), listarTiposServicioInterno(empresaId), listarCargosEmpresa(empresaId), listarActivosPropios(empresaId)])
      .then(([familias, tipos, cargos, activos]) => {
        if (vigente) setCatalogs({ familias, tipos, cargos, activos });
      })
      .catch(loadError => { if (vigente) setCatalogError(errorMessage(loadError)); })
      .finally(() => { if (vigente) setLoadingCatalogs(false); });
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
    setForm({ ...EMPTY_FORM, tipo });
    setSearch('');
    setReferenceError('');
    setCatalogError('');
    setNotice('');
    setError('');
  };

  const openExisting = async diagnostico => {
    const requestId = ++openRequestRef.current;
    setError('');
    setReferenceError('');
    setNotice('');
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
      setForm({ tipo: detail.tipo, referencia: reference });
      setSearch('');
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

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
    const session = modalSessionRef.current;
    const isActive = () => mountedRef.current && modalSessionRef.current === session;
    try {
      const created = await crearDiagnosticoTecnico(empresaId, usuarioId, {
        tipo: form.tipo,
        oportunidad_id: form.tipo === 'fabricacion' ? selectedReference?.id : null,
        recepcion_id: form.tipo === 'mantenimiento' ? selectedReference?.id : null,
      });
      if (isActive()) setNotice('Diagnóstico guardado en borrador.');
      await cargarLista();
      if (!isActive()) return;
      await openExisting(created);
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
        lineas: (current.lineas || []).map(item => lineKey(item) === key ? refreshed : item),
      }));
      if (isActive()) setLineValidationErrors(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (isActive()) setNotice('Línea guardada.');
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
    } finally {
      if (isActive()) {
        setSavingLine(null);
        setSlowSaveWarning('');
      }
    }
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

  const crearTipo = async nombre => {
    const created = await buscarOCrearTipoServicioInterno(empresaId, nombre);
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
    setForm(EMPTY_FORM);
    setSearch('');
    setError('');
    setReferenceError('');
    setCatalogError('');
    setNotice('');
  };
  const detailDirty = selected
    ? (selected.lineas || []).some(line => line._dirty)
    : Boolean(form.referencia);
  const modalBusy = saving || Boolean(savingLine);
  const modalOpen = Boolean(form.tipo || selected);
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

  return (
    <main className="ops-page" style={{ padding: 24, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
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

      <div className="card" style={{ marginBottom: 18, width: '100%' }}>
        <div className="card-header"><h2 style={{ margin: 0, fontSize: 17 }}>Diagnósticos</h2></div>
        {loadingList ? <div className="card-body muted">Cargando diagnósticos...</div> : !diagnosticos.length ? (
          <div className="card-body muted">No hay diagnósticos registrados.</div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table" style={{ width: '100%' }}><thead><tr><th>Tipo</th><th>Referencia</th><th>Estado</th><th>Actualizado</th></tr></thead>
              <tbody>{diagnosticos.map(row => <tr key={row.id} onClick={() => openExisting(row)} style={{ cursor: 'pointer' }}>
                <td>{typeLabel(row.tipo)}</td>
                <td>
                  <strong>{row.tipo === 'fabricacion' ? 'Oportunidad' : 'Recepción'} · {referenceLabel(row.referencia)}</strong>
                  {row.referencia?.cliente && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{row.referencia.cliente}</span>}
                  {row.tipo === 'mantenimiento' && row.referencia?.activo && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{row.referencia.activo}</span>}
                </td>
                <td><span className={statusClass(row.estado)}>{statusLabel(row.estado)}</span></td>
                <td>{row.updated_at ? new Date(row.updated_at).toLocaleString('es-PE') : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      {(form.tipo || selected) && <ModalShell
        key={selected?.id || `nuevo-${form.tipo}`}
        open
        title={detailTitle}
        subtitle={selected ? `${selected.tipo === 'fabricacion' ? 'Oportunidad' : 'Recepción'}: ${referenceLabel(form.referencia)}` : 'Completa la referencia para crear un borrador.'}
        status={<span className={statusClass(selected?.estado)}>{statusLabel(selected?.estado)}</span>}
        dirty={detailDirty}
        busy={modalBusy}
        onClose={closeDetail}
        footer={requestClose => <>
          <div style={{ flex: 1 }}>
            {slowSaveWarning && <div className="alert alert-warning" style={{ margin: 0 }}>{slowSaveWarning}</div>}
            {error && <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>}
            {referenceError && <div className="alert alert-error" style={{ margin: '8px 0 0' }}>No se pudo resolver la referencia: {referenceError}</div>}
            {catalogError && <div className="alert alert-error" style={{ margin: '8px 0 0' }}>No se pudieron cargar los catálogos: {catalogError}</div>}
            {notice && <div className="alert alert-success" style={{ margin: '8px 0 0' }}>{notice}</div>}
          </div>
          <button type="button" className="btn btn-secondary" onClick={requestClose}>Cerrar</button>
          {!selected && canSave && <button className="btn btn-primary" type="submit" form="diagnostico-cabecera-form" disabled={saving || !selectedReference || !sesion.permiteEscritura}>{saving ? 'Guardando...' : 'Guardar'}</button>}
        </>}
      >
        {readOnlyReason && <div className="alert alert-warning diagnostico-readonly-alert">{readOnlyReason}</div>}
        {!selected && <form id="diagnostico-cabecera-form" onSubmit={save}>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
            <div className="field"><label>Tipo</label><input className="input" value={typeLabel(form.tipo)} disabled /></div>
            <ReferenceSelector tipo={form.tipo} value={selectedReference} search={search} references={references} loading={loadingReferences} disabled={false} onSearch={setSearch} onSelect={reference => { setForm(current => ({ ...current, referencia: reference })); setSearch(referenceLabel(reference)); }} />
          </div>
        </form>}
        {selected && <>
          <div className="card-body" style={{ paddingTop: 0 }}>
            {selected.tipo === 'mantenimiento' && form.referencia?.activo && <div className="muted">Activo: {form.referencia.activo}</div>}
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Líneas</h3>
              {canEditLines && <button type="button" className="btn btn-secondary" onClick={addLine}><Icon name="plus" size={14} /> Agregar línea</button>}
            </div>
            {loadingCatalogs ? <div className="muted" style={{ marginTop: 12 }}>Cargando catálogos...</div> : !catalogError && !(selected.lineas || []).length ? <div className="muted" style={{ marginTop: 12 }}>No hay líneas registradas.</div> : null}
            {!loadingCatalogs && !catalogError && (selected.lineas || []).map(line => <LineEditor
              key={line.id || line._key}
              line={line}
              catalogs={{ ...catalogs, crearFamilia, crearTipo }}
              canEdit={canEditLines}
              canCreateCatalog={canCreate}
              validationErrors={lineValidationErrors[lineKey(line)]}
              saving={savingLine === lineKey(line)}
              onChange={changes => {
                patchLine(line, changes);
                setLineValidationErrors(current => {
                  const key = lineKey(line);
                  if (!current[key]) return current;
                  const next = { ...current };
                  delete next[key];
                  return next;
                });
              }}
              onSave={() => saveLine(line)}
              onDelete={() => deleteLine(line)}
              onError={lineError => setError(errorMessage(lineError))}
            />)}
            {isReadOnly && <div className="muted" style={{ marginTop: 12 }}>Los diagnósticos emitidos son de solo lectura.</div>}
          </div>
        </>}
      </ModalShell>}
    </main>
  );
}
