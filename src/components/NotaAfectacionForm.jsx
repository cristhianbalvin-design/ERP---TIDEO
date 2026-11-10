import React, { useEffect, useMemo, useState } from 'react';
import { calcularTotalesNota } from '../pages/facturacion/facturacionFicha.js';

export const MOTIVOS_NOTAS_SUNAT = {
  nota_credito: [
    ['01', 'Anulación de la operación'],
    ['02', 'Anulación por error en el RUC'],
    ['03', 'Corrección por error en la descripción o atención de reclamo respecto de bienes adquiridos o servicios prestados'],
    ['04', 'Descuento global'],
    ['05', 'Descuento por ítem'],
    ['06', 'Devolución total'],
    ['07', 'Devolución por ítem'],
    ['08', 'Bonificación'],
    ['09', 'Disminución en el valor'],
    ['10', 'Otros conceptos'],
    ['11', 'Ajustes de operaciones de exportación'],
    ['12', 'Ajustes afectos al IVAP'],
    ['13', 'Corrección o modificación del monto neto pendiente de pago y/o las fechas de vencimiento y/o los montos de las cuotas'],
  ],
  nota_debito: [
    ['01', 'Intereses por mora'],
    ['02', 'Aumento en el valor'],
    ['03', 'Penalidades/otros conceptos'],
    ['11', 'Ajustes de operaciones de exportación'],
    ['12', 'Ajustes afectos al IVAP'],
  ],
};

const money = (amount, currency = 'PEN') => new Intl.NumberFormat('es-PE', {
  style: 'currency', currency, minimumFractionDigits: 2,
}).format(Number(amount || 0));

export default function NotaAfectacionForm({
  tipoDocumento, facturas = [], cuentaNombre = (id) => id || '—', facturaInicialId = null,
  cxc = [], onEmit, onEstado,
}) {
  const esNC = tipoDocumento === 'nota_credito';
  const documentos = useMemo(() => facturas.filter((f) => (
    ['factura', 'boleta'].includes(f.tipo_documento) && f.estado !== 'anulada'
  )), [facturas]);
  const [busqueda, setBusqueda] = useState('');
  const [origenId, setOrigenId] = useState(facturaInicialId || '');
  const [motivo, setMotivo] = useState('');
  const [items, setItems] = useState([]);
  const [notas, setNotas] = useState('');
  const [devolucion, setDevolucion] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [conIgv, setConIgv] = useState(true);
  const [errores, setErrores] = useState({});
  const origen = documentos.find((f) => f.id === origenId);
  const opciones = documentos.filter((f) => (
    `${f.numero || ''} ${cuentaNombre(f.cuenta_id)} ${f.tipo_documento || ''}`
      .toLowerCase().includes(busqueda.trim().toLowerCase())
  ));
  const igvPct = origen?.subtotal > 0 ? Number(origen.igv || 0) / Number(origen.subtotal) : 0.18;
  const montoNota = esNC
    ? items.filter((item) => item.sel).reduce((sum, item) => sum + Number(item.monto_acreditar || 0), 0)
    : Number(monto || 0);
  const { subtotal, igv, total } = calcularTotalesNota({
    monto: montoNota, igvPct: igvPct * 100, tipoOrigen: origen?.tipo_documento, conIgv: esNC || conIgv,
  });
  const cuenta = cxc.find((row) => row.factura_id === origen?.id);
  const saldo = cuenta ? Number(cuenta.saldo ?? cuenta.monto_total ?? 0) : null;

  useEffect(() => {
    setItems((origen?.items || []).map((item, index) => ({
      id: item.id || `p_${index}`,
      descripcion: item.descripcion || 'Partida sin descripción',
      cantidad: Number(item.cantidad || 0),
      precio_unitario: Number(item.precio_unitario || 0),
      sel: true,
      monto_acreditar: Number(item.cantidad || 0) * Number(item.precio_unitario || 0),
    })));
  }, [origen?.id]);

  useEffect(() => {
    onEstado({ origen, subtotal, igv, total, saldo });
  }, [origen, subtotal, igv, total, saldo, onEstado]);

  const emitir = async (event) => {
    event.preventDefault();
    const nuevos = {};
    if (!origen) nuevos['nota-origen'] = 'Selecciona el comprobante afectado.';
    if (!motivo) nuevos['nota-motivo'] = 'Selecciona un motivo SUNAT.';
    if (!Number.isFinite(total) || total <= 0) {
      nuevos['nota-monto'] = esNC ? 'Selecciona una partida con monto mayor a cero.' : 'Ingresa un monto mayor a cero.';
    }
    setErrores(nuevos);
    const primero = Object.keys(nuevos)[0];
    if (primero) {
      (document.getElementById(primero) || document.getElementById('nota-origen'))?.focus();
      return;
    }
    await onEmit({
      facturaOrigenId: origen.id,
      motivo_codigo: motivo,
      items: esNC ? items.filter((item) => item.sel).map((item) => ({
        descripcion: item.descripcion, cantidad: item.cantidad, precio_unitario: Number(item.monto_acreditar || 0),
      })) : [{ descripcion: concepto || 'Cargo adicional', cantidad: 1, precio_unitario: montoNota }],
      subtotal, igv, total, notas, concepto: concepto || null, devolucion,
    });
  };
  const atributos = (id) => ({
    id, 'aria-invalid': errores[id] ? 'true' : undefined,
    'aria-describedby': errores[id] ? `${id}-error` : undefined,
  });
  const errorCampo = (id) => errores[id] && (
    <span className="dx-ui-field-error" id={`${id}-error`}>{errores[id]}</span>
  );

  return (
    <form id="nota-afectacion-form" onSubmit={emitir} noValidate className="dx-ffi-nota-form">
      <div className="dx-ui-field">
        <label htmlFor="nota-busqueda">Buscar comprobante afectado</label>
        <input id="nota-busqueda" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Serie-número o cliente…" />
      </div>
      <div className="dx-ui-field">
        <label htmlFor="nota-origen">Comprobante afectado <span className="dx-ui-required">*</span></label>
        <select {...atributos('nota-origen')} className="dx-ui-select" value={origenId} onChange={(e) => {
          setOrigenId(e.target.value);
          setMotivo('');
        }}>
          <option value="">Seleccione comprobante…</option>
          {opciones.map((f) => (
            <option key={f.id} value={f.id}>
              {f.numero} — {cuentaNombre(f.cuenta_id)} — {money(f.total, f.moneda)}
            </option>
          ))}
        </select>
        {errorCampo('nota-origen')}
      </div>
      <div className="dx-ui-field">
        <label htmlFor="nota-motivo">Motivo SUNAT <span className="dx-ui-required">*</span></label>
        <select {...atributos('nota-motivo')} className="dx-ui-select" value={motivo}
          onChange={(e) => setMotivo(e.target.value)}>
          <option value="">Seleccione motivo…</option>
          {(MOTIVOS_NOTAS_SUNAT[tipoDocumento] || []).map(([codigo, descripcion]) => (
            <option key={codigo} value={codigo}>{codigo} — {descripcion}</option>
          ))}
        </select>
        {errorCampo('nota-motivo')}
      </div>
      {esNC ? (
        <div className="dx-ui-field">
          <label htmlFor="nota-monto">Partidas a acreditar <span className="dx-ui-required">*</span></label>
          {!items.length && <p>Selecciona un comprobante con partidas registradas.</p>}
          {items.map((item, index) => (
            <div className="dx-ffi-nota-item" key={item.id}>
              <label>
                <input {...(index === 0 ? atributos('nota-monto') : {})} type="checkbox" checked={item.sel}
                  onChange={(e) => setItems((prev) => prev.map((x) => (
                  x.id === item.id ? { ...x, sel: e.target.checked } : x
                )))} /> {item.descripcion} ({money(item.cantidad * item.precio_unitario, origen?.moneda)})
              </label>
              <input aria-label={`Monto de ${item.descripcion}`}
                type="number" min="0" step="0.01" max={item.cantidad * item.precio_unitario}
                disabled={!item.sel} value={item.monto_acreditar} onChange={(e) => setItems((prev) => prev.map((x) => (
                  x.id === item.id ? { ...x, monto_acreditar: e.target.value } : x
                )))} />
            </div>
          ))}
          {!items.length && <span id="nota-monto" tabIndex={-1} />}
          {errorCampo('nota-monto')}
        </div>
      ) : (
        <>
          <div className="dx-ui-field">
            <label htmlFor="nota-concepto">Concepto del cargo</label>
            <input id="nota-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          <div className="dx-ui-field">
            <label htmlFor="nota-monto">
              {origen?.tipo_documento === 'boleta' && conIgv ? 'Monto con IGV' : 'Monto sin IGV'}
              <span className="dx-ui-required"> *</span>
            </label>
            <input {...atributos('nota-monto')} type="number" min="0" step="0.01" value={monto}
              onChange={(e) => setMonto(e.target.value)} />
            {errorCampo('nota-monto')}
          </div>
          <label><input type="checkbox" checked={conIgv} onChange={(e) => setConIgv(e.target.checked)} />
            {' '}Incluir IGV ({Math.round(igvPct * 100)}%)
          </label>
        </>
      )}
      <div className="dx-ui-field">
        <label htmlFor="nota-notas">Notas (opcional)</label>
        <textarea id="nota-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      {esNC && <label><input type="checkbox" checked={devolucion}
        onChange={(e) => setDevolucion(e.target.checked)} /> Esta NC implica devolución de dinero al cliente</label>}
    </form>
  );
}
