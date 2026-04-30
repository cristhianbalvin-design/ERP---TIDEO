import { createMockRepository } from './createMockRepository.js';
import { createSupabaseRepository } from './createSupabaseRepository.js';
import { isSupabaseMode } from '../lib/dataMode.js';

const round2 = value => +Number(value || 0).toFixed(2);

export const nextCuota = financiamiento =>
  (financiamiento?.tabla_amortizacion || []).find(c => c.estado === 'pendiente') ||
  (financiamiento?.tabla_amortizacion || []).find(c => c.estado === 'futura');

export const isCapitalPayment = pago =>
  pago?.tipo === 'capital_parcial' || pago?.tipo === 'capital_total';

export const paymentDate = (date, months, day) => {
  const d = new Date(`${date || '2026-04-01'}T00:00:00`);
  d.setMonth(d.getMonth() + Number(months || 0));
  d.setDate(Number(day || 5));
  return d.toISOString().slice(0, 10);
};

export function generarAmortizacion({
  monto,
  tasaAnual,
  plazoMeses,
  mesesGracia,
  fechaDesembolso,
  diaPago,
  tipoCuota,
}) {
  const tasaMensual = Number(tasaAnual || 0) / 100 / 12;
  const montoBase = Number(monto || 0);
  const plazo = Math.max(1, Number(plazoMeses || 1));
  const gracia = Math.max(0, Number(mesesGracia || 0));
  const efectivo = Math.max(1, plazo - gracia);
  const cuotaFrances = tasaMensual
    ? montoBase * (tasaMensual * Math.pow(1 + tasaMensual, efectivo)) / (Math.pow(1 + tasaMensual, efectivo) - 1)
    : montoBase / efectivo;

  let saldo = montoBase;
  return Array.from({ length: plazo }, (_, idx) => {
    const numero = idx + 1;
    const interes = saldo * tasaMensual;
    let capital = numero <= gracia ? 0 : cuotaFrances - interes;
    let total = numero <= gracia ? interes : cuotaFrances;

    if (tipoCuota === 'aleman' && numero > gracia) {
      capital = montoBase / efectivo;
      total = capital + interes;
    }

    if (tipoCuota === 'bullet') {
      capital = numero === plazo ? saldo : 0;
      total = capital + interes;
    }

    saldo = Math.max(0, saldo - capital);
    return {
      numero,
      fecha: paymentDate(fechaDesembolso, numero, diaPago),
      capital: round2(capital),
      interes: round2(interes),
      total: round2(total),
      saldo: round2(saldo),
      estado: numero === 1 ? 'pendiente' : 'futura',
    };
  });
}

export function recalcularTabla(financiamiento, tablaBase, nuevoSaldo, desdeFecha = null) {
  const tasaMensual = Number(financiamiento?.tasa_anual || 0) / 100 / 12;
  const debeRecalcular = cuota =>
    (!desdeFecha || cuota.fecha >= desdeFecha) &&
    cuota.estado !== 'pagada' &&
    cuota.estado !== 'cancelada';

  const pendientes = (tablaBase || []).filter(debeRecalcular);
  const count = pendientes.length;
  const saldoInicial = Number(nuevoSaldo || 0);

  if (saldoInicial <= 0) {
    return (tablaBase || []).map(cuota =>
      cuota.estado === 'pagada'
        ? cuota
        : { ...cuota, capital: 0, interes: 0, total: 0, saldo: 0, estado: 'cancelada' }
    );
  }

  const cuotaFrances = tasaMensual && count
    ? saldoInicial * (tasaMensual * Math.pow(1 + tasaMensual, count)) / (Math.pow(1 + tasaMensual, count) - 1)
    : count ? saldoInicial / count : 0;

  let index = 0;
  let saldo = saldoInicial;

  return (tablaBase || []).map(cuota => {
    if (!debeRecalcular(cuota)) return cuota;

    index += 1;
    const interes = saldo * tasaMensual;
    const ultima = index === count;
    let capital = 0;
    let total = interes;

    if (financiamiento?.tipo_cuota === 'bullet' || cuota.capital === 0) {
      capital = ultima ? saldo : 0;
      total = capital + interes;
    } else if (financiamiento?.tipo_cuota === 'aleman') {
      capital = saldoInicial / count;
      total = capital + interes;
    } else {
      total = cuotaFrances;
      capital = ultima ? saldo : Math.min(saldo, Math.max(0, total - interes));
      total = ultima ? capital + interes : total;
    }

    saldo = Math.max(0, saldo - capital);
    return {
      ...cuota,
      capital: round2(capital),
      interes: round2(interes),
      total: round2(total),
      saldo: round2(saldo),
      estado: index === 1 ? 'pendiente' : 'futura',
    };
  });
}

export function buildFinanciamiento({ form, empresa, sequence = 1 }) {
  const tabla = generarAmortizacion({
    monto: form.monto_original,
    tasaAnual: form.tasa_anual,
    plazoMeses: form.plazo_meses,
    mesesGracia: form.meses_gracia,
    fechaDesembolso: form.fecha_desembolso,
    diaPago: form.dia_pago,
    tipoCuota: form.tipo_cuota,
  });
  const codigo = `FIN-${String(sequence).padStart(3, '0')}`;

  return {
    id: `fin_${Date.now().toString(36)}`,
    empresa_id: empresa.id,
    codigo,
    ...form,
    monto_original: Number(form.monto_original || 0),
    tasa_anual: Number(form.tasa_anual || 0),
    plazo_meses: Number(form.plazo_meses || 0),
    meses_gracia: Number(form.meses_gracia || 0),
    dia_pago: Number(form.dia_pago || 0),
    cuota_mensual: tabla[0]?.total || 0,
    fecha_primer_pago: tabla[0]?.fecha,
    fecha_ultimo_pago: tabla[tabla.length - 1]?.fecha,
    saldo_pendiente: Number(form.monto_original || 0),
    cuotas_pagadas: 0,
    intereses_pagados_total: 0,
    estado: 'vigente',
    tabla_amortizacion: tabla,
    pagos_realizados: [],
  };
}

export function buildPagoFinanciamiento({ financiamiento, datos, nuevoSaldo }) {
  const esCuota = datos.modo === 'cuota';
  const capital = round2(datos.resumen?.capital);
  const interes = round2(datos.resumen?.interes);
  const total = round2(datos.resumen?.total);

  return {
    id: `pag_${financiamiento.id}_${Date.now().toString(36)}`,
    fecha_pago: datos.fecha,
    tipo: datos.modo,
    cuota_numero: esCuota ? datos.cuota?.numero : null,
    capital,
    interes,
    total,
    saldo_despues: nuevoSaldo,
    cuenta_bancaria: datos.cuenta_bancaria,
    referencia: datos.referencia,
    comprobante: datos.comprobante,
    moneda: financiamiento.moneda || 'PEN',
    registrado_por: 'Admin',
  };
}

export function buildGastoIntereses({ financiamiento, cuota, interes, fecha, empresa }) {
  return {
    id: `gasto_int_${financiamiento.id}_${cuota.numero}`,
    empresa_id: empresa.id,
    tipo: 'gasto',
    descripcion: `Intereses ${financiamiento.entidad} - Cuota ${cuota.numero}/${financiamiento.plazo_meses}`,
    categoria: 'Gastos financieros',
    subcategoria: 'Intereses de prestamos',
    monto: round2(interes),
    moneda: financiamiento.moneda || 'PEN',
    fecha,
    financiamiento_id: financiamiento.id,
    cuota_numero: cuota.numero,
    estado: 'registrado',
  };
}

export function buildEgresoTesoreria({ financiamiento, pago, datos, empresa }) {
  const esCuota = datos.modo === 'cuota';
  return {
    id: `egr_fin_${financiamiento.id}_${pago.id}`,
    empresa_id: empresa.id,
    tipo: 'egreso',
    descripcion: esCuota
      ? `Cuota ${datos.cuota.numero} ${financiamiento.entidad}`
      : `Abono a capital ${financiamiento.entidad}`,
    monto: pago.total,
    moneda: financiamiento.moneda || 'PEN',
    fecha: datos.fecha,
    cuenta_bancaria: datos.cuenta_bancaria,
    referencia: datos.referencia,
    vinculo_tipo: 'financiamiento',
    vinculo_id: financiamiento.id,
    estado: 'registrado',
  };
}

export function sumFinanciamientosByCurrency(financiamientos = [], valueGetter = item => item?.saldo_pendiente || 0) {
  return financiamientos.reduce((totals, financiamiento) => {
    const moneda = financiamiento.moneda || 'PEN';
    return {
      ...totals,
      [moneda]: (totals[moneda] || 0) + Number(valueGetter(financiamiento) || 0),
    };
  }, {});
}

export function buildDebtSummary(financiamientos = []) {
  const activos = financiamientos.filter(f => f.estado === 'vigente');
  const cuotasPorFinanciamiento = activos
    .map(financiamiento => ({ financiamiento, cuota: nextCuota(financiamiento) }))
    .filter(item => item.cuota);

  const deudaTotalPorMoneda = sumFinanciamientosByCurrency(activos, f => f.saldo_pendiente);
  const interesesPagadosPorMoneda = sumFinanciamientosByCurrency(activos, f => f.intereses_pagados_total);
  const cuotasMesPorMoneda = cuotasPorFinanciamiento.reduce((totals, item) => {
    const moneda = item.financiamiento.moneda || 'PEN';
    return { ...totals, [moneda]: (totals[moneda] || 0) + Number(item.cuota.total || 0) };
  }, {});
  const interesesMesPorMoneda = cuotasPorFinanciamiento.reduce((totals, item) => {
    const moneda = item.financiamiento.moneda || 'PEN';
    return { ...totals, [moneda]: (totals[moneda] || 0) + Number(item.cuota.interes || 0) };
  }, {});

  return {
    activos,
    cuotasPorFinanciamiento,
    deudaTotalPorMoneda,
    cuotasMesPorMoneda,
    interesesMesPorMoneda,
    interesesPagadosPorMoneda,
  };
}

export const createFinanciamientosRepository = ({ getState, setState, empresa }) =>
  createMockRepository({
    getState,
    setState,
    empresa,
    idPrefix: 'fin',
    sortBy: (a, b) => String(b.fecha_desembolso || '').localeCompare(String(a.fecha_desembolso || '')),
  });

export const createFinanciamientosDataSource = ({
  empresa,
  getFinanciamientos,
  setFinanciamientos,
  getComprasGastos,
  setComprasGastos,
  getMovimientosTesoreria,
  setMovimientosTesoreria,
} = {}) => {
  if (isSupabaseMode()) {
    return {
      mode: 'supabase',
      financiamientos: createSupabaseRepository({ table: 'financiamientos', empresa }),
      gastos: createSupabaseRepository({ table: 'compras_gastos', empresa }),
      tesoreria: createSupabaseRepository({ table: 'movimientos_tesoreria', empresa }),
      amortizacion: createSupabaseRepository({ table: 'tabla_amortizacion', empresa }),
      pagos: createSupabaseRepository({ table: 'pagos_financiamiento', empresa }),
    };
  }

  return {
    mode: 'mock',
    financiamientos: createMockRepository({
      getState: getFinanciamientos,
      setState: setFinanciamientos,
      empresa,
      idPrefix: 'fin',
      sortBy: (a, b) => String(b.fecha_desembolso || '').localeCompare(String(a.fecha_desembolso || '')),
    }),
    gastos: createMockRepository({
      getState: getComprasGastos,
      setState: setComprasGastos,
      empresa,
      idPrefix: 'gasto',
    }),
    tesoreria: createMockRepository({
      getState: getMovimientosTesoreria,
      setState: setMovimientosTesoreria,
      empresa,
      idPrefix: 'tes',
    }),
  };
};
