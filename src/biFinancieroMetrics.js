import { normalizarMonedaBI, formatearFechaBI, crearCSVBI } from './biComercialMetrics.js';

const amount = value => Number(value ?? 0) || 0;
const state = row => String(row?.estado || '').toLowerCase().replace(/\s+/g, '_');
const dayNumber = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
  return match ? Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000) : null;
};
const dayDiff = (from, to) => {
  const a = dayNumber(from); const b = dayNumber(to);
  return a == null || b == null ? null : b - a;
};
const dateFromDays = value => {
  const date = new Date(value * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};
const currencyRows = (rows, moneda, key = 'moneda') => rows.filter(row => normalizarMonedaBI(row?.[key]) === moneda);
const inSocietyScope = (row, sociedadIds, multisociedad) => !multisociedad || !sociedadIds?.length || sociedadIds.includes(row?.sociedad_id);

export { normalizarMonedaBI };
export const formatDateFinanciero = formatearFechaBI;
export const currencyAmount = amount;
export const filtrarPorMoneda = (rows = [], moneda, key = 'moneda') => currencyRows(rows, normalizarMonedaBI(moneda), key);

export function asignarSociedadMovimientos({
  movimientos = [], cuentasBancarias = [], cxc = [], cxp = [], facturas = [],
} = {}) {
  const cuentasPorId = new Map(cuentasBancarias.map(row => [row.id, row]));
  const cxcPorId = new Map(cxc.map(row => [row.id, row]));
  const cxpPorId = new Map(cxp.map(row => [row.id, row]));
  const facturasPorId = new Map(facturas.map(row => [row.id, row]));

  return movimientos.map(movimiento => {
    const vinculoTipo = String(
      movimiento?.vinculo_tipo || movimiento?.vinculado_tipo || '',
    ).trim().toLowerCase();
    const vinculoId = movimiento?.vinculo_id || movimiento?.vinculado_id;
    const cxcOrigen = cxcPorId.get(
      movimiento?.cxc_id || (vinculoTipo === 'cxc' ? vinculoId : null),
    );
    const cxpOrigen = cxpPorId.get(
      movimiento?.cxp_id || (vinculoTipo === 'cxp' ? vinculoId : null),
    );
    const facturaOrigen = facturasPorId.get(
      movimiento?.factura_id
      || cxcOrigen?.factura_id
      || (vinculoTipo === 'factura' ? vinculoId : null),
    );
    const sociedadId = movimiento?.sociedad_id
      || cuentasPorId.get(movimiento?.cuenta_bancaria_id)?.sociedad_id
      || cxcOrigen?.sociedad_id
      || cxpOrigen?.sociedad_id
      || facturaOrigen?.sociedad_id
      || null;

    return { ...movimiento, sociedad_id: sociedadId };
  });
}

export function calcularCxc({ cxc = [], empresaId, sociedadIds = [], multisociedad = false, moneda = 'PEN', hoy }) {
  const items = cxc.filter(row => row.empresa_id === empresaId && inSocietyScope(row, sociedadIds, multisociedad)
    && !['anulada', 'cancelada', 'cobrada'].includes(state(row)) && !row.fecha_cobro && normalizarMonedaBI(row.moneda) === normalizarMonedaBI(moneda))
    .map(row => {
      const saldo = amount(row.saldo ?? row.monto_total);
      const mora = dayDiff(row.fecha_vencimiento || row.vence, hoy);
      return { ...row, saldo, mora: mora == null ? 0 : Math.max(0, mora) };
    }).filter(row => row.saldo > 0);
  const tramos = [
    { key: 'vigente', label: 'Vigente', test: row => row.mora === 0 },
    { key: 'd1_30', label: '1-30 días', test: row => row.mora >= 1 && row.mora <= 30 },
    { key: 'd31_60', label: '31-60 días', test: row => row.mora >= 31 && row.mora <= 60 },
    { key: 'd61_90', label: '61-90 días', test: row => row.mora >= 61 && row.mora <= 90 },
    { key: 'mas90', label: '+90 días', test: row => row.mora > 90 },
  ].map(bucket => {
    const rows = items.filter(bucket.test);
    return { ...bucket, monto: rows.reduce((sum, row) => sum + row.saldo, 0), cantidad: rows.length, rows };
  });
  return { items, tramos, total: items.reduce((sum, row) => sum + row.saldo, 0), vencida: items.filter(row => row.mora > 0).reduce((sum, row) => sum + row.saldo, 0), vencidas: items.filter(row => row.mora > 0).sort((a, b) => b.mora - a.mora).slice(0, 10) };
}

export function calcularCxp({ cxp = [], cxpPagos = [], empresaId, sociedadIds = [], multisociedad = false, moneda = 'PEN', hoy }) {
  const pagos = new Map();
  cxpPagos.forEach(row => pagos.set(row.cxp_id, (pagos.get(row.cxp_id) || 0) + amount(row.monto)));
  const items = cxp.filter(row => row.empresa_id === empresaId && inSocietyScope(row, sociedadIds, multisociedad)
    && !['anulada', 'pagada', 'cancelada'].includes(state(row)) && normalizarMonedaBI(row.moneda) === normalizarMonedaBI(moneda))
    .map(row => {
      const saldo = amount(row.monto_total) - (pagos.get(row.id) || 0);
      const dias = dayDiff(hoy, row.fecha_vencimiento);
      return { ...row, saldo, dias: dias == null ? null : dias };
    }).filter(row => row.saldo > 0);
  const buckets = [
    { key: 'vencida', label: 'Vencida', test: row => row.dias != null && row.dias < 0 },
    { key: 'd0_30', label: '0-30 días', test: row => row.dias != null && row.dias >= 0 && row.dias <= 30 },
    { key: 'd31_60', label: '31-60 días', test: row => row.dias != null && row.dias >= 31 && row.dias <= 60 },
    { key: 'mas60', label: '+60 días', test: row => row.dias != null && row.dias > 60 },
  ].map(bucket => {
    const rows = items.filter(bucket.test);
    return { ...bucket, monto: rows.reduce((sum, row) => sum + row.saldo, 0), cantidad: rows.length, rows };
  });
  const urgency = [...items].filter(row => row.dias != null).sort((a, b) => (a.dias < 0 ? a.dias : 100000 + a.dias) - (b.dias < 0 ? b.dias : 100000 + b.dias));
  return { items, tramos: buckets, total: items.reduce((sum, row) => sum + row.saldo, 0), vencida: items.filter(row => row.dias < 0).reduce((sum, row) => sum + row.saldo, 0), proximos30: items.filter(row => row.dias >= 0 && row.dias <= 30).reduce((sum, row) => sum + row.saldo, 0), urgentes: urgency.slice(0, 10) };
}

export function calcularSemanasCaja({ movimientos = [], empresaId, sociedadIds = [], multisociedad = false, moneda = 'PEN', hoy }) {
  const today = dayNumber(hoy);
  if (today == null) return [];
  const weekday = new Date(today * 86400000).getUTCDay();
  const monday = today - ((weekday + 6) % 7);
  let acumulado = 0;
  return Array.from({ length: 8 }, (_, index) => {
    const inicioN = monday - (7 - index) * 7;
    const finN = inicioN + 6;
    const inicio = dateFromDays(inicioN); const fin = dateFromDays(finN);
    const rows = movimientos.filter(row => row.empresa_id === empresaId && inSocietyScope(row, sociedadIds, multisociedad)
      && normalizarMonedaBI(row.moneda) === normalizarMonedaBI(moneda)
      && String(row.fecha || row.fecha_movimiento || '').slice(0, 10) >= inicio && String(row.fecha || row.fecha_movimiento || '').slice(0, 10) <= fin);
    const ingresos = rows.filter(row => ['ingreso', 'credito'].includes(String(row.tipo || row.tipo_movimiento || '').toLowerCase())).reduce((sum, row) => sum + amount(row.monto ?? row.monto_movimiento), 0);
    const egresos = rows.filter(row => ['egreso', 'debito'].includes(String(row.tipo || row.tipo_movimiento || '').toLowerCase())).reduce((sum, row) => sum + amount(row.monto ?? row.monto_movimiento), 0);
    const neto = ingresos - egresos; acumulado += neto;
    return { inicio, fin, ingresos, egresos, neto, acumulado };
  });
}

export function calcularCajaNetaMes({ movimientos = [], periodo, empresaId, sociedadIds = [], multisociedad = false, moneda = 'PEN' }) {
  return movimientos.filter(row => row.empresa_id === empresaId && inSocietyScope(row, sociedadIds, multisociedad)
    && String(row.fecha || row.fecha_movimiento || '').slice(0, 7) === periodo && normalizarMonedaBI(row.moneda) === normalizarMonedaBI(moneda))
    .reduce((neto, row) => {
      const tipo = String(row.tipo || row.tipo_movimiento || '').toLowerCase();
      const monto = amount(row.monto ?? row.monto_movimiento);
      return neto + (['ingreso', 'credito'].includes(tipo) ? monto : ['egreso', 'debito'].includes(tipo) ? -monto : 0);
    }, 0);
}

export function calcularRetenciones({ facturas = [], cuentas = [], periodo, empresaId, sociedadIds = [], multisociedad = false, moneda = 'PEN' }) {
  const porCuenta = new Map(cuentas.map(row => [row.id, row]));
  return facturas.filter(row => row.empresa_id === empresaId && inSocietyScope(row, sociedadIds, multisociedad)
    && row.aplica_retencion && state(row) !== 'anulada' && String(row.fecha_emision || '').slice(0, 7) === periodo && normalizarMonedaBI(row.moneda) === normalizarMonedaBI(moneda))
    .map(row => ({ cliente: porCuenta.get(row.cuenta_id)?.razon_social || porCuenta.get(row.cuenta_id)?.nombre_comercial || row.cliente || 'Sin cliente', comprobante: row.numero || row.numero_comprobante || row.id, monto: amount(row.monto_retencion) }));
}

export function calcularFacturacionPorCliente({ facturas = [], cuentas = [], periodo, empresaId, sociedadIds = [], multisociedad = false, moneda = 'PEN' }) {
  const porCuenta = new Map(cuentas.map(row => [row.id, row])); const grouped = new Map();
  facturas.filter(row => row.empresa_id === empresaId && inSocietyScope(row, sociedadIds, multisociedad)
    && ['factura', 'boleta'].includes(String(row.tipo_documento || '').toLowerCase()) && state(row) !== 'anulada'
    && String(row.fecha_emision || '').slice(0, 7) === periodo && normalizarMonedaBI(row.moneda) === normalizarMonedaBI(moneda))
    .forEach(row => {
      const name = porCuenta.get(row.cuenta_id)?.razon_social || porCuenta.get(row.cuenta_id)?.nombre_comercial || row.cliente || 'Sin cliente';
      const value = grouped.get(name) || { nombre: name, monto: 0, cantidad: 0 };
      value.monto += amount(row.subtotal); value.cantidad += 1; grouped.set(name, value);
    });
  return [...grouped.values()].sort((a, b) => b.monto - a.monto);
}

export function serieResultados(resultados = [], moneda = 'PEN') {
  const value = row => amount(row?.[normalizarMonedaBI(moneda)]);
  const sourceRows = result => result?.scopeMode === 'comparativo' ? (result.comparativo || []).map(row => row.data) : [result];
  const sum = (result, getter) => sourceRows(result).reduce((total, row) => total + value(getter(row)), 0);
  return resultados.map(result => ({ periodo: result?.periodo || '', ingresos: sum(result, row => row?.er?.ingresos?.total), costoVentas: sum(result, row => row?.er?.costoVentas?.total), utilidadBruta: sum(result, row => row?.utilidadBruta), gastosOp: sum(result, row => row?.er?.gastosOp?.total), resultadoOp: sum(result, row => row?.resultadoOp), gastosFin: sum(result, row => row?.er?.gastosFin?.total), resultadoNeto: sum(result, row => row?.resultadoNeto), source: result }));
}

export function variacionPorcentual(actual = 0, previo = 0) {
  return Number(previo) ? (Number(actual || 0) - Number(previo)) / Number(previo) * 100 : null;
}

export function porcentajeDeIngresos(valor = 0, ingresos = 0) {
  return Number(ingresos) ? Number(valor || 0) / Number(ingresos) * 100 : 0;
}

export function totalizar(rows = [], key = 'monto') {
  return rows.reduce((sum, row) => sum + amount(row?.[key]), 0);
}

export function tablaResultadosFinancieros(actual, anterior) {
  if (!actual) return [];
  const current = [
    ['Ingresos', actual.ingresos, actual.ingresos],
    ['Costo de ventas', -actual.costoVentas, actual.ingresos],
    ['Utilidad bruta', actual.utilidadBruta, actual.ingresos],
    ['Gastos operativos', -actual.gastosOp, actual.ingresos],
    ['Resultado operativo', actual.resultadoOp, actual.ingresos],
    ['Gastos financieros', -actual.gastosFin, actual.ingresos],
    ['Resultado neto', actual.resultadoNeto, actual.ingresos],
  ];
  const previous = anterior ? [anterior.ingresos, -anterior.costoVentas, anterior.utilidadBruta, -anterior.gastosOp, anterior.resultadoOp, -anterior.gastosFin, anterior.resultadoNeto] : [];
  return current.map(([label, value, base], index) => ({ label, value, porcentaje: base ? value / base * 100 : 0, previo: previous[index] ?? null }));
}

export function categoriasCostosResultados(result, moneda = 'PEN') {
  const sources = result?.scopeMode === 'comparativo' ? (result.comparativo || []).map(row => row.data) : [result];
  const grouped = new Map();
  sources.forEach(source => ['costoVentas', 'gastosOp', 'gastosFin'].forEach(key => (source?.er?.[key]?.items || []).forEach(item => {
    grouped.set(item.label, (grouped.get(item.label) || 0) + amount(item.totals?.[normalizarMonedaBI(moneda)]));
  })));
  return [...grouped].map(([nombre, monto]) => ({ nombre, monto })).filter(row => row.monto).sort((a, b) => b.monto - a.monto);
}

export function calcularCxcProximos30(cxcData, hoy) {
  return (cxcData?.items || []).filter(row => {
    const days = dayDiff(hoy, row.fecha_vencimiento || row.vence);
    return days != null && days >= 0 && days <= 30;
  }).reduce((sum, row) => sum + amount(row.saldo), 0);
}

export function filasCSVFinanciero(tab, data = {}) {
  if (tab === 'resultados') return { headers: ['Concepto', 'Mes', '% de ingresos', 'Mes anterior', 'Variación'], rows: data.tablaResultados || [] };
  if (tab === 'cobranza') return { headers: ['Cliente', 'Comprobante', 'Vencimiento', 'Días de mora', 'Saldo'], rows: (data.cxc?.vencidas || []).map(row => [data.cliente(row), row.numero || row.comprobante || row.id, formatearFechaBI(row.fecha_vencimiento || row.vence), row.mora, row.saldo]) };
  if (tab === 'pagos') return { headers: ['Proveedor', 'Concepto', 'Vencimiento', 'Días', 'Saldo'], rows: (data.cxp?.urgentes || []).map(row => [data.proveedor(row), row.concepto || row.categoria || row.factura_numero || 'Sin concepto', formatearFechaBI(row.fecha_vencimiento), row.dias < 0 ? `Vencida ${Math.abs(row.dias)} d` : row.dias, row.saldo]) };
  if (tab === 'flujo') return { headers: ['Semana', 'Ingresos', 'Egresos', 'Neto', 'Acumulado'], rows: (data.semanas || []).map(row => [`${formatearFechaBI(row.inicio)} - ${formatearFechaBI(row.fin)}`, row.ingresos, row.egresos, row.neto, row.acumulado]) };
  return { headers: ['Presupuesto', 'Categoría', 'Descripción', 'Moneda', 'Monto presupuestado'], rows: data.presupuestoRows || [] };
}

export function filasPresupuestoFinanciero({ presupuestos = [], partidas = [], empresaId, periodo } = {}) {
  const presupuestosPeriodo = presupuestos.filter(row => row.empresa_id === empresaId && row.periodo === periodo);
  const presupuestoPorId = new Map(presupuestosPeriodo.map(row => [row.id, row.nombre || row.id]));
  return partidas.filter(row => presupuestoPorId.has(row.presupuesto_id)).map(row => [
    presupuestoPorId.get(row.presupuesto_id), row.categoria || 'Sin categoría', row.descripcion || '',
    normalizarMonedaBI(row.moneda), amount(row.monto_presupuestado),
  ]);
}

export const crearCSVFinanciero = crearCSVBI;
