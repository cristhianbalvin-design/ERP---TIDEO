// Las fechas contables son días civiles, independientes de la zona del navegador.
export function formatearFecha(fecha) {
  if (!fecha) return 'Sin dato';
  const match = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(fecha);
}

export function fechaHoyLima(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function diasEntreFechas(desde, hasta) {
  const instante = (fecha) => {
    const [ano, mes, dia] = fecha.split('-').map(Number);
    return Date.UTC(ano, mes - 1, dia);
  };
  return Math.round((instante(hasta) - instante(desde)) / 86400000);
}

export function tramoAntiguedad(dias) {
  if (dias <= 0) return 'al-dia';
  if (dias <= 30) return '1-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

export function plural(cantidad, singular, pluralTexto) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

export function textoVencimiento(diasParaVencer, cobrada = false) {
  if (cobrada) return 'Cobrada';
  if (diasParaVencer === 0) return 'Vence hoy';
  if (diasParaVencer > 0) return `Vence en ${plural(diasParaVencer, 'día', 'días')}`;
  return `${plural(-diasParaVencer, 'día', 'días')} vencida`;
}

export function ordenarFilas(a, b) {
  return b.diasMora - a.diasMora || (a.vencimiento || '9999-12-31').localeCompare(b.vencimiento || '9999-12-31');
}

export function validarGestionCxC(form) {
  const errores = {};
  if (!form.tipo_gestion) errores.tipo_gestion = 'Seleccione el tipo de gestión.';
  if (!form.resultado) errores.resultado = 'Seleccione el resultado.';
  if (['promesa_pago', 'pagara_en_fecha_acordada'].includes(form.resultado) && !form.fecha_proxima_accion) {
    errores.fecha_proxima_accion = 'Debe ingresar la fecha de próxima acción para este resultado.';
  }
  if (!String(form.notas || '').trim()) errores.notas = 'Ingrese las notas de la gestión.';
  return errores;
}

export function validarCobroCxC(form, { saldo, maxNormal, pendiente, normalBloqueado = false, errorArchivo = '' }) {
  const errores = {};
  const monto = Number(form.monto || 0);
  const detraccion = form.tipo_cobro === 'detraccion';
  const pagoTotal = !detraccion && form.cliente_pago_total_sin_detraer === true;
  if (!Number.isFinite(monto) || monto <= 0) errores.monto = 'Ingrese un monto mayor que cero.';
  else if (!detraccion && normalBloqueado && !pagoTotal) {
    errores.monto = 'No hay saldo cobrable como normal; lo pendiente corresponde a la detracción.';
  } else if (
    detraccion &&
    (!pendiente ||
      monto !== Number(pendiente.monto_detraccion_origen) ||
      Number(form.monto_deposito_soles) !== Number(pendiente.monto_detraccion_soles))
  ) {
    errores.monto =
      'El cobro de detracción debe usar exactamente el monto de origen y depósito de la obligación pendiente.';
  } else if (pagoTotal && (!pendiente || Math.abs(monto - saldo) > 0.005)) {
    errores.monto = 'El pago total sin detraer debe cubrir exactamente el saldo completo de la CxC.';
  } else if ((!detraccion && !pagoTotal && monto > maxNormal) || (detraccion && monto > saldo)) {
    errores.monto = 'El monto supera el máximo cobrable.';
  }
  if (!form.fecha_cobro) errores.fecha_cobro = 'Ingrese la fecha de cobro.';
  if (!form.medio_pago) errores.medio_pago = 'Seleccione el medio de pago.';
  if (detraccion && !form.cuenta_bancaria) {
    errores.cuenta_bancaria = 'Seleccione una cuenta de detracciones PEN de la misma sociedad.';
  }
  if (['Transferencia bancaria', 'Depósito'].includes(form.medio_pago) && !String(form.numero_operacion || '').trim()) {
    errores.numero_operacion = 'Ingrese el número de operación o referencia bancaria.';
  }
  if (errorArchivo) errores.archivo = errorArchivo;
  return errores;
}
