import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { crearLugar } from '../../../services/transporteLugaresService.js';
import { siguienteCodigoRuta, guardarRutaCompuesta } from '../../../services/transporteRutasService.js';
import {
  catalogoTiposUnidad, estimarTrayecto, fechaActualLocal, parsearCoordenadasMaps,
  validarComposerRuta,
} from './transporteUtils.js';

const CARGAS = ['General', 'Refrigerada', 'Peligrosa', 'Granel', 'Sobredimensionada'];
const PLACE_TYPES = {
  almacen: 'Almacén', planta: 'Planta', obra: 'Obra', mina: 'Mina',
  puerto: 'Puerto', cliente: 'Cliente', otro: 'Otro',
};
const PLACE_ICONS = {
  almacen: '▦', planta: '⚙', obra: '⌖', mina: '◆', puerto: '⚓', cliente: '♙', otro: '⌖',
};
const ICON = L.divIcon({
  className: 'dx-transporte-composer-marker',
  html: '<span></span>', iconSize: [24, 32], iconAnchor: [12, 30],
});
const BLANK = {
  origen_lugar_id: '', destino_lugar_id: '', codigo: '', nombre: '', codigo_regreso: '',
  nombre_regreso: '', distancia_km: '', duracion_estimada_horas: '', tipo_carga_habitual: '',
  numero_peajes: '', peajes_estimados: '', moneda_peajes: 'PEN', notas: '',
  tarifa: { tipo_unidad: '', modalidad: 'viaje', tarifa: '', moneda: 'PEN',
    minimo_facturable: '', vigente_desde: fechaActualLocal() },
};
const NEW_PLACE = {
  nombre: '', tipo: 'otro', cuenta_id: '', direccion: '', latitud: '', longitud: '',
};

function MapClick({ onPick }) {
  useMapEvents({ click: event => onPick(event.latlng) });
  return null;
}

function FitRoute({ points }) {
  const map = useMap();
  const previous = useRef('');
  useEffect(() => {
    if (!points.length) return;
    const key = points.map(point => point.join(',')).join('|');
    if (key === previous.current) return;
    previous.current = key;
    if (points.length === 1) map.flyTo(points[0], Math.max(map.getZoom(), 8));
    else map.fitBounds(points, { padding: [32, 32], maxZoom: 10 });
  }, [map, points]);
  return null;
}

function Field({ label, name, value, onChange, error, required, type = 'text', ...props }) {
  const id = `composer-${name.replaceAll('.', '-')}`;
  return <label className={`dx-ui-field${error ? ' is-invalid' : ''}`} htmlFor={id}>
    <span>{label}{required && <b className="dx-ui-required"> *</b>}</span>
    <input id={id} type={type} value={value == null ? '' : value}
      aria-required={required || undefined} aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={event => onChange(event.target.value)} {...props} />
    {error && <small className="dx-ui-field-error" id={`${id}-error`}>{error}</small>}
  </label>;
}

function PlaceSearch({ side, places, accounts, value, onSelect, onCreate, error, recents }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = places.find(place => place.id === value);
  const filtered = places.filter(place => `${place.nombre} ${place.direccion || ''}`
    .toLocaleLowerCase('es-PE').includes(query.toLocaleLowerCase('es-PE')));
  const groups = [
    ['Recientes', filtered.filter(place => recents.includes(place.id))],
    ...accounts.map(account => [`Cliente · ${account.nombre_comercial || account.razon_social}`,
      filtered.filter(place => place.cuenta_id === account.id && !recents.includes(place.id))]),
    ['Lugares generales', filtered.filter(place => !place.cuenta_id && !recents.includes(place.id))],
  ].filter(([, rows]) => rows.length);
  const options = groups.flatMap(([, rows]) => rows);
  const title = side === 'origen' ? '¿Desde dónde sale?' : '¿Hacia dónde va?';
  function choose(place) {
    onSelect(place);
    setQuery('');
    setOpen(false);
  }
  return <div className="dx-transporte-composer-stop">
    <span className={`dx-transporte-composer-pin ${side}`} aria-hidden="true">
      {side === 'origen' ? 'A' : 'B'}
    </span>
    <div className="dx-transporte-composer-search">
      <label className="dx-ui-field"><span>{title}<b className="dx-ui-required"> *</b></span>
        <div className={`dx-transporte-composer-combo${error ? ' is-invalid' : ''}`}>
          <input id={`composer-${side}_lugar_id`} aria-label={title}
            aria-required="true" aria-invalid={Boolean(error)}
            aria-describedby={error ? `composer-${side}-error` : undefined}
            value={selected ? selected.nombre : query}
            placeholder="Buscar lugar..." onClick={() => setOpen(true)}
            onChange={event => {
              if (selected) onSelect(null);
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActive(index => open ? Math.min(index + 1, options.length - 1) : 0);
              }
              if (event.key === 'Enter' && open && options[active]) {
                event.preventDefault(); choose(options[active]);
              }
              if (event.key === 'Escape') setOpen(false);
            }} />
          {selected && <button type="button" className="dx-transporte-composer-clear"
            aria-label={`Quitar ${side}`} onClick={() => { onSelect(null); setQuery(''); }}>×</button>}
          {open && <div className="dx-transporte-composer-pop" role="listbox">
            {groups.map(([group, rows]) => <div key={group}>
              <div className="dx-transporte-composer-group">{group}</div>
              {rows.map(place => <button type="button" role="option" key={place.id}
                aria-selected={value === place.id} className="dx-transporte-composer-option"
                onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}>
                <span aria-hidden="true">{PLACE_ICONS[place.tipo] || '⌖'}</span>
                <span><b>{place.nombre}</b><small>{place.direccion || 'Sin dirección'}</small></span>
                {place.latitud == null || place.longitud == null ? <em>Sin GPS</em> : null}
              </button>)}
            </div>)}
            {!options.length && <p className="dx-transporte-composer-empty">No encontramos lugares.</p>}
            <button type="button" className="dx-transporte-composer-option is-new"
              onMouseDown={event => event.preventDefault()} onClick={() => { setOpen(false); onCreate(); }}>
              <span aria-hidden="true">＋</span><b>Crear lugar</b>
            </button>
          </div>}
        </div>
      </label>
      {selected && <small className="dx-transporte-composer-address">{selected.direccion || 'Sin dirección'}</small>}
      {error && <small id={`composer-${side}-error`} className="dx-ui-field-error">{error}</small>}
    </div>
  </div>;
}

function NewPlace({ accounts, form, setForm, onDirty, onCancel, onSave, saving, error }) {
  function set(key, value) {
    onDirty();
    setForm(current => ({ ...current, [key]: value }));
  }
  function useLink(value) {
    set('map_url', value);
    const point = parsearCoordenadasMaps(value);
    if (point) setForm(current => ({ ...current, map_url: value, ...point }));
  }
  return <section className="dx-transporte-composer-new-place">
    <h3>Crear lugar <button type="button" aria-label="Cancelar creación de lugar"
      className="dx-transporte-composer-clear" onClick={onCancel}>×</button></h3>
    <Field label="Nombre" name="lugar-nombre" value={form.nombre} required
      onChange={value => set('nombre', value)} />
    <div className="dx-transporte-composer-grid">
      <label className="dx-ui-field"><span>Tipo <b className="dx-ui-required">*</b></span>
        <select value={form.tipo} onChange={event => set('tipo', event.target.value)}>
          {Object.entries(PLACE_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="dx-ui-field"><span>Cliente (opcional)</span>
        <select value={form.cuenta_id} onChange={event => set('cuenta_id', event.target.value)}>
          <option value="">Lugar general</option>
          {accounts.map(account => <option key={account.id} value={account.id}>
            {account.nombre_comercial || account.razon_social}
          </option>)}
        </select>
      </label>
    </div>
    <Field label="Dirección" name="lugar-direccion" value={form.direccion}
      onChange={value => set('direccion', value)} />
    <Field label="Enlace de Google Maps" name="lugar-maps" value={form.map_url || ''}
      placeholder="Pega un enlace con coordenadas" onChange={useLink} />
    {!form.latitud && <small className="dx-ui-field-error">Marca la ubicación en el mapa.</small>}
    <div className="dx-transporte-composer-place-actions">
      <button type="button" className="dx-btn" onClick={onCancel}>Cancelar</button>
      <button type="button" className="dx-btn primary" disabled={saving}
        onClick={onSave}>Guardar lugar y usarlo</button>
    </div>
    {error && <p className="dx-transporte-error" role="alert">{error}</p>}
  </section>;
}

export function RutaComposer({ empresaId, places, accounts, routes, onClose, onCreated, onViewRoute }) {
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [showPlace, setShowPlace] = useState('');
  const [placeForm, setPlaceForm] = useState(NEW_PLACE);
  const [placeError, setPlaceError] = useState('');
  const [placeSaving, setPlaceSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [tarifaActiva, setTarifaActiva] = useState(true);
  const [regreso, setRegreso] = useState(true);
  const [manualEstimate, setManualEstimate] = useState(false);
  const [recents, setRecents] = useState([]);
  const [lastCode, setLastCode] = useState('');
  const [saveError, setSaveError] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const origin = places.find(place => place.id === form.origen_lugar_id);
  const destination = places.find(place => place.id === form.destino_lugar_id);
  const hasGps = origin?.latitud != null && origin?.longitud != null
    && destination?.latitud != null && destination?.longitud != null;
  const types = useMemo(() => catalogoTiposUnidad(), []);
  const center = origin?.latitud != null && origin?.longitud != null
    ? [Number(origin.latitud), Number(origin.longitud)] : [-12.0464, -77.0428];

  useEffect(() => {
    siguienteCodigoRuta(empresaId).then(code => {
      setLastCode(code);
      setForm(current => ({ ...current, codigo: code, codigo_regreso: nextCode(code) }));
    }).catch(error => setSaveError(error.message || 'No se pudo obtener el código.'));
  }, [empresaId]);

  useEffect(() => {
    if (!hasGps) return;
    const estimate = estimarTrayecto(origin, destination);
    if (!estimate) return;
    setForm(current => ({ ...current,
      distancia_km: manualEstimate ? current.distancia_km : String(estimate.distancia_km),
      duracion_estimada_horas: manualEstimate
        ? current.duracion_estimada_horas : String(estimate.duracion_estimada_horas),
    }));
  }, [hasGps, origin?.latitud, origin?.longitud, destination?.latitud,
    destination?.longitud, manualEstimate]);

  useEffect(() => {
    if (!origin || !destination || nameEdited) return;
    setForm(current => ({ ...current,
      nombre: `${origin.nombre} → ${destination.nombre}`,
      nombre_regreso: `${destination.nombre} → ${origin.nombre}`,
    }));
  }, [origin, destination, nameEdited]);

  function update(key, value) {
    setDirty(true);
    setErrors(current => ({ ...current, [key]: '' }));
    setForm(current => ({ ...current, [key]: value }));
  }
  function updateTarifa(key, value) {
    setDirty(true);
    setErrors(current => ({ ...current, [`tarifa.${key}`]: '' }));
    setForm(current => ({ ...current, tarifa: { ...current.tarifa, [key]: value } }));
  }
  function select(side, place) {
    setManualEstimate(false);
    update(`${side}_lugar_id`, place?.id || '');
    if (place) setRecents(current => [place.id, ...current.filter(id => id !== place.id)].slice(0, 5));
  }
  function close() { if (dirty) setDiscard(true); else onClose(); }

  async function savePlace() {
    if (!placeForm.nombre.trim() || !placeForm.latitud || !placeForm.longitud) {
      setPlaceError('Completa el nombre y marca la ubicación en el mapa.');
      return;
    }
    setPlaceSaving(true);
    try {
      const place = await crearLugar(empresaId, {
        nombre: placeForm.nombre.trim(), tipo: placeForm.tipo,
        cuenta_id: placeForm.cuenta_id || null, direccion: placeForm.direccion.trim() || null,
        latitud: Number(placeForm.latitud), longitud: Number(placeForm.longitud),
      });
      onCreated(place, true);
      select(showPlace, place);
      setShowPlace('');
      setPlaceForm(NEW_PLACE);
      setDirty(true);
    } catch (error) {
      setPlaceError(error.message || 'No se pudo guardar el lugar.');
    } finally { setPlaceSaving(false); }
  }

  function validate() {
    const next = validarComposerRuta(form, tarifaActiva);
    if (!hasGps && !form.distancia_km) next.distancia_km = 'Ingresa la distancia sin GPS.';
    if (!hasGps && !form.duracion_estimada_horas) {
      next.duracion_estimada_horas = 'Ingresa la duración sin GPS.';
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) requestAnimationFrame(() => document.getElementById(
      `composer-${first.replaceAll('.', '-')}`)?.focus());
    return !Object.keys(next).length;
  }

  async function save(event) {
    event.preventDefault();
    if (!validate()) return;
    if (!forceDuplicate) {
      const match = routes.find(route => route.estado === 'activa'
        && route.origen_lugar_id === form.origen_lugar_id
        && route.destino_lugar_id === form.destino_lugar_id);
      if (match) { setDuplicate(match); return; }
    }
    setSaving(true);
    setSaveError('');
    const ruta = {
      ...form,
      distancia_km: Number(form.distancia_km),
      duracion_estimada_horas: Number(form.duracion_estimada_horas),
      numero_peajes: form.numero_peajes === '' ? null : Number(form.numero_peajes),
      peajes_estimados: form.peajes_estimados === '' ? null : Number(form.peajes_estimados),
      tipo_carga_habitual: form.tipo_carga_habitual || null,
      codigo_regreso: regreso ? form.codigo_regreso : null,
      nombre_regreso: regreso ? form.nombre_regreso : null,
    };
    try {
      const result = await guardarRutaCompuesta(empresaId, ruta, regreso,
        tarifaActiva ? { ...form.tarifa, tarifa: Number(form.tarifa.tarifa),
          minimo_facturable: form.tarifa.minimo_facturable === ''
            ? null : Number(form.tarifa.minimo_facturable) } : null);
      setDirty(false);
      onCreated(result, false);
    } catch (error) {
      setSaveError(error.message || 'No se pudo guardar la ruta.');
    } finally { setSaving(false); }
  }

  const mapPoint = showPlace && placeForm.latitud !== '' && placeForm.longitud !== '' ? {
    lat: Number(placeForm.latitud), lng: Number(placeForm.longitud),
  } : null;
  function pickPoint(point) {
    if (showPlace) {
      setDirty(true);
      setPlaceForm(current => ({ ...current,
        latitud: String(point.lat), longitud: String(point.lng),
      }));
    }
  }
  function dragPoint(event) {
    const point = event.target.getLatLng();
    setDirty(true);
    setPlaceForm(current => ({ ...current,
      latitud: String(point.lat), longitud: String(point.lng),
    }));
  }

  return <div className="dx-transporte-composer-scrim" role="presentation">
    <section className="dx-transporte-composer" role="dialog" aria-modal="true"
      aria-labelledby="composer-title">
      <style>{leafletCss}</style>
      <header className="dx-transporte-composer-head">
        <div><span className="dx-ui-eyebrow">Transporte Comercial</span>
          <h2 id="composer-title">Nueva ruta</h2>
          <p>Define el trayecto y prepara su operación.</p></div>
        <button type="button" className="dx-btn icon" aria-label="Cerrar composer" onClick={close}>×</button>
      </header>
      <div className="dx-transporte-composer-body">
        <form id="composer-form" className="dx-transporte-composer-form"
          noValidate onSubmit={save}>
          <section className="dx-transporte-composer-section">
            <h3><i>1</i> Trayecto <small>Selecciona los lugares de salida y llegada.</small></h3>
            <div className="dx-transporte-composer-route">
              <PlaceSearch side="origen" places={places} accounts={accounts}
                value={form.origen_lugar_id} onSelect={place => select('origen', place)}
                onCreate={() => {
                  setShowPlace('origen');
                  setPlaceError('');
                  setPlaceForm(NEW_PLACE);
                }}
                recents={recents} error={errors.origen_lugar_id} />
              <button type="button" className="dx-btn icon dx-transporte-composer-swap"
                aria-label="Invertir origen y destino" onClick={() => {
                  const nextOrigin = form.destino_lugar_id;
                  setManualEstimate(false);
                  update('destino_lugar_id', form.origen_lugar_id);
                  update('origen_lugar_id', nextOrigin);
                }}>⇅</button>
              <PlaceSearch side="destino" places={places} accounts={accounts}
                value={form.destino_lugar_id} onSelect={place => select('destino', place)}
                onCreate={() => {
                  setShowPlace('destino');
                  setPlaceError('');
                  setPlaceForm(NEW_PLACE);
                }}
                recents={recents} error={errors.destino_lugar_id} />
            </div>
            {showPlace && <NewPlace accounts={accounts} form={placeForm}
              setForm={setPlaceForm} onDirty={() => setDirty(true)}
              onCancel={() => setShowPlace('')} onSave={savePlace}
              saving={placeSaving} error={placeError} />}
            <details className="dx-transporte-composer-details"
              open={Boolean(errors.nombre || errors.codigo)}>
              <summary>Nombre y código <small>Se completan automáticamente; puedes editarlos.</small></summary>
              <div className="dx-transporte-composer-grid">
                <Field label="Nombre" name="nombre" value={form.nombre} required
                  error={errors.nombre} onChange={value => { setNameEdited(true); update('nombre', value); }} />
                <Field label="Código" name="codigo" value={form.codigo} required
                  error={errors.codigo} onChange={value => update('codigo', value)} />
              </div>
              {regreso && <div className="dx-transporte-composer-grid">
                <Field label="Nombre de regreso" name="nombre-regreso" value={form.nombre_regreso}
                  onChange={value => update('nombre_regreso', value)} />
                <Field label="Código de regreso" name="codigo-regreso" value={form.codigo_regreso}
                  onChange={value => update('codigo_regreso', value)} />
              </div>}
            </details>
          </section>
          <section className="dx-transporte-composer-section">
            <h3><i>2</i> Estimación <small>Calculada desde las coordenadas.</small></h3>
            <div className="dx-transporte-composer-estimate">
              <span className={`dx-transporte-composer-tag${manualEstimate ? ' is-adjusted' : ''}`}>
                {manualEstimate ? 'Ajustado' : 'Estimado'}
              </span>
              {manualEstimate && hasGps && <button type="button" className="dx-btn link"
                onClick={() => { setManualEstimate(false); setDirty(true); }}>Volver al estimado</button>}
            </div>
            {!hasGps && <p className="dx-transporte-composer-hint">Un lugar no tiene GPS. Completa distancia y duración.</p>}
            <div className="dx-transporte-composer-grid">
              <Field label="Distancia (km)" name="distancia_km" type="number" min="0.1"
                value={form.distancia_km} error={errors.distancia_km} required
                onChange={value => { setManualEstimate(true); update('distancia_km', value); }} />
              <Field label="Duración" name="duracion_estimada_horas" type="number" min="0.5"
                step="0.5" value={form.duracion_estimada_horas}
                error={errors.duracion_estimada_horas} required onChange={value => {
                  setManualEstimate(true); update('duracion_estimada_horas', value);
                }} />
            </div>
          </section>
          <details className="dx-transporte-composer-details">
            <summary>Operación <small>Opcional</small></summary>
            <div className="dx-transporte-composer-grid">
              <Field label="Número de peajes" name="numero_peajes" type="number" min="0"
                value={form.numero_peajes} error={errors.numero_peajes}
                onChange={value => update('numero_peajes', value)} />
              <Field label="Monto de peajes" name="peajes_estimados" type="number" min="0"
                step="0.01" value={form.peajes_estimados} error={errors.peajes_estimados}
                onChange={value => update('peajes_estimados', value)} />
              <label className="dx-ui-field"><span>Moneda de peajes</span>
                <select value={form.moneda_peajes}
                  onChange={event => update('moneda_peajes', event.target.value)}>
                  <option value="PEN">PEN · S/</option><option value="USD">USD · US$</option>
                </select>
              </label>
            </div>
            <div><span className="dx-transporte-composer-label">Carga habitual</span>
              <div className="dx-transporte-composer-chips">{CARGAS.map(item => <button key={item}
                type="button" className={form.tipo_carga_habitual === item ? 'is-on' : ''}
                aria-pressed={form.tipo_carga_habitual === item}
                onClick={() => update('tipo_carga_habitual',
                  form.tipo_carga_habitual === item ? '' : item)}>{item}</button>)}</div>
            </div>
            <label className="dx-ui-field"><span>Notas</span>
              <textarea rows="3" value={form.notas} onChange={event => update('notas', event.target.value)} />
            </label>
          </details>
          <section className="dx-transporte-composer-section">
            <h3><i>3</i> Tarifa base <small>Aplica a todos los clientes.</small></h3>
            <label className="dx-transporte-composer-switch"><input type="checkbox"
              checked={tarifaActiva} onChange={event => { setTarifaActiva(event.target.checked); setDirty(true); }} />
              Crear tarifa base</label>
            {tarifaActiva && <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field"><span>Tipo de unidad<b className="dx-ui-required"> *</b></span>
                <select id="composer-tarifa-tipo_unidad" value={form.tarifa.tipo_unidad}
                  aria-invalid={Boolean(errors['tarifa.tipo_unidad'])}
                  onChange={event => updateTarifa('tipo_unidad', event.target.value)}>
                  <option value="">Selecciona unidad</option>
                  {types.map(type => <option key={type} value={type}>{type}</option>)}
                </select>{errors['tarifa.tipo_unidad'] && <small className="dx-ui-field-error">
                  {errors['tarifa.tipo_unidad']}</small>}</label>
              <label className="dx-ui-field"><span>Cobro por<b className="dx-ui-required"> *</b></span>
                <select id="composer-tarifa-modalidad" value={form.tarifa.modalidad}
                  onChange={event => updateTarifa('modalidad', event.target.value)}>
                  {['viaje', 'km', 'tonelada', 'hora'].map(item => <option key={item} value={item}>
                    {{ viaje: 'Por viaje', km: 'Por km', tonelada: 'Por tonelada', hora: 'Por hora' }[item]}
                  </option>)}</select></label>
              <Field label="Precio" name="tarifa.tarifa" type="number" min="0.01" step="0.01"
                value={form.tarifa.tarifa} error={errors['tarifa.tarifa']} required
                onChange={value => updateTarifa('tarifa', value)} />
              <label className="dx-ui-field"><span>Moneda<b className="dx-ui-required"> *</b></span>
                <select value={form.tarifa.moneda} onChange={event => updateTarifa('moneda', event.target.value)}>
                  <option value="PEN">PEN · S/</option><option value="USD">USD · US$</option>
                </select></label>
              <Field label="Mínimo facturable" name="tarifa.minimo_facturable" type="number"
                min="0" value={form.tarifa.minimo_facturable}
                error={errors['tarifa.minimo_facturable']}
                onChange={value => updateTarifa('minimo_facturable', value)} />
              <Field label="Vigente desde" name="tarifa.vigente_desde" type="date"
                value={form.tarifa.vigente_desde} required
                onChange={value => updateTarifa('vigente_desde', value)} />
            </div>}
          </section>
          <label className="dx-transporte-composer-return"><input type="checkbox" checked={regreso}
            onChange={event => { setRegreso(event.target.checked); setDirty(true); }} />
            <span><b>Crear también la ruta de regreso</b><small>Usará la misma distancia, duración y tarifa base.</small></span>
          </label>
          {duplicate && <div className="dx-transporte-composer-duplicate" role="alert">
            <b>Ya existe {duplicate.codigo} · {duplicate.nombre} ({duplicate.distancia_km} km, {duplicate.duracion_estimada_horas} h)</b>
            <button type="button" className="dx-btn" onClick={() => onViewRoute(duplicate.id)}>Ver ruta</button>
            <button type="button" className="dx-btn primary" onClick={() => {
              setForceDuplicate(true); setDuplicate(null);
              requestAnimationFrame(() => document.getElementById('composer-form').requestSubmit());
            }}>Crear igual</button>
          </div>}
          {saveError && <p className="dx-transporte-error" role="alert">{saveError}</p>}
        </form>
        <aside className="dx-transporte-composer-aside">
          <div className="dx-transporte-composer-map">
            <MapContainer center={center} zoom={origin ? 9 : 5} scrollWheelZoom
              style={{ width: '100%', height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors" />
              <MapClick onPick={pickPoint} />
              <FitRoute points={[
                origin?.latitud != null && origin?.longitud != null
                  ? [Number(origin.latitud), Number(origin.longitud)] : null,
                destination?.latitud != null && destination?.longitud != null
                  ? [Number(destination.latitud), Number(destination.longitud)] : null,
                mapPoint ? [mapPoint.lat, mapPoint.lng] : null,
              ].filter(Boolean)} />
              {origin?.latitud != null && origin?.longitud != null && <Marker
                position={[Number(origin.latitud), Number(origin.longitud)]} icon={ICON} />}
              {destination?.latitud != null && destination?.longitud != null && <Marker
                position={[Number(destination.latitud), Number(destination.longitud)]} icon={ICON} />}
              {origin?.latitud != null && origin?.longitud != null
                && destination?.latitud != null && destination?.longitud != null
                && <Polyline positions={[
                  [Number(origin.latitud), Number(origin.longitud)],
                  [Number(destination.latitud), Number(destination.longitud)],
                ]} pathOptions={{ color: 'var(--dx-ui-cyan)', dashArray: '6 8', weight: 3 }} />}
              {mapPoint && <Marker position={[mapPoint.lat, mapPoint.lng]}
                icon={ICON} draggable eventHandlers={{ dragend: dragPoint }} />}
            </MapContainer>
            {showPlace && <small className="dx-transporte-composer-map-hint">
              Haz clic para marcar; arrastra el marcador para ajustar.</small>}
          </div>
          {showPlace && placeForm.latitud !== '' && placeForm.longitud !== ''
            && <p className="dx-transporte-composer-coords">
            Ubicación: {Number(placeForm.latitud).toFixed(5)}, {Number(placeForm.longitud).toFixed(5)}
          </p>}
          <section className="dx-transporte-composer-preview">
            <span className="dx-ui-eyebrow">Vista previa en vivo</span>
            <h3>{form.nombre || 'Nombre de la ruta'}</h3>
            <p>{origin?.nombre || 'Origen'} → {destination?.nombre || 'Destino'}</p>
            <div><b>{form.codigo || lastCode || 'R-000'}</b>
              <span>{form.distancia_km || '—'} km · {form.duracion_estimada_horas || '—'} h</span></div>
            {regreso && <small>Regreso: {form.codigo_regreso || 'R-000'}</small>}
          </section>
        </aside>
      </div>
      <footer className="dx-transporte-composer-footer">
        {saveError && <span className="dx-transporte-error" role="alert">{saveError}</span>}
        <button type="button" className="dx-btn" onClick={close}>Cancelar</button>
        <button type="submit" form="composer-form" className="dx-btn primary" disabled={saving}>
          {saving ? 'Guardando…' : regreso ? 'Guardar 2 rutas' : 'Guardar ruta'}
        </button>
      </footer>
      {discard && <div className="dx-transporte-composer-confirm">
        <section role="alertdialog" aria-modal="true" aria-labelledby="composer-discard-title">
          <h3 id="composer-discard-title">¿Salir sin guardar?</h3>
          <p>Se perderán los cambios de esta ruta.</p>
          <button type="button" className="dx-btn" onClick={() => setDiscard(false)}>Seguir editando</button>
          <button type="button" className="dx-btn primary" onClick={onClose}>Salir</button>
        </section>
      </div>}
    </section>
  </div>;
}

function nextCode(code) {
  const number = Number(String(code || '').replace(/^R-/, '')) + 1;
  return `R-${String(number).padStart(3, '0')}`;
}
