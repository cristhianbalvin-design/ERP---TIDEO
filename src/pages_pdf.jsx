import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { renderTextoComercial } from './lib/textoComercial.js';

const fmt = (n, sym = 'S/') =>
  sym + ' ' + (n != null ? Number(n).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0');

const sym = (m = 'PEN') => m === 'USD' ? 'US$' : m === 'EUR' ? '€' : 'S/';

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

export function CotizacionPDF({ cot, cuenta, contacto, opp, cfg, qrDataUrl }) {
  const primary   = cfg?.color_primario   || '#1A2B4A';
  const secondary = cfg?.color_secundario || '#607D8B';
  const S   = makeStyles(primary, secondary);
  const s   = sym(cot.moneda);
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
            <View style={S.detRow}><Text style={S.detLabel}>Moneda</Text><Text style={S.detVal}>{cot.moneda}</Text></View>
          </View>
        </View>

        {/* Descripción */}
        {cot.descripcion_general && (
          <>
            <View style={S.sep} />
            <Text style={S.secLabel}>DESCRIPCIÓN DEL SERVICIO</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.6, color: '#333', marginBottom: 12 }}>{cot.descripcion_general}</Text>
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
                    <Text style={S.tCellBold}>{mainDesc}</Text>
                    {subItems.map((sub, si) => (
                      <Text key={si} style={{ fontSize: 7.5, color: '#555', marginTop: 1.5 }}>
                        {'• '}{typeof sub === 'string' ? sub.trim() : sub.nombre || sub}
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
                    <Text style={[S.tCell, S.tCellBold, { flex: 1 }]}>{h.concepto}</Text>
                    <Text style={[S.tCell, { width: 44, textAlign: 'right' }]}>{h.porcentaje}%</Text>
                    <Text style={[S.tCell, S.tCellBold, { width: 80, textAlign: 'right' }]}>{fmt(h.monto, s)}</Text>
                    <Text style={[S.tCell, { flex: 1, paddingLeft: 8, color: '#555', fontSize: 8 }]}>{h.condicion || '—'}</Text>
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
