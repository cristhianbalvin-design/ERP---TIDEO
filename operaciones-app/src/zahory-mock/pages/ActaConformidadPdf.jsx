import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { etiquetaTipoCobro } from './actaConformidadLogic.js';

const NAVY = '#1A2B4A';
const CYAN = '#00ACC1';
const GRIS = '#667085';
const LINEA = '#E4E7EB';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1F2937', paddingTop: 30, paddingHorizontal: 38, paddingBottom: 46 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderColor: NAVY, paddingBottom: 10, marginBottom: 12 },
  logo: { width: 120, height: 44, objectFit: 'contain' },
  company: { maxWidth: 300, textAlign: 'right' },
  companyName: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: NAVY },
  muted: { fontSize: 8, color: GRIS, marginTop: 2 },
  eyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: CYAN, letterSpacing: 1, textAlign: 'center' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: NAVY, textAlign: 'center', marginTop: 3 },
  titleMeta: { textAlign: 'center', fontSize: 8.5, color: GRIS, marginTop: 4, marginBottom: 12 },
  section: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: NAVY, marginTop: 10, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderColor: LINEA },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  info: { width: '32%', borderWidth: 1, borderColor: LINEA, borderRadius: 3, padding: 6 },
  infoWide: { width: '65.3%', borderWidth: 1, borderColor: LINEA, borderRadius: 3, padding: 6 },
  label: { fontSize: 7, color: GRIS, marginBottom: 2 },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  paragraph: { fontSize: 9, lineHeight: 1.45 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: LINEA, paddingVertical: 4 },
  cellMain: { width: '70%', fontSize: 8.5 },
  cellSide: { width: '30%', fontSize: 8.5, textAlign: 'right', color: GRIS },
  result: { borderRadius: 4, padding: 8, marginTop: 2 },
  resultText: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoBox: { width: '48.5%' },
  photo: { width: '100%', height: 128, objectFit: 'cover', borderRadius: 4, backgroundColor: '#F4F6F8' },
  caption: { fontSize: 7, color: GRIS, marginTop: 2 },
  signs: { flexDirection: 'row', gap: 14, marginTop: 6 },
  sign: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: LINEA, borderRadius: 4, padding: 8, alignItems: 'center' },
  signImage: { width: 170, height: 64, objectFit: 'contain' },
  signEmpty: { height: 64, justifyContent: 'center' },
  signLine: { width: '90%', borderTopWidth: 1, borderColor: GRIS, marginTop: 2, marginBottom: 4 },
  signName: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'center' },
  signMeta: { fontSize: 7.5, color: GRIS, textAlign: 'center', marginTop: 1 },
  evidence: { marginTop: 10, padding: 7, borderWidth: 1, borderColor: LINEA, borderStyle: 'dashed', borderRadius: 4 },
  evidenceText: { fontSize: 6.8, color: GRIS, lineHeight: 1.35 },
  footer: { position: 'absolute', bottom: 18, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: LINEA, paddingTop: 5, fontSize: 7, color: GRIS },
});

const presente = valor => valor !== null && valor !== undefined && String(valor).trim() !== '';
const txt = valor => (presente(valor) ? String(valor) : '—');
const fecha = valor => {
  if (!presente(valor)) return '—';
  const soloFecha = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }).format(d);
};
const fechaHora = valor => {
  if (!presente(valor)) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(d);
};
const horas = valor => `${Number(valor || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })} h`;

const RESULTADO = {
  conforme: { texto: 'CONFORME', fondo: '#E3F6EA', color: '#14633A' },
  observaciones: { texto: 'CONFORME CON OBSERVACIONES', fondo: '#FFF3E0', color: '#8A4B00' },
  pendiente: { texto: 'CONFORMIDAD PENDIENTE: EL CLIENTE NO FIRMÓ EN SITIO', fondo: '#F1F3F5', color: '#4B5563' },
};

const Info = ({ label, value, wide = false }) => (
  <View style={wide ? S.infoWide : S.info}><Text style={S.label}>{label}</Text><Text style={S.value}>{txt(value)}</Text></View>
);

const Firma = ({ titulo, firma, imagen }) => (
  <View style={S.sign}>
    {imagen ? <Image src={imagen} style={S.signImage} /> : <View style={S.signEmpty}><Text style={S.signMeta}>{firma ? 'Firma no disponible' : 'Sin firma en sitio'}</Text></View>}
    <View style={S.signLine} />
    <Text style={S.signName}>{firma ? txt(firma.nombre) : titulo}</Text>
    {firma ? <Text style={S.signMeta}>{[firma.documento ? `Doc. ${firma.documento}` : null, firma.cargo].filter(Boolean).join(' · ') || ' '}</Text> : null}
    <Text style={S.signMeta}>{titulo}</Text>
  </View>
);

export default function ActaConformidadPdf({ snapshot, imagenes = {} }) {
  const s = snapshot || {};
  const emisor = s.emisor || {};
  const ot = s.ot || {};
  const cliente = s.cliente || {};
  const trabajo = s.trabajo || {};
  const conformidad = s.conformidad || {};
  const firmas = s.firmas || [];
  const tecnico = firmas.find(f => f.rol === 'tecnico');
  const firmaCliente = firmas.find(f => f.rol === 'cliente');
  const resultado = RESULTADO[conformidad.resultado] || RESULTADO.conforme;
  const mensual = ot.tipo_cobro === 'recurrente_mensual';
  const fotos = s.evidencias || [];
  const tareas = trabajo.tareas || [];
  const geoTexto = geo => (geo?.lat != null && geo?.lng != null ? `GPS ${geo.lat}, ${geo.lng}` : 'Sin GPS');

  return (
    <Document title={`Acta de conformidad ${txt(s.acta_numero)}`} author={txt(emisor.razon_social)}>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          {imagenes.logo ? <Image src={imagenes.logo} style={S.logo} /> : <View />}
          <View style={S.company}>
            <Text style={S.companyName}>{txt(emisor.razon_social)}</Text>
            {presente(emisor.ruc) ? <Text style={S.muted}>RUC {emisor.ruc}</Text> : null}
            {presente(emisor.direccion) ? <Text style={S.muted}>{emisor.direccion}</Text> : null}
          </View>
        </View>

        <Text style={S.eyebrow}>CIERRE TÉCNICO</Text>
        <Text style={S.title}>ACTA DE CONFORMIDAD DE SERVICIO</Text>
        <Text style={S.titleMeta}>Acta N° {txt(s.acta_numero)} · OT {txt(ot.numero)} · Emitida el {fechaHora(s.emitida_en)}</Text>

        <View style={S.grid}>
          <Info label="Cliente" value={cliente.nombre} />
          <Info label="RUC / documento" value={cliente.ruc} />
          <Info label="OS del cliente" value={ot.os_numero} />
          <Info label="Servicio" value={ot.servicio || ot.descripcion} wide />
          <Info label="Tipo de servicio" value={etiquetaTipoCobro(ot.tipo_cobro)} />
          <Info label="Lugar de ejecución" value={ot.direccion_ejecucion} wide />
          <Info label={mensual ? 'Periodo' : 'Fecha de ejecución'} value={trabajo.fecha_inicio && trabajo.fecha_inicio !== trabajo.fecha_cierre ? `${fecha(trabajo.fecha_inicio)} al ${fecha(trabajo.fecha_cierre)}` : fecha(trabajo.fecha_cierre)} />
        </View>

        <Text style={S.section}>Trabajo realizado</Text>
        <Text style={S.paragraph}>{txt(trabajo.descripcion)}</Text>
        <Text style={[S.muted, { marginTop: 4 }]}>{`${trabajo.partes_aprobados || 0} parte(s) diario(s) aprobado(s) · ${horas(trabajo.horas)} hombre registradas`}</Text>

        {tareas.length ? <>
          <Text style={S.section}>Tareas</Text>
          {tareas.map((tarea, indice) => (
            <View key={`${tarea.titulo}-${indice}`} style={S.row} wrap={false}>
              <Text style={S.cellMain}>{txt(tarea.titulo)}</Text>
              <Text style={S.cellSide}>{tarea.completada ? 'Completada' : tarea.estado === 'cerrada_sin_completar' ? 'Cerrada sin completar' : `Avance ${Number(tarea.avance_pct || 0)}%`}</Text>
            </View>
          ))}
        </> : null}

        <Text style={S.section}>Conformidad del cliente</Text>
        <View style={[S.result, { backgroundColor: resultado.fondo }]}>
          <Text style={[S.resultText, { color: resultado.color }]}>{resultado.texto}</Text>
          {presente(conformidad.observaciones) ? <Text style={[S.paragraph, { marginTop: 4, color: '#1F2937' }]}>{conformidad.resultado === 'pendiente' ? 'Motivo: ' : 'Observaciones: '}{conformidad.observaciones}</Text> : null}
        </View>

        <Text style={S.section}>Fotos del trabajo</Text>
        <View style={S.photos}>
          {fotos.map((foto, indice) => (
            <View key={foto.path || indice} style={S.photoBox} wrap={false}>
              {imagenes.fotos?.[foto.path] ? <Image src={imagenes.fotos[foto.path]} style={S.photo} /> : <View style={[S.photo, { justifyContent: 'center' }]}><Text style={[S.caption, { textAlign: 'center' }]}>Foto no disponible</Text></View>}
              <Text style={S.caption}>{foto.tipo === 'antes' ? 'Antes' : 'Después'} · {fechaHora(foto.tomada_en)} · {geoTexto(foto.geo)}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <Text style={S.section}>Firmas</Text>
          <View style={S.signs}>
            <Firma titulo="Técnico responsable" firma={tecnico} imagen={imagenes.firmas?.tecnico} />
            <Firma titulo="Representante del cliente" firma={firmaCliente} imagen={imagenes.firmas?.cliente} />
          </View>
          <View style={S.evidence}>
            <Text style={S.evidenceText}>
              {`Firma electrónica simple por trazo en pantalla. Emitida el ${fechaHora(s.emitida_en)} (hora del servidor, Lima) desde la IP ${txt(s.ip)}. `}
              {firmas.map(f => `${f.rol === 'tecnico' ? 'Técnico' : 'Cliente'}: huella ${String(f.sha256 || '').slice(0, 16)}…, ${txt(f.dispositivo?.plataforma)}, ${geoTexto(f.geo)}.`).join(' ')}
              {fotos.length ? ` Fotos: ${fotos.map(f => String(f.sha256 || '').slice(0, 10)).join(', ')}.` : ''}
            </Text>
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text>Acta {txt(s.acta_numero)} · Generada con OPERA by Tideo Tech &amp; Strategy</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generarPdfActa(snapshot, imagenes) {
  const { pdf } = await import('@react-pdf/renderer');
  return pdf(<ActaConformidadPdf snapshot={snapshot} imagenes={imagenes} />).toBlob();
}
