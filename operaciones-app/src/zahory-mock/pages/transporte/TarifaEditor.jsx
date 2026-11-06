import React, { useEffect, useState } from 'react';
import { TransportePanel } from './TransportePanel.jsx';
import { TransporteMapa } from './TransporteMapa.jsx';
import {
  encontrarCruceTarifa,
  ejemploCobroTarifa,
  formatearImporte,
  formatearFechaTransporte,
} from './transporteUtils.js';

const UNIT = { viaje: 'viaje', km: 'km', tonelada: 't', hora: 'h' };
const MODES = [['viaje', 'Viaje'], ['km', 'Km'], ['tonelada', 'Tonelada'], ['hora', 'Hora']];
const accountName = item => item?.nombre_comercial || item?.razon_social || 'Cliente';

export function TarifaEditor({
  open,
  form,
  update,
  save,
  saving,
  routes,
  accounts,
  types,
  tariffs,
  errors = {},
  formError,
  dirty,
  canCreate,
  canEdit,
  onClose,
  onEditConflict,
  onAnnul,
  annulTarget,
  setAnnulTarget,
}) {
  const [routeOpen, setRouteOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (open) {
      setRouteOpen(false);
      setAttempted(false);
    }
  }, [open]);

  const route = routes.find(item => item.id === form.ruta_id);
  const conflict = encontrarCruceTarifa(
    tariffs,
    form.ruta_id === '__all__' ? { ...form, ruta_id: null } : form,
    form.id,
  );
  const example = ejemploCobroTarifa(form, route);
  const other = tariffs.filter(
    item => item.ruta_id === (form.ruta_id === '__all__' ? null : form.ruta_id || null),
  );
  const client = accounts.find(item => item.id === form.cuenta_id);
  const forClient = form.cuenta_id !== null && form.cuenta_id !== undefined;
  const selectedRouteId = form.ruta_id === '__all__' ? null : form.ruta_id;
  const base = tariffs.find(item => item.ruta_id === (selectedRouteId || null)
    && !item.cuenta_id
    && item.estado === 'activa'
    && item.tipo_unidad === form.tipo_unidad
    && item.modalidad === form.modalidad
    && item.moneda === form.moneda
    && item.id !== form.id);
  const name = accountName(client);
  const points = route ? [
    {
      label: 'A',
      title: route.origen_nombre,
      coords: route.origen_latitud != null
        ? [Number(route.origen_latitud), Number(route.origen_longitud)]
        : null,
    },
    {
      label: 'B',
      title: route.destino_nombre,
      coords: route.destino_latitud != null
        ? [Number(route.destino_latitud), Number(route.destino_longitud)]
        : null,
    },
  ] : [];
  const updateField = (key, value) => update(key, value);
  const submit = event => {
    setAttempted(true);
    save(event);
  };
  const money = formatearImporte(example?.total, form.moneda, 'importe')
    .replace(/\s*\/(?:viaje|km|t|h)\s*$/, '');
  const calc = formatCalculation(example, route, form);
  const title = form.id ? 'Editar tarifa' : 'Nueva tarifa';

  return (
    <TransportePanel
      open={open}
      title={title}
      subtitle={form.id
        ? 'Los cambios aplican a cotizaciones y viajes nuevos; los viajes ya liquidados no cambian.'
        : 'Elige la ruta y para quién; abajo ves cuánto se cobrará en un viaje real.'}
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      footer={close => (
        <>
          <button type="button" className="dx-btn" onClick={close}>Cancelar</button>
          <button
            type="submit"
            form="tariff-form"
            className="dx-btn primary"
            disabled={saving || (form.id ? !canEdit : !canCreate)}
          >
            {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Guardar tarifa'}
          </button>
        </>
      )}
    >
      <div className="dx-transporte-composer-body dx-transporte-tarifa-body">
        <form
          id="tariff-form"
          className="dx-transporte-composer-form dx-transporte-tarifa-form"
          noValidate
          onSubmit={submit}
        >
          <section className="dx-transporte-composer-section">
            <h3><i>1</i> Ruta <small>selecciona el trayecto</small></h3>
            <div className="dx-ui-field" id="tarifa-ruta">
              <label htmlFor="tarifa-route-button">
                ¿Para qué ruta? <b className="dx-ui-required"> *</b>
              </label>
              <button
                id="tarifa-route-button"
                type="button"
                className="dx-transporte-tarifa-rsel"
                aria-haspopup="listbox"
                aria-expanded={routeOpen}
                onClick={() => setRouteOpen(current => !current)}
              >
                {route ? (
                  <>
                    <b>{route.codigo}</b>
                    <span>
                      <strong>{route.nombre}</strong>
                      <small>
                        {route.distancia_km || 'Sin dato'} km ·{' '}
                        {route.duracion_estimada_horas || 'Sin dato'} h
                      </small>
                    </span>
                  </>
                ) : form.ruta_id === '__all__' ? (
                  <>
                    <b>—</b>
                    <span><strong>Todas las rutas</strong><small>Tarifa general</small></span>
                  </>
                ) : (
                  <>
                    <b>—</b>
                    <span><strong>Elige una ruta</strong><small>Rutas activas de la empresa</small></span>
                  </>
                )}
                <i>▾</i>
              </button>
              {routeOpen && (
                <div className="dx-transporte-tarifa-options" role="listbox">
                  {routes.map(item => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={form.ruta_id === item.id}
                      key={item.id}
                      onClick={() => {
                        updateField('ruta_id', item.id);
                        setRouteOpen(false);
                      }}
                    >
                      <b>{item.codigo}</b>
                      <span>
                        <strong>{item.nombre}</strong>
                        <small>
                          {item.distancia_km || 'Sin dato'} km ·{' '}
                          {item.duracion_estimada_horas || 'Sin dato'} h
                        </small>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    role="option"
                    aria-selected={form.ruta_id === '__all__'}
                    onClick={() => {
                      updateField('ruta_id', '__all__');
                      setRouteOpen(false);
                    }}
                  >
                    Todas las rutas
                  </button>
                </div>
              )}
              {errors.ruta_id && <small className="dx-ui-field-error">{errors.ruta_id}</small>}
            </div>
          </section>

          <section className="dx-transporte-composer-section">
            <h3><i>2</i> ¿Para quién? <small>define la prioridad</small></h3>
            <div className="dx-transporte-tarifa-segmented">
              <button
                type="button"
                className={!forClient ? 'is-on' : ''}
                aria-pressed={!forClient}
                onClick={() => updateField('cuenta_id', null)}
              >
                Todos los clientes · tarifa base
              </button>
              <button
                type="button"
                className={forClient ? 'is-on' : ''}
                aria-pressed={forClient}
                onClick={() => updateField('cuenta_id', form.cuenta_id || '__select_client__')}
              >
                Un cliente
              </button>
            </div>
            {forClient && (
              <label className="dx-ui-field" htmlFor="tarifa-cliente">
                <span>Cliente <b className="dx-ui-required"> *</b></span>
                <select
                  id="tarifa-cliente"
                  value={form.cuenta_id === '__select_client__' ? '' : form.cuenta_id || ''}
                  onChange={event => updateField('cuenta_id', event.target.value || '__select_client__')}
                >
                  <option value="">Selecciona el cliente</option>
                  {accounts.map(item => (
                    <option key={item.id} value={item.id}>{accountName(item)}</option>
                  ))}
                </select>
                {errors.cuenta_id && <small className="dx-ui-field-error">{errors.cuenta_id}</small>}
              </label>
            )}
            <small className="dx-transporte-composer-hint">
              {forClient
                ? client
                  ? `Tiene prioridad sobre la tarifa base al cotizar y programar viajes de ${accountName(
                    client,
                  )}.`
                  : 'Elige el cliente: su tarifa tendrá prioridad sobre la base.'
                : 'Aplica a cualquier cliente que no tenga una tarifa propia en esta ruta.'}
            </small>
          </section>

          <section className="dx-transporte-composer-section">
            <h3><i>3</i> Precio <small>define cómo se calcula</small></h3>
            <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field" htmlFor="tarifa-unit">
                <span>Tipo de unidad <b className="dx-ui-required"> *</b></span>
                <select
                  id="tarifa-unit"
                  value={form.tipo_unidad || ''}
                  onChange={event => updateField('tipo_unidad', event.target.value)}
                >
                  <option value="">Selecciona unidad</option>
                  {types.map(item => <option key={item}>{item}</option>)}
                </select>
                {errors.tipo_unidad && <small className="dx-ui-field-error">{errors.tipo_unidad}</small>}
              </label>
              <div className="dx-ui-field" role="group" aria-label="Cobro por">
                <span>Cobro por <b className="dx-ui-required"> *</b></span>
                <div className="dx-transporte-tarifa-segmented dx-transporte-composer-segmented">
                  {MODES.map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      id={value === 'viaje' ? 'tarifa-modalidad' : undefined}
                      className={form.modalidad === value ? 'is-on' : ''}
                      aria-pressed={form.modalidad === value}
                      onClick={() => updateField('modalidad', value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {errors.modalidad && <small className="dx-ui-field-error">{errors.modalidad}</small>}
              </div>
              <label className="dx-ui-field" htmlFor="tarifa-precio">
                <span>Precio <b className="dx-ui-required"> *</b></span>
                <div className="dx-transporte-composer-withunit">
                  <input
                    id="tarifa-precio"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                    value={form.tarifa ?? ''}
                    onChange={event => updateField('tarifa', event.target.value)}
                  />
                  <em>/{UNIT[form.modalidad]}</em>
                </div>
                {errors.tarifa && <small className="dx-ui-field-error">{errors.tarifa}</small>}
              </label>
              <label className="dx-ui-field" htmlFor="tarifa-moneda">
                <span>Moneda <b className="dx-ui-required"> *</b></span>
                <select
                  id="tarifa-moneda"
                  value={form.moneda}
                  onChange={event => updateField('moneda', event.target.value)}
                >
                  <option value="PEN">PEN (S/)</option>
                  <option value="USD">USD (US$)</option>
                </select>
              </label>
              <label className="dx-ui-field" htmlFor="tarifa-minimo">
                <span>Mínimo facturable</span>
                <input
                  id="tarifa-minimo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimo_facturable ?? ''}
                  onChange={event => updateField('minimo_facturable', event.target.value)}
                />
                <small className="dx-transporte-composer-hint">
                  Si el cálculo sale menor, se cobra este monto.
                </small>
                {errors.minimo_facturable && (
                  <small className="dx-ui-field-error">{errors.minimo_facturable}</small>
                )}
              </label>
            </div>
          </section>

          <section className="dx-transporte-composer-section">
            <h3><i>4</i> Vigencia <small>periodo de aplicación</small></h3>
            <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field" htmlFor="tarifa-desde">
                <span>Desde <b className="dx-ui-required"> *</b></span>
                <input
                  id="tarifa-desde"
                  type="date"
                  required
                  value={form.vigente_desde || ''}
                  onChange={event => updateField('vigente_desde', event.target.value)}
                />
                {errors.vigente_desde && <small className="dx-ui-field-error">{errors.vigente_desde}</small>}
              </label>
              <label className="dx-ui-field" htmlFor="tarifa-hasta">
                <span>Hasta</span>
                <input
                  id="tarifa-hasta"
                  type="date"
                  value={form.vigente_hasta || ''}
                  onChange={event => updateField('vigente_hasta', event.target.value)}
                />
                <small className="dx-transporte-composer-hint">Vacío = sin fecha de fin.</small>
                {errors.vigente_hasta && <small className="dx-ui-field-error">{errors.vigente_hasta}</small>}
              </label>
            </div>
            {conflict && (
              <div
                className={`dx-transporte-composer-alert ${attempted ? 'is-red' : 'is-amber'}`}
                role="status"
              >
                <span>Ya hay una tarifa vigente igual:{' '}
                  <b>{formatearImporte(conflict.tarifa, conflict.moneda, conflict.modalidad)}
                    {' '}por {conflict.modalidad}</b>, desde{' '}
                  {formatearFechaTransporte(conflict.vigente_desde)}. Dos tarifas iguales no
                  pueden estar vigentes a la vez: cambia la vigencia o edita esa tarifa.</span>
                {' '}<button type="button" className="dx-btn link" onClick={() => onEditConflict(conflict)}>
                  Editar esa tarifa
                </button>
              </div>
            )}
          </section>

          {form.id && (
            <div>
              <label className="dx-transporte-composer-switch">
                <input
                  type="checkbox"
                  checked={form.estado === 'activa'}
                  onChange={event => updateField('estado', event.target.checked ? 'activa' : 'inactiva')}
                />
                <span>Tarifa activa</span>
              </label>
              {form.estado === 'activa' && canEdit && (
                <button type="button" className="dx-btn link" onClick={() => setAnnulTarget(form)}>
                  Anular tarifa
                </button>
              )}
            </div>
          )}
          <details className="dx-transporte-composer-details">
            <summary>Notas <small>{form.notas ? 'Notas agregadas' : 'Opcional'}</small></summary>
            <div>
              <label className="dx-ui-field" htmlFor="tarifa-notas">
                <span>Notas</span>
                <textarea
                  id="tarifa-notas"
                  rows="3"
                  value={form.notas || ''}
                  onChange={event => updateField('notas', event.target.value)}
                />
              </label>
            </div>
          </details>
          {Object.entries(errors).some(([key, message]) => key !== 'overlap' && message) && attempted && (
            <div className="dx-transporte-composer-alert is-red" role="alert">
              Revisa los campos indicados.
            </div>
          )}
          {formError && <div className="dx-transporte-composer-alert is-red" role="alert">{formError}</div>}
          {annulTarget && (
            <div className="dx-transporte-composer-confirm">
              <section role="alertdialog" aria-modal="true">
                <h3>¿Anular tarifa?</h3>
                <p>La tarifa dejará de estar activa.</p>
                <button type="button" className="dx-btn" onClick={() => setAnnulTarget(null)}>Volver</button>
                <button
                  type="button"
                  className="dx-btn primary"
                  disabled={saving}
                  onClick={() => onAnnul(annulTarget)}
                >
                  Confirmar anulación
                </button>
              </section>
            </div>
          )}
        </form>
        <aside className="dx-transporte-composer-aside dx-transporte-tarifa-aside">
          <TransporteMapa
            className="dx-transporte-tarifa-map"
            classNameMapa="dx-transporte-tarifa-map-canvas"
            puntos={points}
            soloLectura
            leyenda={route
              ? `${route.codigo} · ${Number(route.distancia_km || 0).toLocaleString('es-PE')} km${
                points.some(point => !point.coords) ? ' · destino sin lugar' : ''
              }`
              : 'Elige una ruta'}
          />
          <section className="dx-transporte-composer-preview">
            <h3>Así se cobrará</h3>
            <strong className="dx-transporte-tarifa-total">{example ? money : 'Sin dato'}</strong>
            <p>{calc}{example?.aplicaMinimo ? ' → se cobra el mínimo' : ''}</p>
            <div className="dx-transporte-tarifa-priority">
              <i className={forClient ? 'cli' : 'base'}>{forClient ? 'Cliente' : 'Base'}</i>
              <span>
                {forClient
                  ? client
                    ? `Para ${name} esta tarifa reemplaza a la base${base
                      ? ` (${formatearImporte(base.tarifa, base.moneda, base.modalidad)})`
                      : ''}.`
                    : 'Elige el cliente: su tarifa tendrá prioridad sobre la base.'
                  : 'Aplica a todos los clientes que no tengan tarifa propia en esta ruta.'}
              </span>
            </div>
          </section>
          <section className="dx-transporte-composer-preview">
            <h3>Otras tarifas de esta ruta</h3>
            {other.length ? other.map(item => (
              <div
                key={item.id}
                className={`dx-transporte-tarifa-row${item.estado !== 'activa' ? ' is-off' : ''}`}
              >
                <b>
                  {item.cuenta_id
                    ? accountName(accounts.find(account => account.id === item.cuenta_id))
                    : 'Tarifa base'}
                  {item.id === form.id ? ' · esta' : ''}
                </b>
                <strong>{formatearImporte(item.tarifa, item.moneda, item.modalidad)}</strong>
                <small>
                  {item.estado !== 'activa'
                    ? 'inactiva'
                    : `${item.tipo_unidad} · por ${item.modalidad} · desde ${formatearFechaTransporte(
                      item.vigente_desde,
                    )}`}
                </small>
              </div>
            )) : <small>Esta ruta todavía no tiene tarifas.</small>}
          </section>
        </aside>
      </div>
    </TransportePanel>
  );
}

function formatCalculation(example, route, form) {
  if (!example || !route) return 'Completa ruta, unidad y precio para ver el ejemplo.';
  if (form.modalidad === 'viaje') return `1 viaje ${route.codigo} con ${form.tipo_unidad}`;
  if (form.modalidad === 'km') {
    return `${Number(route.distancia_km || 0).toLocaleString('es-PE')} km × ${formatearImporte(
      form.tarifa,
      form.moneda,
      form.modalidad,
    )} (${route.codigo})`;
  }
  if (form.modalidad === 'tonelada') {
    return `${example.cantidad} t × ${formatearImporte(
      form.tarifa,
      form.moneda,
      form.modalidad,
    )} (ejemplo con carga completa)`;
  }
  return `${example.cantidad} h × ${formatearImporte(
    form.tarifa,
    form.moneda,
    form.modalidad,
  )} (duración de ${route.codigo})`;
}
