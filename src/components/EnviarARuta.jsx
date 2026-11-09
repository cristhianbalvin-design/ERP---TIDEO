import React, { useCallback, useEffect, useState } from 'react';
import { crearPedidoRuta, pedidoActivoDeDocumento, retirarPedidoRuta } from '../services/hojaRutaService.js';
import { fechaLima, horaLima, pedidoDesdeGuia, pedidoDesdeTransito, validarPedido, ventanaTexto } from '../lib/transporteLogistica.js';
import '../enviar_a_ruta.css';

const fechaDM = valor => { const iso = fechaLima(valor); return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''; };

// «Enviar a ruta» desde una OC en tránsito (Compras) o una guía de remisión (Almacén).
// Deja el documento en «Por enviar a ruta» de la Hoja de Ruta de Operaciones.
export function EnviarARuta({ empresaId, transito, orden, proveedor, guia, addToast }) {
  const [pedido, setPedido] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(null);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const documento = guia ? { guiaId: guia.id } : { ocTransitoId: transito?.id };
  const docId = guia?.id || transito?.id;

  const cargar = useCallback(async () => {
    if (!docId) { setCargando(false); return; }
    setCargando(true);
    try { setPedido(await pedidoActivoDeDocumento(documento)); } catch { setPedido(null); }
    finally { setCargando(false); }
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);

  if (!docId || cargando) return null;

  function abrir() {
    const base = guia ? pedidoDesdeGuia(guia) : pedidoDesdeTransito({ transito, orden, proveedor });
    setForm({ ...base, ventana_inicio: '', ventana_fin: '', indicaciones: '' });
    setErrores({}); setError(''); setAbierto(true);
  }
  const set = (clave, valor) => { setForm(old => ({ ...old, [clave]: valor })); setErrores(old => ({ ...old, [clave]: '' })); };

  async function enviar() {
    const errs = validarPedido(form);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setGuardando(true); setError('');
    try {
      await crearPedidoRuta(empresaId, form);
      setAbierto(false);
      addToast?.('Enviado a la Hoja de Ruta. El despachador lo pondrá en una ruta.');
      await cargar();
    } catch (e) { setError(e.message || 'No se pudo enviar a ruta.'); }
    finally { setGuardando(false); }
  }
  async function retirar() {
    setGuardando(true);
    try { await retirarPedidoRuta(pedido.id); addToast?.('Se retiró de la Hoja de Ruta.'); await cargar(); }
    catch (e) { addToast?.(e.message || 'No se pudo retirar.'); }
    finally { setGuardando(false); }
  }

  const ventana = pedido ? ventanaTexto(pedido.ventana_inicio, pedido.ventana_fin) : '';
  return <div className="dx-enviaruta">
    {!pedido ? <button type="button" className="btn btn-primary" onClick={abrir}>⛟ Enviar a ruta</button>
      : <div className={`dx-enviaruta-estado is-${pedido.estado}`} role="status">
        <span aria-hidden="true">⛟</span>
        <span className="dx-enviaruta-texto">
          {pedido.estado === 'pendiente' && <><b>Enviada a ruta</b> · {pedido.accion === 'entregar' ? 'entregar' : 'recoger'} el {fechaDM(pedido.fecha_requerida)}{ventana ? ` entre ${ventana}` : ''} · esperando que el despachador la asigne.</>}
          {pedido.estado === 'asignado' && <><b>En ruta {pedido.viaje?.codigo || ''}</b> · sale el {fechaDM(pedido.viaje?.fecha_programada)} {horaLima(pedido.viaje?.fecha_programada)}.</>}
          {pedido.estado === 'completado' && <><b>Atendida en ruta {pedido.viaje?.codigo || ''}</b> · con constancia de entrega.</>}
        </span>
        {pedido.estado === 'pendiente' && <button type="button" className="btn btn-secondary btn-sm" disabled={guardando} onClick={retirar}>Retirar</button>}
      </div>}

    {abierto && <div className="modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !guardando) setAbierto(false); }}>
      <section className="modal dx-enviaruta-modal" role="dialog" aria-modal="true" aria-labelledby="enviaruta-titulo">
        <div className="modal-header"><h2 id="enviaruta-titulo">Enviar {guia ? guia.numero_completo : orden?.codigo || 'OC'} a ruta</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setAbierto(false)} disabled={guardando}>×</button></div>
        <div className="modal-body dx-enviaruta-body">
          <p className="dx-enviaruta-sub">Queda en «Por enviar a ruta» de la Hoja de Ruta; el despachador lo pone en una ruta.</p>
          <div className="dx-enviaruta-campo"><span>Qué hay que hacer</span>
            <div className="dx-enviaruta-seg" role="radiogroup" aria-label="Qué hay que hacer">
              {[['recoger', '⇩ Recoger', 'Traer al almacén'], ['entregar', '⇧ Entregar', 'Llevar al destino']].map(([clave, titulo, texto]) =>
                <button key={clave} type="button" role="radio" aria-checked={form.accion === clave} className={form.accion === clave ? 'is-on' : ''}
                  onClick={() => set('accion', clave)}><b>{titulo}</b>{texto}</button>)}</div></div>
          <label className="dx-enviaruta-campo" htmlFor="enviaruta-lugar"><span>{form.accion === 'entregar' ? 'Entregar en' : 'Recoger en'} <b className="dx-enviaruta-req">*</b></span>
            <input id="enviaruta-lugar" className="input" value={form.lugar_nombre} aria-invalid={Boolean(errores.lugar_nombre)} onChange={event => set('lugar_nombre', event.target.value)} />
            {errores.lugar_nombre && <small className="dx-enviaruta-err">{errores.lugar_nombre}</small>}</label>
          <label className="dx-enviaruta-campo" htmlFor="enviaruta-dir"><span>Dirección</span>
            <input id="enviaruta-dir" className="input" value={form.direccion} onChange={event => set('direccion', event.target.value)} /></label>
          <label className="dx-enviaruta-campo" htmlFor="enviaruta-titulo-in"><span>Para el despachador <b className="dx-enviaruta-req">*</b></span>
            <input id="enviaruta-titulo-in" className="input" value={form.titulo} aria-invalid={Boolean(errores.titulo)} onChange={event => set('titulo', event.target.value)} />
            {errores.titulo && <small className="dx-enviaruta-err">{errores.titulo}</small>}</label>
          <div className="dx-enviaruta-grid">
            <label className="dx-enviaruta-campo" htmlFor="enviaruta-fecha"><span>Para el día <b className="dx-enviaruta-req">*</b></span>
              <input id="enviaruta-fecha" className="input" type="date" value={form.fecha_requerida} aria-invalid={Boolean(errores.fecha_requerida)}
                onChange={event => set('fecha_requerida', event.target.value)} />
              {errores.fecha_requerida && <small className="dx-enviaruta-err">{errores.fecha_requerida}</small>}</label>
            <label className="dx-enviaruta-campo" htmlFor="enviaruta-desde"><span>Desde</span>
              <input id="enviaruta-desde" className="input" type="time" value={form.ventana_inicio} onChange={event => set('ventana_inicio', event.target.value)} /></label>
            <label className="dx-enviaruta-campo" htmlFor="enviaruta-hasta"><span>Hasta</span>
              <input id="enviaruta-hasta" className="input" type="time" value={form.ventana_fin} aria-invalid={Boolean(errores.ventana_fin)} onChange={event => set('ventana_fin', event.target.value)} />
              {errores.ventana_fin && <small className="dx-enviaruta-err">{errores.ventana_fin}</small>}</label>
          </div>
          <label className="dx-enviaruta-campo" htmlFor="enviaruta-ind"><span>Indicaciones</span>
            <textarea id="enviaruta-ind" className="input" rows={3} value={form.indicaciones} placeholder="Ej.: preguntar por Carlos; llevar copia de la OC."
              onChange={event => set('indicaciones', event.target.value)} /></label>
          {error && <div className="dx-enviaruta-error" role="alert">{error}</div>}
        </div>
        <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={enviar} disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar a la Hoja de Ruta'}</button></div>
      </section>
    </div>}
  </div>;
}
