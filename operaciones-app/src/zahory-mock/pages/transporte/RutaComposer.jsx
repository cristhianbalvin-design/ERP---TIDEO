import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { crearLugar } from '../../../services/transporteLugaresService.js';
import { siguienteCodigoRuta, guardarRutaCompuesta } from '../../../services/transporteRutasService.js';
import {
  catalogoTiposUnidad, estimarTrayecto, fechaActualLocal, parsearCoordenadasMaps,
  encontrarRutaDuplicada, formatearImporte, formatearValorUnidad, validarComposerRuta,
} from './transporteUtils.js';

const CARGAS = ['General', 'Refrigerada', 'Peligrosa', 'Granel', 'Sobredimensionada'];
const PLACE_TYPES = {
  almacen: 'Almacén', planta: 'Planta', obra: 'Obra', mina: 'Mina',
  puerto: 'Puerto', cliente: 'Local de cliente', otro: 'Otro',
};
const PLACE_ICONS = {
  almacen: '▦', planta: '⚙', obra: '⌖', mina: '◆', puerto: '⚓', cliente: '♙', otro: '⌖',
};
const BLANK = {
  origen_lugar_id: '', destino_lugar_id: '', codigo: '', nombre: '', codigo_regreso: '',
  nombre_regreso: '', distancia_km: '', duracion_estimada_horas: '', tipo_carga_habitual: '',
  numero_peajes: '', peajes_estimados: '', moneda_peajes: 'PEN', notas: '',
  tarifa: { tipo_unidad: 'Tracto 30 t', modalidad: 'viaje', tarifa: '', moneda: 'PEN',
    minimo_facturable: '', vigente_desde: fechaActualLocal() },
};
const NEW_PLACE = {
  nombre: '', tipo: 'otro', cuenta_id: '', direccion: '', latitud: '', longitud: '',
};

const LABELS = { viaje: 'viaje', km: 'km', tonelada: 't', hora: 'h' };

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

function PlaceSearch({ side, places, accounts, value, onSelect, onCreate, error, recents, inputRef }) {
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
  return <div className={`dx-transporte-composer-stop${open ? ' is-open' : ''}`}>
    <span className={`dx-transporte-composer-pin ${side}`} aria-hidden="true">
      {side === 'origen' ? 'A' : 'B'}
    </span>
    <div className="dx-transporte-composer-search">
      <div className="dx-ui-field">
        <label htmlFor={`composer-${side}_lugar_id`}>{title}<b className="dx-ui-required"> *</b></label>
        <div className={`dx-transporte-composer-combo${error ? ' is-invalid' : ''}`}>
          <span className="dx-transporte-composer-search-icon" aria-hidden="true">⌕</span>
          <input ref={inputRef} id={`composer-${side}_lugar_id`} aria-label={title}
            aria-required="true" aria-invalid={Boolean(error)}
            aria-describedby={error ? `composer-${side}-error` : undefined}
            value={selected ? selected.nombre : query}
            placeholder={side === 'origen'
              ? 'Busca almacén, planta, puerto o cliente…' : 'Busca el lugar de entrega…'}
            onClick={() => setOpen(true)}
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
          {selected && <button type="button" className="dx-transporte-composer-change"
            onClick={() => { onSelect(null); setQuery(''); setOpen(true); }}>Cambiar</button>}
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
              onMouseDown={event => event.preventDefault()}
              onClick={() => { setOpen(false); onCreate(query); }}>
              <span aria-hidden="true">＋</span><b>Crear lugar</b>
            </button>
          </div>}
        </div>
      </div>
      {selected && <small className="dx-transporte-composer-address">
        {selected.direccion || 'Sin dirección'}{selected.ciudad ? ` · ${selected.ciudad}` : ''}
      </small>}
      {error && <small id={`composer-${side}-error`} className="dx-ui-field-error">{error}</small>}
    </div>
  </div>;
}

function NewPlace({ side, accounts, form, setForm, onDirty, onCancel, onSave, saving, error }) {
  function set(key, value) {
    onDirty();
    setForm(current => ({ ...current, [key]: value }));
  }
  function useLink(value) {
    set('map_url', value);
    const point = parsearCoordenadasMaps(value);
    if (point) setForm(current => ({ ...current, map_url: value, ...point }));
  }
  return <section className="dx-transporte-composer-new-place" aria-label="Crear lugar">
    <h3>＋ Nuevo lugar para {side === 'origen' ? 'el origen (A)' : 'el destino (B)'}
      <button type="button" aria-label="Cancelar creación de lugar"
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
          <option value="">Lugar general (sin cliente)</option>
          {accounts.map(account => <option key={account.id} value={account.id}>
            {account.nombre_comercial || account.razon_social}
          </option>)}
        </select>
      </label>
    </div>
    <Field label="Dirección" name="lugar-direccion" value={form.direccion}
      placeholder="Calle, número, distrito"
      onChange={value => set('direccion', value)} />
    <div className="dx-ui-field"><span>Ubicación <b className="dx-ui-required">*</b></span>
      <div className="dx-transporte-composer-coord-row">
        {form.latitud ? <><b>{Number(form.latitud).toFixed(5)}, {Number(form.longitud).toFixed(5)}</b>
          <button type="button" className="dx-btn link" onClick={() => set('latitud', '')}>
            Mover el punto
          </button></> : <b>Haz clic en el mapa para marcar el punto</b>}
      </div>
      <Field label="Enlace de Google Maps" name="lugar-maps" value={form.map_url || ''}
        placeholder="https://maps.google.com/…@-13.71,-76.20" onChange={useLink} />
      {!form.latitud && <small className="dx-transporte-composer-hint">
        El punto se puede arrastrar en el mapa para afinarlo.
      </small>}
    </div>
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
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const [tarifaActiva, setTarifaActiva] = useState(true);
  const [regreso, setRegreso] = useState(true);
  const [manualEstimate, setManualEstimate] = useState(false);
  const [recents, setRecents] = useState([]);
  const [lastCode, setLastCode] = useState('');
  const [saveError, setSaveError] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const lineRef = useRef(null);
  const routeLayersRef = useRef(null);
  const showPlaceRef = useRef(showPlace);
  const originInput = useRef(null);
  const destinationInput = useRef(null);
  const kmInput = useRef(null);
  const hoursInput = useRef(null);
  const unitInput = useRef(null);
  const modalityInput = useRef(null);
  const priceInput = useRef(null);
  const currencyInput = useRef(null);
  const nameDetails = useRef(null);
  const operationDetails = useRef(null);
  const origin = places.find(place => place.id === form.origen_lugar_id);
  const destination = places.find(place => place.id === form.destino_lugar_id);
  const hasGps = origin?.latitud != null && origin?.longitud != null
    && destination?.latitud != null && destination?.longitud != null;
  const types = useMemo(() => catalogoTiposUnidad([], [], 'Tracto 30 t'), []);
  const originPoint = origin?.latitud != null && origin?.longitud != null
    ? [Number(origin.latitud), Number(origin.longitud)] : null;
  const destinationPoint = destination?.latitud != null && destination?.longitud != null
    ? [Number(destination.latitud), Number(destination.longitud)] : null;
  const mapPoint = showPlace && placeForm.latitud !== '' && placeForm.longitud !== '' ? {
    lat: Number(placeForm.latitud), lng: Number(placeForm.longitud),
  } : null;
  const activeDuplicate = encontrarRutaDuplicada(routes, form.origen_lugar_id,
    form.destino_lugar_id);
  showPlaceRef.current = showPlace;

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
    if (!mapNode.current || mapRef.current) return undefined;
    const map = L.map(mapNode.current, { scrollWheelZoom: true })
      .setView([-12.6, -75.5], 6);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap',
    }).addTo(map);
    map.on('click', event => {
      if (showPlaceRef.current) pickPoint(event.latlng);
    });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapNode.current);
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      observer.disconnect();
      markerRef.current?.remove();
      lineRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    lineRef.current?.remove();
    routeLayersRef.current?.clearLayers();
    markerRef.current = null;
    lineRef.current = null;
    const pointData = [
      originPoint && { point: originPoint, label: 'A' },
      destinationPoint && { point: destinationPoint, label: 'B' },
    ].filter(Boolean);
    pointData.forEach(({ point, label }) => L.marker(point, {
      icon: L.divIcon({
        className: `dx-transporte-composer-marker is-${label.toLowerCase()}`,
        html: `<span><b>${label}</b></span>`, iconSize: [30, 30], iconAnchor: [15, 15],
      }), title: label === 'A' ? origin?.nombre : destination?.nombre,
    }).addTo(routeLayersRef.current || (routeLayersRef.current = L.layerGroup().addTo(map))));
    if (pointData.length === 2) {
      lineRef.current = L.polyline([originPoint, destinationPoint], {
        color: '#00ACC1', weight: 3, dashArray: '6 8',
      }).addTo(map);
    }
    if (showPlace && mapPoint) {
      markerRef.current = L.marker([mapPoint.lat, mapPoint.lng], {
        icon: L.divIcon({
          className: 'dx-transporte-composer-marker is-new',
          html: '<span>＋</span>', iconSize: [30, 30], iconAnchor: [15, 15],
        }), draggable: true,
      }).addTo(map);
      markerRef.current.on('dragend', event => dragPoint(event));
    }
    const points = [...pointData.map(item => item.point)];
    if (showPlace && mapPoint) points.push([mapPoint.lat, mapPoint.lng]);
    if (points.length === 1) map.setView(points[0], 10, { animate: false });
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 10,
      animate: false });
    if (!points.length) map.setView([-12.6, -75.5], 6);
  }, [originPoint?.[0], originPoint?.[1], destinationPoint?.[0], destinationPoint?.[1],
    showPlace, mapPoint?.lat, mapPoint?.lng]);

  useEffect(() => {
    if (!origin || !destination || nameEdited) return;
    setForm(current => ({ ...current,
      nombre: `${origin.nombre} → ${destination.nombre}`,
      nombre_regreso: `${destination.nombre} → ${origin.nombre}`,
    }));
  }, [origin, destination, nameEdited]);

  function update(key, value) {
    setDirty(true);
    setForm(current => ({ ...current, [key]: value }));
    if (!submitted) setErrors(current => ({ ...current, [key]: '' }));
  }
  function updateTarifa(key, value) {
    setDirty(true);
    setForm(current => ({ ...current, tarifa: { ...current.tarifa, [key]: value } }));
    if (!submitted) setErrors(current => ({ ...current, [`tarifa.${key}`]: '' }));
  }
  function select(side, place) {
    setDuplicateDismissed(false);
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

  function validateValues(values, includeTarifa = tarifaActiva) {
    const next = validarComposerRuta(values, includeTarifa);
    const from = places.find(place => place.id === values.origen_lugar_id);
    const to = places.find(place => place.id === values.destino_lugar_id);
    const gpsAvailable = from?.latitud != null && from?.longitud != null
      && to?.latitud != null && to?.longitud != null;
    const missingGps = Boolean(from && to && !gpsAvailable);
    if (missingGps && !values.distancia_km) next.distancia_km = 'Ingresa la distancia sin GPS.';
    if (missingGps && !values.duracion_estimada_horas) {
      next.duracion_estimada_horas = 'Ingresa la duración sin GPS.';
    }
    return next;
  }
  useEffect(() => {
    if (!submitted) return;
    setErrors(validateValues(form, tarifaActiva));
  }, [form, tarifaActiva, submitted, places]);

  function validate() {
    setSubmitted(true);
    const next = validateValues(form);
    setErrors(next);
    const order = ['origen_lugar_id', 'destino_lugar_id', 'distancia_km',
      'duracion_estimada_horas', 'nombre', 'codigo', 'numero_peajes',
      'peajes_estimados', 'tarifa.tipo_unidad', 'tarifa.modalidad',
      'tarifa.tarifa', 'tarifa.moneda', 'tarifa.minimo_facturable', 'tarifa.vigente_desde'];
    const first = order.find(key => next[key]);
    if (first) {
      if (['nombre', 'codigo'].includes(first)) nameDetails.current.open = true;
      if (['numero_peajes', 'peajes_estimados'].includes(first)) {
        operationDetails.current.open = true;
      }
      requestAnimationFrame(() => {
        const refs = { origen_lugar_id: originInput, destino_lugar_id: destinationInput,
          distancia_km: kmInput, duracion_estimada_horas: hoursInput,
          'tarifa.tipo_unidad': unitInput, 'tarifa.modalidad': modalityInput,
          'tarifa.tarifa': priceInput, 'tarifa.moneda': currencyInput };
        (refs[first]?.current || document.getElementById(
          `composer-${first.replaceAll('.', '-')}`))?.focus();
      });
    }
    return !Object.keys(next).length;
  }

  async function save(event) {
    event.preventDefault();
    if (!validate()) return;
    if (activeDuplicate && !duplicateDismissed) return;
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

  function pickPoint(point) {
    setDirty(true);
    setPlaceForm(current => ({ ...current,
      latitud: String(point.lat), longitud: String(point.lng),
    }));
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
        <div><h2 id="composer-title">Nueva ruta</h2>
          <p>Elige de dónde sale y a dónde va; el resto se calcula y puedes ajustarlo.</p></div>
        <button type="button" className="dx-btn icon" aria-label="Cerrar" onClick={close}>×</button>
      </header>
      <div className="dx-transporte-composer-body">
        <form id="composer-form" className="dx-transporte-composer-form" noValidate onSubmit={save}>
          <section className="dx-transporte-composer-section">
            <h3><i>1</i> Trayecto <small>obligatorio</small></h3>
            <div className="dx-transporte-composer-route">
              <div className="dx-transporte-composer-rail" aria-hidden="true" />
              <PlaceSearch side="origen" places={places} accounts={accounts}
                value={form.origen_lugar_id} onSelect={place => select('origen', place)}
                onCreate={name => { setShowPlace('origen'); setPlaceError('');
                  setPlaceForm({ ...NEW_PLACE, nombre: name || '' }); }}
                recents={recents} error={errors.origen_lugar_id} inputRef={originInput} />
              <button type="button" className="dx-btn icon dx-transporte-composer-swap"
                aria-label="Invertir origen y destino" onClick={() => {
                  setDuplicateDismissed(false);
                  setManualEstimate(false);
                  setDirty(true);
                  setForm(current => ({ ...current,
                    origen_lugar_id: current.destino_lugar_id,
                    destino_lugar_id: current.origen_lugar_id,
                  }));
                  if (!submitted) setErrors(current => ({ ...current,
                    origen_lugar_id: '', destino_lugar_id: '',
                  }));
                }}>⇅</button>
              <PlaceSearch side="destino" places={places} accounts={accounts}
                value={form.destino_lugar_id} onSelect={place => select('destino', place)}
                onCreate={name => { setShowPlace('destino'); setPlaceError('');
                  setPlaceForm({ ...NEW_PLACE, nombre: name || '' }); }}
                recents={recents} error={errors.destino_lugar_id} inputRef={destinationInput} />
            </div>
    {showPlace && <NewPlace side={showPlace} accounts={accounts} form={placeForm} setForm={setPlaceForm}
              onDirty={() => setDirty(true)} onCancel={() => setShowPlace('')}
              onSave={savePlace} saving={placeSaving} error={placeError} />}
            {activeDuplicate && !duplicateDismissed && <div className="dx-transporte-composer-duplicate" role="status">
              <span>Ya existe <b>{activeDuplicate.codigo}</b> · {activeDuplicate.nombre} (
                {formatearValorUnidad(activeDuplicate.distancia_km, 'km')},{' '}
                {formatearValorUnidad(activeDuplicate.duracion_estimada_horas, 'h')}).
                ¿Quieres usarla en vez de crear otra?</span>
              <button type="button" className="dx-btn link"
                onClick={() => onViewRoute(activeDuplicate.id)}>Ver ruta</button>
              <button type="button" className="dx-btn link"
                onClick={() => setDuplicateDismissed(true)}>Crear igual</button>
            </div>}

          </section>
          <section className="dx-transporte-composer-section">
            <h3><i>2</i> Distancia y tiempo
              <small>estimados por GPS · puedes ajustarlos</small></h3>
            <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field"><span>Distancia <b className="dx-ui-required">*</b>
                {form.distancia_km !== '' && <i className="dx-transporte-composer-tag">
                  {manualEstimate ? 'ajustado' : 'estimado'}</i>}</span>
                <div className="dx-transporte-composer-withunit">
                  <input ref={kmInput} id="composer-distancia_km" type="number" min="0" step="1"
                    value={form.distancia_km} aria-invalid={Boolean(errors.distancia_km)}
                    onChange={event => { setManualEstimate(true);
                      update('distancia_km', event.target.value); }} /><em>km</em></div>
                {errors.distancia_km && <small className="dx-ui-field-error">{errors.distancia_km}</small>}
                <small className="dx-transporte-composer-hint">Línea recta × 1,3 (factor de carretera).
                  {manualEstimate && <button type="button" className="dx-btn link"
                    onClick={() => { setManualEstimate(false); setDirty(true); }}>Volver al estimado</button>}
                </small>
              </label>
              <label className="dx-ui-field"><span>Duración <b className="dx-ui-required">*</b>
                {form.duracion_estimada_horas !== '' && <i className="dx-transporte-composer-tag">
                  {manualEstimate ? 'ajustado' : 'estimado'}</i>}</span>
                <div className="dx-transporte-composer-withunit">
                  <input ref={hoursInput} id="composer-duracion_estimada_horas" type="number"
                    min="0" step="0.5" value={form.duracion_estimada_horas}
                    aria-invalid={Boolean(errors.duracion_estimada_horas)}
                    onChange={event => { setManualEstimate(true);
                      update('duracion_estimada_horas', event.target.value); }} /><em>h</em></div>
                {errors.duracion_estimada_horas && <small className="dx-ui-field-error">
                  {errors.duracion_estimada_horas}</small>}
                <small className="dx-transporte-composer-hint">
                  Usada para la agenda de despacho (velocidad promedio 55 km/h).
                </small>
              </label>
            </div>
            <details ref={nameDetails} className="dx-transporte-composer-details"
              open={Boolean(errors.nombre || errors.codigo)}>
              <summary>Nombre y código <small>{form.nombre && form.codigo
                ? form.codigo + ' · ' + form.nombre : 'Se generan solos'}</small></summary>
              <div className="dx-transporte-composer-grid">
                <Field label="Nombre" name="nombre" value={form.nombre} required
                  error={errors.nombre} placeholder="Origen → Destino"
                  onChange={value => { setNameEdited(true); update('nombre', value); }} />
                <Field label="Código" name="codigo" value={form.codigo} required
                  error={errors.codigo} onChange={value => update('codigo', value)} />
              </div>
            </details>
          </section>
          <details ref={operationDetails} className="dx-transporte-composer-details">
            <summary><i>3</i> Operación <small>opcional · peajes, carga y notas</small></summary>
            <div className="dx-transporte-composer-grid">
              <Field label="N.º de peajes" name="numero_peajes" type="number" min="0"
                value={form.numero_peajes} error={errors.numero_peajes}
                onChange={value => update('numero_peajes', value)} />
              <Field label="Monto de peajes" name="peajes_estimados" type="number" min="0"
                step="0.01" placeholder="0.00" value={form.peajes_estimados}
                error={errors.peajes_estimados}
                onChange={value => update('peajes_estimados', value)} />
              <label className="dx-ui-field"><span>Moneda</span>
                <select value={form.moneda_peajes} onChange={event =>
                  update('moneda_peajes', event.target.value)}>
                  <option>PEN</option><option>USD</option></select></label>
            </div>
            <div><span className="dx-transporte-composer-label">Carga habitual</span>
              <div className="dx-transporte-composer-chips">{CARGAS.map(item => <button key={item}
                type="button" className={form.tipo_carga_habitual === item ? 'is-on' : ''}
                aria-pressed={form.tipo_carga_habitual === item}
                onClick={() => update('tipo_carga_habitual',
                  form.tipo_carga_habitual === item ? '' : item)}>{item}</button>)}</div></div>
            <label className="dx-ui-field"><span>Notas</span><textarea rows="3"
              placeholder="Restricciones de horario, permisos de ingreso, ventanas de carga…"
              value={form.notas} onChange={event => update('notas', event.target.value)} /></label>
          </details>
          <section className="dx-transporte-composer-section">
            <h3><i>4</i><label className="dx-transporte-composer-switch">
              <input type="checkbox" checked={tarifaActiva} onChange={event => {
                setTarifaActiva(event.target.checked); setDirty(true);
              }} /><span>Agregar tarifa base ahora</span></label>
              <small>evita que la ruta nazca «sin tarifa»</small></h3>
            {tarifaActiva && <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field"><span>Tipo de unidad<b className="dx-ui-required"> *</b></span>
                <select ref={unitInput} id="composer-tarifa-tipo_unidad"
                  value={form.tarifa.tipo_unidad} aria-invalid={Boolean(errors['tarifa.tipo_unidad'])}
                  onChange={event => updateTarifa('tipo_unidad', event.target.value)}>
                  <option value="">Seleccionar…</option>
                  {types.map(type => <option key={type} value={type}>{type}</option>)}
                </select>{errors['tarifa.tipo_unidad'] && <small className="dx-ui-field-error">
                  {errors['tarifa.tipo_unidad']}</small>}</label>
              <label className="dx-ui-field"><span>Cobro por<b className="dx-ui-required"> *</b></span>
                <div className="dx-transporte-composer-segmented">
                  {['viaje', 'km', 'tonelada', 'hora'].map(item => <button key={item} type="button"
                    ref={item === 'viaje' ? modalityInput : undefined}
                    className={form.tarifa.modalidad === item ? 'is-on' : ''}
                    aria-pressed={form.tarifa.modalidad === item}
                    onClick={() => updateTarifa('modalidad', item)}>
                    {{ viaje: 'Viaje', km: 'Km', tonelada: 'Tonelada', hora: 'Hora' }[item]}
                  </button>)}</div>
                {errors['tarifa.modalidad'] && <small className="dx-ui-field-error">
                  {errors['tarifa.modalidad']}</small>}</label>
              <label className="dx-ui-field"><span>Precio<b className="dx-ui-required"> *</b></span>
                <div className="dx-transporte-composer-withunit">
                  <input ref={priceInput} id="composer-tarifa-tarifa" type="number" min="0"
                    step="0.01" placeholder="0.00" value={form.tarifa.tarifa}
                    aria-invalid={Boolean(errors['tarifa.tarifa'])}
                    onChange={event => updateTarifa('tarifa', event.target.value)} />
                  <em>/{LABELS[form.tarifa.modalidad]}</em></div>
                {errors['tarifa.tarifa'] && <small className="dx-ui-field-error">
                  {errors['tarifa.tarifa']}</small>}</label>
              <label className="dx-ui-field"><span>Moneda<b className="dx-ui-required"> *</b></span>
                <select ref={currencyInput} id="composer-tarifa-moneda"
                  value={form.tarifa.moneda} onChange={event =>
                  updateTarifa('moneda', event.target.value)}><option>PEN</option>
                  <option>USD</option></select>
                {errors['tarifa.moneda'] && <small className="dx-ui-field-error">
                  {errors['tarifa.moneda']}</small>}</label>
              <Field label="Mínimo facturable" name="tarifa.minimo_facturable" type="number"
                min="0" placeholder="Opcional" value={form.tarifa.minimo_facturable}
                error={errors['tarifa.minimo_facturable']}
                onChange={value => updateTarifa('minimo_facturable', value)} />
              <Field label="Vigente desde" name="tarifa.vigente_desde" type="date"
                value={form.tarifa.vigente_desde} required error={errors['tarifa.vigente_desde']}
                onChange={value => updateTarifa('vigente_desde', value)} /></div>}
          </section>
          <label className="dx-transporte-composer-return"><input type="checkbox" checked={regreso}
            onChange={event => { setRegreso(event.target.checked); setDirty(true); }} />
            <b>Crear también la ruta de regreso</b></label>
        </form>
        <aside className="dx-transporte-composer-aside" aria-label="Vista previa">
          <div className="dx-transporte-composer-map">
            <div ref={mapNode} className="dx-transporte-composer-leaflet" />
            <div className="dx-transporte-composer-map-hint">{showPlace
              ? 'Haz clic en el mapa para marcar el nuevo lugar'
              : origin && destination && hasGps
                ? `Línea punteada = recorrido estimado (${formatearValorUnidad(form.distancia_km, 'km')} por carretera)`
                : origin && destination ? 'Un lugar no tiene GPS: completa la distancia a mano'
                  : 'Elige origen y destino para ver el trayecto'}</div></div>
          {showPlace && mapPoint && <p className="dx-transporte-composer-coords">
            Ubicación: {mapPoint.lat.toFixed(5)}, {mapPoint.lng.toFixed(5)}</p>}
          <section className="dx-transporte-composer-preview">
            <div className="dx-transporte-composer-preview-head">
              <span>{form.codigo || lastCode || 'R-000'} · NUEVA</span>
              <h3>{form.nombre || 'Origen → Destino'}</h3></div>
            <div className="dx-transporte-composer-stops">
              {[['A', origin], ['B', destination]].map(([letter, place]) =>
                <div className="dx-transporte-composer-preview-stop" key={letter}>
                  <i>{letter}</i><span><b>{place?.nombre ||
                    ('Elige el ' + (letter === 'A' ? 'origen' : 'destino'))}</b>
                    {place && <small>{place.direccion || 'Sin dirección'}</small>}</span></div>)}
            </div>
            <div className="dx-transporte-composer-metrics">
              <div><small>Distancia</small><b>{formatearValorUnidad(form.distancia_km, 'km')}</b></div>
              <div><small>Duración</small><b>{formatearValorUnidad(form.duracion_estimada_horas, 'h')}</b></div>
              <div><small>Peajes</small><b>{formatearValorUnidad(form.numero_peajes, '')}</b></div></div>
            <div className="dx-transporte-composer-preview-tariff">{tarifaActiva
              ? <><span>Tarifa base · {form.tarifa.tipo_unidad || 'Sin unidad'}</span>
                <b>{form.tarifa.tarifa
                  ? `${formatearImporte(form.tarifa.tarifa, form.tarifa.moneda, 'viaje')} / ${LABELS[form.tarifa.modalidad]}`
                  : 'Sin dato'}</b></>
              : <><span>Sin tarifa base</span><small>La ruta quedará «sin tarifa»</small></>}</div>
          </section>
          {regreso && origin && destination && <p className="dx-transporte-composer-return-note">
            También se creará {form.codigo_regreso} · {destination.nombre} → {origin.nombre}
            {tarifaActiva ? ' con la misma tarifa base.' : '.'}
          </p>}
        </aside>
      </div>
      <footer className="dx-transporte-composer-footer">
        {saveError && <p className="dx-transporte-error" role="alert">{saveError}</p>}
        <button type="button" className="dx-btn" onClick={close}>Cancelar</button>
        <button type="submit" form="composer-form" className="dx-btn primary" disabled={saving}>
          {saving ? 'Guardando…' : regreso ? 'Guardar 2 rutas' : 'Guardar ruta'}</button>
      </footer>
      {discard && <div className="dx-transporte-composer-confirm">
        <section role="alertdialog" aria-modal="true" aria-labelledby="composer-discard-title">
          <h3 id="composer-discard-title">¿Salir sin guardar?</h3><p>Se perderán los cambios de esta ruta.</p>
          <button type="button" className="dx-btn" onClick={() => setDiscard(false)}>Seguir editando</button>
          <button type="button" className="dx-btn primary" onClick={onClose}>Salir</button>
        </section></div>}
    </section>
  </div>;
}

function nextCode(code) {
  const number = Number(String(code || '').replace(/^R-/, '')) + 1;
  return `R-${String(number).padStart(3, '0')}`;
}
