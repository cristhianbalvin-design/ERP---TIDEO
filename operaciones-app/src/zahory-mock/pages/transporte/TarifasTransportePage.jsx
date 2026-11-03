import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { ModalShell } from '../../components/ModalShell.jsx';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { DxFiltroMoneda } from '../../components/dx/DxFiltroMoneda.jsx';
import { DxFechaExacta } from '../../components/dx/DxFechaExacta.jsx';
import { listarRutas } from '../../../services/transporteRutasService.js';
import {
  actualizarTarifa, cambiarEstadoTarifa, crearTarifa, listarCuentasTransporte,
  listarTarifas, listarTiposUnidadTransporte, resolverTarifa,
} from '../../../services/transporteTarifasService.js';
import { TarifaGrupo } from './TarifaGrupo.jsx';
import {
  etiquetaContador, estadoVigencia, fechaActualLocal, formatearFechaTransporte,
  formatearImporte, unificarTiposUnidad, validarFormularioTarifa,
} from './transporteUtils.js';

const BLANK = { ruta_id: null, cuenta_id: null, tipo_unidad: '', modalidad: 'km', tarifa: '',
  moneda: 'PEN', minimo_facturable: '', vigente_desde: fechaActualLocal(), vigente_hasta: '',
  estado: 'activa', notas: '' };
const cuentaLabel = account => account?.nombre_comercial || account?.razon_social || account?.id || 'Cliente';

function FormField({ label, name, value, onChange, type = 'text', error, ...props }) {
  return <label className="dx-ui-field"><span>{label}</span><input name={name} type={type} value={value ?? ''}
    onChange={onChange} aria-invalid={Boolean(error)} {...props} />
    {error && <small className="dx-ui-field-error">{error}</small>}</label>;
}

export function TarifasTransportePage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [tarifas, setTarifas] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState('');
  const [mode, setMode] = useState('');
  const [validity, setValidity] = useState('vigente');
  const [exactDate, setExactDate] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [modalBaseline, setModalBaseline] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [annulTarget, setAnnulTarget] = useState(null);
  const [probe, setProbe] = useState({ ruta_id: '', cuenta_id: '', tipo_unidad: '', modalidad: 'viaje',
    moneda: 'PEN', fecha: fechaActualLocal() });
  const [probeResult, setProbeResult] = useState(null);
  const [probeError, setProbeError] = useState('');
  const [probing, setProbing] = useState(false);

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setError('');
    try {
      const [tariffRows, routeRows, accountRows, unitTypes] = await Promise.all([
        listarTarifas(empresaId), listarRutas(empresaId), listarCuentasTransporte(empresaId),
        listarTiposUnidadTransporte(empresaId),
      ]);
      setTarifas(tariffRows);
      setRutas(routeRows);
      setCuentas(accountRows);
      setTypes(unificarTiposUnidad([], unitTypes));
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar las tarifas.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, access.ver]);
  useEffect(() => { reload(); }, [reload]);

  const today = fechaActualLocal();
  const filtered = useMemo(() => tarifas.filter(item => {
    const route = rutas.find(row => row.id === item.ruta_id);
    const account = cuentas.find(row => row.id === item.cuenta_id);
    const text = `${route?.nombre || ''} ${route?.codigo || ''} ${cuentaLabel(account)} ${item.tipo_unidad}`;
    return (!query || text.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))
      && (!currency || item.moneda === currency)
      && (!mode || item.modalidad === mode)
      && (exactDate ? estadoVigencia(item, exactDate) === 'vigente'
        : validity === 'todas' || estadoVigencia(item, today) === validity);
  }), [tarifas, rutas, cuentas, query, currency, mode, exactDate, validity, today]);
  const groups = useMemo(() => {
    const ids = [...new Set(filtered.map(item => item.ruta_id || 'sin-ruta'))];
    return ids.map(id => ({ route: rutas.find(item => item.id === id) || null,
      rows: filtered.filter(item => (item.ruta_id || 'sin-ruta') === id) }));
  }, [filtered, rutas]);

  function open(item = null, rutaId = null) {
    const next = item ? { ...BLANK, ...item, tarifa: String(item.tarifa ?? ''),
      minimo_facturable: item.minimo_facturable ?? '', vigente_hasta: item.vigente_hasta || '' }
      : { ...BLANK, ruta_id: rutaId };
    setForm(next);
    setModalBaseline(JSON.stringify(next));
    setFieldErrors({});
    setFormError('');
    setAnnulTarget(null);
    setModal(true);
  }
  function update(name, value) {
    setForm(current => ({ ...current, [name]: value }));
    setFieldErrors(current => ({ ...current, [name]: '' }));
  }
  async function save(event) {
    event.preventDefault();
    const errors = validarFormularioTarifa(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = { ...form, ruta_id: form.ruta_id || null, cuenta_id: form.cuenta_id || null,
        tipo_unidad: form.tipo_unidad.trim(), tarifa: Number(form.tarifa),
        minimo_facturable: form.minimo_facturable === '' ? null : Number(form.minimo_facturable),
        vigente_hasta: form.vigente_hasta || null, notas: form.notas || null };
      if (form.id) await actualizarTarifa(empresaId, form.id, payload);
      else await crearTarifa(empresaId, payload);
      setModal(false);
      setNotice('Tarifa guardada.');
      await reload();
    } catch (saveError) {
      setFormError(saveError.message || 'No se pudo guardar la tarifa.');
    } finally {
      setSaving(false);
    }
  }
  async function annul(item) {
    try {
      await cambiarEstadoTarifa(empresaId, item.id, 'inactiva');
      setModal(false);
      setAnnulTarget(null);
      setNotice('Tarifa anulada.');
      await reload();
    } catch (toggleError) {
      setFormError(toggleError.message || 'No se pudo anular la tarifa.');
    }
  }
  async function simulate(event) {
    event.preventDefault();
    setProbing(true);
    setProbeError('');
    setProbeResult(null);
    try {
      const common = { empresaId, rutaId: probe.ruta_id || null, tipoUnidad: probe.tipo_unidad,
        modalidad: probe.modalidad, moneda: probe.moneda || null, fecha: probe.fecha };
      const [client, base] = await Promise.all([
        probe.cuenta_id ? resolverTarifa({ ...common, cuentaId: probe.cuenta_id }) : null,
        resolverTarifa({ ...common, cuentaId: null }),
      ]);
      setProbeResult({ selected: client || base, client, base });
    } catch (failure) {
      setProbeError(failure.message || 'No se pudo resolver la tarifa.');
    } finally {
      setProbing(false);
    }
  }
  function probeUpdate(key, value) {
    setProbe(current => ({ ...current, [key]: value }));
    setProbeResult(null);
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;
  return <section className="dx-ui dx-transporte dx-transporte-tarifas">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte Comercial</div>
      <h1 className="dx-ui-title">Tarifas</h1>
      <p className="dx-ui-sub">Precios por ruta, unidad y cliente. La tarifa del cliente tiene prioridad.</p>
    </div>{access.crear && <button className="dx-btn primary" onClick={() => open()}>Nueva tarifa</button>}</header>
    <section className="dx-ui-card dx-transporte-simulator"><h2>¿Cuánto cobro?</h2>
      <p>Simula la tarifa aplicable para un viaje.</p><form className="dx-ui-form-grid" onSubmit={simulate}>
        <DxReferenceSelector label="Ruta" options={rutas} value={probe.ruta_id}
          onChange={value => probeUpdate('ruta_id', value)} getLabel={item => `${item.codigo} · ${item.nombre}`}
          optionalLabel="Selecciona ruta" />
        <DxReferenceSelector label="Cliente" options={cuentas} value={probe.cuenta_id}
          onChange={value => probeUpdate('cuenta_id', value)} getLabel={cuentaLabel}
          optionalLabel="Sin cliente" />
        <label className="dx-ui-field"><span>Tipo de unidad</span><select className="dx-ui-select"
          value={probe.tipo_unidad} onChange={event => probeUpdate('tipo_unidad', event.target.value)}>
          <option value="">Selecciona</option>{types.map(type => <option key={type}>{type}</option>)}</select></label>
        <label className="dx-ui-field"><span>Modalidad</span><select className="dx-ui-select"
          value={probe.modalidad} onChange={event => probeUpdate('modalidad', event.target.value)}>
          {['viaje', 'km', 'tonelada', 'hora'].map(value => <option key={value} value={value}>
            {({ viaje: 'Por viaje', km: 'Por km', tonelada: 'Por tonelada', hora: 'Por hora' })[value]}</option>)}</select></label>
        <label className="dx-ui-field"><span>Fecha</span><input type="date" value={probe.fecha}
          onChange={event => probeUpdate('fecha', event.target.value)} /></label>
        <button className="dx-btn primary" disabled={probing || !probe.tipo_unidad}>
          {probing ? 'Consultando…' : 'Resolver tarifa'}</button>
      </form>
      {probeError && <p className="dx-transporte-error" role="alert">{probeError}</p>}
      {probeResult && <div className="dx-transporte-simulator-result" role="status">
        {probeResult.selected ? <><strong>{formatearImporte(probeResult.selected.tarifa,
          probeResult.selected.moneda, probeResult.selected.modalidad)} {probeResult.selected.modalidad}</strong>
          <span>{probeResult.client ? 'Tarifa de cliente' : 'Tarifa base'} · vigente desde
            {' '}{formatearFechaTransporte(probeResult.selected.vigente_desde)} hasta
            {' '}{formatearFechaTransporte(probeResult.selected.vigente_hasta, 'sin fecha final')}.</span>
          {probeResult.base && probeResult.client && <small>La base para comparar sería
            {' '}{formatearImporte(probeResult.base.tarifa, probeResult.base.moneda,
              probeResult.base.modalidad)}.</small>}</>
          : <strong>Sin tarifa para esa combinación</strong>}
      </div>}
    </section>
    <section className="dx-ui-card dx-transporte-list"><div className="dx-ui-toolbar">
      <h2>Tarifas registradas</h2><span className="dx-ui-count">{etiquetaContador(filtered.length, 'tarifa')}</span>
      <DxBuscador value={query} onChange={setQuery} placeholder="Buscar ruta, cliente o unidad" />
      <DxFiltroMoneda value={currency} onChange={setCurrency} />
      <select className="dx-ui-select" aria-label="Filtrar modalidad" value={mode}
        onChange={event => setMode(event.target.value)}><option value="">Todas las modalidades</option>
        {['viaje', 'km', 'tonelada', 'hora'].map(value => <option key={value} value={value}>
          {({ viaje: 'Por viaje', km: 'Por km', tonelada: 'Por tonelada', hora: 'Por hora' })[value]}</option>)}</select>
      <select className="dx-ui-select" aria-label="Filtrar vigencia" value={validity}
        onChange={event => { setValidity(event.target.value); setExactDate(''); }}>
          {['vigente', 'futura', 'vencida', 'inactiva', 'todas'].map(value =>
          <option key={value} value={value}>{({ vigente: 'Vigentes', futura: 'Futuras',
            vencida: 'Vencidas', inactiva: 'Inactivas', todas: 'Todas' })[value]}</option>)}</select>
      <DxFechaExacta value={exactDate} onChange={value => {
        setExactDate(value); if (value) setValidity('');
      }} />
    </div>
    {loading ? <p className="dx-ui-empty">Cargando tarifas…</p>
      : error ? <p className="dx-ui-empty">{error} <button onClick={reload}>Reintentar</button></p>
        : !groups.length ? <p className="dx-ui-empty">No hay tarifas que coincidan con los filtros.</p>
          : groups.map(group => <TarifaGrupo key={group.route?.id || 'sin-ruta'} ruta={group.route}
            tarifas={group.rows} today={today} onCreate={routeId => open(null, routeId)}
            onEdit={open} />)}
    </section>
    {notice && <div className="dx-transporte-notice" role="status">{notice}
      <button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}
    <ModalShell open={modal} title={form.id ? 'Editar tarifa' : 'Nueva tarifa'}
      subtitle="Define los criterios y el periodo de aplicación." variant="dx-modal dx-transporte-modal"
      titleClassName="dx-modal-title" subtitleClassName="dx-modal-subtitle" closeClassName="dx-modal-close"
      dirty={JSON.stringify(form) !== modalBaseline} busy={saving} onClose={() => setModal(false)}
      footer={(form.id ? access.editar : access.crear) && <button form="tariff-form" type="submit"
        className="dx-btn primary" disabled={saving}>Guardar</button>}>
      {modal && <form id="tariff-form" className="dx-transporte-form" onSubmit={save}>
        <div className="dx-ui-form-grid">
          <DxReferenceSelector label="Ruta" options={rutas} value={form.ruta_id}
            onChange={value => update('ruta_id', value)} getLabel={item => `${item.codigo} · ${item.nombre}`}
            optionalLabel="Todas las rutas" name="ruta_id" error={fieldErrors.ruta_id} />
          <DxReferenceSelector label="Cliente" options={cuentas} value={form.cuenta_id}
            onChange={value => update('cuenta_id', value)} getLabel={cuentaLabel} optionalLabel="Tarifa base"
            name="cuenta_id" error={fieldErrors.cuenta_id} />
          <label className="dx-ui-field"><span>Tipo de unidad</span><select className="dx-ui-select"
            value={form.tipo_unidad} onChange={event => update('tipo_unidad', event.target.value)}>
            <option value="">Selecciona unidad</option>{types.map(type => <option key={type}>{type}</option>)}</select>
            {fieldErrors.tipo_unidad && <small className="dx-ui-field-error">{fieldErrors.tipo_unidad}</small>}</label>
          <label className="dx-ui-field"><span>Modalidad</span><select className="dx-ui-select"
            value={form.modalidad} onChange={event => update('modalidad', event.target.value)}>
            {['viaje', 'km', 'tonelada', 'hora'].map(value => <option key={value} value={value}>
              {({ viaje: 'Por viaje', km: 'Por km', tonelada: 'Por tonelada', hora: 'Por hora' })[value]}</option>)}</select>
          </label>
          <FormField label="Precio" name="tarifa" type="number" min="0.0001" step="0.0001"
            value={form.tarifa} onChange={event => update('tarifa', event.target.value)} error={fieldErrors.tarifa} />
          <label className="dx-ui-field"><span>Moneda</span><select className="dx-ui-select"
            value={form.moneda} onChange={event => update('moneda', event.target.value)}>
            <option value="PEN">PEN (S/)</option><option value="USD">USD (US$)</option></select></label>
          <FormField label="Mínimo facturable" type="number" min="0" step="0.01"
            value={form.minimo_facturable} onChange={event => update('minimo_facturable', event.target.value)}
            error={fieldErrors.minimo_facturable} />
          <FormField label="Vigente desde" type="date" value={form.vigente_desde}
            onChange={event => update('vigente_desde', event.target.value)} error={fieldErrors.vigente_desde} />
          <FormField label="Vigente hasta" type="date" value={form.vigente_hasta}
            onChange={event => update('vigente_hasta', event.target.value)} error={fieldErrors.vigente_hasta} />
          <label className="dx-ui-field"><span>Estado</span><select className="dx-ui-select"
            value={form.estado} onChange={event => update('estado', event.target.value)}>
            <option value="activa">Activa</option><option value="inactiva">Inactiva</option></select></label>
          <label className="dx-ui-field dx-ui-field-full"><span>Notas</span><textarea value={form.notas || ''}
            onChange={event => update('notas', event.target.value)} /></label>
        </div>
        {formError && <p className="dx-transporte-error" role="alert">{formError}</p>}
        {form.id && access.editar && form.estado === 'activa' && <button type="button"
          className="dx-btn" onClick={() => setAnnulTarget(form)}>Anular tarifa</button>}
        {annulTarget && <div className="dx-transporte-confirm"><section role="alertdialog" aria-modal="true">
          <h2>¿Anular tarifa?</h2><p>La tarifa dejará de estar activa.</p>
          <button type="button" className="dx-btn" onClick={() => setAnnulTarget(null)}>Volver</button>
          <button type="button" className="dx-btn primary" disabled={saving}
            onClick={() => annul(annulTarget)}>Confirmar anulación</button>
        </section></div>}
      </form>}
    </ModalShell>
  </section>;
}
