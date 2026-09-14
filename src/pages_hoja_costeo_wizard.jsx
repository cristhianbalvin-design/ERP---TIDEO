import React, { useEffect, useMemo, useState } from 'react';
import { I, moneyD } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { actualizarHojaCosteoSvc } from './services/crmService.js';

const STEPS = [
  { id: 'mano_obra', label: 'Mano de obra' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'terceros', label: 'Terceros / Logística' },
  { id: 'activos', label: 'Activos' },
  { id: 'resumen', label: 'Resumen' },
];

const numero = value => Number(value || 0);

export default function HojaCosteoWizard() {
  const { activeParams, hojasCosteo, setHojasCosteo, empresa, navigate, addToast, aprobarHojaCosteo } = useApp();
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
  const [eliminandoMaterialId, setEliminandoMaterialId] = useState(null);
  const [eliminandoActivoId, setEliminandoActivoId] = useState(null);
  const [guardandoBloqueJson, setGuardandoBloqueJson] = useState('');
  const [trabajoNuevo, setTrabajoNuevo] = useState('');
  const [creandoTrabajo, setCreandoTrabajo] = useState(false);
  const [form, setForm] = useState({ familia_trabajo_id: '', actividad_id: '', cargo_id: '', horas: '', costo_hora_manual: '' });
  const [formMaterial, setFormMaterial] = useState({ busqueda: '', grupo_id: '', familia_id: '', subfamilia_id: '', material_id: '', cantidad: '', costo_unitario_manual: '' });
  const [formActivo, setFormActivo] = useState({ activo_id: '', horas_uso_estimadas: '', costo_hora_manual: '', monto_depreciacion_directo: '' });
  const [formServicioTercero, setFormServicioTercero] = useState({ descripcion: '', cantidad: '', unidad: '', costo_unitario: '' });
  const [formLogistica, setFormLogistica] = useState({ descripcion: '', cantidad: '', unidad: '', costo_unitario: '' });
  const [porcentajeGastoCalculado, setPorcentajeGastoCalculado] = useState(null);
  const [porcentajeGastoManual, setPorcentajeGastoManual] = useState('');
  const [margenObjetivo, setMargenObjetivo] = useState('35');
  const [guardandoResumen, setGuardandoResumen] = useState(false);
  const [aprobacionPendiente, setAprobacionPendiente] = useState(false);
  const [aprobando, setAprobando] = useState(false);

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
  const tarifaPlanilla = tarifaPorCargo.get(form.cargo_id) || null;
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
  const materialesPorBusqueda = useMemo(() => {
    const termino = formMaterial.busqueda.trim().toLocaleLowerCase('es-PE');
    if (!termino) return [];
    return materiales.filter(item => `${item.codigo || ''} ${item.descripcion || ''}`.toLocaleLowerCase('es-PE').includes(termino)).slice(0, 100);
  }, [materiales, formMaterial.busqueda]);
  const materialesPorJerarquia = useMemo(() => materiales.filter(item => (
    (!formMaterial.grupo_id || item.grupo_id === formMaterial.grupo_id)
    && (!formMaterial.familia_id || item.familia_id === formMaterial.familia_id)
    && (!formMaterial.subfamilia_id || item.subfamilia_id === formMaterial.subfamilia_id)
  )).slice(0, 200), [materiales, formMaterial.grupo_id, formMaterial.familia_id, formMaterial.subfamilia_id]);
  const materialSeleccionado = materialPorId.get(formMaterial.material_id) || null;
  const activoSeleccionado = activoPorId.get(formActivo.activo_id) || null;
  const referenciaMaterialSeleccionado = referenciaMaterialPorId.get(formMaterial.material_id) || null;
  const convertirUsdAMonedaHoja = value => {
    if (value == null) return null;
    const montoUsd = numero(value);
    if (monedaHoja === 'USD') return montoUsd;
    return numero(tipoCambioPenUsd) > 0 ? montoUsd / numero(tipoCambioPenUsd) : null;
  };
  const money = value => moneyD(numero(value), simboloMoneda);
  const tarifaPlanillaEnMoneda = convertirUsdAMonedaHoja(tarifaPlanilla);
  const costoMaterialCalculadoEnMoneda = convertirUsdAMonedaHoja(materialSeleccionado?.costo_usd_calculado);
  const costoHoraActivoCalculadoEnMoneda = convertirUsdAMonedaHoja(activoSeleccionado?.costo_hora_activo_usd);
  const activoUsaMontoDirecto = Boolean(activoSeleccionado && costoHoraActivoCalculadoEnMoneda == null && numero(formActivo.costo_hora_manual) <= 0);

  const cargarDatos = async () => {
    if (!hoja?.id || !empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const sb = await getSupabaseClient();
      const [familiasResult, actividadesResult, cargosResult, tarifasResult, configuracionesResult, lineasResult, materialesResult, gruposResult, familiasMaterialesResult, subfamiliasResult, lineasMaterialesResult, referenciasResult, activosResult, lineasActivosResult, hojaJsonResult, gastoResult, tipoCambioResult] = await Promise.all([
        sb.from('familia_trabajo').select('id, nombre, activo').eq('empresa_id', empresa.id).eq('activo', true).order('nombre'),
        sb.from('tipos_servicio_interno').select('id, codigo, nombre, estado').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
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
        monedaHoja === 'PEN'
          ? sb.rpc('obtener_tipo_cambio_vigente', { p_moneda_base: 'PEN' })
          : Promise.resolve({ data: 1, error: null }),
      ]);
      const error = [familiasResult, actividadesResult, cargosResult, tarifasResult, configuracionesResult, lineasResult, materialesResult, gruposResult, familiasMaterialesResult, subfamiliasResult, lineasMaterialesResult, referenciasResult, activosResult, lineasActivosResult, hojaJsonResult, gastoResult, tipoCambioResult].find(result => result.error)?.error;
      if (error) throw error;
      setFamilias(familiasResult.data || []);
      setActividades(actividadesResult.data || []);
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
    } catch (error) {
      console.error('[HojaCosteoWizard] carga', error);
      addToast(`No se pudo cargar el wizard: ${error.message || error}`, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarDatos(); }, [hoja?.id, hoja?.moneda, empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const eliminarLinea = async linea => {
    if (bloqueada || eliminandoId) return;
    setEliminandoId(linea.id);
    try {
      const sb = await getSupabaseClient();
      const { error } = await sb.from('hoja_costeo_lineas_mano_obra').delete().eq('id', linea.id);
      if (error) throw error;
      await sincronizarTotales({ manoObra: Math.max(0, subtotalManoObra - numero(linea.subtotal)) });
      setLineas(prev => prev.filter(item => item.id !== linea.id));
      addToast('Línea eliminada.', 'success');
    } catch (error) {
      // La UI conserva el detalle que devuelve RLS en vez de ocultar una eliminación no persistida.
      addToast(`No se pudo eliminar la línea: ${error.message || error}`, 'error');
    } finally {
      setEliminandoId(null);
    }
  };

  const seleccionarMaterial = materialId => {
    const material = materialPorId.get(materialId);
    setFormMaterial(prev => ({
      ...prev,
      material_id: materialId,
      costo_unitario_manual: material?.costo_usd_calculado != null ? String(convertirUsdAMonedaHoja(material.costo_usd_calculado) ?? '') : '',
    }));
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

  const seleccionarActivo = activoId => {
    const activo = activoPorId.get(activoId);
    const sugerido = activo?.costo_hora_activo_usd != null
      ? convertirUsdAMonedaHoja(activo.costo_hora_activo_usd)
      : null;
    setFormActivo({
      activo_id: activoId,
      horas_uso_estimadas: '',
      costo_hora_manual: sugerido == null ? '' : String(sugerido),
      monto_depreciacion_directo: '',
    });
  };

  const agregarLineaActivo = async event => {
    event.preventDefault();
    if (bloqueada || guardando) return;
    if (!activoSeleccionado) {
      addToast('Selecciona un activo antes de agregar la línea.', 'error');
      return;
    }

    const costoCalculado = costoHoraActivoCalculadoEnMoneda;
    const costoManual = numero(formActivo.costo_hora_manual);
    const costoHora = costoManual > 0 ? costoManual : costoCalculado;
    const usaMontoDirecto = costoHora == null || numero(costoHora) <= 0;
    const horas = numero(formActivo.horas_uso_estimadas);
    const montoDirecto = numero(formActivo.monto_depreciacion_directo);

    if (usaMontoDirecto && montoDirecto <= 0) {
      addToast('Ingresa un monto de depreciación directo mayor a cero.', 'error');
      return;
    }
    if (!usaMontoDirecto && horas <= 0) {
      addToast('Ingresa horas de uso estimadas mayores a cero.', 'error');
      return;
    }

    const fueManual = usaMontoDirecto
      || costoCalculado == null
      || (costoManual > 0 && Math.abs(costoManual - numero(costoCalculado)) > 0.000001);
    const depreciacionAsignada = usaMontoDirecto ? montoDirecto : numero(costoHora) * horas;

    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      const payload = {
        hoja_costeo_id: hoja.id,
        activo_id: activoSeleccionado.activo_id,
        horas_uso_estimadas: usaMontoDirecto ? null : horas,
        depreciacion_asignada: depreciacionAsignada,
        fue_manual: fueManual,
        orden: lineasActivos.length,
      };
      const { data, error } = await sb.from('hoja_costeo_lineas_activos').insert(payload).select().single();
      if (error) throw error;
      await sincronizarTotales({ activos: subtotalActivos + numero(data.depreciacion_asignada) });
      setLineasActivos(prev => [...prev, data]);
      setFormActivo({ activo_id: '', horas_uso_estimadas: '', costo_hora_manual: '', monto_depreciacion_directo: '' });
      addToast(usaMontoDirecto ? 'Activo agregado con depreciación directa.' : `Activo agregado con costo/hora ${fueManual ? 'manual' : 'calculado'}.`, 'success');
    } catch (error) {
      addToast(`No se pudo agregar el activo: ${error.message || error}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarLineaActivo = async linea => {
    if (bloqueada || eliminandoActivoId) return;
    setEliminandoActivoId(linea.id);
    try {
      const sb = await getSupabaseClient();
      const { error } = await sb.from('hoja_costeo_lineas_activos').delete().eq('id', linea.id);
      if (error) throw error;
      await sincronizarTotales({ activos: Math.max(0, subtotalActivos - numero(linea.depreciacion_asignada)) });
      setLineasActivos(prev => prev.filter(item => item.id !== linea.id));
      addToast('Línea de activo eliminada.', 'success');
    } catch (error) {
      addToast(`No se pudo eliminar el activo: ${error.message || error}`, 'error');
    } finally {
      setEliminandoActivoId(null);
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
    const siguientes = [...lineasActuales, { id: Date.now(), descripcion, cantidad, unidad, costo_unitario: costoUnitario }];
    if (await guardarBloqueJson(campo, siguientes)) {
      setter(siguientes);
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
    if (!aprobacionPendiente || !hoja?.id || bloqueada || aprobando) return;
    const aprobar = async () => {
      setAprobacionPendiente(false);
      setAprobando(true);
      try {
        await aprobarHojaCosteo(hoja.id);
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
              <input className="input" disabled={bloqueada || cargando} value={formMaterial.busqueda} onChange={e => setFormMaterial(prev => ({ ...prev, busqueda: e.target.value, material_id: '', costo_unitario_manual: '' }))} placeholder="Escribe código o descripción..." />
            </div>
            {formMaterial.busqueda.trim() && <div className="input-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label>Resultados de búsqueda ({materialesPorBusqueda.length})</label>
              <select className="select" disabled={bloqueada || cargando || materialesPorBusqueda.length === 0} value={formMaterial.material_id} onChange={e => seleccionarMaterial(e.target.value)}>
                <option value="">{materialesPorBusqueda.length ? 'Seleccionar material...' : 'No se encontraron materiales'}</option>
                {materialesPorBusqueda.map(item => <option key={item.material_id} value={item.material_id}>{item.codigo ? `${item.codigo} — ` : ''}{item.descripcion}</option>)}
              </select>
            </div>}
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

  const renderBloqueJson = ({ campo, titulo, badge, formJson, setFormJson }) => {
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
            <div className="input-group" style={{ margin: 0 }}><label>Unidad</label><input className="input" disabled={bloqueada || guardandoEsteBloque} value={formJson.unidad} onChange={e => setFormJson(prev => ({ ...prev, unidad: e.target.value }))} placeholder="und" /></div>
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
                <td><input className="input" disabled={bloqueada || guardandoEsteBloque} value={linea.unidad || ''} onChange={e => editarLineaJson(campo, linea.id, 'unidad', e.target.value)} onBlur={() => guardarBloqueJson(campo, esServicio ? serviciosTerceros : logistica)} /></td>
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
                  {costoHoraActivoCalculadoEnMoneda != null ? money(costoHoraActivoCalculadoEnMoneda) : '—'}
                  {costoHoraActivoCalculadoEnMoneda != null && <span style={{ marginLeft: 8 }} className="badge badge-cyan">Referencia</span>}
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Costo/hora manual</label>
                <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={formActivo.costo_hora_manual} onChange={e => setFormActivo(prev => ({ ...prev, costo_hora_manual: e.target.value, monto_depreciacion_directo: e.target.value ? '' : prev.monto_depreciacion_directo }))} placeholder={`${simboloMoneda} 0.00`} />
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

  const renderPaso = () => {
    if (paso === 'materiales') return renderPasoMateriales();
    if (paso === 'terceros') return renderPasoTerceros();
    if (paso === 'activos') return renderPasoActivos();
    if (paso === 'resumen') return renderPasoResumen();

    return (
      <>
        {bloqueada && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: 'var(--orange)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, flex: '0 0 16px', display: 'inline-flex' }}>{I.lock}</span>
            <span>Esta Hoja de Costeo está aprobada. Las líneas de mano de obra solo se muestran en modo lectura.</span>
          </div>
        )}
        <section className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Nueva línea</div>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 18 }}>El costo/hora se toma de planilla cuando existe; en caso contrario se registra como manual.</div>
          <form onSubmit={agregarLinea}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Trabajo</label>
                <select className="select" disabled={bloqueada || cargando} value={form.familia_trabajo_id} onChange={e => setForm(prev => ({ ...prev, familia_trabajo_id: e.target.value }))}>
                  <option value="">Seleccionar trabajo...</option>
                  {familias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
                {!bloqueada && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input className="input" value={trabajoNuevo} onChange={e => setTrabajoNuevo(e.target.value)} placeholder="Nuevo trabajo" aria-label="Nuevo trabajo" />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!trabajoNuevo.trim() || creandoTrabajo} onClick={crearTrabajo}>{I.plus} Crear</button>
                  </div>
                )}
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Actividad</label>
                <select className="select" disabled={bloqueada || cargando} value={form.actividad_id} onChange={e => setForm(prev => ({ ...prev, actividad_id: e.target.value }))}>
                  <option value="">Seleccionar actividad...</option>
                  {actividades.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Cargo</label>
                <select className="select" disabled={bloqueada || cargando} value={form.cargo_id} onChange={e => {
                  const cargoId = e.target.value;
                  const sugeridoUsd = configuracionPorCargo.get(cargoId)?.costo_hora_manual ?? tarifaPorCargo.get(cargoId) ?? null;
                  const sugerido = convertirUsdAMonedaHoja(sugeridoUsd);
                  setForm(prev => ({ ...prev, cargo_id: cargoId, costo_hora_manual: sugerido == null ? '' : String(sugerido) }));
                }}>
                  <option value="">Seleccionar cargo...</option>
                  {cargos.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Horas</label>
                <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={form.horas} onChange={e => setForm(prev => ({ ...prev, horas: e.target.value }))} placeholder="0.00" />
              </div>
              {form.cargo_id && (
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <div className="input-group" style={{ margin: 0 }}>
                      <label>Costo/hora de planilla</label>
                      <div className="input" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
                        {tarifaPlanillaEnMoneda != null ? money(tarifaPlanillaEnMoneda) : '—'}
                        {tarifaPlanillaEnMoneda != null && <span style={{ marginLeft: 8 }} className="badge badge-cyan">Referencia</span>}
                      </div>
                    </div>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label>Costo/hora manual</label>
                    <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={form.costo_hora_manual} onChange={e => setForm(prev => ({ ...prev, costo_hora_manual: e.target.value }))} placeholder={`${simboloMoneda} 0.00`} />
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>Se usa este valor para el snapshot de la línea. Puedes ajustarlo sin cambiar la configuración del cargo.</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-primary" type="submit" disabled={bloqueada || cargando || guardando}>{I.plus} {guardando ? 'Agregando...' : 'Agregar línea'}</button>
            </div>
          </form>
        </section>

        <section className="card" style={{ padding: 20 }}>
          <div className="cost-section-head">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}><h3>Mano de obra agregada</h3><span className="badge badge-cyan">{lineas.length}</span></div>
            <span className="num" style={{ fontWeight: 700 }}>{money(subtotalManoObra)}</span>
          </div>
          {cargando ? <div className="text-muted" style={{ padding: 16 }}>Cargando líneas...</div> : lineas.length === 0 ? (
            <div className="text-muted" style={{ padding: '12px 0', fontSize: 13 }}>Aún no hay líneas de mano de obra.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Trabajo</th><th>Actividad</th><th>Cargo</th><th className="num">Horas</th><th className="num">Costo/hora</th><th>Método</th><th className="num">Subtotal</th>{!bloqueada && <th />}</tr></thead>
                <tbody>
                  {lineas.map(linea => (
                    <tr key={linea.id}>
                      <td>{familiaPorId.get(linea.familia_trabajo_id)?.nombre || linea.familia_trabajo_id}</td>
                      <td>{actividadPorId.get(linea.actividad_id)?.nombre || linea.actividad_id}</td>
                      <td>{cargoPorId.get(linea.cargo_id)?.nombre || linea.cargo_id}</td>
                      <td className="num">{numero(linea.horas).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
                      <td className="num">{money(linea.costo_hora_snapshot)}</td>
                      <td><span className={`badge ${linea.metodo_usado === 'planilla' ? 'badge-cyan' : 'badge-gray'}`}>{linea.metodo_usado}</span></td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(linea.subtotal)}</td>
                      {!bloqueada && <td><button className="icon-btn text-danger" type="button" disabled={eliminandoId === linea.id} onClick={() => eliminarLinea(linea)} title="Eliminar línea">{I.trash}</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  };

  return (
    <div className="page-content">
      <div className="page-header" style={{ borderBottom: 'none', paddingBottom: 8 }}>
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('hoja_costeo', { detail: hoja.id })} style={{ marginBottom: 10, padding: 0, color: 'var(--cyan)' }}>← Volver a la hoja</button>
          <h1 className="page-title">{hoja.numero} · Wizard de Costeo</h1>
          <div className="page-sub">Nueva experiencia de costeo en {monedaHoja} ({simboloMoneda}). El formulario original permanece disponible sin cambios.</div>
        </div>
        <span className={`badge ${bloqueada ? 'badge-green' : 'badge-gray'}`} style={{ alignSelf: 'flex-start', textTransform: 'uppercase' }}>{hoja.estado || 'borrador'}</span>
      </div>

      <nav aria-label="Pasos del wizard" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: 8, margin: '12px 0 20px', overflowX: 'auto' }}>
        {STEPS.map((item, index) => (
          <button key={item.id} className={paso === item.id ? 'btn btn-primary' : 'btn btn-secondary'} type="button" onClick={() => setPaso(item.id)} style={{ justifyContent: 'flex-start', whiteSpace: 'nowrap' }}>
            <span style={{ opacity: 0.8 }}>{index + 1}.</span> {item.label}
          </button>
        ))}
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)', gap: 20, alignItems: 'start' }}>
        <div>{renderPaso()}</div>
        <aside style={{ position: 'sticky', top: 16 }}>
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
        </aside>
      </div>
    </div>
  );
}
