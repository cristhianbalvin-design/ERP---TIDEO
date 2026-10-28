import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { paginarEtiquetas } from './wmsPr2Logic.js';

const MM = 2.8346;
const S = StyleSheet.create({
  page: { position: 'relative', fontFamily: 'Helvetica', color: '#1A2B4A' },
  etiqueta: { position: 'absolute', flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: '#C9CFD8', borderStyle: 'dashed', borderRadius: 3 },
  texto: { flexGrow: 1, flexShrink: 1 },
  codigo: { fontFamily: 'Helvetica-Bold' },
  nombre: { color: '#4B5563', marginTop: 2 },
  marca: { color: '#6B7280', marginTop: 3, fontSize: 6 },
  pie: { position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontSize: 6, color: '#9AA3B2' },
});

// items: [{ codigo, nombre, detalle, qr (data URL), copias }]
export function EtiquetasPdf({ items, formato, titulo }) {
  const { hojas } = paginarEtiquetas(items, formato);
  const ancho = formato.anchoMm * MM; const alto = formato.altoMm * MM; const qr = formato.qrMm * MM;
  const grande = formato.id === 'a8';
  return <Document title={titulo} author="TIDEO ERP">
    {hojas.map((hoja, h) => <Page key={h} size="A4" style={S.page}>
      {hoja.map((it, i) => {
        const col = i % formato.columnas; const fila = Math.floor(i / formato.columnas);
        return <View key={`${h}-${i}`} style={[S.etiqueta, {
          left: (formato.margenIzqMm + col * (formato.anchoMm + formato.separacionMm)) * MM, top: (formato.margenSupMm + fila * formato.altoMm) * MM,
          width: ancho, height: alto, padding: grande ? 10 : 5, gap: grande ? 10 : 5,
        }]}>
          <Image src={it.qr} style={{ width: Math.min(qr, alto - 10), height: Math.min(qr, alto - 10) }} />
          <View style={S.texto}>
            <Text style={[S.codigo, { fontSize: grande ? 18 : 11 }]}>{it.codigo}</Text>
            {it.nombre ? <Text style={[S.nombre, { fontSize: grande ? 10 : 6.5 }]}>{it.nombre.slice(0, grande ? 90 : 48)}</Text> : null}
            <Text style={S.marca}>{it.detalle ? `${it.detalle} · ` : ''}TIDEO</Text>
          </View>
        </View>;
      })}
      <Text style={S.pie} fixed render={({ pageNumber, totalPages }) => `Generado con TIDEO ERP · ${titulo} · Hoja ${pageNumber} de ${totalPages}`} />
    </Page>)}
  </Document>;
}

export async function generarPdfEtiquetas({ items, formato, titulo }) {
  const [{ pdf }, QR] = await Promise.all([import('@react-pdf/renderer'), import('qrcode')]);
  const toDataURL = QR.toDataURL || QR.default?.toDataURL;
  const conQr = await Promise.all(items.map(async it => ({ ...it, qr: await toDataURL(it.contenido, { margin: 0, width: 240, errorCorrectionLevel: 'M' }) })));
  return pdf(<EtiquetasPdf items={conQr} formato={formato} titulo={titulo} />).toBlob();
}
