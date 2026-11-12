import React, { useState } from 'react';
import { cancelarBorradorEgreso, confirmarBorradorCrm } from '../services/asistenteErpService.js';

const dinero = (monto, moneda) => `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TIPO_CUENTA = { prospecto: 'Prospecto', cliente: 'Cliente', partner: 'Partner' };
const documento = (tipo, numero) => numero ? `${tipo === 'TAX_ID_EXTRANJERO' ? 'Doc. extranjero' : tipo || 'RUC'} ${numero}` : '';

export function filasBorradorCrm(b) {
  const filas = b.tipo === 'lead' ? [
    ['Empresa', b.empresa_nombre], ['Razón social', b.razon_social !== b.empresa_nombre ? b.razon_social : ''],
    ['Documento', documento(b.tipo_documento, b.numero_documento)], ['Cargo', b.cargo], ['Teléfono', b.telefono], ['Correo', b.email],
    ['LinkedIn', b.linkedin_url], ['Origen', b.fuente], ['Industria', b.industria], ['Necesidad', b.necesidad],
    ['Presupuesto', b.presupuesto_estimado != null ? dinero(b.presupuesto_estimado, b.moneda) : ''], ['Urgencia', b.urgencia],
    ['Campaña', b.campana], ['Responsable', b.responsable],
  ] : [
    ['Nombre comercial', b.nombre_comercial !== b.razon_social ? b.nombre_comercial : ''],
    ['Documento', documento(b.tipo_documento, b.ruc)], ['Tipo', TIPO_CUENTA[b.tipo_cuenta] || b.tipo_cuenta], ['Industria', b.industria],
    ['Tamaño', b.tamano], ['Teléfono', b.telefono], ['Correo', b.email], ['Dirección', b.direccion], ['Condición de pago', b.condicion_pago],
    ['Límite de crédito', b.limite_credito != null ? dinero(b.limite_credito, b.moneda) : ''], ['Origen', b.fuente_origen], ['Responsable', b.responsable],
    ['Contacto principal', [b.contacto_nombre, b.contacto_cargo].filter(Boolean).join(' · ')],
    ['Contacto', [b.contacto_telefono, b.contacto_email].filter(Boolean).join(' · ')],
  ];
  return filas.filter(([, valor]) => valor);
}

// Tarjeta del borrador de lead o cuenta que preparó Aria. Solo el botón Confirmar lo graba.
export default function AriaTarjetaCrm({ borrador, estadoInicial, onCambio, onRegistrado, onIr }) {
  const esLead = borrador.tipo === 'lead';
  const [estado, setEstado] = useState(estadoInicial?.estado || 'pendiente');
  const [error, setError] = useState('');
  const ocupado = estado === 'confirmando' || estado === 'cancelando';
  const cerrado = estado === 'confirmado' || estado === 'cancelado';
  const nombre = esLead ? 'lead' : 'cuenta';
  const destino = esLead ? { app: 'admin', ruta: 'leads', titulo: 'Leads y Scoring' } : { app: 'admin', ruta: 'cuentas', titulo: 'Cuentas y Contactos' };

  const cambiar = (siguiente, datos = null) => {
    setEstado(siguiente);
    onCambio?.({ estado: siguiente, resultado: datos });
  };

  const confirmar = async () => {
    if (ocupado || cerrado) return;
    setError('');
    setEstado('confirmando');
    try {
      const datos = await confirmarBorradorCrm(borrador.id);
      if (datos?.estado === 'confirmado') { cambiar('confirmado', datos); onRegistrado?.(datos); }
      else { setEstado('pendiente'); setError(datos?.mensaje || `No se pudo registrar ${esLead ? 'el lead' : 'la cuenta'}.`); }
    } catch (causa) {
      setEstado('pendiente');
      setError(causa?.message || `No se pudo registrar ${esLead ? 'el lead' : 'la cuenta'}.`);
    }
  };

  const cancelar = async () => {
    if (ocupado || cerrado) return;
    setError('');
    setEstado('cancelando');
    try { await cancelarBorradorEgreso(borrador.id); cambiar('cancelado'); }
    catch (causa) { setEstado('pendiente'); setError(causa?.message || 'No se pudo cancelar.'); }
  };

  return <section className={`dx-asis-draft is-${estado}`} aria-label={`Borrador de ${nombre}`}>
    <div className="dx-asis-draft-head">
      <span className="dx-asis-draft-eyebrow">{esLead ? 'Nuevo lead' : `Nueva cuenta · ${TIPO_CUENTA[borrador.tipo_cuenta] || 'Prospecto'}`}</span>
      <span className={`dx-asis-draft-state is-${estado}`}>
        {estado === 'confirmado' ? 'Registrado' : estado === 'cancelado' ? 'Cancelado' : 'Por confirmar'}
      </span>
    </div>
    <div className="dx-asis-draft-concept"><b>{esLead ? borrador.nombre_contacto : (borrador.razon_social || borrador.nombre_comercial)}</b></div>
    <dl className="dx-asis-draft-grid">
      {filasBorradorCrm(borrador).map(([etiqueta, valor]) => <React.Fragment key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></React.Fragment>)}
    </dl>

    {!cerrado && <>
      {error && <div className="dx-asis-draft-error" role="alert">{error}</div>}
      <div className="dx-asis-draft-actions">
        <button type="button" className="dx-asis-draft-btn" disabled={ocupado} onClick={cancelar}>Cancelar</button>
        <button type="button" className="dx-asis-draft-btn primary" disabled={ocupado} onClick={confirmar}>
          {estado === 'confirmando' ? 'Registrando…' : 'Confirmar'}
        </button>
      </div>
      <div className="dx-asis-draft-note">Nada se graba hasta que pulses Confirmar. Si falta o sobra un dato, dímelo y preparo otro borrador. Vence a los 30 minutos.</div>
    </>}

    {estado === 'confirmado' && <div className="dx-asis-draft-done" role="status">
      {esLead ? 'Lead registrado en Leads, en estado Nuevo.' : `Cuenta registrada en Cuentas y Contactos${borrador.contacto_nombre ? ', con su contacto principal' : ''}.`}
      {onIr && <> <button type="button" className="dx-asis-ir-b" onClick={() => onIr(destino)}>Ir a {destino.titulo}</button></>}
    </div>}
    {estado === 'cancelado' && <div className="dx-asis-draft-note" role="status">Borrador cancelado. No se registró nada.</div>}
  </section>;
}
