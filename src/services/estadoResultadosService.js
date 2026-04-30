import { formatCurrencyTotals, sumByCurrency } from '../lib/currency.js';

const isInPeriod = (date, period) => String(date || '').slice(0, 7) === period;

export function gastosFinancierosPorMoneda(comprasGastos = [], { empresaId, periodo } = {}) {
  return sumByCurrency(
    comprasGastos.filter(gasto =>
      (!empresaId || gasto.empresa_id === empresaId) &&
      gasto.categoria === 'Gastos financieros' &&
      (!periodo || isInPeriod(gasto.fecha, periodo))
    ),
    gasto => gasto.monto,
    gasto => gasto.moneda || 'PEN'
  );
}

export function buildEstadoResultados({ base, comprasGastos = [], ots = [], empresa, periodo = '2026-04' }) {
  const isInP = (date) => isInPeriod(date, periodo);
  const empresaId = empresa?.id;

  // 1. Ingresos Reales (Basado en Valorizaciones o MOCK por ahora)
  const ingresosTotal = base.ingresos.total; // En el futuro: sumar facturas cobradas

  // 2. Costo de Ventas Dinámico
  // Filtrar gastos que son 'Costo Directo'
  const gastosCostoVentas = comprasGastos.filter(g => 
    (!empresaId || g.empresa_id === empresaId) && 
    isInP(g.fecha) && 
    ['Materiales', 'Servicios terceros', 'Logistica'].includes(g.categoria)
  );

  const matCost = gastosCostoVentas.filter(g => g.categoria === 'Materiales').reduce((s, g) => s + Number(g.monto), 0);
  const stCost = gastosCostoVentas.filter(g => g.categoria === 'Servicios terceros').reduce((s, g) => s + Number(g.monto), 0);
  const logCost = gastosCostoVentas.filter(g => g.categoria === 'Logistica').reduce((s, g) => s + Number(g.monto), 0);

  // Mano de Obra: Si ots tiene costo_real, lo usamos, sino base
  const moReal = ots.filter(o => isInP(o.fecha_inicio)).reduce((s, o) => s + Number(o.costo_real || 0), 0);
  const moTotal = moReal > 0 ? moReal : base.costoVentas.items.find(i => i.label.includes('Mano de obra'))?.valor || 0;

  const costoVentasTotal = moTotal + matCost + stCost + logCost;

  // 3. Gastos Operativos
  const gastosOpItems = comprasGastos.filter(g => 
    (!empresaId || g.empresa_id === empresaId) && 
    isInP(g.fecha) && 
    ['Administrativos', 'Comerciales'].includes(g.categoria)
  );
  const admCost = gastosOpItems.filter(g => g.categoria === 'Administrativos').reduce((s, g) => s + Number(g.monto), 0);
  const comCost = gastosOpItems.filter(g => g.categoria === 'Comerciales').reduce((s, g) => s + Number(g.monto), 0);
  const gastosOpTotal = admCost + comCost;

  // 4. Gastos Financieros
  const interesesPorMoneda = gastosFinancierosPorMoneda(comprasGastos, {
    empresaId,
    periodo,
  });
  const interesesPEN = interesesPorMoneda.PEN || 0;
  const comisionesBancarias = base.gastosFin.items.find(i =>
    i.label.toLowerCase().includes('comisiones')
  )?.valor || 0;
  const gastosFinancierosDisplay = formatCurrencyTotals({
    PEN: interesesPEN + comisionesBancarias,
    ...Object.fromEntries(Object.entries(interesesPorMoneda).filter(([moneda]) => moneda !== 'PEN')),
  });

  const er = {
    ingresos: base.ingresos,
    costoVentas: {
      total: costoVentasTotal,
      items: [
        { label: 'Mano de obra directa', valor: moTotal },
        { label: 'Materiales consumidos', valor: matCost },
        { label: 'Servicios terceros', valor: stCost },
        { label: 'Logistica directa', valor: logCost },
      ]
    },
    gastosOp: {
      total: gastosOpTotal > 0 ? gastosOpTotal : base.gastosOp.total,
      items: [
        { label: 'Administrativos', valor: admCost || base.gastosOp.items[0].valor },
        { label: 'Comerciales', valor: comCost || base.gastosOp.items[1].valor },
      ]
    },
    gastosFin: {
      total: interesesPEN + comisionesBancarias,
      items: [
        {
          label: 'Intereses de prestamos',
          valor: interesesPEN,
          valorDisplay: formatCurrencyTotals(interesesPorMoneda),
        },
        { label: 'Comisiones bancarias', valor: comisionesBancarias },
      ],
      display: gastosFinancierosDisplay,
    },
  };

  const utilidadBruta = er.ingresos.total - er.costoVentas.total;
  const resultadoOp = utilidadBruta - er.gastosOp.total;
  const resultadoNeto = resultadoOp - er.gastosFin.total;

  return {
    er,
    utilidadBruta,
    resultadoOp,
    resultadoNeto,
    interesesPorMoneda,
  };
}

