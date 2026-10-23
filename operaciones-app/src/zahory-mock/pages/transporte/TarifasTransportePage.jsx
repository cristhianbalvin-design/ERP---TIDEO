import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { ModalShell } from '../../components/ModalShell.jsx';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { DxFechaExacta } from '../../components/dx/DxFechaExacta.jsx';
import { DxFiltroMoneda } from '../../components/dx/DxFiltroMoneda.jsx';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import {
  listarRutas,
} from '../../../services/transporteRutasService.js';
import {
  actualizarTarifa,
  cambiarEstadoTarifa,
  crearTarifa,
  listarCuentasTransporte,
  listarTarifas,
  listarTiposUnidadTransporte,
  resolverTarifa,
} from '../../../services/transporteTarifasService.js';
import {
  enriquecerTarifas,
  estadoVigencia,
  etiquetaModalidad,
  fechaActualLocal,
  formatearImporte,
  validarFormularioTarifa,
} from './transporteUtils.js';

const UNIT_DEFAULTS = [
  'Camioneta',
  'Furgón',
  'Camión 2 ejes',
  'Camión 3 ejes',
  'Tracto con semirremolque',
  'Cama baja',
];

const BLANK = {
  ruta_id: null,
  cuenta_id: null,
  tipo_unidad: '',
  modalidad: 'km',
  tarifa: '',
  moneda: '',
  minimo_facturable: '',
  vigente_desde: '',
  vigente_hasta: '',
  estado: 'activa',
  notas: '',
};

const LABELS = {
  vigente: 'Vigente',
  futura: 'Futura',
  vencida: 'Vencida',
  inactiva: 'Inactiva',
};

const PILL = {
  vigente: 'is-green',
  futura: 'is-amber',
  vencida: 'is-red',
  inactiva: 'is-gray',
};

function Field({ label, children, ...props }) {
  return (
    <label className="dx-transporte-field">
      {label}
      <input {...props} />
      {children}
    </label>
  );
}

const cuentaLabel = account => (
  account?.nombre_comercial || account?.razon_social || account?.id || 'Cuenta'
);

export function TarifasTransportePage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [tarifas, setTarifas] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [unitTypes, setUnitTypes] = useState(UNIT_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState('');
  const [mode, setMode] = useState('');
  const [validity, setValidity] = useState('vigente');
  const [exactDate, setExactDate] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [probe, setProbe] = useState({
    ruta_id: null,
    cuenta_id: null,
    tipo_unidad: '',
    modalidad: 'km',
    moneda: '',
    fecha: fechaActualLocal(),
  });
  const [probeResult, setProbeResult] = useState(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState('');

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setError('');

    try {
      const [tariffRows, routeRows, accountRows, types] = await Promise.all([
        listarTarifas(empresaId),
        listarRutas(empresaId),
        listarCuentasTransporte(empresaId),
        listarTiposUnidadTransporte(empresaId),
      ]);
      setTarifas(tariffRows);
      setRutas(routeRows);
      setCuentas(accountRows);
      setUnitTypes([...new Set([...UNIT_DEFAULTS, ...types])]);
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar las tarifas.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, access.ver]);

  useEffect(() => {
    reload();
  }, [reload]);

  const today = fechaActualLocal();
  const futureLimit = new Date();
  futureLimit.setDate(futureLimit.getDate() + 30);
  const date30 = fechaActualLocal(futureLimit);
  const activeToday = tarifas.filter(tariff => estadoVigencia(tariff, today) === 'vigente');
  const due30 = activeToday.filter(tariff => (
    tariff.vigente_hasta
    && tariff.vigente_hasta >= today
    && tariff.vigente_hasta <= date30
  )).length;
  const enriched = useMemo(
    () => enriquecerTarifas(tarifas, rutas, cuentas),
    [tarifas, rutas, cuentas],
  );
  const filtered = useMemo(
    () => filtrarBusquedaInteligente(enriched, query).filter(tariff => (
      (!currency || tariff.moneda === currency)
      && (!mode || tariff.modalidad === mode)
      && (exactDate
        ? estadoVigencia(tariff, exactDate) === 'vigente'
        : !validity || validity === 'todas' || estadoVigencia(tariff, today) === validity)
    )),
    [enriched, query, currency, mode, exactDate, validity, today],
  );

  function open(item) {
    const nextForm = item
      ? {
        ...BLANK,
        ...item,
        tarifa: String(item.tarifa ?? ''),
        minimo_facturable: item.minimo_facturable ?? '',
        vigente_hasta: item.vigente_hasta || '',
      }
      : { ...BLANK, vigente_desde: today };

    setForm(nextForm);
    setFormError('');
    setModal(true);
  }

  async function save(event) {
    event.preventDefault();
    const errors = validarFormularioTarifa(form);
    if (Object.keys(errors).length) {
      setFormError(Object.values(errors)[0]);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ruta_id: form.ruta_id || null,
        cuenta_id: form.cuenta_id || null,
        tipo_unidad: form.tipo_unidad.trim(),
        modalidad: form.modalidad,
        tarifa: Number(form.tarifa),
        moneda: form.moneda,
        minimo_facturable: form.minimo_facturable === ''
          ? null
          : Number(form.minimo_facturable),
        vigente_desde: form.vigente_desde,
        vigente_hasta: form.vigente_hasta || null,
        estado: form.estado,
        notas: form.notas || null,
      };

      if (form.id) {
        await actualizarTarifa(empresaId, form.id, payload);
      } else {
        await crearTarifa(empresaId, payload);
      }
      setModal(false);
      setNotice('Tarifa guardada.');
      await reload();
    } catch (saveError) {
      setFormError(saveError.message || 'No se pudo guardar la tarifa.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item) {
    const next = item.estado === 'activa' ? 'inactiva' : 'activa';
    const action = next === 'activa' ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Deseas ${action} esta tarifa?`)) return;

    try {
      await cambiarEstadoTarifa(empresaId, item.id, next);
      await reload();
    } catch (toggleError) {
      setError(toggleError.message || 'No se pudo cambiar el estado.');
    }
  }

  async function runProbe(event) {
    event.preventDefault();
    setProbing(true);
    setProbeError('');
    setProbeResult(null);

    try {
      const result = await resolverTarifa({
        empresaId,
        ...probe,
        rutaId: probe.ruta_id,
        cuentaId: probe.cuenta_id,
        tipoUnidad: probe.tipo_unidad,
        fecha: probe.fecha,
      });
      setProbeResult(result || false);
    } catch (probeFailure) {
      setProbeError(probeFailure.message || 'No se pudo resolver la tarifa.');
    } finally {
      setProbing(false);
    }
  }

  function priority(item) {
    if (item.ruta_id && item.cuenta_id) return 'Ruta y cliente';
    if (item.cuenta_id) return 'Cliente';
    if (item.ruta_id) return 'Ruta';
    return 'Base';
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;

  return (
    <section className="dx-ui dx-transporte dx-transporte-tarifas">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Transporte Comercial</div>
          <h1 className="dx-ui-title">Tarifas Transporte</h1>
          <p className="dx-ui-sub">Configura tarifas por ruta, cliente, unidad y modalidad.</p>
        </div>
        <div className="dx-ui-actions">
          {access.crear && (
            <button className="dx-btn primary" onClick={() => open(null)}>
              Nueva tarifa
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className="dx-transporte-notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <div className="dx-ui-summary">
        <div className="dx-ui-chip"><b>{tarifas.length}</b><span>Total de tarifas</span></div>
        <div className="dx-ui-chip"><b>{activeToday.length}</b><span>Vigentes hoy</span></div>
        <div className="dx-ui-chip"><b>{due30}</b><span>Por vencer en 30 días</span></div>
        <div className="dx-ui-chip">
          <b>{tarifas.filter(tariff => Boolean(tariff.cuenta_id)).length}</b>
          <span>Específicas por cliente</span>
        </div>
      </div>

      <div className="dx-ui-card dx-transporte-list">
        <div className="dx-ui-toolbar">
          <h2>Tarifas registradas</h2>
          <span className="dx-ui-count">{filtered.length} tarifas</span>
          <DxBuscador
            value={query}
            onChange={setQuery}
            placeholder="Buscar ruta, cliente, unidad…"
          />
          <DxFiltroMoneda value={currency} onChange={setCurrency} />
          <select
            aria-label="Filtrar modalidad"
            value={mode}
            onChange={event => setMode(event.target.value)}
          >
            <option value="">Todas las modalidades</option>
            <option value="viaje">Por viaje</option>
            <option value="km">Por km</option>
            <option value="tonelada">Por tonelada</option>
            <option value="hora">Por hora</option>
          </select>
          <select
            aria-label="Filtrar vigencia"
            value={validity}
            onChange={event => {
              setValidity(event.target.value);
              setExactDate('');
            }}
          >
            <option value="vigente">Vigentes hoy</option>
            <option value="futura">Futuras</option>
            <option value="vencida">Vencidas</option>
            <option value="inactiva">Inactivas</option>
            <option value="todas">Todas</option>
          </select>
          <DxFechaExacta
            value={exactDate}
            onChange={value => {
              setExactDate(value);
              if (value) setValidity('');
            }}
          />
        </div>

        <div className="dx-ui-head dx-transporte-tariff-cols" aria-hidden="true">
          <span>Ruta / cliente</span>
          <span>Unidad / modalidad</span>
          <span>Tarifa</span>
          <span>Mínimo</span>
          <span>Vigencia</span>
          <span>Estado</span>
          <span />
        </div>

        {loading ? (
          <div className="dx-ui-empty">Cargando tarifas…</div>
        ) : error ? (
          <div className="dx-ui-empty">
            {error}
            <button onClick={reload}>Reintentar</button>
          </div>
        ) : !tarifas.length ? (
          <div className="dx-ui-empty">Aún no hay tarifas registradas.</div>
        ) : !filtered.length ? (
          <div className="dx-ui-empty">No hay tarifas que coincidan con los filtros.</div>
        ) : filtered.map(tariff => {
          const state = estadoVigencia(tariff, today);

          return (
            <div
              key={tariff.id}
              className="dx-ui-row dx-transporte-tariff-cols"
              role="button"
              tabIndex="0"
              onClick={() => open(tariff)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  open(tariff);
                }
              }}
              aria-label={`Editar tarifa de ${tariff.route_name}`}
            >
              <span className="dx-transporte-route-main">
                <b>{tariff.route_name}</b>
                <small>{tariff.cuenta_name}</small>
              </span>
              <span>
                {tariff.tipo_unidad}
                <small className="dx-transporte-subline">
                  {etiquetaModalidad(tariff.modalidad)}
                </small>
              </span>
              <span>
                {formatearImporte(tariff.tarifa, tariff.moneda, tariff.modalidad)}
              </span>
              <span>
                {tariff.minimo_facturable == null
                  ? '—'
                  : formatearImporte(
                    tariff.minimo_facturable,
                    tariff.moneda,
                    tariff.modalidad,
                  )}
              </span>
              <span>
                {tariff.vigente_desde} → {tariff.vigente_hasta || '∞'}
              </span>
              <span>
                <span className={`dx-ui-pill ${PILL[state]}`}>
                  <i />
                  {LABELS[state]}
                </span>
              </span>
              <span className="dx-ui-arrow">›</span>
            </div>
          );
        })}
      </div>

      <section className="dx-transporte-probe">
        <div>
          <h2>Probar tarifa</h2>
          <p>Consulta la tarifa aplicable y su nivel de prioridad.</p>
        </div>
        <form onSubmit={runProbe}>
          <DxReferenceSelector
            label="Ruta"
            options={rutas}
            loading={loading}
            value={probe.ruta_id}
            onChange={value => setProbe(current => ({ ...current, ruta_id: value }))}
            getLabel={route => `${route.codigo} · ${route.nombre}`}
            optionalLabel="Todas las rutas"
          />
          <DxReferenceSelector
            label="Cliente"
            options={cuentas}
            loading={loading}
            value={probe.cuenta_id}
            onChange={value => setProbe(current => ({ ...current, cuenta_id: value }))}
            getLabel={cuentaLabel}
            optionalLabel="Tarifa base"
          />
          <label className="dx-transporte-field">
            Tipo de unidad
            <select
              value={probe.tipo_unidad}
              onChange={event => setProbe(current => ({
                ...current,
                tipo_unidad: event.target.value,
              }))}
            >
              <option value="">Selecciona</option>
              {unitTypes.map(type => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="dx-transporte-field">
            Modalidad
            <select
              value={probe.modalidad}
              onChange={event => setProbe(current => ({
                ...current,
                modalidad: event.target.value,
              }))}
            >
              <option value="viaje">Por viaje</option>
              <option value="km">Por km</option>
              <option value="tonelada">Por tonelada</option>
              <option value="hora">Por hora</option>
            </select>
          </label>
          <label className="dx-transporte-field">
            Moneda
            <select
              value={probe.moneda}
              onChange={event => setProbe(current => ({ ...current, moneda: event.target.value }))}
            >
              <option value="">Cualquiera</option>
              <option value="PEN">PEN</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="dx-transporte-field">
            Fecha
            <input
              type="date"
              value={probe.fecha}
              onChange={event => setProbe(current => ({ ...current, fecha: event.target.value }))}
            />
          </label>
          <button className="dx-btn primary" disabled={probing || !probe.tipo_unidad}>
            {probing ? 'Consultando…' : 'Resolver tarifa'}
          </button>
        </form>
        {probeError && <p className="dx-transporte-error" role="alert">{probeError}</p>}
        {probeResult === false && (
          <div className="dx-transporte-probe-result" role="status">
            No hay una tarifa que coincida con esos criterios.
          </div>
        )}
        {probeResult && probeResult !== false && (
          <div className="dx-transporte-probe-result" role="status">
            <b>{formatearImporte(probeResult.tarifa, probeResult.moneda, probeResult.modalidad)}</b>
            <span>Se aplicaría por prioridad: {priority(probeResult)}.</span>
          </div>
        )}
        {probeResult === null && !probing && !probeError && probe.tipo_unidad && (
          <div className="dx-transporte-probe-result">
            Completa los criterios y resuelve para ver el resultado.
          </div>
        )}
      </section>

      <ModalShell
        open={modal}
        title={form.id ? 'Editar tarifa' : 'Nueva tarifa'}
        subtitle="Define los criterios y el periodo de aplicación."
        variant="dx-modal"
        dirty={modal && JSON.stringify(form) !== JSON.stringify(
          form.id
            ? {
              ...BLANK,
              ...tarifas.find(tariff => tariff.id === form.id),
              tarifa: String(tarifas.find(tariff => tariff.id === form.id)?.tarifa ?? ''),
              minimo_facturable: tarifas.find(tariff => tariff.id === form.id)
                ?.minimo_facturable ?? '',
              vigente_hasta: tarifas.find(tariff => tariff.id === form.id)
                ?.vigente_hasta || '',
            }
            : { ...BLANK, vigente_desde: today },
        )}
        busy={saving}
        onClose={() => setModal(false)}
        footer={(form.id ? access.editar : access.crear) && (
          <button form="tariff-form" type="submit" className="dx-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      >
        {modal && (
          <div className="card-body">
            <form id="tariff-form" className="dx-transporte-form" onSubmit={save}>
              <div className="dx-transporte-form-grid">
                <DxReferenceSelector
                  label="Ruta"
                  options={rutas}
                  loading={loading}
                  value={form.ruta_id}
                  onChange={value => setForm(current => ({ ...current, ruta_id: value }))}
                  getLabel={route => `${route.codigo} · ${route.nombre}`}
                  optionalLabel="Todas las rutas"
                />
                <DxReferenceSelector
                  label="Cliente"
                  options={cuentas}
                  loading={loading}
                  value={form.cuenta_id}
                  onChange={value => setForm(current => ({ ...current, cuenta_id: value }))}
                  getLabel={cuentaLabel}
                  optionalLabel="Tarifa base"
                />
                <label className="dx-transporte-field">
                  Tipo de unidad
                  <input
                    list="transporte-unit-types"
                    value={form.tipo_unidad}
                    onChange={event => setForm(current => ({
                      ...current,
                      tipo_unidad: event.target.value,
                    }))}
                  />
                  <datalist id="transporte-unit-types">
                    {unitTypes.map(type => <option key={type} value={type} />)}
                  </datalist>
                </label>
                <label className="dx-transporte-field">
                  Modalidad
                  <select
                    value={form.modalidad}
                    onChange={event => setForm(current => ({
                      ...current,
                      modalidad: event.target.value,
                    }))}
                  >
                    <option value="viaje">Por viaje</option>
                    <option value="km">Por km</option>
                    <option value="tonelada">Por tonelada</option>
                    <option value="hora">Por hora</option>
                  </select>
                </label>
                <Field
                  label="Tarifa"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={form.tarifa}
                  onChange={event => setForm(current => ({ ...current, tarifa: event.target.value }))}
                />
                <label className="dx-transporte-field">
                  Moneda
                  <select
                    required
                    value={form.moneda}
                    onChange={event => setForm(current => ({ ...current, moneda: event.target.value }))}
                  >
                    <option value="">Selecciona moneda</option>
                    <option value="PEN">PEN (S/)</option>
                    <option value="USD">USD (US$)</option>
                  </select>
                </label>
                <Field
                  label="Mínimo facturable"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimo_facturable}
                  onChange={event => setForm(current => ({
                    ...current,
                    minimo_facturable: event.target.value,
                  }))}
                />
                <Field
                  label="Vigente desde"
                  type="date"
                  value={form.vigente_desde}
                  onChange={event => setForm(current => ({
                    ...current,
                    vigente_desde: event.target.value,
                  }))}
                />
                <Field
                  label="Vigente hasta"
                  type="date"
                  value={form.vigente_hasta}
                  onChange={event => setForm(current => ({
                    ...current,
                    vigente_hasta: event.target.value,
                  }))}
                >
                  <small>Vacío = sin fecha final</small>
                </Field>
                <label className="dx-transporte-field">
                  Estado
                  <select
                    value={form.estado}
                    onChange={event => setForm(current => ({ ...current, estado: event.target.value }))}
                  >
                    <option value="activa">Activa</option>
                    <option value="inactiva">Inactiva</option>
                  </select>
                </label>
                <label className="dx-transporte-field dx-transporte-wide">
                  Notas
                  <textarea
                    rows="3"
                    value={form.notas || ''}
                    onChange={event => setForm(current => ({ ...current, notas: event.target.value }))}
                  />
                </label>
              </div>
              {formError && <div className="dx-transporte-error" role="alert">{formError}</div>}
            </form>
            {form.id && access.editar && (
              <button
                className="dx-btn"
                type="button"
                onClick={() => toggle(form)}
                disabled={saving}
              >
                {form.estado === 'activa' ? 'Desactivar tarifa' : 'Activar tarifa'}
              </button>
            )}
          </div>
        )}
      </ModalShell>
    </section>
  );
}
