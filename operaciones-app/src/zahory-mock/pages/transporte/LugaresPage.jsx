import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { listarLugares } from '../../../services/transporteLugaresService.js';
import { listarRutas } from '../../../services/transporteRutasService.js';
import { listarCuentasTransporte } from '../../../services/transporteTarifasService.js';
import { listarViajes } from '../../../services/transporteViajesService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';
import { LugarEditorModal, TIPOS_LUGAR } from './LugarEditorModal.jsx';
import { LugarDetalle } from './LugarDetalle.jsx';

const TYPE_ICONS = {
  almacen: '\u25a4',
  planta: '\u2302',
  obra: '\u2692',
  mina: '\u25c8',
  puerto: '\u2693',
  cliente: '\u25ce',
  otro: '\u2316',
};

function cuentaLabel(cuenta) {
  return cuenta?.nombre_comercial || cuenta?.razon_social || 'Cliente';
}

function isCurrentMonth(date) {
  if (!date) return false;
  const value = new Date(date);
  const now = new Date();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
}

export function LugaresPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [lugares, setLugares] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [viajes, setViajes] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('todos');
  const [cuentaId, setCuentaId] = useState('');
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setError('');
    try {
      const [places, clients, trips, routes] = await Promise.all([
        listarLugares(empresaId),
        listarCuentasTransporte(empresaId),
        listarViajes(empresaId),
        listarRutas(empresaId),
      ]);
      setLugares(places);
      setCuentas(clients);
      setViajes(trips);
      setRutas(routes);
      setSelectedId(current => places.some(place => place.id === current)
        ? current : places[0]?.id || '');
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar los lugares.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, access.ver]);

  useEffect(() => { reload(); }, [reload]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return lugares.filter(place => {
      const byScope = scope === 'todos'
        || (scope === 'cliente' ? Boolean(place.cuenta_id) : !place.cuenta_id);
      const byClient = !cuentaId || place.cuenta_id === cuentaId;
      const searchText = [place.nombre, place.direccion, place.referencia,
        place.distrito, place.provincia, place.ubigeo].filter(Boolean).join(' ').toLocaleLowerCase();
      return byScope && byClient && (!term || searchText.includes(term));
    });
  }, [lugares, scope, cuentaId, query]);

  const selected = visible.find(place => place.id === selectedId) || visible[0] || null;
  const accountsById = useMemo(() => new Map(cuentas.map(account => [account.id, account])), [cuentas]);
  const monthTrips = viajes.filter(trip => isCurrentMonth(trip.fecha_programada));
  function tripsThisMonthFor(place) {
    const routeIds = new Set(rutas.filter(route => (
      route.origen_lugar_id === place.id || route.destino_lugar_id === place.id
    )).map(route => route.id));
    return monthTrips.filter(trip => routeIds.has(trip.ruta_id)
      || trip.origen_nombre === place.nombre || trip.destino_nombre === place.nombre).length;
  }
  const tripsForPlace = place => viajes.filter(trip => (
    trip.origen_nombre === place.nombre || trip.destino_nombre === place.nombre
    || rutas.some(route => (route.origen_lugar_id === place.id
      || route.destino_lugar_id === place.id) && route.id === trip.ruta_id)
  )).length;
  const routesForPlace = place => rutas.filter(route => (
    route.origen_lugar_id === place.id || route.destino_lugar_id === place.id
  )).length;

  if (access.motivo) return <AccesoTransporte acceso={access} />;

  function handleSaved(lugar, meta = {}) {
    setEditor(null);
    setNotice(meta.inactivated ? 'Lugar inactivado.' : 'Lugar guardado.');
    reload();
    if (!meta.inactivated && lugar?.id) setSelectedId(lugar.id);
  }

  const isEmpty = !loading && !error && lugares.length === 0;

  return (
    <section className="dx-ui dx-transporte dx-transporte-lugares">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Transporte Comercial</div>
          <h1 className="dx-ui-title">Lugares</h1>
          <p className="dx-ui-sub">Administra almacenes, plantas y puntos de recojo o entrega.</p>
        </div>
        {access.crear && <button type="button" className="dx-btn primary" onClick={() => setEditor({ lugar: null })}>
          Nuevo lugar
        </button>}
      </header>

      {notice && <div className="dx-transporte-notice" role="status">
        {notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button>
      </div>}
      {error && <div className="dx-transporte-error" role="alert">{error}
        <button type="button" onClick={reload}>Reintentar</button>
      </div>}

      <div className="dx-transporte-lugares-layout">
        <section className="dx-ui-card dx-transporte-lugares-list" aria-label="Lista de lugares">
          <div className="dx-ui-toolbar">
            <h2>Lugares <span className="dx-ui-count">{visible.length}</span></h2>
            <DxBuscador value={query} onChange={setQuery} placeholder="Buscar lugar" label="Buscar lugares" />
            <DxReferenceSelector label="Filtrar por cliente" name="filtro-cuenta"
              options={cuentas} value={cuentaId} onChange={value => setCuentaId(value || '')}
              getLabel={cuentaLabel} optionalLabel="Todos los clientes"
              placeholder="Buscar cliente" />
          </div>
          <nav className="dx-transporte-lugares-tabs" aria-label="Tipo de lugar">
            {[
              ['todos', 'Todos'], ['cliente', 'Del cliente'], ['general', 'Generales'],
            ].map(([value, label]) => <button type="button" key={value}
              className={scope === value ? 'active' : ''} aria-pressed={scope === value}
              onClick={() => setScope(value)}>{label}</button>)}
          </nav>
          <div className="dx-transporte-lugares-rows">
            {loading ? <div className="dx-ui-empty" role="status">Cargando lugares…</div> : null}
            {isEmpty && <div className="dx-ui-empty dx-transporte-lugares-empty">
              <strong>Aún no hay lugares</strong>
              {access.crear && <button type="button" className="dx-btn primary"
                onClick={() => setEditor({ lugar: null })}>Nuevo lugar</button>}
            </div>}
            {!loading && lugares.length > 0 && visible.length === 0 && (
              <div className="dx-ui-empty">No hay lugares que coincidan con los filtros.</div>
            )}
            {visible.map(place => {
              const account = accountsById.get(place.cuenta_id);
              const location = [place.distrito, place.provincia].filter(Boolean).join(' / ');
              const chosen = selected?.id === place.id;
              return <div key={place.id}
                className={`dx-transporte-lugares-row${chosen ? ' selected' : ''}`}
                role="button" tabIndex={0} aria-pressed={chosen}
                aria-label={`Ver lugar ${place.nombre}`}
                onClick={() => setSelectedId(place.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(place.id);
                  }
                }}>
                <span className="dx-transporte-lugares-icon" aria-hidden="true">
                  {TYPE_ICONS[place.tipo] || TYPE_ICONS.otro}
                </span>
                <span className="dx-transporte-lugares-row-main">
                  <strong>{place.nombre}</strong>
                  <small>{account ? cuentaLabel(account) : 'General'} · {location || 'Sin distrito / provincia'}</small>
                  <span className="dx-transporte-lugares-row-meta">
                    <span className="dx-ui-pill is-cyan">{TIPOS_LUGAR[place.tipo] || 'Otro'}</span>
                    <small>{tripsForPlace(place)} viajes</small>
                  </span>
                </span>
              </div>;
            })}
          </div>
        </section>

        <LugarDetalle
          lugar={selected}
          cuentaNombre={selected?.cuenta_id ? cuentaLabel(accountsById.get(selected.cuenta_id)) : 'General'}
          viajesMes={selected ? tripsThisMonthFor(selected) : 0}
          rutasCount={selected ? routesForPlace(selected) : 0}
          canEdit={access.editar}
          onEdit={() => setEditor({ lugar: selected })}
        />
      </div>

      <LugarEditorModal
        open={Boolean(editor)}
        lugar={editor?.lugar}
        cuentas={cuentas}
        empresaId={empresaId}
        onClose={() => setEditor(null)}
        onSaved={handleSaved}
        onError={saveError => setError(saveError.message || 'No se pudo guardar el lugar.')}
      />
    </section>
  );
}
