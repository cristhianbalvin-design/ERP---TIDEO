// Términos de alquiler por equipo (Cotización Especial desde Tarifario):
//   costo_mes     = costo_hora × horas_minimas_garantizadas × cantidad (unidades)
//   costo_periodo = costo_mes × duracion_meses
// El subtotal de la línea es el costo del período. Misma fórmula que aplica
// public.normalizar_items_cotizacion_especial en el servidor (fuente definitiva).
const numero = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const redondear = value => Math.round(value * 100) / 100;
const presente = value => value !== undefined && value !== null && value !== '';

export const tieneTerminosEquipo = item => Boolean(item)
  && presente(item.costo_hora)
  && presente(item.horas_minimas_garantizadas)
  && presente(item.duracion_meses);

export function calcularTerminosEquipo(item) {
  if (!tieneTerminosEquipo(item)) return null;
  const costo_mes = redondear(numero(item.costo_hora) * numero(item.horas_minimas_garantizadas) * numero(item.cantidad));
  const costo_periodo = redondear(costo_mes * numero(item.duracion_meses));
  return { costo_mes, costo_periodo };
}

export const subtotalItem = item => (
  calcularTerminosEquipo(item)?.costo_periodo ?? numero(item?.cantidad) * numero(item?.precio_unitario)
);
