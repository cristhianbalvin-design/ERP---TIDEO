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
  depreciacion: emptyBlock(),
});

const emptyResult = (periodo = '') => ({
  periodo,
  currencies: ER_CURRENCIES,
  er: emptyER(),
  utilidadBruta: zeroTotals(),
  resultadoOp: zeroTotals(),
  ebitda: zeroTotals(),
  ebit: zeroTotals(),
  resultadoNeto: zeroTotals(),
  margenes: {
    utilidadBruta: zeroTotals(),
    resultadoOp: zeroTotals(),
    ebitda: zeroTotals(),
    ebit: zeroTotals(),
    resultadoNeto: zeroTotals(),
  },
  hasMovements: false,
  otherCurrenciesWarning: false,
  sourceCounts: {},
});

const amount = value => Number(value || 0);
// Corrección 2: no colapsar monedas desconocidas a PEN — preservar el código ISO real.
const currencyOf = value => normalizeCurrency(value || 'PEN');

const addToBlock = (block, label, value, currency = 'PEN') => {
  const numeric = amount(value);
  if (!numeric) return;
  const moneda = currencyOf(currency);
  block.total[moneda] = (block.total[moneda] || 0) + numeric;
  let item = block.items.find(i => i.label === label);
  if (!item) {
    item = { label, totals: zeroTotals() };
    block.items.push(item);
  }
  item.totals[moneda] = (item.totals[moneda] || 0) + numeric;
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
  result.resultadoOp   = subtractTotals(result.utilidadBruta, er.gastosOp.total);
  result.ebitda        = subtractTotals(result.resultadoOp, er.gastosFin.total);
  result.ebit          = subtractTotals(result.ebitda, er.depreciacion.total);
  result.resultadoNeto = result.ebit;
  result.margenes = {
    utilidadBruta: marginTotals(result.utilidadBruta, er.ingresos.total),
    resultadoOp:   marginTotals(result.resultadoOp, er.ingresos.total),
    ebitda:        marginTotals(result.ebitda, er.ingresos.total),
    ebit:          marginTotals(result.ebit, er.ingresos.total),
    resultadoNeto: marginTotals(result.resultadoNeto, er.ingresos.total),
  };
  result.sourceCounts = sourceCounts;
  result.hasMovements = Object.values(sourceCounts).some(v => Number(v || 0) > 0)
    || ['ingresos', 'costoVentas', 'gastosOp', 'gastosFin', 'depreciacion'].some(block =>
      ER_CURRENCIES.some(moneda => amount(er[block].total[moneda]) !== 0)
    );
  // Corrección 2: detectar monedas fuera de ER_CURRENCIES que no pudieron sumarse.
  result.otherCurrenciesWarning = ['ingresos', 'costoVentas', 'gastosOp', 'gastosFin', 'depreciacion'].some(blockKey =>
    Object.keys(er[blockKey].total).some(k => !ER_CURRENCIES.includes(k) && er[blockKey].total[k] > 0)
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

export const ER_TIPO_SISTEMA_LABELS = {
  mano_obra: 'Mano de obra',
  materiales: 'Materiales',
  servicios_terceros: 'Servicios terceros',
  logistica: 'Logistica',
  administrativos: 'Administrativos',
  comerciales: 'Comerciales',
  gastos_financieros: 'Gastos financieros',
  planilla: 'Planilla',
  cargas_sociales: 'Cargas sociales',
  intereses_financiamiento: 'Intereses de financiamiento',
  inversiones: 'Inversiones / Activos',
};

export const ER_TIPO_SISTEMA_OPTIONS = Object.entries(ER_TIPO_SISTEMA_LABELS)
  .map(([value, label]) => ({ value, label }));

const ER_FALLBACK_BY_TIPO = {
  // Fallbacks universales cuando el tenant aun no tiene una categoria configurada para ese tipo.
  mano_obra: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Mano de obra' },
  materiales: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Materiales' },
  servicios_terceros: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Servicios terceros' },
  logistica: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Logistica' },
  administrativos: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Administrativos' },
  comerciales: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Comerciales' },
  gastos_financieros: { seccion: 'gastos_financieros', regla_ot: 'siempre', nombre: 'Gastos financieros' },
  planilla: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Planilla' },
  cargas_sociales: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Cargas sociales' },
  intereses_financiamiento: { seccion: 'gastos_financieros', regla_ot: 'siempre', nombre: 'Intereses de financiamiento' },
};

const inferTipoSistema = value => {
  const v = norm(value);
  if (!v) return null;
  if (v.includes('mano de obra') || v.includes('mo operativa')) return 'mano_obra';
  if (v.includes('material')) return 'materiales';
  if (v.includes('servicio') && v.includes('tercero')) return 'servicios_terceros';
  if (v.includes('tercero')) return 'servicios_terceros';
  if (v.includes('logistica') || v.includes('transporte')) return 'logistica';
  if (v.includes('administrativ')) return 'administrativos';
  if (v.includes('comercial')) return 'comerciales';
  if (v.includes('gasto') && v.includes('financier')) return 'gastos_financieros';
  if (v.includes('planilla')) return 'planilla';
  if (v.includes('carga') && v.includes('social')) return 'cargas_sociales';
  if (v.includes('essalud') || v.includes('cts')) return 'cargas_sociales';
  if (v.includes('interes') && (v.includes('financ') || v.includes('prestamo'))) return 'intereses_financiamiento';
  return null;
};

const preferConfigByReglaOt = (configs, hasOt) => {
  if (!configs.length) return null;
  if (configs.length === 1) return configs[0];
  const preferredRules = hasOt ? ['con_ot', 'siempre', 'sin_ot'] : ['sin_ot', 'siempre', 'con_ot'];
  return preferredRules.map(rule => configs.find(c => c.regla_ot === rule)).find(Boolean) || configs[0];
};

export const resolverCategoriaPorTipoSistema = (erConfig = [], tipoSistema, { hasOt = false, allowFallback = true } = {}) => {
  if (!tipoSistema) return null;
  const configs = (erConfig || []).filter(c => c.tipo_sistema === tipoSistema && (allowFallback || !c.es_fallback));
  const config = preferConfigByReglaOt(configs, hasOt);
  if (config) return config;
  const fallback = ER_FALLBACK_BY_TIPO[tipoSistema];
  return allowFallback && fallback ? { ...fallback, tipo_sistema: tipoSistema, es_fallback: true } : null;
};

const resolverCategoriaEr = (erConfig = [], label, { hasOt = false } = {}) => {
  const byName = (erConfig || []).find(c => norm(c.nombre) === norm(label));
  if (byName) return byName;
  return resolverCategoriaPorTipoSistema(erConfig, inferTipoSistema(label), { hasOt });
};

const excludedCxpOrigins = new Set(['nomina', 'nc_devolucion', 'recepcion', 'tributos', 'dividendos']);
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
  // Corrección 5: excluir si el campo no_devengar_er está activado.
  if (cxp.no_devengar_er) return false;
  // Corrección 5: excluir si hay recepcion_id sin importar el campo origen.
  if (cxp.recepcion_id != null) return false;
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
      (!empresaId || !g.empresa_id || g.empresa_id === empresaId) &&
      isInPeriod(g.fecha, periodo) &&
      !g.es_activo_fijo &&
      inferTipoSistema(g.categoria) !== 'gastos_financieros'
    )
    .forEach(g => addToBlock(result.er.gastosOp, g.categoria || 'Gasto operativo', g.monto, g.moneda || 'PEN'));

  const moReal = ots
    .filter(o => isInPeriod(o.fecha_fin || o.fecha_inicio || o.fecha_programada, periodo))
    .reduce((s, o) => s + amount(o.costo_real), 0);
  if (moReal > 0) addToBlock(result.er.costoVentas, 'Mano de obra directa', moReal, 'PEN');

  const intereses = comprasGastos.filter(g =>
    (!empresaId || !g.empresa_id || g.empresa_id === empresaId) &&
    isInPeriod(g.fecha, periodo) &&
    inferTipoSistema(g.categoria) === 'gastos_financieros'
  );
  intereses.forEach(g => addToBlock(result.er.gastosFin, g.subcategoria || g.descripcion || 'Gastos financieros', g.monto, g.moneda || 'PEN'));

  return finalizeResult(result, {
    ingresos: result.er.ingresos.items.length,
    costos_ot: result.er.costoVentas.items.length,
    compras_gastos: result.er.gastosOp.items.length,
    pagos_financiamiento: result.er.gastosFin.items.length,
  });
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
    .in('tipo_documento', ['factura', 'boleta']);
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
    .select('id, fecha, descripcion, categoria, subcategoria, monto, moneda, centro_costo_id, ot_vinc_id, es_activo_fijo, estado, cxp_id, periodo_nomina_id, origen_registro')
    .eq('empresa_id', empresaId)
    .gte('fecha', start)
    .lt('fecha', next);
  if (effectiveCecoIds) query = query.in('centro_costo_id', effectiveCecoIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter(g => !g.es_activo_fijo && g.estado !== 'anulado');
}

async function loadCxPDevengos(supabase, empresaId, periodo) {
  const { start, next } = periodBounds(periodo);
  const { data, error } = await supabase
    .from('cxp')
    // Corrección 5: se agrega no_devengar_er al SELECT.
    .select('id, tipo_beneficiario, tipo_comprobante, factura_numero, concepto, fecha_emision, monto_total, monto_bruto, retencion_ir, moneda, estado, origen, motivo_cxp, gasto_id, recepcion_id, recibo_honorarios_id, personal_id, nombre_emisor, nc_id, categoria_er, centro_costo_id, ot_vinc_id, no_devengar_er')
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

  // Corrección 7: solo períodos cerrados para evitar montos preliminares de períodos abiertos.
  const periodoIds = (periodosR.data || [])
    .filter(p => p.estado === 'cerrado')
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

// Corrección 1: caja_chica nunca era consultada; los egresos sin gasto_id desaparecían del ER.
async function loadCajaChica(supabase, empresaId, periodo) {
  const { start, next } = periodBounds(periodo);
  const { data, error } = await supabase
    .from('caja_chica')
    .select('id, fecha, monto, moneda, categoria, gasto_id, estado')
    .eq('empresa_id', empresaId)
    .gte('fecha', start)
    .lt('fecha', next)
    .neq('estado', 'anulado');
  if (error) throw error;
  // Excluir registros con gasto_id para no duplicar lo que ya recoge loadComprasGastos.
  return (data || []).filter(r => r.gasto_id == null);
}

// Fallback cuando el tenant no tiene filas en er_categorias (tenant nuevo sin configurar).
const CATS_BASE_FALLBACK = [
  { nombre: 'Mano de obra',       tipo_sistema: 'mano_obra',          seccion: 'costo_ventas',       regla_ot: 'con_ot', es_fallback: true  },
  { nombre: 'Materiales',         tipo_sistema: 'materiales',         seccion: 'costo_ventas',       regla_ot: 'con_ot', es_fallback: true  },
  { nombre: 'Servicios terceros', tipo_sistema: 'servicios_terceros', seccion: 'costo_ventas',       regla_ot: 'con_ot', es_fallback: true  },
  { nombre: 'Logística',          seccion: 'costo_ventas',       regla_ot: 'con_ot'  },
  { nombre: 'Administrativos',    tipo_sistema: 'administrativos',    seccion: 'gastos_operativos',  regla_ot: 'siempre', es_fallback: true },
  { nombre: 'Comerciales',        tipo_sistema: 'comerciales',        seccion: 'gastos_operativos',  regla_ot: 'siempre', es_fallback: true },
  { nombre: 'Gastos financieros', tipo_sistema: 'gastos_financieros', seccion: 'gastos_financieros', regla_ot: 'siempre', es_fallback: true },
];

export async function cargarConfiguracionER(empresaId) {
  if (!isSupabaseMode() || !empresaId) return CATS_BASE_FALLBACK;
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('er_categorias')
      .select('nombre, seccion, regla_ot, tipo_sistema')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('orden');
    if (error || !data?.length) return CATS_BASE_FALLBACK;
    return data;
  } catch {
    return CATS_BASE_FALLBACK;
  }
}

export async function getEstadoResultados({ empresaId, periodo, cecoIds = [], cebeIds = [] } = {}) {
  if (!isSupabaseMode()) return emptyResult(periodo);
  if (!empresaId) throw new Error('No hay empresa activa.');

  const supabase = await getSupabaseClient();
  const effectiveCecoIds = await resolveCecoFilter(supabase, empresaId, cecoIds, cebeIds);
  const result = emptyResult(periodo);

  const [facturas, costosOt, comprasGastos, detalleNomina, pagosFinancieros, cxpDevengos, cajaChica, erConfig] = await Promise.all([
    loadFacturas(supabase, empresaId, periodo),
    loadCostosOt(supabase, empresaId),
    loadComprasGastos(supabase, empresaId, periodo, effectiveCecoIds),
    loadNomina(supabase, empresaId, periodo, effectiveCecoIds),
    loadPagosFinancieros(supabase, empresaId, periodo),
    loadCxPDevengos(supabase, empresaId, periodo),
    loadCajaChica(supabase, empresaId, periodo),
    cargarConfiguracionER(empresaId),
  ]);

  const sectionToBlock = {
    costo_ventas:      result.er.costoVentas,
    gastos_operativos: result.er.gastosOp,
    gastos_financieros: result.er.gastosFin,
  };
  const labelByTipo = (tipoSistema, fallback, hasOt = true) =>
    resolverCategoriaPorTipoSistema(erConfig, tipoSistema, { hasOt })?.nombre || fallback;

  facturas.forEach(f => {
    addToBlock(result.er.ingresos, 'Ventas de servicios', f.subtotal, f.moneda);
  });

  costosOt
    .filter(c => c.ordenes_trabajo?.estado !== 'anulada')
    .filter(c => isInPeriod(c.fecha_er, periodo))
    .filter(c => !effectiveCecoIds || matchesIds(c.ordenes_trabajo?.centro_costo_id, effectiveCecoIds))
    .filter(c => !cebeIds?.length || intersectsIds(c.ordenes_trabajo?.centro_beneficio_id, cebeIds))
    .forEach(c => {
      addToBlock(result.er.costoVentas, labelByTipo('mano_obra', 'Mano de obra directa'), c.mano_obra, c.moneda);
      addToBlock(result.er.costoVentas, labelByTipo('materiales', 'Materiales consumidos'), c.materiales, c.moneda);
      addToBlock(result.er.costoVentas, labelByTipo('servicios_terceros', 'Servicios terceros'), c.servicios_terceros, c.moneda);
      addToBlock(result.er.costoVentas, labelByTipo('logistica', 'Logistica directa'), c.logistica, c.moneda);
      addToBlock(result.er.costoVentas, 'Otros costos directos', c.otros, c.moneda);
    });

  const comprasGastosParaEr = detalleNomina.length
    ? comprasGastos.filter(g => !g.periodo_nomina_id && norm(g.origen_registro) !== 'nomina')
    : comprasGastos;

  comprasGastosParaEr.forEach(g => {
    const hasOt = g.ot_vinc_id != null;
    const entry = resolverCategoriaEr(erConfig, g.categoria, { hasOt });
    if (entry) {
      const block = sectionToBlock[entry.seccion] || result.er.gastosOp;
      if (entry.regla_ot === 'con_ot') {
        addToBlock(block, entry.nombre, g.monto, g.moneda);
      } else if (entry.regla_ot === 'sin_ot') {
        if (g.ot_vinc_id == null) {
          addToBlock(block, entry.nombre, g.monto, g.moneda);
        }
      } else {
        addToBlock(block, entry.nombre, g.monto, g.moneda);
      }
    } else if (inferTipoSistema(g.categoria) === 'gastos_financieros') {
      // Categoría financiera sin config explícita — comportamiento original preservado.
      addToBlock(result.er.gastosFin, g.subcategoria || g.descripcion || 'Gastos financieros', g.monto, g.moneda);
    } else {
      // Sin coincidencia en categorías del sistema ni personalizadas: clasificar como Otros gastos.
      addToBlock(result.er.gastosOp, 'Otros gastos', g.monto, g.moneda);
    }
  });

  const hasScopedFilters = Boolean(effectiveCecoIds) || Boolean(cebeIds?.length);
  // La deduplicación usa comprasGastos completo (incluye financieros) para evitar doble conteo de CxPs.
  const cxpDevengosEr = cxpDevengos.filter(cxp => {
    if (!cxpCanDevengarEr(cxp)) return false;
    if (compraCoversCxp(cxp, comprasGastos)) return false;
    if (!hasScopedFilters) return true;
    if (!cxp.centro_costo_id) return false;
    if (effectiveCecoIds && !effectiveCecoIds.includes(cxp.centro_costo_id)) return false;
    return true;
  });
  cxpDevengosEr.forEach(cxp => {
    const label = cxpDevengoLabel(cxp);
    // Corrección 6: CxP con label Gastos financieros (via categoria_er) va a gastosFin, no gastosOp.
    const hasOt = cxp.ot_vinc_id != null;
    const entry = resolverCategoriaEr(erConfig, label, { hasOt });
    const block = entry ? (sectionToBlock[entry.seccion] || result.er.gastosOp) : result.er.gastosOp;
    addToBlock(block, entry?.nombre || label, cxpDevengoAmount(cxp), cxp.moneda);
  });

  detalleNomina.forEach(n => {
    addToBlock(result.er.gastosOp, labelByTipo('planilla', 'Planilla neta', false), n.neto, n.moneda);
    addToBlock(
      result.er.gastosOp,
      labelByTipo('cargas_sociales', 'Cargas sociales', false),
      amount(n.essalud) + amount(n.cts) + amount(n.gratificacion) + amount(n.vacaciones),
      n.moneda
    );
  });

  // Corrección 1: egresos de caja_chica sin gasto_id van a Gastos Operativos.
  cajaChica.forEach(r => {
    addToBlock(result.er.gastosOp, r.categoria || 'Caja chica', r.monto, r.moneda);
  });

  pagosFinancieros.forEach(p => {
    addToBlock(result.er.gastosFin, labelByTipo('intereses_financiamiento', 'Intereses de financiamiento', false), p.interes, p.moneda);
  });

  return finalizeResult(result, {
    facturas: facturas.length,
    costos_ot: costosOt.filter(c => isInPeriod(c.fecha_er, periodo) && c.ordenes_trabajo?.estado !== 'anulada').length,
    compras_gastos: comprasGastosParaEr.length,
    cxp_devengos: cxpDevengosEr.length,
    detalle_nomina: detalleNomina.length,
    pagos_financiamiento: pagosFinancieros.length,
    caja_chica: cajaChica.length,
  });
}
