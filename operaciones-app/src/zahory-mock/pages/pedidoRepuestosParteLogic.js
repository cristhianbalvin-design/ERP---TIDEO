export function validarPedidosParte(pedidos = []) {
  const materiales = new Set();
  for (let indice = 0; indice < pedidos.length; indice += 1) {
    const pedido = pedidos[indice] || {};
    if (!pedido.material_id) return `Selecciona un material para el repuesto ${indice + 1}.`;

    const textoCantidad = String(pedido.cantidad ?? '').trim().replace(',', '.');
    const cantidad = Number(textoCantidad);
    if (!textoCantidad || !Number.isFinite(cantidad) || cantidad <= 0) {
      return `La cantidad del repuesto ${indice + 1} debe ser mayor a cero.`;
    }
    if (Math.abs(cantidad * 100 - Math.round(cantidad * 100)) > 1e-8) {
      return `La cantidad del repuesto ${indice + 1} admite hasta 2 decimales.`;
    }
    if (materiales.has(pedido.material_id)) return 'No repitas el mismo material en el pedido.';
    materiales.add(pedido.material_id);
  }
  return '';
}

export function armarLineasPedido(pedidos = []) {
  return pedidos.map(pedido => ({
    material_id: pedido.material_id,
    cantidad: Number(String(pedido.cantidad).replace(',', '.')),
  }));
}

export function describirResultadoLinea(linea = {}) {
  const reservado = Number(linea.reservado || 0);
  const faltante = Number(linea.faltante || 0);
  const solpe = linea.solpe_codigo || 'sin código';
  let texto;
  if (faltante === 0) texto = 'Reservado en almacén';
  else if (reservado > 0) texto = `Reservado ${reservado} · faltan ${faltante} · SOLPE ${solpe}`;
  else texto = `Sin stock · SOLPE ${solpe} en curso`;

  if (linea.aviso) texto += ` · ${linea.aviso}`;
  return { texto, tono: faltante === 0 ? 'is-green' : 'is-amber' };
}
