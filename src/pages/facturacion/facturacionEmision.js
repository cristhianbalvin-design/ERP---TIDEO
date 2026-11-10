// Cálculos y validación de la emisión de comprobantes (modal de Facturación).
// Los cálculos de detracción replican emitir_factura_cxc_atomico para que la
// estimación en pantalla coincida con lo que registra el servidor.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r0 = (n) => Math.round(Number(n) || 0);

export function calcularTotalesEmision({ partidas = [], igvPct = 18, esBoleta = false, retencion = {} } = {}) {
  const bruto = partidas.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
  const tasa = Number(igvPct || 0) / 100;
  let subtotal;
  let igv;
  let total;
  if (esBoleta) {
    // Boleta: el precio unitario ya incluye IGV.
    total = r2(bruto);
    subtotal = r2(total / (1 + tasa));
    igv = r2(total - subtotal);
  } else {
    subtotal = r2(bruto);
    igv = r2(subtotal * tasa);
    total = r2(subtotal + igv);
  }
  const montoRetencion = retencion.aplica ? r2((total * Number(retencion.tasa || 0)) / 100) : 0;
  const netoCobrable = retencion.aplica ? r2(total - montoRetencion) : total;
  return { subtotal, igv, total, montoRetencion, netoCobrable };
}

export function estimarDetraccion({ tipoDocumento, moneda, total, tipoCambio, spot } = {}) {
  if (!spot) return { estado: 'sin_codigo' };
  if (tipoDocumento !== 'factura') return { estado: 'no_aplica_documento', spot };
  const porcentaje = Number(spot.porcentaje || 0);
  const tc = Number(tipoCambio);
  if (moneda === 'USD' && !(tc > 0)) return { estado: 'falta_tipo_cambio', spot };
  const baseSoles = r2(moneda === 'USD' ? Number(total || 0) * tc : Number(total || 0));
  const minimo = Number(spot.monto_minimo || 0);
  const superaUmbral = spot.umbral_operador === '>=' ? baseSoles >= minimo : baseSoles > minimo;
  if (!superaUmbral) return { estado: 'bajo_umbral', spot, baseSoles, minimo };
  const montoOrigen =
    moneda === 'PEN' ? r0((Number(total) * porcentaje) / 100) : r2((Number(total) * porcentaje) / 100);
  const depositoSoles = r0((baseSoles * porcentaje) / 100);
  return {
    estado: 'aplica',
    spot,
    baseSoles,
    minimo,
    montoOrigen,
    depositoSoles,
    netoCliente: r2(Number(total) - montoOrigen),
  };
}

// Devuelve { campo: mensaje } con todos los errores a la vez. Las claves de
// partidas son `partida:<id>:descripcion|cantidad|precio`.
export function validarEmision(datos = {}) {
  const {
    mode,
    cuentaId,
    valSel,
    sociedadRequerida,
    sociedadId,
    form = {},
    partidas = [],
    cebe,
    cebeVigente,
    spotMultiTasa,
    detraccion,
    tipoCambio,
    tipoCambioFuente,
    retencionAplica,
    conflictoSociedad,
    total,
  } = datos;
  const errores = {};
  if (mode === 'val' && !valSel) errores.valorizacion = 'Selecciona la valorización.';
  if (mode === 'directa' && !cuentaId) errores.cliente = 'Selecciona el cliente.';
  if (sociedadRequerida && !sociedadId) errores.sociedad = 'Selecciona la sociedad.';
  if (conflictoSociedad) errores.sociedad = conflictoSociedad;
  if (!String(form.numero || '').trim()) errores.numero = 'Escribe el número del comprobante.';
  if (!form.fecha_emision) errores.fecha_emision = 'Indica la fecha de emisión.';
  if (!form.fecha_vencimiento) errores.fecha_vencimiento = 'Indica la fecha de vencimiento.';
  else if (form.fecha_emision && form.fecha_vencimiento < form.fecha_emision) {
    errores.fecha_vencimiento = 'El vencimiento no puede ser anterior a la emisión.';
  }
  if (!['PEN', 'USD'].includes(form.moneda)) errores.moneda = 'Selecciona la moneda.';

  if (!form.centro_beneficio_id) errores.cebe = 'Selecciona el CEBE.';
  else if (!cebe) errores.cebe = 'El CEBE seleccionado no existe en esta empresa.';
  else if (cebe.estado !== 'activo') errores.cebe = 'El CEBE seleccionado está inactivo.';
  else if (!cebeVigente) errores.cebe = 'El CEBE no está vigente para la fecha de emisión.';

  if (!partidas.length) errores.partidas = 'Agrega al menos una partida.';
  partidas.forEach((p) => {
    if (!String(p.descripcion || '').trim())
      errores[`partida:${p.id}:descripcion`] = 'Escribe la descripción de la partida.';
    if (!(Number(p.cantidad) > 0)) errores[`partida:${p.id}:cantidad`] = 'La cantidad debe ser mayor que 0.';
    if (!(Number(p.precio_unitario) > 0)) errores[`partida:${p.id}:precio`] = 'El precio debe ser mayor que 0.';
  });
  if (spotMultiTasa)
    errores.partidas = 'Un comprobante admite un solo código de detracción. Separa las partidas en dos comprobantes.';
  if (partidas.length && !Object.keys(errores).some((k) => k.startsWith('partida')) && !(Number(total) > 0)) {
    errores.partidas = 'El total del comprobante debe ser mayor que 0.';
  }

  const requiereTc = form.tipo_documento === 'factura' && form.moneda === 'USD' && detraccion?.spot;
  if (requiereTc && !(Number(tipoCambio) > 0)) errores.tipo_cambio = 'Indica el tipo de cambio para la detracción.';
  if (requiereTc && !['manual', 'referencial'].includes(tipoCambioFuente)) {
    errores.tipo_cambio_fuente = 'Indica si el tipo de cambio es referencial o manual.';
  }
  if (retencionAplica && detraccion?.estado === 'aplica') {
    errores.partidas = 'El cliente es agente de retención: no se puede emitir con retención y detracción a la vez.';
  }
  return errores;
}

export const ORDEN_CAMPOS_EMISION = [
  'sociedad',
  'numero',
  'valorizacion',
  'cliente',
  'cebe',
  'partidas',
  'partida',
  'moneda',
  'fecha_emision',
  'fecha_vencimiento',
  'tipo_cambio',
  'tipo_cambio_fuente',
];

export function primerCampoConError(errores = {}) {
  const claves = Object.keys(errores);
  for (const campo of ORDEN_CAMPOS_EMISION) {
    const clave = claves.find((k) => k === campo || (campo === 'partida' && k.startsWith('partida:')));
    if (clave) return clave;
  }
  return claves[0] || null;
}
