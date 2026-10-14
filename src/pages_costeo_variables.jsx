import React, { useEffect, useMemo, useState } from 'react';
import { I, moneyD } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import './costeo_variables.css';

const numero = value => Number(value || 0);
const moneyUsd = value => moneyD(numero(value), 'US$');
const porcentaje = value => `${(numero(value) * 100).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 })}%`;
const normalizarBusqueda = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function DepreciacionActivos() {
  const { empresa, role, addToast } = useApp();
  const [activos, setActivos] = useState([]);
  const [valorizaciones, setValorizaciones] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [valoresManual, setValoresManual] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardandoActivoId, setGuardandoActivoId] = useState(null);
  const [error, setError] = useState('');
  const puedeCrear = Boolean(role?.permisos?.todo || role?.permisos?.crear?.includes('costeo_variables'));
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('costeo_variables'));
  const valorizacionPorActivo = useMemo(() => new Map(valorizaciones.map(item => [item.activo_id, item])), [valorizaciones]);
  const configPorActivo = useMemo(() => new Map(configuraciones.map(item => [item.activo_id, item])), [configuraciones]);
  const activosConDepreciacionManual = useMemo(() => activos.filter(item => numero(configPorActivo.get(item.id)?.depreciacion_manual) > 0).length, [activos, configPorActivo]);

  const cargar = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const sb = await getSupabaseClient();
      const [activosResult, valorizacionesResult, configResult] = await Promise.all([
        sb.from('activos').select('id, codigo, nombre, estado, horas_disponibles_mes').eq('empresa_id', empresa.id).or('estado.is.null,estado.neq.dado_baja').order('nombre'),
        sb.from('vw_depreciacion_mensual_activo').select('activo_id, depreciacion_mensual_usd_calculada, depreciacion_manual, costo_hora_activo_usd, horas_disponibles_mes').eq('empresa_id', empresa.id),
        sb.from('activo_depreciacion_config').select('id, activo_id, depreciacion_manual').eq('empresa_id', empresa.id),
      ]);
      const queryError = [activosResult, valorizacionesResult, configResult].find(result => result.error)?.error;
      if (queryError) throw queryError;
      setActivos(activosResult.data || []);
      setValorizaciones(valorizacionesResult.data || []);
      setConfiguraciones(configResult.data || []);
      setValoresManual(Object.fromEntries((configResult.data || []).map(item => [item.activo_id, item.depreciacion_manual ?? ''])));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la depreciación de activos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async activo => {
    const valorRaw = valoresManual[activo.id] ?? '';
    const depreciacionManual = valorRaw === '' ? null : Number(valorRaw);
    if (depreciacionManual !== null && (!Number.isFinite(depreciacionManual) || depreciacionManual < 0)) {
      addToast('La depreciación manual debe ser un número mayor o igual a cero.', 'error');
      return;
    }
    const existe = configPorActivo.has(activo.id);
    if ((existe && !puedeEditar) || (!existe && !puedeCrear)) {
      addToast('No tienes permiso para guardar esta variable de costeo.', 'error');
      return;
    }
    setGuardandoActivoId(activo.id);
    try {
      const sb = await getSupabaseClient();
      const { data, error: upsertError } = await sb
        .from('activo_depreciacion_config')
        .upsert({ empresa_id: empresa.id, activo_id: activo.id, depreciacion_manual: depreciacionManual, actualizado_en: new Date().toISOString() }, { onConflict: 'activo_id' })
        .select('id, activo_id, depreciacion_manual')
        .single();
      if (upsertError) throw upsertError;
      setConfiguraciones(prev => [...prev.filter(item => item.activo_id !== activo.id), data]);
      setValoresManual(prev => ({ ...prev, [activo.id]: data.depreciacion_manual ?? '' }));
      await cargar();
      addToast('Depreciación por activo guardada.', 'success');
    } catch (err) {
      addToast(`No se pudo guardar la depreciación: ${err?.message || err}`, 'error');
    } finally {
      setGuardandoActivoId(null);
    }
  };

  return <>
    <div className="dx-ui-summary" aria-label="Resumen">
      <div className="dx-ui-chip"><b>{activos.length}</b><span>activos vigentes</span></div>
      <div className="dx-ui-chip"><b>{activosConDepreciacionManual}</b><span>con depreciación manual</span></div>
    </div>
    {error && <div className="dx-costeovar-error" role="alert">{error}</div>}
    <div className="dx-ui-card">
      <div className="dx-ui-toolbar"><h2>Activos de la empresa</h2><span className="dx-ui-count">{activos.length} activos</span></div>
      <div className="dx-ui-head dx-costeovar-dep-cols" aria-hidden="true"><span>Activo</span><span className="num">Deprec. mensual calculada</span><span>Manual</span><span className="num">Costo/hora resultante</span><span className="num">Horas/mes</span><span></span></div>
      {cargando ? <div className="dx-ui-empty">Cargando activos y depreciación...</div> : activos.length === 0 ? <div className="dx-ui-empty">No hay activos vigentes registrados para esta empresa.</div> : activos.map(activo => {
        const valorizacion = valorizacionPorActivo.get(activo.id) || {};
        const manualRaw = valoresManual[activo.id] ?? '';
        const configuracionGuardada = configPorActivo.get(activo.id);
        const guardadoRaw = configuracionGuardada?.depreciacion_manual ?? '';
        const dirty = String(manualRaw) !== String(guardadoRaw);
        const existe = configPorActivo.has(activo.id);
        const puedeGuardarFila = existe ? puedeEditar : puedeCrear;
        return <div key={activo.id} className={`dx-ui-row dx-costeovar-dep-cols${dirty ? ' is-dirty' : ''}`}>
          <div className="dx-costeovar-main"><span className="dx-ui-icon is-violet" aria-hidden="true">{I.package}</span><span><b>{activo.nombre}</b><small>{activo.codigo || '—'}</small>{activo.estado === 'en_mantenimiento' && <span className="dx-costeovar-maintenance">En mantenimiento</span>}</span></div>
          <div className="dx-costeovar-cell num"><span className="dx-costeovar-lbl">Deprec. mensual calculada</span><span className="dx-costeovar-money">{valorizacion.depreciacion_mensual_usd_calculada != null ? moneyUsd(valorizacion.depreciacion_mensual_usd_calculada) : '—'}</span></div>
          <div className="dx-costeovar-cell is-wide"><span className="dx-costeovar-lbl">Manual</span><label className="dx-costeovar-field"><span>US$</span><input type="number" min="0" step="0.01" aria-label={`Depreciación manual de ${activo.nombre}`} value={manualRaw} disabled={!puedeGuardarFila || guardandoActivoId === activo.id} onChange={event => setValoresManual(prev => ({ ...prev, [activo.id]: event.target.value }))} placeholder="0.00" /></label>{dirty && <small className="dx-costeovar-dirty">Cambio sin guardar</small>}</div>
          <div className="dx-costeovar-cell num"><span className="dx-costeovar-lbl">Costo/hora resultante</span><span className="dx-costeovar-money">{valorizacion.costo_hora_activo_usd != null ? moneyUsd(valorizacion.costo_hora_activo_usd) : '—'}</span></div>
          <div className="dx-costeovar-cell num"><span className="dx-costeovar-lbl">Horas/mes</span><span className="dx-costeovar-money">{activo.horas_disponibles_mes != null ? numero(activo.horas_disponibles_mes).toLocaleString('es-PE', { maximumFractionDigits:2 }) : '—'}</span></div>
          <div className="dx-costeovar-act"><button type="button" className={`dx-btn${dirty ? ' primary' : ''}`} aria-label={`Guardar depreciación manual de ${activo.nombre}`} disabled={!dirty || !puedeGuardarFila || guardandoActivoId === activo.id} onClick={() => guardar(activo)}><span aria-hidden="true">{I.save}</span>{guardandoActivoId === activo.id ? 'Guardando...' : 'Guardar'}</button></div>
        </div>;
      })}
    </div>
  </>;
}

function GastoAdministrativo() {
  const { empresa, role, addToast } = useApp();
  const [configuracion, setConfiguracion] = useState(null);
  const [porcentajeCalculado, setPorcentajeCalculado] = useState(null);
  const [porcentajeManual, setPorcentajeManual] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const puedeCrear = Boolean(role?.permisos?.todo || role?.permisos?.crear?.includes('costeo_variables'));
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('costeo_variables'));
  const puedeGuardar = configuracion ? puedeEditar : puedeCrear;

  const cargar = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const sb = await getSupabaseClient();
      const [configResult, calculadoResult] = await Promise.all([
        sb.from('gasto_administrativo_config').select('id, porcentaje_manual').eq('empresa_id', empresa.id).maybeSingle(),
        sb.from('vw_gasto_administrativo_pct_grupo').select('porcentaje_calculado').eq('empresa_id', empresa.id).maybeSingle(),
      ]);
      if (configResult.error) throw configResult.error;
      if (calculadoResult.error) throw calculadoResult.error;
      const config = configResult.data || null;
      setConfiguracion(config);
      setPorcentajeCalculado(calculadoResult.data?.porcentaje_calculado ?? null);
      setPorcentajeManual(config?.porcentaje_manual != null ? String(numero(config.porcentaje_manual) * 100) : '');
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el gasto administrativo.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    const manualNumerico = porcentajeManual === '' ? null : Number(porcentajeManual);
    if (manualNumerico !== null && (!Number.isFinite(manualNumerico) || manualNumerico < 0)) {
      addToast('El porcentaje manual debe ser un número mayor o igual a cero.', 'error');
      return;
    }
    if (!puedeGuardar) {
      addToast('No tienes permiso para guardar esta variable de costeo.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      const { error: upsertError } = await sb
        .from('gasto_administrativo_config')
        .upsert({
          empresa_id: empresa.id,
          porcentaje_manual: manualNumerico === null ? null : manualNumerico / 100,
          actualizado_en: new Date().toISOString(),
        }, { onConflict: 'empresa_id' });
      if (upsertError) throw upsertError;
      await cargar();
      addToast('Gasto administrativo guardado.', 'success');
    } catch (err) {
      addToast(`No se pudo guardar el gasto administrativo: ${err?.message || err}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const hayCalculado = numero(porcentajeCalculado) > 0;
  const porcentajeManualGuardado = configuracion?.porcentaje_manual != null ? String(numero(configuracion.porcentaje_manual) * 100) : '';
  const manualDirty = String(porcentajeManual) !== porcentajeManualGuardado;
  return <>
    <div className="dx-ui-summary" aria-label="Resumen">
      <div className="dx-ui-chip"><b>{porcentajeCalculado != null ? porcentaje(porcentajeCalculado) : '—'}</b><span>calculado</span></div>
      <div className="dx-ui-chip"><b>{porcentajeManualGuardado === '' ? '—' : `${numero(porcentajeManualGuardado).toLocaleString('es-PE', { maximumFractionDigits: 2 })}%`}</b><span>manual</span></div>
    </div>
    {error && <div className="dx-costeovar-error" role="alert">{error}</div>}
    <div className="dx-ui-card">
      <div className="dx-ui-toolbar"><h2>Gasto administrativo de la empresa</h2></div>
      {cargando ? <div className="dx-ui-empty">Cargando porcentaje de gasto administrativo...</div> : <>
        <div className="dx-costeovar-adm">
          <div className="dx-costeovar-box"><h3>% calculado</h3>{hayCalculado ? <div className="dx-costeovar-big">{porcentaje(porcentajeCalculado)}</div> : <div className="dx-costeovar-no-data">Sin datos; verifica la información o usa un valor manual.</div>}<p className="dx-costeovar-hint">Referencia calculada con la información de la empresa.</p></div>
          <div className="dx-costeovar-box"><h3>% manual</h3><label className="dx-costeovar-field"><input type="number" min="0" step="0.01" aria-label="Porcentaje manual de gasto administrativo" value={porcentajeManual} disabled={!puedeGuardar || guardando} onChange={event => setPorcentajeManual(event.target.value)} placeholder="Ej. 18.30" /><span>%</span></label>{manualDirty && <small className="dx-costeovar-dirty">Cambio sin guardar</small>}<p className="dx-costeovar-hint">Si lo registras, Hoja de Costeo usará este valor en lugar del calculado.</p></div>
        </div>
        <div className="dx-costeovar-foot"><button type="button" className={`dx-btn${manualDirty ? ' primary' : ''}`} aria-label="Guardar porcentaje manual de gasto administrativo" disabled={!manualDirty || !puedeGuardar || guardando} onClick={guardar}><span aria-hidden="true">{I.save}</span>{guardando ? 'Guardando...' : 'Guardar'}</button></div>
      </>}
    </div>
  </>;
}

export default function CosteoVariables() {
  const { empresa, role, addToast } = useApp();
  const [vista, setVista] = useState('costo_hora');
  const [cargos, setCargos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [valoresManual, setValoresManual] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardandoCargoId, setGuardandoCargoId] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const puedeCrear = Boolean(role?.permisos?.todo || role?.permisos?.crear?.includes('costeo_variables'));
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('costeo_variables'));

  const tarifaPorCargo = useMemo(() => new Map(
    tarifas
      .filter(item => item?.cargo_id)
      .map(item => [item.cargo_id, numero(item.costo_hora_planilla)])
  ), [tarifas]);
  const configPorCargo = useMemo(() => new Map(configuraciones.map(item => [item.cargo_id, item])), [configuraciones]);
  const metodoDeCargo = cargo => {
    const manual = numero(valoresManual[cargo.id] ?? configPorCargo.get(cargo.id)?.costo_hora_manual);
    const planilla = tarifaPorCargo.get(cargo.id) || 0;
    return manual > 0 ? 'manual' : planilla > 0 ? 'planilla' : 'sin';
  };
  const cargosFiltrados = useMemo(() => {
    const terms = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
    return cargos.filter(cargo => {
      const texto = normalizarBusqueda(`${cargo.nombre || ''} ${cargo.codigo || ''}`);
      const coincideBusqueda = terms.every(term => texto.includes(term));
      const coincideMetodo = filtroMetodo === 'todos' || metodoDeCargo(cargo) === filtroMetodo;
      return coincideBusqueda && coincideMetodo;
    });
  }, [cargos, busqueda, filtroMetodo, valoresManual, tarifaPorCargo, configPorCargo]);
  const conteoMetodos = {
    todos: cargos.length,
    manual: cargos.filter(cargo => metodoDeCargo(cargo) === 'manual').length,
    planilla: cargos.filter(cargo => metodoDeCargo(cargo) === 'planilla').length,
    sin: cargos.filter(cargo => metodoDeCargo(cargo) === 'sin').length,
  };

  const cargar = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const sb = await getSupabaseClient();
      const [cargosResult, tarifasResult, configResult] = await Promise.all([
        sb.from('cargos_empresa').select('id, codigo, nombre, estado').eq('empresa_id', empresa.id).order('nombre'),
        sb.from('vw_costo_hora_planilla_por_cargo').select('cargo_id, costo_hora_planilla').eq('empresa_id', empresa.id),
        sb.from('costo_hora_cargo_config').select('id, cargo_id, costo_hora_manual, metodo_activo').eq('empresa_id', empresa.id),
      ]);
      const queryError = [cargosResult, tarifasResult, configResult].find(result => result.error)?.error;
      if (queryError) throw queryError;
      setCargos(cargosResult.data || []);
      setTarifas(tarifasResult.data || []);
      setConfiguraciones(configResult.data || []);
      setValoresManual(Object.fromEntries((configResult.data || []).map(item => [item.cargo_id, item.costo_hora_manual ?? ''])));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar Costo hora por cargo.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async cargo => {
    const valorRaw = valoresManual[cargo.id] ?? '';
    const costoManual = valorRaw === '' ? null : Number(valorRaw);
    if (costoManual !== null && (!Number.isFinite(costoManual) || costoManual < 0)) {
      addToast('El costo manual debe ser un número mayor o igual a cero.', 'error');
      return;
    }
    const existe = configPorCargo.has(cargo.id);
    if ((existe && !puedeEditar) || (!existe && !puedeCrear)) {
      addToast('No tienes permiso para guardar esta variable de costeo.', 'error');
      return;
    }
    setGuardandoCargoId(cargo.id);
    try {
      const sb = await getSupabaseClient();
      const { data, error: upsertError } = await sb
        .from('costo_hora_cargo_config')
        .upsert({
          empresa_id: empresa.id,
          cargo_id: cargo.id,
          costo_hora_manual: costoManual,
          metodo_activo: costoManual && costoManual > 0 ? 'manual' : 'planilla',
          actualizado_en: new Date().toISOString(),
        }, { onConflict: 'empresa_id,cargo_id' })
        .select('id, cargo_id, costo_hora_manual, metodo_activo')
        .single();
      if (upsertError) throw upsertError;
      setConfiguraciones(prev => {
        const sinActual = prev.filter(item => item.cargo_id !== cargo.id);
        return [...sinActual, data];
      });
      setValoresManual(prev => ({ ...prev, [cargo.id]: data.costo_hora_manual ?? '' }));
      addToast('Costo hora por cargo guardado.', 'success');
    } catch (err) {
      addToast(`No se pudo guardar el costo hora: ${err?.message || err}`, 'error');
    } finally {
      setGuardandoCargoId(null);
    }
  };

  const titulo = vista === 'costo_hora' ? 'Costo hora por cargo' : vista === 'depreciacion' ? 'Depreciación de activos' : 'Gasto administrativo';
  const nota = vista === 'costo_hora'
    ? 'Esta sección agrupa variables comerciales de costeo y se gestiona separada de Maestros Base.'
    : vista === 'depreciacion'
      ? 'La depreciación manual reemplaza el cálculo mensual. Las horas disponibles al mes son solo una referencia y se editan desde la ficha del Activo.'
      : 'El porcentaje calculado es una referencia. Si registras un valor manual, Hoja de Costeo usará ese valor. El manual se ingresa como porcentaje.';
  const conteoCargoManual = conteoMetodos.manual;
  const resumenCargo = <div className="dx-ui-summary" aria-label="Resumen">
    <div className="dx-ui-chip"><b>{cargos.length}</b><span>cargos</span></div>
    <div className="dx-ui-chip"><b>{conteoCargoManual}</b><span>con costo manual</span></div>
    <div className="dx-ui-chip"><b>{conteoMetodos.planilla}</b><span>según planilla</span></div>
    <div className="dx-ui-chip"><b>{conteoMetodos.sin}</b><span>sin tarifa</span></div>
  </div>;
  const filtros = [
    ['todos', 'Todos'], ['manual', 'Manual'], ['planilla', 'Planilla'], ['sin', 'Sin tarifa'],
  ];
  return (
    <section className="dx-ui dx-costeovar">
      <header className="dx-ui-head-page">
        <div><div className="dx-ui-eyebrow">Variables comerciales de costeo</div><h1 className="dx-ui-title">{titulo}</h1><p className="dx-ui-sub">Variables comerciales que alimentan el cálculo de Hoja de Costeo.</p></div>
      </header>
      <nav className="dx-ui-tabs" aria-label="Variables de costeo">
        <button type="button" className={`dx-ui-tab${vista === 'costo_hora' ? ' on' : ''}`} aria-pressed={vista === 'costo_hora'} onClick={() => setVista('costo_hora')}>Costo hora por cargo</button>
        <button type="button" className={`dx-ui-tab${vista === 'depreciacion' ? ' on' : ''}`} aria-pressed={vista === 'depreciacion'} onClick={() => setVista('depreciacion')}>Depreciación de activos</button>
        <button type="button" className={`dx-ui-tab${vista === 'gasto_administrativo' ? ' on' : ''}`} aria-pressed={vista === 'gasto_administrativo'} onClick={() => setVista('gasto_administrativo')}>Gasto administrativo</button>
      </nav>
      <p className="dx-costeovar-note"><span aria-hidden="true">{I.alertCircle}</span><span>{nota}</span></p>
      {vista === 'depreciacion' ? <DepreciacionActivos /> : vista === 'gasto_administrativo' ? <GastoAdministrativo /> : <>
        {resumenCargo}
        {error && <div className="dx-costeovar-error" role="alert">{error}</div>}
        <div className="dx-ui-card">
          <div className="dx-ui-toolbar"><h2>Cargos de la empresa</h2><span className="dx-ui-count">{cargando ? '0 cargos' : cargosFiltrados.length === cargos.length ? `${cargos.length} cargos` : `${cargosFiltrados.length} de ${cargos.length} cargos`}</span><label className="dx-ui-search"><span aria-hidden="true">{I.search}</span><input type="search" aria-label="Buscar cargo por nombre o código" placeholder="Buscar cargo o código" value={busqueda} onChange={event => setBusqueda(event.target.value)} /></label></div>
          <div className="dx-costeovar-filters" role="group" aria-label="Filtrar por método usado">
            {filtros.map(([metodo, label]) => <button key={metodo} type="button" className={`dx-costeovar-filter${filtroMetodo === metodo ? ' on' : ''}`} aria-pressed={filtroMetodo === metodo} onClick={() => setFiltroMetodo(metodo)}>{label}<b>{conteoMetodos[metodo]}</b></button>)}
          </div>
          <div className="dx-ui-head dx-costeovar-cargo-cols" aria-hidden="true"><span>Cargo</span><span className="num">Según planilla</span><span>Manual</span><span>Método usado</span><span></span></div>
          {cargando ? <div className="dx-ui-empty">Cargando cargos y tarifas...</div> : cargos.length === 0 ? <div className="dx-ui-empty">No hay cargos registrados para esta empresa.</div> : cargosFiltrados.length === 0 ? <div className="dx-ui-empty">No hay cargos con estos filtros.</div> : cargosFiltrados.map(cargo => {
            const planilla = tarifaPorCargo.get(cargo.id) || 0;
            const manualRaw = valoresManual[cargo.id] ?? '';
            const configuracionGuardada = configPorCargo.get(cargo.id);
            const guardadoRaw = configuracionGuardada?.costo_hora_manual ?? '';
            const dirty = String(manualRaw) !== String(guardadoRaw);
            const metodo = metodoDeCargo(cargo);
            const puedeGuardarFila = configuracionGuardada ? puedeEditar : puedeCrear;
            const pillClass = metodo === 'manual' ? 'dx-costeovar-pill-manual' : metodo === 'planilla' ? 'is-cyan' : 'is-gray';
            return <div key={cargo.id} className={`dx-ui-row dx-costeovar-cargo-cols${dirty ? ' is-dirty' : ''}`}>
              <div className="dx-costeovar-main"><span className="dx-ui-icon is-cyan" aria-hidden="true">{I.users}</span><span><b>{cargo.nombre}</b><small>{cargo.codigo || '—'}</small>{cargo.estado !== 'activo' && <span className="dx-costeovar-inactive">Inactivo</span>}</span></div>
              <div className="dx-costeovar-cell num"><span className="dx-costeovar-lbl">Según planilla</span><span className={`dx-costeovar-money${planilla > 0 ? '' : ' is-none'}`}>{planilla > 0 ? moneyD(numero(planilla), 'S/') : '—'}</span></div>
              <div className="dx-costeovar-cell is-wide"><span className="dx-costeovar-lbl">Manual</span><label className="dx-costeovar-field"><span>US$</span><input type="number" min="0" step="0.01" aria-label={`Costo hora manual de ${cargo.nombre}`} value={manualRaw} disabled={!puedeGuardarFila || guardandoCargoId === cargo.id} onChange={event => setValoresManual(prev => ({ ...prev, [cargo.id]: event.target.value }))} placeholder="0.00" /></label>{dirty && <small className="dx-costeovar-dirty">Cambio sin guardar</small>}</div>
              <div className="dx-costeovar-cell"><span className="dx-costeovar-lbl">Método usado</span><span className={`dx-ui-pill ${pillClass}`}><i aria-hidden="true" />{metodo === 'manual' ? 'Manual' : metodo === 'planilla' ? 'Planilla' : 'Sin tarifa'}</span></div>
              <div className="dx-costeovar-act"><button type="button" className={`dx-btn${dirty ? ' primary' : ''}`} aria-label={`Guardar costo hora de ${cargo.nombre}`} disabled={!dirty || !puedeGuardarFila || guardandoCargoId === cargo.id} onClick={() => guardar(cargo)}><span aria-hidden="true">{I.save}</span>{guardandoCargoId === cargo.id ? 'Guardando...' : 'Guardar'}</button></div>
            </div>;
          })}
        </div>
      </>}
    </section>
  );
}
