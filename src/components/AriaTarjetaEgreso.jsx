import React, { useRef, useState } from 'react';
import { cancelarBorradorEgreso, confirmarBorradorEgreso, obtenerGastoIdBorrador } from '../services/asistenteErpService.js';
import { subirAdjunto } from '../services/storageService.js';

const dinero = (monto, moneda) => `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (iso) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};

// Tarjeta del borrador que preparó Aria. Solo el botón Confirmar graba el egreso.
export default function AriaTarjetaEgreso({ borrador, empresaId, estadoInicial, onCambio }) {
  const [estado, setEstado] = useState(estadoInicial?.estado || 'pendiente');
  const [resultado, setResultado] = useState(estadoInicial?.resultado || null);
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [numComprobante, setNumComprobante] = useState(borrador?.num_comprobante || '');
  const fotoRef = useRef(null);
  const ocupado = estado === 'subiendo' || estado === 'confirmando' || estado === 'cancelando';
  const cerrado = estado === 'confirmado' || estado === 'cancelado';

  const cambiar = (siguiente, datos = null) => {
    setEstado(siguiente);
    if (datos) setResultado(datos);
    if (siguiente === 'confirmado' || siguiente === 'cancelado') onCambio?.({ estado: siguiente, resultado: datos });
  };

  const confirmar = async () => {
    if (ocupado || cerrado) return;
    setError('');
    try {
      let comprobanteUrl = null;
      if (archivo) {
        setEstado('subiendo');
        const gastoId = await obtenerGastoIdBorrador(borrador.id);
        const adjunto = await subirAdjunto({ empresaId, entidadTipo: 'compras_gastos', entidadId: gastoId, file: archivo, categoria: 'comprobante' });
        comprobanteUrl = adjunto?.url || null;
      }
      setEstado('confirmando');
      const datos = await confirmarBorradorEgreso({ borradorId: borrador.id, comprobanteUrl, numComprobante: numComprobante.trim() });
      if (datos?.estado === 'confirmado') cambiar('confirmado', datos);
      else { setEstado('pendiente'); setError(datos?.mensaje || 'No se pudo registrar el egreso.'); }
    } catch (causa) {
      setEstado('pendiente');
      setError(causa?.message || 'No se pudo registrar el egreso.');
    }
  };

  const cancelar = async () => {
    if (ocupado || cerrado) return;
    setError('');
    setEstado('cancelando');
    try { await cancelarBorradorEgreso(borrador.id); cambiar('cancelado'); }
    catch (causa) { setEstado('pendiente'); setError(causa?.message || 'No se pudo cancelar.'); }
  };

  const filas = [
    ['Fondo', borrador.fondo],
    ['Categoría', borrador.tipo_gasto ? `${borrador.categoria} · ${borrador.tipo_gasto}` : borrador.categoria],
    ['CECO', borrador.ceco],
    ['Fecha', fechaCorta(borrador.fecha)],
    ['Proveedor', borrador.proveedor],
    ['Comprobante', borrador.tipo_comprobante],
    ['Saldo después', dinero(borrador.saldo_despues, borrador.moneda)],
  ].filter(([, valor]) => valor);

  return <section className={`dx-asis-draft is-${estado}`} aria-label="Borrador de egreso de caja chica">
    <div className="dx-asis-draft-head">
      <span className="dx-asis-draft-eyebrow">Egreso de caja chica</span>
      <span className={`dx-asis-draft-state is-${estado}`}>
        {estado === 'confirmado' ? 'Registrado' : estado === 'cancelado' ? 'Cancelado' : 'Por confirmar'}
      </span>
    </div>
    <div className="dx-asis-draft-amount">{dinero(borrador.monto, borrador.moneda)}</div>
    <div className="dx-asis-draft-concept">{borrador.concepto}</div>
    <dl className="dx-asis-draft-grid">
      {filas.map(([etiqueta, valor]) => <React.Fragment key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></React.Fragment>)}
    </dl>

    {!cerrado && <>
      <label className="dx-asis-draft-field">
        <span>N.º de comprobante</span>
        <input type="text" maxLength={60} value={numComprobante} disabled={ocupado} placeholder="Opcional" onChange={event => setNumComprobante(event.target.value)} />
      </label>
      <input ref={fotoRef} className="dx-asis-label" type="file" accept="image/*,application/pdf" capture="environment" disabled={ocupado}
        onChange={event => { setArchivo(event.target.files?.[0] || null); setError(''); }} aria-label="Foto del comprobante" />
      <button type="button" className="dx-asis-draft-photo" disabled={ocupado} onClick={() => fotoRef.current?.click()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
        <span>{archivo ? archivo.name : 'Adjuntar foto del comprobante'}</span>
        {archivo && <b>Cambiar</b>}
      </button>
      {error && <div className="dx-asis-draft-error" role="alert">{error}</div>}
      <div className="dx-asis-draft-actions">
        <button type="button" className="dx-asis-draft-btn" disabled={ocupado} onClick={cancelar}>Cancelar</button>
        <button type="button" className="dx-asis-draft-btn primary" disabled={ocupado} onClick={confirmar}>
          {estado === 'subiendo' ? 'Subiendo foto…' : estado === 'confirmando' ? 'Registrando…' : 'Confirmar'}
        </button>
      </div>
      <div className="dx-asis-draft-note">Nada se graba hasta que pulses Confirmar. El borrador vence a los 30 minutos.</div>
    </>}

    {estado === 'confirmado' && <div className="dx-asis-draft-done" role="status">
      Registrado en Caja chica y Compras/Gastos. Saldo de {resultado?.fondo || borrador.fondo}: <b>{dinero(resultado?.saldo_restante, resultado?.moneda || borrador.moneda)}</b>
    </div>}
    {estado === 'cancelado' && <div className="dx-asis-draft-note" role="status">Borrador cancelado. No se registró nada.</div>}
  </section>;
}
