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
    n => `${n} ${n === 1 ? 'cotización sin respuesta' : 'cotizaciones sin respuesta'}`],
  // Pendientes del Inicio de Operaciones (inicio_operaciones_pendientes)
  ops_partes_revision: ['wrench', 'violet', 'Urgente', 'Revisar partes',
    n => `${n} ${n === 1 ? 'parte diario' : 'partes diarios'} por revisar`],
  ops_of_atrasada: ['file', 'red', 'Atrasado', 'Ver OF',
    n => `${n} ${n === 1 ? 'orden de fabricación' : 'órdenes de fabricación'} con compromiso vencido`],
  ops_viajes_atrasados: ['truck', 'red', 'Atrasado', 'Abrir monitor',
    n => `${n} ${n === 1 ? 'viaje programado' : 'viajes programados'} sin iniciar`],
  ops_reservas_despacho: ['box', 'amber', 'Regla automática', 'Ir a despachos',
    n => `${n} ${n === 1 ? 'reserva de repuestos' : 'reservas de repuestos'} por despachar`],
  ops_diagnosticos_borrador: ['wrench', 'cyan', 'Sugerido por Aria', 'Abrir diagnósticos',
    n => `${n} ${n === 1 ? 'diagnóstico técnico' : 'diagnósticos técnicos'} en borrador`],
  ops_solpe_aprobar: ['file', 'amber', 'Urgente', 'Revisar SOLPE',
    n => `${n} SOLPE por aprobar`],
  ops_cert_por_vencer: ['check', 'amber', 'Urgente', 'Ver certificación',
    n => `${n} ${n === 1 ? 'certificación de equipo' : 'certificaciones de equipo'} por vencer`]
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
    cot_sin_respuesta: [m.documento, saldo, m.fecha && `Enviada el ${fecha(m.fecha)}`],
    ops_partes_revision: [m.documento, m.tercero && `Técnico: ${m.tercero}`, m.fecha && `Del ${fecha(m.fecha)}`],
    ops_of_atrasada: [m.documento, m.tercero, atraso],
    ops_viajes_atrasados: [m.documento, m.tercero, atraso],
    ops_reservas_despacho: [m.documento && `OT ${m.documento}`,
      m.estado === 'reservado_parcial_solpe' ? 'Parcial, a la espera de SOLPE' : m.estado && 'Reservada'],
    ops_diagnosticos_borrador: [m.tercero, m.fecha && `Inspección del ${fecha(m.fecha)}`],
    ops_solpe_aprobar: [m.documento, m.tercero, urgencia],
    ops_cert_por_vencer: [m.documento, m.tercero, m.fecha && `Vence el ${fecha(m.fecha)}`]
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

export function resumenDia(data, items) {
  const propios = data.filas_mias || 0;
  const area = data.filas_area || 0;
  if (!propios && !area) return 'Hoy no tienes pendientes por resolver.';
  const mas = Math.max(0, area - propios);
  let texto = propios
    ? `Hoy tienes ${propios} ${propios === 1 ? 'pendiente tuyo' : 'pendientes tuyos'} y ${mas} más en tu área.`
    : `Hoy no tienes pendientes asignados; hay ${area} en tu área.`;
  const propiosItems = items.filter(item => item.cantidad_mia > 0);
  const primeros = (propiosItems.length ? propiosItems : items).slice(0, 2)
    .map(item => fraseItem(item, propiosItems.length > 0));
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
    .replace(/\bOF\b(?!-)/g, 'orden de fabricación')
    .replace(/\bOT\b(?!-)/g, 'orden de trabajo');
}
