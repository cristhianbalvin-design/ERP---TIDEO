// PDF de la hoja de ruta y de la constancia de entrega (marca TIDEO).
// Se usa desde Operaciones (despachador) y desde la app del conductor.
import { jsPDF } from 'jspdf';
import { DOCUMENTO_PARADA, NOVEDADES_CARGA, TIPO_VIAJE, fechaLima, horaLima, ordenarParadas, ventanaTexto } from './transporteLogistica.js';

const NAVY = [26, 43, 74];
const CYAN = [0, 172, 193];
const GRIS = [107, 114, 128];
const LINEA = [228, 231, 235];

const fechaTexto = valor => {
  const iso = fechaLima(valor);
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const horaTexto = horaLima;
const ACCION_PARADA = { origen: 'Carga', recojo: 'Recoger', entrega: 'Entregar', destino: 'Descarga' };

function encabezado(doc, { empresa, titulo, codigo, subtitulo }) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY).text('TIDEO', 14, 18);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS).text(empresa || '', 14, 23);
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...NAVY).text(titulo, ancho - 14, 16, { align: 'right' });
  doc.setFontSize(11).text(codigo || '', ancho - 14, 22, { align: 'right' });
  doc.setDrawColor(...CYAN).setLineWidth(0.8).line(14, 27, ancho - 14, 27);
  if (subtitulo) doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60, 60, 60).text(subtitulo, 14, 33);
  return 38;
}

function pie(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    const alto = doc.internal.pageSize.getHeight();
    const ancho = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS);
    doc.text(`Generado ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })} · OPERA by TIDEO`, 14, alto - 8);
    doc.text(`${i} / ${total}`, ancho - 14, alto - 8, { align: 'right' });
  }
}

const documentoParada = parada => {
  const tipo = DOCUMENTO_PARADA[parada.documento_tipo] || '';
  return [tipo, parada.descripcion].filter(Boolean).join(' · ');
};

function paginaHojaRuta(doc, viaje, empresa) {
  const tipo = TIPO_VIAJE[viaje.tipo_viaje]?.label || 'Viaje';
  const cliente = viaje.cuenta?.nombre_comercial || viaje.cuenta?.razon_social;
  let y = encabezado(doc, {
    empresa,
    titulo: 'Hoja de ruta',
    codigo: viaje.codigo,
    subtitulo: [tipo, cliente, `Fecha ${fechaTexto(viaje.fecha_programada)}`, horaLima(viaje.fecha_programada) ? `sale ${horaLima(viaje.fecha_programada)}` : '']
      .filter(Boolean).join(' · '),
  });
  doc.setFontSize(9).setTextColor(40, 40, 40);
  doc.text(`Unidad: ${viaje.vehiculo?.placa || 'sin asignar'}${viaje.vehiculo?.tipo ? ` (${viaje.vehiculo.tipo})` : ''}`, 14, y);
  doc.text(`Conductor: ${viaje.conductor?.nombre || 'sin asignar'}${viaje.conductor?.brevete ? ` · Brevete ${viaje.conductor.brevete}` : ''}`, 100, y);
  y += 5;
  doc.text(`Salida: ${viaje.origen_nombre || '—'}   ·   Retorno / destino: ${viaje.destino_nombre || '—'}`, 14, y);
  if (viaje.carga_descripcion || viaje.carga_bultos) {
    y += 5;
    doc.text(`Carga: ${[viaje.carga_descripcion, viaje.carga_bultos ? `${viaje.carga_bultos} bultos` : '', viaje.peso_toneladas ? `${viaje.peso_toneladas} t` : ''].filter(Boolean).join(' · ')}`, 14, y);
  }
  y += 7;

  const ancho = doc.internal.pageSize.getWidth() - 28;
  const cols = [8, 46, 20, 40, 18, ancho - 132];
  const titulos = ['#', 'Lugar', 'Qué hacer', 'Documento / indicación', 'Ventana', 'Recibe: nombre y firma'];
  const fila = (valores, alto, negrita = false) => {
    let x = 14;
    doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(8);
    valores.forEach((valor, i) => {
      const lineas = doc.splitTextToSize(String(valor ?? ''), cols[i] - 2);
      doc.text(lineas.slice(0, 4), x + 1, y + 4);
      x += cols[i];
    });
    doc.setDrawColor(...LINEA).setLineWidth(0.2).line(14, y + alto, 14 + ancho, y + alto);
    y += alto;
  };
  doc.setFillColor(244, 246, 248).rect(14, y, ancho, 6, 'F');
  doc.setTextColor(...NAVY);
  fila(titulos, 6, true);
  doc.setTextColor(30, 30, 30);
  ordenarParadas(viaje.paradas).forEach((parada, index) => {
    if (y > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); y = 20; }
    const hecho = parada.estado === 'completada'
      ? `Hecho: ${parada.recibe_nombre || ''} ${horaTexto(parada.salida_at)}` : parada.estado === 'omitida' ? 'Omitida' : '';
    fila([
      index + 1,
      [parada.nombre, parada.direccion].filter(Boolean).join('\n'),
      ACCION_PARADA[parada.tipo] || parada.tipo,
      documentoParada(parada),
      ventanaTexto(parada.ventana_inicio, parada.ventana_fin),
      hecho,
    ], 16);
  });
  if (!viaje.paradas?.length) fila(['', 'Sin paradas registradas', '', '', '', ''], 8);

  y = Math.max(y + 18, doc.internal.pageSize.getHeight() - 45);
  doc.setDrawColor(...GRIS).setLineWidth(0.3);
  doc.line(24, y, 90, y);
  doc.line(120, y, 186, y);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS);
  doc.text('Despachador', 57, y + 4, { align: 'center' });
  doc.text(`Conductor${viaje.conductor?.nombre ? ` · ${viaje.conductor.nombre}` : ''}`, 153, y + 4, { align: 'center' });
}

export function generarHojaRutaPdf({ viajes, empresa }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  (viajes || []).forEach((viaje, index) => {
    if (index > 0) doc.addPage();
    paginaHojaRuta(doc, viaje, empresa);
  });
  pie(doc);
  return doc;
}

// imagenes: { [paradaId]: { firma: dataUrl, foto: dataUrl, carga: dataUrl } }
export function generarConstanciaPdf({ viaje, empresa, imagenes = {} }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cliente = viaje.cuenta?.nombre_comercial || viaje.cuenta?.razon_social;
  let y = encabezado(doc, {
    empresa,
    titulo: 'Constancia de entrega',
    codigo: viaje.codigo,
    subtitulo: [TIPO_VIAJE[viaje.tipo_viaje]?.label, cliente, `Unidad ${viaje.vehiculo?.placa || '—'}`, `Conductor ${viaje.conductor?.nombre || '—'}`]
      .filter(Boolean).join(' · '),
  });
  const alto = doc.internal.pageSize.getHeight();
  const hechas = ordenarParadas(viaje.paradas).filter(p => p.estado === 'completada' && (p.recibe_nombre || p.firma_url));
  if (!hechas.length) {
    doc.setFontSize(10).setTextColor(...GRIS).text('Todavía no hay paradas con constancia.', 14, y + 4);
  }
  hechas.forEach(parada => {
    if (y > alto - 80) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...NAVY)
      .text(`Parada ${parada.secuencia} · ${parada.nombre}`, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(40, 40, 40);
    const novedad = NOVEDADES_CARGA.find(([k]) => k === parada.novedad)?.[1];
    const lineas = [
      documentoParada(parada),
      `Recibió: ${parada.recibe_nombre || '—'}${parada.recibe_dni ? ` · DNI ${parada.recibe_dni}` : ''} · ${horaTexto(parada.salida_at)} ${fechaTexto(parada.salida_at)}`,
      [parada.bultos_recibidos != null ? `Bultos recibidos: ${parada.bultos_recibidos}` : '', novedad ? `Estado de la carga: ${novedad}` : ''].filter(Boolean).join(' · '),
      parada.observaciones ? `Observación: ${parada.observaciones}` : '',
      parada.latitud_evidencia ? `GPS: ${Number(parada.latitud_evidencia).toFixed(5)}, ${Number(parada.longitud_evidencia).toFixed(5)}` : '',
    ].filter(Boolean);
    lineas.forEach(linea => { doc.text(doc.splitTextToSize(linea, 180), 14, y); y += 4.5; });
    const img = imagenes[parada.id] || {};
    let x = 14;
    [['firma', 'Firma'], ['foto', 'Foto de la guía'], ['carga', 'Foto de la carga']].forEach(([clave, rotulo]) => {
      if (!img[clave]) return;
      try {
        const formato = String(img[clave]).includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(img[clave], formato, x, y + 1, 52, 32, undefined, 'FAST');
        doc.setFontSize(7).setTextColor(...GRIS).text(rotulo, x, y + 36);
        x += 58;
      } catch { /* imagen no válida: se omite */ }
    });
    y += x > 14 ? 42 : 3;
    doc.setDrawColor(...LINEA).line(14, y, 196, y);
    y += 6;
  });
  pie(doc);
  return doc;
}
