export const VARIABLES_COMERCIALES = [
  { grupo: 'Empresa', label: 'Razon social empresa', token: '{{empresa.razon_social}}' },
  { grupo: 'Empresa', label: 'RUC empresa', token: '{{empresa.ruc}}' },
  { grupo: 'Empresa', label: 'Email comercial', token: '{{empresa.email_comercial}}' },
  { grupo: 'Empresa', label: 'Direccion empresa', token: '{{empresa.direccion}}' },
  { grupo: 'Empresa', label: 'Firmante', token: '{{empresa.firmante}}' },
  { grupo: 'Cliente', label: 'Razon social cliente', token: '{{cliente.razon_social}}' },
  { grupo: 'Cliente', label: 'Nombre comercial cliente', token: '{{cliente.nombre_comercial}}' },
  { grupo: 'Cliente', label: 'RUC cliente', token: '{{cliente.ruc}}' },
  { grupo: 'Cliente', label: 'Direccion cliente', token: '{{cliente.direccion}}' },
  { grupo: 'Contacto', label: 'Nombre contacto', token: '{{contacto.nombre}}' },
  { grupo: 'Contacto', label: 'Cargo contacto', token: '{{contacto.cargo}}' },
  { grupo: 'Contacto', label: 'Email contacto', token: '{{contacto.email}}' },
  { grupo: 'Cotizacion', label: 'Numero cotizacion', token: '{{cotizacion.numero}}' },
  { grupo: 'Cotizacion', label: 'Fecha cotizacion', token: '{{cotizacion.fecha}}' },
  { grupo: 'Cotizacion', label: 'Dias de validez', token: '{{cotizacion.validez_dias}}' },
  { grupo: 'Cotizacion', label: 'Moneda', token: '{{cotizacion.moneda}}' },
  { grupo: 'Cotizacion', label: 'Total', token: '{{cotizacion.total}}' },
  { grupo: 'Cotizacion', label: 'IGV %', token: '{{cotizacion.igv_pct}}' },
  { grupo: 'Pago', label: 'Porcentaje adelanto', token: '{{pago.adelanto_pct}}' },
  { grupo: 'Pago', label: 'Monto adelanto', token: '{{pago.adelanto_monto}}' },
  { grupo: 'Pago', label: 'Porcentaje saldo', token: '{{pago.saldo_pct}}' },
  { grupo: 'Oportunidad', label: 'Nombre oportunidad', token: '{{oportunidad.nombre}}' },
  { grupo: 'Oportunidad', label: 'Servicio de interes', token: '{{oportunidad.servicio_interes}}' },
];

const money = (n, moneda = 'PEN') => {
  const sym = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? 'EUR' : 'S/';
  const value = Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${sym} ${value}`;
};

const firstHito = (cotizacion = {}) => {
  const hitos = Array.isArray(cotizacion.hitos_pago) ? cotizacion.hitos_pago : [];
  return hitos[0] || null;
};

export function valorVariableComercial(key, ctx = {}) {
  const empresa = ctx.empresa || {};
  const cliente = ctx.cliente || ctx.cuenta || {};
  const contacto = ctx.contacto || {};
  const cotizacion = ctx.cotizacion || {};
  const oportunidad = ctx.oportunidad || {};
  const hito = firstHito(cotizacion);
  const moneda = cotizacion.moneda || oportunidad.moneda || empresa.moneda_base || 'PEN';
  const adelantoPct = Number(hito?.porcentaje || 0);
  const total = cotizacion.total_impl ?? cotizacion.total ?? cotizacion.subtotal ?? oportunidad.monto_estimado ?? 0;
  const values = {
    'empresa.razon_social': empresa.razon_social || empresa.nombre_comercial || '',
    'empresa.ruc': empresa.ruc || '',
    'empresa.email_comercial': empresa.email_comercial || '',
    'empresa.direccion': empresa.direccion || '',
    'empresa.firmante': empresa.firmante || '',
    'cliente.razon_social': cliente.razon_social || cliente.nombre_comercial || '',
    'cliente.nombre_comercial': cliente.nombre_comercial || cliente.razon_social || '',
    'cliente.ruc': cliente.ruc || '',
    'cliente.direccion': cliente.direccion || '',
    'contacto.nombre': contacto.nombre || '',
    'contacto.cargo': contacto.cargo || '',
    'contacto.email': contacto.email || '',
    'cotizacion.numero': cotizacion.numero || '',
    'cotizacion.fecha': cotizacion.fecha || '',
    'cotizacion.validez_dias': cotizacion.validez_dias || '',
    'cotizacion.moneda': moneda,
    'cotizacion.total': money(total, moneda),
    'cotizacion.igv_pct': cotizacion.igv_pct || '',
    'pago.adelanto_pct': adelantoPct ? `${adelantoPct}%` : '',
    'pago.adelanto_monto': adelantoPct ? money(total * adelantoPct / 100, moneda) : '',
    'pago.saldo_pct': adelantoPct ? `${100 - adelantoPct}%` : '',
    'oportunidad.nombre': oportunidad.nombre || '',
    'oportunidad.servicio_interes': oportunidad.servicio_interes || oportunidad.nombre || '',
  };
  return values[key] ?? '';
}

export function renderTextoComercial(texto = '', ctx = {}) {
  return String(texto || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const value = valorVariableComercial(key, ctx);
    return value == null ? '' : String(value);
  });
}

export function insertarTexto(base = '', texto = '') {
  const actual = String(base || '');
  const agregado = String(texto || '');
  if (!actual.trim()) return agregado;
  return `${actual}${actual.endsWith(' ') || actual.endsWith('\n') ? '' : ' '}${agregado}`;
}
