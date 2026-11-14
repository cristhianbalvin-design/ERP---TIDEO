import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { descargarComoDataUrl } from '../../../services/actaConformidadService.js';
import { cargarEntrega, registrarPdfEntrega, urlsFirmadasEntrega } from '../../../services/ofEntregaService.js';
import { formatearFecha } from './ofBandejaLogic.js';

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: '#1A2B4A' },
  cab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: '#00ACC1', paddingBottom: 8, marginBottom: 14 },
  marca: { fontSize: 22, fontWeight: 'bold' },
  titulo: { fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  sub: { fontSize: 9, color: '#6B7280', textAlign: 'right' },
  linea: { marginBottom: 5 },
  seccion: { fontSize: 11, fontWeight: 'bold', marginTop: 12, marginBottom: 6, color: '#0B4F5A' },
  fotos: { flexDirection: 'row', flexWrap: 'wrap' },
  foto: { width: 160, height: 115, objectFit: 'cover', marginRight: 8, marginBottom: 8, borderRadius: 4 },
  firmas: { flexDirection: 'row', marginTop: 8 },
  firmaCaja: { width: 240, marginRight: 20, borderWidth: 1, borderColor: '#E4E7EB', borderRadius: 6, padding: 8 },
  firma: { width: 222, height: 90, objectFit: 'contain' },
  firmaPie: { borderTopWidth: 1, borderTopColor: '#C9CFD8', marginTop: 4, paddingTop: 4, fontSize: 9, color: '#6B7280' },
});
const texto = v => v || 'Sin dato';
const fecha = v => (v ? formatearFecha(v) : 'Sin dato');
export function OFEntregaPdf({ of, datos, imagenes }) {
  const e = datos.entrega || {};
  return <Document title={`Acta de entrega ${texto(e.numero)}`} author="TIDEO"><Page size="A4" style={s.page}>
    <View style={s.cab}><Text style={s.marca}>TIDEO</Text><View><Text style={s.titulo}>Acta de entrega {texto(e.numero)}</Text><Text style={s.sub}>{texto(of.numero)} · {fecha(e.fecha)}</Text></View></View>
    <Text style={s.linea}>Cliente: {texto(of.cliente)}</Text>
    <Text style={s.linea}>Recibe: {texto(e.recibe_nombre)} · Documento: {texto(e.recibe_dni)}</Text>
    <Text style={s.linea}>Conformidad: {e.conformidad === 'conforme' ? 'Conforme' : 'Con observaciones'}</Text>
    <Text style={s.linea}>Observaciones: {texto(e.observaciones)}</Text>
    <Text style={s.linea}>Guía de remisión: {texto(e.guia_numero)} · Llegada: {texto(e.llegada)}</Text>
    <Text style={s.seccion}>Unidades y garantía</Text>
    {(datos.unidades || []).map(u => <Text key={u.id} style={s.linea}>Unidad {u.unidad} · Serie {texto(u.serie)} · Garantía: {u.garantia ? `${u.garantia.numero}, del ${fecha(u.garantia.fecha_inicio)} al ${fecha(u.garantia.fecha_fin)}` : 'Sin garantía'}</Text>)}
    <Text style={s.seccion}>Fotos de la entrega</Text>
    <View style={s.fotos}>{(e.fotos || []).map((f, i) => imagenes.get(f.path) ? <Image key={f.path} style={s.foto} src={imagenes.get(f.path)} /> : <Text key={i}>Foto sin dato</Text>)}</View>
    <Text style={s.seccion}>Firmas</Text>
    <View style={s.firmas} wrap={false}>
      <View style={s.firmaCaja}>{imagenes.get(e.firma_responsable_path) && <Image style={s.firma} src={imagenes.get(e.firma_responsable_path)} />}<Text style={s.firmaPie}>Responsable de la entrega</Text></View>
      <View style={s.firmaCaja}>{imagenes.get(e.firma_cliente_path) && <Image style={s.firma} src={imagenes.get(e.firma_cliente_path)} />}<Text style={s.firmaPie}>Cliente: {texto(e.recibe_nombre)}</Text></View>
    </View>
  </Page></Document>;
}
export async function generarYRegistrarPdfEntrega(empresaId, of) {
  const datos = await cargarEntrega(of.id);
  const e = datos?.entrega;
  if (!e) throw new Error('No se encontró la entrega.');
  const paths = [...(e.fotos || []).map(f => f.path), e.firma_responsable_path, e.firma_cliente_path];
  const urls = await urlsFirmadasEntrega(paths);
  const imagenes = new Map(await Promise.all(paths.map(async path => {
    if (!urls.get(path)) throw new Error('No se pudo obtener una imagen del acta.');
    return [path, await descargarComoDataUrl(urls.get(path))];
  })));
  const blob = await pdf(<OFEntregaPdf of={of} datos={datos} imagenes={imagenes} />).toBlob();
  await registrarPdfEntrega(empresaId, of.id, e.id, blob);
}
