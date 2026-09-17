import React, { useEffect, useMemo, useState } from 'react';

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

const tipoLabel = tipo => tipo === 'nota_credito' ? 'Nota de Crédito' : 'Nota de Débito';
const money = (amount, currency = 'PEN') => new Intl.NumberFormat('es-PE', {
  style: 'currency', currency, minimumFractionDigits: 2,
}).format(Number(amount || 0));

export default function NotaAfectacionForm({
  tipoDocumento,
  facturas = [],
  cuentaNombre = id => id || '—',
  onCancel,
  onEmit,
  facturaInicialId = null,
  saving = false,
}) {
  const esNC = tipoDocumento === 'nota_credito';
  const documentosAfectables = useMemo(() => (facturas || []).filter(f => (
    ['factura', 'boleta'].includes(f.tipo_documento) && f.estado !== 'anulada'
  )), [facturas]);
  const [busqueda, setBusqueda] = useState('');
  const [origenId, setOrigenId] = useState(facturaInicialId || '');
  const [motivoCodigo, setMotivoCodigo] = useState('');
  const [itemsSeleccionados, setItemsSeleccionados] = useState([]);
  const [notas, setNotas] = useState('');
  const [devolucion, setDevolucion] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [conIgv, setConIgv] = useState(true);
  const [error, setError] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);

  const facOrigen = documentosAfectables.find(f => f.id === origenId) || null;
  const opcionesOrigen = documentosAfectables.filter(f => {
    const texto = `${f.numero || ''} ${cuentaNombre(f.cuenta_id)} ${f.tipo_documento || ''}`.toLowerCase();
    return !busqueda.trim() || texto.includes(busqueda.trim().toLowerCase());
  });
  const igvPctOrigen = facOrigen?.subtotal > 0
    ? Number(facOrigen.igv || 0) / Number(facOrigen.subtotal)
    : 0.18;
  const subtotalNC = Math.round(itemsSeleccionados.filter(item => item.sel)
    .reduce((sum, item) => sum + Number(item.monto_acreditar || 0), 0) * 100) / 100;
  const igvNC = Math.round(subtotalNC * igvPctOrigen * 100) / 100;
  const subtotalND = Number(monto || 0);
  const igvND = conIgv ? Math.round(subtotalND * igvPctOrigen * 100) / 100 : 0;
  const subtotal = esNC ? subtotalNC : subtotalND;
  const igv = esNC ? igvNC : igvND;
  const total = Math.round((subtotal + igv) * 100) / 100;

  useEffect(() => {
    if (!facOrigen) {
      setItemsSeleccionados([]);
      return;
    }
    setItemsSeleccionados((facOrigen.items || []).map((item, index) => ({
      id: item.id || `p_${index}`,
      descripcion: item.descripcion || 'Partida sin descripción',
      cantidad: Number(item.cantidad || 0),
      precio_unitario: Number(item.precio_unitario || 0),
      sel: true,
      monto_acreditar: Number(item.cantidad || 0) * Number(item.precio_unitario || 0),
    })));
  }, [facOrigen?.id]);

  const seleccionarOrigen = id => {
    setOrigenId(id);
    setMotivoCodigo('');
    setError('');
  };

  const emitir = async () => {
    setError('');
    if (!facOrigen) { setError('Selecciona el comprobante afectado.'); return; }
    if (!motivoCodigo) { setError('Selecciona un motivo SUNAT.'); return; }
    if (total <= 0) { setError(esNC ? 'Selecciona una partida con monto mayor a cero.' : 'Ingresa un monto mayor a cero.'); return; }
    if (emitiendo) return;
    setEmitiendo(true);
    try {
      await onEmit({
        facturaOrigenId: facOrigen.id,
        motivo_codigo: motivoCodigo,
        items: esNC
          ? itemsSeleccionados.filter(item => item.sel).map(item => ({
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: Number(item.monto_acreditar || 0),
          }))
          : [{ descripcion: concepto || 'Cargo adicional', cantidad: 1, precio_unitario: subtotalND }],
        subtotal,
        igv,
        total,
        notas,
        concepto: concepto || null,
        devolucion,
      });
    } catch (e) {
      setError(e?.message || 'No se pudo emitir la nota.');
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <>
      <div className="page-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{ marginBottom: 10, padding: 0, color: 'var(--cyan)' }}>
            ← Volver
          </button>
          <h1 className="page-title">{tipoLabel(tipoDocumento)}</h1>
          <div className="page-sub">Selecciona el comprobante que será afectado.</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={saving || emitiendo}>Cancelar</button>
          <button className="btn btn-primary" onClick={emitir} disabled={saving || emitiendo || !facOrigen || !motivoCodigo || total <= 0}>
            {saving || emitiendo ? 'Emitiendo...' : `Emitir ${esNC ? 'NC' : 'ND'}`}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginTop: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginTop: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-body">
            <div className="input-group">
              <label>Buscar comprobante afectado <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Serie-número o cliente..." />
            </div>
            <div className="input-group" style={{ marginTop: 12 }}>
              <label>Comprobante afectado</label>
              <select className="select" value={origenId} onChange={e => seleccionarOrigen(e.target.value)}>
                <option value="">Seleccione comprobante...</option>
                {opcionesOrigen.map(f => <option key={f.id} value={f.id}>{f.numero} — {cuentaNombre(f.cuenta_id)} — {money(f.total, f.moneda)}</option>)}
              </select>
            </div>
            {facOrigen && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--bg-subtle)', fontSize: 12, display: 'grid', gap: 5 }}>
                <div><strong>Documento:</strong> {facOrigen.numero}</div>
                <div><strong>Cliente:</strong> {cuentaNombre(facOrigen.cuenta_id)}</div>
                <div><strong>Moneda:</strong> {facOrigen.moneda || 'PEN'}</div>
                <div><strong>OS:</strong> {facOrigen.os_cliente_id || '—'}</div>
                <div><strong>CEBE:</strong> {facOrigen.centro_beneficio_id || '—'}</div>
                <div><strong>Total original:</strong> {money(facOrigen.total, facOrigen.moneda)}</div>
              </div>
            )}
          </div>

          <div className="card card-body">
            <div className="input-group">
              <label>Motivo SUNAT <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select className="select" value={motivoCodigo} onChange={e => setMotivoCodigo(e.target.value)}>
                <option value="">Seleccione motivo...</option>
                {(MOTIVOS_NOTAS_SUNAT[tipoDocumento] || []).map(([codigo, descripcion]) => (
                  <option key={codigo} value={codigo}>{codigo} — {descripcion}</option>
                ))}
              </select>
            </div>
          </div>

          {esNC ? (
            <div className="card">
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>Partidas a acreditar</h3>
              </div>
              {!facOrigen ? <div className="card-body text-muted">Selecciona primero el comprobante afectado.</div> : itemsSeleccionados.length === 0 ? (
                <div className="card-body text-muted">El comprobante no tiene partidas registradas.</div>
              ) : <div className="table-wrap"><table className="tbl"><thead><tr><th></th><th>Descripción</th><th className="num">Original</th><th>Monto NC</th></tr></thead><tbody>
                {itemsSeleccionados.map(item => <tr key={item.id} style={{ opacity: item.sel ? 1 : 0.5 }}>
                  <td><input type="checkbox" checked={item.sel} onChange={e => setItemsSeleccionados(prev => prev.map(x => x.id === item.id ? { ...x, sel: e.target.checked } : x))} /></td>
                  <td>{item.descripcion}</td>
                  <td className="num">{money(item.cantidad * item.precio_unitario, facOrigen?.moneda)}</td>
                  <td><input className="input num" type="number" min="0" step="0.01" max={item.cantidad * item.precio_unitario} disabled={!item.sel} value={item.monto_acreditar} onChange={e => setItemsSeleccionados(prev => prev.map(x => x.id === item.id ? { ...x, monto_acreditar: e.target.value } : x))} /></td>
                </tr>)}
              </tbody></table></div>}
            </div>
          ) : (
            <div className="card card-body">
              <div className="input-group"><label>Concepto del cargo</label><input className="input" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Describe el cargo adicional..." /></div>
              <div className="grid-2" style={{ gap: 16, marginTop: 12 }}>
                <div className="input-group"><label>Monto sin IGV <span style={{ color: 'var(--danger)' }}>*</span></label><input className="input num" type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} /></div>
                <div className="input-group"><label>IGV</label><label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36 }}><input type="checkbox" checked={conIgv} onChange={e => setConIgv(e.target.checked)} /> Incluir IGV ({Math.round(igvPctOrigen * 100)}%)</label></div>
              </div>
            </div>
          )}

          <div className="input-group"><label>Notas (opcional)</label><textarea className="input" rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones adicionales..." /></div>
          {esNC && (
            <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={devolucion} onChange={e => setDevolucion(e.target.checked)} />
                Esta NC implica devolución de dinero al cliente
              </label>
              {devolucion && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--orange)' }}>Se registrará una obligación de pago vinculada a la NC.</div>}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '16px 20px', alignSelf: 'start' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 8 }}>Resumen {esNC ? 'NC' : 'ND'}</div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><span className="text-muted">Subtotal</span><span className="num">{money(subtotal, facOrigen?.moneda)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><span className="text-muted">IGV</span><span className="num">{money(igv, facOrigen?.moneda)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: 16 }}><span>Total</span><span className="num">{money(total, facOrigen?.moneda)}</span></div>
          {facOrigen && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-muted)' }}>La operación ajustará la CxC original y no creará una CxC propia para la nota.</div>}
        </div>
      </div>
    </>
  );
}
