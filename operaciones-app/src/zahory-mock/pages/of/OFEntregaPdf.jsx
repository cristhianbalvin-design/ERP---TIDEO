import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { descargarComoDataUrl } from '../../../services/actaConformidadService.js';
import { cargarEntrega, registrarPdfEntrega, urlsFirmadasEntrega } from '../../../services/ofEntregaService.js';

const s = StyleSheet.create({ page: { padding: 36, fontSize: 10, color: '#1A2B4A' }, marca: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 }, titulo: { fontSize: 15, marginBottom: 12 }, linea: { marginBottom: 6 }, seccion: { fontSize: 12, fontWeight: 'bold', marginTop: 12, marginBottom: 6 }, foto: { width: 220, height: 150, objectFit: 'contain', marginBottom: 8 }, firma: { width: 180, height: 70, objectFit: 'contain' } });
const texto = v => v || 'Sin dato';
export function OFEntregaPdf({ of, datos, imagenes }) {
  const e = datos.entrega || {};
  return <Document title={`Acta de entrega ${texto(e.numero)}`} author="TIDEO"><Page size="A4" style={s.page}>
    <Text style={s.marca}>TIDEO</Text><Text style={s.titulo}>Acta de entrega {texto(e.numero)}</Text>
    <Text style={s.linea}>OF: {texto(of.numero)} · Cliente: {texto(of.cliente)}</Text>
    <Text style={s.linea}>Fecha: {texto(e.fecha)} · Recibe: {texto(e.recibe_nombre)} · Documento: {texto(e.recibe_dni)}</Text>
    <Text style={s.linea}>Conformidad: {e.conformidad === 'conforme' ? 'Conforme' : 'Con observaciones'}</Text>
    <Text style={s.linea}>Observaciones: {texto(e.observaciones)}</Text>
    <Text style={s.linea}>Guía: {texto(e.guia_numero)} · Llegada: {texto(e.llegada)}</Text>
    <Text style={s.seccion}>Unidades y garantía</Text>
    {(datos.unidades || []).map(u => <Text key={u.id} style={s.linea}>Unidad {u.unidad} · Serie {texto(u.serie)} · Garantía: {u.garantia ? `${u.garantia.fecha_inicio} a ${u.garantia.fecha_fin} (${u.garantia.estado})` : 'Sin garantía'}</Text>)}
    <Text style={s.seccion}>Fotos de la entrega</Text>
    {(e.fotos || []).map((f, i) => imagenes.get(f.path) ? <Image key={f.path} style={s.foto} src={imagenes.get(f.path)} /> : <Text key={i}>Foto sin dato</Text>)}
    <Text style={s.seccion}>Firma del responsable</Text>{imagenes.get(e.firma_responsable_path) && <Image style={s.firma} src={imagenes.get(e.firma_responsable_path)} />}
    <Text style={s.seccion}>Firma del cliente</Text>{imagenes.get(e.firma_cliente_path) && <Image style={s.firma} src={imagenes.get(e.firma_cliente_path)} />}
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
