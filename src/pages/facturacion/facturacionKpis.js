const EXCLUIDOS = new Set(['cobrada', 'pagada', 'anulada', 'cancelada']);
const BASE = new Set(['factura', 'boleta']);
const monedas = () => ({ PEN: 0, USD: 0 });
const moneda = valor => valor === 'USD' ? 'USD' : 'PEN';
export function fechaLocal(fecha = new Date()) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
export function calcularFacturadoMes(facturas, hoy = fechaLocal()) {
  const montos = monedas();
  let emitidas = 0;
  for (const f of facturas) {
    const tipo = f.tipo_documento || 'factura';
    if (String(f.estado || '').toLowerCase() === 'anulada'
      || !String(f.fecha_emision || '').startsWith(hoy.slice(0, 7))) continue;
    if (BASE.has(tipo)) emitidas++;
    if (BASE.has(tipo) || tipo === 'nota_debito' || tipo === 'nota_credito') {
      montos[moneda(f.moneda)] += (tipo === 'nota_credito' ? -1 : 1) * Number(f.total ?? f.monto ?? 0);
    }
  }
  return { montos, emitidas };
}
export function calcularSaldos(facturas, cxc, hoy = fechaLocal()) {
  const ids = new Set(facturas
    .filter(f => BASE.has(f.tipo_documento || 'factura') && String(f.estado || '').toLowerCase() !== 'anulada')
    .map(f => f.id));
  const porCobrar = { montos: monedas(), facturas: 0 };
  const vencido = { montos: monedas(), facturas: 0 };
  for (const c of cxc) {
    if (!ids.has(c.factura_id) || Number(c.saldo || 0) <= 0
      || EXCLUIDOS.has(String(c.estado || '').toLowerCase())) continue;
    const m = moneda(c.moneda);
    const saldo = Number(c.saldo);
    porCobrar.montos[m] += saldo;
    porCobrar.facturas++;
    if (c.fecha_vencimiento && c.fecha_vencimiento < hoy) {
      vencido.montos[m] += saldo;
      vencido.facturas++;
    }
  }
  return { porCobrar, vencido };
}
