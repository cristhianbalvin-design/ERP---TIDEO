import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { blobADataUri } from '../../services/informePdfImagenes.js';
import { firmarRutasPlanos } from '../../services/diagnosticoFabricacionService.js';
import { obtenerFirmaPersonaParaVista } from '../../services/emisorPersonal.js';
import { rasterizarSvgAPng } from './dibujoHallazgoLogic.js';

const MARGEN = 38;
const ANCHO_UTIL = 595.28 - MARGEN * 2;
const ALTO_MAX_PLANO = 340;
const PIN = 14;

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#172033', paddingTop: 30, paddingHorizontal: MARGEN, paddingBottom: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#d9e0e8', paddingBottom: 10, marginBottom: 10 },
  logo: { width: 125, height: 48, objectFit: 'contain' }, company: { maxWidth: 300, textAlign: 'right' }, companyName: { fontFamily: 'Helvetica-Bold', fontSize: 11 }, muted: { fontSize: 8, color: '#667085', marginTop: 3 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: '#1a2b4a', textAlign: 'center', marginBottom: 4 }, titleMeta: { textAlign: 'center', fontSize: 8, color: '#667085', marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }, info: { width: '32%', borderWidth: 1, borderColor: '#e4eaf0', borderRadius: 3, padding: 7 }, label: { fontSize: 7, color: '#667085', marginBottom: 3 }, value: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#1a2b4a', marginTop: 10, marginBottom: 5, borderBottomWidth: 1, borderColor: '#e1e6ec', paddingBottom: 4 },
  pieza: { borderWidth: 1, borderColor: '#dfe5ec', borderRadius: 4, padding: 8, marginBottom: 10 },
  piezaTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#1a2b4a', marginBottom: 3 }, line: { marginBottom: 2, lineHeight: 1.35 }, bold: { fontFamily: 'Helvetica-Bold' },
  plano: { position: 'relative', alignSelf: 'center', marginTop: 6, marginBottom: 6, borderWidth: 0.5, borderColor: '#d9e0e8' },
  pin: { position: 'absolute', width: PIN, height: PIN, borderRadius: PIN / 2, backgroundColor: '#1a2b4a', borderWidth: 1, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  pinCrit: { backgroundColor: '#c62828' }, pinText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 7 },
  sinPlano: { fontSize: 8, color: '#8a4b00', marginVertical: 6 },
  tableHead: { flexDirection: 'row', backgroundColor: '#1a2b4a', padding: 5 }, tableHeadText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e1e6ec', paddingVertical: 4, paddingHorizontal: 5 }, tableCell: { fontSize: 8, paddingRight: 4 }, crit: { color: '#c62828', fontFamily: 'Helvetica-Bold' },
  trabajo: { marginBottom: 6 }, trabajoTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 2 }, actividad: { marginLeft: 8, marginBottom: 2 }, tarea: { marginLeft: 18, fontSize: 8, marginBottom: 1 },
  conclusion: { lineHeight: 1.45 },
  signature: { marginTop: 22, alignItems: 'center' }, signatureImage: { width: 150, height: 55, objectFit: 'contain' }, signLine: { width: 190, borderTopWidth: 1, borderColor: '#94a3b8', marginTop: 4, marginBottom: 4 },
  footer: { position: 'absolute', left: MARGEN, right: MARGEN, bottom: 16, fontSize: 7, color: '#98a2b3', textAlign: 'center' },
  watermark: { position: 'absolute', top: 380, left: -60, width: 715, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 84, letterSpacing: 6, color: '#c62828', opacity: 0.1, transform: 'rotate(-32deg)' },
});

const presente = valor => valor !== null && valor !== undefined && String(valor).trim() !== '';
const fecha = valor => {
  if (!presente(valor)) return '';
  const soloFecha = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  const date = new Date(valor);
  return Number.isNaN(date.getTime()) ? String(valor) : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima' }).format(date);
};
const num = valor => (valor === null || valor === undefined ? '' : Number(valor).toLocaleString('es-PE', { maximumFractionDigits: 4 }));
const campo = (label, value) => (presente(value) ? <View key={label} style={S.info}><Text style={S.label}>{label}</Text><Text style={S.value}>{String(value)}</Text></View> : null);

// Tamaño del plano en el PDF: ancho útil, sin pasar la altura máxima.
export function medidaPlano(ancho, alto) {
  const w = Number(ancho) > 0 ? Number(ancho) : 1200;
  const h = Number(alto) > 0 ? Number(alto) : 800;
  let width = ANCHO_UTIL - 30;
  let height = width * h / w;
  if (height > ALTO_MAX_PLANO) { height = ALTO_MAX_PLANO; width = height * w / h; }
  return { width, height };
}

function Plano({ pieza, imagen }) {
  if (!imagen?.uri) return <Text style={S.sinPlano}>{pieza.plano_origen ? 'No se pudo cargar el plano de esta pieza.' : 'Pieza sin plano.'}</Text>;
  const { width, height } = medidaPlano(imagen.width, imagen.height);
  return <View style={[S.plano, { width, height }]} wrap={false}>
    <Image src={imagen.uri} style={{ width, height }} />
    {pieza.caracteristicas.map(item => <View key={item.numero} style={[S.pin, item.critica ? S.pinCrit : null, { left: width * item.pos_x / 100 - PIN / 2, top: height * item.pos_y / 100 - PIN / 2 }]}>
      <Text style={S.pinText}>{item.numero}</Text>
    </View>)}
  </View>;
}

const COLS = ['7%', '20%', '30%', '17%', '16%', '10%'];

export default function FichaFabricacionPdf({ ficha, imagenes = {} }) {
  const cab = ficha?.cabecera || {};
  const empresa = ficha?.empresa || {};
  const piezas = ficha?.piezas || [];
  const trabajos = ficha?.trabajos || [];
  const emisor = ficha?.emisor || null;
  const borrador = Boolean(ficha?.borrador);
  return <Document>
    <Page size="A4" style={S.page}>
      <View style={S.header}>
        {imagenes.logo ? <Image src={imagenes.logo} style={S.logo} /> : <View />}
        <View style={S.company}>{presente(empresa.razon_social) ? <Text style={S.companyName}>{empresa.razon_social}</Text> : null}{presente(empresa.ruc) ? <Text style={S.muted}>RUC: {empresa.ruc}</Text> : null}</View>
      </View>
      <Text style={S.title}>FICHA TÉCNICA DE FABRICACIÓN</Text>
      <Text style={S.titleMeta}>{[cab.origen_tipo && cab.origen_numero ? `${cab.origen_tipo} ${cab.origen_numero}` : '', borrador ? 'Borrador' : ficha?.version ? `Versión ${ficha.version}` : '', fecha(borrador ? ficha?.generado_en : ficha?.emitido_en)].filter(Boolean).join(' · ')}</Text>
      <View style={S.infoGrid}>
        {campo('Cliente', cab.cliente)}{campo('Referencia del cliente', cab.referencia_cliente)}{campo('Activo', cab.activo)}
        {campo('Técnico', cab.tecnico)}{campo('Fecha', fecha(cab.fecha))}{campo('Piezas', piezas.length ? String(piezas.length) : '')}
      </View>

      <Text style={S.sectionTitle}>Piezas</Text>
      {piezas.map(pieza => <View key={pieza.id || pieza.orden} style={S.pieza}>
        <Text style={S.piezaTitle} minPresenceAhead={120}>{pieza.orden} · {pieza.nombre} · {num(pieza.cantidad)} und</Text>
        {pieza.material ? <Text style={S.line}><Text style={S.bold}>Material: </Text>{[pieza.material.descripcion, pieza.material.codigo].filter(presente).join(' · ')}</Text> : null}
        {pieza.consumo_material ? <Text style={S.line}><Text style={S.bold}>Consumo: </Text>{num(pieza.consumo_material)} {pieza.material?.unidad || ''} por pieza · total {num(pieza.total_material)} {pieza.material?.unidad || ''}</Text> : null}
        {presente(pieza.dibujo_nombre) ? <Text style={S.line}><Text style={S.bold}>Plano: </Text>dibujo del catálogo · {pieza.dibujo_nombre}</Text> : null}
        {presente(pieza.observaciones) ? <Text style={S.line}><Text style={S.bold}>Observaciones: </Text>{pieza.observaciones}</Text> : null}
        <Plano pieza={pieza} imagen={imagenes.planos?.[pieza.id]} />
        {pieza.caracteristicas.length ? <View>
          <View style={S.tableHead} wrap={false}>{['#', 'Parte', 'Característica', 'Nominal', 'Tolerancia', 'Crítica'].map((label, i) => <Text key={label} style={[S.tableHeadText, { width: COLS[i] }]}>{label}</Text>)}</View>
          {pieza.caracteristicas.map(item => <View key={item.numero} style={S.tableRow} wrap={false}>
            <Text style={[S.tableCell, { width: COLS[0] }, item.critica ? S.crit : null]}>{item.numero}</Text>
            <Text style={[S.tableCell, { width: COLS[1] }]}>{item.parte || '—'}</Text>
            <Text style={[S.tableCell, { width: COLS[2] }]}>{item.nombre}</Text>
            <Text style={[S.tableCell, { width: COLS[3] }]}>{item.nominal || '—'}</Text>
            <Text style={[S.tableCell, { width: COLS[4] }]}>{item.tolerancia || '—'}</Text>
            <Text style={[S.tableCell, { width: COLS[5] }, item.critica ? S.crit : null]}>{item.critica ? 'Sí' : ''}</Text>
          </View>)}
        </View> : <Text style={S.muted}>Sin características registradas.</Text>}
      </View>)}

      {trabajos.length ? <View>
        <Text style={S.sectionTitle} minPresenceAhead={40}>Trabajos a realizar</Text>
        {trabajos.map((grupo, gi) => <View key={`${grupo.trabajo}-${gi}`} style={S.trabajo} wrap={false}>
          <Text style={S.trabajoTitle}>{grupo.trabajo}</Text>
          {grupo.actividades.map((actividad, ai) => <View key={`${actividad.actividad}-${ai}`}>
            <Text style={S.actividad}>• {actividad.actividad}</Text>
            {actividad.tareas.map((tarea, ti) => <Text key={`${tarea.tarea}-${ti}`} style={S.tarea}>– {tarea.tarea} · {tarea.pieza}</Text>)}
          </View>)}
        </View>)}
      </View> : null}

      {presente(ficha?.conclusion) || emisor ? <View wrap={false}>
        {presente(ficha?.conclusion) ? <><Text style={S.sectionTitle}>Conclusión</Text><Text style={S.conclusion}>{ficha.conclusion}</Text></> : null}
        {emisor && presente(emisor.nombre) ? <View style={S.signature}>
          {imagenes.firma ? <Image src={imagenes.firma} style={S.signatureImage} /> : <View style={{ height: 30 }} />}
          <View style={S.signLine} />
          <Text style={S.bold}>{emisor.nombre}</Text>
          {presente(emisor.cargo) ? <Text style={S.muted}>{emisor.cargo}</Text> : null}
        </View> : null}
      </View> : null}
      {borrador ? <Text style={S.watermark} fixed>BORRADOR</Text> : null}
      <Text style={S.footer} fixed render={({ pageNumber, totalPages }) => `Generado con TIDEO ERP · Ficha técnica sin valores económicos · Página ${pageNumber} de ${totalPages}`} />
    </Page>
  </Document>;
}

async function descargar(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo descargar la imagen.');
  return response.blob();
}

async function dimensiones(blob) {
  if (typeof createImageBitmap !== 'function') return {};
  try { const bitmap = await createImageBitmap(blob); const d = { width: bitmap.width, height: bitmap.height }; bitmap.close?.(); return d; } catch { return {}; }
}

const medidasSvg = svg => {
  const w = Number(String(svg).match(/<svg\b[^>]*\bwidth=["']([\d.]+)/i)?.[1]);
  const h = Number(String(svg).match(/<svg\b[^>]*\bheight=["']([\d.]+)/i)?.[1]);
  return { width: w > 0 ? w : 1200, height: h > 0 ? h : 600 };
};

export async function prepararImagenesFicha(ficha) {
  const warnings = [];
  const planos = {};
  const piezas = ficha?.piezas || [];
  const rutas = piezas.map(pieza => pieza.plano_imagen_ruta).filter(Boolean);
  let firmadas = new Map();
  if (rutas.length) {
    try { firmadas = await firmarRutasPlanos(rutas); } catch { warnings.push('No se pudieron abrir los planos subidos.'); }
  }
  await Promise.all(piezas.map(async pieza => {
    try {
      if (pieza.svg) {
        const { width, height } = medidasSvg(pieza.svg);
        planos[pieza.id] = { uri: await rasterizarSvgAPng(pieza.svg, { ancho: 1400 }), width, height };
      } else if (pieza.plano_imagen_ruta && firmadas.get(pieza.plano_imagen_ruta)) {
        const blob = await descargar(firmadas.get(pieza.plano_imagen_ruta));
        const [uri, d] = await Promise.all([blobADataUri(blob), dimensiones(blob)]);
        planos[pieza.id] = { uri, width: d.width || pieza.plano_ancho, height: d.height || pieza.plano_alto };
      }
    } catch {
      warnings.push(`No se pudo preparar el plano de ${pieza.nombre}.`);
    }
  }));
  let logo = null;
  if (ficha?.empresa?.logo_url) {
    try { logo = await blobADataUri(await descargar(ficha.empresa.logo_url)); } catch { logo = null; }
  }
  let firma = null;
  if (ficha?.emisor) {
    try {
      const url = await obtenerFirmaPersonaParaVista(ficha.emisor);
      if (url) firma = await blobADataUri(await descargar(url));
    } catch { firma = null; }
  }
  return { logo, firma, planos, warnings };
}

export async function generarPdfFicha(ficha) {
  const { pdf } = await import('@react-pdf/renderer');
  const imagenes = await prepararImagenesFicha(ficha);
  const blob = await pdf(<FichaFabricacionPdf ficha={ficha} imagenes={imagenes} />).toBlob();
  return { blob, warnings: imagenes.warnings };
}
