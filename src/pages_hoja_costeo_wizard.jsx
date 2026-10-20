import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I, moneyD } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { actualizarHojaCosteoSvc } from './services/crmService.js';
import { listarCotizacionesGeneradasPorHojaCosteo } from './components/CotizacionesGeneradasHojaCosteo.jsx';
import { SelectorTipoCotizacion } from './components/SelectorTipoCotizacion.jsx';
import { MaterialAutocomplete } from './pages_core.jsx';
import './hoja_costeo_wizard.css';
import { agruparMaterialesPorTrabajo, calcularCostosPorTarea, calcularPrecio, rutaMaterial } from './hojaCosteoCalculos.js';

const STEPS = [
  { id: 'mano_obra', label: 'Trabajos' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'terceros', label: 'Terceros y logística' },
  { id: 'resumen', label: 'Resumen y precio' },
];

const UNIDADES_MEDIDA_COMUNES = [
  ['und', 'Unidad (und)'],
  ['pza', 'Pieza (pza)'],
  ['kg', 'Kilogramo (kg)'],
  ['g', 'Gramo (g)'],
  ['t', 'Tonelada (t)'],
  ['m', 'Metro (m)'],
  ['cm', 'Centímetro (cm)'],
  ['mm', 'Milímetro (mm)'],
  ['m2', 'Metro cuadrado (m²)'],
  ['m3', 'Metro cúbico (m³)'],
  ['l', 'Litro (l)'],
  ['ml', 'Mililitro (ml)'],
  ['gal', 'Galón (gal)'],
  ['km', 'Kilómetro (km)'],
  ['hora', 'Hora'],
  ['dia', 'Día'],
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['turno', 'Turno'],
  ['viaje', 'Viaje'],
  ['servicio', 'Servicio'],
  ['par', 'Par'],
  ['juego', 'Juego'],
  ['docena', 'Docena'],
  ['caja', 'Caja'],
  ['paquete', 'Paquete'],
  ['rollo', 'Rollo'],
  ['saco', 'Saco'],
  ['bulto', 'Bulto'],
  ['lote', 'Lote'],
  ['pallet', 'Pallet'],
];

function SelectorUnidadMedida({ value, onChange, disabled }) {
  const valorActual = String(value || '');
  const existeEnCatalogo = UNIDADES_MEDIDA_COMUNES.some(([codigo]) => codigo === valorActual);
  const opciones = existeEnCatalogo || !valorActual
    ? UNIDADES_MEDIDA_COMUNES
    : [[valorActual, `Valor actual: ${valorActual}`], ...UNIDADES_MEDIDA_COMUNES];

  return (
    <select className="input" disabled={disabled} value={valorActual} onChange={onChange}>
      <option value="">Selecciona una unidad</option>
      {opciones.map(([codigo, etiqueta]) => <option key={codigo} value={codigo}>{etiqueta}</option>)}
    </select>
  );
}

const numero = value => Number(value || 0);

export default function HojaCosteoWizard() {
  const { activeParams, hojasCosteo, setHojasCosteo, empresa, navigate, addToast, aprobarHojaCosteo, crearCotizacionDesdeHojaCosteo, cuentas } = useApp();
  const hojaId = activeParams?.hojaId || activeParams?.id;
  const hoja = (hojasCosteo || []).find(item => item.id === hojaId);
  const monedaHoja = hoja?.moneda === 'USD' ? 'USD' : 'PEN';
  const simboloMoneda = monedaHoja === 'USD' ? 'US$' : 'S/';
  const bloqueada = hoja?.estado === 'aprobada';
  const [paso, setPaso] = useState('mano_obra');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [familias, setFamilias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [configuracionesCostoHora, setConfiguracionesCostoHora] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [materialGrupos, setMaterialGrupos] = useState([]);
  const [materialFamilias, setMaterialFamilias] = useState([]);
  const [materialSubfamilias, setMaterialSubfamilias] = useState([]);
  const [lineasMateriales, setLineasMateriales] = useState([]);
  const [activos, setActivos] = useState([]);
  const [lineasActivos, setLineasActivos] = useState([]);
  const [serviciosTerceros, setServiciosTerceros] = useState([]);
  const [logistica, setLogistica] = useState([]);
  const [referenciasMateriales, setReferenciasMateriales] = useState([]);
  const [tipoCambioPenUsd, setTipoCambioPenUsd] = useState(null);
  const [tasaUsdPorPen, setTasaUsdPorPen] = useState(null);
  const [eliminandoMaterialId, setEliminandoMaterialId] = useState(null);
  const [guardandoBloqueJson, setGuardandoBloqueJson] = useState('');
  const [creandoTrabajo, setCreandoTrabajo] = useState(false);
  const [formMaterial, setFormMaterial] = useState({ busqueda: '', grupo_id: '', familia_id: '', subfamilia_id: '', material_id: '', cantidad: '', costo_unitario_manual: '' });
  const [formServicioTercero, setFormServicioTercero] = useState({ descripcion: '', cantidad: '', unidad: '', costo_unitario: '' });
  const [formLogistica, setFormLogistica] = useState({ descripcion: '', cantidad: '', unidad: '', costo_unitario: '' });
  const [porcentajeGastoCalculado, setPorcentajeGastoCalculado] = useState(null);
  const [porcentajeGastoManual, setPorcentajeGastoManual] = useState('');
  const [margenObjetivo, setMargenObjetivo] = useState('35');
  const [guardandoResumen, setGuardandoResumen] = useState(false);
  const [aprobacionPendiente, setAprobacionPendiente] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [selectorTipoCotizacion, setSelectorTipoCotizacion] = useState(false);
  const [generandoCotizacion, setGenerandoCotizacion] = useState(false);
  const [cotizacionesVinculadas, setCotizacionesVinculadas] = useState([]);
  const [cotizacionesVerificadas, setCotizacionesVerificadas] = useState(false);
  const [puedeCrearMaterial, setPuedeCrearMaterial] = useState(false);
  const [panelTrabajo, setPanelTrabajo] = useState(false);
  const [panelMaterial, setPanelMaterial] = useState(false);
  const [familiaSeleccionada, setFamiliaSeleccionada] = useState('');
  const [actividadSeleccionada, setActividadSeleccionada] = useState('');
  const [tareaSeleccionada, setTareaSeleccionada] = useState('');
  const [busquedasCascada, setBusquedasCascada] = useState(['', '', '']);
  const [seleccionReceta, setSeleccionReceta] = useState({});
  const [crearNivel, setCrearNivel] = useState(0);
  const [crearNombre, setCrearNombre] = useState('');
  const [busquedaRapida, setBusquedaRapida] = useState('');
  const [detallesTarea, setDetallesTarea] = useState({});
  const [materialTareaId, setMaterialTareaId] = useState('');
  const [terceroRef, setTerceroRef] = useState({ familia_trabajo_id: '', tarea_id: '' });
  const [logisticaTrabajo, setLogisticaTrabajo] = useState('');
  const [materialTrabajoId, setMaterialTrabajoId] = useState('');
  const [materialActividadId, setMaterialActividadId] = useState('');
  const [guardandoTareaId, setGuardandoTareaId] = useState(null);

  const tarifaPorCargo = useMemo(() => new Map(
    tarifas
      .filter(item => item?.cargo_id && item?.costo_hora_planilla != null && numero(item.costo_hora_planilla) > 0)
      .map(item => [item.cargo_id, numero(item.costo_hora_planilla)])
  ), [tarifas]);
  const configuracionPorCargo = useMemo(() => new Map(
    configuracionesCostoHora
      .filter(item => item?.cargo_id)
      .map(item => [item.cargo_id, item])
  ), [configuracionesCostoHora]);
  const familiaPorId = useMemo(() => new Map(familias.map(item => [item.id, item])), [familias]);
  const actividadPorId = useMemo(() => new Map(actividades.map(item => [item.id, item])), [actividades]);
  const cargoPorId = useMemo(() => new Map(cargos.map(item => [item.id, item])), [cargos]);
  const materialPorId = useMemo(() => new Map(materiales.map(item => [item.material_id, item])), [materiales]);
  const activoPorId = useMemo(() => new Map(activos.map(item => [item.activo_id, item])), [activos]);
  const referenciaMaterialPorId = useMemo(() => new Map(referenciasMateriales.map(item => [item.material_id, item])), [referenciasMateriales]);
  const subtotalManoObra = useMemo(() => lineas.reduce((total, linea) => total + numero(linea.subtotal), 0), [lineas]);
  const subtotalMateriales = useMemo(() => lineasMateriales.reduce((total, linea) => total + numero(linea.subtotal), 0), [lineasMateriales]);
  const subtotalActivos = useMemo(() => lineasActivos.reduce((total, linea) => total + numero(linea.depreciacion_asignada), 0), [lineasActivos]);
  const subtotalServiciosTerceros = useMemo(() => serviciosTerceros.reduce((total, linea) => total + numero(linea.cantidad) * numero(linea.costo_unitario), 0), [serviciosTerceros]);
  const subtotalLogistica = useMemo(() => logistica.reduce((total, linea) => total + numero(linea.cantidad) * numero(linea.costo_unitario), 0), [logistica]);
  const costoTotal = subtotalManoObra + subtotalMateriales + subtotalServiciosTerceros + subtotalLogistica + subtotalActivos;
  const porcentajeGastoEfectivo = porcentajeGastoManual === '' ? numero(porcentajeGastoCalculado) : numero(porcentajeGastoManual) / 100;
  const porcentajeMargenEfectivo = numero(margenObjetivo) / 100;
  const divisorPrecio = 1 - (porcentajeGastoEfectivo + porcentajeMargenEfectivo);
  const precioSugeridoSinIgv = divisorPrecio > 0 ? costoTotal / divisorPrecio : null;
  const precioSugeridoTotal = precioSugeridoSinIgv == null ? null : precioSugeridoSinIgv * 1.18;
  const familiasMaterialSeleccionadas = useMemo(() => materialFamilias.filter(item => item.grupo_id === formMaterial.grupo_id), [materialFamilias, formMaterial.grupo_id]);
  const subfamiliasMaterialSeleccionadas = useMemo(() => materialSubfamilias.filter(item => item.familia_id === formMaterial.familia_id), [materialSubfamilias, formMaterial.familia_id]);
  const materialesParaAutocomplete = useMemo(() => materiales.map(item => ({
    id: item.material_id,
    empresa_id: item.empresa_id,
    codigo: item.codigo,
    descripcion: item.descripcion,
    unidad: item.unidad,
    grupo_id: item.grupo_id,
    familia_id: item.familia_id,
    subfamilia_id: item.subfamilia_id,
    precio_unitario: 0,
    costo_usd_calculado: item.costo_usd_calculado,
  })), [materiales]);
  const materialesPorJerarquia = useMemo(() => materiales.filter(item => (
    (!formMaterial.grupo_id || item.grupo_id === formMaterial.grupo_id)
    && (!formMaterial.familia_id || item.familia_id === formMaterial.familia_id)
    && (!formMaterial.subfamilia_id || item.subfamilia_id === formMaterial.subfamilia_id)
  )).slice(0, 200), [materiales, formMaterial.grupo_id, formMaterial.familia_id, formMaterial.subfamilia_id]);
  const materialSeleccionado = materialPorId.get(formMaterial.material_id) || null;
  const referenciaMaterialSeleccionado = referenciaMaterialPorId.get(formMaterial.material_id) || null;
  const convertirUsdAMonedaHoja = value => {
    if (value == null) return null;
    const montoUsd = numero(value);
    if (monedaHoja === 'USD') return montoUsd;
    return numero(tipoCambioPenUsd) > 0 ? montoUsd / numero(tipoCambioPenUsd) : null;
  };
  // La tarifa de planilla (tarifa_hora del personal) y el costo manual por cargo están en soles; el costo de activos, en US$.
  const convertirPenAMonedaHoja = value => {
    if (value == null) return null;
    const montoPen = numero(value);
    if (monedaHoja === 'PEN') return montoPen;
    return numero(tasaUsdPorPen) > 0 ? montoPen * numero(tasaUsdPorPen) : null;
  };
  const costoHoraCargo = cargoId => {
    const manual = configuracionPorCargo.get(cargoId)?.costo_hora_manual;
    if (manual != null && numero(manual) > 0) return convertirPenAMonedaHoja(manual);
    const planilla = tarifaPorCargo.get(cargoId);
    return planilla != null ? convertirPenAMonedaHoja(planilla) : null;
  };
  const money = value => moneyD(numero(value), simboloMoneda);
  const costoMaterialCalculadoEnMoneda = convertirUsdAMonedaHoja(materialSeleccionado?.costo_usd_calculado);

  const cargarDatos = async () => {
    if (!hoja?.id || !empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const sb = await getSupabaseClient();
      const [familiasResult, actividadesResult, tareasResult, recetasResult, cargosResult, tarifasResult, configuracionesResult, lineasResult, materialesResult, gruposResult, familiasMaterialesResult, subfamiliasResult, lineasMaterialesResult, referenciasResult, activosResult, lineasActivosResult, hojaJsonResult, gastoResult, tipoCambioResult, hallazgosResult] = await Promise.all([
        sb.from('familia_trabajo').select('id, nombre, activo').eq('empresa_id', empresa.id).eq('activo', true).order('nombre'),
        sb.from('tipos_servicio_interno').select('id, codigo, nombre, estado, rol, familia_trabajo_id').eq('empresa_id', empresa.id).eq('estado', 'activo').eq('rol', 'actividad').order('nombre'),
        sb.from('tipos_servicio_interno').select('id, codigo, nombre, estado, rol').eq('empresa_id', empresa.id).eq('estado', 'activo').eq('rol', 'tarea').order('nombre'),
        sb.from('plantillas_actividad').select('id, actividad_id, tarea_id, cargo_id, activo_id, horas, horas_maquina, orden').eq('empresa_id', empresa.id).order('orden'),
        sb.from('cargos_empresa').select('id, codigo, nombre, estado').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
        sb.from('vw_costo_hora_planilla_por_cargo').select('empresa_id, cargo_id, costo_hora_planilla').eq('empresa_id', empresa.id),
        sb.from('costo_hora_cargo_config').select('cargo_id, costo_hora_manual').eq('empresa_id', empresa.id),
        sb.from('hoja_costeo_lineas_mano_obra').select('*').eq('hoja_costeo_id', hoja.id).order('orden').order('creado_en'),
        sb.from('vw_materiales_costeo').select('material_id, empresa_id, codigo, descripcion, unidad, grupo_id, familia_id, subfamilia_id, costo_usd_calculado').eq('empresa_id', empresa.id).order('descripcion'),
        sb.from('material_grupos').select('id, codigo, nombre').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
        sb.from('material_familias').select('id, grupo_id, codigo, nombre').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
        sb.from('material_subfamilias').select('id, familia_id, codigo, nombre').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
        sb.from('hoja_costeo_lineas_materiales').select('*').eq('hoja_costeo_id', hoja.id).order('orden').order('creado_en'),
        sb.from('vw_material_precio_referencial').select('material_id, empresa_id, precio_original_usd, promedio_alternativos_usd').eq('empresa_id', empresa.id),
        sb.from('vw_depreciacion_mensual_activo').select('activo_id, empresa_id, nombre, estado, depreciacion_mensual_usd_calculada, depreciacion_manual, horas_disponibles_mes, costo_hora_activo_usd').eq('empresa_id', empresa.id).order('nombre'),
        sb.from('hoja_costeo_lineas_activos').select('*').eq('hoja_costeo_id', hoja.id).order('orden').order('creado_en'),
        sb.from('hojas_costeo').select('servicios_terceros, logistica, margen_objetivo_pct, gasto_administrativo_manual_pct').eq('id', hoja.id).single(),
        sb.from('vw_gasto_administrativo_pct_grupo').select('porcentaje_calculado').eq('empresa_id', empresa.id).maybeSingle(),
        sb.rpc('obtener_tipo_cambio_vigente', { p_moneda_base: 'PEN' }),
        hoja.diagnostico_id
          ? sb.from('diagnostico_tecnico_lineas').select('id, tarea_id, hallazgo').eq('diagnostico_id', hoja.diagnostico_id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const error = [familiasResult, actividadesResult, tareasResult, recetasResult, cargosResult, tarifasResult, configuracionesResult, lineasResult, materialesResult, gruposResult, familiasMaterialesResult, subfamiliasResult, lineasMaterialesResult, referenciasResult, activosResult, lineasActivosResult, hojaJsonResult, gastoResult, tipoCambioResult, hallazgosResult].find(result => result.error)?.error;
      if (error) throw error;
      setFamilias(familiasResult.data || []);
      setActividades(actividadesResult.data || []);
      setTareas(tareasResult.data || []);
      setRecetas(recetasResult.data || []);
      setCargos(cargosResult.data || []);
      setTarifas(tarifasResult.data || []);
      setConfiguracionesCostoHora(configuracionesResult.data || []);
      setLineas(lineasResult.data || []);
      setMateriales(materialesResult.data || []);
      setMaterialGrupos(gruposResult.data || []);
      setMaterialFamilias(familiasMaterialesResult.data || []);
      setMaterialSubfamilias(subfamiliasResult.data || []);
      setLineasMateriales(lineasMaterialesResult.data || []);
      setReferenciasMateriales(referenciasResult.data || []);
      setActivos(activosResult.data || []);
      setLineasActivos(lineasActivosResult.data || []);
      setServiciosTerceros(Array.isArray(hojaJsonResult.data?.servicios_terceros) ? hojaJsonResult.data.servicios_terceros : []);
      setLogistica(Array.isArray(hojaJsonResult.data?.logistica) ? hojaJsonResult.data.logistica : []);
      setPorcentajeGastoCalculado(gastoResult.data?.porcentaje_calculado ?? null);
      setPorcentajeGastoManual(hojaJsonResult.data?.gasto_administrativo_manual_pct != null
        ? String(numero(hojaJsonResult.data.gasto_administrativo_manual_pct) * 100)
        : gastoResult.data?.porcentaje_calculado != null ? String(numero(gastoResult.data.porcentaje_calculado) * 100) : '');
      setMargenObjetivo(String(hojaJsonResult.data?.margen_objetivo_pct ?? hoja.margen_objetivo_pct ?? 35));
      setTipoCambioPenUsd(monedaHoja === 'PEN' ? numero(tipoCambioResult.data) || null : 1);
      setTasaUsdPorPen(numero(tipoCambioResult.data) || null);
      const hallazgosPorTarea = new Map((hallazgosResult.data || []).map(item => [item.id, item.hallazgo || '']));
      setDetallesTarea(Object.fromEntries((lineasResult.data || []).map(item => [item.id, hallazgosPorTarea.get(item.diagnostico_linea_id) || ''])));
    } catch (error) {
      console.error('[HojaCosteoWizard] carga', error);
      addToast(`No se pudo cargar el wizard: ${error.message || error}`, 'error');
    } finally {
      setCargando(false);
    }
  };

  const valoracionHecha = useRef('');
  const valorarPendientes = async () => {
    const pendientesMo = lineas.filter(linea => linea.pendiente_valoracion);
    const pendientesActivos = lineasActivos.filter(linea => linea.pendiente_valoracion);
    if (!pendientesMo.length && !pendientesActivos.length) return;
    const sb = await getSupabaseClient();
    const lineasNuevas = [...lineas];
    const activosNuevos = [...lineasActivos];
    let cambios = 0;
    for (const linea of pendientesMo) {
      const costoHora = numero(costoHoraCargo(linea.cargo_id));
      if (!linea.cargo_id || costoHora <= 0) continue;
      const payload = { costo_hora_snapshot: costoHora, subtotal: numero(linea.horas) * costoHora, metodo_usado: tarifaPorCargo.has(linea.cargo_id) && configuracionPorCargo.get(linea.cargo_id)?.costo_hora_manual == null ? 'planilla' : 'manual', pendiente_valoracion: false };
      const { data, error } = await sb.from('hoja_costeo_lineas_mano_obra').update(payload).eq('id', linea.id).select().single();
      if (error) throw error;
      lineasNuevas[lineasNuevas.findIndex(item => item.id === linea.id)] = { ...linea, ...data };
      cambios += 1;
    }
    for (const linea of pendientesActivos) {
      const costoHora = numero(convertirUsdAMonedaHoja(activoPorId.get(linea.activo_id)?.costo_hora_activo_usd));
      if (costoHora <= 0) continue;
      const lineaMo = lineasNuevas.find(item => item.id === linea.linea_mano_obra_id)
        || lineasNuevas.find(item => item.diagnostico_linea_id && item.diagnostico_linea_id === linea.diagnostico_linea_id);
      const payload = { costo_hora_equipo: costoHora, depreciacion_asignada: numero(linea.horas_uso_estimadas) * costoHora, linea_mano_obra_id: linea.linea_mano_obra_id || lineaMo?.id || null, pendiente_valoracion: false };
      const { data, error } = await sb.from('hoja_costeo_lineas_activos').update(payload).eq('id', linea.id).select().single();
      if (error) throw error;
      activosNuevos[activosNuevos.findIndex(item => item.id === linea.id)] = { ...linea, ...data };
      cambios += 1;
    }
    if (!cambios) return;
    setLineas(lineasNuevas);
    setLineasActivos(activosNuevos);
    await sincronizarTotales({
      manoObra: lineasNuevas.reduce((total, linea) => total + numero(linea.subtotal), 0),
      activos: activosNuevos.reduce((total, linea) => total + numero(linea.depreciacion_asignada), 0),
    });
  };
  useEffect(() => {
    if (cargando || bloqueada || !hoja?.id || valoracionHecha.current === hoja.id) return;
    if (monedaHoja === 'PEN' && !(numero(tipoCambioPenUsd) > 0)) return;
    if (!lineas.some(linea => linea.pendiente_valoracion) && !lineasActivos.some(linea => linea.pendiente_valoracion)) return;
    valoracionHecha.current = hoja.id;
    valorarPendientes().catch(error => addToast(`No se pudieron valorar las líneas del diagnóstico: ${error.message || error}`, 'error'));
  }, [cargando, bloqueada, hoja?.id, lineas, lineasActivos, tipoCambioPenUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDatos(); }, [hoja?.id, hoja?.moneda, empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vigente = true;
    if (!empresa?.id || !isSupabaseConfigured()) return undefined;
    getSupabaseClient()
      .then(sb => sb.rpc('usuario_puede', {
        target_empresa_id: empresa.id,
        target_pantalla: 'inventario',
        target_accion: 'crear',
      }))
      .then(({ data, error }) => {
        if (vigente && !error) setPuedeCrearMaterial(data === true);
      })
      .catch(() => { if (vigente) setPuedeCrearMaterial(false); });
    return () => { vigente = false; };
  }, [empresa?.id]);

  const totalesCabecera = (sobrescribe = {}) => {
    const totales = {
      manoObra: sobrescribe.manoObra ?? subtotalManoObra,
      materiales: sobrescribe.materiales ?? subtotalMateriales,
      servicios: sobrescribe.servicios ?? subtotalServiciosTerceros,
      logistica: sobrescribe.logistica ?? subtotalLogistica,
      activos: sobrescribe.activos ?? subtotalActivos,
    };
    return {
      total_mano_obra: totales.manoObra,
      total_materiales: totales.materiales,
      total_servicios_terceros: totales.servicios,
      total_logistica: totales.logistica,
      total_activos: totales.activos,
      costo_total: totales.manoObra + totales.materiales + totales.servicios + totales.logistica + totales.activos,
    };
  };

  const sincronizarTotales = async (sobrescribe = {}, adicionales = {}) => {
    const datos = { ...totalesCabecera(sobrescribe), ...adicionales };
    const sb = await getSupabaseClient();
    const { error } = await actualizarHojaCosteoSvc(sb, hoja.id, datos);
    if (error) throw error;
    setHojasCosteo(prev => prev.map(item => item.id === hoja.id ? { ...item, ...datos } : item));
    return datos;
  };

  /* Legacy standalone line form removed from the wizard.
  const crearTrabajo = async () => {
    const nombre = trabajoNuevo.trim();
    if (!nombre) return;
    setCreandoTrabajo(true);
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from('familia_trabajo')
        .insert({ empresa_id: empresa.id, nombre })
        .select('id, nombre, activo')
        .single();
      if (error) throw error;
      setFamilias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setForm(prev => ({ ...prev, familia_trabajo_id: data.id }));
      setTrabajoNuevo('');
      addToast('Trabajo creado y seleccionado.', 'success');
    } catch (error) {
      addToast(`No se pudo crear el trabajo: ${error.message || error}`, 'error');
    } finally {
      setCreandoTrabajo(false);
    }
  };

  const agregarLinea = async event => {
    event.preventDefault();
    if (bloqueada || guardando) return;
    const horas = numero(form.horas);
    const costoHora = numero(form.costo_hora_manual);
    const metodo = 'manual';
    if (!form.familia_trabajo_id || !form.actividad_id || !form.cargo_id || horas <= 0) {
      addToast('Completa Trabajo, Actividad, Cargo y Horas antes de agregar la línea.', 'error');
      return;
    }
    if (costoHora <= 0) {
      addToast('Ingresa un costo/hora manual mayor a cero.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      const payload = {
        hoja_costeo_id: hoja.id,
        familia_trabajo_id: form.familia_trabajo_id,
        actividad_id: form.actividad_id,
        cargo_id: form.cargo_id,
        horas,
        metodo_usado: metodo,
        costo_hora_snapshot: costoHora,
        subtotal: horas * costoHora,
        orden: lineas.length,
      };
      const { data, error } = await sb.from('hoja_costeo_lineas_mano_obra').insert(payload).select().single();
      if (error) throw error;
      await sincronizarTotales({ manoObra: subtotalManoObra + numero(data.subtotal) });
      setLineas(prev => [...prev, data]);
      setForm({ familia_trabajo_id: '', actividad_id: '', cargo_id: '', horas: '', costo_hora_manual: '' });
      addToast(`Línea agregada con costo por ${metodo}.`, 'success');
    } catch (error) {
      addToast(`No se pudo agregar la línea: ${error.message || error}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  */
  const eliminarLinea = async linea => {
    if (bloqueada || eliminandoId) return;
    setEliminandoId(linea.id);
    try {
      const sb = await getSupabaseClient();
      const { error } = await sb.from('hoja_costeo_lineas_mano_obra').delete().eq('id', linea.id);
      if (error) throw error;
      await sincronizarTotales({ manoObra: lineas.filter(item => item.id !== linea.id).reduce((total, item) => total + numero(item.subtotal), 0) });
      setLineas(prev => prev.filter(item => item.id !== linea.id));
      addToast('Línea eliminada.', 'success');
    } catch (error) {
      // La UI conserva el detalle que devuelve RLS en vez de ocultar una eliminación no persistida.
      addToast(`No se pudo eliminar la línea: ${error.message || error}`, 'error');
    } finally {
      setEliminandoId(null);
    }
  };

  const actualizarTarea = async (linea, cambios) => {
    if (bloqueada || guardandoTareaId) return;
    const siguiente = { ...linea, ...cambios };
    const horas = numero(siguiente.horas);
    const costoCargo = cambios.cargo_id ? costoHoraCargo(siguiente.cargo_id) : null;
    const costoHora = costoCargo != null ? numero(costoCargo) : numero(siguiente.costo_hora_snapshot);
    if (!siguiente.cargo_id || horas <= 0 || costoHora <= 0) {
      addToast('Cargo y horas deben tener valores mayores a cero.', 'error');
      return;
    }
    const activoAnterior = lineasActivos.find(item => item.linea_mano_obra_id === linea.id)
      || lineasActivos.find(item => !item.linea_mano_obra_id && item.tarea_id === linea.tarea_id);
    const activoId = cambios.activo_id !== undefined ? cambios.activo_id : activoAnterior?.activo_id || '';
    const horasMaquina = cambios.horas_maquina !== undefined
      ? numero(cambios.horas_maquina)
      : numero(activoAnterior?.horas_uso_estimadas);
    const activo = activoId ? activoPorId.get(activoId) : null;
    const costoActivo = activoId
      ? numero(activoAnterior?.activo_id === activoId ? activoAnterior.costo_hora_equipo : 0) || convertirUsdAMonedaHoja(activo?.costo_hora_activo_usd)
      : null;
    if (activoId && horasMaquina > 0 && numero(costoActivo) <= 0) {
      addToast('El activo seleccionado no tiene costo/hora disponible.', 'error');
      return;
    }
    setGuardandoTareaId(linea.id);
    try {
      const sb = await getSupabaseClient();
      const lineaActualizada = {
        ...linea,
        ...cambios,
        horas,
        costo_hora_snapshot: costoHora,
        subtotal: horas * costoHora,
        pendiente_valoracion: false,
      };
      const { data, error } = await sb.from('hoja_costeo_lineas_mano_obra').update({
        cargo_id: lineaActualizada.cargo_id,
        horas,
        costo_hora_snapshot: costoHora,
        subtotal: lineaActualizada.subtotal,
        pendiente_valoracion: false,
      }).eq('id', linea.id).select().single();
      if (error) throw error;

      let activosSiguientes = lineasActivos.filter(item => item.id !== activoAnterior?.id);
      let activoActualizado = null;
      if (activoId && horasMaquina > 0) {
        const activoPayload = {
          activo_id: activoId,
          tarea_id: linea.tarea_id || null,
          linea_mano_obra_id: linea.id,
          horas_uso_estimadas: horasMaquina,
          costo_hora_equipo: costoActivo,
          depreciacion_asignada: horasMaquina * numero(costoActivo),
          pendiente_valoracion: false,
        };
        if (activoAnterior?.id) {
          const result = await sb.from('hoja_costeo_lineas_activos').update(activoPayload).eq('id', activoAnterior.id).select().single();
          if (result.error) throw result.error;
          activoActualizado = result.data;
        } else {
          const result = await sb.from('hoja_costeo_lineas_activos').insert({ hoja_costeo_id: hoja.id, orden: lineasActivos.length, fue_manual: false, ...activoPayload }).select().single();
          if (result.error) throw result.error;
          activoActualizado = result.data;
        }
        activosSiguientes = [...activosSiguientes, activoActualizado];
      } else if (activoAnterior?.id) {
        const result = await sb.from('hoja_costeo_lineas_activos').delete().eq('id', activoAnterior.id);
        if (result.error) throw result.error;
      }
      // linea puede venir de calcularCostosPorTarea, donde subtotal incluye máquina y materiales: se suma desde el estado.
      const manoObraNueva = lineas.reduce((total, item) => total + (item.id === linea.id ? numero(lineaActualizada.subtotal) : numero(item.subtotal)), 0);
      const activosNuevo = activosSiguientes.reduce((sum, item) => sum + numero(item.depreciacion_asignada), 0);
      await sincronizarTotales({ manoObra: manoObraNueva, activos: activosNuevo });
      setLineas(prev => prev.map(item => item.id === linea.id ? { ...item, ...data, ...lineaActualizada } : item));
      setLineasActivos(activosSiguientes);
    } catch (error) {
      addToast(`No se pudo guardar la tarea: ${error.message || error}`, 'error');
    } finally {
      setGuardandoTareaId(null);
    }
  };

  const actualizarCantidadMaterial = async (linea, cantidad) => {
    if (bloqueada) return;
    const cantidadNumerica = numero(cantidad);
    if (cantidadNumerica <= 0) return;
    const subtotal = cantidadNumerica * numero(linea.costo_unitario_snapshot);
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.from('hoja_costeo_lineas_materiales').update({ cantidad: cantidadNumerica, subtotal }).eq('id', linea.id).select().single();
      if (error) throw error;
      await sincronizarTotales({ materiales: subtotalMateriales - numero(linea.subtotal) + subtotal });
      setLineasMateriales(prev => prev.map(item => item.id === linea.id ? { ...item, ...data, cantidad: cantidadNumerica, subtotal } : item));
    } catch (error) {
      addToast(`No se pudo actualizar el material: ${error.message || error}`, 'error');
    }
  };

  const seleccionarMaterial = (materialId, materialOverride = null) => {
    const material = materialOverride || materialPorId.get(materialId);
    setFormMaterial(prev => ({
      ...prev,
      material_id: materialId,
      busqueda: material?.descripcion || prev.busqueda,
      costo_unitario_manual: material?.costo_usd_calculado != null ? String(convertirUsdAMonedaHoja(material.costo_usd_calculado) ?? '') : '',
    }));
  };

  const seleccionarMaterialDesdeAutocomplete = async seleccion => {
    const materialId = seleccion?.mat_id || '';
    if (!materialId) {
      setFormMaterial(prev => ({ ...prev, material_id: '', costo_unitario_manual: '' }));
      return;
    }
    const materialVista = materiales.find(item => item.material_id === materialId);
    if (materialVista) {
      seleccionarMaterial(materialId, materialVista);
      return;
    }
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.from('vw_materiales_costeo')
        .select('material_id, empresa_id, codigo, descripcion, unidad, grupo_id, familia_id, subfamilia_id, costo_usd_calculado')
        .eq('empresa_id', empresa.id).eq('material_id', materialId).maybeSingle();
      if (error) throw error;
      const materialNuevo = data || {
        material_id: materialId,
        empresa_id: empresa.id,
        codigo: '',
        descripcion: seleccion.nombre || '',
        unidad: seleccion.unidad || '',
        grupo_id: null,
        familia_id: null,
        subfamilia_id: null,
        costo_usd_calculado: null,
      };
      setMateriales(prev => [...prev.filter(item => item.material_id !== materialId), materialNuevo]);
      seleccionarMaterial(materialId, materialNuevo);
    } catch (error) {
      addToast(`No se pudo actualizar el material recién creado: ${error.message || error}`, 'error');
    }
  };

  const agregarLineaMaterial = async event => {
    event.preventDefault();
    if (bloqueada || guardando) return;
    const cantidad = numero(formMaterial.cantidad);
    const costoUnitario = numero(formMaterial.costo_unitario_manual);
    if (!materialSeleccionado || cantidad <= 0) {
      addToast('Selecciona un material e ingresa una cantidad mayor a cero.', 'error');
      return;
    }
    if (costoUnitario <= 0) {
      addToast('Ingresa un costo unitario manual mayor a cero.', 'error');
      return;
    }
    const costoCalculado = costoMaterialCalculadoEnMoneda;
    const fueManual = costoCalculado == null || Math.abs(costoUnitario - numero(costoCalculado)) > 0.000001;
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
        const payload = {
          hoja_costeo_id: hoja.id,
          material_id: materialSeleccionado.material_id,
          tarea_id: lineas.find(item => item.id === materialTareaId)?.tarea_id || null,
          linea_mano_obra_id: materialTareaId || null,
        cantidad,
        costo_unitario_snapshot: costoUnitario,
        fue_manual: fueManual,
        subtotal: cantidad * costoUnitario,
        orden: lineasMateriales.length,
      };
      const { data, error } = await sb.from('hoja_costeo_lineas_materiales').insert(payload).select().single();
      if (error) throw error;
      await sincronizarTotales({ materiales: subtotalMateriales + numero(data.subtotal) });
      setLineasMateriales(prev => [...prev, data]);
      setPanelMaterial(false);
      setMaterialTareaId('');
      setFormMaterial({ busqueda: '', grupo_id: '', familia_id: '', subfamilia_id: '', material_id: '', cantidad: '', costo_unitario_manual: '' });
      addToast(`Material agregado con costo ${fueManual ? 'manual' : 'calculado'}.`, 'success');
    } catch (error) {
      addToast(`No se pudo agregar el material: ${error.message || error}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarLineaMaterial = async linea => {
    if (bloqueada || eliminandoMaterialId) return;
    setEliminandoMaterialId(linea.id);
    try {
      const sb = await getSupabaseClient();
      const { error } = await sb.from('hoja_costeo_lineas_materiales').delete().eq('id', linea.id);
      if (error) throw error;
      await sincronizarTotales({ materiales: Math.max(0, subtotalMateriales - numero(linea.subtotal)) });
      setLineasMateriales(prev => prev.filter(item => item.id !== linea.id));
      addToast('Material eliminado.', 'success');
    } catch (error) {
      addToast(`No se pudo eliminar el material: ${error.message || error}`, 'error');
    } finally {
      setEliminandoMaterialId(null);
    }
  };

  const guardarBloqueJson = async (campo, siguientesLineas) => {
    if (bloqueada) return false;
    const subtotal = siguientesLineas.reduce((total, linea) => total + numero(linea.cantidad) * numero(linea.costo_unitario), 0);
    const esServicio = campo === 'servicios_terceros';
    const datos = esServicio
      ? { servicios_terceros: siguientesLineas }
      : { logistica: siguientesLineas };
    setGuardandoBloqueJson(campo);
    try {
      await sincronizarTotales(esServicio ? { servicios: subtotal } : { logistica: subtotal }, datos);
      return true;
    } catch (error) {
      addToast(`No se pudo guardar ${campo === 'servicios_terceros' ? 'los servicios de terceros' : 'la logística'}: ${error.message || error}`, 'error');
      await cargarDatos();
      return false;
    } finally {
      setGuardandoBloqueJson('');
    }
  };

  const agregarLineaJson = async (event, campo) => {
    event.preventDefault();
    if (bloqueada || guardandoBloqueJson) return;
    const esServicio = campo === 'servicios_terceros';
    const formJson = esServicio ? formServicioTercero : formLogistica;
    const setter = esServicio ? setServiciosTerceros : setLogistica;
    const lineasActuales = esServicio ? serviciosTerceros : logistica;
    const descripcion = formJson.descripcion.trim();
    const unidad = formJson.unidad.trim();
    const cantidad = numero(formJson.cantidad);
    const costoUnitario = numero(formJson.costo_unitario);
    if (!descripcion || !unidad || cantidad <= 0 || costoUnitario <= 0) {
      addToast('Completa descripción, cantidad, unidad y costo unitario mayor a cero.', 'error');
      return;
    }
    const siguientes = [...lineasActuales, { id: Date.now(), descripcion, cantidad, unidad, costo_unitario: costoUnitario,
      ...(esServicio ? terceroRef : { familia_trabajo_id: logisticaTrabajo || null }) }];
    if (await guardarBloqueJson(campo, siguientes)) {
      setter(siguientes);
      if (esServicio) setTerceroRef({ familia_trabajo_id: '', tarea_id: '' });
      else setLogisticaTrabajo('');
      (esServicio ? setFormServicioTercero : setFormLogistica)({ descripcion: '', cantidad: '', unidad: '', costo_unitario: '' });
      addToast(esServicio ? 'Servicio tercero agregado.' : 'Gasto logístico agregado.', 'success');
    }
  };

  const editarLineaJson = (campo, id, clave, valor) => {
    const esServicio = campo === 'servicios_terceros';
    const lineasActuales = esServicio ? serviciosTerceros : logistica;
    const setter = esServicio ? setServiciosTerceros : setLogistica;
    setter(lineasActuales.map(linea => linea.id === id ? { ...linea, [clave]: valor } : linea));
  };

  const eliminarLineaJson = async (campo, id) => {
    if (bloqueada || guardandoBloqueJson) return;
    const esServicio = campo === 'servicios_terceros';
    const lineasActuales = esServicio ? serviciosTerceros : logistica;
    const setter = esServicio ? setServiciosTerceros : setLogistica;
    const siguientes = lineasActuales.filter(linea => linea.id !== id);
    if (await guardarBloqueJson(campo, siguientes)) {
      setter(siguientes);
      addToast(esServicio ? 'Servicio tercero eliminado.' : 'Gasto logístico eliminado.', 'success');
    }
  };

  const guardarResumen = async ({ silencioso = false } = {}) => {
    const gastoManualNumerico = porcentajeGastoManual === '' ? null : Number(porcentajeGastoManual);
    const margenNumerico = Number(margenObjetivo);
    if (gastoManualNumerico !== null && (!Number.isFinite(gastoManualNumerico) || gastoManualNumerico < 0)) {
      if (!silencioso) addToast('El % de gasto administrativo debe ser un número mayor o igual a cero.', 'error');
      return false;
    }
    if (!Number.isFinite(margenNumerico) || margenNumerico < 0) {
      if (!silencioso) addToast('El % de margen debe ser un número mayor o igual a cero.', 'error');
      return false;
    }
    const gastoEfectivo = gastoManualNumerico === null ? numero(porcentajeGastoCalculado) : gastoManualNumerico / 100;
    const divisor = 1 - (gastoEfectivo + margenNumerico / 100);
    if (divisor <= 0) {
      if (!silencioso) addToast('La suma de gasto administrativo y margen debe ser menor a 100%.', 'error');
      return false;
    }
    const sinIgv = costoTotal / divisor;
    setGuardandoResumen(true);
    try {
      await sincronizarTotales({}, {
        margen_objetivo_pct: margenNumerico,
        gasto_administrativo_manual_pct: gastoManualNumerico === null ? null : gastoManualNumerico / 100,
        precio_sugerido_sin_igv: sinIgv,
        precio_sugerido_total: sinIgv * 1.18,
      });
      if (!silencioso) addToast('Resumen y totales guardados.', 'success');
      return true;
    } catch (error) {
      if (!silencioso) addToast(`No se pudo guardar el resumen: ${error.message || error}`, 'error');
      return false;
    } finally {
      setGuardandoResumen(false);
    }
  };

  useEffect(() => {
    if (paso === 'resumen' && !cargando && !bloqueada) guardarResumen({ silencioso: true });
  }, [paso, cargando, hoja?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let activa = true;
    setCotizacionesVerificadas(false);
    if (!hoja?.id) {
      setCotizacionesVinculadas([]);
      return () => { activa = false; };
    }
    listarCotizacionesGeneradasPorHojaCosteo(hoja.id)
      .then(data => {
        if (!activa) return;
        setCotizacionesVinculadas(data);
        setCotizacionesVerificadas(true);
      })
      .catch(() => {
        if (activa) setCotizacionesVinculadas([]);
      });
    return () => { activa = false; };
  }, [hoja?.id]);

  useEffect(() => {
    if (!aprobacionPendiente || !hoja?.id || bloqueada || aprobando) return;
    const aprobar = async () => {
      setAprobacionPendiente(false);
      setAprobando(true);
      try {
        await aprobarHojaCosteo(hoja.id);
        setSelectorTipoCotizacion(true);
      } catch (error) {
        addToast(`No se pudo aprobar la Hoja de Costeo: ${error.message || error}`, 'error');
      } finally {
        setAprobando(false);
      }
    };
    aprobar();
  }, [aprobacionPendiente, hoja?.id, bloqueada, aprobando, aprobarHojaCosteo, addToast]);

  const solicitarAprobacion = async () => {
    if (bloqueada || aprobando) return;
    if (hoja?.estado !== 'en_revision') {
      addToast('Envía la Hoja de Costeo a revisión antes de aprobarla.', 'error');
      return;
    }
    const guardado = await guardarResumen();
    if (guardado) setAprobacionPendiente(true);
  };

  const generarCotizacionEstandar = async lineaNegocio => {
    if (!hoja?.id || generandoCotizacion) return;
    setSelectorTipoCotizacion(false);
    setGenerandoCotizacion(true);
    try {
      const cotizacionId = await crearCotizacionDesdeHojaCosteo(hoja.id, lineaNegocio || hoja.linea_negocio || null);
      navigate('cotizaciones', { detail: cotizacionId });
    } catch (error) {
      addToast(`No se pudo generar la Cotización Estándar: ${error?.message || error}`, 'error');
    } finally {
      setGenerandoCotizacion(false);
    }
  };

  const generarCotizacionEspecial = (plantilla, lineaNegocio) => {
    if (!hoja?.id) return;
    setSelectorTipoCotizacion(false);
    navigate('cotizaciones', {
      especial: 'nueva',
      hoja_costeo_id: hoja.id,
      plantilla_documento_id: plantilla.id,
      tipo_documento_id: plantilla.tipo_documento_id,
      linea_negocio: lineaNegocio || hoja.linea_negocio || null,
      cuenta_id: hoja.cuenta_id || null,
      oportunidad_id: hoja.oportunidad_id || null,
      activo_id: hoja.activo_id || null,
      recepcion_id: hoja.recepcion_id || null,
    });
  };

  const pendienteCotizar = hoja?.estado === 'aprobada'
    && cotizacionesVerificadas
    && !hoja?.cotizacion_id
    && cotizacionesVinculadas.length === 0;

  const enviarARevision = async () => {
    if (bloqueada || guardandoResumen || hoja?.estado !== 'borrador') return;
    const guardado = await guardarResumen();
    if (!guardado) return;
    try {
      await sincronizarTotales({}, { estado: 'en_revision' });
      addToast('Hoja de Costeo enviada a revisión.', 'success');
    } catch (error) {
      addToast(`No se pudo enviar a revisión: ${error.message || error}`, 'error');
    }
  };

  const actividadesDelTrabajo = useMemo(() => actividades.filter(item => (
    !familiaSeleccionada || item.familia_trabajo_id === familiaSeleccionada
  )), [actividades, familiaSeleccionada]);
  const recetaPanel = useMemo(() => recetas
    .filter(item => item.actividad_id === actividadSeleccionada)
    .sort((a, b) => numero(a.orden) - numero(b.orden)), [recetas, actividadSeleccionada]);
  const tareasPanel = useMemo(() => tareas
    .filter(item => !busquedasCascada[2] || `${item.codigo || ''} ${item.nombre}`.toLowerCase().includes(busquedasCascada[2].toLowerCase())), [tareas, busquedasCascada]);
  const gruposPorTarea = useMemo(() => calcularCostosPorTarea({
    lineas,
    activos: lineasActivos,
    materiales: lineasMateriales,
    tarifas: Object.fromEntries(tarifaPorCargo),
  }), [lineas, lineasActivos, lineasMateriales, tarifaPorCargo]);
  const lineaPorId = useMemo(() => new Map(lineas.map(item => [item.id, item])), [lineas]);
  const tareaPorId = useMemo(() => new Map(tareas.map(item => [item.id, item])), [tareas]);
  const nombreActividadLinea = linea => actividadPorId.get(linea.actividad_receta_id || linea.actividad_id)?.nombre || 'Sin actividad';
  const nombreTareaLinea = linea => tareaPorId.get(linea.tarea_id)?.nombre || 'Trabajo directo';
  const nombreFamiliaLinea = linea => familiaPorId.get(linea.familia_trabajo_id)?.nombre || 'Sin trabajo';

  const crearElementoCatalogo = async nivel => {
    const nombre = crearNombre.trim();
    if (!nombre || creandoTrabajo) return;
    setCreandoTrabajo(true);
    try {
      const sb = await getSupabaseClient();
      let data;
      if (nivel === 0) {
        const result = await sb.rpc('buscar_o_crear_familia_trabajo', { p_empresa_id: empresa.id, p_nombre: nombre });
        if (result.error) throw result.error;
        data = result.data;
        setFamilias(prev => [...prev.filter(item => item.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
        setFamiliaSeleccionada(data.id);
      } else {
        const result = await sb.rpc('buscar_o_crear_tipo_servicio_interno', {
          p_empresa_id: empresa.id,
          p_nombre: nombre,
          p_rol: nivel === 1 ? 'actividad' : 'tarea',
          p_familia_trabajo_id: nivel === 1 ? (familiaSeleccionada || null) : null,
        });
        if (result.error) throw result.error;
        data = result.data;
        if (nivel === 1) {
          setActividades(prev => [...prev.filter(item => item.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
          setActividadSeleccionada(data.id);
        } else {
          setTareas(prev => [...prev.filter(item => item.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
          setTareaSeleccionada(data.id);
        }
      }
      setCrearNombre('');
      setCrearNivel(null);
      addToast(`${nivel === 0 ? 'Trabajo' : nivel === 1 ? 'Actividad' : 'Tarea'} creado y seleccionado.`, 'success');
    } catch (error) {
      addToast(`No se pudo crear el elemento: ${error.message || error}`, 'error');
    } finally {
      setCreandoTrabajo(false);
    }
  };

  const valorReceta = (fila, campo) => seleccionReceta[fila.id]?.[campo] ?? fila[campo] ?? '';
  const cambiarValorReceta = (fila, campo, valor) => setSeleccionReceta(prev => ({
    ...prev,
    [fila.id]: { ...(prev[fila.id] || {}), [campo]: valor },
  }));
  const seleccionarActividadPanel = actividadId => {
    setActividadSeleccionada(actividadId);
    const filas = recetas.filter(item => item.actividad_id === actividadId);
    setSeleccionReceta(Object.fromEntries(filas.map(item => [item.id, {
      cargo_id: item.cargo_id || '',
      horas: item.horas ?? '',
      horas_maquina: item.horas_maquina ?? '',
      activo_id: item.activo_id || '',
    }])));
  };

  const agregarTrabajoDesdePanel = async () => {
    if (bloqueada || guardando || !familiaSeleccionada || !actividadSeleccionada) return;
    const filas = recetaPanel.length ? recetaPanel : [{
      id: `manual-${Date.now()}`,
      tarea_id: tareaSeleccionada,
      cargo_id: '',
      horas: '',
      horas_maquina: '',
      activo_id: '',
    }];
    if (!filas.every(fila => valorReceta(fila, 'tarea_id') && valorReceta(fila, 'cargo_id') && numero(valorReceta(fila, 'horas')) > 0)) {
      addToast('Completa tarea, cargo y horas mayores a cero para cada trabajo.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      const nuevasLineas = [];
      const nuevosActivos = [];
      for (const fila of filas) {
        const cargoId = valorReceta(fila, 'cargo_id');
        const costoHora = costoHoraCargo(cargoId);
        if (costoHora == null || costoHora <= 0) throw new Error(`El cargo ${cargoPorId.get(cargoId)?.nombre || cargoId} no tiene costo/hora.`);
        const payload = {
          hoja_costeo_id: hoja.id,
          familia_trabajo_id: familiaSeleccionada,
          actividad_id: null,
          actividad_receta_id: actividadSeleccionada,
          tarea_id: valorReceta(fila, 'tarea_id'),
          cargo_id: cargoId,
          horas: numero(valorReceta(fila, 'horas')),
          metodo_usado: tarifaPorCargo.has(cargoId) ? 'planilla' : 'manual',
          costo_hora_snapshot: costoHora,
          subtotal: numero(valorReceta(fila, 'horas')) * costoHora,
          orden: lineas.length + nuevasLineas.length,
        };
        const { data, error } = await sb.from('hoja_costeo_lineas_mano_obra').insert(payload).select().single();
        if (error) throw error;
        nuevasLineas.push(data);
        const activoId = valorReceta(fila, 'activo_id');
        const horasMaquina = numero(valorReceta(fila, 'horas_maquina'));
        if (activoId && horasMaquina > 0) {
          const activo = activoPorId.get(activoId);
          const costoActivo = convertirUsdAMonedaHoja(activo?.costo_hora_activo_usd);
          if (costoActivo == null || costoActivo <= 0) throw new Error(`El activo ${activo?.nombre || activoId} no tiene costo/hora.`);
          const activoPayload = {
            hoja_costeo_id: hoja.id,
            activo_id: activoId,
            tarea_id: payload.tarea_id,
            linea_mano_obra_id: data.id,
            horas_uso_estimadas: horasMaquina,
            costo_hora_equipo: costoActivo,
            depreciacion_asignada: horasMaquina * costoActivo,
            fue_manual: false,
            orden: lineasActivos.length + nuevosActivos.length,
          };
          const activoResult = await sb.from('hoja_costeo_lineas_activos').insert(activoPayload).select().single();
          if (activoResult.error) throw activoResult.error;
          nuevosActivos.push(activoResult.data);
        }
      }
      await sincronizarTotales({
        manoObra: subtotalManoObra + nuevasLineas.reduce((suma, item) => suma + numero(item.subtotal), 0),
        activos: subtotalActivos + nuevosActivos.reduce((suma, item) => suma + numero(item.depreciacion_asignada), 0),
      });
      setLineas(prev => [...prev, ...nuevasLineas]);
      setLineasActivos(prev => [...prev, ...nuevosActivos]);
      setPanelTrabajo(false);
      setFamiliaSeleccionada('');
      setActividadSeleccionada('');
      setTareaSeleccionada('');
      setBusquedasCascada(['', '', '']);
      setSeleccionReceta({});
      addToast(`${nuevasLineas.length} trabajo(s) agregado(s).`, 'success');
    } catch (error) {
      addToast(`No se pudo agregar el trabajo: ${error.message || error}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const renderPanelTrabajo = () => !panelTrabajo ? null : (
    <div className="hcx-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPanelTrabajo(false)}>
      <section className="hcx-panel" role="dialog" aria-modal="true" aria-labelledby="panel-trabajo-titulo">
        <header className="hcx-panelhead">
          <div><h2 id="panel-trabajo-titulo">Agregar trabajo</h2><div className="hcx-sub">Elige Trabajo › Actividad › Tarea y ajusta la receta antes de agregarla.</div></div>
          <button className="hcx-btn" type="button" onClick={() => setPanelTrabajo(false)} aria-label="Cerrar panel">{I.x}</button>
        </header>
        <div className="hcx-cols">
          <div className="hcx-col">
            <div className="hcx-colhead"><strong>1. Trabajo</strong><input placeholder="Buscar trabajo" value={busquedasCascada[0]} onChange={event => setBusquedasCascada(prev => [event.target.value, prev[1], prev[2]])} /></div>
            {familias.filter(item => !busquedasCascada[0] || item.nombre.toLowerCase().includes(busquedasCascada[0].toLowerCase())).map(item => (
              <button key={item.id} className="hcx-option" type="button" aria-selected={familiaSeleccionada === item.id} onClick={() => { setFamiliaSeleccionada(item.id); setActividadSeleccionada(''); setTareaSeleccionada(''); }}>
                <span><b>{item.nombre}</b><small>{actividades.filter(row => row.familia_trabajo_id === item.id).length} actividades</small></span><span>›</span>
              </button>
            ))}
            {!bloqueada && <button className="hcx-option hcx-create" type="button" onClick={() => { setCrearNivel(0); setCrearNombre(''); }}><span>＋ Crear trabajo</span></button>}
          </div>
          <div className="hcx-col">
            <div className="hcx-colhead"><strong>2. Actividad</strong><input placeholder="Buscar actividad" value={busquedasCascada[1]} onChange={event => setBusquedasCascada(prev => [prev[0], event.target.value, prev[2]])} disabled={!familiaSeleccionada} /></div>
            {actividadesDelTrabajo.filter(item => !busquedasCascada[1] || item.nombre.toLowerCase().includes(busquedasCascada[1].toLowerCase())).map(item => (
              <button key={item.id} className="hcx-option" type="button" aria-selected={actividadSeleccionada === item.id} onClick={() => seleccionarActividadPanel(item.id)}>
                <span><b>{item.nombre}</b><small>{recetas.filter(row => row.actividad_id === item.id).length} tareas en receta</small></span><span>›</span>
              </button>
            ))}
            {!bloqueada && familiaSeleccionada && <button className="hcx-option hcx-create" type="button" onClick={() => { setCrearNivel(1); setCrearNombre(''); }}><span>＋ Crear actividad</span></button>}
          </div>
          <div className="hcx-col">
            <div className="hcx-colhead"><strong>3. Tarea</strong><input placeholder="Buscar tarea" value={busquedasCascada[2]} onChange={event => setBusquedasCascada(prev => [prev[0], prev[1], event.target.value])} disabled={!actividadSeleccionada} /></div>
            {!actividadSeleccionada ? <div className="hcx-empty">Selecciona una actividad.</div> : recetaPanel.length === 0 ? (
              <>
                {tareasPanel.map(item => <button key={item.id} className="hcx-option" type="button" aria-selected={tareaSeleccionada === item.id} onClick={() => setTareaSeleccionada(item.id)}><span><b>{item.nombre}</b><small>{item.codigo || 'Tarea de catálogo'}</small></span>{tareaSeleccionada === item.id && <span>✓</span>}</button>)}
                {!bloqueada && <button className="hcx-option hcx-create" type="button" onClick={() => { setCrearNivel(2); setCrearNombre(''); }}><span>＋ Crear tarea</span></button>}
              </>
            ) : (
              <div className="hcx-recipe"><div className="hcx-info">La receta agrega {recetaPanel.length} tarea(s). Ajusta horas, cargo y máquina si corresponde.</div>{recetaPanel.map(fila => <div className="hcx-recipe-row" key={fila.id}>
                <b>{tareaPorId.get(fila.tarea_id)?.nombre || fila.tarea_id}</b>
                <div className="hcx-recipe-fields">
                  <label className="hcx-field">Cargo<select value={valorReceta(fila, 'cargo_id')} onChange={event => cambiarValorReceta(fila, 'cargo_id', event.target.value)}><option value="">Seleccionar</option>{cargos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
                  <label className="hcx-field">Horas<input type="number" min="0.01" step="0.01" value={valorReceta(fila, 'horas')} onChange={event => cambiarValorReceta(fila, 'horas', event.target.value)} /></label>
                  <label className="hcx-field">Máquina<input type="number" min="0" step="0.01" value={valorReceta(fila, 'horas_maquina')} onChange={event => cambiarValorReceta(fila, 'horas_maquina', event.target.value)} /></label>
                  <label className="hcx-field">Activo<select value={valorReceta(fila, 'activo_id')} onChange={event => cambiarValorReceta(fila, 'activo_id', event.target.value)}><option value="">Sin máquina</option>{activos.map(item => <option key={item.activo_id} value={item.activo_id}>{item.nombre}</option>)}</select></label>
                </div>
              </div>)}</div>
            )}
          </div>
        </div>
        {crearNivel !== null && <form className="hcx-createbar" onSubmit={event => { event.preventDefault(); crearElementoCatalogo(crearNivel); }}><span>Crear {crearNivel === 0 ? 'trabajo' : crearNivel === 1 ? 'actividad' : 'tarea'}</span><input autoFocus value={crearNombre} onChange={event => setCrearNombre(event.target.value)} placeholder="Nombre" /><button className="hcx-btn primary" type="submit" disabled={!crearNombre.trim() || creandoTrabajo}>Crear</button><button className="hcx-btn" type="button" onClick={() => setCrearNivel(null)}>Cancelar</button></form>}
        <footer className="hcx-panelfoot"><span className="hcx-sub">{familiaPorId.get(familiaSeleccionada)?.nombre || 'Sin trabajo'}{actividadSeleccionada ? ` › ${actividadPorId.get(actividadSeleccionada)?.nombre || ''}` : ''}</span><div className="hcx-actions"><button className="hcx-btn" type="button" onClick={() => setPanelTrabajo(false)}>Cancelar</button><button className="hcx-btn primary" type="button" disabled={guardando || !familiaSeleccionada || !actividadSeleccionada || (!recetaPanel.length && !tareaSeleccionada)} onClick={agregarTrabajoDesdePanel}>{guardando ? 'Agregando...' : 'Agregar trabajo'}</button></div></footer>
      </section>
    </div>
  );

  /* Legacy material panel replaced by the route-first panel below.
  const renderPanelMaterial = () => !panelMaterial ? null : (
    <div className="hcx-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPanelMaterial(false)}>
      <section className="hcx-panel hcx-material-panel" role="dialog" aria-modal="true" aria-labelledby="panel-material-titulo">
        <header className="hcx-panelhead"><div><h2 id="panel-material-titulo">Agregar material</h2><div className="hcx-sub">Asocia el material a una tarea o déjalo como costo general.</div></div><button className="hcx-btn" type="button" onClick={() => setPanelMaterial(false)} aria-label="Cerrar panel">{I.x}</button></header>
        <div className="hcx-body hcx-panelbody"><form onSubmit={agregarLineaMaterial} className="hcx-formgrid">
          <label className="hcx-field full">Material<MaterialAutocomplete value={{ mat_id: formMaterial.material_id, nombre: materialSeleccionado?.descripcion || '' }} materiales={materialesParaAutocomplete} inventario={[]} inlineOptions permitirCrearMaterial={!bloqueada && !cargando && puedeCrearMaterial} onChange={seleccionarMaterialDesdeAutocomplete} /></label>
          <label className="hcx-field">Grupo<select disabled={bloqueada || cargando} value={formMaterial.grupo_id} onChange={event => setFormMaterial(prev => ({ ...prev, grupo_id: event.target.value, familia_id: '', subfamilia_id: '', material_id: '', costo_unitario_manual: '' }))}><option value="">Seleccionar</option>{materialGrupos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label className="hcx-field">Familia<select disabled={!formMaterial.grupo_id} value={formMaterial.familia_id} onChange={event => setFormMaterial(prev => ({ ...prev, familia_id: event.target.value, subfamilia_id: '', material_id: '', costo_unitario_manual: '' }))}><option value="">Seleccionar</option>{familiasMaterialSeleccionadas.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label className="hcx-field">Subfamilia<select disabled={!formMaterial.familia_id} value={formMaterial.subfamilia_id} onChange={event => setFormMaterial(prev => ({ ...prev, subfamilia_id: event.target.value, material_id: '', costo_unitario_manual: '' }))}><option value="">Seleccionar</option>{subfamiliasMaterialSeleccionadas.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label className="hcx-field">Material filtrado<select disabled={!formMaterial.grupo_id} value={formMaterial.material_id} onChange={event => seleccionarMaterial(event.target.value)}><option value="">Seleccionar</option>{materialesPorJerarquia.map(item => <option key={item.material_id} value={item.material_id}>{item.descripcion}</option>)}</select></label>
          {materialSeleccionado && <><label className="hcx-field">Cantidad<input type="number" min="0.01" step="0.01" value={formMaterial.cantidad} onChange={event => setFormMaterial(prev => ({ ...prev, cantidad: event.target.value }))} /></label><label className="hcx-field">Costo unitario<input type="number" min="0.01" step="0.01" value={formMaterial.costo_unitario_manual} onChange={event => setFormMaterial(prev => ({ ...prev, costo_unitario_manual: event.target.value }))} /><small>{costoMaterialCalculadoEnMoneda != null ? `Sugerido: ${money(costoMaterialCalculadoEnMoneda)}` : 'Valor manual obligatorio.'}</small></label><label className="hcx-field">Tarea<select value={materialTareaId} onChange={event => setMaterialTareaId(event.target.value)}><option value="">Costo general</option>{lineas.map(item => <option key={item.id} value={item.id}>{nombreFamiliaLinea(item)} › {nombreTareaLinea(item)}</option>)}</select></label></>}
        </form></div>
        <footer className="hcx-panelfoot"><span className="hcx-sub">{materialSeleccionado?.descripcion || 'Selecciona un material'}</span><div className="hcx-actions"><button className="hcx-btn" type="button" onClick={() => setPanelMaterial(false)}>Cancelar</button><button className="hcx-btn primary" type="button" disabled={bloqueada || guardando || !materialSeleccionado} onClick={() => document.querySelector('.hcx-material-panel form')?.requestSubmit()}>{guardando ? 'Agregando...' : 'Agregar material'}</button></div></footer>
      </section>
    </div>
  );

  if (!hojaId || !hoja) {
    return (
      <div className="page-content">
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Hoja de Costeo no encontrada</div>
          <button className="btn btn-secondary" onClick={() => navigate('hoja_costeo')}>Volver a Hojas de Costeo</button>
        </div>
      </div>
    );
  }

  */
  const renderPanelMaterial = () => {
    const trabajoLineas = lineas.filter(linea => !materialTrabajoId || linea.familia_trabajo_id === materialTrabajoId);
    const actividadesTrabajo = [...new Map(trabajoLineas.map(linea => { const id = linea.actividad_receta_id || linea.actividad_id || ''; return [id, linea]; })).values()];
    const tareasActividad = trabajoLineas.filter(linea => !materialActividadId || (linea.actividad_receta_id || linea.actividad_id || '') === materialActividadId);
    const lineaDestino = lineas.find(linea => linea.id === materialTareaId);
    const rutaDestino = lineaDestino ? rutaMaterial(lineaDestino, lineaDestino, familias, actividades, tareas) : [];
    if (!panelMaterial) return null;
    return <div className="hcx-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPanelMaterial(false)}><section className="hcx-panel hcx-material-panel" role="dialog" aria-modal="true" aria-labelledby="panel-material-titulo"><header className="hcx-panelhead"><div><h2 id="panel-material-titulo">Agregar material</h2><div className="hcx-sub">Elige para qué tarea lo necesitas.</div></div><button className="hcx-btn" type="button" onClick={() => setPanelMaterial(false)} aria-label="Cerrar panel">{I.x}</button></header><div className="hcx-material-context"><span className="hcx-eyebrow">¿Para qué tarea?</span><div className="hcx-context-grid"><label>Trabajo<select className="hcx-cell" value={materialTrabajoId} onChange={event => { setMaterialTrabajoId(event.target.value); setMaterialActividadId(''); setMaterialTareaId(''); }}><option value="">Selecciona un trabajo</option>{familias.filter(familia => lineas.some(linea => linea.familia_trabajo_id === familia.id)).map(familia => <option key={familia.id} value={familia.id}>{familia.nombre}</option>)}</select></label><label>Actividad<select className="hcx-cell" value={materialActividadId} disabled={!materialTrabajoId} onChange={event => { setMaterialActividadId(event.target.value); setMaterialTareaId(''); }}><option value="">Selecciona una actividad</option>{actividadesTrabajo.map(linea => { const id = linea.actividad_receta_id || linea.actividad_id || ''; return <option key={id || 'sin-actividad'} value={id}>{actividadPorId.get(id)?.nombre || 'Sin actividad'}</option>; })}</select></label><label>Tarea<select className="hcx-cell" value={materialTareaId} disabled={!materialActividadId} onChange={event => setMaterialTareaId(event.target.value)}><option value="">Selecciona una tarea</option>{tareasActividad.map(linea => <option key={linea.id} value={linea.id}>{nombreTareaLinea(linea)}</option>)}</select></label></div><span className="hcx-context-route">Se agregará a: <b>{rutaDestino.join(' › ') || 'Selecciona Trabajo, Actividad y Tarea'}</b></span></div><div className="hcx-body hcx-panelbody"><form onSubmit={agregarLineaMaterial} className="hcx-formgrid"><label className="hcx-field full">Material<MaterialAutocomplete value={{ mat_id: formMaterial.material_id, nombre: materialSeleccionado?.descripcion || '' }} materiales={materialesParaAutocomplete} inventario={[]} inlineOptions permitirCrearMaterial={!bloqueada && !cargando && puedeCrearMaterial} onChange={seleccionarMaterialDesdeAutocomplete} /></label><label className="hcx-field">Grupo<select disabled={bloqueada || cargando} value={formMaterial.grupo_id} onChange={event => setFormMaterial(prev => ({ ...prev, grupo_id: event.target.value, familia_id: '', subfamilia_id: '', material_id: '', costo_unitario_manual: '' }))}><option value="">Todos</option>{materialGrupos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="hcx-field">Familia<select disabled={!formMaterial.grupo_id} value={formMaterial.familia_id} onChange={event => setFormMaterial(prev => ({ ...prev, familia_id: event.target.value, subfamilia_id: '', material_id: '', costo_unitario_manual: '' }))}><option value="">Todas</option>{familiasMaterialSeleccionadas.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="hcx-field">Subfamilia<select disabled={!formMaterial.familia_id} value={formMaterial.subfamilia_id} onChange={event => setFormMaterial(prev => ({ ...prev, subfamilia_id: event.target.value, material_id: '', costo_unitario_manual: '' }))}><option value="">Todas</option>{subfamiliasMaterialSeleccionadas.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="hcx-field">Material filtrado<select disabled={!formMaterial.grupo_id} value={formMaterial.material_id} onChange={event => seleccionarMaterial(event.target.value)}><option value="">Seleccionar material</option>{materialesPorJerarquia.map(item => <option key={item.material_id} value={item.material_id}>{item.codigo ? `${item.codigo} — ` : ''}{item.descripcion}</option>)}</select></label>{materialSeleccionado && <><label className="hcx-field">Cantidad<input type="number" min="0.01" step="0.01" value={formMaterial.cantidad} onChange={event => setFormMaterial(prev => ({ ...prev, cantidad: event.target.value }))} /></label><label className="hcx-field">Costo unitario<input type="number" min="0.01" step="0.01" value={formMaterial.costo_unitario_manual} onChange={event => setFormMaterial(prev => ({ ...prev, costo_unitario_manual: event.target.value }))} /><small>{costoMaterialCalculadoEnMoneda != null ? `Sugerido: ${money(costoMaterialCalculadoEnMoneda)}` : 'Valor manual obligatorio.'}</small></label></>}</form></div><footer className="hcx-panelfoot"><span className="hcx-sub">{materialSeleccionado?.descripcion || 'Selecciona un material'}</span><div className="hcx-actions"><button className="hcx-btn" type="button" onClick={() => setPanelMaterial(false)}>Cancelar</button><button className="hcx-btn primary" type="button" disabled={bloqueada || guardando || !materialSeleccionado || !materialTareaId} onClick={() => document.querySelector('.hcx-material-panel form')?.requestSubmit()}>Agregar a la tarea</button></div></footer></section></div>;
  };

  /* Legacy cost sections removed from the rendered wizard.
  const renderPasoMateriales = () => (
    <>
      {bloqueada && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: 'var(--orange)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 16, height: 16, flex: '0 0 16px', display: 'inline-flex' }}>{I.lock}</span>
          <span>Esta Hoja de Costeo está aprobada. Las líneas de materiales solo se muestran en modo lectura.</span>
        </div>
      )}
      <section className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Nueva línea</div>
        <div className="text-muted" style={{ fontSize: 13, marginBottom: 18 }}>Busca directamente por código o descripción, o navega por la jerarquía del catálogo.</div>
        <form onSubmit={agregarLineaMaterial}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <div className="input-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label>Buscar material por código o nombre</label>
              <MaterialAutocomplete
                value={{ mat_id: formMaterial.material_id, nombre: materialSeleccionado?.descripcion || '' }}
                materiales={materialesParaAutocomplete}
                inventario={[]}
                inlineOptions
                permitirCrearMaterial={!bloqueada && !cargando && puedeCrearMaterial}
                style={{ width: '100%' }}
                onChange={seleccionarMaterialDesdeAutocomplete}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-muted)', fontSize: 12 }}><span style={{ flex: 1, borderTop: '1px solid var(--border)' }} /><span>o navega por jerarquía</span><span style={{ flex: 1, borderTop: '1px solid var(--border)' }} /></div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>Grupo</label>
              <select className="select" disabled={bloqueada || cargando} value={formMaterial.grupo_id} onChange={e => setFormMaterial(prev => ({ ...prev, grupo_id: e.target.value, familia_id: '', subfamilia_id: '', material_id: '', costo_unitario_manual: '' }))}>
                <option value="">Seleccionar grupo...</option>
                {materialGrupos.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>Familia</label>
              <select className="select" disabled={bloqueada || cargando || !formMaterial.grupo_id} value={formMaterial.familia_id} onChange={e => setFormMaterial(prev => ({ ...prev, familia_id: e.target.value, subfamilia_id: '', material_id: '', costo_unitario_manual: '' }))}>
                <option value="">Seleccionar familia...</option>
                {familiasMaterialSeleccionadas.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>Subfamilia</label>
              <select className="select" disabled={bloqueada || cargando || !formMaterial.familia_id} value={formMaterial.subfamilia_id} onChange={e => setFormMaterial(prev => ({ ...prev, subfamilia_id: e.target.value, material_id: '', costo_unitario_manual: '' }))}>
                <option value="">Seleccionar subfamilia...</option>
                {subfamiliasMaterialSeleccionadas.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>Material de la jerarquía {formMaterial.grupo_id ? `(${materialesPorJerarquia.length})` : ''}</label>
              <select className="select" disabled={bloqueada || cargando || !formMaterial.grupo_id || materialesPorJerarquia.length === 0} value={formMaterial.material_id} onChange={e => seleccionarMaterial(e.target.value)}>
                <option value="">{formMaterial.grupo_id ? materialesPorJerarquia.length ? 'Seleccionar material...' : 'No hay materiales en el filtro' : 'Selecciona un grupo primero'}</option>
                {materialesPorJerarquia.map(item => <option key={item.material_id} value={item.material_id}>{item.codigo ? `${item.codigo} — ` : ''}{item.descripcion}</option>)}
              </select>
            </div>
            {materialSeleccionado && <>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Costo unitario calculado</label>
                <div className="input" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>{costoMaterialCalculadoEnMoneda != null ? money(costoMaterialCalculadoEnMoneda) : '—'}</div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Costo unitario manual</label>
                <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={formMaterial.costo_unitario_manual} onChange={e => setFormMaterial(prev => ({ ...prev, costo_unitario_manual: e.target.value }))} placeholder={`${simboloMoneda} 0.00`} />
                <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>{materialSeleccionado.costo_usd_calculado != null && costoMaterialCalculadoEnMoneda != null ? 'Puedes ajustar la sugerencia sin cambiar el catálogo.' : monedaHoja === 'PEN' && !tipoCambioPenUsd ? 'No hay tipo de cambio PEN vigente: ingresa un valor manual.' : 'Este material no tiene costo calculado: el valor manual es obligatorio.'}</div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Cantidad {materialSeleccionado.unidad ? `(${materialSeleccionado.unidad})` : ''}</label>
                <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={formMaterial.cantidad} onChange={e => setFormMaterial(prev => ({ ...prev, cantidad: e.target.value }))} placeholder="0.00" />
              </div>
              {referenciaMaterialSeleccionado && <div style={{ gridColumn: '1 / -1', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Referencia de números de parte</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, fontSize: 13 }}>
                  <div><span className="text-muted">Precio original</span><div className="num" style={{ fontWeight: 700, marginTop: 2 }}>{convertirUsdAMonedaHoja(referenciaMaterialSeleccionado.precio_original_usd) != null ? money(convertirUsdAMonedaHoja(referenciaMaterialSeleccionado.precio_original_usd)) : '—'}</div></div>
                  <div><span className="text-muted">Promedio alternativos</span><div className="num" style={{ fontWeight: 700, marginTop: 2 }}>{convertirUsdAMonedaHoja(referenciaMaterialSeleccionado.promedio_alternativos_usd) != null ? money(convertirUsdAMonedaHoja(referenciaMaterialSeleccionado.promedio_alternativos_usd)) : '—'}</div></div>
                </div>
              </div>}
            </>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-primary" type="submit" disabled={bloqueada || cargando || guardando}>{I.plus} {guardando ? 'Agregando...' : 'Agregar material'}</button>
          </div>
        </form>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <div className="cost-section-head">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}><h3>Materiales agregados</h3><span className="badge badge-cyan">{lineasMateriales.length}</span></div>
          <span className="num" style={{ fontWeight: 700 }}>{money(subtotalMateriales)}</span>
        </div>
        {cargando ? <div className="text-muted" style={{ padding: 16 }}>Cargando materiales...</div> : lineasMateriales.length === 0 ? (
          <div className="text-muted" style={{ padding: '12px 0', fontSize: 13 }}>Aún no hay líneas de materiales.</div>
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Material</th><th className="num">Cantidad</th><th className="num">Costo unitario</th><th>Origen</th><th className="num">Subtotal</th>{!bloqueada && <th />}</tr></thead>
            <tbody>{lineasMateriales.map(linea => {
              const material = materialPorId.get(linea.material_id);
              return <tr key={linea.id}>
                <td>{material ? <><strong>{material.descripcion}</strong>{material.codigo && <div className="text-muted mono" style={{ fontSize: 11 }}>{material.codigo}</div>}</> : linea.material_id}</td>
                <td className="num">{numero(linea.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
                <td className="num">{money(linea.costo_unitario_snapshot)}</td>
                <td><span className={`badge ${linea.fue_manual ? 'badge-gray' : 'badge-cyan'}`}>{linea.fue_manual ? 'manual' : 'calculado'}</span></td>
                <td className="num" style={{ fontWeight: 700 }}>{money(linea.subtotal)}</td>
                {!bloqueada && <td><button className="icon-btn text-danger" type="button" disabled={eliminandoMaterialId === linea.id} onClick={() => eliminarLineaMaterial(linea)} title="Eliminar material">{I.trash}</button></td>}
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </section>
    </>
  );

  const renderBloqueJsonLegacy = ({ campo, titulo, badge, formJson, setFormJson }) => {
    const esServicio = campo === 'servicios_terceros';
    const lineasJson = esServicio ? serviciosTerceros : logistica;
    const subtotal = esServicio ? subtotalServiciosTerceros : subtotalLogistica;
    const guardandoEsteBloque = guardandoBloqueJson === campo;
    return (
      <section className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div className="cost-section-head">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}><h3>{titulo}</h3><span className={`badge ${badge}`}>{lineasJson.length}</span></div>
          <span className="num" style={{ fontWeight: 700 }}>{money(subtotal)}</span>
        </div>
        <form onSubmit={event => agregarLineaJson(event, campo)} style={{ marginTop: 16, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) repeat(3, minmax(100px, 1fr)) auto', gap: 12, alignItems: 'end' }}>
            <div className="input-group" style={{ margin: 0 }}><label>Descripción</label><input className="input" disabled={bloqueada || guardandoEsteBloque} value={formJson.descripcion} onChange={e => setFormJson(prev => ({ ...prev, descripcion: e.target.value }))} placeholder="Concepto del costo" /></div>
            <div className="input-group" style={{ margin: 0 }}><label>Cantidad</label><input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || guardandoEsteBloque} value={formJson.cantidad} onChange={e => setFormJson(prev => ({ ...prev, cantidad: e.target.value }))} placeholder="0.00" /></div>
            <div className="input-group" style={{ margin: 0 }}><label>Unidad de medida</label><SelectorUnidadMedida disabled={bloqueada || guardandoEsteBloque} value={formJson.unidad} onChange={e => setFormJson(prev => ({ ...prev, unidad: e.target.value }))} /></div>
            <div className="input-group" style={{ margin: 0 }}><label>Costo unitario</label><input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || guardandoEsteBloque} value={formJson.costo_unitario} onChange={e => setFormJson(prev => ({ ...prev, costo_unitario: e.target.value }))} placeholder={`${simboloMoneda} 0.00`} /></div>
            <button className="btn btn-secondary" type="submit" disabled={bloqueada || guardandoEsteBloque}>{I.plus} {guardandoEsteBloque ? 'Guardando...' : 'Agregar línea'}</button>
          </div>
        </form>
        {lineasJson.length === 0 ? <div className="text-muted" style={{ padding: '12px 0', fontSize: 13 }}>Aún no hay líneas en esta sección.</div> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Descripción</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Costo unitario</th><th className="num">Subtotal</th>{!bloqueada && <th />}</tr></thead>
            <tbody>{lineasJson.map(linea => (
              <tr key={linea.id}>
                <td><input className="input" disabled={bloqueada || guardandoEsteBloque} value={linea.descripcion || ''} onChange={e => editarLineaJson(campo, linea.id, 'descripcion', e.target.value)} onBlur={() => guardarBloqueJson(campo, esServicio ? serviciosTerceros : logistica)} /></td>
                <td><input type="number" className="input num" min="0" step="0.01" disabled={bloqueada || guardandoEsteBloque} value={linea.cantidad ?? ''} onChange={e => editarLineaJson(campo, linea.id, 'cantidad', e.target.value)} onBlur={() => guardarBloqueJson(campo, esServicio ? serviciosTerceros : logistica)} /></td>
                <td><SelectorUnidadMedida disabled={bloqueada || guardandoEsteBloque} value={linea.unidad} onChange={e => editarLineaJson(campo, linea.id, 'unidad', e.target.value)} onBlur={() => guardarBloqueJson(campo, esServicio ? serviciosTerceros : logistica)} /></td>
                <td><input type="number" className="input num" min="0" step="0.01" disabled={bloqueada || guardandoEsteBloque} value={linea.costo_unitario ?? ''} onChange={e => editarLineaJson(campo, linea.id, 'costo_unitario', e.target.value)} onBlur={() => guardarBloqueJson(campo, esServicio ? serviciosTerceros : logistica)} /></td>
                <td className="num" style={{ fontWeight: 700 }}>{money(numero(linea.cantidad) * numero(linea.costo_unitario))}</td>
                {!bloqueada && <td><button type="button" className="icon-btn text-danger" disabled={guardandoEsteBloque} onClick={() => eliminarLineaJson(campo, linea.id)} title="Eliminar línea">{I.trash}</button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    );
  };

  */
  const renderBloqueJson = ({ campo, titulo, formJson, setFormJson }) => {
    const esServicio = campo === 'servicios_terceros';
    const lineasJson = esServicio ? serviciosTerceros : logistica;
    const subtotal = esServicio ? subtotalServiciosTerceros : subtotalLogistica;
    const guardar = lineas => guardarBloqueJson(campo, lineas);
    return <section className="hcx-card"><header className="hcx-cardhead"><div><h2>{titulo}</h2><div className="hcx-sub">{esServicio ? 'Cada servicio queda dirigido a un trabajo y una tarea.' : 'Indica si el concepto aplica a toda la hoja o a un trabajo.'}</div></div><span className="hcx-money">{money(subtotal)}<small>{lineasJson.length} {esServicio ? 'servicio(s)' : 'concepto(s)'}</small></span></header><form className="hcx-json-add" onSubmit={event => agregarLineaJson(event, campo)}><input className="hcx-cell" placeholder={esServicio ? 'Servicio de terceros' : 'Concepto de logística'} value={formJson.descripcion} onChange={event => setFormJson(prev => ({ ...prev, descripcion: event.target.value }))} /><input className="hcx-cell num" type="number" min="0.01" step="0.01" placeholder="Cantidad" value={formJson.cantidad} onChange={event => setFormJson(prev => ({ ...prev, cantidad: event.target.value }))} /><SelectorUnidadMedida value={formJson.unidad} onChange={event => setFormJson(prev => ({ ...prev, unidad: event.target.value }))} /><input className="hcx-cell num" type="number" min="0.01" step="0.01" placeholder="Precio unit." value={formJson.costo_unitario} onChange={event => setFormJson(prev => ({ ...prev, costo_unitario: event.target.value }))} />{esServicio ? <><select className="hcx-cell" value={terceroRef.familia_trabajo_id} onChange={event => setTerceroRef({ familia_trabajo_id: event.target.value, tarea_id: '' })}><option value="">Trabajo destino</option>{familias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select><select className="hcx-cell" value={terceroRef.tarea_id} disabled={!terceroRef.familia_trabajo_id} onChange={event => setTerceroRef(prev => ({ ...prev, tarea_id: event.target.value }))}><option value="">Tarea destino</option>{lineas.filter(item => item.familia_trabajo_id === terceroRef.familia_trabajo_id).map(item => <option key={item.id} value={item.tarea_id || item.id}>{nombreTareaLinea(item)}</option>)}</select></> : <select className="hcx-cell" value={logisticaTrabajo} onChange={event => setLogisticaTrabajo(event.target.value)}><option value="">Toda la hoja</option>{familias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>}<button className="hcx-btn primary" type="submit" disabled={bloqueada || guardandoBloqueJson === campo}>{I.plus} Agregar</button></form>{lineasJson.length === 0 ? <div className="hcx-empty">Aún no hay líneas.</div> : <table className="hcx-table"><thead><tr><th>{esServicio ? 'Servicio' : 'Concepto'}</th><th>{esServicio ? 'Para qué trabajo y tarea' : 'Aplica a'}</th><th>Cantidad</th><th>Unidad</th><th className="num">Precio unit.</th><th className="num">Monto</th><th></th></tr></thead><tbody>{lineasJson.map(linea => <tr key={linea.id}><td><input className="hcx-cell" disabled={bloqueada} value={linea.descripcion || ''} onChange={event => editarLineaJson(campo, linea.id, 'descripcion', event.target.value)} onBlur={() => guardar(esServicio ? serviciosTerceros : logistica)} /></td><td>{esServicio ? <span className="hcx-route-text">{nombreFamiliaLinea(linea)} › {tareaPorId.get(linea.tarea_id)?.nombre || 'Sin tarea'}</span> : <select className="hcx-cell" disabled={bloqueada} value={linea.familia_trabajo_id || ''} onChange={event => { editarLineaJson(campo, linea.id, 'familia_trabajo_id', event.target.value || null); guardar(logistica.map(item => item.id === linea.id ? { ...item, familia_trabajo_id: event.target.value || null } : item)); }}><option value="">Toda la hoja</option>{familias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>}</td><td><input className="hcx-cell num" disabled={bloqueada} type="number" min="0" value={linea.cantidad ?? ''} onChange={event => editarLineaJson(campo, linea.id, 'cantidad', event.target.value)} onBlur={() => guardar(esServicio ? serviciosTerceros : logistica)} /></td><td><SelectorUnidadMedida disabled={bloqueada} value={linea.unidad} onChange={event => { editarLineaJson(campo, linea.id, 'unidad', event.target.value); guardar((esServicio ? serviciosTerceros : logistica).map(item => item.id === linea.id ? { ...item, unidad: event.target.value } : item)); }} /></td><td className="num"><input className="hcx-cell num" disabled={bloqueada} type="number" min="0" value={linea.costo_unitario ?? ''} onChange={event => editarLineaJson(campo, linea.id, 'costo_unitario', event.target.value)} onBlur={() => guardar(esServicio ? serviciosTerceros : logistica)} /></td><td className="num"><b>{money(numero(linea.cantidad) * numero(linea.costo_unitario))}</b></td><td>{!bloqueada && <button className="hcx-icon" type="button" onClick={() => eliminarLineaJson(campo, linea.id)} aria-label="Eliminar">{I.trash}</button>}</td></tr>)}</tbody></table>}</section>;
  };

  /* Legacy cost sections removed from the rendered wizard.
  const renderPasoTerceros = () => (
    <>
      {bloqueada && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: 'var(--orange)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 16, height: 16, flex: '0 0 16px', display: 'inline-flex' }}>{I.lock}</span>
          <span>Esta Hoja de Costeo está aprobada. Los servicios de terceros y la logística solo se muestran en modo lectura.</span>
        </div>
      )}
      {renderBloqueJson({ campo: 'servicios_terceros', titulo: 'Servicios Terceros / Alquileres', badge: 'badge-orange', formJson: formServicioTercero, setFormJson: setFormServicioTercero })}
      {renderBloqueJson({ campo: 'logistica', titulo: 'Logística y Viáticos', badge: 'badge-gray', formJson: formLogistica, setFormJson: setFormLogistica })}
    </>
  );

  const renderPasoActivos = () => (
    <>
      {bloqueada && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: 'var(--orange)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 16, height: 16, flex: '0 0 16px', display: 'inline-flex' }}>{I.lock}</span>
          <span>Esta Hoja de Costeo está aprobada. Las líneas de activos solo se muestran en modo lectura.</span>
        </div>
      )}
      <section className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Nueva línea</div>
        <div className="text-muted" style={{ fontSize: 13, marginBottom: 18 }}>Usa el costo/hora como referencia o registra una depreciación directa cuando el activo no tenga base de cálculo.</div>
        <form onSubmit={agregarLineaActivo}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <div className="input-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label>Activo</label>
              <select className="select" disabled={bloqueada || cargando} value={formActivo.activo_id} onChange={e => seleccionarActivo(e.target.value)}>
                <option value="">Seleccionar activo...</option>
                {activos.map(item => <option key={item.activo_id} value={item.activo_id}>{item.nombre}{item.estado === 'en_mantenimiento' ? ' — En mantenimiento' : ''}</option>)}
              </select>
              {activoSeleccionado?.estado === 'en_mantenimiento' && <div style={{ marginTop: 7 }}><span className="badge badge-orange">En mantenimiento</span></div>}
            </div>
            {activoSeleccionado && <>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Costo/hora calculado</label>
                <div className="input" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
                  {costoHoraActivoCalculadoEnMoneda != null ? moneyUnaDecimal(costoHoraActivoCalculadoEnMoneda) : '—'}
                  {costoHoraActivoCalculadoEnMoneda != null && <span style={{ marginLeft: 8 }} className="badge badge-cyan">Referencia</span>}
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Costo/hora manual</label>
                <input type="number" className="input" min="0.1" step="0.1" disabled={bloqueada || cargando} value={formActivo.costo_hora_manual} onChange={e => setFormActivo(prev => ({ ...prev, costo_hora_manual: e.target.value, monto_depreciacion_directo: e.target.value ? '' : prev.monto_depreciacion_directo }))} onBlur={() => setFormActivo(prev => ({ ...prev, costo_hora_manual: prev.costo_hora_manual === '' ? '' : String(redondearUnaDecimal(prev.costo_hora_manual)) }))} placeholder={`${simboloMoneda} 0.0`} />
                <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>{costoHoraActivoCalculadoEnMoneda != null ? 'Puedes ajustar la sugerencia sin cambiar la configuración del activo.' : 'Ingresa un costo/hora o registra un monto de depreciación directo.'}</div>
              </div>
              {activoUsaMontoDirecto ? (
                <div className="input-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Monto de depreciación directo</label>
                  <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={formActivo.monto_depreciacion_directo} onChange={e => setFormActivo(prev => ({ ...prev, monto_depreciacion_directo: e.target.value }))} placeholder={`${simboloMoneda} 0.00`} />
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>Este activo no tiene costo/hora base. La línea se guardará como depreciación manual directa, sin horas de uso.</div>
                </div>
              ) : (
                <div className="input-group" style={{ margin: 0 }}>
                  <label>Horas de uso estimadas</label>
                  <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={formActivo.horas_uso_estimadas} onChange={e => setFormActivo(prev => ({ ...prev, horas_uso_estimadas: e.target.value }))} placeholder="0.00" />
                </div>
              )}
            </>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-primary" type="submit" disabled={bloqueada || cargando || guardando}>{I.plus} {guardando ? 'Agregando...' : 'Agregar activo'}</button>
          </div>
        </form>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <div className="cost-section-head">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}><h3>Activos agregados</h3><span className="badge badge-cyan">{lineasActivos.length}</span></div>
          <span className="num" style={{ fontWeight: 700 }}>{money(subtotalActivos)}</span>
        </div>
        {cargando ? <div className="text-muted" style={{ padding: 16 }}>Cargando activos...</div> : lineasActivos.length === 0 ? (
          <div className="text-muted" style={{ padding: '12px 0', fontSize: 13 }}>Aún no hay líneas de activos.</div>
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Activo</th><th>Estado</th><th className="num">Horas</th><th>Origen</th><th className="num">Depreciación asignada</th>{!bloqueada && <th />}</tr></thead>
            <tbody>{lineasActivos.map(linea => {
              const activo = activoPorId.get(linea.activo_id);
              return <tr key={linea.id}>
                <td>{activo?.nombre || linea.activo_id}</td>
                <td>{activo?.estado === 'en_mantenimiento' ? <span className="badge badge-orange">En mantenimiento</span> : activo?.estado ? <span className="badge badge-cyan">{activo.estado}</span> : '—'}</td>
                <td className="num">{linea.horas_uso_estimadas == null ? '—' : numero(linea.horas_uso_estimadas).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
                <td><span className={`badge ${linea.fue_manual ? 'badge-gray' : 'badge-cyan'}`}>{linea.horas_uso_estimadas == null ? 'directo' : linea.fue_manual ? 'manual' : 'calculado'}</span></td>
                <td className="num" style={{ fontWeight: 700 }}>{money(linea.depreciacion_asignada)}</td>
                {!bloqueada && <td><button className="icon-btn text-danger" type="button" disabled={eliminandoActivoId === linea.id} onClick={() => eliminarLineaActivo(linea)} title="Eliminar activo">{I.trash}</button></td>}
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </section>
    </>
  );

  const renderPasoResumen = () => {
    const hayGastoCalculado = numero(porcentajeGastoCalculado) > 0;
    return (
      <>
        {bloqueada && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: 'var(--orange)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, flex: '0 0 16px', display: 'inline-flex' }}>{I.lock}</span>
            <span>Esta Hoja de Costeo está aprobada. El resumen se muestra en modo lectura.</span>
          </div>
        )}
        <section className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div className="cost-section-head"><h3>Resumen de costos</h3><span className="badge badge-cyan">{monedaHoja}</span></div>
          <div className="table-wrap" style={{ marginTop: 14 }}><table className="tbl"><tbody>
            {[
              ['Mano de obra', subtotalManoObra],
              ['Materiales', subtotalMateriales],
              ['Servicios terceros / alquileres', subtotalServiciosTerceros],
              ['Logística y viáticos', subtotalLogistica],
              ['Depreciación de activos', subtotalActivos],
            ].map(([etiqueta, monto]) => <tr key={etiqueta}><td>{etiqueta}</td><td className="num" style={{ fontWeight: 700 }}>{money(monto)}</td></tr>)}
            <tr style={{ borderTop: '2px solid var(--border)' }}><td><strong>Costo total</strong></td><td className="num" style={{ fontWeight: 800, color: 'var(--cyan)' }}>{money(costoTotal)}</td></tr>
          </tbody></table></div>
        </section>

        <section className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div className="cost-section-head"><h3>Precio sugerido</h3><span className="text-muted" style={{ fontSize: 12 }}>Parámetros por esta Hoja de Costeo</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 16 }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label>% gasto administrativo calculado</label>
              <div className="input" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>{hayGastoCalculado ? `${(numero(porcentajeGastoCalculado) * 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })}%` : 'Sin datos, verifica o usa manual'}</div>
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>% gasto administrativo manual</label>
              <input type="number" className="input" min="0" step="0.01" disabled={bloqueada || guardandoResumen} value={porcentajeGastoManual} onChange={e => setPorcentajeGastoManual(e.target.value)} onBlur={() => guardarResumen({ silencioso: true })} placeholder="0.00" />
              <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>Si tiene valor, este porcentaje prevalece para esta hoja.</div>
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>% margen objetivo</label>
              <input type="number" className="input" min="0" step="0.01" disabled={bloqueada || guardandoResumen} value={margenObjetivo} onChange={e => setMargenObjetivo(e.target.value)} onBlur={() => guardarResumen({ silencioso: true })} placeholder="35.00" />
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13 }}>
              <div className="text-muted">Fórmula aplicada</div>
              <div style={{ marginTop: 5 }}>Costo total ÷ (1 − ({(porcentajeGastoEfectivo * 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })}% + {(porcentajeMargenEfectivo * 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })}%))</div>
            </div>
          </div>
          {divisorPrecio <= 0 && <div className="alert alert-danger" style={{ marginTop: 14 }}>La suma de gasto administrativo y margen debe ser menor a 100%.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 18 }}>
            <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}><div className="eyebrow">Precio sugerido sin IGV</div><strong className="num" style={{ display: 'block', fontSize: 22, marginTop: 6 }}>{precioSugeridoSinIgv == null ? '—' : money(precioSugeridoSinIgv)}</strong></div>
            <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}><div className="eyebrow">Precio sugerido con IGV</div><strong className="num" style={{ display: 'block', fontSize: 22, marginTop: 6, color: 'var(--cyan)' }}>{precioSugeridoTotal == null ? '—' : money(precioSugeridoTotal)}</strong></div>
          </div>
          {!bloqueada && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 20 }}>
            <button className="btn btn-secondary" type="button" disabled={guardandoResumen || aprobando} onClick={() => guardarResumen()}>Guardar parámetros</button>
            {hoja.estado === 'borrador'
              ? <button className="btn btn-primary" type="button" disabled={guardandoResumen || aprobando || divisorPrecio <= 0} onClick={enviarARevision}>Enviar a revisión</button>
              : <button className="btn btn-primary" type="button" disabled={guardandoResumen || aprobando || divisorPrecio <= 0} onClick={solicitarAprobacion}>{aprobando ? 'Aprobando...' : 'Aprobar hoja de costeo'}</button>}
          </div>}
        </section>
      </>
    );
  };

  */
  const aplicarActividad = async grupo => {
    const receta = recetas.filter(item => item.actividad_id === grupo.actividad_id);
    for (const linea of grupo.tareas) {
      const fila = receta.find(item => item.tarea_id === linea.tarea_id);
      if (fila) await actualizarTarea(linea, { cargo_id: fila.cargo_id, horas: fila.horas, activo_id: fila.activo_id || '', horas_maquina: fila.horas_maquina || 0 });
    }
  };

  const abrirBuscadorTarea = grupo => {
    setFamiliaSeleccionada(grupo.familia_trabajo_id || '');
    setActividadSeleccionada(grupo.actividad_id || '');
    setBusquedaRapida('');
    setPanelTrabajo(true);
  };

  const renderTrabajosNuevo = () => (
    <section className="hcx-card">
      <header className="hcx-cardhead"><div><h2>Trabajos</h2><div className="hcx-sub">Tareas con mano de obra, máquina y materiales.</div></div><button className="hcx-btn primary" type="button" disabled={bloqueada} onClick={() => { setPanelTrabajo(true); setCrearNivel(null); }}>{I.plus} Agregar trabajo</button></header>
      {gruposPorTarea.length === 0 ? <div className="hcx-empty">Aún no hay trabajos.</div> : gruposPorTarea.map(grupo => {
        const actividad = actividadPorId.get(grupo.actividad_id);
        const manoObra = grupo.tareas.reduce((sum, item) => sum + numero(item.subtotal_mano_obra), 0);
        const maquina = grupo.tareas.reduce((sum, item) => sum + numero(item.subtotal_maquina), 0);
        const horas = grupo.tareas.reduce((sum, item) => sum + numero(item.horas), 0);
        const horasMaquina = grupo.tareas.reduce((sum, item) => sum + numero((lineasActivos.find(asset => asset.linea_mano_obra_id === item.id) || lineasActivos.find(asset => !asset.linea_mano_obra_id && asset.tarea_id === item.tarea_id))?.horas_uso_estimadas), 0);
        return <section className="hcx-work" key={`${grupo.familia_trabajo_id}:${grupo.actividad_id}`}>
          <header className="hcx-workhead"><button className="hcx-collapse" type="button" aria-label="Contraer trabajo">⌄</button><div><div className="hcx-worktitle"><span className="hcx-workname">{familiaPorId.get(grupo.familia_trabajo_id)?.nombre || 'Sin trabajo'}</span><span className="hcx-pill">Actividad: {actividad?.nombre || 'Sin actividad'}</span></div><div className="hcx-workmeta">{grupo.tareas.length} tareas · {horas.toLocaleString('es-PE', { maximumFractionDigits: 1 })} h-hombre · {horasMaquina.toLocaleString('es-PE', { maximumFractionDigits: 1 })} h-máquina</div></div><span className="hcx-money">{money(manoObra + maquina)}<small>mano de obra + máquina</small></span><button className="hcx-btn" type="button" disabled={bloqueada} onClick={() => aplicarActividad(grupo)}>Aplicar actividad</button><button className="hcx-btn" type="button" disabled={bloqueada} onClick={() => abrirBuscadorTarea(grupo)}>{I.plus} Agregar tareas</button></header>
          <div className="hcx-grid hcx-tablehead"><div>Tarea</div><div className="hcx-category">MANO DE OBRA</div><div className="hcx-category machine">MÁQUINA</div><div>Detalle</div></div>
          <div className="hcx-grid hcx-tablehead hcx-table-subhead"><div></div><div>Cargo</div><div>Horas-hombre</div><div>Costo</div><div>Activo propio</div><div>Horas-máq.</div><div>Costo</div><div></div></div>
          {grupo.tareas.map(linea => {
            const activoLinea = lineasActivos.find(item => item.linea_mano_obra_id === linea.id) || lineasActivos.find(item => !item.linea_mano_obra_id && item.tarea_id === linea.tarea_id);
            const receta = recetas.find(item => item.actividad_id === grupo.actividad_id && item.tarea_id === linea.tarea_id);
            const difiere = receta && (receta.cargo_id !== linea.cargo_id || numero(receta.horas) !== numero(linea.horas) || (receta.activo_id || '') !== (activoLinea?.activo_id || '') || numero(receta.horas_maquina) !== numero(activoLinea?.horas_uso_estimadas));
            const guardarHoras = event => actualizarTarea(linea, { horas: event.target.value });
            const guardarHorasMaquina = event => actualizarTarea(linea, { horas_maquina: event.target.value });
            return <React.Fragment key={linea.id}><div className={`hcx-grid hcx-task ${difiere ? 'is-recipe-diff' : ''}`}>
              <div className="hcx-taskname"><b>{nombreTareaLinea(linea)}</b><small>{tareaPorId.get(linea.tarea_id)?.codigo || linea.tarea_id || 'Sin código'}</small></div>
              <select className="hcx-cell" disabled={bloqueada || guardandoTareaId === linea.id} value={linea.cargo_id || ''} onChange={event => actualizarTarea(linea, { cargo_id: event.target.value })}><option value="">Sin cargo</option>{cargos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
              <input className="hcx-cell num" disabled={bloqueada || guardandoTareaId === linea.id} type="number" min="0" step="0.1" defaultValue={linea.horas ?? ''} onBlur={guardarHoras} />
              <div className="hcx-cost"><b>{money(linea.subtotal_mano_obra)}</b><small>{linea.pendiente_valoracion ? 'Sin tarifa: revisa el cargo' : `${money(linea.costo_hora_snapshot)} / h`}</small></div>
              <select className="hcx-cell" disabled={bloqueada || guardandoTareaId === linea.id} value={activoLinea?.activo_id || ''} onChange={event => actualizarTarea(linea, { activo_id: event.target.value })}><option value="">Sin activo</option>{activos.map(item => <option key={item.activo_id} value={item.activo_id}>{item.nombre}</option>)}</select>
              <input className="hcx-cell num" disabled={bloqueada || guardandoTareaId === linea.id} type="number" min="0" step="0.1" defaultValue={activoLinea?.horas_uso_estimadas ?? 0} onBlur={guardarHorasMaquina} />
              <div className={`hcx-cost ${!activoLinea ? 'muted' : ''}`}><b>{activoLinea ? money(linea.subtotal_maquina) : '—'}</b>{activoLinea && <small>{money(activoLinea.costo_hora_equipo)} / h</small>}</div>
              <div className="hcx-detail-button"><button className={`hcx-btn detail ${detallesTarea[linea.id] ? 'is-on' : ''}`} type="button" onClick={() => setDetallesTarea(prev => ({ ...prev, [linea.id]: prev[linea.id] ? '' : prev[linea.id] }))}>Detalle</button></div>
              {difiere && <span className="hcx-recipe-hint">Difiere de la receta</span>}
            </div>{detallesTarea[linea.id] && <div className="hcx-detail"><small>Hallazgo del diagnóstico · {nombreTareaLinea(linea)}</small>{detallesTarea[linea.id]}</div>}</React.Fragment>;
          })}
          <div className="hcx-quick"><input value={busquedaRapida} onChange={event => setBusquedaRapida(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); abrirBuscadorTarea(grupo); } }} placeholder="Escribe para buscar y añadir una tarea (nombre o código)…" /><span>Enter añade la primera coincidencia</span></div>
        </section>;
      })}
    </section>
  );

  const renderMaterialesNuevo = () => {
    const grupos = agruparMaterialesPorTrabajo({ lineas, materiales: lineasMateriales, familias, actividades, tareas });
    const gruposTrabajo = new Map();
    grupos.forEach(grupo => { const key = `${grupo.familia_trabajo_id}:${grupo.actividad_id}`; if (!gruposTrabajo.has(key)) gruposTrabajo.set(key, []); gruposTrabajo.get(key).push(grupo); });
    return <section className="hcx-card"><header className="hcx-cardhead"><div><h2>Materiales</h2><div className="hcx-sub">Cada material queda dentro de su Trabajo › Actividad › Tarea.</div></div><button className="hcx-btn primary" type="button" disabled={bloqueada} onClick={() => setPanelMaterial(true)}>{I.plus} Agregar material</button></header>{grupos.length === 0 ? <div className="hcx-empty">Aún no hay materiales.</div> : [...gruposTrabajo.entries()].map(([key, tareasTrabajo]) => <section className="hcx-work" key={key}><header className="hcx-workhead"><div><div className="hcx-worktitle"><span className="hcx-workname">{familiaPorId.get(tareasTrabajo[0].familia_trabajo_id)?.nombre || 'Sin trabajo'}</span><span className="hcx-pill">Actividad: {actividadPorId.get(tareasTrabajo[0].actividad_id)?.nombre || 'Sin actividad'}</span></div><div className="hcx-workmeta">{tareasTrabajo.reduce((sum, item) => sum + item.lineas.length, 0)} materiales en {tareasTrabajo.length} tareas</div></div><span className="hcx-money">{money(tareasTrabajo.reduce((sum, item) => sum + item.subtotal, 0))}<small>materiales</small></span></header>{tareasTrabajo.map(grupo => <div className="hcx-material-task" key={grupo.key}><div className="hcx-material-route"><span>{grupo.ruta.join(' › ') || 'Costo general'}</span><span className="hcx-pill muted">{tareaPorId.get(grupo.tarea_id)?.codigo || grupo.tarea_id || 'Sin código'}</span><b>{money(grupo.subtotal)}</b></div><div className="hcx-material-head"><span>Material</span><span>Cantidad</span><span>Unidad</span><span>Costo unit.</span><span>Subtotal</span><span>Origen</span><span></span></div>{grupo.lineas.map(linea => { const material = materialPorId.get(linea.material_id); const origen = linea.diagnostico_material_id ? 'Diagnóstico' : linea.fue_manual ? 'Agregado' : 'Receta'; return <div className="hcx-material-line" key={linea.id}><div><b>{material?.descripcion || linea.descripcion || linea.material_id}</b><small>{material?.codigo || linea.material_id}</small></div><input className="hcx-cell num" type="number" min="0.01" step="0.01" disabled={bloqueada} defaultValue={linea.cantidad} onBlur={event => actualizarCantidadMaterial(linea, event.target.value)} /><span>{material?.unidad || linea.unidad || 'und'}</span><span className="num">{money(linea.costo_unitario_snapshot)}</span><span className="num"><b>{money(linea.subtotal)}</b></span><span className="hcx-source">{origen}</span>{!bloqueada && <button className="hcx-icon" type="button" onClick={() => eliminarLineaMaterial(linea)} aria-label="Eliminar material">{I.trash}</button>}</div>; })}</div>)}</section>)}</section>;
  };

  const renderResumenNuevo = () => {
    const porTrabajo = new Map();
    gruposPorTarea.forEach(grupo => { const actual = porTrabajo.get(grupo.familia_trabajo_id) || { mo: 0, maquina: 0, materiales: 0, actividad: grupo.actividad_id }; actual.mo += grupo.tareas.reduce((sum, item) => sum + numero(item.subtotal_mano_obra), 0); actual.maquina += grupo.tareas.reduce((sum, item) => sum + numero(item.subtotal_maquina), 0); actual.materiales += grupo.tareas.reduce((sum, item) => sum + numero(item.subtotal_materiales), 0); porTrabajo.set(grupo.familia_trabajo_id, actual); });
    const precio = calcularPrecio({ costoTotal, gastoPct: porcentajeGastoEfectivo, margenPct: porcentajeMargenEfectivo });
    return <div className="hcx-summary-grid"><section className="hcx-card"><header className="hcx-cardhead"><div><h2>Costo por trabajo</h2><div className="hcx-sub">Mano de obra, máquina y materiales de cada trabajo</div></div></header><table className="hcx-table"><thead><tr><th>Trabajo</th><th className="num">Mano de obra</th><th className="num">Máquina</th><th className="num">Materiales</th><th className="num">Total</th></tr></thead><tbody>{[...porTrabajo.entries()].map(([familiaId, item]) => <tr key={familiaId}><td><b>{familiaPorId.get(familiaId)?.nombre || 'Sin trabajo'}</b><small className="hcx-block">{actividadPorId.get(item.actividad)?.nombre || 'Sin actividad'}</small></td><td className="num">{money(item.mo)}</td><td className="num">{money(item.maquina)}</td><td className="num">{money(item.materiales)}</td><td className="num"><b>{money(item.mo + item.maquina + item.materiales)}</b></td></tr>)}<tr><td><b>Servicios y logística</b></td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num"><b>{money(subtotalServiciosTerceros + subtotalLogistica)}</b></td></tr><tr className="hcx-totalrow"><td><b>Costo directo</b></td><td className="num"><b>{money(subtotalManoObra)}</b></td><td className="num"><b>{money(subtotalActivos)}</b></td><td className="num"><b>{money(subtotalMateriales)}</b></td><td className="num"><b>{money(costoTotal)}</b></td></tr></tbody></table></section><div className="hcx-stack"><section className="hcx-price"><header className="hcx-cardhead"><div><h2>Precio sugerido</h2><div className="hcx-sub">Precio sugerido con IGV</div></div></header><strong>{precio.conIgv == null ? '—' : money(precio.conIgv)}</strong><div className="hcx-price-row"><span>Costo directo</span><b>{money(costoTotal)}</b></div><div className="hcx-price-row"><span>Gasto adm. ({(porcentajeGastoEfectivo * 100).toLocaleString('es-PE')} %)</span><b>{precio.sinIgv == null ? '—' : money(precio.sinIgv * porcentajeGastoEfectivo)}</b></div><div className="hcx-price-row"><span>Margen ({(porcentajeMargenEfectivo * 100).toLocaleString('es-PE')} %)</span><b>{precio.sinIgv == null ? '—' : money(Math.round(precio.sinIgv * 100) / 100 - Math.round(costoTotal * 100) / 100 - Math.round(precio.sinIgv * porcentajeGastoEfectivo * 100) / 100)}</b></div><div className="hcx-price-row"><span>Precio sin IGV</span><b>{precio.sinIgv == null ? '—' : money(precio.sinIgv)}</b></div></section><section className="hcx-card hcx-path"><div className="hcx-eyebrow">Camino a la cotización</div>{[['Borrador', true], ['En revisión', hoja.estado !== 'borrador'], ['Aprobada', bloqueada], ['Cotización especial', pendienteCotizar === false && !!cotizacionesVinculadas.length]].map(([label, listo]) => <div className="hcx-path-row" key={label}><span>{label}</span><span className={`hcx-source ${listo ? '' : 'manual'}`}>{listo ? 'Listo' : 'Pendiente'}</span></div>)}</section></div><div className="hcx-info">{bloqueada ? 'La hoja está aprobada y bloqueada. La cotización especial se genera con este precio y queda enlazada a la hoja.' : 'Guarda los parámetros para actualizar el precio sugerido.'}</div></div>;
  };

  const renderPasoNueva = () => {
    if (paso === 'materiales') return renderMaterialesNuevo();
    if (paso === 'terceros') return <div className="hcx-stack">{renderBloqueJson({ campo: 'servicios_terceros', titulo: 'Servicios de terceros', badge: 'hcx-pill', formJson: formServicioTercero, setFormJson: setFormServicioTercero })}{renderBloqueJson({ campo: 'logistica', titulo: 'Logística', badge: 'hcx-pill', formJson: formLogistica, setFormJson: setFormLogistica })}</div>;
    if (paso === 'resumen') return renderResumenNuevo();
    return renderTrabajosNuevo();
  };
  /*
    if (paso === 'materiales') return <section className="hcx-card"><header className="hcx-cardhead"><div><h2>Materiales</h2><div className="hcx-sub">Materiales agrupados por Trabajo › Actividad › Tarea.</div></div><button className="hcx-btn primary" type="button" disabled={bloqueada} onClick={() => setPanelMaterial(true)}>{I.plus} Agregar material</button></header>{lineasMateriales.length === 0 ? <div className="hcx-empty">Aún no hay materiales.</div> : lineasMateriales.map(linea => { const ref = lineaPorId.get(linea.linea_mano_obra_id) || linea; const material = materialPorId.get(linea.material_id); const ruta = rutaMaterial(linea, ref, familias, actividades, tareas); return <div className="hcx-material-line" key={linea.id}><div><b>{material?.descripcion || linea.material_id}</b><small className="hcx-material-route">{ruta.length ? ruta.join(' › ') : 'Costo general'}</small></div><span className="num">{linea.cantidad}</span><span>{material?.unidad || linea.unidad || 'und'}</span><span className="num">{money(linea.costo_unitario_snapshot)}</span><span className="num"><b>{money(linea.subtotal)}</b></span><span className={`hcx-source ${linea.fue_manual ? 'manual' : ''}`}>{linea.fue_manual ? 'Manual' : 'Calculado'}</span>{!bloqueada && <button className="hcx-icon" type="button" onClick={() => eliminarLineaMaterial(linea)} aria-label="Eliminar material">{I.trash}</button>}</div>; })}</section>;
    if (paso === 'terceros') return <div className="hcx-stack">{renderBloqueJson({ campo: 'servicios_terceros', titulo: 'Servicios de terceros / alquileres', badge: 'hcx-pill', formJson: formServicioTercero, setFormJson: setFormServicioTercero })}{renderBloqueJson({ campo: 'logistica', titulo: 'Logística y viáticos', badge: 'hcx-pill', formJson: formLogistica, setFormJson: setFormLogistica })}</div>;
    if (paso === 'resumen') return renderPasoResumen();
    return <section className="hcx-card"><header className="hcx-cardhead"><div><h2>Trabajos</h2><div className="hcx-sub">Tareas con mano de obra, máquina y materiales.</div></div><button className="hcx-btn primary" type="button" disabled={bloqueada} onClick={() => { setPanelTrabajo(true); setCrearNivel(null); }}>{I.plus} Agregar trabajo</button></header>{gruposPorTarea.length === 0 ? <div className="hcx-empty">Aún no hay trabajos.</div> : gruposPorTarea.map(grupo => <section className="hcx-work" key={`${grupo.familia_trabajo_id}:${grupo.actividad_id}`}><header className="hcx-workhead"><span className="hcx-pill">{familiaPorId.get(grupo.familia_trabajo_id)?.nombre || 'Sin trabajo'}</span><b>{actividadPorId.get(grupo.actividad_id)?.nombre || 'Sin actividad'}</b><span className="hcx-money">{money(grupo.subtotal)}<small>{grupo.tareas.length} tarea(s)</small></span></header>{grupo.tareas.map(linea => <div className="hcx-task hcx-task-simple" key={linea.id}><div className="hcx-taskname"><b>{nombreTareaLinea(linea)}</b><small>{cargoPorId.get(linea.cargo_id)?.nombre || 'Sin cargo'} · {numero(linea.horas)} h</small></div><span className="hcx-task-cost">MO {money(linea.subtotal)} · materiales {money(linea.subtotal_materiales)}</span><b className="hcx-money">{money(linea.subtotal + numero(linea.subtotal_maquina) + numero(linea.subtotal_materiales))}</b>{!bloqueada && <button className="hcx-icon" type="button" onClick={() => eliminarLinea(linea)} aria-label="Eliminar tarea">{I.trash}</button>}{detallesTarea[linea.id] && <div className="hcx-detail"><small>Detalle técnico</small>{detallesTarea[linea.id]}</div>}</div>)}</section>)}</section>;
  };

  */
  // La hoja puede no estar aún en la lista (p. ej. recién creada desde el diagnóstico y abierta por enlace directo).
  if (!hojaId || !hoja) {
    return (
      <div className="page-content">
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{hojaId ? 'Cargando Hoja de Costeo…' : 'Hoja de Costeo no encontrada'}</div>
          <button className="btn btn-secondary" onClick={() => navigate('hoja_costeo')}>Volver a Hojas de Costeo</button>
        </div>
      </div>
    );
  }
  const pasoActual = STEPS.findIndex(step => step.id === paso);
  const pasoAnterior = () => setPaso(STEPS[Math.max(0, pasoActual - 1)].id);
  const siguientePaso = () => setPaso(STEPS[Math.min(STEPS.length - 1, pasoActual + 1)].id);
  const montoPaso = step => step === 'mano_obra' ? subtotalManoObra + subtotalActivos : step === 'materiales' ? subtotalMateriales : step === 'terceros' ? subtotalServiciosTerceros + subtotalLogistica : precioSugeridoTotal;
  const estadoPie = bloqueada ? { clase: 'approved', texto: 'Hoja aprobada, sin cambios' } : { clase: hoja.estado === 'en_revision' ? 'review' : 'draft', texto: hoja.estado === 'en_revision' ? 'Pendiente de aprobación' : 'Borrador · las tareas se guardan al editarlas' };
  return (
    <div className="hcx-wizard">
      <div className="hcx-shell">
        <header className="hcx-head"><div><button className="hcx-back" type="button" onClick={() => navigate('hoja_costeo', { detail: hoja.id })}>← Volver a la hoja</button><h1>Costeo · {hoja.numero}</h1><div className="hcx-sub">Hoja de costeo · {monedaHoja} · {(cuentas || []).find(item => item.id === hoja.cuenta_id)?.nombre_comercial || (cuentas || []).find(item => item.id === hoja.cuenta_id)?.razon_social || (hoja.cuenta_id ? 'Cuenta sin nombre' : 'Sin cuenta')}</div></div><div className="hcx-badges"><span className={`hcx-status ${estadoPie.clase}`}><i />{hoja.estado || 'borrador'}</span><span className="hcx-pill">Cotización especial</span></div></header>
        <div className="hcx-summary"><div className="hcx-chip"><b>{gruposPorTarea.length}</b><span>trabajos</span></div><div className="hcx-chip"><b>{lineas.length}</b><span>tareas</span></div><div className="hcx-chip"><b>{lineas.reduce((sum, item) => sum + numero(item.horas), 0).toLocaleString('es-PE', { maximumFractionDigits: 1 })} h</b><span>horas-hombre</span></div><div className="hcx-chip"><b>{lineasActivos.reduce((sum, item) => sum + numero(item.horas_uso_estimadas), 0).toLocaleString('es-PE', { maximumFractionDigits: 1 })} h</b><span>horas-máquina</span></div><span className="hcx-spacer" />{paso === 'mano_obra' && <button className="hcx-btn primary" type="button" disabled={bloqueada} onClick={() => setPanelTrabajo(true)}>{I.plus} Agregar trabajo</button>}</div>
        <nav className="hcx-stepnav" aria-label="Pasos del wizard">{STEPS.map((item, index) => <button key={item.id} className={`hcx-step ${paso === item.id ? 'is-current' : index < pasoActual ? 'is-done' : ''}`} type="button" onClick={() => setPaso(item.id)}><span>{index < pasoActual ? '✓' : index + 1}</span><small>{item.label}</small><em>{montoPaso(item.id) == null ? '—' : money(montoPaso(item.id))}</em></button>)}</nav>
        <div className="hcx-body">{renderPasoNueva()}</div>
        {pendienteCotizar && <div className="hcx-info">Esta hoja está aprobada, pero aún no tiene una cotización vinculada.</div>}
        <div style={{ display: 'none' }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Resumen económico</div>
            {[
              ['Mano de obra', subtotalManoObra],
              ['Materiales', subtotalMateriales],
              ['Terceros / Logística', subtotalServiciosTerceros + subtotalLogistica],
              ['Activos', subtotalActivos],
            ].map(([label, valor]) => (
              <div key={label} className="row" style={{ justifyContent: 'space-between', marginBottom: 11, fontSize: 13 }}>
                <span className="text-muted">{label}</span><span className="num">{money(valor)}</span>
              </div>
            ))}
            <div style={{ borderTop: '2px solid var(--border)', marginTop: 16, paddingTop: 14 }} className="row">
              <strong>Costo total</strong><strong className="num" style={{ fontSize: 17, color: 'var(--cyan)' }}>{money(subtotalManoObra + subtotalMateriales + subtotalServiciosTerceros + subtotalLogistica + subtotalActivos)}</strong>
            </div>
          </div>
        </div>
      <footer className="hcx-foot"><span className={`hcx-status ${estadoPie.clase}`}><i />{estadoPie.texto}</span><button className="hcx-btn" type="button" disabled={pasoActual === 0} onClick={pasoAnterior}>‹ {pasoActual ? STEPS[pasoActual - 1].label : 'Anterior'}</button><div className="hcx-footprice"><span>{paso === 'resumen' ? 'Precio con IGV' : 'Costo directo'}</span><b>{money(paso === 'resumen' ? precioSugeridoTotal : costoTotal)}</b></div>{paso !== STEPS[STEPS.length - 1].id ? <button className="hcx-btn primary" type="button" onClick={siguientePaso}>Siguiente: {STEPS[pasoActual + 1]?.label} ›</button> : hoja.estado === 'borrador' ? <button className="hcx-btn primary" type="button" disabled={guardandoResumen} onClick={enviarARevision}>Enviar a revisión</button> : hoja.estado === 'en_revision' ? <button className="hcx-btn primary" type="button" disabled={aprobando} onClick={solicitarAprobacion}>{aprobando ? 'Aprobando…' : 'Aprobar hoja'}</button> : <button className="hcx-btn primary" type="button" onClick={() => setSelectorTipoCotizacion(true)}>Generar cotización especial</button>}</footer>
      {renderPanelTrabajo()}
      {renderPanelMaterial()}
      {selectorTipoCotizacion && <SelectorTipoCotizacion
        empresaId={empresa?.id}
        lineaNegocioInicial={hoja.linea_negocio || ''}
        forzarSelector
        onEstandar={generarCotizacionEstandar}
        onEspecial={generarCotizacionEspecial}
        onCancel={() => setSelectorTipoCotizacion(false)}
        onError={mensaje => addToast(mensaje, 'error')}
      />}
    </div>
    </div>
  );
}
