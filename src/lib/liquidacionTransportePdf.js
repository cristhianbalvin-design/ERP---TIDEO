// Prefactura de la liquidación de transporte (marca TIDEO), para enviar al cliente y recoger su conformidad.
import { jsPDF } from 'jspdf';
import { fechaLima } from './transporteLogistica.js';

const NAVY = [26, 43, 74];
const CYAN = [0, 172, 193];
const GRIS = [107, 114, 128];
const LINEA = [228, 231, 235];

const dinero = (valor, moneda = 'PEN') => `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(valor || 0)
  .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = valor => {
  const iso = fechaLima(valor) || String(valor || '').slice(0, 10);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const horas = minutos => `${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`;

export function recargosTexto(linea, moneda) {
  const partes = [];
  if (Number(linea.espera_monto) > 0) partes.push(`espera ${horas(linea.espera_minutos_cobrables)} x ${dinero(linea.espera_precio_hora, moneda)}/h`);
  if (Number(linea.peajes) > 0) partes.push(`peajes ${dinero(linea.peajes, moneda)}`);
  (linea.cargos || []).filter(c => c.tipo !== 'costo').forEach(c => partes.push(`${c.tipo === 'descuento' ? 'descuento' : c.descripcion} ${c.tipo === 'descuento' ? '-' : ''}${dinero(c.monto, moneda)}`));
  return partes.join(' · ');
}

export function generarPrefacturaPdf({ liquidacion, empresa }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const moneda = liquidacion.moneda;
  const cliente = liquidacion.cuenta?.razon_social || liquidacion.cuenta?.nombre_comercial || '';
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY).text('TIDEO', 14, 18);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS).text(empresa || '', 14, 23);
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...NAVY).text('Prefactura de transporte', ancho - 14, 16, { align: 'right' });
  doc.setFontSize(11).text(liquidacion.numero, ancho - 14, 22, { align: 'right' });
  doc.setDrawColor(...CYAN).setLineWidth(0.8).line(14, 27, ancho - 14, 27);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(40, 40, 40);
  doc.text(`Cliente: ${cliente}${liquidacion.cuenta?.ruc ? ` · RUC ${liquidacion.cuenta.ruc}` : ''}`, 14, 34);
  doc.text(`Período: ${fecha(liquidacion.periodo_desde)} al ${fecha(liquidacion.periodo_hasta)}`, 14, 39);

  const col = { viaje: 14, ruta: 44, flete: 128, rec: 158, imp: ancho - 14 };
  let y = 48;
  const cabecera = () => {
    doc.setFillColor(248, 249, 250).rect(14, y - 4.5, ancho - 28, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...GRIS);
    doc.text('Viaje', col.viaje + 1, y); doc.text('Ruta y carga', col.ruta, y);
    doc.text('Flete', col.flete + 26, y, { align: 'right' }); doc.text('Recargos', col.rec + 22, y, { align: 'right' });
    doc.text('Importe', col.imp, y, { align: 'right' });
    y += 6;
  };
  cabecera();
  liquidacion.lineas.forEach(linea => {
    const v = linea.viaje || {};
    const ruta = doc.splitTextToSize(`${v.origen_nombre || ''} a ${v.destino_nombre || ''}`, col.flete - col.ruta - 4);
    const carga = doc.splitTextToSize(v.carga_descripcion || '', col.flete - col.ruta - 4);
    const detalle = doc.splitTextToSize(recargosTexto(linea, moneda), ancho - 28 - (col.ruta - 14));
    const alto_ = Math.max(ruta.length + carga.length, 2) * 4 + (detalle.length ? detalle.length * 3.6 + 1 : 0) + 3;
    if (y + alto_ > alto - 60) { doc.addPage(); y = 20; cabecera(); }
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...NAVY).text(v.codigo || '', col.viaje + 1, y);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS).text(fecha(v.fecha_programada), col.viaje + 1, y + 4);
    doc.setFontSize(9).setTextColor(40, 40, 40).text(ruta, col.ruta, y);
    doc.setFontSize(8).setTextColor(...GRIS).text(carga, col.ruta, y + ruta.length * 4);
    doc.setFontSize(9).setTextColor(40, 40, 40);
    doc.text(dinero(linea.flete, moneda), col.flete + 26, y, { align: 'right' });
    doc.text(dinero(Number(linea.ingreso) - Number(linea.flete), moneda), col.rec + 22, y, { align: 'right' });
    doc.setFont('helvetica', 'bold').text(dinero(linea.ingreso, moneda), col.imp, y, { align: 'right' });
    let yy = y + Math.max(ruta.length + carga.length, 2) * 4;
    if (detalle.length) { doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS).text(detalle, col.ruta, yy); yy += detalle.length * 3.6; }
    doc.setDrawColor(...LINEA).setLineWidth(0.2).line(14, yy + 0.5, ancho - 14, yy + 0.5);
    y = yy + 5;
  });

  if (y > alto - 70) { doc.addPage(); y = 24; }
  const xl = ancho - 84;
  const fila = (texto, valor, negrita) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(negrita ? 11 : 9).setTextColor(...(negrita ? NAVY : [40, 40, 40]));
    doc.text(texto, xl, y); doc.text(valor, ancho - 14, y, { align: 'right' }); y += negrita ? 7 : 5.5;
  };
  y += 2;
  fila('Subtotal', dinero(liquidacion.subtotal, moneda));
  fila('IGV 18%', dinero(liquidacion.igv, moneda));
  doc.setDrawColor(...LINEA).line(xl, y - 3, ancho - 14, y - 3);
  fila('Total', dinero(liquidacion.total, moneda), true);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS)
    .text('Las constancias de entrega firmadas de cada viaje están disponibles como respaldo.', 14, y + 4);

  const yf = alto - 38;
  doc.setDrawColor(...GRIS).setLineWidth(0.3).line(20, yf, 90, yf).line(ancho - 90, yf, ancho - 20, yf);
  doc.setFontSize(8).text('Conformidad del cliente', 55, yf + 5, { align: 'center' });
  doc.text('Nombre, cargo y fecha', 55, yf + 9, { align: 'center' });
  doc.text('TIDEO · Transporte', ancho - 55, yf + 5, { align: 'center' });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS);
    doc.text(`Generado ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })} · OPERA by TIDEO`, 14, alto - 8);
    doc.text(`${i} / ${total}`, ancho - 14, alto - 8, { align: 'right' });
  }
  doc.save(`Prefactura-${liquidacion.numero}.pdf`);
}
