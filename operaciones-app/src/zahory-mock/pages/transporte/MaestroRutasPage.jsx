import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import { listarRutas } from '../../../services/transporteRutasService.js';
import { listarCuentasTransporte, listarTarifas } from '../../../services/transporteTarifasService.js';
import { listarLugares } from '../../../services/transporteLugaresService.js';
import { listarViajes } from '../../../services/transporteViajesService.js';
import {
  diasParaVencimientoTarifa, estadoVigencia, etiquetaModalidad, formatearFechaTransporte,
  formatearImporte, formatearNumeroTransporte,
} from './transporteUtils.js';
import { RutaComposer } from './RutaComposer.jsx';

function RouteState({ state }) {
  const active = state === 'activa';
  return <span className={`dx-ui-pill ${active ? 'is-green' : 'is-gray'}`}>
    <i />{active ? 'Activa' : 'Inactiva'}
  </span>;
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
  const [cuentas, setCuentas] = useState([]);
  const [lugares, setLugares] = useState([]);
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);

  const reload = useCallback(async (preferredId = '') => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setError('');
    try {
      const [routes, tariffs, accounts, places, trips] = await Promise.all([
        listarRutas(empresaId), listarTarifas(empresaId),
        listarCuentasTransporte(empresaId), listarLugares(empresaId), listarViajes(empresaId),
      ]);
      setRutas(routes);
      setTarifas(tariffs);
      setCuentas(accounts);
      setLugares(places);
      setViajes(trips);
      setSelectedId(current => routes.some(route => route.id === preferredId)
        ? preferredId : routes.some(route => route.id === current) ? current : routes[0]?.id || '');
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
  const cuentasById = useMemo(() => new Map(cuentas.map(account => [account.id, account])), [cuentas]);
  const filtered = useMemo(() => filtrarBusquedaInteligente(rutas, query), [rutas, query]);
  const selected = filtered.find(route => route.id === selectedId) || filtered[0] || null;
  const monthTrips = viajes.filter(trip => trip.ruta_id === selected?.id
    && hasCurrentMonth(trip.fecha_programada)).length;
  const selectedTariffs = selected ? tariffsByRoute[selected.id] || [] : [];
  const selectedOrigin = placesById.get(selected?.origen_lugar_id);
  const selectedDestination = placesById.get(selected?.destino_lugar_id);

  if (access.motivo) return <AccesoTransporte acceso={access} />;

  function open(route = null) {
    setEditingRoute(route || null);
    setComposerOpen(true);
  }

  async function handleComposerCreated(result, placeCreated = false) {
    if (placeCreated) {
      setLugares(current => [...current.filter(item => item.id !== result.id), result]);
      return;
    }
    setComposerOpen(false);
    setEditingRoute(null);
    await reload(result.ruta_id || result.id);
    setNotice(editingRoute ? `Ruta ${result.codigo} actualizada.` : `Ruta ${result.codigo} creada${result.codigo_regreso
      ? ` y su regreso ${result.codigo_regreso}` : ''}.`);
  }

  function viewDuplicateRoute(routeId) {
    setComposerOpen(false);
    setQuery('');
    setSelectedId(routeId);
  }

  return (
    <section className="dx-ui dx-transporte dx-transporte-rutas">
      <header className="dx-ui-head-page">
        <div><div className="dx-ui-eyebrow">Transporte Comercial</div>
          <h1 className="dx-ui-title">Maestro de Rutas</h1>
          <p className="dx-ui-sub">Administra los trayectos, sus puntos y tarifas relacionadas.</p>
        </div>
        <div className="dx-ui-actions">{access.crear && <button type="button" className="dx-btn primary" onClick={() => open()}>
          Nueva ruta
        </button>}</div>
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
              {selectedTariffs.length ? <div className="dx-transporte-rutas-tariff-table"
                style={{ '--dx-route-tariff-columns': 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(120px,.8fr) minmax(0,1.2fr) minmax(120px,.9fr)' }}>
                <div className="dx-transporte-route-tariff-row is-heading"><span>Aplica a</span><span>Unidad</span>
                  <span>Modalidad</span><span className="is-right">Precio</span><span>Vigencia</span><span>Estado</span></div>
                {selectedTariffs.map(tariff => {
                  const state = estadoVigencia(tariff);
                  const due = diasParaVencimientoTarifa(tariff);
                  const stateText = due !== null && due <= 7 ? `Vence en ${due} días`
                    : ({ vigente: 'Vigente', futura: 'Futura', vencida: 'Vencida', inactiva: 'Inactiva' })[state];
                  return <article className="dx-transporte-route-tariff-row" key={tariff.id}>
                    <span className="dx-transporte-tariff-client" data-label="Aplica a">
                      <b>{cuentasById.get(tariff.cuenta_id)?.nombre_comercial
                        || cuentasById.get(tariff.cuenta_id)?.razon_social
                        || (tariff.cuenta_id ? 'Cliente' : 'Tarifa base')}</b>
                      <small>{tariff.cuenta_id ? 'Tarifa de cliente' : 'Todos los clientes'}</small></span>
                    <span data-label="Unidad">{tariff.tipo_unidad || 'Sin dato'}</span>
                    <span data-label="Modalidad">{etiquetaModalidad(tariff.modalidad)}</span>
                    <strong className="is-right" data-label="Precio">{formatearImporte(tariff.tarifa, tariff.moneda, tariff.modalidad)}</strong>
                    <span data-label="Vigencia">{tariff.vigente_desde
                      ? `${formatearFechaTransporte(tariff.vigente_desde)} – ${formatearFechaTransporte(tariff.vigente_hasta, 'Sin fecha final')}`
                      : 'Sin dato'}</span>
                    <span data-label="Estado"><span className={`dx-transporte-state is-${state}`}>{stateText}</span></span>
                  </article>;
                })}
              </div> : <p className="dx-ui-empty">Esta ruta aún no tiene tarifas.</p>}
            </section>
          </>}
        </article>
      </div>

      {composerOpen && <RutaComposer empresaId={empresaId} places={lugares} route={editingRoute}
        tariffs={editingRoute ? tariffsByRoute[editingRoute.id] || [] : []}
        tripCount={editingRoute ? viajes.filter(trip => trip.ruta_id === editingRoute.id).length : 0}
        accounts={cuentas} routes={rutas} onClose={() => { setComposerOpen(false); setEditingRoute(null); }}
        onCreated={handleComposerCreated} onViewRoute={viewDuplicateRoute} />}

    </section>
  );
}
