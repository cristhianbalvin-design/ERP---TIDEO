export const VARIABLES_COTIZACION = [
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

export const VARIABLES_CONTRATO_LABORAL = [
  { grupo: 'Empresa', label: 'Razon social empresa', token: '{{empresa.razon_social}}' },
  { grupo: 'Empresa', label: 'RUC empresa', token: '{{empresa.ruc}}' },
  { grupo: 'Empresa', label: 'Direccion empresa', token: '{{empresa.direccion}}' },
  { grupo: 'Empleado', label: 'Nombre completo', token: '{{empleado.nombre}}' },
  { grupo: 'Empleado', label: 'Documento de identidad', token: '{{empleado.documento}}' },
  { grupo: 'Empleado', label: 'Codigo de empleado', token: '{{empleado.codigo}}' },
  { grupo: 'Empleado', label: 'Email', token: '{{empleado.email}}' },
  { grupo: 'Empleado', label: 'Telefono', token: '{{empleado.telefono}}' },
  { grupo: 'Empleado', label: 'Direccion', token: '{{empleado.direccion}}' },
  { grupo: 'Empleado', label: 'Fecha de ingreso', token: '{{empleado.fecha_ingreso}}' },
  { grupo: 'Contrato', label: 'Tipo de contrato', token: '{{contrato.tipo}}' },
  { grupo: 'Contrato', label: 'Fecha de inicio', token: '{{contrato.fecha_inicio}}' },
  { grupo: 'Contrato', label: 'Fecha de fin', token: '{{contrato.fecha_fin}}' },
  { grupo: 'Contrato', label: 'Remuneracion base', token: '{{contrato.remuneracion_base}}' },
  { grupo: 'Contrato', label: 'Moneda', token: '{{contrato.moneda}}' },
  { grupo: 'Contrato', label: 'Modalidad', token: '{{contrato.modalidad}}' },
  { grupo: 'Cargo', label: 'Nombre del cargo', token: '{{cargo.nombre}}' },
  { grupo: 'Cargo', label: 'Codigo del cargo', token: '{{cargo.codigo}}' },
  { grupo: 'Cargo', label: 'Area', token: '{{cargo.area}}' },
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

const firstValue = (...values) => values.find(value => value !== undefined && value !== null && value !== '');

const primeraFila = value => Array.isArray(value) ? value[0] || {} : value || {};

/**
 * Contexto esperado para documentos de contrato laboral:
 *
 * - vigencia_efectiva: fila retornada por public.vigencia_efectiva(...), con
 *   fecha_desde y fecha_hasta ya resueltas contra las adendas aplicables.
 * - cargos_empresa: filas del maestro del tenant ({ id, codigo, nombre, ... }).
 *   El resolver enlaza empleado.cargo_id con esta colección; no infiere un
 *   código desde el nombre de cargo.
 *
 * Esta función es pura: la capa que prepare el documento debe consultar la
 * RPC y el maestro antes de invocar renderTextoDocumental.
 */
export function crearContextoContratoLaboral({
  empresa = {},
  empleado = {},
  contrato = {},
  vigencia_efectiva = null,
  cargos_empresa = [],
} = {}) {
  const cargos = Array.isArray(cargos_empresa) ? cargos_empresa : [];
  const cargo = cargos.find(item => String(item?.id) === String(empleado?.cargo_id)) || null;
  return { empresa, empleado, contrato, vigencia_efectiva: primeraFila(vigencia_efectiva), cargos_empresa: cargos, cargo };
}

export function valorVariableCotizacion(key, ctx = {}) {
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

export function valorVariableContratoLaboral(key, ctx = {}) {
  const empresa = ctx.empresa || {};
  const empleado = ctx.empleado || ctx.personal || {};
  const contrato = ctx.contrato || {};
  const condiciones = contrato.condiciones_laborales || contrato.snapshot_laboral || ctx.condiciones_laborales || {};
  const vigenciaEfectiva = primeraFila(ctx.vigencia_efectiva || ctx.vigenciaEfectiva || contrato.vigencia_efectiva);
  const cargosEmpresa = Array.isArray(ctx.cargos_empresa)
    ? ctx.cargos_empresa
    : Array.isArray(ctx.cargosEmpresa) ? ctx.cargosEmpresa : [];
  const cargoDesdeMaestro = cargosEmpresa.find(item => String(item?.id) === String(empleado.cargo_id));
  const cargo = ctx.cargo || cargoDesdeMaestro || {};
  // personal_documentos no tiene una moneda contractual física. Se prefiere
  // moneda del snapshot si fue capturada; si no, la moneda vigente de nómina
  // de la ficha del empleado y finalmente la moneda base de la empresa.
  const moneda = firstValue(condiciones.moneda, empleado.moneda, empresa.moneda_base, 'PEN');
  const remuneracion = firstValue(condiciones.remuneracion_base, contrato.remuneracion_base, contrato.remuneracion, contrato.sueldo_base, empleado.remuneracion, empleado.sueldo_base);
  const values = {
    'empresa.razon_social': empresa.razon_social || empresa.nombre_comercial || '',
    'empresa.ruc': empresa.ruc || '',
    'empresa.direccion': empresa.direccion || '',
    'empleado.nombre': empleado.nombre || '',
    'empleado.documento': empleado.documento || empleado.dni || '',
    'empleado.codigo': empleado.codigo || '',
    'empleado.email': empleado.email || empleado.email_personal || '',
    'empleado.telefono': empleado.telefono || empleado.telefono_personal || empleado.celular_personal || '',
    'empleado.direccion': empleado.direccion || '',
    'empleado.fecha_ingreso': empleado.fecha_ingreso || '',
    'contrato.tipo': firstValue(condiciones.tipo_contrato, contrato.tipo_contrato, empleado.tipo_contrato, empleado.modalidad_contrato, ''),
    'contrato.fecha_inicio': vigenciaEfectiva.fecha_desde || '',
    'contrato.fecha_fin': vigenciaEfectiva.fecha_hasta || '',
    'contrato.remuneracion_base': remuneracion == null || remuneracion === '' ? '' : money(remuneracion, moneda),
    'contrato.moneda': moneda,
    'contrato.modalidad': firstValue(empleado.modalidad_contrato, empleado.tipo_contrato, condiciones.modalidad, contrato.modalidad, ''),
    'cargo.nombre': cargo.nombre || empleado.cargo || contrato.cargo || '',
    'cargo.codigo': cargo.codigo || '',
    // cargos_empresa no declara área; la fuente vigente comprobada es la ficha
    // de personal. El snapshot contractual queda solo como fallback histórico.
    'cargo.area': empleado.area || contrato.area || '',
  };
  return values[key] ?? '';
}

export const CATALOGOS_VARIABLES = {
  cotizacion: {
    grupos: ['empresa', 'cliente', 'contacto', 'cotizacion', 'pago', 'oportunidad'],
    variables: VARIABLES_COTIZACION,
    resolver: valorVariableCotizacion,
  },
  contrato_laboral: {
    grupos: ['empresa', 'empleado', 'contrato', 'cargo'],
    variables: VARIABLES_CONTRATO_LABORAL,
    resolver: valorVariableContratoLaboral,
  },
};

export const obtenerVariablesDocumentales = categoria => CATALOGOS_VARIABLES[categoria]?.variables || [];

export function renderTextoDocumental(texto = '', categoria, ctx = {}) {
  const resolver = CATALOGOS_VARIABLES[categoria]?.resolver;
  return String(texto || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const value = resolver?.(key, ctx);
    return value == null ? '' : String(value);
  });
}

export function insertarTexto(base = '', texto = '') {
  const actual = String(base || '');
  const agregado = String(texto || '');
  if (!actual.trim()) return agregado;
  return `${actual}${actual.endsWith(' ') || actual.endsWith('\n') ? '' : ' '}${agregado}`;
}
