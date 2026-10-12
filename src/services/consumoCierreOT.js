const cantidad = valor => Math.max(0, Number(valor) || 0);

export function restarDespachadoDelConsumo(itemsADescontar = [], despachado = []) {
  const pendientePorMaterial = new Map();
  for (const item of despachado || []) {
    if (!item?.material_id) continue;
    pendientePorMaterial.set(item.material_id, (pendientePorMaterial.get(item.material_id) || 0) + cantidad(item.cantidad));
  }
  const resultado = [];
  for (const item of itemsADescontar || []) {
    let resta = pendientePorMaterial.get(item.material_id) || 0;
    const original = cantidad(item.cantidad);
    const descontado = Math.min(original, resta);
    const restante = Math.max(0, original - descontado);
    if (resta > 0) pendientePorMaterial.set(item.material_id, resta - descontado);
    if (restante > 0) resultado.push({ ...item, cantidad: restante });
  }
  return resultado;
}
