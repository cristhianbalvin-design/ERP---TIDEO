import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { fechaVisible, porcentaje, numero, plural, nombre, ETIQUETAS, mes } from './dashboardGerencialFormato.js';

Font.registerHyphenationCallback((palabra) => [palabra]);

const textoPdf = (valor) => {
  if (valor == null) return 'Sin dato';
  return String(valor)
    .replace(/\u2265/g, 'm\u00ednimo')
    .replace(/\u2264/g, 'm\u00e1ximo')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x00-\xFF]/g, '?');
};

const s = StyleSheet.create({
  page: { padding: 34, paddingBottom: 56, fontSize: 8, color: '#1F2937', fontFamily: 'Helvetica' },
  head: { flexDirection: 'row', justifyContent: 'space-between', borderBottom: '2 solid #00ACC1',
    paddingBottom: 12, marginBottom: 12 },
  brand: { fontSize: 18, fontWeight: 'bold', color: '#1A2B4A' },
  title: { fontSize: 13, fontWeight: 'bold', textAlign: 'right' },
  meta: { lineHeight: 1.6, marginBottom: 5 },
  section: { marginTop: 14, marginBottom: 5, fontSize: 11, fontWeight: 'bold', color: '#1A2B4A' },
  row: { flexDirection: 'row', borderBottom: '1 solid #E4E7EB', paddingVertical: 5 },
  th: { backgroundColor: '#EEF0F3', fontWeight: 'bold' },
  cell: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 4 },
  detail: { color: '#6B7280', marginTop: 2 },
  low: { color: '#B91C1C', fontWeight: 'bold' },
  foot: { position: 'absolute', bottom: 20, left: 34, right: 34, color: '#6B7280',
    fontSize: 7, textAlign: 'center' },
});

function Tabla({ titulo, columnas, filas, vacio = 'No hay datos para el período seleccionado.' }) {
  return (
    <View wrap={filas.length > 12}>
      <Text style={s.section} minPresenceAhead={60}>{textoPdf(titulo)}</Text>
      {filas.length ? (
        <View>
          <View style={[s.row, s.th]} wrap={false} minPresenceAhead={30}>
            {columnas.map((c) => <Text style={s.cell} key={c}>{textoPdf(c)}</Text>)}
          </View>
          {filas.map((fila, i) => (
            <View style={s.row} key={i} wrap={false}>
              {fila.map((celda, j) => (
                <Text style={[s.cell, celda?.bajo && s.low]} key={j}>
                  {textoPdf(celda?.texto ?? celda)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : <Text>{textoPdf(vacio)}</Text>}
    </View>
  );
}

export function DashboardGerencialPdf({ datos, entidad, rango, moneda, indicadores, alertas, dinero }) {
  const k = datos.kpi || {};
  const partes = [
    ['Mano de obra', datos.composicion?.mano_obra],
    ['Repuestos y materiales', datos.composicion?.materiales],
    ['Servicios de terceros', datos.composicion?.terceros],
    ['Logística', datos.composicion?.logistica],
    ['Otros', datos.composicion?.otros],
  ];
  const total = partes.reduce((sum, [, valor]) => sum + Number(valor || 0), 0);
  const etiquetas = ['Resumen', 'Costos y rentabilidad', 'Flota y confiabilidad'];
  const bajoMeta = (valor, meta) => valor != null && meta != null && Number(valor) < Number(meta);
  return (
    <Document title="Dashboard gerencial de Operaciones">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View><Text style={s.brand}>TIDEO.</Text><Text>Tideo Tech &amp; Strategy</Text></View>
          <Text style={s.title}>Dashboard gerencial de Operaciones</Text>
        </View>
        <Text style={s.meta}>
          Entidad: {textoPdf(entidad || 'Sin dato')} {'\u00b7'} Período: {textoPdf(fechaVisible(rango.desde))} -
          {' '}{textoPdf(fechaVisible(rango.hasta))}
          {'\n'}Moneda: {textoPdf(moneda)} {'\u00b7'} Generado: {textoPdf(new Date().toLocaleString('es-PE'))}
        </Text>
        {indicadores.map((grupo, i) => (
          <View key={etiquetas[i]} wrap={grupo.length > 12}>
            <Text style={s.section} minPresenceAhead={60}>{textoPdf(etiquetas[i])}</Text>
            {grupo.map(([label, valor, detalle]) => (
              <View style={s.row} key={label} wrap={false}>
                <Text style={s.cell}>{textoPdf(label)}</Text>
                <View style={s.cell}>
                  <Text>{textoPdf(valor)}</Text><Text style={s.detail}>{textoPdf(detalle ?? '')}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}
        <Tabla titulo="Centro de alertas" columnas={['Nivel', 'Alerta', 'Detalle']}
          filas={alertas} vacio="Todo en orden. No hay alertas en este período." />
        <Tabla titulo="Ingreso atribuible vs. costo operativo por mes" columnas={['Mes', 'Ingreso', 'Costo']}
          filas={(datos.por_mes || []).map((r) => [mes(r.mes), dinero(r.ingreso), dinero(r.costo)])} />
        <Tabla titulo="OT por estado" columnas={['Estado', 'OT']}
          filas={(datos.ot_estado || []).map((r) => [ETIQUETAS.estado[r.estado] || nombre(r.estado), numero(r.n)])} />
        <Tabla titulo="OT por tipo de trabajo" columnas={['Tipo', 'OT']}
          filas={(datos.ot_tipo || []).map((r) => [ETIQUETAS.tipo[r.tipo] || nombre(r.tipo), numero(r.n)])} />
        <Tabla titulo="Backlog abierto" columnas={['Prioridad', 'Ítems', 'Más antiguo']}
          filas={(datos.backlog || []).map((r) => [
            nombre(r.prioridad), numero(r.n), `${numero(r.max_dias)} ${plural(r.max_dias, 'día', 'días')}`,
          ])} vacio="No hay backlog abierto." />
        <Tabla titulo="OT con menor margen" columnas={['OT', 'Servicio · cliente', 'Ingreso', 'Costo', 'Margen']}
          filas={(datos.menor_margen || []).map((r) => [
            r.numero || 'Sin dato', `${r.servicio || 'Sin servicio'} · ${r.cliente || 'Sin cliente'}`,
            dinero(r.ingreso), dinero(r.costo), porcentaje(r.margen),
          ])} vacio="No hay OT de clientes cerradas con ingreso." />
        <Tabla titulo="Composición del costo" columnas={['Concepto', 'Importe', 'Porcentaje']}
          filas={total ? partes.map(([label, valor]) => [
            label, dinero(valor), porcentaje(100 * Number(valor || 0) / total),
          ])
            : []} />
        <Tabla titulo="DMR por mes" columnas={['Mes', 'DMR', 'Meta ponderada']}
          filas={(datos.dmr_mes || []).map((r) => [
            mes(r.mes), { texto: `${porcentaje(r.dmr)}${bajoMeta(r.dmr, k.dmr_meta) ? ' · Bajo meta' : ''}`,
              bajo: bajoMeta(r.dmr, k.dmr_meta) }, porcentaje(k.dmr_meta),
          ])} />
        <Tabla titulo="DMR por equipo" columnas={['Equipo · contrato', 'DMR', 'Meta']}
          filas={(datos.dmr_equipo || []).map((r) => [
            `${r.equipo || 'Sin equipo'} · ${r.contrato || 'Sin contrato'}`,
            { texto: `${porcentaje(r.dmr)}${bajoMeta(r.dmr, r.meta) ? ' · Bajo meta' : ''}`,
              bajo: bajoMeta(r.dmr, r.meta) }, porcentaje(r.meta),
          ])} vacio="No hay datos de DMR por equipo." />
        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) =>
          `Documento generado desde OPERA · Cifras calculadas con los datos registrados al momento de generarlo.\n` +
          `Página ${pageNumber} de ${totalPages}`
        } />
      </Page>
    </Document>
  );
}
