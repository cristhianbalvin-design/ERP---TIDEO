import { useEffect, useMemo, useRef, useState } from 'react';
import { MOTIVOS_MOVIMIENTO, calcularDiferenciaAjuste, validarMovimiento } from './inventarioMovimientosLogic.js';

const FORM_INICIAL = { material_id: '', almacen_id: '', ubicacion_id: '', stock_id: '', motivo: '', cantidad: '', conteo: '', costo_unitario: '', moneda: 'PEN', lote: '', serie: '', vencimiento: '', nro_documento: '', observacion: '' };
const numero = value => Number(String(value ?? '').replace(',', '.')) || 0;

export function MovimientoPanel({ accion, materiales, almacenes, ubicaciones, stock, sociedades = [], initialMaterialId = '', sociedadId, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({ ...FORM_INICIAL, material_id: initialMaterialId, motivo: Object.keys(MOTIVOS_MOVIMIENTO[accion])[0] || '', sociedad_id: sociedadId || '' }));
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef(null);
  const primeroRef = useRef(null);
  const envioRef = useRef(false);
  const material = materiales.find(item => item.id === form.material_id);
  const filasMaterial = useMemo(() => stock.filter(item => item.material_id === material?.id), [stock, material]);
  const fila = filasMaterial.find(item => item.id === form.stock_id) || filasMaterial.find(item => item.ubicacion_id === form.ubicacion_id && item.almacen_id === form.almacen_id);
  const ubicacion = ubicaciones.find(item => item.id === form.ubicacion_id) || fila?.ubicaciones;
  const ubicacionesAlmacen = ubicaciones.filter(item => item.almacen_id === form.almacen_id);
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
    const validacion = validarMovimiento({ ...form, accion }, { material, stock: filasMaterial, ubicacion });
    setErrores(validacion);
    if (Object.keys(validacion).length) {
      const campo = Object.keys(validacion)[0];
      const enfocar = () => panelRef.current?.querySelector(`[name="${campo}"]`)?.focus();
      if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(enfocar);
      else globalThis.setTimeout(enfocar, 0);
      return;
    }
    envioRef.current = true; setGuardando(true);
    try { await onSubmit({ ...form, sociedad_id: fila?.sociedad_id || sociedadId || form.sociedad_id || null, cantidad: accion === 'ajuste' ? form.conteo : form.cantidad, costo_unitario: form.costo_unitario === '' ? null : numero(form.costo_unitario), lote: form.lote.trim() || fila?.lote || null, serie: form.serie.trim() || fila?.serie || null, nro_documento: form.nro_documento.trim() || null, observacion: form.observacion.trim() || null }); }
    catch (error) { setErrorServidor(error?.message || 'No se pudo registrar el movimiento.'); }
    finally { envioRef.current = false; setGuardando(false); }
  };

  const costoObligatorio = accion === 'entrada' && ['saldo_inicial', 'compra_directa_sin_oc'].includes(form.motivo);
  const diferencia = calcularDiferenciaAjuste(form.conteo, fila?.fisico ?? fila?.disponible);
  const titulo = { entrada: 'Registrar entrada', salida: 'Registrar salida', ajuste: 'Ajustar stock' }[accion];
  const campo = (id, label, content, error, ayuda) => <div className="dx-mov-f"><label htmlFor={`mov-${id}`}>{label}</label>{content}{error && <small className="bad" role="alert">{error}</small>}{!error && ayuda && <small>{ayuda}</small>}</div>;
  const selectMaterial = <select ref={primeroRef} id="mov-material" name="material_id" className="dx-mov-field" value={form.material_id} onChange={evento => { cambia('material_id', evento.target.value); cambia('stock_id', ''); cambia('almacen_id', ''); cambia('ubicacion_id', ''); }}><option value="">Selecciona…</option>{materiales.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.descripcion}</option>)}</select>;

  return <div className="dx-mov-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget && !guardando) onClose(); }}>
    <section ref={panelRef} className="dx-mov-panel" role="dialog" aria-modal="true" aria-labelledby="mov-panel-titulo" onKeyDown={evento => {
      if (evento.key !== 'Tab') return;
      const focuseables = [...(panelRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || [])];
      const first = focuseables[0], last = focuseables[focuseables.length - 1];
      if (evento.shiftKey && globalThis.document?.activeElement === first) { evento.preventDefault(); last?.focus(); }
      else if (!evento.shiftKey && globalThis.document?.activeElement === last) { evento.preventDefault(); first?.focus(); }
    }}>
      <header><h2 id="mov-panel-titulo">{titulo}</h2><button type="button" className="dx-mov-x" aria-label="Cerrar" onClick={onClose} disabled={guardando}>×</button></header>
      <form onSubmit={enviar}>
        <div className="dx-mov-body">
          {errorServidor && <div className="dx-mov-alert" role="alert">{errorServidor}</div>}
          {!sociedadId && !fila?.sociedad_id && sociedades.length > 0 && campo('sociedad', 'Sociedad', <select id="mov-sociedad" name="sociedad_id" className="dx-mov-field" value={form.sociedad_id} onChange={evento => cambia('sociedad_id', evento.target.value)}><option value="">Selecciona…</option>{sociedades.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>, !form.sociedad_id ? 'Selecciona la sociedad donde se registrará el movimiento.' : '')}
          {campo('motivo', 'Motivo', <select id="mov-motivo" name="motivo" className="dx-mov-field" value={form.motivo} onChange={evento => cambia('motivo', evento.target.value)}>{Object.entries(MOTIVOS_MOVIMIENTO[accion]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>, errores.motivo, accion === 'salida' ? 'Los consumos de OT y despachos se registran desde su flujo.' : '')}
          {campo('material', 'Material', selectMaterial, errores.material_id)}
          {accion === 'entrada' ? <>
            <div className="dx-mov-row2">
              {campo('almacen', 'Almacén', <select id="mov-almacen" name="almacen_id" className="dx-mov-field" value={form.almacen_id} onChange={evento => { cambia('almacen_id', evento.target.value); cambia('ubicacion_id', ''); }}><option value="">Selecciona…</option>{almacenes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>, errores.almacen_id)}
              {campo('ubicacion', 'Ubicación', <select id="mov-ubicacion" name="ubicacion_id" className="dx-mov-field" value={form.ubicacion_id} onChange={evento => cambia('ubicacion_id', evento.target.value)}><option value="">Selecciona…</option>{ubicacionesAlmacen.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}{item.uso !== 'almacenaje' ? ` (${item.uso})` : ''}</option>)}</select>, errores.ubicacion_id)}
            </div>
            {material?.tipo_control === 'lote' && <div className="dx-mov-row2">{campo('lote', 'Lote', <input id="mov-lote" name="lote" className="dx-mov-field" value={form.lote} maxLength={60} onChange={evento => cambia('lote', evento.target.value)} placeholder="Ej. L-1020" />, errores.lote)}{campo('vencimiento', 'Vencimiento (opcional)', <input id="mov-vencimiento" name="vencimiento" type="date" className="dx-mov-field" value={form.vencimiento} onChange={evento => cambia('vencimiento', evento.target.value)} />)}</div>}
            {material?.tipo_control === 'serie' && campo('serie', 'Número de serie', <input id="mov-serie" name="serie" className="dx-mov-field" value={form.serie} onChange={evento => cambia('serie', evento.target.value)} />, errores.serie)}
            <div className="dx-mov-row2">
              {campo('cantidad', `Cantidad${material ? ` (${material.unidad})` : ''}`, <input id="mov-cantidad" name="cantidad" inputMode="decimal" className="dx-mov-field" value={form.cantidad} onChange={evento => cambia('cantidad', evento.target.value)} placeholder="0" />, errores.cantidad)}
              {campo('costo', `Costo unitario${costoObligatorio ? ' (obligatorio)' : ''}`, <input id="mov-costo" name="costo_unitario" inputMode="decimal" className="dx-mov-field" value={form.costo_unitario} onChange={evento => cambia('costo_unitario', evento.target.value)} placeholder={String(material?.costo_promedio || '0.00')} />, errores.costo_unitario, !costoObligatorio ? 'Vacío = usa el costo promedio actual.' : '')}
            </div>
            {campo('moneda', 'Moneda del costo', <select id="mov-moneda" name="moneda" className="dx-mov-field" value={form.moneda} onChange={evento => cambia('moneda', evento.target.value)}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>)}
            {form.motivo === 'compra_directa_sin_oc' && campo('documento', 'Documento de la compra', <input id="mov-documento" name="nro_documento" className="dx-mov-field" value={form.nro_documento} maxLength={80} onChange={evento => cambia('nro_documento', evento.target.value)} placeholder="Ej. F001-004512" />, errores.nro_documento)}
            {campo('observacion', 'Observación (opcional)', <textarea id="mov-observacion" name="observacion" className="dx-mov-field" value={form.observacion} maxLength={200} onChange={evento => cambia('observacion', evento.target.value)} />)}
          </> : <>
            {campo('stock', 'Ubicación y lote', <select id="mov-stock" name="stock_id" className="dx-mov-field" value={form.stock_id} onChange={evento => { const item = filasMaterial.find(value => value.id === evento.target.value); setForm(actual => ({ ...actual, stock_id: item?.id || '', almacen_id: item?.almacen_id || '', ubicacion_id: item?.ubicacion_id || '', lote: item?.lote || '', serie: item?.serie || '' })); setErrores(actual => ({ ...actual, stock_id: '' })); }}><option value="">Selecciona…</option>{filasMaterial.map(item => <option key={item.id} value={item.id}>{item.ubicaciones?.nombre || item.ubicacion_id} · lote {item.lote || '—'} · {Math.max(numero(item.disponible ?? (numero(item.fisico) - numero(item.reservado))), 0)} libres</option>)}</select>, errores.stock_id, fila?.reservado ? `${fila.reservado} reservados no se pueden sacar.` : '')}
            {accion === 'salida' ? <>
              {material?.tipo_control === 'serie' && campo('serie', 'Número de serie', <input id="mov-serie" name="serie" className="dx-mov-field" value={form.serie} onChange={evento => cambia('serie', evento.target.value)} />, errores.serie)}
              {campo('cantidad', `Cantidad${material ? ` (${material.unidad})` : ''}`, <input id="mov-cantidad" name="cantidad" inputMode="decimal" className="dx-mov-field" value={form.cantidad} onChange={evento => cambia('cantidad', evento.target.value)} placeholder="0" />, errores.cantidad)}
            </> : <div className="dx-mov-row2">{campo('sistema', 'Cantidad en sistema', <div className="dx-mov-ro">{fila ? `${fila.fisico ?? fila.disponible} ${material?.unidad || ''}` : '—'}</div>)}{campo('conteo', 'Cantidad contada', <input id="mov-conteo" name="conteo" inputMode="decimal" className="dx-mov-field" value={form.conteo} onChange={evento => cambia('conteo', evento.target.value)} placeholder="0" />, errores.conteo)}</div>}
            {campo('observacion', 'Observación', <textarea id="mov-observacion" name="observacion" className="dx-mov-field" value={form.observacion} maxLength={200} onChange={evento => cambia('observacion', evento.target.value)} />, errores.observacion, 'Queda en el historial del movimiento.')}
          </>}
          {accion === 'ajuste' && fila && <div className="dx-mov-sum"><small>Resultado del conteo</small><div><span>En sistema</span><b>{fila.fisico ?? fila.disponible} {material?.unidad}</b></div><div><span>Diferencia</span><b>{diferencia > 0 ? '+' : ''}{diferencia ?? '—'}</b></div><div><span>Se registrará</span><b>{diferencia > 0 ? 'Entrada por ajuste' : diferencia < 0 ? 'Salida por ajuste' : '—'}</b></div></div>}
          {(accion === 'entrada' && ubicacion?.uso && ubicacion.uso !== 'almacenaje') && <div className="dx-mov-warn">Esta ubicación es de {ubicacion.uso}: el stock entra como físico, pero no queda disponible hasta liberarlo.</div>}
          {(accion !== 'entrada' && fila?.ubicaciones?.uso && fila.ubicaciones.uso !== 'almacenaje') && <div className="dx-mov-warn">Desde {fila.ubicaciones.uso} solo se permiten motivos Merma o Devolución a proveedor, o ajuste por conteo.</div>}
          {!sociedadId && !fila?.sociedad_id && !sociedades.length && <div className="dx-mov-alert" role="alert">No hay una sociedad concreta en alcance para registrar movimientos.</div>}
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={guardando}>Cancelar</button><button type="submit" className="dx-btn primary" disabled={guardando || (!sociedadId && !fila?.sociedad_id && !form.sociedad_id)}>{guardando ? 'Registrando…' : accion === 'ajuste' ? 'Aplicar ajuste' : accion === 'salida' ? 'Registrar salida' : 'Registrar entrada'}</button></footer>
      </form>
    </section>
  </div>;
}
