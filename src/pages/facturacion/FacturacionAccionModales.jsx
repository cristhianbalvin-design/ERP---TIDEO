import React, { useEffect, useRef, useState } from 'react';
import NotaAfectacionForm from '../../components/NotaAfectacionForm.jsx';
import { calcularTotalesEmision } from './facturacionEmision.js';
import './facturacionFicha.css';

const dinero = (valor, moneda) => `${moneda === 'USD' ? 'US$' : moneda === 'PEN' ? 'S/' : moneda} ${
  Number(valor || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}`;

function Campo({ id, label, requerido, error, children }) {
  return (
    <div className="dx-ui-field">
      <label htmlFor={id}>{label}{requerido && <span className="dx-ui-required"> *</span>}</label>
      {children}
      {error && <span className="dx-ui-field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

const control = (id, errores) => ({
  id,
  'aria-invalid': errores[id] ? 'true' : undefined,
  'aria-describedby': errores[id] ? `${id}-error` : undefined,
});

function Dialogo({ titulo, descripcion, onClose, onSubmit, saving, error, accion, danger, children }) {
  const dialogo = useRef(null);
  useEffect(() => {
    const anterior = document.activeElement;
    dialogo.current?.focus();
    return () => { if (anterior?.isConnected) anterior.focus(); };
  }, []);
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape' && !saving) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onClose, saving]);
  return (
    <div className="dx-ui">
      <div className="dx-ui-overlay" data-ffi-modal="true">
        <form className="dx-ui-dialog" role="dialog" aria-modal="true" aria-label={titulo}
          tabIndex={-1} ref={dialogo} onSubmit={onSubmit} noValidate>
          <div className="dx-ui-dialog-head">
            <div><h2>{titulo}</h2>{descripcion && <p>{descripcion}</p>}</div>
            <button className="dx-btn" type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button>
          </div>
          <div className="dx-ffi-modal-body">{children}</div>
          <div className="dx-ui-dialog-foot">
            {error && <span className="dx-ui-field-error" role="alert">{error}</span>}
            <button className="dx-btn" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className={`dx-btn ${danger ? 'danger' : 'primary'}`} disabled={saving} type="submit">
              {saving ? 'Guardando…' : accion}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function useEnvio(validar, guardar, onClose) {
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    const nuevos = validar();
    setErrores(nuevos);
    setError('');
    const primero = Object.keys(nuevos)[0];
    if (primero) {
      document.getElementById(primero)?.focus();
      return;
    }
    setSaving(true);
    try {
      await guardar();
      onClose();
    } catch (err) {
      setError(err?.message || 'No se pudo completar la operación.');
    } finally {
      setSaving(false);
    }
  };
  return { errores, error, saving, enviar };
}

export function ModalRegistrarCobro({ factura, cxc, hoy, onClose, onGuardar }) {
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [referencia, setReferencia] = useState('');
  const saldo = Number(cxc?.saldo ?? cxc?.monto_total ?? 0);
  const moneda = factura.moneda || 'PEN';
  const { errores, error, saving, enviar } = useEnvio(() => {
    const resultado = {};
    if (!Number.isFinite(Number(monto)) || Number(monto) <= 0) {
      resultado['cobro-monto'] = 'Ingresa un monto mayor a cero.';
    }
    else if (Number(monto) > saldo) resultado['cobro-monto'] = 'El monto no puede superar el saldo pendiente.';
    if (!fecha) resultado['cobro-fecha'] = 'La fecha es obligatoria.';
    return resultado;
  }, () => onGuardar(Number(monto), { fecha, referencia }), onClose);
  return (
    <Dialogo titulo="Registrar cobro" descripcion={`Saldo pendiente: ${dinero(saldo, moneda)}`}
      onClose={onClose} onSubmit={enviar} saving={saving} error={error} accion="Registrar cobro">
      <div className="dx-ui-form-grid is-2">
        <Campo id="cobro-monto" label={`Monto cobrado (${moneda})`} requerido error={errores['cobro-monto']}>
          <input {...control('cobro-monto', errores)} type="number" min="0" step="0.01"
            value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        <Campo id="cobro-fecha" label="Fecha" requerido error={errores['cobro-fecha']}>
          <input {...control('cobro-fecha', errores)} type="date" value={fecha}
            onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo id="cobro-referencia" label="Referencia / Número de operación">
          <input id="cobro-referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)}
            placeholder="N° transferencia, cheque, etc." />
        </Campo>
      </div>
    </Dialogo>
  );
}

export function ModalAnularComprobante({ onClose, onGuardar }) {
  const [motivo, setMotivo] = useState('');
  const { errores, error, saving, enviar } = useEnvio(() => (
    motivo.trim() ? {} : { 'anular-motivo': 'El motivo es obligatorio.' }
  ), () => onGuardar(motivo.trim()), onClose);
  return (
    <Dialogo titulo="Anular comprobante" descripcion="Se anulará el comprobante y la cuenta por cobrar pendiente."
      onClose={onClose} onSubmit={enviar} saving={saving} error={error} accion="Anular comprobante" danger>
      <Campo id="anular-motivo" label="Motivo" requerido error={errores['anular-motivo']}>
        <textarea {...control('anular-motivo', errores)} className="dx-ffi-textarea" rows={3}
          value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describe el motivo…" />
      </Campo>
    </Dialogo>
  );
}

export function ModalEditarComprobante({ factura, hoy, calcularVencimiento, onClose, onGuardar }) {
  const directa = !factura.valorizacion_id;
  const [form, setForm] = useState({
    numero: factura.numero || '',
    fecha_emision: factura.fecha_emision || hoy,
    condicion_pago: factura.condicion_pago || '30 días',
    fecha_vencimiento: factura.fecha_vencimiento || '',
    moneda: factura.moneda || 'PEN',
    glosa: factura.glosa || '',
    notas: factura.notas || '',
  });
  const [items, setItems] = useState(() => (factura.items || []).length
    ? factura.items.map((item, i) => ({ ...item, id: item.id || `ep_${i}` }))
    : [{ id: Date.now(), descripcion: '', cantidad: 1, precio_unitario: '' }]);
  const [igvPct, setIgvPct] = useState(() => factura.subtotal > 0
    ? Math.round(((factura.igv || 0) / factura.subtotal) * 100) : 18);
  const totales = calcularTotalesEmision({ partidas: items, igvPct, esBoleta: factura.tipo_documento === 'boleta' });
  const actualizar = (cambios) => setForm((prev) => ({ ...prev, ...cambios }));
  const cambiarItem = (id, cambios) => setItems((prev) => prev.map((item) => (
    item.id === id ? { ...item, ...cambios } : item
  )));
  const { errores, error, saving, enviar } = useEnvio(() => {
    const resultado = {};
    if (!form.numero.trim()) resultado['editar-numero'] = 'El número de factura es obligatorio.';
    if (directa && items.every((item) => !item.descripcion && !item.precio_unitario)) {
      resultado['editar-partidas'] = 'Agrega al menos una partida.';
    }
    return resultado;
  }, () => onGuardar({
    ...form,
    ...(directa && { items, subtotal: totales.subtotal, igv: totales.igv, total: totales.total }),
  }), onClose);
  return (
    <Dialogo titulo="Editar comprobante" descripcion={directa ? 'Comprobante directo' : 'Desde valorización'}
      onClose={onClose} onSubmit={enviar} saving={saving} error={error} accion="Guardar cambios">
      {!directa && <p>Los importes de una valorización se corrigen mediante una nota de crédito o débito.</p>}
      <div className="dx-ui-form-grid is-2">
        <Campo id="editar-numero" label="N° Factura" requerido error={errores['editar-numero']}>
          <input {...control('editar-numero', errores)} value={form.numero}
            onChange={(e) => actualizar({ numero: e.target.value })} />
        </Campo>
        <Campo id="editar-emision" label="Fecha de emisión">
          <input id="editar-emision" type="date" value={form.fecha_emision} onChange={(e) => actualizar({
            fecha_emision: e.target.value,
            fecha_vencimiento: calcularVencimiento(e.target.value, form.condicion_pago),
          })} />
        </Campo>
        <Campo id="editar-condicion" label="Condición de pago">
          <select id="editar-condicion" className="dx-ui-select" value={form.condicion_pago}
            onChange={(e) => actualizar({ condicion_pago: e.target.value,
              fecha_vencimiento: calcularVencimiento(form.fecha_emision, e.target.value) })}>
            {['contado', 'anticipado', '15 días', '30 días', '45 días', '60 días', '90 días'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Campo>
        <Campo id="editar-vencimiento" label="Fecha de vencimiento">
          <input id="editar-vencimiento" type="date" value={form.fecha_vencimiento}
            onChange={(e) => actualizar({ fecha_vencimiento: e.target.value })} />
        </Campo>
        <Campo id="editar-moneda" label="Moneda">
          <select id="editar-moneda" className="dx-ui-select" value={form.moneda}
            onChange={(e) => actualizar({ moneda: e.target.value })}>
            <option value="PEN">S/ Soles</option><option value="USD">US$ Dólares</option>
          </select>
        </Campo>
        {directa && <Campo id="editar-igv" label="IGV %">
          <input id="editar-igv" type="number" min="0" max="30" step="1" value={igvPct}
            onChange={(e) => setIgvPct(Number(e.target.value))} />
        </Campo>}
        <Campo id="editar-glosa" label="Glosa">
          <input id="editar-glosa" value={form.glosa} onChange={(e) => actualizar({ glosa: e.target.value })} />
        </Campo>
        <Campo id="editar-notas" label="Notas">
          <input id="editar-notas" value={form.notas} onChange={(e) => actualizar({ notas: e.target.value })} />
        </Campo>
      </div>
      {directa && <div className="dx-ffi-modal-items">
        <div id="editar-partidas" tabIndex={-1}><b>Partidas <span className="dx-ui-required">*</span></b></div>
        {errores['editar-partidas'] && <span className="dx-ui-field-error">{errores['editar-partidas']}</span>}
        {items.map((item, i) => <div className="dx-ui-form-grid is-2" key={item.id}>
          <Campo id={`editar-descripcion-${i}`} label="Descripción">
            <input id={`editar-descripcion-${i}`} value={item.descripcion || ''}
              onChange={(e) => cambiarItem(item.id, { descripcion: e.target.value })} />
          </Campo>
          <Campo id={`editar-cantidad-${i}`} label="Cantidad">
            <input id={`editar-cantidad-${i}`} type="number" min="0" step="any" value={item.cantidad}
              onChange={(e) => cambiarItem(item.id, { cantidad: e.target.value })} />
          </Campo>
          <Campo id={`editar-precio-${i}`} label="Precio unitario">
            <input id={`editar-precio-${i}`} type="number" min="0" step="any" value={item.precio_unitario}
              onChange={(e) => cambiarItem(item.id, { precio_unitario: e.target.value })} />
          </Campo>
          {items.length > 1 && <button className="dx-btn" type="button"
            onClick={() => setItems((prev) => prev.filter((p) => p.id !== item.id))}>Quitar partida</button>}
        </div>)}
        <button className="dx-btn" type="button" onClick={() => setItems((prev) => [
          ...prev, { id: Date.now(), descripcion: '', cantidad: 1, precio_unitario: '' },
        ])}>Agregar partida</button>
        {['subtotal', 'igv', 'total'].map((clave) => <div key={clave}>
          {clave === 'igv' ? 'IGV' : clave === 'total' ? 'Total' : 'Subtotal'}: {dinero(totales[clave], form.moneda)}
        </div>)}
      </div>}
    </Dialogo>
  );
}

export function ModalNotaAfectacion({ tipoDocumento, facturas, cuentaNombre, facturaInicialId, cxc, onClose, onEmit }) {
  const dialogo = useRef(null);
  const [resumen, setResumen] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const esNC = tipoDocumento === 'nota_credito';
  const titulo = esNC ? 'Nota de crédito' : 'Nota de débito';
  const origen = resumen.origen;
  const moneda = origen?.moneda || 'PEN';
  useEffect(() => {
    const anterior = document.activeElement;
    dialogo.current?.focus();
    return () => { if (anterior?.isConnected) anterior.focus(); };
  }, []);
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape' && !saving) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onClose, saving]);
  const emitir = async (datos) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onEmit(datos);
    } catch (err) {
      setError(err?.message || 'No se pudo emitir la nota.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="dx-ui">
      <div className="dx-ui-overlay" data-ffi-modal="true">
        <div className="dx-ui-dialog dx-ui-dialog-wide" role="dialog" aria-modal="true" aria-label={titulo}
          tabIndex={-1} ref={dialogo}>
          <div className="dx-ui-dialog-head">
            <div>
              <h2>{titulo}</h2>
              <p>{origen ? `Afecta a ${origen.numero} · ${cuentaNombre(origen.cuenta_id)} · ${moneda}`
                : 'Selecciona el comprobante afectado.'}</p>
            </div>
            <button className="dx-btn" type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button>
          </div>
          <div className="dx-ffi-modal-body dx-ffi-nota-layout">
            <NotaAfectacionForm tipoDocumento={tipoDocumento} facturas={facturas} cuentaNombre={cuentaNombre}
              facturaInicialId={facturaInicialId} cxc={cxc} onEmit={emitir} onEstado={setResumen} />
            <aside className="dx-ffi-nota-aside">
              <h3>Resumen de la nota</h3>
              {[
                ['Base', resumen.subtotal], ['IGV', resumen.igv], ['Total de la nota', resumen.total],
                ['Saldo actual', resumen.saldo],
                ['Saldo tras la nota', resumen.saldo == null ? null : Math.max(0,
                  resumen.saldo + (esNC ? -1 : 1) * (resumen.total || 0))],
              ].map(([label, valor]) => (
                <div key={label}><span>{label}</span><b>{valor == null ? 'Sin dato' : dinero(valor, moneda)}</b></div>
              ))}
            </aside>
          </div>
          <div className="dx-ui-dialog-foot">
            {error && <span className="dx-ui-field-error" role="alert">{error}</span>}
            <button className="dx-btn" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="dx-btn primary" type="submit" form="nota-afectacion-form" disabled={saving}>
              {saving ? 'Emitiendo…' : `Emitir ${esNC ? 'NC' : 'ND'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
