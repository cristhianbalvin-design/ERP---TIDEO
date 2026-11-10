import { createMockRepository } from './createMockRepository.js';
import { createSupabaseRepository } from './createSupabaseRepository.js';
import { isSupabaseMode } from '../lib/dataMode.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

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

export async function crearFinanciamientoConAmortizacion({ empresa, nuevo }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('crear_financiamiento', {
    p_empresa_id: empresa.id,
    p_id: nuevo.id,
    p_codigo: nuevo.codigo,
    p_tipo: nuevo.tipo,
    p_entidad: nuevo.entidad,
    p_monto_original: nuevo.monto_original,
    p_cuotas: nuevo.tabla_amortizacion,
    p_tipo_entidad: nuevo.tipo_entidad || null,
    p_contacto_nombre: nuevo.contacto_nombre || null,
    p_contacto_telefono: nuevo.contacto_telefono || null,
    p_contacto_email: nuevo.contacto_email || null,
    p_moneda: nuevo.moneda || 'PEN',
    p_tasa_anual: nuevo.tasa_anual || 0,
    p_tipo_tasa: nuevo.tipo_tasa || 'TEA',
    p_plazo_meses: nuevo.plazo_meses || null,
    p_meses_gracia: nuevo.meses_gracia || 0,
    p_dia_pago: nuevo.dia_pago || null,
    p_tipo_cuota: nuevo.tipo_cuota || 'frances',
    p_cuota_mensual: nuevo.cuota_mensual || 0,
    p_fecha_desembolso: nuevo.fecha_desembolso || null,
    p_fecha_primer_pago: nuevo.fecha_primer_pago || null,
    p_fecha_ultimo_pago: nuevo.fecha_ultimo_pago || null,
    p_proposito: nuevo.proposito || null,
    p_centro_costo: nuevo.centro_costo || null,
    p_cuenta_bancaria_destino: nuevo.cuenta_bancaria_destino || null,
    p_notas: nuevo.notas || null,
    p_sociedad_id: nuevo.sociedad_id || null,
  });
  if (error) throw error;
  return { ...data, sociedad_id: nuevo.sociedad_id || null, pagos_realizados: [] };
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
    sociedad_id: financiamiento.sociedad_id || null,
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

export async function registrarPagoFinanciamientoRpc({
  empresa,
  financiamientoId,
  saldoPendiente,
  estado,
  cuotasPagadas,
  interesesPagadosTotal,
  tabla,
  pago,
  movimiento,
  gasto,
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('registrar_pago_financiamiento', {
    p_empresa_id: empresa.id,
    p_financiamiento_id: financiamientoId,
    p_saldo_pendiente: saldoPendiente,
    p_estado: estado,
    p_cuotas_pagadas: cuotasPagadas,
    p_intereses_pagados_total: interesesPagadosTotal,
    p_cuotas: tabla,
    p_pago: pago,
    p_movimiento_tesoreria: movimiento,
    p_gasto_interes: gasto || null,
  });
  if (error) throw error;
  return data;
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

const cuotaPagada = cuota => cuota?.estado === 'pagada';

// Calcula la edicion de un financiamiento existente. Las cuotas pagadas se conservan tal cual;
// las demas se regeneran con los nuevos parametros sobre el saldo que queda despues del capital
// ya pagado (cuotas + abonos). Devuelve { error } si la edicion no es coherente.
export function construirEdicionFinanciamiento(financiamiento, form) {
  const tablaActual = financiamiento?.tabla_amortizacion || [];
  const pagadas = tablaActual.filter(cuotaPagada);
  const numerosPagados = new Set(pagadas.map(c => Number(c.numero)));
  const maxPagada = pagadas.reduce((max, c) => Math.max(max, Number(c.numero) || 0), 0);
  const tienePagos = pagadas.length > 0 || (financiamiento?.pagos_realizados || []).length > 0;
  const capitalPagado = round2(Math.max(0, Number(financiamiento?.monto_original || 0) - Number(financiamiento?.saldo_pendiente || 0)));
  const monto = Number(form.monto_original || 0);
  const plazo = Number(form.plazo_meses || 0);
  const gracia = Math.max(0, Number(form.meses_gracia || 0));

  if (!String(form.entidad || '').trim()) return { error: 'La entidad es obligatoria.' };
  if (!(monto > 0)) return { error: 'El monto recibido debe ser mayor a cero.' };
  if (!(plazo >= 1)) return { error: 'El plazo debe ser de al menos 1 mes.' };
  if (plazo < maxPagada) return { error: `El plazo no puede ser menor a ${maxPagada} meses: la cuota ${maxPagada} ya está pagada.` };
  if (monto < capitalPagado) return { error: `El monto no puede ser menor al capital ya pagado (${capitalPagado.toFixed(2)}).` };
  if (tienePagos && (form.moneda || 'PEN') !== (financiamiento.moneda || 'PEN')) return { error: 'No se puede cambiar la moneda de un financiamiento con pagos registrados.' };

  const parametros = {
    tasaAnual: form.tasa_anual,
    mesesGracia: gracia,
    fechaDesembolso: form.fecha_desembolso,
    diaPago: form.dia_pago,
    tipoCuota: form.tipo_cuota,
  };
  const base = generarAmortizacion({ ...parametros, monto, plazoMeses: plazo });
  const nuevoSaldo = round2(monto - capitalPagado);
  let tabla = base;

  if (tienePagos || capitalPagado > 0) {
    const porPagar = base.filter(c => !numerosPagados.has(c.numero));
    if (nuevoSaldo > 0 && porPagar.length === 0) return { error: 'No quedan cuotas por pagar para el saldo pendiente; amplía el plazo.' };
    const graciaRestante = porPagar.filter(c => c.numero <= gracia).length;
    const recalculadas = nuevoSaldo > 0
      ? generarAmortizacion({ ...parametros, monto: nuevoSaldo, plazoMeses: porPagar.length, mesesGracia: graciaRestante })
      : [];
    let idx = 0;
    tabla = base.map(c => {
      if (numerosPagados.has(c.numero)) return pagadas.find(p => Number(p.numero) === c.numero);
      const r = recalculadas[idx];
      const primera = idx === 0;
      idx += 1;
      if (!r) return { ...c, capital: 0, interes: 0, total: 0, saldo: 0, estado: 'cancelada' };
      return { ...c, capital: r.capital, interes: r.interes, total: r.total, saldo: r.saldo, estado: primera ? 'pendiente' : 'futura' };
    });
  }

  const proxima = tabla.find(c => c.estado === 'pendiente');
  const estado = nuevoSaldo <= 0 ? 'cancelado' : (financiamiento.estado === 'cancelado' ? 'vigente' : financiamiento.estado);
  const datos = {
    tipo: form.tipo,
    entidad: String(form.entidad).trim(),
    moneda: form.moneda || 'PEN',
    sociedad_id: form.sociedad_id || null,
    monto_original: monto,
    tasa_anual: Number(form.tasa_anual || 0),
    plazo_meses: plazo,
    meses_gracia: gracia,
    dia_pago: Number(form.dia_pago || 0),
    tipo_cuota: form.tipo_cuota,
    fecha_desembolso: form.fecha_desembolso || null,
    contacto_nombre: form.contacto_nombre || '',
    cuenta_bancaria_destino: form.cuenta_bancaria_destino || '',
    proposito: form.proposito || '',
    notas: form.notas || '',
    cuota_mensual: proxima?.total ?? tabla[0]?.total ?? 0,
    fecha_primer_pago: tabla[0]?.fecha || null,
    fecha_ultimo_pago: tabla[tabla.length - 1]?.fecha || null,
    saldo_pendiente: nuevoSaldo,
    estado,
  };
  return { datos, tabla, nuevoSaldo, capitalPagado, tienePagos, cuotasPagadas: pagadas.length };
}

export async function editarFinanciamientoRpc({ empresa, id, datos, cuotas }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('editar_financiamiento', {
    p_empresa_id: empresa.id,
    p_id: id,
    p_datos: datos,
    p_cuotas: cuotas,
  });
  if (error) throw error;
  return data;
}

// Con ejecutar=false solo devuelve el impacto de eliminar (para la segunda confirmacion).
export async function eliminarFinanciamientoRpc({ empresa, id, ejecutar = false }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('eliminar_financiamiento', {
    p_empresa_id: empresa.id,
    p_id: id,
    p_ejecutar: ejecutar,
  });
  if (error) throw error;
  return data;
}

// Impacto calculado con los datos cargados en pantalla (modo demo / sin Supabase).
export function impactoLocalEliminarFinanciamiento(financiamiento, movimientos = [], gastos = []) {
  const pagos = financiamiento?.pagos_realizados || [];
  const movs = movimientos.filter(m => m.vinculo_tipo === 'financiamiento' && m.vinculo_id === financiamiento.id);
  const gas = gastos.filter(g => g.financiamiento_id === financiamiento.id);
  const porCuenta = movs.reduce((acc, m) => {
    const key = `${m.cuenta_bancaria || 'Sin cuenta'}|${m.moneda || 'PEN'}`;
    acc[key] = acc[key] || { cuenta: m.cuenta_bancaria || 'Sin cuenta', moneda: m.moneda || 'PEN', cantidad: 0, total: 0 };
    acc[key].cantidad += 1;
    acc[key].total += Number(m.monto || 0);
    return acc;
  }, {});
  const sum = (rows, k) => round2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
  return {
    id: financiamiento.id,
    codigo: financiamiento.codigo,
    entidad: financiamiento.entidad,
    moneda: financiamiento.moneda || 'PEN',
    monto_original: financiamiento.monto_original,
    saldo_pendiente: financiamiento.saldo_pendiente,
    cuotas: (financiamiento.tabla_amortizacion || []).length,
    cuotas_pagadas: (financiamiento.tabla_amortizacion || []).filter(cuotaPagada).length,
    pagos: pagos.length,
    pagos_total: sum(pagos, 'total'),
    pagos_capital: sum(pagos, 'capital'),
    pagos_interes: sum(pagos, 'interes'),
    movimientos: movs.length,
    movimientos_total: sum(movs, 'monto'),
    movimientos_por_cuenta: Object.values(porCuenta),
    gastos: gas.length,
    gastos_total: sum(gas, 'monto'),
  };
}
