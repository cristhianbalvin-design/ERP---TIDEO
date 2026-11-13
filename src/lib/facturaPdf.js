import { jsPDF } from 'jspdf';

export function descargarFacturaPdf({ factura: f, cuenta, sociedad, detracciones = [] }) {
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();
  const dinero = (n) =>
    `${f.moneda || 'PEN'} ${Number(n || 0).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  let y = 18;
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(26, 43, 74).text('TIDEO', 14, y);
  doc
    .setFontSize(13)
    .text('Comprobante', ancho - 14, 16, { align: 'right' })
    .setFontSize(11)
    .text(String(f.numero || '—'), ancho - 14, 22, { align: 'right' });
  doc
    .setFont('helvetica', 'normal')
    .setFontSize(8)
    .setTextColor(107, 114, 128)
    .text(String(sociedad?.razon_social || sociedad?.nombre || ''), 14, 23);
  doc
    .setDrawColor(0, 172, 193)
    .setLineWidth(0.8)
    .line(14, 27, ancho - 14, 27);
  y = 35;
  const linea = (texto) => {
    const lineas = doc.splitTextToSize(String(texto), ancho - 28);
    if (y + lineas.length * 5 > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(lineas, 14, y);
    y += lineas.length * 5 + 2;
  };
  doc.setTextColor(40, 40, 40).setFontSize(10);
  linea(`Sociedad emisora: ${sociedad?.razon_social || sociedad?.nombre || '—'} · RUC: ${sociedad?.ruc || '—'}`);
  linea(`Cliente: ${cuenta?.razon_social || cuenta?.nombre_comercial || '—'} · RUC: ${cuenta?.ruc || '—'}`);
  linea(
    `Emisión: ${f.fecha_emision || '—'} · Vencimiento: ${f.fecha_vencimiento || '—'} · Moneda: ${f.moneda || 'PEN'}`,
  );
  y += 3;
  doc.setFont('helvetica', 'bold');
  linea('Partidas');
  doc.setFont('helvetica', 'normal');
  (f.items || []).forEach((i) =>
    linea(
      `${i.descripcion || '—'} · ${i.cantidad || 0} × ${dinero(i.precio_unitario)} = ` +
        dinero(Number(i.cantidad || 0) * Number(i.precio_unitario || 0)),
    ),
  );
  if (!f.items?.length) linea('Sin partidas registradas.');
  y += 3;
  linea(`Subtotal: ${dinero(f.subtotal)}`);
  linea(`IGV: ${dinero(f.igv)}`);
  doc.setFont('helvetica', 'bold');
  linea(`Total: ${dinero(f.total)}`);
  doc.setFont('helvetica', 'normal');
  if (detracciones.length)
    detracciones.forEach((d) =>
      linea(
        `Detracción ${d.codigo_spot || ''}: ${d.moneda_origen || f.moneda || 'PEN'} ` +
          `${Number(d.monto_detraccion_origen || 0).toFixed(2)} · Depósito PEN ` +
          `${Number(d.monto_detraccion_soles || 0).toFixed(2)} · ${d.estado || ''}`, 
      ),
    );
  else if (f.aplica_detraccion || Number(f.monto_detraccion || 0)) linea(`Detracción: ${dinero(f.monto_detraccion)}`);
  if (f.aplica_retencion) {
    linea(`Retención: ${dinero(f.monto_retencion)}`);
    linea(`Neto cobrable: ${dinero(f.monto_neto_cobrable ?? f.total - (f.monto_retencion || 0))}`);
  }
  y += 5;
  doc.setFontSize(9).setTextColor(107, 114, 128);
  linea('Representación interna. No reemplaza al comprobante electrónico emitido ante SUNAT.');
  doc.save(`${f.numero || 'comprobante'}-representacion-interna.pdf`);
}
