import { useEffect, useMemo, useRef, useState } from 'react';
import { listarDestinosLiberacionCuarentena, validarLiberacionCuarentena } from './inventarioMovimientosLogic.js';

const MOTIVOS = ['Inspección aprobada', 'Reproceso o reparación', 'Error de ubicación', 'Otro'];
const numero = valor => Number(String(valor ?? '').replace(',', '.')) || 0;

export function LiberarCuarentenaPanel({ material, stockOrigen, almacenes = [], ubicaciones = [], onClose, onSubmit }) {
  const destinos = useMemo(() => listarDestinosLiberacionCuarentena(ubicaciones), [ubicaciones]);
  const almacenInicial = destinos.find(item => item.almacen_id === stockOrigen?.almacen_id)?.almacen_id || destinos[0]?.almacen_id || '';
  const ubicacionInicial = destinos.find(item => item.almacen_id === almacenInicial)?.id || '';
  const [form, setForm] = useState({ almacen_destino_id: almacenInicial, ubicacion_destino_id: ubicacionInicial, cantidad: '', motivo: '', observacion: '' });
  const [otro, setOtro] = useState('');
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef(null);
  const primeroRef = useRef(null);
  const envioRef = useRef(false);
  const destinosAlmacen = destinos.filter(item => item.almacen_id === form.almacen_destino_id);
  const ubicacionDestino = destinosAlmacen.find(item => item.id === form.ubicacion_destino_id);
  const motivoFinal = form.motivo === 'Otro' ? otro.trim() : form.motivo;
  const formaValidada = { ...form, motivo: motivoFinal };
  const validacionActual = validarLiberacionCuarentena(formaValidada, { material, stockOrigen, ubicacionDestino });
  const disponible = Math.max(numero(stockOrigen?.disponible ?? (numero(stockOrigen?.fisico) - numero(stockOrigen?.reservado))), 0);
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
    const validacion = validarLiberacionCuarentena(formaValidada, { material, stockOrigen, ubicacionDestino });
    setErrores(validacion);
    if (Object.keys(validacion).length) {
      const campo = Object.keys(validacion)[0];
      globalThis.requestAnimationFrame?.(() => panelRef.current?.querySelector(`[name="${campo}"]`)?.focus());
      return;
    }
    envioRef.current = true; setGuardando(true); setErrorServidor('');
    try { await onSubmit({ ...form, cantidad: numero(form.cantidad), motivo: motivoFinal, observacion: form.observacion.trim() || null }); }
    catch (error) { setErrorServidor(error?.message || 'No se pudo liberar el stock.'); }
    finally { envioRef.current = false; setGuardando(false); }
  };

  const unidad = material?.unidad || 'unidades';
  const origenUbicacion = stockOrigen?.ubicaciones?.nombre || stockOrigen?.ubicacion || stockOrigen?.ubicacion_id || '—';
  const origenAlmacen = stockOrigen?.almacenes?.nombre || stockOrigen?.almacen || almacenes.find(item => item.id === stockOrigen?.almacen_id)?.nombre || stockOrigen?.almacen_id || '—';
  const campo = (id, label, content, error, ayuda) => <div className="dx-mov-f"><label htmlFor={`lc-${id}`}>{label}</label>{content}{error && <small className="bad" role="alert">{error}</small>}{!error && ayuda && <small>{ayuda}</small>}</div>;

  return <div className="dx-mov-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget && !guardando) onClose(); }}>
    <section ref={panelRef} className="dx-mov-panel" role="dialog" aria-modal="true" aria-labelledby="liberar-cuarentena-titulo" onKeyDown={evento => {
      if (evento.key !== 'Tab') return;
      const elementos = [...(panelRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || [])];
      const primero = elementos[0], ultimo = elementos[elementos.length - 1];
      if (evento.shiftKey && globalThis.document?.activeElement === primero) { evento.preventDefault(); ultimo?.focus(); }
      else if (!evento.shiftKey && globalThis.document?.activeElement === ultimo) { evento.preventDefault(); primero?.focus(); }
    }}>
      <header><h2 id="liberar-cuarentena-titulo">Liberar stock</h2><button type="button" className="dx-mov-x" aria-label="Cerrar panel" onClick={onClose} disabled={guardando}>×</button></header>
      <form onSubmit={enviar}>
        <div className="dx-mov-body">
          {errorServidor && <div className="dx-mov-alert" role="alert" aria-live="assertive">{errorServidor}</div>}
          <div className="dx-mov-summary"><h3>Origen · solo lectura</h3><dl className="dx-mov-dl"><div><dt>Material</dt><dd>{material?.descripcion || material?.codigo || stockOrigen?.material_id}</dd></div><div><dt>Almacén · ubicación</dt><dd>{origenAlmacen} · {origenUbicacion}</dd></div><div><dt>Disponible</dt><dd>{disponible} {unidad}</dd></div></dl></div>
          <div className="dx-mov-row2">
            {campo('almacen-destino', 'Destino · almacén', <select ref={primeroRef} id="lc-almacen-destino" name="almacen_destino_id" className="dx-mov-field" value={form.almacen_destino_id} onChange={evento => { const siguiente = evento.target.value; setForm(actual => ({ ...actual, almacen_destino_id: siguiente, ubicacion_destino_id: destinos.find(item => item.almacen_id === siguiente)?.id || '' })); setErrores(actual => ({ ...actual, almacen_destino_id: '', ubicacion_destino_id: '' })); }}><option value="">Selecciona…</option>{[...new Set(destinos.map(item => item.almacen_id))].map(id => <option key={id} value={id}>{almacenes.find(item => item.id === id)?.nombre || id}</option>)}</select>, errores.almacen_destino_id)}
            {campo('ubicacion-destino', 'Destino · ubicación normal', <select id="lc-ubicacion-destino" name="ubicacion_destino_id" className="dx-mov-field" value={form.ubicacion_destino_id} onChange={evento => cambia('ubicacion_destino_id', evento.target.value)}><option value="">Selecciona…</option>{destinosAlmacen.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} · ` : ''}{item.nombre || item.codigo || item.id}</option>)}</select>, errores.ubicacion_destino_id, !destinosAlmacen.length ? 'No hay ubicaciones normales activas para este almacén.' : '')}
          </div>
          {campo('cantidad', `Cantidad (${unidad})`, <input ref={!disponible ? primeroRef : undefined} id="lc-cantidad" name="cantidad" inputMode="decimal" className="dx-mov-field" value={form.cantidad} onChange={evento => cambia('cantidad', evento.target.value)} placeholder="0" />, errores.cantidad || (form.cantidad && validacionActual.cantidad), material?.tipo_control === 'serie' ? 'Control por serie: se libera de a 1.' : `Máximo disponible: ${disponible} ${unidad}.`)}
          {campo('motivo', 'Motivo obligatorio', <select id="lc-motivo" name="motivo" className="dx-mov-field" value={form.motivo} onChange={evento => cambia('motivo', evento.target.value)}><option value="">Selecciona un motivo</option>{MOTIVOS.map(item => <option key={item}>{item}</option>)}</select>, errores.motivo || (form.motivo === 'Otro' && !motivoFinal ? 'Especifica el motivo.' : ''))}
          {form.motivo === 'Otro' && campo('otro', 'Especifica el motivo', <input id="lc-otro" name="otro" className="dx-mov-field" maxLength={160} value={otro} onChange={evento => { setOtro(evento.target.value); setErrorServidor(''); }} />, !motivoFinal ? 'Indica un motivo para liberar.' : '')}
          {campo('observacion', 'Observación opcional', <textarea id="lc-observacion" name="observacion" className="dx-mov-field" maxLength={500} value={form.observacion} onChange={evento => cambia('observacion', evento.target.value)} placeholder="Nota para el historial" />)}
          <div className="dx-mov-warn">El stock pasará a una ubicación normal y quedará disponible. Se registrará como transferencia enlazada en Kardex.</div>
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={guardando}>Cancelar</button><button type="submit" className="dx-btn primary" disabled={guardando || Object.keys(validacionActual).length > 0}>{guardando ? 'Liberando…' : 'Liberar stock'}</button></footer>
      </form>
    </section>
  </div>;
}
