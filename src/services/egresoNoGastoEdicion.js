export function cambiosNoGastoEdicion(tipoAnterior, tipoNuevo, tieneCxPPendiente) {
  const anterior = Boolean(tipoAnterior?.es_no_gasto);
  const nuevo = Boolean(tipoNuevo?.es_no_gasto);
  if (!anterior && !nuevo) return { gasto: {}, cxp: null };
  return {
    gasto: { excluir_de_er: nuevo },
    cxp: tieneCxPPendiente ? { no_devengar_er: nuevo } : null,
  };
}

export function cxpPendiente(cuenta) {
  const estado = String(cuenta?.estado || '').trim().toLowerCase();
  const saldo = cuenta?.saldo != null
    ? Number(cuenta.saldo)
    : Number(cuenta?.monto_total || 0) - Number(cuenta?.monto_pagado || 0);
  return !['pagada', 'anulada'].includes(estado) && saldo > 0;
}
