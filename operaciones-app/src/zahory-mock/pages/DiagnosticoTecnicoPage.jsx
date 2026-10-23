import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { limpiarSeleccionAlDesenfocar, marcarEdicionNumerica, seleccionarAlEnfocar, seleccionarAlPulsar } from '../utils/seleccionarAlEnfocar.js';
import { Icon } from '../components/shell.jsx';
import { setWorkMode } from '../../workMode.js';
import { ModalShell } from '../components/ModalShell.jsx';
import { WorkMenuButton } from '../components/WorkMenuButton.jsx';
import { HallazgosTrabajoPanel } from './HallazgosTrabajoPanel.jsx';
import { getIncompleteHallazgos } from './hallazgosValidation.js';
import { DiagnosticoEstadoPanel } from './DiagnosticoEstadoPanel.jsx';
import { DiagnosticoLineasTabla } from './DiagnosticoLineasTabla.jsx';
import { DiagnosticoAgregarTareasPanel } from './DiagnosticoAgregarTareasPanel.jsx';
import { DiagnosticoInformePanel } from './DiagnosticoInformePanel.jsx';
import { MejorarRedaccionIA } from '../components/MejorarRedaccionIA.jsx';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
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
import { markupDibujoHallazgo } from './diagnosticoFase2Ui.js';
import { fechaLocalISO } from './fechaLocal.js';
import { agruparLineasPorTrabajo, datosInicialesValidos, pasoFinal, pasosDeCreacion, pasosDiagnostico, pasoTrabajos, trabajosSinTareas } from './diagnosticoFlujo.js';

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
const referenceStatusLabel = estado => estado === 'en_diagnostico' ? 'En diagnóstico' : estado ? String(estado).replaceAll('_', ' ').replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es')) : 'Recibido';
const etiquetaEtapa = etapa => String(etapa || '').replaceAll('_', ' ').replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es'));
const montoOportunidad = reference => {
  const monto = Number(reference?.monto_estimado);
  if (!reference?.monto_estimado || !Number.isFinite(monto)) return '';
  const simbolo = reference.moneda === 'USD' ? 'US$' : reference.moneda && reference.moneda !== 'PEN' ? reference.moneda : 'S/';
  return `${simbolo} ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const statusClass = estado => estado === 'emitido' ? 'badge green' : 'badge orange';
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
const dispatchDiagnosticoWorkMode = active => setWorkMode(active);
const diagnosticoHash = params => `/diagnostico-tecnico${params ? `?${params}` : ''}`;
const replaceDiagnosticoHash = params => {
  if (typeof window === 'undefined' || !window.location) return;
  const hash = `#${diagnosticoHash(params)}`;
  if (window.history?.replaceState) {
    window.history.replaceState(null, '', `${window.location.pathname || '/'}${window.location.search || ''}${hash}`);
    window.dispatchEvent?.(new Event('hashchange'));
  } else window.location.hash = diagnosticoHash(params);
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

export function DiagnosticoTecnicoPage({ routeParams = {} } = {}) {
  const workBackRequestRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    const handleWorkBack = () => workBackRequestRef.current?.();
    window.addEventListener('dx-work-back', handleWorkBack);
    return () => window.removeEventListener('dx-work-back', handleWorkBack);
  }, []);
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const usuarioId = sesion.usuario?.id;
  const [access, setAccess] = useState({ loading: true, ver: false, crear: false, editar: false, aprobar: false, error: '' });
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [generandoHojaCosteo, setGenerandoHojaCosteo] = useState(false);
  const [errorHojaCosteo, setErrorHojaCosteo] = useState('');
  const [hojaVinculada, setHojaVinculada] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [wizardStep, setWizardStep] = useState(1);
  const [datosIniciales, setDatosIniciales] = useState({ motivo: '', tecnico_id: '', fecha_inspeccion: fechaLocalISO(), componente_catalogo_id: null, corregirComponente: false });
  const [datosInicialesGuardados, setDatosInicialesGuardados] = useState({ motivo: '', tecnico_id: '', fecha_inspeccion: '' });
  const [componentesInicio, setComponentesInicio] = useState([]);
  const [tecnicosInicio, setTecnicosInicio] = useState([]);
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
  const [dismissedFooterMessage, setDismissedFooterMessage] = useState(false);
  useEffect(() => { setDismissedFooterMessage(false); }, [error]);
  const [referenceError, setReferenceError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [catalogs, setCatalogs] = useState({ familias: [], tipos: [], cargos: [], activos: [], hallazgos: { tipo_dano: [], causa_probable: [], unidad_medicion: [] } });
  const [extraFamilyIds, setExtraFamilyIds] = useState([]);
  const [mostrarTrabajosIncompletos, setMostrarTrabajosIncompletos] = useState(false);
  const [confirmarQuitarTrabajoId, setConfirmarQuitarTrabajoId] = useState('');
  const firstIncompleteWorkRef = useRef(null);
  const [taskPanel, setTaskPanel] = useState(false);
  const [taskPanelFamiliaId, setTaskPanelFamiliaId] = useState('');
  const [taskPanelInitialFamiliaId, setTaskPanelInitialFamiliaId] = useState('');
  const [taskPanelSuggestedFamilies, setTaskPanelSuggestedFamilies] = useState([]);
  const [taskPanelHasSelection, setTaskPanelHasSelection] = useState(false);
  const [informePanel, setInformePanel] = useState(false);
  const [workStep, setWorkStep] = useState(4);
  const [metaOpen, setMetaOpen] = useState(false);
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
  const emitirFabricacionRef = useRef(null);
  const routeOpenIdRef = useRef('');
  const routeReceptionIdRef = useRef('');

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
    const active = Boolean(selected || form.tipo);
    dispatchDiagnosticoWorkMode(active);
    return () => dispatchDiagnosticoWorkMode(false);
  }, [selected?.id, selected?.tipo, form.tipo]);

  useEffect(() => {
    setHallazgoView('lista');
    setInformePanel(false);
    setWorkStep(4);
  }, [selected?.id]);

  // Hoja de Costeo vigente creada desde este diagnóstico (trazabilidad).
  useEffect(() => {
    let activo = true;
    setHojaVinculada(null);
    if (!selected?.id) return () => { activo = false; };
    try {
      const client = getSupabaseClient();
      if (typeof client?.rpc === 'function') {
        Promise.resolve(client.rpc('hoja_costeo_de_diagnostico', { p_diagnostico_id: selected.id }))
          .then(result => { if (activo && result && !result.error) setHojaVinculada(result.data || null); })
          .catch(() => {});
      }
    } catch { /* Sin cliente disponible: no se muestra el vínculo. */ }
    return () => { activo = false; };
  }, [selected?.id, selected?.tipo, selected?.estado]);

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
    const tipoNuevo = routeParams.nuevo === 'fabricacion' || routeParams.nuevo === 'mantenimiento' ? routeParams.nuevo : '';
    if (tipoNuevo && !selected && form.tipo !== tipoNuevo && access.ver) openNew(tipoNuevo);
  }, [routeParams.nuevo, selected?.id, form.tipo, access.ver]);

  useEffect(() => {
    let vigente = true;
    if (form.tipo !== 'mantenimiento' || !access.ver || !empresaId) return () => { vigente = false; };
    listarTecnicosDiagnostico(empresaId).then(rows => { if (vigente) setTecnicosInicio(rows); }).catch(() => { if (vigente) setTecnicosInicio([]); });
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
    setDatosIniciales({ motivo: '', tecnico_id: '', fecha_inspeccion: fechaLocalISO(), componente_catalogo_id: null, corregirComponente: false });
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
    if (typeof window !== 'undefined' && window.location) {
      const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
      if (query.get('nuevo') !== tipo) {
        query.set('nuevo', tipo);
        if (tipo === 'mantenimiento' && routeParams.recepcion) query.set('recepcion', routeParams.recepcion);
        window.location.hash = diagnosticoHash(query.toString());
      }
    }
  };

  const openExisting = async diagnostico => {
    setInformePanel(false);
    setTaskPanel(false);
    setTaskPanelHasSelection(false);
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
        tecnico_id: detail.tecnico_id || '',
        fecha_inspeccion: detail.fecha_inspeccion || '',
      };
      setDatosIniciales(current => ({ ...current, ...initialData, componente_catalogo_id: detail.componente_catalogo_id || null, corregirComponente: false }));
      setDatosInicialesGuardados(initialData);
      setWorkStep(detail.tipo === 'mantenimiento' ? 1 : detail.estado === 'emitido' ? pasoFinal(detail.tipo) : pasoTrabajos(detail.tipo));
      if (typeof window !== 'undefined' && window.location?.hash !== undefined) {
        const query = new URLSearchParams(window.location?.hash?.split('?')[1] || '');
        if (query.get('trabajo') !== detail.id || query.has('nuevo')) {
          query.set('trabajo', detail.id);
          const wasNewEntry = query.has('nuevo');
          query.delete('nuevo');
          const hash = diagnosticoHash(query.toString());
          if (wasNewEntry) replaceDiagnosticoHash(query.toString());
          else window.location.hash = hash;
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
      });
      if (isActive()) setNotice('Diagnóstico guardado en borrador.');
      await cargarLista();
      if (!isActive()) return;
      const tipoCreado = form.tipo;
      await openExisting(created);
      setWizardStep(1);
      setWorkStep(tipoCreado === 'fabricacion' ? pasoTrabajos(tipoCreado) : 4);
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
    if (selected.tipo === 'mantenimiento' && (hallazgosDirty || Number(hallazgosDirtySummary.cambios || 0) > 0)) {
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
    if (canEditLines) {
      const incompletos = trabajosSinTareas(grupos);
      if (incompletos.length) {
        setError(`Hay trabajos sin actividades ni tareas: ${incompletos.map(group => group.familia.nombre).join(', ')}. Agrega una actividad o quita el trabajo para continuar.`);
        setMostrarTrabajosIncompletos(true);
        return;
      }
    }
    const final = pasoFinal(selected?.tipo);
    const conInforme = selected?.tipo === 'mantenimiento';
    if (!canEditLines) { if (conInforme) setInformePanel(true); setWorkStep(final); return; }
    const saved = await saveAll();
    if (saved) { if (conInforme) setInformePanel(true); setWorkStep(final); }
  };

  const initialDataDirty = Boolean(selected?.tipo === 'mantenimiento' && (
    datosIniciales.motivo !== datosInicialesGuardados.motivo
    || datosIniciales.tecnico_id !== datosInicialesGuardados.tecnico_id
    || datosIniciales.fecha_inspeccion !== datosInicialesGuardados.fecha_inspeccion
  ));
  const saveInitialData = async () => {
    if (!selected || !canEditInitialData || !initialDataDirty) return true;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await actualizarDatosInicialesDiagnostico(empresaId, selected.id, {
        motivo: datosIniciales.motivo,
        tecnico_id: datosIniciales.tecnico_id,
        fecha_inspeccion: datosIniciales.fecha_inspeccion,
      });
      const next = { motivo: saved.motivo || '', tecnico_id: saved.tecnico_id || '', fecha_inspeccion: saved.fecha_inspeccion || '' };
      setDatosIniciales(current => ({ ...current, ...next }));
      setDatosInicialesGuardados(next);
      setSelected(current => current?.id === selected.id ? { ...current, ...next, tecnico_nombre: tecnicosInicio.find(row => row.id === next.tecnico_id)?.nombre || current.tecnico_nombre } : current);
      setNotice('Cambios guardados.');
      return true;
    } catch (saveError) { setError(errorMessage(saveError)); return false; }
    finally { setSaving(false); }
  };
  const selectInitialReference = reference => {
    if (selectedReference?.id && selectedReference.id !== reference.id && typeof window !== 'undefined'
      && !window.confirm('Si cambias de recepción, se perderán los datos iniciales que ingresaste. ¿Continuar?')) return;
    setForm(current => ({ ...current, referencia: reference }));
    setSearch(referenceLabel(reference));
    setDatosIniciales(current => ({ ...current, motivo: reference.observaciones || '', tecnico_id: '', fecha_inspeccion: fechaLocalISO(), componente_catalogo_id: null, corregirComponente: false }));
  };

  useEffect(() => {
    const id = routeParams.recepcion;
    if (!id || form.tipo !== 'mantenimiento' || selectedReference?.id === id || routeReceptionIdRef.current === id) return;
    const reference = references.find(item => item.id === id);
    if (!reference) return;
    routeReceptionIdRef.current = id;
    selectInitialReference(reference);
  }, [routeParams.recepcion, form.tipo, references, selectedReference?.id]);

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

  const closeDetail = ({ syncUrl = true } = {}) => {
    openRequestRef.current += 1;
    modalSessionRef.current += 1;
    setSaving(false);
    setSavingLine(null);
    setSlowSaveWarning('');
    setSelected(null);
    routeOpenIdRef.current = '';
    routeReceptionIdRef.current = '';
    if (syncUrl && typeof window !== 'undefined' && window.location?.hash) {
      const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
      if (query.has('trabajo') || query.has('nuevo')) replaceDiagnosticoHash('');
    }
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
  const closeTaskPanel = () => { setTaskPanel(false); setTaskPanelFamiliaId(''); setTaskPanelInitialFamiliaId(''); setTaskPanelSuggestedFamilies([]); setTaskPanelHasSelection(false); };
  const toggleTaskPanel = () => {
    if (taskPanel) closeTaskPanel();
    else {
      const counts = new Map();
      (selected?.hallazgos || []).forEach(row => { if (row.familia_trabajo_id) counts.set(row.familia_trabajo_id, (counts.get(row.familia_trabajo_id) || 0) + 1); });
      const proposed = [...counts].map(([id, count]) => ({ familia: catalogs.familias.find(row => row.id === id), count })).filter(row => row.familia);
      setTaskPanelHasSelection(false); setTaskPanelFamiliaId(''); setTaskPanelSuggestedFamilies(proposed);
      setTaskPanelInitialFamiliaId(proposed.length === 1 ? proposed[0].familia.id : ''); setTaskPanel(true);
    }
  };
  const openActivityPanel = familyId => { setTaskPanelHasSelection(false); setTaskPanelFamiliaId(familyId); setTaskPanel(true); };
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
  const cambiosSinGuardar = Boolean(selected && !isReadOnly && ((selected.lineas || []).some(line => line._dirty) || pendingLineDeletes.length > 0 || (selected.tipo === 'mantenimiento' && (hallazgosDirty || initialDataDirty)) || summaryDirty));
  useEffect(() => {
    if (routeParams.trabajo || routeParams.nuevo || (!selected && !form.tipo)) return;
    if (typeof window === 'undefined' || !window.location) return;
    if (window.location?.hash) {
      const currentRoute = new URLSearchParams(window.location.hash.split('?')[1] || '');
      if (currentRoute.has('trabajo') || currentRoute.has('nuevo')) return;
    }
    if (cambiosSinGuardar || initialDataDirty || hallazgosDirty || Number(hallazgosDirtySummary.cambios || 0) > 0 || (!selected && Boolean(form.referencia))) {
      const query = new URLSearchParams();
      if (selected?.id) query.set('trabajo', selected.id);
      else {
        query.set('nuevo', form.tipo);
        if (form.tipo === 'mantenimiento' && selectedReference?.id) query.set('recepcion', selectedReference.id);
      }
      replaceDiagnosticoHash(query.toString());
      workBackRequestRef.current?.();
      return;
    }
    closeDetail({ syncUrl: false });
  }, [routeParams.trabajo, routeParams.nuevo, selected?.id, form.tipo, cambiosSinGuardar, initialDataDirty, hallazgosDirty, hallazgosDirtySummary.cambios, selectedReference?.id]);
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
  const workPage = Boolean(selected || form.tipo);
  const tipoActual = selected?.tipo || form.tipo;
  const pasos = pasosDiagnostico(tipoActual);
  const enPasoTrabajos = Boolean(selected) && workStep === pasoTrabajos(selected.tipo) && !informePanel;
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
  useLayoutEffect(() => {
    const groupsById = new Map(agruparLineasPorTrabajo(selected?.lineas || [], catalogs.familias).map(group => [group.familia.id, group]));
    [...extraFamilyIds, ...(selected?.hallazgos || []).map(item => item.familia_trabajo_id).filter(Boolean)].forEach(id => {
      if (!groupsById.has(id) && catalogs.familias.some(family => family.id === id)) {
        groupsById.set(id, { familia: catalogs.familias.find(family => family.id === id), lines: [] });
      }
    });
    const incomplete = trabajosSinTareas([...groupsById.values()]);
    if (!incomplete.length) {
      if (mostrarTrabajosIncompletos) setMostrarTrabajosIncompletos(false);
      return;
    }
    if (!mostrarTrabajosIncompletos) return;
    firstIncompleteWorkRef.current?.focus();
    firstIncompleteWorkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [mostrarTrabajosIncompletos, selected?.lineas, selected?.hallazgos, catalogs.familias, extraFamilyIds]);

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
      : datosInicialesValidos(selectedReference, datosIniciales);

  const lineasActuales = selected?.lineas || [];
  const familiasPorId = new Map(catalogs.familias.map(item => [item.id, item]));
  const gruposMap = new Map(agruparLineasPorTrabajo(lineasActuales, catalogs.familias).map(group => [group.familia.id, group]));
  [...extraFamilyIds, ...(selected?.hallazgos || []).map(hallazgo => hallazgo.familia_trabajo_id).filter(Boolean)].forEach(id => {
    if (!gruposMap.has(id) && familiasPorId.has(id)) gruposMap.set(id, { familia: familiasPorId.get(id), lines: [] });
  });
  const grupos = [...gruposMap.values()];
  const trabajosIncompletos = trabajosSinTareas(grupos);
  const firstIncompleteFamilyId = trabajosIncompletos[0]?.familia.id;
  const quitarTrabajo = (familyId, nombre) => {
    queueFamilyLineDeletes(familyId);
    setExtraFamilyIds(current => current.filter(id => id !== familyId));
    if (taskPanelFamiliaId === familyId) {
      setTaskPanel(false);
      setTaskPanelFamiliaId('');
      setTaskPanelHasSelection(false);
    }
    setConfirmarQuitarTrabajoId('');
    setNotice(`Trabajo \"${nombre}\" quitado. Guarda para aplicar los cambios.`);
  };
  const generarHojaCosteo = async () => {
    // En Mantenimiento la sociedad sale de la recepción; en Fabricación, de la barra superior.
    const sociedadId = selected?.tipo === 'mantenimiento' ? null : sesion.sociedadActiva?.id;
    if (selected?.tipo !== 'mantenimiento' && (!sociedadId || sociedadId === '**todas**')) {
      setErrorHojaCosteo('Selecciona una sociedad concreta en la barra superior para generar la Hoja de Costeo.');
      return;
    }
    setErrorHojaCosteo('');
    setGenerandoHojaCosteo(true);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc('generar_hoja_costeo_desde_diagnostico', {
        p_diagnostico_id: selected.id,
        p_sociedad_id: sociedadId,
      });
      if (rpcError) throw rpcError;
      const hojaId = data?.hoja_costeo_id;
      if (!hojaId) throw new Error('La RPC no devolvió el identificador de la Hoja de Costeo.');
      const adminBase = (import.meta.env.VITE_ADMIN_APP_URL || '/').replace(/\/$/, '');
      window.location.assign(`${adminBase}/#hoja_costeo_wizard?hojaId=${encodeURIComponent(hojaId)}`);
    } catch (rpcError) {
      setErrorHojaCosteo(errorMessage(rpcError));
    } finally {
      setGenerandoHojaCosteo(false);
    }
  };
  const renderLineas = lines => <DiagnosticoLineasTabla lines={lines} catalogs={catalogs} canEdit={canEditLines} Selector={CatalogSelector} onDelete={deleteLine} validationErrors={lineValidationErrors} onChange={(line, changes) => { if (!line) { setSelected(current => ({ ...current, lineas: [...(current.lineas || []), changes] })); return; } patchLine(line, changes); const key = lineKey(line); setLineValidationErrors(current => { const next = { ...current }; delete next[key]; return next; }); }} onError={lineError => setError(errorMessage(lineError))} />;
  const renderFamilyGroup = group => {
    const familyId = group.familia.id;
    const nombre = group.familia.nombre;
    const byActivity = new Map();
    group.lines.forEach(line => {
      const activity = catalogs.tipos.find(item => item.id === line.actividad_id);
      const key = line.actividad_id || 'sin-actividad';
      if (!byActivity.has(key)) byActivity.set(key, { activity, lines: [] });
      byActivity.get(key).lines.push(line);
    });
    const hallazgosCount = (selected?.hallazgos || []).filter(item => item.familia_trabajo_id === familyId).length;
    const incompleto = group.lines.length === 0;
    const lockedTitle = `Lo usan ${hallazgosCount} hallazgo(s). Cámbialo en el paso Hallazgos para poder quitarlo.`;
    return <section className={`dx-work-family-group${mostrarTrabajosIncompletos && incompleto ? ' is-incomplete' : ''}`} key={familyId} tabIndex={mostrarTrabajosIncompletos && incompleto ? -1 : undefined} ref={element => { if (familyId === firstIncompleteFamilyId) firstIncompleteWorkRef.current = element; }}>
      <header><h3>{nombre}</h3><div className="dx-work-family-header-actions"><span>{group.lines.length} tarea{group.lines.length === 1 ? '' : 's'}</span>{canEditLines && <><button type="button" className="dx-work-delete-button" aria-label={`Quitar trabajo ${nombre}`} title={hallazgosCount ? lockedTitle : undefined} disabled={hallazgosCount > 0} onClick={() => group.lines.length ? setConfirmarQuitarTrabajoId(familyId) : quitarTrabajo(familyId, nombre)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>{confirmarQuitarTrabajoId === familyId && group.lines.length > 0 && <span className="dx-work-delete-confirm"><span>¿Quitar este trabajo y sus {group.lines.length} tareas?</span><button type="button" className="dx-work-delete-confirm-action" onClick={() => setConfirmarQuitarTrabajoId('')}>Cancelar</button><button type="button" className="dx-work-delete-confirm-action" onClick={() => quitarTrabajo(familyId, nombre)}>Confirmar</button></span>}</>}</div></header>
      {hallazgosCount > 0 && canEditLines && <p className="dx-work-delete-locked-note">Lo usan {hallazgosCount} hallazgo(s). Cámbialo en el paso Hallazgos para poder quitarlo.</p>}
      {byActivity.size ? [...byActivity.entries()].map(([key, activityGroup]) => <section className="dx-work-activity-group" key={key}><h4>{activityGroup.activity?.nombre || 'Actividad pendiente'}</h4>{renderLineas(activityGroup.lines)}</section>) : <p className={`dx-work-family-empty${mostrarTrabajosIncompletos && incompleto ? ' is-incomplete' : ''}`}>Aún sin actividades. Agrega una actividad del maestro.</p>}
      {canEditLines && <button type="button" className="dx-work-add-activity" aria-expanded={taskPanel && taskPanelFamiliaId === familyId} onClick={() => taskPanel && taskPanelFamiliaId === familyId ? closeTaskPanel() : openActivityPanel(familyId)}>＋ Agregar actividad</button>}
      {taskPanel && taskPanelFamiliaId === familyId && <DiagnosticoAgregarTareasPanel key={`family-${familyId}`} initialFamiliaId={familyId} familias={catalogs.familias} tipos={catalogs.tipos} cargos={catalogs.cargos} activos={catalogs.activos} plantillas={plantillasActividad} tipoDiagnostico={selected.tipo} lineas={selected.lineas || []} onClose={closeTaskPanel} onSelectionChange={setTaskPanelHasSelection} onAdd={(rows, duplicates = 0) => { appendCascadeLines(rows); setNotice(`${rows.length ? `Se agregaron ${rows.length} tarea${rows.length === 1 ? '' : 's'}` : 'No se agregaron tareas'}${duplicates ? `; ${duplicates} duplicada${duplicates === 1 ? '' : 's'} omitida${duplicates === 1 ? '' : 's'}` : ''}.`); window.requestAnimationFrame(() => (tableAnchorRef.current?.focus({ preventScroll: true }), tableAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))); }} onCreateFamily={crearFamilia} onCreateType={crearTipo} />}
    </section>;
  };
  const totalHH = lineasActuales.reduce((sum, line) => sum + Number(line.horas_mano_obra || 0), 0);
  const totalHM = lineasActuales.reduce((sum, line) => sum + Number(line.horas_maquina || 0), 0);
  const dirtyLineCount = lineasActuales.filter(line => line._dirty).length + pendingLineDeletes.length;
  const cambiosCount = isReadOnly ? 0 : dirtyLineCount + (selected?.tipo === 'mantenimiento' ? Number(hallazgosDirtySummary.cambios || 0) + Number(initialDataDirty) : 0) + Number(summaryDirty);
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
    <main className="ops-page" style={workPage ? { padding: 0, width: '100%', height: 'calc(100dvh - 68px)', minHeight: 0, overflow: 'hidden' } : { padding: 24, width: '100%' }}>
      <div className={workPage ? 'dx-list-work-hidden' : ''} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
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

      <section className={`dx-ui dx-list${workPage ? ' dx-list-work-hidden' : ''}`} aria-label="Listado de diagnósticos">
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
        key={!workPage ? selected?.id || `nuevo-${form.tipo}` : undefined}
        fullPage={workPage}
        pageMode={workPage}
        variant={workPage || selected ? 'dx-modal' : undefined}
        width={selected ? 1160 : 1040}
        titleClassName={selected ? 'dx-modal-title' : ''}
        subtitleClassName={selected ? 'dx-modal-subtitle' : ''}
        statusClassName={selected ? 'dx-modal-status' : ''}
        closeClassName={selected ? 'dx-modal-close' : ''}
        title={detailTitle}
        subtitle={selected ? `${selected.tipo === 'fabricacion' ? 'Oportunidad' : 'Recepción'}: ${referenceLabel(form.referencia)}` : 'Completa la referencia para crear un borrador.'}
        status={<span className={statusClass(selected?.estado)}>{statusLabel(selected?.estado)}</span>}
        dirty={!isReadOnly && (detailDirty || initialDataDirty || (taskPanel && taskPanelHasSelection))}
        busy={modalBusy}
        onClose={closeDetail}
        pageHeader={workPage ? requestClose => {
          workBackRequestRef.current = requestClose;
          if (!selected) return <><header className="dx-work-identity"><WorkMenuButton /><div className="dx-work-identity-title"><button type="button" className="dx-work-back-link" aria-label="Volver a diagnósticos" onClick={requestClose}><span aria-hidden="true">←</span><span className="dx-work-back-label">Diagnósticos</span></button><h1>Nuevo diagnóstico · {typeLabel(form.tipo)}</h1></div><div className="dx-work-identity-status">{selectedReference?.numero && <strong>{selectedReference.numero}</strong>}<span className="dx-ui-pill is-amber"><i />Borrador</span></div></header><div className="dx-work-page-head"><nav className="dx-work-steps" data-pasos={pasos.length} aria-label="Pasos del diagnóstico">{pasos.map((label, index) => <button key={label} type="button" className={wizardStep === index + 1 ? 'is-current' : wizardStep > index + 1 ? 'is-done' : ''} aria-current={wizardStep === index + 1 ? 'step' : undefined} disabled={index >= pasosDeCreacion(form.tipo) || index + 1 > wizardStep} onClick={() => setWizardStep(index + 1)}><i>{wizardStep > index + 1 ? '✓' : index + 1}</i><span>{index + 1} · {label}</span></button>)}</nav></div></>;
          const reference = form.referencia || {};
          if (selected.tipo === 'fabricacion') return <header className="dx-work-identity is-compact"><WorkMenuButton /><div className="dx-work-identity-title"><button type="button" className="dx-work-back-link" aria-label="Volver a diagnósticos" onClick={requestClose}><span aria-hidden="true">←</span><span className="dx-work-back-label"> Diagnósticos</span></button><h1>{reference.numero || 'Oportunidad'}{reference.cliente ? ` · ${reference.cliente}` : ''}</h1></div><div className="dx-work-identity-status"><strong>Fabricación</strong><span className={`dx-ui-pill ${selected.estado === 'emitido' ? 'is-green' : 'is-amber'}`}><i />{statusLabel(selected.estado)}</span></div></header>;
          const title = `${String(reference.activo || selected.hallazgos?.[0]?.componente_parte || 'Equipo').toLocaleUpperCase('es')} · ${reference.cliente || 'Cliente'}`;
          const motivo = selected.motivo || reference.motivo || reference.observaciones || reference.observacion || reference.descripcion || reference.detalle || '—';
          const tecnico = selected.tecnico_nombre || reference.tecnico_asignado || reference.tecnico_nombre || reference.tecnico || 'Sin asignar';
          const fecha = selected.fecha_inspeccion ? new Date(`${selected.fecha_inspeccion}T12:00:00`).toLocaleDateString('es-PE') : reference.fecha_ingreso ? new Date(reference.fecha_ingreso).toLocaleDateString('es-PE') : '—';
          const componente = selected.componente_nombre || reference.componente_nombre || reference.tipo_componente || selected.hallazgos?.[0]?.componente_parte || '—';
          return <><header className={`dx-work-identity${informePanel || workStep >= 4 ? ' is-compact' : ''}`}><WorkMenuButton /><div className="dx-work-identity-title"><button type="button" className="dx-work-back-link" aria-label="Volver a diagnósticos" onClick={requestClose}><span aria-hidden="true">←</span><span className="dx-work-back-label"> Diagnósticos</span></button><h1>{title}</h1></div><div className="dx-work-identity-status"><strong>{reference.numero || referenceLabel(reference)}</strong><span className={`dx-ui-pill ${selected.estado === 'emitido' ? 'is-green' : 'is-amber'}`}><i />{statusLabel(selected.estado)}</span></div><button type="button" className="dx-work-meta-toggle" aria-label="Detalles" aria-expanded={metaOpen} onClick={() => setMetaOpen(open => !open)}>i</button><div className={`dx-work-meta${metaOpen ? ' is-open' : ''}`}><span title={motivo}><b>Motivo</b> {motivo}</span><span title={`Técnico: ${tecnico}${fecha ? ` · ${fecha}` : ''}`}><b>Técnico:</b> {tecnico}{fecha ? ` · ${fecha}` : ''}</span><span title={componente}><b>Componente</b> {componente}</span></div></header></>;
        } : null}
        footer={requestClose => selected?.tipo === 'mantenimiento' ? <>
          <div className="dx-work-footer-status">
            {error && !dismissedFooterMessage && <div className="alert alert-error dx-footer-floating-alert" role="alert"><span>{error}</span><button type="button" className="dx-footer-alert-close" aria-label="Descartar aviso" onClick={() => setDismissedFooterMessage(true)}>×</button></div>}
            {isReadOnly ? <span role="status">Informe emitido</span> : cambiosSinGuardar ? <div className="dx-dirty-count"><i />{cambiosCount} cambio{cambiosCount === 1 ? '' : 's'} sin guardar</div> : <span role="status">{notice || 'Borrador guardado'}</span>}
          </div>
          {isReadOnly ? <button type="button" className="btn btn-secondary dx-action-44" onClick={() => { setInformePanel(false); setWorkStep(4); hallazgosBackRef.current?.(); }}>← Volver a hallazgos</button> : !informePanel && workStep <= 3 ? <><span className="dx-work-footer-status">{initialDataDirty ? 'Datos iniciales sin guardar' : selected.datos_iniciales_migracion_disponible === false ? 'Datos iniciales: —' : 'Datos del diagnóstico'}</span>{canEditInitialData && <button type="button" className="btn btn-secondary dx-action-44" onClick={saveInitialData} disabled={!initialDataDirty || modalBusy} aria-label={modalBusy ? 'Guardando cambios' : 'Guardar cambios'}><span className="dx-footer-label-full">{modalBusy ? 'Guardando cambios…' : 'Guardar cambios'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={modalBusy ? 'Guardando…' : 'Guardar'} /></button>}<span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" disabled={modalBusy} onClick={async () => { if (workStep === 3 && !(await saveInitialData())) return; setWorkStep(workStep + 1); }} aria-label={workStep === 3 ? 'Siguiente: Hallazgos' : 'Siguiente'}><span className="dx-footer-label-full">{workStep === 3 ? 'Siguiente: Hallazgos' : 'Siguiente'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={workStep === 3 ? 'Hallazgos →' : 'Siguiente →'} /></button></> : !informePanel && workStep === 4 && hallazgoView === 'lista' ? <><button type="button" className="btn btn-secondary dx-action-44" disabled={!canEditLines || modalBusy} onClick={() => hallazgosAddRef.current?.()} aria-label="Agregar hallazgo"><span className="dx-footer-label-full">＋ Agregar hallazgo</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="+ Hallazgo" /></button><span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" onClick={async () => { const saved = await saveAll(); if (saved) { setWorkStep(5); setHallazgoView('lista'); } }} disabled={modalBusy} aria-label="Siguiente: Trabajos"><span className="dx-footer-label-full">Siguiente: Trabajos</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Trabajos →" /></button></> : !informePanel && workStep === 4 ? <><button type="button" className="btn btn-secondary dx-action-44" onClick={() => { setWorkStep(4); hallazgosBackRef.current?.(); }} aria-label="Volver a hallazgos"><span className="dx-footer-label-full">← Volver a hallazgos</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Hallazgos" /></button><button type="button" className="btn btn-secondary dx-action-44" onClick={() => window.dispatchEvent(new CustomEvent('dx-show-hallazgo-drawing'))} aria-label="Ver dibujo"><span className="dx-footer-label-full">Ver dibujo</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Dibujo" /></button><span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" disabled={!canEditLines || modalBusy} onClick={async () => { const result = await hallazgosSaveRef.current?.(); if (result?.ok) setNotice('Hallazgo guardado.'); }}><span className="dx-footer-label-full">{modalBusy ? 'Guardando…' : 'Guardar hallazgo'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={modalBusy ? 'Guardando…' : 'Guardar'} /></button></> : !informePanel && workStep === 5 ? <><button type="button" className="btn btn-secondary dx-action-44" aria-expanded={Boolean(taskPanel)} onClick={toggleTaskPanel}><span className="dx-footer-label-full">{taskPanel ? 'Cerrar panel' : 'Agregar trabajo'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={taskPanel ? 'Cerrar' : '+ Trabajo'} /></button>{canEditLines && <button type="button" className="btn btn-secondary dx-action-44" onClick={saveAll} disabled={!cambiosSinGuardar || modalBusy}><span className="dx-footer-label-full">{modalBusy ? 'Guardando…' : 'Guardar todo'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={modalBusy ? 'Guardando…' : 'Guardar'} /></button>}<span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" disabled={modalBusy} onClick={goInforme} aria-label="Siguiente: Diagnóstico e informe"><span className="dx-footer-label-full">Siguiente: Diagnóstico e informe</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Informe →" /></button></> : <><button type="button" className="btn btn-secondary dx-action-44" onClick={() => { setInformePanel(false); setWorkStep(5); }} aria-label="Volver a trabajos"><span className="dx-footer-label-full">← Volver a trabajos</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Trabajos" /></button><span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" onClick={event => event.currentTarget.getRootNode()?.querySelector('.dx-informe-emitir')?.click()} aria-label="Emitir informe"><span className="dx-footer-label-full">Emitir informe</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Emitir" /></button></>}
        </> : selected ? <>
          <div className="dx-work-footer-status">
            {error && !dismissedFooterMessage && <div className="alert alert-error dx-footer-floating-alert" role="alert"><span>{error}</span><button type="button" className="dx-footer-alert-close" aria-label="Descartar aviso" onClick={() => setDismissedFooterMessage(true)}>×</button></div>}
            {slowSaveWarning && <div className="alert alert-warning dx-footer-floating-alert" role="status"><span>{slowSaveWarning}</span></div>}
            {isReadOnly ? <span role="status">Diagnóstico emitido</span> : cambiosSinGuardar ? <div className="dx-dirty-count"><i />{cambiosCount} cambio{cambiosCount === 1 ? '' : 's'} sin guardar</div> : <span role="status">{notice || 'Borrador guardado'}</span>}
          </div>
          {workStep === 1 ? <><span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" onClick={() => setWorkStep(pasoTrabajos('fabricacion'))} aria-label="Siguiente: Trabajos a realizar"><span className="dx-footer-label-full">Siguiente: Trabajos a realizar</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Trabajos →" /></button></>
            : workStep === pasoTrabajos('fabricacion') ? <>{canEditLines && <button type="button" className="btn btn-secondary dx-action-44" aria-expanded={Boolean(taskPanel)} onClick={toggleTaskPanel}><span className="dx-footer-label-full">{taskPanel ? 'Cerrar panel' : 'Agregar trabajo'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={taskPanel ? 'Cerrar' : '+ Trabajo'} /></button>}{canEditLines && <button type="button" className="btn btn-secondary dx-action-44" onClick={saveAll} disabled={!cambiosSinGuardar || modalBusy}><span className="dx-footer-label-full">{modalBusy ? 'Guardando…' : 'Guardar todo'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={modalBusy ? 'Guardando…' : 'Guardar'} /></button>}<span className="dx-work-spacer" /><button type="button" className="btn btn-primary dx-action-44" disabled={modalBusy} onClick={goInforme} aria-label="Siguiente: Emitir y costear"><span className="dx-footer-label-full">Siguiente: Emitir y costear</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Emitir →" /></button></>
            : <><button type="button" className="btn btn-secondary dx-action-44" onClick={() => setWorkStep(pasoTrabajos('fabricacion'))} aria-label="Volver a trabajos"><span className="dx-footer-label-full">← Volver a trabajos</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Trabajos" /></button><span className="dx-work-spacer" />{!isReadOnly && access.aprobar && Boolean(sesion.permiteEscritura) && <button type="button" className="btn btn-primary dx-action-44" disabled={cambiosSinGuardar || modalBusy || !grupos.length || trabajosIncompletos.length > 0} title={cambiosSinGuardar ? 'Guarda los cambios antes de emitir' : undefined} onClick={() => emitirFabricacionRef.current?.()} aria-label="Emitir diagnóstico"><span className="dx-footer-label-full">Emitir diagnóstico</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="Emitir" /></button>}</>}
        </> : <>
          <div style={{ flex: 1 }}>
            {slowSaveWarning && <div className="alert alert-warning" style={{ margin: 0 }}>{slowSaveWarning}</div>}
            {error && <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>}
            {referenceError && <div className="alert alert-error" style={{ margin: '8px 0 0' }}>No se pudo resolver la referencia: {referenceError}</div>}
            {catalogError && <div className="alert alert-error" style={{ margin: '8px 0 0' }}>No se pudieron cargar los catálogos: {catalogError}</div>}
            {notice && <div className="alert alert-success" style={{ margin: '8px 0 0' }}>{notice}</div>}
          </div>
          {!selected && canSave && <div className="dx-wizard-footer"><button type="button" className="btn btn-secondary" onClick={requestClose} aria-label="Volver a diagnósticos"><span className="dx-footer-label-full">← Diagnósticos</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="← Bandeja" /></button>{wizardStep > 1 && <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(step => step - 1)} aria-label="Anterior"><span className="dx-footer-label-full">← Anterior</span><span className="dx-footer-label-compact" aria-hidden="true" data-label="← Atrás" /></button>}<span className="dx-work-spacer" /><button className="btn btn-primary" type="submit" form="diagnostico-cabecera-form" disabled={saving || !initialStepValid || !sesion.permiteEscritura} aria-label={saving ? 'Creando borrador' : wizardStep === pasosDeCreacion(form.tipo) ? 'Crear borrador y continuar' : 'Siguiente'}><span className="dx-footer-label-full">{saving ? 'Creando…' : wizardStep === pasosDeCreacion(form.tipo) ? 'Crear borrador y continuar' : 'Siguiente'}</span><span className="dx-footer-label-compact" aria-hidden="true" data-label={saving ? 'Creando…' : wizardStep === pasosDeCreacion(form.tipo) ? (form.tipo === 'fabricacion' ? 'Trabajos →' : 'Hallazgos →') : 'Siguiente →'} /></button></div>}
        </>}
      >
        {readOnlyReason && <div className="alert alert-warning diagnostico-readonly-alert">{readOnlyReason}</div>}
        {!selected && <div className="dx-initial-flow"><form id="diagnostico-cabecera-form" onSubmit={event => { if (form.tipo === 'mantenimiento' && wizardStep < 3) { event.preventDefault(); setWizardStep(step => Math.min(3, step + 1)); return; } save(event); }}>
          {form.tipo === 'mantenimiento' ? wizardStep === 1 ? <div className="dx-initial-step">
            <section className="dx-initial-card"><div className="field"><label>Buscar por número, cliente o activo…</label><input className="input" role="combobox" aria-label="Buscar por número, cliente o activo" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por número, cliente o activo…" /></div></section>
            <section className="dx-initial-list" role="radiogroup" aria-label="Recepciones disponibles">{loadingReferences ? <p className="muted">Buscando recepciones…</p> : references.length ? references.map(reference => { const borradores = diagnosticos.filter(row => row.tipo === 'mantenimiento' && row.recepcion_id === reference.id && row.estado === 'borrador'); return <button key={reference.id} type="button" role="radio" aria-checked={selectedReference?.id === reference.id} className={`dx-initial-receipt${selectedReference?.id === reference.id ? ' is-selected' : ''}`} onClick={() => selectInitialReference(reference)}><i className="dx-initial-radio"/><span className="dx-initial-receipt-copy"><strong>{reference.activo || 'Equipo sin nombre'}</strong><small>{reference.numero || referenceLabel(reference)} · {reference.cliente || 'Cliente'}{reference.fecha_ingreso ? ` · ingreso ${new Date(reference.fecha_ingreso).toLocaleDateString('es-PE')}` : ''}</small></span>{borradores.length > 0 && <span className="dx-ui-pill is-amber">{borradores.length} {borradores.length === 1 ? 'borrador' : 'borradores'}</span>}<span className="dx-ui-pill">{referenceStatusLabel(reference.estado)}</span></button>; }) : <p className="muted">No hay recepciones que coincidan.</p>}</section>
            {selectedReference && (() => { const borradores = diagnosticos.filter(row => row.tipo === 'mantenimiento' && row.recepcion_id === selectedReference.id && row.estado === 'borrador'); return borradores.length ? <div className="dx-initial-warning">Esta recepción ya tiene {borradores.length} diagnósticos en borrador. Puedes abrir uno de ellos en vez de crear otro. {borradores.map(row => <button key={row.id} type="button" onClick={() => openExisting(row)}>Abrir borrador</button>)}</div> : null; })()}
          </div> : wizardStep === 2 ? <div className="dx-initial-step">
            {equipoInicio && <section className="dx-initial-card"><h2>Equipo recibido</h2><dl className="dx-work-reception-grid"><div><dt>Equipo</dt><dd>{equipoInicio.activo.nombre || equipoInicio.activo.codigo}</dd></div><div><dt>Cliente</dt><dd>{selectedReference?.cliente || '—'}</dd></div><div><dt>Marca / modelo</dt><dd>{[equipoInicio.activo.marca, equipoInicio.activo.modelo].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Serie</dt><dd>{equipoInicio.activo.placa_serie || '—'}</dd></div><div><dt>Recepción</dt><dd>{selectedReference?.numero || referenceLabel(selectedReference)}</dd></div></dl></section>}
            {equipoInicio?.activo.tipo_activo === 'maquinaria_completa' ? <section className="dx-initial-card"><span className="dx-ui-pill">Máquina completa</span><p>No hace falta elegir un tipo ahora: en cada hallazgo eliges qué componente evalúas.</p></section> : <section className="dx-initial-card"><h2>Tipo de componente</h2>{equipoInicio?.componente && !datosIniciales.corregirComponente ? <><span className="dx-ui-pill">Viene de la recepción</span><div className="dx-initial-component"><div className="dx-drawing-canvas dx-initial-thumb" dangerouslySetInnerHTML={{ __html: markupDibujoHallazgo(equipoInicio.componente.svg || '') }}/><strong>{equipoInicio.componente.nombre}</strong><button type="button" className="btn btn-secondary" onClick={() => setDatosIniciales(current => ({ ...current, corregirComponente: true }))}>Corregir tipo</button></div></> : <><p className="dx-initial-warning">{equipoInicio?.componente ? 'Elige el tipo correcto.' : 'Este equipo todavía no tiene tipo de componente. Se guarda en el equipo y las próximas recepciones y diagnósticos ya lo traen.'}</p><div className="dx-initial-component-grid">{componentesInicio.map(componente => <button type="button" key={componente.id} aria-pressed={datosIniciales.componente_catalogo_id === componente.id} className={datosIniciales.componente_catalogo_id === componente.id ? 'is-selected' : ''} onClick={async () => { setDatosIniciales(current => ({ ...current, componente_catalogo_id: componente.id })); try { await asignarComponenteCatalogoActivo(empresaId, equipoInicio.activo.id, componente.id); setEquipoInicio(current => current ? { ...current, componente } : current); setDatosIniciales(current => ({ ...current, corregirComponente: false })); } catch (saveError) { setDatosInicioError(errorMessage(saveError)); } }}><div className="dx-drawing-canvas dx-initial-thumb" dangerouslySetInnerHTML={{ __html: markupDibujoHallazgo(componente.svg || '') }}/><strong>{componente.nombre}</strong></button>)}<button type="button" onClick={async () => { setDatosIniciales(current => ({ ...current, componente_catalogo_id: 'otro' })); try { await asignarComponenteCatalogoActivo(empresaId, equipoInicio.activo.id, null); setEquipoInicio(current => current ? { ...current, componente: null } : current); setDatosIniciales(current => ({ ...current, corregirComponente: false })); } catch (saveError) { setDatosInicioError(errorMessage(saveError)); } }}>Otro tipo · sin dibujo</button></div></>}</section>}
          </div> : <div className="dx-initial-step">
            <section className="dx-initial-card"><div className="field"><label>Motivo o falla reportada por el cliente *</label><textarea className="input" rows="4" value={datosIniciales.motivo} onChange={event => setDatosIniciales(current => ({ ...current, motivo: event.target.value }))}/></div></section>
            <section className="dx-initial-card dx-initial-grid"><div className="field"><label>Técnico responsable *</label><select className="input" value={datosIniciales.tecnico_id} onChange={event => setDatosIniciales(current => ({ ...current, tecnico_id: event.target.value }))}><option value="">Elige…</option>{tecnicosInicio.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>)}</select></div><div className="field"><label>Fecha de inspección</label><input className="input" type="date" value={datosIniciales.fecha_inspeccion} onChange={event => setDatosIniciales(current => ({ ...current, fecha_inspeccion: event.target.value }))}/></div></section>
          </div> : <div className="dx-initial-step">
            <section className="dx-initial-card"><div className="field"><label htmlFor="dx-buscar-oportunidad">Buscar por oportunidad o cliente…</label><input id="dx-buscar-oportunidad" className="input" aria-label="Buscar por oportunidad o cliente" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por oportunidad o cliente…" /></div></section>
            <section className="dx-initial-list" role="radiogroup" aria-label="Oportunidades abiertas">{loadingReferences ? <p className="muted">Buscando oportunidades…</p> : references.length ? references.map(reference => { const borradores = diagnosticos.filter(row => row.tipo === 'fabricacion' && row.oportunidad_id === reference.id && row.estado === 'borrador'); const monto = montoOportunidad(reference); return <button key={reference.id} type="button" role="radio" aria-checked={selectedReference?.id === reference.id} className={`dx-initial-receipt${selectedReference?.id === reference.id ? ' is-selected' : ''}`} onClick={() => setForm(current => ({ ...current, referencia: reference }))}><i className="dx-initial-radio"/><span className="dx-initial-receipt-copy"><strong>{reference.numero || 'Oportunidad sin nombre'}</strong><small>{[reference.cliente || 'Cliente', reference.etapa ? etiquetaEtapa(reference.etapa) : ''].filter(Boolean).join(' · ')}</small></span>{borradores.length > 0 && <span className="dx-ui-pill is-amber">{borradores.length} {borradores.length === 1 ? 'borrador' : 'borradores'}</span>}{monto && <span className="dx-ui-pill">{monto}</span>}</button>; }) : <p className="muted">No hay oportunidades abiertas que coincidan.</p>}</section>
            {selectedReference && (() => { const borradores = diagnosticos.filter(row => row.tipo === 'fabricacion' && row.oportunidad_id === selectedReference.id && row.estado === 'borrador'); return borradores.length ? <div className="dx-initial-warning">Esta oportunidad ya tiene {borradores.length === 1 ? 'un diagnóstico' : `${borradores.length} diagnósticos`} en borrador. Puedes abrir uno de ellos en vez de crear otro. {borradores.map(row => <button key={row.id} type="button" onClick={() => openExisting(row)}>Abrir borrador</button>)}</div> : null; })()}
          </div>}
          {datosInicioError && <div className="alert alert-error" role="alert">{datosInicioError}</div>}
        </form></div>}
        {selected && <div className={`dx-scope${selected.tipo === 'mantenimiento' && informePanel ? ' dx-work-editing-report' : ''}`}>
          <div className="dx-work-page-head"><nav className="dx-work-steps" data-pasos={pasos.length} aria-label="Pasos del diagnóstico">
            {pasos.map((label, index) => <button key={label} className={workStep === index + 1 ? 'is-current' : workStep > index + 1 ? 'is-done' : ''} type="button" aria-current={workStep === index + 1 ? 'step' : undefined} onClick={async () => { const step = index + 1; if (step === pasoFinal(selected.tipo)) { await goInforme(); return; } setInformePanel(false); setWorkStep(step); }}><i>{workStep > index + 1 ? '✓' : index + 1}</i><span>{index + 1} · {label}</span></button>)}
          </nav><div className="dx-work-mobile-step" aria-live="polite"><strong>Paso {workStep} de {pasos.length} · {pasos[workStep - 1]}</strong><div className="dx-work-mobile-segments" data-pasos={pasos.length} aria-label="Ir a un paso del diagnóstico">{pasos.map((label, index) => <button key={label} type="button" aria-label={`Paso ${index + 1}: ${label}`} aria-current={workStep === index + 1 ? 'step' : undefined} className={workStep === index + 1 ? 'is-current' : workStep > index + 1 ? 'is-done' : ''} onClick={async () => { const step = index + 1; if (step === pasoFinal(selected.tipo)) { await goInforme(); return; } setInformePanel(false); setWorkStep(step); }}><span>{label}</span></button>)}</div></div></div>
          {access.ver && <DiagnosticoEstadoPanel empresaId={empresaId} diagnostico={selected} puedeAprobar={access.aprobar} permiteEscritura={Boolean(sesion.permiteEscritura)} permitirEmision={workStep === pasoFinal(selected.tipo)} emitirRef={selected.tipo === 'fabricacion' ? emitirFabricacionRef : undefined} cambiosSinGuardar={cambiosSinGuardar} onCambioCompleto={recargarEstadoDiagnostico} informeAction={informeAccess.ver && selected.tipo === 'mantenimiento' ? <button type="button" className="btn btn-secondary" onClick={() => { setInformePanel(true); setWorkStep(6); }}>Informe al cliente</button> : null} />}
          {selected.estado === 'emitido' && <div className="dx-inf-open-row"><button type="button" className="btn btn-primary" onClick={generarHojaCosteo} disabled={generandoHojaCosteo} aria-busy={generandoHojaCosteo}>{generandoHojaCosteo ? 'Abriendo Hoja de Costeo…' : hojaVinculada ? `Abrir Hoja de Costeo ${hojaVinculada.numero}` : 'Generar hoja de costeo'}</button>{hojaVinculada?.desfasada && <span className="dx-hc-sync-note">La hoja se creó con una emisión anterior: ábrela para {hojaVinculada.estado === 'aprobada' || hojaVinculada.con_cotizacion ? 'crear una nueva versión' : 'actualizarla'}.</span>}</div>}
          {selected.estado !== 'emitido' && hojaVinculada && <div className="dx-hc-sync-info" role="status">Este diagnóstico ya tiene la Hoja de Costeo {hojaVinculada.numero}. Al volver a emitirlo, la hoja mostrará un aviso para traer los cambios.</div>}
          {errorHojaCosteo && <div className="alert alert-error" role="alert">{errorHojaCosteo}</div>}
          {!access.ver && informeAccess.ver && selected.tipo === 'mantenimiento' && <div className="dx-inf-open-row"><button type="button" className="btn btn-secondary" onClick={() => { setInformePanel(true); setWorkStep(6); }}>Informe al cliente</button></div>}
          <div className="dx-summary" style={enPasoTrabajos || (selected.tipo === 'fabricacion' && workStep === pasoFinal('fabricacion')) ? undefined : { display: 'none' }}>
            <div className="dx-summary-chips"><span><b>{grupos.length}</b> trabajos</span><span><b>{lineasActuales.length}</b> tareas</span><span><b>{totalHH.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</b> horas-hombre</span><span><b>{totalHM.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</b> horas-máquina</span></div>
          </div>
          {selected.tipo === 'mantenimiento' && workStep <= 3 && !informePanel && <div className="dx-initial-flow dx-existing-initial-flow">
            {workStep === 1 && <section className="dx-initial-card"><h2>Equipo recibido</h2><dl className="dx-work-reception-grid"><div><dt>Equipo</dt><dd>{form.referencia?.activo || selected.activo_nombre || '—'}</dd></div><div><dt>Cliente</dt><dd>{form.referencia?.cliente || '—'}</dd></div><div><dt>Marca / modelo</dt><dd>{[form.referencia?.marca, form.referencia?.modelo].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Serie</dt><dd>{form.referencia?.numero_serie || form.referencia?.placa_serie || '—'}</dd></div><div><dt>Recepción</dt><dd>{form.referencia?.numero || '—'}</dd></div><div><dt>Fecha de ingreso</dt><dd>{form.referencia?.fecha_ingreso ? new Date(form.referencia.fecha_ingreso).toLocaleDateString('es-PE') : '—'}</dd></div></dl></section>}
            {workStep === 2 && <><section className="dx-initial-card"><h2>Equipo recibido</h2><dl className="dx-work-reception-grid"><div><dt>Equipo</dt><dd>{form.referencia?.activo || selected.activo_nombre || '—'}</dd></div><div><dt>Cliente</dt><dd>{form.referencia?.cliente || '—'}</dd></div><div><dt>Marca / modelo</dt><dd>{[form.referencia?.marca, form.referencia?.modelo].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Serie</dt><dd>{form.referencia?.numero_serie || form.referencia?.placa_serie || '—'}</dd></div></dl></section><section className="dx-initial-card"><h2>Tipo de componente</h2>{selected.componente_nombre ? <div className="dx-initial-component"><div className="dx-drawing-canvas dx-initial-thumb" dangerouslySetInnerHTML={{ __html: markupDibujoHallazgo(selected.componente_svg || '') }} /><strong>{selected.componente_nombre}</strong></div> : <p>—</p>}</section></>}
            {workStep === 3 && <><section className="dx-initial-card"><div className="field"><label>Motivo o falla reportada por el cliente</label><textarea className="input" rows="4" value={datosIniciales.motivo} disabled={!canEditInitialData} onChange={event => setDatosIniciales(current => ({ ...current, motivo: event.target.value }))} placeholder="—" /></div></section><section className="dx-initial-card dx-initial-grid"><div className="field"><label>Técnico responsable</label><select className="input" value={datosIniciales.tecnico_id} disabled={!canEditInitialData} onChange={event => setDatosIniciales(current => ({ ...current, tecnico_id: event.target.value }))}><option value="">{selected.tecnico_nombre || '—'}</option>{tecnicosInicio.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>)}</select></div><div className="field"><label>Fecha de inspección</label><input className="input" type="date" value={datosIniciales.fecha_inspeccion} disabled={!canEditInitialData} onChange={event => setDatosIniciales(current => ({ ...current, fecha_inspeccion: event.target.value }))} /></div></section></>}
          </div>}
          {selected.tipo === 'fabricacion' && workStep === 1 && <div className="dx-initial-flow dx-existing-initial-flow">
            <section className="dx-initial-card"><h2>Oportunidad</h2><dl className="dx-work-reception-grid"><div><dt>Oportunidad</dt><dd>{form.referencia?.numero || '—'}</dd></div><div><dt>Cliente</dt><dd>{form.referencia?.cliente || '—'}</dd></div><div><dt>Etapa</dt><dd>{form.referencia?.etapa ? etiquetaEtapa(form.referencia.etapa) : '—'}</dd></div><div><dt>Monto estimado</dt><dd>{montoOportunidad(form.referencia) || '—'}</dd></div></dl></section>
          </div>}
          {selected.tipo === 'fabricacion' && workStep === pasoFinal('fabricacion') && <div className="dx-initial-flow dx-existing-initial-flow">
            <section className="dx-initial-card dx-fab-emitir" aria-labelledby="dx-fab-emitir-title">
              <h2 id="dx-fab-emitir-title">{isReadOnly ? 'Trabajos emitidos' : 'Resumen para emitir'}</h2>
              {grupos.length ? <ul className="dx-fab-emitir-list">{grupos.map(group => { const horasGrupo = group.lines.reduce((sum, line) => sum + Number(line.horas_mano_obra || 0), 0); return <li key={group.familia.id}><span>{group.familia.nombre}</span><b>{group.lines.length} tarea{group.lines.length === 1 ? '' : 's'} · {horasGrupo.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h-h</b></li>; })}</ul> : <p className="muted">Aún no hay trabajos. Agrégalos en el paso Trabajos a realizar.</p>}
            </section>
            {!isReadOnly && <section className="dx-initial-card dx-fab-emitir" aria-labelledby="dx-fab-checks-title">
              <h2 id="dx-fab-checks-title">Antes de emitir</h2>
              <ul className="dx-fab-emitir-checks">
                <li className={grupos.length && !trabajosIncompletos.length ? 'is-ok' : 'is-warn'}>{!grupos.length ? 'Agrega al menos un trabajo.' : trabajosIncompletos.length ? `Hay trabajos sin actividades ni tareas: ${trabajosIncompletos.map(group => group.familia.nombre).join(', ')}.` : 'Cada trabajo tiene al menos una tarea o actividad costeada.'}</li>
                <li className={cambiosSinGuardar ? 'is-warn' : 'is-ok'}>{cambiosSinGuardar ? 'Hay cambios sin guardar en los trabajos.' : 'Todos los cambios están guardados.'}</li>
                <li className="is-info">Al emitir, el diagnóstico queda de solo lectura. Después podrás generar la Hoja de Costeo desde aquí.</li>
              </ul>
            </section>}
          </div>}
          <div className={`${selected.tipo === 'fabricacion' ? 'dx-body dx-body-fabricacion' : 'dx-body'}${selected.tipo === 'mantenimiento' && (informePanel || workStep <= 3) ? ' dx-work-hidden' : ''}${selected.tipo === 'fabricacion' && workStep !== pasoTrabajos('fabricacion') ? ' dx-work-hidden' : ''}${selected.tipo === 'mantenimiento' && hallazgoView === 'editor' ? ' dx-hallazgo-editor-mode' : ''}`}>
            {selected.tipo === 'mantenimiento' && form.referencia?.activo && <div className="dx-muted">Activo: {form.referencia.activo}</div>}
            {selected.tipo === 'mantenimiento' && <section className="dx-diagnostico-resumen-section" style={workStep === 4 ? undefined : { display: 'none' }} aria-labelledby="dx-hallazgos-title">
                <header className="dx-diagnostico-resumen-heading"><span>1</span><div><h3 id="dx-hallazgos-title">Hallazgos</h3><p>Registra las condiciones encontradas y las acciones recomendadas.</p></div></header>
                <div className="dx-hallazgos">
                  <HallazgosTrabajoPanel empresaId={empresaId} diagnostico={selected} lines={selected.lineas || []} familias={catalogs.familias} tipos={catalogs.tipos} cargos={catalogs.cargos} activos={catalogs.activos} extraFamilyIds={extraFamilyIds} onExtraFamilyIdsChange={setExtraFamilyIds} onCreateFamily={crearFamilia} onRemoveFamilyLines={queueFamilyLineDeletes} canEdit={canEditLines} readOnly={isReadOnly} onRegisterSave={saveFunction => { hallazgosSaveRef.current = saveFunction; }} onRegisterAddHallazgo={add => { hallazgosAddRef.current = add; }} onRegisterAddOtro={add => { hallazgosAddOtroRef.current = add; }} onRegisterBackToList={back => { hallazgosBackRef.current = back; }} onViewChange={view => { setHallazgoView(view); setWorkStep(4); setInformePanel(false); }} onRegisterGoToIncomplete={goTo => { goToIncompleteHallazgoRef.current = goTo; }} onDirtyChange={setHallazgosDirty} onDirtySummary={setHallazgosDirtySummary} onItemsChange={items => setSelected(current => current?.id === selected.id ? { ...current, hallazgos: items } : current)} onSavingChange={setHallazgosSaving} onError={message => setError(message || '')} onNotice={setNotice} />
                </div>
              </section>}
              {enPasoTrabajos && <section className="dx-diagnostico-resumen-section" aria-labelledby="dx-trabajos-realizar-title">
                <header className="dx-diagnostico-resumen-heading dx-work-step-heading"><span>{pasoTrabajos(selected.tipo)}</span><div><h3 id="dx-trabajos-realizar-title">Trabajos a realizar</h3><p>{selected.tipo === 'fabricacion' ? 'Elige el trabajo, su actividad y las tareas. Si la actividad tiene receta, sus tareas vienen marcadas con sus horas.' : 'Define las tareas, recursos y tiempos para atender los hallazgos.'}</p></div>{canEditLines && <button type="button" className="dx-diagnostico-resumen-add" aria-expanded={Boolean(taskPanel)} onClick={toggleTaskPanel}>{taskPanel ? 'Cerrar panel' : 'Agregar trabajo'}</button>}</header>
                <div className="dx-info">Cada tarea lleva sus propias horas: <b>horas-hombre</b> (trabajo del cargo elegido) y <b>horas-máquina</b> (uso del activo propio, si aplica).</div>
                {taskPanel && !taskPanelFamiliaId && <DiagnosticoAgregarTareasPanel key="extra-work-panel" initialFamiliaId={taskPanelInitialFamiliaId} suggestedFamilies={taskPanelSuggestedFamilies} familias={catalogs.familias} tipos={catalogs.tipos} cargos={catalogs.cargos} activos={catalogs.activos} plantillas={plantillasActividad} tipoDiagnostico={selected.tipo} lineas={selected.lineas || []} onClose={closeTaskPanel} onSelectionChange={setTaskPanelHasSelection} onAdd={(rows, duplicates = 0) => { appendCascadeLines(rows); setNotice(`${rows.length ? `Se agregaron ${rows.length} tarea${rows.length === 1 ? '' : 's'}` : 'No se agregaron tareas'}${duplicates ? `; ${duplicates} duplicada${duplicates === 1 ? '' : 's'} omitida${duplicates === 1 ? '' : 's'}` : ''}.`); window.requestAnimationFrame(() => (tableAnchorRef.current?.focus({ preventScroll: true }), tableAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))); }} onCreateFamily={crearFamilia} onCreateType={crearTipo} />}
                <div ref={tableAnchorRef} className="dx-agregar-inline-table-anchor" tabIndex="-1" aria-label="Líneas del diagnóstico">
                  {loadingCatalogs ? <div className="dx-empty">Cargando catálogos...</div> : catalogError ? <div className="dx-empty" role="alert">No se pudieron cargar los catálogos: {catalogError}</div> : !grupos.length ? <div className="dx-empty">Aún no hay trabajos</div> : <div className="dx-work-family-groups">{grupos.map(renderFamilyGroup)}</div>}
                </div>
              </section>}
            {isReadOnly && <div className="muted" style={{ marginTop: 12 }}>Los diagnósticos emitidos son de solo lectura.</div>}
          </div>
          {informePanel && <>
          <DiagnosticoInformePanel encabezadoControles={<section className="dx-diagnostico-resumen-section dx-report-diagnosis-card" aria-labelledby="dx-report-diagnosis-title">
            <header className="dx-diagnostico-resumen-heading"><span>2</span><div><h3 id="dx-report-diagnosis-title">Diagnóstico</h3><p>{isReadOnly ? 'Diagnóstico emitido. Texto de solo lectura.' : 'Redacta y guarda el diagnóstico antes de emitir el informe al cliente.'}</p></div></header>
            <div className="dx-diagnostico-resumen-card">
              <textarea aria-label="Diagnóstico" value={resumenVisible} disabled={!canEditLines || generandoResumenIA} onChange={event => cambiarResumen(event.target.value)} placeholder="Describe la evaluación, causa y conclusión técnica…" />
              <MejorarRedaccionIA diagnosticoId={selected?.id} texto={resumenVisible} disabled={!canEditLines || generandoResumenIA} compact onApply={value => cambiarResumen(value, 'editado')} />
              <div className="dx-diagnostico-resumen-meta"><div><strong className={selected.resumen_origen === 'editado' ? 'is-edited' : 'is-auto'}>{selected.resumen_origen === 'editado' ? 'Editado' : 'Generado con IA'}</strong><small>Este texto se incluirá en el informe al cliente.</small></div><div>{canEditLines && <button type="button" className="dx-diagnostico-resumen-regenerate" onClick={() => selected.resumen_origen === 'editado' && resumenVisible.trim() ? setConfirmarRegenerarResumen(true) : generarResumenIA()} disabled={generandoResumenIA || !(selected.hallazgos || []).length || hallazgosIncompletosCount > 0} aria-busy={generandoResumenIA}>{generandoResumenIA ? 'Generando…' : 'Generar con IA'}</button>}<button type="button" className="dx-diagnostico-resumen-regenerate" onClick={guardarResumenParaInforme} disabled={!canEditLines || !summaryDirty}>Guardar diagnóstico</button></div></div>
              {errorResumenIA && <div className="dx-diagnostico-resumen-error" role="alert">{errorResumenIA}</div>}
            </div>
          </section>} diagnostico={{ ...selected, resumen_diagnostico: resumenVisible }} catalogos={{ ...catalogs, tipos_dano: catalogs.hallazgos.tipo_dano, causas_probables: catalogs.hallazgos.causa_probable }} cabecera={{ recepcion_id: form.referencia?.id || selected.recepcion_id, numero_recepcion: form.referencia?.numero || null, fecha_recepcion: form.referencia?.fecha_ingreso || null, activo_nombre: form.referencia?.activo || null, cliente_razon_social: form.referencia?.cliente || null, numero_serie: form.referencia?.numero_serie || null, horometro: null }} puedeVer={informeAccess.ver} puedeEditar={informeAccess.editar && access.editar && Boolean(sesion.permiteEscritura)} puedeEmitirDiagnostico={access.aprobar && Boolean(sesion.permiteEscritura)} firmaUrl={sesion.sociedadActiva?.firma_url || null} onEmitirDiagnostico={async () => {
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
          }} inline onClose={() => { setInformePanel(false); setWorkStep(4); }} />
          </>}
        </div>}
      </ModalShell>}
    </main>
  );
}
