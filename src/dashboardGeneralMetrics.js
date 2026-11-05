import { normalizarMonedaBI } from './biComercialMetrics.js';
const numero = valor => Number(valor) || 0;
const estado = fila => String(fila?.estado || '').trim().toLowerCase().replace(/\s+/g, '_');
const dia = valor => String(valor || '').slice(0, 10);
const numeroDia = valor => {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia(valor));
  return partes ? Date.UTC(+partes[1], +partes[2] - 1, +partes[3]) / 86400000 : null;
};
const diasDesde = (fecha, hoy) => {
  const inicio = numeroDia(fecha);
  const fin = numeroDia(hoy);
  return inicio == null || fin == null ? 0 : Math.max(0, fin - inicio);
};
const monedaEs = (fila, moneda) => normalizarMonedaBI(fila?.moneda) === normalizarMonedaBI(moneda);
const suma = (filas, campo) => filas.reduce((total, fila) => total + numero(campo(fila)), 0);
export const cantidadTexto = (cantidad, singular, plural) => `${cantidad} ${cantidad === 1 ? singular : plural}`;
export function alcanceSociedades(multi, activa, disponibles = [], todasId = '**todas**') {
  if (!multi)
    return { mode: null, sociedadIds: null };
  if (activa === todasId) {
    return { mode: 'consolidado', sociedadIds: disponibles.map(s => s.id).filter(Boolean) };
  }
  return { mode: 'sociedad', sociedadIds: activa ? [activa] : [] };
}
export function filtrarSociedades(filas = [], alcance, tieneSociedad = true) {
  if (!tieneSociedad || alcance.sociedadIds === null)
    return filas;
  const ids = new Set(alcance.sociedadIds);
  return filas.filter(fila => ids.has(fila.sociedad_id));
}
export function nombreCliente(fila, cuentas = []) {
  const referencia = fila.cuenta_id || fila.cliente_id || (typeof fila.cliente === 'string' ? fila.cliente : null);
  const cuenta = cuentas.find(item => item.id === referencia);
  const relacionada = typeof fila.cliente === 'object' ? fila.cliente : fila.cuentas || fila.cuenta;
  return (fila.cliente_nombre && fila.cliente_nombre !== referencia ? fila.cliente_nombre : '') || cuenta?.nombre_comercial || cuenta?.razon_social || relacionada?.nombre_comercial || relacionada?.razon_social || 'Sin dato';
}
export function nombreProveedor(fila) {
  if (/\bcese\b/i.test([fila.origen, fila.concepto, fila.motivo_cxp].join(' ')))
    return 'Liquidación por cese';
  return fila.nombre_emisor || fila.proveedores?.razon_social || fila.concepto || 'Sin dato';
}
function agrupar(filas, nombre, hoy) {
  const grupos = new Map();
  filas.forEach(fila => {
    const clave = nombre(fila);
    const grupo = grupos.get(clave) || { nombre: clave, cantidad: 0, saldo: 0, dias: 0 };
    grupo.cantidad += 1;
    grupo.saldo += numero(fila.saldo);
    grupo.dias = Math.max(grupo.dias, diasDesde(fila.fecha_vencimiento, hoy));
    grupos.set(clave, grupo);
  });
  return [...grupos.values()].sort((a, b) => b.saldo - a.saldo).slice(0, 3);
}
export function cajaCuentas(cuentas = [], movimientos = [], moneda = 'PEN') {
  const activas = cuentas.filter(cuenta => estado(cuenta) === 'activo' && monedaEs(cuenta, moneda));
  const saldo = cuenta => movimientos.filter(mov => mov.cuenta_bancaria_id === cuenta.id && !['anulado', 'anulada'].includes(estado(mov))).reduce((total, mov) => {
    const monto = monedaEs(mov, cuenta.moneda) ? numero(mov.monto) : numero(mov.monto_en_moneda_cuenta);
    const tipo = String(mov.tipo || '').toLowerCase();
    return total + (['ingreso', 'credito', 'crédito'].includes(tipo) ? monto : ['egreso', 'debito', 'débito'].includes(tipo) ? -monto : 0);
  }, numero(cuenta.saldo_inicial));
  const operativas = activas.filter(cuenta => !cuenta.es_cuenta_detracciones);
  const detracciones = activas.filter(cuenta => cuenta.es_cuenta_detracciones);
  return { caja: operativas.length ? suma(operativas, saldo) : null, detracciones: detracciones.length ? suma(detracciones, saldo) : null };
}
export function calcularOTs(ots = [], hoy) {
  const activos = ots.filter(fila => estado(fila) !== 'anulada');
  const estados = ['programada', 'ejecucion', 'cerrada', 'cerrado_conforme', 'valorizada'];
  const otGrupos = [
    { label: 'Programadas', cantidad: activos.filter(fila => estado(fila) === 'programada').length },
    { label: 'En ejecución', cantidad: activos.filter(fila => estado(fila) === 'ejecucion').length },
    { label: 'Sin valorizar', cantidad: activos.filter(fila => ['cerrada', 'cerrado_conforme'].includes(estado(fila))).length },
    { label: 'Valorizadas', cantidad: activos.filter(fila => estado(fila) === 'valorizada').length },
  ];
  const otros = activos.filter(fila => !estados.includes(estado(fila)));
  if (otros.length)
    otGrupos.push({ label: 'Otros estados', cantidad: otros.length });
  const atrasadas = activos.map(fila => ({ ...fila, dias: diasDesde(estado(fila) === 'programada' ? fila.fecha_programada : estado(fila) === 'ejecucion' ? fila.fecha_fin : null, hoy) })).filter(fila => fila.dias > 0).sort((a, b) => b.dias - a.dias);
  return { activos, otGrupos, atrasadas };
}
export function contarDashboard(data = {}, moneda = 'PEN', hoy) {
  const pendientes = (filas, excluidos) => (filas || []).filter(fila => monedaEs(fila, moneda) && numero(fila.saldo) > 0 && !excluidos.includes(estado(fila)));
  const cobrar = pendientes(data.cxc, ['anulada', 'cancelada', 'cobrada']);
  const pagar = pendientes(data.cxp, ['anulada', 'cancelada', 'pagada']);
  const hoyN = numeroDia(hoy);
  const vencida = fila => numeroDia(fila.fecha_vencimiento) != null && numeroDia(fila.fecha_vencimiento) < hoyN;
  return {
    ...calcularOTs(data.ots, hoy), cobrar, pagar,
    vencidos: cobrar.filter(vencida), pagosVencidos: pagar.filter(vencida),
    proximos: pagar.filter(fila => { const fecha = numeroDia(fila.fecha_vencimiento); return fecha != null && fecha >= hoyN && fecha <= hoyN + 7; }),
  };
}
function montoOportunidad(fila, cotizaciones) {
  const cotizacion = cotizaciones.filter(c => c.oportunidad_id === fila.id && ['aprobada', 'convertida'].includes(estado(c))).sort((a, b) => numero(b.version || 1) - numero(a.version || 1) || String(b.fecha || b.created_at || '').localeCompare(String(a.fecha || a.created_at || '')))[0];
  return { moneda: cotizacion?.moneda || fila.moneda, monto: cotizacion ? (cotizacion.subtotal ?? cotizacion.subtotal_impl ?? cotizacion.total_impl ?? cotizacion.total ?? 0) : fila.monto_estimado };
}
export function calcularDashboard(data = {}, moneda = 'PEN', hoy) {
  const { cuentasBancarias = [], movimientosTesoreria = [], cxc = [], facturas = [], cobros = [], oportunidades = [], cotizaciones = [], osClientes = [], cuentas = [] } = data;
  const conteos = contarDashboard(data, moneda, hoy);
  const { cobrar, pagar, vencidos, pagosVencidos } = conteos;
  const { caja, detracciones } = cajaCuentas(cuentasBancarias, movimientosTesoreria, moneda);
  const cuentasOperativas = cuentasBancarias.filter(c => estado(c) === 'activo' && !c.es_cuenta_detracciones && monedaEs(c, moneda)).map(c => ({ nombre: c.nombre || c.nombre_cuenta || c.banco || 'Cuenta operativa', saldo: cajaCuentas([c], movimientosTesoreria, moneda).caja }));
  const aging = [0, 0, 0, 0, 0];
  cobrar.forEach(fila => { const mora = diasDesde(fila.fecha_vencimiento, hoy); aging[mora <= 0 ? 0 : mora <= 30 ? 1 : mora <= 60 ? 2 : mora <= 90 ? 3 : 4] += numero(fila.saldo); });
  const [year, month] = hoy.slice(0, 7).split('-').map(Number);
  const meses = Array.from({ length: 6 }, (_, i) => { const fecha = new Date(Date.UTC(year, month - 6 + i, 1)); return { periodo: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`, facturado: 0, cobrado: 0 }; });
  const cxcMap = new Map(cxc.map(fila => [fila.id, fila]));
  facturas.forEach(fila => { const tipo = String(fila.tipo_documento || '').toLowerCase(); const mes = meses.find(item => item.periodo === dia(fila.fecha_emision).slice(0, 7)); if (mes && monedaEs(fila, moneda) && estado(fila) !== 'anulada' && ['factura', 'boleta', 'nota_credito'].includes(tipo))
    mes.facturado += (tipo === 'nota_credito' ? -1 : 1) * numero(fila.total); });
  cobros.forEach(fila => { const origen = cxcMap.get(fila.cxc_id); const mes = meses.find(item => item.periodo === dia(fila.fecha_cobro).slice(0, 7)); if (mes && origen && monedaEs(origen, moneda))
    mes.cobrado += numero(fila.monto_capital); });
  const abiertas = oportunidades.filter(fila => estado(fila) === 'abierta').map(fila => montoOportunidad(fila, cotizaciones)).filter(fila => monedaEs(fila, moneda));
  const enviadas = cotizaciones.filter(fila => estado(fila) === 'enviada' && monedaEs(fila, moneda));
  const os = osClientes.filter(fila => !['anulada', 'cerrada'].includes(estado(fila)) && monedaEs(fila, moneda));
  const totalCobrar = suma(cobrar, fila => fila.saldo);
  const totalPagar = suma(pagar, fila => fila.saldo);
  const cadena = [
    { label: 'Oportunidades', valor: suma(abiertas, fila => fila.monto), cantidad: abiertas.length },
    { label: 'Cotizado enviado', valor: suma(enviadas, fila => fila.subtotal), cantidad: enviadas.length },
    { label: 'Por ejecutar', valor: suma(os, fila => fila.saldo_por_ejecutar), cantidad: os.length },
    { label: 'Por valorizar', valor: suma(os, fila => fila.saldo_por_valorizar), cantidad: os.length },
    { label: 'Por facturar', valor: suma(os, fila => fila.saldo_por_facturar), cantidad: os.length },
    { label: 'Por cobrar', valor: totalCobrar, cantidad: cobrar.length },
  ];
  return { ...conteos, caja, detracciones, cuentasOperativas, totalCobrar, totalPagar, aging, deudores: agrupar(cobrar, fila => nombreCliente(fila, cuentas), hoy), proveedores: agrupar(pagosVencidos, nombreProveedor, hoy), meses, cadena, neta: (caja ?? 0) + totalCobrar - totalPagar };
}
export function temasAtencion(data = {}, m, hoy, canFin = true, moneda = 'PEN') {
  const antes = valor => dia(valor) && dia(valor) < hoy;
  const filas = (clave, predicado) => (data[clave] || []).filter(predicado);
  const tema = (nivel, titulo, modulo, registros, singular, plural, opciones = {}) => {
    const cantidad = registros.length;
    const antigua = Math.max(0, ...registros.map(fila => diasDesde(fila[opciones.fecha], hoy)));
    let detalle = cantidadTexto(cantidad, singular, plural);
    if (opciones.fecha && antigua)
      detalle += `, ${cantidad === 1 ? 'con' : 'la más antigua con'} ${cantidadTexto(antigua, 'día', 'días')}`;
    if (opciones.mora) {
      const mayores = registros.filter(fila => diasDesde(fila.fecha_vencimiento, hoy) > 90).length;
      if (mayores)
        detalle += `, ${mayores} con más de 90 días`;
    }
    return { nivel, titulo, modulo, cantidad, detalle, monto: canFin && opciones.monto ? suma(registros, opciones.monto) : null };
  };
  const opp = filas('oportunidades', r => estado(r) === 'abierta' && antes(r.fecha_cierre_estimada)).map(r => ({ ...r, importe: montoOportunidad(r, data.cotizaciones || []) })).filter(r => monedaEs(r.importe, moneda));
  const temas = [
    tema('Crítico', 'Cobranza vencida', 'cxc', m.vencidos, 'comprobante', 'comprobantes', { mora: true, monto: r => r.saldo }),
    tema('Crítico', 'Pagos vencidos', 'cxp', m.pagosVencidos, 'documento', 'documentos', { monto: r => r.saldo }),
    tema('Crítico', 'OTs programadas con fecha pasada', 'ot', m.atrasadas.filter(fila => estado(fila) === 'programada'), 'OT', 'OTs'),
    tema('Atención', 'OTs cerradas sin valorizar', 'ot', filas('ots', r => ['cerrada', 'cerrado_conforme'].includes(estado(r))), 'OT', 'OTs'),
    tema('Atención', 'Tickets con SLA vencido', 'tickets', filas('tickets', r => estado(r) === 'abierto' && antes(r.fecha_limite_sla)), 'ticket', 'tickets'),
    tema('Atención', 'Valorizaciones aprobadas sin facturar', 'valorizacion', filas('valorizaciones', r => estado(r) === 'aprobada' && !r.factura_id && monedaEs(r, moneda)), 'valorización', 'valorizaciones', { monto: r => r.subtotal }),
    tema('Atención', 'Oportunidades con cierre vencido', 'pipeline', opp, 'oportunidad', 'oportunidades', { monto: r => r.importe.monto }),
    tema('Atención', 'Órdenes de compra atrasadas', 'ordenes_compra', filas('ordenesCompra', r => ['emitida', 'en_transito', 'recibida_parcial'].includes(estado(r)) && antes(r.fecha_entrega_esperada)), 'orden', 'órdenes'),
    tema('Atención', 'Pagos que vencen en 7 días', 'cxp', m.proximos, 'documento', 'documentos', { monto: r => r.saldo }),
    tema('Pendiente', 'Cotizaciones sin respuesta', 'cotizaciones', filas('cotizaciones', r => estado(r) === 'enviada' && monedaEs(r, moneda)), 'cotización', 'cotizaciones', { fecha: 'fecha_envio', monto: r => r.subtotal }),
    tema('Pendiente', 'Equipos recibidos por cotizar', 'panel_produccion', filas('recepciones', r => estado(r) === 'pendiente_cotizar'), 'recepción', 'recepciones', { fecha: 'fecha_ingreso' }),
    tema('Pendiente', 'SOLPE por atender', 'solpe', filas('solpes', r => ['solicitada', 'aprobada'].includes(estado(r))), 'SOLPE', 'SOLPE'),
    tema('Pendiente', 'Partes en revisión', 'partes', filas('partes', r => estado(r) === 'en_revision'), 'parte', 'partes'),
    tema('Pendiente', 'Solicitudes de RRHH', 'solicitudes_rrhh', filas('solicitudesRRHH', r => ['enviada', 'aprobada_jefe'].includes(estado(r))), 'solicitud', 'solicitudes'),
  ];
  const ot = temas.find(t => t.modulo === 'ot');
  if (ot?.cantidad)
    ot.detalle += `, ${ot.cantidad === 1 ? 'con' : 'la más antigua con'} ${cantidadTexto(m.atrasadas.find(fila => estado(fila) === 'programada').dias, 'día', 'días')}`;
  return temas.filter(item => item.cantidad > 0);
}
