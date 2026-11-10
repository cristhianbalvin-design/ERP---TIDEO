import { calcularTotalesEmision } from './facturacionEmision.js';

// La moneda del origen tiene prioridad sobre la del cliente y la empresa.
export function monedaInicialFicha({ origen, cliente, empresa } = {}) {
  return origen || cliente || empresa?.moneda || empresa?.moneda_base || 'PEN';
}

// Los montos de notas sobre boletas incluyen IGV; en facturas son bases imponibles.
export function calcularTotalesNota({ monto = 0, igvPct = 18, tipoOrigen, conIgv = true } = {}) {
  return calcularTotalesEmision({
    partidas: [{ cantidad: 1, precio_unitario: monto }],
    igvPct: conIgv ? igvPct : 0,
    esBoleta: tipoOrigen === 'boleta',
  });
}

const permisoModulo = (valor, modulo) => valor === true || (Array.isArray(valor) && valor.includes(modulo));
export function permisosFicha(role = {}) {
  const p = role?.permisos || {};
  const total = Boolean(role?.es_admin_empresa || role?.es_superadmin || p.todo || p.plataforma);
  const editar = total || permisoModulo(p.editar, 'facturacion');
  return {
    editar,
    notaCredito: editar,
    notaDebito: editar,
    anular: editar,
    restaurar: editar,
    generarCxC: editar,
    cobro: editar || permisoModulo(p.editar, 'cxc'),
    autodetraccion: total || permisoModulo(p.crear, 'tesoreria'),
  };
}
export function accionPrimaria(factura, saldo, permisos) {
  return ['emitida', 'cobro_parcial'].includes(factura?.estado) && Number(saldo) > 0 && permisos?.cobro
    ? 'Registrar cobro'
    : null;
}
export function armarHistorial(factura, cobros = [], notas = [], cuentasBancarias = []) {
  if (!factura) return [];
  const dinero = (n) => `${factura.moneda === 'USD' ? 'US$' : 'S/'} ${Number(n || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const eventos = [
    { tipo: 'emision', fecha: factura.fecha_emision || '', texto: `Emitida ${factura.numero || ''}`.trim() },
    ...cobros.map((c) => ({
      tipo: 'cobro',
      fecha: c.fecha_cobro || '',
      texto: `Cobro: ${dinero(c.monto_capital)}${Number(c.monto_mora || 0) ? ` · Mora: ${dinero(c.monto_mora)}` : ''}`,
      detalle: [
        c.medio_pago,
        c.numero_operacion,
        cuentasBancarias.find((cuenta) => cuenta.id === c.cuenta_bancaria)?.nombre || 'Sin dato',
      ].filter(Boolean).join(' · '),
    })),
    ...notas.map((n) => ({
      tipo: 'nota',
      fecha: n.fecha_emision || '',
      texto: `${n.tipo_documento === 'nota_credito' ? 'Nota de crédito' : 'Nota de débito'} ${n.numero || ''}`.trim(),
      detalle: n.motivo || n.motivo_codigo || '',
    })),
  ];
  if (factura.estado === 'anulada')
    eventos.push({
      tipo: 'anulacion',
      fecha: factura.fecha_anulacion || factura.anulada_en || '',
      texto: 'Anulación',
      detalle: factura.motivo_anulacion || '',
    });
  return eventos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}
