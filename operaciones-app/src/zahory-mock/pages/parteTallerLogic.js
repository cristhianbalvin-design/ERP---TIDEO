export const resolverTecnicoAlCambiarOT = (prev) => {
  const tecnicoVieneDeTarea = Boolean(prev.tarea_id);
  return {
    tarea_id: '',
    tecnico_id: tecnicoVieneDeTarea ? '' : prev.tecnico_id,
    tecnico_nombre: tecnicoVieneDeTarea ? '' : prev.tecnico_nombre,
  };
};

export const estadoInicialConsumos = () => ({
  repuestos_consumidos: [],
  fluidos_consumidos: [],
});

export const calcularTotalRepuestos = (repuestos) => repuestos.reduce((total, repuesto) => {
  const cantidad = Number(String(repuesto.cantidad ?? '').trim().replace(',', '.'));
  const costoUnitario = Number(repuesto.costo_unitario);
  const subtotal = Number.isFinite(cantidad) && Number.isFinite(costoUnitario)
    ? cantidad * costoUnitario
    : 0;
  return total + (Number.isFinite(subtotal) ? subtotal : 0);
}, 0);

export const validarConsumosParte = (repuestos = []) => {
  const materiales = new Set();
  for (let indice = 0; indice < repuestos.length; indice += 1) {
    const repuesto = repuestos[indice] || {};
    if (!repuesto.material_id) return `Selecciona un material para el repuesto ${indice + 1}.`;

    const textoCantidad = String(repuesto.cantidad ?? '').trim().replace(',', '.');
    const cantidad = Number(textoCantidad);
    if (!textoCantidad || !Number.isFinite(cantidad) || cantidad <= 0) {
      return `La cantidad del repuesto ${indice + 1} debe ser mayor a cero.`;
    }
    if (Math.abs(cantidad * 100 - Math.round(cantidad * 100)) > 1e-8) {
      return `La cantidad del repuesto ${indice + 1} admite hasta 2 decimales.`;
    }
    if (materiales.has(repuesto.material_id)) return 'No repitas el mismo material en los repuestos consumidos.';
    materiales.add(repuesto.material_id);
  }
  return '';
};

export const armarMaterialesConsumidos = (repuestos, fluidos) => [
  ...repuestos.map(item => ({
    tipo: 'repuesto', material_id: item.material_id, item_id: item.item_id, descripcion: item.descripcion,
    cantidad: Number(String(item.cantidad ?? 0).replace(',', '.')) || 0, unidad: item.unidad, costo_unitario: Number(item.costo_unitario || 0),
  })),
  ...fluidos.map(item => ({
    tipo: 'fluido', descripcion: item.tipo, motivo: item.motivo,
    cantidad: Number(item.cantidad || 0), unidad: item.unidad,
  })),
];
