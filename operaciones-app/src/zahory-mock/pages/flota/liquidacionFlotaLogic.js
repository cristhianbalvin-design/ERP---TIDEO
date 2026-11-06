export const CAUSAS_PARADA = Object.freeze([
  { codigo: "falla_mecanica", etiqueta: "Falla mecánica", atribucion: "proveedor" },
  { codigo: "mant_correctivo", etiqueta: "Mantenimiento correctivo", atribucion: "proveedor" },
  { codigo: "falta_operador_proveedor", etiqueta: "Falta de operador del proveedor", atribucion: "proveedor" },
  { codigo: "mant_preventivo", etiqueta: "Mantenimiento preventivo", atribucion: "neutral" },
  { codigo: "clima", etiqueta: "Clima", atribucion: "neutral" },
  { codigo: "sin_frente", etiqueta: "Sin frente de trabajo", atribucion: "cliente" },
  { codigo: "sin_operador_cliente", etiqueta: "Falta de operador del cliente", atribucion: "cliente" },
  { codigo: "orden_cliente", etiqueta: "Orden del cliente", atribucion: "cliente" },
]);
const atribucionPorCausa = Object.fromEntries(CAUSAS_PARADA.map((x) => [x.codigo, x.atribucion]));
export const atribucionParada = (causa) => atribucionPorCausa[causa] || null;
export const simboloMoneda = (moneda = "PEN") =>
  ["USD", "US$", "DÓLAR", "DOLAR"].includes(String(moneda).toUpperCase()) ? "US$" : "S/";
export const formatoMoneda = (valor, moneda = "PEN") =>
  `${simboloMoneda(moneda)} ${Number(valor || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
export const formatoPeriodo = (periodo) => {
  const [anio, mes] = String(periodo || "").slice(0, 7).split("-").map(Number);
  if (!anio || !mes || mes < 1 || mes > 12) return String(periodo || "");
  const nombre = new Intl.DateTimeFormat("es-PE", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(anio, mes - 1, 1)))
    .toLocaleLowerCase("es-PE")
    .replace(/\.$/, "");
  return `${nombre}. ${anio}`;
};
export const ETIQUETAS_HISTORIAL_LIQUIDACION = Object.freeze({
  creada: "Liquidación creada",
  creada_liquidacion: "Liquidación creada",
  liquidacion_creada: "Liquidación creada",
  crear: "Liquidación creada",
  enviada: "Enviada a revisión",
  enviada_revision: "Enviada a revisión",
  enviada_a_revision: "Enviada a revisión",
  enviar: "Enviada a revisión",
  devuelta: "Devuelta",
  devolver: "Devuelta",
  aprobada: "Aprobada",
  aprobar: "Aprobada",
  anulada: "Anulada",
  anular: "Anulada",
  parte_registrado: "Parte registrado",
  registrado: "Parte registrado",
  parte_actualizado: "Parte actualizado",
  actualizado: "Parte actualizado",
  parte_anulado: "Parte anulado",
  anulado: "Parte anulado",
});
export const etiquetaHistorialLiquidacion = (evento) => {
  const accion = evento?.accion || "";
  const etiqueta = ETIQUETAS_HISTORIAL_LIQUIDACION[accion];
  if (!etiqueta) return accion;
  const motivo = evento?.detalle?.motivo;
  return motivo && ["devuelta", "devolver", "anulada", "anular", "parte_anulado", "anulado"].includes(accion)
    ? `${etiqueta} · ${motivo}`
    : etiqueta;
};
export const horasOperadas = (inicio, fin, sinOperacion = false) =>
  sinOperacion ? 0 : Math.round((Number(fin) - Number(inicio) + Number.EPSILON) * 10) / 10;
export function validarParte(parte, contexto = {}) {
  const errores = {};
  if (!parte.contrato_equipo_id) errores.contrato_equipo_id = "Selecciona un contrato y equipo válidos.";
  if (!parte.fecha) errores.fecha = "La fecha es obligatoria.";
  else if (contexto.hoy && parte.fecha > contexto.hoy) errores.fecha = "No se registran partes de días futuros.";
  else if ((contexto.inicio && parte.fecha < contexto.inicio) || (contexto.fin && parte.fecha > contexto.fin))
    errores.fecha = `La fecha está fuera de la vigencia del contrato ${contexto.numero || ""}.`.trim();
  if (!["dia", "noche", "dia_noche"].includes(parte.turno || "dia")) errores.turno = "Turno no válido.";
  const paradas = parte.sin_operacion ? [] : parte.paradas || [];
  if (!parte.sin_operacion) {
    const hp = Number(parte.horas_programadas);
    if (!Number.isFinite(hp) || hp <= 0 || hp > 24) errores.horas_programadas = "Entre 0,5 y 24 horas.";
    const hi = parte.horometro_inicio === "" || parte.horometro_inicio == null ? NaN : Number(parte.horometro_inicio);
    const hf = parte.horometro_fin === "" || parte.horometro_fin == null ? NaN : Number(parte.horometro_fin);
    if (!Number.isFinite(hi)) errores.horometro_inicio = "Indique el horómetro inicial y final.";
    if (!Number.isFinite(hf)) errores.horometro_fin = "Indique el horómetro inicial y final.";
    else {
      if (hi < 0) errores.horometro_inicio = "Los horómetros no pueden ser negativos.";
      if (hf < 0) errores.horometro_fin = "Los horómetros no pueden ser negativos.";
      if (hf < hi) errores.horometro_fin = "El horómetro final no puede ser menor que el inicial.";
      const operadas = horasOperadas(hi, hf);
      if (operadas > hp)
        errores.horometro_fin = `Las horas operadas (${operadas}) superan las horas programadas (${hp}).`;
      if (contexto.anterior != null && hi < Number(contexto.anterior))
        errores.horometro_inicio = `El horómetro inicial (${hi}) es menor que el final del parte anterior (${contexto.anterior}).`;
      if (contexto.siguiente != null && hf > Number(contexto.siguiente))
        errores.horometro_fin = `El horómetro final (${hf}) supera el inicial del parte siguiente (${contexto.siguiente}).`;
    }
    paradas.forEach((p, i) => {
      if (!(Number(p.horas) > 0) || !atribucionParada(p.causa))
        errores[`parada_${i}`] = "Cada parada necesita horas mayores a cero y una causa válida.";
    });
    if (paradas.reduce((s, p) => s + (Number(p.horas) || 0), 0) > hp) {
      errores.paradas = "Las paradas suman más que las horas programadas.";
      errores.parada_0 ||= errores.paradas;
    }
    if (!String(parte.vb_cliente || "").trim()) errores.vb_cliente = "Indique quién dio el visto bueno del cliente.";
  }
  if (contexto.mesBloqueado) errores.mes = "El mes ya está en revisión o aprobado: no se pueden cambiar sus partes.";
  return errores;
}
export function estadoDia({ fecha, hoy, inicio, fin, parte }) {
  if ((inicio && fecha < inicio) || (fin && fecha > fin)) return "fuera";
  if (fecha > hoy) return "futuro";
  if (parte?.estado === "registrado") {
    if (parte.sin_operacion) return "sin_operacion";
    return (Number(parte.horas_parada_proveedor) || 0) > 0 ? "proveedor" : "registrado";
  }
  return fecha === hoy ? "pendiente" : "falta";
}
export function armarKpiPartes(partes, diasFaltantes = []) {
  return (partes || []).reduce(
    (s, p) => ({
      programadas: s.programadas + Number(p.horas_programadas || 0),
      operadas: s.operadas + Number(p.horas_operadas || 0),
      proveedor: s.proveedor + Number(p.horas_parada_proveedor || 0),
      cliente: s.cliente + Number(p.horas_parada_cliente || 0),
      faltantes: s.faltantes,
    }),
    { programadas: 0, operadas: 0, proveedor: 0, cliente: 0, faltantes: diasFaltantes.length },
  );
}
