import React, { useEffect, useMemo, useState } from 'react';
import { ModalShell } from '../../components/ModalShell.jsx';
import { crearLugar, actualizarLugar } from '../../../services/transporteLugaresService.js';

export const TIPOS_LUGAR = {
  almacen: 'Almacén',
  planta: 'Planta',
  obra: 'Obra',
  mina: 'Mina',
  puerto: 'Puerto',
  cliente: 'Cliente',
  otro: 'Otro',
};

const BLANK = {
  nombre: '', cuenta_id: '', tipo: 'otro', direccion: '', referencia: '',
  distrito: '', provincia: '', departamento: '', ubigeo: '', latitud: '',
  longitud: '', contacto_nombre: '', contacto_telefono: '', horario_atencion: '',
  requisitos_acceso: '', restricciones: '', notas: '',
};

const FIELDS = [
  ['nombre', 'Nombre', true], ['direccion', 'Dirección'],
  ['referencia', 'Referencia'], ['distrito', 'Distrito'],
  ['provincia', 'Provincia'], ['departamento', 'Departamento'],
  ['ubigeo', 'Ubigeo'], ['latitud', 'Latitud', false, 'number'],
  ['longitud', 'Longitud', false, 'number'], ['contacto_nombre', 'Contacto'],
  ['contacto_telefono', 'Teléfono'], ['horario_atencion', 'Horario'],
  ['requisitos_acceso', 'Requisitos de acceso', false, 'textarea'],
  ['restricciones', 'Restricciones', false, 'textarea'],
  ['notas', 'Notas', false, 'textarea'],
];

function initialForm(lugar, cuentaId) {
  return { ...BLANK, ...lugar, cuenta_id: lugar?.cuenta_id || cuentaId || '' };
}

function validate(form) {
  const errors = {};
  if (!form.nombre.trim()) errors.nombre = 'Ingresa el nombre del lugar.';
  const lat = form.latitud === '' ? null : Number(form.latitud);
  const lng = form.longitud === '' ? null : Number(form.longitud);
  if (Boolean(form.latitud) !== Boolean(form.longitud)) {
    errors.latitud = 'Ingresa latitud y longitud juntas.';
    errors.longitud = 'Ingresa latitud y longitud juntas.';
  }
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    errors.latitud = 'La latitud debe estar entre -90 y 90.';
  }
  if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    errors.longitud = 'La longitud debe estar entre -180 y 180.';
  }
  return errors;
}

function LugarField({ form, name, label, required, type = 'text', error, onChange }) {
  const errorId = `lugar-${name}-error`;
  const props = {
    id: `lugar-${name}`,
    name,
    value: form[name] ?? '',
    onChange: event => onChange(name, event.target.value),
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
    'aria-required': required || undefined,
  };
  return (
    <label className={`dx-ui-field${type === 'textarea' ? ' dx-ui-field-full' : ''}`}>
      <span>{label}{required && <span className="dx-ui-required"> *</span>}</span>
      {type === 'textarea' ? <textarea {...props} rows="3" /> : (
        <input {...props} type={type} step={type === 'number' ? 'any' : undefined} />
      )}
      {error && <small className="dx-ui-field-error" id={errorId} role="alert">{error}</small>}
    </label>
  );
}

export function LugarEditorModal({
  open, lugar = null, cuentas = [], cuentaPreseleccionada = '',
  empresaId, onClose, onSaved, onError,
}) {
  const [form, setForm] = useState(() => initialForm(lugar, cuentaPreseleccionada));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const original = useMemo(() => initialForm(lugar, cuentaPreseleccionada), [lugar, cuentaPreseleccionada]);

  useEffect(() => {
    if (open) {
      setForm(initialForm(lugar, cuentaPreseleccionada));
      setErrors({});
      setFormError('');
    }
  }, [open, lugar, cuentaPreseleccionada]);

  function updateField(name, value) {
    setForm(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: '' }));
    setFormError('');
  }

  async function save(event) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      requestAnimationFrame(() => document.getElementById(`lugar-${firstError}`)?.focus());
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        cuenta_id: form.cuenta_id || null,
        latitud: form.latitud === '' ? null : Number(form.latitud),
        longitud: form.longitud === '' ? null : Number(form.longitud),
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

  return (
    <ModalShell
      open={open}
      title={lugar?.id ? `Editar lugar: ${lugar.nombre}` : 'Nuevo lugar'}
      subtitle="Completa la información del punto de recojo o entrega."
      variant="dx-modal dx-transporte-modal"
      titleClassName="dx-modal-title"
      subtitleClassName="dx-modal-subtitle"
      closeClassName="dx-modal-close"
      dirty={JSON.stringify(form) !== JSON.stringify(original)}
      busy={saving}
      onClose={onClose}
      footer={<button form="lugar-form" type="submit" className="dx-btn primary" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar lugar'}
      </button>}
    >
      <div className="card-body">
        <form id="lugar-form" className="dx-transporte-form" onSubmit={save}>
          <div className="dx-ui-form-grid">
            <div className="dx-transporte-form-section">Datos del lugar</div>
            <LugarField form={form} name="nombre" label="Nombre" required error={errors.nombre} onChange={updateField} />
            <label className="dx-ui-field">
              <span>Cliente</span>
              <select id="lugar-cuenta_id" className="dx-ui-select" value={form.cuenta_id}
                onChange={event => updateField('cuenta_id', event.target.value)}>
                <option value="">Lugar general</option>
                {cuentas.map(cuenta => <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.nombre_comercial || cuenta.razon_social}
                </option>)}
              </select>
            </label>
            <label className="dx-ui-field">
              <span>Tipo<span className="dx-ui-required"> *</span></span>
              <select id="lugar-tipo" className="dx-ui-select" value={form.tipo}
                onChange={event => updateField('tipo', event.target.value)}>
                {Object.entries(TIPOS_LUGAR).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {FIELDS.slice(1).map(([name, label, required, type]) => (
              <LugarField key={name} form={form} name={name} label={label}
                required={required} type={type} error={errors[name]} onChange={updateField} />
            ))}
          </div>
          {formError && <div className="dx-transporte-error" role="alert">{formError}</div>}
        </form>
        {lugar?.id && <LugarInactivation lugar={lugar} empresaId={empresaId} onSaved={onSaved} />}
      </div>
    </ModalShell>
  );
}

function LugarInactivation({ lugar, empresaId, onSaved }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (lugar.estado === 'inactivo') return null;
  async function inactivate() {
    setBusy(true);
    try {
      const saved = await actualizarLugar(empresaId, lugar.id, { estado: 'inactivo' });
      onSaved?.(saved, { inactivated: true });
    } catch (saveError) {
      setError(saveError.message || 'No se pudo inactivar el lugar.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dx-transporte-lugar-inactivate">
      {confirming ? <div role="group" aria-label="Confirmar inactivación">
        <span>¿Inactivar este lugar?</span>
        <button type="button" className="dx-btn" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
        <button type="button" className="dx-btn" disabled={busy} onClick={inactivate}>Confirmar</button>
      </div> : <button type="button" className="dx-btn" onClick={() => setConfirming(true)}>Inactivar lugar</button>}
      {error && <small className="dx-ui-field-error" role="alert">{error}</small>}
    </div>
  );
}
