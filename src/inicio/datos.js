export const formatos = {
  cxp_hoy: ['money', 'red', 'Vence hoy', 'Programar pago',
    n => `${n} ${n === 1 ? 'factura por pagar vence' : 'facturas por pagar vencen'} hoy`],
  solpe_urgente: ['file', 'amber', 'Urgente', 'Revisar',
    n => `${n} SOLPE ${n === 1 ? 'urgente' : 'urgentes'} por aprobar`],
  cxp_vencida: ['money', 'red', 'Sugerido por Aria', 'Ver vencidas',
    n => `${n} ${n === 1 ? 'cuenta por pagar vencida' : 'cuentas por pagar vencidas'}`],
  ot_sin_parte: ['wrench', 'violet', 'Regla automática', 'Ver OT',
    n => `${n} OT sin parte diario`],
  rrhh: ['users', 'cyan', 'Regla automática', 'Revisar',
    n => `${n} ${n === 1 ? 'solicitud por resolver' : 'solicitudes por resolver'}`],
  cxc_vencida: ['money', 'green', 'Sugerido por Aria', 'Gestionar cobro',
    n => `${n} ${n === 1 ? 'cuenta por cobrar vencida' : 'cuentas por cobrar vencidas'}`],
  oc_atrasada: ['truck', 'amber', 'Regla automática', 'Ver órdenes',
    n => `${n} OC con ${n === 1 ? 'entrega atrasada' : 'entregas atrasadas'}`],
  sourcing: ['box', 'cyan', 'Regla automática', 'Ir a Sourcing',
    n => `${n} SOLPE ${n === 1 ? 'aprobada espera' : 'aprobadas esperan'} OC`],
  cot_sin_respuesta: ['file', 'violet', 'Sugerido por Aria', 'Hacer seguimiento',
    n => `${n} ${n === 1 ? 'cotización sin respuesta' : 'cotizaciones sin respuesta'}`]
};

export const fecha = value => value ? new Intl.DateTimeFormat('es-PE', {
  day: 'numeric', month: 'long', timeZone: 'America/Lima'
}).format(new Date(`${value}T12:00:00-05:00`)) : '';

export const importe = (valor, moneda) => {
  const simbolo = moneda === 'PEN' ? 'S/' : moneda === 'USD' ? 'US$' : moneda;
  return `${simbolo} ${Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })}`;
};

export function titulo(item, mio) {
  const n = mio ? item.cantidad_mia : item.cantidad;
  const mayor = mio ? item.mayor_mio : item.mayor;
  if (item.id === 'ot_sin_parte' && n === 1 && mayor?.documento) {
    return `${mayor.documento} sin parte diario`;
  }
  return formatos[item.id][4](n);
}

export function subtitulo(item, mio) {
  const m = (mio ? item.mayor_mio : item.mayor) || {};
  // El RPC solo proporciona totales para el área, no para la selección de Míos.
  const totalesArea = (!mio || item.cantidad_mia === item.cantidad) && (item.por_moneda || [])
    .filter(x => x.total != null && x.moneda)
    .map(x => importe(x.total, x.moneda)).join(' y ');
  const saldo = m.saldo != null && m.moneda ? importe(m.saldo, m.moneda) : '';
  const totales = totalesArea || (mio && item.cantidad_mia === 1 ? saldo : '');
  const atraso = m.dias_atraso != null
    ? `${m.dias_atraso} ${m.dias_atraso === 1 ? 'día' : 'días'} de atraso` : '';
  const tipo = m.documento?.replaceAll('_', ' ').toLowerCase();
  const tipoLegible = tipo ? tipo[0].toUpperCase() + tipo.slice(1) : '';
  const estado = m.estado === 'aprobada_jefe' ? 'aprobada por jefe' : m.estado?.replaceAll('_', ' ');
  const rrhh = [tipoLegible, estado && `(${estado})`].filter(Boolean).join(' ');
  const prioridad = m.prioridad?.toLowerCase();
  const urgencia = prioridad === 'urgente' ? 'Prioridad urgente' : prioridad ? `Urgencia ${prioridad}` : '';
  const tercero = m.tercero?.startsWith('(') ? '' : m.tercero;
  const partes = {
    cxp_hoy: [m.tercero, totales],
    solpe_urgente: [m.tercero, urgencia],
    cxp_vencida: [totales, tercero],
    cxc_vencida: [totales, [tercero, saldo].filter(Boolean).join(': ')],
    ot_sin_parte: [m.tercero, m.avance != null && `Avance ${m.avance}%`,
      m.ultimo_parte && `Último parte: ${fecha(m.ultimo_parte)}`],
    rrhh: [rrhh, m.tercero],
    oc_atrasada: [m.documento, m.tercero, atraso],
    sourcing: ['Listas para asignar en la Bandeja de Sourcing'],
    cot_sin_respuesta: [m.documento, saldo, m.fecha && `Enviada el ${fecha(m.fecha)}`]
  };
  return (partes[item.id] || []).filter(Boolean).join(' · ');
}

export function fraseItem(item, mio) {
  const n = mio ? item.cantidad_mia : item.cantidad;
  const mayor = mio ? item.mayor_mio : item.mayor;
  const totales = (!mio || item.cantidad_mia === item.cantidad) && (item.por_moneda || [])
    .filter(x => x.total != null && x.moneda)
    .map(x => importe(x.total, x.moneda)).join(' y ');
  const montos = totales || (mio && n === 1 && mayor?.saldo != null && mayor.moneda
    ? importe(mayor.saldo, mayor.moneda) : '');
  if (item.id === 'cxp_hoy' && montos) {
    return `${n} ${n === 1 ? 'factura' : 'facturas'} por ${montos} ${n === 1 ? 'vence' : 'vencen'} hoy`;
  }
  const base = titulo(item, mio);
  if (item.id === 'solpe_urgente') return `hay ${base}`;
  return montos ? `${base} por ${montos}` : base;
}

export function resumenDia(data, visibles, mio) {
  const propios = data.filas_mias || 0;
  const area = data.filas_area || 0;
  if (!propios && !area) return 'Hoy no tienes pendientes por resolver.';
  const mas = Math.max(0, area - propios);
  let texto = propios
    ? `Hoy tienes ${propios} ${propios === 1 ? 'pendiente tuyo' : 'pendientes tuyos'} y ${mas} más en tu área.`
    : `Hoy no tienes pendientes asignados; hay ${area} en tu área.`;
  const primeros = visibles.slice(0, 2).map(item => fraseItem(item, mio));
  if (primeros.length) texto += ` Lo primero: ${primeros.join(' y ')}.`;
  return texto;
}

export function textoHablado(texto) {
  return texto
    .replace(/(S\/|US\$)\s*([\d,]+)(?:\.\d{2})?/g, (_, moneda, numero) => {
      const entero = Math.round(Number(numero.replaceAll(',', '')));
      return `${entero} ${moneda === 'S/' ? 'soles' : 'dólares'}`;
    })
    .replace(/\bSOLPE\b/g, 'solpes')
    .replace(/\bOC\b/g, 'órdenes de compra')
    .replace(/\bOT\b(?!-)/g, 'orden de trabajo');
}
