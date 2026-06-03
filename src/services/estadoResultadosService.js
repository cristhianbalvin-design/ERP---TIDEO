import { normalizeCurrency } from '../lib/currency.js';
import { isSupabaseMode } from '../lib/dataMode.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

export const ER_CURRENCIES = ['PEN', 'USD'];

const zeroTotals = () => Object.fromEntries(ER_CURRENCIES.map(m => [m, 0]));
const isInPeriod = (date, period) => String(date || '').slice(0, 7) === period;
const periodBounds = period => {
  const [year, month] = String(period || '').split('-').map(Number);
  const start = new Date(Date.UTC(year || new Date().getFullYear(), (month || 1) - 1, 1));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
  };
};

const emptyBlock = () => ({ total: zeroTotals(), items: [] });
const emptyER = () => ({
  ingresos: emptyBlock(),
  costoVentas: emptyBlock(),
  gastosOp: emptyBlock(),
  gastosFin: emptyBlock(),
});

const emptyResult = (periodo = '') => ({
  periodo,
  currencies: ER_CURRENCIES,
  er: emptyER(),
  utilidadBruta: zeroTotals(),
  resultadoOp: zeroTotals(),
  resultadoNeto: zeroTotals(),
  margenes: {
    utilidadBruta: zeroTotals(),
    resultadoOp: zeroTotals(),
    resultadoNeto: zeroTotals(),
  },
  hasMovements: false,
  sourceCounts: {},
});

const amount = value => Number(value || 0);
const currencyOf = value => {
  const currency = normalizeCurrency(value || 'PEN');
  return ER_CURRENCIES.includes(currency) ? currency : 'PEN';
};

const addToBlock = (block, label, value, currency = 'PEN') => {
  const numeric = amount(value);
  if (!numeric) return;
  const moneda = currencyOf(currency);
  block.total[moneda] += numeric;
  let item = block.items.find(i => i.label === label);
  if (!item) {
    item = { label, totals: zeroTotals() };
    block.items.push(item);
  }
  item.totals[moneda] += numeric;
};

const subtractTotals = (left, right) => Object.fromEntries(
  ER_CURRENCIES.map(moneda => [moneda, amount(left?.[moneda]) - amount(right?.[moneda])])
);

const marginTotals = (result, ingresos) => Object.fromEntries(
  ER_CURRENCIES.map(moneda => {
    const base = amount(ingresos?.[moneda]);
    return [moneda, base ? Math.round((amount(result?.[moneda]) / base) * 100) : 0];
  })
);

const finalizeResult = (result, sourceCounts = {}) => {
  const er = result.er;
  result.utilidadBruta = subtractTotals(er.ingresos.total, er.costoVentas.total);
  result.resultadoOp = subtractTotals(result.utilidadBruta, er.gastosOp.total);
  result.resultadoNeto = subtractTotals(result.resultadoOp, er.gastosFin.total);
  result.margenes = {
    utilidadBruta: marginTotals(result.utilidadBruta, er.ingresos.total),
    resultadoOp: marginTotals(result.resultadoOp, er.ingresos.total),
    resultadoNeto: marginTotals(result.resultadoNeto, er.ingresos.total),
  };
  result.sourceCounts = sourceCounts;
  result.hasMovements = Object.values(sourceCounts).some(v => Number(v || 0) > 0)
    || ['ingresos', 'costoVentas', 'gastosOp', 'gastosFin'].some(block =>
      ER_CURRENCIES.some(moneda => amount(er[block].total[moneda]) !== 0)
    );
  return result;
};

const matchesIds = (id, ids) => ids == null || ids.includes(id);
const intersectsIds = (id, ids) => ids == null || ids.includes(id);
const norm = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const sameMoney = (a, b) => Math.abs(amount(a) - amount(b)) < 0.01;
const cxpOrigin = cxp => norm(cxp?.origen || 'manual');
const cxpMotive = cxp => norm(cxp?.motivo_cxp || '');
const cxpDocType = cxp => norm(cxp?.tipo_comprobante || '');
const cxpIsCancelled = cxp => norm(cxp?.estado).includes('anulad');
const cxpIsRhe = cxp => cxpDocType(cxp) === 'rhe'
  || Boolean(cxp?.recibo_honorarios_id)
  || amount(cxp?.monto_bruto) > 0;

const excludedCxpOrigins = new Set(['nomina', 'nc_devolucion', 'recepcion']);
const excludedCxpMotives = new Set(['devolucion_nc', 'planilla', 'essalud', 'pensiones', 'ir_5ta']);

const cxpDevengoAmount = cxp => {
  if (cxpIsRhe(cxp)) return amount(cxp?.monto_bruto) || amount(cxp?.monto_total);
  return amount(cxp?.monto_total);
};

const cxpDevengoLabel = cxp => {
  if (cxp?.categoria_er) return cxp.categoria_er;
  const origin = cxpOrigin(cxp);
  const motive = cxpMotive(cxp);
  if (cxpIsRhe(cxp) && cxp?.recibo_honorarios_id) return 'Comisiones por honorarios';
  if (cxpIsRhe(cxp)) return 'Servicios terceros';
  if (origin === 'viaticos' || motive === 'viaticos_reembolso') return 'Administrativos';
  if (cxp?.tipo_beneficiario === 'personal') return 'Honorarios y reembolsos';
  return 'Gastos operativos';
};

const cxpCanDevengarEr = cxp => {
  if (!cxp || cxpIsCancelled(cxp)) return false;
  if (excludedCxpOrigins.has(cxpOrigin(cxp))) return false;
  if (excludedCxpMotives.has(cxpMotive(cxp))) return false;
  return cxpDevengoAmount(cxp) > 0;
};

const compraCoversCxp = (cxp, comprasGastos = []) => {
  const cxpId = cxp?.id;
  const gastoId = cxp?.gasto_id;
  // FK exacto primero (migration 168 agrega cxp_id a compras_gastos)
  if (cxpId && comprasGastos.some(g => g.cxp_id === cxpId)) return true;
  const fecha = String(cxp?.fecha_emision || '').slice(0, 10);
  const moneda = currencyOf(cxp?.moneda);
  const monto = cxpDevengoAmount(cxp);
  const cxpText = norm([cxp?.concepto, cxp?.factura_numero, cxp?.nombre_emisor].filter(Boolean).join(' '));

  return comprasGastos.some(g => {
    if (cxpId && g.cxp_id === cxpId) return true;
    if (gastoId && g.id === gastoId) return true;
    const gastoText = norm([g.descripcion, g.subcategoria].filter(Boolean).join(' '));
    const sameFingerprint = String(g.fecha || '').slice(0, 10) === fecha
      && currencyOf(g.moneda) === moneda
      && sameMoney(g.monto, monto);
    if (!sameFingerprint || !cxpText || !gastoText) return false;
    return cxpText.includes(gastoText)
      || gastoText.includes(cxpText)
      || (cxp?.factura_numero && gastoText.includes(norm(cxp.factura_numero)));
  });
};

async function resolveCecoFilter(supabase, empresaId, cecoIds = [], cebeIds = []) {
  const selectedCecos = Array.isArray(cecoIds) ? cecoIds.filter(Boolean) : [];
  const selectedCebes = Array.isArray(cebeIds) ? cebeIds.filter(Boolean) : [];
  if (!selectedCebes.length) return selectedCecos.length ? selectedCecos : null;

  const { data, error } = await supabase
    .from('centros_costo')
    .select('id, cebe_id')
    .eq('empresa_id', empresaId)
    .in('cebe_id', selectedCebes);
  if (error) throw error;

  const cecosFromCebe = (data || []).map(c => c.id);
  if (selectedCecos.length) return selectedCecos.filter(id => cecosFromCebe.includes(id));
  return cecosFromCebe;
}

export function buildEstadoResultados({ base, comprasGastos = [], ots = [], empresa, periodo = '2026-04' }) {
  const result = emptyResult(periodo);
  const empresaId = empresa?.id;

  (base?.ingresos?.items || []).forEach(item => {
    addToBlock(result.er.ingresos, item.label, item.valor, 'PEN');
  });
  if (!result.er.ingresos.items.length && base?.ingresos?.total) {
    addToBlock(result.er.ingresos, 'Ventas de servicios', base.ingresos.total, 'PEN');
  }

  (base?.costoVentas?.items || []).forEach(item => {
    addToBlock(result.er.costoVentas, item.label, item.valor, 'PEN');
  });

  comprasGastos
    .filter(g =>
      (!empresaId || g.empresa_id === empresaId) &&
      isInPeriod(g.fecha, periodo) &&
      !g.es_activo_fijo &&
      g.categoria !== 'Gastos financieros'
    )
    .forEach(g => addToBlock(result.er.gastosOp, g.categoria || 'Gasto operativo', g.monto, g.moneda || 'PEN'));

  const moReal = ots
    .filter(o => isInPeriod(o.fecha_fin || o.fecha_inicio || o.fecha_programada, periodo))
    .reduce((s, o) => s + amount(o.costo_real), 0);
  if (moReal > 0) addToBlock(result.er.costoVentas, 'Mano de obra directa', moReal, 'PEN');

  const intereses = comprasGastos.filter(g =>
    (!empresaId || g.empresa_id === empresaId) &&
    isInPeriod(g.fecha, periodo) &&
    g.categoria === 'Gastos financieros'
  );
  intereses.forEach(g => addToBlock(result.er.gastosFin, g.subcategoria || g.descripcion || 'Gastos financieros', g.monto, g.moneda || 'PEN'));

  return finalizeResult(result, {
    ingresos: result.er.ingresos.items.length,
    costos_ot: result.er.costoVentas.items.length,
    compras_gastos: result.er.gastosOp.items.length,
    pagos_financiamiento: result.er.gastosFin.items.length,
  });
}

async function loadVentas(supabase, empresaId, periodo) {
  const { start, next } = periodBounds(periodo);
  const { data, error } = await supabase
    .from('ventas')
    .select('id, concepto, monto_total, moneda, fecha, estado')
    .eq('empresa_id', empresaId)
    .gte('fecha', start)
    .lt('fecha', next)
    .neq('estado', 'anulada');
  if (error) throw error;
  return data || [];
}

async function loadFacturas(supabase, empresaId, periodo) {
  const { start, next } = periodBounds(periodo);
  const { data, error } = await supabase
    .from('facturas')
    .select('id, numero, subtotal, igv, total, moneda, fecha_emision, estado, tipo_documento')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', start)
    .lt('fecha_emision', next)
    .neq('estado', 'anulada')
    .not('tipo_documento', 'in', '("nota_credito","nota_debito")');
  if (error) throw error;
  return data || [];
}

async function loadCostosOt(supabase, empresaId) {
  const [costosR, cierresR] = await Promise.all([
    supabase
      .from('costos_ot')
      .select('id, orden_trabajo_id, mano_obra, materiales, servicios_terceros, logistica, otros, total, moneda, calculado_at, ordenes_trabajo(id, numero, servicio, descripcion, fecha_fin, fecha_programada, centro_costo_id, centro_beneficio_id)')
      .eq('empresa_id', empresaId),
    supabase
      .from('cierres_tecnicos')
      .select('orden_trabajo_id, fecha_cierre')
      .eq('empresa_id', empresaId),
  ]);
  if (costosR.error) throw costosR.error;
  if (cierresR.error) throw cierresR.error;

  const cierreByOt = new Map((cierresR.data || []).map(c => [c.orden_trabajo_id, c.fecha_cierre]));
  return (costosR.data || []).map(c => ({
    ...c,
    fecha_er: cierreByOt.get(c.orden_trabajo_id)
      || c.ordenes_trabajo?.fecha_fin
      || c.ordenes_trabajo?.fecha_programada
      || c.calculado_at?.slice?.(0, 10),
  }));
}

async function loadComprasGastos(supabase, empresaId, periodo, effectiveCecoIds) {
  if (effectiveCecoIds && effectiveCecoIds.length === 0) return [];
  const { start, next } = periodBounds(periodo);
  let query = supabase
    .from('compras_gastos')
    .select('id, fecha, descripcion, categoria, subcategoria, monto, moneda, centro_costo_id, es_activo_fijo, estado, cxp_id, periodo_nomina_id, origen_registro')
    .eq('empresa_id', empresaId)
    .gte('fecha', start)
    .lt('fecha', next);
  if (effectiveCecoIds) query = query.in('centro_costo_id', effectiveCecoIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter(g => !g.es_activo_fijo && g.estado !== 'anulado' && g.categoria !== 'Gastos financieros');
}

async function loadCxPDevengos(supabase, empresaId, periodo) {
  const { start, next } = periodBounds(periodo);
  const { data, error } = await supabase
    .from('cxp')
    .select('id, tipo_beneficiario, tipo_comprobante, factura_numero, concepto, fecha_emision, monto_total, monto_bruto, retencion_ir, moneda, estado, origen, motivo_cxp, gasto_id, recepcion_id, recibo_honorarios_id, personal_id, nombre_emisor, nc_id, categoria_er, centro_costo_id')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', start)
    .lt('fecha_emision', next);
  if (error) throw error;
  return data || [];
}

async function loadNomina(supabase, empresaId, periodo, effectiveCecoIds) {
  if (effectiveCecoIds && effectiveCecoIds.length === 0) return [];
  const [year, month] = String(periodo || '').split('-').map(Number);
  let periodosQ = supabase
    .from('periodos_nomina')
    .select('id, periodo, anio, mes, estado')
    .eq('empresa_id', empresaId);
  if (year && month) periodosQ = periodosQ.or(`periodo.eq.${periodo},and(anio.eq.${year},mes.eq.${month})`);
  const periodosR = await periodosQ;
  if (periodosR.error) throw periodosR.error;

  const periodoIds = (periodosR.data || [])
    .filter(p => p.estado !== 'anulado')
    .map(p => p.id);
  if (!periodoIds.length) return [];

  let detalleQ = supabase
    .from('detalle_nomina')
    .select('id, periodo_nomina_id, centro_costo_id, neto, essalud, cts, gratificacion, vacaciones, moneda')
    .eq('empresa_id', empresaId)
    .in('periodo_nomina_id', periodoIds);
  if (effectiveCecoIds) detalleQ = detalleQ.in('centro_costo_id', effectiveCecoIds);
  const detalleR = await detalleQ;
  if (detalleR.error) throw detalleR.error;
  return detalleR.data || [];
}

async function loadPagosFinancieros(supabase, empresaId, periodo) {
  const { start, next } = periodBounds(periodo);
  const pagosR = await supabase
    .from('pagos_financiamiento')
    .select('id, fecha_pago, interes, moneda')
    .eq('empresa_id', empresaId)
    .gte('fecha_pago', start)
    .lt('fecha_pago', next);
  if (pagosR.error) throw pagosR.error;
  if ((pagosR.data || []).length) return pagosR.data || [];

  const amortR = await supabase
    .from('tabla_amortizacion')
    .select('id, fecha_pago_real, interes, estado, financiamientos(moneda)')
    .eq('empresa_id', empresaId)
    .gte('fecha_pago_real', start)
    .lt('fecha_pago_real', next)
    .in('estado', ['pagada', 'pagado']);
  if (amortR.error) throw amortR.error;
  return (amortR.data || []).map(row => ({
    id: row.id,
    fecha_pago: row.fecha_pago_real,
    interes: row.interes,
    moneda: row.financiamientos?.moneda || 'PEN',
  }));
}

export async function getEstadoResultados({ empresaId, periodo, cecoIds = [], cebeIds = [] } = {}) {
  if (!isSupabaseMode()) return emptyResult(periodo);
  if (!empresaId) throw new Error('No hay empresa activa.');

  const supabase = await getSupabaseClient();
  const effectiveCecoIds = await resolveCecoFilter(supabase, empresaId, cecoIds, cebeIds);
  const result = emptyResult(periodo);

  const [ventas, facturas, costosOt, comprasGastos, detalleNomina, pagosFinancieros, cxpDevengos] = await Promise.all([
    loadVentas(supabase, empresaId, periodo),
    loadFacturas(supabase, empresaId, periodo),
    loadCostosOt(supabase, empresaId),
    loadComprasGastos(supabase, empresaId, periodo, effectiveCecoIds),
    loadNomina(supabase, empresaId, periodo, effectiveCecoIds),
    loadPagosFinancieros(supabase, empresaId, periodo),
    loadCxPDevengos(supabase, empresaId, periodo),
  ]);

  ventas.forEach(v => {
    addToBlock(result.er.ingresos, v.concepto || 'Ventas de servicios', v.monto_total, v.moneda);
  });

  // Facturas como fuente de ingresos (subtotal = neto sin IGV, estándar para P&G)
  facturas.forEach(f => {
    addToBlock(result.er.ingresos, 'Ventas de servicios', f.subtotal, f.moneda);
  });

  costosOt
    .filter(c => isInPeriod(c.fecha_er, periodo))
    .filter(c => !effectiveCecoIds || matchesIds(c.ordenes_trabajo?.centro_costo_id, effectiveCecoIds))
    .filter(c => !cebeIds?.length || intersectsIds(c.ordenes_trabajo?.centro_beneficio_id, cebeIds))
    .forEach(c => {
      addToBlock(result.er.costoVentas, 'Mano de obra directa', c.mano_obra, c.moneda);
      addToBlock(result.er.costoVentas, 'Materiales consumidos', c.materiales, c.moneda);
      addToBlock(result.er.costoVentas, 'Servicios terceros', c.servicios_terceros, c.moneda);
      addToBlock(result.er.costoVentas, 'Logistica directa', c.logistica, c.moneda);
      addToBlock(result.er.costoVentas, 'Otros costos directos', c.otros, c.moneda);
    });

  const comprasGastosParaEr = detalleNomina.length
    ? comprasGastos.filter(g => !g.periodo_nomina_id && norm(g.origen_registro) !== 'nomina')
    : comprasGastos;

  comprasGastosParaEr.forEach(g => {
    addToBlock(result.er.gastosOp, g.categoria || g.subcategoria || 'Gasto operativo', g.monto, g.moneda);
  });

  const hasScopedFilters = Boolean(effectiveCecoIds) || Boolean(cebeIds?.length);
  const cxpDevengosEr = cxpDevengos.filter(cxp => {
    if (!cxpCanDevengarEr(cxp)) return false;
    if (compraCoversCxp(cxp, comprasGastos)) return false;
    if (!hasScopedFilters) return true;
    if (!cxp.centro_costo_id) return false;
    if (effectiveCecoIds && !effectiveCecoIds.includes(cxp.centro_costo_id)) return false;
    return true;
  });
  cxpDevengosEr.forEach(cxp => {
    addToBlock(result.er.gastosOp, cxpDevengoLabel(cxp), cxpDevengoAmount(cxp), cxp.moneda);
  });

  detalleNomina.forEach(n => {
    addToBlock(result.er.gastosOp, 'Planilla neta', n.neto, n.moneda);
    addToBlock(
      result.er.gastosOp,
      'Cargas sociales',
      amount(n.essalud) + amount(n.cts) + amount(n.gratificacion) + amount(n.vacaciones),
      n.moneda
    );
  });

  pagosFinancieros.forEach(p => {
    addToBlock(result.er.gastosFin, 'Intereses de financiamiento', p.interes, p.moneda);
  });

  return finalizeResult(result, {
    ventas: ventas.length,
    facturas: facturas.length,
    costos_ot: costosOt.filter(c => isInPeriod(c.fecha_er, periodo)).length,
    compras_gastos: comprasGastosParaEr.length,
    cxp_devengos: cxpDevengosEr.length,
    detalle_nomina: detalleNomina.length,
    pagos_financiamiento: pagosFinancieros.length,
  });
}
