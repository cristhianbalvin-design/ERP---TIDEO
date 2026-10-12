const clean = value => String(value ?? '').trim();
export const normalizarMonedaBI = value => {
  const moneda = clean(value).toUpperCase();
  return !moneda || moneda === '$' || moneda === 'US$' ? (moneda ? 'USD' : 'PEN') : moneda;
};
const estado = row => clean(row?.estado).toLowerCase().replace(/\s+/g, '_');
const mesDe = value => clean(value).slice(0, 7);
const fechaDeCreacion = row => row?.fecha_creacion || row?.created_at || '';
const esConvertido = lead => Boolean(lead?.convertido) || estado(lead) === 'convertido';
const montoOpp = (opp, cotizaciones) => {
  const aprobadas = cotizaciones.filter(c => c.oportunidad_id === opp.id && ['aprobada', 'convertida'].includes(estado(c)));
  const cot = aprobadas.sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || clean(b.fecha || b.created_at).localeCompare(clean(a.fecha || a.created_at)))[0];
  return { monto: Number(cot ? (cot.subtotal ?? cot.subtotal_impl ?? cot.total_impl ?? cot.total ?? 0) : (opp.monto_estimado || 0)) || 0, moneda: normalizarMonedaBI(cot?.moneda || opp.moneda), origen: cot ? 'Cotización' : 'Monto estimado', cotizacion: cot || null };
};
const fechaCierre = (opp, historial) => opp.fecha_cierre_real || historial
  .filter(h => (h.opp_id || h.oportunidad_id) === opp.id && estado({ estado: h.etapa_hasta }) === 'ganada')
  .sort((a, b) => clean(b.creado_en || b.fecha).localeCompare(clean(a.creado_en || a.fecha)))[0]?.creado_en?.slice(0, 10)
  || historial.filter(h => (h.opp_id || h.oportunidad_id) === opp.id && estado({ estado: h.etapa_hasta }) === 'ganada').sort((a, b) => clean(b.fecha).localeCompare(clean(a.fecha)))[0]?.fecha?.slice(0, 10) || '';
const dia = value => clean(value).slice(0, 10);
const dayNumber = value => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia(value)); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; };
const daysBetween = (from, to) => { const a = dayNumber(from), b = dayNumber(to); return a == null || b == null ? null : Math.max(0, b - a); };
const addMonths = (periodo, offset) => { const [y, m] = periodo.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1 + offset, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; };
export function normalizarFuenteBI(value) {
  const original = clean(value);
  const raw = original.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const key = raw.replace(/ /g, '');
  if (!raw) return 'Sin fuente';
  if (['web', 'formularioweb'].includes(key)) return 'Web';
  if (key === 'campomovil') return 'Campo móvil';
  if (key === 'powerbiialanding') return 'Landing Power BI';
  if (['referido', 'manual'].includes(key)) return key[0].toUpperCase() + key.slice(1);
  if (key === 'linkedin') return 'LinkedIn';
  return original.replace(/_/g, ' ');
}
export function etiquetaBI(value, tipo = 'etapa') {
  const raw = clean(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const labels = tipo === 'lead'
    ? { nuevo: 'Nuevo', 'en contacto': 'En contacto', contacto: 'En contacto', calificado: 'Calificado' }
    : { calificacion: 'Calificación', propuesta: 'Propuesta', negociacion: 'Negociación', cierre: 'Cierre' };
  return labels[raw] || (raw ? raw[0].toUpperCase() + raw.slice(1) : '');
}
export function formatearFechaBI(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value).slice(0, 10));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}
export function escaparCSVBI(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
export function crearCSVBI(headers, rows) { return `\uFEFF${[headers, ...rows].map(row => row.map(escaparCSVBI).join(',')).join('\r\n')}`; }
export function filasCSVBI(tab, data, cliente) {
  if (tab === 'ventas') return {
    headers: ['Oportunidad', 'Cliente', 'Responsable', 'Cierre', 'Origen del monto', 'Monto sin IGV'],
    rows: data.ventas.map(o => [o.nombre || o.servicio_interes || o.id, cliente(o), o.responsable || 'Por asignar', o.cierre, o.origen, o.monto]),
  };
  if (tab === 'leads') return {
    headers: ['Lead', 'Empresa', 'Responsable', 'Estado', 'Días sin actividad'],
    rows: data.activos.map(l => [l.nombre || l.nombre_contacto || 'Sin nombre', l.empresa_contacto || l.empresa_nombre || '', l.responsable || 'Por asignar', l.estado, l.dias]),
  };
  return {
    headers: ['Oportunidad', 'Cliente', 'Etapa', 'Responsable', 'Días en etapa', 'Vencida', 'Monto sin IGV'],
    rows: data.open.map(o => [o.nombre || o.id, cliente(o), o.etapa || 'Sin etapa', o.responsable || 'Por asignar', o.dias_etapa ?? '', o.vencida ? 'Sí' : 'No', o.monto]),
  };
}
export function calcularBIComercial({ oportunidades = [], leads = [], cuentas = [], cotizaciones = [], historial = [], periodo, moneda, hoy }) {
  const currency = normalizarMonedaBI(moneda);
  const oppMonto = opp => montoOpp(opp, cotizaciones);
  const ganadasAll = oportunidades.filter(o => estado(o) === 'ganada').map(o => ({ ...o, cierre: fechaCierre(o, historial), ...oppMonto(o) })).filter(o => o.cierre);
  const ventas = ganadasAll.filter(o => mesDe(o.cierre) === periodo && o.moneda === currency).map(o => ({ ...o, dias_ciclo: daysBetween(fechaDeCreacion(o), o.cierre) }));
  const totalVentas = ventas.reduce((s, o) => s + o.monto, 0);
  const days = ventas.map(o => daysBetween(fechaDeCreacion(o), o.cierre)).filter(n => n != null);
  const leadsPeriodo = leads.filter(l => mesDe(fechaDeCreacion(l)) === periodo && estado(l) !== 'descartado');
  const activos = leads.filter(l => ['nuevo', 'en_contacto', 'contacto', 'calificado'].includes(estado(l)) && !esConvertido(l) && estado(l) !== 'descartado');
  const funnel = { creados: leadsPeriodo.length, contactados: leadsPeriodo.filter(l => ['en_contacto', 'contacto', 'calificado'].includes(estado(l)) || esConvertido(l)).length, calificados: leadsPeriodo.filter(l => estado(l) === 'calificado' || esConvertido(l)).length, convertidos: leadsPeriodo.filter(esConvertido).length };
  const fuentesMap = new Map();
  leadsPeriodo.forEach(l => { const key = normalizarFuenteBI(l.fuente); const row = fuentesMap.get(key) || { fuente: key, cantidad: 0, convertidos: 0 }; row.cantidad++; if (esConvertido(l)) row.convertidos++; fuentesMap.set(key, row); });
  const fuentes = [...fuentesMap.values()].map(r => ({ ...r, porcentaje: funnel.creados ? r.cantidad / funnel.creados * 100 : 0 })).sort((a, b) => b.cantidad - a.cantidad);
  const open = oportunidades.filter(o => estado(o) === 'abierta').map(o => {
    const hist = historial.filter(h => (h.opp_id || h.oportunidad_id) === o.id && h.etapa_hasta === o.etapa).sort((a, b) => clean(b.creado_en || b.fecha).localeCompare(clean(a.creado_en || a.fecha)))[0];
    const start = hist?.creado_en || hist?.fecha || fechaDeCreacion(o);
    return { ...o, ...oppMonto(o), dias_etapa: daysBetween(start, hoy), vencida: Boolean(o.fecha_cierre_estimada && dia(o.fecha_cierre_estimada) < hoy) };
  }).filter(o => o.moneda === currency);
  const quotesLatest = new Map();
  cotizaciones.filter(c => normalizarMonedaBI(c.moneda) === currency && !['borrador', 'anulada'].includes(estado(c))).forEach(c => {
    const key = c.numero || c.id; const prior = quotesLatest.get(key);
    if (!prior || Number(c.version || 1) >= Number(prior.version || 1)) quotesLatest.set(key, c);
  });
  const quoted = [...quotesLatest.values()].filter(c => mesDe(c.fecha || c.created_at) === periodo);
  const quoteTotal = quoted.reduce((s, c) => s + Number(c.subtotal ?? c.subtotal_impl ?? c.total_impl ?? c.total ?? 0), 0);
  const quoteApproved = quoted.filter(c => ['aprobada', 'convertida'].includes(estado(c)));
  const quoteApprovedTotal = quoteApproved.reduce((s, c) => s + Number(c.subtotal ?? c.subtotal_impl ?? c.total_impl ?? c.total ?? 0), 0);
  const lost = oportunidades.filter(o => estado(o) === 'perdida' && mesDe(o.fecha_cierre_real) === periodo).map(o => ({ ...o, ...oppMonto(o) })).filter(o => o.moneda === currency);
  const lostReasons = group(lost, o => clean(o.motivo_perdida) || 'Sin motivo', o => o.monto);
  const discarded = leads.filter(l => estado(l) === 'descartado' && mesDe(fechaDeCreacion(l)) === periodo);
  const discardedReasons = group(discarded, l => clean(l.motivo_descarte) || 'Sin motivo');
  const series = Array.from({ length: 6 }, (_, i) => {
    const key = addMonths(periodo, i - 5);
    const wins = ganadasAll.filter(o => mesDe(o.cierre) === key && o.moneda === currency);
    const monthLeads = leads.filter(l => mesDe(fechaDeCreacion(l)) === key && estado(l) !== 'descartado');
    return { periodo: key, ventas: wins.reduce((s, o) => s + o.monto, 0), cantidad_ventas: wins.length, leads: monthLeads.length, convertidos: monthLeads.filter(esConvertido).length };
  });
  const responsables = group(ventas, o => clean(o.responsable) || 'Por asignar', o => o.monto);
  const seis = ganadasAll.filter(o => mesDe(o.cierre) >= addMonths(periodo, -5) && mesDe(o.cierre) <= periodo && o.moneda === currency);
  const clientes = group(seis, o => cuentas.find(c => c.id === o.cuenta_id)?.razon_social || cuentas.find(c => c.id === o.cuenta_id)?.nombre_comercial || o.cliente || 'Sin cliente', o => o.monto);
  const abiertasEtapa = group(open, o => clean(o.etapa) || 'Sin etapa', o => o.monto);
  const ventasPorResponsable = responsables;
  const leadsActivos = activos.map(l => ({ ...l, dias: Number.isFinite(Number(l.dias_sin_actividad)) && l.dias_sin_actividad !== '' ? Number(l.dias_sin_actividad) : daysBetween(l.updated_at || l.actualizado_en || fechaDeCreacion(l), hoy) }));
  return { moneda: currency, ventas, totalVentas, cantidadVentas: ventas.length, ticket: ventas.length ? totalVentas / ventas.length : null, ciclo: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null, cotizado: quoteTotal, cotizadoAprobado: quoteApprovedTotal, cotizacionesAprobadas: quoteApproved.length, cotizacionesTotal: quoted.length, cotizacionesMes: quoted.map(c => ({ numero: c.numero || c.id, estado: estado(c), monto: Number(c.subtotal ?? c.subtotal_impl ?? c.total_impl ?? c.total ?? 0) || 0 })), activos: leadsActivos, funnel, fuentes, open, abiertasEtapa, quoteTotal, quoteApprovedTotal, lost, lostReasons, discardedReasons, series, responsables: ventasPorResponsable, clientes };
}
function group(rows, keyFn, amountFn = () => 0) { const map = new Map(); rows.forEach(row => { const key = keyFn(row); const value = map.get(key) || { nombre: key, cantidad: 0, monto: 0 }; value.cantidad++; value.monto += Number(amountFn(row) || 0); map.set(key, value); }); return [...map.values()].sort((a, b) => b.monto - a.monto || b.cantidad - a.cantidad); }
