import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { ModalShell } from '../../components/ModalShell.jsx';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import { actualizarRuta, cambiarEstadoRuta, crearRuta, listarRutas } from '../../../services/transporteRutasService.js';
import { listarTarifas } from '../../../services/transporteTarifasService.js';
import { listarLugares } from '../../../services/transporteLugaresService.js';
import { listarViajes } from '../../../services/transporteViajesService.js';
import { formatearImporte, formatearNumeroTransporte, validarFormularioRuta } from './transporteUtils.js';
import { LugarEditorModal } from './LugarEditorModal.jsx';

const BLANK = {
  codigo: '', nombre: '', origen_nombre: '', origen_lugar_id: null,
  origen_direccion: '', origen_ubigeo: '', origen_latitud: '', origen_longitud: '',
  destino_nombre: '', destino_lugar_id: null, destino_direccion: '',
  destino_ubigeo: '', destino_latitud: '', destino_longitud: '',
  distancia_km: '', duracion_estimada_horas: '', tipo_carga_habitual: '',
  peajes_estimados: '', moneda_peajes: 'PEN', notas: '', estado: 'activa',
};

function RouteState({ state }) {
  const active = state === 'activa';
  return <span className={`dx-ui-pill ${active ? 'is-green' : 'is-gray'}`}>
    <i />{active ? 'Activa' : 'Inactiva'}
  </span>;
}

function RouteField({ label, name, form, updateField, type = 'text', required = false, error }) {
  const errorId = `route-${name}-error`;
  return <label className="dx-ui-field">
    <span>{label}{required && <span className="dx-ui-required"> *</span>}</span>
    <input name={name} type={type} step={type === 'number' ? 'any' : undefined}
      value={form[name] ?? ''}
      required={required} aria-invalid={Boolean(error)}
      aria-describedby={error ? errorId : undefined}
      onChange={event => updateField(name, event.target.value)} />
    {error && <small className="dx-ui-field-error" id={errorId} role="alert">{error}</small>}
  </label>;
}

function PlaceStop({ type, name, address, ubigeo }) {
  return <div className="dx-transporte-rutas-stop">
    <span className="dx-transporte-rutas-stop-dot" aria-hidden="true" />
    <div><small>{type}</small><strong>{name || 'Sin lugar vinculado'}</strong>
      <span>{address || 'Sin dirección'}</span>
      {ubigeo && <small>Ubigeo {ubigeo}</small>}
    </div>
  </div>;
}

function placeLabel(place) {
  return `${place.nombre}${place.direccion ? ` · ${place.direccion}` : ''}`;
}

function hasCurrentMonth(date) {
  if (!date) return false;
  const value = new Date(date);
  const today = new Date();
  return value.getFullYear() === today.getFullYear()
    && value.getMonth() === today.getMonth();
}

export function MaestroRutasPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [rutas, setRutas] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [lugares, setLugares] = useState([]);
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [routeConfirm, setRouteConfirm] = useState(false);
  const [placeSide, setPlaceSide] = useState('');

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setError('');
    try {
      const [routes, tariffs, places, trips] = await Promise.all([
        listarRutas(empresaId), listarTarifas(empresaId),
        listarLugares(empresaId), listarViajes(empresaId),
      ]);
      setRutas(routes);
      setTarifas(tariffs);
      setLugares(places);
      setViajes(trips);
      setSelectedId(current => routes.some(route => route.id === current)
        ? current : routes[0]?.id || '');
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar las rutas.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, access.ver]);

  useEffect(() => { reload(); }, [reload]);

  const tariffsByRoute = useMemo(() => tarifas.reduce((result, tariff) => {
    if (tariff.ruta_id) result[tariff.ruta_id] = [...(result[tariff.ruta_id] || []), tariff];
    return result;
  }, {}), [tarifas]);
  const placesById = useMemo(() => new Map(lugares.map(place => [place.id, place])), [lugares]);
  const filtered = useMemo(() => filtrarBusquedaInteligente(rutas, query), [rutas, query]);
  const selected = filtered.find(route => route.id === selectedId) || filtered[0] || null;
  const monthTrips = viajes.filter(trip => trip.ruta_id === selected?.id
    && hasCurrentMonth(trip.fecha_programada)).length;
  const selectedTariffs = selected ? tariffsByRoute[selected.id] || [] : [];
  const selectedOrigin = placesById.get(selected?.origen_lugar_id);
  const selectedDestination = placesById.get(selected?.destino_lugar_id);

  if (access.motivo) return <AccesoTransporte acceso={access} />;

  function open(route = null) {
    setForm(route ? {
      ...BLANK, ...route,
      distancia_km: route.distancia_km ?? '',
      duracion_estimada_horas: route.duracion_estimada_horas ?? '',
      peajes_estimados: route.peajes_estimados ?? '',
      origen_latitud: route.origen_latitud ?? '',
      origen_longitud: route.origen_longitud ?? '',
      destino_latitud: route.destino_latitud ?? '',
      destino_longitud: route.destino_longitud ?? '',
    } : { ...BLANK });
    setModal(route || {});
    setFormError('');
    setFieldErrors({});
  }

  function updateField(name, value) {
    setForm(current => ({ ...current, [name]: value }));
    setFieldErrors(current => ({ ...current, [name]: '' }));
  }

  function selectPlace(side, id) {
    const prefix = side === 'origen' ? 'origen' : 'destino';
    const place = placesById.get(id);
    setForm(current => ({
      ...current,
      [`${prefix}_lugar_id`]: place?.id || null,
      ...(place ? {
        [`${prefix}_nombre`]: place.nombre,
        [`${prefix}_direccion`]: place.direccion || '',
        [`${prefix}_ubigeo`]: place.ubigeo || '',
        [`${prefix}_latitud`]: place.latitud ?? '',
        [`${prefix}_longitud`]: place.longitud ?? '',
      } : {}),
    }));
  }

  async function save(event) {
    event.preventDefault();
    const errors = validarFormularioRuta(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError('Revisa los campos indicados.');
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    setFormError('');
    const payload = {
      ...form,
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      origen_nombre: form.origen_nombre.trim(),
      destino_nombre: form.destino_nombre.trim(),
      origen_lugar_id: form.origen_lugar_id || null,
      destino_lugar_id: form.destino_lugar_id || null,
    };
    for (const key of ['distancia_km', 'duracion_estimada_horas', 'peajes_estimados',
      'origen_latitud', 'origen_longitud', 'destino_latitud', 'destino_longitud']) {
      payload[key] = payload[key] === '' ? null : Number(payload[key]);
    }
    try {
      const saved = modal?.id
        ? await actualizarRuta(empresaId, modal.id, payload)
        : await crearRuta(empresaId, payload);
      setModal(null);
      setSelectedId(saved.id);
      setNotice('Ruta guardada.');
      await reload();
    } catch (saveError) {
      setFormError(saveError.message || 'No se pudo guardar la ruta.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRoute() {
    if (!modal?.id) return;
    const next = form.estado === 'activa' ? 'inactiva' : 'activa';
    setSaving(true);
    try {
      await cambiarEstadoRuta(empresaId, modal.id, next);
      setRouteConfirm(false);
      setModal(null);
      setNotice(`Ruta ${next === 'activa' ? 'activada' : 'inactivada'}.`);
      await reload();
    } catch (toggleError) {
      setFormError(toggleError.message || 'No se pudo cambiar el estado.');
    } finally {
      setSaving(false);
    }
  }

  function handlePlaceCreated(place) {
    setLugares(current => [...current.filter(item => item.id !== place.id), place]);
    const prefix = placeSide === 'origen' ? 'origen' : 'destino';
    setForm(current => ({
      ...current,
      [`${prefix}_lugar_id`]: place.id,
      [`${prefix}_nombre`]: place.nombre,
      [`${prefix}_direccion`]: place.direccion || '',
      [`${prefix}_ubigeo`]: place.ubigeo || '',
      [`${prefix}_latitud`]: place.latitud ?? '',
      [`${prefix}_longitud`]: place.longitud ?? '',
    }));
    setPlaceSide('');
  }

  return (
    <section className="dx-ui dx-transporte dx-transporte-rutas">
      <header className="dx-ui-head-page">
        <div><div className="dx-ui-eyebrow">Transporte Comercial</div>
          <h1 className="dx-ui-title">Maestro de Rutas</h1>
          <p className="dx-ui-sub">Administra los trayectos, sus puntos y tarifas relacionadas.</p>
        </div>
        {access.crear && <button type="button" className="dx-btn primary" onClick={() => open()}>
          Nueva ruta
        </button>}
      </header>

      {notice && <div className="dx-transporte-notice" role="status">
        {notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button>
      </div>}
      {error && <div className="dx-transporte-error" role="alert">{error}
        <button type="button" onClick={reload}>Reintentar</button>
      </div>}

      <div className="dx-transporte-rutas-layout">
        <section className="dx-ui-card dx-transporte-rutas-list" aria-label="Lista de rutas">
          <div className="dx-ui-toolbar">
            <h2>Rutas <span className="dx-ui-count">{filtered.length}</span></h2>
            <DxBuscador value={query} onChange={setQuery}
              placeholder="Buscar código, nombre o lugar" label="Buscar rutas" />
          </div>
          <div className="dx-transporte-rutas-rows">
            {loading && <div className="dx-ui-empty" role="status">Cargando rutas…</div>}
            {!loading && !rutas.length && <div className="dx-ui-empty">Aún no hay rutas registradas.</div>}
            {!loading && rutas.length > 0 && !filtered.length && (
              <div className="dx-ui-empty">No hay rutas que coincidan con la búsqueda.</div>
            )}
            {filtered.map(route => {
              const count = (tariffsByRoute[route.id] || []).length;
              return <div key={route.id}
                className={`dx-transporte-rutas-row${selected?.id === route.id ? ' selected' : ''}`}
                role="button" tabIndex={0} aria-pressed={selected?.id === route.id}
                onClick={() => setSelectedId(route.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(route.id);
                  }
                }}>
                <div className="dx-transporte-rutas-row-heading">
                  <strong>{route.codigo} · {route.nombre}</strong>
                  <span className={`dx-ui-pill ${route.estado === 'activa' ? 'is-green' : 'is-gray'}`}>
                    {route.estado === 'activa' ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <small>{route.origen_nombre || 'Sin origen'} → {route.destino_nombre || 'Sin destino'}</small>
                <div className="dx-transporte-rutas-row-meta">
                  <span>{route.distancia_km == null ? 'Sin km' : `${formatearNumeroTransporte(route.distancia_km)} km`}</span>
                  <span>{route.duracion_estimada_horas == null ? 'Sin duración' : `${route.duracion_estimada_horas} h`}</span>
                  <span>{count} {count === 1 ? 'tarifa' : 'tarifas'}</span>
                </div>
              </div>;
            })}
          </div>
        </section>

        <article className="dx-ui-card dx-transporte-rutas-detail">
          {!selected ? <div className="dx-ui-empty">Selecciona una ruta para ver el detalle.</div> : <>
            <header className="dx-transporte-rutas-detail-head">
              <div><div className="dx-ui-eyebrow">Ruta {selected.codigo}</div>
                <h2>{selected.nombre}</h2></div>
              <div className="dx-ui-actions"><RouteState state={selected.estado} />
                {access.editar && <button type="button" className="dx-btn"
                  onClick={() => open(selected)}>Editar</button>}
              </div>
            </header>
            <div className="dx-transporte-rutas-stops">
              <PlaceStop type="Origen"
                name={selectedOrigin?.nombre || selected.origen_nombre}
                address={selectedOrigin?.direccion || selected.origen_direccion}
                ubigeo={selectedOrigin?.ubigeo || selected.origen_ubigeo} />
              <PlaceStop type="Destino"
                name={selectedDestination?.nombre || selected.destino_nombre}
                address={selectedDestination?.direccion || selected.destino_direccion}
                ubigeo={selectedDestination?.ubigeo || selected.destino_ubigeo} />
            </div>
            <dl className="dx-transporte-rutas-facts">
              <div><dt>Distancia</dt><dd>{selected.distancia_km == null
                ? 'Sin dato' : `${formatearNumeroTransporte(selected.distancia_km)} km`}</dd></div>
              <div><dt>Duración estimada</dt>
                <dd>{selected.duracion_estimada_horas == null
                  ? 'Sin dato' : `${selected.duracion_estimada_horas} h`}</dd>
                <small>Usada para la agenda</small>
              </div>
              <div><dt>Peajes</dt>
                <dd>{formatearImporte(selected.peajes_estimados, selected.moneda_peajes)}</dd>
              </div>
              <div><dt>Viajes del mes</dt><dd>{monthTrips}</dd></div>
            </dl>
            <section className="dx-transporte-rutas-tariffs">
              <header><h3>Tarifas de la ruta</h3>
                <a className="dx-btn" href="#/transporte-tarifas-config">Ver en Tarifas</a>
              </header>
              {selectedTariffs.length ? <div className="dx-transporte-rutas-table-wrap">
                <table><thead><tr><th>Cliente</th><th>Unidad</th><th>Modalidad</th>
                  <th>Tarifa</th><th>Vigencia</th><th>Estado</th></tr></thead>
                  <tbody>{selectedTariffs.map(tariff => <tr key={tariff.id}>
                    <td>{tariff.cuenta?.nombre_comercial || tariff.cuenta?.razon_social
                      || (tariff.cuenta_id ? 'Cliente' : 'General')}</td>
                    <td>{tariff.tipo_unidad}</td><td>{tariff.modalidad}</td>
                    <td>{formatearImporte(tariff.tarifa, tariff.moneda, tariff.modalidad)}</td>
                    <td>{tariff.vigente_desde || 'Sin inicio'} – {tariff.vigente_hasta || 'Sin fin'}</td>
                    <td>{tariff.estado || 'Sin estado'}</td>
                  </tr>)}</tbody>
                </table>
              </div> : <p className="dx-ui-empty">Esta ruta aún no tiene tarifas.</p>}
            </section>
          </>}
        </article>
      </div>

      <ModalShell open={Boolean(modal)}
        title={modal?.id ? `Editar ruta ${modal.codigo}` : 'Nueva ruta'}
        subtitle="Completa los datos del trayecto." variant="dx-modal dx-transporte-modal"
        titleClassName="dx-modal-title" subtitleClassName="dx-modal-subtitle"
        closeClassName="dx-modal-close" dirty={Boolean(modal
          && JSON.stringify(form) !== JSON.stringify(modal.id ? {
            ...BLANK, ...modal,
            distancia_km: modal.distancia_km ?? '',
            duracion_estimada_horas: modal.duracion_estimada_horas ?? '',
            peajes_estimados: modal.peajes_estimados ?? '',
            origen_latitud: modal.origen_latitud ?? '',
            origen_longitud: modal.origen_longitud ?? '',
            destino_latitud: modal.destino_latitud ?? '',
            destino_longitud: modal.destino_longitud ?? '',
          } : BLANK))} busy={saving} onClose={() => setModal(null)}
        footer={<div className="dx-ui-actions">
          {modal?.id && access.editar && <button type="button" className="dx-btn"
            onClick={() => setRouteConfirm(true)} disabled={saving}>
            {form.estado === 'activa' ? 'Inactivar ruta' : 'Activar ruta'}
          </button>}
          <button type="submit" form="route-form" className="dx-btn primary"
            disabled={saving || (modal?.id ? !access.editar : !access.crear)}>
            {saving ? 'Guardando…' : 'Guardar ruta'}
          </button>
        </div>}>
        {modal && <div className="card-body"><form id="route-form"
          className="dx-transporte-form" onSubmit={save}>
          <div className="dx-ui-form-grid">
            {routeConfirm && <div className="dx-transporte-confirm">
              <section role="alertdialog" aria-modal="true">
                <h2>{form.estado === 'activa' ? '¿Inactivar ruta?' : '¿Activar ruta?'}</h2>
                <p>Confirma el cambio de estado de esta ruta.</p>
                <button type="button" className="dx-btn" onClick={() => setRouteConfirm(false)}>
                  Volver</button>
                <button type="button" className="dx-btn primary" disabled={saving}
                  onClick={toggleRoute}>Confirmar</button>
              </section>
            </div>}
            <div className="dx-transporte-form-section">Datos de la ruta</div>
            <RouteField label="Código" name="codigo" form={form}
              updateField={updateField} required error={fieldErrors.codigo} />
            <RouteField label="Nombre" name="nombre" form={form}
              updateField={updateField} required error={fieldErrors.nombre} />
            <div className="dx-transporte-form-section">Origen</div>
            <div className="dx-transporte-rutas-place-picker">
              <DxReferenceSelector label="Lugar de origen" name="origen_lugar_id"
                options={lugares} value={form.origen_lugar_id || ''}
                onChange={id => selectPlace('origen', id)} getLabel={placeLabel}
                optionalLabel="Sin lugar vinculado" placeholder="Buscar lugar de origen" />
              <button type="button" className="dx-btn"
                onClick={() => setPlaceSide('origen')}>Crear lugar nuevo</button>
            </div>
            <RouteField label="Nombre de origen" name="origen_nombre" form={form}
              updateField={updateField} required error={fieldErrors.origen_nombre} />
            <RouteField label="Dirección de origen" name="origen_direccion" form={form} updateField={updateField} />
            <RouteField label="Ubigeo de origen" name="origen_ubigeo" form={form} updateField={updateField} />
            <RouteField label="Latitud de origen" name="origen_latitud" form={form}
              updateField={updateField} type="number" error={fieldErrors.origen_latitud} />
            <RouteField label="Longitud de origen" name="origen_longitud" form={form}
              updateField={updateField} type="number" error={fieldErrors.origen_longitud} />
            <div className="dx-transporte-form-section">Destino</div>
            <div className="dx-transporte-rutas-place-picker">
              <DxReferenceSelector label="Lugar de destino" name="destino_lugar_id"
                options={lugares} value={form.destino_lugar_id || ''}
                onChange={id => selectPlace('destino', id)} getLabel={placeLabel}
                optionalLabel="Sin lugar vinculado" placeholder="Buscar lugar de destino" />
              <button type="button" className="dx-btn"
                onClick={() => setPlaceSide('destino')}>Crear lugar nuevo</button>
            </div>
            <RouteField label="Nombre de destino" name="destino_nombre" form={form}
              updateField={updateField} required error={fieldErrors.destino_nombre} />
            <RouteField label="Dirección de destino" name="destino_direccion" form={form} updateField={updateField} />
            <RouteField label="Ubigeo de destino" name="destino_ubigeo" form={form} updateField={updateField} />
            <RouteField label="Latitud de destino" name="destino_latitud" form={form}
              updateField={updateField} type="number" error={fieldErrors.destino_latitud} />
            <RouteField label="Longitud de destino" name="destino_longitud" form={form}
              updateField={updateField} type="number" error={fieldErrors.destino_longitud} />
            <div className="dx-transporte-form-section">Operación</div>
            <RouteField label="Distancia (km)" name="distancia_km" form={form}
              updateField={updateField} type="number" error={fieldErrors.distancia_km} />
            <RouteField label="Duración estimada (horas)" name="duracion_estimada_horas" form={form}
              updateField={updateField} type="number" error={fieldErrors.duracion_estimada_horas} />
            <RouteField label="Peajes estimados" name="peajes_estimados" form={form}
              updateField={updateField} type="number" error={fieldErrors.peajes_estimados} />
            <RouteField label="Tipo de carga habitual" name="tipo_carga_habitual" form={form} updateField={updateField} />
            <label className="dx-ui-field"><span>Moneda de peajes</span>
              <select className="dx-ui-select" value={form.moneda_peajes}
                onChange={event => updateField('moneda_peajes', event.target.value)}>
                <option value="PEN">PEN (S/)</option><option value="USD">USD (US$)</option>
              </select>
            </label>
            <label className="dx-ui-field"><span>Estado</span>
              <select className="dx-ui-select" value={form.estado}
                onChange={event => updateField('estado', event.target.value)}>
                <option value="activa">Activa</option><option value="inactiva">Inactiva</option>
              </select>
            </label>
            <label className="dx-ui-field dx-ui-field-full"><span>Notas</span>
              <textarea rows="3" value={form.notas || ''}
                onChange={event => updateField('notas', event.target.value)} />
            </label>
          </div>
          {formError && <div className="dx-transporte-error" role="alert">{formError}</div>}
        </form></div>}
      </ModalShell>

      <LugarEditorModal open={Boolean(placeSide)} lugar={null} cuentas={[]}
        empresaId={empresaId} onClose={() => setPlaceSide('')}
        onSaved={handlePlaceCreated}
        onError={saveError => setFormError(saveError.message || 'No se pudo guardar el lugar.')} />
    </section>
  );
}
