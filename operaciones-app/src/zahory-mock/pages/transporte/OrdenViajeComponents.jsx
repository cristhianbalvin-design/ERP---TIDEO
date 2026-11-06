import React from 'react';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { formatearFechaHoraTransporte, formatearImporte } from './transporteUtils.js';

const stopLabels = { origen: 'Origen', recojo: 'Recojo', entrega: 'Entrega', destino: 'Destino' };

export function WizardStep({ number, title, subtitle, current, onSelect }) {
  const completed = number < current;
  return <button type="button" className={`dx-transporte-step ${number === current ? 'is-current' : ''}`
    + `${completed ? ' is-complete' : ''}`} disabled={!completed && number !== current}
    onClick={onSelect} aria-current={number === current ? 'step' : undefined}>
    <i>{number}</i><span className="dx-transporte-step-copy"><strong>{title}</strong><small>{subtitle}</small></span>
  </button>;
}

export function TripSummary({ form, cuenta, ruta, os, arrival, ingreso }) {
  const value = item => item || <em>Sin dato</em>;
  return <aside className="dx-ui-card dx-transporte-summary"><h2>Resumen del viaje</h2>
    <dl><dt>Cliente / OS</dt><dd>{value(cuenta?.nombre_comercial || cuenta?.razon_social)}
      <small>{value(os?.numero || form.os_cliente_id)}</small></dd>
      <dt>Salida</dt><dd>{value(form.fecha_programada
        ? formatearFechaHoraTransporte(new Date(form.fecha_programada).toISOString()) : '')}</dd>
      <dt>Llegada estimada</dt><dd>{value(arrival ? formatearFechaHoraTransporte(arrival.toISOString()) : '')}</dd>
      <dt>Ruta y paradas</dt><dd>{value(ruta?.nombre || (form.ruta_id ? `${form.origen_nombre} → ${form.destino_nombre}` : ''))}
        <small>{form.paradas.filter(stop => stop.tipo === 'recojo' || stop.tipo === 'entrega')
          .map(stop => stop.nombre).filter(Boolean).join(' · ') || 'Sin paradas intermedias'}</small></dd>
      <dt>Carga</dt><dd>{value(form.carga_descripcion)}
        <small>{form.peso_toneladas ? `${form.peso_toneladas} t` : 'Sin peso'} · {form.volumen_m3
          ? `${form.volumen_m3} m³` : 'Sin volumen'}</small></dd>
      <dt>Unidad requerida</dt><dd>{value(form.tipo_unidad)}</dd></dl>
    <div className="dx-transporte-summary-total"><span>Ingreso estimado</span>
      <strong>{ingreso == null ? 'Sin dato' : formatearImporte(ingreso, form.moneda)}</strong></div>
  </aside>;
}

export function ChargeFields({ form, assign, errors, types }) {
  const requirements = [['gps', 'GPS'], ['epp', 'EPP'], ['sctr', 'SCTR'],
    ['escolta', 'Escolta'], ['refrigerado', 'Refrigerado']];
  const kinds = [['general', 'General'], ['peligrosa', 'Peligrosa'], ['refrigerada', 'Refrigerada'],
    ['sobredimensionada', 'Sobredimensionada'], ['fragil', 'Frágil']];
  return <section className="dx-transporte-wizard-section"><h2>Carga y unidad</h2>
    <div className="dx-ui-form-grid">
      <label className="dx-ui-field"><span>Descripción *</span><input value={form.carga_descripcion || ''}
        onChange={event => assign('carga_descripcion', event.target.value)} />
        {errors.carga_descripcion && <small className="dx-ui-field-error">{errors.carga_descripcion}</small>}</label>
      <label className="dx-ui-field"><span>Peso (t) *</span><input type="number" min="0" step="0.001"
        value={form.peso_toneladas || ''} onChange={event => assign('peso_toneladas', event.target.value)} />
        {errors.peso_toneladas && <small className="dx-ui-field-error">{errors.peso_toneladas}</small>}</label>
      <label className="dx-ui-field"><span>Volumen (m³)</span><input type="number" min="0" step="0.001"
        value={form.volumen_m3 || ''} onChange={event => assign('volumen_m3', event.target.value)} /></label>
      <label className="dx-ui-field"><span>Bultos</span><input type="number" min="0" step="1"
        value={form.carga_bultos || ''} onChange={event => assign('carga_bultos', event.target.value)} /></label>
      <label className="dx-ui-field"><span>Unidad de bultos</span><input value={form.carga_unidad_bultos || ''}
        onChange={event => assign('carga_unidad_bultos', event.target.value)} /></label>
      <label className="dx-ui-field"><span>Tipo de carga</span><select className="dx-ui-select"
        value={form.tipo_carga} onChange={event => assign('tipo_carga', event.target.value)}>
        {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <h3>Requisitos</h3><div className="dx-transporte-chips">{requirements.map(([value, label]) => {
      const selected = (form.requisitos || []).includes(value);
      return <button type="button" key={value} className={selected ? 'is-active' : ''}
        aria-pressed={selected} onClick={() => assign('requisitos', selected
          ? form.requisitos.filter(item => item !== value) : [...(form.requisitos || []), value])}>{label}</button>;
    })}</div>
    <h3>Tipo de unidad requerido *</h3>
    {errors.tipo_unidad && <small className="dx-ui-field-error">{errors.tipo_unidad}</small>}
    <div className="dx-transporte-unit-tiles">{types.map(type => <button type="button" key={type}
      className={form.tipo_unidad === type ? 'is-active' : ''} aria-pressed={form.tipo_unidad === type}
      onClick={() => assign('tipo_unidad', type)}>{type}</button>)}</div>
    <label className="dx-ui-field dx-ui-field-full"><span>Observaciones</span>
      <textarea value={form.observaciones || ''} onChange={event => assign('observaciones', event.target.value)} /></label>
  </section>;
}

export function StopsEditor({ stops, errors, onEdit, onMove, onRemove, onAdd, placePicker,
  places, search, setSearch, onSelectPlace, onCreatePlace, onOpenPlacePicker, onClosePlacePicker }) {
  return <div className="dx-transporte-stops"><h3>Paradas</h3>
    {stops.map((stop, index) => <article className="dx-transporte-stop" key={`${stop.tipo}-${index}`}>
      <i>{index + 1}</i><div className="dx-transporte-stop-content">
        <div className="dx-transporte-stop-heading"><strong>{stopLabels[stop.tipo] || stop.tipo}</strong>
          <div>{index > 0 && index < stops.length - 1 && <>
            <button type="button" aria-label={`Subir ${stopLabels[stop.tipo]}`} onClick={() => onMove(index, -1)}>&#8593;</button>
            <button type="button" aria-label={`Bajar ${stopLabels[stop.tipo]}`} onClick={() => onMove(index, 1)}>&#8595;</button>
            <button type="button" aria-label={`Quitar ${stopLabels[stop.tipo]}`} onClick={() => onRemove(index)}>&#10005;</button>
          </>}</div></div>
        <div className="dx-transporte-stop-place"><strong>{stop.nombre || 'Elige un lugar'}</strong>
          <span>{stop.direccion || 'Sin dirección'}</span>
          {!['origen', 'destino'].includes(stop.tipo) && <button type="button" className="dx-btn sm"
            onClick={() => onOpenPlacePicker(index)}>{stop.lugar_id ? 'Cambiar' : 'Elegir lugar'}</button>}
        </div>
        {errors[`parada_${index}`] && <small className="dx-ui-field-error">{errors[`parada_${index}`]}</small>}
        <div className="dx-transporte-time-window"><label className="dx-ui-field"><span>Ventana inicio</span>
          <input type="time" value={stop.ventana_inicio || ''} onChange={event =>
            onEdit(index, 'ventana_inicio', event.target.value)} /></label>
          <label className="dx-ui-field"><span>Ventana fin</span><input type="time" value={stop.ventana_fin || ''}
            onChange={event => onEdit(index, 'ventana_fin', event.target.value)} />
            {errors[`ventana_${index}`] && <small className="dx-ui-field-error">{errors[`ventana_${index}`]}</small>}
          </label></div>
      </div></article>)}
    <div className="dx-transporte-stop-add"><button type="button" className="dx-btn"
      onClick={() => onAdd('recojo')}>+ Recojo</button><button type="button" className="dx-btn"
      onClick={() => onAdd('entrega')}>+ Entrega</button></div>
    {placePicker && <section className="dx-transporte-place-picker"><header><strong>Buscar lugar</strong>
      <DxBuscador value={search} onChange={setSearch} label="Buscar lugares"
        placeholder="Buscar por nombre o dirección" /></header>
      {places.map(place => <button type="button" key={place.id} onClick={() => onSelectPlace(place)}>
        <strong>{place.nombre}</strong><small>{place.direccion || 'Sin dirección'}</small>
        <em>{place.cuenta_id ? 'Del cliente' : 'General'}</em></button>)}
      {!places.length && <p>No hay lugares que coincidan.</p>}
      <button type="button" className="dx-btn" onClick={onCreatePlace}>Crear lugar nuevo</button>
      <button type="button" className="dx-btn" onClick={onClosePlacePicker}>Cerrar</button>
    </section>}
  </div>;
}
