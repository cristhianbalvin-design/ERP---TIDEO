import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { prepararImagenesInforme } from '../../services/informePdfImagenes.js';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#172033', paddingTop: 30, paddingHorizontal: 38, paddingBottom: 58 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#d9e0e8', paddingBottom: 10, marginBottom: 14 },
  logo: { width: 125, height: 48, objectFit: 'contain' }, company: { maxWidth: 300, textAlign: 'right' }, companyName: { fontFamily: 'Helvetica-Bold', fontSize: 11 }, muted: { fontSize: 8, color: '#667085', marginTop: 3 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: '#1a2b4a', textAlign: 'center', marginBottom: 5 }, titleMeta: { textAlign: 'center', fontSize: 8, color: '#667085', marginBottom: 13 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#1a2b4a', marginTop: 13, marginBottom: 6, borderBottomWidth: 1, borderColor: '#e1e6ec', paddingBottom: 4 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, info: { width: '32%', borderWidth: 1, borderColor: '#e4eaf0', borderRadius: 3, padding: 7 }, label: { fontSize: 7, color: '#667085', marginBottom: 3 }, value: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  summary: { flexDirection: 'row', gap: 6 }, summaryCard: { flexGrow: 1, borderWidth: 1, borderColor: '#e4eaf0', padding: 7, borderRadius: 3, alignItems: 'center' }, summaryLabel: { fontSize: 7, color: '#667085', marginBottom: 3 }, summaryNum: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  finding: { borderWidth: 1, borderColor: '#dfe5ec', borderRadius: 4, padding: 9, marginBottom: 8 }, findingHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }, findingTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 }, priority: { fontFamily: 'Helvetica-Bold', color: '#1a2b4a' }, line: { marginBottom: 1, lineHeight: 1.35 }, bold: { fontFamily: 'Helvetica-Bold' }, photos: { flexDirection: 'row', gap: 8, marginTop: 7 }, photoBox: { width: '32%', alignItems: 'center' }, photo: { objectFit: 'contain', maxWidth: '100%' }, caption: { fontSize: 7, color: '#667085', marginTop: 3, textAlign: 'center' },
  table: { marginTop: 5 }, tableHead: { flexDirection: 'row', backgroundColor: '#1a2b4a', padding: 5 }, tableHeadText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7 }, tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e6e9ee', padding: 5 }, tableCell: { fontSize: 7.5 }, task: { paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#e6e9ee' }, conclusion: { lineHeight: 1.45 }, signature: { marginTop: 20, width: 250, alignItems: 'center', alignSelf: 'center' }, signLine: { width: '85%', borderTopWidth: 1, borderColor: '#667085', marginBottom: 5 }, footer: { position: 'absolute', bottom: 20, left: 38, right: 38, borderTopWidth: 1, borderColor: '#d9e0e8', paddingTop: 5, textAlign: 'center', fontSize: 7, color: '#667085' },
});

const present = value => value !== null && value !== undefined && value !== '';
const dateLabel = value => {
  if (!present(value)) return '';
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima' }).format(date);
};
const fmt = value => present(value) ? String(value) : '';
const capitalize = value => {
  const text = fmt(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
};
const priorities = [['P1', 'Atención antes de operar'], ['P2', 'Atención prioritaria'], ['P3', 'Próximo mantenimiento'], ['P4', 'Monitorear'], ['conformes', 'Conformes']];
const field = (label, value) => present(value) ? <View key={label} style={S.info}><Text style={S.label}>{label}</Text><Text style={S.value}>{fmt(value)}</Text></View> : null;

function TablaMediciones({ mediciones }) {
  if (!mediciones.length) return null;
  return <View style={S.table}>
    <View style={S.tableHead}><Text style={[S.tableHeadText, { width: '30%' }]}>Parámetro</Text><Text style={[S.tableHeadText, { width: '26%' }]}>Especificado</Text><Text style={[S.tableHeadText, { width: '22%' }]}>Medido</Text><Text style={[S.tableHeadText, { width: '22%' }]}>Resultado</Text></View>
    {mediciones.map((m, i) => <View key={`${m.parametro}-${i}`} style={S.tableRow}>
      <Text style={[S.tableCell, { width: '30%' }]}>{fmt(m.parametro)}{m.unidad ? ` (${m.unidad})` : ''}</Text>
      <Text style={[S.tableCell, { width: '26%' }]}>{present(m.nominal) ? fmt(m.nominal) : [m.minimo, m.maximo].filter(present).join(' – ')}</Text>
      <Text style={[S.tableCell, { width: '22%' }]}>{fmt(m.medido)}</Text><Text style={[S.tableCell, { width: '22%' }]}>{fmt(m.resultado)}</Text>
    </View>)}
  </View>;
}

export default function InformePdf({ snapshot, imagenes = {} }) {
  const head = snapshot?.cabecera || {};
  const empresa = snapshot?.empresa || {};
  const resumen = snapshot?.resumen || {};
  const findings = snapshot?.hallazgos || [];
  const mediciones = snapshot?.mediciones || [];
  const tareas = snapshot?.tareas_repuestos || [];
  const showLabor = tareas.some(t => present(t.cargo_nombre) || present(t.horas_mano_obra) || present(t.horas_maquina));
  const groupedTaskCount = tareas.length <= 2 ? tareas.length : 1;
  const renderTaskRow = (task, index) => <View key={`${task.tarea_nombre}-${index}`} style={S.tableRow}>
    <Text style={[S.tableCell, { width: showLabor ? '31%' : '43%' }]}>{[task.actividad_nombre, task.tarea_nombre].filter(present).join(' · ')}</Text>
    <Text style={[S.tableCell, { width: showLabor ? '24%' : '32%' }]}>{fmt(task.hallazgo)}</Text>
    {showLabor ? <Text style={[S.tableCell, { width: '15%' }]}>{[task.cargo_nombre, present(task.horas_mano_obra) ? `${task.horas_mano_obra} h MO` : '', present(task.horas_maquina) ? `${task.horas_maquina} h máquina` : ''].filter(present).join('\n')}</Text> : null}
    <Text style={[S.tableCell, { width: showLabor ? '30%' : '25%' }]}>{(task.materiales || []).map(m => [m.codigo, m.descripcion, present(m.cantidad) ? `${m.cantidad} ${m.unidad || ''}` : ''].filter(present).join(' · ')).join('\n')}</Text>
  </View>;
  return <Document>
    <Page size="A4" style={S.page}>
      <View style={S.header}>
        {imagenes.logo ? <Image src={imagenes.logo} style={S.logo} /> : <View />}
        <View style={S.company}><Text style={S.companyName}>{fmt(empresa.razon_social)}</Text>{present(empresa.ruc) ? <Text style={S.muted}>RUC: {fmt(empresa.ruc)}</Text> : null}</View>
      </View>
      <Text style={S.title}>INFORME DE DIAGNÓSTICO TÉCNICO</Text>
      <Text style={S.titleMeta}>Recepción {fmt(head.numero_recepcion)}</Text>
      <View style={S.infoGrid}>
        {field('Activo', [head.activo_nombre, head.activo_codigo].filter(present).join(' · '))}
        {field('Cliente', head.cliente_razon_social)}{field('N° de serie', head.numero_serie)}
        {field('Fecha de recepción', dateLabel(head.fecha_recepcion))}{field('N° de caso', head.numero_caso)}
        {field('Horómetro', head.horometro)}
        {field('Tipo', capitalize(head.tipo))}{field('Versión', snapshot?.version)}{field('Emitido el', dateLabel(snapshot?.emitido_en))}
      </View>
      <Text style={S.sectionTitle}>Resumen por prioridad</Text>
      <View style={S.summary}>{priorities.map(([key, label]) => <View key={key} style={S.summaryCard}><Text style={S.summaryLabel}>{label}</Text><Text style={S.summaryNum}>{Number(resumen[key] || 0)}</Text></View>)}</View>

      {findings.length ? <><Text style={S.sectionTitle}>Hallazgos</Text>{findings.map((item, index) => {
        const measures = mediciones.filter(m => m.hallazgo_id === item.hallazgo_id);
        const relatedTasks = tareas.filter(task => task.hallazgo === item.hallazgo || task.hallazgo_id === item.hallazgo_id || (item.lineas || []).some(line => line.tarea_nombre && line.tarea_nombre === task.tarea_nombre));
        const photos = [...(item.fotos || [])].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0)).filter(photo => imagenes.fotos?.[photo.ruta_storage]).slice(0, 3);
        return <View key={item.hallazgo_id || index} style={S.finding} wrap={false}>
          <View style={S.findingHead}><Text style={S.findingTitle}>{fmt(item.componente_parte)}</Text><Text style={S.priority}>{fmt(item.prioridad)}</Text></View>
          {[
            ['Daño', item.tipo_dano_etiqueta], ['Causa probable', item.causa_probable_etiqueta], ['Condición', item.condicion_etiqueta],
            ['Riesgo', item.riesgo_etiqueta], ['Acción recomendada', item.accion_recomendada_etiqueta], ['Atribuible a', item.atribuible_a_etiqueta], ['Observación', item.observacion],
          ].filter(([, value]) => present(value)).map(([label, value]) => <Text key={label} style={S.line}><Text style={S.bold}>{label}: </Text>{fmt(value)}</Text>)}
          {(item.lineas || []).length || relatedTasks.length ? <Text style={S.line}><Text style={S.bold}>Tareas relacionadas: </Text>{[...(item.lineas || []).map(line => line.tarea_nombre), ...relatedTasks.map(task => task.tarea_nombre)].filter((value, i, all) => present(value) && all.indexOf(value) === i).join(', ')}</Text> : null}
          {measures.length ? <><Text style={[S.label, { marginTop: 5, fontFamily: 'Helvetica-Bold' }]}>Mediciones</Text><TablaMediciones mediciones={measures} /></> : null}
          {photos.length ? <View style={S.photos}>{photos.map((photo, pi) => {
            const ratio = Number(photo.ancho) > 0 && Number(photo.alto) > 0 ? Number(photo.ancho) / Number(photo.alto) : 1.5;
            const width = Math.min(145, Math.max(66, 95 * ratio));
            const height = Math.min(96, width / ratio);
            return <View style={S.photoBox} key={`${photo.ruta_storage}-${pi}`}><Image src={imagenes.fotos[photo.ruta_storage]} style={[S.photo, { width, height }]} />{present(photo.leyenda) ? <Text style={S.caption}>{photo.leyenda}</Text> : null}</View>;
          })}</View> : null}
        </View>;
      })}</> : null}

      {tareas.length ? <>
        <View wrap={false}>
          <Text style={S.sectionTitle}>Tareas y repuestos</Text>
          <View style={S.tableHead}><Text style={[S.tableHeadText, { width: showLabor ? '31%' : '43%' }]}>Actividad / tarea</Text><Text style={[S.tableHeadText, { width: showLabor ? '24%' : '32%' }]}>Hallazgo</Text>{showLabor ? <><Text style={[S.tableHeadText, { width: '15%' }]}>Cargo / horas</Text><Text style={[S.tableHeadText, { width: '30%' }]}>Repuestos</Text></> : <Text style={[S.tableHeadText, { width: '25%' }]}>Repuestos</Text>}</View>
          {tareas.slice(0, groupedTaskCount).map(renderTaskRow)}
        </View>
        {tareas.slice(groupedTaskCount).map((task, index) => renderTaskRow(task, index + groupedTaskCount))}
      </> : null}
      {present(snapshot?.conclusion) ? <><Text style={S.sectionTitle}>Conclusión</Text><Text style={S.conclusion}>{snapshot.conclusion}</Text></> : null}
      {present(snapshot?.emisor?.nombre) || present(snapshot?.emisor?.cargo) ? <View style={S.signature}>
        <View style={{ height: 26 }} /><View style={S.signLine} />
        {present(snapshot?.emisor?.nombre) ? <Text style={S.bold}>{snapshot.emisor.nombre}</Text> : null}
        {present(snapshot?.emisor?.cargo) ? <Text style={S.muted}>{snapshot.emisor.cargo}</Text> : null}
        {present(snapshot?.emitido_en) ? <Text style={S.muted}>{dateLabel(snapshot.emitido_en)}</Text> : null}
      </View> : null}
      <Text style={S.footer} fixed render={({ pageNumber, totalPages }) => `Generado con TIDEO ERP · Este informe no contiene valores económicos · Página ${pageNumber} de ${totalPages}`} />
    </Page>
  </Document>;
}

export async function generarPdfInforme(snapshot) {
  const { pdf } = await import('@react-pdf/renderer');
  const imagenes = await prepararImagenesInforme(snapshot);
  const blob = await pdf(<InformePdf snapshot={snapshot} imagenes={imagenes} />).toBlob();
  return { blob, warnings: imagenes.warnings || [] };
}
