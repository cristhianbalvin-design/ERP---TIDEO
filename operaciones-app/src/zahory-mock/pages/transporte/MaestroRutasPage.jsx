import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { ModalShell } from '../../components/ModalShell.jsx';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import {
  actualizarRuta,
  cambiarEstadoRuta,
  crearRuta,
  listarRutas,
} from '../../../services/transporteRutasService.js';
import { listarTarifas } from '../../../services/transporteTarifasService.js';
import {
  fechaActualLocal,
  formatearImporte,
  validarFormularioRuta,
} from './transporteUtils.js';

const BLANK = {
  codigo: '',
  nombre: '',
  origen_nombre: '',
  origen_direccion: '',
  origen_ubigeo: '',
  origen_latitud: '',
  origen_longitud: '',
  destino_nombre: '',
  destino_direccion: '',
  destino_ubigeo: '',
  destino_latitud: '',
  destino_longitud: '',
  distancia_km: '',
  duracion_estimada_horas: '',
  tipo_carga_habitual: '',
  peajes_estimados: '',
  moneda_peajes: 'PEN',
  notas: '',
  estado: 'activa',
};

const nullableNumber = value => value === '' ? null : Number(value);
const dateSpan = item => `${item.vigente_desde || '—'} · ${item.vigente_hasta || 'Sin fecha final'}`;

function Pill({ state }) {
  const className = state === 'activa' ? 'is-green' : 'is-gray';
  const label = state === 'activa' ? 'Activa' : 'Inactiva';

  return (
    <span className={`dx-ui-pill ${className}`}>
      <i />
      {label}
    </span>
  );
}

function Field({ label, name, form, setForm, type = 'text', required = false, error, ...props }) {
  return (
    <label className="dx-transporte-field">
      {label}{required && ' *'}
      <input
        type={type}
        value={form[name] ?? ''}
        onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <small>{error}</small>}
    </label>
  );
}

export function MaestroRutasPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [rutas, setRutas] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const canChange = access.crear || access.editar;

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setError('');

    try {
      const [routes, tariffs] = await Promise.all([
        listarRutas(empresaId),
        listarTarifas(empresaId),
      ]);
      setRutas(routes);
      setTarifas(tariffs);
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar las rutas.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, access.ver]);

  useEffect(() => {
    reload();
  }, [reload]);

  const tarifasPorRuta = useMemo(
    () => tarifas.reduce((map, tariff) => {
      if (tariff.ruta_id) {
        map[tariff.ruta_id] = [...(map[tariff.ruta_id] || []), tariff];
      }
      return map;
    }, {}),
    [tarifas],
  );

  const filtered = useMemo(() => {
    const rows = rutas.map(route => ({
      ...route,
      tarifas_busqueda: (tarifasPorRuta[route.id] || []).flatMap(tariff => [
        tariff.tipo_unidad,
        tariff.modalidad,
      ]),
    }));

    return filtrarBusquedaInteligente(rows, query)
      .filter(route => !stateFilter || route.estado === stateFilter);
  }, [rutas, query, stateFilter, tarifasPorRuta]);

  const activeRoutes = rutas.filter(route => route.estado === 'activa');
  const today = fechaActualLocal();
  const routesWithDistance = activeRoutes.filter(route => route.distancia_km != null);
  const averageKm = routesWithDistance.length
    ? routesWithDistance.reduce((sum, route) => sum + (Number(route.distancia_km) || 0), 0)
      / routesWithDistance.length
    : 0;

  function open(route) {
    const values = route
      ? {
        ...BLANK,
        ...route,
        distancia_km: route.distancia_km ?? '',
        duracion_estimada_horas: route.duracion_estimada_horas ?? '',
        peajes_estimados: route.peajes_estimados ?? '',
        origen_latitud: route.origen_latitud ?? '',
        origen_longitud: route.origen_longitud ?? '',
        destino_latitud: route.destino_latitud ?? '',
        destino_longitud: route.destino_longitud ?? '',
      }
      : BLANK;

    setForm(values);
    setFormError('');
    setModal(route || {});
  }

  async function save(event) {
    event.preventDefault();
    const errors = validarFormularioRuta(form);
    if (Object.keys(errors).length) {
      setFormError(Object.values(errors)[0]);
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        origen_nombre: form.origen_nombre.trim(),
        origen_direccion: form.origen_direccion || null,
        origen_ubigeo: form.origen_ubigeo || null,
        origen_latitud: nullableNumber(form.origen_latitud),
        origen_longitud: nullableNumber(form.origen_longitud),
        destino_nombre: form.destino_nombre.trim(),
        destino_direccion: form.destino_direccion || null,
        destino_ubigeo: form.destino_ubigeo || null,
        destino_latitud: nullableNumber(form.destino_latitud),
        destino_longitud: nullableNumber(form.destino_longitud),
        distancia_km: nullableNumber(form.distancia_km),
        duracion_estimada_horas: nullableNumber(form.duracion_estimada_horas),
        tipo_carga_habitual: form.tipo_carga_habitual || null,
        peajes_estimados: nullableNumber(form.peajes_estimados),
        moneda_peajes: form.moneda_peajes,
        notas: form.notas || null,
        estado: form.estado,
      };

      if (modal.id) {
        await actualizarRuta(empresaId, modal.id, payload);
      } else {
        await crearRuta(empresaId, payload);
      }
      setModal(null);
      setNotice('Ruta guardada.');
      await reload();
    } catch (saveError) {
      setFormError(saveError.message || 'No se pudo guardar la ruta.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    if (!modal?.id) return;
    const next = form.estado === 'activa' ? 'inactiva' : 'activa';
    const action = next === 'activa' ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Deseas ${action} esta ruta?`)) return;

    setSaving(true);
    try {
      await cambiarEstadoRuta(empresaId, modal.id, next);
      setModal(null);
      await reload();
    } catch (toggleError) {
      setFormError(toggleError.message || 'No se pudo cambiar el estado.');
    } finally {
      setSaving(false);
    }
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;

  return (
    <section className="dx-ui dx-transporte dx-transporte-rutas">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Transporte Comercial</div>
          <h1 className="dx-ui-title">Maestro de Rutas</h1>
          <p className="dx-ui-sub">Administra los trayectos y sus tarifas relacionadas.</p>
        </div>
        <div className="dx-ui-actions">
          {access.crear && (
            <button className="dx-btn primary" onClick={() => open(null)}>
              Nueva ruta
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
        <div className="dx-ui-chip"><b>{rutas.length}</b><span>Total de rutas</span></div>
        <div className="dx-ui-chip"><b>{activeRoutes.length}</b><span>Activas</span></div>
        <div className="dx-ui-chip">
          <b>{rutas.length - activeRoutes.length}</b>
          <span>Inactivas</span>
        </div>
        <div className="dx-ui-chip">
          <b>{averageKm.toFixed(1)} km</b>
          <span>Promedio activas</span>
        </div>
      </div>

      <div className="dx-ui-card dx-transporte-list">
        <div className="dx-ui-toolbar">
          <h2>Rutas registradas</h2>
          <span className="dx-ui-count">{filtered.length} rutas</span>
          <DxBuscador
            value={query}
            onChange={setQuery}
            placeholder="Buscar código, origen, destino…"
          />
          <select
            aria-label="Filtrar por estado"
            value={stateFilter}
            onChange={event => setStateFilter(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="activa">Activas</option>
            <option value="inactiva">Inactivas</option>
          </select>
        </div>

        <div className="dx-ui-head dx-transporte-route-cols" aria-hidden="true">
          <span>Ruta</span>
          <span>Distancia / duración</span>
          <span>Carga habitual</span>
          <span>Peajes</span>
          <span>Tarifas vigentes</span>
          <span>Estado</span>
          <span />
        </div>

        {loading ? (
          <div className="dx-ui-empty">Cargando rutas…</div>
        ) : error ? (
          <div className="dx-ui-empty">
            {error}
            <button onClick={reload}>Reintentar</button>
          </div>
        ) : !rutas.length ? (
          <div className="dx-ui-empty">Aún no hay rutas registradas.</div>
        ) : !filtered.length ? (
          <div className="dx-ui-empty">No hay rutas que coincidan con la búsqueda.</div>
        ) : filtered.map(route => {
          const currentTariffs = tarifasPorRuta[route.id] || [];
          const currentTariffsCount = currentTariffs.filter(tariff => (
            tariff.estado === 'activa'
            && tariff.vigente_desde <= today
            && (!tariff.vigente_hasta || tariff.vigente_hasta >= today)
          )).length;

          return (
            <div
              key={route.id}
              className="dx-ui-row dx-transporte-route-cols"
              role="button"
              tabIndex="0"
              onClick={() => open(route)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  open(route);
                }
              }}
              aria-label={`Abrir ruta ${route.codigo} ${route.nombre}`}
            >
              <span className="dx-transporte-route-main">
                <b>{route.codigo}</b>
                <strong>{route.origen_nombre} → {route.destino_nombre}</strong>
                <small>
                  {route.nombre}
                  {route.origen_ubigeo || route.destino_ubigeo
                    ? ` · ${route.origen_ubigeo || '—'} → ${route.destino_ubigeo || '—'}`
                    : ''}
                </small>
              </span>
              <span>
                {route.distancia_km ?? '—'} km · {route.duracion_estimada_horas ?? '—'} h
              </span>
              <span>{route.tipo_carga_habitual || '—'}</span>
              <span>{formatearImporte(route.peajes_estimados, route.moneda_peajes)}</span>
              <span>{currentTariffsCount}</span>
              <span><Pill state={route.estado} /></span>
              <span className="dx-ui-arrow">›</span>
            </div>
          );
        })}
      </div>

      <ModalShell
        open={Boolean(modal)}
        title={modal?.id ? `Ruta ${modal.codigo}` : 'Nueva ruta'}
        subtitle="Completa los datos del trayecto."
        variant="dx-modal"
        dirty={Boolean(modal && JSON.stringify(form) !== JSON.stringify(
          modal.id
            ? {
              ...BLANK,
              ...modal,
              distancia_km: modal.distancia_km ?? '',
              duracion_estimada_horas: modal.duracion_estimada_horas ?? '',
              peajes_estimados: modal.peajes_estimados ?? '',
              origen_latitud: modal.origen_latitud ?? '',
              origen_longitud: modal.origen_longitud ?? '',
              destino_latitud: modal.destino_latitud ?? '',
              destino_longitud: modal.destino_longitud ?? '',
            }
            : BLANK,
        ))}
        busy={saving}
        onClose={() => setModal(null)}
        footer={canChange && (
          <button
            form="route-form"
            type="submit"
            className="dx-btn primary"
            disabled={saving || (modal?.id ? !access.editar : !access.crear)}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      >
        {modal && (
          <div className="card-body">
            <form id="route-form" className="dx-transporte-form" onSubmit={save}>
              <div className="dx-transporte-form-grid">
                <Field
                  label="Código"
                  name="codigo"
                  form={form}
                  setForm={setForm}
                  required
                  error={formError && !form.codigo ? formError : ''}
                />
                <Field label="Nombre de ruta" name="nombre" form={form} setForm={setForm} required />
                <Field label="Origen" name="origen_nombre" form={form} setForm={setForm} required />
                <Field label="Dirección de origen" name="origen_direccion" form={form} setForm={setForm} />
                <Field label="Ubigeo de origen" name="origen_ubigeo" form={form} setForm={setForm} />
                <Field
                  label="Latitud de origen"
                  name="origen_latitud"
                  form={form}
                  setForm={setForm}
                  type="number"
                  step="any"
                />
                <Field
                  label="Longitud de origen"
                  name="origen_longitud"
                  form={form}
                  setForm={setForm}
                  type="number"
                  step="any"
                />
                <Field label="Destino" name="destino_nombre" form={form} setForm={setForm} required />
                <Field label="Dirección de destino" name="destino_direccion" form={form} setForm={setForm} />
                <Field label="Ubigeo de destino" name="destino_ubigeo" form={form} setForm={setForm} />
                <Field
                  label="Latitud de destino"
                  name="destino_latitud"
                  form={form}
                  setForm={setForm}
                  type="number"
                  step="any"
                />
                <Field
                  label="Longitud de destino"
                  name="destino_longitud"
                  form={form}
                  setForm={setForm}
                  type="number"
                  step="any"
                />
                <Field
                  label="Distancia (km)"
                  name="distancia_km"
                  form={form}
                  setForm={setForm}
                  type="number"
                  min="0"
                  step="any"
                />
                <Field
                  label="Duración estimada (horas)"
                  name="duracion_estimada_horas"
                  form={form}
                  setForm={setForm}
                  type="number"
                  min="0"
                  step="any"
                />
                <Field
                  label="Tipo de carga habitual"
                  name="tipo_carga_habitual"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Peajes estimados"
                  name="peajes_estimados"
                  form={form}
                  setForm={setForm}
                  type="number"
                  min="0"
                  step="any"
                />
                <label className="dx-transporte-field">
                  Moneda de peajes
                  <select
                    value={form.moneda_peajes}
                    onChange={event => setForm(value => ({
                      ...value,
                      moneda_peajes: event.target.value,
                    }))}
                  >
                    <option value="PEN">PEN (S/)</option>
                    <option value="USD">USD (US$)</option>
                  </select>
                </label>
                <label className="dx-transporte-field">
                  Estado
                  <select
                    value={form.estado}
                    onChange={event => setForm(value => ({ ...value, estado: event.target.value }))}
                  >
                    <option value="activa">Activa</option>
                    <option value="inactiva">Inactiva</option>
                  </select>
                </label>
                <label className="dx-transporte-field dx-transporte-wide">
                  Notas
                  <textarea
                    value={form.notas}
                    onChange={event => setForm(value => ({ ...value, notas: event.target.value }))}
                    rows="3"
                  />
                </label>
              </div>
              {formError && <div className="dx-transporte-error" role="alert">{formError}</div>}
            </form>

            {modal.id && (
              <section className="dx-transporte-related">
                <h3>Tarifas de esta ruta</h3>
                {(tarifasPorRuta[modal.id] || []).slice(0, 5).map(tariff => (
                  <div key={tariff.id}>
                    <b>{tariff.modalidad}</b> · {tariff.tipo_unidad} ·{' '}
                    {formatearImporte(tariff.tarifa, tariff.moneda, tariff.modalidad)} ·{' '}
                    {dateSpan(tariff)}
                  </div>
                ))}
                {!(tarifasPorRuta[modal.id] || []).length && (
                  <p>Esta ruta aún no tiene tarifas asociadas.</p>
                )}
              </section>
            )}

            {modal.id && access.editar && (
              <button type="button" className="dx-btn" onClick={toggle} disabled={saving}>
                {form.estado === 'activa' ? 'Desactivar ruta' : 'Activar ruta'}
              </button>
            )}
          </div>
        )}
      </ModalShell>
    </section>
  );
}
