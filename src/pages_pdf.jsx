import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { currencySymbol, normalizeCurrency } from './lib/currency.js';
import { renderTextoComercial } from './lib/textoComercial.js';

const fmt = (n, sym = 'S/') =>
  sym + ' ' + (n != null ? Number(n).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0');

function makeStyles(primary, secondary) {
  return StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', paddingTop: 32, paddingRight: 40, paddingBottom: 64, paddingLeft: 40 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    logo: { width: 110, height: 44, objectFit: 'contain', objectPosition: 'left center' },
    companyMeta: { textAlign: 'right' },
    companyMetaLine: { fontSize: 8, color: secondary, lineHeight: 1.6 },
    titleWrap: { textAlign: 'center', marginBottom: 14 },
    titleMain: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: primary, letterSpacing: 1.5 },
    titleSub: { fontSize: 10, color: secondary, marginTop: 3 },
    sep: { borderBottomWidth: 1, borderColor: '#dde3ea', marginVertical: 10 },
    secLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: primary, letterSpacing: 0.8, marginBottom: 6 },
    twoCol: { flexDirection: 'row', gap: 16 },
    infoBox: { flex: 1, borderWidth: 1, borderColor: '#e4eaf0', borderRadius: 4, padding: 10 },
    boxLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: secondary, letterSpacing: 0.5, marginBottom: 5 },
    boxPrimary: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 3 },
    boxSmall: { fontSize: 8, color: '#555', marginBottom: 2 },
    detRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    detLabel: { fontSize: 8, color: '#666' },
    detVal: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
    tableWrap: { marginTop: 4 },
    tHead: { flexDirection: 'row', backgroundColor: primary, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 2 },
    tHeadCell: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    tRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#f2f2f2' },
    tRowAlt: { backgroundColor: '#f9fafb' },
    tCell: { fontSize: 8.5 },
    tCellBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
    tNum: { textAlign: 'right' },
    sepRow: { backgroundColor: '#f0f4f8', paddingVertical: 4, paddingHorizontal: 8 },
    sepRowText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: secondary },
    totBox: { backgroundColor: '#f5f8fc', borderRadius: 4, padding: 12, marginTop: 10 },
    totRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    totLabel: { fontSize: 8.5, color: '#555' },
    totVal: { fontSize: 8.5 },
    totFinal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7, borderTopWidth: 1, borderColor: '#cdd5de', marginTop: 3 },
    totFinalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: primary },
    totFinalVal: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: primary },
    condTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: primary, marginBottom: 10 },
    condKey: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: secondary, marginBottom: 2 },
    condVal: { fontSize: 8, color: '#444', lineHeight: 1.5, marginBottom: 10 },
    warnBox: { backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#f9a825', borderRadius: 4, padding: 8, marginBottom: 10 },
    warnText: { fontSize: 8.5, color: '#5d4037' },
    glosaBox: { backgroundColor: '#f0f5ff', borderLeftWidth: 3, borderColor: primary, padding: 8, marginTop: 10, marginBottom: 14 },
    glosaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: secondary, marginBottom: 3 },
    glosaText: { fontFamily: 'Helvetica-Oblique', fontSize: 8.5, color: '#334' },
    closing: { fontSize: 9, lineHeight: 1.65, color: '#444', marginBottom: 20 },
    sigRow: { flexDirection: 'row', gap: 20, marginTop: 24 },
    sigBox: { flex: 1, borderWidth: 1, borderColor: '#dde3ea', borderRadius: 4, padding: 12, alignItems: 'center' },
    sigSubtitle: { fontSize: 7.5, color: secondary, marginBottom: 10 },
    sigImg: { height: 48, objectFit: 'contain', marginBottom: 4, maxWidth: 120 },
    sigLine: { borderBottomWidth: 1, borderColor: '#555', width: '75%', marginVertical: 6 },
    sigName: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 3 },
    sigRole: { fontSize: 8, color: '#555', marginTop: 2 },
    sigEmail: { fontSize: 7.5, color: secondary, marginTop: 2 },
    sigDateLine: { borderBottomWidth: 1, borderColor: '#ccc', width: '55%', marginTop: 12 },
    sigDateLabel: { fontSize: 7, color: '#bbb', marginTop: 2 },
    qrWrap: { alignItems: 'center', marginTop: 28 },
    qrImg: { width: 96, height: 96 },
    qrCaption: { textAlign: 'center', color: secondary, fontSize: 7.5, marginTop: 5 },
    footer: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTopWidth: 1, borderColor: '#dde3ea', paddingTop: 5, textAlign: 'center', fontSize: 7, color: secondary },
  });
}

function Footer({ S, cfg }) {
  const parts = [cfg?.razon_social, cfg?.sitio_web, cfg?.email_comercial, cfg?.direccion].filter(Boolean);
  return (
    <View style={S.footer} fixed>
      <Text>{parts.join('  ·  ')}</Text>
    </View>
  );
}

const boletaStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#172033', padding: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#ccd5e0', paddingBottom: 12, marginBottom: 14 },
  logo: { width: 105, height: 42, objectFit: 'contain', objectPosition: 'left center' },
  company: { textAlign: 'right', maxWidth: 270 },
  companyName: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  muted: { color: '#667085', fontSize: 8, marginTop: 3 },
  title: { textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 15, marginBottom: 14 },
  info: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: '#e0e6ed', borderRadius: 4, padding: 9 },
  label: { color: '#667085', fontSize: 7.5, marginBottom: 3 },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  section: { fontFamily: 'Helvetica-Bold', backgroundColor: '#eef3f8', padding: 6, marginTop: 8, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderColor: '#edf0f4' },
  total: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 10, backgroundColor: '#eaf8ef', borderRadius: 4 },
  totalText: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#167344' },
  signature: { marginTop: 36, alignItems: 'center', width: 220, alignSelf: 'center' },
  signatureImage: { width: 120, height: 48, objectFit: 'contain', marginBottom: 4 },
  signatureLine: { borderTopWidth: 1, borderColor: '#667085', width: 180, paddingTop: 5, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, textAlign: 'center', fontSize: 7, color: '#8893a2' },
});

const montoBoleta = value => `S/ ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BoletaPagoPDF({ calculo, periodo, emisor }) {
  const trabajador = calculo?.trabajador || {};
  const regimen = String(calculo?.regimen_jornada || '');
  const esNominaMinera = regimen === 'ciclo_acumulativo' || regimen.startsWith('minero_') || regimen.startsWith('Mixto');
  const ingresos = [
    ['Sueldo base', calculo?.sueldo_base],
    ['Asignación familiar', calculo?.asignacion_familiar],
    ['Horas extra', calculo?.add_horas_extra],
    ['Bonificación por altitud', calculo?.bonif_altitud],
    ...(Number(calculo?.gratificacion_pagada) > 0
      ? [['Gratificación real', calculo.gratificacion_pagada]]
      : []),
    ...(Number(calculo?.bonif_extraordinaria_pagada) > 0
      ? [['Bonif. extraordinaria', calculo.bonif_extraordinaria_pagada]]
      : []),
    ['Otros ingresos no remunerativos', calculo?.otros_ingresos],
  ].filter(([, value], index) => index === 0 || Number(value) !== 0);
  const descuentos = [
    ['Faltas', calculo?.desc_faltas],
    ['Tardanzas', calculo?.desc_tardanzas],
    ['Aporte AFP', calculo?.aporte_afp],
    ['Comisión AFP', calculo?.comision_flujo],
    ['Prima de seguro AFP', calculo?.prima_seguro],
    ['ONP', calculo?.desc_onp],
    ...(esNominaMinera ? [['FCJMMS', calculo?.fcjmms_trabajador]] : []),
    ['IR 5ta categoría', calculo?.retencion_ir],
    ['Préstamos', calculo?.desc_prestamo],
    ['Otros descuentos', calculo?.desc_extraordinario],
  ].filter(([, value]) => Number(value) !== 0);

  return (
    <Document>
      <Page size="A4" style={boletaStyles.page}>
        <View style={boletaStyles.header}>
          <View>{emisor?.logo_url ? <Image src={emisor.logo_url} style={boletaStyles.logo} /> : null}</View>
          <View style={boletaStyles.company}>
            <Text style={boletaStyles.companyName}>{emisor?.razon_social || emisor?.nombre || 'Empresa'}</Text>
            {emisor?.ruc ? <Text style={boletaStyles.muted}>RUC: {emisor.ruc}</Text> : null}
            {emisor?.direccion_fiscal || emisor?.direccion ? <Text style={boletaStyles.muted}>{emisor.direccion_fiscal || emisor.direccion}</Text> : null}
          </View>
        </View>
        <Text style={boletaStyles.title}>BOLETA DE PAGO</Text>
        <View style={boletaStyles.info}>
          <View style={boletaStyles.infoBox}><Text style={boletaStyles.label}>TRABAJADOR</Text><Text style={boletaStyles.value}>{trabajador.nombre || '—'}</Text><Text style={boletaStyles.muted}>{trabajador.cargo || 'Sin cargo'}</Text></View>
          <View style={boletaStyles.infoBox}><Text style={boletaStyles.label}>PERÍODO</Text><Text style={boletaStyles.value}>{periodo?.periodo || '—'}</Text><Text style={boletaStyles.muted}>{periodo?.fecha_inicio || '—'} al {periodo?.fecha_fin || '—'}</Text></View>
        </View>
        <Text style={boletaStyles.section}>INGRESOS</Text>
        {ingresos.map(([label, value]) => <View key={label} style={boletaStyles.row}><Text>{label}</Text><Text>{montoBoleta(value)}</Text></View>)}
        <View style={boletaStyles.row}><Text style={boletaStyles.value}>Remuneración bruta</Text><Text style={boletaStyles.value}>{montoBoleta(calculo?.remuneracion_bruta)}</Text></View>
        <Text style={boletaStyles.section}>DESCUENTOS</Text>
        {descuentos.length ? descuentos.map(([label, value]) => <View key={label} style={boletaStyles.row}><Text>{label}</Text><Text>-{montoBoleta(value)}</Text></View>) : <Text style={boletaStyles.muted}>Sin descuentos.</Text>}
        <View style={boletaStyles.total}><Text style={boletaStyles.totalText}>NETO A PAGAR</Text><Text style={boletaStyles.totalText}>{montoBoleta(calculo?.neto)}</Text></View>
        <View style={boletaStyles.signature}>
          {emisor?.firma_url ? <Image src={emisor.firma_url} style={boletaStyles.signatureImage} /> : null}
          <Text style={boletaStyles.signatureLine}>Empleador · {emisor?.razon_social || emisor?.nombre || 'Empresa'}</Text>
        </View>
        <Text style={boletaStyles.footer}>Documento generado por TIDEO ERP. Los cálculos son referenciales y deben validarse antes de procesar pagos.</Text>
      </Page>
    </Document>
  );
}

export function HojaCostooPDF({ hc, opp, cuenta, cfg }) {
  const primary = cfg?.color_primario || '#1A2B4A';
  const secondary = cfg?.color_secundario || '#607D8B';
  const S = makeStyles(primary, secondary);
  const moneda = normalizeCurrency(hc.moneda || opp?.moneda || 'PEN');
  const s = currencySymbol(moneda);

  const calcSub = list => (list || []).reduce((acc, i) => acc + (Number(i.cantidad || 0) * Number(i.costo_unitario || 0)), 0);
  const totalMO = calcSub(hc.mano_obra);
  const totalMat = calcSub(hc.materiales);
  const totalST = calcSub(hc.servicios_terceros);
  const totalLog = calcSub(hc.logistica);
  const totalCosto = totalMO + totalMat + totalST + totalLog;
  const margen = Math.min(Math.max(Number(hc.margen_objetivo_pct || 35), 0), 95);
  const precioSinIgv = margen < 100 ? totalCosto / (1 - margen / 100) : totalCosto;
  const precioConIgv = precioSinIgv * 1.18;
  const estadoLabel = String(hc.estado || 'borrador').replace('_', ' ').toUpperCase();

  const renderSeccion = (titulo, items) => {
    if (!items || items.length === 0) return null;
    return (
      <View style={{ marginBottom: 10 }}>
        <Text style={[S.secLabel, { marginBottom: 4 }]}>{titulo.toUpperCase()}</Text>
        <View style={S.tableWrap}>
          <View style={S.tHead}>
            <Text style={[S.tHeadCell, { flex: 1 }]}>Descripción</Text>
            <Text style={[S.tHeadCell, { width: 38, textAlign: 'right' }]}>Cant.</Text>
            <Text style={[S.tHeadCell, { width: 42, textAlign: 'center' }]}>Unidad</Text>
            <Text style={[S.tHeadCell, { width: 70, textAlign: 'right' }]}>C. Unit.</Text>
            <Text style={[S.tHeadCell, { width: 70, textAlign: 'right' }]}>Subtotal</Text>
          </View>
          {items.map((item, i) => (
            <View key={item.id || i} style={[S.tRow, i % 2 !== 0 ? S.tRowAlt : {}]}>
              <Text style={[S.tCell, { flex: 1 }]}>{item.descripcion || '—'}</Text>
              <Text style={[S.tCell, { width: 38, textAlign: 'right' }]}>{item.cantidad}</Text>
              <Text style={[S.tCell, { width: 42, textAlign: 'center' }]}>{item.unidad || '—'}</Text>
              <Text style={[S.tCell, { width: 70, textAlign: 'right' }]}>{fmt(item.costo_unitario, s)}</Text>
              <Text style={[S.tCell, S.tCellBold, { width: 70, textAlign: 'right' }]}>{fmt(Number(item.cantidad || 0) * Number(item.costo_unitario || 0), s)}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          {cfg?.logo_url
            ? <Image src={cfg.logo_url} style={S.logo} />
            : <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 13, color: primary }}>{cfg?.razon_social || 'EMPRESA'}</Text>
          }
          <View style={S.companyMeta}>
            {cfg?.email_comercial && <Text style={S.companyMetaLine}>{cfg.email_comercial}</Text>}
            {cfg?.sitio_web       && <Text style={S.companyMetaLine}>{cfg.sitio_web}</Text>}
            {cfg?.ruc             && <Text style={S.companyMetaLine}>RUC: {cfg.ruc}</Text>}
            {cfg?.direccion       && <Text style={S.companyMetaLine}>{cfg.direccion}</Text>}
          </View>
        </View>
        <View style={S.titleWrap}>
          <Text style={S.titleMain}>HOJA DE COSTEO</Text>
          <Text style={S.titleSub}>{hc.numero}  ·  {estadoLabel}</Text>
        </View>
        <View style={S.sep} />
        <View style={[S.twoCol, { marginBottom: 14 }]}>
          <View style={S.infoBox}>
            <Text style={S.boxLabel}>CLIENTE</Text>
            <Text style={S.boxPrimary}>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</Text>
            {cuenta?.ruc   && <Text style={S.boxSmall}>RUC: {cuenta.ruc}</Text>}
            {opp?.nombre   && <Text style={S.boxSmall}>Oportunidad: {opp.nombre}</Text>}
          </View>
          <View style={S.infoBox}>
            <Text style={S.boxLabel}>DETALLES DEL COSTEO</Text>
            <View style={S.detRow}><Text style={S.detLabel}>N° hoja</Text><Text style={S.detVal}>{hc.numero}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>Estado</Text><Text style={S.detVal}>{estadoLabel}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>Moneda</Text><Text style={S.detVal}>{moneda}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>Responsable</Text><Text style={S.detVal}>{hc.responsable_costeo || '—'}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>Margen objetivo</Text><Text style={S.detVal}>{margen}%</Text></View>
          </View>
        </View>
        {renderSeccion('Mano de Obra', hc.mano_obra)}
        {renderSeccion('Materiales e Insumos', hc.materiales)}
        {renderSeccion('Servicios Terceros / Alquileres', hc.servicios_terceros)}
        {renderSeccion('Logística y Viáticos', hc.logistica)}
        <View style={S.sep} />
        <Text style={[S.secLabel, { marginBottom: 6 }]}>RESUMEN ECONÓMICO</Text>
        <View style={[S.twoCol, { gap: 16 }]}>
          <View style={[S.totBox, { flex: 1 }]}>
            {totalMO  > 0 && <View style={S.totRow}><Text style={S.totLabel}>Mano de obra</Text><Text style={S.totVal}>{fmt(totalMO, s)}</Text></View>}
            {totalMat > 0 && <View style={S.totRow}><Text style={S.totLabel}>Materiales</Text><Text style={S.totVal}>{fmt(totalMat, s)}</Text></View>}
            {totalST  > 0 && <View style={S.totRow}><Text style={S.totLabel}>Servicios terceros</Text><Text style={S.totVal}>{fmt(totalST, s)}</Text></View>}
            {totalLog > 0 && <View style={S.totRow}><Text style={S.totLabel}>Logística</Text><Text style={S.totVal}>{fmt(totalLog, s)}</Text></View>}
            <View style={S.totFinal}>
              <Text style={S.totFinalLabel}>Costo total estimado</Text>
              <Text style={S.totFinalVal}>{fmt(totalCosto, s)}</Text>
            </View>
          </View>
          <View style={[S.totBox, { flex: 1 }]}>
            <View style={S.totRow}><Text style={S.totLabel}>Margen objetivo</Text><Text style={S.totVal}>{margen}%</Text></View>
            <View style={S.totRow}><Text style={S.totLabel}>Precio sugerido s/ IGV</Text><Text style={S.totVal}>{fmt(precioSinIgv, s)}</Text></View>
            <View style={S.totFinal}>
              <Text style={S.totFinalLabel}>Precio sugerido c/ IGV</Text>
              <Text style={S.totFinalVal}>{fmt(precioConIgv, s)}</Text>
            </View>
          </View>
        </View>
        {hc.notas && (
          <>
            <View style={[S.sep, { marginTop: 10 }]} />
            <Text style={[S.secLabel, { marginBottom: 4 }]}>NOTAS INTERNAS</Text>
            <Text style={{ fontSize: 8.5, color: '#444', lineHeight: 1.6 }}>{hc.notas}</Text>
          </>
        )}
        <Footer S={S} cfg={cfg} />
      </Page>
    </Document>
  );
}

export function CotizacionPDF({ cot, cuenta, contacto, opp, cfg, qrDataUrl }) {
  const primary   = cfg?.color_primario   || '#1A2B4A';
  const secondary = cfg?.color_secundario || '#607D8B';
  const S   = makeStyles(primary, secondary);
  const moneda = normalizeCurrency(cot.moneda);
  const s   = currencySymbol(moneda);
  const items = cot.items || cot.partidas || [];
  const pRec = items.filter(p => p.tipo === 'recurrente' && !p.incluido);
  const hayRec = pRec.length > 0;
  const validezEsFecha = cot.validez_tipo === 'fecha_exacta' && cot.validez_fecha;
  const validezTexto = validezEsFecha
    ? `Válida únicamente el ${cot.validez_fecha}`
    : cot.validez_dias ? `${cot.validez_dias} días` : cot.validez || '—';
  const hayHitos = cot.hitos_activos && cot.hitos_pago?.length > 0;
  const textoCtx = { empresa: cfg, cuenta, cliente: cuenta, contacto, cotizacion: cot, oportunidad: opp };
  const renderComercial = texto => renderTextoComercial(texto, textoCtx);
  const glosa = renderComercial(cot.glosa_factura || cfg?.cond_glosa_factura);
  const CONDS = [
    ['cond_forma_pago',       'Forma de pago y datos bancarios'],
    ['cond_validez',          'Validez de la oferta'],
    ['cond_penalidad',        'Penalidad por mora'],
    ['cond_inicio_proyecto',  'Inicio del proyecto'],
    ['cond_alcance',          'Alcance y exclusiones'],
    ['cond_integraciones',    'Integraciones externas'],
    ['cond_confidencialidad', 'Confidencialidad'],
  ].filter(([k]) => cot[k] || cfg?.[k]);
  const hasPage2 = hayHitos || glosa || CONDS.length > 0;
  const closingText = `Quedamos atentos a cualquier consulta. La presente cotización tiene validez ${validezTexto.toLowerCase()}. Para formalizar la contratación puede aceptarla digitalmente escaneando el código QR adjunto o comunicarse con su ejecutivo asignado.`;

  // Separar partidas implementación vs recurrente para la fila divisoria
  let lastWasImpl = false;

  return (
    <Document>

      {/* ══ PÁGINA 1: Encabezado + Partidas ══ */}
      <Page size="A4" style={S.page}>

        {/* Encabezado */}
        <View style={S.header}>
          {cfg?.logo_url
            ? <Image src={cfg.logo_url} style={S.logo} />
            : <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 13, color: primary }}>{cfg?.razon_social || 'EMPRESA'}</Text>
          }
          <View style={S.companyMeta}>
            {cfg?.email_comercial && <Text style={S.companyMetaLine}>{cfg.email_comercial}</Text>}
            {cfg?.sitio_web       && <Text style={S.companyMetaLine}>{cfg.sitio_web}</Text>}
            {cfg?.ruc             && <Text style={S.companyMetaLine}>RUC: {cfg.ruc}</Text>}
            {cfg?.direccion       && <Text style={S.companyMetaLine}>{cfg.direccion}</Text>}
          </View>
        </View>

        {/* Título */}
        <View style={S.titleWrap}>
          <Text style={S.titleMain}>COTIZACIÓN DE SERVICIOS</Text>
          <Text style={S.titleSub}>{cot.numero}  v{cot.version || 1}</Text>
        </View>
        <View style={S.sep} />

        {/* Cliente + Detalles */}
        <View style={[S.twoCol, { marginBottom: 14 }]}>
          <View style={S.infoBox}>
            <Text style={S.boxLabel}>CLIENTE</Text>
            <Text style={S.boxPrimary}>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</Text>
            {cuenta?.ruc        && <Text style={S.boxSmall}>RUC: {cuenta.ruc}</Text>}
            {contacto?.nombre   && <Text style={S.boxSmall}>Attn.: {contacto.nombre}</Text>}
          </View>
          <View style={S.infoBox}>
            <Text style={S.boxLabel}>DETALLES DE LA COTIZACIÓN</Text>
            <View style={S.detRow}><Text style={S.detLabel}>Fecha de emisión</Text><Text style={S.detVal}>{cot.fecha}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>N° cotización</Text><Text style={S.detVal}>{cot.numero} v{cot.version || 1}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>Validez</Text><Text style={S.detVal}>{validezTexto}</Text></View>
            <View style={S.detRow}><Text style={S.detLabel}>Moneda</Text><Text style={S.detVal}>{moneda}</Text></View>
          </View>
        </View>

        {/* Descripción */}
        {cot.descripcion_general && (
          <>
            <View style={S.sep} />
            <Text style={S.secLabel}>DESCRIPCIÓN DEL SERVICIO</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.6, color: '#333', marginBottom: 12 }}>{renderComercial(cot.descripcion_general)}</Text>
          </>
        )}

        <View style={S.sep} />

        {/* Tabla partidas */}
        <Text style={[S.secLabel, { marginBottom: 6 }]}>PARTIDAS</Text>
        <View style={S.tableWrap}>
          <View style={S.tHead}>
            <Text style={[S.tHeadCell, { width: 22 }]}>N°</Text>
            <Text style={[S.tHeadCell, { flex: 1 }]}>Descripción</Text>
            <Text style={[S.tHeadCell, { width: 70, textAlign: 'right' }]}>Precio unit.</Text>
            <Text style={[S.tHeadCell, { width: 75, textAlign: 'right' }]}>Total</Text>
          </View>
          {items.map((p, i) => {
            const isRec = p.tipo === 'recurrente' && !p.incluido;
            const showSepRow = isRec && !lastWasImpl;
            lastWasImpl = !isRec;
            const subItems = (Array.isArray(p.detalle_items) ? p.detalle_items : [])
              .concat(
                !p.detalle_items && typeof p.descripcion === 'string' && p.descripcion.includes('\n')
                  ? p.descripcion.split('\n').slice(1)
                  : []
              );
            const mainDesc = p.nombre || (typeof p.descripcion === 'string' ? p.descripcion.split('\n')[0] : p.descripcion) || '—';
            return (
              <View key={p.id || i} wrap={false}>
                {isRec && i > 0 && items[i - 1].tipo !== 'recurrente' && (
                  <View style={S.sepRow}>
                    <Text style={S.sepRowText}>Servicios recurrentes</Text>
                  </View>
                )}
                <View style={[S.tRow, i % 2 !== 0 ? S.tRowAlt : {}]}>
                  <Text style={[S.tCell, { width: 22, color: '#888' }]}>{p.n || i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={S.tCellBold}>{renderComercial(mainDesc)}</Text>
                    {subItems.map((sub, si) => (
                      <Text key={si} style={{ fontSize: 7.5, color: '#555', marginTop: 1.5 }}>
                        {'• '}{renderComercial(typeof sub === 'string' ? sub.trim() : sub.nombre || sub)}
                      </Text>
                    ))}
                  </View>
                  <Text style={[S.tCell, { width: 70, textAlign: 'right' }]}>
                    {p.incluido ? 'Incluido' : fmt(p.precio_unitario || 0, s)}
                  </Text>
                  <Text style={[S.tCell, S.tCellBold, { width: 75, textAlign: 'right' }]}>
                    {p.incluido ? '—' : fmt(p.total || (Number(p.cantidad || 1) * Number(p.precio_unitario || 0)), s)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Totales */}
        <View style={[S.twoCol, { marginTop: 14 }]}>
          <View style={{ flex: 1 }}>
            {hayRec && <Text style={[S.secLabel, { marginBottom: 4 }]}>IMPLEMENTACIÓN</Text>}
            <View style={S.totBox}>
              <View style={S.totRow}>
                <Text style={S.totLabel}>Subtotal s/ IGV</Text>
                <Text style={S.totVal}>{fmt(cot.subtotal_impl ?? cot.subtotal, s)}</Text>
              </View>
              <View style={S.totRow}>
                <Text style={S.totLabel}>IGV ({cot.igv_pct || 18}%)</Text>
                <Text style={S.totVal}>{fmt(cot.igv_impl ?? cot.igv, s)}</Text>
              </View>
              <View style={S.totFinal}>
                <Text style={S.totFinalLabel}>Total</Text>
                <Text style={S.totFinalVal}>{fmt(cot.total_impl ?? cot.total, s)}</Text>
              </View>
            </View>
          </View>
          {hayRec && (
            <View style={{ flex: 1 }}>
              <Text style={[S.secLabel, { marginBottom: 4 }]}>RECURRENTE MENSUAL</Text>
              <View style={S.totBox}>
                <View style={S.totRow}>
                  <Text style={S.totLabel}>Subtotal s/ IGV</Text>
                  <Text style={S.totVal}>{fmt(cot.subtotal_rec, s)}/mes</Text>
                </View>
                <View style={S.totRow}>
                  <Text style={S.totLabel}>IGV ({cot.igv_pct || 18}%)</Text>
                  <Text style={S.totVal}>{fmt(cot.igv_rec, s)}/mes</Text>
                </View>
                <View style={S.totFinal}>
                  <Text style={S.totFinalLabel}>Total mensual</Text>
                  <Text style={S.totFinalVal}>{fmt(cot.total_rec, s)}/mes</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <Footer S={S} cfg={cfg} />
      </Page>

      {/* ══ PÁGINA 2: Condiciones (solo si hay contenido) ══ */}
      {hasPage2 && (
        <Page size="A4" style={S.page}>

          {/* Plan de pagos */}
          {hayHitos && (
            <>
              <Text style={[S.secLabel, { marginBottom: 6 }]}>PLAN DE PAGOS</Text>
              <View style={S.tableWrap}>
                <View style={S.tHead}>
                  <Text style={[S.tHeadCell, { width: 22 }]}>N°</Text>
                  <Text style={[S.tHeadCell, { flex: 1 }]}>Concepto</Text>
                  <Text style={[S.tHeadCell, { width: 44, textAlign: 'right' }]}>%</Text>
                  <Text style={[S.tHeadCell, { width: 80, textAlign: 'right' }]}>Monto</Text>
                  <Text style={[S.tHeadCell, { flex: 1, paddingLeft: 8 }]}>Condición de cobro</Text>
                </View>
                {cot.hitos_pago.map((h, i) => (
                  <View key={i} style={[S.tRow, i % 2 !== 0 ? S.tRowAlt : {}]}>
                    <Text style={[S.tCell, { width: 22, color: '#888' }]}>{i + 1}</Text>
                    <Text style={[S.tCell, S.tCellBold, { flex: 1 }]}>{renderComercial(h.concepto)}</Text>
                    <Text style={[S.tCell, { width: 44, textAlign: 'right' }]}>{h.porcentaje}%</Text>
                    <Text style={[S.tCell, S.tCellBold, { width: 80, textAlign: 'right' }]}>{fmt(h.monto, s)}</Text>
                    <Text style={[S.tCell, { flex: 1, paddingLeft: 8, color: '#555', fontSize: 8 }]}>{renderComercial(h.condicion) || '—'}</Text>
                  </View>
                ))}
              </View>
              {glosa && (
                <View style={S.glosaBox}>
                  <Text style={S.glosaLabel}>GLOSA RECOMENDADA PARA FACTURAS</Text>
                  <Text style={S.glosaText}>{glosa}</Text>
                </View>
              )}
              <View style={[S.sep, { marginVertical: 14 }]} />
            </>
          )}

          {/* Condiciones comerciales */}
          {CONDS.length > 0 && (
            <>
              <Text style={S.condTitle}>CONDICIONES COMERCIALES</Text>
              {validezEsFecha && (
                <View style={S.warnBox}>
                  <Text style={S.warnText}>
                    ⚠  Esta cotización tiene validez únicamente el {cot.validez_fecha}. Después de esa fecha deberá solicitar una nueva propuesta.
                  </Text>
                </View>
              )}
              <View style={[S.twoCol, { gap: 24 }]}>
                <View style={{ flex: 1 }}>
                  {CONDS.slice(0, Math.ceil(CONDS.length / 2)).map(([k, label]) => (
                    <View key={k}>
                      <Text style={S.condKey}>{label.toUpperCase()}</Text>
                      <Text style={S.condVal}>{renderComercial(cot[k] || cfg?.[k])}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  {CONDS.slice(Math.ceil(CONDS.length / 2)).map(([k, label]) => (
                    <View key={k}>
                      <Text style={S.condKey}>{label.toUpperCase()}</Text>
                      <Text style={S.condVal}>{renderComercial(cot[k] || cfg?.[k])}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          <Footer S={S} cfg={cfg} />
        </Page>
      )}

      {/* ══ PÁGINA FINAL: Cierre + Firmas + QR ══ */}
      <Page size="A4" style={S.page}>
        <Text style={S.secLabel}>CIERRE</Text>
        <Text style={S.closing}>{closingText}</Text>
        <View style={S.sep} />

        {/* Bloques de firma */}
        <View style={S.sigRow}>
          {/* Firmante TIDEO */}
          <View style={S.sigBox}>
            <Text style={S.sigSubtitle}>Por {cfg?.razon_social || 'Proveedor'}</Text>
            {cfg?.firma_url && <Image src={cfg.firma_url} style={S.sigImg} />}
            <View style={S.sigLine} />
            {cfg?.firmante        && <Text style={S.sigName}>{cfg.firmante}</Text>}
            {cfg?.cargo_firmante  && <Text style={S.sigRole}>{cfg.cargo_firmante}</Text>}
            {cfg?.email_comercial && <Text style={S.sigEmail}>{cfg.email_comercial}</Text>}
          </View>
          {/* Firmante cliente */}
          <View style={S.sigBox}>
            <Text style={S.sigSubtitle}>Por {cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente'}</Text>
            <View style={{ height: 48 }} />
            <View style={S.sigLine} />
            {contacto?.nombre && <Text style={S.sigName}>{contacto.nombre}</Text>}
            <Text style={S.sigRole}>Sello y firma</Text>
            <View style={S.sigDateLine} />
            <Text style={S.sigDateLabel}>Fecha</Text>
          </View>
        </View>

        {/* QR */}
        {qrDataUrl && (
          <View style={S.qrWrap}>
            <Image src={qrDataUrl} style={S.qrImg} />
            <Text style={S.qrCaption}>Escanea para revisar y aceptar esta cotización digitalmente.</Text>
          </View>
        )}

        <Footer S={S} cfg={cfg} />
      </Page>

    </Document>
  );
}

// ─── Guía de Remisión PDF ─────────────────────────────────────────────────────
// Formato SUNAT Res. 000020-2023/SUNAT — campos obligatorios marcados *SUNAT*
// OSE_FUTURE: agregar QR de firma electrónica cuando se integre el OSE
export function GuiaRemisionPDF({ guia, cfg }) {
  const primary = cfg?.color_primario || '#1A2B4A';
  const secondary = cfg?.color_secundario || '#607D8B';
  const S = makeStyles(primary, secondary);

  const grStyles = StyleSheet.create({
    badge: { borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3, fontSize: 8, fontFamily: 'Helvetica-Bold', alignSelf: 'flex-start' },
    badgeCyan: { backgroundColor: '#e0f7fa', color: '#006064' },
    badgeGreen: { backgroundColor: '#e8f5e9', color: '#1b5e20' },
    badgeOrange: { backgroundColor: '#fff3e0', color: '#e65100' },
    badgeGray: { backgroundColor: '#f0f0f0', color: '#555' },
    sectionBox: { borderWidth: 1, borderColor: '#e4eaf0', borderRadius: 4, padding: 10, marginBottom: 10 },
    sectionTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: primary, letterSpacing: 0.8, marginBottom: 6 },
    grid2: { flexDirection: 'row', gap: 12 },
    gridCell: { flex: 1 },
    fieldLabel: { fontSize: 7, color: secondary, marginBottom: 2 },
    fieldVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
    fieldValMono: { fontSize: 8.5, fontFamily: 'Helvetica', marginBottom: 6 },
    anulBanner: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 4, padding: 10, marginBottom: 10, textAlign: 'center' },
    anulText: { color: '#991b1b', fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 1 },
    oseNote: { fontSize: 7, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
  });

  const estadoBadge = {
    borrador: grStyles.badgeGray, emitida: grStyles.badgeCyan,
    en_transito: grStyles.badgeOrange, entregada: grStyles.badgeGreen,
    anulada: { backgroundColor: '#fef2f2', color: '#991b1b' },
  };
  const estadoLabel = {
    borrador: 'BORRADOR', emitida: 'EMITIDA', en_transito: 'EN TRÁNSITO',
    entregada: 'ENTREGADA', anulada: 'ANULADA',
  };
  const motivoNombre = {
    '01': 'Venta', '03': 'Traslado entre establecimientos',
    '04': 'Traslado en consignación', '05': 'Devolución',
    '17': 'Distribución de bienes', '99': 'Otros',
  };

  const lineas = guia.lineas || [];
  const pesoTotal = lineas.reduce((s, l) => s + Number(l.peso_total || (l.cantidad * (l.peso_unitario || 0)) || 0), 0);

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Encabezado empresa */}
        <View style={S.header}>
          <View>
            {cfg?.logo_url ? <Image style={S.logo} src={cfg.logo_url} /> : null}
            <Text style={[S.companyMetaLine, { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 4 }]}>{cfg?.razon_social || ''}</Text>
            <Text style={S.companyMetaLine}>RUC: {cfg?.ruc || ''}</Text>
            {cfg?.direccion ? <Text style={S.companyMetaLine}>{cfg.direccion}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {/* *SUNAT* Correlativo */}
            <View style={{ borderWidth: 1, borderColor: primary, borderRadius: 4, padding: 8, alignItems: 'center', minWidth: 140 }}>
              <Text style={{ fontSize: 8, color: secondary, marginBottom: 2 }}>GUÍA DE REMISIÓN</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: primary, letterSpacing: 1 }}>{guia.numero_completo || '—'}</Text>
              <View style={[grStyles.badge, estadoBadge[guia.estado] || grStyles.badgeGray, { marginTop: 6 }]}>
                <Text>{estadoLabel[guia.estado] || guia.estado?.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {guia.anulado && (
          <View style={grStyles.anulBanner}>
            <Text style={grStyles.anulText}>⬛ GUÍA ANULADA</Text>
            {guia.anulado_motivo ? <Text style={{ fontSize: 8, color: '#991b1b', marginTop: 4 }}>Motivo: {guia.anulado_motivo}</Text> : null}
          </View>
        )}

        <View style={S.sep} />

        {/* Fechas y clasificación */}
        <View style={grStyles.sectionBox}>
          <Text style={grStyles.sectionTitle}>DATOS DEL TRASLADO</Text>
          <View style={grStyles.grid2}>
            <View style={grStyles.gridCell}>
              {/* *SUNAT* Fecha emisión */}
              <Text style={grStyles.fieldLabel}>Fecha de emisión *</Text>
              <Text style={grStyles.fieldVal}>{guia.fecha_emision}</Text>
              {/* *SUNAT* Fecha inicio traslado */}
              <Text style={grStyles.fieldLabel}>Fecha inicio traslado *</Text>
              <Text style={grStyles.fieldVal}>{guia.fecha_inicio_traslado}</Text>
            </View>
            <View style={grStyles.gridCell}>
              {/* *SUNAT* Motivo de traslado */}
              <Text style={grStyles.fieldLabel}>Motivo de traslado *</Text>
              <Text style={grStyles.fieldVal}>{guia.motivo_traslado} — {motivoNombre[guia.motivo_traslado] || guia.motivo_traslado}</Text>
              {/* *SUNAT* Modalidad */}
              <Text style={grStyles.fieldLabel}>Modalidad de traslado *</Text>
              <Text style={grStyles.fieldVal}>{guia.modalidad === 'remitente' ? 'Por cuenta del remitente' : 'Por cuenta del transportista'}</Text>
            </View>
            <View style={grStyles.gridCell}>
              {/* *SUNAT* Peso bruto */}
              <Text style={grStyles.fieldLabel}>Peso bruto total *</Text>
              <Text style={grStyles.fieldVal}>{guia.peso_bruto_total || pesoTotal.toFixed(3)} {guia.unidad_peso || 'KGM'}</Text>
              {guia.orden_venta_id || guia.ot_id ? (
                <>
                  <Text style={grStyles.fieldLabel}>Documento origen</Text>
                  <Text style={grStyles.fieldVal}>{guia.orden_venta_id ? `OV: ${guia.orden_venta_id}` : `OT: ${guia.ot_id}`}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* Puntos de partida y llegada */}
        <View style={grStyles.grid2}>
          <View style={[grStyles.sectionBox, { flex: 1 }]}>
            <Text style={grStyles.sectionTitle}>PUNTO DE PARTIDA</Text>
            {/* *SUNAT* Dirección partida */}
            <Text style={grStyles.fieldLabel}>Dirección *</Text>
            <Text style={grStyles.fieldVal}>{guia.partida_direccion || '—'}</Text>
            {/* *SUNAT* Ubigeo partida */}
            {guia.partida_ubigeo ? (
              <>
                <Text style={grStyles.fieldLabel}>Ubigeo *</Text>
                <Text style={grStyles.fieldValMono}>{guia.partida_ubigeo}</Text>
              </>
            ) : null}
          </View>
          <View style={[grStyles.sectionBox, { flex: 1 }]}>
            <Text style={grStyles.sectionTitle}>PUNTO DE LLEGADA</Text>
            {/* *SUNAT* Dirección llegada */}
            <Text style={grStyles.fieldLabel}>Dirección *</Text>
            <Text style={grStyles.fieldVal}>{guia.llegada_direccion || '—'}</Text>
            {/* *SUNAT* Ubigeo llegada */}
            {guia.llegada_ubigeo ? (
              <>
                <Text style={grStyles.fieldLabel}>Ubigeo *</Text>
                <Text style={grStyles.fieldValMono}>{guia.llegada_ubigeo}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Destinatario */}
        <View style={grStyles.sectionBox}>
          <Text style={grStyles.sectionTitle}>DESTINATARIO</Text>
          <View style={grStyles.grid2}>
            <View style={grStyles.gridCell}>
              {/* *SUNAT* RUC/DNI destinatario */}
              <Text style={grStyles.fieldLabel}>RUC / DNI *</Text>
              <Text style={grStyles.fieldVal}>{guia.destinatario_ruc_dni || '—'}</Text>
            </View>
            <View style={[grStyles.gridCell, { flex: 2 }]}>
              {/* *SUNAT* Razón social destinatario */}
              <Text style={grStyles.fieldLabel}>Razón social / Nombre *</Text>
              <Text style={grStyles.fieldVal}>{guia.destinatario_razon_social || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Transportista */}
        <View style={grStyles.sectionBox}>
          <Text style={grStyles.sectionTitle}>TRANSPORTISTA</Text>
          <View style={grStyles.grid2}>
            <View style={grStyles.gridCell}>
              {/* *SUNAT* RUC transportista */}
              <Text style={grStyles.fieldLabel}>RUC *</Text>
              <Text style={grStyles.fieldValMono}>{guia.transportista_ruc || '—'}</Text>
              {/* *SUNAT* N° MTC (cuando modalidad=transportista) */}
              <Text style={grStyles.fieldLabel}>N° Reg. MTC {guia.modalidad === 'transportista' ? '*' : ''}</Text>
              <Text style={grStyles.fieldVal}>{guia.transportista_nro_mtc || '—'}</Text>
            </View>
            <View style={[grStyles.gridCell, { flex: 2 }]}>
              {/* *SUNAT* Razón social transportista */}
              <Text style={grStyles.fieldLabel}>Razón social *</Text>
              <Text style={grStyles.fieldVal}>{guia.transportista_razon_social || '—'}</Text>
            </View>
          </View>
          {guia.modalidad === 'remitente' && (
            <>
              <View style={S.sep} />
              <View style={grStyles.grid2}>
                <View style={grStyles.gridCell}>
                  {/* *SUNAT* Placa */}
                  <Text style={grStyles.fieldLabel}>Placa del vehículo *</Text>
                  <Text style={grStyles.fieldVal}>{guia.vehiculo_placa || '—'}</Text>
                  <Text style={grStyles.fieldLabel}>N° Cert. habilitación</Text>
                  <Text style={grStyles.fieldVal}>{guia.vehiculo_cert_habilitacion || '—'}</Text>
                </View>
                <View style={grStyles.gridCell}>
                  {/* *SUNAT* Conductor */}
                  <Text style={grStyles.fieldLabel}>Conductor *</Text>
                  <Text style={grStyles.fieldVal}>{guia.conductor_nombre || '—'}</Text>
                  {/* *SUNAT* DNI conductor */}
                  <Text style={grStyles.fieldLabel}>DNI conductor *</Text>
                  <Text style={grStyles.fieldValMono}>{guia.conductor_dni || '—'}</Text>
                  <Text style={grStyles.fieldLabel}>N° brevete</Text>
                  <Text style={grStyles.fieldVal}>{guia.conductor_brevete || '—'}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Detalle de bienes */}
        <View style={S.tableWrap}>
          <Text style={[S.secLabel, { marginBottom: 8 }]}>DETALLE DE BIENES</Text>
          <View style={S.tHead}>
            <Text style={[S.tHeadCell, { flex: 3 }]}>Descripción</Text>
            <Text style={[S.tHeadCell, { flex: 1 }]}>Código</Text>
            <Text style={[S.tHeadCell, { width: 36 }]}>UM</Text>
            <Text style={[S.tHeadCell, { width: 40, textAlign: 'right' }]}>Cant.</Text>
            <Text style={[S.tHeadCell, { width: 50, textAlign: 'right' }]}>Peso u.</Text>
            <Text style={[S.tHeadCell, { width: 50, textAlign: 'right' }]}>Peso tot.</Text>
          </View>
          {lineas.map((l, i) => (
            <View key={l.id || i} style={[S.tRow, i % 2 === 1 ? S.tRowAlt : {}]}>
              <Text style={[S.tCell, { flex: 3 }]}>{l.descripcion}</Text>
              <Text style={[S.tCell, { flex: 1, color: '#555' }]}>{l.codigo || '—'}</Text>
              <Text style={[S.tCell, { width: 36 }]}>{l.unidad || 'NIU'}</Text>
              <Text style={[S.tCell, S.tNum, { width: 40 }]}>{Number(l.cantidad || 0).toFixed(2)}</Text>
              <Text style={[S.tCell, S.tNum, { width: 50 }]}>{Number(l.peso_unitario || 0).toFixed(3)}</Text>
              <Text style={[S.tCellBold, S.tNum, { width: 50 }]}>{Number(l.peso_total || l.cantidad * (l.peso_unitario || 0) || 0).toFixed(3)}</Text>
            </View>
          ))}
          {lineas.length === 0 && (
            <View style={S.tRow}><Text style={[S.tCell, { color: '#999' }]}>Sin ítems</Text></View>
          )}
          {/* Fila total peso */}
          <View style={[S.tRow, { borderTopWidth: 1, borderColor: '#dde3ea', backgroundColor: '#f5f8fc' }]}>
            <Text style={[S.tCellBold, { flex: 3 }]}>TOTAL</Text>
            <Text style={[S.tCell, { flex: 1 }]}></Text>
            <Text style={[S.tCell, { width: 36 }]}>{guia.unidad_peso || 'KGM'}</Text>
            <Text style={[S.tCell, { width: 40 }]}></Text>
            <Text style={[S.tCell, { width: 50 }]}></Text>
            <Text style={[S.tCellBold, S.tNum, { width: 50, color: primary }]}>{(guia.peso_bruto_total || pesoTotal).toFixed(3)}</Text>
          </View>
        </View>

        {/* Nota OSE (campo reservado) */}
        <View style={{ marginTop: 16, padding: 8, backgroundColor: '#f9fafb', borderRadius: 3 }}>
          <Text style={grStyles.oseNote}>
            {/* OSE_FUTURE: Espacio reservado para código QR de firma electrónica (xml_hash / cdr_url) */}
            Documento pendiente de firma electrónica (OSE)
          </Text>
        </View>

        <Footer S={S} cfg={cfg} />
      </Page>
    </Document>
  );
}

// ── Papeleta de Movimiento DI-FG-48 ──────────────────────────────────────────

const papStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', padding: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  logo: { width: 90, height: 36, objectFit: 'contain' },
  titleBlock: { textAlign: 'center', flex: 1 },
  titleMain: { fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  titleSub: { fontSize: 8, color: '#555', marginTop: 2 },
  codeLabel: { fontSize: 7.5, color: '#888', marginTop: 1 },
  correlativo: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: '#1a5fa8' },
  sep: { borderBottomWidth: 1, borderColor: '#dde3ea', marginVertical: 8 },
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1a5fa8', letterSpacing: 0.8, marginBottom: 5, textTransform: 'uppercase' },
  row2: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: '#e0e7ef', borderRadius: 3, padding: 8 },
  fieldLabel: { fontSize: 6.5, color: '#888', marginBottom: 2 },
  fieldVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '30%' },
  checkbox: { width: 10, height: 10, borderWidth: 1, borderColor: '#555', borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1a5fa8' },
  checkLabel: { fontSize: 8 },
  motivoBox: { borderWidth: 1, borderColor: '#e0e7ef', borderRadius: 3, padding: 8, marginBottom: 10, minHeight: 40 },
  motivoText: { fontSize: 8.5 },
  fechasRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  fechaBox: { flex: 1, borderWidth: 1, borderColor: '#e0e7ef', borderRadius: 3, padding: 8, alignItems: 'center' },
  fechaLabel: { fontSize: 6.5, color: '#888', marginBottom: 3 },
  fechaVal: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  firmasRow: { flexDirection: 'row', gap: 16, marginTop: 24 },
  firmaBox: { flex: 1, alignItems: 'center' },
  firmaLine: { borderBottomWidth: 1, borderColor: '#555', width: '100%', marginVertical: 6 },
  firmaName: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  firmaRole: { fontSize: 7, color: '#666' },
  firmaFecha: { fontSize: 7, color: '#999', marginTop: 2 },
  firmaImg: { height: 36, objectFit: 'contain', marginBottom: 2, maxWidth: 100 },
  papFooter: { position: 'absolute', bottom: 20, left: 32, right: 32, borderTopWidth: 1, borderColor: '#dde3ea', paddingTop: 4, textAlign: 'center', fontSize: 7, color: '#aaa' },
});

const CONCEPTOS_PAPELETA = [
  ['vacaciones', 'Vacaciones'],
  ['permiso_con_goce', 'Permiso con goce'],
  ['permiso_sin_goce', 'Permiso sin goce'],
  ['licencia_medica', 'Descanso médico'],
  ['licencia_maternidad', 'Lic. maternidad'],
  ['licencia_paternidad', 'Lic. paternidad'],
  ['compensacion_horas', 'Comp. de horas'],
  ['bajada', 'Bajada de mina'],
  ['comision_trabajo', 'Comisión de trabajo'],
];

const CLASIF_LABELS = [
  ['remunerado', 'Remunerado'],
  ['no_remunerado', 'No remunerado'],
  ['recuperacion_horas', 'Recuperación de horas'],
];

function PapCheckBox({ checked }) {
  return (
    <View style={papStyles.checkbox}>
      {checked && <Text style={papStyles.checkMark}>X</Text>}
    </View>
  );
}

export function PapeletaMovimientoPDF({ solicitud, empresa, emisor = {}, historial = [], persona = null }) {
  const cfg = emisor || {};
  const aprobJefe = historial.find(h => h.estado_hasta === 'aprobada_jefe');
  const confirmRrhh = historial.find(h => h.estado_hasta === 'confirmada_rrhh');
  // Las solicitudes históricas solo conservan el nombre. Completar desde la ficha permite
  // mostrar los datos laborales vigentes sin requerir una migración de registros anteriores.
  const personalDni = solicitud.personal_dni || persona?.documento || persona?.dni || '—';
  const personalArea = solicitud.personal_area || persona?.area_nombre || persona?.area || '—';
  const personalCargo = solicitud.personal_cargo || persona?.cargo_nombre || persona?.cargo || '—';

  const fechaConfirmStr = solicitud.fecha_confirmacion
    ? new Date(solicitud.fecha_confirmacion).toLocaleDateString('es-PE')
    : (confirmRrhh?.creado_en ? new Date(confirmRrhh.creado_en).toLocaleDateString('es-PE') : '—');
  const fechaAprobStr = solicitud.fecha_aprobacion_jefe
    ? new Date(solicitud.fecha_aprobacion_jefe).toLocaleDateString('es-PE')
    : (aprobJefe?.creado_en ? new Date(aprobJefe.creado_en).toLocaleDateString('es-PE') : '—');

  const cantidadLabel = solicitud.unidad === 'horas'
    ? `${solicitud.cantidad_horas || 0} horas`
    : `${solicitud.dias_habiles || 0} días hábiles`;

  return (
    <Document>
      <Page size="A4" style={papStyles.page}>
        {/* Encabezado */}
        <View style={papStyles.header}>
          {cfg.logo_url
            ? <Image src={cfg.logo_url} style={papStyles.logo} />
            : <View style={[papStyles.logo, { backgroundColor: '#f0f4f8', borderRadius: 4 }]} />
          }
          <View style={papStyles.titleBlock}>
            <Text style={papStyles.titleMain}>PAPELETA DE MOVIMIENTO</Text>
            <Text style={papStyles.titleSub}>{cfg.razon_social || empresa?.nombre || ''}</Text>
            <Text style={papStyles.codeLabel}>Código: DI-FG-48</Text>
          </View>
          <View>
            {solicitud.numero_correlativo && (
              <Text style={papStyles.correlativo}>{solicitud.numero_correlativo}</Text>
            )}
          </View>
        </View>

        <View style={papStyles.sep} />

        {/* Datos del colaborador */}
        <Text style={papStyles.sectionLabel}>Datos del colaborador</Text>
        <View style={papStyles.row2}>
          <View style={papStyles.infoBox}>
            <Text style={papStyles.fieldLabel}>NOMBRE COMPLETO</Text>
            <Text style={papStyles.fieldVal}>{solicitud.personal_nombre || '—'}</Text>
          </View>
          <View style={[papStyles.infoBox, { flex: 0.5 }]}>
            <Text style={papStyles.fieldLabel}>DNI</Text>
            <Text style={papStyles.fieldVal}>{personalDni}</Text>
          </View>
          <View style={[papStyles.infoBox, { flex: 0.5 }]}>
            <Text style={papStyles.fieldLabel}>ÁREA</Text>
            <Text style={papStyles.fieldVal}>{personalArea}</Text>
          </View>
        </View>
        <View style={papStyles.row2}>
          <View style={papStyles.infoBox}>
            <Text style={papStyles.fieldLabel}>CARGO</Text>
            <Text style={papStyles.fieldVal}>{personalCargo}</Text>
          </View>
        </View>

        <View style={papStyles.sep} />

        {/* Tipo de movimiento */}
        <Text style={papStyles.sectionLabel}>Tipo de movimiento</Text>
        <View style={papStyles.checkGrid}>
          {CONCEPTOS_PAPELETA.map(([key, label]) => (
            <View key={key} style={papStyles.checkItem}>
              <PapCheckBox checked={solicitud.tipo === key} />
              <Text style={papStyles.checkLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Clasificación de pago */}
        <Text style={[papStyles.sectionLabel, { marginTop: 4 }]}>Clasificación</Text>
        <View style={[papStyles.checkGrid, { marginBottom: 8 }]}>
          {CLASIF_LABELS.map(([key, label]) => (
            <View key={key} style={papStyles.checkItem}>
              <PapCheckBox checked={solicitud.clasificacion_pago === key} />
              <Text style={papStyles.checkLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={papStyles.sep} />

        {/* Motivo */}
        <Text style={papStyles.sectionLabel}>Motivo / Sustento</Text>
        <View style={papStyles.motivoBox}>
          <Text style={papStyles.motivoText}>{solicitud.motivo || '—'}</Text>
        </View>

        {/* Fechas y duración */}
        <View style={papStyles.fechasRow}>
          <View style={papStyles.fechaBox}>
            <Text style={papStyles.fechaLabel}>FECHA DE INICIO</Text>
            <Text style={papStyles.fechaVal}>{solicitud.fecha_inicio || '—'}</Text>
          </View>
          <View style={papStyles.fechaBox}>
            <Text style={papStyles.fechaLabel}>FECHA DE FIN</Text>
            <Text style={papStyles.fechaVal}>{solicitud.fecha_fin || '—'}</Text>
          </View>
          {solicitud.fecha_retorno && (
            <View style={papStyles.fechaBox}>
              <Text style={papStyles.fechaLabel}>RETORNO PROGRAMADO</Text>
              <Text style={papStyles.fechaVal}>{solicitud.fecha_retorno}</Text>
            </View>
          )}
          <View style={papStyles.fechaBox}>
            <Text style={papStyles.fechaLabel}>DURACIÓN</Text>
            <Text style={papStyles.fechaVal}>{cantidadLabel}</Text>
          </View>
        </View>

        {/* Firmas */}
        <View style={papStyles.firmasRow}>
          <View style={papStyles.firmaBox}>
            <View style={papStyles.firmaLine} />
            <Text style={papStyles.firmaName}>{solicitud.personal_nombre || '—'}</Text>
            <Text style={papStyles.firmaRole}>Trabajador</Text>
            <Text style={papStyles.firmaFecha}>Solicitud: {solicitud.creado_en ? new Date(solicitud.creado_en).toLocaleDateString('es-PE') : '—'}</Text>
          </View>
          <View style={papStyles.firmaBox}>
            <Text style={papStyles.firmaRole}>Jefe de área</Text>
            <Text style={papStyles.firmaFecha}>Aprobación: {fechaAprobStr}</Text>
          </View>
          <View style={papStyles.firmaBox}>
            <Text style={papStyles.firmaRole}>Administrador / RRHH</Text>
            <Text style={papStyles.firmaFecha}>Confirmación: {fechaConfirmStr}</Text>
          </View>
        </View>

        <View style={papStyles.papFooter} fixed>
          <Text>{[cfg.razon_social, 'DI-FG-48', solicitud.numero_correlativo].filter(Boolean).join('  ·  ')}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ── Amonestación (GAP-04) ──────────────────────────────────────────

const amonStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', padding: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  logo: { width: 100, height: 40, objectFit: 'contain' },
  titleBlock: { textAlign: 'center', flex: 1 },
  titleMain: { fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  titleSub: { fontSize: 9, color: '#555', marginTop: 4 },
  codeLabel: { fontSize: 8, color: '#888', marginTop: 2 },
  sep: { borderBottomWidth: 1, borderColor: '#dde3ea', marginVertical: 12 },
  sectionLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1a1a1a', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase', backgroundColor: '#f3f4f6', padding: 4 },
  row2: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  infoBox: { flex: 1 },
  fieldLabel: { fontSize: 8, color: '#6b7280', marginBottom: 2, textTransform: 'uppercase' },
  fieldVal: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  motivoBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4, padding: 10, marginBottom: 12, minHeight: 60 },
  motivoText: { fontSize: 10, lineHeight: 1.4 },
  firmasRow: { flexDirection: 'row', gap: 24, marginTop: 40 },
  firmaBox: { flex: 1, alignItems: 'center' },
  firmaLine: { borderBottomWidth: 1, borderColor: '#374151', width: '100%', marginVertical: 8 },
  firmaName: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  firmaRole: { fontSize: 8, color: '#6b7280' },
  firmaImg: { height: 40, objectFit: 'contain', marginBottom: 4, maxWidth: 120 },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, borderTopWidth: 1, borderColor: '#dde3ea', paddingTop: 8, textAlign: 'center', fontSize: 8, color: '#9ca3af' },
  badgeVerbal: { color: '#d97706' },
  badgeEscrita: { color: '#dc2626' },
  badgeSuspension: { color: '#4b5563' },
});

export function AmonestacionPDF({ amonestacion, empresa, persona, emisor = {} }) {
  const cfg = emisor || {};
  const tipoLabel = {
    verbal: 'AMONESTACIÓN VERBAL',
    escrita: 'AMONESTACIÓN ESCRITA',
    suspension: 'SUSPENSIÓN SIN GOCE DE HABER'
  };

  const tipoColor = {
    verbal: amonStyles.badgeVerbal,
    escrita: amonStyles.badgeEscrita,
    suspension: amonStyles.badgeSuspension,
  };

  return (
    <Document>
      <Page size="A4" style={amonStyles.page}>
        {/* Encabezado */}
        <View style={amonStyles.header}>
          {cfg.logo_url
            ? <Image src={cfg.logo_url} style={amonStyles.logo} />
            : <View style={[amonStyles.logo, { backgroundColor: '#f3f4f6', borderRadius: 4 }]} />
          }
          <View style={amonStyles.titleBlock}>
            <Text style={[amonStyles.titleMain, tipoColor[amonestacion.tipo] || {}]}>
              {tipoLabel[amonestacion.tipo] || 'AMONESTACIÓN'}
            </Text>
            <Text style={amonStyles.titleSub}>{cfg.razon_social || empresa?.nombre || ''}</Text>
          </View>
        </View>

        <View style={amonStyles.sep} />

        {/* Datos del colaborador */}
        <Text style={amonStyles.sectionLabel}>Datos del colaborador</Text>
        <View style={amonStyles.row2}>
          <View style={amonStyles.infoBox}>
            <Text style={amonStyles.fieldLabel}>Nombre completo</Text>
            <Text style={amonStyles.fieldVal}>{persona?.nombre || amonestacion.personal_nombre || '—'}</Text>
          </View>
          <View style={[amonStyles.infoBox, { flex: 0.5 }]}>
            <Text style={amonStyles.fieldLabel}>DNI</Text>
            <Text style={amonStyles.fieldVal}>{persona?.documento || persona?.dni || '—'}</Text>
          </View>
        </View>
        <View style={amonStyles.row2}>
          <View style={amonStyles.infoBox}>
            <Text style={amonStyles.fieldLabel}>Cargo</Text>
            <Text style={amonStyles.fieldVal}>{persona?.cargo || '—'}</Text>
          </View>
          <View style={[amonStyles.infoBox, { flex: 0.5 }]}>
            <Text style={amonStyles.fieldLabel}>Área</Text>
            <Text style={amonStyles.fieldVal}>{persona?.area || '—'}</Text>
          </View>
          <View style={[amonStyles.infoBox, { flex: 0.5 }]}>
            <Text style={amonStyles.fieldLabel}>Fecha de ingreso</Text>
            <Text style={amonStyles.fieldVal}>{persona?.fecha_ingreso || '—'}</Text>
          </View>
        </View>

        <View style={amonStyles.sep} />

        {/* Detalles de la amonestación */}
        <Text style={amonStyles.sectionLabel}>Detalles de la amonestación</Text>
        <View style={amonStyles.row2}>
          <View style={amonStyles.infoBox}>
            <Text style={amonStyles.fieldLabel}>Fecha de los hechos</Text>
            <Text style={amonStyles.fieldVal}>{amonestacion.fecha || '—'}</Text>
          </View>
          {amonestacion.tipo === 'suspension' && (
            <>
              <View style={amonStyles.infoBox}>
                <Text style={amonStyles.fieldLabel}>Días de suspensión</Text>
                <Text style={amonStyles.fieldVal}>{amonestacion.dias_suspension || '—'}</Text>
              </View>
              <View style={amonStyles.infoBox}>
                <Text style={amonStyles.fieldLabel}>Período de suspensión</Text>
                <Text style={amonStyles.fieldVal}>
                  {amonestacion.fecha_inicio_suspension || '—'} al {amonestacion.fecha_fin_suspension || '—'}
                </Text>
              </View>
            </>
          )}
        </View>

        <Text style={[amonStyles.fieldLabel, { marginTop: 8 }]}>Motivo</Text>
        <View style={amonStyles.motivoBox}>
          <Text style={[amonStyles.motivoText, { fontFamily: 'Helvetica-Bold', marginBottom: 4 }]}>{amonestacion.motivo || '—'}</Text>
          {amonestacion.descripcion && (
            <Text style={amonStyles.motivoText}>{amonestacion.descripcion}</Text>
          )}
        </View>

        {amonestacion.descargo && (
          <>
            <Text style={[amonStyles.fieldLabel, { marginTop: 8 }]}>Descargo del colaborador</Text>
            <View style={amonStyles.motivoBox}>
              <Text style={amonStyles.motivoText}>{amonestacion.descargo}</Text>
            </View>
          </>
        )}

        {/* Firmas */}
        <View style={amonStyles.firmasRow}>
          <View style={amonStyles.firmaBox}>
            <View style={amonStyles.firmaLine} />
            <Text style={amonStyles.firmaName}>{persona?.nombre || amonestacion.personal_nombre || '—'}</Text>
            <Text style={amonStyles.firmaRole}>Trabajador</Text>
          </View>
          <View style={amonStyles.firmaBox}>
            {cfg.firma_url
              ? <Image src={cfg.firma_url} style={amonStyles.firmaImg} />
              : <View style={{ height: 40 }} />
            }
            <View style={amonStyles.firmaLine} />
            <Text style={amonStyles.firmaName}>{amonestacion.registrado_por || '—'}</Text>
            <Text style={amonStyles.firmaRole}>Administrador / RRHH</Text>
          </View>
        </View>

        <View style={amonStyles.footer} fixed>
          <Text>{[cfg.razon_social, `Amonestación registrada el ${amonestacion.creado_en ? new Date(amonestacion.creado_en).toLocaleDateString('es-PE') : new Date().toLocaleDateString('es-PE')}`].filter(Boolean).join('  ·  ')}</Text>
        </View>
      </Page>
    </Document>
  );
}
