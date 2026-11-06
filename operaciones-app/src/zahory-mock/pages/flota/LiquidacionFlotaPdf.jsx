import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { CAUSAS_PARADA } from "./liquidacionFlotaLogic.js";

const s = StyleSheet.create({
  page: {
    padding: 34,
    fontSize: 8,
    color: "#1F2937",
    fontFamily: "Helvetica",
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "2 solid #00ACC1",
    paddingBottom: 12,
    marginBottom: 14,
  },
  brand: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1A2B4A",
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
  },
  meta: {
    marginBottom: 12,
    lineHeight: 1.6,
  },
  table: {
    width: "100%",
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    borderBottom: "1 solid #E4E7EB",
    paddingVertical: 5,
    alignItems: "center",
  },
  th: {
    backgroundColor: "#EEF0F3",
    fontWeight: "bold",
  },
  equipo: {
    width: "24%",
  },
  num: {
    width: "11%",
    textAlign: "right",
  },
  currency: {
    width: "14%",
    textAlign: "right",
  },
  annexDate: {
    width: "10%",
  },
  annexEquipo: {
    width: "13%",
  },
  annexHoro: {
    width: "19%",
    paddingRight: 5,
  },
  annexOperadas: {
    width: "11%",
    textAlign: "right",
    paddingRight: 7,
  },
  annexParadas: {
    width: "31%",
    paddingRight: 5,
  },
  annexVb: {
    width: "16%",
  },
  section: {
    marginTop: 18,
    fontSize: 11,
    fontWeight: "bold",
    color: "#1A2B4A",
  },
  part: {
    flexDirection: "row",
    borderBottom: "1 solid #E4E7EB",
    paddingVertical: 4,
  },
  signatures: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 48,
  },
  sign: {
    width: "38%",
    borderTop: "1 solid #64748B",
    paddingTop: 6,
    textAlign: "center",
  },
  foot: {
    position: "absolute",
    bottom: 20,
    left: 34,
    right: 34,
    color: "#6B7280",
    fontSize: 7,
    textAlign: "center",
  },
});

const n = (x, d = 2) =>
  x == null
    ? "—"
    : Number(x).toLocaleString("es-PE", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const currencySymbol = (currency) =>
  ["USD", "US$", "DÓLAR", "DOLAR"].includes(String(currency || "").toUpperCase()) ? "US$" : "S/";
const money = (x, currency) => `${currencySymbol(currency)} ${n(x)}`;
const monthName = (period) => {
  const [year, month] = String(period).slice(0, 7).split("-").map(Number);
  const name = new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return `${name} ${year}`;
};
const date = (value) => {
  const [year, month, day] = String(value || "")
    .slice(0, 10)
    .split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
};
const causeLabel = (code) => CAUSAS_PARADA.find((item) => item.codigo === code)?.etiqueta || code || "Sin causa";
const FE = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  anulada: "Anulada",
};

export function LiquidacionFlotaPdf({ liquidacion: l, contrato, lineas = [], partes = [] }) {
  return (
    <Document title={`Liquidación ${l.numero}`}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.brand}>TIDEO.</Text>
            <Text>Tideo Tech &amp; Strategy</Text>
          </View>
          <View>
            <Text style={s.title}>Liquidación {l.numero}</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>
              Periodo: {monthName(l.periodo)} {"·"} Estado: {FE[l.estado] || l.estado}
            </Text>
          </View>
        </View>
        <Text style={s.meta}>
          Cliente: {contrato?.cliente || "Sin dato"} {"·"} Contrato: {contrato?.numero || "Sin dato"}
          {"\n"}Meta DMR: {n(l.meta_dmr)} % {"·"} Mínimo: {n(contrato?.minimo_facturable)}{" "}
          {contrato?.unidad_minimo_facturable || "hora"} / {contrato?.periodicidad_minimo_facturable || "mes"}
        </Text>
        <View style={s.table}>
          <View style={[s.row, s.th]}>
            <Text style={s.equipo}>Equipo</Text>
            <Text style={s.num}>Operadas</Text>
            <Text style={s.num}>Facturables</Text>
            <Text style={s.currency}>Tarifa</Text>
            <Text style={s.num}>DMR</Text>
            <Text style={s.currency}>Penalidad</Text>
            <Text style={s.currency}>Importe</Text>
          </View>
          {lineas.map((line) => (
            <View key={line.id} style={s.row}>
              <Text style={s.equipo}>
                {line.activo?.codigo || line.activo_id} {"·"} {line.activo?.nombre || ""}
              </Text>
              <Text style={s.num}>{n(line.horas_operadas)}</Text>
              <Text style={s.num}>{n(line.horas_facturables)}</Text>
              <Text style={s.currency}>{money(line.tarifa_hora, l.moneda)}</Text>
              <Text style={s.num}>{n(line.dmr)} %</Text>
              <Text style={s.currency}>{money(line.penalidad, l.moneda)}</Text>
              <Text style={s.currency}>{money(line.total, l.moneda)}</Text>
            </View>
          ))}
          <View style={[s.row, s.th]}>
            <Text style={{ width: "86%", textAlign: "right" }}>Total</Text>
            <Text style={s.currency}>{money(l.total, l.moneda)}</Text>
          </View>
        </View>
        <Text style={s.section}>Anexo {"·"} Partes diarios del periodo</Text>
        <View style={s.table}>
          <View style={[s.row, s.th]}>
            <Text style={s.annexDate}>Fecha</Text>
            <Text style={s.annexEquipo}>Equipo</Text>
            <Text style={s.annexHoro}>Horómetro</Text>
            <Text style={s.annexOperadas}>Operadas</Text>
            <Text style={s.annexParadas}>Paradas</Text>
            <Text style={s.annexVb}>VºBº</Text>
          </View>
          {partes.map((part) => (
            <View key={part.id} style={s.part}>
              <Text style={s.annexDate}>{date(part.fecha)}</Text>
              <Text style={s.annexEquipo}>{part.activo?.codigo || part.activo_id}</Text>
              <Text style={s.annexHoro}>
                {part.sin_operacion
                  ? "Sin operación"
                  : `${n(part.horometro_inicio, 1)} a ${n(part.horometro_fin, 1)}`}
              </Text>
              <Text style={s.annexOperadas}>{part.sin_operacion ? "Sin operación" : `${n(part.horas_operadas, 1)} h`}</Text>
              <Text style={s.annexParadas}>
                {(part.paradas || []).length
                  ? part.paradas
                      .map(
                        (stop) =>
                          `${n(stop.horas, 1)} h · ${causeLabel(stop.causa)} · ${stop.atribucion || "neutral"}`,
                      )
                      .join("\n")
                  : "Sin paradas"}
              </Text>
              <Text style={s.annexVb}>{part.vb_cliente || "—"}</Text>
            </View>
          ))}
        </View>
        <View style={s.signatures}>
          <Text style={s.sign}>Por TIDEO</Text>
          <Text style={s.sign}>Por {contrato?.cliente || "el cliente"}</Text>
        </View>
        <Text style={s.foot}>
          Documento generado desde OPERA {"·"} Los importes corresponden al cálculo registrado en el sistema.
        </Text>
      </Page>
    </Document>
  );
}
