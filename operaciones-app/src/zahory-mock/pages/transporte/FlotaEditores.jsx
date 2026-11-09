import React, { useEffect, useState } from 'react';
import { TransportePanel } from './TransportePanel.jsx';
import { guardarConductor, guardarTransportista, guardarVehiculo } from '../../../services/transporteFlotaService.js';
import {
  UNIT_DEFAULTS, estadoDocumento, etiquetaTipoVehiculo, formatearNumeroTransporte, normalizarPlaca, rucValido,
  unificarTiposUnidad, validarConductorFlota, validarTransportistaFlota, validarUnidadFlota,
} from './transporteUtils.js';

const CATEGORIAS = ['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc'];
const nombreTransportista = item => item.nombre_comercial || item.razon_social;
const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')
  .toLocaleUpperCase('es-PE');

export function Placa({ placa }) {
  return <span className="dx-tmsflota-plate"><span>{placa || '———'}</span></span>;
}

function Campo({ id, label, required, error, hint, children }) {
  return <label className="dx-ui-field" htmlFor={id}><span>{label}{required && <b className="dx-ui-required"> *</b>}</span>
    {children}{hint && <small className="dx-transporte-composer-hint">{hint}</small>}
    {error && <small className="dx-ui-field-error" role="alert">{error}</small>}</label>;
}

function Usos({ titulo = 'Cómo se usa', items }) {
  return <div className="dx-tmsflota-uses"><div className="dx-tmsflota-uses-h">{titulo}</div>
    {items.map(([icono, nombre, texto]) => <div key={nombre} className="dx-tmsflota-use"><i aria-hidden="true">{icono}</i>
      <div><b>{nombre}</b>{texto}</div></div>)}</div>;
}

function useEditor(inicial, open) {
  const [form, setForm] = useState(inicial);
  const [base, setBase] = useState(JSON.stringify(inicial));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  useEffect(() => {
    if (!open) return;
    setForm(inicial); setBase(JSON.stringify(inicial)); setErrors({}); setServerError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key, value) => { setForm(old => ({ ...old, [key]: value })); setErrors(old => ({ ...old, [key]: '' })); };
  return { form, set, errors, setErrors, saving, setSaving, serverError, setServerError, dirty: JSON.stringify(form) !== base };
}

async function enviar(editor, validar, guardarFn, onSaved, primerCampo) {
  const errores = validar(editor.form);
  if (Object.keys(errores).length) {
    editor.setErrors(errores);
    globalThis.document?.querySelector?.('.ops-zahory-host')?.shadowRoot?.getElementById(primerCampo(errores))?.focus();
    return;
  }
  editor.setSaving(true); editor.setServerError('');
  try { onSaved(await guardarFn()); } catch (error) { editor.setServerError(error.message || 'No se pudo guardar.'); }
  finally { editor.setSaving(false); }
}

const pie = (editor, nuevo, textoNuevo, formId) => close => <>
  <button type="button" className="dx-btn" onClick={close} disabled={editor.saving}>Cancelar</button>
  <button type="submit" form={formId} className="dx-btn primary" disabled={editor.saving}>
    {editor.saving ? 'Guardando…' : nuevo ? textoNuevo : 'Guardar cambios'}</button></>;

export function UnidadEditor({ open, unidad, empresaId, transportistas, vehiculos, tipos = [], onClose, onSaved }) {
  const nuevo = !unidad?.id;
  const inicial = { placa: unidad?.placa || '', transportista_id: unidad?.transportista_id || transportistas.find(item => item.tipo_operador === 'propio')?.id || transportistas[0]?.id || '',
    tipo: unidad?.tipo ? etiquetaTipoVehiculo(unidad.tipo) : 'Furgón', marca: unidad?.marca || '', modelo: unidad?.modelo || '', anio: unidad?.anio ?? '',
    capacidad_toneladas: unidad?.capacidad_toneladas ?? '', capacidad_m3: unidad?.capacidad_m3 ?? '',
    nro_certificado_habilitacion: unidad?.nro_certificado_habilitacion || '', vigencia_certificado_habilitacion: unidad?.vigencia_certificado_habilitacion || '',
    activo: unidad?.activo !== false };
  const editor = useEditor(inicial, open);
  const { form, set, errors } = editor;
  const doc = estadoDocumento(form.vigencia_certificado_habilitacion);
  const opciones = unificarTiposUnidad(UNIT_DEFAULTS, [...tipos.map(etiquetaTipoVehiculo), form.tipo]);
  const guardar = event => {
    event.preventDefault();
    enviar(editor, values => validarUnidadFlota(values, vehiculos, unidad?.id), () => guardarVehiculo(empresaId, unidad?.id, {
      ...form, placa: normalizarPlaca(form.placa), anio: form.anio === '' ? null : Number(form.anio),
      capacidad_toneladas: form.capacidad_toneladas === '' ? null : Number(form.capacidad_toneladas),
      capacidad_m3: form.capacidad_m3 === '' ? null : Number(form.capacidad_m3),
    }), onSaved, errores => `flota-u-${Object.keys(errores)[0]}`);
  };
  return <TransportePanel open={open} title={nuevo ? 'Nueva unidad' : `Editar ${unidad.placa}`} dirty={editor.dirty} busy={editor.saving} onClose={onClose}
    subtitle={nuevo ? 'Regístrala para poder asignarla al despachar.' : 'Los cambios se aplican a los próximos despachos.'}
    footer={pie(editor, nuevo, 'Crear unidad', 'flota-unidad-form')}>
    <div className="dx-transporte-composer-body dx-tmsflota-body">
      <form id="flota-unidad-form" className="dx-transporte-composer-form" noValidate onSubmit={guardar}>
        <section className="dx-transporte-composer-section"><h3><i>1</i> Identificación</h3>
          <div className="dx-transporte-composer-grid">
            <Campo id="flota-u-placa" label="Placa" required error={errors.placa}><input id="flota-u-placa" className="dx-tmsflota-plate-input" value={form.placa}
              placeholder="ABC-123" aria-invalid={Boolean(errors.placa)} onChange={event => set('placa', event.target.value.toLocaleUpperCase('es-PE'))} /></Campo>
            <Campo id="flota-u-transportista_id" label="Transportista" required error={errors.transportista_id}><select id="flota-u-transportista_id" className="dx-ui-select"
              value={form.transportista_id} aria-invalid={Boolean(errors.transportista_id)} onChange={event => set('transportista_id', event.target.value)}>
              <option value="">Elige…</option>{transportistas.map(item => <option key={item.id} value={item.id}>{nombreTransportista(item)} · {item.tipo_operador}</option>)}</select></Campo>
          </div>
          <div className="dx-transporte-composer-grid dx-tmsflota-grid3">
            <Campo id="flota-u-tipo" label="Tipo" required error={errors.tipo}><select id="flota-u-tipo" className="dx-ui-select" value={form.tipo}
              onChange={event => set('tipo', event.target.value)}>{opciones.map(item => <option key={item}>{item}</option>)}</select></Campo>
            <Campo id="flota-u-marca" label="Marca"><input id="flota-u-marca" value={form.marca} onChange={event => set('marca', event.target.value)} /></Campo>
            <Campo id="flota-u-modelo" label="Modelo"><input id="flota-u-modelo" value={form.modelo} onChange={event => set('modelo', event.target.value)} /></Campo>
            <Campo id="flota-u-anio" label="Año" error={errors.anio}><input id="flota-u-anio" inputMode="numeric" value={form.anio} placeholder="2022"
              aria-invalid={Boolean(errors.anio)} onChange={event => set('anio', event.target.value.replace(/\D/g, '').slice(0, 4))} /></Campo>
          </div></section>
        <section className="dx-transporte-composer-section"><h3><i>2</i> Capacidad <span className="dx-tmsflota-new">NUEVO</span></h3>
          {form.capacidad_toneladas === '' && <div className="dx-transporte-composer-alert is-amber" role="status">Sin capacidad el despacho no puede comprobar si la carga entra en la unidad.</div>}
          <div className="dx-transporte-composer-grid">
            {[['capacidad_toneladas', 'Carga útil', 't'], ['capacidad_m3', 'Volumen', 'm³']].map(([key, label, unidadMedida]) =>
              <Campo key={key} id={`flota-u-${key}`} label={label} error={errors[key]}><span className="dx-transporte-composer-withunit">
                <input id={`flota-u-${key}`} inputMode="decimal" value={form[key]} placeholder="0.00" aria-invalid={Boolean(errors[key])}
                  onChange={event => set(key, event.target.value.replace(',', '.'))} /><em>{unidadMedida}</em></span></Campo>)}
          </div></section>
        <section className="dx-transporte-composer-section"><h3><i>3</i> Certificado de habilitación MTC</h3>
          <div className="dx-transporte-composer-grid">
            <Campo id="flota-u-nro" label="N.º de certificado"><input id="flota-u-nro" value={form.nro_certificado_habilitacion}
              onChange={event => set('nro_certificado_habilitacion', event.target.value)} /></Campo>
            <Campo id="flota-u-vig" label="Vigente hasta" hint={form.vigencia_certificado_habilitacion ? doc.etiqueta : 'Sin fecha no podremos avisarte antes del vencimiento.'}>
              <input id="flota-u-vig" type="date" value={form.vigencia_certificado_habilitacion} onChange={event => set('vigencia_certificado_habilitacion', event.target.value)} /></Campo>
          </div></section>
        {!nuevo && <label className="dx-transporte-composer-switch"><input type="checkbox" checked={form.activo} onChange={event => set('activo', event.target.checked)} />
          <span>Unidad activa (se puede asignar a viajes)</span></label>}
        {editor.serverError && <div className="dx-transporte-composer-alert is-red" role="alert">{editor.serverError}</div>}
      </form>
      <aside className="dx-transporte-composer-aside">
        <div className="dx-tmsflota-pv"><div className="dx-tmsflota-uses-h">Vista previa</div>
          <div className="dx-tmsflota-pv-top"><Placa placa={normalizarPlaca(form.placa)} /><div><b>{form.tipo}</b>
            <small>{[form.marca, form.modelo, form.anio].filter(Boolean).join(' · ') || 'Marca y modelo'}</small></div></div>
          {form.capacidad_toneladas !== '' ? <div className="dx-tmsflota-cap"><div><small>Carga útil</small><b>{formatearNumeroTransporte(form.capacidad_toneladas)}<em>t</em></b></div>
            <div><small>Volumen</small><b>{form.capacidad_m3 === '' ? '—' : formatearNumeroTransporte(form.capacidad_m3)}<em>m³</em></b></div></div>
            : <div className="dx-tmsflota-capmiss">⚠ Capacidad sin registrar</div>}</div>
        <Usos items={[['⚖', 'Control de capacidad', 'Al despachar comparamos la carga del viaje con la carga útil de la unidad.'],
          ['◷', 'Alertas de vencimiento', 'Te avisamos 30 días antes; vencido, la unidad no se puede despachar.'],
          ['⛟', 'Disponibilidad', 'Una unidad en un viaje en curso no aparece como disponible.']]} />
      </aside>
    </div>
  </TransportePanel>;
}

export function ConductorEditor({ open, conductor, empresaId, transportistas, conductores, onClose, onSaved }) {
  const nuevo = !conductor?.id;
  const inicial = { nombre: conductor?.nombre || '', dni: conductor?.dni || '',
    transportista_id: conductor?.transportista_id || transportistas.find(item => item.tipo_operador === 'propio')?.id || transportistas[0]?.id || '',
    brevete: conductor?.brevete || '', categoria_brevete: conductor?.categoria_brevete || 'A-IIIb', vigencia_brevete: conductor?.vigencia_brevete || '',
    activo: conductor?.activo !== false };
  const editor = useEditor(inicial, open);
  const { form, set, errors } = editor;
  const doc = estadoDocumento(form.vigencia_brevete);
  const guardar = event => {
    event.preventDefault();
    enviar(editor, values => validarConductorFlota(values, conductores, conductor?.id), () => guardarConductor(empresaId, conductor?.id, form),
      onSaved, errores => `flota-c-${Object.keys(errores)[0]}`);
  };
  return <TransportePanel open={open} title={nuevo ? 'Nuevo conductor' : `Editar ${conductor.nombre}`} dirty={editor.dirty} busy={editor.saving} onClose={onClose}
    subtitle="Con el brevete vigente podrá asignarse al despachar." footer={pie(editor, nuevo, 'Crear conductor', 'flota-conductor-form')}>
    <div className="dx-transporte-composer-body dx-tmsflota-body">
      <form id="flota-conductor-form" className="dx-transporte-composer-form" noValidate onSubmit={guardar}>
        <section className="dx-transporte-composer-section"><h3><i>1</i> Datos personales</h3>
          <Campo id="flota-c-nombre" label="Nombre completo" required error={errors.nombre}><input id="flota-c-nombre" value={form.nombre} placeholder="Nombres y apellidos"
            aria-invalid={Boolean(errors.nombre)} onChange={event => set('nombre', event.target.value)} /></Campo>
          <div className="dx-transporte-composer-grid">
            <Campo id="flota-c-dni" label="DNI" required error={errors.dni}><input id="flota-c-dni" inputMode="numeric" maxLength={8} value={form.dni} placeholder="8 dígitos"
              aria-invalid={Boolean(errors.dni)} onChange={event => set('dni', event.target.value.replace(/\D/g, ''))} /></Campo>
            <Campo id="flota-c-transportista_id" label="Transportista" required error={errors.transportista_id}><select id="flota-c-transportista_id" className="dx-ui-select"
              value={form.transportista_id} onChange={event => set('transportista_id', event.target.value)}><option value="">Elige…</option>
              {transportistas.map(item => <option key={item.id} value={item.id}>{nombreTransportista(item)} · {item.tipo_operador}</option>)}</select></Campo>
          </div></section>
        <section className="dx-transporte-composer-section"><h3><i>2</i> Licencia de conducir</h3>
          <div className="dx-transporte-composer-grid dx-tmsflota-grid3">
            <Campo id="flota-c-brevete" label="N.º de brevete" required error={errors.brevete}><input id="flota-c-brevete" value={form.brevete} placeholder="Q00000000"
              aria-invalid={Boolean(errors.brevete)} onChange={event => set('brevete', event.target.value.toLocaleUpperCase('es-PE'))} /></Campo>
            <Campo id="flota-c-categoria_brevete" label="Categoría" required error={errors.categoria_brevete}><select id="flota-c-categoria_brevete" className="dx-ui-select"
              value={form.categoria_brevete} onChange={event => set('categoria_brevete', event.target.value)}>
              {[...new Set([...CATEGORIAS, form.categoria_brevete].filter(Boolean))].map(item => <option key={item}>{item}</option>)}</select></Campo>
            <Campo id="flota-c-vigencia_brevete" label="Vigente hasta" required error={errors.vigencia_brevete}><input id="flota-c-vigencia_brevete" type="date"
              value={form.vigencia_brevete} aria-invalid={Boolean(errors.vigencia_brevete)} onChange={event => set('vigencia_brevete', event.target.value)} /></Campo>
          </div>
          <small className="dx-transporte-composer-hint">Para tracto con semirremolque se requiere A-IIIc; para camión de 2 o 3 ejes, A-IIIb o superior.</small></section>
        {!nuevo && <label className="dx-transporte-composer-switch"><input type="checkbox" checked={form.activo} onChange={event => set('activo', event.target.checked)} />
          <span>Conductor activo (se puede asignar a viajes)</span></label>}
        {editor.serverError && <div className="dx-transporte-composer-alert is-red" role="alert">{editor.serverError}</div>}
      </form>
      <aside className="dx-transporte-composer-aside">
        <div className="dx-tmsflota-pv"><div className="dx-tmsflota-uses-h">Vista previa</div>
          <div className="dx-tmsflota-pv-top"><span className="dx-tmsflota-av">{iniciales(form.nombre) || '—'}</span><div><b>{form.nombre || 'Nuevo conductor'}</b>
            <small>{[form.dni && `DNI ${form.dni}`, form.categoria_brevete].filter(Boolean).join(' · ') || 'DNI · brevete'}</small></div></div>
          <div className="dx-tmsflota-docrow"><i className={`dx-tms-dot is-${doc.clave}`} />Vigencia del brevete<span className={`is-${doc.clave}`}>{form.vigencia_brevete ? doc.etiqueta : 'Sin fecha'}</span></div></div>
        <Usos items={[['✓', 'Control de brevete', 'Vencido, el conductor no se puede despachar.'],
          ['◷', 'Disponibilidad', 'Un conductor en un viaje en curso no aparece como disponible.']]} />
      </aside>
    </div>
  </TransportePanel>;
}

export function TransportistaEditor({ open, transportista, empresaId, transportistas, onClose, onSaved }) {
  const nuevo = !transportista?.id;
  const inicial = { tipo_operador: transportista?.tipo_operador || 'tercero', ruc: transportista?.ruc || '', razon_social: transportista?.razon_social || '',
    nombre_comercial: transportista?.nombre_comercial || '', nro_mtc: transportista?.nro_mtc || '', direccion: transportista?.direccion || '',
    telefono: transportista?.telefono || '', email: transportista?.email || '', activo: transportista?.activo !== false };
  const editor = useEditor(inicial, open);
  const { form, set, errors } = editor;
  const guardar = event => {
    event.preventDefault();
    enviar(editor, values => validarTransportistaFlota(values, transportistas, transportista?.id), () => guardarTransportista(empresaId, transportista?.id, form),
      onSaved, errores => `flota-t-${Object.keys(errores)[0]}`);
  };
  return <TransportePanel open={open} title={nuevo ? 'Nuevo transportista' : `Editar ${nombreTransportista(transportista)}`} dirty={editor.dirty} busy={editor.saving}
    onClose={onClose} subtitle="Tu propia empresa o un tercero que te presta unidades." footer={pie(editor, nuevo, 'Crear transportista', 'flota-transportista-form')}>
    <div className="dx-transporte-composer-body dx-tmsflota-body">
      <form id="flota-transportista-form" className="dx-transporte-composer-form" noValidate onSubmit={guardar}>
        <section className="dx-transporte-composer-section"><h3><i>1</i> Tipo de operador</h3>
          <div className="dx-transporte-composer-segmented" role="radiogroup" aria-label="Tipo de operador">{[['propio', 'Propio'], ['tercero', 'Tercero']].map(([key, label]) =>
            <button key={key} type="button" role="radio" aria-checked={form.tipo_operador === key} className={form.tipo_operador === key ? 'is-on' : ''}
              onClick={() => set('tipo_operador', key)}>{label}</button>)}</div></section>
        <section className="dx-transporte-composer-section"><h3><i>2</i> Empresa</h3>
          <div className="dx-transporte-composer-grid">
            <Campo id="flota-t-ruc" label="RUC" required error={errors.ruc}><input id="flota-t-ruc" inputMode="numeric" maxLength={11} value={form.ruc}
              aria-invalid={Boolean(errors.ruc)} onChange={event => set('ruc', event.target.value.replace(/\D/g, ''))} />
              {!errors.ruc && form.ruc.length === 11 && rucValido(form.ruc) && <small className="dx-tmsflota-ok">✓ RUC válido</small>}</Campo>
            <Campo id="flota-t-mtc" label="N.º de registro MTC"><input id="flota-t-mtc" value={form.nro_mtc} placeholder="Opcional" onChange={event => set('nro_mtc', event.target.value)} /></Campo>
          </div>
          <Campo id="flota-t-razon_social" label="Razón social" required error={errors.razon_social}><input id="flota-t-razon_social" value={form.razon_social}
            placeholder="Como figura en SUNAT" aria-invalid={Boolean(errors.razon_social)} onChange={event => set('razon_social', event.target.value)} /></Campo>
          <Campo id="flota-t-comercial" label="Nombre comercial"><input id="flota-t-comercial" value={form.nombre_comercial} placeholder="Cómo lo verá el equipo"
            onChange={event => set('nombre_comercial', event.target.value)} /></Campo></section>
        <section className="dx-transporte-composer-section"><h3><i>3</i> Contacto</h3>
          <Campo id="flota-t-dir" label="Dirección"><input id="flota-t-dir" value={form.direccion} onChange={event => set('direccion', event.target.value)} /></Campo>
          <div className="dx-transporte-composer-grid">
            <Campo id="flota-t-tel" label="Teléfono"><input id="flota-t-tel" inputMode="tel" value={form.telefono} onChange={event => set('telefono', event.target.value)} /></Campo>
            <Campo id="flota-t-email" label="Correo" error={errors.email}><input id="flota-t-email" type="email" value={form.email} aria-invalid={Boolean(errors.email)}
              onChange={event => set('email', event.target.value)} /></Campo>
          </div></section>
        {!nuevo && <label className="dx-transporte-composer-switch"><input type="checkbox" checked={form.activo} onChange={event => set('activo', event.target.checked)} />
          <span>Transportista activo</span></label>}
        {editor.serverError && <div className="dx-transporte-composer-alert is-red" role="alert">{editor.serverError}</div>}
      </form>
      <aside className="dx-transporte-composer-aside">
        <Usos titulo={nuevo ? 'Después de crearlo' : 'Cómo se usa'} items={[['⛟', 'Sus unidades', 'Cada unidad pertenece a un transportista.'],
          ['◉', 'Sus conductores', 'Al despachar solo verás los de ese transportista.'],
          ['S/', 'Terceros', 'Sus viajes podrán liquidar el costo de transporte en la siguiente etapa.']]} />
      </aside>
    </div>
  </TransportePanel>;
}
