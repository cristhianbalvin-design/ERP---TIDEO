import React, { useEffect, useMemo, useRef, useState } from 'react';
import { crearLugar, actualizarLugar } from '../../../services/transporteLugaresService.js';
import { TransporteMapa } from './TransporteMapa.jsx';
import { TransportePanel } from './TransportePanel.jsx';
import {
  validarLugar,
  parsearCoordenadasMaps,
  encontrarNombreLugarDuplicado,
} from './transporteUtils.js';

export const TIPOS_LUGAR = {
  almacen: 'Almacén',
  planta: 'Planta',
  obra: 'Obra',
  mina: 'Mina',
  puerto: 'Puerto',
  cliente: 'Cliente',
  otro: 'Otro',
};

const ICONS = {
  almacen: '▦',
  planta: '⚙',
  obra: '⌖',
  mina: '◆',
  puerto: '⚓',
  cliente: '♡',
  otro: '⌖',
};

const BLANK = {
  nombre: '',
  cuenta_id: '',
  tipo: 'otro',
  direccion: '',
  referencia: '',
  distrito: '',
  provincia: '',
  departamento: '',
  ubigeo: '',
  latitud: '',
  longitud: '',
  contacto_nombre: '',
  contacto_telefono: '',
  horario_atencion: '',
  requisitos_acceso: '',
  restricciones: '',
  notas: '',
};

const MORE = [
  ['referencia', 'Referencia', 'p. ej. Frente al grifo Repsol, portón azul'],
  ['distrito', 'Distrito', ''],
  ['provincia', 'Provincia', ''],
  ['departamento', 'Departamento', ''],
  ['contacto_nombre', 'Contacto', 'Nombre'],
  ['contacto_telefono', 'Teléfono', ''],
  ['ubigeo', 'Ubigeo', '150119'],
  ['horario_atencion', 'Horario de atención', 'Lun–Sáb 07:00–17:00'],
  ['requisitos_acceso', 'Requisitos de acceso', 'EPP, SCTR, inducción, documentos del conductor…'],
  ['restricciones', 'Restricciones', 'Altura máxima, peso, horario de ingreso de carga pesada…'],
  ['notas', 'Notas', ''],
];

const val = (form, key) => form[key] ?? '';

export function LugarEditorModal({
  open,
  lugar = null,
  cuentas = [],
  cuentaPreseleccionada = '',
  empresaId,
  onClose,
  onSaved,
  onError,
  onViewLugar,
  lugares = [],
  rutas = [],
}) {
  const initial = useMemo(() => ({
    ...BLANK,
    ...lugar,
    cuenta_id: lugar?.cuenta_id || cuentaPreseleccionada || '',
  }), [lugar, cuentaPreseleccionada]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
      setFormError('');
      setSubmitted(false);
      setLinkError(false);
    }
  }, [open, initial]);

  function validate(current) {
    const next = validarLugar(current);
    if (linkError) {
      next.ubicacion = 'No encontramos coordenadas en ese enlace. Ábrelo en Google Maps '
        + 'y copia el enlace completo, o marca el punto en el mapa.';
    }
    return next;
  }

  useEffect(() => {
    if (submitted) setErrors(validate(form));
  }, [form, submitted, linkError]);

  const duplicate = encontrarNombreLugarDuplicado(lugares, form, lugar?.id);
  const lat = form.latitud !== '' && form.longitud !== ''
    ? [Number(form.latitud), Number(form.longitud)]
    : null;
  const uses = rutas.filter(route => route.origen_lugar_id === lugar?.id
    || route.destino_lugar_id === lugar?.id);
  const completed = MORE.filter(([key]) => String(val(form, key)).trim()).length;
  const account = cuentas.find(item => item.id === form.cuenta_id);
  const locationError = linkError
    ? 'No encontramos coordenadas en ese enlace. Ábrelo en Google Maps '
      + 'y copia el enlace completo, o marca el punto en el mapa.'
    : errors.ubicacion;

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setFormError('');
  }

  async function save(event) {
    event.preventDefault();
    setSubmitted(true);
    const next = validate(form);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => (
        next.nombre ? document.getElementById('lugar-maps-url') : nameRef.current
      )?.focus());
      return;
    }
    if (duplicate) return;
    setSaving(true);
    setFormError('');
    try {
      const { map_url, ...rest } = form;
      const payload = {
        ...rest,
        cuenta_id: form.cuenta_id || null,
        latitud: Number(form.latitud),
        longitud: Number(form.longitud),
      };
      const saved = lugar?.id
        ? await actualizarLugar(empresaId, lugar.id, payload)
        : await crearLugar(empresaId, payload);
      onSaved?.(saved);
    } catch (error) {
      setFormError(error.message || 'No se pudo guardar el lugar.');
      onError?.(error);
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, placeholder = '', required = false, kind = 'text') => (
    <label className="dx-ui-field" htmlFor={`lugar-${key}`} key={key}>
      <span>{label}{required && <b className="dx-ui-required"> *</b>}</span>
      {kind === 'textarea' ? (
        <textarea
          id={`lugar-${key}`}
          value={val(form, key)}
          placeholder={placeholder}
          aria-invalid={Boolean(errors[key])}
          onChange={event => update(key, event.target.value)}
        />
      ) : (
        <input
          id={`lugar-${key}`}
          ref={key === 'nombre' ? nameRef : null}
          value={val(form, key)}
          placeholder={placeholder}
          aria-required={required || undefined}
          aria-invalid={Boolean(errors[key])}
          onChange={event => update(key, event.target.value)}
        />
      )}
      {errors[key] && <small className="dx-ui-field-error">{errors[key]}</small>}
    </label>
  );

  const pointStatus = lat ? (
    <>
      <b className="dx-transporte-place-gps">GPS</b>
      <strong>Punto marcado en el mapa</strong>
      <small>Arrastra el marcador para afinarlo.</small>
      <button
        type="button"
        className="dx-btn link"
        onClick={() => setForm(current => ({ ...current, latitud: '', longitud: '' }))}
      >
        Quitar punto
      </button>
    </>
  ) : <strong>◎ Haz clic en el mapa para marcar el punto</strong>;

  return (
    <TransportePanel
      open={open}
      title={lugar?.id ? 'Editar lugar' : 'Nuevo lugar'}
      subtitle={lugar?.id
        ? `${lugar.nombre} · los cambios se aplican a los viajes nuevos.`
        : 'Dinos qué es y dónde está; el punto del mapa lo usan las rutas para estimar distancias.'}
      dirty={JSON.stringify(form) !== JSON.stringify(initial)}
      busy={saving}
      onClose={onClose}
      footer={close => (
        <>
          <button type="button" className="dx-btn" onClick={close}>Cancelar</button>
          <button
            type="submit"
            form="lugar-form"
            className="dx-btn primary"
            disabled={saving}
          >
            {saving ? 'Guardando…' : lugar?.id ? 'Guardar cambios' : 'Guardar lugar'}
          </button>
        </>
      )}
    >
      <div className="dx-transporte-composer-body dx-transporte-place-body">
        <form
          id="lugar-form"
          className="dx-transporte-composer-form dx-transporte-place-form"
          noValidate
          onSubmit={save}
        >
          <section className="dx-transporte-composer-section">
            <h3><i>1</i> Datos del lugar <small>nombre, tipo y dirección</small></h3>
            {field('nombre', 'Nombre', 'p. ej. Almacén Cliente Pisco', true)}
            {duplicate && (
              <div className="dx-transporte-composer-alert is-amber" role="status">
                <span>Ya existe <b>{duplicate.nombre}</b> como{' '}
                {form.cuenta_id ? 'lugar de este cliente' : 'lugar general'}.
                {' '}No se pueden repetir nombres activos.</span>
                {' '}<button
                  type="button"
                  className="dx-btn link"
                  onClick={() => onViewLugar ? onViewLugar(duplicate) : onClose?.()}
                >
                  Ver lugar
                </button>
              </div>
            )}
            <div className="dx-transporte-place-label">Tipo <b className="dx-ui-required"> *</b></div>
            <div className="dx-transporte-lugar-types" role="group" aria-label="Tipo de lugar">
              {Object.entries(TIPOS_LUGAR).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={form.tipo === key ? 'is-on' : ''}
                  aria-pressed={form.tipo === key}
                  onClick={() => update('tipo', key)}
                >
                  <i aria-hidden="true">{ICONS[key]}</i>{label}
                </button>
              ))}
            </div>
            <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field" htmlFor="lugar-cuenta">
                <span>Cliente</span>
                <select
                  id="lugar-cuenta"
                  value={form.cuenta_id}
                  onChange={event => update('cuenta_id', event.target.value)}
                >
                  <option value="">Lugar general (sin cliente)</option>
                  {cuentas.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.nombre_comercial || item.razon_social}
                    </option>
                  ))}
                </select>
                <small className="dx-transporte-composer-hint">
                  Déjalo en «Lugar general» si lo usan varios clientes.
                </small>
              </label>
              {field('direccion', 'Dirección', 'Calle, número, distrito')}
            </div>
          </section>

          <section className="dx-transporte-composer-section">
            <h3>
              <i>2</i> Ubicación <b className="dx-ui-required"> *</b>
              {' '}<small>obligatoria · la usan las rutas para estimar distancia</small>
            </h3>
            <div className={`dx-transporte-place-status${locationError ? ' is-error' : ''}`}>
              {pointStatus}
            </div>
            <div className="dx-transporte-place-or">o pega un enlace</div>
            <label className="dx-ui-field" htmlFor="lugar-maps-url">
              <span>Enlace de Google Maps</span>
              <input
                id="lugar-maps-url"
                inputMode="url"
                value={form.map_url || ''}
                placeholder="https://maps.google.com/…@-13.71,-76.20"
                onChange={event => {
                  const url = event.target.value;
                  const coords = parsearCoordenadasMaps(url);
                  setLinkError(Boolean(url.trim()) && !coords);
                  if (coords) setErrors(current => ({ ...current, ubicacion: '' }));
                  setForm(current => ({ ...current, map_url: url, ...(coords || {}) }));
                }}
              />
              <small className="dx-transporte-composer-hint">
                En Google Maps: Compartir → Copiar enlace. El punto aparece en el mapa.
              </small>
              {locationError && form.map_url && (
                <small className="dx-ui-field-error" role="alert">{locationError}</small>
              )}
            </label>
            {locationError && !form.map_url && (
              <small className="dx-ui-field-error" role="alert">{locationError}</small>
            )}
          </section>

          <details className="dx-transporte-composer-details">
            <summary>
              Más datos <small>{completed
                ? `${completed} dato${completed > 1 ? 's' : ''} completado${completed > 1 ? 's' : ''}`
                : 'referencia, contacto, horario y accesos'}</small>
            </summary>
            <div>
              {field('referencia', 'Referencia', MORE[0][2])}
              <div className="dx-transporte-place-grid3">
                {MORE.slice(1, 4).map(([key, label, placeholder]) => field(key, label, placeholder))}
              </div>
              <div className="dx-transporte-place-grid3">
                {MORE.slice(4, 7).map(([key, label, placeholder]) => field(key, label, placeholder))}
              </div>
              {field('horario_atencion', 'Horario de atención', MORE[7][2])}
              {field('requisitos_acceso', 'Requisitos de acceso', MORE[8][2], false, 'textarea')}
              {field('restricciones', 'Restricciones', MORE[9][2], false, 'textarea')}
              {field('notas', 'Notas', '', false, 'textarea')}
            </div>
          </details>
          {lugar?.id && (
            <div>
              <label className="dx-transporte-composer-switch">
                <input
                  type="checkbox"
                  checked={form.estado !== 'inactivo'}
                  onChange={event => update('estado', event.target.checked ? 'activo' : 'inactivo')}
                />
                <span>Lugar activo</span>
              </label>
              <small className="dx-transporte-composer-hint">
                Si lo desactivas, deja de aparecer en los buscadores de rutas y viajes.
                Las rutas que ya lo usan no cambian.
              </small>
            </div>
          )}
          {formError && <div className="dx-transporte-composer-alert is-red" role="alert">{formError}</div>}
        </form>

        <aside className="dx-transporte-composer-aside dx-transporte-place-aside">
          <TransporteMapa
            className="dx-transporte-place-map"
            classNameMapa="dx-transporte-place-map-canvas"
            puntoNuevo={lat}
            lugaresReferencia={lugares
              .filter(item => item.id !== lugar?.id && item.latitud != null && item.longitud != null)
              .map(item => ({
                coords: [Number(item.latitud), Number(item.longitud)],
                title: item.nombre,
              }))}
            alMarcar={point => { setLinkError(false); setErrors(current => ({ ...current, ubicacion: '' }));
              setForm(current => ({
              ...current,
              latitud: String(point.lat),
              longitud: String(point.lng),
            })); }}
            alMover={point => { setLinkError(false); setErrors(current => ({ ...current, ubicacion: '' }));
              setForm(current => ({
              ...current,
              latitud: String(point.lat),
              longitud: String(point.lng),
            })); }}
            leyenda={lat
              ? 'Arrastra el marcador para afinarlo'
              : 'Haz clic en el mapa para marcar el punto'}
          />
          <section className="dx-transporte-composer-preview">
            <h3>Así aparecerá en los buscadores</h3>
            <div className="dx-transporte-place-search-result">
              <i>{ICONS[form.tipo] || ICONS.otro}</i>
              <span>
                <b>{form.nombre || 'Nombre del lugar'}</b>
                <small>
                  {form.direccion || 'Sin dirección'} · {account
                    ? account.nombre_comercial || account.razon_social
                    : 'Lugar general'}
                </small>
              </span>
              {!lat && <b className="dx-transporte-place-nogps">Sin GPS</b>}
            </div>
          </section>
          {lugar?.id && uses.length > 0 && (
            <section className="dx-transporte-composer-preview">
              <h3>Usado en</h3>
              {uses.map(route => (
                <div className="dx-transporte-place-route" key={route.id}>
                  <i>{route.origen_lugar_id === lugar.id ? 'A · origen' : 'B · destino'}</i>
                  <span><b>{route.codigo}</b><small>{route.nombre}</small></span>
                </div>
              ))}
              <small>Las rutas guardan su propia distancia: si mueves el punto, no cambian solas.</small>
            </section>
          )}
        </aside>
      </div>
    </TransportePanel>
  );
}
