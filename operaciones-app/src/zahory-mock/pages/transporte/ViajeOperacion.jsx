import React, { useState } from 'react';
import {
  HITOS_COMERCIAL, NOVEDADES_CARGA, TIPOS_GASTO, duracionTexto, esperasViaje, fechaLima, horaLima, hitoRegistrado, totalGastos,
} from '../../../../../src/lib/transporteLogistica.js';
import { imagenComoDataUrl } from '../../../services/transporteLogisticaService.js';
import { formatearImporte } from './transporteUtils.js';

const fechaHora = valor => { const f = fechaLima(valor); return f ? `${f.slice(8, 10)}/${f.slice(5, 7)} ${horaLima(valor)}` : '—'; };
const novedadTexto = clave => NOVEDADES_CARGA.find(([k]) => k === clave)?.[1] || '';

// Constancia de una parada atendida: quién recibió, cuándo, dónde y la evidencia.
export function EvidenciaParada({ parada }) {
  if (parada.estado === 'omitida') return <div className="dx-tmsop-ev is-skip">Omitida{parada.observaciones ? ` · ${parada.observaciones}` : ''}</div>;
  if (parada.estado !== 'completada' || !(parada.recibe_nombre || parada.firma_url || parada.foto_url)) return null;
  const novedad = novedadTexto(parada.novedad);
  return <div className="dx-tmsop-ev">
    <div className="dx-tmsop-ev-t"><b>{parada.recibe_nombre || 'Sin nombre'}</b>{parada.recibe_dni && <span>DNI {parada.recibe_dni}</span>}
      <span>{fechaHora(parada.salida_at)}</span>
      {parada.bultos_recibidos != null && <span>{parada.bultos_recibidos} bultos</span>}
      {novedad && <span className={`dx-tmshr-mini ${parada.novedad === 'conforme' ? 'is-green' : 'is-red'}`}>{novedad}</span>}</div>
    {parada.observaciones && <small>{parada.observaciones}</small>}
    <div className="dx-tmsop-ev-links">
      {parada.firma_url && <a href={parada.firma_url} target="_blank" rel="noreferrer">Firma</a>}
      {parada.foto_url && <a href={parada.foto_url} target="_blank" rel="noreferrer">Foto de la guía</a>}
      {parada.foto_carga_url && <a href={parada.foto_carga_url} target="_blank" rel="noreferrer">Foto de la carga</a>}
      {parada.latitud_evidencia != null && <a href={`https://www.google.com/maps?q=${parada.latitud_evidencia},${parada.longitud_evidencia}`}
        target="_blank" rel="noreferrer">GPS</a>}
    </div>
  </div>;
}

export function BotonConstancia({ viaje, empresa }) {
  const [generando, setGenerando] = useState(false);
  const hechas = (viaje.paradas || []).filter(p => p.estado === 'completada' && (p.recibe_nombre || p.firma_url));
  if (!hechas.length) return null;
  async function descargar() {
    setGenerando(true);
    try {
      const imagenes = {};
      await Promise.all(hechas.map(async parada => {
        const [firma, foto, carga] = await Promise.all([imagenComoDataUrl(parada.firma_url), imagenComoDataUrl(parada.foto_url),
          imagenComoDataUrl(parada.foto_carga_url)]);
        imagenes[parada.id] = { firma, foto, carga };
      }));
      const { generarConstanciaPdf } = await import('../../../../../src/lib/hojaRutaPdf.js');
      generarConstanciaPdf({ viaje, empresa, imagenes }).save(`constancia-${viaje.codigo}.pdf`);
    } finally { setGenerando(false); }
  }
  return <button type="button" className="dx-btn dx-tmsvd-sp" onClick={descargar} disabled={generando}>{generando ? 'Generando…' : '⎙ Constancia PDF'}</button>;
}

// Bloque del servicio comercial: hitos con esperas, inspección antes de salir y gastos en ruta.
export function OperacionComercial({ operacion, puedeAutorizar, onAutorizar }) {
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const { hitos = [], inspeccion = null, gastos = [] } = operacion || {};
  const esperas = esperasViaje(hitos);
  const pendienteAutorizacion = inspeccion && inspeccion.criticos > 0 && !inspeccion.autorizada_at;
  const monedas = [...new Set(gastos.map(g => g.moneda || 'PEN'))];
  async function autorizar() {
    if (!nota.trim()) { setError('Indica por qué autorizas la salida.'); return; }
    setEnviando(true); setError('');
    try { await onAutorizar(nota.trim()); setNota(''); } catch (e) { setError(e.message || 'No se pudo autorizar.'); }
    finally { setEnviando(false); }
  }
  return <section className="dx-tmsvd-blk dx-tmsop"><header><h3>Operación en ruta</h3><small>hitos, inspección y gastos del conductor</small></header>
    <div className="dx-tmsvd-in">
      <ol className="dx-tmsop-hitos">{HITOS_COMERCIAL.map(hito => {
        const registro = hitoRegistrado(hitos, hito.key);
        const espera = hito.key === 'fin_carga' ? esperas.carga : hito.key === 'fin_descarga' ? esperas.descarga : null;
        return <li key={hito.key} className={registro ? 'is-ok' : ''}><i aria-hidden="true">{registro ? '✓' : ''}</i>
          <span>{hito.label}{espera != null && <em className="dx-tmshr-mini is-amber">espera {duracionTexto(espera)}</em>}</span>
          <time>{registro ? fechaHora(registro.ocurrido_at) : '—'}{registro?.km != null ? ` · ${registro.km} km` : ''}</time></li>;
      })}</ol>

      <div className="dx-tmsop-sub"><b>Inspección antes de salir</b>
        {!inspeccion ? <small>El conductor aún no la registra.</small> : <>
          <small>{inspeccion.criticos ? `${inspeccion.criticos} punto(s) crítico(s)` : 'Sin puntos críticos'} · {inspeccion.observados} observado(s)
            {inspeccion.km_salida != null && ` · km de salida ${inspeccion.km_salida}`}</small>
          {(inspeccion.items || []).filter(item => !item.ok).map(item => <span key={item.texto} className={`dx-tmshr-mini ${item.critico ? 'is-red' : 'is-amber'}`}>
            {item.texto}{item.observacion ? `: ${item.observacion}` : ''}</span>)}
          {inspeccion.autorizada_at && <small>Salida autorizada el {fechaHora(inspeccion.autorizada_at)}.</small>}
        </>}
        {pendienteAutorizacion && puedeAutorizar && <div className="dx-tmsop-auth">
          <label className="dx-ui-field" htmlFor="tmsop-auth"><span>Autorizar la salida <b className="dx-ui-required">*</b></span>
            <input id="tmsop-auth" value={nota} placeholder="Ej.: frenos revisados por taller" aria-invalid={Boolean(error)}
              onChange={event => { setNota(event.target.value); setError(''); }} />
            {error && <small className="dx-ui-field-error">{error}</small>}</label>
          <button type="button" className="dx-btn primary" onClick={autorizar} disabled={enviando}>{enviando ? 'Guardando…' : 'Autorizar salida'}</button></div>}
      </div>

      <div className="dx-tmsop-sub"><b>Gastos en ruta</b>
        {!gastos.length ? <small>Sin gastos registrados.</small> : <>
          <ul className="dx-tmsop-gastos">{gastos.map(gasto => <li key={gasto.id}>
            <span>{TIPOS_GASTO.find(([k]) => k === gasto.tipo)?.[1] || gasto.tipo}{gasto.lugar ? ` · ${gasto.lugar}` : ''}</span>
            <a href={gasto.foto_url} target="_blank" rel="noreferrer">comprobante</a>
            <b>{formatearImporte(gasto.monto, gasto.moneda)}</b></li>)}</ul>
          {monedas.map(moneda => <div key={moneda} className="dx-tmsop-total"><span>Total</span>
            <b>{formatearImporte(totalGastos(gastos.filter(g => (g.moneda || 'PEN') === moneda)), moneda)}</b></div>)}
          <small>Van a la liquidación del viaje.</small></>}
      </div>
    </div>
  </section>;
}
