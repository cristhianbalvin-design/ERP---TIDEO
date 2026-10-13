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
  const cantidad = Number(repuesto.cantidad);
  const costoUnitario = Number(repuesto.costo_unitario);
  const subtotal = Number.isFinite(cantidad) && Number.isFinite(costoUnitario)
    ? cantidad * costoUnitario
    : 0;
  return total + (Number.isFinite(subtotal) ? subtotal : 0);
}, 0);

export const armarMaterialesConsumidos = (repuestos, fluidos) => [
  ...repuestos.map(item => ({
    tipo: 'repuesto', item_id: item.item_id, descripcion: item.descripcion,
    cantidad: Number(item.cantidad || 0), unidad: item.unidad, costo_unitario: Number(item.costo_unitario || 0),
  })),
  ...fluidos.map(item => ({
    tipo: 'fluido', descripcion: item.tipo, motivo: item.motivo,
    cantidad: Number(item.cantidad || 0), unidad: item.unidad,
  })),
];
