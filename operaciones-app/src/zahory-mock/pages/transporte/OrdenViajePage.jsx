import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { crearViaje, editarViaje, obtenerViaje, listarOSCliente, resolverTarifa, cambiarEstadoViaje } from '../../../services/transporteViajesService.js';
import { listarRutas } from '../../../services/transporteRutasService.js';
import { listarCuentasTransporte, listarTiposUnidadTransporte } from '../../../services/transporteTarifasService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';
import { ModalShell } from '../../components/ModalShell.jsx';
import { cantidadFacturableViaje, fechaActualLocal, fechaUtcAFechaLocalInput, fechaLocalInputAFechaUtc, formatearImporte, ingresoEstimadoViaje, unificarTiposUnidad, validarFormularioViaje, sincronizarParadasViaje } from './transporteUtils.js';

const UNIT_DEFAULTS = ['Camioneta', 'Furgón', 'Camión 2 ejes', 'Camión 3 ejes', 'Tracto con semirremolque', 'Cama baja'];
const blank = () => ({ cuenta_id: '', os_cliente_id: '', fecha_programada: `${fechaActualLocal()}T08:00`, ruta_id: '', origen_nombre: '', destino_nombre: '', distancia_km: '', duracion_estimada_horas: '', tipo_unidad: '', modalidad: 'viaje', carga_descripcion: '', peso_toneladas: '', volumen_m3: '', cantidad_facturable: '1', tarifa_id: null, tarifa_unitaria: '', moneda: 'PEN', minimo_facturable: '', observaciones: '', procedencia_tarifa: '', paradas: sincronizarParadasViaje([], '', '') });
const labelCuenta = x => x.nombre_comercial || x.razon_social || x.ruc || x.id;

function Field({ label, name, form, set, errors = {}, type = 'text', required = false, ...props }) {
  const error = errors[name];
  return <label className="dx-ui-field"><span>{label}{required && <i className="dx-ui-required"> *</i>}</span><input name={name} type={type} value={form[name] ?? ''} onChange={e => set(name, e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} {...props} />{error && <small className="dx-ui-field-error" id={`${name}-error`} role="alert">{error}</small>}</label>;
}

function Section({ title, children, className = '' }) {
  return <section className={`dx-transporte-form-block ${className}`}><h2 className="dx-transporte-form-section">{title}</h2><div className="dx-ui-form-grid">{children}</div></section>;
}

export function OrdenViajePage({ onNav }) {
  const sesion = useSesionOperativa(); const empresaId = sesion.empresaId; const access = usePermisosTransporte(sesion);
  const viajeId = new URLSearchParams(globalThis.window?.location?.hash?.split('?')[1] || '').get('id');
  const canSave = viajeId ? access.editar : access.crear;
  const [form, setForm] = useState(blank), [cuentas, setCuentas] = useState([]), [os, setOS] = useState([]), [rutas, setRutas] = useState([]), [tipos, setTipos] = useState([]), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [fieldErrors, setFieldErrors] = useState({}), [formError, setFormError] = useState(''), [tariffMessage, setTariffMessage] = useState(''), [tariffBusy, setTariffBusy] = useState(false), [baseline, setBaseline] = useState('');

  const assign = (key, value) => {
    setForm(old => {
      const next = { ...old, [key]: value };
      if (['tarifa_unitaria', 'minimo_facturable'].includes(key)) next.procedencia_tarifa = 'manual';
      if (key === 'ruta_id') {
        const route = rutas.find(item => item.id === value);
        if (route) Object.assign(next, { origen_nombre: route.origen_nombre || '', destino_nombre: route.destino_nombre || '', distancia_km: route.distancia_km ?? '', duracion_estimada_horas: route.duracion_estimada_horas ?? '' });
      }
      if (['ruta_id', 'origen_nombre', 'destino_nombre'].includes(key)) next.paradas = sincronizarParadasViaje(old.paradas, next.origen_nombre, next.destino_nombre);
      if (key === 'modalidad' || ['distancia_km', 'peso_toneladas', 'duracion_estimada_horas'].includes(key)) next.cantidad_facturable = String(cantidadFacturableViaje(next.modalidad, next) ?? '');
      return next;
    });
    setFieldErrors(old => ({ ...old, [key]: '' })); setFormError('');
  };

  const load = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    try {
      const [accounts, routeList, unitTypes] = await Promise.all([listarCuentasTransporte(empresaId), listarRutas(empresaId), listarTiposUnidadTransporte(empresaId)]);
      setCuentas(accounts); setRutas(routeList); setTipos(unificarTiposUnidad(UNIT_DEFAULTS, unitTypes));
      let initial = blank();
      if (viajeId) {
        const viaje = await obtenerViaje(empresaId, viajeId);
        if (!viaje) throw Error('No se encontró el viaje solicitado.');
        const savedStops = viaje.paradas || [];
        const stops = savedStops.length ? savedStops.map(stop => ({ ...stop, nombre_manual: stop.tipo === 'origen' ? stop.nombre !== viaje.origen_nombre : stop.tipo === 'destino' ? stop.nombre !== viaje.destino_nombre : undefined })) : [];
        initial = { ...initial, ...viaje, fecha_programada: fechaUtcAFechaLocalInput(viaje.fecha_programada), paradas: sincronizarParadasViaje(stops, viaje.origen_nombre, viaje.destino_nombre) };
      }
      setForm(initial); setBaseline(JSON.stringify(initial));
    } catch (e) { setFormError(e.message || 'No se pudo cargar el formulario.'); } finally { setLoading(false); }
  }, [empresaId, access.ver, viajeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { let active = true; listarOSCliente(empresaId, form.cuenta_id).then(data => { if (active) setOS(data); }).catch(e => setFormError(e.message)); return () => { active = false; }; }, [empresaId, form.cuenta_id]);

  const dirty = JSON.stringify(form) !== baseline;
  const ingreso = ingresoEstimadoViaje(form.tarifa_unitaria, form.cantidad_facturable, form.minimo_facturable);
  const cuentaOptions = useMemo(() => cuentas.map(x => ({ ...x, nombre: labelCuenta(x) })), [cuentas]);
  function stopsEdit(i, key, value) { setForm(old => ({ ...old, paradas: old.paradas.map((stop, n) => n === i ? { ...stop, [key]: value, ...(key === 'nombre' && ['origen', 'destino'].includes(stop.tipo) ? { nombre_manual: true } : {}) } : stop) })); }
  function moveStop(i, delta) { setForm(old => { const list = [...old.paradas], j = i + delta; if (j < 1 || j >= list.length - 1) return old; [list[i], list[j]] = [list[j], list[i]]; return { ...old, paradas: list }; }); }
  function addStop(tipo) { setForm(old => ({ ...old, paradas: [...old.paradas.slice(0, -1), { tipo, nombre: '' }, old.paradas.at(-1)] })); }
  function removeStop(i) { setForm(old => ({ ...old, paradas: old.paradas.filter((_, n) => n !== i) })); }

  async function findTariff() {
    setTariffBusy(true); setFormError(''); setTariffMessage('');
    try {
      const tariff = await resolverTarifa({ empresaId, rutaId: form.ruta_id || null, cuentaId: form.cuenta_id || null, tipoUnidad: form.tipo_unidad, modalidad: form.modalidad, moneda: form.moneda, fecha: form.fecha_programada?.slice(0, 10) || fechaActualLocal() });
      if (!tariff) { setTariffMessage('No se encontró una tarifa vigente para esta combinación.'); return; }
      setForm(old => ({ ...old, tarifa_id: tariff.tarifa_id || tariff.id, tarifa_unitaria: String(tariff.tarifa), minimo_facturable: String(tariff.minimo_facturable ?? ''), procedencia_tarifa: tariff.cuenta_id ? 'cliente' : 'base' }));
      setTariffMessage(tariff.cuenta_id ? 'Tarifa de cliente aplicada.' : 'Tarifa base aplicada.');
    } catch (e) { setFormError(e.message); } finally { setTariffBusy(false); }
  }
  async function submit(schedule) {
    const errors = validarFormularioViaje(form);
    if (Object.keys(errors).length) { setFieldErrors(errors); requestAnimationFrame(() => document.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus()); return; }
    setFieldErrors({}); setSaving(true); setFormError('');
    try {
      const payload = { ...form, fecha_programada: fechaLocalInputAFechaUtc(form.fecha_programada), ingreso_estimado: ingreso, paradas: form.paradas };
      const current = viajeId ? await editarViaje(empresaId, viajeId, payload) : await crearViaje(empresaId, payload);
      if (schedule && current.estado === 'borrador') {
        try { await cambiarEstadoViaje(current.id, 'programado'); }
        catch (error) { throw new Error(`El viaje quedó guardado como borrador, pero no se pudo programar: ${error.message}`); }
      }
      onNav('transporte-viajes');
    } catch (e) { setFormError(e.message || 'No se pudo guardar la orden.'); } finally { setSaving(false); }
  }
  function close() { onNav('transporte-viajes'); }
  if (access.motivo) return <AccesoTransporte acceso={access} />;

  return <section className="dx-ui dx-transporte"><ModalShell open title={viajeId ? 'Editar orden de viaje' : 'Nueva orden de viaje'} subtitle="Transporte Comercial" variant="dx-modal dx-transporte-modal" fullPage dirty={dirty} busy={saving} onClose={close} pageHeader={closeRequest => <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte Comercial</div><h1 className="dx-ui-title">{viajeId ? 'Editar orden de viaje' : 'Nueva orden de viaje'}</h1></div><button className="dx-btn" onClick={closeRequest}>Cerrar</button></header>} footer={viajeId && form.estado === 'programado' ? <button className="dx-btn primary" disabled={saving || loading || !canSave} onClick={() => submit(false)}>Guardar cambios</button> : <><button className="dx-btn" disabled={saving || loading || !canSave} onClick={() => submit(false)}>{viajeId ? 'Guardar borrador' : 'Guardar como borrador'}</button><button className="dx-btn primary" disabled={saving || loading || !canSave} onClick={() => submit(true)}>Guardar y programar</button></>}>
    {loading ? <div className="card-body">Cargando formulario…</div> : <div className="card-body dx-transporte-form"><form onSubmit={e => e.preventDefault()}>
      <Section title="General">
        <DxReferenceSelector label="Cliente" name="cuenta_id" required options={cuentaOptions} value={form.cuenta_id} onChange={value => { assign('cuenta_id', value); assign('os_cliente_id', ''); }} getLabel={labelCuenta} error={fieldErrors.cuenta_id} />
        <DxReferenceSelector label="OS cliente" name="os_cliente_id" optionalLabel="Sin OS cliente" options={os} value={form.os_cliente_id || ''} onChange={value => assign('os_cliente_id', value)} getLabel={x => x.numero || x.codigo || x.nombre || x.id} />
        <Field label="Fecha programada" type="datetime-local" name="fecha_programada" required form={form} set={assign} errors={fieldErrors} />
      </Section>
      <Section title="Ruta">
        <DxReferenceSelector label="Ruta del maestro" name="ruta_id" optionalLabel="Sin ruta" options={rutas.filter(r => r.estado === 'activa')} value={form.ruta_id || ''} onChange={value => assign('ruta_id', value)} getLabel={r => `${r.codigo} · ${r.origen_nombre} → ${r.destino_nombre}`} />
        <Field label="Origen" name="origen_nombre" required form={form} set={assign} errors={fieldErrors} />
        <Field label="Destino" name="destino_nombre" required form={form} set={assign} errors={fieldErrors} />
        <Field label="Distancia (km)" name="distancia_km" type="number" min="0" form={form} set={assign} />
        <Field label="Duración estimada (h)" name="duracion_estimada_horas" type="number" min="0" form={form} set={assign} />
      </Section>
      <Section title="Carga">
        <label className="dx-ui-field"><span>Tipo de unidad *</span><select className="dx-ui-select" name="tipo_unidad" value={form.tipo_unidad || ''} onChange={e => assign('tipo_unidad', e.target.value)}><option value="">Seleccionar…</option>{unificarTiposUnidad(UNIT_DEFAULTS.concat(tipos), form.tipo_unidad ? [form.tipo_unidad] : []).map(type => <option key={type} value={type}>{type}</option>)}</select>{fieldErrors.tipo_unidad && <small className="dx-ui-field-error">{fieldErrors.tipo_unidad}</small>}</label>
        <Field label="Descripción de carga" name="carga_descripcion" form={form} set={assign} />
        <Field label="Peso (t)" name="peso_toneladas" type="number" min="0" step="0.001" form={form} set={assign} />
        <Field label="Volumen (m³)" name="volumen_m3" type="number" min="0" step="0.001" form={form} set={assign} />
      </Section>
      <Section title="Tarifa" className="dx-transporte-tariff-block">
        <label className="dx-ui-field"><span>Modalidad</span><select className="dx-ui-select" name="modalidad" value={form.modalidad} onChange={e => assign('modalidad', e.target.value)}>{[['viaje', 'Por viaje'], ['km', 'Por km'], ['tonelada', 'Por tonelada'], ['hora', 'Por hora']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="dx-ui-field"><span>Moneda</span><select className="dx-ui-select" name="moneda" value={form.moneda} onChange={e => assign('moneda', e.target.value)}><option value="PEN">PEN</option><option value="USD">USD</option></select></label>
        <div className="dx-transporte-tariff-search"><span aria-hidden="true">&nbsp;</span><button type="button" className="dx-btn" disabled={tariffBusy || !form.tipo_unidad} onClick={findTariff}>{tariffBusy ? 'Buscando…' : 'Buscar tarifa'}</button></div>
        <Field label="Tarifa unitaria" name="tarifa_unitaria" type="number" min="0" step="0.0001" form={form} set={assign} />
        <Field label="Mínimo facturable" name="minimo_facturable" type="number" min="0" step="0.01" form={form} set={assign} />
        <Field label="Cantidad facturable" name="cantidad_facturable" type="number" min="0" step="0.001" form={form} set={assign} />
        <div className="dx-transporte-income"><span>Ingreso estimado</span><strong>{ingreso == null ? 'Sin dato' : formatearImporte(ingreso, form.moneda)}</strong></div>
        <div className="dx-transporte-tariff-origin"><span>Procedencia de tarifa</span><strong>{form.procedencia_tarifa === 'cliente' ? 'Tarifa de cliente' : form.procedencia_tarifa === 'base' ? 'Tarifa base' : form.tarifa_id ? 'Manual' : 'Sin tarifa'}</strong>{tariffMessage && <small role="status">{tariffMessage}</small>}</div>
      </Section>
      <Section title="Paradas" className="dx-transporte-stops-block">
        {form.paradas.map((stop, i) => <div className="dx-transporte-stop-edit" key={`${stop.tipo}-${i}`}><b>{i + 1}. {({ origen: 'Origen', recojo: 'Recojo', entrega: 'Entrega', destino: 'Destino' })[stop.tipo] || stop.tipo}</b><label className="dx-ui-field"><span>Nombre *</span><input value={stop.nombre || ''} onChange={e => stopsEdit(i, 'nombre', e.target.value)} />{fieldErrors[`parada_${i}`] && <small className="dx-ui-field-error">{fieldErrors[`parada_${i}`]}</small>}</label><label className="dx-ui-field"><span>Dirección</span><input value={stop.direccion || ''} onChange={e => stopsEdit(i, 'direccion', e.target.value)} /></label><div className="dx-transporte-stop-actions">{i > 0 && i < form.paradas.length - 1 && <><button type="button" className="dx-btn sm" aria-label={`Subir ${stop.tipo}`} disabled={i === 1} onClick={() => moveStop(i, -1)}>↑</button><button type="button" className="dx-btn sm" aria-label={`Bajar ${stop.tipo}`} disabled={i === form.paradas.length - 2} onClick={() => moveStop(i, 1)}>↓</button><button type="button" className="dx-btn sm" aria-label={`Quitar ${stop.tipo}`} onClick={() => removeStop(i)}>Quitar</button></>}</div></div>)}
        <div className="dx-transporte-add-stops"><button type="button" className="dx-btn" onClick={() => addStop('recojo')}>Agregar recojo</button><button type="button" className="dx-btn" onClick={() => addStop('entrega')}>Agregar entrega</button></div>
      </Section>
      <Section title="Observaciones"><label className="dx-ui-field dx-ui-field-full"><span>Observaciones</span><textarea name="observaciones" value={form.observaciones || ''} onChange={e => assign('observaciones', e.target.value)} /></label></Section>
    </form>{formError && <div className="dx-transporte-error" role="alert">{formError}</div>}</div>}
  </ModalShell></section>;
}
