import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../icons.jsx';
import { useApp } from '../context.jsx';
import {
  DNI_PATTERN,
  PHONE_PATTERN,
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
import '../cuenta_nueva.css';

const inicial = () => ({
  razon_social: '', nombre_comercial: '', ruc: '', tipo_documento: TIPO_DOCUMENTO_RUC,
  pais: 'Perú', tipo: 'prospecto', industria: '', tamano: '', telefono_empresa: '',
  email_corporativo: '', direccion: '', nombre_contacto: '', cargo_contacto: '',
  telefono: '', email: '', responsable_comercial: '', fuente_origen: '', notas: '',
});

const INDUSTRIAS_RESPALDO = [
  'Aeropuertos y servicios aeroportuarios', 'Agricultura y actividad agropecuaria',
  'Agroindustria y sector azucarero', 'Alimentos y bebidas', 'Alquiler de maquinaria y equipos',
  'Construcción, concreto y cemento', 'Energía y generación eléctrica', 'Hidrocarburos, petróleo y gas',
  'Industria y manufactura', 'Maquinaria pesada y talleres de mantenimiento', 'Marítimo, naviero y astilleros',
  'Metalmecánica y fabricación de maquinaria', 'Minería y contratistas mineros', 'Pesca y procesamiento pesquero',
  'Puertos, operadores logísticos y terminales', 'Saneamiento y gestión de residuos',
  'Sector público y empresas del Estado', 'Transporte, logística y equipos móviles',
];
const FUENTES = ['Referido', 'Formulario web', 'LinkedIn', 'Evento / Feria', 'Cold outreach', 'Manual'];
const TIPOS = [
  ['prospecto', 'Prospecto', '#2F6FD6'], ['cliente', 'Cliente', '#16A34A'],
  ['partner', 'Partner', '#5B3A8C'], ['proveedor_estrategico', 'Proveedor estratégico', '#6B7280'],
];
const personaNatural = tipo => tipo === TIPO_DOCUMENTO_DNI;
const etiquetaDocumento = tipo => tipo === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? 'Tax ID extranjero' : personaNatural(tipo) ? 'DNI' : 'RUC';
const normalizarDocumento = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
const normalizarTipo = tipo => String(tipo || 'prospecto').replaceAll('_', ' ');
const etiquetaTipo = tipo => ({ cliente: 'Cliente', prospecto: 'Prospecto', partner: 'Partner', proveedor_estrategico: 'Proveedor estrat\u00e9gico' })[tipo] || normalizarTipo(tipo);
const emailValido = valor => !valor || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor).trim());

export function NuevaCuentaModal({ open, empresa, crearCuenta, comercialesAsignables = [], onClose, onCreated, onNotify, onOpenCuenta, zIndex = 1100 }) {
  const { cuentas = [], industrias = [] } = useApp();
  const [form, setForm] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [masDatosAbierto, setMasDatosAbierto] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const primerCampoRef = useRef(null);
  const tipoPersona = personaNatural(form.tipo_documento);
  const documentoNormalizado = normalizarDocumento(form.ruc);
  const cuentaDuplicada = useMemo(() => documentoNormalizado ? cuentas.find(cuenta => normalizarDocumento(cuenta.ruc) === documentoNormalizado) || null : null, [cuentas, documentoNormalizado]);
  const industriasDisponibles = useMemo(() => {
    const catalogo = (industrias || []).map(item => item?.nombre).filter(Boolean);
    return [...new Set(catalogo.length ? catalogo : INDUSTRIAS_RESPALDO)].sort((a, b) => a.localeCompare(b, 'es'));
  }, [industrias]);
  const errores = useMemo(() => {
    const resultado = {};
    if (!String(form.ruc || '').trim()) resultado.ruc = `Ingresa el ${etiquetaDocumento(form.tipo_documento)}.`;
    else if (!isValidDocumentoCliente(form.ruc, form.tipo_documento)) resultado.ruc = form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? 'El Tax ID debe tener entre 3 y 30 caracteres.' : tipoPersona ? 'El DNI debe tener 8 dígitos.' : 'El RUC debe tener 11 números y empezar con 1 o 2.';
    if (!tipoPersona && !form.razon_social.trim()) resultado.razon_social = 'Ingresa la razón social.';
    if (!form.nombre_comercial.trim()) resultado.nombre_comercial = tipoPersona ? 'Ingresa el nombre completo.' : 'Ingresa el nombre comercial.';
    if (form.telefono && !isValidPhone(form.telefono)) resultado.telefono = 'Debe tener 9 dígitos y empezar con 9.';
    if (form.email && !emailValido(form.email)) resultado.email = 'Ingresa un correo válido.';
    if (form.email_corporativo && !emailValido(form.email_corporativo)) resultado.email_corporativo = 'Ingresa un correo válido.';
    return resultado;
  }, [form, tipoPersona]);
  const formInicial = useMemo(() => JSON.stringify(inicial()), []);
  const tieneCambios = JSON.stringify(form) !== formInicial;

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => primerCampoRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      solicitarCierre();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, tieneCambios, saving]);

  if (!open) return null;
  const update = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));
  function cerrarSinGuardar() {
    setConfirmarSalida(false);
    setForm(inicial());
    setIntentado(false);
    setMasDatosAbierto(false);
    onClose?.();
  }
  function solicitarCierre() {
    if (saving) return;
    if (tieneCambios) setConfirmarSalida(true);
    else cerrarSinGuardar();
  }
  const errorCampo = campo => intentado ? errores[campo] : '';
  const claseCampo = campo => `dx-ncta-in${errorCampo(campo) ? ' is-error' : ''}${campo === 'ruc' ? ' is-mono' : ''}`;
  const resumenErrores = [errores.ruc, errores.razon_social, errores.nombre_comercial, errores.telefono, errores.email, errores.email_corporativo].filter(Boolean);
  const guardar = event => {
    event.preventDefault();
    setIntentado(true);
    if (Object.keys(errores).length || cuentaDuplicada) {
      if (errores.email_corporativo) setMasDatosAbierto(true);
      return;
    }
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
      setIntentado(false);
      onCreated?.(cuenta);
    } finally {
      setSaving(false);
    }
  };
  const abrirDuplicada = () => {
    if (!onOpenCuenta || !cuentaDuplicada) return;
    setForm(inicial());
    setIntentado(false);
    onOpenCuenta(cuentaDuplicada);
  };
  const errorInline = campo => errorCampo(campo) && <span className="dx-ncta-err">{I.alertCircle}{errorCampo(campo)}</span>;
  const modal = <div className="dx-ncta" style={{ zIndex }}>
    <div className="dx-ncta-panel" role="dialog" aria-modal="true" aria-labelledby="dx-ncta-title">
      <div className="dx-ncta-head"><div><div className="dx-ncta-eyebrow">Comercial · Cuentas</div><h2 className="dx-ncta-title" id="dx-ncta-title">Nueva cuenta</h2><p className="dx-ncta-sub">Los campos con <em>*</em> son obligatorios. El resto se puede completar después desde la ficha.</p></div><button type="button" className="dx-ncta-x" aria-label="Cerrar" onClick={solicitarCierre}>{I.x}</button></div>
      <form id="dx-ncta-form" className="dx-ncta-body" onSubmit={guardar} noValidate>
        {intentado && (resumenErrores.length > 0 || cuentaDuplicada) && <div className="dx-ncta-alert" role="alert">{I.alertCircle}<div><strong>{cuentaDuplicada ? 'Ya existe una cuenta con este documento.' : `Revisa ${resumenErrores.length} ${resumenErrores.length === 1 ? 'campo' : 'campos'} antes de crear la cuenta.`}</strong>{resumenErrores.length > 0 && <span> {resumenErrores.join(' ')}</span>}</div></div>}
        <section className="dx-ncta-sec">
          <div className="dx-ncta-sec-h"><span className="dx-ncta-num">1</span><h3>Identificación</h3></div>
          <div className="dx-ncta-grid">
            <div className="dx-ncta-f is-full"><label>Tipo de documento</label><div className="dx-ncta-seg" role="radiogroup" aria-label="Tipo de documento">{[[TIPO_DOCUMENTO_RUC, 'RUC', 'Empresa'], [TIPO_DOCUMENTO_DNI, 'DNI', 'Persona natural'], [TIPO_DOCUMENTO_TAX_ID_EXTRANJERO, 'Tax ID', 'extranjero']].map(([value, label, extra]) => <button key={value} type="button" role="radio" aria-checked={form.tipo_documento === value} className={form.tipo_documento === value ? 'is-on' : ''} onClick={() => { update('tipo_documento', value); update('ruc', ''); }}>{label}<span className="dx-ncta-long"> · {extra}</span></button>)}</div></div>
            <div className="dx-ncta-f"><label htmlFor="dx-ncta-doc">{etiquetaDocumento(form.tipo_documento)} <em>*</em></label><input ref={primerCampoRef} id="dx-ncta-doc" className={claseCampo('ruc')} value={form.ruc} onChange={event => update('ruc', sanitizeDocumentoCliente(event.target.value, form.tipo_documento))} placeholder={form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? 'Tax ID' : tipoPersona ? '8 dígitos' : '11 dígitos'} inputMode={tipoPersona || form.tipo_documento === TIPO_DOCUMENTO_RUC ? 'numeric' : 'text'} pattern={form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? undefined : tipoPersona ? DNI_PATTERN : RUC_PATTERN} maxLength={form.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO ? TAX_ID_EXTRANJERO_MAX_LENGTH : tipoPersona ? 8 : 11} aria-invalid={Boolean(errorCampo('ruc'))}/>{errorInline('ruc') || <span className="dx-ncta-help">{tipoPersona ? '8 dígitos.' : form.tipo_documento === TIPO_DOCUMENTO_RUC ? '11 dígitos, empieza con 10 o 20.' : 'Entre 3 y 30 caracteres.'}</span>}</div>
            <div className="dx-ncta-f"><label htmlFor="dx-ncta-pais">País</label><input id="dx-ncta-pais" className="dx-ncta-in" value={form.pais} onChange={event => update('pais', event.target.value)}/></div>
            {cuentaDuplicada && <div className="dx-ncta-f is-full"><div className="dx-ncta-dup">{I.alert}<div><strong>Ya existe una cuenta con este {etiquetaDocumento(cuentaDuplicada.tipo_documento)}</strong>{cuentaDuplicada.razon_social || cuentaDuplicada.nombre_comercial} · {etiquetaTipo(cuentaDuplicada.tipo)} · {cuentaDuplicada.responsable_comercial || 'Sin asignar'}</div>{onOpenCuenta && <button type="button" onClick={abrirDuplicada}>Abrir esa cuenta</button>}</div></div>}
            {!tipoPersona && <div className="dx-ncta-f is-full"><label htmlFor="dx-ncta-razon">Razón social <em>*</em></label><input id="dx-ncta-razon" className={claseCampo('razon_social')} value={form.razon_social} onChange={event => update('razon_social', event.target.value)} placeholder="Como figura en SUNAT" aria-invalid={Boolean(errorCampo('razon_social'))}/>{errorInline('razon_social')}</div>}
            <div className="dx-ncta-f is-full"><label htmlFor="dx-ncta-nombre">{tipoPersona ? 'Nombre completo' : 'Nombre comercial'} <em>*</em></label><input id="dx-ncta-nombre" className={claseCampo('nombre_comercial')} value={form.nombre_comercial} onChange={event => update('nombre_comercial', event.target.value)} placeholder={tipoPersona ? 'Nombres y apellidos' : 'Cómo lo conoce el equipo'} aria-invalid={Boolean(errorCampo('nombre_comercial'))}/>{errorInline('nombre_comercial')}</div>
            <div className="dx-ncta-f is-full"><label>Tipo de cuenta</label><div className="dx-ncta-chips">{TIPOS.map(([value, label, color]) => <button type="button" key={value} className={`dx-ncta-chip${form.tipo === value ? ' is-on' : ''}`} style={{ '--d': color }} aria-pressed={form.tipo === value} onClick={() => update('tipo', value)}><i/>{label}</button>)}</div></div>
            <div className="dx-ncta-f"><label htmlFor="dx-ncta-industria">Industria</label><select id="dx-ncta-industria" className="dx-ncta-in" value={form.industria} onChange={event => update('industria', event.target.value)}><option value="">Seleccionar industria</option>{industriasDisponibles.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
            <div className="dx-ncta-f"><label htmlFor="dx-ncta-responsable">Responsable comercial</label><select id="dx-ncta-responsable" className="dx-ncta-in" value={form.responsable_comercial} onChange={event => update('responsable_comercial', event.target.value)}><option value="">Sin asignar</option>{comercialesAsignables.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select></div>
          </div>
        </section>
        <section className="dx-ncta-sec"><div className="dx-ncta-sec-h"><span className="dx-ncta-num">2</span><h3>Contacto principal</h3><small>Opcional</small></div><div className="dx-ncta-grid">
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-contacto">Nombre</label><input id="dx-ncta-contacto" className="dx-ncta-in" value={form.nombre_contacto} onChange={event => update('nombre_contacto', event.target.value)} placeholder="Persona con quien tratamos"/></div>
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-cargo">Cargo</label><input id="dx-ncta-cargo" className="dx-ncta-in" value={form.cargo_contacto} onChange={event => update('cargo_contacto', event.target.value)} placeholder="Ej. Jefe de mantenimiento"/></div>
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-telefono">Teléfono</label><input id="dx-ncta-telefono" className={claseCampo('telefono')} value={form.telefono} onChange={event => update('telefono', sanitizePhone(event.target.value))} placeholder="9 dígitos" inputMode="tel" pattern={PHONE_PATTERN}/>{errorInline('telefono')}</div>
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-email">Correo</label><input id="dx-ncta-email" className={claseCampo('email')} type="email" value={form.email} onChange={event => update('email', event.target.value)} placeholder="nombre@empresa.com"/>{errorInline('email')}</div>
        </div></section>
        <button type="button" className="dx-ncta-more" aria-expanded={masDatosAbierto} onClick={() => setMasDatosAbierto(value => !value)}>{masDatosAbierto ? I.check : I.plus} Más datos de la empresa <span>Dirección, teléfono, correo corporativo, fuente y notas</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        {masDatosAbierto && <section className="dx-ncta-sec dx-ncta-extra"><div className="dx-ncta-grid">
          <div className="dx-ncta-f is-full"><label htmlFor="dx-ncta-direccion">Dirección</label><input id="dx-ncta-direccion" className="dx-ncta-in" value={form.direccion} onChange={event => update('direccion', event.target.value)}/></div>
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-telefono-empresa">Teléfono empresa</label><input id="dx-ncta-telefono-empresa" className="dx-ncta-in" value={form.telefono_empresa} onChange={event => update('telefono_empresa', event.target.value)}/></div>
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-email-corp">Email corporativo</label><input id="dx-ncta-email-corp" className={claseCampo('email_corporativo')} type="email" value={form.email_corporativo} onChange={event => update('email_corporativo', event.target.value)}/>{errorInline('email_corporativo')}</div>
          <div className="dx-ncta-f"><label htmlFor="dx-ncta-fuente">Fuente de origen</label><select id="dx-ncta-fuente" className="dx-ncta-in" value={form.fuente_origen} onChange={event => update('fuente_origen', event.target.value)}><option value="">Seleccionar fuente</option>{FUENTES.map(fuente => <option key={fuente} value={fuente}>{fuente}</option>)}</select></div>
          <div className="dx-ncta-f is-full"><label htmlFor="dx-ncta-notas">Notas</label><textarea id="dx-ncta-notas" className="dx-ncta-in" rows="3" value={form.notas} onChange={event => update('notas', event.target.value)}/></div>
        </div></section>}
      </form>
      <div className="dx-ncta-foot"><p>Condiciones de pago y crédito se definen luego en la ficha.</p><button type="button" className="dx-ncta-btn" onClick={solicitarCierre} disabled={saving}>Cancelar</button><button type="submit" form="dx-ncta-form" className="dx-ncta-primary" disabled={saving || Boolean(cuentaDuplicada)}>{I.check}{saving ? 'Guardando…' : 'Crear cuenta'}</button></div>
      {confirmarSalida && <div className="dx-ncta-confirm" role="alertdialog" aria-modal="true" aria-labelledby="dx-ncta-confirm-title"><div><h4 id="dx-ncta-confirm-title">¿Salir sin guardar?</h4><p>Perderás los datos que escribiste en esta cuenta nueva.</p><nav><button type="button" className="dx-ncta-btn" onClick={() => setConfirmarSalida(false)}>Seguir editando</button><button type="button" className="dx-ncta-primary is-danger" onClick={cerrarSinGuardar}>Salir sin guardar</button></nav></div></div>}
    </div>
  </div>;
  return createPortal(modal, document.body);
}
