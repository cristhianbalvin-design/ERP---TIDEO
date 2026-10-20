// Reglas del cobro recurrente mensual (OS con tarifa fija mensual).
// La base de datos exige lo mismo: os_clientes_tarifa_mensual_chk.

export const TIPOS_COBRO = [
  { value: 'puntual', label: 'Servicio puntual' },
  { value: 'recurrente_mensual', label: 'Recurrente mensual' },
];

export const etiquetaTipoCobro = tipo => (tipo === 'recurrente_mensual' ? 'Recurrente mensual' : 'Servicio puntual');
export const esCobroMensual = os => os?.tipo_cobro === 'recurrente_mensual';

const redondear = valor => Math.round(Number(valor || 0) * 100) / 100;
const fechaISO = (anio, mesIdx, dia) => `${anio}-${String(mesIdx + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const diaDe = fecha => Number(String(fecha).slice(8, 10));

// Primer día del mes en formato ISO, igual que ordenes_trabajo.periodo_mensual.
export const periodoMensualISO = (anio, mesIdx) => fechaISO(anio, mesIdx, 1);

// Tarifa del mes prorrateada por los días de vigencia de la OS dentro del mes.
export function prorrateoMensual({ tarifa, fechaInicio, fechaFin, anio, mesIdx }) {
  const diasMes = new Date(Date.UTC(anio, mesIdx + 1, 0)).getUTCDate();
  const inicioMes = fechaISO(anio, mesIdx, 1);
  const finMes = fechaISO(anio, mesIdx, diasMes);
  const desde = fechaInicio && fechaInicio > inicioMes ? fechaInicio : inicioMes;
  const hasta = fechaFin && fechaFin < finMes ? fechaFin : finMes;
  if (!fechaInicio || desde > hasta) return { monto: 0, dias: 0, diasMes, desde: null, hasta: null, completo: false };
  const dias = diaDe(hasta) - diaDe(desde) + 1;
  const completo = dias === diasMes;
  const monto = completo ? redondear(tarifa) : redondear(Number(tarifa || 0) * dias / diasMes);
  return { monto, dias, diasMes, desde, hasta, completo };
}

// Valida los campos de cobro del formulario de OS. Devuelve el mensaje de error o ''.
export function validarCobroOS({ tipo_cobro, tarifa_mensual, fecha_inicio }) {
  if (tipo_cobro !== 'recurrente_mensual') return '';
  const tarifa = Number(tarifa_mensual);
  if (!Number.isFinite(tarifa) || tarifa <= 0) return 'Ingresa la tarifa mensual (sin IGV) de la OS recurrente.';
  if (!fecha_inicio) return 'La OS recurrente mensual necesita fecha de inicio.';
  return '';
}

// Partida de la valorización por tarifa mensual.
export function partidaTarifaMensual(os, anio, mesIdx, nombreMes) {
  const p = prorrateoMensual({ tarifa: os?.tarifa_mensual, fechaInicio: os?.fecha_inicio, fechaFin: os?.fecha_fin, anio, mesIdx });
  const detalle = p.completo || !p.dias ? '' : ` (${p.dias} de ${p.diasMes} días)`;
  return {
    id: `tm_${anio}_${mesIdx}`,
    descripcion: `Servicio mensual ${os?.nombre || os?.numero || ''} — ${nombreMes} ${anio}${detalle}`.replace(/\s+/g, ' ').trim(),
    cantidad: 1,
    precio_unitario: p.monto,
    _tarifa_mensual: redondear(os?.tarifa_mensual),
    _dias: p.dias,
    _dias_mes: p.diasMes,
  };
}

// Conformidad válida para valorizar: digital o física, o acta móvil con resultado distinto de pendiente.
export function conformidadValorizable(cierre) {
  const tipo = cierre?.conformidad_cliente?.tipo;
  if (tipo === 'digital' || tipo === 'fisico') return true;
  if (tipo === 'acta_movil') return (cierre.conformidad_resultado || cierre.conformidad_cliente?.resultado) !== 'pendiente';
  return false;
}
