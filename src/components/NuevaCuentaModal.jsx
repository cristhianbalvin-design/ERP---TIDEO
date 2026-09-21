import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../icons.jsx';
import {
  DNI_PATTERN,
  RUC_PATTERN,
  TAX_ID_EXTRANJERO_MAX_LENGTH,
  TIPO_DOCUMENTO_DNI,
  TIPO_DOCUMENTO_RUC,
  TIPO_DOCUMENTO_TAX_ID_EXTRANJERO,
  isValidDocumentoCliente,
  isValidPhone,
  sanitizeDocumentoCliente,
  sanitizePhone,
} from '../lib/formValidators.js';

const inicial = () => ({
  razon_social: '', nombre_comercial: '', ruc: '', tipo_documento: TIPO_DOCUMENTO_RUC,
  pais: 'Perú', tipo: 'prospecto', industria: '', tamano: '', telefono_empresa: '',
  email_corporativo: '', direccion: '', nombre_contacto: '', cargo_contacto: '',
  telefono: '', email: '', responsable_comercial: '', fuente_origen: '', notas: '',
});

const personaNatural = tipo => tipo === TIPO_DOCUMENTO_DNI;
const etiquetaDocumento = tipo => tipo === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? 'Tax ID extranjero' : personaNatural(tipo) ? 'DNI' : 'RUC';
const placeholderDocumento = tipo => tipo === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? 'Tax ID' : personaNatural(tipo) ? '8 dígitos' : '11 dígitos';

export function NuevaCuentaModal({ open, empresa, crearCuenta, comercialesAsignables = [], onClose, onCreated, onNotify, zIndex = 1100 }) {
  const [form, setForm] = useState(inicial);
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const tipoPersona = personaNatural(form.tipo_documento);
  const update = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));
  const guardar = event => {
    event.preventDefault();
    if (!isValidDocumentoCliente(form.ruc, form.tipo_documento)) return onNotify?.(`El ${etiquetaDocumento(form.tipo_documento)} no tiene un formato válido.`);
    if (!form.nombre_comercial.trim() || (!tipoPersona && !form.razon_social.trim())) return onNotify?.('Completa la razón social y el nombre comercial.');
    if (form.telefono && !isValidPhone(form.telefono)) return onNotify?.('El teléfono debe tener 9 dígitos y comenzar con 9.');
    const cuenta = {
      id: `cta_${Date.now().toString(36)}`,
      empresa_id: empresa?.id,
      razon_social: tipoPersona ? null : (form.razon_social || 'Nueva cuenta sin nombre'),
      nombre_comercial: form.nombre_comercial || form.razon_social || 'Nueva cuenta',
      tipo: form.tipo || 'prospecto', pais: form.pais || 'Perú', industria: form.industria || 'Por definir',
      tamano: form.tamano || 'Por definir', estado: 'activo', responsable_comercial: form.responsable_comercial || 'Sin asignar',
      responsable_cs: null, condicion_pago: 'Por definir', limite_credito: 0, riesgo_financiero: 'bajo',
      health_score: null, riesgo_churn: null, fecha_ultima_compra: null, margen_acumulado: null, saldo_cxc: 0,
      direccion: form.direccion || 'Por definir', telefono_empresa: form.telefono_empresa || null,
      email_corporativo: form.email_corporativo || null, telefono: form.telefono, email: form.email,
      ruc: form.ruc || null, tipo_documento: form.tipo_documento || TIPO_DOCUMENTO_RUC,
      fuente_origen: form.fuente_origen || null, notas: form.notas || null,
      nombre_contacto: form.nombre_contacto, cargo_contacto: form.cargo_contacto,
    };
    setSaving(true);
    try {
      crearCuenta?.(cuenta);
      onNotify?.(`Cuenta creada: ${cuenta.razon_social || cuenta.nombre_comercial}`);
      setForm(inicial());
      onCreated?.(cuenta);
    } finally {
      setSaving(false);
    }
  };
  return createPortal(<div className="modal-backdrop" style={{ zIndex }}><div className="side-panel" style={{ width: 'min(620px, 96vw)' }}>
    <div className="side-panel-head"><div><div className="eyebrow">Formulario de registro</div><div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Nueva cuenta</div></div><button type="button" className="icon-btn" onClick={onClose}>{I.x}</button></div>
    <form className="side-panel-body" onSubmit={guardar}>
      <div className="grid-2" style={{ gap: 14, marginBottom: 20 }}>
        <div className="input-group"><label>Tipo de documento</label><select className="select" value={form.tipo_documento} onChange={event => update('tipo_documento', event.target.value)}><option value={TIPO_DOCUMENTO_RUC}>RUC</option><option value={TIPO_DOCUMENTO_DNI}>DNI</option><option value={TIPO_DOCUMENTO_TAX_ID_EXTRANJERO}>Tax ID extranjero</option></select></div>
        <div className="input-group"><label>{etiquetaDocumento(form.tipo_documento)}</label><input className="input" value={form.ruc} onChange={event => update('ruc', sanitizeDocumentoCliente(event.target.value, form.tipo_documento))} placeholder={placeholderDocumento(form.tipo_documento)} inputMode={tipoPersona ? 'numeric' : form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? 'text' : 'numeric'} pattern={form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? undefined : tipoPersona ? DNI_PATTERN : RUC_PATTERN} maxLength={form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? TAX_ID_EXTRANJERO_MAX_LENGTH : tipoPersona ? 8 : 11} /></div>
        <div className="input-group"><label>{tipoPersona ? 'Nombre completo' : 'Nombre comercial'} *</label><input className="input" required value={form.nombre_comercial} onChange={event => update('nombre_comercial', event.target.value)} /></div>
        {!tipoPersona && <div className="input-group"><label>Razón social *</label><input className="input" required value={form.razon_social} onChange={event => update('razon_social', event.target.value)} /></div>}
        <div className="input-group"><label>País</label><input className="input" value={form.pais} onChange={event => update('pais', event.target.value)} /></div>
        <div className="input-group"><label>Tipo de cuenta</label><select className="select" value={form.tipo} onChange={event => update('tipo', event.target.value)}><option value="prospecto">Prospecto</option><option value="cliente">Cliente</option><option value="partner">Partner</option><option value="proveedor_estrategico">Proveedor estratégico</option></select></div>
        <div className="input-group"><label>Industria</label><input className="input" value={form.industria} onChange={event => update('industria', event.target.value)} /></div>
        <div className="input-group"><label>Dirección</label><input className="input" value={form.direccion} onChange={event => update('direccion', event.target.value)} /></div>
        <div className="input-group"><label>Teléfono empresa</label><input className="input" value={form.telefono_empresa} onChange={event => update('telefono_empresa', event.target.value)} /></div>
        <div className="input-group"><label>Email corporativo</label><input className="input" type="email" value={form.email_corporativo} onChange={event => update('email_corporativo', event.target.value)} /></div>
      </div>
      <div className="grid-2" style={{ gap: 14, marginBottom: 20 }}>
        <div className="input-group"><label>Nombre del contacto</label><input className="input" value={form.nombre_contacto} onChange={event => update('nombre_contacto', event.target.value)} /></div>
        <div className="input-group"><label>Cargo</label><input className="input" value={form.cargo_contacto} onChange={event => update('cargo_contacto', event.target.value)} /></div>
        <div className="input-group"><label>Teléfono directo</label><input className="input" value={form.telefono} onChange={event => update('telefono', sanitizePhone(event.target.value))} /></div>
        <div className="input-group"><label>Email personal</label><input className="input" type="email" value={form.email} onChange={event => update('email', event.target.value)} /></div>
        <div className="input-group"><label>Responsable comercial</label><select className="select" value={form.responsable_comercial} onChange={event => update('responsable_comercial', event.target.value)}><option value="">Sin asignar</option>{comercialesAsignables.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select></div>
        <div className="input-group"><label>Fuente de origen</label><input className="input" value={form.fuente_origen} onChange={event => update('fuente_origen', event.target.value)} /></div>
      </div>
      <div className="input-group"><label>Notas iniciales</label><textarea className="input" rows="3" value={form.notas} onChange={event => update('notas', event.target.value)} /></div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cuenta'}</button></div>
    </form>
  </div></div>, document.body);
}
