import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import {
  crearViaje, editarViaje, obtenerViaje, listarOSCliente, listarContactosTransporte,
  cambiarEstadoViaje, resolverTarifa,
} from '../../../services/transporteViajesService.js';
import { listarRutas } from '../../../services/transporteRutasService.js';
import { listarLugares } from '../../../services/transporteLugaresService.js';
import {
  listarCuentasTransporte, listarTarifas, listarTiposUnidadTransporte,
} from '../../../services/transporteTarifasService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { WizardStep, StopsEditor, TripSummary, ChargeFields } from './OrdenViajeComponents.jsx';
import { LugarEditorModal } from './LugarEditorModal.jsx';
import {
  armarParadasDesdeRuta, cantidadFacturableViaje, catalogoTiposUnidad, fechaActualLocal,
  fechaLocalInputAFechaUtc, fechaUtcAFechaLocalInput, formatearImporte,
  ingresoEstimadoViaje, llegadaEstimadaViaje, sincronizarParadasViaje,
  validarPasoViaje, validarVentanaParada, puedeProgramarViaje, debeCambiarEstadoAlProgramar,
} from './transporteUtils.js';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';

const STEPS = [
  ['Cliente y fecha', 'Quién y cuándo'], ['Ruta y paradas', 'Por dónde'],
  ['Carga y unidad', 'Qué y en qué'], ['Tarifa', 'Cuánto y confirmar'],
];
const blank = () => ({ cuenta_id: '', os_cliente_id: '', fecha_programada: `${fechaActualLocal()}T08:00`,
  ruta_id: '', origen_nombre: '', destino_nombre: '', distancia_km: '', duracion_estimada_horas: '',
  tipo_unidad: '', modalidad: 'viaje', carga_descripcion: '', peso_toneladas: '', volumen_m3: '',
  carga_bultos: '', carga_unidad_bultos: '', tipo_carga: 'general', requisitos: [], referencia_cliente: '',
  contacto_id: '', cantidad_facturable: '1', tarifa_id: null, tarifa_unitaria: '', moneda: 'PEN',
  minimo_facturable: '', observaciones: '', procedencia_tarifa: '', paradas: [] });
const labelCuenta = account => account.nombre_comercial || account.razon_social || account.ruc || account.id;
const initialsCuenta = account => labelCuenta(account).trim().split(/\s+/)
  .slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es');

export function OrdenViajePage({ onNav }) {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const viajeId = new URLSearchParams(globalThis.window?.location?.hash?.split('?')[1] || '').get('id');
  const canSave = viajeId ? access.editar : access.crear;
  const [form, setForm] = useState(blank);
  const [cuentas, setCuentas] = useState([]);
  const [os, setOS] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [lugares, setLugares] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [tariffMessage, setTariffMessage] = useState('');
  const [tariffBusy, setTariffBusy] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [step, setStep] = useState(1);
  const [originMode, setOriginMode] = useState('os');
  const [placePicker, setPlacePicker] = useState(null);
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeModal, setPlaceModal] = useState(false);
  const [routeMatches, setRouteMatches] = useState({});
  const [clientTariff, setClientTariff] = useState(null);
  const [baseTariff, setBaseTariff] = useState(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [placeIndex, setPlaceIndex] = useState(null);
  const lastAutoTariffKey = useRef('');
  const tariffRequestId = useRef(0);

  const load = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    try {
      const [accounts, routeList, unitTypes, tariffList, placeList] = await Promise.all([
        listarCuentasTransporte(empresaId), listarRutas(empresaId),
        listarTiposUnidadTransporte(empresaId), listarTarifas(empresaId), listarLugares(empresaId),
      ]);
      setCuentas(accounts);
      setRutas(routeList);
      setLugares(placeList);
      let initial = blank();
      if (viajeId) {
        const viaje = await obtenerViaje(empresaId, viajeId);
        if (!viaje) throw Error('No se encontró el viaje solicitado.');
        initial = { ...initial, ...viaje,
          fecha_programada: fechaUtcAFechaLocalInput(viaje.fecha_programada),
          paradas: sincronizarParadasViaje(viaje.paradas || [], viaje.origen_nombre, viaje.destino_nombre) };
      }
      setTipos(catalogoTiposUnidad(unitTypes, tariffList, initial.tipo_unidad));
      setForm(initial);
      setOriginMode(initial.os_cliente_id ? 'os' : 'directo');
      setBaseline(JSON.stringify(initial));
    } catch (error) {
      setFormError(error.message || 'No se pudo cargar el formulario.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, access.ver, viajeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    listarOSCliente(empresaId, form.cuenta_id, form.os_cliente_id).then(data => { if (active) setOS(data); })
      .catch(error => setFormError(error.message));
    return () => { active = false; };
  }, [empresaId, form.cuenta_id, form.os_cliente_id]);
  useEffect(() => {
    let active = true;
    listarContactosTransporte(form.cuenta_id).then(data => { if (active) setContactos(data); })
      .catch(error => setFormError(error.message));
    return () => { active = false; };
  }, [form.cuenta_id]);
  useEffect(() => {
    let active = true;
    const unit = form.tipo_unidad || tipos[0];
    if (!empresaId || !unit) return undefined;
    Promise.all(rutas.filter(item => item.estado === 'activa').map(async item => {
      try {
        const match = await resolverTarifa({ empresaId, rutaId: item.id,
          cuentaId: form.cuenta_id || null, tipoUnidad: unit, modalidad: form.modalidad || 'viaje',
          moneda: form.moneda || null, fecha: form.fecha_programada?.slice(0, 10) || fechaActualLocal() });
        return [item.id, match ? (match.cuenta_id ? 'Tarifa de cliente' : 'Tarifa base') : 'Sin tarifa'];
      } catch {
        return [item.id, 'Sin tarifa'];
      }
    })).then(rows => { if (active) setRouteMatches(Object.fromEntries(rows)); });
    return () => { active = false; };
  }, [empresaId, rutas, tipos, form.cuenta_id, form.tipo_unidad, form.modalidad, form.moneda,
    form.fecha_programada]);
  useEffect(() => {
    if (step !== 4 || !empresaId || !form.ruta_id || !form.tipo_unidad
      || form.procedencia_tarifa === 'manual') return undefined;
    const query = { empresaId, rutaId: form.ruta_id, tipoUnidad: form.tipo_unidad,
      modalidad: form.modalidad, moneda: form.moneda,
      fecha: form.fecha_programada?.slice(0, 10) || fechaActualLocal() };
    const queryKey = JSON.stringify([query.empresaId, query.rutaId, form.cuenta_id,
      query.tipoUnidad, query.modalidad, query.moneda, query.fecha]);
    if (queryKey === lastAutoTariffKey.current) return undefined;
    lastAutoTariffKey.current = queryKey;
    findTariff({ query, queryKey });
    return () => {
      tariffRequestId.current += 1;
      setTariffBusy(false);
    };
  }, [step, empresaId, form.ruta_id, form.cuenta_id, form.tipo_unidad, form.modalidad,
    form.moneda, form.fecha_programada, form.procedencia_tarifa]);

  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => {
    const guard = event => {
      if (!dirty || saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    globalThis.window?.addEventListener('beforeunload', guard);
    return () => globalThis.window?.removeEventListener('beforeunload', guard);
  }, [dirty, saving]);
  const route = rutas.find(item => item.id === form.ruta_id);
  const ingreso = ingresoEstimadoViaje(form.tarifa_unitaria, form.cantidad_facturable,
    form.minimo_facturable);
  const cuenta = cuentas.find(item => item.id === form.cuenta_id);
  const arrival = useMemo(() => llegadaEstimadaViaje(form.fecha_programada,
    form.duracion_estimada_horas), [form.fecha_programada, form.duracion_estimada_horas]);

  function assign(key, value) {
    setForm(old => {
      const next = { ...old, [key]: value };
      if (key === 'cuenta_id') next.os_cliente_id = '';
      if (['tarifa_unitaria', 'minimo_facturable'].includes(key)) next.procedencia_tarifa = 'manual';
      if (key === 'ruta_id') {
        const selected = rutas.find(item => item.id === value);
        if (selected) Object.assign(next, {
          origen_nombre: selected.origen_nombre || '', destino_nombre: selected.destino_nombre || '',
          distancia_km: selected.distancia_km ?? '',
          duracion_estimada_horas: selected.duracion_estimada_horas ?? '',
          paradas: armarParadasDesdeRuta(selected, lugares),
        });
      }
      if (key === 'modalidad' || ['distancia_km', 'peso_toneladas', 'duracion_estimada_horas'].includes(key)) {
        next.cantidad_facturable = String(cantidadFacturableViaje(next.modalidad, next) ?? '');
      }
      return next;
    });
    setErrors(old => ({ ...old, [key]: '' }));
    setFormError('');
  }

  function stopsEdit(index, key, value) {
    setForm(old => ({ ...old, paradas: old.paradas.map((stop, i) => i === index
      ? { ...stop, [key]: value } : stop) }));
    setErrors(old => ({ ...old, [`parada_${index}`]: '', [`ventana_${index}`]: '' }));
  }
  function moveStop(index, delta) {
    setForm(old => {
      const list = [...old.paradas];
      const target = index + delta;
      if (target < 1 || target >= list.length - 1) return old;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...old, paradas: list };
    });
  }
  function addStop(type) {
    setForm(old => ({ ...old, paradas: [...old.paradas.slice(0, -1), { tipo: type, nombre: '' },
      old.paradas.at(-1)] }));
    setPlaceIndex(null);
    setPlacePicker(type);
    setPlaceSearch('');
  }
  function openPlacePicker(index) {
    setPlaceIndex(index);
    setPlacePicker(form.paradas[index]?.tipo || 'recojo');
    setPlaceSearch('');
  }
  function closePlacePicker() {
    if (placeIndex === null) {
      setForm(old => ({ ...old, paradas: old.paradas.filter(stop => stop.nombre || !['recojo', 'entrega'].includes(stop.tipo)) }));
    }
    setPlacePicker(null);
    setPlaceIndex(null);
  }
  function removeStop(index) {
    setForm(old => ({ ...old, paradas: old.paradas.filter((_, i) => i !== index) }));
  }
  function selectPlace(place) {
    setForm(old => {
      const index = placeIndex === null ? old.paradas.length - 2 : placeIndex;
      return { ...old, paradas: old.paradas.map((stop, i) => i === index
        ? { ...stop, lugar_id: place.id, nombre: place.nombre, direccion: place.direccion || '' } : stop) };
    });
    setPlacePicker(null);
    setPlaceIndex(null);
  }

  async function findTariff(options = {}) {
    const requestId = ++tariffRequestId.current;
    setTariffBusy(true);
    setFormError('');
    setTariffMessage('');
    try {
      const query = options.query || { empresaId, rutaId: form.ruta_id || null,
        tipoUnidad: form.tipo_unidad, modalidad: form.modalidad, moneda: form.moneda,
        fecha: form.fecha_programada?.slice(0, 10) || fechaActualLocal() };
      const [clientResult, base] = await Promise.all([
        form.cuenta_id ? resolverTarifa({ ...query, cuentaId: form.cuenta_id }) : null,
        resolverTarifa({ ...query, cuentaId: null }),
      ]);
      if (requestId !== tariffRequestId.current) return;
      const client = clientResult?.cuenta_id === form.cuenta_id ? clientResult : null;
      setClientTariff(client);
      setBaseTariff(base);
      const tariff = client || base;
      if (!tariff) {
        setTariffMessage('No se encontró una tarifa vigente para esta combinación.');
        setForm(old => ({ ...old, tarifa_id: null, tarifa_unitaria: '', procedencia_tarifa: '' }));
        return;
      }
      if (options.queryKey) {
        lastAutoTariffKey.current = JSON.stringify([query.empresaId, query.rutaId, form.cuenta_id,
          query.tipoUnidad, tariff.modalidad || query.modalidad, tariff.moneda || query.moneda,
          query.fecha]);
      }
      setForm(old => ({ ...old, tarifa_id: tariff.tarifa_id || tariff.id,
        tarifa_unitaria: String(tariff.tarifa ?? ''), moneda: tariff.moneda || old.moneda,
        minimo_facturable: tariff.minimo_facturable ?? '', modalidad: tariff.modalidad || old.modalidad,
        procedencia_tarifa: tariff.cuenta_id ? 'cliente' : 'base' }));
      setTariffMessage(tariff.cuenta_id ? 'Tarifa de cliente' : 'Tarifa base');
    } catch (error) {
      if (requestId !== tariffRequestId.current) return;
      setTariffMessage(error.message || 'No se pudo buscar la tarifa.');
    } finally {
      if (requestId === tariffRequestId.current) setTariffBusy(false);
    }
  }

  async function save(program) {
    const nextErrors = validarPasoViaje(program ? 4 : step, form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (program && !puedeProgramarViaje(form)) {
      setFormError('No se puede programar sin una tarifa resuelta o un precio manual mayor que cero.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const { estado, ...datosViaje } = form;
      const payload = { ...datosViaje,
        fecha_programada: fechaLocalInputAFechaUtc(form.fecha_programada) };
      const saved = viajeId ? await editarViaje(empresaId, viajeId, payload)
        : await crearViaje(empresaId, payload);
      setBaseline(JSON.stringify(form));
      if (!viajeId && saved?.id) globalThis.window?.history?.replaceState?.({}, '', `#/transporte-crear-ov?id=${saved.id}`);
      if (program && debeCambiarEstadoAlProgramar(saved?.estado || form.estado || 'borrador')) {
        try {
          await cambiarEstadoViaje(saved?.id || viajeId, 'programado');
        } catch (error) {
          setFormError(`El viaje quedó guardado como borrador, pero no se pudo programar: ${error.message || 'Error desconocido.'}`);
          return;
        }
      }
      if (program) onNav?.('transporte-viajes');
      else setSaveNotice(form.estado === 'programado' ? 'Cambios guardados.' : 'Borrador guardado.');
    } catch (error) {
      setFormError(error.message || 'No se pudo guardar el viaje.');
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    const nextErrors = validarPasoViaje(step, form);
    if (step === 2) form.paradas.forEach((stop, index) => {
      const windowError = validarVentanaParada(stop);
      if (windowError) nextErrors[`ventana_${index}`] = windowError;
    });
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) setStep(value => Math.min(value + 1, 4));
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;
  if (loading) return <section className="dx-ui dx-transporte">Cargando orden de viaje…</section>;
  const clientPlaces = lugares.filter(place => place.estado === 'activo'
    && (!place.cuenta_id || place.cuenta_id === form.cuenta_id)
    && `${place.nombre} ${place.direccion || ''}`.toLocaleLowerCase('es').includes(placeSearch.toLocaleLowerCase('es')));

  return <section className="dx-ui dx-transporte dx-transporte-wizard">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte Comercial</div>
      <h1 className="dx-ui-title">{viajeId ? 'Editar orden de viaje' : 'Nueva orden de viaje'}</h1>
      <p className="dx-ui-sub">Completa los cuatro pasos para preparar el viaje.</p></div></header>
    <nav className="dx-transporte-stepper" aria-label="Pasos de la orden">
      {STEPS.map(([title, subtitle], index) => <WizardStep key={title} number={index + 1}
        title={title} subtitle={subtitle} current={step} onSelect={() => setStep(index + 1)} />)}
    </nav>
    <div className="dx-transporte-wizard-grid">
      <main className="dx-ui-card dx-transporte-wizard-form">
        {step === 1 && <section className="dx-transporte-wizard-section">
          <h2>Cliente y fecha</h2>
          <div className="dx-transporte-segmented" role="group" aria-label="Origen del viaje">
            <button className={originMode === 'os' ? 'is-active' : ''} onClick={() => setOriginMode('os')}>Desde OS del cliente</button>
            <button className={originMode === 'directo' ? 'is-active' : ''} onClick={() => {
              setOriginMode('directo'); assign('os_cliente_id', '');
            }}>Viaje directo</button>
          </div>
          {cuenta ? <div className="dx-transporte-picked"><span className="dx-transporte-picked-initials">{initialsCuenta(cuenta)}</span>
            <span className="dx-transporte-picked-copy"><strong>{labelCuenta(cuenta)}</strong><small>RUC {cuenta.ruc || 'No registrado'}</small></span>
            <button type="button" className="dx-btn sm" onClick={() => assign('cuenta_id', '')}>Cambiar</button></div>
            : <DxReferenceSelector label="Cliente" name="cuenta_id" required options={cuentas}
              value={form.cuenta_id} onChange={value => assign('cuenta_id', value || '')}
              getLabel={item => `${labelCuenta(item)} · ${item.ruc || item.id}`}
              placeholder="Buscar por nombre o RUC" error={errors.cuenta_id} />}
          {originMode === 'os' && <label className="dx-ui-field"><span>OS abierta del cliente</span>
            <select className="dx-ui-select" value={form.os_cliente_id || ''}
              onChange={event => assign('os_cliente_id', event.target.value)}>
              <option value="">Selecciona OS</option>{os.map(item =>
                <option key={item.id} value={item.id}>{item.numero || item.codigo || item.id}</option>)}</select></label>}
          <div className="dx-ui-form-grid">
            <label className="dx-ui-field"><span>Fecha y hora de salida *</span>
              <input type="datetime-local" value={form.fecha_programada} onChange={event =>
                assign('fecha_programada', event.target.value)} />
              {errors.fecha_programada && <small className="dx-ui-field-error">{errors.fecha_programada}</small>}</label>
            <div className="dx-ui-field"><span>Moneda</span><div className="dx-transporte-segmented">
              {['PEN', 'USD'].map(code => <button key={code} type="button"
                className={form.moneda === code ? 'is-active' : ''} onClick={() => assign('moneda', code)}>
                {code === 'PEN' ? 'S/' : 'US$'}</button>)}</div></div>
            <label className="dx-ui-field"><span>Referencia del cliente</span>
              <input value={form.referencia_cliente || ''} onChange={event =>
                assign('referencia_cliente', event.target.value)} /></label>
            <label className="dx-ui-field"><span>Contacto</span><select className="dx-ui-select"
              value={form.contacto_id || ''} onChange={event => assign('contacto_id', event.target.value)}>
              <option value="">Sin contacto</option>{contactos.map(item =>
                <option key={item.id} value={item.id}>{item.nombre}{item.cargo ? ` · ${item.cargo}` : ''}</option>)}</select></label>
          </div>
        </section>}
        {step === 2 && <section className="dx-transporte-wizard-section">
          <h2>Ruta y paradas</h2>{!rutas.some(item => item.estado === 'activa')
            ? <div className="dx-ui-empty dx-transporte-route-empty"><strong>No hay rutas activas</strong>
              <a className="dx-btn" href="#/transporte-tarifas">Ir al Maestro de Rutas</a></div>
            : <><div className="dx-transporte-route-tiles">
          {rutas.filter(item => item.estado === 'activa').map(item => {
            const rate = routeMatches[item.id] || 'Sin tarifa';
            const rateClass = rate === 'Tarifa de cliente' ? 'is-client'
              : rate === 'Tarifa base' ? 'is-base' : 'is-empty';
            return <button key={item.id}
              className={`dx-transporte-route-tile ${form.ruta_id === item.id ? 'is-active' : ''}`}
              onClick={() => assign('ruta_id', item.id)}><strong>{item.origen_nombre} → {item.destino_nombre}</strong>
              <span>{item.distancia_km || '—'} km · {item.duracion_estimada_horas || '—'} h</span>
              <small className={`dx-transporte-route-rate-pill ${rateClass}`}>{rate}</small></button>;
          })}</div>
          {errors.ruta_id && <small className="dx-ui-field-error">{errors.ruta_id}</small>}
          {route ? <StopsEditor stops={form.paradas} errors={errors} onEdit={stopsEdit} onMove={moveStop}
            onRemove={removeStop} onAdd={addStop} placePicker={placePicker}
            places={clientPlaces} search={placeSearch} setSearch={setPlaceSearch}
            onSelectPlace={selectPlace} onCreatePlace={() => setPlaceModal(true)}
            onOpenPlacePicker={openPlacePicker} onClosePlacePicker={closePlacePicker} />
            : <p className="dx-transporte-route-prompt">Elige una ruta para ver el origen y el destino</p>}
          </>}
        </section>}
        {step === 3 && <ChargeFields form={form} assign={assign} errors={errors} types={tipos} />}
        {step === 4 && <section className="dx-transporte-wizard-section">
          <h2>Tarifa e ingreso</h2><div className="dx-transporte-priority">
            <strong>1. Tarifa de cliente</strong><span>{clientTariff
              ? formatearImporte(clientTariff.tarifa, clientTariff.moneda, clientTariff.modalidad)
              : 'No encontrada'}{form.procedencia_tarifa === 'cliente' ? ' · Aplicada' : ''}</span>
            <strong>2. Tarifa base</strong><span>{baseTariff
              ? formatearImporte(baseTariff.tarifa, baseTariff.moneda, baseTariff.modalidad)
              : 'No encontrada'}{form.procedencia_tarifa === 'base' ? ' · Aplicada' : ''}</span>
          </div>
          {form.procedencia_tarifa === 'manual' && <p role="status" className="dx-transporte-tariff-message">
            Precio manual aplicado: {formatearImporte(form.tarifa_unitaria, form.moneda, form.modalidad)}.
          </p>}
          <button className="dx-btn" type="button" disabled={tariffBusy || !form.tipo_unidad}
            onClick={findTariff}>{tariffBusy ? 'Buscando…' : 'Buscar de nuevo'}</button>
          {tariffMessage && <p role="status" className="dx-transporte-tariff-message">{tariffMessage}</p>}
          <div className="dx-ui-form-grid">
            <label className="dx-ui-field"><span>Modalidad</span><select className="dx-ui-select"
              value={form.modalidad} onChange={event => assign('modalidad', event.target.value)}>
              {['viaje', 'km', 'tonelada', 'hora'].map(value =>
                <option key={value} value={value}>{({ viaje: 'Por viaje', km: 'Por km',
                  tonelada: 'Por tonelada', hora: 'Por hora' })[value]}</option>)}</select></label>
            <label className="dx-ui-field"><span>Cantidad facturable</span><input type="number"
              value={form.cantidad_facturable} onChange={event => assign('cantidad_facturable', event.target.value)} /></label>
            <label className="dx-ui-field"><span>Tarifa</span><input type="number" value={form.tarifa_unitaria}
              onChange={event => assign('tarifa_unitaria', event.target.value)} /></label>
            <label className="dx-ui-field"><span>Mínimo</span><input type="number" value={form.minimo_facturable}
              onChange={event => assign('minimo_facturable', event.target.value)} /></label>
          </div>
          <p className="dx-transporte-income"><span>Ingreso estimado</span>
            <strong>{ingreso == null ? 'Sin dato' : formatearImporte(ingreso, form.moneda)}</strong></p>
          <div className="dx-transporte-before"><h3>Antes de programar</h3>
            {[['Cliente seleccionado', !!form.cuenta_id], ['Ruta seleccionada', !!form.ruta_id],
              ['Unidad requerida', !!form.tipo_unidad], ['Tarifa vigente', !!form.tarifa_id]].map(([label, ok]) =>
              <p key={label} className={ok ? 'is-ok' : 'is-pending'}>{ok ? '✓' : '!'} {label}</p>)}</div>
        </section>}
        {formError && <div className="dx-transporte-error" role="alert">{formError}</div>}
      </main>
      <TripSummary form={form} cuenta={cuenta} ruta={route}
        os={os.find(item => item.id === form.os_cliente_id)} arrival={arrival} ingreso={ingreso} />
    </div>
    <footer className="dx-transporte-savebar">
      {step > 1 ? <button className="dx-btn" onClick={() => setStep(value => value - 1)}>Atrás</button>
        : <button className="dx-btn" onClick={() => dirty ? setDiscardConfirm(true)
          : onNav?.('transporte-viajes')}>Cancelar</button>}
      <span className="dx-transporte-save-spacer" />
      {!(viajeId && form.estado === 'programado') && <button className="dx-btn"
        disabled={!canSave || saving || !dirty} onClick={() => save(false)}>Guardar borrador</button>}
      {viajeId && form.estado === 'programado' ? <button className="dx-btn primary"
        disabled={!canSave || saving || !dirty} onClick={() => save(false)}>Guardar cambios</button>
        : step < 4 ? <button className="dx-btn primary" onClick={nextStep}>Siguiente</button>
          : <>{!puedeProgramarViaje(form) && <small className="dx-transporte-error">
            Sin precio: puedes guardar borrador, pero no programar.</small>}
            <button className="dx-btn primary" disabled={!canSave || saving || !puedeProgramarViaje(form)}
              onClick={() => save(true)}>Guardar y programar</button></>}
    </footer>
    {discardConfirm && <div className="dx-transporte-confirm"><section role="alertdialog" aria-modal="true">
      <h2>¿Salir sin guardar?</h2><p>Se perderán los cambios sin guardar.</p>
      <button type="button" className="dx-btn" onClick={() => setDiscardConfirm(false)}>Seguir editando</button>
      <button type="button" className="dx-btn primary" onClick={() => onNav?.('transporte-viajes')}>Salir</button>
    </section></div>}
    {saveNotice && <div className="dx-transporte-notice" role="status">{saveNotice}</div>}
    <LugarEditorModal open={placeModal} lugar={null} cuentas={cuentas}
      cuentaPreseleccionada={form.cuenta_id} empresaId={empresaId}
      onClose={() => setPlaceModal(false)} onSaved={place => {
        setLugares(old => [...old, place]); setPlaceModal(false); selectPlace(place);
      }} />
  </section>;
}
