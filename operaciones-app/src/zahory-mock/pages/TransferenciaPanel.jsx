import { useEffect, useMemo, useRef, useState } from 'react';
import { advertenciaDestinoTransferencia, listarDestinosTransferencia, MENSAJE_ORIGEN_NO_TRANSFERIBLE, validarTransferencia } from './inventarioMovimientosLogic.js';

const numero = valor => Number(String(valor ?? '').replace(',', '.')) || 0;

export function TransferenciaPanel({ material, stockOrigen, almacenes = [], ubicaciones = [], destinoInicial, cantidadInicial, onClose, onSubmit }) {
  const destinos = useMemo(() => listarDestinosTransferencia(ubicaciones, stockOrigen), [ubicaciones, stockOrigen]);
  const almacenInicial = destinoInicial?.almacen_id || stockOrigen?.almacen_id || '';
  const ubicacionInicial = destinoInicial?.ubicacion_id || destinos.find(item => item.almacen_id === almacenInicial)?.id || '';
  const [form, setForm] = useState({ almacen_destino_id: almacenInicial, ubicacion_destino_id: ubicacionInicial, cantidad: cantidadInicial == null ? '' : String(cantidadInicial), observacion: '' });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef(null);
  const primeroRef = useRef(null);
  const envioRef = useRef(false);
  const destinosAlmacen = destinos.filter(item => item.almacen_id === form.almacen_destino_id);
  const ubicacionDestino = destinosAlmacen.find(item => item.id === form.ubicacion_destino_id);
  const disponible = Math.max(numero(stockOrigen?.disponible ?? (numero(stockOrigen?.fisico) - numero(stockOrigen?.reservado))), 0);
  const advertencia = advertenciaDestinoTransferencia(ubicacionDestino);
  const validacionActual = validarTransferencia(form, { material, stockOrigen, ubicacionDestino });
  const cambia = (campo, valor) => { setForm(actual => ({ ...actual, [campo]: valor })); setErrores(actual => ({ ...actual, [campo]: '' })); setErrorServidor(''); };

  useEffect(() => { primeroRef.current?.focus(); }, []);
  useEffect(() => {
    if (!globalThis.document) return undefined;
    const keydown = evento => { if (evento.key === 'Escape' && !guardando) { evento.stopPropagation(); onClose(); } };
    globalThis.document.addEventListener('keydown', keydown);
    return () => globalThis.document.removeEventListener('keydown', keydown);
  }, [guardando, onClose]);

  const enviar = async evento => {
    evento.preventDefault();
    if (envioRef.current) return;
    const validacion = validarTransferencia(form, { material, stockOrigen, ubicacionDestino });
    setErrores(validacion);
    if (Object.keys(validacion).length) {
      const campo = Object.keys(validacion)[0];
      const enfocar = () => panelRef.current?.querySelector(`[name="${campo}"]`)?.focus();
      if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(enfocar);
      else globalThis.setTimeout(enfocar, 0);
      return;
    }
    envioRef.current = true; setGuardando(true); setErrorServidor('');
    try { await onSubmit({ ...form, cantidad: numero(form.cantidad), observacion: form.observacion.trim() || null }); }
    catch (error) { setErrorServidor(error?.message || 'No se pudo registrar la transferencia.'); }
    finally { envioRef.current = false; setGuardando(false); }
  };

  const unidad = material?.unidad || 'unidades';
  const origenUbicacion = stockOrigen?.ubicaciones?.nombre || stockOrigen?.ubicacion || stockOrigen?.ubicacion_id || '—';
  const origenAlmacen = stockOrigen?.almacenes?.nombre || stockOrigen?.almacen || almacenes.find(item => item.id === stockOrigen?.almacen_id)?.nombre || stockOrigen?.almacen_id || '—';
  const loteSerie = [stockOrigen?.lote, stockOrigen?.serie].filter(Boolean).join(' / ') || '—';
  const ubicacionEtiqueta = item => item ? `${item.codigo ? `${item.codigo} · ` : ''}${item.nombre}` : 'Selecciona ubicación…';
  const campo = (id, label, content, error, ayuda) => <div className="dx-mov-f"><label htmlFor={`tr-${id}`}>{label}</label>{content}{error && <small className="bad" role="alert">{error}</small>}{!error && ayuda && <small>{ayuda}</small>}</div>;

  return <div className="dx-mov-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget && !guardando) onClose(); }}>
    <section ref={panelRef} className="dx-mov-panel" role="dialog" aria-modal="true" aria-labelledby="transferencia-panel-titulo" onKeyDown={evento => {
      if (evento.key !== 'Tab') return;
      const elementos = [...(panelRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || [])];
      const primero = elementos[0], ultimo = elementos[elementos.length - 1];
      if (evento.shiftKey && globalThis.document?.activeElement === primero) { evento.preventDefault(); ultimo?.focus(); }
      else if (!evento.shiftKey && globalThis.document?.activeElement === ultimo) { evento.preventDefault(); primero?.focus(); }
    }}>
      <header><h2 id="transferencia-panel-titulo">{form.almacen_destino_id === stockOrigen?.almacen_id ? 'Reubicar stock' : 'Transferir stock'}</h2><button type="button" className="dx-mov-x" aria-label="Cerrar panel" onClick={onClose} disabled={guardando}>×</button></header>
      <form onSubmit={enviar}>
        <div className="dx-mov-body">
          {errorServidor && <div className="dx-mov-alert" role="alert" aria-live="assertive">{errorServidor}</div>}
          <div className="dx-mov-summary" aria-label="Resumen del origen"><h3>Origen · solo lectura</h3><dl className="dx-mov-dl"><div><dt>Material</dt><dd>{material?.descripcion || material?.codigo || stockOrigen?.material_id}</dd></div><div><dt>Almacén · ubicación</dt><dd>{origenAlmacen} · {origenUbicacion}</dd></div><div><dt>Lote / serie</dt><dd>{loteSerie}</dd></div><div><dt>Físico</dt><dd>{numero(stockOrigen?.fisico ?? stockOrigen?.disponible)} {unidad}</dd></div><div><dt>Reservado</dt><dd>{numero(stockOrigen?.reservado)} {unidad}</dd></div><div><dt>Disponible</dt><dd>{disponible} {unidad}</dd></div></dl></div>
          <div className="dx-mov-row2">
            {campo('almacen-destino', 'Destino · almacén', <select ref={primeroRef} id="tr-almacen-destino" name="almacen_destino_id" className="dx-mov-field" value={form.almacen_destino_id} onChange={evento => { const siguiente = evento.target.value; setForm(actual => ({ ...actual, almacen_destino_id: siguiente, ubicacion_destino_id: destinos.find(item => item.almacen_id === siguiente)?.id || '' })); setErrores(actual => ({ ...actual, almacen_destino_id: '', ubicacion_destino_id: '' })); setErrorServidor(''); }}><option value="">Selecciona…</option>{almacenes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>, errores.almacen_destino_id)}
            {campo('ubicacion-destino', 'Destino · ubicación', <select id="tr-ubicacion-destino" name="ubicacion_destino_id" className="dx-mov-field" value={form.ubicacion_destino_id} onChange={evento => cambia('ubicacion_destino_id', evento.target.value)}><option value="">Selecciona…</option>{destinosAlmacen.map(item => <option key={item.id} value={item.id}>{ubicacionEtiqueta(item)}{['cuarentena', 'merma'].includes(item.uso) ? ` (${item.uso})` : ''}</option>)}</select>, errores.ubicacion_destino_id, !destinosAlmacen.length ? 'Este almacén no tiene ubicaciones activas disponibles.' : '')}
          </div>
          {validacionActual.stock_origen_id && <div className="dx-mov-alert" role="alert">{MENSAJE_ORIGEN_NO_TRANSFERIBLE}</div>}
          {advertencia && <div className="dx-mov-warn" role="status">{advertencia}</div>}
          {campo('cantidad', `Cantidad (${unidad})`, <input id="tr-cantidad" name="cantidad" inputMode="decimal" className="dx-mov-field" value={form.cantidad} onChange={evento => cambia('cantidad', evento.target.value)} placeholder="0" />, errores.cantidad || (form.cantidad && validacionActual.cantidad), material?.tipo_control === 'serie' ? 'Control por serie: la serie viaja con el stock y la cantidad debe ser 1.' : `${stockOrigen?.reservado || 0} reservados no se mueven.`)}
          <div className="dx-mov-sum" aria-live="polite"><small>Resumen en vivo</small><div><span>Sale de</span><b>{origenAlmacen} · {origenUbicacion}</b></div><div><span>Entra en</span><b>{almacenes.find(item => item.id === form.almacen_destino_id)?.nombre || '—'} · {ubicacionEtiqueta(ubicacionDestino)}</b></div><div><span>Cantidad</span><b>{numero(form.cantidad) > 0 ? `${numero(form.cantidad)} ${unidad}` : '—'}</b></div><div><span>Costo promedio que viaja</span><b>{material?.costo_promedio ?? '—'}</b></div></div>
          {campo('observacion', 'Observación opcional', <textarea id="tr-observacion" name="observacion" className="dx-mov-field" value={form.observacion} maxLength={200} onChange={evento => cambia('observacion', evento.target.value)} placeholder="Motivo o referencia interna" />)}
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={guardando}>Cancelar</button><button type="submit" className="dx-btn primary" disabled={guardando || Object.keys(validacionActual).length > 0}>{guardando ? 'Transfiriendo…' : form.almacen_destino_id === stockOrigen?.almacen_id ? 'Reubicar stock' : 'Transferir stock'}</button></footer>
      </form>
    </section>
  </div>;
}
