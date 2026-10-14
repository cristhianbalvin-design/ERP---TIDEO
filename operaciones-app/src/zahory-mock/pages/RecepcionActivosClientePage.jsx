import { useCallback, useEffect, useMemo, useState } from 'react';
import { limpiarSeleccionAlDesenfocar, marcarEdicionNumerica, seleccionarAlEnfocar, seleccionarAlPulsar } from '../utils/seleccionarAlEnfocar.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { setWorkMode } from '../../workMode.js';
import { WorkMenuButton } from '../components/WorkMenuButton.jsx';
import { subirAdjunto, cargarAdjuntosPorEntidades, obtenerUrlAdjunto } from '../../../../src/services/storageService.js';
import { catalogoComponentesService } from '../../../../src/services/catalogoComponentesService.js';
import { asignarComponenteCatalogoActivo } from '../../services/diagnosticoTecnicoService.js';
import {
  ESTADOS_CUSTODIA, actualizarEstadoCustodia, crearActivoClienteYRecepcion, crearRecepcion,
  listarActivosCliente, listarAlmacenes, listarClientes, listarRecepciones, listarEstadosDiagnosticoRecepcion,
} from '../../services/recepcionesActivosClienteService.js';
import { abrirInformePdfDeRecepcion, listarInformesEmitidosRecepcion } from '../../services/informePdfAcciones.js';

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const ANIO_MAXIMO_ACTIVO = new Date().getFullYear() + 1;
const CHECKLIST_ITEMS = [
  ['integridad_exterior', 'Integridad exterior verificada'],
  ['sin_danos_visibles', 'Sin daños visibles adicionales'],
  ['accesorios_completos', 'Accesorios/documentación completos'],
  ['placa_serie_legible', 'Placa o número de serie legible'],
];
const ESTADO_LABELS = { recibido: 'Recibido', en_diagnostico: 'En diagnóstico', en_reparacion: 'En reparación', listo_entrega: 'Listo para entrega', entregado: 'Entregado' };
const blankForm = sociedadId => ({ cliente_id: '', activo_id: '', fecha_ingreso: today(), hora_ingreso: nowTime(), guia_ingreso: '', lectura_valor: '', lectura_unidad: 'horas', tipo_activo: '', almacen_id: '', observaciones: '', checklist: Object.fromEntries(CHECKLIST_ITEMS.map(([key]) => [key, false])), sociedad_id: sociedadId || '', componente_catalogo_id: '' });
const nombreCliente = cliente => cliente?.razon_social || cliente?.nombre_comercial || cliente?.ruc || 'Cliente sin nombre';
const nombreActivo = activo => activo ? [activo.nombre, activo.marca, activo.modelo, activo.placa_serie].filter(Boolean).join(' · ') : 'Activo sin nombre';
const dateLabel = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-PE') : '—';
const previewUrl = file => { try { return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''; } catch { return ''; } };
const estadoCustodiaClass = estado => ({ recibido: 'is-amber', en_diagnostico: 'is-cyan', en_reparacion: 'is-violet', listo_entrega: 'is-green', entregado: 'is-gray' }[estado] || 'is-gray');
const diagnosticUrl = row => row?.diagnostico_id
  ? `/diagnostico-tecnico?trabajo=${encodeURIComponent(row.diagnostico_id)}`
  : `/diagnostico-tecnico?nuevo=mantenimiento&recepcion=${encodeURIComponent(row?.id || '')}`;
const diagnosticoEmitido = diag => (typeof diag === 'string' ? diag : diag?.estado) === 'emitido';
const diagnosticoBorrador = diag => (typeof diag === 'string' ? diag : diag?.estado) === 'borrador';
export function resolverAccionDiagnostico(estadoCustodia, diag, informeEmitido = false) {
  if (diagnosticoEmitido(diag)) return { tipo: informeEmitido ? 'ver-informe' : 'ver' };
  if (diagnosticoBorrador(diag)) return { tipo: ['recibido', 'en_diagnostico'].includes(estadoCustodia) ? 'continuar' : 'borrador-tardio' };
  return { tipo: ['recibido', 'en_diagnostico'].includes(estadoCustodia) ? 'iniciar' : 'ninguna' };
}
const idDiagnostico = diag => typeof diag === 'string' ? '' : (diag?.id || diag?.diagnostico_id || '');
const nombreAccionDiagnostico = tipo => ({ iniciar: 'Iniciar diagnóstico', continuar: 'Continuar borrador', ver: 'Ver diagnóstico', 'ver-informe': 'Ver informe PDF', 'borrador-tardio': 'Ver borrador' }[tipo] || '');
const abrirDiagnostico = url => { window.location.hash = url; };

function parsearObservaciones(value = '') {
  const text = String(value || '');
  const marker = /Checklist de condición:\s*/i;
  const match = marker.exec(text);
  const libres = (match ? text.slice(0, match.index) : text).trim().replace(/\|\s*$/, '').trim();
  const checklist = {};
  if (match) {
    const raw = text.slice(match.index + match[0].length);
    CHECKLIST_ITEMS.forEach(([key, label]) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const result = new RegExp(`${escaped}:\\s*(Sí|No registrado)`, 'i').exec(raw);
      if (result) checklist[key] = result[1].toLowerCase() === 'sí';
    });
  }
  return { observaciones: libres, checklist };
}

export function RecepcionActivosClientePage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const sociedadId = sesion.sociedadId;
  const [activos, setActivos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [recepciones, setRecepciones] = useState([]);
  const [diagnosticos, setDiagnosticos] = useState({});
  const [informesEmitidos, setInformesEmitidos] = useState({});
  const [generandoInformeId, setGenerandoInformeId] = useState('');
  const [errorInformePdf, setErrorInformePdf] = useState('');
  const [form, setForm] = useState(() => blankForm(sociedadId));
  const [assetSearch, setAssetSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [fotos, setFotos] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [adjuntosLoading, setAdjuntosLoading] = useState(false);
  const [adjuntosError, setAdjuntosError] = useState('');
  const [altaActivoForm, setAltaActivoForm] = useState(null);
  const [altaActivoAbierta, setAltaActivoAbierta] = useState(false);
  const [componentesCatalogo, setComponentesCatalogo] = useState([]);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('todos');
  const [query, setQuery] = useState('');
  const [banner, setBanner] = useState(null);

  const showToast = message => { setToast(message); window.setTimeout(() => setToast(null), 3500); };
  const cargar = useCallback(async () => {
    if (!empresaId || !sociedadId || sesion.estado !== 'listo') { setActivos([]); setClientes([]); setAlmacenes([]); setRecepciones([]); return; }
    setLoading(true); setError('');
    try {
      const [assets, accounts, warehouses, receipts] = await Promise.all([listarActivosCliente(empresaId, sociedadId), listarClientes(empresaId), listarAlmacenes(empresaId, sociedadId), listarRecepciones(empresaId, sociedadId)]);
      setActivos(assets); setClientes(accounts); setAlmacenes(warehouses); setRecepciones(receipts);
      const receiptIds = receipts.map(row => row.id);
      const [diagnosticosResult, informesResult] = await Promise.allSettled([listarEstadosDiagnosticoRecepcion(empresaId, receiptIds), listarInformesEmitidosRecepcion(empresaId, receiptIds)]);
      setDiagnosticos(diagnosticosResult.status === 'fulfilled' ? diagnosticosResult.value : {});
      setInformesEmitidos(informesResult.status === 'fulfilled' ? informesResult.value : {});
    } catch (loadError) { setError(loadError?.message || 'No se pudo cargar la recepción de activos.'); }
    finally { setLoading(false); }
  }, [empresaId, sociedadId, sesion.estado]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const media = window.matchMedia('(max-width:680px), (max-height:520px)');
    const updateWorkMode = () => setWorkMode(view !== 'list' && media.matches);
    updateWorkMode();
    media.addEventListener?.('change', updateWorkMode);
    return () => {
      media.removeEventListener?.('change', updateWorkMode);
      setWorkMode(false);
    };
  }, [view]);
  useEffect(() => {
    let active = true;
    if (!empresaId || !sociedadId || sesion.estado !== 'listo') { setComponentesCatalogo([]); return () => { active = false; }; }
    catalogoComponentesService.listar(empresaId, sociedadId).then(rows => { if (active) setComponentesCatalogo(rows || []); }).catch(() => { if (active) setComponentesCatalogo([]); });
    return () => { active = false; };
  }, [empresaId, sociedadId, sesion.estado]);
  useEffect(() => {
    if (sesion.estado !== 'listo' || !empresaId) return undefined;
    let active = true;
    (async () => {
      const supabase = getSupabaseClient();
      const [create, edit] = await Promise.all([
        supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'recepcion_activos_cliente', target_accion: 'crear' }),
        supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'recepcion_activos_cliente', target_accion: 'editar' }),
      ]);
      if (active) { setPuedeCrear(!create.error && Boolean(create.data)); setPuedeEditar(!edit.error && Boolean(edit.data)); }
    })().catch(permissionError => { if (active) setError(permissionError?.message || 'No se pudieron verificar los permisos.'); });
    return () => { active = false; };
  }, [empresaId, sesion.estado]);
  useEffect(() => { if (sociedadId && form.sociedad_id !== sociedadId) setForm(current => ({ ...current, sociedad_id: sociedadId })); }, [sociedadId, form.sociedad_id]);

  const activosPorId = useMemo(() => new Map(activos.map(item => [item.id, item])), [activos]);
  const clientesPorId = useMemo(() => new Map(clientes.map(item => [item.id, item])), [clientes]);
  const almacenesPorId = useMemo(() => new Map(almacenes.map(item => [item.id, item])), [almacenes]);
  const recepcion = recepciones.find(item => item.id === selectedId);
  const activoDetalle = activosPorId.get(recepcion?.activo_id);
  const activosVisibles = useMemo(() => {
    const term = assetSearch.trim().toLowerCase();
    return activos.filter(item => (!form.cliente_id || item.cliente_propietario_id === form.cliente_id) && (!term || [item.codigo, item.nombre, item.marca, item.modelo, item.placa_serie].filter(Boolean).join(' ').toLowerCase().includes(term))).slice(0, 50);
  }, [activos, assetSearch, form.cliente_id]);
  const filtradas = useMemo(() => recepciones.filter(row => {
    const current = diagnosticos[row.id];
    const estado = row.estado_custodia || 'recibido';
    const matchesFilter = filter === 'todos' || filter === estado;
    const asset = activosPorId.get(row.activo_id);
    const client = clientesPorId.get(asset?.cliente_propietario_id);
    const haystack = [row.numero, row.numero_caso, asset?.nombre, asset?.codigo, nombreCliente(client)].join(' ').toLowerCase();
    return matchesFilter && (!query.trim() || haystack.includes(query.trim().toLowerCase())) && Boolean(current || !current);
  }), [recepciones, filter, diagnosticos, activosPorId, clientesPorId, query]);
  const resumen = useMemo(() => ({
    total: recepciones.length,
    diagnosticar: recepciones.filter(row => ['recibido', 'en_diagnostico'].includes(row.estado_custodia || 'recibido') && !diagnosticoEmitido(diagnosticos[row.id])).length,
    diagnostico: recepciones.filter(row => diagnosticos[row.id]?.estado === 'borrador' || row.estado_custodia === 'en_diagnostico').length,
    taller: recepciones.filter(row => ['en_reparacion', 'listo_entrega'].includes(row.estado_custodia)).length,
  }), [recepciones, diagnosticos]);
  const conteos = useMemo(() => Object.fromEntries(['todos', ...ESTADOS_CUSTODIA].map(key => [key, key === 'todos' ? recepciones.length : recepciones.filter(row => (row.estado_custodia || 'recibido') === key).length])), [recepciones]);

  useEffect(() => {
    let current = true;
    if (view !== 'detail' || !recepcion?.id) { setAdjuntos([]); setAdjuntosError(''); return () => { current = false; }; }
    setAdjuntosLoading(true); setAdjuntosError('');
    cargarAdjuntosPorEntidades({ empresaId, entidadTipo: 'recepciones_activos_cliente', entidadIds: [recepcion.id] })
      .then(async rows => Promise.all((rows || []).map(async row => ({ ...row, vistaUrl: await obtenerUrlAdjunto(row) }))))
      .then(rows => { if (current) setAdjuntos(rows.filter(row => row.vistaUrl)); })
      .catch(loadError => { if (current) setAdjuntosError(loadError?.message || 'No se pudieron cargar las fotografías.'); })
      .finally(() => { if (current) setAdjuntosLoading(false); });
    return () => { current = false; };
  }, [empresaId, recepcion?.id, view]);

  const actualizarForm = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const seleccionarActivo = item => { setForm(current => ({ ...current, activo_id: item.id, cliente_id: item.cliente_propietario_id || '', tipo_activo: item.tipo_activo || '', componente_catalogo_id: item.componente_catalogo_id || '' })); setAssetSearch(item.codigo || item.nombre || ''); };
  const abrirNuevaRecepcion = () => { setForm(blankForm(sociedadId)); setAssetSearch(''); setAltaActivoForm(null); setAltaActivoAbierta(false); setFotos([]); setError(''); setBanner(null); setView('new'); };
  const actualizarAltaActivo = (key, value) => { setAltaActivoForm(current => current ? { ...current, [key]: value } : current); if (key === 'tipo_activo') actualizarForm('tipo_activo', value); };
  const abrirAltaActivo = () => {
    if (!form.cliente_id) { setError('Selecciona un cliente antes de registrar un activo nuevo.'); return; }
    if (!puedeCrear || !sesion.permiteEscritura) { setError('Tu rol o la sociedad activa no permiten registrar activos.'); return; }
    setAltaActivoForm({ tipo_activo: form.tipo_activo || '', componente_catalogo_id: form.componente_catalogo_id || '', codigo_origen: '', nombre: assetSearch.trim(), marca: '', modelo: '', placa_serie: '', año_fabricacion: '', año_overhaul: '' });
    setAltaActivoAbierta(true); setError('');
  };
  const guardarAltaActivo = () => {
    if (!altaActivoForm) return false;
    if (!puedeCrear || !sesion.permiteEscritura) { setError('Tu rol o la sociedad activa no permiten registrar activos.'); return false; }
    if (!altaActivoForm.tipo_activo) { setError('Selecciona el tipo de activo antes de registrar.'); return false; }
    if (!String(altaActivoForm.nombre || '').trim()) { setError('El nombre es obligatorio para registrar el activo.'); return false; }
    if (altaActivoForm.tipo_activo === 'maquinaria_completa' && !String(altaActivoForm.marca || '').trim()) { setError('La marca es obligatoria para una maquinaria completa.'); return false; }
    if (altaActivoForm.tipo_activo === 'maquinaria_completa' && !String(altaActivoForm.modelo || '').trim()) { setError('El modelo es obligatorio para una maquinaria completa.'); return false; }
    for (const [key, label] of [['año_fabricacion', 'El año de fabricación'], ['año_overhaul', 'El año de overhaul']]) {
      const value = altaActivoForm[key]; if (value === '' || value == null) continue;
      const year = Number(value); if (!Number.isInteger(year) || year < 1800 || year > ANIO_MAXIMO_ACTIVO) { setError(`${label} debe ser un año entero entre 1800 y ${ANIO_MAXIMO_ACTIVO}.`); return false; }
    }
    setError(''); setAltaActivoAbierta(false); showToast('Activo preparado; se creará al registrar la recepción.'); return true;
  };
  const seleccionarFotos = event => { const files = [...(event.target.files || [])]; setFotos(current => [...current, ...files].slice(0, 8)); event.currentTarget.value = ''; };
  const cambiarEstado = async (id, estado) => {
    if (!puedeEditar || !sesion.permiteEscritura) { setError('Tu rol o la sociedad activa no permiten editar recepciones.'); return; }
    try { const updated = await actualizarEstadoCustodia(empresaId, id, estado); setRecepciones(current => current.map(row => row.id === id ? { ...row, ...updated } : row)); showToast(`Estado actualizado a ${ESTADO_LABELS[estado] || estado}.`); }
    catch (stateError) { setError(stateError?.message || 'No se pudo actualizar el estado de custodia.'); }
  };
  const guardar = async event => {
    event.preventDefault();
    if (!puedeCrear || !sesion.permiteEscritura) { setError('Tu rol o la sociedad activa no permiten registrar recepciones.'); return; }
    const activoExistente = altaActivoForm ? null : activosPorId.get(form.activo_id);
    if (!form.cliente_id) { setError('Selecciona el cliente propietario.'); return; }
    if (!form.almacen_id) { setError('Selecciona el almacén de custodia.'); return; }
    if (!form.fecha_ingreso) { setError('La fecha de ingreso es obligatoria.'); return; }
    if (!altaActivoForm && !activoExistente) { setError('Selecciona un activo de cliente válido.'); return; }
    if (!altaActivoForm && activoExistente.cliente_propietario_id !== form.cliente_id) { setError('El activo seleccionado no corresponde al cliente elegido.'); return; }
    if (altaActivoForm && !guardarAltaActivo()) return;
    setSaving(true); setError('');
    try {
      const observaciones = [String(form.observaciones || '').trim(), `Checklist de condición: ${CHECKLIST_ITEMS.map(([key, label]) => `${label}: ${form.checklist[key] ? 'Sí' : 'No registrado'}`).join(' | ')}`].filter(Boolean).join('\n');
      const result = altaActivoForm
        ? await crearActivoClienteYRecepcion(empresaId, { ...altaActivoForm, cliente_propietario_id: form.cliente_id, sociedad_id: form.sociedad_id, fecha_ingreso: form.fecha_ingreso, hora_ingreso: form.hora_ingreso, guia_ingreso: form.guia_ingreso, lectura_valor: form.lectura_valor, lectura_unidad: form.lectura_unidad, almacen_id: form.almacen_id, observaciones })
        : { recepcion: await crearRecepcion(empresaId, { ...form, observaciones }), activo: activoExistente };
      const created = result.recepcion;
      const asset = result.activo || activoExistente;
      const type = altaActivoForm?.tipo_activo || form.tipo_activo || asset?.tipo_activo;
      const componentId = altaActivoForm?.tipo_activo === 'componente' ? altaActivoForm.componente_catalogo_id : form.componente_catalogo_id;
      if (asset && type === 'componente' && (componentId || asset.componente_catalogo_id) && componentId !== asset.componente_catalogo_id) await asignarComponenteCatalogoActivo(empresaId, asset.id, componentId || null);
      const photoErrors = [];
      for (const photo of fotos) {
        try { await subirAdjunto({ empresaId, entidadTipo: 'recepciones_activos_cliente', entidadId: created.id, file: photo, categoria: 'condicion_activo', descripcion: `Evidencia de condición de ${asset?.codigo || asset?.id}`, subidoPor: sesion.usuario?.id || null }); }
        catch (photoError) { photoErrors.push(`${photo.name}: ${photoError?.message || 'error de carga'}`); }
      }
      if (asset) setActivos(current => [asset, ...current.filter(item => item.id !== asset.id)]);
      setRecepciones(current => [created, ...current]); setSelectedId(created.id); setDiagnosticos(current => ({ ...current, [created.id]: null })); setBanner({ kind: 'ok', text: `Recepción ${created.numero} registrada. El siguiente paso es el diagnóstico.` });
      setForm(blankForm(sociedadId)); setAssetSearch(''); setAltaActivoForm(null); setAltaActivoAbierta(false); setFotos([]); setView('detail');
      if (photoErrors.length) setError(`La recepción se creó, pero no se cargaron: ${photoErrors.join('; ')}`);
      showToast(photoErrors.length ? `Recepción ${created.numero} creada; algunas fotos fallaron.` : `Recepción ${created.numero} registrada.`);
    } catch (saveError) { setError(saveError?.message || 'No se pudo registrar la recepción.'); }
    finally { setSaving(false); }
  };

  const openDetail = row => { setSelectedId(row.id); setBanner(null); setError(''); setView('detail'); };
  const toList = useCallback(() => { setView('list'); setBanner(null); setError(''); }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    const handleWorkBack = () => toList();
    window.addEventListener('dx-work-back', handleWorkBack);
    return () => window.removeEventListener('dx-work-back', handleWorkBack);
  }, [toList]);
  const currentDiag = recepcion ? diagnosticos[recepcion.id] : null;
  const ejecutarInformePdf = async row => {
    const win = window.open('', '_blank');
    setErrorInformePdf('');
    setGenerandoInformeId(row.id);
    try { await abrirInformePdfDeRecepcion(row.id, win); }
    catch (pdfError) { setErrorInformePdf(pdfError?.message || 'No se pudo generar el PDF del informe.'); }
    finally { setGenerandoInformeId(''); }
  };
  const diagnosticAction = row => {
    const diag = diagnosticos[row.id];
    const informe = informesEmitidos[row.id];
    const action = resolverAccionDiagnostico(row.estado_custodia || 'recibido', diag, Boolean(informe));
    const secondaryReport = informe && action.tipo !== 'ver-informe' ? <button type="button" className="dx-recact-secondary-link" disabled={generandoInformeId === row.id} onClick={event => { event.stopPropagation(); ejecutarInformePdf(row); }}>{generandoInformeId === row.id ? 'Generando PDF…' : 'Ver informe PDF (v' + informe.version + ')'}</button> : null;
    if (action.tipo === 'ninguna') return <div className="dx-recact-diagnosis-actions"><span className="dx-recact-diagnosis-empty">Sin diagnóstico registrado</span>{secondaryReport}</div>;
    const diagnosticId = idDiagnostico(diag);
    const url = action.tipo === 'iniciar' ? diagnosticUrl(row) : diagnosticUrl({ id: row.id, diagnostico_id: diagnosticId });
    const label = nombreAccionDiagnostico(action.tipo);
    const className = ['ver', 'ver-informe'].includes(action.tipo) ? 'dx-ui-pill is-green dx-recact-inline-pill' : 'dx-recact-link';
    const pill = action.tipo === 'ver-informe' ? <>Informe emitido · {label}</> : action.tipo === 'ver' ? <>Diagnóstico emitido · {label}</> : <>{label} →</>;
    return <div className="dx-recact-diagnosis-actions"><button type="button" className={className} disabled={action.tipo === 'ver-informe' && generandoInformeId === row.id} onClick={event => { event.stopPropagation(); if (action.tipo === 'ver-informe') ejecutarInformePdf(row); else abrirDiagnostico(url); }}>{action.tipo === 'ver-informe' && generandoInformeId === row.id ? 'Generando PDF…' : pill}</button>{secondaryReport}</div>;
  };
  const missing = [!form.cliente_id && 'cliente', !form.almacen_id && 'almacén', !(form.activo_id || (altaActivoForm && !altaActivoAbierta)) && 'activo', !form.fecha_ingreso && 'fecha de ingreso', altaActivoAbierta && 'datos del activo nuevo'].filter(Boolean);
  const bloqueada = !sociedadId || !sesion.permiteEscritura;

  return <section className="dx-ui dx-recact">
    {view === 'list' && <>
      <header className="dx-recact-header"><div><div className="dx-recact-eyebrow">Taller · Almacén</div><h1>Recepción de activos de cliente</h1><p>Ingreso, custodia y condición inicial del activo recibido.</p></div><button type="button" className="btn btn-primary" onClick={abrirNuevaRecepcion} disabled={!puedeCrear || bloqueada}>＋ Nueva recepción</button></header>
      {!sociedadId && <div className="dx-recact-alert">Selecciona una sociedad operativa para cargar activos, almacenes y recepciones.</div>}
      {!sesion.permiteEscritura && sociedadId && <div className="dx-recact-alert">Vista consolidada o de solo lectura: no se permite crear ni editar recepciones.</div>}
      {!puedeCrear && sesion.estado === 'listo' && <div className="dx-recact-alert is-error">No tienes permiso para crear recepciones de activos de cliente.</div>}
      {error && <div className="dx-recact-alert is-error" role="alert">{error}</div>}
      {errorInformePdf && <div className="dx-recact-alert is-error" role="alert">{errorInformePdf}</div>}
      <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{resumen.total}</b><span>Recepciones</span></div><div className="dx-ui-chip"><b>{resumen.diagnosticar}</b><span>Por diagnosticar</span></div><div className="dx-ui-chip"><b>{resumen.diagnostico}</b><span>En diagnóstico</span></div><div className="dx-ui-chip"><b>{resumen.taller}</b><span>En taller o listos</span></div></div>
      <div className="dx-ui-card dx-recact-card"><div className="dx-ui-toolbar"><h2>Recepciones de activos</h2><span className="dx-ui-count">{loading ? 'Cargando…' : `${filtradas.length} de ${recepciones.length}`}</span><label className="dx-ui-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar por recepción, activo o cliente" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar recepción, activo o cliente" /></label></div>
        <div className="dx-recact-tabs" role="tablist" aria-label="Filtrar por custodia">{[['todos', 'Todas'], ...ESTADOS_CUSTODIA.map(state => [state, ESTADO_LABELS[state]])].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}<small>{conteos[key]}</small></button>)}</div>
        <div className="dx-ui-head dx-recact-cols" aria-hidden="true"><span>Recepción</span><span>Activo</span><span>Ingreso</span><span>Custodia</span><span>Diagnóstico</span><span /></div>
        {loading && !recepciones.length ? <div className="dx-ui-empty">Cargando recepciones…</div> : !recepciones.length ? <div className="dx-ui-empty">Aún no hay recepciones para la sociedad activa.</div> : !filtradas.length ? <div className="dx-ui-empty">No hay recepciones que coincidan con la búsqueda o el filtro.</div> : filtradas.map(row => {
          const asset = activosPorId.get(row.activo_id); const client = clientesPorId.get(asset?.cliente_propietario_id); const warehouse = almacenesPorId.get(row.almacen_id);
          return <div key={row.id} className="dx-ui-row dx-recact-cols" role="button" tabIndex={0} onClick={() => openDetail(row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(row); } }}>
            <div className="dx-recact-num"><b>{row.numero || row.id}</b><small>Caso {row.numero_caso || '—'}</small></div><div className="dx-recact-asset"><b>{nombreActivo(asset)}</b><small>{asset?.codigo || row.activo_id} · {nombreCliente(client)}</small></div><div className="dx-recact-ing"><b>{dateLabel(row.fecha_ingreso)}{row.hora_ingreso ? ` · ${String(row.hora_ingreso).slice(0, 5)}` : ''}</b><small>{warehouse?.nombre || 'Sin almacén'}</small></div><span className={`dx-ui-pill ${estadoCustodiaClass(row.estado_custodia)}`}><i />{ESTADO_LABELS[row.estado_custodia] || 'Recibido'}</span><div className="dx-recact-diagnosis">{diagnosticAction(row)}</div><span className="dx-ui-arrow" aria-hidden="true">›</span>
          </div>;
        })}
      </div>
    </>}

    {view === 'detail' && recepcion && <>
      <div className="dx-recact-mobile-heading"><WorkMenuButton /><button type="button" className="dx-recact-mobile-back" aria-label="Volver a recepciones" onClick={toList}>←</button><strong>Detalle de recepción</strong></div>
      <button type="button" className="dx-recact-back" onClick={toList}>← Volver a recepciones</button>
      <header className="dx-recact-header"><div><div className="dx-recact-eyebrow">Detalle de recepción</div><h1>{recepcion.numero || recepcion.id} · Caso {recepcion.numero_caso || '—'}</h1><p>{nombreActivo(activoDetalle)} · {nombreCliente(clientesPorId.get(activoDetalle?.cliente_propietario_id))}</p></div><span className={`dx-ui-pill ${estadoCustodiaClass(recepcion.estado_custodia)}`}><i />{ESTADO_LABELS[recepcion.estado_custodia] || 'Recibido'}</span></header>
      {banner && (() => { const action = resolverAccionDiagnostico(recepcion.estado_custodia || 'recibido', diagnosticos[recepcion.id]); return <div className="dx-recact-banner">{banner.text}<button type="button" className="btn btn-primary" onClick={() => abrirDiagnostico(diagnosticUrl({ id: recepcion.id }))}>{nombreAccionDiagnostico(action.tipo)}</button></div>; })()}
      {error && <div className="dx-recact-alert is-error" role="alert">{error}</div>}
      {errorInformePdf && <div className="dx-recact-alert is-error" role="alert">{errorInformePdf}</div>}
      <div className="dx-recact-steps" aria-label="Pasos de custodia">{ESTADOS_CUSTODIA.map((state, index) => <button key={state} type="button" className={`${state === recepcion.estado_custodia ? 'is-current' : index < ESTADOS_CUSTODIA.indexOf(recepcion.estado_custodia) ? 'is-done' : ''}`} disabled={!puedeEditar || !sesion.permiteEscritura} onClick={() => cambiarEstado(recepcion.id, state)}><b>{index + 1}</b>{ESTADO_LABELS[state]}</button>)}</div>
      <div className="dx-recact-detail"><div className="dx-recact-diagnosis-strip"><div><b>Diagnóstico técnico</b><span>{(() => { const action = resolverAccionDiagnostico(recepcion.estado_custodia || 'recibido', currentDiag, Boolean(informesEmitidos[recepcion.id])); const informe = informesEmitidos[recepcion.id]; const disponibilidad = informe && action.tipo !== 'ver-informe' ? ' Informe al cliente v' + informe.version + ' disponible.' : ''; return action.tipo === 'ver-informe' ? 'Diagnóstico emitido. Informe al cliente v' + informe.version + ' disponible.' : action.tipo === 'ver' ? 'Diagnóstico emitido. El informe al cliente aún no está emitido.' : action.tipo === 'continuar' || action.tipo === 'borrador-tardio' ? 'Hay un diagnóstico en borrador asociado a esta recepción.' + disponibilidad : action.tipo === 'ninguna' ? (informe ? 'Sin diagnóstico registrado.' + disponibilidad : 'Sin diagnóstico registrado') : 'Inicia el diagnóstico técnico para esta recepción.'; })()}</span></div>{(() => { const action = resolverAccionDiagnostico(recepcion.estado_custodia || 'recibido', currentDiag, Boolean(informesEmitidos[recepcion.id])); const informe = informesEmitidos[recepcion.id]; const secondaryReport = informe && action.tipo !== 'ver-informe' ? <button type="button" className="btn dx-recact-secondary-report" disabled={generandoInformeId === recepcion.id} onClick={() => ejecutarInformePdf(recepcion)}>{generandoInformeId === recepcion.id ? 'Generando PDF…' : 'Ver informe PDF (v' + informe.version + ')'}</button> : null; const diagnosticId = idDiagnostico(currentDiag); const url = action.tipo === 'iniciar' ? diagnosticUrl({ id: recepcion.id }) : diagnosticUrl({ id: recepcion.id, diagnostico_id: diagnosticId }); if (action.tipo === 'ver-informe') return <div className="dx-recact-report-actions"><button type="button" className="btn btn-primary" disabled={generandoInformeId === recepcion.id} onClick={() => ejecutarInformePdf(recepcion)}>{generandoInformeId === recepcion.id ? 'Generando PDF…' : 'Ver informe PDF'}</button><button type="button" className="dx-recact-secondary-link" onClick={() => abrirDiagnostico(url)}>Abrir diagnóstico</button></div>; if (action.tipo === 'ver') return <button type="button" className="dx-ui-pill is-green dx-recact-inline-pill" onClick={() => abrirDiagnostico(url)}>Ver diagnóstico</button>; if (action.tipo === 'ninguna') return secondaryReport ? <div className="dx-recact-report-actions">{secondaryReport}</div> : null; if (secondaryReport) return <div className="dx-recact-report-actions"><button type="button" className="dx-recact-link" onClick={() => abrirDiagnostico(url)}>{nombreAccionDiagnostico(action.tipo)} →</button>{secondaryReport}</div>; return <button type="button" className="dx-recact-link" onClick={() => abrirDiagnostico(url)}>{nombreAccionDiagnostico(action.tipo)} →</button>; })()}</div>
        <section className="dx-recact-section"><header><h2>Datos de ingreso</h2></header><dl><div><dt>Cliente</dt><dd>{nombreCliente(clientesPorId.get(activoDetalle?.cliente_propietario_id))}</dd></div><div><dt>Almacén</dt><dd>{almacenesPorId.get(recepcion.almacen_id)?.nombre || '—'}</dd></div><div><dt>Activo</dt><dd>{activoDetalle?.codigo || recepcion.activo_id} · {nombreActivo(activoDetalle)}</dd></div><div><dt>Ingreso</dt><dd>{dateLabel(recepcion.fecha_ingreso)}{recepcion.hora_ingreso ? ` · ${String(recepcion.hora_ingreso).slice(0, 5)}` : ''}</dd></div><div><dt>Guía</dt><dd>{recepcion.guia_ingreso || '—'}</dd></div>{recepcion.lectura_valor != null && <div><dt>Horómetro / lectura</dt><dd>{recepcion.lectura_valor} {recepcion.lectura_unidad || 'h'}</dd></div>}</dl></section>
        <section className="dx-recact-section"><header><h2>Condición inicial</h2></header><div className="dx-recact-section-body">{(() => { const parsed = parsearObservaciones(recepcion.observaciones); return <><div className="dx-recact-checks">{CHECKLIST_ITEMS.map(([key, label]) => <span key={key} className={`dx-recact-check ${parsed.checklist[key] ? 'is-yes' : 'is-no'}`}><b>{parsed.checklist[key] === undefined ? '—' : parsed.checklist[key] ? 'Sí' : 'No registrado'}</b>{label}</span>)}</div><div className="dx-recact-free"><b>Observaciones</b><p>{parsed.observaciones || 'Sin observaciones registradas.'}</p></div></>; })()}</div></section>
        <section className="dx-recact-section"><header><h2>Evidencia fotográfica</h2><span>{adjuntos.length} imagen{adjuntos.length === 1 ? '' : 'es'}</span></header><div className="dx-recact-section-body">{adjuntosLoading ? <div className="dx-ui-empty">Cargando fotografías…</div> : adjuntosError ? <div className="dx-ui-empty" role="alert">{adjuntosError}</div> : !adjuntos.length ? <div className="dx-ui-empty">No hay fotografías cargadas.</div> : <div className="dx-recact-photos">{adjuntos.map((item, index) => <a key={item.id || item.storage_path} href={item.vistaUrl} target="_blank" rel="noreferrer"><img src={item.vistaUrl} alt={`Evidencia fotográfica ${index + 1}`} /></a>)}</div>}</div></section>
      </div>
    </>}

    {view === 'new' && <>
      <div className="dx-recact-mobile-heading"><WorkMenuButton /><button type="button" className="dx-recact-mobile-back" aria-label="Volver a recepciones" onClick={toList}>←</button><strong>Nueva recepción</strong></div>
      <button type="button" className="dx-recact-back" onClick={toList}>← Volver a recepciones</button>
      <header className="dx-recact-header"><div><div className="dx-recact-eyebrow">Taller · Almacén</div><h1>Nueva recepción</h1><p>El número y el número de caso se asignan al guardar.</p></div></header>
      {error && <div className="dx-recact-alert is-error" role="alert">{error}</div>}
      <form className="dx-recact-form" onSubmit={guardar}>
        <section className="dx-recact-section"><header><h2>Cliente y activo</h2></header><div className="dx-recact-form-body"><div className="dx-recact-form-grid">
          <label className="dx-recact-field"><span className="dx-recact-field-label">Cliente propietario <i>*</i></span><select className="dx-recact-control" value={form.cliente_id} disabled={bloqueada || saving} onChange={event => { actualizarForm('cliente_id', event.target.value); actualizarForm('activo_id', ''); setAssetSearch(''); setAltaActivoForm(null); setAltaActivoAbierta(false); }}><option value="">Seleccionar cliente</option>{clientes.map(item => <option key={item.id} value={item.id}>{nombreCliente(item)}</option>)}</select></label>
          <label className="dx-recact-field"><span className="dx-recact-field-label">Almacén de custodia <i>*</i></span><select className="dx-recact-control" value={form.almacen_id} disabled={bloqueada || saving} onChange={event => actualizarForm('almacen_id', event.target.value)}><option value="">Seleccionar almacén</option>{almacenes.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} · ` : ''}{item.nombre}</option>)}</select></label>
          <div className="dx-recact-field is-full"><span className="dx-recact-field-label">Activo del cliente <i>*</i></span>{form.activo_id ? <div className="dx-recact-picked"><div><b>{activosPorId.get(form.activo_id)?.codigo} · {nombreActivo(activosPorId.get(form.activo_id))}</b><small>{nombreCliente(clientesPorId.get(form.cliente_id))}</small></div><button type="button" className="dx-recact-link" onClick={() => { actualizarForm('activo_id', ''); setAssetSearch(''); }}>Cambiar</button></div> : <><input className="dx-recact-control" aria-label="Buscar activo del cliente" placeholder="Código, nombre, marca, modelo o serie" value={assetSearch} disabled={bloqueada || saving} onChange={event => { setAssetSearch(event.target.value); actualizarForm('activo_id', ''); setAltaActivoForm(null); setAltaActivoAbierta(false); }} />{assetSearch && <div className="dx-recact-results">{activosVisibles.map(item => <button key={item.id} type="button" onClick={() => seleccionarActivo(item)}><b>{item.codigo}</b><span>{nombreActivo(item)}</span></button>)}{!activosVisibles.length && <p>{!form.cliente_id ? 'Selecciona un cliente para ver sus activos.' : 'No hay activos que coincidan.'}</p>}{form.cliente_id && puedeCrear && sesion.permiteEscritura && !altaActivoAbierta && <button type="button" className="dx-recact-new-asset-button" onClick={abrirAltaActivo}>＋ Registrar como activo nuevo</button>}</div>}</>}
            {altaActivoForm && !altaActivoAbierta && <div className="dx-recact-picked"><div><b>{altaActivoForm.nombre}</b><small>Activo nuevo · se creará con la recepción</small></div><button type="button" className="dx-recact-link" onClick={() => setAltaActivoAbierta(true)}>Editar</button></div>}
            {altaActivoAbierta && altaActivoForm && <div className="dx-recact-new-asset">
              <h3>Registrar activo nuevo</h3>
              <div className="dx-recact-form-grid">
                <label className="dx-recact-field is-full"><span className="dx-recact-field-label">Tipo de activo <i>*</i></span><div className="dx-recact-segmented">{[['componente', 'Componente'], ['maquinaria_completa', 'Maquinaria completa']].map(([value, label]) => <button key={value} type="button" aria-pressed={altaActivoForm.tipo_activo === value} onClick={() => actualizarAltaActivo('tipo_activo', value)}>{label}</button>)}</div></label>
                <label className="dx-recact-field"><span className="dx-recact-field-label">Nombre <i>*</i></span><input className="dx-recact-control" value={altaActivoForm.nombre} onChange={event => actualizarAltaActivo('nombre', event.target.value)} /></label>
                <label className="dx-recact-field"><span className="dx-recact-field-label">Código</span><input className="dx-recact-control" value="Se asignará al guardar" readOnly /></label>
                <label className="dx-recact-field"><span className="dx-recact-field-label">Código de origen</span><input className="dx-recact-control" value={altaActivoForm.codigo_origen} onChange={event => actualizarAltaActivo('codigo_origen', event.target.value)} /></label>
                {altaActivoForm.tipo_activo === 'componente' && <label className="dx-recact-field"><span className="dx-recact-field-label">Tipo de componente</span><select className="dx-recact-control" value={altaActivoForm.componente_catalogo_id} onChange={event => actualizarAltaActivo('componente_catalogo_id', event.target.value)}><option value="">Sin tipo de componente</option>{componentesCatalogo.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>}
                {['componente', 'maquinaria_completa'].includes(altaActivoForm.tipo_activo) && <label className="dx-recact-field"><span className="dx-recact-field-label">Marca {altaActivoForm.tipo_activo === 'maquinaria_completa' && <i>*</i>}</span><input className="dx-recact-control" value={altaActivoForm.marca} onChange={event => actualizarAltaActivo('marca', event.target.value)} /></label>}
                {['componente', 'maquinaria_completa'].includes(altaActivoForm.tipo_activo) && <label className="dx-recact-field"><span className="dx-recact-field-label">Modelo {altaActivoForm.tipo_activo === 'maquinaria_completa' && <i>*</i>}</span><input className="dx-recact-control" value={altaActivoForm.modelo} onChange={event => actualizarAltaActivo('modelo', event.target.value)} /></label>}
                {altaActivoForm.tipo_activo === 'maquinaria_completa' && <label className="dx-recact-field"><span className="dx-recact-field-label">Placa / serie / chasis</span><input className="dx-recact-control" value={altaActivoForm.placa_serie} onChange={event => actualizarAltaActivo('placa_serie', event.target.value)} /></label>}
                {altaActivoForm.tipo_activo === 'maquinaria_completa' && <label className="dx-recact-field"><span className="dx-recact-field-label">Año de fabricación</span><input className="dx-recact-control" type="number" min="1800" max={ANIO_MAXIMO_ACTIVO} value={altaActivoForm.año_fabricacion} onFocus={seleccionarAlEnfocar} onPointerUp={seleccionarAlPulsar} onInput={marcarEdicionNumerica} onBlur={limpiarSeleccionAlDesenfocar} onChange={event => actualizarAltaActivo('año_fabricacion', event.target.value)} /></label>}
                {altaActivoForm.tipo_activo === 'maquinaria_completa' && <label className="dx-recact-field"><span className="dx-recact-field-label">Año de overhaul</span><input className="dx-recact-control" type="number" min="1800" max={ANIO_MAXIMO_ACTIVO} value={altaActivoForm.año_overhaul} onFocus={seleccionarAlEnfocar} onPointerUp={seleccionarAlPulsar} onInput={marcarEdicionNumerica} onBlur={limpiarSeleccionAlDesenfocar} onChange={event => actualizarAltaActivo('año_overhaul', event.target.value)} /></label>}
              </div>
              <div className="dx-recact-inline-actions"><button type="button" className="btn" onClick={() => { setAltaActivoAbierta(false); setAltaActivoForm(null); }}>Cancelar alta</button><button type="button" className="btn btn-primary" onClick={guardarAltaActivo}>Usar en la recepción</button></div>
            </div>}
          </div>
          </div></div></section>
        <section className="dx-recact-section"><header><h2>Datos de ingreso</h2></header><div className="dx-recact-form-body"><div className="dx-recact-form-grid"><label className="dx-recact-field"><span className="dx-recact-field-label">Fecha de ingreso <i>*</i></span><input className="dx-recact-control" type="date" value={form.fecha_ingreso} disabled={bloqueada || saving} onChange={event => actualizarForm('fecha_ingreso', event.target.value)} /></label><label className="dx-recact-field"><span className="dx-recact-field-label">Hora de ingreso</span><input className="dx-recact-control" type="time" value={form.hora_ingreso} disabled={bloqueada || saving} onChange={event => actualizarForm('hora_ingreso', event.target.value)} /></label><label className="dx-recact-field"><span className="dx-recact-field-label">Guía de ingreso</span><input className="dx-recact-control" value={form.guia_ingreso} disabled={bloqueada || saving} onChange={event => actualizarForm('guia_ingreso', event.target.value)} placeholder="N.° de guía o documento" /></label><div className="dx-recact-field"><span className="dx-recact-field-label">Horómetro o kilometraje <small>(opcional)</small></span><div className="dx-recact-input-pair"><input className="dx-recact-control" type="number" min="0" step="0.01" value={form.lectura_valor} disabled={bloqueada || saving} onFocus={seleccionarAlEnfocar} onPointerUp={seleccionarAlPulsar} onInput={marcarEdicionNumerica} onBlur={limpiarSeleccionAlDesenfocar} onChange={event => actualizarForm('lectura_valor', event.target.value)} placeholder="Sin dato" /><div className="dx-recact-segmented">{[['horas', 'Horas'], ['km', 'Km']].map(([value, label]) => <button key={value} type="button" aria-pressed={form.lectura_unidad === value} onClick={() => actualizarForm('lectura_unidad', value)}>{label}</button>)}</div></div></div><div className="dx-recact-field is-full"><span className="dx-recact-field-label">Tipo de activo <small>(opcional)</small></span><div className="dx-recact-segmented">{[['', 'Sin especificar'], ['componente', 'Componente'], ['maquinaria_completa', 'Maquinaria completa']].map(([value, label]) => <button key={value || 'none'} type="button" aria-pressed={form.tipo_activo === value} onClick={() => actualizarForm('tipo_activo', value)}>{label}</button>)}</div></div>{form.tipo_activo === 'componente' && <label className="dx-recact-field"><span className="dx-recact-field-label">Tipo de componente</span><select className="dx-recact-control" value={form.componente_catalogo_id} onChange={event => actualizarForm('componente_catalogo_id', event.target.value)}><option value="">Sin tipo de componente</option>{componentesCatalogo.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>}<label className="dx-recact-field is-full"><span className="dx-recact-field-label">Sociedad</span><input className="dx-recact-control" value={sesion.sociedadActiva?.nombre || sesion.sociedadActiva?.codigo || sociedadId || 'Sin sociedad'} readOnly /></label></div></div></section>
        <section className="dx-recact-section"><header><h2>Condición inicial</h2><span>El checklist se guarda dentro de las observaciones.</span></header><div className="dx-recact-section-body"><div className="dx-recact-check-buttons">{CHECKLIST_ITEMS.map(([key, label]) => <button key={key} type="button" aria-pressed={Boolean(form.checklist[key])} onClick={() => setForm(current => ({ ...current, checklist: { ...current.checklist, [key]: !current.checklist[key] } }))}><b>{form.checklist[key] ? '✓ Sí' : '— No registrado'}</b>{label}</button>)}</div><label className="dx-recact-field dx-recact-observations"><span className="dx-recact-field-label">Observaciones</span><textarea className="dx-recact-control" rows="4" value={form.observaciones} disabled={bloqueada || saving} onChange={event => actualizarForm('observaciones', event.target.value)} placeholder="Rayaduras, golpes, faltantes, estado de sellos…" /></label></div></section>
        <section className="dx-recact-section"><header><h2>Evidencia fotográfica</h2><span>{fotos.length} de 8 · se cargan al crear la recepción</span></header><div className="dx-recact-section-body"><label className="dx-recact-drop"><b>Tomar foto o subir imágenes</b><span>En tablet se abre la cámara trasera. Hasta 8 imágenes.</span><input type="file" accept="image/*" capture="environment" multiple disabled={bloqueada || saving || fotos.length >= 8} onChange={seleccionarFotos} /></label><div className="dx-recact-photos">{fotos.map((photo, index) => <div key={`${photo.name}-${photo.lastModified}`}><img src={previewUrl(photo)} alt={`Vista previa ${index + 1}`} /><button type="button" aria-label={`Quitar foto ${index + 1}`} onClick={() => setFotos(current => current.filter(item => item !== photo))}>×</button></div>)}</div></div></section>
        <div className="dx-recact-action-bar"><span className={missing.length ? '' : 'is-ready'}>{missing.length ? <>Falta: <b>{missing.join(', ')}</b></> : <b>Todo listo para registrar.</b>}</span><button type="button" className="btn" onClick={toList}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving || bloqueada || !puedeCrear || Boolean(missing.length)}>{saving ? 'Guardando…' : 'Registrar recepción'}</button></div>
      </form>
    </>}
    {toast && <div className="dx-recact-toast" role="status">{toast}</div>}
  </section>;
}

export { parsearObservaciones };
